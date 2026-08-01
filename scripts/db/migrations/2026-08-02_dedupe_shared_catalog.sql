-- 2026-08-02 — чистка общего каталога продуктов перед релизом.
--
-- Основание: ревью всех 415 карточек (девять параллельных проходов по 50) плюс
-- программная проверка на дубли. Здесь выполняется только механическая часть,
-- где решение однозначно и проверяется запросом. Содержательные правки
-- нутриентов (занижен жир у сала, перепутаны сахара и крахмал у Raffaello,
-- не учитывается алкоголь и т.п.) сюда НЕ входят: они требуют сверки с
-- упаковкой и решения владельца, выдумывать цифры нельзя.
--
-- ЧТО ДЕЛАЕТ
-- 1) схлопывает 13 групп полных дублей (совпадают все макронутриенты) —
--    в том числе «Соус Heinz» в трёх экземплярах, «… (копия)», «…777»,
--    «Творог 5» / «Творог 5%», «Яйцо варёное» / «Яйцо отварное»;
-- 2) чинит «Печенье витаминизированное Юбилейное»: у битой карточки (23 ккал,
--    все макросы кроме белка нулевые) есть здоровый двойник (454 ккал),
--    который прошлый проход не увидел — названия отличаются только кавычками,
--    поэтому нормализованные имена разошлись;
-- 3) убирает тестовую запись «Тестовый парень» вместе со ссылками на неё;
-- 4) обнуляет гликемический индекс у 16 карточек без углеводов (мясо, сыр,
--    масло, яйца с ГИ 50): ГИ определён только для углеводсодержащей еды и
--    в таком виде искажает рекомендации.
--
-- Канонической в группе дублей считается карточка без мусорных маркеров в
-- названии («(копия)», хвостовые «777»), при равенстве — созданная раньше.
-- Клиентские ссылки переводятся на неё, лишние карточки удаляются.
--
-- ПРОВЕРКА ДО:
--   SELECT count(*) FROM (SELECT 1 FROM shared_products
--     GROUP BY protein100,simple100,complex100,badfat100,goodfat100,fiber100
--     HAVING count(*)>1) t;                                   -- ожидаем 13
--   SELECT count(*) FROM shared_products WHERE (simple100+complex100)<=1 AND gi>20; -- 16

BEGIN;

-- ── 1. Пары «лишняя карточка → каноническая» ────────────────────────────────
CREATE TEMP TABLE _dedupe_pairs ON COMMIT DROP AS
WITH ranked AS (
  SELECT id, name,
         row_number() OVER (
           PARTITION BY protein100, simple100, complex100, badfat100, goodfat100, fiber100
           ORDER BY
             (name ~* '\(копия')::int,          -- «(копия)» — в конец
             (name ~ '[0-9]{3,}\s*$')::int,     -- хвостовые «777» — в конец
             created_at,
             id
         ) AS rn,
         first_value(id) OVER (
           PARTITION BY protein100, simple100, complex100, badfat100, goodfat100, fiber100
           ORDER BY
             (name ~* '\(копия')::int,
             (name ~ '[0-9]{3,}\s*$')::int,
             created_at,
             id
         ) AS canon_id
  FROM public.shared_products
)
SELECT id AS drop_id, canon_id AS keep_id
FROM ranked
WHERE rn > 1;

-- Битое «Печенье витаминизированное Юбилейное» → здоровый двойник.
-- Составы разные (у битой всё нулевое), поэтому в группы дублей оно не попало.
INSERT INTO _dedupe_pairs (drop_id, keep_id)
SELECT bad.id, good.id
FROM public.shared_products bad
JOIN public.shared_products good
  ON good.name ILIKE '%витаминизированное%Юбилейное%'
 AND good.id <> bad.id
 AND NOT (good.protein100 > 0 AND (good.simple100 + good.complex100) = 0
          AND (good.badfat100 + good.goodfat100) = 0)
WHERE bad.name ILIKE '%витаминизированное%Юбилейное%'
  AND bad.protein100 > 0
  AND (bad.simple100 + bad.complex100) = 0
  AND (bad.badfat100 + bad.goodfat100) = 0;

-- ── 2. Перевести клиентские ссылки на канонические карточки ─────────────────
UPDATE public.client_kv_store k
SET v = (
      SELECT jsonb_agg(
               CASE WHEN p.keep_id IS NOT NULL
                    THEN jsonb_set(t.e, '{shared_origin_id}', to_jsonb(p.keep_id::text))
                    ELSE t.e END
               ORDER BY t.ord
             )
      FROM jsonb_array_elements(k.v) WITH ORDINALITY AS t(e, ord)
      LEFT JOIN _dedupe_pairs p ON p.drop_id = NULLIF(t.e->>'shared_origin_id', '')::uuid
    ),
    updated_at = now()
WHERE k.k = 'heys_products_overlay_v2'
  AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(k.v) e
        JOIN _dedupe_pairs p ON p.drop_id = NULLIF(e->>'shared_origin_id', '')::uuid
      );

-- После перевода в списке клиента могут оказаться две записи на одну и ту же
-- карточку каталога — убираем повторы, оставляя первую.
UPDATE public.client_kv_store k
SET v = (
      SELECT COALESCE(jsonb_agg(t.e ORDER BY t.ord), '[]'::jsonb)
      FROM (
        SELECT e, ord,
               row_number() OVER (
                 PARTITION BY NULLIF(e->>'shared_origin_id', '')
                 ORDER BY ord
               ) AS rn
        FROM jsonb_array_elements(k.v) WITH ORDINALITY AS x(e, ord)
      ) t
      WHERE t.e->>'shared_origin_id' IS NULL OR t.rn = 1
    ),
    updated_at = now()
WHERE k.k = 'heys_products_overlay_v2';

-- ── 3. Удалить лишние карточки ──────────────────────────────────────────────
DELETE FROM public.shared_products WHERE id IN (SELECT drop_id FROM _dedupe_pairs);

-- ── 4. Тестовая запись: сначала ссылки, затем сама карточка ─────────────────
UPDATE public.client_kv_store k
SET v = (
      SELECT COALESCE(jsonb_agg(t.e ORDER BY t.ord), '[]'::jsonb)
      FROM jsonb_array_elements(k.v) WITH ORDINALITY AS t(e, ord)
      WHERE NULLIF(t.e->>'shared_origin_id', '')::uuid NOT IN (
              SELECT id FROM public.shared_products WHERE name_norm = 'тестовый парень'
            )
         OR t.e->>'shared_origin_id' IS NULL
    ),
    updated_at = now()
WHERE k.k = 'heys_products_overlay_v2';

DELETE FROM public.shared_products WHERE name_norm = 'тестовый парень';

-- ── 5. ГИ имеет смысл только для углеводсодержащей еды ──────────────────────
UPDATE public.shared_products
SET gi = 0
WHERE (simple100 + complex100) <= 1 AND gi > 20;

COMMIT;

-- ПРОВЕРКА ПОСЛЕ:
--   -- дублей по составу не осталось:
--   SELECT count(*) FROM (SELECT 1 FROM shared_products
--     GROUP BY protein100,simple100,complex100,badfat100,goodfat100,fiber100
--     HAVING count(*)>1) t;                                   -- ожидаем 0
--   -- битых ссылок нет:
--   SELECT count(*) FROM client_kv_store k, jsonb_array_elements(k.v) e
--    LEFT JOIN shared_products sp ON sp.id = NULLIF(e->>'shared_origin_id','')::uuid
--    WHERE k.k='heys_products_overlay_v2'
--      AND e->>'shared_origin_id' IS NOT NULL AND sp.id IS NULL;   -- ожидаем 0
--   SELECT count(*) FROM shared_products WHERE (simple100+complex100)<=1 AND gi>20; -- 0
--
-- ОТКАТ
-- Восстановление из бэкапа каталога и overlay, снятого перед применением.
-- Автоматического отката нет намеренно: возврат удалённых карточек допустим
-- только вместе с возвратом клиентских ссылок, иначе появятся битые ссылки.
