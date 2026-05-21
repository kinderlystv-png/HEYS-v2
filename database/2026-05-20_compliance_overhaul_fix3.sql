-- ═══════════════════════════════════════════════════════════════════════════════
-- HEYS: Patch fix3 для 2026-05-20_compliance_overhaul.sql
-- Дата: 2026-05-20
-- ═══════════════════════════════════════════════════════════════════════════════
-- Что чиним:
--   1. Legacy reset_client_pin (database/2025-01-08_fix_reset_client_pin.sql) —
--      устарел (frontend на admin_set_client_pin который уже kill sessions),
--      но если кто-то вызовет старый путь — старые сессии остаются живы.
--      Добавляем revoke_all_client_sessions в конец reset_client_pin.
--   2. Алиас revoke_all_sessions_for_client → revoke_all_client_sessions:
--      в моём overhaul я создал новую функцию, а в БД уже жила
--      revoke_all_client_sessions (2026-05-19). Делаем revoke_all_sessions_for_client
--      простой обёрткой чтобы избежать конфликта имён.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1) Legacy reset_client_pin: kill sessions ────────────────────────────

DROP FUNCTION IF EXISTS public.reset_client_pin(uuid, text, text, uuid);

CREATE OR REPLACE FUNCTION public.reset_client_pin(
    p_client_id UUID,
    p_pin_salt TEXT,
    p_pin_hash TEXT,
    p_curator_id UUID DEFAULT NULL
)
RETURNS TABLE(success BOOLEAN, error TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated INTEGER;
  v_revoked INTEGER;
BEGIN
  IF p_pin_salt IS NULL OR length(p_pin_salt) < 16 THEN
    RETURN QUERY SELECT FALSE, 'Некорректная соль'::TEXT;
    RETURN;
  END IF;
  IF p_pin_hash IS NULL OR length(p_pin_hash) < 32 THEN
    RETURN QUERY SELECT FALSE, 'Некорректный хеш PIN'::TEXT;
    RETURN;
  END IF;

  IF p_curator_id IS NOT NULL THEN
    UPDATE public.clients
    SET pin_salt = p_pin_salt, pin_hash = p_pin_hash,
        pin_failed_attempts = 0, pin_locked_until = NULL, updated_at = NOW()
    WHERE id = p_client_id AND curator_id = p_curator_id;
  ELSE
    UPDATE public.clients
    SET pin_salt = p_pin_salt, pin_hash = p_pin_hash,
        pin_failed_attempts = 0, pin_locked_until = NULL, updated_at = NOW()
    WHERE id = p_client_id;
  END IF;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    RETURN QUERY SELECT FALSE,
      CASE WHEN p_curator_id IS NOT NULL
           THEN 'Клиент не найден или не принадлежит куратору'
           ELSE 'Клиент не найден' END::TEXT;
    RETURN;
  END IF;

  -- 🔐 Закрытие дыры #9: убиваем все активные сессии клиента после PIN reset.
  -- Использует существующую public.revoke_all_client_sessions из 2026-05-19.
  v_revoked := public.revoke_all_client_sessions(p_client_id);

  RETURN QUERY SELECT TRUE, NULL::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.reset_client_pin(uuid, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_client_pin(uuid, text, text, uuid) TO heys_rpc;
GRANT EXECUTE ON FUNCTION public.reset_client_pin(uuid, text, text, uuid) TO heys_admin;

COMMENT ON FUNCTION public.reset_client_pin(uuid, text, text, uuid) IS
  'Legacy reset_client_pin (frontend перешёл на admin_set_client_pin). '
  'v2 2026-05-20: kill sessions через revoke_all_client_sessions для compliance.';

-- ─── 2) Алиас revoke_all_sessions_for_client → revoke_all_client_sessions ──

-- Дропаем дубликатную функцию (созданную в overhaul) и заменяем тонким алиасом.
DROP FUNCTION IF EXISTS public.revoke_all_sessions_for_client(UUID, BYTEA);

CREATE OR REPLACE FUNCTION public.revoke_all_sessions_for_client(
  p_client_id UUID,
  p_except_token_hash BYTEA DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- p_except_token_hash для будущего use-case (kill all except current);
  -- сейчас игнорируется т.к. revoke_all_client_sessions всех бьёт.
  v_count := public.revoke_all_client_sessions(p_client_id);
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.revoke_all_sessions_for_client(UUID, BYTEA) TO heys_rpc;
GRANT EXECUTE ON FUNCTION public.revoke_all_sessions_for_client(UUID, BYTEA) TO heys_admin;

COMMIT;
