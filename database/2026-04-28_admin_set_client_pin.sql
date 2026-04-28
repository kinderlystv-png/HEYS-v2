-- =====================================================
-- Migration: admin_set_client_pin — bcrypt PIN setter (Phase 1 hotfix)
-- Date: 2026-04-28
-- Purpose:
--   Старая RPC reset_client_pin принимала готовый p_pin_hash, который фронт
--   считал в SHA256. verify_client_pin_v3 использует bcrypt — клиент после
--   смены PIN не мог войти.
--
--   Новая RPC принимает plain PIN, хеширует bcrypt на стороне БД через
--   pgcrypto crypt(pin, gen_salt('bf')). Полностью совместима с
--   verify_client_pin_v3.
-- =====================================================

CREATE OR REPLACE FUNCTION admin_set_client_pin(
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
BEGIN
    SELECT id, curator_id INTO v_client FROM clients WHERE id = p_client_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'client_not_found');
    END IF;

    -- Если передан p_curator_id — проверяем что клиент именно его
    IF p_curator_id IS NOT NULL AND v_client.curator_id IS DISTINCT FROM p_curator_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'forbidden');
    END IF;

    -- Валидация: 4-6 цифр
    IF p_pin IS NULL OR p_pin !~ '^\d{4,6}$' THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_pin_format');
    END IF;

    UPDATE clients
    SET pin_hash = crypt(p_pin, gen_salt('bf')),
        pin_salt = NULL,
        pin_failed_attempts = 0,
        pin_locked_until = NULL,
        pin_updated_at = NOW(),
        updated_at = NOW()
    WHERE id = p_client_id;

    RETURN jsonb_build_object('success', true, 'client_id', p_client_id);
END;
$$;

COMMENT ON FUNCTION admin_set_client_pin(UUID, TEXT, UUID) IS
  'Установка PIN клиента с bcrypt-хэшированием на стороне БД (совместимо с verify_client_pin_v3).';

GRANT EXECUTE ON FUNCTION admin_set_client_pin(UUID, TEXT, UUID) TO heys_rpc;
GRANT EXECUTE ON FUNCTION admin_set_client_pin(UUID, TEXT, UUID) TO heys_admin;
