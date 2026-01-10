-- ═══════════════════════════════════════════════════════════════════
-- 🔐 Пример session-safe RPC функции
-- ═══════════════════════════════════════════════════════════════════
-- Паттерн: client_id ВСЕГДА из сессии, НИКОГДА из параметра

BEGIN;

CREATE OR REPLACE FUNCTION public.get_client_data_by_session(
  p_session_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id UUID;
  v_result JSONB;
BEGIN
  -- 1. Извлечь client_id из сессии (безопасно!)
  v_client_id := public.require_client_id(p_session_token);
  
  -- 2. Получить данные клиента
  SELECT jsonb_build_object(
    'id', c.id,
    'name', c.name,
    'subscription_status', c.subscription_status
  ) INTO v_result
  FROM clients c
  WHERE c.id = v_client_id;
  
  RETURN COALESCE(v_result, '{}'::JSONB);
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- Документация
COMMENT ON FUNCTION public.get_client_data_by_session(TEXT) IS
  '🔐 Session-safe: client_id из сессии, не из параметра. Prevents IDOR.';

-- Права только для runtime user
GRANT EXECUTE ON FUNCTION public.get_client_data_by_session(TEXT) TO heys_rpc;
REVOKE ALL ON FUNCTION public.get_client_data_by_session(TEXT) FROM PUBLIC;

COMMIT;
