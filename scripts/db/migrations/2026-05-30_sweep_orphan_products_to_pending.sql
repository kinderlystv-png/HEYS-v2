-- ═══════════════════════════════════════════════════════════════════
-- 🧹 Sweep: orphan overlay products → shared_products_pending
-- Date: 2026-05-30
-- Context:
--   Client-side guard 'No session token' (heys_yandex_api_v1.js:2280 +
--   heys_storage_supabase_v1.js:13494) блокировал submit на модерацию у
--   PIN-клиентов с HttpOnly cookie (PR-C, 2026-05-19+). 2+ недели заявки
--   на новые продукты не уходили на куратор. Продукты живут только локально
--   в heys_products_overlay_v2.
--
-- Цель:
--   Поднять отстающие продукты в shared_products_pending status='pending'.
--   Куратор разберёт пачкой.
--
-- Idempotent: NOT EXISTS-фильтры + server-side dedup в create_pending_product()
--   (2025-12-16_shared_products_pending.sql:87) — повторный запуск безопасен.
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_client RECORD;
  v_prod RECORD;
  v_name_norm TEXT;
  v_inserted INT := 0;
  v_skipped INT := 0;
  v_per_client INT;
BEGIN
  FOR v_client IN
    SELECT c.id, c.name, c.curator_id
    FROM clients c
    JOIN client_kv_store kv ON kv.client_id = c.id AND kv.k = 'heys_products_overlay_v2'
    WHERE jsonb_typeof(kv.v) = 'array'
      AND c.curator_id IS NOT NULL
  LOOP
    v_per_client := 0;
    FOR v_prod IN
      SELECT prod
      FROM client_kv_store kv,
           jsonb_array_elements(kv.v) AS prod
      WHERE kv.client_id = v_client.id
        AND kv.k = 'heys_products_overlay_v2'
        AND prod->>'name' IS NOT NULL
        AND length(trim(prod->>'name')) > 0
    LOOP
      v_name_norm := lower(trim(v_prod.prod->>'name'));

      -- skip: уже в shared_products
      IF EXISTS (SELECT 1 FROM shared_products WHERE lower(trim(name)) = v_name_norm) THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      -- skip: уже в pending у этого клиента (любой статус)
      IF EXISTS (
        SELECT 1 FROM shared_products_pending
        WHERE client_id = v_client.id AND name_norm = v_name_norm
      ) THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      -- Insert через server-side функцию: она делает fingerprint dedup
      -- и резолвит curator_id из clients. fingerprint = name_norm как
      -- server-side fallback (2026-04-27_fix_pending_products_table.sql:92).
      PERFORM create_pending_product(
        v_client.id,
        v_prod.prod,
        v_name_norm,
        v_name_norm
      );
      v_inserted := v_inserted + 1;
      v_per_client := v_per_client + 1;
    END LOOP;
    IF v_per_client > 0 THEN
      RAISE NOTICE 'Client % (%): swept % products', v_client.name, v_client.id, v_per_client;
    END IF;
  END LOOP;

  RAISE NOTICE '═══ SWEEP COMPLETE: inserted=%, skipped=% ═══', v_inserted, v_skipped;
END $$;

-- Quick verification
SELECT
  c.name AS client,
  COUNT(spp.id) AS pending_total,
  COUNT(spp.id) FILTER (WHERE spp.created_at > now() - INTERVAL '5 minutes') AS just_swept
FROM clients c
LEFT JOIN shared_products_pending spp ON spp.client_id = c.id
WHERE c.id IN (
  '4545ee50-4f5f-4fc0-b862-7ca45fa1bafc',
  'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a'
)
GROUP BY c.id, c.name
ORDER BY c.name;
