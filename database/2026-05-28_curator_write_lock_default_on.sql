-- Migration: curator_write_locked default-on for all clients
--
-- WHY (continuation of 2026-05-28_curator_write_lock.sql):
--   Per-client opt-in lock защищает только тех, для кого его явно включили.
--   Любой новый клиент (или забытый existing) уязвим к курaтор-pollution
--   (см. plans/toasty-sauteeing-porcupine.md root cause #2).
--
--   Все известные сегодня curator-writes — это side-effect от LS pollution
--   (Bug A whitelist + Bug B saveKey), не legitimate feature. Default-on
--   улучшает ситуацию, не ухудшает: курaторская UI начнёт получать explicit
--   error вместо silent data loss.
--
--   Defaults снимутся после deploy Ticket I+J (когда saveKey будет
--   корректно фильтровать через whitelist) — тогда default-off восстановится
--   за один UPDATE.
--
-- HOW TO APPLY:
--   bash scripts/db/psql.sh -f database/2026-05-28_curator_write_lock_default_on.sql

BEGIN;

-- 1. Включаем lock для всех existing клиентов
UPDATE clients SET curator_write_locked = TRUE WHERE curator_write_locked IS FALSE;

-- 2. Меняем default колонки на TRUE — новые клиенты автоматически защищены
ALTER TABLE clients ALTER COLUMN curator_write_locked SET DEFAULT TRUE;

COMMENT ON COLUMN clients.curator_write_locked IS
  'Если TRUE — блокирует все curator-path writes в client_kv_store этого клиента (PIN-сессии не блокируются). Default-on с 2026-05-28 до deploy Ticket I+J. См. plans/toasty-sauteeing-porcupine.md';

COMMIT;

-- Verify
SELECT id, name, curator_write_locked FROM clients ORDER BY name;
