-- =============================================================================
-- HEYS v2 — Product Update Template
-- Шаблон для обновления параметров продукта из USDA данных
-- Дата: 2026-02-11
-- =============================================================================

-- ВАЖНО: перед UPDATE проверить, что значения корректны через SELECT

-- 1. Пример UPDATE для одного продукта (Куриная грудка)
UPDATE shared_products
SET
  -- Макронутриенты (обычно уже есть, но можем скорректировать)
  protein100 = 31.0,      -- г/100г
  simple100 = 0,          -- г/100г (простые углеводы)
  complex100 = 0,         -- г/100г (сложные углеводы)
  "badFat100" = 1.0,      -- г/100г (насыщенные жиры)
  "goodFat100" = 2.5,     -- г/100г (ненасыщенные жиры)
  trans100 = 0,           -- г/100г (трансжиры)
  fiber100 = 0,           -- г/100г (клетчатка)
  
  -- Extended nutrients
  sodium100 = 74,         -- мг/100г
  omega3_100 = 0.03,      -- г/100г  
  omega6_100 = 0.2,       -- г/100г
  cholesterol100 = 85,    -- мг/100г
  
  -- Minerals (% DV per 100g)
  iron = 5,               -- 5% DV
  magnesium = 7,          -- 7% DV
  zinc = 10,              -- 10% DV
  calcium = 1,            -- 1% DV
  potassium = 8,          -- 8% DV
  selenium = 40,          -- 40% DV
  iodine = 2,             -- 2% DV
  
  -- Vitamins (% DV per 100g)
  vitamin_a = 0,          -- 0% DV
  vitamin_b1 = 10,        -- 10% DV (тиамин)
  vitamin_b2 = 15,        -- 15% DV (рибофлавин)
  vitamin_b3 = 70,        -- 70% DV (ниацин)
  vitamin_b6 = 30,        -- 30% DV
  vitamin_b9 = 2,         -- 2% DV (фолиевая кислота)
  vitamin_b12 = 5,        -- 5% DV
  vitamin_c = 0,          -- 0% DV
  vitamin_d = 1,          -- 1% DV
  vitamin_e = 2,          -- 2% DV
  vitamin_k = 0,          -- 0% DV
  
  -- Quality flags
  nova_group = 1,         -- 1 = unprocessed/minimally processed
  is_fermented = false,
  is_raw = false,
  is_organic = false,
  is_whole_grain = false,
  
  updated_at = NOW()
WHERE id = 'PRODUCT_ID_HERE';  -- ⚠️ ЗАМЕНИТЬ на реальный ID


-- 2. Пример для жирной рыбы (Лосось)
UPDATE shared_products
SET
  protein100 = 20.0,
  simple100 = 0,
  complex100 = 0,
  "badFat100" = 2.5,
  "goodFat100" = 10.5,
  trans100 = 0,
  fiber100 = 0,
  
  sodium100 = 59,
  omega3_100 = 2.2,        -- ⭐ Высокое значение для жирной рыбы
  omega6_100 = 0.2,
  cholesterol100 = 55,
  
  iron = 4,
  magnesium = 8,
  zinc = 5,
  calcium = 2,
  potassium = 10,
  selenium = 65,           -- ⭐ Высокое значение
  iodine = 8,
  
  vitamin_a = 5,
  vitamin_b1 = 20,
  vitamin_b2 = 15,
  vitamin_b3 = 50,
  vitamin_b6 = 40,
  vitamin_b9 = 8,
  vitamin_b12 = 150,       -- ⭐ Очень высокое значение
  vitamin_c = 0,
  vitamin_d = 100,         -- ⭐ Очень высокое значение
  vitamin_e = 8,
  vitamin_k = 1,
  
  nova_group = 1,
  is_fermented = false,
  is_raw = false,          -- может быть true для суши
  is_organic = false,
  is_whole_grain = false,
  
  updated_at = NOW()
WHERE id = 'SALMON_ID_HERE';


-- 3. Batch UPDATE для нескольких продуктов (через CASE WHEN)
UPDATE shared_products
SET
  omega3_100 = CASE id
    WHEN 'id_salmon' THEN 2.2
    WHEN 'id_tuna' THEN 1.5
    WHEN 'id_sardine' THEN 2.0
    ELSE omega3_100
  END,
  omega6_100 = CASE id
    WHEN 'id_salmon' THEN 0.2
    WHEN 'id_tuna' THEN 0.1
    WHEN 'id_sardine' THEN 0.15
    ELSE omega6_100
  END,
  updated_at = NOW()
WHERE id IN ('id_salmon', 'id_tuna', 'id_sardine');


-- 4. Проверка перед UPDATE (validation)
-- Запускать перед каждым UPDATE для проверки текущего состояния
SELECT 
  id,
  name,
  category,
  protein100,
  omega3_100,
  omega6_100,
  iron,
  magnesium,
  vitamin_d,
  nova_group
FROM shared_products
WHERE id = 'PRODUCT_ID_HERE';


-- 5. Rollback (если нужно откатить изменение)
-- ⚠️ ИСПОЛЬЗОВАТЬ ТОЛЬКО В СЛУЧАЕ ОШИБКИ
-- Требует предварительного сохранения старых значений
UPDATE shared_products
SET
  omega3_100 = NULL,  -- или предыдущее значение
  updated_at = NOW()
WHERE id = 'PRODUCT_ID_HERE';
