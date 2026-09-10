#!/usr/bin/env node
/**
 * Правила CSS, которые не рисует ни одна строка кода.
 *
 * Мёртвое правило безопасно ровно до тех пор, пока по нему не начнут сводить
 * экран: тогда вердикт «сведено» встаёт против того, чего человек не увидит.
 * 10 сентября так нашлись девять правил кнопок шага и четыре правила
 * переключателя в разборе вреда — оба раза случайно, при работе рядом.
 *
 * Отдельно проверка ищет ПРОМАХИ ИМЕНИ: мёртвый класс, у которого есть живой
 * почти-двойник. Это не мусор, а сломанное состояние: в тот же день нашлось
 * правило фокуса строки поиска на `.aps-v4-search-field`, тогда как код выводит
 * `.aps-search-field` — подсветки фокуса нет вообще, а правило выглядит
 * сведённым.
 *
 * Проверка ТРУСЛИВАЯ по построению: назвать живое мёртвым здесь дороже, чем
 * пропустить мёртвое, потому что по такому отчёту удаляют код. Живым считается
 * класс, если:
 *   • его полное имя встречается в исходнике где угодно, хоть внутри строки;
 *   • он начинается с приставки, которую код склеивает — `foo--${kind}` или
 *     `'foo--' + kind` делают живыми ВСЕ классы, начинающиеся на `foo--`;
 *   • он встречается в разметке стендов и тестов (помечается отдельно —
 *     это не «рисует продукт», но и не мусор).
 *
 * Склейка — не редкость и не мелочь: без неё проверка объявила бы мёртвыми два
 * рабочих исхода карточки продукта, имя которых собирается из `meta.kind`.
 *
 * Запуск: node scripts/ui-v4-check-dead-class-rules.mjs [--json <файл>]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'apps/web');

/** Каталоги сборок и резервных копий: там не источник правды. */
const SKIP_DIR = /(^|[\\/])(node_modules|dist|public|coverage|\.next|build)([\\/]|$)/;
/** Дамп стилей до разделения файлов — история, а не действующий модуль. */
const SKIP_CSS = /\.pre-split|\.bak$|\.orig$/;

const CODE_EXT = new Set(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.html']);

function walk(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (SKIP_DIR.test(full)) continue;
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = walk(WEB);
const cssFiles = files.filter((f) => f.endsWith('.css') && !SKIP_CSS.test(f));
const isTestFile = (f) => /__tests__|\.test\.|\.spec\.|[\\/]stands[\\/]/.test(f);
const codeFiles = files.filter((f) => CODE_EXT.has(path.extname(f)));

// ── Что объявлено в CSS ──────────────────────────────────────────────────────
// Имена читаем из позиции селектора, а не из всего текста: класс, встреченный
// внутри строки `content:` или в комментарии, объявлением не является.
const declared = new Map(); // класс → { rules, files:Set }
const CLASS_RE = /\.(-?[_a-zA-Z][\w-]*)/g;

function record(name, rel) {
  let row = declared.get(name);
  if (!row) declared.set(name, (row = { rules: 0, files: new Set() }));
  row.rules += 1;
  row.files.add(rel);
}

for (const file of cssFiles) {
  const text = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  for (const chunk of text.split('}')) {
    const brace = chunk.indexOf('{');
    if (brace < 0) continue;
    const head = chunk.slice(0, brace);
    if (/@(media|supports|keyframes|layer|container)/.test(head)) {
      // Внутри at-правила селектор идёт после `{`; читаем и его.
      for (const m of chunk.slice(brace + 1).matchAll(CLASS_RE)) record(m[1], rel);
      continue;
    }
    for (const m of head.matchAll(CLASS_RE)) record(m[1], rel);
  }
}

// ── Что может вывести код ────────────────────────────────────────────────────
const literal = new Set();      // точные имена из продуктового кода
const literalTest = new Set();  // точные имена из тестов и стендов
const prefixes = new Set();     // приставки склеенных имён из продуктового кода

const TOKEN_RE = /[_a-zA-Z][\w-]*/g;
// `foo--${` и `foo--' + ` — два способа склеить имя; берём статическую часть.
const GLUE_RE = /([_a-zA-Z][\w-]*)(?:\$\{|['"`]\s*\+)/g;

for (const file of codeFiles) {
  const text = fs.readFileSync(file, 'utf8');
  const bucket = isTestFile(file) ? literalTest : literal;
  for (const m of text.matchAll(TOKEN_RE)) bucket.add(m[0]);
  if (bucket !== literal) continue;
  for (const m of text.matchAll(GLUE_RE)) {
    // Приставка полезна, только если похожа на начало имени класса: одиночное
    // слово вроде `className` приставкой не считаем — иначе живым станет всё.
    if (m[1].includes('-')) prefixes.add(m[1]);
  }
}

const aliveByPrefix = (name) => {
  for (const p of prefixes) if (name.startsWith(p)) return true;
  return false;
};

// ── Разбор ───────────────────────────────────────────────────────────────────
const dead = [];
const onlyTests = [];
for (const [name, row] of declared) {
  if (literal.has(name) || aliveByPrefix(name)) continue;
  const entry = { name, rules: row.rules, files: [...row.files].sort() };
  if (literalTest.has(name)) onlyTests.push(entry);
  else dead.push(entry);
}

// ── Промахи имени ────────────────────────────────────────────────────────────
// Мёртвый класс, у которого есть живой почти-двойник: то же имя без одного
// куска, разделённого дефисом. Это сломанное состояние, а не мусор.
//
// Отбрасываем два вида шума, иначе настоящее тонет. Первый — выпавший кусок
// ПОСЛЕДНИЙ: `.hdr-client-avatar` против живого `.hdr-client` это не опечатка, а
// обычная пара «блок и его часть». Второй — выпавший кусок ПЕРВЫЙ:
// `.reports-tab` против `.tab` роднит только окончание, общего предка нет.
// Настоящий промах живёт в середине: `.aps-v4-search-field` против
// `.aps-search-field` — тот самый случай, когда правило фокуса написано на
// приставку, которой код не выводит.
const liveSet = new Set([...declared.keys()].filter((n) => literal.has(n) || aliveByPrefix(n)));
const nearMiss = [];
for (const entry of dead) {
  const parts = entry.name.split('-');
  if (parts.length < 3) continue;
  const twins = new Set();
  for (let i = 1; i < parts.length - 1; i += 1) {
    const without = parts.slice(0, i).concat(parts.slice(i + 1)).join('-');
    // Двойник из двух слов слишком общий: `.mc-close-btn` против живого
    // `.mc-btn` — это разные узлы с общим хвостом, а не одна пара.
    if (without && liveSet.has(without) && without.split('-').length >= 3) twins.add(without);
  }
  if (!twins.size) continue;
  // Последний отсев, и он от проверки руками. `.insights-ring-card--nutrition`
  // выглядит промахом рядом с живым `.insights-ring--nutrition`, но базовый
  // `.insights-ring-card` тоже не рисуется никем: это мёртвый узел целиком, а
  // не сломанное состояние живого. Сломанное состояние — это когда БАЗА живая,
  // а её вид или состояние написаны на промахнувшееся имя.
  const base = entry.name.split('--')[0];
  if (base !== entry.name && !liveSet.has(base)) continue;
  nearMiss.push({ ...entry, twins: [...twins] });
}

// ── Отчёт ────────────────────────────────────────────────────────────────────
const deadRules = dead.reduce((sum, e) => sum + e.rules, 0);
const byFile = new Map();
for (const entry of dead) for (const f of entry.files) byFile.set(f, (byFile.get(f) || 0) + entry.rules);

console.log(`Просмотрено: ${cssFiles.length} файлов стилей, ${codeFiles.length} файлов кода.`);
console.log(`Объявлено классов: ${declared.size}. Приставок склейки: ${prefixes.size}.`);
console.log(`Не рисует никто: ${dead.length} классов, ${deadRules} правил.`);
console.log(`Только в тестах и стендах: ${onlyTests.length} классов — не мусор, но и не продукт.`);

const top = [...byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
if (top.length) {
  console.log('\nГде их больше всего:');
  for (const [file, count] of top) console.log(`  ${String(count).padStart(4)}  ${file}`);
}

if (nearMiss.length) {
  console.log(`\nПРОМАХИ ИМЕНИ — ${nearMiss.length}. Правило есть, но написано на имя, которого код не`);
  console.log('выводит, а рядом живёт почти такое же. Это сломанное состояние, а не мусор:');
  for (const entry of nearMiss.slice(0, 40)) {
    console.log(`  .${entry.name} (${entry.rules} прав.) → живёт .${entry.twins.join(', .')}`);
  }
  if (nearMiss.length > 40) console.log(`  … и ещё ${nearMiss.length - 40}`);
}

const jsonAt = process.argv.indexOf('--json');
if (jsonAt !== -1 && process.argv[jsonAt + 1]) {
  const out = { generatedAt: new Date().toISOString().slice(0, 10), dead, onlyTests, nearMiss };
  fs.writeFileSync(process.argv[jsonAt + 1], JSON.stringify(out, null, 2));
  console.log(`\nПодробности: ${process.argv[jsonAt + 1]}`);
}
