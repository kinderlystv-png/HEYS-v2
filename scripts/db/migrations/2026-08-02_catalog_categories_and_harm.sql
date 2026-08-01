-- 2026-08-02 — категории, калибровка вредности и состав жиров.
--
-- Основание: второй проход ревью всеми 399 карточками (восемь параллельных
-- агентов по 50). Здесь применяется только то, что однозначно.
--
-- ЧТО ОТКЛОНЕНО И ПОЧЕМУ
-- Три агента предложили обнулить `complex100` у фруктов и овощей — «крахмала
-- там нет». Это неверно: в этой базе `simple100 + complex100` = ВСЕ углеводы,
-- а `complex100` — «углеводы минус сахара», куда входит и клетчатка.
-- Проверка на эталонах (справочные значения общих углеводов на 100 г):
--   яблоко   11.5 + 2.3  = 13.8  (справочник 13.8)
--   банан    12   + 10.8 = 22.8  (22.8)
--   клубника  4.9 + 2.8  =  7.7  (7.7)
--   финик    66   + 9    = 75    (75)
-- Совпадение до десятых. Обнуление занизило бы калорийность клубники с 36 до
-- 28 ккал и так же у винограда, груши, манго, мандаринов, кураги, изюма.
-- Поэтому переносы sugars↔starch не применяются.
--
-- ЧТО ПРИМЕНЯЕТСЯ
-- 1) категории — по правилам, выведенным из разбора (было: 119 пустых,
--    213 «прочее», реально расставлено 67);
-- 2) вредность — калибровка по единой шкале, которая была выдана агентам:
--    0–1 цельное, 2–3 минимально обработанное, 4–5 обработанное,
--    6–7 сильно обработанное, 8–10 ультраобработанное;
-- 3) состав жиров — там, где пропорция насыщенных перевёрнута относительно
--    сырья (молочный жир ~65% насыщенных, растительные масла ~10–15%).
--    Сумма жира и калорийность при этом не меняются;
-- 4) клетчатка и трансжиры — точечно, где значение физически невозможно.

BEGIN;

-- ── 1. Категории по правилам ───────────────────────────────────────────────
-- Порядок важен: более специфичные правила идут раньше общих.

UPDATE public.shared_products SET category = 'алкоголь'
WHERE name ~* '(вино |вино$|пиво|жигул|bakal|сидр|виски|коньяк|ликёр|шампан|игрист)';

UPDATE public.shared_products SET category = 'спортпит'
WHERE name ~* '(протеин|protein|chika|chikalab|bootybar|booty bar|snaq|fitness ?shock|fitnesshock|whey|exponenta|high.?pro|bombbar|shake|шейк|marshick|kerll)'
  AND name !~* '(гранол)';

UPDATE public.shared_products SET category = 'снеки'
WHERE name ~* '(чипс|начос|сухарик|крутон|палочки солён|saltletts|попкорн|кокосовые чипсы|гренки)';

UPDATE public.shared_products SET category = 'соусы/масла'
WHERE name ~* '(соус|кетчуп|майонез|заправк|ткемали|аджика|песто|масло (сливочн|подсолнеч|оливков|растительн))';

UPDATE public.shared_products SET category = 'напитки'
WHERE name ~* '(кофе|американо|латте|капучино|флэт уайт|квас|морс|лимонад|сок |фреш|напиток|энергетическ|шорле|молоко (миндальн|соев|овсян)|миндальный напиток)'
  AND category NOT IN ('алкоголь', 'спортпит');

UPDATE public.shared_products SET category = 'яйца'
WHERE name ~* '(яйцо|яйца|яичниц|омлет|желток|белок яйца)';

UPDATE public.shared_products SET category = 'рыба/морепродукты'
WHERE name ~* '(рыба|лосось|сёмга|семга|форел|тунец|минтай|треск|сельдь|селёдк|килька|скумбри|горбуша|икра|креветк|кальмар|краб(овые|\b)|сурими|снежный краб)'
  AND name !~* '(ролл|салат|суп|котлет|треугольник)';

UPDATE public.shared_products SET category = 'мясо/птица'
WHERE name ~* '(курин|куриц|индейк|говядин|говяж|свинин|баранин|кролик|утка|стейк|шашлык|антрекот|сало|колбас|сосиск|ветчин|бекон|карпаччо|паштет|холодец|грудка|филе (бедра|куриной))'
  AND name !~* '(салат|суп|котлет|запеканк|рулет|ролл|окрошк|плов|шаурм|сэндвич|бургер|пицц|наггетс|бризоль|люля|тефтел|пельмен|хинкал|фарш|блин)';

UPDATE public.shared_products SET category = 'молочные'
WHERE name ~* '(творог|кефир|йогурт|молоко|сливки|сметана|сыр |сыр$|моцарелл|рикотта|сулугуни|камамбер|фета|пудинг|сгущён)'
  AND name !~* '(сырник|сырные палочки|глазированн|мороженое|пломбир|эскимо|коктейль|напиток|торт|десерт|запеканк)';

UPDATE public.shared_products SET category = 'орехи/семена'
WHERE name ~* '(миндаль|фундук|кешью|фисташк|грецк|орех|семечк|семена|чиа|урбеч|арахис$)'
  AND name !~* '(батончик|паста|масло|напиток|молоко|печень|десерт)';

UPDATE public.shared_products SET category = 'овощи'
WHERE name ~* '(огурец|помидор|томат|капуст|морков|свёкл|кабач|баклажан|перец|шпинат|салат айсберг|брокколи|цветная капуста|фасоль|горошек|овощи|овощной салат|картофель отварн|картошка жарен|картофель жарен)'
  AND name !~* '(суп|котлет|запеканк|салат с|соус|сок|фри|пюре|зраз|оладь)';

UPDATE public.shared_products SET category = 'фрукты/ягоды'
WHERE name ~* '(яблок|банан|груш|апельсин|мандарин|нектарин|персик|киви|виноград|ягод|клубник|малин|черник|голубик|ананас|манго|финик|курага|изюм|авокадо|земляник|фрукты)'
  AND name !~* '(пирог|печень|десерт|сок|фреш|батончик|джем|варень|меренга|торт|мороженое)';

UPDATE public.shared_products SET category = 'крупы/хлеб/макароны'
WHERE name ~* '(хлеб|хлебц|лаваш|греч|овсян|рис |рис$|киноа|булгур|пшён|пшен|перлов|макарон|паста орзо|лапша|соба|удон|мука|отруби|гранол|мюсли|хлопья|тесто фило|фунчоза)'
  AND name !~* '(суп|котлет|салат|батончик|блин|запеканк|каша с|плов|роллы)';

UPDATE public.shared_products SET category = 'сладости/выпечка'
WHERE name ~* '(печень|торт|пирожн|пирог|кекс|булк|круассан|вафл|эклер|профитрол|пончик|оладь|блин|сырок|мороженое|пломбир|эскимо|шоколад|конфет|сникерс|киндер|мёд|мед$|сахар|сироп|джем|варень|пастил|кулич|паска|меренга|десерт|топпинг|бисквит|сгущ.нное молоко)'
  AND category <> 'спортпит';

UPDATE public.shared_products SET category = 'готовые блюда'
WHERE name ~* '(салат |суп |борщ|окрошк|котлет|запеканк|рулетик|ролл|роллы|онигири|плов|шаурм|сэндвич|бургер|пицц|наггетс|бризоль|люля|тефтел|пельмен|хинкал|вареник|зраз|пюре|фри|шампиньоны|том ям|гамбургер|мясо по-французски|блины с|овсяноблин|сырники|сырные палочки|треугольник|фарш )'
  AND category NOT IN ('спортпит');

-- Остаток без категории — «прочее».
UPDATE public.shared_products SET category = 'прочее'
WHERE category IS NULL OR btrim(category) = '';

-- ── 2. Калибровка вредности ────────────────────────────────────────────────
-- Занижено: переработанное мясо, кондитерка, снеки, сладкие напитки, спортпит.
UPDATE public.shared_products SET harm = 7 WHERE name ~* '(колбаса докторская|краковская)';
UPDATE public.shared_products SET harm = 6 WHERE name ~* '(колбаса сабросо|крабовые палочки \(сурими\)|снежный краб|солёные палочки|сырные палочки)';
UPDATE public.shared_products SET harm = 8 WHERE name ~* '(картофель фри|начос)';
UPDATE public.shared_products SET harm = 7 WHERE name ~* '(кекс сдобн|печенье cookie|печенье кунжутное|юбилейное|яблочный пирог|шаурма классическ)';
UPDATE public.shared_products SET harm = 6 WHERE name ~* '(квас |морс сладк|гранола шоколадн)';
UPDATE public.shared_products SET harm = 5 WHERE name ~* '(ветчина|грудка копчёная|карпаччо|мясо по-французски|окрошка с колбасой|салат крабовый|салат с копчёной|краб-ролл с сыром|напиток молочный)';
UPDATE public.shared_products SET harm = 4 WHERE name ~* '(лаваш|мука пшеничная|подсолнечное масло рафинирован|индейка вяленая|сырник|мороженое молочное|флэт уайт|тесто фило|топпинг сгущ|сыр лёгкий)';
UPDATE public.shared_products SET harm = 4 WHERE category = 'спортпит' AND harm < 3;
UPDATE public.shared_products SET harm = 3 WHERE name ~* '(макароны|хлебцы|удон|протеин whey|котлеты hi)' AND harm < 2;

-- Завышено: жирность и натуральный сахар вредностью не являются.
UPDATE public.shared_products SET harm = 3 WHERE name ~* '(масло сливочное|сало солёное|семушка|изюм)' AND harm > 5;
UPDATE public.shared_products SET harm = 7 WHERE name ~* '(вафли домашние)' AND harm > 8;
UPDATE public.shared_products SET harm = 5 WHERE name ~* '(печенье финиковое|chikalab, шоколадно)' AND harm > 7;
UPDATE public.shared_products SET harm = 6.5 WHERE name ~* '(соус чесночный низкокалорийн)' AND harm > 8;
UPDATE public.shared_products SET harm = 3 WHERE name ~* '(тефтели классическ)' AND harm > 5;
UPDATE public.shared_products SET harm = 1 WHERE name ~* '(желток яйца варёный)' AND harm > 2;

-- ── 3. Перевёрнутая пропорция жиров ────────────────────────────────────────
-- Молочный жир: насыщенных примерно вдвое больше ненасыщенных.
UPDATE public.shared_products SET badfat100 = 1.0,  goodfat100 = 0.5 WHERE name = 'Молоко 1,5';
UPDATE public.shared_products SET badfat100 = 1.5,  goodfat100 = 0.8 WHERE name = 'Молоко 2,5';
UPDATE public.shared_products SET badfat100 = 1.6,  goodfat100 = 0.9 WHERE name ~* '^Кефир 2,5';
UPDATE public.shared_products SET badfat100 = 0.9,  goodfat100 = 0.5 WHERE name ~* 'Кофе с молоком \(молоко 1,5\)';
UPDATE public.shared_products SET badfat100 = 1.3,  goodfat100 = 0.7 WHERE name = 'Творог 2';
UPDATE public.shared_products SET badfat100 = 6.5,  goodfat100 = 5.5 WHERE name ~* 'Творожный сыр с авокадо';
UPDATE public.shared_products SET badfat100 = 4.0,  goodfat100 = 2.1 WHERE name = 'Паска 1';
UPDATE public.shared_products SET badfat100 = 2.7,  goodfat100 = 1.5 WHERE name = 'Паска 2';
UPDATE public.shared_products SET badfat100 = 7.6,  goodfat100 = 5.1 WHERE name ~* 'ПП пирожки из творога';
UPDATE public.shared_products SET badfat100 = 8.0,  goodfat100 = 3.0 WHERE name ~* 'Cafe Au Lait';
UPDATE public.shared_products SET badfat100 = 9.5,  goodfat100 = 1.0 WHERE name ~* '3в1';

-- Растительное сырьё: насыщенных заметно меньше ненасыщенных.
UPDATE public.shared_products SET badfat100 = 0.1,  goodfat100 = 0.9  WHERE name ~* 'Planto Фундук';
UPDATE public.shared_products SET badfat100 = 9.0,  goodfat100 = 66.0 WHERE name ~* 'Майонез Провансаль';
UPDATE public.shared_products SET badfat100 = 4.8,  goodfat100 = 27.2 WHERE name ~* 'Пшеничные гренки';
UPDATE public.shared_products SET badfat100 = 0.7,  goodfat100 = 2.8  WHERE name ~* 'Мука из зелёной гречки';
UPDATE public.shared_products SET badfat100 = 2.8,  goodfat100 = 3.7  WHERE name ~* 'Котлета свино-говяжья';
UPDATE public.shared_products SET badfat100 = 3.0,  goodfat100 = 5.0  WHERE name ~* 'BootyBar карамельный';
UPDATE public.shared_products SET badfat100 = 3.5,  goodfat100 = 9.5  WHERE name ~* 'Пончик глазированный';

-- ── 4. Физически невозможные значения ──────────────────────────────────────
UPDATE public.shared_products SET fiber100 = 6.4 WHERE name ~* 'Фасоль красная натуральная' AND fiber100 = 0;
UPDATE public.shared_products SET fiber100 = 1.5 WHERE name ~* 'Печенье Бегемотик' AND fiber100 = 0;
UPDATE public.shared_products SET trans100 = 0   WHERE name ~* '(Хлеб Солнечный|Горбуша натуральная|Желток яйца)' AND trans100 > 0;

COMMIT;

-- ПРОВЕРКА ПОСЛЕ:
--   SELECT category, count(*) FROM shared_products GROUP BY 1 ORDER BY 2 DESC;
--   -- «прочее» должно стать заметно меньше 213
--   SELECT count(*) FROM shared_products WHERE category IS NULL OR btrim(category)='';
--   -- ожидаем 0
--
-- Отпечатки пересчитываются триггером автоматически.
-- ОТКАТ: восстановление из бэкапа каталога, снятого перед применением.
BEGIN;
UPDATE public.shared_products SET category='алкоголь' WHERE name ~* '(жигул|пиво|вино полусл|сидр)';
UPDATE public.shared_products SET category='напитки'
 WHERE category='прочее' AND name ~* '(напиток|энергетическ|квас|лимонад|фреш|сок |cafe au lait|какао|кофе|чай|шорле|pediasure)';
UPDATE public.shared_products SET category='сладости/выпечка'
 WHERE category='прочее' AND name ~* '(бисквит|кекс|киндер|кулич|батончик миндальн|миндальный батончик|молочный крем|вафельн|шоколад|конфет|пастил|сладк)';
UPDATE public.shared_products SET category='готовые блюда'
 WHERE category='прочее' AND name ~* '(гамбургер|фри|котлет|запеканк|зраз|наггетс|онигири|фарш|грибы тушён|плов|роллы|салат|суп|пельмен|шаурм|сэндвич|пицц|блин|окрошк|рулетик|пюре|холодец|хинкал|том ям|удон|фунчоза|тушён|запечённ|жарен|отварн|на гриле|на мангале|в сливках|в подливе|в томате|с овощами)';
UPDATE public.shared_products SET category='фрукты/ягоды' WHERE category='прочее' AND name ~* '(ананас|фрукт|ягод)';
UPDATE public.shared_products SET category='снеки' WHERE category='прочее' AND name ~* '(палочки сладкие|кукурузные палочки)';
COMMIT;
BEGIN;
UPDATE public.shared_products SET category='сладости/выпечка'
 WHERE category='прочее' AND name ~* '(печенье|торт|пломбир|эклер|профитрол|пирожн)';
UPDATE public.shared_products SET category='овощи' WHERE category='прочее' AND name ~* 'томаты';
UPDATE public.shared_products SET category='молочные' WHERE category='прочее' AND name ~* 'творожный продукт';
UPDATE public.shared_products SET category='готовые блюда' WHERE category='прочее' AND name ~* '(шримп ролл|праздничная еда)';
UPDATE public.shared_products SET category='крупы/хлеб/макароны' WHERE category='прочее' AND name ~* 'настин сластин';
COMMIT;

-- Догоняющие прогоны выше добавлены после первого применения: условия вида
-- `category NOT IN (...)` не срабатывали для строк с NULL в категории
-- (NULL NOT IN даёт NULL, то есть ложь), а «Жигулёвское пшеничное» перехватывало
-- правило круп по подстроке «пшен». Итог: «прочее» осталось только у двух
-- нераспознаваемых названий (KPD, Two Peaks).
