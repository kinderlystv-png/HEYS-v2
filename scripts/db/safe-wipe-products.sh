#!/usr/bin/env bash
# safe-wipe-products.sh — wipe heys_products для клиента с автоматическим
# проставлением tombstone-trail (heys_deleted_ids), чтобы при следующем cloud-sync
# продукты не «воскресли» через merge.
#
# Это безопасная альтернатива database/_dangerous/delete_client_products*.sql,
# которые тупо UPDATE SET v='[]' без tombstone — оставляли orphan'ов на всех
# уже существующих днях клиента и опционально resurrect'или продукты на следующем
# sync (если другое устройство клиента не получило тот же wipe).
#
# Plan F16 (rustling-dazzling-bentley.md).
#
# Usage:
#   bash scripts/db/safe-wipe-products.sh --client-id <uuid> [--dry-run]
#
# Flow:
#   1. SELECT всех product id+name из текущего heys_products клиента
#   2. UPSERT в heys_deleted_ids массив этих id+name (с поправкой существующих)
#   3. UPDATE heys_products SET v='[]'
#   4. Verify: heys_products пустой, heys_deleted_ids содержит все id из шага 1
#
# Dry-run печатает что будет сделано, без mutate.

set -e

CID=""
DRY=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --client-id)
      CID="$2"
      shift 2
      ;;
    --dry-run)
      DRY=1
      shift
      ;;
    -h|--help)
      sed -n '2,25p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown arg: $1" >&2
      exit 1
      ;;
  esac
done

if [ -z "$CID" ]; then
  echo "Usage: $0 --client-id <uuid> [--dry-run]" >&2
  exit 1
fi

SCRIPT_DIR="$(dirname "$0")"
PSQL="$SCRIPT_DIR/psql.sh"

echo "🔍 [safe-wipe-products] client_id=$CID dry_run=$DRY"
echo

# Шаг 1: считать сколько продуктов будет wipe'нуто и какие именно
echo "Шаг 1: текущее состояние heys_products"
"$PSQL" -c "
SELECT
  jsonb_array_length(v) AS products_count,
  to_char(updated_at, 'YYYY-MM-DD HH24:MI:SS') AS last_updated
FROM client_kv_store
WHERE client_id = '$CID' AND k = 'heys_products';
"

# Шаг 2: показать sample tombstone trail
echo
echo "Шаг 2: sample 5 продуктов которые будут tombstoned"
"$PSQL" -c "
SELECT
  e->>'id' AS id,
  e->>'name' AS name,
  e->>'fingerprint' AS fingerprint
FROM client_kv_store, jsonb_array_elements(v) AS e
WHERE client_id = '$CID' AND k = 'heys_products'
LIMIT 5;
"

if [ "$DRY" -eq 1 ]; then
  echo
  echo "🛑 [safe-wipe-products] --dry-run — exit без mutate"
  exit 0
fi

echo
echo "🚨 ВНИМАНИЕ: сейчас будет проставлен tombstone для ВСЕХ продуктов клиента $CID"
echo "    и heys_products будет очищен. Это влияет на все устройства клиента."
echo
read -r -p "Продолжить? (введи 'yes wipe' для подтверждения): " CONFIRM
if [ "$CONFIRM" != "yes wipe" ]; then
  echo "Отмена."
  exit 1
fi

echo
echo "Шаг 3: UPSERT tombstones в heys_deleted_ids (merge с существующими)"
"$PSQL" -c "
WITH old_products AS (
  SELECT v AS products
  FROM client_kv_store
  WHERE client_id = '$CID' AND k = 'heys_products'
),
new_tombstones AS (
  SELECT jsonb_agg(jsonb_build_object(
    'id', e->>'id',
    'name', e->>'name',
    'fingerprint', e->>'fingerprint',
    'deletedAt', extract(epoch from now()) * 1000
  )) AS arr
  FROM old_products, jsonb_array_elements(old_products.products) AS e
  WHERE e->>'id' IS NOT NULL OR e->>'name' IS NOT NULL
),
existing_tombstones AS (
  SELECT COALESCE(v, '[]'::jsonb) AS arr
  FROM client_kv_store
  WHERE client_id = '$CID' AND k = 'heys_deleted_ids'
)
INSERT INTO client_kv_store (client_id, k, v, updated_at)
SELECT
  '$CID'::uuid,
  'heys_deleted_ids',
  COALESCE(et.arr, '[]'::jsonb) || COALESCE(nt.arr, '[]'::jsonb),
  now()
FROM new_tombstones nt
LEFT JOIN existing_tombstones et ON true
ON CONFLICT (client_id, k)
DO UPDATE SET v = EXCLUDED.v, updated_at = EXCLUDED.updated_at;
"

echo
echo "Шаг 4: wipe heys_products"
"$PSQL" -c "
UPDATE client_kv_store
SET v = '[]'::jsonb, updated_at = now()
WHERE client_id = '$CID' AND k = 'heys_products';
"

echo
echo "Шаг 5: verify результата"
"$PSQL" -c "
SELECT
  k,
  CASE
    WHEN k = 'heys_products' THEN jsonb_array_length(v)::text || ' (expected 0)'
    WHEN k = 'heys_deleted_ids' THEN jsonb_array_length(v)::text || ' tombstones'
    ELSE '—'
  END AS state,
  to_char(updated_at, 'YYYY-MM-DD HH24:MI:SS') AS updated
FROM client_kv_store
WHERE client_id = '$CID' AND k IN ('heys_products', 'heys_deleted_ids')
ORDER BY k;
"

echo
echo "✅ [safe-wipe-products] done. После этого на устройствах клиента нужно подождать cloud-sync"
echo "    (heys_deleted_ids синхронизируется через client_kv_store), либо сделать reload."
