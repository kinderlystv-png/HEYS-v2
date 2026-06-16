-- Защита Telegram-привязки от тихого перезаписывания.
-- Та же ссылка остаётся рабочей для уже привязанного чата, но другой chat_id
-- не может забрать клиента без явного admin_clear_telegram_binding().

CREATE OR REPLACE FUNCTION public.claim_pin_token_chat(
    p_pin_token UUID,
    p_chat_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_client RECORD;
BEGIN
    SELECT id, name, pin_hash, pin_token_expires_at, telegram_chat_id, subscription_status
      INTO v_client
      FROM public.clients
     WHERE pin_token = p_pin_token
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_token');
    END IF;

    IF v_client.pin_token_expires_at IS NOT NULL
       AND v_client.pin_token_expires_at < NOW() THEN
        RETURN jsonb_build_object('success', false, 'error', 'token_expired');
    END IF;

    IF v_client.telegram_chat_id IS NOT NULL
       AND v_client.telegram_chat_id IS DISTINCT FROM p_chat_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_token');
    END IF;

    UPDATE public.clients
       SET telegram_chat_id = p_chat_id,
           updated_at = NOW()
     WHERE id = v_client.id;

    RETURN jsonb_build_object(
        'success', true,
        'client_id', v_client.id,
        'name', v_client.name,
        'subscription_status', v_client.subscription_status
    );
END;
$$;

COMMENT ON FUNCTION public.claim_pin_token_chat(UUID, BIGINT) IS
  'Telegram-бот вызывает при /start <token>: связывает chat_id с клиентом; смена уже привязанного chat_id требует admin_clear_telegram_binding.';

GRANT EXECUTE ON FUNCTION public.claim_pin_token_chat(UUID, BIGINT) TO heys_rpc;
