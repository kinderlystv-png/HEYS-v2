-- 2026-08-28: сервер владеет первичным расчётом норм регистрации.
--
-- Клиент сначала сохраняет heys_profile штатным sync-путём, затем вызывает
-- эту session-safe функцию. Функция читает подтверждённый профиль, рассчитывает
-- нормы и пишет heys_norms через действующий KV write-gate.

CREATE OR REPLACE FUNCTION public.calculate_registration_norms_by_session(
  p_session_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_client_id uuid;
  v_profile jsonb;
  v_encrypted bytea;
  v_key_version integer;
  v_deficit numeric := 0;
  v_age integer := 30;
  v_is_female boolean := false;
  v_protein integer;
  v_carbs integer;
  v_fat integer;
  v_total integer;
  v_profile_updated_at bigint := 0;
  v_norms jsonb;
  v_write jsonb;
BEGIN
  SELECT cs.client_id
    INTO v_client_id
  FROM public.client_sessions AS cs
  WHERE cs.token_hash = digest(p_session_token, 'sha256')
    AND cs.expires_at > now()
    AND cs.revoked_at IS NULL
  LIMIT 1;

  IF v_client_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_or_expired_session');
  END IF;

  SELECT kv.v, kv.v_encrypted, kv.key_version
    INTO v_profile, v_encrypted, v_key_version
  FROM public.client_kv_store AS kv
  WHERE kv.client_id = v_client_id
    AND kv.k = 'heys_profile';

  IF v_key_version IS NOT NULL AND v_encrypted IS NOT NULL THEN
    v_profile := COALESCE(public.decrypt_health_data(v_encrypted), v_profile);
  END IF;

  IF v_profile IS NULL OR COALESCE((v_profile->>'profileCompleted')::boolean, false) IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', 'profile_not_confirmed');
  END IF;

  IF COALESCE(v_profile->>'deficitPctTarget', '') ~ '^-?[0-9]+([.][0-9]+)?$' THEN
    v_deficit := (v_profile->>'deficitPctTarget')::numeric;
  END IF;
  IF COALESCE(v_profile->>'age', '') ~ '^[0-9]+([.][0-9]+)?$' THEN
    v_age := GREATEST(18, LEAST(120, round((v_profile->>'age')::numeric)::integer));
  END IF;
  v_is_female := v_profile->>'gender' = 'Женский';

  IF v_deficit <= -15 THEN
    IF v_is_female THEN
      v_protein := 30; v_carbs := 35; v_fat := 35;
    ELSE
      v_protein := 35; v_carbs := 40; v_fat := 25;
    END IF;
  ELSIF v_deficit <= -5 THEN
    IF v_is_female THEN
      v_protein := 28; v_carbs := 40; v_fat := 32;
    ELSE
      v_protein := 30; v_carbs := 45; v_fat := 25;
    END IF;
  ELSIF v_deficit <= 5 THEN
    IF v_is_female THEN
      v_protein := 25; v_carbs := 45; v_fat := 30;
    ELSE
      v_protein := 25; v_carbs := 50; v_fat := 25;
    END IF;
  ELSE
    IF v_is_female THEN
      v_protein := 28; v_carbs := 47; v_fat := 25;
    ELSE
      v_protein := 30; v_carbs := 50; v_fat := 20;
    END IF;
  END IF;

  IF v_age >= 60 THEN
    v_protein := v_protein + 5;
    v_carbs := v_carbs - 5;
  ELSIF v_age >= 40 THEN
    v_protein := v_protein + 3;
    v_carbs := v_carbs - 3;
  END IF;

  v_total := v_protein + v_carbs + v_fat;
  IF v_total <> 100 THEN
    v_protein := round(v_protein * 100.0 / v_total)::integer;
    v_carbs := round(v_carbs * 100.0 / v_total)::integer;
  END IF;

  IF COALESCE(v_profile->>'updatedAt', '') ~ '^[0-9]+$' THEN
    v_profile_updated_at := (v_profile->>'updatedAt')::bigint;
  END IF;

  v_norms := jsonb_build_object(
    'carbsPct', v_carbs,
    'proteinPct', v_protein,
    'simpleCarbPct', 30,
    'badFatPct', 30,
    'superbadFatPct', 5,
    'fiberPct', 14,
    'giPct', 55,
    'harmPct', 10,
    'source', 'registration-server',
    'schemaVersion', 1,
    'profileUpdatedAt', v_profile_updated_at,
    'updatedAt', floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint
  );

  v_write := public.upsert_client_kv_by_session(
    p_session_token,
    'heys_norms',
    v_norms
  );

  IF COALESCE((v_write->>'success')::boolean, false) IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', COALESCE(v_write->>'error', 'norms_write_failed')
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'norms', v_norms,
    'revision', v_write->'revision'
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'registration_norms_failed');
END;
$function$;

REVOKE ALL ON FUNCTION public.calculate_registration_norms_by_session(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calculate_registration_norms_by_session(text) TO heys_rpc;

COMMENT ON FUNCTION public.calculate_registration_norms_by_session(text) IS
  'Calculates registration nutrition norms from the authenticated client profile and persists heys_norms server-side.';

-- ===== ROLLBACK =====
-- DROP FUNCTION IF EXISTS public.calculate_registration_norms_by_session(text);
