-- 2026-08-02 — категория новых продуктов проставляется сервером.
--
-- ПРОБЛЕМА
-- Категории по каталогу расставлены разовой миграцией
-- (`2026-08-02_catalog_categories_and_harm.sql`), а автоматики для НОВЫХ
-- продуктов нет. Первый же продукт, созданный после неё — «Let's Go Protein
-- Hi-Pro Cocktail карамель (Дамол)», 2026-08-02 01:06 через MCP — приехал с
-- пустой категорией.
--
-- Раньше это было бы косметикой, но с 2026-08-02 поиск читает поле категории
-- (`heys_smart_search_v2.js`, `findCategoryProducts`), поэтому продукт без неё
-- не находится запросом «спортпит» или «напитки» — только запасным путём по
-- ключевым словам в названии.
--
-- РЕШЕНИЕ
-- Тот же приём, что с отпечатками: вычисление переносится на сервер, поэтому
-- работает при любом пути записи — веб, MCP, REST, миграция. Правила ровно те
-- же, что применялись к каталогу разово, вынесены в функцию, чтобы существовать
-- в одном экземпляре, а не копией в каждой миграции.
--
-- Категория проставляется ТОЛЬКО когда её не передали. Явно переданное
-- значение не трогается: сервер подставляет недостающее, а не переучивает
-- куратора.

BEGIN;

CREATE OR REPLACE FUNCTION public.detect_product_category(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO public, pg_temp
AS $$
  -- Порядок важен: более специфичные правила раньше общих. Готовое блюдо
  -- проверяется до сырья, иначе «Мясо по-французски» станет мясом, а
  -- «Салат с тунцом» — рыбой.
  SELECT CASE
    WHEN p_name ~* '(вино |вино$|пиво|жигул|bakal|сидр|виски|коньяк|ликёр|шампан|игрист)' THEN 'алкоголь'
    WHEN p_name ~* '(протеин|protein|chika|bootybar|booty bar|snaq|fitness ?shock|whey|exponenta|high.?pro|hi-pro|bombbar|шейк|kerll)'
         AND p_name !~* 'гранол' THEN 'спортпит'
    WHEN p_name ~* '(чипс|начос|сухарик|крутон|попкорн|гренк)' THEN 'снеки'
    WHEN p_name ~* '(соус|кетчуп|майонез|заправк|ткемали|аджика|песто|масло (сливочн|подсолнеч|оливков|растительн))' THEN 'соусы/масла'
    WHEN p_name ~* '(салат |суп |борщ|окрошк|котлет|запеканк|рулетик|ролл|онигири|плов|шаурм|сэндвич|бургер|пицц|наггетс|бризоль|люля|тефтел|пельмен|хинкал|вареник|зраз|пюре|фри|том ям|гамбургер|мясо по-французски|овсяноблин|сырник|треугольник|фарш )' THEN 'готовые блюда'
    WHEN p_name ~* '(кофе|американо|латте|капучино|флэт уайт|квас|морс|лимонад|сок |фреш|напиток|коктейль|cocktail|энергетическ|шорле)' THEN 'напитки'
    WHEN p_name ~* '(яйцо|яйца|яичниц|омлет|желток|белок яйца)' THEN 'яйца'
    WHEN p_name ~* '(рыба|лосось|сёмга|семга|форел|тунец|минтай|треск|сельдь|селёдк|килька|скумбри|горбуша|икра|креветк|кальмар|краб|сурими)' THEN 'рыба/морепродукты'
    WHEN p_name ~* '(курин|куриц|индейк|говядин|говяж|свинин|баранин|кролик|утка|стейк|шашлык|антрекот|сало|колбас|сосиск|ветчин|бекон|карпаччо|паштет|холодец|грудка)' THEN 'мясо/птица'
    WHEN p_name ~* '(творог|кефир|йогурт|молоко|сливки|сметана|сыр |сыр$|моцарелл|рикотта|сулугуни|камамбер|фета|сгущён)' THEN 'молочные'
    WHEN p_name ~* '(миндаль|фундук|кешью|фисташк|грецк|орех|семечк|семена|чиа|урбеч)' THEN 'орехи/семена'
    WHEN p_name ~* '(огурец|помидор|томат|капуст|морков|свёкл|кабач|баклажан|перец|шпинат|брокколи|фасоль|горошек|овощи)' THEN 'овощи'
    WHEN p_name ~* '(яблок|банан|груш|апельсин|мандарин|нектарин|персик|киви|виноград|ягод|клубник|малин|черник|голубик|ананас|манго|финик|курага|изюм|авокадо)' THEN 'фрукты/ягоды'
    WHEN p_name ~* '(хлеб|хлебц|лаваш|греч|овсян|рис |рис$|киноа|булгур|пшён|перлов|макарон|лапша|соба|удон|мука|отруби|гранол|мюсли|хлопья|фунчоза)' THEN 'крупы/хлеб/макароны'
    WHEN p_name ~* '(печенье|торт|пирожн|пирог|кекс|булк|круассан|вафл|эклер|профитрол|пончик|оладь|блин|сырок|мороженое|пломбир|эскимо|шоколад|конфет|мёд|сахар|сироп|джем|варень|пастил|кулич|паска|меренга|десерт|топпинг|бисквит)' THEN 'сладости/выпечка'
    ELSE 'прочее'
  END;
$$;

COMMENT ON FUNCTION public.detect_product_category(text) IS
  'Категория продукта по названию. Единственное место с этими правилами: используется триггером на shared_products.';

CREATE OR REPLACE FUNCTION public.shared_products_set_category()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO public, pg_temp
AS $$
BEGIN
  -- Только если категорию не передали: явный выбор куратора сохраняется.
  IF NEW.category IS NULL OR btrim(NEW.category) = '' THEN
    NEW.category := public.detect_product_category(COALESCE(NEW.name, ''));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_shared_products_set_category ON public.shared_products;

CREATE TRIGGER trg_shared_products_set_category
  BEFORE INSERT OR UPDATE ON public.shared_products
  FOR EACH ROW
  EXECUTE FUNCTION public.shared_products_set_category();

-- Досыпать категорию тем, у кого её нет сейчас (на 2026-08-02 это одна
-- карточка — протеиновый коктейль, созданный после разовой миграции).
UPDATE public.shared_products
SET category = public.detect_product_category(name)
WHERE category IS NULL OR btrim(category) = '';

COMMIT;

-- ПРОВЕРКА ПОСЛЕ:
--   SELECT count(*) FROM shared_products WHERE category IS NULL OR btrim(category)='';
--   -- ожидаем 0
--
--   -- живая проверка автоподстановки (в транзакции с ROLLBACK):
--   BEGIN;
--   UPDATE shared_products SET category = '' WHERE name ILIKE '%Hi-Pro Cocktail%';
--   SELECT name, category FROM shared_products WHERE name ILIKE '%Hi-Pro Cocktail%';
--   -- ожидаем «спортпит», а не пустую строку
--   ROLLBACK;
--
-- ОТКАТ:
--   DROP TRIGGER IF EXISTS trg_shared_products_set_category ON public.shared_products;
--   DROP FUNCTION IF EXISTS public.shared_products_set_category();
--   DROP FUNCTION IF EXISTS public.detect_product_category(text);
