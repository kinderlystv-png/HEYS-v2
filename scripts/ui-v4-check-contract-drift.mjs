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
// Данные: docs/ui/verdicts/<зона>.json — по файлу на зону, см. README рядом.
//
// Использование:
//   node scripts/ui-v4-check-contract-drift.mjs                # проверить
//   node scripts/ui-v4-check-contract-drift.mjs --list          # сводка по зонам
//   node scripts/ui-v4-check-contract-drift.mjs --zone login    # проверить одну зону
//   node scripts/ui-v4-check-contract-drift.mjs --rehash <зона> # после пересмотра вердиктов

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readAllZones, writeZone } from './lib/ui-v4-verdicts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ALLOWED_VERDICTS = new Set(['=', '≠', '?', '—']);
const PACK = path.join(
  ROOT,
  'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4',
);
// Вердикты лежат по файлу на зону: docs/ui/verdicts/<зона>.json. Путь знает
// только scripts/lib/ui-v4-verdicts.mjs — см. причину там.

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
function canvasHygiene(canvasFiles = null) {
  const problems = [];
  const warnings = [];
  for (const file of fs.readdirSync(PACK).filter(
    (f) => f.endsWith('.dc.html') && (!canvasFiles || canvasFiles.has(f)),
  )) {
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
  return readAllZones();
}

export function findInvalidVerdicts(data, zoneIds = null) {
  const invalid = [];
  for (const [zoneId, zone] of Object.entries(data?.zones || {})) {
    if (zoneIds && !zoneIds.has(zoneId)) continue;
    for (const [key, row] of Object.entries(zone?.rows || {})) {
      if (!ALLOWED_VERDICTS.has(row?.v)) invalid.push({ zoneId, key, verdict: row?.v });
    }
  }
  return invalid;
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

// Канвас с контрактом, которого нет в снимке, — это строки, которых гейт не
// видит вовсе: «зелено» означает лишь «зарегистрированное не поехало». Так
// 31.08 вне снимка оказались food-meal (1010 строк) и product-card (372).
function unregisteredCanvases(data) {
  const registered = new Set(Object.values(data.zones).map((zone) => zone.canvas));
  const orphans = [];
  for (const file of fs.readdirSync(PACK).filter((f) => f.endsWith('.dc.html'))) {
    if (registered.has(file)) continue;
    const { rows } = contractRows(fs.readFileSync(path.join(PACK, file), 'utf8'), false);
    if (rows && rows.length) orphans.push({ file, count: rows.length });
  }
  return orphans;
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
    // Пишем только свою зону: чужая работа в чужой коммит больше не попадает.
    writeZone(zoneId, zone);
    console.log(`${zoneId}: отпечатки пересняты, строк ${state.current.size}.`);
    return;
  }

  const requestedZones = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== '--zone') continue;
    const zoneId = args[index + 1];
    if (!zoneId || zoneId.startsWith('--')) {
      console.error('После --zone нужно указать id зоны.');
      process.exit(1);
    }
    if (!data.zones[zoneId]) {
      console.error(`Неизвестная зона: ${zoneId}. Есть: ${Object.keys(data.zones).join(', ')}`);
      process.exit(1);
    }
    requestedZones.push(zoneId);
    index += 1;
  }
  const selectedZoneIds = requestedZones.length
    ? new Set(requestedZones)
    : new Set(Object.keys(data.zones));
  const selectedZones = Object.entries(data.zones).filter(([zoneId]) => selectedZoneIds.has(zoneId));

  if (args.includes('--list')) {
    for (const [zoneId, zone] of selectedZones) {
      const state = inspect(zoneId, zone);
      console.log(
        `${zoneId.padEnd(18)} строк ${String(state.total).padEnd(4)} вердикты ${JSON.stringify(state.tally)} (снято ${zone.recorded})`,
      );
    }
    return;
  }

  const hygiene = canvasHygiene(new Set(selectedZones.map(([, zone]) => zone.canvas)));
  for (const warning of hygiene.warnings) console.log(`⚠  ${warning}`);

  const invalidVerdicts = findInvalidVerdicts(data, selectedZoneIds);
  const orphans = requestedZones.length ? [] : unregisteredCanvases(data);
  let failed =
    hygiene.problems.length > 0 || invalidVerdicts.length > 0 || orphans.length > 0;
  if (orphans.length) {
    console.error('\n❌ Канвас с контрактом не заведён зоной в снимке — его строки гейт не видит:');
    for (const item of orphans) console.error(`  ${item.file} — строк ${item.count}`);
    console.error('  Завести зону файлом docs/ui/verdicts/<зона>.json и снять отпечатки --rehash.');
  }
  for (const problem of hygiene.problems) console.error(`\n❌ ${problem}`);
  if (invalidVerdicts.length) {
    console.error('\n❌ Неизвестный символ вердикта; допустимы только = ≠ ? —:');
    for (const item of invalidVerdicts) {
      console.error(`  ${item.zoneId} · «${item.key}» — «${String(item.verdict)}»`);
    }
  }

  for (const [zoneId, zone] of selectedZones) {
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
    console.error('в docs/ui/verdicts/<зона>.json, спорное — в docs/ui/UI_V4_FINDINGS.md,');
    console.error('затем: node scripts/ui-v4-check-contract-drift.mjs --rehash <зона>');
    process.exit(1);
  }

  const zones = selectedZones.length;
  const rows = selectedZones.reduce((sum, [, zone]) => sum + Object.keys(zone.rows).length, 0);
  console.log(`Контракты не двигались: ${zones} зоны, ${rows} строк с вердиктами.`);

  // Зелёный гейт означает «разобранное не поехало», а не «всё сведено»: строка с
  // вердиктом `?` — это «никто не смотрел», и молчать о ней так же вредно, как
  // не видеть незарегистрированный канвас. Падением это не делаем — красный
  // тест, который никто не может починить, отключают в первый день; но долг
  // виден на каждом прогоне.
  const unread = selectedZones
    .map(([zoneId, zone]) => [
      zoneId,
      Object.values(zone.rows).filter((row) => row.v === '?').length,
    ])
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);
  if (unread.length) {
    const total = unread.reduce((sum, [, count]) => sum + count, 0);
    const top = unread
      .slice(0, 5)
      .map(([zoneId, count]) => `${zoneId} ${count}`)
      .join(' · ');
    console.log(
      `Без вердикта: ${total} строк в ${unread.length} зонах — ${top}${unread.length > 5 ? ' …' : ''}`,
    );
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli();
}
