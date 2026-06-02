-- ═══════════════════════════════════════════════════════════════════
-- write_contexts — server-issued capability tokens binding KV write
-- to a specific (curator_id, client_id) или (session_id, client_id) pair
-- at issuance time.
--
-- Цель: при curator switch (или race conditions) stale React state на
-- клиенте может попытаться записать данные в неправильный client_id
-- (browser supplies B, но данные были загружены под A). С context_id:
-- server резолвит canonical client_id из context'а и **игнорирует**
-- client_id из браузера. Pollution физически невозможна.
--
-- См. plan: /Users/poplavskijanton/.claude/plans/cosmic-tickling-lynx.md
-- Incident lineage: incidents #1-#11 cross-client pollution (2026-06-01..02).
-- Model based on client_sessions (database/2025-12-24_subscriptions_and_sessions.sql).
-- ═══════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.write_contexts (
  context_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  curator_id     uuid NULL REFERENCES public.curators(id) ON DELETE CASCADE,
  client_id      uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  session_id     uuid NULL REFERENCES public.client_sessions(id) ON DELETE CASCADE,
  issued_at      timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz NOT NULL,
  revoked_at     timestamptz NULL,
  revoked_reason text NULL,
  user_agent     text NULL,
  ip_address     inet NULL,
  issuer_kind    text NOT NULL CHECK (issuer_kind IN ('curator','session')),
  CONSTRAINT write_contexts_pair_chk CHECK (
    (issuer_kind = 'curator' AND curator_id IS NOT NULL AND session_id IS NULL)
    OR (issuer_kind = 'session' AND session_id  IS NOT NULL AND curator_id IS NULL)
  )
);

COMMENT ON TABLE public.write_contexts IS
  'Server-issued capability tokens. Each KV write may carry context_id; server uses context.client_id as authoritative target, ignoring client-supplied client_id. Phase B (default): warn-only via data_loss_audit. Phase C: strict — write rejected/rerouted on mismatch.';

CREATE INDEX IF NOT EXISTS write_contexts_curator_client_live_idx
  ON public.write_contexts (curator_id, client_id) WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS write_contexts_session_live_idx
  ON public.write_contexts (session_id) WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS write_contexts_expires_at_idx
  ON public.write_contexts (expires_at) WHERE revoked_at IS NULL;

-- REVOKE для Supabase-style ролей если присутствуют (на YC postgres их нет).
DO $$ BEGIN
  REVOKE ALL ON TABLE public.write_contexts FROM anon, authenticated;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE public.write_contexts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "write_contexts_no_direct_access" ON public.write_contexts;
CREATE POLICY "write_contexts_no_direct_access"
  ON public.write_contexts FOR ALL TO public USING (false);

GRANT SELECT, INSERT, UPDATE ON TABLE public.write_contexts TO heys_rpc;
GRANT SELECT, INSERT, UPDATE ON TABLE public.write_contexts TO heys_rest;

-- ═══════════════════════════════════════════════════════════════════
-- 1. issue_write_context_by_curator — curator JWT path.
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.issue_write_context_by_curator(
  p_curator_id    uuid,
  p_client_id     uuid,
  p_ttl_seconds   int DEFAULT 86400,
  p_user_agent    text DEFAULT NULL,
  p_ip            inet DEFAULT NULL
) RETURNS TABLE(context_id uuid, expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_owns boolean;
  v_ctx  uuid;
  v_exp  timestamptz;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM public.clients
     WHERE id = p_client_id AND curator_id = p_curator_id
  ) INTO v_owns;

  IF NOT v_owns THEN
    RAISE EXCEPTION 'curator_does_not_own_client' USING ERRCODE = 'P0001';
  END IF;

  v_exp := now() + make_interval(secs => GREATEST(p_ttl_seconds, 60));

  INSERT INTO public.write_contexts(
    curator_id, client_id, issued_at, expires_at, user_agent, ip_address, issuer_kind
  ) VALUES (
    p_curator_id, p_client_id, now(), v_exp, p_user_agent, p_ip, 'curator'
  ) RETURNING public.write_contexts.context_id INTO v_ctx;

  RETURN QUERY SELECT v_ctx, v_exp;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- 2. issue_write_context_by_session — PIN session path.
-- Lookup сессии по plaintext token, валидируем live, привязываем context.
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.issue_write_context_by_session(
  p_session_token text,
  p_ttl_seconds   int DEFAULT 86400,
  p_user_agent    text DEFAULT NULL,
  p_ip            inet DEFAULT NULL
) RETURNS TABLE(context_id uuid, client_id uuid, expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_session_id uuid;
  v_client_id  uuid;
  v_ctx        uuid;
  v_exp        timestamptz;
BEGIN
  SELECT cs.id, cs.client_id
    INTO v_session_id, v_client_id
    FROM public.client_sessions cs
   WHERE cs.token_hash = digest(p_session_token, 'sha256')
     AND cs.expires_at > now()
     AND cs.revoked_at IS NULL
   LIMIT 1;

  IF v_session_id IS NULL THEN
    RAISE EXCEPTION 'invalid_session' USING ERRCODE = 'P0001';
  END IF;

  v_exp := now() + make_interval(secs => GREATEST(p_ttl_seconds, 60));

  INSERT INTO public.write_contexts(
    session_id, client_id, issued_at, expires_at, user_agent, ip_address, issuer_kind
  ) VALUES (
    v_session_id, v_client_id, now(), v_exp, p_user_agent, p_ip, 'session'
  ) RETURNING public.write_contexts.context_id INTO v_ctx;

  RETURN QUERY SELECT v_ctx, v_client_id, v_exp;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- 3. validate_write_context — used by write paths.
-- Возвращает canonical client_id из context и status code.
-- При successful validation, server должен переписывать resolvedClientId ← row.client_id.
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.validate_write_context(
  p_context_id          uuid,
  p_expected_curator_id uuid DEFAULT NULL,
  p_expected_session_id uuid DEFAULT NULL
) RETURNS TABLE(
  ok          boolean,
  status      text,
  client_id   uuid,
  curator_id  uuid,
  session_id  uuid
) LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  v_row public.write_contexts%ROWTYPE;
BEGIN
  IF p_context_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'context_not_provided'::text, NULL::uuid, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  SELECT * INTO v_row FROM public.write_contexts wc WHERE wc.context_id = p_context_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'context_not_found'::text, NULL::uuid, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  IF v_row.revoked_at IS NOT NULL THEN
    RETURN QUERY SELECT FALSE, 'context_revoked'::text, v_row.client_id, v_row.curator_id, v_row.session_id;
    RETURN;
  END IF;

  IF v_row.expires_at <= now() THEN
    RETURN QUERY SELECT FALSE, 'context_expired'::text, v_row.client_id, v_row.curator_id, v_row.session_id;
    RETURN;
  END IF;

  IF p_expected_curator_id IS NOT NULL AND v_row.curator_id IS DISTINCT FROM p_expected_curator_id THEN
    RETURN QUERY SELECT FALSE, 'context_curator_mismatch'::text, v_row.client_id, v_row.curator_id, v_row.session_id;
    RETURN;
  END IF;

  IF p_expected_session_id IS NOT NULL AND v_row.session_id IS DISTINCT FROM p_expected_session_id THEN
    RETURN QUERY SELECT FALSE, 'context_session_mismatch'::text, v_row.client_id, v_row.curator_id, v_row.session_id;
    RETURN;
  END IF;

  RETURN QUERY SELECT TRUE, 'ok'::text, v_row.client_id, v_row.curator_id, v_row.session_id;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- 4. revoke_write_contexts_for_curator — bulk revoke на switchClient.
-- Возвращает количество revoked rows. Idempotent.
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.revoke_write_contexts_for_curator(
  p_curator_id uuid,
  p_reason     text DEFAULT 'client_switch'
) RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_n int;
BEGIN
  UPDATE public.write_contexts
     SET revoked_at = now(), revoked_reason = p_reason
   WHERE curator_id = p_curator_id AND revoked_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- Grants.
-- ═══════════════════════════════════════════════════════════════════
GRANT EXECUTE ON FUNCTION public.issue_write_context_by_curator(uuid,uuid,int,text,inet)  TO heys_rpc;
GRANT EXECUTE ON FUNCTION public.issue_write_context_by_session(text,int,text,inet)       TO heys_rpc;
GRANT EXECUTE ON FUNCTION public.validate_write_context(uuid,uuid,uuid)                   TO heys_rpc;
GRANT EXECUTE ON FUNCTION public.validate_write_context(uuid,uuid,uuid)                   TO heys_rest;
GRANT EXECUTE ON FUNCTION public.revoke_write_contexts_for_curator(uuid,text)             TO heys_rpc;
