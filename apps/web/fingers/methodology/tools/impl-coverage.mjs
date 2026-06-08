#!/usr/bin/env node
// impl-coverage.mjs — сверка покрытия: каждая единица METHODOLOGY.md имеет строку
// в IMPLEMENTATION_MAP.md, и нет осиротевших строк карты.
//
// Это НЕ синхронизация содержания (она небезопасна), а обнаружение пробелов:
// правишь методологию → чекер показывает, где карта отстала.
//
// Единицы методологии:
//   • подразделы  ### N.M           → id "N.M"
//   • блоки       ### Блок X         → id "block-X"
//   • валидаторы  | Sk | ... (ч.9.2) → id "Sk"
//   • part-level  части без ### и без блоков → id "part-N"
//
// Запуск:  node tools/impl-coverage.mjs   (exit≠0 если есть пробелы/орфаны)
// ПРАВИЛО ПРОЕКТА: запускать после правок методологии/карты (CLAUDE.md).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const METH = readFileSync(join(dir, '..', 'METHODOLOGY.md'), 'utf8');
const MAP = readFileSync(join(dir, '..', 'IMPLEMENTATION_MAP.md'), 'utf8');

// --- требуемые единицы из методологии ---
const required = new Set();

// подразделы N.M
for (const m of METH.matchAll(/^### (\d+\.\d+)\./gm)) required.add(m[1]);
// блоки
for (const m of METH.matchAll(/^### Блок ([A-Z])\./gm)) required.add('block-' + m[1]); // [A-Z]: sport-agnostic
// валидаторы S1..Sn (строки таблицы)
for (const m of METH.matchAll(/^\| (S\d+) /gm)) required.add(m[1]);

// part-level: части без ### N. и без блоков
const partNums = [...METH.matchAll(/^## Часть (\d+)\./gm)].map((m) => m[1]);
for (const n of partNums) {
  const hasSub = new RegExp(`^### ${n}\\.\\d`, 'm').test(METH);
  const hasBlocks = n === '4' && /^### Блок /m.test(METH);
  if (!hasSub && !hasBlocks) required.add('part-' + n);
}

// --- предоставленные ID из карты (первая ячейка таблицы в backticks) ---
const provided = new Set();
for (const m of MAP.matchAll(/^\|\s*`([^`]+)`\s*\|/gm)) {
  if (!m[1].startsWith('Q-')) provided.add(m[1]); // Q-* — это пул вопросов, не единицы
}

// --- сверка ---
const missing = [...required].filter((id) => !provided.has(id)).sort();
const orphan = [...provided].filter((id) => !required.has(id)).sort();

const sortPretty = (a) => a.sort((x, y) =>
  x.localeCompare(y, undefined, { numeric: true }));

console.log(`Единиц методологии: ${required.size} · строк карты: ${provided.size}`);
if (missing.length) {
  console.log(`\n❌ НЕТ в карте (${missing.length}):`);
  console.log('   ' + sortPretty(missing).join(', '));
}
if (orphan.length) {
  console.log(`\n⚠️  Осиротевшие строки карты — нет в методологии (${orphan.length}):`);
  console.log('   ' + sortPretty(orphan).join(', '));
}
if (!missing.length && !orphan.length) {
  console.log('\n✅ Полное покрытие: каждая единица методологии есть в карте, орфанов нет.');
}

// --- пул открытых вопросов: сверка карточка ↔ пул ---
const QID = /`(Q-[0-9A-Za-z.\-]+-\d+)`/g;       // реальный ID, не шаблон (Q-* / Q-<…>)
const poolQ = new Set();      // строки таблицы пула: | `Q-...` |
for (const m of MAP.matchAll(/^\|\s*`(Q-[0-9A-Za-z.\-]+-\d+)`\s*\|/gm)) poolQ.add(m[1]);
const cardQ = new Set();      // ссылки на Q-* в карточках (любые не-табличные строки)
for (const line of MAP.split('\n')) {
  if (/^\s*\|/.test(line)) continue;          // строки таблицы (пул) — это не ссылки
  for (const m of line.matchAll(QID)) cardQ.add(m[1]);
}

const qNotInPool = [...cardQ].filter((q) => !poolQ.has(q)).sort();
const qNotInCard = [...poolQ].filter((q) => !cardQ.has(q)).sort();

if (qNotInPool.length) {
  console.log(`\n❌ Вопрос в карточке, но НЕ в пуле (${qNotInPool.length}): ${qNotInPool.join(', ')}`);
}
if (qNotInCard.length) {
  console.log(`\n⚠️  Вопрос в пуле, но не сослан из карточки (${qNotInCard.length}): ${qNotInCard.join(', ')}`);
}
const qOpen = (MAP.match(/🔵 open\s*\|/g) || []).length;   // только ячейки таблицы
const qDone = (MAP.match(/✅ решено\s*\|/g) || []).length;
console.log(`\nПул вопросов: всего ${poolQ.size} · 🔵 open ${qOpen} · ✅ решено ${qDone}`);

// --- заполненность карты (информативно) ---
const filled = (MAP.match(/✅/g) || []).length;
const draft = (MAP.match(/🟫/g) || []).length;
const todo = (MAP.match(/⬜/g) || []).length;
console.log(`Заполненность карты: ✅ ${filled} · 🟫 ${draft} · ⬜ ${todo}`);

const fail = missing.length || orphan.length || qNotInPool.length;
process.exit(fail ? 1 : 0);
