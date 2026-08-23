-- 2026-08-23: E2E fixtures — non-weak PIN + access_code (схема login v2).
--
-- До патча PIN 0000/1111 давали needs_access_code_setup / invalid_credentials
-- после client_login_scheme_v2. Для Playwright: PIN = access_code (non-weak 4 цифры).
--
-- E2E-TestAlex: phone 70000000001, PIN/access 1357
-- E2E-TestPopl:  phone 70000000002, PIN/access 9753
--
-- Idempotent: безопасно re-apply из scripts/e2e/setup.mjs

BEGIN;

UPDATE public.clients
SET
  pin_hash = crypt(v.pin, gen_salt('bf')),
  pin_updated_at = NOW(),
  access_code_hash = crypt(v.pin, gen_salt('bf', 12)),
  access_code_set_at = NOW(),
  access_code_failed_attempts = 0,
  access_code_locked_until = NULL,
  onetime_pin_hash = NULL,
  onetime_pin_expires_at = NULL,
  updated_at = NOW()
FROM (VALUES
  ('11111111-1111-1111-1111-111111111111'::uuid, '1357'),
  ('22222222-2222-2222-2222-222222222222'::uuid, '9753')
) AS v(id, pin)
WHERE clients.id = v.id;

COMMIT;
