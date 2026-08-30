#!/usr/bin/env node
// Аудит «роль по назначению»: сверяет цвет во всех четырёх наборах там, где
// сверка кадров сегодня смотрит только песочный.
//
// Зачем. Сверка разрешает роли по песочным значениям, и роли, совпавшие в
// песочной, считает одинаковыми. В наборе 94 пары ролей, у которых песочное
// значение общее, а дальше расходится: `--v4-warn-3` и `--v4-warn-text` — обе
// #a1471c в песочной и три разных цвета в остальных наборах. Взяв не ту из
// пары, код проходит и сверку кадра, и оба гейта ролей, а в тёмной теме
// показывает чужой тон.
//
// Это измерение, а не гейт: скрипт ничего не роняет и никого не блокирует.
// Запуск: node scripts/ui-v4-audit-role-purpose.mjs
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1'),
  '..',
);
const TESTS = path.join(ROOT, 'apps/web/__tests__');
const OUT = path.join(os.tmpdir(), `heys-role-purpose-${process.pid}.jsonl`);

const зоны = fs
  .readdirSync(TESTS)
  .filter((f) => /canvas-razbor.*\.test\.js$/.test(f))
  .map((f) => `apps/web/__tests__/${f}`);

fs.writeFileSync(OUT, '', 'utf8');
try {
  execFileSync('npx', ['vitest', 'run', ...зоны], {
    cwd: ROOT,
    env: { ...process.env, HEYS_ROLE_PURPOSE_AUDIT: OUT },
    stdio: 'ignore',
    shell: process.platform === 'win32',
  });
} catch {
  // Падение сверки — не наша забота: аудит читает то, что она успела сравнить.
}

const NL = String.fromCharCode(10);
const rows = fs
  .readFileSync(OUT, 'utf8')
  .trim()
  .split(NL)
  .filter(Boolean)
  .map((l) => JSON.parse(l));
fs.unlinkSync(OUT);

const счёт = rows
  .filter((r) => r.счёт)
  .reduce((a, r) => ({ о: a.о + r.счёт.осмотрено, р: a.р + r.счёт.развернулось }), { о: 0, р: 0 });
const находки = rows.filter((r) => !r.счёт);

// Расхождение в одном наборе из трёх — почти всегда не выбор роли, а разъезд
// самой палитры с канвасом: имя роли каноничное, а значение в этом наборе
// разошлось. Такое чинится в палитре, а не в зоне, поэтому считается отдельно.
const вид = (f) =>
  f.вид === 'литерал вместо роли'
    ? f.вид
    : f.diverge.length === 1
      ? 'палитра разошлась с канвасом'
      : 'не та роль';

console.log(
  `осмотрено пар цвета: ${счёт.о} · развернулось в цвет: ${счёт.р} · находок: ${находки.length}`,
);
const поВиду = {};
находки.forEach((f) => {
  поВиду[вид(f)] = (поВиду[вид(f)] || 0) + 1;
});
for (const [k, n] of Object.entries(поВиду).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(3)}  ${k}`);
}
console.log('');
for (const f of находки.sort((a, b) => (вид(a) + a.frame).localeCompare(вид(b) + b.frame))) {
  console.log(`[${вид(f)}] ${f.frame} · ${f.index} — ${f.selector} { ${f.kind} }`);
  console.log(`    кадр ${f.frameValue} · код ${f.codeValue} · в песочной оба ${f.sand}`);
  for (const d of f.diverge) console.log(`    ${d}`);
}
