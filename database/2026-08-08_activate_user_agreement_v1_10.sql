-- HEYS legal consent registry: activate user agreement/payment oferta v1.10.
-- Forward-only follow-up to v1.9. Historical consent evidence and immutable
-- snapshots keep their original version/hash.
--
-- Что изменилось в v1.10 (§ 5.4 «Время работы»): режим сопровождения
-- расшифрован как ежедневный вместо неопределённого «в дни и объёме,
-- предусмотренных выбранным тарифом», и введён ориентир внесения присланных
-- данных в дневник — 1–2 часа, при обстоятельствах вне разумного контроля
-- Исполнителя не более 24 часов, далее применяется п. 5.5 (подменный куратор).
-- Оба пункта добавляют обязательства Исполнителя, поэтому оформлены новой
-- версией, а не правкой действующей (решение владельца 2026-08-08, лог `15` №53).
--
-- Applying this migration triggers re-consent for user_agreement/payment_oferta
-- consumers that require the active registry version. Do not apply separately
-- from the matching frontend/payment release.

INSERT INTO public.legal_consent_registry (
  consent_type,
  document_version,
  document_sha256,
  document_path,
  status,
  effective_at,
  legal_signoff_ref
) VALUES
  ('user_agreement', '1.10', '6623707bdc2ab1867143012b7f54834cef5b35f0b06aefaf52ab5bdbaaf495a5', 'apps/web/public/docs/v1.10/user-agreement.md', 'active', '2026-08-08 00:00:00+03', NULL),
  ('payment_oferta', '1.10', '6623707bdc2ab1867143012b7f54834cef5b35f0b06aefaf52ab5bdbaaf495a5', 'apps/web/public/docs/v1.10/user-agreement.md', 'active', '2026-08-08 00:00:00+03', NULL)
ON CONFLICT (consent_type, document_version) DO UPDATE SET
  document_sha256 = EXCLUDED.document_sha256,
  document_path = EXCLUDED.document_path,
  status = EXCLUDED.status,
  effective_at = EXCLUDED.effective_at,
  legal_signoff_ref = EXCLUDED.legal_signoff_ref;

UPDATE public.legal_consent_registry
SET status = 'retired'
WHERE consent_type IN ('user_agreement', 'payment_oferta')
  AND document_version <> '1.10'
  AND status = 'active';
