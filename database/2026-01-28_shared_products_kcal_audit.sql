-- ═══════════════════════════════════════════════════════════════════
-- 🧪 HEYS: SQL-аудит kcal100 для shared_products
-- Created: 2026-01-28
-- Purpose: добавить legacy колонку и view для сравнения kcal100 vs формулы
-- ⚠️ Не меняет рабочую логику приложения (UI считает kcal через computeDerived())
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

-- 1) Legacy-колонка для аудита (опционально, не используется UI)
ALTER TABLE shared_products
  ADD COLUMN IF NOT EXISTS kcal100_legacy NUMERIC;

COMMENT ON COLUMN shared_products.kcal100_legacy IS
  'Legacy kcal100 snapshot for audit (UI ignores, computeDerived is SoT)';

-- 2) View для сравнения и diff по формуле (без изменения данных)
CREATE OR REPLACE VIEW shared_products_kcal_audit AS
SELECT
  id,
  name,
  protein100,
  simple100,
  complex100,
  badfat100,
  goodfat100,
  trans100,
  kcal100_legacy,
  (protein100 * 3 + (simple100 + complex100) * 4 + (badfat100 + goodfat100 + trans100) * 9) AS kcal_computed,
  CASE
    WHEN kcal100_legacy IS NULL THEN NULL
    ELSE kcal100_legacy - (protein100 * 3 + (simple100 + complex100) * 4 + (badfat100 + goodfat100 + trans100) * 9)
  END AS diff
FROM shared_products;

COMMENT ON VIEW shared_products_kcal_audit IS
  'Audit view: kcal100_legacy vs TEF-aware computed kcal (protein*3 + carbs*4 + fat*9)';

COMMIT;
