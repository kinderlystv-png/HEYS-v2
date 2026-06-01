#!/usr/bin/env bash
# audit-baseline-snapshot.sh — daily baseline of cross-client pollution
# between two clients of a curator. Wraps audit-cross-client-pollution.sh
# logic as COUNT(*) queries with noise filtering, persists snapshot to
# data/audit/, and diffs against previous snapshot for the same pair.
#
# Noise filtered out:
#   class 1: heys_dayv2_date  (UI selection scalar — coincides naturally)
#   class 3: meals where items[0].product_id LIKE 'estimated_quickfill_%'
#            (deterministic algorithm output — identical by design)
#
# Exit codes:
#   0 — baseline saved; no regression vs previous (or no previous yet)
#   1 — regression detected (any of classes 1..4 increased)
#   2 — usage error / runtime failure
#
# Usage:
#   ./scripts/db/audit-baseline-snapshot.sh <pair_name> <cid_a> <cid_b>
#
# Example:
#   ./scripts/db/audit-baseline-snapshot.sh poplanton-alexandra \
#     ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a \
#     4545ee50-4f5f-4fc0-b862-7ca45fa1bafc

set -eu

if [ $# -lt 3 ]; then
  echo "Usage: $0 <pair_name> <cid_a> <cid_b>" >&2
  exit 2
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq required but not installed" >&2
  exit 2
fi

PAIR="$1"
CID_A="$2"
CID_B="$3"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TODAY="$(date +%Y-%m-%d)"
OUT_DIR="$REPO_ROOT/data/audit"
mkdir -p "$OUT_DIR"
OUT_FILE="$OUT_DIR/${TODAY}_${PAIR}.json"

EXCLUDE="(
  'heys_products', 'heys_products_overlay_v2', 'heys_curator_switch_log_v1',
  'heys_tour_completed', 'heys_widgets_tour_completed', 'heys_insights_tour_completed',
  'heys_achievements_v2_migrated', 'heys_achievements_v5_migrated',
  'heys_first_perfect_meal', 'heys_meal_hint_shown',
  'heys_leaderboard_sharing', 'heys_measurement_side',
  'heys_diary_health_trend_period_v1', 'heys_deleted_products_ignore_list',
  'heys_last_sync_ts', 'heys_last_visit', 'heys_weekly_wrap_last_shown_v2',
  'heys_best_streak',
  'heys_dayv2_date'
)"

COUNTS=$("$SCRIPT_DIR/psql.sh" -t -A -X <<SQL
SELECT count(*) FROM (
  SELECT a.k FROM client_kv_store a
  JOIN client_kv_store b USING (k)
  WHERE a.client_id='$CID_A' AND b.client_id='$CID_B'
    AND md5(a.v::text) = md5(b.v::text)
    AND a.k NOT IN $EXCLUDE
    AND a.k NOT LIKE 'heys_last_grams_%'
) x;

SELECT count(*) FROM (
  WITH a AS (SELECT k, jsonb_array_elements(v->'trainings') AS t
             FROM client_kv_store WHERE client_id='$CID_A' AND k LIKE 'heys_dayv2_%'),
       b AS (SELECT k, jsonb_array_elements(v->'trainings') AS t
             FROM client_kv_store WHERE client_id='$CID_B' AND k LIKE 'heys_dayv2_%')
  SELECT a.k FROM a JOIN b USING (k)
  WHERE a.t->>'time' = b.t->>'time'
    AND a.t->>'type' = b.t->>'type'
    AND COALESCE(a.t->>'activityLabel','') = COALESCE(b.t->>'activityLabel','')
    AND a.t->>'time' IS NOT NULL
) x;

SELECT count(*) FROM (
  WITH a AS (SELECT k, jsonb_array_elements(v->'meals') AS m
             FROM client_kv_store WHERE client_id='$CID_A' AND k LIKE 'heys_dayv2_%'),
       b AS (SELECT k, jsonb_array_elements(v->'meals') AS m
             FROM client_kv_store WHERE client_id='$CID_B' AND k LIKE 'heys_dayv2_%')
  SELECT a.k FROM a JOIN b USING (k)
  WHERE a.m->>'time' IS NOT NULL
    AND a.m->'items'->0->>'product_id' IS NOT NULL
    AND a.m->>'time' = b.m->>'time'
    AND a.m->'items'->0->>'product_id' = b.m->'items'->0->>'product_id'
    AND a.m->'items'->0->>'product_id' NOT LIKE 'estimated_quickfill_%'
) x;

SELECT count(*) FROM (
  WITH a AS (SELECT k, v FROM client_kv_store WHERE client_id='$CID_A' AND k LIKE 'heys_dayv2_%'),
       b AS (SELECT k, v FROM client_kv_store WHERE client_id='$CID_B' AND k LIKE 'heys_dayv2_%'),
       joined AS (
         SELECT a.k,
                a.v->>'cycleDay' AS a_cycle, b.v->>'cycleDay' AS b_cycle,
                COALESCE(a.v->>'dayComment','') AS a_cmt, COALESCE(b.v->>'dayComment','') AS b_cmt,
                COALESCE(a.v->>'sleepNote','')  AS a_note, COALESCE(b.v->>'sleepNote','') AS b_note,
                a.v->'morningActivation'->>'decidedAt' AS a_ma_at,
                b.v->'morningActivation'->>'decidedAt' AS b_ma_at,
                a.v->>'_sourceId' AS a_src, b.v->>'_sourceId' AS b_src
         FROM a JOIN b USING (k)
       )
  SELECT k FROM joined
  WHERE (a_cycle IS NOT NULL AND a_cycle = b_cycle)
     OR (a_cmt <> '' AND a_cmt = b_cmt)
     OR (a_note <> '' AND a_note = b_note)
     OR (a_ma_at IS NOT NULL AND a_ma_at = b_ma_at)
     OR (a_src IS NOT NULL AND a_src = b_src)
) x;

SELECT count(*) FROM (
  SELECT a.k FROM client_kv_store a
  JOIN client_kv_store b USING (k)
  WHERE a.client_id='$CID_A' AND b.client_id='$CID_B'
    AND md5(a.v::text) = md5(b.v::text)
    AND a.k = 'heys_dayv2_date'
) x;

SELECT count(*) FROM (
  WITH a AS (SELECT k, jsonb_array_elements(v->'meals') AS m
             FROM client_kv_store WHERE client_id='$CID_A' AND k LIKE 'heys_dayv2_%'),
       b AS (SELECT k, jsonb_array_elements(v->'meals') AS m
             FROM client_kv_store WHERE client_id='$CID_B' AND k LIKE 'heys_dayv2_%')
  SELECT a.k FROM a JOIN b USING (k)
  WHERE a.m->>'time' IS NOT NULL
    AND a.m->'items'->0->>'product_id' LIKE 'estimated_quickfill_%'
    AND a.m->>'time' = b.m->>'time'
    AND a.m->'items'->0->>'product_id' = b.m->'items'->0->>'product_id'
) x;
SQL
)

LINES=()
while IFS= read -r line; do
  LINES+=("$line")
done <<< "$COUNTS"
if [ "${#LINES[@]}" -lt 6 ]; then
  echo "psql returned fewer than 6 result lines (got ${#LINES[@]}): $COUNTS" >&2
  exit 2
fi

C1="${LINES[0]}"
C2="${LINES[1]}"
C3="${LINES[2]}"
C4="${LINES[3]}"
EX_DATE="${LINES[4]}"
EX_QFILL="${LINES[5]}"

jq -n \
  --arg date "$TODAY" \
  --arg pair "$PAIR" \
  --arg cid_a "$CID_A" \
  --arg cid_b "$CID_B" \
  --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --argjson c1 "$C1" \
  --argjson c2 "$C2" \
  --argjson c3 "$C3" \
  --argjson c4 "$C4" \
  --argjson ex_date "$EX_DATE" \
  --argjson ex_qfill "$EX_QFILL" \
  '{
    date: $date,
    pair: $pair,
    cid_a: $cid_a,
    cid_b: $cid_b,
    timestamp: $ts,
    class1: $c1,
    class2: $c2,
    class3: $c3,
    class4: $c4,
    excluded: { class1_ui_date: $ex_date, class3_quickfill: $ex_qfill }
  }' > "$OUT_FILE"

echo "📸 Snapshot: $OUT_FILE"
jq . "$OUT_FILE"
echo

PREV_FILE=$(find "$OUT_DIR" -name "*_${PAIR}.json" ! -name "${TODAY}_*" 2>/dev/null | sort -r | head -1)
if [ -z "$PREV_FILE" ]; then
  echo "(no previous snapshot for pair '$PAIR' — baseline saved, exit 0)"
  exit 0
fi

echo "🔁 Comparing with previous: $(basename "$PREV_FILE")"
EXIT=0
for class in 1 2 3 4; do
  CUR=$(jq -r ".class${class}" "$OUT_FILE")
  PREV=$(jq -r ".class${class}" "$PREV_FILE")
  if [ "$CUR" -gt "$PREV" ]; then
    DELTA=$((CUR - PREV))
    echo "❌ class${class}: ${PREV} → ${CUR} (+${DELTA}) — NEW LEAKS"
    EXIT=1
  elif [ "$CUR" -lt "$PREV" ]; then
    DELTA=$((PREV - CUR))
    echo "✅ class${class}: ${PREV} → ${CUR} (-${DELTA}) — cleanup confirmed"
  else
    echo "= class${class}: ${CUR} (stable)"
  fi
done

exit $EXIT
