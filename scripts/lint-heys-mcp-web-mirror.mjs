#!/usr/bin/env node
// lint-heys-mcp-web-mirror.mjs
//
// Гарантирует что расчётные модули в
// yandex-cloud-functions/heys-mcp/lib/web-mirror/ ≡ одноимённым файлам в
// apps/web/.
//
// Зачем: MCP-коннектор отдаёт куратору норму дня (калории + БЖУ в граммах) —
// то же число, которое клиент видит в приложении. Считает его не своя копия
// формулы, а побайтовое зеркало apps/web. Расхождение зеркала с оригиналом =
// куратор молча сравнивает съеденное с нормой по устаревшей формуле.
//
// Тот же приём, что у scripts/lint-sync-merge-cjs-mirror.mjs.
//
// Hook: pre-commit. При расхождении exit 1 + инструкция как поправить.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const SOURCE_DIR = 'apps/web';
const MIRROR_DIR = 'yandex-cloud-functions/heys-mcp/lib/web-mirror';
// Держать в точности как MIRRORED_FILES в
// yandex-cloud-functions/heys-mcp/lib/web-mirror/index.js — 2026-08-08 список
// здесь три коммита подряд не обновлялся вместе с тем, и NDTE/рефид/долг
// побайтово не проверялись вовсе.
const MIRRORED_FILES = [
  'heys_cycle_v1.js',
  'heys_iw_shim.js',
  'heys_iw_constants.js',
  'heys_iw_utils.js',
  'heys_tdee_v1.js',
  'heys_day_calculations.js',
  'heys_refeed_v1.js',
  'heys_day_caloric_debt_core_v1.js',
  'heys_day_norm_v1.js',
  '_kernel/heys_kernel_strength_v1.js',
  '_kernel/heys_kernel_load_v1.js',
];
const CHECK_STAGED = process.argv.includes('--staged');

function readCommittedCandidate(relativePath) {
  const isStaged = execFileSync('git', ['diff', '--cached', '--name-only', '--', relativePath], {
    cwd: repoRoot,
    encoding: 'utf8',
  }).trim();
  const source = isStaged ? `:${relativePath}` : `HEAD:${relativePath}`;
  return execFileSync('git', ['show', source], { cwd: repoRoot, encoding: 'utf8' });
}

function read(relativePath) {
  return CHECK_STAGED ? readCommittedCandidate(relativePath) : readFileSync(resolve(repoRoot, relativePath), 'utf8');
}

const stale = [];
for (const file of MIRRORED_FILES) {
  const sourcePath = `${SOURCE_DIR}/${file}`;
  const mirrorPath = `${MIRROR_DIR}/${file}`;
  // Не падаем если файлов нет (например, на check-out где их вынесли).
  if (!existsSync(resolve(repoRoot, sourcePath)) || !existsSync(resolve(repoRoot, mirrorPath))) continue;
  if (read(sourcePath) !== read(mirrorPath)) stale.push({ sourcePath, mirrorPath });
}

if (stale.length === 0) process.exit(0);

console.error('[lint-heys-mcp-web-mirror] ❌ Зеркало heys-mcp разошлось с apps/web.');
console.error('');
for (const { sourcePath, mirrorPath } of stale) {
  console.error(`  source: ${sourcePath}`);
  console.error(`  mirror: ${mirrorPath}`);
}
console.error('');
console.error('Fix:');
for (const { sourcePath, mirrorPath } of stale) {
  console.error(`  cp ${sourcePath} ${mirrorPath}`);
}
console.error(`  git add ${stale.map((s) => s.mirrorPath).join(' ')}`);
console.error('');
console.error('Why: по этим файлам MCP-коннектор считает норму дня, которую');
console.error('куратор видит рядом с внесённой едой. Своя копия формулы разошлась');
console.error('бы с приложением молча — поэтому копия только побайтовая.');

process.exit(1);
