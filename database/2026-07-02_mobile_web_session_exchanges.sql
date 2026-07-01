-- Migration: one-time mobile WebView session exchange tokens
--
-- Purpose:
--   Native iOS shell stores the long-lived curator JWT in Keychain/SecureStore.
--   WebView must not receive that JWT in query string or localStorage. Instead,
--   the auth function issues a short-lived random exchange token, stores only
--   its SHA-256 hash, and consumes it once to set the HttpOnly web cookie.

CREATE TABLE IF NOT EXISTS public.mobile_web_session_exchanges (
  token_hash  BYTEA        PRIMARY KEY,
  curator_id  UUID        NOT NULL REFERENCES public.curators(id) ON DELETE CASCADE,
  return_url  TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_mobile_web_session_exchanges_curator
  ON public.mobile_web_session_exchanges(curator_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mobile_web_session_exchanges_expires
  ON public.mobile_web_session_exchanges(expires_at);

COMMENT ON TABLE public.mobile_web_session_exchanges IS
  'One-time short-lived tokens for native mobile -> WebView curator cookie exchange';
COMMENT ON COLUMN public.mobile_web_session_exchanges.token_hash IS
  'SHA-256 hash of random exchange token; raw token is never stored';
COMMENT ON COLUMN public.mobile_web_session_exchanges.consumed_at IS
  'Set on first successful consume; non-null blocks replay';

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.mobile_web_session_exchanges TO heys_admin;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'heys_rpc') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.mobile_web_session_exchanges TO heys_rpc';
  END IF;
END$$;
