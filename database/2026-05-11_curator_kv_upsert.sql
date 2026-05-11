-- ═══════════════════════════════════════════════════════════════════
-- 🚀 Curator KV upsert via warm heys-api-rpc (instead of heys-api-rest)
-- ═══════════════════════════════════════════════════════════════════
-- Проблема: куратор пишет данные через REST → отдельная cloud function
-- heys-api-rest, которая холодная и редко используется → cold start
-- 3-7s на каждую запись → синк фоновых задач медленный и нестабильный.
--
-- Решение: новая RPC-функция batch_upsert_client_kv_by_curator, которую
-- куратор вызывает через горячий heys-api-rpc (где идёт весь остальной
-- трафик авторизаций, продуктов, аналитики). Производительность сравнима
-- с PIN-клиентским путём batch_upsert_client_kv_by_session.
--
-- Безопасность: SECURITY DEFINER + явная проверка ownership
-- (clients.curator_id = p_curator_id). Та же семантика что
-- handleGetClientKv в heys-api-auth: "SELECT 1 FROM clients WHERE
-- id = $client_id AND curator_id = $curator_id". Без этой проверки
-- куратор мог бы писать в данные любого клиента через известный UUID.
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.batch_upsert_client_kv_by_curator(
  p_curator_id UUID,    -- из JWT, проставляется RPC handler'ом
  p_client_id UUID,     -- target клиент
  p_items JSONB         -- [{k: "key1", v: {...}}, ...]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owns BOOLEAN;
  v_item JSONB;
  v_key TEXT;
  v_value JSONB;
  v_saved INT := 0;
BEGIN
  -- 1) Проверка что куратор владеет этим клиентом.
  --    Та же семантика что handleGetClientKv в heys-api-auth.
  SELECT EXISTS (
    SELECT 1 FROM public.clients
    WHERE id = p_client_id AND curator_id = p_curator_id
  ) INTO v_owns;

  IF NOT v_owns THEN
    RETURN jsonb_build_object(
      'success', false,
      'saved', 0,
      'error', 'curator_does_not_own_client'
    );
  END IF;

  -- 2) Итерируем items и делаем upsert (тот же паттерн что и by_session)
  FOR v_item IN SELECT jsonb_array_elements(p_items)
  LOOP
    v_key := v_item->>'k';
    v_value := v_item->'v';

    IF v_key IS NOT NULL THEN
      INSERT INTO client_kv_store (client_id, k, v, updated_at)
      VALUES (p_client_id, v_key, v_value, NOW())
      ON CONFLICT (client_id, k) DO UPDATE SET
        v = EXCLUDED.v,
        updated_at = NOW();

      v_saved := v_saved + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'saved', v_saved
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'saved', v_saved,
      'error', SQLERRM
    );
END;
$$;

COMMENT ON FUNCTION public.batch_upsert_client_kv_by_curator(UUID, UUID, JSONB) IS
  'Curator pack-write to client_kv_store. Validates curator ownership of target client. Route via heys-api-rpc for warm-path latency parity with PIN-client path.';

-- Права: только runtime-роль heys_rpc может вызывать
REVOKE ALL ON FUNCTION public.batch_upsert_client_kv_by_curator(UUID, UUID, JSONB) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'heys_rpc') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.batch_upsert_client_kv_by_curator(UUID, UUID, JSONB) TO heys_rpc';
    RAISE NOTICE 'Granted EXECUTE to heys_rpc';
  ELSE
    RAISE NOTICE 'Role heys_rpc not found, skipping grant';
  END IF;
END $$;

COMMIT;
