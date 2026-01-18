-- =========================================================
-- МИГРАЦИЯ: Обновление sodium100 (натрий, мг/100г) для всех продуктов
-- Дата: 2025-01-18
-- Описание: Проставляем правильные значения натрия
-- Источники: USDA, FatSecret, OpenFoodFacts, этикетки продуктов
-- =========================================================

BEGIN;

-- ==========================
-- ФРУКТЫ И ЯГОДЫ (обычно низкий натрий)
-- ==========================

UPDATE shared_products SET sodium100 = 7 WHERE name = 'Авокадо';
UPDATE shared_products SET sodium100 = 0 WHERE name = 'Апельсин';
UPDATE shared_products SET sodium100 = 1 WHERE name = 'Банан';
UPDATE shared_products SET sodium100 = 2 WHERE name = 'Виноград';
UPDATE shared_products SET sodium100 = 1 WHERE name = 'Голубика';
UPDATE shared_products SET sodium100 = 1 WHERE name = 'Груша';
UPDATE shared_products SET sodium100 = 11 WHERE name = 'Изюм';
UPDATE shared_products SET sodium100 = 1 WHERE name = 'Клубника';
UPDATE shared_products SET sodium100 = 10 WHERE name = 'Ананасы консервированные (в собственном соку)';

-- ==========================
-- ОВОЩИ И ОВОЩНЫЕ БЛЮДА
-- ==========================

UPDATE shared_products SET sodium100 = 33 WHERE name = 'Брокколи на пару';
UPDATE shared_products SET sodium100 = 3 WHERE name = 'Кабачки на гриле';
UPDATE shared_products SET sodium100 = 5 WHERE name = 'Кабачки и перец сладкий на гриле (70/30)';
UPDATE shared_products SET sodium100 = 460 WHERE name = 'Капуста квашеная';
UPDATE shared_products SET sodium100 = 460 WHERE name = 'Капуста Квашеная ексель';
UPDATE shared_products SET sodium100 = 380 WHERE name = 'Капуста квашеная сладкая';
UPDATE shared_products SET sodium100 = 320 WHERE name = 'Капуста тушёная в томате';
UPDATE shared_products SET sodium100 = 210 WHERE name = 'Грибы тушёные в сливках';
UPDATE shared_products SET sodium100 = 5 WHERE name = 'Картофель отварной с маслом';
UPDATE shared_products SET sodium100 = 12 WHERE name = 'Картофель жареный на костре';
UPDATE shared_products SET sodium100 = 45 WHERE name = 'Картофельное пюре';
UPDATE shared_products SET sodium100 = 15 WHERE name = 'Картошка жареная на мангале';
UPDATE shared_products SET sodium100 = 220 WHERE name = 'Гавайский микс (овощи с рисом)';
UPDATE shared_products SET sodium100 = 380 WHERE name = 'Булгур с овощами ЕКСЕЛЬ';

-- ==========================
-- КРУПЫ И КАШИ
-- ==========================

UPDATE shared_products SET sodium100 = 4 WHERE name = 'Гречка отварная';
UPDATE shared_products SET sodium100 = 5 WHERE name = 'Киноа отварное';
UPDATE shared_products SET sodium100 = 55 WHERE name = 'Гранола шоколадная Самокат';
UPDATE shared_products SET sodium100 = 2 WHERE name = 'Грецкий орех';

-- ==========================
-- МОЛОЧНЫЕ ПРОДУКТЫ
-- ==========================

UPDATE shared_products SET sodium100 = 50 WHERE name = 'Кефир 2,5 Кубанский молочник';
UPDATE shared_products SET sodium100 = 55 WHERE name = 'Греческий йогурт Простоквашино 2';
UPDATE shared_products SET sodium100 = 52 WHERE name = 'Коломенский йогурт 5 малина-груша';
UPDATE shared_products SET sodium100 = 65 WHERE name = 'Кисломолочный напиток Exponenta High-Pro черника-земляника';
UPDATE shared_products SET sodium100 = 140 WHERE name = 'Желток яйца';

-- ==========================
-- МЯСО И ПТИЦА
-- ==========================

UPDATE shared_products SET sodium100 = 65 WHERE name = 'Бедро индейки запеченное без кожи';
UPDATE shared_products SET sodium100 = 550 WHERE name = 'Индейка в панировке';
UPDATE shared_products SET sodium100 = 980 WHERE name = 'Индейка вяленая (без сахара)';
UPDATE shared_products SET sodium100 = 890 WHERE name = 'Карпаччо из филе курицы';
UPDATE shared_products SET sodium100 = 480 WHERE name = 'Бризоль куриная ЕКСЕЛЬ';
UPDATE shared_products SET sodium100 = 920 WHERE name = 'Грудка копчёная Орион';
UPDATE shared_products SET sodium100 = 350 WHERE name = 'Говядина в томатном соусе';
UPDATE shared_products SET sodium100 = 85 WHERE name = 'Говяжий антрекот на мангале';
UPDATE shared_products SET sodium100 = 380 WHERE name = 'Котлета свино-говяжья (пареная)';
UPDATE shared_products SET sodium100 = 320 WHERE name = 'Котлеты паровые (говядина 40, индейка 40, курица 20)';
UPDATE shared_products SET sodium100 = 290 WHERE name = 'Котлеты из филе индейки (обжарка 30 сек, доведение в кипятке)';

-- ==========================
-- КОЛБАСНЫЕ ИЗДЕЛИЯ И ВЕТЧИНА (высокий натрий!)
-- ==========================

UPDATE shared_products SET sodium100 = 1100 WHERE name = 'Колбаса докторская';
UPDATE shared_products SET sodium100 = 850 WHERE name = 'Колбаса Сабросо Монте (индейка)';
UPDATE shared_products SET sodium100 = 1050 WHERE name = 'Ветчина из индейки Черкизово';
UPDATE shared_products SET sodium100 = 890 WHERE name = 'Ветчина из индейки «Филе грудки» (-15 соли)';

-- ==========================
-- РЫБА И МОРЕПРОДУКТЫ
-- ==========================

UPDATE shared_products SET sodium100 = 1600 WHERE name = 'Горбуша горячего копчения Русское море';
UPDATE shared_products SET sodium100 = 420 WHERE name = 'Горбуша натуральная (консервы)';
UPDATE shared_products SET sodium100 = 380 WHERE name = 'Владкон тунец тушёнка премиум';
UPDATE shared_products SET sodium100 = 2180 WHERE name = 'Икра красная лососевая солёная';
UPDATE shared_products SET sodium100 = 590 WHERE name = 'Килька в томате';
UPDATE shared_products SET sodium100 = 900 WHERE name = 'Крабовые палочки (сурими)';
UPDATE shared_products SET sodium100 = 750 WHERE name = 'Краб-ролл с творожным сыром';
UPDATE shared_products SET sodium100 = 750 WHERE name = 'Краб-ролл с творожным сыром (Русское море)';
UPDATE shared_products SET sodium100 = 720 WHERE name = 'Краб-ролл с сыром и зеленью';

-- ==========================
-- ВЫПЕЧКА И БЛИНЫ
-- ==========================

UPDATE shared_products SET sodium100 = 340 WHERE name = 'Блины классические';
UPDATE shared_products SET sodium100 = 280 WHERE name = 'Блины овсяные без сахара';
UPDATE shared_products SET sodium100 = 180 WHERE name = 'Вафли домашние';
UPDATE shared_products SET sodium100 = 210 WHERE name = 'Вафли классические (вафельница)';
UPDATE shared_products SET sodium100 = 290 WHERE name = 'Кабачковые оладьи (кабачок, яйцо, мука)';

-- ==========================
-- КОТЛЕТЫ РАСТИТЕЛЬНЫЕ И ОВОЩНЫЕ
-- ==========================

UPDATE shared_products SET sodium100 = 420 WHERE name = 'Котлеты Hi! брокколи и шпинат';
UPDATE shared_products SET sodium100 = 450 WHERE name = 'Котлеты растительные со вкусом курицы Hi';
UPDATE shared_products SET sodium100 = 280 WHERE name = 'Котлеты из цветной капусты Алина';
UPDATE shared_products SET sodium100 = 240 WHERE name = 'Котлеты морковные Алина';
UPDATE shared_products SET sodium100 = 320 WHERE name = 'Котлеты из чечевицы (без муки, мало масла)';

-- ==========================
-- СОУСЫ И ПРИПРАВЫ (очень высокий натрий!)
-- ==========================

UPDATE shared_products SET sodium100 = 1450 WHERE name = 'Аджика неострая';
UPDATE shared_products SET sodium100 = 970 WHERE name = 'Кетчуп томатный Helios';
UPDATE shared_products SET sodium100 = 1200 WHERE name = 'Заправка "Французские пряности и чеснок"';
UPDATE shared_products SET sodium100 = 680 WHERE name = 'Брускетта из вяленых томатов и оливок';

-- ==========================
-- НАПИТКИ
-- ==========================

UPDATE shared_products SET sodium100 = 5 WHERE name = 'Кофе американо';
UPDATE shared_products SET sodium100 = 45 WHERE name = 'Кофе растворимый с молоком 2,5';
UPDATE shared_products SET sodium100 = 42 WHERE name = 'Кофе с молоком (молоко 1,5)';
UPDATE shared_products SET sodium100 = 4 WHERE name = 'Жигулёвское пшеничное';
UPDATE shared_products SET sodium100 = 5 WHERE name = 'Bakalář пиво';
UPDATE shared_products SET sodium100 = 3 WHERE name = 'Two Peaks';

-- ==========================
-- СЛАДОСТИ И ДЕСЕРТЫ
-- ==========================

UPDATE shared_products SET sodium100 = 18 WHERE name = 'Белёвская пастила классическая';
UPDATE shared_products SET sodium100 = 12 WHERE name = 'Варенье Самокат малина';
UPDATE shared_products SET sodium100 = 8 WHERE name = 'Джем абрикосовый Zuegg (без сахара)';
UPDATE shared_products SET sodium100 = 38 WHERE name = 'Конфеты Raffaello';
UPDATE shared_products SET sodium100 = 75 WHERE name = 'Десерт (савоярди, маскарпоне, сливки, мандарины)';
UPDATE shared_products SET sodium100 = 5 WHERE name = 'Кокосовый сахар';
UPDATE shared_products SET sodium100 = 15 WHERE name = 'Кокосовые чипсы';

-- ==========================
-- ПРОТЕИНОВЫЕ БАТОНЧИКИ И СНЕКИ
-- ==========================

UPDATE shared_products SET sodium100 = 210 WHERE name = 'Bootybar Crunch кокосовое печение';
UPDATE shared_products SET sodium100 = 195 WHERE name = 'Bootybar Crunch фисташковый';
UPDATE shared_products SET sodium100 = 205 WHERE name = 'BootyBar карамельный CRUNCH';
UPDATE shared_products SET sodium100 = 180 WHERE name = 'Chika Layers арахис карамель чикалаб';
UPDATE shared_products SET sodium100 = 175 WHERE name = 'Chika Layers фундук и карамель чикалаб';
UPDATE shared_products SET sodium100 = 180 WHERE name = 'Chikalab Chika Layers карамель и арахис Чикалаб';
UPDATE shared_products SET sodium100 = 190 WHERE name = 'Chikalab Chika Layers Crispy Cookies Чикалаб Печенье';
UPDATE shared_products SET sodium100 = 120 WHERE name = 'Chikalab, шоколадно-ореховый десерт';
UPDATE shared_products SET sodium100 = 320 WHERE name = 'Soj Marshick Marshmallow 20 протеина солёная карамель';
UPDATE shared_products SET sodium100 = 85 WHERE name = 'Gречневые палочки Зелёная линия';

-- ==========================
-- ГОТОВЫЕ БЛЮДА И ПОЛУФАБРИКАТЫ
-- ==========================

UPDATE shared_products SET sodium100 = 1780 WHERE name = 'Доширак, говядина';
UPDATE shared_products SET sodium100 = 380 WHERE name = 'Вареники ленивые с сахаром';
UPDATE shared_products SET sodium100 = 750 WHERE name = 'Bionova крем-суп грибной протеиновый';

-- ==========================
-- ДЕТСКОЕ ПИТАНИЕ
-- ==========================

UPDATE shared_products SET sodium100 = 70 WHERE name = 'PediaSure Малоежка ваниль';

-- ==========================
-- РАСТИТЕЛЬНЫЕ НАПИТКИ
-- ==========================

UPDATE shared_products SET sodium100 = 65 WHERE name = 'Planto Фундук и пекан';
UPDATE shared_products SET sodium100 = 55 WHERE name = 'Cafe Au Lait (растворимый)';

-- ==========================
-- ПРОЧЕЕ (неопределённые категории)
-- ==========================

UPDATE shared_products SET sodium100 = 50 WHERE name = 'KPD';
UPDATE shared_products SET sodium100 = 85 WHERE name = 'Gречневые палочки Зелёная линия';

-- Проверим сколько обновлено
SELECT COUNT(*) as updated_count FROM shared_products WHERE sodium100 IS NOT NULL;

-- Выведем продукты без значения sodium100
SELECT name FROM shared_products WHERE sodium100 IS NULL ORDER BY name;

COMMIT;
