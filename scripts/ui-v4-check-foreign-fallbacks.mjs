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
// Верхний уровень стилей сканируется наравне с модулями: heys-components.css и
// соседи держат 511 записей `var(--v4-роль, #литерал)`, и до 31 августа гейт
// не смотрел на них вовсе. Файл `heys-components.css:1575` нёс
// `var(--v4-btn-on-act, #fff5ef)` — почти белое запасное при тёмной роли.
const STYLES = path.join(ROOT, 'apps/web/styles');
const PALETTE = path.join(MODULES, '002-ui-v4-palette-roles.css');

// Роли с именем набора внутри — второй долг того же рода. Держим одним числом:
// разметка владельца идёт по описи, а храповик следит только за тем, чтобы
// новых не прибавлялось.
const PALETTE_ROLE_BASELINE = 582;

// Долг на 31 августа 2026. Список может только уменьшаться.
const BASELINE = {
  '000-base-and-gamification.css': 291,
  '001-design-tokens.css': 22,
  '100-metrics-and-graphs.css': 127,
  '1000-messenger.css': 147,
  '200-dark-and-effects.css': 122,
  '300-modals-and-day.css': 87,
  '310-client-switch-overlay.css': 5,
  '400-water-and-hydration.css': 18,
  '500-pwa-and-offline.css': 80,
  '600-steps-and-aps.css': 40,
  '610-aps-meal-flow.css': 40,
  '611-aps-product-card.css': 23,
  '612-training-step.css': 12,
  '613-cycle-ui.css': 8,
  '710-refeed.css': 25,
  '715-yesterday-verify.css': 37,
  '720-predictive-insights.css': 219,
  '725-metabolic-intelligence.css': 189,
  '730-widgets-dashboard.css': 213,
  '731-ui-v4-activity.css': 7,
  '732-ui-v4-nutrition.css': 81,
  '733-ui-v4-login-theme.css': 4,
  '733-ui-v4-reports.css': 21,
  '734-ui-v4-curator-panel.css': 6,
  '734-ui-v4-insights.css': 35,
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
  'critical.css': 32,
  'drums-finger-trainer.css': 120,
  'fingers.css': 103,
  'heys-components.css': 541,
};

function readPalette() {
  const src = fs.readFileSync(PALETTE, 'utf8');
  const values = new Map();
  // Сколько раз роль объявлена: во всех наборах или только в части. Разница
  // решает, враньё перед нами или несущее запасное.
  const sets = new Map();
  for (const m of src.matchAll(/^\s+(--v4-[a-z0-9-]+):\s*([^;]+);/gm)) {
    if (!values.has(m[1])) values.set(m[1], new Set());
    values.get(m[1]).add(m[2].trim().toLowerCase());
    sets.set(m[1], (sets.get(m[1]) || 0) + 1);
  }
  return { values, sets };
}

// Второй долг того же рода: роль с именем набора внутри — `--v4-sand-*`,
// `--v4-blue-*`. Она объявлена во всех наборах и потому законна для гейта
// неопределённых ролей, но в синих держит песочное значение: модуль знает, что
// палитра песочная, а знать не должен. Решение владельца 31 августа: синий
// обязан быть синим целиком, тёплый цвет героя выражается ролью `--v4-hero-*`.
// Опись 582 нынешних мест — docs/ui/UI_V4_SAND_ROLES_INVENTORY.md, они ждут
// разметки владельца; храповик держит только то, чтобы новых не прибавлялось.

/** Все продуктовые файлы стилей: модули и верхний уровень. Палитра не входит. */
function cssFiles() {
  const out = [];
  for (const name of fs.readdirSync(MODULES)) {
    if (!name.endsWith('.css') || name.startsWith('002-')) continue;
    out.push({ name, full: path.join(MODULES, name) });
  }
  for (const name of fs.readdirSync(STYLES, { withFileTypes: true })) {
    if (!name.isFile() || !name.name.endsWith('.css')) continue;
    out.push({ name: name.name, full: path.join(STYLES, name.name) });
  }
  return out;
}

function scanPaletteRoles() {
  const perFile = new Map();
  for (const name of fs.readdirSync(MODULES)) {
    if (!name.endsWith('.css') || name.startsWith('002-')) continue;
    const src = fs.readFileSync(path.join(MODULES, name), 'utf8');
    const hits = [...src.matchAll(/var\(\s*--v4-(?:sand|blue)-[a-z0-9-]+/g)].length;
    if (hits) perFile.set(name, hits);
  }
  return perFile;
}

function scan(values, sets) {
  const perFile = new Map();
  // Запасное, которое несёт: роль объявлена не во всех наборах, и там, где её
  // нет, экран красит именно литерал. Трогать такие места нельзя — у
  // --v4-btn-on-act в обоих синих наборах роль закомментирована с пометкой
  // «ждёт дизайнера: белый на #2e7cc0 даёт 4.41:1 < 4.5».
  const load = new Map();
  for (const { name, full } of cssFiles()) {
    const src = fs.readFileSync(full, 'utf8');
    for (const m of src.matchAll(/var\((--v4-[a-z0-9-]+),\s*(#[0-9a-fA-F]{3,8})\s*\)/g)) {
      const known = values.get(m[1]);
      // Роль не определена вовсе — это долг соседнего гейта, не этого.
      if (!known) continue;
      if (known.has(m[2].toLowerCase())) continue;
      if ((sets.get(m[1]) || 0) < PALETTE_SETS) {
        load.set(m[1], (load.get(m[1]) || 0) + 1);
        continue;
      }
      perFile.set(name, (perFile.get(name) || 0) + 1);
    }
  }
  return { perFile, load };
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

const palette = readPalette();
// Во скольких наборах живёт палитра: роль, объявленная столько же раз, есть
// везде; объявленная реже — не во всех, и там запасное несёт цвет само.
const PALETTE_SETS = Math.max(...palette.sets.values());
const { perFile, load } = scan(palette.values, palette.sets);
const total = [...perFile.values()].reduce((a, b) => a + b, 0);
const palettePerFile = scanPaletteRoles();
const paletteTotal = [...palettePerFile.values()].reduce((a, b) => a + b, 0);

if (process.argv.includes('--update-baseline')) {
  updateBaseline(perFile);
  process.exit(0);
}

// Несущие запасные — отдельным списком, не долгом. Их нельзя «починить»:
// на наборе без роли literal и есть цвет. Список нужен, чтобы никто не принял
// их за враньё и не привёл к значению роли из соседнего набора.
if (load.size) {
  const shown = [...load].sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([role, n]) => `${role} ${n}`).join(' · ');
  console.log(
    `Несущих запасных: ${[...load.values()].reduce((a, b) => a + b, 0)} `
    + `у ${load.size} ролей, объявленных не во всех ${PALETTE_SETS} наборах — ${shown}`
    + (load.size > 5 ? ' …' : '')
    + '. Это не долг: там, где роли нет, цвет держит именно запасное.',
  );
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

// Храповик считает ОБЩЕЕ число, а разбивку по файлам печатает.
//
// Почему не по файлам: перенос семейства классов из файла в файл общее число не
// меняет, но по файлам выглядит как рост у нового владельца. Так и вышло
// 31 августа — `aps-v4-portions-*` переехали в 611, и гейт предъявил новому
// владельцу чужой давний долг. Человек в такой ситуации либо теряет час, либо
// делает --update-baseline, и долг узаконивается задним числом. Это худший из
// исходов, поэтому переезд между файлами гейт не считает ростом.
//
// Почему уменьшение не падение: гейт, который краснеет в ответ на починку,
// снимают. Уменьшение — громкая строка отчёта с просьбой обновить список.
// Цена в том, что список какое-то время завышен и под этим запасом может
// спрятаться небольшой рост; она меньше, чем цена снятого гейта.
const knownTotal = Object.values(BASELINE).reduce((a, b) => a + b, 0);
const moved = [];
for (const [file, count] of perFile) {
  const known = BASELINE[file] ?? 0;
  if (count !== known) moved.push(`${file}: было ${known}, стало ${count}`);
}
for (const file of Object.keys(BASELINE)) {
  if (!perFile.has(file)) moved.push(`${file}: долг закрыт целиком`);
}

if (total > knownTotal) {
  console.error(`❌ Запасные значения из чужого набора: долг вырос — было ${knownTotal}, стало ${total}.`);
  console.error('   Роль верна, а запасное взято из донабора — на наборе без этой роли');
  console.error('   или без загруженной палитры экран покрасится чужой системой.');
  for (const line of moved) console.error(`  ${line}`);
  process.exit(1);
}

// Уменьшение записывается сразу, а не просится в отчёте. Иначе храповик не
// затягивается: улучшил — гейт промолчал, заморозка осталась прежней, и завтра
// долг возвращается до старого числа бесплатно. Молчит оба раза, в сумме ноль.
//
// Плата за это — прогон гейта пишет файл. Локально это нормально: правку видно
// в git status и она уезжает тем же коммитом. В CI писать некому, поэтому там
// изменившаяся заморозка означает, что её забыли положить в коммит, — и это
// падение с понятной причиной, а не молчаливое расхождение.
if (total < knownTotal) {
  updateBaseline(perFile);
  console.log(`Долг уменьшился: было ${knownTotal}, стало ${total} — заморозка затянута.`);
  for (const line of moved) console.log(`  ${line}`);
  if (process.env.CI) {
    console.error('❌ В CI заморозка не должна меняться: добавьте обновлённый файл в коммит.');
    process.exit(1);
  }
}

if (paletteTotal > PALETTE_ROLE_BASELINE) {
  console.error(`❌ Роль с именем набора в модуле: было ${PALETTE_ROLE_BASELINE}, стало ${paletteTotal}.`);
  console.error('   Модуль не должен знать, что палитра песочная: в синих наборах такая роль');
  console.error('   держит песочное значение, и синий перестаёт быть синим.');
  console.error('   Тёплый цвет героя выражается ролью --v4-hero-*, а не именем набора.');
  for (const [file, count] of [...palettePerFile].sort((a, b) => b[1] - a[1]).slice(0, 5)) {
    console.error(`  ${file}: ${count}`);
  }
  process.exit(1);
}

const worst = [...perFile].sort((a, b) => b[1] - a[1]).slice(0, 5)
  .map(([f, n]) => `${f.replace(/\.css$/, '')} ${n}`).join(' · ');
console.log(`Запасных значений мимо набора: ${total} в ${perFile.size} файлах — ${worst} …`);
console.log(`Ролей с именем набора в модулях: ${paletteTotal} — ждут разметки владельца`
  + ' (docs/ui/UI_V4_SAND_ROLES_INVENTORY.md).');
