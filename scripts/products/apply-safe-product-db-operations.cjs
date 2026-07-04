#!/usr/bin/env node

const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const PSQL = 'scripts/db/psql.sh';
const APPLY = process.argv.includes('--apply');

const COMPRESS_PATTERNS = {
  '"name":"': '¤n¤',
  '"kcal100":': '¤k¤',
  '"protein100":': '¤p¤',
  '"carbs100":': '¤c¤',
  '"fat100":': '¤f¤',
  '"simple100":': '¤s¤',
  '"complex100":': '¤x¤',
  '"badFat100":': '¤b¤',
  '"goodFat100":': '¤g¤',
  '"trans100":': '¤t¤',
  '"fiber100":': '¤i¤',
  '"gi":': '¤G¤',
  '"harm":': '¤H¤',
  '"harmScore":': '¤h¤',
  '"category":"': '¤C¤',
  '"portions":': '¤P¤',
  '"meals":': '¤M¤',
  '"items":': '¤I¤',
  '"product_id":': '¤D¤',
  '"time":"': '¤T¤',
  '"date":"': '¤d¤',
  '"trainings":': '¤R¤',
  '"weightMorning":': '¤W¤',
  '"sleepHours":': '¤S¤',
  '"waterMl":': '¤w¤',
  '"steps":': '¤e¤',
  '"mood":': '¤m¤',
  '"wellbeing":': '¤B¤',
  '"stress":': '¤E¤',
  '"grams":': '¤r¤',
  '":true': '¤1¤',
  '":false': '¤0¤',
  '":null': '¤_¤',
  '"id":': '¤j¤',
};

const DECOMPRESS_PATTERNS = Object.fromEntries(
  Object.entries(COMPRESS_PATTERNS).map(([pattern, code]) => [code, pattern])
);

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/products/apply-safe-product-db-operations.cjs --operations <safe_db_operations.json> [--apply]',
    '',
    'Default mode is dry-run. --apply writes to DB after precondition checks.',
  ].join('\n');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function runJson(sql) {
  const raw = execFileSync('bash', [PSQL, '-X', '-q', '-At', '-c', sql], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 50,
  }).trim();
  if (!raw) return [];
  return JSON.parse(raw);
}

function runSql(sql) {
  return execFileSync('bash', [PSQL, '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-c', sql], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 50,
  });
}

function sqlLiteral(value) {
  if (value === undefined || value === null) return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function normalizeText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function productId(product, fallbackIndex) {
  return String(product?.id ?? product?.product_id ?? fallbackIndex);
}

function decompressValue(value) {
  if (typeof value !== 'string') return value;
  let json = value;
  if (json.startsWith('¤Z¤')) {
    json = json.slice(3);
    for (const [code, pattern] of Object.entries(DECOMPRESS_PATTERNS)) {
      json = json.split(code).join(pattern);
    }
  }
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function compressValue(value) {
  let json = JSON.stringify(value);
  if (json.length <= 384) return json;
  json = json.replace(/:(-?\d+)\.0+(?=[,}\]])/g, ':$1');
  json = json.replace(/:(-?\d+\.\d*?)0+(?=[,}\]])/g, ':$1');
  let compressed = json;
  for (const [pattern, code] of Object.entries(COMPRESS_PATTERNS)) {
    compressed = compressed.split(pattern).join(code);
  }
  return compressed.length < json.length * 0.92 ? `¤Z¤${compressed}` : json;
}

function assertPackage(data) {
  if (!data || typeof data !== 'object') throw new Error('Operations file must be a JSON object');
  if (!Array.isArray(data.operations)) throw new Error('Operations file must contain operations[]');
}

function emitResult(result, outPath) {
  const text = `${JSON.stringify(result, null, 2)}\n`;
  if (outPath) fs.writeFileSync(outPath, text, 'utf8');
  process.stdout.write(text);
}

function groupBy(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    const list = map.get(key) || [];
    list.push(item);
    map.set(key, list);
  }
  return map;
}

function targetKey(operation) {
  const target = operation.target || {};
  if (target.type === 'shared_products_pending.product_data') return `pending:${target.row_id}`;
  if (target.type === 'client_kv_store.product_array_item') return `client:${target.client_id}:${target.key}`;
  return `unsupported:${target.type || 'unknown'}:${operation.operation_id || operation.source_id || ''}`;
}

function matchProduct(product, index, operation) {
  const target = operation.target || {};
  const ids = new Set([
    target.product_id,
    target.row_id,
    operation.preconditions?.product_id,
    operation.preconditions?.row_id,
  ].filter(Boolean).map(String));
  if (ids.has(productId(product, index))) return true;
  if (product?.product_id && ids.has(String(product.product_id))) return true;
  return false;
}

function checkProductPreconditions(product, operation) {
  const failures = [];
  const expectedName = normalizeText(operation.preconditions?.expected_name);
  if (expectedName && normalizeText(product?.name) !== expectedName) {
    failures.push({ field: 'name', expected: expectedName, actual: product?.name ?? null });
  }
  const expectedFingerprint = operation.preconditions?.expected_fingerprint;
  if (expectedFingerprint && product?.fingerprint && String(product.fingerprint) !== String(expectedFingerprint)) {
    failures.push({ field: 'fingerprint', expected: expectedFingerprint, actual: product.fingerprint });
  }
  return failures;
}

function applySet(product, set) {
  return { ...product, ...set };
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean).map(String))];
}

function fetchPendingRows(operations) {
  const ids = uniqueValues(operations.map((operation) => operation.target?.row_id));
  if (!ids.length) return new Map();
  const values = ids.map((id) => `${sqlLiteral(id)}::uuid`).join(',');
  const rows = runJson(`
    SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
    FROM (
      SELECT id::text, product_data
      FROM public.shared_products_pending
      WHERE id IN (${values})
      ORDER BY id
    ) t;
  `);
  return new Map(rows.map((row) => [row.id, row]));
}

function fetchClientRows(operations) {
  const pairs = uniqueValues(operations.map((operation) => {
    const target = operation.target || {};
    if (!target.client_id || !target.key) return null;
    return `${target.client_id}::${target.key}`;
  }));
  if (!pairs.length) return new Map();
  const values = pairs.map((pair) => {
    const [clientId, ...keyParts] = pair.split('::');
    return `(${sqlLiteral(clientId)}::uuid, ${sqlLiteral(keyParts.join('::'))})`;
  }).join(',');
  const rows = runJson(`
    SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
    FROM (
      SELECT client_id::text, k, v, jsonb_typeof(v) AS value_type, updated_at, revision
      FROM public.client_kv_store
      WHERE (client_id, k) IN (VALUES ${values})
      ORDER BY client_id, k
    ) t;
  `);
  return new Map(rows.map((row) => [`${row.client_id}::${row.k}`, row]));
}

function planPending(groupedOperations) {
  const pendingOperations = [...groupedOperations.values()]
    .flat()
    .filter((operation) => operation.target?.type === 'shared_products_pending.product_data');
  const rows = fetchPendingRows(pendingOperations);
  const planned = [];
  const conflicts = [];

  for (const operation of pendingOperations) {
    const row = rows.get(String(operation.target?.row_id || ''));
    if (!row) {
      conflicts.push({ operation_id: operation.operation_id, reason: 'pending row not found', target: operation.target });
      continue;
    }
    const product = row.product_data || {};
    const failures = checkProductPreconditions(product, operation);
    if (failures.length) {
      conflicts.push({ operation_id: operation.operation_id, reason: 'precondition failed', failures, target: operation.target });
      continue;
    }
    const nextProduct = applySet(product, operation.set || {});
    planned.push({
      operation,
      row,
      nextProduct,
      changed: JSON.stringify(product) !== JSON.stringify(nextProduct),
    });
  }

  return { planned, conflicts };
}

function planClientKv(groupedOperations) {
  const clientOperations = [...groupedOperations.values()]
    .flat()
    .filter((operation) => operation.target?.type === 'client_kv_store.product_array_item');
  const rows = fetchClientRows(clientOperations);
  const byRow = groupBy(clientOperations, (operation) => `${operation.target.client_id}::${operation.target.key}`);
  const planned = [];
  const conflicts = [];

  for (const [rowKey, operations] of byRow.entries()) {
    const row = rows.get(rowKey);
    if (!row) {
      conflicts.push({ row_key: rowKey, reason: 'client_kv_store row not found', operations: operations.map((op) => op.operation_id) });
      continue;
    }
    const value = decompressValue(row.v);
    if (!Array.isArray(value)) {
      conflicts.push({ row_key: rowKey, reason: 'client_kv_store value is not an array', operations: operations.map((op) => op.operation_id) });
      continue;
    }
    let changed = false;
    const appliedOperationIds = [];
    const nextValue = value.map((product, index) => {
      if (!product || typeof product !== 'object') return product;
      const matching = operations.filter((operation) => matchProduct(product, index, operation));
      if (!matching.length) return product;
      let nextProduct = product;
      for (const operation of matching) {
        const failures = checkProductPreconditions(nextProduct, operation);
        if (failures.length) {
          conflicts.push({ operation_id: operation.operation_id, row_key: rowKey, reason: 'precondition failed', failures, target: operation.target });
          continue;
        }
        nextProduct = applySet(nextProduct, operation.set || {});
        appliedOperationIds.push(operation.operation_id);
      }
      if (JSON.stringify(product) !== JSON.stringify(nextProduct)) changed = true;
      return nextProduct;
    });
    const unmatched = operations
      .filter((operation) => !appliedOperationIds.includes(operation.operation_id))
      .filter((operation) => !conflicts.some((conflict) => conflict.operation_id === operation.operation_id));
    for (const operation of unmatched) {
      conflicts.push({ operation_id: operation.operation_id, row_key: rowKey, reason: 'product item not found', target: operation.target });
    }
    planned.push({ row, nextValue, changed, appliedOperationIds });
  }

  return { planned, conflicts };
}

function applyPending(planned) {
  let updated = 0;
  for (const item of planned) {
    if (!item.changed) continue;
    runSql(`
BEGIN;
CREATE TABLE IF NOT EXISTS public.product_review_pending_backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  row_id uuid NOT NULL,
  product_data jsonb NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.product_review_pending_backups (row_id, product_data, reason)
SELECT id, product_data, 'product_review_safe_ops_2026_07_03'
FROM public.shared_products_pending
WHERE id = ${sqlLiteral(item.row.id)}::uuid;
UPDATE public.shared_products_pending
SET product_data = ${sqlLiteral(JSON.stringify(item.nextProduct))}::jsonb
WHERE id = ${sqlLiteral(item.row.id)}::uuid;
COMMIT;
`);
    updated += 1;
  }
  return updated;
}

function applyClientKv(planned) {
  let updated = 0;
  for (const item of planned) {
    if (!item.changed) continue;
    const nextStoredValue = item.row.value_type === 'string'
      ? compressValue(item.nextValue)
      : item.nextValue;
    runSql(`
BEGIN;
CREATE TABLE IF NOT EXISTS public.product_review_client_kv_backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  k text NOT NULL,
  v jsonb NOT NULL,
  updated_at timestamptz,
  revision bigint,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.product_review_client_kv_backups (client_id, k, v, updated_at, revision, reason)
SELECT client_id, k, v, updated_at, revision, 'product_review_safe_ops_2026_07_03'
FROM public.client_kv_store
WHERE client_id = ${sqlLiteral(item.row.client_id)}::uuid
  AND k = ${sqlLiteral(item.row.k)};
UPDATE public.client_kv_store
SET v = ${sqlLiteral(JSON.stringify(nextStoredValue))}::jsonb,
    updated_at = now()
WHERE client_id = ${sqlLiteral(item.row.client_id)}::uuid
  AND k = ${sqlLiteral(item.row.k)};
COMMIT;
`);
    updated += 1;
  }
  return updated;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.operations) {
    console.error(usage());
    process.exit(2);
  }
  const data = readJson(args.operations);
  assertPackage(data);
  const operations = data.operations;
  const grouped = groupBy(operations, targetKey);
  const pending = planPending(grouped);
  const clientKv = planClientKv(grouped);
  const conflicts = [...pending.conflicts, ...clientKv.conflicts];
  const pendingChanged = pending.planned.filter((item) => item.changed).length;
  const clientKvChanged = clientKv.planned.filter((item) => item.changed).length;
  const result = {
    apply: APPLY,
    operations_total: operations.length,
    pending: {
      planned_rows: pending.planned.length,
      changed_rows: pendingChanged,
      conflicts: pending.conflicts.length,
    },
    client_kv: {
      planned_rows: clientKv.planned.length,
      changed_rows: clientKvChanged,
      conflicts: clientKv.conflicts.length,
    },
    conflicts: {
      count: conflicts.length,
      sample: conflicts.slice(0, 20),
    },
  };

  if (conflicts.length > 0) {
    emitResult(result, args.out);
    if (APPLY) {
      console.error('Refusing to apply while conflicts exist.');
      process.exit(1);
    }
    return;
  }

  if (APPLY) {
    result.pending.updated_rows = applyPending(pending.planned);
    result.client_kv.updated_rows = applyClientKv(clientKv.planned);
  }

  emitResult(result, args.out);
}

main();
