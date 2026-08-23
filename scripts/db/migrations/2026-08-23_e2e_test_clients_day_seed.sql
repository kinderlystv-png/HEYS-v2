-- 2026-08-23: E2E fixtures — dayv2 на сегодня + stepsGoalConfirmedDate (утренний чек-ин не блокирует smoke).

BEGIN;

DO $$
DECLARE
  cid uuid;
  today text := to_char(CURRENT_DATE, 'YYYY-MM-DD');
  day_key text;
  day_json jsonb;
  prof jsonb;
BEGIN
  FOREACH cid IN ARRAY ARRAY[
    '11111111-1111-1111-1111-111111111111'::uuid,
    '22222222-2222-2222-2222-222222222222'::uuid
  ] LOOP
    day_key := 'heys_dayv2_' || today;
    day_json := jsonb_build_object(
      'date', today,
      'meals', '[]'::jsonb,
      'weightMorning', 60,
      'sleepStart', '23:00',
      'sleepEnd', '07:00',
      'sleepQuality', 3,
      'moodMorning', 3,
      'updatedAt', (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint
    );

    INSERT INTO public.client_kv_store (client_id, k, v, updated_at)
    VALUES (cid, day_key, day_json, NOW())
    ON CONFLICT (client_id, k) DO UPDATE SET v = EXCLUDED.v, updated_at = NOW();

    INSERT INTO public.client_kv_store (client_id, k, v, updated_at)
    VALUES (cid, 'heys_' || cid::text || '_dayv2_' || today, day_json, NOW())
    ON CONFLICT (client_id, k) DO UPDATE SET v = EXCLUDED.v, updated_at = NOW();

    SELECT v INTO prof FROM public.client_kv_store WHERE client_id = cid AND k = 'heys_profile';
    IF prof IS NULL THEN
      prof := '{}'::jsonb;
    END IF;
    prof := prof || jsonb_build_object(
      'stepsGoal', COALESCE((prof->>'stepsGoal')::int, 10000),
      'stepsGoalConfirmedDate', today,
      'profileCompleted', true,
      'optionalFeatureConsentsOfferedAt', COALESCE(
        (prof->>'optionalFeatureConsentsOfferedAt')::bigint,
        (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint
      ),
      'updatedAt', (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint
    );
    UPDATE public.client_kv_store SET v = prof, updated_at = NOW()
    WHERE client_id = cid AND k = 'heys_profile';
  END LOOP;
END $$;

COMMIT;
