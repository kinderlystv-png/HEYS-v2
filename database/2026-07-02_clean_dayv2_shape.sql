\set ON_ERROR_STOP on

\if :{?apply}
\else
\set apply false
\endif

BEGIN;

CREATE TABLE IF NOT EXISTS public.client_kv_store_dedupe_backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  k text NOT NULL,
  v jsonb NOT NULL,
  updated_at timestamptz,
  revision bigint,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TEMP TABLE _day_rows ON COMMIT DROP AS
SELECT
  ckv.client_id,
  c.name AS client_name,
  ckv.k,
  ckv.v,
  ckv.updated_at,
  ckv.revision
FROM public.client_kv_store ckv
JOIN public.clients c ON c.id = ckv.client_id
WHERE ckv.k LIKE '%dayv2%'
  AND jsonb_typeof(ckv.v) = 'object'
  AND jsonb_typeof(ckv.v->'meals') = 'array';

CREATE TEMP TABLE _meals ON COMMIT DROP AS
SELECT
  d.client_id,
  d.client_name,
  d.k,
  meal.value AS meal_json,
  meal.ordinality AS meal_ord
FROM _day_rows d
CROSS JOIN LATERAL jsonb_array_elements(d.v->'meals') WITH ORDINALITY AS meal(value, ordinality);

CREATE TEMP TABLE _items ON COMMIT DROP AS
SELECT
  m.client_id,
  m.client_name,
  m.k,
  m.meal_ord,
  item.value AS item_json,
  item.ordinality AS item_ord
FROM _meals m
CROSS JOIN LATERAL jsonb_array_elements(
  CASE
    WHEN jsonb_typeof(m.meal_json) = 'object' AND jsonb_typeof(m.meal_json->'items') = 'array'
      THEN m.meal_json->'items'
    ELSE '[]'::jsonb
  END
) WITH ORDINALITY AS item(value, ordinality);

CREATE TEMP TABLE _product_lookup ON COMMIT DROP AS
SELECT DISTINCT ON (client_id, product_id)
  client_id,
  product_id,
  fingerprint,
  product_name
FROM (
  SELECT
    ckv.client_id,
    NULLIF(e.r->>'id', '') AS product_id,
    COALESCE(NULLIF(e.r->>'fingerprint', ''), sp.fingerprint) AS fingerprint,
    COALESCE(NULLIF(e.r->>'name', ''), NULLIF(e.r->'overrides'->>'name', ''), sp.name) AS product_name,
    0 AS priority
  FROM public.client_kv_store ckv
  CROSS JOIN LATERAL jsonb_array_elements(ckv.v) AS e(r)
  LEFT JOIN public.shared_products sp ON sp.id::text = e.r->>'shared_origin_id'
  WHERE ckv.k = 'heys_products_overlay_v2'
    AND jsonb_typeof(ckv.v) = 'array'

  UNION ALL

  SELECT
    ckv.client_id,
    NULLIF(e.r->>'shared_origin_id', '') AS product_id,
    COALESCE(sp.fingerprint, NULLIF(e.r->>'fingerprint', '')) AS fingerprint,
    COALESCE(sp.name, NULLIF(e.r->>'name', ''), NULLIF(e.r->'overrides'->>'name', '')) AS product_name,
    1 AS priority
  FROM public.client_kv_store ckv
  CROSS JOIN LATERAL jsonb_array_elements(ckv.v) AS e(r)
  LEFT JOIN public.shared_products sp ON sp.id::text = e.r->>'shared_origin_id'
  WHERE ckv.k = 'heys_products_overlay_v2'
    AND jsonb_typeof(ckv.v) = 'array'

  UNION ALL

  SELECT
    c.id AS client_id,
    sp.id::text AS product_id,
    sp.fingerprint,
    sp.name AS product_name,
    2 AS priority
  FROM public.clients c
  CROSS JOIN public.shared_products sp
) p
WHERE product_id IS NOT NULL
  AND COALESCE(btrim(product_name), '') <> ''
ORDER BY client_id, product_id, priority;

CREATE TEMP TABLE _nameless_items ON COMMIT DROP AS
SELECT
  i.*,
  NULLIF(i.item_json->>'product_id', '') AS product_id,
  NULLIF(i.item_json->>'fingerprint', '') AS fingerprint
FROM _items i
WHERE jsonb_typeof(i.item_json) = 'object'
  AND COALESCE(btrim(i.item_json->>'name'), '') = '';

CREATE TEMP TABLE _nameless_resolutions ON COMMIT DROP AS
SELECT
  n.client_id,
  n.client_name,
  n.k,
  n.meal_ord,
  n.item_ord,
  n.item_json,
  n.product_id,
  n.fingerprint,
  COALESCE(by_id.product_name, by_fp.product_name) AS resolved_name
FROM _nameless_items n
LEFT JOIN _product_lookup by_id
  ON by_id.client_id = n.client_id
 AND by_id.product_id = n.product_id
LEFT JOIN LATERAL (
  SELECT pl.product_name
  FROM _product_lookup pl
  WHERE pl.client_id = n.client_id
    AND pl.fingerprint IS NOT NULL
    AND pl.fingerprint = n.fingerprint
  ORDER BY pl.product_id
  LIMIT 1
) by_fp ON true;

CREATE TEMP TABLE _affected_day_keys ON COMMIT DROP AS
SELECT DISTINCT client_id, k
FROM _meals
WHERE jsonb_typeof(meal_json) <> 'object'

UNION

SELECT DISTINCT client_id, k
FROM _nameless_items;

\echo ''
\echo 'dayv2 shape cleanup dry-run summary'
SELECT
  client_name,
  client_id,
  count(*) FILTER (WHERE issue = 'bad_meal') AS bad_meals_to_remove,
  count(*) FILTER (WHERE issue = 'nameless_restore') AS nameless_items_to_restore,
  count(*) FILTER (WHERE issue = 'nameless_unresolved') AS nameless_items_to_remove
FROM (
  SELECT client_name, client_id, 'bad_meal' AS issue
  FROM _meals
  WHERE jsonb_typeof(meal_json) <> 'object'

  UNION ALL

  SELECT
    client_name,
    client_id,
    CASE WHEN resolved_name IS NULL THEN 'nameless_unresolved' ELSE 'nameless_restore' END AS issue
  FROM _nameless_resolutions
) s
GROUP BY client_name, client_id
ORDER BY bad_meals_to_remove DESC, nameless_items_to_restore DESC, client_name;

\echo ''
\echo 'nameless item resolutions'
SELECT
  client_name,
  k,
  meal_ord,
  item_ord,
  product_id,
  fingerprint,
  resolved_name
FROM _nameless_resolutions
ORDER BY client_name, k, meal_ord, item_ord;

\echo ''
\echo 'affected day keys'
SELECT
  d.client_name,
  a.client_id,
  count(*) AS day_keys_to_update
FROM _affected_day_keys a
JOIN _day_rows d
  ON d.client_id = a.client_id
 AND d.k = a.k
GROUP BY d.client_name, a.client_id
ORDER BY day_keys_to_update DESC, d.client_name;

INSERT INTO public.client_kv_store_dedupe_backups (client_id, k, v, updated_at, revision, reason)
SELECT d.client_id, d.k, d.v, d.updated_at, d.revision, '2026-07-02 dayv2 shape cleanup'
FROM _day_rows d
JOIN _affected_day_keys a
  ON a.client_id = d.client_id
 AND a.k = d.k;

WITH rebuilt AS (
  SELECT
    d.client_id,
    d.k,
    jsonb_set(
      d.v,
      '{meals}',
      COALESCE(
        (
          SELECT jsonb_agg(
            CASE
              WHEN jsonb_typeof(meal.value->'items') = 'array' THEN
                jsonb_set(
                  meal.value,
                  '{items}',
                  COALESCE(
                    (
                      SELECT jsonb_agg(
                        CASE
                          WHEN nr.resolved_name IS NOT NULL
                            THEN jsonb_set(item.value, '{name}', to_jsonb(nr.resolved_name), true)
                          ELSE item.value
                        END
                        ORDER BY item.ordinality
                      )
                      FROM jsonb_array_elements(meal.value->'items') WITH ORDINALITY AS item(value, ordinality)
                      LEFT JOIN _nameless_resolutions nr
                        ON nr.client_id = d.client_id
                       AND nr.k = d.k
                       AND nr.meal_ord = meal.ordinality
                       AND nr.item_ord = item.ordinality
                      WHERE jsonb_typeof(item.value) = 'object'
                        AND NOT (
                          COALESCE(btrim(item.value->>'name'), '') = ''
                          AND nr.resolved_name IS NULL
                        )
                    ),
                    '[]'::jsonb
                  ),
                  false
                )
              ELSE meal.value
            END
            ORDER BY meal.ordinality
          )
          FROM jsonb_array_elements(d.v->'meals') WITH ORDINALITY AS meal(value, ordinality)
          WHERE jsonb_typeof(meal.value) = 'object'
        ),
        '[]'::jsonb
      ),
      false
    ) AS new_v
  FROM _day_rows d
  JOIN _affected_day_keys a
    ON a.client_id = d.client_id
   AND a.k = d.k
)
UPDATE public.client_kv_store ckv
SET v = rebuilt.new_v,
    updated_at = now()
FROM rebuilt
WHERE ckv.client_id = rebuilt.client_id
  AND ckv.k = rebuilt.k;

\if :apply
  \echo ''
  \echo 'APPLY=true: committing dayv2 shape cleanup'
  COMMIT;
\else
  \echo ''
  \echo 'APPLY=false: rolling back, no cloud data changed'
  ROLLBACK;
\endif
