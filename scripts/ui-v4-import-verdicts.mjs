#!/usr/bin/env node
// ui-v4-import-verdicts.mjs — разовый сборщик снимка вердиктов из построчных
// файлов ревизии.
//
// Снимок `docs/ui/ui-v4-contract-verdicts.json` до этого держал 6 зон из 17:
// остальные одиннадцать гейт `ui-v4-check-contract-drift.mjs` не сторожил, и
// правка контракта в них проходила молча. Ревизия 24.08 дала вердикт на каждую
// из 1042 строк; здесь эти вердикты переносятся в снимок вместе с отпечатками.
//
// Вход: каталог с файлами `<зона>.txt`, строки вида `<номер>|<вердикт>|<факт>`,
// нумерация — порядок строк в блоке [data-contract] соответствующего канваса.
//
//   node scripts/ui-v4-import-verdicts.mjs <каталог> [--dry]
//
// Скрипт не угадывает: если число строк в файле не совпало с числом строк
// контракта, зона отклоняется целиком с указанием расхождения. Пропущенный
// номер получает вердикт `?` — «никто не смотрел», а не «и так понятно».

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACK = path.join(
  ROOT,
  'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4',
);
// Исторический путь: снимок был одним файлом до 31 августа. Скрипт разовый и
// с тех пор не запускался; актуальная раскладка — docs/ui/verdicts/<зона>.json.
const VERDICTS = path.join(ROOT, 'docs/ui/verdicts');
const VALID = new Set(['=', '≠', '—', '?']);

const hash = (value) => crypto.createHash('sha1').update(value).digest('hex').slice(0, 12);

const decode = (s) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');

// Разбор ровно как у гейта при contractOnly=false: весь файл.
//
// Почему не блок [data-contract]. Строгая регулярка гейта требует, чтобы сразу
// за блоком шёл `<div class="pl|secH">`, и на семи канвасах из семнадцати не
// совпадает вовсе. При этом счёт строк «блок» и «весь файл» совпадает везде,
// кроме `water-add` (9 против 74), где вердикты исторически ставились по всему
// файлу. Значит разбор всего файла даёт те же строки и не зависит от вёрстки
// вокруг блока — его и берём для всех зон.
//
// `key` раскодирован (им адресуются вердикты и его читает человек), а `raw` —
// значение ровно как в HTML: гейт хеширует именно его. Хешировать
// раскодированное — значит выдумать дрейф на первой же строке с `&times;`.
function contractRows(html) {
  return [...html.matchAll(/<div class="spec"[^>]*><b>([^<]+)<\/b><span data-v="([^"]*)"/g)].map(
    (m) => ({ key: decode(m[1]), raw: m[2] }),
  );
}

function canvasFor(zoneId) {
  const direct = path.join(PACK, `${zoneId}.v4.dc.html`);
  if (fs.existsSync(direct)) return `${zoneId}.v4.dc.html`;
  for (const file of fs.readdirSync(PACK).filter((f) => f.endsWith('.dc.html'))) {
    const html = fs.readFileSync(path.join(PACK, file), 'utf8');
    if (html.includes(`data-contract="${zoneId}"`)) return file;
  }
  return null;
}

const [dirArg, ...flags] = process.argv.slice(2);
if (!dirArg) {
  console.error('Укажите каталог с файлами вердиктов.');
  process.exit(1);
}
const dry = flags.includes('--dry');

const data = JSON.parse(fs.readFileSync(VERDICTS, 'utf8'));
const problems = [];
const report = [];

for (const file of fs.readdirSync(dirArg).filter((f) => f.endsWith('.txt')).sort()) {
  const zoneId = file.replace(/\.txt$/, '');
  const canvas = canvasFor(zoneId);
  if (!canvas) {
    problems.push(`${zoneId}: канвас с data-contract="${zoneId}" не найден`);
    continue;
  }
  const rows = contractRows(fs.readFileSync(path.join(PACK, canvas), 'utf8'));
  if (!rows.length) {
    problems.push(`${zoneId}: строк .spec не найдено`);
    continue;
  }

  const parsed = new Map();
  const bad = [];
  const raw = fs.readFileSync(path.join(dirArg, file), 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const m = line.match(/^\s*(\d+)\s*\|\s*(\S+)\s*\|\s*([\s\S]*)$/);
    if (!m) {
      bad.push(line.slice(0, 60));
      continue;
    }
    if (!VALID.has(m[2])) {
      bad.push(`строка ${m[1]}: вердикт «${m[2]}» не из набора = ≠ — ?`);
      continue;
    }
    parsed.set(Number(m[1]), { v: m[2], f: m[3].trim() });
  }
  if (bad.length) {
    problems.push(`${zoneId}: не разобрано ${bad.length} строк — ${bad.slice(0, 3).join(' · ')}`);
    continue;
  }
  if (parsed.size !== rows.length) {
    problems.push(
      `${zoneId}: вердиктов ${parsed.size}, строк контракта ${rows.length} — зона пропущена`,
    );
    continue;
  }

  const zoneRows = {};
  const tally = {};
  rows.forEach((row, index) => {
    const got = parsed.get(index + 1) || { v: '?', f: 'Номер строки не пришёл из ревизии' };
    zoneRows[row.key] = { v: got.v, f: got.f, h: hash(row.raw) };
    tally[got.v] = (tally[got.v] || 0) + 1;
  });

  data.zones[zoneId] = {
    canvas,
    contractOnly: false,
    recorded: '2026-08-24',
    rows: zoneRows,
  };
  report.push(`${zoneId.padEnd(18)} строк ${String(rows.length).padEnd(4)} ${JSON.stringify(tally)}`);
}

if (problems.length) {
  console.error('Отклонено:');
  for (const p of problems) console.error(`  ${p}`);
}
console.log(report.join('\n'));
if (!dry) {
  fs.writeFileSync(VERDICTS, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`\nСнимок записан: ${Object.keys(data.zones).length} зон.`);
} else {
  console.log('\n--dry: файл не тронут.');
}
if (problems.length) process.exit(1);
