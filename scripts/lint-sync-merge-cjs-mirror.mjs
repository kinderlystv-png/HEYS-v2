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
const CJS_PATH = resolve(
  repoRoot,
  'yandex-cloud-functions/heys-api-rpc/lib/heys_sync_merge_v1.cjs',
);

if (!existsSync(ESM_PATH) || !existsSync(CJS_PATH)) {
  // Не падаем если файлы отсутствуют (например, на check-out где их вынесли).
  process.exit(0);
}

const esm = readFileSync(ESM_PATH, 'utf8');
const cjs = readFileSync(CJS_PATH, 'utf8');

if (esm === cjs) {
  process.exit(0);
}

console.error('[lint-sync-merge-cjs-mirror] ❌ CJS copy is out of sync with ESM source.');
console.error('');
console.error(`  ESM: apps/web/heys_sync_merge_v1.js`);
console.error(`  CJS: yandex-cloud-functions/heys-api-rpc/lib/heys_sync_merge_v1.cjs`);
console.error('');
console.error('Fix:');
console.error('  cp apps/web/heys_sync_merge_v1.js \\');
console.error('     yandex-cloud-functions/heys-api-rpc/lib/heys_sync_merge_v1.cjs');
console.error('  git add yandex-cloud-functions/heys-api-rpc/lib/heys_sync_merge_v1.cjs');
console.error('');
console.error('Why: merge logic runs on both browser AND Yandex Cloud Function (server-side');
console.error('merge of dayv2/profile/norms). The .cjs copy is what the function uses at runtime.');
console.error('Drift between ESM and CJS = silent merge divergence between client and server.');

process.exit(1);
