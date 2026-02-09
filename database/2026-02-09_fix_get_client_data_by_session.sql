-- ═══════════════════════════════════════════════════════════════════════════════
-- FIX: get_client_data_by_session — remove non-existent clients.created_at
-- ═══════════════════════════════════════════════════════════════════════════════
-- 
-- ISSUE: get_client_data_by_session references c.created_at which doesn't exist
--        in the clients table. Only updated_at exists.
-- 
-- FIX: Remove 'created_at' field from jsonb_build_object
-- 
-- Created: 2026-02-09
-- ═══════════════════════════════════════════════════════════════════════════════

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
  v_data JSONB;
BEGIN
  -- Валидация сессии и получение client_id
  v_client_id := public.require_client_id(p_session_token);
  
  -- Получаем данные клиента (БЕЗ несуществующего created_at)
  SELECT jsonb_build_object(
    'id', c.id,
    'name', c.name,
    'phone', c.phone,
    'curator_id', c.curator_id,
    'subscription_status', c.subscription_status,
    'subscription_plan', c.subscription_plan,
    'trial_ends_at', c.trial_ends_at,
    'updated_at', c.updated_at
  )
  INTO v_data
  FROM public.clients c
  WHERE c.id = v_client_id;

  IF v_data IS NULL THEN
    RAISE EXCEPTION 'client_not_found';
  END IF;

  RETURN v_data;
END;
$$;

COMMENT ON FUNCTION public.get_client_data_by_session(TEXT) IS 
'Fixed v2: Removed non-existent created_at field from clients table reference.';

COMMIT;

-- Вывод статуса
DO $$
BEGIN
  RAISE NOTICE '✅ get_client_data_by_session fixed — removed clients.created_at reference';
END;
$$;
