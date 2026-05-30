-- ═══════════════════════════════════════════════════════════════════
-- 🔧 RPC: backfill_shared_harm — для миграции harm-score продуктов
-- Date: 2026-05-30
-- Context:
--   Client (backfillSharedHarm в heys_storage_supabase_v1.js) пытался
--   отправить partial payload [{id, harm}] через REST upsert на shared_products.
--   REST endpoint генерирует INSERT...ON CONFLICT DO UPDATE с full-row
--   construction. NOT NULL колонка `name` без DEFAULT приводит к
--   "null value in column name" 500 на каждой загрузке у куратора.
--
--   REST emulator не должен решать partial-payload upserts на таблицах с
--   NOT NULL без default. Dedicated RPC — корректный архитектурный паттерн
--   (как approve_pending_products_bulk, publish_shared_product_by_curator).
--
-- Безопасность: WHERE harm IS NULL — не перезатираем существующие
-- user-curated harm scores при race'ах.
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.backfill_shared_harm(p_updates jsonb)
RETURNS jsonb AS $$
DECLARE
  v_updated int := 0;
  v_total int := 0;
BEGIN
  IF p_updates IS NULL OR jsonb_typeof(p_updates) != 'array' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'p_updates must be jsonb array'
    );
  END IF;

  v_total := jsonb_array_length(p_updates);

  IF v_total = 0 THEN
    RETURN jsonb_build_object('success', true, 'updated', 0, 'total', 0);
  END IF;

  WITH upd AS (
    SELECT
      (elem->>'id')::uuid AS id,
      (elem->>'harm')::numeric AS harm
    FROM jsonb_array_elements(p_updates) AS elem
    WHERE elem->>'id' IS NOT NULL
      AND elem->>'harm' IS NOT NULL
  ),
  result AS (
    UPDATE public.shared_products sp
    SET harm = upd.harm,
        updated_at = NOW()
    FROM upd
    WHERE sp.id = upd.id
      AND sp.harm IS NULL
    RETURNING sp.id
  )
  SELECT count(*) INTO v_updated FROM result;

  RETURN jsonb_build_object(
    'success', true,
    'updated', v_updated,
    'total', v_total
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.backfill_shared_harm(jsonb) IS
  'Безопасный backfill harm-score для shared_products. Принимает массив {id, harm}. Обновляет только rows где harm IS NULL — не перезатирает user-curated значения. Заменил REST upsert который падал с NOT NULL violation на partial payload.';

GRANT EXECUTE ON FUNCTION public.backfill_shared_harm(jsonb) TO heys_rpc;

-- ═══════════════════════════════════════════════════════════════════
-- ✅ Verification
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_test_id uuid;
  v_existing_harm numeric;
  v_result jsonb;
BEGIN
  -- Берём sample row с harm IS NULL (existing — реальный продукт в БД)
  SELECT id INTO v_test_id
  FROM public.shared_products
  WHERE harm IS NULL
  LIMIT 1;

  IF v_test_id IS NULL THEN
    RAISE NOTICE 'Нет shared_products с harm IS NULL — skip smoke test';
    RETURN;
  END IF;

  -- Smoke: backfill этого id с harm = 5.0
  v_result := public.backfill_shared_harm(
    jsonb_build_array(jsonb_build_object('id', v_test_id, 'harm', 5.0))
  );

  IF (v_result->>'updated')::int != 1 THEN
    RAISE EXCEPTION 'Smoke fail: expected updated=1, got %', v_result;
  END IF;

  -- Verify: harm обновился
  SELECT harm INTO v_existing_harm FROM public.shared_products WHERE id = v_test_id;
  IF v_existing_harm != 5.0 THEN
    RAISE EXCEPTION 'Smoke fail: harm не обновился, sp.harm=%', v_existing_harm;
  END IF;

  -- Verify safety: повторный backfill этого же id с другим значением — НЕ должен перезаписать
  v_result := public.backfill_shared_harm(
    jsonb_build_array(jsonb_build_object('id', v_test_id, 'harm', 9.9))
  );
  IF (v_result->>'updated')::int != 0 THEN
    RAISE EXCEPTION 'Safety fail: повторный backfill перезаписал curated harm. result=%', v_result;
  END IF;

  SELECT harm INTO v_existing_harm FROM public.shared_products WHERE id = v_test_id;
  IF v_existing_harm != 5.0 THEN
    RAISE EXCEPTION 'Safety fail: harm стал %, ожидалось 5.0 (no overwrite)', v_existing_harm;
  END IF;

  RAISE NOTICE '✅ backfill_shared_harm: smoke + safety ok. test_id=%, harm=5.0 (повторный 9.9 проигнорирован)', v_test_id;
END $$;
