-- Harden the lower-level KV writer helper against auth/session/non-client keys.
-- It returns void, so the best contract is to audit and return before INSERT.

CREATE OR REPLACE FUNCTION public.write_client_kv_value(
  p_client_id uuid,
  p_key text,
  p_value jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  should_encrypt boolean;
  encrypted_val bytea;
  v_allowed boolean;
  key_hex text;
  encryption_disabled boolean := false;
  has_key boolean := false;
  existing_encrypted bytea;
BEGIN
  IF public.is_client_kv_non_client_key(p_key) THEN
    BEGIN
      INSERT INTO public.data_loss_audit (client_id, key, action, allowed, reason)
      VALUES (p_client_id, p_key, 'non_client_data_rejected', false, 'write_client_kv_value_blacklist');
    EXCEPTION WHEN others THEN
      NULL;
    END;

    RETURN;
  END IF;

  v_allowed := check_day_overwrite_allowed(p_client_id, p_key, p_value);
  IF NOT v_allowed THEN
    RAISE NOTICE '[DATA_LOSS_PROTECTION] Blocked overwrite of % for client %', p_key, p_client_id;
    RETURN;
  END IF;

  should_encrypt := is_health_key(p_key);
  key_hex := current_setting('heys.encryption_key', true);
  encryption_disabled := current_setting('heys.encryption_disabled', true) = '1';
  has_key := key_hex IS NOT NULL AND length(key_hex) >= 32;

  IF should_encrypt THEN
    SELECT v_encrypted INTO existing_encrypted
    FROM client_kv_store
    WHERE client_id = p_client_id AND k = p_key;

    IF existing_encrypted IS NOT NULL AND (p_value IS NULL OR p_value = '{}'::jsonb) THEN
      RETURN;
    END IF;
  END IF;

  IF should_encrypt AND has_key AND NOT encryption_disabled THEN
    encrypted_val := encrypt_health_data(p_value);

    INSERT INTO client_kv_store (client_id, k, v, v_encrypted, key_version, updated_at)
    VALUES (p_client_id, p_key, '{}'::jsonb, encrypted_val, 1, now())
    ON CONFLICT (client_id, k) DO UPDATE SET
      v = '{}'::jsonb,
      v_encrypted = encrypted_val,
      key_version = 1,
      updated_at = now();
  ELSE
    INSERT INTO client_kv_store (client_id, k, v, v_encrypted, key_version, updated_at)
    VALUES (p_client_id, p_key, p_value, null, null, now())
    ON CONFLICT (client_id, k) DO UPDATE SET
      v = p_value,
      v_encrypted = null,
      key_version = null,
      updated_at = now();
  END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.write_client_kv_value(uuid, text, jsonb) TO heys_rpc;

COMMENT ON FUNCTION public.write_client_kv_value(uuid, text, jsonb) IS
  'Low-level client_kv_store writer with data-loss protection, optional health encryption, and non-client/auth/session key rejection.';
