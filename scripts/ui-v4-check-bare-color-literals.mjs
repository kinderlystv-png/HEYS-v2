#!/usr/bin/env node
// ui-v4-check-bare-color-literals.mjs — цвет в сведённой зоне должен идти
// ролью набора, а не голым литералом.
//
// Что ловится. Запись `background: #f7efe2;` — без `var()` вовсе. Роль тут не
// участвует, поэтому цвет одинаков во всех четырёх наборах: выбрал синий —
// получил песочную поверхность. 31 августа так жили девятнадцать поверхностей
// экрана входа, включая поле телефона, боксы кода и клавиши, — и дожили до
// закрытия зоны с 788 вердиктами, потому что вердикты сверяют числа, а цвет
// проверяют глазами на песочном наборе.
//
// Где ловится. Только в файлах, на которые ссылаются вердикты: это и есть
// «сведённые» файлы. В остальном проекте литералы законны, и предъявлять их
// значило бы утопить сигнал в 2765 срабатываниях.
//
// ─────────────────────────────────────────────────────────────────────────
// ПРЕДЕЛ, который эта проверка не переходит.
//
// Она отвечает «цвет задан ролью», но НЕ «цвет верный». Взять не ту роль она
// не помешает: `--v4-sand-surface` вместо `--v4-surface` пройдёт молча, и оба
// синих набора останутся песочными. Замер вычисленных значений на двух
// наборах — единственный способ это увидеть, он требует браузера и живёт в
// apps/web/scripts/ui-v4-visual-capture.mjs.
//
// То есть перед вами половина правила «сверять цвет на двух наборах», а не
// его механическая реализация. Предел напечатан в выводе, а не спрятан в
// комментарии: комментарии читают авторы, вывод читают все.
// ─────────────────────────────────────────────────────────────────────────
//
// Форма — храповик, как у соседних гейтов: нынешние числа заморожены по
// файлам, падение только на росте. Уменьшение — повод обновить список, а не
// повод краснеть.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERDICTS = path.join(ROOT, 'docs/ui/verdicts');
const STYLES = path.join(ROOT, 'apps/web/styles');

// Свойства, у которых голый литерал означает именно цвет мимо набора.
const COLOUR_PROPS = /^\s*(background|background-color|color|border-color|fill|stroke):\s*#[0-9a-fA-F]{3,8}\s*;/;

// Долг на 31 августа 2026. Список может только уменьшаться.
const BASELINE = {
  '000-base-and-gamification.css': 414,
  '100-metrics-and-graphs.css': 207,
  '300-modals-and-day.css': 163,
  '400-water-and-hydration.css': 87,
  '500-pwa-and-offline.css': 116,
  '715-yesterday-verify.css': 37,
  '720-predictive-insights.css': 210,
  '730-widgets-dashboard.css': 179,
  '733-ui-v4-login-theme.css': 104,
  '740-cascade-card.css': 23,
  'critical.css': 34,
  'heys-boot-mark.css': 1,
  'heys-components.css': 446,
};

/** Файлы, на которые ссылаются вердикты, — то есть сведённые. */
function sweptFiles() {
  const names = new Set();
  for (const entry of fs.readdirSync(VERDICTS)) {
    if (!entry.endsWith('.json')) continue;
    let data;
    try {
      data = JSON.parse(fs.readFileSync(path.join(VERDICTS, entry), 'utf8'));
    } catch {
      continue;
    }
    for (const row of Object.values(data.rows || {})) {
      for (const match of String(row && row.f).matchAll(/([0-9a-zA-Z_.-]+\.css)/g)) {
        names.add(match[1]);
      }
    }
  }
  return names;
}

function findFile(name) {
  for (const dir of [path.join(STYLES, 'modules'), STYLES]) {
    const full = path.join(dir, name);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

function countBare(full) {
  const src = fs.readFileSync(full, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  let hits = 0;
  for (const line of src.split('\n')) {
    if (COLOUR_PROPS.test(line)) hits += 1;
  }
  return hits;
}

const perFile = new Map();
for (const name of [...sweptFiles()].sort()) {
  const full = findFile(name);
  if (!full) continue;
  const hits = countBare(full);
  if (hits) perFile.set(name, hits);
}

const total = [...perFile.values()].reduce((sum, n) => sum + n, 0);

if (process.argv.includes('--update-baseline')) {
  const lines = [...perFile].sort((a, b) => a[0].localeCompare(b[0]))
    .map(([file, count]) => `  '${file}': ${count},`);
  const src = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8');
  const next = src.replace(/const BASELINE = \{[\s\S]*?\};/, `const BASELINE = {\n${lines.join('\n')}\n};`);
  fs.writeFileSync(fileURLToPath(import.meta.url), next);
  console.log(`Список переписан: ${perFile.size} файлов, ${total} мест.`);
  process.exit(0);
}

const grown = [];
for (const [file, count] of perFile) {
  const known = BASELINE[file] ?? 0;
  if (count > known) grown.push(`${file}: было ${known}, стало ${count}`);
}

const top = [...perFile].sort((a, b) => b[1] - a[1]).slice(0, 5)
  .map(([file, count]) => `${file.replace(/\.css$/, '')} ${count}`).join(' · ');

console.log(
  `Голых литералов цвета в сведённых файлах: ${total} в ${perFile.size} — ${top} …`,
);
console.log(
  '  Проверка отвечает «цвет задан ролью», но не «цвет верный»: не ту роль '
  + 'она не поймает. Замер на двух наборах — ui-v4-visual-capture.mjs.',
);

if (grown.length) {
  console.error('\n❌ Голые литералы цвета в сведённой зоне: стало больше.');
  console.error('   Цвет без var() одинаков во всех наборах — на синем экран останется песочным.');
  for (const line of grown) console.error(`  ${line}`);
  console.error('   Роль подбирается по docs/ui/UI_V4_SAND_ROLES_INVENTORY.md и файлу палитр.');
  process.exit(1);
}

const shrunk = [];
for (const [file, known] of Object.entries(BASELINE)) {
  const now = perFile.get(file) ?? 0;
  if (now < known) shrunk.push(`${file}: было ${known}, стало ${now}`);
}
if (shrunk.length) {
  console.log(`  Долг уменьшился в ${shrunk.length} файл(ах) — обновите список:`);
  for (const line of shrunk.slice(0, 5)) console.log(`    ${line}`);
  console.log('    node scripts/ui-v4-check-bare-color-literals.mjs --update-baseline');
}
process.exit(0);
