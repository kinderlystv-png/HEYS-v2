-- =====================================================
-- Migration: email опционально в leads и clients (P0.12)
-- Date: 2026-04-28
-- Purpose:
--   Чек ЮKassa лучше отправлять на email, чем на телефон (54-ФЗ требует
--   отправку чека, и многим клиентам удобнее e-mail). Также email — резервный
--   канал связи, если клиент потерял доступ к мессенджеру.
--
--   Оба поля опциональные — миграция нон-блокирующая.
-- =====================================================

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS email TEXT;

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS email TEXT;

CREATE INDEX IF NOT EXISTS leads_email_idx ON leads(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS clients_email_idx ON clients(email) WHERE email IS NOT NULL;

COMMENT ON COLUMN leads.email IS 'Опциональный email из лендинговой формы для чека ЮKassa и резервной связи.';
COMMENT ON COLUMN clients.email IS 'Опциональный email клиента, копируется из leads при admin_convert_lead. Используется в receipt.customer.email чека ЮKassa.';
