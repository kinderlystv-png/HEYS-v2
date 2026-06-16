-- Перевыпуск PIN/link должен быть полноценным восстановлением доступа:
-- 1) новый PIN + новый pin_token,
-- 2) старые PIN-сессии отзываются,
-- 3) Telegram-привязка очищается, чтобы новый link мог claim'ить правильный клиент.

CREATE OR REPLACE FUNCTION public.admin_regenerate_pin(
    p_client_id UUID,
    p_curator_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_client RECORD;
    v_pin TEXT;
    v_pin_hash TEXT;
    v_pin_token UUID := gen_random_uuid();
    v_pin_token_expires TIMESTAMPTZ := NOW() + INTERVAL '7 days';
    v_revoked INT := 0;
BEGIN
    SELECT id, curator_id, telegram_chat_id
      INTO v_client
      FROM public.clients
     WHERE id = p_client_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'client_not_found');
    END IF;

    IF p_curator_id IS NOT NULL AND v_client.curator_id IS DISTINCT FROM p_curator_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'forbidden');
    END IF;

    v_pin := LPAD((floor(random() * 9000)::INT + 1000)::TEXT, 4, '0');
    v_pin_hash := crypt(v_pin, gen_salt('bf', 12));

    UPDATE public.clients
       SET pin_hash = v_pin_hash,
           pin_token = v_pin_token,
           pin_token_expires_at = v_pin_token_expires,
           telegram_chat_id = NULL,
           drip_sent_stages = '[]'::jsonb,
           pin_failed_attempts = 0,
           pin_locked_until = NULL,
           pin_updated_at = NOW(),
           updated_at = NOW()
     WHERE id = p_client_id;

    v_revoked := public.revoke_all_client_sessions(p_client_id);

    RETURN jsonb_build_object(
        'success', true,
        'client_id', p_client_id,
        'pin', v_pin,
        'pin_token', v_pin_token,
        'pin_token_expires_at', v_pin_token_expires,
        'sessions_revoked', v_revoked,
        'telegram_binding_cleared', v_client.telegram_chat_id IS NOT NULL
    );
END;
$$;

COMMENT ON FUNCTION public.admin_regenerate_pin(UUID, UUID) IS
  'Перевыпуск PIN и pin_token: отзывает client sessions, очищает Telegram-привязку и drip stages для повторного claim.';

GRANT EXECUTE ON FUNCTION public.admin_regenerate_pin(UUID, UUID) TO heys_rpc;
GRANT EXECUTE ON FUNCTION public.admin_regenerate_pin(UUID, UUID) TO heys_admin;
