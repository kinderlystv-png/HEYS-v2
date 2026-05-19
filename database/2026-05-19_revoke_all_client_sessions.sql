-- ═══════════════════════════════════════════════════════════════════
-- Migration: revoke_all_client_sessions + wire into admin_set_client_pin
-- Date: 2026-05-19
-- Purpose:
--   Сегодня admin_set_client_pin переписывает clients.pin_hash, но
--   активные client_sessions у этого клиента продолжают работать ещё до
--   30 дней (TTL сессии). Куратор, который меняет PIN после подозрения
--   на компрометацию, не имеет рычага вытолкнуть атакующего из живой
--   сессии — старый токен валиден до естественного истечения.
--
--   Решение (паттерн из kinderly-events `/api/admin/events/[id]/regenerate-pin`):
--   при PIN-reset проставляем revoked_at = NOW() на ВСЕ активные сессии
--   этого клиента. require_client_id фильтрует по revoked_at IS NULL
--   (см. database/2025-12-24_subscriptions_and_sessions.sql:106), так
--   что после COMMIT любой следующий запрос со старым токеном получит
--   401.
--
-- Apply:
--   ./scripts/db/psql.sh -f database/2026-05-19_revoke_all_client_sessions.sql
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Helper: revoke all active sessions for a client.
--    Возвращает количество отозванных сессий (≥0). Идемпотентна — повторный
--    вызов на уже отозванном клиенте просто вернёт 0.
CREATE OR REPLACE FUNCTION public.revoke_all_client_sessions(p_client_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE public.client_sessions
     SET revoked_at = NOW()
   WHERE client_id = p_client_id
     AND revoked_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.revoke_all_client_sessions(UUID) IS
  'Отзывает все активные client_sessions для клиента (ставит revoked_at = NOW()). Вызывается из admin_set_client_pin при смене PIN, чтобы старые сессии перестали работать.';

GRANT EXECUTE ON FUNCTION public.revoke_all_client_sessions(UUID) TO heys_rpc;
GRANT EXECUTE ON FUNCTION public.revoke_all_client_sessions(UUID) TO heys_admin;

-- 2. admin_set_client_pin — пересоздать с вызовом revoke_all_client_sessions
--    после UPDATE clients.pin_hash.
CREATE OR REPLACE FUNCTION public.admin_set_client_pin(
    p_client_id UUID,
    p_pin TEXT,
    p_curator_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_client RECORD;
    v_revoked INT;
BEGIN
    SELECT id, curator_id INTO v_client FROM public.clients WHERE id = p_client_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'client_not_found');
    END IF;

    IF p_curator_id IS NOT NULL AND v_client.curator_id IS DISTINCT FROM p_curator_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'forbidden');
    END IF;

    IF p_pin IS NULL OR p_pin !~ '^\d{4,6}$' THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_pin_format');
    END IF;

    UPDATE public.clients
    SET pin_hash = crypt(p_pin, gen_salt('bf', 12)),
        pin_salt = NULL,
        pin_failed_attempts = 0,
        pin_locked_until = NULL,
        pin_updated_at = NOW(),
        updated_at = NOW()
    WHERE id = p_client_id;

    -- Выкидываем все активные сессии клиента: если PIN компрометирован,
    -- старый токен больше не должен работать.
    v_revoked := public.revoke_all_client_sessions(p_client_id);

    RETURN jsonb_build_object(
        'success', true,
        'client_id', p_client_id,
        'sessions_revoked', v_revoked
    );
END;
$$;

COMMENT ON FUNCTION public.admin_set_client_pin(UUID, TEXT, UUID) IS
  'Установка PIN клиента (bcrypt cost=12) с отзывом всех активных сессий клиента.';

GRANT EXECUTE ON FUNCTION public.admin_set_client_pin(UUID, TEXT, UUID) TO heys_rpc;
GRANT EXECUTE ON FUNCTION public.admin_set_client_pin(UUID, TEXT, UUID) TO heys_admin;

COMMIT;

-- Verify:
--   ./scripts/db/psql.sh -c "SELECT public.admin_set_client_pin(id, '0000') FROM public.clients LIMIT 1;"
--   should return JSON with sessions_revoked >= 0.
