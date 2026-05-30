-- ═══════════════════════════════════════════════════════════════════
-- 🔒 shared_products_pending: invariant на колонку fingerprint
-- Date: 2026-05-30
-- Context:
--   Колонка shared_products_pending.fingerprint поддерживалась ad-hoc.
--   Sweep migration пишет туда name_norm как fallback
--   (2026-05-30_sweep_orphan_products_to_pending.sql:65-70), что ломает
--   будущие dedup-запросы по fingerprint.
--
--   Сейчас, когда compute_product_fingerprint существует, можно ввести
--   invariant: колонка всегда содержит настоящий SHA-256 hash от product_data.
--   Делается через BEFORE INSERT/UPDATE trigger — sweep'ы и create_pending_product
--   могут передавать что угодно, trigger перепишет.
--
-- Бонус: backfill 14 sweep'нутых rows одной UPDATE (тригаер выполнит обновление
-- колонки автоматически + добавит fingerprint в JSONB через UPDATE того же row).
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.shared_products_pending_set_fingerprint()
RETURNS trigger AS $$
DECLARE
  v_computed text;
BEGIN
  -- Считаем authoritative fingerprint из product_data
  v_computed := public.compute_product_fingerprint(NEW.product_data);

  -- Перезаписываем колонку если она пустая, NULL, или содержит legacy
  -- sweep fallback (name_norm). Не трогаем если callere передал валидный
  -- fingerprint (e.g. client-precomputed) И он совпадает с server-computed —
  -- но проще: всегда нормализуем колонку под server-truth.
  NEW.fingerprint := v_computed;

  -- Также гарантируем что в JSONB есть поле fingerprint (для bulk approve
  -- через publish_shared_product_by_curator — он COALESCE'ит из JSONB
  -- сначала, потом считает; если уже есть — пропускает compute).
  IF NEW.product_data IS NOT NULL
     AND COALESCE(NEW.product_data->>'fingerprint', '') = ''
  THEN
    NEW.product_data := NEW.product_data || jsonb_build_object('fingerprint', v_computed);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS shared_products_pending_set_fingerprint_trg ON public.shared_products_pending;
CREATE TRIGGER shared_products_pending_set_fingerprint_trg
  BEFORE INSERT OR UPDATE OF product_data, fingerprint
  ON public.shared_products_pending
  FOR EACH ROW
  EXECUTE FUNCTION public.shared_products_pending_set_fingerprint();

COMMENT ON FUNCTION public.shared_products_pending_set_fingerprint() IS
  'Invariant trigger: shared_products_pending.fingerprint = compute_product_fingerprint(product_data). Защищает от sweep-fallback (name_norm как fingerprint, 2026-05-30 incident).';

-- ═══════════════════════════════════════════════════════════════════
-- 🔧 Backfill: остальные pending rows у которых fingerprint = name_norm
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_before int;
  v_after int;
BEGIN
  SELECT count(*) INTO v_before
  FROM public.shared_products_pending
  WHERE status = 'pending'
    AND fingerprint = name_norm;

  -- Touch product_data чтобы триггер сработал. Используем jsonb_set с
  -- идентичным значением — это NOOP по содержимому, но триггер выполнится.
  -- В alternative можно просто UPDATE ... SET fingerprint = NULL → trigger
  -- перепишет. Trigger срабатывает на UPDATE OF product_data, fingerprint —
  -- любая запись в эти колонки активирует.
  UPDATE public.shared_products_pending
  SET fingerprint = NULL  -- триггер перезапишет authoritative значением
  WHERE status = 'pending'
    AND fingerprint = name_norm;

  SELECT count(*) INTO v_after
  FROM public.shared_products_pending
  WHERE status = 'pending'
    AND fingerprint = name_norm;

  RAISE NOTICE '✅ Backfill: было % строк с fingerprint=name_norm, осталось %', v_before, v_after;
  IF v_after > 0 THEN
    RAISE EXCEPTION 'Backfill не сработал — % строк не обновились', v_after;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- ✅ Verification: триггер существует, новая INSERT/UPDATE обновляет колонку
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_trg_exists boolean;
  v_sample_fp text;
  v_sample_jsonb_fp text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'shared_products_pending_set_fingerprint_trg'
  ) INTO v_trg_exists;

  IF NOT v_trg_exists THEN
    RAISE EXCEPTION 'Trigger не создан';
  END IF;

  -- Проверка: после backfill в одной строке колонка = compute(product_data)
  SELECT fingerprint, product_data->>'fingerprint'
  INTO v_sample_fp, v_sample_jsonb_fp
  FROM public.shared_products_pending
  WHERE status = 'pending'
  LIMIT 1;

  IF v_sample_fp IS NULL THEN
    RAISE NOTICE 'Нет pending для проверки sample';
  ELSE
    IF length(v_sample_fp) != 64 THEN
      RAISE EXCEPTION 'Sample fingerprint не SHA-256 hex: % (len %)', v_sample_fp, length(v_sample_fp);
    END IF;
    IF v_sample_jsonb_fp IS DISTINCT FROM v_sample_fp THEN
      RAISE EXCEPTION 'Sample JSONB.fingerprint (%) ≠ column.fingerprint (%)', v_sample_jsonb_fp, v_sample_fp;
    END IF;
    RAISE NOTICE '✅ Sample row: fingerprint=%... (column == JSONB)', substring(v_sample_fp, 1, 16);
  END IF;
END $$;
