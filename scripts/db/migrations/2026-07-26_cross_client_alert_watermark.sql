-- Seed the durable cross-client Telegram alert cursor at rollout time.
-- Historical blocks were already surfaced by the former realtime sender and
-- must not be replayed as a burst when the DB-backed worker is first enabled.

INSERT INTO public.security_alerts_log (
  rule_key,
  triggered_count,
  payload,
  telegram_sent_at,
  telegram_message_id
)
SELECT
  'cross_client_write_blocked',
  0,
  jsonb_build_object(
    'max_audit_id', baseline.max_audit_id,
    'baseline', true
  ),
  now(),
  'baseline-no-send'
FROM (
  SELECT COALESCE(MAX(id), 0) AS max_audit_id
  FROM public.data_loss_audit
) baseline
WHERE NOT EXISTS (
  SELECT 1
  FROM public.security_alerts_log existing
  WHERE existing.rule_key = 'cross_client_write_blocked'
    AND existing.payload @> '{"baseline": true}'::jsonb
);
