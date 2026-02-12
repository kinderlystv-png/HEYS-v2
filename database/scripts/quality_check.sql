-- Проверка качества обогащения
-- 1. Продукты с незаполненными качественными флагами
SELECT 'Продукты с NULL в is_fermented или is_whole_grain:' AS check_type;
SELECT id, name, is_fermented, is_whole_grain 
FROM shared_products 
WHERE is_fermented IS NULL OR is_whole_grain IS NULL;

-- 2. Статистика по диапазонам значений
SELECT 'Диапазоны значений микронутриентов:' AS check_type;
SELECT 
  MIN(cholesterol) AS min_chol, MAX(cholesterol) AS max_chol,
  MIN(iron) AS min_iron, MAX(iron) AS max_iron,
  MIN(vitamin_c) AS min_vit_c, MAX(vitamin_c) AS max_vit_c,
  MIN(nova_group) AS min_nova, MAX(nova_group) AS max_nova
FROM shared_products;

-- 3. Проверка на аномалии (нереалистичные значения)
SELECT 'Продукты с потенциально аномальными значениями:' AS check_type;
SELECT name, cholesterol, iron, vitamin_c, nova_group
FROM shared_products 
WHERE cholesterol > 500 OR iron > 50 OR vitamin_c > 500
LIMIT 10;
