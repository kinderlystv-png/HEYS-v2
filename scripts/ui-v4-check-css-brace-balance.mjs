#!/usr/bin/env node
// ui-v4-check-css-brace-balance.mjs — гейт баланса фигурных скобок в CSS-модулях.
//
// Лишняя или пропущенная `}` ломает каскад ниже по файлу молча: postcss и
// role-тесты могут падать десятками, а причина неочевидна. Проверка простая:
// после удаления блочных комментариев число `{` должно равняться числу `}`.
//
// Использование:
//   node scripts/ui-v4-check-css-brace-balance.mjs
//   pnpm ui:v4:check:css-braces
//   pnpm ui:v4:check

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODULES_DIR = path.join(ROOT, 'apps/web/styles/modules');

function stripBlockComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '');
}

function countBraces(source) {
  let open = 0;
  let close = 0;
  for (const ch of source) {
    if (ch === '{') open += 1;
    if (ch === '}') close += 1;
  }
  return { open, close };
}

function collectCssFiles(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.css'))
    .map((entry) => path.join(dir, entry.name))
    .sort((a, b) => a.localeCompare(b));
}

export function checkCssBraceBalance(files = collectCssFiles(MODULES_DIR)) {
  const failures = [];

  for (const filePath of files) {
    const source = fs.readFileSync(filePath, 'utf8');
    const { open, close } = countBraces(stripBlockComments(source));
    if (open !== close) {
      failures.push({
        file: path.relative(ROOT, filePath).replace(/\\/g, '/'),
        open,
        close,
        delta: open - close,
      });
    }
  }

  return failures;
}

function runCli() {
  const failures = checkCssBraceBalance();
  const fileCount = collectCssFiles(MODULES_DIR).length;

  if (failures.length) {
    console.error('\n❌ Несбалансированные фигурные скобки в CSS-модулях:');
    for (const item of failures) {
      const sign = item.delta > 0 ? `не хватает ${item.delta} }` : `лишних ${-item.delta} }`;
      console.error(`  ${item.file}: open=${item.open}, close=${item.close} (${sign})`);
    }
    console.error('\nПроверка: strip block comments, count { vs }.');
    process.exit(1);
  }

  console.log(`CSS brace balance OK: ${fileCount} files in apps/web/styles/modules/*.css`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli();
}
