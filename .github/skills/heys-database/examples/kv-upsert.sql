-- ═══════════════════════════════════════════════════════════════════
-- 🗄️ Пример KV upsert с проверкой подписки
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.upsert_client_kv_by_session(
  p_session_token TEXT,
  p_key TEXT,
  p_value JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id UUID;
BEGIN
  -- 1. Client ID из сессии
  v_client_id := public.require_client_id(p_session_token);
  
  -- 2. Проверка права на запись (подписка активна?)
  IF NOT public.subscription_can_write(v_client_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'subscription_required'
    );
  END IF;
  
  -- 3. Upsert (ON CONFLICT по PK)
  INSERT INTO client_kv_store (client_id, k, v, updated_at)
  VALUES (v_client_id, p_key, p_value, NOW())
  ON CONFLICT (client_id, k) DO UPDATE SET
    v = EXCLUDED.v,
    updated_at = NOW();
  
  RETURN jsonb_build_object('success', true, 'key', p_key);
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

COMMIT;
