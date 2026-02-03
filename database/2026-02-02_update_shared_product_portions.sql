-- ═══════════════════════════════════════════════════════════════════
-- 🍽️ HEYS: RPC функция для обновления порций shared_products
-- Created: 2026-02-02
-- Purpose: Обновление порций продукта куратором (direct UPDATE, not INSERT)
-- Причина: POST upsert с partial data fails NOT NULL constraint
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.update_shared_product_portions(
  p_session_token TEXT,
  p_product_id UUID,
  p_portions JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id UUID;
  v_user_id UUID;
  v_product_exists BOOLEAN;
  v_updated_at TIMESTAMPTZ;
BEGIN
  -- 1. Получаем client_id из session_token
  v_client_id := public.require_client_id(p_session_token);
  
  -- 2. Проверяем: это куратор? (у куратора есть user_id)
  SELECT user_id INTO v_user_id
  FROM clients
  WHERE id = v_client_id;
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'only_curators_can_update',
      'message', 'Только кураторы могут обновлять продукты в общей базе.'
    );
  END IF;
  
  -- 3. Проверяем: продукт существует?
  SELECT EXISTS(SELECT 1 FROM shared_products WHERE id = p_product_id)
  INTO v_product_exists;
  
  IF NOT v_product_exists THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'product_not_found',
      'message', 'Продукт не найден в базе'
    );
  END IF;
  
  -- 4. Обновляем только portions (direct UPDATE, not INSERT ON CONFLICT)
  UPDATE shared_products
  SET portions = p_portions,
      updated_at = NOW()
  WHERE id = p_product_id
  RETURNING updated_at INTO v_updated_at;
  
  -- 5. Возвращаем успех
  RETURN jsonb_build_object(
    'success', true,
    'status', 'updated',
    'id', p_product_id,
    'portions', p_portions,
    'updated_at', v_updated_at,
    'message', 'Порции успешно обновлены'
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', 'database_error',
    'message', SQLERRM
  );
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- 🔐 REVOKE от PUBLIC, GRANT только для heys_rpc
-- ═══════════════════════════════════════════════════════════════════

REVOKE ALL ON FUNCTION public.update_shared_product_portions(TEXT, UUID, JSONB) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'heys_rpc') THEN
    GRANT EXECUTE ON FUNCTION public.update_shared_product_portions(TEXT, UUID, JSONB) TO heys_rpc;
    RAISE NOTICE '✅ GRANT EXECUTE to heys_rpc';
  ELSE
    RAISE NOTICE '⚠️ Role heys_rpc does not exist yet';
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- 📋 Комментарий
-- ═══════════════════════════════════════════════════════════════════

COMMENT ON FUNCTION public.update_shared_product_portions(TEXT, UUID, JSONB) IS
'Обновление порций продукта в shared_products.
Использует direct UPDATE (не INSERT ON CONFLICT) чтобы избежать NOT NULL constraint violations.
Только для кураторов (проверка через session token → client.user_id).';

-- ═══════════════════════════════════════════════════════════════════
-- ✅ Проверка создания
-- ═══════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.proname = 'update_shared_product_portions'
  ) THEN
    RAISE NOTICE '✅ update_shared_product_portions created successfully';
  ELSE
    RAISE WARNING '❌ update_shared_product_portions NOT FOUND!';
  END IF;
END $$;
