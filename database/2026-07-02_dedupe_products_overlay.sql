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

CREATE TEMP TABLE _overlay_rows ON COMMIT DROP AS
SELECT
  ckv.client_id,
  c.name AS client_name,
  e.ord,
  e.r AS row_json,
  COALESCE(NULLIF(e.r->>'name', ''), NULLIF(e.r->'overrides'->>'name', ''), sp.name, sp2.name) AS effective_name,
  lower(regexp_replace(trim(COALESCE(NULLIF(e.r->>'name', ''), NULLIF(e.r->'overrides'->>'name', ''), sp.name, sp2.name)), '\s+', ' ', 'g')) AS norm_name,
  COALESCE(NULLIF(e.r->>'id', ''), NULLIF(e.r->>'shared_origin_id', '')) AS row_id,
  NULLIF(e.r->>'shared_origin_id', '') AS shared_origin_id,
  COALESCE((e.r->>'_custom') = 'true', false) AS is_custom,
  COALESCE(NULLIF(e.r->>'fingerprint', ''), sp.fingerprint, sp2.fingerprint) AS fingerprint,
  COALESCE(e.r->>'in_my_list', 'true') <> 'false' AS in_my_list
FROM public.client_kv_store ckv
JOIN public.clients c ON c.id = ckv.client_id
CROSS JOIN LATERAL jsonb_array_elements(ckv.v) WITH ORDINALITY AS e(r, ord)
LEFT JOIN public.shared_products sp ON sp.id::text = e.r->>'shared_origin_id'
LEFT JOIN public.shared_products sp2 ON sp2.id::text = e.r->>'id'
WHERE ckv.k = 'heys_products_overlay_v2'
  AND jsonb_typeof(ckv.v) = 'array';

CREATE TEMP TABLE _synthetic_overlay_rows ON COMMIT DROP AS
SELECT *
FROM _overlay_rows
WHERE row_id LIKE 'estimated_%'
   OR row_id LIKE 'estimated_quickfill_%'
   OR effective_name LIKE '%· оценочно %'
   OR row_json->>'virtualProduct' = 'true'
   OR row_json->>'skipProductRestore' = 'true'
   OR row_json->>'skipOrphanTracking' = 'true';

CREATE TEMP TABLE _day_refs ON COMMIT DROP AS
SELECT
  ckv.client_id,
  item->>'product_id' AS product_id,
  count(*) AS refs
FROM public.client_kv_store ckv
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(ckv.v->'meals', '[]'::jsonb)) meal
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(meal->'items', '[]'::jsonb)) item
WHERE ckv.k LIKE '%dayv2%'
  AND jsonb_typeof(ckv.v) = 'object'
  AND item ? 'product_id'
GROUP BY ckv.client_id, item->>'product_id';

CREATE TEMP TABLE _shared_name_groups ON COMMIT DROP AS
SELECT
  client_id,
  norm_name,
  count(DISTINCT shared_origin_id) FILTER (WHERE NOT is_custom AND shared_origin_id IS NOT NULL) AS shared_anchor_count,
  count(*) FILTER (WHERE NOT is_custom AND shared_origin_id IS NOT NULL) AS typea_rows,
  count(*) FILTER (WHERE is_custom) AS custom_rows
FROM _overlay_rows
WHERE in_my_list
  AND norm_name IS NOT NULL
GROUP BY client_id, norm_name;

CREATE TEMP TABLE _overlay_keyed ON COMMIT DROP AS
SELECT
  r.*,
  CASE
    WHEN r.norm_name IS NOT NULL
      AND COALESCE(sng.shared_anchor_count, 0) = 1
      AND COALESCE(sng.custom_rows, 0) > 0
      THEN 'shared-name:' || r.norm_name
    WHEN r.fingerprint IS NOT NULL AND r.fingerprint <> '' THEN 'fp:' || r.fingerprint
    ELSE NULL
  END AS dedupe_key,
  COALESCE(d.refs, 0) AS day_refs
FROM _overlay_rows r
LEFT JOIN _day_refs d
  ON d.client_id = r.client_id
 AND d.product_id = r.row_id
LEFT JOIN _shared_name_groups sng
  ON sng.client_id = r.client_id
 AND sng.norm_name = r.norm_name
WHERE r.in_my_list
  AND r.row_id IS NOT NULL
  AND r.effective_name IS NOT NULL;

CREATE TEMP TABLE _dedupe_groups ON COMMIT DROP AS
SELECT
  client_id,
  min(client_name) AS client_name,
  dedupe_key,
  min(effective_name) AS name_sample,
  count(*) AS row_count,
  count(*) FILTER (WHERE is_custom) AS custom_count,
  count(*) FILTER (WHERE NOT is_custom) AS typea_count,
  sum(day_refs) AS total_day_refs
FROM _overlay_keyed
WHERE dedupe_key IS NOT NULL
GROUP BY client_id, dedupe_key
HAVING count(*) > 1;

CREATE TEMP TABLE _canonical_rows ON COMMIT DROP AS
SELECT DISTINCT ON (k.client_id, k.dedupe_key)
  k.client_id,
  k.dedupe_key,
  k.row_id AS canonical_id,
  k.effective_name AS canonical_name,
  k.ord AS canonical_ord,
  k.day_refs AS canonical_refs,
  k.is_custom AS canonical_is_custom
FROM _overlay_keyed k
JOIN _dedupe_groups g
  ON g.client_id = k.client_id
 AND g.dedupe_key = k.dedupe_key
ORDER BY
  k.client_id,
  k.dedupe_key,
  CASE
    WHEN g.typea_count > 0 AND NOT k.is_custom AND k.shared_origin_id IS NOT NULL THEN 0
    ELSE 1
  END,
  k.day_refs DESC,
  k.ord ASC;

CREATE TEMP TABLE _alias_map ON COMMIT DROP AS
SELECT
  k.client_id,
  g.client_name,
  g.name_sample,
  k.dedupe_key,
  k.row_id AS old_id,
  c.canonical_id AS new_id,
  k.day_refs,
  k.is_custom AS old_is_custom,
  c.canonical_is_custom
FROM _overlay_keyed k
JOIN _dedupe_groups g
  ON g.client_id = k.client_id
 AND g.dedupe_key = k.dedupe_key
JOIN _canonical_rows c
  ON c.client_id = k.client_id
 AND c.dedupe_key = k.dedupe_key
WHERE k.row_id <> c.canonical_id;

CREATE TEMP TABLE _affected_day_keys ON COMMIT DROP AS
SELECT DISTINCT ckv.client_id, ckv.k
FROM public.client_kv_store ckv
WHERE ckv.k LIKE '%dayv2%'
  AND jsonb_typeof(ckv.v) = 'object'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(ckv.v->'meals', '[]'::jsonb)) meal,
         jsonb_array_elements(COALESCE(meal->'items', '[]'::jsonb)) item,
         _alias_map m
    WHERE m.client_id = ckv.client_id
      AND item->>'product_id' = m.old_id
  );

\echo ''
\echo 'Overlay dedupe dry-run summary'
SELECT
  gs.client_name,
  gs.client_id,
  gs.duplicate_groups,
  gs.rows_in_groups,
  als.overlay_rows_to_remove,
  gs.day_refs_in_groups,
  als.day_refs_to_remap
FROM (
  SELECT
    client_name,
    client_id,
    count(*) AS duplicate_groups,
    sum(row_count) AS rows_in_groups,
    sum(total_day_refs) AS day_refs_in_groups
  FROM _dedupe_groups
  GROUP BY client_name, client_id
) gs
JOIN (
  SELECT
    client_id,
    count(*) AS overlay_rows_to_remove,
    sum(day_refs) AS day_refs_to_remap
  FROM _alias_map
  GROUP BY client_id
) als ON als.client_id = gs.client_id
ORDER BY als.overlay_rows_to_remove DESC;

\echo ''
\echo 'Coffee duplicate groups'
SELECT
  client_name,
  name_sample,
  count(*) AS aliases_to_remove,
  sum(day_refs) AS refs_to_remap,
  string_agg(old_id || '->' || new_id || '(' || day_refs || ')', ', ' ORDER BY day_refs DESC, old_id) AS alias_sample
FROM _alias_map
WHERE lower(name_sample) LIKE '%кофе%'
   OR lower(name_sample) LIKE '%coffee%'
GROUP BY client_name, name_sample
ORDER BY refs_to_remap DESC, name_sample;

\echo ''
\echo 'Synthetic overlay rows to remove'
SELECT
  client_name,
  client_id,
  count(*) AS synthetic_rows_to_remove
FROM _synthetic_overlay_rows
GROUP BY client_name, client_id
ORDER BY synthetic_rows_to_remove DESC;

\echo ''
\echo 'Affected day keys'
SELECT
  c.name AS client_name,
  a.client_id,
  count(*) AS day_keys_to_update
FROM _affected_day_keys a
JOIN public.clients c ON c.id = a.client_id
GROUP BY c.name, a.client_id
ORDER BY day_keys_to_update DESC;

INSERT INTO public.client_kv_store_dedupe_backups (client_id, k, v, updated_at, revision, reason)
SELECT ckv.client_id, ckv.k, ckv.v, ckv.updated_at, ckv.revision, '2026-07-02 products overlay dedupe'
FROM public.client_kv_store ckv
WHERE ckv.k = 'heys_products_overlay_v2'
  AND (
    EXISTS (SELECT 1 FROM _alias_map m WHERE m.client_id = ckv.client_id)
    OR EXISTS (SELECT 1 FROM _synthetic_overlay_rows s WHERE s.client_id = ckv.client_id)
  )
UNION ALL
SELECT ckv.client_id, ckv.k, ckv.v, ckv.updated_at, ckv.revision, '2026-07-02 products overlay dedupe'
FROM public.client_kv_store ckv
JOIN _affected_day_keys a
  ON a.client_id = ckv.client_id
 AND a.k = ckv.k;

WITH rebuilt_overlay AS (
  SELECT
    r.client_id,
    jsonb_agg(r.row_json ORDER BY r.ord) AS new_v
  FROM _overlay_rows r
  LEFT JOIN _alias_map m
    ON m.client_id = r.client_id
   AND m.old_id = r.row_id
  LEFT JOIN _synthetic_overlay_rows s
    ON s.client_id = r.client_id
   AND s.row_id = r.row_id
  WHERE m.old_id IS NULL
    AND s.row_id IS NULL
  GROUP BY r.client_id
)
UPDATE public.client_kv_store ckv
SET v = ro.new_v,
    updated_at = now()
FROM rebuilt_overlay ro
WHERE ckv.client_id = ro.client_id
  AND ckv.k = 'heys_products_overlay_v2'
  AND (
    EXISTS (SELECT 1 FROM _alias_map m WHERE m.client_id = ckv.client_id)
    OR EXISTS (SELECT 1 FROM _synthetic_overlay_rows s WHERE s.client_id = ckv.client_id)
  );

WITH affected AS (
  SELECT ckv.client_id, ckv.k, ckv.v
  FROM public.client_kv_store ckv
  JOIN _affected_day_keys a
    ON a.client_id = ckv.client_id
   AND a.k = ckv.k
),
rebuilt AS (
  SELECT
    a.client_id,
    a.k,
    jsonb_set(
      a.v,
      '{meals}',
      (
        SELECT jsonb_agg(
          CASE
            WHEN meal.value ? 'items' THEN
              jsonb_set(
                meal.value,
                '{items}',
                (
                  SELECT jsonb_agg(
                    CASE
                      WHEN m.new_id IS NOT NULL THEN jsonb_set(item.value, '{product_id}', to_jsonb(m.new_id), true)
                      ELSE item.value
                    END
                    ORDER BY item.ordinality
                  )
                  FROM jsonb_array_elements(COALESCE(meal.value->'items', '[]'::jsonb)) WITH ORDINALITY item(value, ordinality)
                  LEFT JOIN _alias_map m
                    ON m.client_id = a.client_id
                   AND m.old_id = item.value->>'product_id'
                ),
                false
              )
            ELSE meal.value
          END
          ORDER BY meal.ordinality
        )
        FROM jsonb_array_elements(COALESCE(a.v->'meals', '[]'::jsonb)) WITH ORDINALITY meal(value, ordinality)
      ),
      false
    ) AS new_v
  FROM affected a
)
UPDATE public.client_kv_store ckv
SET v = rebuilt.new_v,
    updated_at = now()
FROM rebuilt
WHERE ckv.client_id = rebuilt.client_id
  AND ckv.k = rebuilt.k;

\if :apply
  \echo ''
  \echo 'APPLY=true: committing overlay dedupe changes'
  COMMIT;
\else
  \echo ''
  \echo 'APPLY=false: rolling back, no cloud data changed'
  ROLLBACK;
\endif
