#!/usr/bin/env node
// ui-check-undeclared-vars.mjs — храповик на переменные, которые читаются и
// нигде не объявляются.
//
// Что ловится. `var(--имя, запасное)` выглядит безопасно, но если `--имя` не
// объявлено нигде, запасное срабатывает всегда: цвет, размер или отступ молча
// перестают следовать чему бы то ни было. Соседний гейт
// `ui-v4-check-undefined-roles.mjs` ловит ровно это, но только для имён на
// `--v4-`; всё дореформенное он по построению не видит. Так прожил `--card-bg`:
// не объявлен нигде, читается двумя десятками правил, и плитки во всех наборах
// белые.
//
// Почему это не всегда косметика. Переменная без объявления иногда означает не
// лишнюю строку, а оборванную связь между данными и вёрсткой. `--level-color`
// читают три правила плашки уровня в `heys-components.css`, ставить его должен
// был бы код геймификации — и не ставит, поэтому плашка всегда зелёная при
// заведённых цветах уровней.
//
// Что объявлением СЧИТАЕТСЯ. Строка CSS `--имя: …`, свойство в JS-объекте
// стиля (`{ '--имя': v }` — React кладёт такие в inline style), и
// `setProperty('--имя', …)` в рантайме. Последние два важны: без них гейт
// объявил бы долгом законные переменные, которые ставит код.
//
// Как работает. Храповиком, как гейт песочных ролей: нынешний долг заморожен
// списком имён, падение — только на новом имени. Список ключуется именем, а не
// файлом: правило переезжает между файлами постоянно, и гейт, который на это
// краснеет, снимут в первую неделю. Долг, ставший меньше, дозаписывается сразу
// — иначе храповик не затягивается.
//
// Использование:
//   node scripts/ui-check-undeclared-vars.mjs                    # проверить
//   node scripts/ui-check-undeclared-vars.mjs --list             # текущее состояние
//   node scripts/ui-check-undeclared-vars.mjs --why <имя>        # где читается
//   node scripts/ui-check-undeclared-vars.mjs --update-baseline  # после закрытия долга

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'apps/web');

// Те же исключения, что у гейта ролей: собранные бандлы и копии дают тысячи
// повторов одного и того же и ничего не добавляют.
// `__tests__` не сканируем: тест — не продукт, и его строки не должны считаться
// объявлением. Инцидент при отладке: `line-roles-v4.test.js:32` собирает имя как
// `--v4-${m[1]}`, и из-за этого гейт принял `--v4-` за живой рантайм-префикс и
// молча выключил проверку для всех ролей v4 разом.
const SKIP_DIRS = new Set([
  'public',
  'dist',
  'node_modules',
  '.next',
  '__screenshots__',
  '__tests__',
]);
const SKIP_FILE = /(bundle|\.min)\.[cm]?js$/i;

// Имена, которые ставит не наш код: браузерные и сторонние соглашения.
const FOREIGN = /^--(tw-|swiper-|rt-|leaflet-|mapbox-|vjs-)/;

// Роли v4 держит соседний гейт `ui-v4-check-undefined-roles.mjs` — со своей
// заморозкой по именам и файлам и со второй проверкой на голую var(). Граница
// проведена явно, чтобы долг не считался дважды и чтобы её нельзя было сдвинуть
// случайно: до этой строки `--v4-` выпадал из проверки сам собой, потому что имя
// такого вида собирается в одном из тестов.
const OWNED_ELSEWHERE = /^--v4-/;

// Скомпилированный Tailwind — чужой артефакт: его `var(--default-font-…, normal)`
// это идиома самого Tailwind, а не наш долг. Тот же файл исключён из проверки
// голой var() в гейте ролей, и по той же причине.
const SKIP_SCAN = new Set(['styles/tailwind.css', 'src/tailwind.css']);

// Замороженный долг на 31 августа 2026. Список может только уменьшаться:
// добавлять имя сюда можно лишь вместе с решением, почему оно остаётся
// необъявленным.
const BASELINE = [
  'ac',
  'acc-bg',
  'accent-color',
  'bg-accent-dark',
  'bg-accent-light',
  'bg-card',
  'bg-color',
  'bg-dark-primary',
  'bg-dark-secondary',
  'bg-dark-tertiary',
  'bg-expanded',
  'bg-forecast-dark',
  'bg-forecast-light',
  'bg-hover',
  'bg-info',
  'bg-primary',
  'bg-soft',
  'bg-success-light',
  'blue-400',
  'blue-500',
  'blue-600',
  'border-color',
  'border-dark',
  'border-light',
  'border-soft',
  'c1',
  'card-bg-dark',
  'card-header-bg',
  'color-bg-primary',
  'color-bg-secondary',
  'color-blue-300',
  'color-blue-400',
  'color-border',
  'color-emerald-400',
  'color-emerald-600',
  'color-emerald-700',
  'color-gray-200',
  'color-gray-600',
  'color-indigo-300',
  'color-indigo-400',
  'color-indigo-500',
  'color-indigo-600',
  'color-orange-500',
  'color-primary',
  'color-red-100',
  'color-red-300',
  'color-slate-50',
  'color-text-primary',
  'color-text-secondary',
  'cx',
  'cy',
  'debt-color',
  'dimTxt',
  'err',
  'excess-color',
  'fingers-border',
  'fingers-card',
  'fingers-card-bg',
  'fingers-fs-card-bg',
  'fingers-skin-1',
  'fingers-skin-2',
  'fingers-text-muted',
  'font-family',
  'gr',
  'gray-100',
  'gray-200',
  'gray-300',
  'gray-400',
  'gray-50',
  'gray-500',
  'gray-600',
  'gray-700',
  'gray-800',
  'green-200',
  'green-50',
  'green-600',
  'green-700',
  'heys-app-chrome-height',
  'heys-bg',
  'heys-border',
  'heys-color-success',
  'heys-color-warning',
  'heys-gray',
  'heys-green',
  'heys-text-tertiary',
  'ink',
  'inkTxt',
  'level-color',
  'link-color',
  'mobility-card-border',
  'planning-calendar-touch-preview-color',
  'primary-bg',
  'primary-color',
  'primary-dark',
  'progress',
  'safe-bottom',
  'success-color',
  'text-color',
  'text-dark',
  'text-dark-primary',
  'text-dark-secondary',
  'text-dark-tertiary',
  'text-muted',
  'text-primary-dark',
  'text-secondary-dark',
  'text-success',
  'token',
  'tx',
  'widget-bg',
  'widget-border-radius',
  'widget-font-headline',
  'widget-surface',
  'widget-weight-black',
  'x',
  'y',
];

function collect(dir = WEB, acc = [], base = '') {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) collect(path.join(dir, entry.name), acc, rel);
      continue;
    }
    if (!/\.(css|js|jsx|ts|tsx|html)$/.test(entry.name)) continue;
    if (SKIP_FILE.test(entry.name)) continue;
    if (SKIP_SCAN.has(rel)) continue;
    acc.push(rel);
  }
  return acc;
}

// Блочные комментарии снимаем перед сбором ОБЪЯВЛЕНИЙ: проза вида «роли под
// --card-bg: в палитре нет» иначе читается регуляркой как объявление, и гейт
// молча объявляет долг закрытым. `//` в JS не трогаем — там протоколы в
// ссылках, и обрезка строки съела бы настоящие объявления.
const stripBlockComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ');

// Объявление в CSS и в объекте стиля JS: `--имя:` и `'--имя':` / `"--имя":`.
const DECL_RE = /--([a-zA-Z][\w-]*)['"`]?\s*:/g;
// Объявление в рантайме: element.style.setProperty('--имя', …).
const SET_RE = /setProperty\(\s*['"`]--([a-zA-Z][\w-]*)/g;
const READ_RE = /var\(\s*--([a-zA-Z][\w-]*)/g;
// Имя, собранное в рантайме: `--es-${key}` в объекте стиля или '--es-' + key.
// Такие объявления не видит ни одна регулярка по точному имени, и гейт без
// этого объявил бы долгом целое живое семейство. Проверено на `--es-*`:
// `heys_widgets_ui_v1.js:576` кладёт `base[\`--es-${key}\`]`, а в CSS тринадцать
// чтений `--es-value` — по точному имени они выглядят необъявленными.
const DYN_RE = /['"`]--([a-zA-Z][\w-]*?)(?:\$\{|['"`]\s*\+)/g;

function scan() {
  const files = collect();
  const declaredCss = new Set();
  const declaredJs = new Set();
  const dynamicPrefixes = new Set();
  const reads = new Map();
  const sources = new Map();

  for (const rel of files) {
    const src = fs.readFileSync(path.join(WEB, rel), 'utf8');
    sources.set(rel, src);
    const code = stripBlockComments(src);
    for (const m of code.matchAll(DECL_RE)) declaredCss.add(m[1]);
    for (const m of code.matchAll(SET_RE)) declaredJs.add(m[1]);
    for (const m of code.matchAll(DYN_RE)) if (m[1]) dynamicPrefixes.add(m[1]);
  }

  for (const [rel, src] of sources) {
    for (const m of src.matchAll(READ_RE)) {
      const name = m[1];
      if (FOREIGN.test(`--${name}`) || OWNED_ELSEWHERE.test(`--${name}`)) continue;
      if (declaredCss.has(name) || declaredJs.has(name)) continue;
      if ([...dynamicPrefixes].some((p) => name.startsWith(p))) continue;
      if (!reads.has(name)) reads.set(name, new Map());
      const perFile = reads.get(name);
      perFile.set(rel, (perFile.get(rel) || 0) + 1);
    }
  }
  return { reads, declaredJs, dynamicPrefixes, files: files.length };
}

function formatBaseline(names) {
  if (!names.length) return 'const BASELINE = [];';
  return `const BASELINE = [\n${names.map((n) => `  '${n}',`).join('\n')}\n];`;
}

function updateBaseline(names) {
  const self = fileURLToPath(import.meta.url);
  const src = fs.readFileSync(self, 'utf8');
  const start = src.indexOf('const BASELINE = [');
  const end = src.indexOf('\n];', start);
  if (start < 0) throw new Error('не нашёл блок BASELINE');
  const after = end < 0 ? start + 'const BASELINE = [];'.length : end + '\n];'.length;
  fs.writeFileSync(self, src.slice(0, start) + formatBaseline(names) + src.slice(after));
  console.log(`Список переписан: ${names.length} имён.`);
}

const args = process.argv.slice(2);
const { reads, declaredJs, dynamicPrefixes } = scan();
const current = [...reads.keys()].sort();

const why = args.indexOf('--why');
if (why !== -1) {
  const name = (args[why + 1] || '').replace(/^--/, '');
  const perFile = reads.get(name);
  if (!perFile) {
    console.log(`\`--${name}\` не значится необъявленным: либо объявлено, либо не читается.`);
    process.exit(0);
  }
  console.log(`\`--${name}\` читается и нигде не объявляется:`);
  for (const [file, n] of [...perFile].sort((a, b) => b[1] - a[1])) console.log(`  ${n}× ${file}`);
  process.exit(0);
}

if (args.includes('--update-baseline')) {
  updateBaseline(current);
  process.exit(0);
}

if (args.includes('--list')) {
  console.log(`Читаются и нигде не объявлены: ${current.length} имён.`);
  for (const name of current) {
    const perFile = reads.get(name);
    const places = [...perFile.values()].reduce((a, b) => a + b, 0);
    const known = BASELINE.includes(name) ? '' : ' (нет в списке)';
    console.log(`  ${String(places).padStart(4)}× --${name}${known}`);
  }
  console.log(`\nСтавятся из JS через setProperty: ${declaredJs.size}.`);
  console.log(
    `Собираются в рантайме по префиксу: ${[...dynamicPrefixes].map((p) => `--${p}*`).join(', ') || '—'}.`,
  );
  process.exit(0);
}

const frozen = new Set(BASELINE);
const added = current.filter((n) => !frozen.has(n));
const gone = BASELINE.filter((n) => !reads.has(n));

if (added.length) {
  console.error(`❌ Новые переменные, которые читаются и нигде не объявляются: ${added.length}.`);
  console.error('   Запасное значение сработает всегда — правило молча перестало следовать');
  console.error('   переменной. Объявите её либо уберите чтение.');
  for (const name of added.slice(0, 12)) {
    const perFile = reads.get(name);
    const places = [...perFile.values()].reduce((a, b) => a + b, 0);
    console.error(`  --${name}: ${places}× — ${[...perFile.keys()].slice(0, 3).join(', ')}`);
  }
  if (added.length > 12) console.error(`  … и ещё ${added.length - 12}`);
  console.error('   Где читается конкретное имя: --why <имя>.');
  process.exit(1);
}

// Уменьшение записывается сразу, а не просится в отчёте: иначе храповик не
// затягивается — улучшил, гейт промолчал, и завтра долг возвращается бесплатно.
// Плата — прогон пишет файл; локально это видно в git status и уезжает тем же
// коммитом, а в CI писать некому, поэтому там расхождение и есть падение.
if (gone.length) {
  updateBaseline(current);
  console.log(`Долг уменьшился на ${gone.length}: ${gone.map((n) => `--${n}`).join(', ')}`);
  if (process.env.CI) {
    console.error('❌ В CI заморозка не должна меняться: добавьте обновлённый файл в коммит.');
    process.exit(1);
  }
}

const worst = current
  .map((n) => [n, [...reads.get(n).values()].reduce((a, b) => a + b, 0)])
  .sort((a, b) => b[1] - a[1])
  .slice(0, 5)
  .map(([n, c]) => `--${n} ${c}`)
  .join(' · ');
console.log(`Необъявленных переменных: ${current.length} имён — ${worst} …`);
console.log(`Ставятся из JS: ${declaredJs.size} через setProperty, плюс семейства ${[...dynamicPrefixes].map((p) => `--${p}*`).join(', ') || '—'}.`);
