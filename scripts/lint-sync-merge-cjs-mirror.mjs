#!/usr/bin/env node
// lint-sync-merge-cjs-mirror.mjs
//
// Гарантирует что heys_sync_merge_v1.cjs (cloud-function copy) ≡
// heys_sync_merge_v1.js (browser source).
//
// До этого hook'а CJS-копия синхронизовалась только в deploy-all.sh через
// `cp`, что давало временное расхождение между ESM-коммитом и деплоем cloud
// function. Серверный merge мог использовать старую логику пока deploy не
// прогонится, что вызывало непредсказуемые конфликты на cross-device sync.
//
// Hook: pre-commit. При расхождении exit 1 + инструкция как поправить.

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const ESM_PATH = resolve(repoRoot, 'apps/web/heys_sync_merge_v1.js');
const CJS_PATHS = [
  resolve(repoRoot, 'yandex-cloud-functions/heys-api-rpc/lib/heys_sync_merge_v1.cjs'),
  resolve(repoRoot, 'yandex-cloud-functions/heys-api-rest/lib/heys_sync_merge_v1.cjs'),
];

if (!existsSync(ESM_PATH) || CJS_PATHS.some((p) => !existsSync(p))) {
  // Не падаем если файлы отсутствуют (например, на check-out где их вынесли).
  process.exit(0);
}

const esm = readFileSync(ESM_PATH, 'utf8');
const stale = CJS_PATHS.filter((p) => readFileSync(p, 'utf8') !== esm);

if (stale.length === 0) {
  process.exit(0);
}

console.error('[lint-sync-merge-cjs-mirror] ❌ CJS copy is out of sync with ESM source.');
console.error('');
console.error(`  ESM: apps/web/heys_sync_merge_v1.js`);
for (const cjsPath of stale) {
  console.error(`  CJS: ${cjsPath.replace(repoRoot + '/', '')}`);
}
console.error('');
console.error('Fix:');
console.error('  cp apps/web/heys_sync_merge_v1.js yandex-cloud-functions/heys-api-rpc/lib/heys_sync_merge_v1.cjs');
console.error('  cp apps/web/heys_sync_merge_v1.js yandex-cloud-functions/heys-api-rest/lib/heys_sync_merge_v1.cjs');
console.error('  git add yandex-cloud-functions/heys-api-rpc/lib/heys_sync_merge_v1.cjs \\');
console.error('          yandex-cloud-functions/heys-api-rest/lib/heys_sync_merge_v1.cjs');
console.error('');
console.error('Why: merge logic runs on browser, RPC and REST Yandex Cloud Functions.');
console.error('The .cjs copies are what cloud functions use at runtime. Drift between');
console.error('ESM and CJS = silent merge divergence between client and server.');

process.exit(1);
