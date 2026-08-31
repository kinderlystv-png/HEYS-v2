#!/usr/bin/env node
/**
 * Ищет места, где цвет не назван, а унаследован: `currentColor`, `inherit`,
 * `unset` в свойствах заливки и обводки.
 *
 * Зачем. Строка контракта описывает цвет там, где он назван. Унаследованный
 * цвет назвать нельзя — он приходит от правила про соседнее свойство, обычно
 * про текст. Поэтому такое место остаётся вне сверки по построению: пары
 * «класс кадра → правило продукта» для него не существует, и гейт зоны про
 * него молчит, оставаясь зелёным.
 *
 * Случай, из которого выросла проверка (31.08, зона home-widgets): полоса
 * клетчатки и белка залита `background: currentColor`, а класс состояния
 * приходит из `v4GoalState(pct)`, который отдаёт «good» только от 100 %. Ниже
 * нормы заливка равна чернилам, и на живом экране полоса почти чёрная, тогда
 * как кадр рисует зелёную. Ни одна из шести строк контракта со словом «полоса»
 * цвет заливки не описывает: они про кегль числа, про момент обновления, про
 * упор в край и про прочерк.
 *
 * Вывод — список кандидатов, а не вердикт. Унаследованный цвет бывает и
 * намеренным (значок, повторяющий цвет подписи рядом). Проверка называет места
 * и объём охвата; решает человек.
 *
 * Использование:
 *   node scripts/ui-v4-list-inherited-paint.mjs [--files=<glob-подстроки>] [--json]
 */

import fs from 'node:fs';
import path from 'node:path';

const CSS_DIR = 'apps/web/styles/modules';
const PAINT = new Set([
  'color',
  'background',
  'background-color',
  'background-image',
  'fill',
  'stroke',
  'border-color',
  'border-top-color',
  'border-bottom-color',
  'border-left-color',
  'border-right-color',
  'outline-color',
  'box-shadow',
  'text-decoration-color',
  'caret-color',
]);
// `color: inherit` — норма: текст наследует цвет по определению. Ищем заливку
// и обводку, то есть всё, кроме самого `color`.
const INHERITED = /^(currentcolor|inherit|unset|revert)$/i;

const args = process.argv.slice(2);
const only = (args.find((a) => a.startsWith('--files=')) || '').slice(8);
const asJson = args.includes('--json');

function cssFiles() {
  return fs
    .readdirSync(CSS_DIR)
    .filter((f) => f.endsWith('.css'))
    .filter((f) => (only ? only.split(',').some((p) => f.includes(p)) : true))
    .map((f) => path.join(CSS_DIR, f));
}

/** Разбирает файл на правила: селектор, тело, номер строки открывающей скобки. */
function rules(text) {
  const out = [];
  let depth = 0;
  let selStart = 0;
  let bodyStart = -1;
  let line = 1;
  const lineAt = [];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '\n') line += 1;
    lineAt[i] = line;
  }
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '{') {
      depth += 1;
      if (depth === 1) bodyStart = i + 1;
      continue;
    }
    if (ch === '}') {
      depth -= 1;
      if (depth === 0 && bodyStart >= 0) {
        out.push({
          selector: text.slice(selStart, bodyStart - 1).trim(),
          body: text.slice(bodyStart, i),
          line: lineAt[bodyStart] || 0,
        });
        selStart = i + 1;
        bodyStart = -1;
      }
      continue;
    }
  }
  return out;
}

const hits = [];
let scanned = 0;
let rulesSeen = 0;

for (const file of cssFiles()) {
  const text = fs.readFileSync(file, 'utf8');
  scanned += 1;
  for (const rule of rules(text)) {
    rulesSeen += 1;
    // Вложенные блоки (@media, @supports) сюда попадают телом целиком —
    // объявления внутри них видны той же регуляркой ниже.
    for (const m of rule.body.matchAll(/(^|[;{])\s*([a-z-]+)\s*:\s*([^;}]+)/gi)) {
      const prop = m[2].toLowerCase();
      const value = m[3].trim().replace(/\s*!important$/i, '');
      if (prop === 'color') continue;
      if (!PAINT.has(prop)) continue;
      if (!INHERITED.test(value)) continue;
      hits.push({
        file: path.basename(file),
        line: rule.line,
        selector: rule.selector.replace(/\s+/g, ' ').slice(0, 120),
        prop,
        value,
      });
    }
  }
}

if (asJson) {
  process.stdout.write(JSON.stringify({ scanned, rulesSeen, hits }, null, 2));
} else {
  const byFile = new Map();
  for (const h of hits) {
    if (!byFile.has(h.file)) byFile.set(h.file, []);
    byFile.get(h.file).push(h);
  }
  const order = [...byFile.entries()].sort((a, b) => b[1].length - a[1].length);
  for (const [file, list] of order) {
    console.log(`\n${file} — ${list.length}`);
    for (const h of list) {
      console.log(`  :${String(h.line).padStart(6)}  ${h.prop}: ${h.value}`);
      console.log(`          ${h.selector}`);
    }
  }
  console.log(
    `\nОхват: ${scanned} файлов, ${rulesSeen} правил. Унаследованной заливки и обводки: ${hits.length}.`,
  );
  console.log(
    'Это кандидаты, а не дефекты: наследование бывает намеренным. Проверять надо там,',
  );
  console.log(
    'где элемент несёт состояние — полоса, столбик, значок статуса: у них цвет обязан',
  );
  console.log('следовать своему правилу, а не правилу соседнего текста.');
}
