#!/usr/bin/env node
// Роли, названные ИМЕНЕМ КАНВАСА, в продуктовом коде.
//
// Канвас и продукт зовут одни и те же роли по-разному: в кадре `--ac`, в
// продукте `--v4-act-text`. Словарь перевода живёт в разборщике сверки
// (apps/web/__tests__/canvas-razbor-helpers.js). Когда канвасное имя попадает в
// САМ продукт и нигде не объявлено, цвет молча берётся из запасного значения и
// за набором не следует. Гейт неопределённых ролей этого не видит: он проверяет
// имена с префиксом `--v4-`.
//
// Повод: 10.09 при сведении пакета 51 кольцо отдыха в силовом стояло на
// `var(--acs, var(--sb-acc))`, и это приняли за такой дефект. Проверка отменила
// находку: `--acs` объявлена локально в 750-strength-builder.css как
// `var(--v4-act, #c67139)`, то есть кольцо палитре следовало. Переводить его на
// `--ac` всё равно было нужно — пакет 51 сменил роль в контракте, — но довод
// «красилось запасным» в коммите e1a955821 неверен, и здесь это записано,
// потому что сообщение коммита уже не переписать.
//
// Считаем ПЕРЕЧИСЛЕНИЕМ всех `var(--имя)`, а не поиском по списку подозрительных
// имён: список — это гипотеза, перечисление — проверка. Разовый поиск по списку
// дал 221 место и вывод «цвет идёт из запасного»; перечисление показало 1 имя в
// 10 местах, и все десять — в файле описания контрактов для тестов, а не в
// рантайме. Ошибка была не в счёте, а в том, что счёт не отличал использование
// от упоминания в комментарии и объявленное имя от необъявленного.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'apps/web');

// Сборки, зависимости и тесты — не продуктовый код. Разделитель пути
// нормализуем: на Windows он обратный, и правило через прямой слэш молча не
// срабатывает — проверка тогда обходит сборки и считает их за исходники.
const SKIP_DIR = /(^|\/)(node_modules|dist|public|\.git|__tests__|coverage)(\/|$)/;
const SRC_EXT = /\.(css|js|jsx|mjs|cjs|ts|tsx|html)$/;
const slash = (p) => p.split(path.sep).join('/');

/** Убрать комментарии, сохранив разбиение на строки и номера. */
function stripComments(text) {
  const blank = (m) => m.replace(/[^\n]/g, ' ');
  return text
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (m, p) => p + ' '.repeat(m.length - p.length));
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIR.test(slash(full))) continue;
      walk(full, out);
    } else if (SRC_EXT.test(entry.name)) out.push(full);
  }
  return out;
}

const files = walk(WEB);

// 1) Где имя ОБЪЯВЛЕНО: `--имя:` в любом продуктовом файле.
const declared = new Set();
for (const file of files) {
  for (const m of stripComments(fs.readFileSync(file, 'utf8')).matchAll(/(--[a-z0-9-]+)\s*:/gi)) {
    declared.add(m[1]);
  }
}

// 2) Где имя ИСПОЛЬЗУЕТСЯ через var().
const uses = new Map();
for (const file of files) {
  const lines = stripComments(fs.readFileSync(file, 'utf8')).split('\n');
  lines.forEach((line, i) => {
    for (const m of line.matchAll(/var\(\s*(--[a-z0-9-]+)\s*([,)])/gi)) {
      const list = uses.get(m[1]) || [];
      list.push({ file: path.relative(ROOT, file), line: i + 1, hasFallback: m[2] === ',' });
      uses.set(m[1], list);
    }
  });
}

// 3) Какие из них — имена КАНВАСА. Список берём из словаря разборщика сверки, а
// не пишем свой: своя копия разойдётся с ним на первой же правке словаря.
const DICT = path.join(WEB, '__tests__/canvas-razbor-helpers.js');
const canvasNames = new Set();
if (fs.existsSync(DICT)) {
  const dict = fs.readFileSync(DICT, 'utf8');
  const at = dict.indexOf('const ROLE');
  const block = at < 0 ? '' : dict.slice(at, dict.indexOf('};', at));
  for (const m of block.matchAll(/'(--[a-z0-9-]+)'\s*:/gi)) canvasNames.add(m[1]);
}

const undeclared = [...uses.keys()].filter((n) => !declared.has(n));
const places = (n) => uses.get(n).length;
const total = (list) => list.reduce((sum, n) => sum + places(n), 0);

console.log(`Просмотрено продуктовых исходников: ${files.length}`);
console.log(`Разных имён в var(): ${uses.size}; объявлено где-либо: ${uses.size - undeclared.length}`);
console.log(`Не объявлено: ${undeclared.length} имён в ${total(undeclared)} местах.`);

const canvasUndeclared = undeclared.filter((n) => canvasNames.has(n));
console.log('');
console.log(
  `ИМЕНА КАНВАСА без объявления в продукте: ${canvasUndeclared.length} имён ` +
    `в ${total(canvasUndeclared)} местах (словарь разборщика знает ${canvasNames.size} ролей).`,
);
if (!canvasUndeclared.length) {
  console.log('  нет — канвасные имена в продукте либо не используются, либо объявлены локально.');
}
for (const n of canvasUndeclared.sort((a, b) => places(b) - places(a))) {
  for (const u of uses.get(n)) console.log(`  ${n.padEnd(14)} ${u.file}:${u.line}`);
}

// Канвасные имена, которые в продукте ОБЪЯВЛЕНЫ локально: не дефект, но место,
// где продукт держит второй словарь ролей рядом с первым.
const canvasLocal = [...canvasNames].filter((n) => declared.has(n) && uses.has(n));
console.log('');
console.log(`Канвасных имён, объявленных локально в модулях: ${canvasLocal.length} (${total(canvasLocal)} мест).`);
for (const n of canvasLocal.sort((a, b) => places(b) - places(a)).slice(0, 10)) {
  const files_ = [...new Set(uses.get(n).map((u) => u.file.split(/[\\/]/).pop()))];
  console.log(`  ${String(places(n)).padStart(4)}  ${n.padEnd(14)} ${files_.slice(0, 3).join(', ')}`);
}
