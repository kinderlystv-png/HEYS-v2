-- Сброс Telegram-привязки клиента, если персональную ссылку случайно открыл
-- не клиент. pin_token не меняем: после сброса клиент может открыть ту же ссылку
-- и claim_pin_token_chat запишет уже его telegram_chat_id.

CREATE OR REPLACE FUNCTION public.admin_clear_telegram_binding(
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

    UPDATE public.clients
       SET telegram_chat_id = NULL,
           drip_sent_stages = '[]'::jsonb,
           updated_at = NOW()
     WHERE id = p_client_id;

    RETURN jsonb_build_object(
        'success', true,
        'client_id', p_client_id,
        'cleared', v_client.telegram_chat_id IS NOT NULL
    );
END;
$$;

COMMENT ON FUNCTION public.admin_clear_telegram_binding(UUID, UUID) IS
  'Кураторский сброс clients.telegram_chat_id без перевыпуска PIN/pin_token; drip stages очищаются для корректного повторного Telegram-claim.';

GRANT EXECUTE ON FUNCTION public.admin_clear_telegram_binding(UUID, UUID) TO heys_rpc;
GRANT EXECUTE ON FUNCTION public.admin_clear_telegram_binding(UUID, UUID) TO heys_admin;
