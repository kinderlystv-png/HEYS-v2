-- Аудит и синхронизация продуктов
-- 2026-02-01

BEGIN;

-- 1. Удаляем тестовые продукты из shared_products
DELETE FROM shared_products WHERE name = 'Test Admin Insert';
DELETE FROM shared_products WHERE name = 'Test with portions FINAL';

-- 2. Добавляем недостающие продукты

-- Пельмени с маслом классические
INSERT INTO shared_products (
  id, name, name_norm, fingerprint,
  simple100, complex100, protein100, badfat100, goodfat100, trans100, fiber100,
  gi, harm, nova_group, created_by_user_id
) VALUES (
  gen_random_uuid(),
  'Пельмени с маслом классические',
  'пельмени с маслом классические',
  encode(sha256('пельмени с маслом классические'::bytea), 'hex'),
  2, 23, 11, 5, 9.8, 0.2, 1,
  55, NULL, 4, 'f965a73c-79e3-42b7-9ee0-bfaad09e706b'
) ON CONFLICT (fingerprint) DO NOTHING;

-- Киндер Сюрприз (исправляем novaGroup на 4 - это ультрапереработанный продукт!)
INSERT INTO shared_products (
  id, name, name_norm, fingerprint,
  simple100, complex100, protein100, badfat100, goodfat100, trans100, fiber100,
  gi, harm, nova_group, created_by_user_id
) VALUES (
  gen_random_uuid(),
  'Киндер Сюрприз',
  'киндер сюрприз',
  encode(sha256('киндер сюрприз'::bytea), 'hex'),
  52, 0.6, 8.7, 22.6, 12.4, 0.3, 1,
  70, NULL, 4, 'f965a73c-79e3-42b7-9ee0-bfaad09e706b'
) ON CONFLICT (fingerprint) DO NOTHING;

-- 3. Пересчитываем harm для новых продуктов
UPDATE shared_products
SET harm = calculate_harm_score(
  simple100, protein100, badfat100, goodfat100, trans100, 
  fiber100, gi, sodium100, nova_group
)
WHERE harm IS NULL;

-- 4. Исправляем novaGroup для Урбеч из мякоти кокоса (должен быть 1 - необработанный)
UPDATE shared_products
SET nova_group = 1
WHERE name = 'Урбеч из мякоти кокоса (100%)' AND nova_group != 1;

-- Проверяем результат
SELECT 'Удалённые тестовые:' as action, COUNT(*) as count FROM shared_products WHERE name LIKE 'Test%';
SELECT 'Новые продукты:' as action, name, harm, nova_group 
FROM shared_products 
WHERE name IN ('Пельмени с маслом классические', 'Киндер Сюрприз');
SELECT 'Всего продуктов:' as action, COUNT(*)::text as count FROM shared_products;

COMMIT;
