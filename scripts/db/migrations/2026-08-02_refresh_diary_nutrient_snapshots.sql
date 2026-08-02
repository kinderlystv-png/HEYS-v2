-- 2026-08-02 — пересчёт слепков нутриентов в записанных приёмах.
--
-- ПОЧЕМУ ЭТО ПОНАДОБИЛОСЬ
-- Позиция приёма хранит СВОЙ слепок нутриентов (`kcal100`, `fat100`,
-- `carbs100`, макросы), а не ссылку на карточку каталога. Поэтому исправления
-- каталога, сделанные сегодня, историю не затронули: дневники продолжали
-- считать по значениям, которые были верны на момент записи.
--
-- Насколько разошлось на 2026-08-02: 648 позиций из 3690 (228 дней),
-- 137 продуктов, максимум 414 ккал на 100 г.
--   Сало солёное                 394 → 808   (1 запись)
--   Чипсы Lay's                  353 → 527   (3)
--   Говяжий антрекот              96 → 244   (1)
--   Какао-порошок                410 → 275   (5, двойной счёт клетчатки)
--   Творожный сыр 60             192 → 282   (183 записи — самый частый)
--   Красное вино                  20 →  94   (5, энергия спирта)
--
-- ЧТО ДЕЛАЕТ МИГРАЦИЯ
-- Обновляет слепок у тех позиций, чьё имя точно совпадает с карточкой каталога.
-- Пересчитываются нутриенты и производные `carbs100`/`fat100`/`kcal100` по той
-- же формуле, что в коде (`heys_models_v1.js: computeDerivedProduct`):
--   carbs = simple + complex
--   fat   = badFat + goodFat + trans      ← трансжиры входят в жир и дают ккал
--   kcal  = 3*protein + 4*carbs + 9*fat
--
-- Поля `grams`, `id`, `name`, `product_id` не трогаются: меняется состав на
-- 100 г, а не то, что и сколько человек съел.
--
-- ЧЕГО МИГРАЦИЯ НЕ РАЗЛИЧАЕТ
-- Если клиент вручную поправил нутриенты внутри приёма, такая правка будет
-- заменена значениями каталога — признака «правлено вручную» в позиции нет.
-- На текущих двух клиентах это принято осознанно: цена ошибки в дневнике выше,
-- чем сохранность возможной ручной правки.
--
-- ПРОВЕРКА ДО:
--   -- число расходящихся позиций (ожидаем 648):
--   WITH items AS (SELECT it->>'name' n, (it->>'kcal100')::numeric s
--     FROM client_kv_store k, jsonb_array_elements(k.v->'meals') m,
--          jsonb_array_elements(m->'items') it
--     WHERE k.k LIKE 'heys_dayv2_%' AND it->>'kcal100' IS NOT NULL)
--   SELECT count(*) FROM items i JOIN shared_products sp ON sp.name = i.n
--    WHERE abs(i.s - (3*sp.protein100 + 4*(sp.simple100+sp.complex100)
--                     + 9*(sp.badfat100+sp.goodfat100+sp.trans100))) > 5;

BEGIN;

UPDATE public.client_kv_store k
SET v = jsonb_set(
      k.v,
      '{meals}',
      (
        SELECT COALESCE(jsonb_agg(
                 jsonb_set(
                   tm.meal,
                   '{items}',
                   (
                     SELECT COALESCE(jsonb_agg(
                              CASE
                                WHEN sp.id IS NULL THEN ti.item
                                ELSE ti.item || jsonb_build_object(
                                  'protein100', sp.protein100,
                                  'simple100',  sp.simple100,
                                  'complex100', sp.complex100,
                                  'badFat100',  sp.badfat100,
                                  'goodFat100', sp.goodfat100,
                                  'trans100',   sp.trans100,
                                  'fiber100',   sp.fiber100,
                                  'gi',         sp.gi,
                                  'harm',       sp.harm,
                                  'carbs100',   round((sp.simple100 + sp.complex100)::numeric, 1),
                                  'fat100',     round((sp.badfat100 + sp.goodfat100 + sp.trans100)::numeric, 1),
                                  'kcal100',    round((3 * sp.protein100
                                                       + 4 * (sp.simple100 + sp.complex100)
                                                       + 9 * (sp.badfat100 + sp.goodfat100 + sp.trans100))::numeric, 1)
                                )
                              END
                              ORDER BY ti.ord
                            ), '[]'::jsonb)
                     FROM jsonb_array_elements(tm.meal->'items') WITH ORDINALITY AS ti(item, ord)
                     LEFT JOIN public.shared_products sp ON sp.name = ti.item->>'name'
                   )
                 )
                 ORDER BY tm.ord
               ), '[]'::jsonb)
        FROM jsonb_array_elements(k.v->'meals') WITH ORDINALITY AS tm(meal, ord)
      )
    ),
    updated_at = now()
WHERE k.k LIKE 'heys_dayv2_%'
  AND jsonb_typeof(k.v->'meals') = 'array'
  -- трогаем только дни, где действительно есть расхождение
  AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements(k.v->'meals') m,
             jsonb_array_elements(m->'items') it
        JOIN public.shared_products sp ON sp.name = it->>'name'
        WHERE it->>'kcal100' IS NOT NULL
          AND abs((it->>'kcal100')::numeric
                  - (3 * sp.protein100 + 4 * (sp.simple100 + sp.complex100)
                     + 9 * (sp.badfat100 + sp.goodfat100 + sp.trans100))) > 5
      );

COMMIT;

-- ПРОВЕРКА ПОСЛЕ: тот же запрос из блока «до» должен вернуть 0.
--
-- ОТКАТ: восстановление затронутых ключей из бэкапа дневников, снятого перед
-- применением (diaries_backup.tsv).
