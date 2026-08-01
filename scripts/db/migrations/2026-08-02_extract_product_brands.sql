-- 2026-08-02 — извлечение брендов из названий карточек.
--
-- ЗАЧЕМ
-- Бренд заполнен у 17 карточек из 398. При этом `brand_fingerprint` задуман как
-- более точный ключ дедупликации, чем обычный отпечаток: он различает «Творог
-- 5%» разных производителей, у которых состав случайно совпал. На пустом поле
-- этот ключ не работает вовсе, то есть половина защиты от дублей простаивает.
--
-- Бренд проставляется только там, где он однозначно читается в названии.
-- Продукты без узнаваемого бренда (домашние блюда, сырьё, «Куриное филе
-- отварное») остаются без него — это правильное состояние, а не пробел.
--
-- brand_fingerprint пересчитается триггером автоматически.

BEGIN;

UPDATE public.shared_products SET brand = CASE
  WHEN name ~* 'lay.s'                     THEN 'Lay''s'
  WHEN name ~* 'heinz'                     THEN 'Heinz'
  WHEN name ~* '(chikalab|chika layers)'   THEN 'Chikalab'
  WHEN name ~* 'bombbar'                   THEN 'Bombbar'
  WHEN name ~* 'snaq'                      THEN 'SNAQ FABRIQ'
  WHEN name ~* 'bootybar|booty bar'        THEN 'BootyBar'
  WHEN name ~* 'fitness ?shock'            THEN 'FitnessShock'
  WHEN name ~* 'kerlli|kerll'              THEN 'Kerlli'
  WHEN name ~* 'exponenta'                 THEN 'Exponenta'
  WHEN name ~* 'bionova'                   THEN 'Bionova'
  WHEN name ~* 'neo high'                  THEN 'Neo'
  WHEN name ~* 'nut&go'                    THEN 'Nut&Go'
  WHEN name ~* 'planto'                    THEN 'Planto'
  WHEN name ~* 'pediasure'                 THEN 'PediaSure'
  WHEN name ~* 'zuegg'                     THEN 'Zuegg'
  WHEN name ~* 'dr\.?\s?korner'            THEN 'Dr. Korner'
  WHEN name ~* 'nestl'                     THEN 'Nestlé'
  WHEN name ~* 'bonfesto'                  THEN 'Bonfesto'
  WHEN name ~* 'helios'                    THEN 'Helios'
  WHEN name ~* 'pikador'                   THEN 'PIKADOR'
  WHEN name ~* 'lorenz'                    THEN 'Lorenz'
  WHEN name ~* 'oreo'                      THEN 'Oreo'
  WHEN name ~* 'киндер'                    THEN 'Kinder'
  WHEN name ~* 'сникерс'                   THEN 'Snickers'
  WHEN name ~* 'барни'                     THEN 'Барни'
  WHEN name ~* 'adrenaline'                THEN 'Adrenaline'
  WHEN name ~* 'sabroso'                   THEN 'Sabroso Monte'
  WHEN name ~* 'araks'                     THEN 'Araks'
  WHEN name ~* 'владкон'                   THEN 'Владкон'
  WHEN name ~* 'самокат'                   THEN 'Самокат'
  WHEN name ~* 'вязанка'                   THEN 'Вязанка'
  WHEN name ~* 'коровка из кореновки'      THEN 'Коровка из Кореновки'
  WHEN name ~* 'александров'                THEN 'Б.Ю. Александров'
  WHEN name ~* 'русское море'              THEN 'Русское море'
  WHEN name ~* 'село зелёное|село зеленое'  THEN 'Село Зелёное'
  WHEN name ~* 'активиа'                   THEN 'Активиа'
  WHEN name ~* 'черкизово'                 THEN 'Черкизово'
  WHEN name ~* 'ексель|эксель'             THEN 'Ексель'
  WHEN name ~* 'умалат'                    THEN 'Умалат'
  WHEN name ~* 'дон крутон'                THEN 'Дон Крутон'
  WHEN name ~* 'кузя'                      THEN 'Кузя'
  WHEN name ~* 'бегемотик бонди'           THEN 'Бегемотик Бонди'
  WHEN name ~* 'николаевский'              THEN 'Николаевский'
  WHEN name ~* 'орион'                     THEN 'Орион'
  WHEN name ~* 'семушка'                   THEN 'Семушка'
  WHEN name ~* 'белёвск|белевск'           THEN 'Белёвская'
  WHEN name ~* 'обломов'                   THEN 'И.И. Обломов'
  WHEN name ~* 'аютинский'                 THEN 'Аютинский'
  WHEN name ~* 'creative kitchen'          THEN 'Creative Kitchen'
  WHEN name ~* 'proenergy'                 THEN 'Proenergy'
  WHEN name ~* 'extrasi'                   THEN 'EXTRASI'
  WHEN name ~* 'sporty'                    THEN 'Sporty'
  WHEN name ~* 'bakal'                     THEN 'Bakalář'
  ELSE brand
END
WHERE brand IS NULL OR btrim(brand) = '';

COMMIT;

-- ПРОВЕРКА ПОСЛЕ:
--   SELECT count(*) FILTER (WHERE brand IS NOT NULL AND btrim(brand) <> '') AS with_brand,
--          count(*) AS total FROM shared_products;
--   -- brand_fingerprint должен появиться у тех же строк (считает триггер):
--   SELECT count(*) FROM shared_products
--    WHERE brand IS NOT NULL AND btrim(brand) <> '' AND brand_fingerprint IS NULL;  -- 0
--
-- ОТКАТ: восстановление поля brand из бэкапа каталога.
