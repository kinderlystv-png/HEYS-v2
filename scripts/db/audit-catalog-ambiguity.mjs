#!/usr/bin/env node
/**
 * Аудит дублей и неоднозначности каталога — как видит heys-mcp resolveProduct.
 * Читает shared_products + все overlay из client_kv_store.
 *
 * Usage:
 *   node scripts/db/audit-catalog-ambiguity.mjs
 *   node scripts/db/audit-catalog-ambiguity.mjs --local overlay.json shared.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const products = require('../../yandex-cloud-functions/heys-mcp/lib/products.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m || process.env[m[1]] != null) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

loadEnvFile(path.join(ROOT, '.env.local'));
loadEnvFile(path.join(ROOT, '.env'));

function normName(name) {
  return products.normalizeText(name);
}

function wouldBeAmbiguous(catalog, query) {
  const matches = products.searchProducts(catalog, query, 5);
  if (!matches.length) return { kind: 'not_found', matches };
  const prepared = products.prepareQuery(query);
  const best = products.scoreProduct(matches[0], prepared);
  const second = matches[1] ? products.scoreProduct(matches[1], prepared) : 0;
  const soleOwnMatch = matches.length === 1 && matches[0]._source === 'own' && best > 0;
  const wanted = normName(query);
  const exactOwn = matches.filter((m) => m._source === 'own' && normName(m.name) === wanted);
  const soleExactOwn = exactOwn.length === 1;
  const confident = soleOwnMatch || soleExactOwn
    || (best >= 400 && (second === 0 || best >= second * 1.25));
  if (confident) return { kind: 'ok', matches, best, second };
  return { kind: 'ambiguous', matches, best, second };
}

function buildCatalogFromRows(overlayRows, sharedRows) {
  const sharedById = new Map();
  for (const row of sharedRows) sharedById.set(String(row.id), row);
  return products.buildCatalog(overlayRows, sharedById);
}

function findExactNameDupes(rows, label) {
  const byNorm = new Map();
  for (const row of rows) {
    if (!row?.name) continue;
    const n = normName(row.name);
    if (!n) continue;
    if (!byNorm.has(n)) byNorm.set(n, []);
    byNorm.get(n).push(row);
  }
  const dupes = [];
  for (const [n, list] of byNorm) {
    if (list.length < 2) continue;
    dupes.push({
      label,
      norm: n,
      count: list.length,
      items: list.map((r) => ({
        id: r.id,
        name: r.name,
        source: r._source || (r._custom ? 'own' : 'shared'),
        kcal100: r.kcal100,
      })),
    });
  }
  dupes.sort((a, b) => b.count - a.count || a.norm.localeCompare(b.norm, 'ru'));
  return dupes;
}

function probeQueries(catalogObj, queries) {
  const out = [];
  for (const query of queries) {
    const res = wouldBeAmbiguous(catalogObj, query);
    if (res.kind === 'ambiguous' || res.kind === 'not_found') {
      out.push({
        query,
        kind: res.kind,
        best: res.best,
        second: res.second,
        candidates: (res.matches || []).slice(0, 5).map((m) => ({
          id: m.id,
          name: m.name,
          source: m._source,
          kcal100: m.kcal100,
        })),
      });
    }
  }
  return out;
}

function auditCatalog(clientId, overlayRows, sharedRows) {
  const catalogObj = buildCatalogFromRows(overlayRows, sharedRows);
  const { own, shared, all: catalog } = catalogObj;
  const exactDupesOwn = findExactNameDupes(own, 'own-exact');
  const exactDupesShared = findExactNameDupes(sharedRows.map((r) => ({ ...r, _source: 'shared' })), 'shared-exact');
  const exactDupesCatalog = findExactNameDupes(catalog, 'catalog-exact');

  const probes = probeQueries(catalogObj, [
    'котлета домашняя',
    'котлеты домашние',
    'масло подсолнечное',
    'подсолнечное масло',
    'тефтели рисовые',
    'тефтели',
    'творог 5',
    'яйцо',
    'яйцо вареное',
    'яйцо отварное',
    'кулич',
    'протеиновый молочный коктейль',
    'сельдь',
    'тунец',
  ]);

  return {
    clientId,
    counts: { own: own.length, shared: shared.length, total: catalog.length },
    exactDupesOwn,
    exactDupesShared,
    exactDupesCatalog,
    probes,
  };
}

function summarize(report) {
  const lines = [];
  lines.push(`=== ${report.clientId || 'GLOBAL'} ===`);
  if (report.counts) {
    lines.push(`каталог: own ${report.counts.own}, shared ${report.counts.shared}, всего ${report.counts.total}`);
  }
  const dupeGroups = [
    ...(report.exactDupesOwn || []),
    ...(report.exactDupesCatalog || []).filter((d) => d.label === 'catalog-exact' && d.count > 1),
  ];
  const seen = new Set();
  const uniqueDupes = [];
  for (const d of dupeGroups) {
    const key = `${d.norm}:${d.items.map((i) => i.id).sort().join(',')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueDupes.push(d);
  }
  if (uniqueDupes.length) {
    lines.push('точные дубли имён (own / merged):');
    for (const d of uniqueDupes.slice(0, 40)) {
      lines.push(`  · «${d.norm}» ×${d.count}`);
      for (const it of d.items) lines.push(`      ${it.id} | ${it.name} | ${it.kcal100} ккал`);
    }
    if (uniqueDupes.length > 40) lines.push(`  … ещё ${uniqueDupes.length - 40} групп`);
  } else {
    lines.push('точных дублей имён в own не найдено');
  }
  if (report.probes?.length) {
    lines.push('пробы resolveProduct:');
    for (const p of report.probes) {
      lines.push(`  · «${p.query}» → ${p.kind}${p.best != null ? ` (best ${p.best}, 2nd ${p.second})` : ''}`);
      for (const c of p.candidates || []) lines.push(`      ${c.source} ${c.id} «${c.name}»`);
    }
  }
  return lines.join('\n');
}

async function fromDb() {
  const { Pool } = await import('pg');
  const password = process.env.PG_PASSWORD;
  if (!password) throw new Error('PG_PASSWORD не задан — положи в .env.local или окружение');
  const sslCa = process.env.PG_SSL_CA_PATH
    || path.join(process.env.USERPROFILE || '', '.postgresql', 'root.crt');
  const ssl = fs.existsSync(sslCa)
    ? { rejectUnauthorized: true, ca: fs.readFileSync(sslCa) }
    : { rejectUnauthorized: false };
  const pool = new Pool({
    host: process.env.PG_HOST || 'rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net',
    port: Number(process.env.PG_PORT) || 6432,
    database: process.env.PG_DATABASE || 'heys_production',
    user: process.env.PG_USER || 'heys_admin',
    password,
    ssl,
  });

  const sharedRes = await pool.query('SELECT * FROM shared_products ORDER BY name');
  const sharedRows = sharedRes.rows.map(products.normalizeSharedRow).filter(Boolean);

  const overlays = await pool.query(`
    SELECT client_id::text AS client_id, v
    FROM client_kv_store
    WHERE k = 'heys_products_overlay_v2'
      AND jsonb_typeof(v) = 'array'
      AND jsonb_array_length(v) > 0
    ORDER BY jsonb_array_length(v) DESC
  `);

  const clients = await pool.query(`
    SELECT id::text, COALESCE(NULLIF(trim(name), ''), email, id::text) AS label
    FROM clients
  `);
  const clientNames = new Map(clients.rows.map((r) => [r.id, r.label]));

  const globalReport = {
    clientId: 'GLOBAL shared_products',
    exactDupesShared: findExactNameDupes(sharedRows.map((r) => ({ ...r, _source: 'shared' })), 'shared-exact'),
    counts: { shared: sharedRows.length, total: sharedRows.length },
    probes: probeQueries(buildCatalogFromRows([], sharedRows), [
      'масло подсолнечное', 'подсолнечное масло', 'котлета домашняя', 'тефтели рисовые',
    ]),
  };

  const perClient = [];
  for (const row of overlays.rows) {
    const overlay = row.v;
    const report = auditCatalog(row.client_id, overlay, sharedRows);
    report.clientLabel = clientNames.get(row.client_id) || row.client_id.slice(0, 8);
    const hasIssue = report.exactDupesOwn.length || report.probes.length;
    if (hasIssue) perClient.push(report);
  }

  await pool.end();
  return { globalReport, perClient, totalClients: overlays.rows.length };
}

function fromLocal(overlayPath, sharedPath) {
  const overlay = JSON.parse(fs.readFileSync(overlayPath, 'utf8'));
  const shared = JSON.parse(fs.readFileSync(sharedPath, 'utf8'));
  const sharedRows = (Array.isArray(shared) ? shared : shared.products || shared.rows || [])
    .map(products.normalizeSharedRow).filter(Boolean);
  return auditCatalog(path.basename(overlayPath), overlay, sharedRows);
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--local') {
    const report = fromLocal(args[1], args[2]);
    console.log(summarize(report));
    return;
  }

  try {
    const { globalReport, perClient, totalClients } = await fromDb();
    console.log(summarize(globalReport));
    console.log(`\nКлиентов с overlay: ${totalClients}, с проблемами: ${perClient.length}\n`);
    for (const r of perClient) {
      console.log(summarize({ ...r, clientId: `${r.clientLabel} (${r.clientId.slice(0, 8)})` }));
      console.log('');
    }
  } catch (e) {
    console.error('DB:', e.message);
    console.error('Локальный прогон: node scripts/db/audit-catalog-ambiguity.mjs --local <overlay.json> <shared.json>');
    process.exitCode = 1;
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
