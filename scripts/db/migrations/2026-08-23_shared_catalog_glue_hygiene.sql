-- 2026-08-23 — гигиена общего каталога для MCP resolve (план catalog glue v9, фаза A.4).
--
-- 1) Салат: имя должно явно содержать «подсолнечным маслом», чтобы запрос
--    «масло подсолнечное» не конкурировал с коротким «овощной салат».
-- 2) «Тефтели рисовые» — отдельная карточка (до неё product_not_found ожидаем).
-- 3) Дубль «Творог 5» / «Творог 5%» — канон 7efc4aec…, drop 58b3b175….
--
-- ПРОВЕРКА ДО:
--   SELECT id, name FROM shared_products WHERE id IN (
--     'dbd0aa02-b038-499c-afbf-d1180f20a311',
--     '7efc4aec-b1f9-401e-8bd1-bda6a3090fd4',
--     '58b3b175-361c-4d60-bd84-3b6d4a2bea88'
--   );
--   SELECT count(*) FROM shared_products WHERE name ILIKE 'тефтели рисовые';

BEGIN;

UPDATE public.shared_products
SET name = 'Овощной салат с подсолнечным маслом',
    name_norm = 'овощной салат с подсолнечным маслом',
    updated_at = now()
WHERE id = 'dbd0aa02-b038-499c-afbf-d1180f20a311'
  AND name IS DISTINCT FROM 'Овощной салат с подсолнечным маслом';

INSERT INTO public.shared_products (
  id, name, name_norm, fingerprint,
  simple100, complex100, protein100, badfat100, goodfat100, trans100, fiber100,
  gi, harm, category, portions, created_by_user_id
)
SELECT
  gen_random_uuid(),
  'Тефтели рисовые',
  'тефтели рисовые',
  encode(digest('тефтели рисовые catalog-glue-v9', 'sha256'), 'hex'),
  1, 14, 11, 3, 5, 0.5, 1,
  50, 3, 'готовые блюда', '[]'::jsonb,
  'f965a73c-79e3-42b7-9ee0-bfaad09e706b'::uuid
WHERE NOT EXISTS (
  SELECT 1 FROM public.shared_products WHERE name_norm = 'тефтели рисовые'
);

CREATE TEMP TABLE _tvorog_dedupe ON COMMIT DROP AS
SELECT
  '58b3b175-361c-4d60-bd84-3b6d4a2bea88'::uuid AS drop_id,
  '7efc4aec-b1f9-401e-8bd1-bda6a3090fd4'::uuid AS keep_id
WHERE EXISTS (SELECT 1 FROM public.shared_products WHERE id = '58b3b175-361c-4d60-bd84-3b6d4a2bea88')
  AND EXISTS (SELECT 1 FROM public.shared_products WHERE id = '7efc4aec-b1f9-401e-8bd1-bda6a3090fd4');

UPDATE public.client_kv_store k
SET v = (
      SELECT jsonb_agg(
               CASE WHEN p.keep_id IS NOT NULL
                    THEN jsonb_set(t.e, '{shared_origin_id}', to_jsonb(p.keep_id::text))
                    ELSE t.e END
               ORDER BY t.ord
             )
      FROM jsonb_array_elements(k.v) WITH ORDINALITY AS t(e, ord)
      LEFT JOIN _tvorog_dedupe p ON p.drop_id = NULLIF(t.e->>'shared_origin_id', '')::uuid
    ),
    updated_at = now()
WHERE k.k = 'heys_products_overlay_v2'
  AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(k.v) e
        JOIN _tvorog_dedupe p ON p.drop_id = NULLIF(e->>'shared_origin_id', '')::uuid
      );

DELETE FROM public.shared_products
WHERE id IN (SELECT drop_id FROM _tvorog_dedupe);

COMMIT;
