-- Curator-only lookup for the existing Telegram client deep link.
-- The pin_token is not exposed in client lists; it is returned only for one
-- explicitly requested client after ownership validation.

CREATE OR REPLACE FUNCTION public.admin_get_client_access_link(
    p_client_id UUID,
    p_curator_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_client RECORD;
    v_bot_username TEXT := COALESCE(NULLIF(current_setting('app.client_bot_username', true), ''), 'heyslab_bot');
BEGIN
    SELECT id, curator_id, pin_token, pin_token_expires_at
      INTO v_client
      FROM public.clients
     WHERE id = p_client_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'client_not_found');
    END IF;

    IF p_curator_id IS NULL OR v_client.curator_id IS DISTINCT FROM p_curator_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'forbidden');
    END IF;

    IF v_client.pin_token IS NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'client_id', p_client_id,
            'link_available', false,
            'reason', 'token_missing',
            'message', 'Telegram-ссылки нет. Перевыпустите PIN и ссылку.'
        );
    END IF;

    IF v_client.pin_token_expires_at IS NOT NULL AND v_client.pin_token_expires_at < NOW() THEN
        RETURN jsonb_build_object(
            'success', true,
            'client_id', p_client_id,
            'link_available', false,
            'reason', 'token_expired',
            'pin_token_expires_at', v_client.pin_token_expires_at,
            'message', 'Telegram-ссылка истекла. Перевыпустите PIN и ссылку.'
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'client_id', p_client_id,
        'link_available', true,
        'pin_token', v_client.pin_token,
        'pin_token_expires_at', v_client.pin_token_expires_at,
        'deep_link', 'https://t.me/' || v_bot_username || '?start=' || v_client.pin_token::text
    );
END;
$$;

COMMENT ON FUNCTION public.admin_get_client_access_link(UUID, UUID) IS
  'Curator-only lookup for the current non-expired Telegram pin_token/deep link for one owned client.';

REVOKE ALL ON FUNCTION public.admin_get_client_access_link(UUID, UUID) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.admin_get_client_access_link(UUID, UUID) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION public.admin_get_client_access_link(UUID, UUID) FROM authenticated;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_client_access_link(UUID, UUID) TO heys_rpc;
GRANT EXECUTE ON FUNCTION public.admin_get_client_access_link(UUID, UUID) TO heys_admin;
