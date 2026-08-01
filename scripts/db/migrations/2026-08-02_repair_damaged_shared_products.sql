-- 2026-08-02 — починка повреждённых карточек общего каталога + защита от повтора.
--
-- ЧТО СЛУЧИЛОСЬ
-- 30.05.2026 в shared_products попали 12 карточек, у которых сохранился белок,
-- а углеводы, жиры и клетчатка обнулились. Порча локализована одним днём:
-- в этот день создано 30 карточек, из них 12 битых; все остальные дни чистые.
-- У 10 из 12 есть здоровый двойник с тем же названием.
--
-- ПОЧЕМУ ЭТО ВИДНО КЛИЕНТАМ
-- Личная карточка клиента (heys_products_overlay_v2) может быть ссылкой на
-- строку общего каталога. Автолинковка TypeB→TypeA в
-- apps/web/heys_products_overlay_v1.js:283 связывает по НОРМАЛИЗОВАННОМУ ИМЕНИ
-- и берёт из индекса одну карточку из группы. Когда в каталоге два «Торт
-- Наполеон», она выбрала битый: у клиентов торт считался как 18 ккал/100 г
-- вместо 300, тунец — 71 вместо 174.
--
-- ЧТО ДЕЛАЕТ МИГРАЦИЯ
-- 1) перевешивает клиентские ссылки с битых карточек на здоровых двойников;
-- 2) удаляет битые карточки, у которых есть здоровый двойник;
-- 3) НЕ трогает две карточки без двойника — они разбираются отдельно:
--      «Печенье витаминизированное Юбилейное…» — реальный продукт, состав
--      надо восстанавливать с упаковки, удалять нельзя;
--      «Тестовый парень» — тестовая запись, удаляется отдельным решением
--      вместе с чисткой ссылок на неё.
--
-- ЧЕГО МИГРАЦИЯ НЕ ДЕЛАЕТ
-- Не вводит UNIQUE(name_norm) и не меняет publish_shared_product_by_curator.
-- Запрет одноимённых карточек меняет поведение публикации у куратора и должен
-- выкатываться вместе с правкой функции и живой проверкой флоу — иначе
-- куратор получит ошибку вместо понятного «такой продукт уже есть».
--
-- ПРОВЕРКА ДО:
--   SELECT count(*) FROM shared_products
--    WHERE protein100>0 AND (simple100+complex100)=0 AND (badfat100+goodfat100)=0;
--   -- ожидаем 12

BEGIN;

-- Пары «битая карточка → здоровый двойник» по нормализованному имени.
CREATE TEMP TABLE _repair_pairs ON COMMIT DROP AS
WITH dmg AS (
  SELECT id, name_norm
  FROM public.shared_products
  WHERE protein100 > 0
    AND (simple100 + complex100) = 0
    AND (badfat100 + goodfat100) = 0
)
SELECT d.id AS bad_id, g.id AS good_id
FROM dmg d
JOIN public.shared_products g
  ON g.name_norm = d.name_norm
 AND g.id <> d.id
WHERE NOT (g.protein100 > 0 AND (g.simple100 + g.complex100) = 0 AND (g.badfat100 + g.goodfat100) = 0);

-- 1) Перевесить клиентские ссылки на здоровые карточки.
UPDATE public.client_kv_store k
SET v = (
      SELECT jsonb_agg(
               CASE
                 WHEN p.good_id IS NOT NULL
                   THEN jsonb_set(e, '{shared_origin_id}', to_jsonb(p.good_id::text))
                 ELSE e
               END
               ORDER BY ord
             )
      FROM jsonb_array_elements(k.v) WITH ORDINALITY AS t(e, ord)
      LEFT JOIN _repair_pairs p
        ON p.bad_id = NULLIF(t.e->>'shared_origin_id', '')::uuid
    ),
    updated_at = now()
WHERE k.k = 'heys_products_overlay_v2'
  AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements(k.v) e
        JOIN _repair_pairs p ON p.bad_id = NULLIF(e->>'shared_origin_id', '')::uuid
      );

-- 2) Удалить битые карточки, у которых есть здоровый двойник.
DELETE FROM public.shared_products sp
WHERE sp.id IN (SELECT bad_id FROM _repair_pairs);

COMMIT;

-- ПРОВЕРКА ПОСЛЕ:
--   SELECT count(*) FROM shared_products
--    WHERE protein100>0 AND (simple100+complex100)=0 AND (badfat100+goodfat100)=0;
--   -- ожидаем 2 (обе без здорового двойника)
--
--   -- битых ссылок быть не должно:
--   SELECT count(*) FROM client_kv_store k, jsonb_array_elements(k.v) e
--    LEFT JOIN shared_products sp ON sp.id = NULLIF(e->>'shared_origin_id','')::uuid
--    WHERE k.k='heys_products_overlay_v2'
--      AND e->>'shared_origin_id' IS NOT NULL AND sp.id IS NULL;
--   -- ожидаем 0
--
-- ОТКАТ
-- Удалённые строки восстанавливаются из бэкапа каталога, ссылки — из бэкапа
-- overlay, снятого перед применением (см. отчёт задачи). Автоматического
-- отката нет намеренно: возвращать битые карточки в каталог допустимо только
-- вместе с возвратом клиентских ссылок на них, иначе появятся битые ссылки.
