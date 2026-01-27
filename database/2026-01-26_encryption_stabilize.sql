-- 2026-01-26: Stabilize encryption read/write paths
-- Applies safe fallbacks when decrypt fails and blocks empty overwrites

-- Phase 2 functions (read_client_kv_value + get_client_data_by_session)
create or replace function read_client_kv_value(p_client_id uuid, p_key text) returns jsonb as $$
declare
  rec record;
  key_hex text;
  encryption_disabled boolean := false;
  has_key boolean := false;
begin
  select v, v_encrypted, key_version into rec
  from client_kv_store
  where client_id = p_client_id and k = p_key;

  if not found then
    return null;
  end if;

  -- Determine encryption availability
  key_hex := current_setting('heys.encryption_key', true);
  encryption_disabled := current_setting('heys.encryption_disabled', true) = '1';
  has_key := key_hex is not null and length(key_hex) >= 32;

  -- Encrypted?
  if rec.key_version is not null and rec.v_encrypted is not null then
    if encryption_disabled or not has_key then
      return rec.v;
    end if;
    return coalesce(decrypt_health_data(rec.v_encrypted), rec.v);
  end if;

  -- Plaintext
  return rec.v;
end$$ language plpgsql security definer;

create or replace function get_client_data_by_session(
  p_session_token text
) returns jsonb as $$
declare
  v_client_id uuid;
  result jsonb;
  key_hex text;
  encryption_disabled boolean := false;
  has_key boolean := false;
begin
  -- Validate session
  select client_id into v_client_id
  from client_sessions
  where token_hash = digest(p_session_token, 'sha256')
    and expires_at > now()
    and revoked_at is null;

  if v_client_id is null then
    return jsonb_build_object('error', 'invalid_session');
  end if;

  -- Determine encryption availability
  key_hex := current_setting('heys.encryption_key', true);
  encryption_disabled := current_setting('heys.encryption_disabled', true) = '1';
  has_key := key_hex is not null and length(key_hex) >= 32;

  -- Build result with guarded decrypt
  select jsonb_object_agg(
    k,
    case 
      when key_version is not null and v_encrypted is not null 
        then case
          when encryption_disabled or not has_key then v
          else coalesce(decrypt_health_data(v_encrypted), v)
        end
      else v
    end
  ) into result
  from client_kv_store
  where client_id = v_client_id;

  return jsonb_build_object(
    'success', true,
    'client_id', v_client_id,
    'data', coalesce(result, '{}'::jsonb)
  );
end$$ language plpgsql security definer;

-- Data loss protection v2 (write_client_kv_value guard)
create or replace function write_client_kv_value(
  p_client_id UUID,
  p_key TEXT,
  p_value JSONB
) returns VOID
language plpgsql
security definer
as $$
declare
  should_encrypt boolean;
  encrypted_val bytea;
  v_allowed boolean;
  key_hex text;
  encryption_disabled boolean := false;
  has_key boolean := false;
  existing_encrypted bytea;
begin
  -- 🛡️ Data loss protection (for day records)
  v_allowed := check_day_overwrite_allowed(p_client_id, p_key, p_value);
  if not v_allowed then
    raise notice '[DATA_LOSS_PROTECTION] Blocked overwrite of % for client %', p_key, p_client_id;
    return;
  end if;

  -- Determine encryption availability
  should_encrypt := is_health_key(p_key);
  key_hex := current_setting('heys.encryption_key', true);
  encryption_disabled := current_setting('heys.encryption_disabled', true) = '1';
  has_key := key_hex is not null and length(key_hex) >= 32;

  -- Prevent empty overwrite of encrypted data
  if should_encrypt then
    select v_encrypted into existing_encrypted
    from client_kv_store
    where client_id = p_client_id and k = p_key;

    if existing_encrypted is not null and (p_value is null or p_value = '{}'::jsonb) then
      return;
    end if;
  end if;

  if should_encrypt and has_key and not encryption_disabled then
    encrypted_val := encrypt_health_data(p_value);

    insert into client_kv_store (client_id, k, v, v_encrypted, key_version, updated_at)
    values (p_client_id, p_key, '{}'::jsonb, encrypted_val, 1, now())
    on conflict (client_id, k) do update set
      v = '{}'::jsonb,
      v_encrypted = encrypted_val,
      key_version = 1,
      updated_at = now();
  else
    insert into client_kv_store (client_id, k, v, v_encrypted, key_version, updated_at)
    values (p_client_id, p_key, p_value, null, null, now())
    on conflict (client_id, k) do update set
      v = p_value,
      v_encrypted = null,
      key_version = null,
      updated_at = now();
  end if;
end;
$$;

select 'encryption stabilization applied' as status;
