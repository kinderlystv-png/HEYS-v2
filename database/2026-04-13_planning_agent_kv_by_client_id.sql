-- ═══════════════════════════════════════════════════════════════════════════════
-- batch_get / batch_upsert client KV by client_id (server-side agent path)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Вызываются только из heys-api-rpc после проверки Planning agent secret.
-- Не добавлять эти имена в публичный RPC allowlist как отдельные fn= — только pool.query.
-- ═══════════════════════════════════════════════════════════════════════════════

create or replace function batch_get_client_kv_by_client_id(
  p_client_id uuid,
  p_keys text[]
)
returns jsonb as $$
declare
  v_results jsonb := '[]'::jsonb;
  rec record;
  key_hex text;
  encryption_disabled boolean;
  has_key boolean;
  v_value jsonb;
begin
  if p_client_id is null then
    return jsonb_build_object('error', 'invalid_client_id');
  end if;

  if not exists (select 1 from clients where id = p_client_id) then
    return jsonb_build_object('error', 'unknown_client');
  end if;

  key_hex := current_setting('heys.encryption_key', true);
  encryption_disabled := coalesce(
    current_setting('heys.encryption_disabled', true) = '1',
    false
  );
  has_key := key_hex is not null and length(key_hex) >= 32;

  for rec in
    select kv.k, kv.v, kv.v_encrypted, kv.key_version
    from client_kv_store kv
    where kv.client_id = p_client_id
      and kv.k = any(p_keys)
  loop
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

comment on function batch_get_client_kv_by_client_id(uuid, text[]) is
  'Batch KV read by client_id. For trusted server paths only (agent ingest).';

create or replace function batch_upsert_client_kv_by_client_id(
  p_client_id uuid,
  p_items jsonb
)
returns jsonb as $$
declare
  item record;
  processed int := 0;
begin
  if p_client_id is null then
    return jsonb_build_object('error', 'invalid_client_id');
  end if;

  if not exists (select 1 from clients where id = p_client_id) then
    return jsonb_build_object('error', 'unknown_client');
  end if;

  for item in select * from jsonb_to_recordset(p_items) as x(k text, v jsonb)
  loop
    perform write_client_kv_value(p_client_id, item.k, item.v);
    processed := processed + 1;
  end loop;

  return jsonb_build_object('success', true, 'processed', processed);
end$$ language plpgsql security definer;

comment on function batch_upsert_client_kv_by_client_id(uuid, jsonb) is
  'Batch KV upsert by client_id. For trusted server paths only (agent ingest).';

grant execute on function batch_get_client_kv_by_client_id(uuid, text[]) to heys_rpc;
grant execute on function batch_upsert_client_kv_by_client_id(uuid, jsonb) to heys_rpc;
