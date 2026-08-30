-- Сводка дня: последнее событие клиента и цели, по которым метка становится
-- отклонением.
--
-- Зачем: карточка клиента в кабинете сведена с кадрами
-- curator-cabinet.v4.dc.html, и три места кадра нечем наполнить.
--
--   «Последний вход 04:05»          — времени входа в сводке нет
--   «4 приёма · последний в 19:40»  — времени приёма нет
--   «силовая 55 мин»                — типа тренировки нет, есть только минуты
--
-- Там же четвёртое: метка дня различает только «есть запись» и «нет». Третьего
-- состояния — «отклонение» — нет, потому что сравнивать число не с чем: цели
-- живут в профиле клиента, а сводка профиля не читает.
--
-- Что здесь. Сводка получает три факта дня, а профильный контекст — две цели.
-- Норму калорий сервер по-прежнему не считает: она выходит из TDEE, дефицита
-- и поправки на факт, и повторять эту цепочку в SQL значило бы завести вторую
-- реализацию бизнес-правила рядом с heys_norm_correction_v1.js. Контекст уже
-- отдаёт всё её сырьё (вес, рост, возраст, пол, дефицит, зоны, поправку) —
-- считает по нему клиент, как это делает панель.
--
-- Ownership прежний и единственный: clients.curator_id = p_curator_id.
-- Обе функции read-only.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Сводка дня: время последнего приёма, тип тренировки, последний вход
-- ─────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.get_curator_clients_day_summary(UUID, DATE);

CREATE FUNCTION public.get_curator_clients_day_summary(
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
    training_min    INTEGER,
    -- Тип первой реальной тренировки дня: «силовая 55 мин» говорит куратору
    -- больше, чем «55 мин». Вторую и третью не перечисляем — в карточке для
    -- этого одна метка, а список типов в неё не поместится.
    training_type   TEXT,
    weight_morning  NUMERIC,
    sleep_hours     NUMERIC,
    -- Время последнего заполненного приёма, «HH:MM» как его пишет клиент.
    -- Строкой, а не временем: в дне это свободное поле, и клиент за годы писал
    -- туда и «19:40», и мусор. Разбирать его — работа того, кто показывает.
    last_meal_time  TEXT,
    -- Последний вход клиента в приложение за последние 30 дней. NULL значит
    -- «не заходил», а не «данных нет»: столько живёт след визита.
    last_visit_at   TIMESTAMPTZ,
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
        SELECT
            fm.client_id,
            COUNT(*)::integer AS meals_count,
            -- Позднейшее время дня, а не последний элемент массива: приёмы
            -- дописываются в конец в порядке ввода, а не в порядке часов, и
            -- «завтрак, добавленный вечером» отдал бы 08:30 как последний.
            MAX(fm.meal ->> 'time') FILTER (
                WHERE fm.meal ->> 'time' ~ '^[0-9]{1,2}:[0-9]{2}$'
            ) AS last_meal_time
        FROM filled_meals fm
        GROUP BY fm.client_id
    ),
    training_rows AS (
        SELECT
            d.client_id,
            training.ord AS ord,
            training.value ->> 'type' AS type,
            (
                SELECT COALESCE(SUM(CASE WHEN jsonb_typeof(zone.value) = 'number'
                                         THEN (zone.value)::text::numeric
                                         ELSE 0 END), 0)
                FROM jsonb_array_elements(
                    CASE WHEN jsonb_typeof(training.value -> 'z') = 'array'
                         THEN training.value -> 'z'
                         ELSE '[]'::jsonb END
                ) AS zone
            ) AS minutes
        FROM day_row d
        CROSS JOIN LATERAL jsonb_array_elements(
            CASE WHEN jsonb_typeof(d.day -> 'trainings') = 'array'
                 THEN d.day -> 'trainings'
                 ELSE '[]'::jsonb END
        ) WITH ORDINALITY AS training(value, ord)
    ),
    trainings_per_client AS (
        SELECT
            tr.client_id,
            COUNT(*) FILTER (WHERE tr.minutes > 0)::integer AS trainings_count,
            COALESCE(ROUND(SUM(tr.minutes)), 0)::integer    AS training_min,
            (ARRAY_AGG(NULLIF(tr.type, '') ORDER BY tr.ord)
                FILTER (WHERE tr.minutes > 0))[1]           AS training_type
        FROM training_rows tr
        GROUP BY tr.client_id
    ),
    -- Последний вход: тот же след визита, что читает вкладка «Диагностика».
    -- Горизонт 30 дней — сколько живут записи трассы; глубже искать нечего.
    visits AS (
        SELECT
            t.client_id,
            MAX(t.client_ts) AS last_visit_at
        FROM public.client_log_trace t
        JOIN owned o ON o.id = t.client_id
        WHERE t.client_ts >= now() - INTERVAL '30 days'
        GROUP BY t.client_id
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
        COALESCE(tp.trainings_count, 0)                            AS trainings_count,
        COALESCE(tp.training_min, 0)                               AS training_min,
        tp.training_type                                           AS training_type,
        CASE WHEN jsonb_typeof(d.day -> 'weightMorning') = 'number'
             THEN (d.day ->> 'weightMorning')::numeric END         AS weight_morning,
        CASE WHEN jsonb_typeof(d.day -> 'sleepHours') = 'number'
             THEN (d.day ->> 'sleepHours')::numeric END            AS sleep_hours,
        mp.last_meal_time                                          AS last_meal_time,
        v.last_visit_at                                            AS last_visit_at,
        d.updated_at                                               AS day_updated_at
    FROM day_row d
    LEFT JOIN meals_per_client     mp ON mp.client_id = d.client_id
    LEFT JOIN kcal_per_client      kp ON kp.client_id = d.client_id
    LEFT JOIN trainings_per_client tp ON tp.client_id = d.client_id
    LEFT JOIN visits               v  ON v.client_id  = d.client_id;
$$;

COMMENT ON FUNCTION public.get_curator_clients_day_summary(UUID, DATE) IS
    'Read-only сводка дня (еда/вода/шаги/тренировка/вес/сон), время последнего приёма, тип тренировки и последний вход по всем клиентам куратора. Ownership: clients.curator_id.';

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Профильный контекст: цели, по которым метка становится отклонением
-- ─────────────────────────────────────────────────────────────────────────
--
-- Три метки дня из шести имеют норму, которую клиент видит у себя: вода
-- (вес × 30 мл), шаги (цель профиля) и сон (норма профиля). Без них кабинет
-- показывает «1,0 л» и «5 000 шагов» одинаково зелёными и у того, кто выполнил
-- норму, и у того, кто до неё не дотянул вдвое.
--
-- Норму воды сервер не считает: правило «вес × 30» живёт в клиенте
-- (heys_day_caloric_balance_v1.js), и вес контекст уже отдаёт. Здесь только
-- то, что клиент задал сам.

DROP FUNCTION IF EXISTS public.get_curator_clients_norm_context(UUID);

CREATE FUNCTION public.get_curator_clients_norm_context(
    p_curator_id UUID
)
RETURNS TABLE (
    client_id                   UUID,
    weight                      NUMERIC,
    height                      NUMERIC,
    age                         INTEGER,
    birth_date                  TEXT,
    gender                      TEXT,
    deficit_pct_target          NUMERIC,
    -- Свои METы зон: расход тренировки считается по ним, и без них панель
    -- посчитает по умолчанию 2.5/6/8/10 и разойдётся с клиентом.
    hr_zones                    JSONB,
    -- Цели, заданные клиентом. NULL значит «не задавал» — умолчание (7000
    -- шагов, 8 часов) подставляет тот, кто показывает, и оно же стоит у
    -- клиента на его экране.
    steps_goal                  NUMERIC,
    sleep_norm_hours            NUMERIC,
    norm_correction_factor      NUMERIC,
    norm_correction_applied_at  TEXT,
    last_decision               TEXT,
    last_decision_week          TEXT,
    last_decision_at            BIGINT,
    profile_updated_at          TIMESTAMPTZ
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
    prof AS (
        SELECT o.id AS client_id, kv.v AS p, kv.updated_at
        FROM owned o
        LEFT JOIN public.client_kv_store kv
               ON kv.client_id = o.id AND kv.k = 'heys_profile'
    ),
    zones AS (
        SELECT o.id AS client_id, kv.v AS z
        FROM owned o
        LEFT JOIN public.client_kv_store kv
               ON kv.client_id = o.id AND kv.k = 'heys_hr_zones'
    ),
    hist AS (
        -- История решений живёт своим ключом и растёт; панели нужна только
        -- последняя запись — по ней видно, ждёт ли поправка ответа.
        SELECT
            o.id AS client_id,
            CASE WHEN jsonb_typeof(kv.v -> 'weeks') = 'array'
                  AND jsonb_array_length(kv.v -> 'weeks') > 0
                 THEN kv.v -> 'weeks' -> 0 END AS last
        FROM owned o
        LEFT JOIN public.client_kv_store kv
               ON kv.client_id = o.id AND kv.k = 'heys_norm_correction_history'
    )
    SELECT
        pr.client_id,
        CASE WHEN jsonb_typeof(pr.p -> 'weight') = 'number'
             THEN (pr.p ->> 'weight')::numeric END                  AS weight,
        CASE WHEN jsonb_typeof(pr.p -> 'height') = 'number'
             THEN (pr.p ->> 'height')::numeric END                  AS height,
        CASE WHEN jsonb_typeof(pr.p -> 'age') = 'number'
             THEN ROUND((pr.p ->> 'age')::numeric)::integer END     AS age,
        NULLIF(pr.p ->> 'birthDate', '')                            AS birth_date,
        COALESCE(NULLIF(pr.p ->> 'gender', ''), NULLIF(pr.p ->> 'sex', '')) AS gender,
        CASE WHEN jsonb_typeof(pr.p -> 'deficitPctTarget') = 'number'
             THEN (pr.p ->> 'deficitPctTarget')::numeric END        AS deficit_pct_target,
        CASE WHEN jsonb_typeof(z.z) = 'array' THEN z.z END          AS hr_zones,
        CASE WHEN jsonb_typeof(pr.p -> 'stepsGoal') = 'number'
             THEN (pr.p ->> 'stepsGoal')::numeric END               AS steps_goal,
        CASE WHEN jsonb_typeof(pr.p -> 'sleepHours') = 'number'
             THEN (pr.p ->> 'sleepHours')::numeric END              AS sleep_norm_hours,
        CASE WHEN jsonb_typeof(pr.p -> 'normCorrectionFactor') = 'number'
             THEN (pr.p ->> 'normCorrectionFactor')::numeric END    AS norm_correction_factor,
        NULLIF(pr.p ->> 'normCorrectionAppliedAt', '')              AS norm_correction_applied_at,
        h.last ->> 'what'                                           AS last_decision,
        h.last ->> 'weekLabel'                                      AS last_decision_week,
        CASE WHEN jsonb_typeof(h.last -> 'at') = 'number'
             THEN (h.last ->> 'at')::bigint END                     AS last_decision_at,
        pr.updated_at                                               AS profile_updated_at
    FROM prof pr
    LEFT JOIN zones z ON z.client_id = pr.client_id
    LEFT JOIN hist  h ON h.client_id = pr.client_id;
$$;

COMMENT ON FUNCTION public.get_curator_clients_norm_context(UUID) IS
    'Read-only профильный контекст поправки на факт по всем клиентам куратора: вес/рост/возраст/пол/дефицит, зоны пульса, цели шагов и сна, действующая поправка и последнее решение. Ownership: clients.curator_id.';
