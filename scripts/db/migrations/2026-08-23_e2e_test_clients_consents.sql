-- 2026-08-23: E2E fixtures — актуальные обязательные согласия с proof (legal_consent_registry).
-- check_required_consents_v2 требует version + document_sha256 + accepted_at; без них — re-consent gate.

BEGIN;

DELETE FROM public.consents
WHERE client_id IN (
  '11111111-1111-1111-1111-111111111111'::uuid,
  '22222222-2222-2222-2222-222222222222'::uuid
)
AND consent_type IN ('user_agreement', 'personal_data');

INSERT INTO public.consents (
  client_id,
  consent_type,
  document_version,
  document_sha256,
  granted,
  consent_method,
  signature_method,
  is_active,
  granted_at,
  accepted_at
)
SELECT
  f.client_id,
  f.consent_type,
  r.document_version,
  r.document_sha256,
  true,
  'pin_confirm',
  'pin_confirm',
  true,
  NOW(),
  NOW()
FROM (VALUES
  ('11111111-1111-1111-1111-111111111111'::uuid, 'user_agreement'),
  ('11111111-1111-1111-1111-111111111111'::uuid, 'personal_data'),
  ('22222222-2222-2222-2222-222222222222'::uuid, 'user_agreement'),
  ('22222222-2222-2222-2222-222222222222'::uuid, 'personal_data')
) AS f(client_id, consent_type)
JOIN public.legal_consent_registry r
  ON r.consent_type = f.consent_type
 AND r.status = 'active';

UPDATE public.clients
SET consent_outdated_since = NULL
WHERE id IN (
  '11111111-1111-1111-1111-111111111111'::uuid,
  '22222222-2222-2222-2222-222222222222'::uuid
);

UPDATE public.client_kv_store
SET
  v = v || jsonb_build_object(
    'optionalFeatureConsentsOfferedAt', (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint,
    'measurementsTrackingEnabled', false,
    'supplementsTrackingEnabled', false,
    'profileCompleted', true
  ),
  updated_at = NOW()
WHERE client_id IN (
  '11111111-1111-1111-1111-111111111111'::uuid,
  '22222222-2222-2222-2222-222222222222'::uuid
)
AND k = 'heys_profile';

COMMIT;
