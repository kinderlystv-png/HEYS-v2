#!/usr/bin/env node
/**
 * Прогон резолвера продуктов MCP на ЖИВОМ каталоге клиента.
 *
 * Зачем отдельно от unit-тестов: 23.08.2026 фаза A каталога прошла 58/58 на
 * фикстурах и при этом не чинила продовый кейс — в тесте карточка называлась
 * «Котлеты домашние», а в базе «Котлеты домашние (говядина+свинина), жареные».
 * Пять токенов вместо двух роняют скор ниже порога 400, и отказ оставался.
 * Фикстура короче реальности — это класс ошибки, который ловится только
 * прогоном по настоящим строкам.
 *
 * Читает overlay клиента и общую базу через scripts/db/psql.sh (прод, только
 * чтение), собирает каталог тем же кодом, что коннектор, и прогоняет
 * searchProducts + pickSearchMatch по списку запросов.
 *
 * Запуск:
 *   node scripts/db/audit-resolve-live.mjs <client_id> "котлета домашняя" "масло подсолнечное"
 *   node scripts/db/audit-resolve-live.mjs <client_id> --file queries.txt
 *
 * Код выхода 1, если хотя бы один запрос получил отказ, — годится для CI.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const products = require(join(REPO_ROOT, 'yandex-cloud-functions/heys-mcp/lib/products.js'));

/** psql возвращает одну строку JSON: кириллица переживает только UTF-8 клиент. */
function queryJson(sql) {
  const dir = mkdtempSync(join(tmpdir(), 'heys-resolve-'));
  const file = join(dir, 'q.sql');
  writeFileSync(file, sql, 'utf8');
  const out = execFileSync('bash', [join(REPO_ROOT, 'scripts/db/psql.sh'), '-At', '-f', file], {
    encoding: 'utf8',
    env: { ...process.env, PGCLIENTENCODING: 'UTF8' },
    maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(out.trim() || 'null');
}

function loadCatalog(clientId) {
  const overlay = queryJson(`
    SELECT coalesce(json_agg(r)::text, '[]')
    FROM (
      SELECT jsonb_array_elements(v) AS r FROM client_kv_store
      WHERE client_id = '${clientId}' AND k = 'heys_products_overlay_v2'
    ) t;
  `);
  const shared = queryJson("SELECT coalesce(json_agg(to_jsonb(s))::text, '[]') FROM shared_products s;");
  const sharedById = new Map();
  for (const row of shared || []) {
    const normalized = products.normalizeSharedRow(row);
    if (normalized && normalized.id) sharedById.set(String(normalized.id), normalized);
  }
  return products.buildCatalog(overlay || [], sharedById);
}

const [clientId, ...rest] = process.argv.slice(2);
if (!clientId) {
  console.error('Нужен client_id. Пример: node scripts/db/audit-resolve-live.mjs <uuid> "котлета домашняя"');
  process.exit(2);
}
const queries = rest[0] === '--file'
  ? readFileSync(rest[1], 'utf8').split('\n').map((s) => s.trim()).filter(Boolean)
  : rest;
if (!queries.length) {
  console.error('Нужен хотя бы один запрос.');
  process.exit(2);
}

const catalog = loadCatalog(clientId);
console.log(`Каталог: ${catalog.all.length} позиций (личных + общая база)\n`);

let refused = 0;
for (const query of queries) {
  const matches = products.searchProducts(catalog, query, 5);
  const pick = products.pickSearchMatch(query, matches);
  const prepared = products.prepareQuery(query);
  const top = matches.slice(0, 3)
    .map((p) => `${p.name} [${p._source}] ${products.scoreProduct(p, prepared)}`)
    .join(' · ');
  if (pick.ok) {
    console.log(`✔ «${query}» → ${pick.product.name} [${pick.product._source}]`);
  } else {
    refused += 1;
    console.log(`✖ «${query}» → ${pick.code}`);
  }
  if (top) console.log(`    кандидаты: ${top}`);
}

console.log(`\nОтказов: ${refused} из ${queries.length}`);
process.exit(refused ? 1 : 0);
