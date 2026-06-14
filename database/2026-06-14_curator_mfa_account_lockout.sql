-- SEC-011: curator MFA (TOTP) + per-account login lockout.
--
-- Adds fail-closed auth controls to the first-party curator auth table.
-- TOTP secrets are encrypted by heys-api-auth before storage; this migration
-- only provides ciphertext columns and counters.

ALTER TABLE public.curators
  ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mfa_enabled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS mfa_totp_secret_ciphertext TEXT,
  ADD COLUMN IF NOT EXISTS failed_login_attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_failed_login_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS login_locked_until TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_curators_login_locked_until
  ON public.curators(login_locked_until)
  WHERE login_locked_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_curators_mfa_enabled
  ON public.curators(mfa_enabled)
  WHERE mfa_enabled = true;

COMMENT ON COLUMN public.curators.mfa_enabled IS
  'Whether curator login requires TOTP after password verification';
COMMENT ON COLUMN public.curators.mfa_enabled_at IS
  'Timestamp when TOTP was successfully enabled for this curator';
COMMENT ON COLUMN public.curators.mfa_totp_secret_ciphertext IS
  'AES-GCM encrypted TOTP secret; plaintext is never stored in DB';
COMMENT ON COLUMN public.curators.failed_login_attempts IS
  'Per-account failed password/TOTP attempts in the current lockout window';
COMMENT ON COLUMN public.curators.last_failed_login_at IS
  'Last failed curator login attempt for this account';
COMMENT ON COLUMN public.curators.login_locked_until IS
  'If set in the future, curator login is blocked until this timestamp';
