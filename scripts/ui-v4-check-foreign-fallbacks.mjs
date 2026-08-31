#!/usr/bin/env node
// ui-v4-check-foreign-fallbacks.mjs — гейт запасных значений, оставшихся от
// чужого набора.
//
// Что ловится. Запись `var(--v4-роль, #литерал)` безопасна, только когда
// литерал — одно из значений этой роли в наборах v4. Если роль определена, а
// запасное взято из донабора (`--v4-act` с синим #2563eb, `--v4-ink` с
// #111827, `--v4-hero` с #f8fafc, `--v4-line` с #e5e7eb), продукт красится
// верно ровно до тех пор, пока палитра загружена и роль объявлена в текущем
// наборе. Как только одно из двух не так — экран показывает цвет чужой
// системы.
//
// Почему этого не видно. Глазами — никак: цвет верный, потому что роль
// побеждает запасное. Двумя соседними гейтами — тоже: роль определена, и
// запасное на месте, придраться не к чему. Найдено 31 августа в дневнике
// приёмов, где строка приёма несла синий #2563eb, зелёные #f0fdf4 и #16a34a и
// серо-голубой #f8fafc — на песочном наборе всё это невидимо.
//
// Как работает. Тем же храповиком, что «неопределённые роли» и «голые var()»:
// нынешний долг заморожен числами по файлам, падение — только на росте и на
// новых файлах. Долг, ставший меньше записанного, тоже падение: список обязан
// уменьшаться, а не превращаться в вечную свалку. Разгребать правильно зона за
// зоной — владелец зоны знает, какая роль в ней верная.
//
// Использование:
//   node scripts/ui-v4-check-foreign-fallbacks.mjs                    # проверить
//   node scripts/ui-v4-check-foreign-fallbacks.mjs --list             # текущее состояние
//   node scripts/ui-v4-check-foreign-fallbacks.mjs --update-baseline  # после закрытия долга
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODULES = path.join(ROOT, 'apps/web/styles/modules');
const PALETTE = path.join(MODULES, '002-ui-v4-palette-roles.css');

// Долг на 31 августа 2026. Список может только уменьшаться.
const BASELINE = {
  '000-base-and-gamification.css': 291,
  '001-design-tokens.css': 22,
  '100-metrics-and-graphs.css': 128,
  '1000-messenger.css': 147,
  '200-dark-and-effects.css': 122,
  '300-modals-and-day.css': 87,
  '310-client-switch-overlay.css': 5,
  '400-water-and-hydration.css': 18,
  '500-pwa-and-offline.css': 80,
  '600-steps-and-aps.css': 63,
  '610-aps-meal-flow.css': 48,
  '611-aps-product-card.css': 12,
  '612-training-step.css': 12,
  '613-cycle-ui.css': 8,
  '710-refeed.css': 25,
  '715-yesterday-verify.css': 37,
  '720-predictive-insights.css': 219,
  '725-metabolic-intelligence.css': 189,
  '730-widgets-dashboard.css': 213,
  '731-ui-v4-activity.css': 7,
  '732-ui-v4-nutrition.css': 83,
  '733-ui-v4-login-theme.css': 4,
  '733-ui-v4-reports.css': 29,
  '734-ui-v4-curator-panel.css': 14,
  '734-ui-v4-insights.css': 43,
  '740-cascade-card.css': 16,
  '750-strength-builder.css': 17,
  '800-meal-optimizer.css': 40,
  '900-planning.css': 144,
  '905-planning-chrono.css': 45,
  '906-planning-goal-map.css': 4,
  '907-planning-reading.css': 6,
  '908-planning-games.css': 5,
  '909-planning-game-word-builder.css': 3,
  '910-planning-game-robot-route.css': 3,
  '911-planning-game-color-trail.css': 2,
  '912-planning-game-assemble-day.css': 13,
  'drums-finger-trainer.css': 120,
  'fingers.css': 103,
};

function readPalette() {
  const src = fs.readFileSync(PALETTE, 'utf8');
  const values = new Map();
  for (const m of src.matchAll(/^\s+(--v4-[a-z0-9-]+):\s*([^;]+);/gm)) {
    if (!values.has(m[1])) values.set(m[1], new Set());
    values.get(m[1]).add(m[2].trim().toLowerCase());
  }
  return values;
}

function scan(values) {
  const perFile = new Map();
  for (const name of fs.readdirSync(MODULES)) {
    if (!name.endsWith('.css') || name.startsWith('002-')) continue;
    const src = fs.readFileSync(path.join(MODULES, name), 'utf8');
    for (const m of src.matchAll(/var\((--v4-[a-z0-9-]+),\s*(#[0-9a-fA-F]{3,8})\s*\)/g)) {
      const known = values.get(m[1]);
      // Роль не определена вовсе — это долг соседнего гейта, не этого.
      if (!known) continue;
      if (known.has(m[2].toLowerCase())) continue;
      perFile.set(name, (perFile.get(name) || 0) + 1);
    }
  }
  return perFile;
}

function formatBaseline(perFile) {
  const lines = [...perFile].sort((a, b) => a[0].localeCompare(b[0]))
    .map(([file, count]) => `  '${file}': ${count},`);
  return `const BASELINE = {\n${lines.join('\n')}\n};`;
}

function updateBaseline(perFile) {
  const self = fileURLToPath(import.meta.url);
  const src = fs.readFileSync(self, 'utf8');
  const start = src.indexOf('const BASELINE = {');
  const end = src.indexOf('\n};', start);
  if (start < 0 || end < 0) throw new Error('не нашёл блок BASELINE');
  fs.writeFileSync(self, src.slice(0, start) + formatBaseline(perFile) + src.slice(end + '\n};'.length));
  console.log(`Список переписан: ${perFile.size} файлов.`);
}

const perFile = scan(readPalette());
const total = [...perFile.values()].reduce((a, b) => a + b, 0);

if (process.argv.includes('--update-baseline')) {
  updateBaseline(perFile);
  process.exit(0);
}

if (process.argv.includes('--list')) {
  console.log(`Запасных значений мимо набора: ${total} в ${perFile.size} файлах.`);
  for (const [file, count] of [...perFile].sort((a, b) => b[1] - a[1])) {
    const known = BASELINE[file];
    const mark = known === undefined ? ' (нет в списке)' : known === count ? '' : ` (в списке ${known})`;
    console.log(`  ${String(count).padStart(4)} ${file}${mark}`);
  }
  process.exit(0);
}

const grown = [];
const appeared = [];
const shrunk = [];
for (const [file, count] of perFile) {
  const known = BASELINE[file];
  if (known === undefined) appeared.push(`${file}: ${count}`);
  else if (count > known) grown.push(`${file}: было ${known}, стало ${count}`);
  else if (count < known) shrunk.push(`${file}: было ${known}, стало ${count}`);
}
for (const file of Object.keys(BASELINE)) {
  if (!perFile.has(file)) shrunk.push(`${file}: долг закрыт целиком`);
}

if (appeared.length || grown.length) {
  console.error('❌ Запасные значения из чужого набора: долг вырос.');
  console.error('   Роль верна, а запасное взято из донабора — на наборе без этой роли');
  console.error('   или без загруженной палитры экран покрасится чужой системой.');
  for (const line of appeared) console.error(`  новый файл — ${line}`);
  for (const line of grown) console.error(`  ${line}`);
  process.exit(1);
}

if (shrunk.length) {
  console.error('❌ Долг уменьшился, но остался в списке — обновите его:');
  for (const line of shrunk) console.error(`  ${line}`);
  console.error('  node scripts/ui-v4-check-foreign-fallbacks.mjs --update-baseline');
  process.exit(1);
}

const worst = [...perFile].sort((a, b) => b[1] - a[1]).slice(0, 5)
  .map(([f, n]) => `${f.replace(/\.css$/, '')} ${n}`).join(' · ');
console.log(`Запасных значений мимо набора: ${total} в ${perFile.size} файлах — ${worst} …`);
