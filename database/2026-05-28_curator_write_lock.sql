-- Migration: per-client curator_write_locked flag + protection trigger
--
-- WHY (incident 2026-05-27):
--   Курaтор зашёл в режим клиента Александры (4545ee50-...) с Android-устройства,
--   которое имело свои LS-данные. Из-за двух багов (CLIENT_SPECIFIC_KEYS incomplete
--   + cloud.saveKey ignores whitelist) курaторские глобальные ключи (heys_clients,
--   heys_advice_*, heys_ews_*, etc.) попали в её client_kv_store, перезаписав её
--   данные. См. plans/toasty-sauteeing-porcupine.md (Root cause #2).
--
-- WHAT:
--   1. Добавляем clients.curator_write_locked (BOOLEAN, default FALSE)
--   2. Триггер на client_kv_store INSERT/UPDATE: если у клиента флаг TRUE и
--      запись идёт по curator-path (user_id IS NOT NULL, см. heys-api-rpc/index.js:1945)
--      → RAISE EXCEPTION. PIN-сессии (user_id IS NULL) проходят свободно.
--
-- HOW TO APPLY:
--   bash scripts/db/psql.sh -f database/2026-05-28_curator_write_lock.sql
--
-- HOW TO LOCK SPECIFIC CLIENT:
--   psql ... -c "UPDATE clients SET curator_write_locked=TRUE WHERE id='<uuid>';"
--
-- HOW TO UNLOCK (after deploy Ticket I+J+A+B):
--   psql ... -c "UPDATE clients SET curator_write_locked=FALSE WHERE id='<uuid>';"

BEGIN;

ALTER TABLE clients ADD COLUMN IF NOT EXISTS curator_write_locked BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN clients.curator_write_locked IS
  'Если TRUE — блокирует все curator-path writes в client_kv_store этого клиента (PIN-сессии не блокируются). Временная защита от cross-client pollution. См. plans/toasty-sauteeing-porcupine.md';

CREATE OR REPLACE FUNCTION public.block_curator_write_if_locked()
RETURNS TRIGGER AS $$
DECLARE
  v_locked BOOLEAN;
BEGIN
  -- Только curator-path: user_id указывает на курaтора (для PIN-сессий он NULL,
  -- см. heys-api-rpc/index.js: const userIdForRow = isCurator ? curatorId : null)
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT curator_write_locked INTO v_locked FROM clients WHERE id = NEW.client_id;
  IF v_locked IS TRUE THEN
    RAISE EXCEPTION 'curator_write_locked: blocked curator write to client_kv_store for client_id=% k=%',
      NEW.client_id, NEW.k
      USING ERRCODE = '42501';  -- insufficient_privilege
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.block_curator_write_if_locked() IS
  'Trigger function: блокирует curator writes (user_id IS NOT NULL) в client_kv_store если у клиента clients.curator_write_locked=TRUE.';

DROP TRIGGER IF EXISTS trg_block_curator_write_on_locked ON public.client_kv_store;
CREATE TRIGGER trg_block_curator_write_on_locked
BEFORE INSERT OR UPDATE ON public.client_kv_store
FOR EACH ROW EXECUTE PROCEDURE public.block_curator_write_if_locked();

COMMIT;
