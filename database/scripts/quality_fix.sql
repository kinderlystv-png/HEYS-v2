-- ═══════════════════════════════════════════════════════════════
-- Quality Fix: Дозаполнение пропущенных качественных флагов
-- Дата: 2026-02-12
-- Найдено 3 продукта с NULL в is_fermented или is_whole_grain
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- 1️⃣ Брускетта из вяленых томатов и оливок (отсутствует is_whole_grain)
UPDATE shared_products SET
  is_whole_grain = false          -- рафинированный хлеб (багет/чиабатта)
WHERE id = '394d18d7-175f-4bd8-b509-3cfb99bf78a4';

SELECT '✅ 1. Брускетта - дозаполнена is_whole_grain = false' AS status;

-- 2️⃣ Печенье на сиропе топинамбура с кунжутом (отсутствует is_whole_grain)
UPDATE shared_products SET
  is_whole_grain = false          -- печенье обычно из рафинированной муки
WHERE id = '6438a880-5adf-4cb3-b847-77dd8ecf2fd3';

SELECT '✅ 2. Печенье топинамбур - дозаполнена is_whole_grain = false' AS status;

-- 3️⃣ KPD (отсутствуют is_fermented и is_whole_grain)
UPDATE shared_products SET
  is_fermented = NULL,            -- неизвестный состав, оставляем NULL
  is_whole_grain = NULL           -- неизвестный состав, оставляем NULL
WHERE id = 'aef6798d-293e-4237-985c-094c75eb3e43';

SELECT '✅ 3. KPD - флаги оставлены NULL (неизвестный состав)' AS status;

COMMIT;

-- ═══════════════════════════════════════════════════════════════
-- Итоги дозаполнения:
-- • Брускетта: is_whole_grain = false (хлеб рафинированный)
-- • Печенье топинамбур: is_whole_grain = false (мука рафинированная)
-- • KPD: оставлены NULL (продукт неизвестного состава)
--
-- После дозаполнения:
-- • is_fermented NULL: 1 продукт (KPD - допустимо)
-- • is_whole_grain NULL: 1 продукт (KPD - допустимо)
-- ═══════════════════════════════════════════════════════════════
