-- 2026-08-02 — сахарные спирты, записанные в клетчатку.
--
-- ПРОБЛЕМА
-- В протеиновых батончиках подсластитель — мальтитный сироп и подобные полиолы.
-- В карточках они занесены в fiber100: у Chika Layers стоит 35 г «клетчатки»
-- при нулевых сложных углеводах. Клетчатка в формулу калорийности не входит,
-- поэтому эта часть массы просто выпадает из расчёта, и батончик считается как
-- 168–204 ккал вместо примерно 250–440. Человек ест заметно больше, чем
-- показывает дневник.
--
-- Признак: клетчатка больше суммы углеводов. Важно, что сам по себе этот
-- признак не означает ошибку — у семян чиа 34.4 г клетчатки, у какао-порошка
-- 33 г, у авокадо 6.7 г, и это правда. Поэтому правятся только позиции, где
-- столько клетчатки быть не может: батончики, печенье, топпинг.
--
-- РЕШЕНИЕ
-- Полиолы дают 2.4 ккал/г против 4 ккал/г у обычных углеводов, поэтому
-- переносятся в сложные углеводы с коэффициентом 2.4/4 = 0.6. Клетчатка
-- остаётся в размере, реальном для такого продукта (около 6 г у батончиков из
-- орехов и какао, 0.5 г у топпинга).
--
-- Это тот же приём, что применён к энергии спирта: отдельного поля для полиолов
-- в модели нет, поэтому энергия вносится эквивалентом. Полное решение —
-- поле polyols100 со своим коэффициентом, см. todo.md D4.
--
-- ПРОВЕРКА ДО:
--   SELECT count(*) FROM shared_products WHERE fiber100 > (simple100+complex100); -- 13
--   (из них 3 легитимных: семена чиа, какао-порошок, авокадо)

BEGIN;

-- Chika Layers фундук и карамель: 35 г «клетчатки» → 6 клетчатки + 29 полиолов.
UPDATE public.shared_products
SET fiber100 = 6, complex100 = round((complex100 + 29 * 0.6)::numeric, 1)
WHERE id = '2dcdf3d5-245b-4ec7-99e1-3f6339398748';          -- 186 → ~256 ккал

-- Chika Layers карамель и арахис.
UPDATE public.shared_products
SET fiber100 = 6, complex100 = round((complex100 + 29 * 0.6)::numeric, 1)
WHERE id = '787875ea-fd53-48d7-bf4b-2cbbf659cd5a';          -- 179 → ~249 ккал

-- Chika Layers Crispy Cookies.
UPDATE public.shared_products
SET fiber100 = 6, complex100 = round((complex100 + 29 * 0.6)::numeric, 1)
WHERE id = '54a312a4-c3d7-4212-9160-f4e2f7a9e77a';          -- 168 → ~237 ккал

-- Bootybar Crunch фисташковый: 30 → 6 клетчатки + 24 полиола.
UPDATE public.shared_products
SET fiber100 = 6, complex100 = round((complex100 + 24 * 0.6)::numeric, 1)
WHERE id = '90be4110-4cd3-43c0-9378-cc9f19de6897';          -- 194 → ~252 ккал

-- Bootybar Crunch кокосовое печенье.
UPDATE public.shared_products
SET fiber100 = 6, complex100 = round((complex100 + 24 * 0.6)::numeric, 1)
WHERE id = '2c932e38-20d9-428d-8d9e-313d65384af8';          -- 204 → ~262 ккал

-- SNAQ FABRIQ Wafer Stick Milk & Cashew: 28.5 → 6 + 22.5 полиолов.
UPDATE public.shared_products
SET fiber100 = 6, complex100 = round((complex100 + 22.5 * 0.6)::numeric, 1)
WHERE id = '78113de3-368f-40eb-bcca-694f2bffcba4';          -- 308 → ~362 ккал

-- SNAQ FABRIQ SNAQER Dubai Trend: 28 → 6 + 22 полиола.
UPDATE public.shared_products
SET fiber100 = 6, complex100 = round((complex100 + 22 * 0.6)::numeric, 1)
WHERE id = 'fbeae91f-f8f9-4a5a-85a2-24d74f0f5a1a';          -- 389 → ~442 ккал

-- FitnesShock протеиновый шоколадное печенье: 18 → 6 + 12 полиолов.
UPDATE public.shared_products
SET fiber100 = 6, complex100 = round((complex100 + 12 * 0.6)::numeric, 1)
WHERE id = '875bed41-88a9-4a7d-b156-c4c27a67efae';          -- 204 → ~233 ккал

-- Батончик протеиновый шоколад-фундук: 15 → 6 + 9 полиолов.
UPDATE public.shared_products
SET fiber100 = 6, complex100 = round((complex100 + 9 * 0.6)::numeric, 1)
WHERE id = '55b5c304-d6c0-4ee4-8415-3ac6750cb623';          -- 236 → ~258 ккал

-- Топпинг «сгущёнка без сахара»: клетчатки в сгущёнке практически нет.
UPDATE public.shared_products
SET fiber100 = 0.5, complex100 = round((complex100 + 9.5 * 0.6)::numeric, 1)
WHERE id = 'c915ecd8-d8f7-45fa-b175-6f52325788f1';          -- 95 → ~118 ккал

COMMIT;

-- ПРОВЕРКА ПОСЛЕ:
--   SELECT count(*) FROM shared_products WHERE fiber100 > (simple100+complex100);
--   -- ожидаем 3: семена чиа, какао-порошок, авокадо — у них так и есть
--
--   -- отпечатки пересчитаны триггером автоматически:
--   SELECT count(*) FILTER (WHERE fingerprint <> public.compute_product_fingerprint(
--     jsonb_build_object('name',name,'simple100',simple100,'complex100',complex100,
--       'protein100',protein100,'badFat100',badfat100,'goodFat100',goodfat100,
--       'trans100',trans100,'fiber100',fiber100,'gi',gi,'harm',harm))) FROM shared_products; -- 0
--
-- ОТКАТ: восстановление затронутых строк из бэкапа каталога.
