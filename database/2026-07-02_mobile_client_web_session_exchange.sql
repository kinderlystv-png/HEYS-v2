-- Migration: client-capable mobile WebView session exchange
--
-- Purpose:
--   The first mobile exchange implementation supported curator JWT only.
--   Client iOS login uses PIN sessions, so the same one-time exchange table
--   needs a client subject as well. The raw client session token remains out of
--   URLs and localStorage; consume issues a fresh web client session cookie.

ALTER TABLE public.mobile_web_session_exchanges
  ALTER COLUMN curator_id DROP NOT NULL;

ALTER TABLE public.mobile_web_session_exchanges
  ADD COLUMN IF NOT EXISTS client_id UUID NULL REFERENCES public.clients(id) ON DELETE CASCADE;

ALTER TABLE public.mobile_web_session_exchanges
  DROP CONSTRAINT IF EXISTS mobile_web_session_exchanges_subject_check;

ALTER TABLE public.mobile_web_session_exchanges
  ADD CONSTRAINT mobile_web_session_exchanges_subject_check
  CHECK (
    ((curator_id IS NOT NULL)::INT + (client_id IS NOT NULL)::INT) = 1
  );

CREATE INDEX IF NOT EXISTS idx_mobile_web_session_exchanges_client
  ON public.mobile_web_session_exchanges(client_id, created_at DESC)
  WHERE client_id IS NOT NULL;

COMMENT ON COLUMN public.mobile_web_session_exchanges.curator_id IS
  'Curator subject for native mobile -> WebView curator cookie exchange';
COMMENT ON COLUMN public.mobile_web_session_exchanges.client_id IS
  'Client subject for native mobile -> WebView PIN-session cookie exchange';

