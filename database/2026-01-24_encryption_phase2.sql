-- 2026-01-24: Phase 2 — Encryption for health_data in client_kv_store
-- Dependencies: pgcrypto, is_health_key()
-- ⚠️ IMPORTANT: Set HEYS_ENCRYPTION_KEY env var before running!

-- 1) Add key_version column (for key rotation support)
alter table client_kv_store add column if not exists key_version smallint default null;
comment on column client_kv_store.key_version is 'Encryption key version: NULL=plaintext, 1+=encrypted';

-- 2) Create encryption helper functions
-- ═══════════════════════════════════════════════════════════════════════════

-- Get encryption key from server config (set via SET heys.encryption_key = '...')
create or replace function get_encryption_key() returns bytea as $$
declare
  key_hex text;
begin
  key_hex := current_setting('heys.encryption_key', true);
  if key_hex is null or length(key_hex) < 32 then
    raise exception 'HEYS_ENCRYPTION_KEY not configured or too short (min 32 chars)';
  end if;
  return decode(key_hex, 'hex');
end$$ language plpgsql stable security definer;

-- Encrypt JSONB value to bytea (AES-256-CBC)
create or replace function encrypt_health_data(p_value jsonb) returns bytea as $$
begin
  return pgp_sym_encrypt(
    p_value::text,
    encode(get_encryption_key(), 'escape'),
    'cipher-algo=aes256'
  );
end$$ language plpgsql security definer;

-- Decrypt bytea back to JSONB
create or replace function decrypt_health_data(p_encrypted bytea) returns jsonb as $$
begin
  return pgp_sym_decrypt(
    p_encrypted,
    encode(get_encryption_key(), 'escape')
  )::jsonb;
exception when others then
  -- Return null on decryption failure (wrong key, corrupted data)
  return null;
end$$ language plpgsql security definer;

-- 3) Add v_encrypted column for storing encrypted data
alter table client_kv_store add column if not exists v_encrypted bytea default null;
comment on column client_kv_store.v_encrypted is 'Encrypted value (when key_version IS NOT NULL)';

-- 4) Create transparent encrypt/decrypt wrapper
-- ═══════════════════════════════════════════════════════════════════════════

-- Read value: auto-decrypt if encrypted
create or replace function read_client_kv_value(p_client_id uuid, p_key text) returns jsonb as $$
declare
  rec record;
begin
  select v, v_encrypted, key_version into rec
  from client_kv_store
  where client_id = p_client_id and k = p_key;
  
  if not found then
    return null;
  end if;
  
  -- Encrypted?
  if rec.key_version is not null and rec.v_encrypted is not null then
    return decrypt_health_data(rec.v_encrypted);
  end if;
  
  -- Plaintext
  return rec.v;
end$$ language plpgsql security definer;

-- Write value: auto-encrypt health_data keys
create or replace function write_client_kv_value(
  p_client_id uuid,
  p_key text,
  p_value jsonb
) returns void as $$
declare
  should_encrypt boolean;
  encrypted_val bytea;
begin
  should_encrypt := is_health_key(p_key);
  
  if should_encrypt then
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
end$$ language plpgsql security definer;

-- 5) Update session-based KV functions to use encryption
-- ═══════════════════════════════════════════════════════════════════════════

-- get_client_kv_by_session: return decrypted value
create or replace function get_client_kv_by_session(
  p_session_token text,
  p_key text
) returns jsonb as $$
declare
  v_client_id uuid;
  result jsonb;
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
  
  -- Read with auto-decrypt
  result := read_client_kv_value(v_client_id, p_key);
  
  return jsonb_build_object(
    'success', true,
    'value', result
  );
end$$ language plpgsql security definer;

-- upsert_client_kv_by_session: auto-encrypt health_data
create or replace function upsert_client_kv_by_session(
  p_session_token text,
  p_key text,
  p_value jsonb
) returns jsonb as $$
declare
  v_client_id uuid;
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
  
  -- Write with auto-encrypt
  perform write_client_kv_value(v_client_id, p_key, p_value);
  
  return jsonb_build_object('success', true);
end$$ language plpgsql security definer;

-- batch_upsert_client_kv_by_session: auto-encrypt health_data
create or replace function batch_upsert_client_kv_by_session(
  p_session_token text,
  p_items jsonb
) returns jsonb as $$
declare
  v_client_id uuid;
  item record;
  processed int := 0;
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
  
  -- Process each item with auto-encrypt
  for item in select * from jsonb_to_recordset(p_items) as x(k text, v jsonb)
  loop
    perform write_client_kv_value(v_client_id, item.k, item.v);
    processed := processed + 1;
  end loop;
  
  return jsonb_build_object('success', true, 'processed', processed);
end$$ language plpgsql security definer;

-- get_client_data_by_session: return decrypted data
create or replace function get_client_data_by_session(
  p_session_token text
) returns jsonb as $$
declare
  v_client_id uuid;
  result jsonb;
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
  
  -- Build result with auto-decrypt for health_data
  select jsonb_object_agg(
    k,
    case 
      when key_version is not null and v_encrypted is not null 
        then decrypt_health_data(v_encrypted)
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

-- 6) Verification
select 'Phase 2 encryption functions created' as status;
