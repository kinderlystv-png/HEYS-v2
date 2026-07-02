#!/usr/bin/env node

import { execFileSync } from 'node:child_process';

const PSQL = 'scripts/db/psql.sh';
const APPLY = process.argv.includes('--apply');
const REASON = 'legacy_products_dedupe_2026_07_02';

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
  '"id":': '¤j¤'
};

const DECOMPRESS_PATTERNS = Object.fromEntries(
  Object.entries(COMPRESS_PATTERNS).map(([pattern, code]) => [code, pattern])
);

function runJson(sql) {
  const raw = execFileSync('bash', [PSQL, '-X', '-q', '-At', '-c', sql], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 80
  }).trim();
  return raw ? JSON.parse(raw) : [];
}

function runSql(sql) {
  return execFileSync('bash', [PSQL, '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-c', sql], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 80
  });
}

function sqlLiteral(value) {
  if (value == null) return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
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

function compressValue(obj) {
  let json = JSON.stringify(obj);
  if (json.length <= 384) return json;
  json = json.replace(/:(-?\d+)\.0+(?=[,}\]])/g, ':$1');
  json = json.replace(/:(-?\d+\.\d*?)0+(?=[,}\]])/g, ':$1');
  let compressed = json;
  for (const [pattern, code] of Object.entries(COMPRESS_PATTERNS)) {
    compressed = compressed.split(pattern).join(code);
  }
  return compressed.length < json.length * 0.92 ? `¤Z¤${compressed}` : json;
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .trim()
    .replace(/\s+/g, ' ');
}

function productId(product, index) {
  return String(product?.id ?? product?.product_id ?? product?.productId ?? index);
}

function productName(product) {
  return String(product?.name ?? product?.overrides?.name ?? '').trim();
}

function productBrand(product) {
  return String(product?.brand ?? product?.overrides?.brand ?? '').trim();
}

function productKey(product) {
  const brandFingerprint = String(product?.brand_fingerprint ?? product?.brandFingerprint ?? '').trim();
  if (brandFingerprint) return `bfp:${brandFingerprint}`;
  const fingerprint = String(product?.fingerprint || '').trim();
  const brand = normalizeText(productBrand(product));
  if (fingerprint && brand) return `fp:${fingerprint}::brand:${brand}`;
  if (fingerprint) return `fp:${fingerprint}`;
  const name = normalizeText(productName(product));
  return name ? `name:${name}::brand:${brand}` : '';
}

function isTemporaryId(id) {
  return /^(p_|restored_|estimated_|estimated_quickfill_)/.test(String(id || ''));
}

function getRows() {
  return runJson(`
    SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
    FROM (
      SELECT client_id::text, k, v, updated_at::text, revision
      FROM public.client_kv_store
      WHERE k = 'heys_products'
         OR k LIKE 'heys_products_rpc_tail_%'
         OR k LIKE 'heys_dayv2_%'
      ORDER BY client_id, k
    ) t;
  `);
}

function countRefs(dayRows, clientId) {
  const refs = new Map();
  for (const row of dayRows.filter((item) => item.client_id === clientId)) {
    const day = row.v;
    if (!day || typeof day !== 'object' || !Array.isArray(day.meals)) continue;
    for (const meal of day.meals) {
      if (!meal || !Array.isArray(meal.items)) continue;
      for (const item of meal.items) {
        if (!item || typeof item !== 'object') continue;
        for (const key of ['product_id', 'productId']) {
          const id = item[key];
          if (!id) continue;
          refs.set(String(id), (refs.get(String(id)) || 0) + 1);
        }
      }
    }
  }
  return refs;
}

function buildPlan() {
  const rows = getRows();
  const productRows = rows.filter((row) => row.k === 'heys_products' || /^heys_products_rpc_tail_\d+$/.test(row.k));
  const dayRows = rows.filter((row) => /^heys_dayv2_\d{4}-\d{2}-\d{2}$/.test(row.k) && row.v && typeof row.v === 'object');
  const clients = Array.from(new Set(productRows.map((row) => row.client_id))).sort();
  const clientPlans = [];

  for (const clientId of clients) {
    const clientProductRows = productRows.filter((row) => row.client_id === clientId);
    const mainRow = clientProductRows.find((row) => row.k === 'heys_products');
    if (!mainRow) continue;
    const tailRows = clientProductRows
      .filter((row) => /^heys_products_rpc_tail_\d+$/.test(row.k))
      .sort((a, b) => Number(a.k.match(/_(\d+)$/)?.[1] || 0) - Number(b.k.match(/_(\d+)$/)?.[1] || 0));

    const merged = [];
    const mainValue = decompressValue(mainRow.v);
    if (Array.isArray(mainValue)) merged.push(...mainValue);
    for (const row of tailRows) {
      if (Array.isArray(row.v)) merged.push(...row.v);
    }

    const refs = countRefs(dayRows, clientId);
    const groups = new Map();
    merged.forEach((product, index) => {
      if (!product || typeof product !== 'object') return;
      const key = productKey(product);
      if (!key) return;
      const list = groups.get(key) || [];
      list.push({ product, index, id: productId(product, index), refs: refs.get(productId(product, index)) || 0 });
      groups.set(key, list);
    });

    const aliasMap = new Map();
    const removeIndices = new Set();
    const duplicateGroups = [];
    for (const [key, list] of groups) {
      if (list.length <= 1) continue;
      const sorted = [...list].sort((a, b) => (
        b.refs - a.refs
        || Number(isTemporaryId(a.id)) - Number(isTemporaryId(b.id))
        || a.index - b.index
      ));
      const canonical = sorted[0];
      const aliases = sorted.slice(1);
      duplicateGroups.push({
        key,
        canonical: { id: canonical.id, name: productName(canonical.product), refs: canonical.refs },
        aliases: aliases.map((item) => ({ id: item.id, name: productName(item.product), refs: item.refs }))
      });
      aliases.forEach((item) => {
        removeIndices.add(item.index);
        if (item.id !== canonical.id) aliasMap.set(item.id, canonical.id);
      });
    }

    const nextProducts = [];
    merged.forEach((product, index) => {
      if (!removeIndices.has(index)) nextProducts.push(product);
    });

    const affectedDays = [];
    for (const row of dayRows.filter((item) => item.client_id === clientId)) {
      let changed = false;
      const nextDay = JSON.parse(JSON.stringify(row.v));
      for (const meal of nextDay.meals || []) {
        for (const item of meal?.items || []) {
          if (!item || typeof item !== 'object') continue;
          for (const key of ['product_id', 'productId']) {
            const current = item[key] ? String(item[key]) : '';
            if (current && aliasMap.has(current)) {
              item[key] = aliasMap.get(current);
              changed = true;
            }
          }
        }
      }
      if (changed) affectedDays.push({ ...row, nextValue: nextDay });
    }

    const needsCompact = tailRows.length > 0;
    const needsDedupe = aliasMap.size > 0;
    if (!needsCompact && !needsDedupe) continue;

    clientPlans.push({
      clientId,
      mainRow,
      tailRows,
      beforeProducts: merged.length,
      afterProducts: nextProducts.length,
      duplicateGroups,
      aliases: Array.from(aliasMap.entries()).map(([oldId, newId]) => ({ oldId, newId })),
      removedProductRows: removeIndices.size,
      affectedDays,
      nextProducts
    });
  }

  return clientPlans;
}

function backupAndUpdateClient(plan) {
  const backupKeys = [plan.mainRow.k, ...plan.tailRows.map((row) => row.k), ...plan.affectedDays.map((row) => row.k)];
  const backupValues = backupKeys.map((key) => `(${sqlLiteral(plan.clientId)}::uuid, ${sqlLiteral(key)})`).join(',\n');
  const tailKeys = plan.tailRows.map((row) => sqlLiteral(row.k)).join(', ');
  const nextProductsWire = compressValue(plan.nextProducts);

  let sql = `
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

WITH backup_keys(client_id, k) AS (
  VALUES
  ${backupValues}
)
INSERT INTO public.client_kv_store_dedupe_backups (client_id, k, v, updated_at, revision, reason)
SELECT ckv.client_id, ckv.k, ckv.v, ckv.updated_at, ckv.revision, ${sqlLiteral(REASON)}
FROM public.client_kv_store ckv
JOIN backup_keys bk
  ON bk.client_id = ckv.client_id
 AND bk.k = ckv.k;

UPDATE public.client_kv_store
SET v = ${sqlLiteral(JSON.stringify(nextProductsWire))}::jsonb,
    updated_at = now()
WHERE client_id = ${sqlLiteral(plan.clientId)}::uuid
  AND k = 'heys_products';
`;

  if (plan.tailRows.length) {
    sql += `
DELETE FROM public.client_kv_store
WHERE client_id = ${sqlLiteral(plan.clientId)}::uuid
  AND k IN (${tailKeys});
`;
  }

  for (const day of plan.affectedDays) {
    sql += `
UPDATE public.client_kv_store
SET v = ${sqlLiteral(JSON.stringify(day.nextValue))}::jsonb,
    updated_at = now()
WHERE client_id = ${sqlLiteral(plan.clientId)}::uuid
  AND k = ${sqlLiteral(day.k)};
`;
  }

  sql += '\nCOMMIT;\n';
  runSql(sql);
}

const plans = buildPlan();
const summary = {
  clients: plans.length,
  duplicate_groups: plans.reduce((sum, plan) => sum + plan.duplicateGroups.length, 0),
  aliases_to_remove: plans.reduce((sum, plan) => sum + plan.aliases.length, 0),
  product_rows_to_remove: plans.reduce((sum, plan) => sum + plan.removedProductRows, 0),
  affected_day_rows: plans.reduce((sum, plan) => sum + plan.affectedDays.length, 0),
  tail_rows_to_remove: plans.reduce((sum, plan) => sum + plan.tailRows.length, 0)
};

if (APPLY) {
  for (const plan of plans) backupAndUpdateClient(plan);
  console.log(JSON.stringify({ applied: true, reason: REASON, summary }, null, 2));
} else {
  console.log(JSON.stringify({
    applied: false,
    reason: REASON,
    summary,
    clients: plans.map((plan) => ({
      client_id: plan.clientId,
      before_products: plan.beforeProducts,
      after_products: plan.afterProducts,
      duplicate_groups: plan.duplicateGroups,
      product_rows_to_remove: plan.removedProductRows,
      aliases_to_remove: plan.aliases,
      affected_day_keys: plan.affectedDays.map((row) => row.k),
      tail_keys_to_remove: plan.tailRows.map((row) => row.k)
    }))
  }, null, 2));
}
