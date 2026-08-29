-- Панель куратора: окно дней и профильный контекст для поправки на факт.
--
-- Сводка get_curator_clients_day_summary отвечает на «что клиент внёс сегодня»
-- и берёт одну дату за вызов. Панели этого мало: два её сигнала из четырёх —
-- «у кого расходится расчёт» и «где ждёт решения поправка» — считаются по
-- окну в три недели и требуют профиля, которого в сводке нет вовсе.
--
-- Тянуть окно 21 вызовом посуточной функции можно, но это 21 круг по сети на
-- каждое открытие панели и столько же полных проходов по clients. Поэтому
-- окно берётся одним запросом, а профиль — вторым: он не зависит от даты, и
-- возвращать его на каждой из 21 строки значит переслать одно и то же
-- двадцать один раз.
--
-- Ownership везде тот же и единственный: clients.curator_id = p_curator_id.
-- Обе функции read-only.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Окно дней по всем клиентам куратора
-- ─────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.get_curator_clients_window(UUID, DATE, DATE);

CREATE FUNCTION public.get_curator_clients_window(
    p_curator_id UUID,
    p_from       DATE,
    p_to         DATE
)
RETURNS TABLE (
    client_id       UUID,
    day_date        DATE,
    has_day         BOOLEAN,
    meals_count     INTEGER,
    kcal            INTEGER,
    water_ml        INTEGER,
    steps           INTEGER,
    trainings_count INTEGER,
    training_min    INTEGER,
    -- Минуты по четырём зонам пульса, а не одной суммой: расход тренировки
    -- считается как сумма «минуты зоны × ккал/мин этой зоны», и по общей
    -- сумме его не воспроизвести. Панель обязана показывать то же число,
    -- что видит клиент, — значит сервер отдаёт сырьё, а считает тот же движок.
    zone_min        NUMERIC[],
    household_min   INTEGER,
    weight_morning  NUMERIC,
    weight_measured BOOLEAN,
    waist           NUMERIC,
    sleep_hours     NUMERIC,
    is_incomplete   BOOLEAN,
    day_updated_at  TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    WITH bounds AS (
        -- Окно ограничено 62 днями: поправке хватает 21, месячному разбору —
        -- 31, а неограниченный диапазон превращает вызов в выгрузку всей
        -- истории всех клиентов одним запросом.
        SELECT p_from AS d_from,
               LEAST(p_to, p_from + INTERVAL '61 day')::date AS d_to
    ),
    owned AS (
        SELECT c.id
        FROM public.clients c
        WHERE c.curator_id = p_curator_id
    ),
    dates AS (
        SELECT gs::date AS day_date
        FROM bounds b, generate_series(b.d_from, b.d_to, INTERVAL '1 day') AS gs
    ),
    day_row AS (
        SELECT
            o.id       AS client_id,
            dt.day_date,
            kv.v       AS day,
            kv.updated_at
        FROM owned o
        CROSS JOIN dates dt
        LEFT JOIN public.client_kv_store kv
               ON kv.client_id = o.id
              AND kv.k = 'heys_dayv2_' || to_char(dt.day_date, 'YYYY-MM-DD')
    ),
    meals AS (
        SELECT d.client_id, d.day_date, meal.value AS meal
        FROM day_row d
        CROSS JOIN LATERAL jsonb_array_elements(
            CASE WHEN jsonb_typeof(d.day -> 'meals') = 'array'
                 THEN d.day -> 'meals'
                 ELSE '[]'::jsonb END
        ) AS meal
    ),
    -- Приём считается внесённым только когда в нём есть позиции: заготовка без
    -- продуктов — это пустой слот, а не еда.
    filled_meals AS (
        SELECT m.client_id, m.day_date, m.meal
        FROM meals m
        WHERE jsonb_typeof(m.meal -> 'items') = 'array'
          AND jsonb_array_length(m.meal -> 'items') > 0
    ),
    -- Калорийность живёт внутри позиции, поэтому не зависит от каталога и от
    -- того, что стало с продуктом после записи.
    kcal_per_day AS (
        SELECT
            fm.client_id,
            fm.day_date,
            SUM(
                CASE WHEN jsonb_typeof(item.value -> 'kcal100') = 'number'
                      AND jsonb_typeof(item.value -> 'grams') = 'number'
                     THEN (item.value ->> 'kcal100')::numeric
                          * (item.value ->> 'grams')::numeric / 100
                     ELSE 0 END
            ) AS kcal
        FROM filled_meals fm
        CROSS JOIN LATERAL jsonb_array_elements(fm.meal -> 'items') AS item
        GROUP BY fm.client_id, fm.day_date
    ),
    meals_per_day AS (
        SELECT fm.client_id, fm.day_date, COUNT(*)::integer AS meals_count
        FROM filled_meals fm
        GROUP BY fm.client_id, fm.day_date
    ),
    -- Минуты по зонам: пустой слот даёт 0 и в счёт тренировок не идёт
    -- (канон продукта, тот же, что в посуточной сводке).
    training_rows AS (
        SELECT
            d.client_id,
            d.day_date,
            (
                SELECT COALESCE(SUM(CASE WHEN jsonb_typeof(zone.value) = 'number'
                                         THEN (zone.value)::text::numeric ELSE 0 END), 0)
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
        ) AS training
    ),
    trainings_per_day AS (
        SELECT
            tr.client_id,
            tr.day_date,
            COUNT(*) FILTER (WHERE tr.minutes > 0)::integer AS trainings_count,
            COALESCE(ROUND(SUM(tr.minutes)), 0)::integer    AS training_min
        FROM training_rows tr
        GROUP BY tr.client_id, tr.day_date
    ),
    -- Зоны складываются поэлементно по всем тренировкам дня: ккал/мин зависит
    -- от зоны и линейна по минутам, поэтому сумма минут в зоне даёт тот же
    -- расход, что и поштучный проход по тренировкам.
    zone_rows AS (
        SELECT
            d.client_id,
            d.day_date,
            zone.ord,
            SUM(CASE WHEN jsonb_typeof(zone.value) = 'number'
                     THEN (zone.value)::text::numeric ELSE 0 END) AS minutes
        FROM day_row d
        CROSS JOIN LATERAL jsonb_array_elements(
            CASE WHEN jsonb_typeof(d.day -> 'trainings') = 'array'
                 THEN d.day -> 'trainings'
                 ELSE '[]'::jsonb END
        ) AS training
        CROSS JOIN LATERAL jsonb_array_elements(
            CASE WHEN jsonb_typeof(training.value -> 'z') = 'array'
                 THEN training.value -> 'z'
                 ELSE '[]'::jsonb END
        ) WITH ORDINALITY AS zone(value, ord)
        GROUP BY d.client_id, d.day_date, zone.ord
    ),
    zones_per_day AS (
        SELECT
            zr.client_id,
            zr.day_date,
            array_agg(zr.minutes ORDER BY zr.ord) AS zone_min
        FROM zone_rows zr
        GROUP BY zr.client_id, zr.day_date
    ),
    -- Быт лежит либо списком с минутами, либо одним числом — читаем оба вида.
    household_per_day AS (
        SELECT
            d.client_id,
            d.day_date,
            COALESCE(
                (
                    SELECT SUM(CASE WHEN jsonb_typeof(h.value -> 'minutes') = 'number'
                                    THEN (h.value ->> 'minutes')::numeric ELSE 0 END)
                    FROM jsonb_array_elements(
                        CASE WHEN jsonb_typeof(d.day -> 'householdActivities') = 'array'
                             THEN d.day -> 'householdActivities'
                             ELSE '[]'::jsonb END
                    ) AS h
                ),
                CASE WHEN jsonb_typeof(d.day -> 'householdMin') = 'number'
                     THEN (d.day ->> 'householdMin')::numeric END,
                0
            ) AS minutes
        FROM day_row d
    )
    SELECT
        d.client_id,
        d.day_date,
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
        zp.zone_min                                                AS zone_min,
        COALESCE(ROUND(hh.minutes), 0)::integer                    AS household_min,
        CASE WHEN jsonb_typeof(d.day -> 'weightMorning') = 'number'
             THEN (d.day ->> 'weightMorning')::numeric END         AS weight_morning,
        -- Расчётный вес поправке не годится: она меряет расхождение расчёта с
        -- фактом, а подставленное число фактом не является. Флаг едет рядом с
        -- весом, чтобы фильтровать на клиенте, а не гадать.
        COALESCE((d.day ->> 'weightMorningEstimated')::boolean, false) = false
            AND jsonb_typeof(d.day -> 'weightMorning') = 'number'  AS weight_measured,
        CASE WHEN jsonb_typeof(d.day -> 'measurements' -> 'waist') = 'number'
             THEN (d.day -> 'measurements' ->> 'waist')::numeric END AS waist,
        CASE WHEN jsonb_typeof(d.day -> 'sleepHours') = 'number'
             THEN (d.day ->> 'sleepHours')::numeric END            AS sleep_hours,
        COALESCE((d.day ->> 'isIncomplete')::boolean, false)       AS is_incomplete,
        d.updated_at                                               AS day_updated_at
    FROM day_row d
    LEFT JOIN meals_per_day     mp ON mp.client_id = d.client_id AND mp.day_date = d.day_date
    LEFT JOIN kcal_per_day      kp ON kp.client_id = d.client_id AND kp.day_date = d.day_date
    LEFT JOIN trainings_per_day tp ON tp.client_id = d.client_id AND tp.day_date = d.day_date
    LEFT JOIN zones_per_day     zp ON zp.client_id = d.client_id AND zp.day_date = d.day_date
    LEFT JOIN household_per_day hh ON hh.client_id = d.client_id AND hh.day_date = d.day_date;
$$;

COMMENT ON FUNCTION public.get_curator_clients_window(UUID, DATE, DATE) IS
    'Read-only окно дней по всем клиентам куратора: еда/вода/шаги/тренировки по зонам/быт/вес/талия/сон построчно на дату. Диапазон обрезается 62 днями. Ownership: clients.curator_id.';

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Профильный контекст поправки
-- ─────────────────────────────────────────────────────────────────────────
--
-- Поправка сравнивает факт с формульным расходом, а формула считается по
-- Mifflin-St Jeor: вес, рост, возраст, пол. Без них панель может показать
-- «кто молчит», но не «у кого расходится расчёт».
--
-- Возраст отдаём и числом, и датой рождения: в блобах встречается зашитое
-- `age`, разошедшееся с `birthDate` на годы, и правило выбора живёт в клиенте
-- (heys_tdee_v1.js: дата рождения старше зашитого возраста). Сервер не решает
-- за него, а отдаёт оба.

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
    'Read-only профильный контекст поправки на факт по всем клиентам куратора: вес/рост/возраст/пол/дефицит, зоны пульса, действующая поправка и последнее решение. Ownership: clients.curator_id.';
