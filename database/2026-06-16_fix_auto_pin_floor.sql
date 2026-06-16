-- PostgreSQL cast from float to int rounds, so ((random() * 9000)::int + 1000)
-- can theoretically produce 10000. Keep auto-generated PIN values strictly
-- inside the 1000..9999 range for lead conversion and PIN regeneration.

DO $$
DECLARE
    v_def TEXT;
    v_old TEXT := 'LPAD(((random() * 9000)::INT + 1000)::TEXT, 4, ''0'')';
    v_new TEXT := 'LPAD((floor(random() * 9000)::INT + 1000)::TEXT, 4, ''0'')';
BEGIN
    SELECT pg_get_functiondef('public.admin_convert_lead(uuid,uuid)'::regprocedure)
      INTO v_def;
    IF position(v_old IN v_def) > 0 THEN
        EXECUTE replace(v_def, v_old, v_new);
    END IF;

    SELECT pg_get_functiondef('public.admin_regenerate_pin(uuid,uuid)'::regprocedure)
      INTO v_def;
    IF position(v_old IN v_def) > 0 THEN
        EXECUTE replace(v_def, v_old, v_new);
    END IF;
END;
$$;
