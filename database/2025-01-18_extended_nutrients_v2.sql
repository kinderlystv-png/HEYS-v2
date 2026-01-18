-- =============================================================================
-- HEYS Extended Nutrients v2.0 - SQL Migration
-- Добавляет 29 новых колонок для расширенной нутриентной модели
-- =============================================================================
-- DEPRECATED — заменено 2026-01-18_extended_nutrients.sql
-- Файл оставлен для истории, применять НЕ НУЖНО
-- Версия: 2.0.0
-- Дата: 2025-01-18
-- Автор: HEYS Development Team
-- Научная база: docs/DATA_MODEL_REFERENCE.md#harm-score-v2
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. БАЗОВЫЕ НУТРИЕНТЫ (5 колонок)
-- -----------------------------------------------------------------------------

-- Натрий (мг/100г) — важен для гипертензии (He 2011, PMID: 21731062)
ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS sodium100 NUMERIC DEFAULT NULL;
COMMENT ON COLUMN shared_products.sodium100 IS 'Натрий мг/100г. WHO: <2000 мг/день';

-- Холестерин (мг/100г) — информационное поле
ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS cholesterol100 NUMERIC DEFAULT NULL;
COMMENT ON COLUMN shared_products.cholesterol100 IS 'Холестерин мг/100г';

-- Добавленный сахар (г/100г) — отличие от natural sugars
ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS sugar100 NUMERIC DEFAULT NULL;
COMMENT ON COLUMN shared_products.sugar100 IS 'Добавленный сахар г/100г';

-- Омега-3 (г/100г)
ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS omega3_100 NUMERIC DEFAULT NULL;
COMMENT ON COLUMN shared_products.omega3_100 IS 'Омега-3 жирные кислоты г/100г';

-- Омега-6 (г/100г)
ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS omega6_100 NUMERIC DEFAULT NULL;
COMMENT ON COLUMN shared_products.omega6_100 IS 'Омега-6 жирные кислоты г/100г';


-- -----------------------------------------------------------------------------
-- 2. ВИТАМИНЫ (% от суточной нормы на 100г) - 12 колонок
-- -----------------------------------------------------------------------------

ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS vitamin_a NUMERIC DEFAULT NULL;
COMMENT ON COLUMN shared_products.vitamin_a IS 'Витамин A (% от 900 мкг)';

ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS vitamin_c NUMERIC DEFAULT NULL;
COMMENT ON COLUMN shared_products.vitamin_c IS 'Витамин C (% от 90 мг)';

ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS vitamin_d NUMERIC DEFAULT NULL;
COMMENT ON COLUMN shared_products.vitamin_d IS 'Витамин D (% от 20 мкг)';

ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS vitamin_e NUMERIC DEFAULT NULL;
COMMENT ON COLUMN shared_products.vitamin_e IS 'Витамин E (% от 15 мг)';

ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS vitamin_k NUMERIC DEFAULT NULL;
COMMENT ON COLUMN shared_products.vitamin_k IS 'Витамин K (% от 120 мкг)';

ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS vitamin_b1 NUMERIC DEFAULT NULL;
COMMENT ON COLUMN shared_products.vitamin_b1 IS 'Тиамин B1 (% от 1.2 мг)';

ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS vitamin_b2 NUMERIC DEFAULT NULL;
COMMENT ON COLUMN shared_products.vitamin_b2 IS 'Рибофлавин B2 (% от 1.3 мг)';

ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS vitamin_b3 NUMERIC DEFAULT NULL;
COMMENT ON COLUMN shared_products.vitamin_b3 IS 'Ниацин B3 (% от 16 мг)';

ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS vitamin_b6 NUMERIC DEFAULT NULL;
COMMENT ON COLUMN shared_products.vitamin_b6 IS 'Пиридоксин B6 (% от 1.7 мг)';

ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS vitamin_b9 NUMERIC DEFAULT NULL;
COMMENT ON COLUMN shared_products.vitamin_b9 IS 'Фолат B9 (% от 400 мкг)';

ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS vitamin_b12 NUMERIC DEFAULT NULL;
COMMENT ON COLUMN shared_products.vitamin_b12 IS 'Кобаламин B12 (% от 2.4 мкг)';


-- -----------------------------------------------------------------------------
-- 3. МИНЕРАЛЫ (% от суточной нормы на 100г) - 8 колонок
-- -----------------------------------------------------------------------------

ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS calcium NUMERIC DEFAULT NULL;
COMMENT ON COLUMN shared_products.calcium IS 'Кальций (% от 1000 мг)';

ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS iron NUMERIC DEFAULT NULL;
COMMENT ON COLUMN shared_products.iron IS 'Железо (% от 18 мг)';

ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS magnesium NUMERIC DEFAULT NULL;
COMMENT ON COLUMN shared_products.magnesium IS 'Магний (% от 400 мг)';

ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS phosphorus NUMERIC DEFAULT NULL;
COMMENT ON COLUMN shared_products.phosphorus IS 'Фосфор (% от 700 мг)';

ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS potassium NUMERIC DEFAULT NULL;
COMMENT ON COLUMN shared_products.potassium IS 'Калий (% от 3500 мг)';

ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS zinc NUMERIC DEFAULT NULL;
COMMENT ON COLUMN shared_products.zinc IS 'Цинк (% от 11 мг)';

ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS selenium NUMERIC DEFAULT NULL;
COMMENT ON COLUMN shared_products.selenium IS 'Селен (% от 55 мкг)';

ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS iodine NUMERIC DEFAULT NULL;
COMMENT ON COLUMN shared_products.iodine IS 'Йод (% от 150 мкг)';


-- -----------------------------------------------------------------------------
-- 4. NOVA И ПЕРЕРАБОТКА (4 колонки)
-- -----------------------------------------------------------------------------

-- NOVA группа (1-4) — Monteiro 2019 (PMID: 29444892)
ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS nova_group SMALLINT DEFAULT NULL;
COMMENT ON COLUMN shared_products.nova_group IS 'NOVA классификация 1-4 (1=необработанные, 4=ультрапереработанные)';

-- Флаг ультрапереработки
ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS is_ultra_processed BOOLEAN DEFAULT NULL;
COMMENT ON COLUMN shared_products.is_ultra_processed IS 'Ультрапереработанный продукт (NOVA 4)';

-- E-добавки (массив строк)
ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS additives TEXT[] DEFAULT NULL;
COMMENT ON COLUMN shared_products.additives IS 'E-добавки, например: {E621, E330}';

-- Nutrient Density Score (0-100)
ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS nutrient_density NUMERIC DEFAULT NULL;
COMMENT ON COLUMN shared_products.nutrient_density IS 'Микронутриентная плотность 0-100';


-- -----------------------------------------------------------------------------
-- 5. ИНДЕКСЫ для оптимизации запросов
-- -----------------------------------------------------------------------------

-- Индекс на nova_group для фильтрации ультрапереработанных
CREATE INDEX IF NOT EXISTS idx_shared_products_nova_group 
ON shared_products (nova_group) 
WHERE nova_group IS NOT NULL;

-- Индекс на nutrient_density для поиска суперфудов
CREATE INDEX IF NOT EXISTS idx_shared_products_nutrient_density 
ON shared_products (nutrient_density DESC) 
WHERE nutrient_density IS NOT NULL;

-- Индекс на is_ultra_processed для быстрой фильтрации
CREATE INDEX IF NOT EXISTS idx_shared_products_ultra_processed 
ON shared_products (is_ultra_processed) 
WHERE is_ultra_processed = TRUE;


-- -----------------------------------------------------------------------------
-- 6. ПРОВЕРКА МИГРАЦИИ
-- -----------------------------------------------------------------------------

DO $$
DECLARE
    col_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO col_count
    FROM information_schema.columns 
    WHERE table_name = 'shared_products' 
      AND column_name IN (
        'sodium100', 'cholesterol100', 'sugar100', 'omega3_100', 'omega6_100',
        'vitamin_a', 'vitamin_c', 'vitamin_d', 'vitamin_e', 'vitamin_k',
        'vitamin_b1', 'vitamin_b2', 'vitamin_b3', 'vitamin_b6', 'vitamin_b9', 'vitamin_b12',
        'calcium', 'iron', 'magnesium', 'phosphorus', 'potassium', 'zinc', 'selenium', 'iodine',
        'nova_group', 'is_ultra_processed', 'additives', 'nutrient_density'
      );
    
    IF col_count = 28 THEN
        RAISE NOTICE '✅ Extended nutrients migration completed: 28 new columns added';
    ELSE
        RAISE WARNING '⚠️ Expected 28 columns, found %', col_count;
    END IF;
END $$;


-- -----------------------------------------------------------------------------
-- ROLLBACK (если нужно откатить)
-- -----------------------------------------------------------------------------
/*
ALTER TABLE shared_products 
  DROP COLUMN IF EXISTS sodium100,
  DROP COLUMN IF EXISTS cholesterol100,
  DROP COLUMN IF EXISTS sugar100,
  DROP COLUMN IF EXISTS omega3_100,
  DROP COLUMN IF EXISTS omega6_100,
  DROP COLUMN IF EXISTS vitamin_a,
  DROP COLUMN IF EXISTS vitamin_c,
  DROP COLUMN IF EXISTS vitamin_d,
  DROP COLUMN IF EXISTS vitamin_e,
  DROP COLUMN IF EXISTS vitamin_k,
  DROP COLUMN IF EXISTS vitamin_b1,
  DROP COLUMN IF EXISTS vitamin_b2,
  DROP COLUMN IF EXISTS vitamin_b3,
  DROP COLUMN IF EXISTS vitamin_b6,
  DROP COLUMN IF EXISTS vitamin_b9,
  DROP COLUMN IF EXISTS vitamin_b12,
  DROP COLUMN IF EXISTS calcium,
  DROP COLUMN IF EXISTS iron,
  DROP COLUMN IF EXISTS magnesium,
  DROP COLUMN IF EXISTS phosphorus,
  DROP COLUMN IF EXISTS potassium,
  DROP COLUMN IF EXISTS zinc,
  DROP COLUMN IF EXISTS selenium,
  DROP COLUMN IF EXISTS iodine,
  DROP COLUMN IF EXISTS nova_group,
  DROP COLUMN IF EXISTS is_ultra_processed,
  DROP COLUMN IF EXISTS additives,
  DROP COLUMN IF EXISTS nutrient_density;

DROP INDEX IF EXISTS idx_shared_products_nova_group;
DROP INDEX IF EXISTS idx_shared_products_nutrient_density;
DROP INDEX IF EXISTS idx_shared_products_ultra_processed;
*/
