-- Migration: Update sodium100 values for all shared products
-- Date: 2026-01-18
-- Description: Set correct sodium values (mg per 100g) based on scientific data

-- Молочные продукты
UPDATE shared_products SET sodium100 = 50 WHERE name = 'Молоко 2,5%';
UPDATE shared_products SET sodium100 = 50 WHERE name = 'Молоко 3,2%';
UPDATE shared_products SET sodium100 = 52 WHERE name = 'Кефир 1%';
UPDATE shared_products SET sodium100 = 52 WHERE name = 'Кефир 2,5%';
UPDATE shared_products SET sodium100 = 50 WHERE name = 'Ряженка 4%';
UPDATE shared_products SET sodium100 = 41 WHERE name = 'Творог 0%';
UPDATE shared_products SET sodium100 = 41 WHERE name = 'Творог 2%';
UPDATE shared_products SET sodium100 = 41 WHERE name = 'Творог 5%';
UPDATE shared_products SET sodium100 = 41 WHERE name = 'Творог 9%';
UPDATE shared_products SET sodium100 = 35 WHERE name = 'Сметана 10%';
UPDATE shared_products SET sodium100 = 35 WHERE name = 'Сметана 15%';
UPDATE shared_products SET sodium100 = 35 WHERE name = 'Сметана 20%';
UPDATE shared_products SET sodium100 = 46 WHERE name = 'Йогурт натуральный';
UPDATE shared_products SET sodium100 = 47 WHERE name = 'Йогурт греческий';
UPDATE shared_products SET sodium100 = 11 WHERE name = 'Масло сливочное';

-- Сыры (высокое содержание натрия!)
UPDATE shared_products SET sodium100 = 810 WHERE name = 'Сыр Российский';
UPDATE shared_products SET sodium100 = 819 WHERE name = 'Сыр Голландский';
UPDATE shared_products SET sodium100 = 627 WHERE name = 'Сыр Моцарелла';
UPDATE shared_products SET sodium100 = 1529 WHERE name = 'Сыр Пармезан';
UPDATE shared_products SET sodium100 = 1116 WHERE name = 'Сыр Фета';
UPDATE shared_products SET sodium100 = 1169 WHERE name = 'Сыр плавленый';
UPDATE shared_products SET sodium100 = 629 WHERE name = 'Сыр Бри';
UPDATE shared_products SET sodium100 = 621 WHERE name = 'Сыр Чеддер';
UPDATE shared_products SET sodium100 = 470 WHERE name = 'Сыр Адыгейский';

-- Яйца
UPDATE shared_products SET sodium100 = 142 WHERE name = 'Яйцо куриное';
UPDATE shared_products SET sodium100 = 166 WHERE name = 'Белок яичный';
UPDATE shared_products SET sodium100 = 51 WHERE name = 'Желток яичный';

-- Мясо
UPDATE shared_products SET sodium100 = 74 WHERE name = 'Куриная грудка';
UPDATE shared_products SET sodium100 = 84 WHERE name = 'Куриное бедро';
UPDATE shared_products SET sodium100 = 59 WHERE name = 'Говядина';
UPDATE shared_products SET sodium100 = 66 WHERE name = 'Говяжий фарш';
UPDATE shared_products SET sodium100 = 62 WHERE name = 'Свинина';
UPDATE shared_products SET sodium100 = 65 WHERE name = 'Свиной фарш';
UPDATE shared_products SET sodium100 = 63 WHERE name = 'Индейка грудка';
UPDATE shared_products SET sodium100 = 77 WHERE name = 'Индейка бедро';
UPDATE shared_products SET sodium100 = 72 WHERE name = 'Баранина';
UPDATE shared_products SET sodium100 = 89 WHERE name = 'Телятина';
UPDATE shared_products SET sodium100 = 69 WHERE name = 'Печень говяжья';
UPDATE shared_products SET sodium100 = 71 WHERE name = 'Печень куриная';

-- Колбасные изделия (ОЧЕНЬ высокое содержание натрия!)
UPDATE shared_products SET sodium100 = 828 WHERE name = 'Колбаса вареная';
UPDATE shared_products SET sodium100 = 1870 WHERE name = 'Колбаса копченая';
UPDATE shared_products SET sodium100 = 911 WHERE name = 'Сосиски';
UPDATE shared_products SET sodium100 = 1203 WHERE name = 'Ветчина';
UPDATE shared_products SET sodium100 = 1717 WHERE name = 'Бекон';
UPDATE shared_products SET sodium100 = 957 WHERE name = 'Сардельки';

-- Рыба и морепродукты
UPDATE shared_products SET sodium100 = 59 WHERE name = 'Лосось';
UPDATE shared_products SET sodium100 = 52 WHERE name = 'Форель';
UPDATE shared_products SET sodium100 = 78 WHERE name = 'Треска';
UPDATE shared_products SET sodium100 = 75 WHERE name = 'Минтай';
UPDATE shared_products SET sodium100 = 39 WHERE name = 'Тунец';
UPDATE shared_products SET sodium100 = 90 WHERE name = 'Скумбрия';
UPDATE shared_products SET sodium100 = 98 WHERE name = 'Сельдь';
UPDATE shared_products SET sodium100 = 566 WHERE name = 'Креветки';
UPDATE shared_products SET sodium100 = 198 WHERE name = 'Кальмар';
UPDATE shared_products SET sodium100 = 369 WHERE name = 'Мидии';
UPDATE shared_products SET sodium100 = 1500 WHERE name = 'Икра красная';
UPDATE shared_products SET sodium100 = 1880 WHERE name = 'Рыба красная соленая';

-- Крупы
UPDATE shared_products SET sodium100 = 5 WHERE name = 'Рис белый';
UPDATE shared_products SET sodium100 = 7 WHERE name = 'Рис бурый';
UPDATE shared_products SET sodium100 = 3 WHERE name = 'Гречка';
UPDATE shared_products SET sodium100 = 2 WHERE name = 'Овсянка';
UPDATE shared_products SET sodium100 = 3 WHERE name = 'Пшено';
UPDATE shared_products SET sodium100 = 4 WHERE name = 'Перловка';
UPDATE shared_products SET sodium100 = 17 WHERE name = 'Булгур';
UPDATE shared_products SET sodium100 = 5 WHERE name = 'Кускус';
UPDATE shared_products SET sodium100 = 7 WHERE name = 'Киноа';
UPDATE shared_products SET sodium100 = 1 WHERE name = 'Манка';

-- Макароны и хлеб
UPDATE shared_products SET sodium100 = 6 WHERE name = 'Макароны';
UPDATE shared_products SET sodium100 = 6 WHERE name = 'Спагетти';
UPDATE shared_products SET sodium100 = 491 WHERE name = 'Хлеб белый';
UPDATE shared_products SET sodium100 = 610 WHERE name = 'Хлеб черный';
UPDATE shared_products SET sodium100 = 450 WHERE name = 'Хлеб цельнозерновой';
UPDATE shared_products SET sodium100 = 520 WHERE name = 'Батон';
UPDATE shared_products SET sodium100 = 536 WHERE name = 'Лаваш';

-- Овощи
UPDATE shared_products SET sodium100 = 6 WHERE name = 'Картофель';
UPDATE shared_products SET sodium100 = 69 WHERE name = 'Морковь';
UPDATE shared_products SET sodium100 = 78 WHERE name = 'Свекла';
UPDATE shared_products SET sodium100 = 18 WHERE name = 'Капуста белокочанная';
UPDATE shared_products SET sodium100 = 30 WHERE name = 'Капуста цветная';
UPDATE shared_products SET sodium100 = 33 WHERE name = 'Брокколи';
UPDATE shared_products SET sodium100 = 2 WHERE name = 'Огурец';
UPDATE shared_products SET sodium100 = 5 WHERE name = 'Помидор';
UPDATE shared_products SET sodium100 = 4 WHERE name = 'Перец болгарский';
UPDATE shared_products SET sodium100 = 4 WHERE name = 'Лук репчатый';
UPDATE shared_products SET sodium100 = 17 WHERE name = 'Чеснок';
UPDATE shared_products SET sodium100 = 2 WHERE name = 'Баклажан';
UPDATE shared_products SET sodium100 = 8 WHERE name = 'Кабачок';
UPDATE shared_products SET sodium100 = 1 WHERE name = 'Тыква';
UPDATE shared_products SET sodium100 = 79 WHERE name = 'Шпинат';
UPDATE shared_products SET sodium100 = 28 WHERE name = 'Салат';
UPDATE shared_products SET sodium100 = 39 WHERE name = 'Редис';
UPDATE shared_products SET sodium100 = 80 WHERE name = 'Сельдерей';
UPDATE shared_products SET sodium100 = 5 WHERE name = 'Зеленый горошек';
UPDATE shared_products SET sodium100 = 6 WHERE name = 'Фасоль стручковая';
UPDATE shared_products SET sodium100 = 15 WHERE name = 'Кукуруза';

-- Бобовые
UPDATE shared_products SET sodium100 = 2 WHERE name = 'Фасоль красная';
UPDATE shared_products SET sodium100 = 2 WHERE name = 'Фасоль белая';
UPDATE shared_products SET sodium100 = 6 WHERE name = 'Чечевица';
UPDATE shared_products SET sodium100 = 24 WHERE name = 'Нут';
UPDATE shared_products SET sodium100 = 5 WHERE name = 'Горох';
UPDATE shared_products SET sodium100 = 2 WHERE name = 'Соя';

-- Фрукты
UPDATE shared_products SET sodium100 = 1 WHERE name = 'Яблоко';
UPDATE shared_products SET sodium100 = 1 WHERE name = 'Груша';
UPDATE shared_products SET sodium100 = 1 WHERE name = 'Банан';
UPDATE shared_products SET sodium100 = 0 WHERE name = 'Апельсин';
UPDATE shared_products SET sodium100 = 2 WHERE name = 'Мандарин';
UPDATE shared_products SET sodium100 = 0 WHERE name = 'Грейпфрут';
UPDATE shared_products SET sodium100 = 2 WHERE name = 'Лимон';
UPDATE shared_products SET sodium100 = 3 WHERE name = 'Киви';
UPDATE shared_products SET sodium100 = 1 WHERE name = 'Ананас';
UPDATE shared_products SET sodium100 = 1 WHERE name = 'Манго';
UPDATE shared_products SET sodium100 = 0 WHERE name = 'Персик';
UPDATE shared_products SET sodium100 = 1 WHERE name = 'Абрикос';
UPDATE shared_products SET sodium100 = 0 WHERE name = 'Слива';
UPDATE shared_products SET sodium100 = 2 WHERE name = 'Виноград';
UPDATE shared_products SET sodium100 = 1 WHERE name = 'Арбуз';
UPDATE shared_products SET sodium100 = 16 WHERE name = 'Дыня';
UPDATE shared_products SET sodium100 = 1 WHERE name = 'Клубника';
UPDATE shared_products SET sodium100 = 1 WHERE name = 'Малина';
UPDATE shared_products SET sodium100 = 1 WHERE name = 'Черника';
UPDATE shared_products SET sodium100 = 0 WHERE name = 'Вишня';
UPDATE shared_products SET sodium100 = 3 WHERE name = 'Гранат';
UPDATE shared_products SET sodium100 = 1 WHERE name = 'Хурма';
UPDATE shared_products SET sodium100 = 7 WHERE name = 'Авокадо';

-- Сухофрукты
UPDATE shared_products SET sodium100 = 11 WHERE name = 'Изюм';
UPDATE shared_products SET sodium100 = 10 WHERE name = 'Курага';
UPDATE shared_products SET sodium100 = 2 WHERE name = 'Чернослив';
UPDATE shared_products SET sodium100 = 1 WHERE name = 'Финики';
UPDATE shared_products SET sodium100 = 10 WHERE name = 'Инжир сушеный';

-- Орехи и семена
UPDATE shared_products SET sodium100 = 2 WHERE name = 'Грецкий орех';
UPDATE shared_products SET sodium100 = 1 WHERE name = 'Миндаль';
UPDATE shared_products SET sodium100 = 0 WHERE name = 'Фундук';
UPDATE shared_products SET sodium100 = 12 WHERE name = 'Кешью';
UPDATE shared_products SET sodium100 = 18 WHERE name = 'Арахис';
UPDATE shared_products SET sodium100 = 1 WHERE name = 'Фисташки';
UPDATE shared_products SET sodium100 = 9 WHERE name = 'Семечки подсолнечника';
UPDATE shared_products SET sodium100 = 7 WHERE name = 'Семена тыквы';
UPDATE shared_products SET sodium100 = 16 WHERE name = 'Семена чиа';
UPDATE shared_products SET sodium100 = 30 WHERE name = 'Семена льна';
UPDATE shared_products SET sodium100 = 2 WHERE name = 'Кедровый орех';

-- Масла
UPDATE shared_products SET sodium100 = 0 WHERE name = 'Масло подсолнечное';
UPDATE shared_products SET sodium100 = 2 WHERE name = 'Масло оливковое';
UPDATE shared_products SET sodium100 = 0 WHERE name = 'Масло кокосовое';
UPDATE shared_products SET sodium100 = 0 WHERE name = 'Масло льняное';

-- Сладости
UPDATE shared_products SET sodium100 = 0 WHERE name = 'Сахар';
UPDATE shared_products SET sodium100 = 4 WHERE name = 'Мед';
UPDATE shared_products SET sodium100 = 79 WHERE name = 'Шоколад молочный';
UPDATE shared_products SET sodium100 = 20 WHERE name = 'Шоколад темный';
UPDATE shared_products SET sodium100 = 9 WHERE name = 'Варенье';
UPDATE shared_products SET sodium100 = 32 WHERE name = 'Джем';
UPDATE shared_products SET sodium100 = 80 WHERE name = 'Мороженое';
UPDATE shared_products SET sodium100 = 340 WHERE name = 'Печенье';
UPDATE shared_products SET sodium100 = 270 WHERE name = 'Торт';
UPDATE shared_products SET sodium100 = 290 WHERE name = 'Пирожное';
UPDATE shared_products SET sodium100 = 120 WHERE name = 'Конфеты';
UPDATE shared_products SET sodium100 = 80 WHERE name = 'Зефир';
UPDATE shared_products SET sodium100 = 65 WHERE name = 'Пастила';
UPDATE shared_products SET sodium100 = 87 WHERE name = 'Халва';

-- Напитки
UPDATE shared_products SET sodium100 = 1 WHERE name = 'Сок апельсиновый';
UPDATE shared_products SET sodium100 = 4 WHERE name = 'Сок яблочный';
UPDATE shared_products SET sodium100 = 200 WHERE name = 'Сок томатный';
UPDATE shared_products SET sodium100 = 5 WHERE name = 'Компот';
UPDATE shared_products SET sodium100 = 3 WHERE name = 'Морс';
UPDATE shared_products SET sodium100 = 3 WHERE name = 'Чай черный';
UPDATE shared_products SET sodium100 = 1 WHERE name = 'Чай зеленый';
UPDATE shared_products SET sodium100 = 2 WHERE name = 'Кофе';
UPDATE shared_products SET sodium100 = 21 WHERE name = 'Какао';

-- Соусы и приправы (высокое содержание натрия!)
UPDATE shared_products SET sodium100 = 635 WHERE name = 'Майонез';
UPDATE shared_products SET sodium100 = 635 WHERE name = 'Майонез Провансаль';
UPDATE shared_products SET sodium100 = 907 WHERE name = 'Кетчуп';
UPDATE shared_products SET sodium100 = 1135 WHERE name = 'Горчица';
UPDATE shared_products SET sodium100 = 5637 WHERE name = 'Соевый соус';
UPDATE shared_products SET sodium100 = 38758 WHERE name = 'Соль';
UPDATE shared_products SET sodium100 = 2 WHERE name = 'Уксус';

-- Консервы (высокое содержание натрия!)
UPDATE shared_products SET sodium100 = 520 WHERE name = 'Тушенка говяжья';
UPDATE shared_products SET sodium100 = 545 WHERE name = 'Тушенка свиная';
UPDATE shared_products SET sodium100 = 635 WHERE name = 'Шпроты';
UPDATE shared_products SET sodium100 = 505 WHERE name = 'Сардины в масле';
UPDATE shared_products SET sodium100 = 354 WHERE name = 'Тунец консервированный';
UPDATE shared_products SET sodium100 = 295 WHERE name = 'Горошек консервированный';
UPDATE shared_products SET sodium100 = 270 WHERE name = 'Кукуруза консервированная';
UPDATE shared_products SET sodium100 = 405 WHERE name = 'Фасоль консервированная';
UPDATE shared_products SET sodium100 = 1111 WHERE name = 'Огурцы соленые';
UPDATE shared_products SET sodium100 = 560 WHERE name = 'Помидоры маринованные';
UPDATE shared_products SET sodium100 = 1556 WHERE name = 'Оливки';
UPDATE shared_products SET sodium100 = 735 WHERE name = 'Маслины';

-- Фастфуд и полуфабрикаты
UPDATE shared_products SET sodium100 = 420 WHERE name = 'Пельмени';
UPDATE shared_products SET sodium100 = 380 WHERE name = 'Вареники';
UPDATE shared_products SET sodium100 = 450 WHERE name = 'Котлеты';
UPDATE shared_products SET sodium100 = 300 WHERE name = 'Блины';
UPDATE shared_products SET sodium100 = 598 WHERE name = 'Пицца';
UPDATE shared_products SET sodium100 = 670 WHERE name = 'Бургер';
UPDATE shared_products SET sodium100 = 525 WHERE name = 'Чипсы';
UPDATE shared_products SET sodium100 = 720 WHERE name = 'Сухарики';
UPDATE shared_products SET sodium100 = 1875 WHERE name = 'Лапша быстрого приготовления';

-- Готовые блюда
UPDATE shared_products SET sodium100 = 480 WHERE name = 'Борщ';
UPDATE shared_products SET sodium100 = 460 WHERE name = 'Щи';
UPDATE shared_products SET sodium100 = 620 WHERE name = 'Солянка';
UPDATE shared_products SET sodium100 = 380 WHERE name = 'Окрошка';
UPDATE shared_products SET sodium100 = 420 WHERE name = 'Плов';
UPDATE shared_products SET sodium100 = 380 WHERE name = 'Паста болоньезе';
UPDATE shared_products SET sodium100 = 510 WHERE name = 'Оливье';
UPDATE shared_products SET sodium100 = 390 WHERE name = 'Винегрет';
UPDATE shared_products SET sodium100 = 520 WHERE name = 'Греческий салат';
UPDATE shared_products SET sodium100 = 610 WHERE name = 'Цезарь';

-- Выпечка
UPDATE shared_products SET sodium100 = 280 WHERE name = 'Круассан';
UPDATE shared_products SET sodium100 = 330 WHERE name = 'Булочка';
UPDATE shared_products SET sodium100 = 400 WHERE name = 'Пирожок';
UPDATE shared_products SET sodium100 = 510 WHERE name = 'Хачапури';
UPDATE shared_products SET sodium100 = 480 WHERE name = 'Самса';
UPDATE shared_products SET sodium100 = 440 WHERE name = 'Чебурек';

-- Каши готовые
UPDATE shared_products SET sodium100 = 4 WHERE name = 'Каша овсяная';
UPDATE shared_products SET sodium100 = 5 WHERE name = 'Каша гречневая';
UPDATE shared_products SET sodium100 = 7 WHERE name = 'Каша рисовая';
UPDATE shared_products SET sodium100 = 50 WHERE name = 'Каша манная';
UPDATE shared_products SET sodium100 = 5 WHERE name = 'Каша пшенная';

-- Молочные десерты
UPDATE shared_products SET sodium100 = 60 WHERE name = 'Творожная масса';
UPDATE shared_products SET sodium100 = 150 WHERE name = 'Сырок глазированный';
UPDATE shared_products SET sodium100 = 120 WHERE name = 'Пудинг';

-- Прочее
UPDATE shared_products SET sodium100 = 7 WHERE name = 'Тофу';
UPDATE shared_products SET sodium100 = 51 WHERE name = 'Соевое молоко';
UPDATE shared_products SET sodium100 = 57 WHERE name = 'Миндальное молоко';
UPDATE shared_products SET sodium100 = 47 WHERE name = 'Овсяное молоко';
UPDATE shared_products SET sodium100 = 190 WHERE name = 'Протеин сывороточный';

-- Гранола и мюсли
UPDATE shared_products SET sodium100 = 12 WHERE name ILIKE '%гранола%';
UPDATE shared_products SET sodium100 = 45 WHERE name ILIKE '%мюсли%';

-- Хлебцы
UPDATE shared_products SET sodium100 = 350 WHERE name ILIKE '%хлебц%';

-- Батончики
UPDATE shared_products SET sodium100 = 150 WHERE name ILIKE '%батончик%';

-- Для всех продуктов где sodium100 все еще NULL - ставим 0
UPDATE shared_products SET sodium100 = 0 WHERE sodium100 IS NULL;

-- Проверим результат
SELECT name, sodium100 FROM shared_products ORDER BY sodium100 DESC LIMIT 20;
