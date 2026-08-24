#!/usr/bin/env node
// ui-v4-check-contract-drift.mjs — гейт «контракт поехал, а вердикт остался».
//
// Контракт канваса (`[data-contract]`, строки `data-v`) — единственный источник
// чисел для экрана. Но пакет дизайна приезжает отдельными коммитами, и строку в
// нём меняют молча: код остаётся прежним, а приёмка продолжает показывать
// «совпало». Именно так 21.08 пакет вкладки «Питание» приехал уже после коммита
// реализации и поменял 24 строки — совпало случайно.
//
// Здесь для каждого разобранного экрана лежит снимок: ключ строки → отпечаток её
// значения на момент, когда вердикт ставили. Значение изменилось — падение со
// списком строк, которые надо пересмотреть.
//
// Данные: docs/ui/ui-v4-contract-verdicts.json
//
// Использование:
//   node scripts/ui-v4-check-contract-drift.mjs                # проверить
//   node scripts/ui-v4-check-contract-drift.mjs --list          # сводка по зонам
//   node scripts/ui-v4-check-contract-drift.mjs --rehash <зона> # после пересмотра вердиктов

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACK = path.join(
  ROOT,
  'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4',
);
const VERDICTS = path.join(ROOT, 'docs/ui/ui-v4-contract-verdicts.json');

const hash = (value) => crypto.createHash('sha1').update(value).digest('hex').slice(0, 12);

function contractRows(html, contractOnly) {
  let slice = html;
  if (contractOnly) {
    const m = html.match(
      /<div class="ctr" data-contract="[^"]+">([\s\S]*?)<\/div>\s*\n\s*<div class="(?:pl|secH)/,
    );
    if (!m) return { error: 'блок [data-contract] не найден' };
    slice = m[1];
  }
  const rows = [];
  for (const m of slice.matchAll(/<div class="spec"[^>]*><b>([^<]+)<\/b><span data-v="([^"]*)"/g)) {
    rows.push({ key: m[1], value: m[2] });
  }
  return { rows };
}

// Гигиена канваса: дубль ключа ломает саму сверку — вердикты адресуются именем
// строки, и второй экземпляр молча затирает первый.
function canvasHygiene() {
  const problems = [];
  const warnings = [];
  for (const file of fs.readdirSync(PACK).filter((f) => f.endsWith('.dc.html'))) {
    const html = fs.readFileSync(path.join(PACK, file), 'utf8');
    if (!html.includes('data-contract=')) continue;
    const { rows, error } = contractRows(html, false);
    if (error) {
      problems.push(`${file}: ${error}`);
      continue;
    }
    const seen = new Set();
    const dup = new Set();
    for (const row of rows) {
      if (seen.has(row.key)) dup.add(row.key);
      seen.add(row.key);
    }
    if (dup.size) problems.push(`${file}: ключ повторяется — ${[...dup].join(', ')}`);

    const empty = rows.filter((row) => !row.value.trim()).map((row) => row.key);
    if (empty.length) warnings.push(`${file}: пустое значение — ${empty.join(', ')}`);

    // Кадр — тот, у кого есть `data-screen-label`: по метке его адресуют и по
    // ней же грепают разметку. Без этого условия сюда попадали распорки вида
    // `<div class="ph" style="height:734px">` — в home-widgets их 30, и они
    // давали ложное «кадров без data-demo — 30» на канвасе, где непомеченных
    // кадров нет вовсе. Ложная тревога стоила рекомендации «не сверять здесь
    // геометрию»; проверка должна считать кадры, а не вёрстку вокруг них.
    const framesNoDemo = [...html.matchAll(/<div class="s?[Pp]h[^"]*"[^>]*>/g)].filter(
      (m) => m[0].includes('data-screen-label=') && !m[0].includes('data-demo='),
    ).length;
    if (framesNoDemo) warnings.push(`${file}: кадров без data-demo — ${framesNoDemo}`);
  }
  return { problems, warnings };
}

function readVerdicts() {
  return JSON.parse(fs.readFileSync(VERDICTS, 'utf8'));
}

function inspect(zoneId, zone) {
  const html = fs.readFileSync(path.join(PACK, zone.canvas), 'utf8');
  const { rows, error } = contractRows(html, zone.contractOnly);
  if (error) return { fatal: `${zoneId}: ${error}` };

  const current = new Map(rows.map((row) => [row.key, row.value]));
  const drifted = [];
  const missing = [];
  for (const [key, value] of current) {
    const known = zone.rows[key];
    if (!known) {
      missing.push(key);
      continue;
    }
    if (known.h !== hash(value)) drifted.push({ key, verdict: known.v, value });
  }
  const gone = Object.keys(zone.rows).filter((key) => !current.has(key));
  const tally = {};
  for (const row of Object.values(zone.rows)) tally[row.v] = (tally[row.v] || 0) + 1;
  return { drifted, missing, gone, tally, total: current.size, current };
}

function runCli() {
  const args = process.argv.slice(2);
  const data = readVerdicts();

  const rehashAt = args.indexOf('--rehash');
  if (rehashAt >= 0) {
    const zoneId = args[rehashAt + 1];
    const zone = data.zones[zoneId];
    if (!zone) {
      console.error(`Неизвестная зона: ${zoneId}. Есть: ${Object.keys(data.zones).join(', ')}`);
      process.exit(1);
    }
    const state = inspect(zoneId, zone);
    if (state.fatal) {
      console.error(state.fatal);
      process.exit(1);
    }
    for (const [key, value] of state.current) {
      if (!zone.rows[key]) zone.rows[key] = { v: '?', f: 'Строка добавлена дизайнером, вердикта нет' };
      zone.rows[key].h = hash(value);
    }
    for (const key of state.gone) delete zone.rows[key];
    fs.writeFileSync(VERDICTS, `${JSON.stringify(data, null, 2)}\n`);
    console.log(`${zoneId}: отпечатки пересняты, строк ${state.current.size}.`);
    return;
  }

  if (args.includes('--list')) {
    for (const [zoneId, zone] of Object.entries(data.zones)) {
      const state = inspect(zoneId, zone);
      console.log(
        `${zoneId.padEnd(18)} строк ${String(state.total).padEnd(4)} вердикты ${JSON.stringify(state.tally)} (снято ${zone.recorded})`,
      );
    }
    return;
  }

  const hygiene = canvasHygiene();
  for (const warning of hygiene.warnings) console.log(`⚠  ${warning}`);

  let failed = hygiene.problems.length > 0;
  for (const problem of hygiene.problems) console.error(`\n❌ ${problem}`);

  for (const [zoneId, zone] of Object.entries(data.zones)) {
    const state = inspect(zoneId, zone);
    if (state.fatal) {
      failed = true;
      console.error(`\n❌ ${state.fatal}`);
      continue;
    }
    if (state.drifted.length) {
      failed = true;
      console.error(`\n❌ ${zoneId}: дизайнер изменил строки контракта, вердикт не пересмотрен:`);
      for (const item of state.drifted) {
        console.error(`  «${item.key}» — стоял вердикт «${item.verdict}»`);
        console.error(`     стало: ${item.value.slice(0, 120)}${item.value.length > 120 ? '…' : ''}`);
      }
    }
    if (state.missing.length) {
      failed = true;
      console.error(`\n❌ ${zoneId}: новые строки контракта без вердикта:`);
      for (const key of state.missing) console.error(`  «${key}»`);
    }
    if (state.gone.length) {
      failed = true;
      console.error(`\n❌ ${zoneId}: вердикт есть, а строки в контракте больше нет:`);
      for (const key of state.gone) console.error(`  «${key}»`);
    }
  }

  if (failed) {
    console.error('\nЧто делать: перечитать изменённые строки, поправить код или вердикт');
    console.error('в docs/ui/ui-v4-contract-verdicts.json, спорное — в docs/ui/UI_V4_FINDINGS.md,');
    console.error('затем: node scripts/ui-v4-check-contract-drift.mjs --rehash <зона>');
    process.exit(1);
  }

  const zones = Object.keys(data.zones).length;
  const rows = Object.values(data.zones).reduce((sum, z) => sum + Object.keys(z.rows).length, 0);
  console.log(`Контракты не двигались: ${zones} зоны, ${rows} строк с вердиктами.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli();
}
