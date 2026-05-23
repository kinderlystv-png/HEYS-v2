-- cleanup-zombie-keys.sql
-- Periodic cleanup of zombie data в client_kv_store
-- Запуск: bash scripts/db/psql.sh -f scripts/db/cleanup-zombie-keys.sql
-- Рекомендуемая периодичность: раз в неделю или по cron'у в cloud function
--
-- Что чистит:
--   1. heys_xp_cache_<cid> — должен быть local-only (LOCAL_ONLY_STORAGE_PREFIXES),
--      но старые PWA bundles могут писать новые copies в облако до rollout
--   2. heys_insights_feedback_<cid> — legacy inline-cid pattern. Canonical key —
--      heys_insights_feedback (без suffix); normalizeKeyForSupabase нормализует
--      writes, но миграция исторических rows нужна
--   3. heys_products_BACKUP_*, heys_hidden_products_BACKUP_*, heys_products_overlay_v2_BACKUP_*
--      — это rollback snapshots, local-only safety nets, не нужны в облаке
--   4. _advice_trace_day_v1 suffix — debug traces (LOCAL_ONLY_STORAGE_SUFFIXES)
--   5. test_* / heys_debug_* / _audit_test_ / _test_upsert — dev/test debris

BEGIN;

WITH del_xp_cache AS (
  DELETE FROM client_kv_store
  WHERE k LIKE 'heys_xp_cache_%'
  RETURNING length(v::text) AS sz
)
SELECT 'heys_xp_cache_*' AS pattern,
       count(*) AS rows_deleted,
       pg_size_pretty(coalesce(sum(sz), 0)::bigint) AS bytes_freed
FROM del_xp_cache;

WITH del_insights AS (
  DELETE FROM client_kv_store
  WHERE k LIKE 'heys_insights_feedback_%'
    AND k != 'heys_insights_feedback'
  RETURNING length(v::text) AS sz
)
SELECT 'heys_insights_feedback_<suffix>' AS pattern,
       count(*) AS rows_deleted,
       pg_size_pretty(coalesce(sum(sz), 0)::bigint) AS bytes_freed
FROM del_insights;

WITH del_backups AS (
  DELETE FROM client_kv_store
  WHERE k LIKE 'heys_products_BACKUP_%'
     OR k LIKE 'heys_hidden_products_BACKUP_%'
     OR k LIKE 'heys_products_overlay_v2_BACKUP_%'
     OR k LIKE 'heys_overlay_%'
     OR k LIKE 'heys_products_pre_overlay_%'
  RETURNING length(v::text) AS sz
)
SELECT 'local-only backups/overlays' AS pattern,
       count(*) AS rows_deleted,
       pg_size_pretty(coalesce(sum(sz), 0)::bigint) AS bytes_freed
FROM del_backups;

WITH del_trace AS (
  DELETE FROM client_kv_store
  WHERE k LIKE '%_advice_trace_day_v1'
  RETURNING length(v::text) AS sz
)
SELECT '*_advice_trace_day_v1' AS pattern,
       count(*) AS rows_deleted,
       pg_size_pretty(coalesce(sum(sz), 0)::bigint) AS bytes_freed
FROM del_trace;

WITH del_debug AS (
  DELETE FROM client_kv_store
  WHERE k IN (
    'test_key_new', '_audit_test_', '_test_upsert', 'test_curator_sync',
    'test_jsonb_fix', 'test_jsonb_fix2', 'heys_profile_test', 'heys_debug_sync',
    'test_key', 'test_large', 'heys_debug_gamification',
    'heys_debug_yesterday_zero_payload', 'heys_debug_yesterday_info',
    'heys_insights_debug'
  )
  RETURNING length(v::text) AS sz
)
SELECT 'debug/test keys' AS pattern,
       count(*) AS rows_deleted,
       pg_size_pretty(coalesce(sum(sz), 0)::bigint) AS bytes_freed
FROM del_debug;

COMMIT;
