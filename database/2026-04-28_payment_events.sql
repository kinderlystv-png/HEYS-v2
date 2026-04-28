-- =====================================================
-- Migration: payment_events — idempotency log для webhook'ов ЮKassa
-- Date: 2026-04-28
-- Purpose:
--   ЮKassa делает retry webhook'ов при 5xx-ответах. Без идемпотентности
--   повторное событие payment.succeeded снова обновит subscription_ends_at,
--   потенциально удвоив длительность подписки.
--
--   Эта таблица хранит факт обработки каждого события (external_payment_id,
--   event_type, external_status). Обработчик пытается сделать INSERT первым
--   шагом — UNIQUE constraint гарантирует, что повторная попытка не приведёт
--   к двойному UPDATE.
-- =====================================================

CREATE TABLE IF NOT EXISTS payment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- FK на наш payment (может быть NULL, если событие про неизвестный платёж)
  payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,

  -- Идентификатор платежа в ЮKassa (object.id из webhook payload)
  external_payment_id TEXT NOT NULL,

  -- Тип события: payment.succeeded / payment.canceled / payment.waiting_for_capture /
  --              refund.succeeded / refund.canceled
  event_type TEXT NOT NULL,

  -- Статус из object.status (succeeded / canceled / pending / waiting_for_capture)
  external_status TEXT NOT NULL,

  -- Полный JSON-payload webhook'а — для аудита и отладки
  raw_payload JSONB NOT NULL,

  -- IP источника (для дополнительной аудитной защиты)
  source_ip TEXT,

  processed_at TIMESTAMPTZ DEFAULT NOW(),

  -- Идемпотентность: одна и та же тройка (external_payment_id, event_type,
  -- external_status) может быть обработана только один раз.
  CONSTRAINT payment_events_unique
    UNIQUE (external_payment_id, event_type, external_status)
);

CREATE INDEX IF NOT EXISTS payment_events_payment_idx
  ON payment_events(payment_id) WHERE payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS payment_events_external_idx
  ON payment_events(external_payment_id);

CREATE INDEX IF NOT EXISTS payment_events_processed_idx
  ON payment_events(processed_at DESC);

COMMENT ON TABLE payment_events IS
  'Журнал webhook-событий от ЮKassa для idempotency и аудита.';

COMMENT ON CONSTRAINT payment_events_unique ON payment_events IS
  'Гарантия идемпотентности: повторный webhook на ту же (external_payment_id, event_type, status) тройку отклоняется на уровне БД.';
