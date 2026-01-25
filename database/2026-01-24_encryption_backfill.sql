-- 2026-01-24: Phase 2 — Backfill existing health_data with encryption
-- ⚠️ Run AFTER setting heys.encryption_key!
-- ⚠️ Run in batches during low-traffic window!

-- Check key is configured
do $$
begin
  perform get_encryption_key();
  raise notice '✅ Encryption key configured';
exception when others then
  raise exception '❌ Set encryption key first: SET heys.encryption_key = ''your-32-char-hex-key''';
end$$;

-- Backfill in batches (100 rows at a time, SKIP LOCKED)
do $$
declare
  batch_size int := 100;
  total_encrypted int := 0;
  batch_count int;
begin
  loop
    with to_encrypt as (
      select client_id, k
      from client_kv_store
      where is_health_key(k)
        and key_version is null  -- not yet encrypted
      limit batch_size
      for update skip locked
    )
    update client_kv_store ckv
    set 
      v_encrypted = encrypt_health_data(ckv.v),
      key_version = 1,
      v = '{}'::jsonb  -- clear plaintext
    from to_encrypt te
    where ckv.client_id = te.client_id and ckv.k = te.k;
    
    get diagnostics batch_count = row_count;
    total_encrypted := total_encrypted + batch_count;
    
    raise notice 'Encrypted % rows (total: %)', batch_count, total_encrypted;
    
    exit when batch_count = 0;
    
    -- Small delay to reduce lock contention
    perform pg_sleep(0.1);
  end loop;
  
  raise notice '🎉 Backfill complete! Total encrypted: %', total_encrypted;
end$$;

-- Verify
select 
  count(*) filter (where key_version is null and is_health_key(k)) as plaintext_health,
  count(*) filter (where key_version = 1 and is_health_key(k)) as encrypted_health,
  count(*) filter (where not is_health_key(k)) as non_health
from client_kv_store;
