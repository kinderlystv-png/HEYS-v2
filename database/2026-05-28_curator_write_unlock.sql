-- ═══════════════════════════════════════════════════════════════════
-- Migration: Снимаем curator_write_locked default-on (Ticket H finalize)
-- Date: 2026-05-28 12:35 MSK
-- Purpose:
--   Panic mode из 2026-05-28_curator_write_lock_default_on.sql закончен.
--   Все pre-req fixes deployed:
--     - Ticket I+J (commit ada20a92): cloud.saveKey фильтрует через
--       needsClientStorage (whitelist)
--     - Ticket M v1 (commit f9580097): top-level v.updatedAt для covered
--       client-data keys
--     - Ticket A v2 (commit 88bb174a): server-side stale_write_blocked
--       в default merge branch
--     - Ticket B (commit 6cebee00 + aab2162b): NON_CLIENT_DATA_BLACKLIST
--       на 5 paths (3 client + 2 server); validated в проде 11:56:30 (поймал
--       реальную попытку heys_client_current на 4545ee50)
--     - Ticket F (commit 6766f0db): audit trigger + REVOKE EXECUTE
--     - Ticket D (commit 194b3fe6): 401 + isAuthFailure handler
--     - Hotfix (commit 5d1157b2): ON CONFLICT SET user_id = EXCLUDED.user_id
--       в merge_save + PIN-path SQL functions
--   PIN-flow подтверждён работающим на 2 клиентах (включая Александру).
--
-- Apply:
--   ./scripts/db/psql.sh -f database/2026-05-28_curator_write_unlock.sql
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

-- Step 1: снимаем lock для всех уже-залоченных клиентов.
UPDATE clients SET curator_write_locked = FALSE WHERE curator_write_locked = TRUE;

-- Step 2: меняем default колонки обратно на FALSE.
ALTER TABLE clients ALTER COLUMN curator_write_locked SET DEFAULT FALSE;

COMMIT;

-- Trigger trg_block_curator_write_on_locked СОХРАНЯЕТСЯ.
-- Он стал no-op (все curator_write_locked=FALSE), но защита остаётся
-- доступной для индивидуального применения: UPDATE clients SET
-- curator_write_locked=TRUE WHERE id='...' — точечный kill switch.

-- Smoke verify:
--   SELECT count(*) FROM clients WHERE curator_write_locked = TRUE;  -- 0
--   SELECT column_default FROM information_schema.columns
--   WHERE table_name='clients' AND column_name='curator_write_locked';
--   -- false
