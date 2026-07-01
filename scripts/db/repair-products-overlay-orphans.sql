-- Repair personal products missing from canonical heys_products_overlay_v2.
-- Usage:
--   bash scripts/db/psql.sh -v client_id='<uuid>' -f scripts/db/repair-products-overlay-orphans.sql
--
-- The script rebuilds TypeB custom overlay rows from inline day item stamps.
-- It does not publish anything to shared_products or shared_products_pending.

\set ON_ERROR_STOP on

WITH params AS (
  SELECT :'client_id'::uuid AS client_id
),
overlay AS (
  SELECT
    p.client_id,
    COALESCE(kv.v, '[]'::jsonb) AS rows
  FROM params p
  LEFT JOIN client_kv_store kv
    ON kv.client_id = p.client_id
   AND kv.k = 'heys_products_overlay_v2'
),
day_items AS (
  SELECT
    kv.client_id,
    item
  FROM client_kv_store kv
  JOIN params p ON p.client_id = kv.client_id
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(kv.v->'meals', '[]'::jsonb)) AS meal
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(meal->'items', '[]'::jsonb)) AS item
  WHERE kv.k LIKE 'heys_dayv2_%'
    AND item ? 'product_id'
    AND item ? 'name'
    AND COALESCE((item->>'_oneTime')::boolean, false) = false
),
orphan_items AS (
  SELECT DISTINCT ON (di.client_id, di.item->>'product_id')
    di.client_id,
    di.item
  FROM day_items di
  JOIN overlay ov ON ov.client_id = di.client_id
  WHERE NULLIF(di.item->>'product_id', '') IS NOT NULL
    AND NULLIF(di.item->>'name', '') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(ov.rows) AS row
      WHERE row->>'id' = di.item->>'product_id'
    )
  ORDER BY di.client_id, di.item->>'product_id'
),
repair_rows AS (
  SELECT
    client_id,
    jsonb_strip_nulls(jsonb_build_object(
      'id', item->>'product_id',
      'name', item->>'name',
      'fingerprint', item->>'fingerprint',
      'kcal100', item->'kcal100',
      'protein100', item->'protein100',
      'carbs100', item->'carbs100',
      'fat100', item->'fat100',
      'simple100', item->'simple100',
      'complex100', item->'complex100',
      'badFat100', item->'badFat100',
      'goodFat100', item->'goodFat100',
      'trans100', item->'trans100',
      'fiber100', item->'fiber100',
      'gi', item->'gi',
      'harm', item->'harm',
      'sodium100', item->'sodium100',
      'omega3_100', item->'omega3_100',
      'omega6_100', item->'omega6_100',
      'nova_group', item->'nova_group',
      'additives', item->'additives',
      'nutrient_density', item->'nutrient_density',
      'is_organic', item->'is_organic',
      'is_whole_grain', item->'is_whole_grain',
      'is_fermented', item->'is_fermented',
      'is_raw', item->'is_raw',
      'vitamin_a', item->'vitamin_a',
      'vitamin_c', item->'vitamin_c',
      'vitamin_d', item->'vitamin_d',
      'vitamin_e', item->'vitamin_e',
      'vitamin_k', item->'vitamin_k',
      'vitamin_b1', item->'vitamin_b1',
      'vitamin_b2', item->'vitamin_b2',
      'vitamin_b3', item->'vitamin_b3',
      'vitamin_b6', item->'vitamin_b6',
      'vitamin_b9', item->'vitamin_b9',
      'vitamin_b12', item->'vitamin_b12',
      'calcium', item->'calcium',
      'iron', item->'iron',
      'magnesium', item->'magnesium',
      'phosphorus', item->'phosphorus',
      'potassium', item->'potassium',
      'zinc', item->'zinc',
      'selenium', item->'selenium',
      'iodine', item->'iodine',
      '_custom', true,
      'in_my_list', true,
      'user_modified', true,
      'createdAt', (extract(epoch from now()) * 1000)::bigint,
      'updatedAt', (extract(epoch from now()) * 1000)::bigint
    )) AS row
  FROM orphan_items
),
grouped AS (
  SELECT
    ov.client_id,
    ov.rows || COALESCE(jsonb_agg(rr.row) FILTER (WHERE rr.row IS NOT NULL), '[]'::jsonb) AS next_rows,
    COUNT(rr.row) AS repaired_count,
    COALESCE(jsonb_agg(rr.row->>'name') FILTER (WHERE rr.row IS NOT NULL), '[]'::jsonb) AS repaired_names
  FROM overlay ov
  LEFT JOIN repair_rows rr ON rr.client_id = ov.client_id
  GROUP BY ov.client_id, ov.rows
),
upserted AS (
  INSERT INTO client_kv_store (client_id, k, v, updated_at)
  SELECT client_id, 'heys_products_overlay_v2', next_rows, now()
  FROM grouped
  WHERE repaired_count > 0
  ON CONFLICT (client_id, k)
  DO UPDATE SET
    v = EXCLUDED.v,
    updated_at = EXCLUDED.updated_at,
    user_id = EXCLUDED.user_id
  RETURNING client_id
)
SELECT
  g.client_id,
  g.repaired_count,
  g.repaired_names
FROM grouped g;
