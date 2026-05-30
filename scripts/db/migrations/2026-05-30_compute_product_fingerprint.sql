-- ═══════════════════════════════════════════════════════════════════
-- 🔑 Helper: compute_product_fingerprint(jsonb) → text
-- Date: 2026-05-30
-- Context:
--   До этого fingerprint вычислялся только client-side через
--   HEYS.models.computeProductFingerprint (heys_models_v1.js:1036).
--   Bulk-approve path (approve_pending_products_bulk → publish_shared_*
--   _by_curator) не имел способа добыть fingerprint server-side, поэтому
--   падал с 'fingerprint_required' на sweep'нутых orphan-продуктах
--   (incident 2026-05-30: 14 заявок в shared_products_pending без fp в JSONB).
--
-- Принцип: fingerprint — server-derived свойство product_data, не вход.
-- Единая SQL-функция = source of truth. Client может не вычислять.
--
-- Алгоритм (mirror heys_models_v1.js:1036-1078):
--   name = lower(trim(collapse_ws(name)))           -- БЕЗ ё→е
--   nut  = round1(9 нутриентов).join('|')
--   sha256(name || '::' || nut)
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.compute_product_fingerprint(p_product jsonb)
RETURNS text AS $$
DECLARE
  v_name text;
  v_combined text;
BEGIN
  v_name := lower(trim(regexp_replace(coalesce(p_product->>'name',''), '\s+', ' ', 'g')));

  -- JS round1(v) = Math.round(v*10)/10, output via Number.toString → '30' не '30.0'.
  -- SQL round(numeric,1)::text всегда даёт trailing .0 → strip через regex.
  -- Edge: JS Math.round имеет IEEE-754 quirk на 0.15 (даёт 0.1 вместо 0.2 на numeric).
  -- В реальных nutrient values (1 знак) такие inputs не встречаются, parity OK.
  v_combined := v_name || '::' ||
    regexp_replace(round(coalesce((p_product->>'simple100')::numeric,  0), 1)::text, '\.0+$', '') || '|' ||
    regexp_replace(round(coalesce((p_product->>'complex100')::numeric, 0), 1)::text, '\.0+$', '') || '|' ||
    regexp_replace(round(coalesce((p_product->>'protein100')::numeric, 0), 1)::text, '\.0+$', '') || '|' ||
    regexp_replace(round(coalesce((p_product->>'badFat100')::numeric,  0), 1)::text, '\.0+$', '') || '|' ||
    regexp_replace(round(coalesce((p_product->>'goodFat100')::numeric, 0), 1)::text, '\.0+$', '') || '|' ||
    regexp_replace(round(coalesce((p_product->>'trans100')::numeric,   0), 1)::text, '\.0+$', '') || '|' ||
    regexp_replace(round(coalesce((p_product->>'fiber100')::numeric,   0), 1)::text, '\.0+$', '') || '|' ||
    regexp_replace(round(coalesce((p_product->>'gi')::numeric,         0), 1)::text, '\.0+$', '') || '|' ||
    regexp_replace(round(coalesce((p_product->>'harm')::numeric,       0), 1)::text, '\.0+$', '');

  RETURN encode(digest(v_combined, 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION public.compute_product_fingerprint(jsonb) IS
  'Server-side single-source-of-truth для fingerprint продукта. Mirror JS-алгоритма HEYS.models.computeProductFingerprint (heys_models_v1.js). Используется в publish_shared_product_by_curator (auto-derive) и shared_products_pending trigger (invariant колонки fingerprint).';

-- pgcrypto уже доступен (v1.3), GRANT для всех ролей которые могут читать pending/shared
GRANT EXECUTE ON FUNCTION public.compute_product_fingerprint(jsonb) TO heys_rpc;

-- ═══════════════════════════════════════════════════════════════════
-- ✅ Verification: parity с JS-алгоритмом (см. plan file)
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_fp text;
  v_expected text;
BEGIN
  -- Sample 1: торт наполеон
  v_fp := public.compute_product_fingerprint(
    '{"name":"торт наполеон","simple100":30,"protein100":5,"badFat100":12}'::jsonb
  );
  v_expected := 'f909bfb7837471258382993493501908ce06840323d40fda3840968ce9cd998f';
  IF v_fp != v_expected THEN
    RAISE EXCEPTION 'Parity FAIL sample 1: got % expected %', v_fp, v_expected;
  END IF;

  -- Sample 2: тройной пробел в имени
  v_fp := public.compute_product_fingerprint(
    '{"name":"Хлеб   тостовый","protein100":8.7,"fiber100":2.1}'::jsonb
  );
  v_expected := '43389349bed7469d415036239102f62f3f7c1fbe0991d718fb891877a57e2424';
  IF v_fp != v_expected THEN
    RAISE EXCEPTION 'Parity FAIL sample 2: got % expected %', v_fp, v_expected;
  END IF;

  -- Sample 3: kefir 1%
  v_fp := public.compute_product_fingerprint(
    '{"name":"kefir 1%","protein100":3,"simple100":4.1}'::jsonb
  );
  v_expected := '19d511a11cf958036299def4b0781fe66a4a3659f85176c20b7f1a9c3bb32405';
  IF v_fp != v_expected THEN
    RAISE EXCEPTION 'Parity FAIL sample 3: got % expected %', v_fp, v_expected;
  END IF;

  -- Sample 4: пустое имя
  v_fp := public.compute_product_fingerprint('{"name":""}'::jsonb);
  v_expected := '4558d5acd3b9517418fabcce23806ed8cee54ef33fad9829bab819bd9ae89d64';
  IF v_fp != v_expected THEN
    RAISE EXCEPTION 'Parity FAIL sample 4: got % expected %', v_fp, v_expected;
  END IF;

  -- Sample 5: edge-round (0.05 → 0.1, 0.15 → 0.2 или 0.1, 1.25 → 1.3 или 1.2)
  v_fp := public.compute_product_fingerprint(
    '{"name":"edge-round","simple100":0.05,"complex100":0.15,"protein100":1.25}'::jsonb
  );
  v_expected := '98ea22ad075c84ea69b930c60dbaf6683c8c21fb896662fe94a5a5c95be1490e';
  IF v_fp != v_expected THEN
    RAISE EXCEPTION 'Parity FAIL sample 5 (edge-round): got % expected %. JS round1 = Math.round(v*10)/10 (half-away-from-zero); SQL round(numeric,1) тоже half-away-from-zero, но проверь IEEE-754 представление 0.05/0.15/1.25.', v_fp, v_expected;
  END IF;

  RAISE NOTICE '✅ compute_product_fingerprint: все 5 parity-samples сошлись с JS';
END $$;
