#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const PSQL = 'scripts/db/psql.sh';
const APPLY = process.argv.includes('--apply');
const INCLUDE_REVIEW = process.argv.includes('--include-review');

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

const BRAND_RULES = [
  'Nestlé Хрутка',
  'Nestle Хрутка',
  'Простоквашино',
  'Кубанский молочник',
  'Ясно Солнышко',
  'Хрутка',
  'Bombbar',
  'Levro',
  'Raffaello',
  'Savoiardi',
  'Индилайт'
];

function runJson(sql) {
  const raw = execFileSync('bash', [PSQL, '-X', '-q', '-At', '-c', sql], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 20
  }).trim();
  if (!raw) return [];
  return JSON.parse(raw);
}

function runSql(sql) {
  return execFileSync('bash', [PSQL, '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-c', sql], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 20
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

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function removeBrandFromName(name, brand) {
  const rawName = String(name || '').trim().replace(/\s+/g, ' ');
  const rawBrand = String(brand || '').trim().replace(/\s+/g, ' ');
  if (!rawName || !rawBrand) return rawName;
  const brandPattern = rawBrand.split(/\s+/).map(escapeRegExp).join('\\s+');
  const edgePattern = new RegExp(`(^|[\\s"«„“”'()\\[\\]{}.,;:–—-]+)(${brandPattern})(?=$|[\\s"»“”'()\\[\\]{}.,;:–—-]+)`, 'i');
  const cleaned = rawName
    .replace(edgePattern, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/([([{«„])\s+/g, '$1')
    .replace(/\s+([)\]}»“”])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return cleaned || rawName;
}

function findBrandCandidate(name) {
  const rawName = String(name || '').trim().replace(/\s+/g, ' ');
  if (!rawName) return null;
  for (const brand of BRAND_RULES) {
    const cleanName = removeBrandFromName(rawName, brand);
    if (cleanName && cleanName !== rawName) {
      const status = /\s[0-9]+([,.][0-9]+)?$/.test(cleanName)
        ? 'needs_review_numeric_tail'
        : 'safe_candidate';
      return { brand, name: cleanName, status };
    }
  }
  return null;
}

function productBrand(product) {
  return String(product?.brand ?? product?.overrides?.brand ?? '').trim();
}

function productName(product) {
  return String(product?.name ?? product?.overrides?.name ?? '').trim();
}

function round1(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10) / 10;
}

function normalizeFingerprintText(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function nutrientParts(product) {
  return [
    product?.simple100,
    product?.complex100,
    product?.protein100,
    product?.badFat100 ?? product?.badfat100,
    product?.goodFat100 ?? product?.goodfat100,
    product?.trans100,
    product?.fiber100,
    product?.gi,
    product?.harm
  ].map((value) => String(round1(value))).join('|');
}

function computeProductFingerprint(product) {
  const namePart = normalizeFingerprintText(product?.name);
  return createHash('sha256').update(`${namePart}::${nutrientParts(product)}`, 'utf8').digest('hex');
}

function computeProductBrandFingerprint(product) {
  const brandPart = normalizeFingerprintText(product?.brand);
  if (!brandPart) return null;
  const namePart = normalizeFingerprintText(product?.name);
  return createHash('sha256').update(`${namePart}::${brandPart}::${nutrientParts(product)}`, 'utf8').digest('hex');
}

function auditShared() {
  const rows = runJson(`
    SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
    FROM (
      SELECT id::text, name, brand
      FROM public.shared_products
      ORDER BY name, id
    ) t;
  `);
  return rows.flatMap((row) => {
    if (productBrand(row)) return [];
    const candidate = findBrandCandidate(row.name);
    if (!candidate) return [];
    return [{
      scope: 'shared_products',
      client_id: null,
      key: null,
      product_id: row.id,
      old_name: row.name,
      proposed_brand: candidate.brand,
      proposed_name: candidate.name,
      status: candidate.status
    }];
  });
}

function auditClientKv() {
  const rows = runJson(`
    SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
    FROM (
      SELECT client_id::text, k, v
      FROM public.client_kv_store
      WHERE k IN ('heys_products', 'heys_products_overlay_v2')
         OR k LIKE 'heys_products_overlay_v2_rpc_tail_%'
      ORDER BY client_id, k
    ) t;
  `);

  const out = [];
  for (const row of rows) {
    const value = decompressValue(row.v);
    if (!Array.isArray(value)) continue;
    value.forEach((product, index) => {
      if (!product || typeof product !== 'object') return;
      if ((row.k === 'heys_products_overlay_v2' || row.k.startsWith('heys_products_overlay_v2_rpc_tail_')) && product.shared_origin_id) return;
      if (productBrand(product)) return;
      const name = productName(product);
      const candidate = findBrandCandidate(name);
      if (!candidate) return;
      out.push({
        scope: 'client_kv_store',
        client_id: row.client_id,
        key: row.k,
        product_id: String(product.id ?? product.product_id ?? index),
        old_name: name,
        proposed_brand: candidate.brand,
        proposed_name: candidate.name,
        status: candidate.status
      });
    });
  }
  return out;
}

function normalizeName(value) {
  return String(value || '').toLowerCase().replace(/ё/g, 'е').trim().replace(/\s+/g, ' ');
}

function auditLegacyProductDuplicates() {
  const rows = runJson(`
    SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
    FROM (
      SELECT client_id::text, k, v
      FROM public.client_kv_store
      WHERE k = 'heys_products'
      ORDER BY client_id, k
    ) t;
  `);
  const groups = new Map();
  for (const row of rows) {
    const value = decompressValue(row.v);
    if (!Array.isArray(value)) continue;
    value.forEach((product, index) => {
      if (!product || typeof product !== 'object') return;
      const name = productName(product);
      if (!name) return;
      const fingerprint = String(product.fingerprint || '').trim();
      const key = `${row.client_id}::${fingerprint ? `fp:${fingerprint}` : `name:${normalizeName(name)}`}`;
      const list = groups.get(key) || [];
      list.push({
        client_id: row.client_id,
        product_id: String(product.id ?? product.product_id ?? index),
        name,
        brand: productBrand(product),
        fingerprint: fingerprint || null
      });
      groups.set(key, list);
    });
  }
  return Array.from(groups.values())
    .filter((items) => items.length > 1)
    .map((items) => ({
      client_id: items[0].client_id,
      duplicate_key: items[0].fingerprint ? `fp:${items[0].fingerprint}` : `name:${normalizeName(items[0].name)}`,
      rows_count: items.length,
      coffee: items.some((item) => normalizeName(item.name).includes('кофе') || normalizeName(item.name).includes('coffee')),
      rows: items
    }))
    .sort((a, b) => Number(b.coffee) - Number(a.coffee) || b.rows_count - a.rows_count);
}

const candidates = [...auditShared(), ...auditClientKv()];
const summary = candidates.reduce((acc, row) => {
  const key = `${row.scope}:${row.key || 'table'}:${row.status}`;
  acc[key] = (acc[key] || 0) + 1;
  return acc;
}, {});
const legacy_duplicate_groups = auditLegacyProductDuplicates();

function selectedCandidates() {
  return candidates.filter((candidate) => (
    candidate.status === 'safe_candidate'
    || (INCLUDE_REVIEW && candidate.status === 'needs_review_numeric_tail')
  ));
}

function applyShared(candidatesToApply) {
  const rows = candidatesToApply.filter((candidate) => candidate.scope === 'shared_products');
  if (!rows.length) return { updated: 0 };
  const values = rows.map((row) => `(${sqlLiteral(row.product_id)}::uuid, ${sqlLiteral(row.proposed_name)}, ${sqlLiteral(row.proposed_brand)})`).join(',\n');
  const sql = `
BEGIN;

CREATE TABLE IF NOT EXISTS public.shared_products_brand_backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  row_data jsonb NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

WITH input(id, next_name, next_brand) AS (
  VALUES
  ${values}
),
backed_up AS (
  INSERT INTO public.shared_products_brand_backups (product_id, row_data, reason)
  SELECT sp.id, to_jsonb(sp), 'product_brand_backfill_2026_07_02'
  FROM public.shared_products sp
  JOIN input ON input.id = sp.id
  WHERE COALESCE(NULLIF(TRIM(sp.brand), ''), '') = ''
  RETURNING product_id
),
updated AS (
  UPDATE public.shared_products sp
  SET name = input.next_name,
      brand = input.next_brand,
      name_norm = lower(trim(regexp_replace(input.next_name, '\\s+', ' ', 'g'))),
      fingerprint = public.compute_product_fingerprint(jsonb_build_object(
        'name', input.next_name,
        'simple100', sp.simple100,
        'complex100', sp.complex100,
        'protein100', sp.protein100,
        'badFat100', sp.badfat100,
        'goodFat100', sp.goodfat100,
        'trans100', sp.trans100,
        'fiber100', sp.fiber100,
        'gi', sp.gi,
        'harm', sp.harm
      )),
      brand_fingerprint = public.compute_product_brand_fingerprint(jsonb_build_object(
        'name', input.next_name,
        'brand', input.next_brand,
        'simple100', sp.simple100,
        'complex100', sp.complex100,
        'protein100', sp.protein100,
        'badFat100', sp.badfat100,
        'goodFat100', sp.goodfat100,
        'trans100', sp.trans100,
        'fiber100', sp.fiber100,
        'gi', sp.gi,
        'harm', sp.harm
      )),
      updated_at = timezone('utc', now())
  FROM input
  WHERE sp.id = input.id
    AND COALESCE(NULLIF(TRIM(sp.brand), ''), '') = ''
  RETURNING sp.id
)
SELECT count(*) AS updated FROM updated;

COMMIT;
`;
  const output = runSql(sql);
  const match = output.match(/\n\s*(\d+)\s*\n/);
  return { updated: match ? Number(match[1]) : rows.length };
}

function applyClientKv(candidatesToApply) {
  const rows = candidatesToApply.filter((candidate) => (
    candidate.scope === 'client_kv_store'
    && (
      candidate.key === 'heys_products'
      || candidate.key === 'heys_products_overlay_v2'
      || String(candidate.key || '').startsWith('heys_products_overlay_v2_rpc_tail_')
    )
  ));
  if (!rows.length) return { updatedRows: 0, updatedProducts: 0 };
  const byRow = new Map();
  for (const row of rows) {
    const key = `${row.client_id}::${row.key}`;
    const list = byRow.get(key) || [];
    list.push(row);
    byRow.set(key, list);
  }

  let updatedRows = 0;
  let updatedProducts = 0;
  const allRows = runJson(`
    SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
    FROM (
      SELECT client_id::text, k, v, jsonb_typeof(v) AS value_type
      FROM public.client_kv_store
      WHERE k = 'heys_products'
         OR k = 'heys_products_overlay_v2'
         OR k LIKE 'heys_products_overlay_v2_rpc_tail_%'
      ORDER BY client_id, k
    ) t;
  `);

  for (const dbRow of allRows) {
    const list = byRow.get(`${dbRow.client_id}::${dbRow.k}`);
    if (!list?.length) continue;
    const value = decompressValue(dbRow.v);
    if (!Array.isArray(value)) continue;
    const byProductId = new Map(list.map((candidate) => [String(candidate.product_id), candidate]));
    let changed = false;
    const nextValue = value.map((product, index) => {
      if (!product || typeof product !== 'object') return product;
      const id = String(product.id ?? product.product_id ?? index);
      const candidate = byProductId.get(id);
      if (!candidate || productBrand(product)) return product;
      const isOverlayRow = dbRow.k === 'heys_products_overlay_v2' || String(dbRow.k || '').startsWith('heys_products_overlay_v2_rpc_tail_');
      const nextProduct = {
        ...product,
        name: candidate.proposed_name,
        brand: candidate.proposed_brand,
        name_norm: normalizeName(candidate.proposed_name)
      };
      nextProduct.fingerprint = computeProductFingerprint(nextProduct);
      nextProduct.brand_fingerprint = computeProductBrandFingerprint(nextProduct);
      if (isOverlayRow && nextProduct.overrides && typeof nextProduct.overrides === 'object') {
        nextProduct.overrides = {
          ...nextProduct.overrides,
          name: candidate.proposed_name,
          brand: candidate.proposed_brand
        };
      }
      changed = true;
      updatedProducts += 1;
      return nextProduct;
    });
    if (!changed) continue;

    const nextStoredValue = dbRow.value_type === 'string'
      ? compressValue(nextValue)
      : nextValue;
    const sql = `
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
INSERT INTO public.client_kv_store_dedupe_backups (client_id, k, v, updated_at, revision, reason)
SELECT client_id, k, v, updated_at, revision, 'product_brand_backfill_2026_07_02'
FROM public.client_kv_store
WHERE client_id = ${sqlLiteral(dbRow.client_id)}::uuid
  AND k = ${sqlLiteral(dbRow.k)};
UPDATE public.client_kv_store
SET v = ${sqlLiteral(JSON.stringify(nextStoredValue))}::jsonb,
    updated_at = now()
WHERE client_id = ${sqlLiteral(dbRow.client_id)}::uuid
  AND k = ${sqlLiteral(dbRow.k)};
COMMIT;
`;
    runSql(sql);
    updatedRows += 1;
  }
  return { updatedRows, updatedProducts };
}

if (APPLY) {
  const toApply = selectedCandidates();
  const shared = applyShared(toApply);
  const clientKv = applyClientKv(toApply);
  console.log(JSON.stringify({
    applied: true,
    include_review: INCLUDE_REVIEW,
    selected_candidates: toApply.length,
    shared,
    clientKv
  }, null, 2));
  process.exit(0);
}

console.log(JSON.stringify({
  summary,
  duplicate_summary: {
    legacy_heys_products_groups: legacy_duplicate_groups.length,
    legacy_heys_products_coffee_groups: legacy_duplicate_groups.filter((group) => group.coffee).length
  },
  candidates,
  legacy_duplicate_groups
}, null, 2));
