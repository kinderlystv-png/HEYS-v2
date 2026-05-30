-- ═══════════════════════════════════════════════════════════════════
-- 🚀 Bulk approve для куратора: одна RPC одобряет массив pending products
-- Date: 2026-05-30
-- Context:
--   До этого фикса curator UI делал sequential approve по одному:
--   на каждую заявку 2 round-trip (publish_shared_product_by_curator RPC
--   + REST PATCH shared_products_pending). 30 заявок ≈ 60-90 секунд,
--   UI зависает (incident 2026-05-30 после массового sweep'а 30 продуктов).
--
-- Цель:
--   Атомарно (per-row try/catch) обработать массив pending ids одним RPC
--   round-trip ~500ms на 30 заявок.
--
-- Переиспользует existing publish_shared_product_by_curator (2026-01-18)
-- — не дублируем 53-колоночный INSERT, не разъезжаемся с individual approve.
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.approve_pending_products_bulk(
  p_curator_id uuid,
  p_pending_ids uuid[]
) RETURNS jsonb AS $$
DECLARE
  v_pending RECORD;
  v_published JSONB;
  v_publish_status TEXT;
  v_approved INT := 0;
  v_existing INT := 0;
  v_already_moderated INT := 0;
  v_failed INT := 0;
  v_errors JSONB := '[]'::jsonb;
  v_updated_rows INT;
BEGIN
  IF p_curator_id IS NULL THEN
    RAISE EXCEPTION 'p_curator_id is required';
  END IF;
  IF p_pending_ids IS NULL OR array_length(p_pending_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('success', true, 'approved', 0, 'existing', 0,
      'failed', 0, 'already_moderated', 0, 'errors', '[]'::jsonb);
  END IF;

  -- Ownership check выполняется через WHERE curator_id = p_curator_id —
  -- pending'и других кураторов просто не попадут в выборку.
  FOR v_pending IN
    SELECT id, product_data
    FROM public.shared_products_pending
    WHERE id = ANY(p_pending_ids)
      AND status = 'pending'
      AND curator_id = p_curator_id
  LOOP
    BEGIN
      -- 1. Publish в shared через existing функцию (53-колоночный INSERT
      --    + fingerprint dedup внутри). Не падает на duplicate — возвращает
      --    status='exists'.
      v_published := public.publish_shared_product_by_curator(
        p_curator_id,
        v_pending.product_data
      );
      v_publish_status := v_published->>'status';

      IF (v_published->>'success')::boolean = true
         OR v_publish_status = 'exists'
         OR v_publish_status = 'published'
      THEN
        -- 2. Mark pending as approved (race-safe: только если ещё pending).
        UPDATE public.shared_products_pending
        SET status = 'approved',
            moderated_at = now(),
            moderated_by = p_curator_id
        WHERE id = v_pending.id AND status = 'pending';
        GET DIAGNOSTICS v_updated_rows = ROW_COUNT;

        IF v_updated_rows = 0 THEN
          -- Race: другой курaтор уже обработал между SELECT и UPDATE.
          v_already_moderated := v_already_moderated + 1;
        ELSIF v_publish_status = 'exists' THEN
          v_existing := v_existing + 1;
        ELSE
          v_approved := v_approved + 1;
        END IF;
      ELSE
        v_failed := v_failed + 1;
        v_errors := v_errors || jsonb_build_object(
          'id', v_pending.id,
          'error', COALESCE(v_published->>'error', v_published->>'message', 'publish failed')
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      v_errors := v_errors || jsonb_build_object(
        'id', v_pending.id,
        'error', SQLERRM
      );
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'approved', v_approved,
    'existing', v_existing,
    'already_moderated', v_already_moderated,
    'failed', v_failed,
    'errors', v_errors,
    'total', array_length(p_pending_ids, 1)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.approve_pending_products_bulk IS 'Bulk approve массива pending product ids. Атомарно per-row через EXCEPTION block (один failed не блокирует остальные). Переиспользует publish_shared_product_by_curator.';

-- Yandex PG: cloud function вызывает RPC через role heys_rpc.
-- Применили GRANT к ней — то же самое как у publish_shared_product_by_curator.
GRANT EXECUTE ON FUNCTION public.approve_pending_products_bulk(uuid, uuid[]) TO heys_rpc;

-- ═══════════════════════════════════════════════════════════════════
-- ✅ Verification
-- ═══════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'approve_pending_products_bulk') THEN
    RAISE NOTICE '✅ Функция approve_pending_products_bulk создана';
  ELSE
    RAISE EXCEPTION 'Функция не создалась';
  END IF;
END $$;
