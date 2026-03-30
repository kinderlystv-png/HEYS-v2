-- ═══════════════════════════════════════════════════════════════════════════════
-- 🔄 batch_get_client_kv_by_session — пакетное чтение KV (session-safe)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Дата: 2026-03-30
-- Цель: Phase 1a hot-sync optimization — один запрос вместо N отдельных getKV()
-- Заменяет N вызовов get_client_kv_by_session на один batch-запрос
-- ═══════════════════════════════════════════════════════════════════════════════

create or replace function batch_get_client_kv_by_session(
  p_session_token text,
  p_keys text[]
)
returns jsonb as $$
declare
  v_client_id uuid;
  v_results jsonb := '[]'::jsonb;
  rec record;
  key_hex text;
  encryption_disabled boolean;
  has_key boolean;
  v_value jsonb;
begin
  -- 1. Validate session (same pattern as get_client_kv_by_session)
  select client_id into v_client_id
  from client_sessions
  where token_hash = digest(p_session_token, 'sha256')
    and expires_at > now()
    and revoked_at is null;

  if v_client_id is null then
    return jsonb_build_object('error', 'invalid_session');
  end if;

  -- 2. Read encryption settings once (avoid per-key overhead)
  key_hex := current_setting('heys.encryption_key', true);
  encryption_disabled := coalesce(
    current_setting('heys.encryption_disabled', true) = '1',
    false
  );
  has_key := key_hex is not null and length(key_hex) >= 32;

  -- 3. Fetch all matching keys in ONE query (uses PK index on client_id, k)
  for rec in
    select kv.k, kv.v, kv.v_encrypted, kv.key_version
    from client_kv_store kv
    where kv.client_id = v_client_id
      and kv.k = any(p_keys)
  loop
    -- Auto-decrypt if encrypted (same logic as read_client_kv_value)
    if rec.key_version is not null and rec.v_encrypted is not null then
      if encryption_disabled or not has_key then
        v_value := rec.v;
      else
        v_value := coalesce(decrypt_health_data(rec.v_encrypted), rec.v);
      end if;
    else
      v_value := rec.v;
    end if;

    v_results := v_results || jsonb_build_array(
      jsonb_build_object('k', rec.k, 'v', v_value)
    );
  end loop;

  return jsonb_build_object('success', true, 'items', v_results);

exception
  when others then
    return jsonb_build_object('success', false, 'error', SQLERRM);
end$$ language plpgsql security definer;

comment on function batch_get_client_kv_by_session(text, text[]) is
  '🔐 P1: Session-safe batch KV read. Fetches multiple keys in one query. Client ID extracted from session, prevents IDOR.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 🔐 Права доступа
-- ═══════════════════════════════════════════════════════════════════════════════
grant execute on function batch_get_client_kv_by_session(text, text[]) to heys_rpc;

-- ═══════════════════════════════════════════════════════════════════════════════
-- ✅ Проверка
-- ═══════════════════════════════════════════════════════════════════════════════
do $$
begin
  if exists (select 1 from pg_proc where proname = 'batch_get_client_kv_by_session') then
    raise notice '✅ batch_get_client_kv_by_session() created successfully';
  else
    raise notice '❌ batch_get_client_kv_by_session() NOT found';
  end if;
end $$;
