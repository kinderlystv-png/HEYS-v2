-- 2026-08-02 — проверки на вход для общего каталога продуктов.
--
-- ЗАЧЕМ
-- 30.05.2026 в каталог попали 12 карточек с обнулёнными углеводами и жирами;
-- из-за них «Торт Наполеон» считался как 18 ккал вместо 300, и это дошло до
-- дневников живых клиентов. Последствия вычищены, дедупликация закрыта
-- триггером отпечатков, но сам вход оставался открытым: база принимала любые
-- числа. Эти проверки закрывают вход, поэтому такой мусор больше не запишется
-- никаким путём — ни через UI, ни через RPC, ни через REST, ни миграцией.
--
-- ЧТО ПРОВЕРЯЕТСЯ
-- Только физически невозможное, без вкусовщины:
--   1) отрицательные нутриенты;
--   2) сумма нутриентов больше 105 г на 100 г продукта (5 г — запас на
--      округление; всё, что выше, означает ошибку ввода или двойной учёт);
--   3) калорийность выше 950 ккал на 100 г (чистый жир даёт ~900);
--   4) трансжиры больше общего жира — часть не может превышать целое;
--   5) гликемический индекс вне 0–110 и вредность вне 0–10.
--
-- Намеренно НЕ проверяется «все макросы нулевые»: у воды, чая, кофе без сахара
-- это норма, и такой констрейнт давал бы ложные срабатывания.
--
-- Текущие 398 карточек проверены до применения — нарушений ноль по всем
-- шести правилам, поэтому констрейнты ставятся сразу валидными.
-- Идемпотентность: раннер миграций может применить файл повторно, а
-- ADD CONSTRAINT на существующем имени падает. Снимаем прежде чем ставить.
ALTER TABLE public.shared_products DROP CONSTRAINT IF EXISTS shared_products_nutrients_non_negative;
ALTER TABLE public.shared_products DROP CONSTRAINT IF EXISTS shared_products_mass_within_100g;
ALTER TABLE public.shared_products DROP CONSTRAINT IF EXISTS shared_products_energy_plausible;
ALTER TABLE public.shared_products DROP CONSTRAINT IF EXISTS shared_products_trans_within_fat;
ALTER TABLE public.shared_products DROP CONSTRAINT IF EXISTS shared_products_gi_range;
ALTER TABLE public.shared_products DROP CONSTRAINT IF EXISTS shared_products_harm_range;

ALTER TABLE public.shared_products
  ADD CONSTRAINT shared_products_nutrients_non_negative CHECK (
    COALESCE(protein100, 0) >= 0
    AND COALESCE(simple100, 0) >= 0
    AND COALESCE(complex100, 0) >= 0
    AND COALESCE(badfat100, 0) >= 0
    AND COALESCE(goodfat100, 0) >= 0
    AND COALESCE(trans100, 0) >= 0
    AND COALESCE(fiber100, 0) >= 0
  );

ALTER TABLE public.shared_products
  ADD CONSTRAINT shared_products_mass_within_100g CHECK (
    COALESCE(protein100, 0) + COALESCE(simple100, 0) + COALESCE(complex100, 0)
    + COALESCE(badfat100, 0) + COALESCE(goodfat100, 0) + COALESCE(fiber100, 0) <= 105
  );

ALTER TABLE public.shared_products
  ADD CONSTRAINT shared_products_energy_plausible CHECK (
    3 * COALESCE(protein100, 0)
    + 4 * (COALESCE(simple100, 0) + COALESCE(complex100, 0))
    + 9 * (COALESCE(badfat100, 0) + COALESCE(goodfat100, 0)) <= 950
  );

ALTER TABLE public.shared_products
  ADD CONSTRAINT shared_products_trans_within_fat CHECK (
    COALESCE(trans100, 0) <= COALESCE(badfat100, 0) + COALESCE(goodfat100, 0)
  );

ALTER TABLE public.shared_products
  ADD CONSTRAINT shared_products_gi_range CHECK (gi IS NULL OR (gi >= 0 AND gi <= 110));

ALTER TABLE public.shared_products
  ADD CONSTRAINT shared_products_harm_range CHECK (harm IS NULL OR (harm >= 0 AND harm <= 10));
-- ПРОВЕРКА ПОСЛЕ:
--   SELECT conname FROM pg_constraint
--    WHERE conrelid = 'public.shared_products'::regclass AND contype = 'c'
--    ORDER BY conname;
--
--   -- живая проверка (в транзакции с ROLLBACK, чтобы не менять каталог):
--   BEGIN;
--   UPDATE shared_products SET protein100 = 500 WHERE name = 'Креветки варёные';
--   -- ожидаем отказ по shared_products_mass_within_100g
--   ROLLBACK;
--
-- ОТКАТ:
--   ALTER TABLE public.shared_products DROP CONSTRAINT IF EXISTS shared_products_nutrients_non_negative;
--   ALTER TABLE public.shared_products DROP CONSTRAINT IF EXISTS shared_products_mass_within_100g;
--   ALTER TABLE public.shared_products DROP CONSTRAINT IF EXISTS shared_products_energy_plausible;
--   ALTER TABLE public.shared_products DROP CONSTRAINT IF EXISTS shared_products_trans_within_fat;
--   ALTER TABLE public.shared_products DROP CONSTRAINT IF EXISTS shared_products_gi_range;
--   ALTER TABLE public.shared_products DROP CONSTRAINT IF EXISTS shared_products_harm_range;
