#!/usr/bin/env bash
# audit-cross-client-pollution.sh — найти cross-client утечки между двумя
# клиентами одного куратора. Покрывает 3 класса pollution:
#
#   1. Row-level: identical md5(v) для одного k у двух client_id'ов
#      (исключая markers/defaults/shared — см. EXCLUDE ниже).
#   2. Training-level: одинаковые training-entries внутри dayv2.trainings
#      (gotcha — этот класс row-level аудит пропускает, поскольку остальной
#      dayv2 у клиентов различается → md5 целого v не совпадает).
#   3. Meal-level: одинаковые meal-entries внутри dayv2.meals — тот же gotcha
#      что и training-level. Match по (time, items[0].product_id) если они есть.
#
# Decision rule per row: newer updated_at = leak side (fanout-over-switch
# pattern из fc1ce544). Скрипт это печатает, но НЕ удаляет — только аудит.
#
# Usage:
#   ./scripts/db/audit-cross-client-pollution.sh <cid_a> <cid_b>
#
# Example:
#   ./scripts/db/audit-cross-client-pollution.sh \
#     ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a \
#     4545ee50-4f5f-4fc0-b862-7ca45fa1bafc

set -e

if [ -z "$1" ] || [ -z "$2" ]; then
  echo "Usage: $0 <cid_a_full_uuid> <cid_b_full_uuid>" >&2
  echo "Find both IDs via: ./scripts/db/audit-clients.sh" >&2
  exit 1
fi

CID_A="$1"
CID_B="$2"
SCRIPT_DIR="$(dirname "$0")"

# Keys we ignore: либо by-design shared (catalog, switch log), либо коммон markers/
# defaults где совпадение = норма, либо last_grams (default 100/50/200 часто общий).
EXCLUDE="(
  'heys_products', 'heys_products_overlay_v2', 'heys_curator_switch_log_v1',
  'heys_tour_completed', 'heys_widgets_tour_completed', 'heys_insights_tour_completed',
  'heys_achievements_v2_migrated', 'heys_achievements_v5_migrated',
  'heys_first_perfect_meal', 'heys_meal_hint_shown',
  'heys_leaderboard_sharing', 'heys_measurement_side',
  'heys_diary_health_trend_period_v1', 'heys_deleted_products_ignore_list',
  'heys_last_sync_ts', 'heys_last_visit', 'heys_weekly_wrap_last_shown_v2',
  'heys_best_streak'
)"

"$SCRIPT_DIR/psql.sh" <<SQL
\echo '═══════════════════════════════════════════════════════════════════'
\echo '  1) ROW-LEVEL POLLUTION — identical md5(v) cross-client'
\echo '═══════════════════════════════════════════════════════════════════'
WITH matches AS (
  SELECT
    a.k,
    a.updated_at AS a_ts,
    b.updated_at AS b_ts,
    CASE WHEN a.updated_at > b.updated_at THEN 'A is leak' ELSE 'B is leak' END AS leak_side,
    length(a.v::text) AS sz
  FROM client_kv_store a
  JOIN client_kv_store b USING (k)
  WHERE a.client_id = '$CID_A'
    AND b.client_id = '$CID_B'
    AND md5(a.v::text) = md5(b.v::text)
    AND a.k NOT IN $EXCLUDE
    AND a.k NOT LIKE 'heys_last_grams_%'
)
SELECT k, leak_side, sz AS bytes,
       to_char(a_ts, 'MM-DD HH24:MI') AS a_ts,
       to_char(b_ts, 'MM-DD HH24:MI') AS b_ts
FROM matches
ORDER BY k;

\echo ''
\echo '═══════════════════════════════════════════════════════════════════'
\echo '  2) TRAINING-LEVEL POLLUTION — identical training inside dayv2'
\echo '═══════════════════════════════════════════════════════════════════'
WITH a AS (
  SELECT k, jsonb_array_elements(v->'trainings') AS t
  FROM client_kv_store
  WHERE client_id = '$CID_A' AND k LIKE 'heys_dayv2_%'
),
b AS (
  SELECT k, jsonb_array_elements(v->'trainings') AS t
  FROM client_kv_store
  WHERE client_id = '$CID_B' AND k LIKE 'heys_dayv2_%'
)
SELECT
  a.k,
  a.t->>'time' AS time,
  a.t->>'type' AS type,
  COALESCE(a.t->>'activityLabel','') AS label,
  COALESCE(a.t->>'source','') AS src,
  CASE WHEN a.t = b.t THEN 'exact' ELSE 'time+type only' END AS match_kind
FROM a
JOIN b USING (k)
WHERE a.t->>'time' = b.t->>'time'
  AND a.t->>'type' = b.t->>'type'
  AND COALESCE(a.t->>'activityLabel','') = COALESCE(b.t->>'activityLabel','')
  AND a.t->>'time' IS NOT NULL
ORDER BY a.k, a.t->>'time';

\echo ''
\echo '═══════════════════════════════════════════════════════════════════'
\echo '  3) MEAL-LEVEL POLLUTION — identical meal inside dayv2.meals'
\echo '     (match by meal.time + first item.product_id)'
\echo '═══════════════════════════════════════════════════════════════════'
WITH a AS (
  SELECT k, jsonb_array_elements(v->'meals') AS m
  FROM client_kv_store
  WHERE client_id = '$CID_A' AND k LIKE 'heys_dayv2_%'
),
b AS (
  SELECT k, jsonb_array_elements(v->'meals') AS m
  FROM client_kv_store
  WHERE client_id = '$CID_B' AND k LIKE 'heys_dayv2_%'
)
SELECT
  a.k,
  a.m->>'time' AS time,
  a.m->'items'->0->>'product_id' AS first_pid,
  CASE WHEN a.m = b.m THEN 'exact meal' ELSE 'time+pid only' END AS match_kind
FROM a
JOIN b USING (k)
WHERE a.m->>'time' IS NOT NULL
  AND a.m->'items'->0->>'product_id' IS NOT NULL
  AND a.m->>'time' = b.m->>'time'
  AND a.m->'items'->0->>'product_id' = b.m->'items'->0->>'product_id'
ORDER BY a.k, a.m->>'time';

\echo ''
\echo '═══════════════════════════════════════════════════════════════════'
\echo '  4) SCALAR-FIELD POLLUTION — identical scalar fields inside dayv2'
\echo '     (cycleDay/dayComment/sleepNote/morningActivation — high-signal,'
\echo '      low coincidence rate. weight/sleepHours/mood пропускаем — часто'
\echo '      совпадают у разных людей по совпадению, не из-за утечки.)'
\echo '═══════════════════════════════════════════════════════════════════'
WITH a AS (
  SELECT k, v
  FROM client_kv_store
  WHERE client_id = '$CID_A' AND k LIKE 'heys_dayv2_%'
),
b AS (
  SELECT k, v
  FROM client_kv_store
  WHERE client_id = '$CID_B' AND k LIKE 'heys_dayv2_%'
),
joined AS (
  SELECT a.k,
         a.v AS av, b.v AS bv,
         a.v->>'cycleDay'           AS a_cycle,
         b.v->>'cycleDay'           AS b_cycle,
         COALESCE(a.v->>'dayComment','')  AS a_cmt,
         COALESCE(b.v->>'dayComment','')  AS b_cmt,
         COALESCE(a.v->>'sleepNote','')   AS a_note,
         COALESCE(b.v->>'sleepNote','')   AS b_note,
         a.v->'morningActivation'->>'copyId' AS a_ma_copy,
         b.v->'morningActivation'->>'copyId' AS b_ma_copy,
         a.v->'morningActivation'->>'decidedAt' AS a_ma_at,
         b.v->'morningActivation'->>'decidedAt' AS b_ma_at,
         a.v->>'_sourceId'  AS a_src,
         b.v->>'_sourceId'  AS b_src,
         a.v->>'_mergedAt'  AS a_merged
  FROM a JOIN b USING (k)
)
SELECT k,
       CASE
         WHEN a_cycle IS NOT NULL AND a_cycle = b_cycle  THEN 'cycleDay='||a_cycle
         WHEN a_cmt   <> '' AND a_cmt = b_cmt            THEN 'dayComment'
         WHEN a_note  <> '' AND a_note = b_note          THEN 'sleepNote'
         WHEN a_ma_at IS NOT NULL AND a_ma_at = b_ma_at  THEN 'MA.decidedAt='||a_ma_at
         WHEN a_src   IS NOT NULL AND a_src = b_src      THEN '_sourceId='||substring(a_src for 8)
       END AS leak_field,
       CASE WHEN a_merged IS NOT NULL THEN '⚠ A_was_merged' ELSE '' END AS extra
FROM joined
WHERE  (a_cycle IS NOT NULL AND a_cycle = b_cycle)
    OR (a_cmt <> '' AND a_cmt = b_cmt)
    OR (a_note <> '' AND a_note = b_note)
    OR (a_ma_at IS NOT NULL AND a_ma_at = b_ma_at)
    OR (a_src IS NOT NULL AND a_src = b_src)
ORDER BY k DESC;

\echo ''
\echo 'Legend:'
\echo '  A = $CID_A'
\echo '  B = $CID_B'
\echo '  Newer updated_at = leak side (fanout-over-switch pattern).'
\echo '  Class 4 \"⚠ A_was_merged\" = у A была запись через mergeDayData (suspect).'
\echo 'Cleanup:'
\echo '  row-level     -> DELETE FROM client_kv_store WHERE client_id=<leak> AND k=<k>;'
\echo '  training/meal -> jsonb_set replace + bump v.updatedAt (см. plan в чате).'
\echo '  scalar field  -> UPDATE ... SET v = v - ''cycleDay'' (или jsonb_set null) + bump.'
SQL
