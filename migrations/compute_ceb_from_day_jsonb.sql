-- Compute CEB (Cascade Event Balance) score from raw day JSONB data
-- Mirrors the JS buildDayEventsSimple() + getHistoricalCaloriePenalty() logic
CREATE OR REPLACE FUNCTION public.compute_ceb_from_day_jsonb(
    p_day_data JSONB,
    p_profile  JSONB DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE plpgsql STABLE
AS $fn$
DECLARE
    v_pos     NUMERIC := 0;
    v_tot     NUMERIC := 0;
    v_meal    JSONB;
    v_item    JSONB;
    v_tmins   INT;
    v_norm    INT;
    v_w       NUMERIC;
    v_kcal    NUMERIC;
    v_opt     NUMERIC;
    v_ratio   NUMERIC;
    v_def     NUMERIC;
    v_gmode   TEXT;
    v_crit    NUMERIC;
    v_tmax    NUMERIC;
    v_hst     INT;
    v_sh      NUMERIC;
    v_se_txt  TEXT;
    v_good    BOOLEAN;
    v_sw      NUMERIC;
    v_steps   INT;
    v_hmin    INT;
    v_sm      INT;
    v_em      INT;
BEGIN
    IF p_day_data IS NULL THEN RETURN NULL; END IF;

    -- 1. Checkin (morning weight)
    IF COALESCE((p_day_data->>'weightMorning')::NUMERIC, 0) > 0 THEN
        v_pos := v_pos + 0.5;  v_tot := v_tot + 0.5;
    END IF;

    -- 2. Meals
    IF jsonb_typeof(COALESCE(p_day_data->'meals', 'null'::jsonb)) = 'array' THEN
        FOR v_meal IN SELECT value FROM jsonb_array_elements(p_day_data->'meals')
        LOOP
            v_tmins := public.parse_time_mins(v_meal->>'time');
            v_norm  := v_tmins;
            IF v_norm IS NOT NULL AND v_norm < 360 THEN v_norm := v_norm + 1440; END IF;

            IF v_norm IS NOT NULL AND v_norm >= 1380 THEN
                v_w := -1.0;
            ELSIF v_norm IS NOT NULL AND v_norm >= 1260 THEN
                v_w := 0.7;
            ELSE
                v_w := 0.4;
            END IF;

            IF v_w >= 0 THEN v_pos := v_pos + v_w; END IF;
            v_tot := v_tot + ABS(v_w);
        END LOOP;
    END IF;

    -- 3. Calorie penalty
    v_kcal := COALESCE(NULLIF((p_day_data->>'savedEatenKcal')::NUMERIC, 0), 0);
    IF v_kcal = 0 AND jsonb_typeof(COALESCE(p_day_data->'meals', 'null'::jsonb)) = 'array' THEN
        FOR v_meal IN SELECT value FROM jsonb_array_elements(p_day_data->'meals')
        LOOP
            IF jsonb_typeof(COALESCE(v_meal->'items', 'null'::jsonb)) = 'array' THEN
                FOR v_item IN SELECT value FROM jsonb_array_elements(v_meal->'items')
                LOOP
                    IF COALESCE((v_item->>'kcal')::NUMERIC, 0) > 0 THEN
                        v_kcal := v_kcal + (v_item->>'kcal')::NUMERIC;
                    ELSIF COALESCE((v_item->>'kcal100')::NUMERIC, 0) > 0 THEN
                        v_kcal := v_kcal + (v_item->>'kcal100')::NUMERIC
                            * COALESCE((v_item->>'grams')::NUMERIC,
                                       (v_item->>'g')::NUMERIC, 100) / 100;
                    END IF;
                END LOOP;
            END IF;
        END LOOP;
    END IF;

    v_opt := COALESCE(
        NULLIF((p_day_data->>'savedDisplayOptimum')::NUMERIC, 0),
        NULLIF((p_day_data->>'optimum')::NUMERIC, 0),
        0
    );

    IF v_kcal > 0 AND v_opt > 0 THEN
        v_ratio := v_kcal / v_opt;
        v_def   := COALESCE(
            CASE WHEN p_day_data->>'deficitPct' ~ '^-?\d+(\.\d+)?$'
                 THEN (p_day_data->>'deficitPct')::NUMERIC ELSE NULL END,
            CASE WHEN p_profile IS NOT NULL
                      AND p_profile->>'deficitPctTarget' ~ '^-?\d+(\.\d+)?$'
                 THEN (p_profile->>'deficitPctTarget')::NUMERIC ELSE 0 END
        );

        IF v_def <= -10 THEN
            v_gmode := 'deficit';  v_crit := 1.15; v_tmax := 1.05;
        ELSIF v_def <= -5 THEN
            v_gmode := 'deficit';  v_crit := 1.20; v_tmax := 1.08;
        ELSIF v_def >= 10 THEN
            v_gmode := 'bulk';     v_crit := 1.25; v_tmax := 1.10;
        ELSIF v_def >= 5 THEN
            v_gmode := 'bulk';     v_crit := 1.20; v_tmax := 1.12;
        ELSE
            v_gmode := 'maint';    v_crit := 1.25; v_tmax := 1.10;
        END IF;

        IF v_gmode = 'deficit' THEN
            IF v_ratio > v_crit THEN        v_tot := v_tot + 1.5;
            ELSIF v_ratio > v_tmax THEN     v_tot := v_tot + 0.5;
            END IF;
        ELSIF v_gmode = 'bulk' THEN
            IF v_ratio > 1.8 THEN           v_tot := v_tot + 0.6; END IF;
        ELSE
            IF v_ratio > 1.5 THEN           v_tot := v_tot + 0.6;
            ELSIF v_ratio > 1.2 THEN        v_tot := v_tot + 0.4;
            END IF;
        END IF;
    END IF;

    -- 4. Trainings
    IF jsonb_typeof(COALESCE(p_day_data->'trainings', 'null'::jsonb)) = 'array' THEN
        FOR v_meal IN SELECT value FROM jsonb_array_elements(p_day_data->'trainings')
        LOOP
            v_pos := v_pos + 1.5;  v_tot := v_tot + 1.5;
        END LOOP;
    END IF;

    -- 5. Sleep
    IF p_day_data->>'sleepStart' IS NOT NULL THEN
        v_sh     := COALESCE((p_day_data->>'sleepHours')::NUMERIC, 0);
        v_se_txt := p_day_data->>'sleepEnd';

        IF v_sh = 0 AND v_se_txt IS NOT NULL THEN
            v_sm := public.parse_time_mins(p_day_data->>'sleepStart');
            v_em := public.parse_time_mins(v_se_txt);
            IF v_sm IS NOT NULL AND v_em IS NOT NULL THEN
                IF v_sm < 360 THEN v_sm := v_sm + 1440; END IF;
                IF v_em <= v_sm THEN v_em := v_em + 1440; END IF;
                v_sh := ROUND((v_em - v_sm)::NUMERIC / 60, 1);
            END IF;
        END IF;

        v_hst := public.parse_time_mins(p_day_data->>'sleepStart');
        IF v_hst IS NOT NULL AND v_hst < 360 THEN v_hst := v_hst + 1440; END IF;

        v_good := v_sh >= 6 AND v_sh <= 9;

        IF    v_hst IS NULL  THEN v_sw := 0;
        ELSIF v_hst <= 1380  THEN v_sw := CASE WHEN v_good THEN 0.8  ELSE -0.3 END;
        ELSIF v_hst <= 1440  THEN v_sw := CASE WHEN v_good THEN 0.3  ELSE -0.1 END;
        ELSIF v_hst <= 1530  THEN v_sw := CASE WHEN v_good THEN 0.0  ELSE -0.2 END;
        ELSIF v_hst <= 1620  THEN v_sw := CASE WHEN v_good THEN -0.3 ELSE -0.5 END;
        ELSIF v_hst <= 1680  THEN v_sw := -1.0;
        ELSE                      v_sw := -2.0;
        END IF;

        IF v_sw >= 0 THEN v_pos := v_pos + v_sw; END IF;
        v_tot := v_tot + ABS(v_sw);
    END IF;

    -- 6. Steps
    v_steps := COALESCE((p_day_data->>'steps')::INT, 0);
    IF v_steps > 1000 THEN
        IF v_steps >= 7500 THEN
            v_pos := v_pos + 0.8; v_tot := v_tot + 0.8;
        ELSE
            v_pos := v_pos + 0.2; v_tot := v_tot + 0.2;
        END IF;
    END IF;

    -- 7. Household activity
    v_hmin := COALESCE((p_day_data->>'householdMin')::INT, 0);
    IF v_hmin > 0 THEN
        v_pos := v_pos + 0.4; v_tot := v_tot + 0.4;
    END IF;

    -- 8. Measurements
    IF jsonb_typeof(COALESCE(p_day_data->'measurements', 'null'::jsonb)) = 'object' THEN
        IF EXISTS (
            SELECT 1 FROM jsonb_each_text(p_day_data->'measurements')
            WHERE value ~ '^\d+(\.\d+)?$' AND value::NUMERIC > 0
        ) THEN
            v_pos := v_pos + 0.5; v_tot := v_tot + 0.5;
        END IF;
    END IF;

    -- Final score
    IF v_tot = 0 THEN RETURN NULL; END IF;
    RETURN ROUND((v_pos / v_tot) * 10, 1);
END;
$fn$;

COMMENT ON FUNCTION public.compute_ceb_from_day_jsonb IS
  'Compute CEB score (0-10) from raw day JSONB + optional profile. Mirrors JS buildDayEventsSimple.';
