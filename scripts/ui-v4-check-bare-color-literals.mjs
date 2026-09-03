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
// ДВА ПРЕДЕЛА, которые эта проверка не переходит. Оба печатаются в вывод:
// комментарии читают авторы, вывод читают все.
//
// 1. Она отвечает «цвет задан ролью», но НЕ «цвет верный». Взять не ту роль
//    она не помешает: `--v4-sand-surface` вместо `--v4-surface` пройдёт
//    молча, и оба синих набора останутся песочными. Замер вычисленных
//    значений на двух наборах — единственный способ это увидеть, он требует
//    браузера и живёт в apps/web/scripts/ui-v4-visual-capture.mjs.
//
// 2. Она видит только файлы, названные в вердиктах, и только своим правилом
//    счёта. Модуль сведённой зоны, на который ни один вердикт не сослался по
//    имени, в счёт не входит вовсе — и его ноль означает «не смотрели», а не
//    «чисто». 31 августа так выпали модули актива и кабинета: у актива пять
//    настоящих литералов никем не считались. Поэтому необойдённое печатается
//    числом рядом с обойдённым, а не молчит.
//
//    Комментарии вырезаются ДО счёта, и это не мелочь гигиены. Именно в
//    комментариях объясняют, почему литерал заменён ролью («--v4-hero, а не
//    --v4-sand-hero: вторая держит песочный #efe3cf и в синем»). Счётчик,
//    который их читает, засчитывает в долг запись об уже закрытом долге.
//    31 августа разовая мерка `sed 's|/*.*|*/||g'` срезала только
//    однострочные комментарии, и два образцово чистых файла — отчёты и
//    кабинет — были доложены как 24 и 15 литералов. Верное число там ноль.
//
// Правило счёта узкое намеренно: строка `<свойство>: #hex;` из шести
// перечисленных свойств, с начала строки, вне комментариев. Голый hex внутри
// `var(--роль, #hex)` — запасное значение, а не голый литерал; им занимается
// ui-v4-check-foreign-fallbacks. Описи расхождений считают шире — это не
// противоречие: у описи рабочий список, у гейта храповик.
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

// Файл канваса — источник ролей, а не код продукта: вердикты ссылаются на
// него по имени, но проверять в нём нечего.
const NOT_PRODUCT = new Set(['v4-canvas.css']);

// Имена в вердиктах пишут руками, и короткая форма встречается наравне с полной.
const ALIAS = { '733-login-theme.css': '733-ui-v4-login-theme.css' };

// Долг на 31 августа 2026. Список может только уменьшаться.
const BASELINE = {
  '000-base-and-gamification.css': 347,
  '100-metrics-and-graphs.css': 197,
  '300-modals-and-day.css': 163,
  '400-water-and-hydration.css': 0,
  '500-pwa-and-offline.css': 115,
  '600-steps-and-aps.css': 66,
  '610-aps-meal-flow.css': 73,
  '611-aps-product-card.css': 19,
  '715-yesterday-verify.css': 37,
  '720-predictive-insights.css': 209,
  // 160 -> 159: заморозка отставала на единицу ещё до правок 2 сентября —
  // тот же счёт даёт и версия файла из коммита. Реальный долг не менялся.
  '730-widgets-dashboard.css': 111,
  '733-ui-v4-login-theme.css': 47,
  '740-cascade-card.css': 23,
  '750-strength-builder.css': 6,
  'critical.css': 26,
  'heys-boot-mark.css': 1,
  'heys-components.css': 414,
};

/** Файлы, на которые ссылаются вердикты, — то есть сведённые. */
function sweptFiles() {
  const names = new Set();
  const unresolved = new Set();
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
        const raw = match[1];
        // Проза вердикта сокращает длинные имена многоточием: `400-...css`.
        // Это не файл; пропустить его молча нельзя — счёт решит, что смотрел.
        if (raw.includes('..')) continue;
        if (NOT_PRODUCT.has(raw)) continue;
        const name = ALIAS[raw] || raw;
        if (findFile(name)) names.add(name);
        else unresolved.add(`${entry.replace(/\.json$/, '')} → ${raw}`);
      }
    }
  }
  return { names, unresolved: [...unresolved].sort() };
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

const { names: swept, unresolved } = sweptFiles();

// Список наблюдения может только расти. Он собирается из имён файлов, которые
// вердикты называют в тексте обоснования, — и это делает его хрупким: стоит
// переписать вердикты, не упомянув файл, и он молча выпадает из-под охраны, а
// гейт показывает по нему ноль, будто долг закрыт. Так 2 сентября случилось с
// 740-cascade-card.css: до слияния его называли 27 вердиктов зоны
// reports-insights, коммит «align cascade card with v4 canvas» переписал их без
// имени файла, и гейт отрапортовал «было 23, стало 0» при живых 23 литералах.
// Совет «обновите заморозку» в такой ситуации снял бы охрану навсегда.
// Поэтому к обходу всегда добавляются файлы, уже стоящие в заморозке.
for (const name of Object.keys(BASELINE)) swept.add(name);

const perFile = new Map();
for (const name of [...swept].sort()) {
  const hits = countBare(findFile(name));
  if (hits) perFile.set(name, hits);
}

const total = [...perFile.values()].reduce((sum, n) => sum + n, 0);

// Модули, которых гейт не касался вовсе: их ноль означает «не смотрели».
const unseen = fs.readdirSync(path.join(STYLES, 'modules'))
  .filter((file) => file.endsWith('.css') && !swept.has(file));

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
  `  Охват: ${swept.size} файлов названы вердиктами; вне охвата ${unseen.length} модулей — `
  + 'у них ноль означает «не смотрели», а не «чисто».',
);
if (unresolved.length) {
  console.log(`  Имён из вердиктов нет на диске: ${unresolved.length} — ${unresolved.join(' · ')}`);
}
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
