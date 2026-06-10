#!/usr/bin/env node
// Pre-commit: авто-пересборка маркетинг-дашборда (план 22 п.5.1).
//
// Если в staged есть источники дашборда (00_Сводная_панель.xlsx, 22_План,
// 25_Roadmap или сам генератор) — перегенерировать маркетинг/00_Дашборд.html
// и застейджить его. Иначе дашборд молча устаревает и начинает врать.
//
// Деградация: нет python3/openpyxl → warning, коммит НЕ блокируем
// (report-only, как legacy-sync в agent-режиме).

import { execFileSync, execSync } from 'node:child_process';

const SOURCES = [
  'маркетинг/00_Сводная_панель.xlsx',
  'маркетинг/22_План_реализации_маркетинга.md',
  'маркетинг/25_Roadmap_Ф0_Ф1.md',
  'маркетинг/tools/build_dashboard.py',
];
const OUTPUT = 'маркетинг/00_Дашборд.html';
const TAG = '[dashboard-sync]';

let staged;
try {
  // -c core.quotepath=false — иначе кириллические пути приходят octal-escaped
  staged = execSync('git -c core.quotepath=false diff --cached --name-only', { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
} catch {
  process.exit(0);
}

const touched = staged.filter((f) => SOURCES.includes(f));
if (touched.length === 0) process.exit(0);

console.log(`${TAG} Источники дашборда в коммите (${touched.join(', ')}) — пересобираю ${OUTPUT}…`);

try {
  execFileSync('python3', ['маркетинг/tools/build_dashboard.py'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
} catch (e) {
  const msg = String(e.stderr || e.message || '');
  if (/No module named|not found|ENOENT/i.test(msg)) {
    console.warn(`${TAG} ⚠ python3/openpyxl недоступны — пересборка пропущена (коммит не блокирую).`);
    console.warn(`${TAG}   Пересобери вручную: python3 маркетинг/tools/build_dashboard.py`);
    process.exit(0);
  }
  console.error(`${TAG} ❌ Генератор упал:\n${msg}`);
  console.error(`${TAG}   Дашборд рассинхронизирован с источниками — почини генератор или коммить без источников.`);
  process.exit(1);
}

try {
  const diff = execSync(
    `git -c core.quotepath=false status --porcelain -- "${OUTPUT}"`,
    { encoding: 'utf8' },
  ).trim();
  if (diff) {
    execSync(`git add "${OUTPUT}"`);
    console.log(`${TAG} ✅ ${OUTPUT} пересобран и застейджен.`);
  } else {
    console.log(`${TAG} ✅ ${OUTPUT} уже актуален.`);
  }
} catch {
  console.warn(`${TAG} ⚠ Не удалось застейджить ${OUTPUT} — добавь вручную.`);
}
