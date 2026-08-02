-- Сводка дня по всем клиентам куратора одним запросом.
--
-- Зачем: экран выбора клиента показывал активность из localStorage, то есть
-- только по клиентам, в которых куратор уже заходил на этом устройстве
-- (CURATOR_WORKSPACE.md, C30). Серверного источника не было: get_curator_clients
-- отдаёт список, get_curator_observability_overview — диагностику, не дневник.
--
-- Контракт: возвращает строку на КАЖДОГО клиента куратора, включая тех, у кого
-- за дату нет записи, — пустой день это значимый ответ («ничего не внёс»), а не
-- отсутствие данных. Ownership проверяется здесь же: clients.curator_id.
-- Функция только читает.

CREATE OR REPLACE FUNCTION public.get_curator_clients_day_summary(
    p_curator_id UUID,
    p_date       DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    client_id       UUID,
    has_day         BOOLEAN,
    meals_count     INTEGER,
    kcal            INTEGER,
    water_ml        INTEGER,
    steps           INTEGER,
    trainings_count INTEGER,
    weight_morning  NUMERIC,
    sleep_hours     NUMERIC,
    day_updated_at  TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    WITH owned AS (
        SELECT c.id
        FROM public.clients c
        WHERE c.curator_id = p_curator_id
    ),
    day_row AS (
        SELECT
            o.id AS client_id,
            kv.v AS day,
            kv.updated_at
        FROM owned o
        LEFT JOIN public.client_kv_store kv
               ON kv.client_id = o.id
              AND kv.k = 'heys_dayv2_' || to_char(p_date, 'YYYY-MM-DD')
    ),
    meals AS (
        SELECT
            d.client_id,
            meal.value AS meal
        FROM day_row d
        CROSS JOIN LATERAL jsonb_array_elements(
            CASE WHEN jsonb_typeof(d.day -> 'meals') = 'array'
                 THEN d.day -> 'meals'
                 ELSE '[]'::jsonb END
        ) AS meal
    ),
    -- Приём считается внесённым только когда в нём есть позиции: пустая
    -- заготовка приёма не должна выглядеть как заполненный дневник.
    filled_meals AS (
        SELECT m.client_id, m.meal
        FROM meals m
        WHERE jsonb_typeof(m.meal -> 'items') = 'array'
          AND jsonb_array_length(m.meal -> 'items') > 0
    ),
    -- Калорийность живёт внутри самой позиции (kcal100 + grams), поэтому
    -- сводка не зависит от каталога продуктов.
    kcal_per_client AS (
        SELECT
            fm.client_id,
            SUM(
                CASE WHEN jsonb_typeof(item.value -> 'kcal100') = 'number'
                      AND jsonb_typeof(item.value -> 'grams') = 'number'
                     THEN (item.value ->> 'kcal100')::numeric
                          * (item.value ->> 'grams')::numeric / 100
                     ELSE 0 END
            ) AS kcal
        FROM filled_meals fm
        CROSS JOIN LATERAL jsonb_array_elements(fm.meal -> 'items') AS item
        GROUP BY fm.client_id
    ),
    meals_per_client AS (
        SELECT fm.client_id, COUNT(*)::integer AS meals_count
        FROM filled_meals fm
        GROUP BY fm.client_id
    )
    SELECT
        d.client_id,
        d.day IS NOT NULL                                          AS has_day,
        COALESCE(mp.meals_count, 0)                                AS meals_count,
        COALESCE(ROUND(kp.kcal), 0)::integer                       AS kcal,
        -- Числовые поля дня читаем только когда это действительно число:
        -- клиент за годы писал сюда и строки, и null.
        COALESCE(CASE WHEN jsonb_typeof(d.day -> 'waterMl') = 'number'
                      THEN ROUND((d.day ->> 'waterMl')::numeric) END, 0)::integer AS water_ml,
        COALESCE(CASE WHEN jsonb_typeof(d.day -> 'steps') = 'number'
                      THEN ROUND((d.day ->> 'steps')::numeric) END, 0)::integer   AS steps,
        CASE WHEN jsonb_typeof(d.day -> 'trainings') = 'array'
             THEN jsonb_array_length(d.day -> 'trainings')
             ELSE 0 END                                            AS trainings_count,
        CASE WHEN jsonb_typeof(d.day -> 'weightMorning') = 'number'
             THEN (d.day ->> 'weightMorning')::numeric END         AS weight_morning,
        CASE WHEN jsonb_typeof(d.day -> 'sleepHours') = 'number'
             THEN (d.day ->> 'sleepHours')::numeric END            AS sleep_hours,
        d.updated_at                                               AS day_updated_at
    FROM day_row d
    LEFT JOIN meals_per_client mp ON mp.client_id = d.client_id
    LEFT JOIN kcal_per_client  kp ON kp.client_id = d.client_id;
$$;

COMMENT ON FUNCTION public.get_curator_clients_day_summary(UUID, DATE) IS
    'Read-only сводка дня (еда/вода/шаги/тренировка/вес/сон) по всем клиентам куратора. Ownership: clients.curator_id.';
