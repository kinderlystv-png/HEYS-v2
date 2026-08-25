#!/usr/bin/env node
// apply-verdict.mjs — перенос вердикта в ui-v4-contract-verdicts.json с отпечатком с живого канваса.
//
// Использование:
//   node scratchpad/verdicts/apply-verdict.mjs --zone cycle --key "фича" --verdict ≠ --fact "heys_cycle_v1.js:1"
//   node scratchpad/verdicts/apply-verdict.mjs --zone cycle --batch scratchpad/verdicts/cycle-verdicts-batch.json
//   node scratchpad/verdicts/apply-verdict.mjs --init-zone cycle --canvas cycle.v4.dc.html [--recorded 2026-08-26]
//
// Хеши считаются только из data-v на диске — руками h не править.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
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
  const rows = new Map();
  for (const m of slice.matchAll(/<div class="spec"[^>]*><b>([^<]+)<\/b><span data-v="([^"]*)"/g)) {
    rows.set(m[1], m[2]);
  }
  return { rows };
}

function readVerdicts() {
  return JSON.parse(fs.readFileSync(VERDICTS, 'utf8'));
}

function writeVerdicts(data) {
  fs.writeFileSync(VERDICTS, `${JSON.stringify(data, null, 2)}\n`);
}

function parseArgs(argv) {
  const out = { initZone: null, zone: null, key: null, verdict: null, fact: null, batch: null, recorded: '2026-08-26', canvas: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--init-zone') out.initZone = argv[++i];
    else if (a === '--zone') out.zone = argv[++i];
    else if (a === '--key') out.key = argv[++i];
    else if (a === '--verdict') out.verdict = argv[++i];
    else if (a === '--fact') out.fact = argv[++i];
    else if (a === '--batch') out.batch = argv[++i];
    else if (a === '--recorded') out.recorded = argv[++i];
    else if (a === '--canvas') out.canvas = argv[++i];
  }
  return out;
}

function ensureZone(data, zoneId, canvasFile, recorded) {
  if (!data.zones[zoneId]) {
    data.zones[zoneId] = {
      canvas: canvasFile,
      contractOnly: false,
      recorded,
      rows: {},
    };
  }
  return data.zones[zoneId];
}

function applyOne(data, zoneId, key, verdict, fact) {
  const zone = data.zones[zoneId];
  if (!zone) throw new Error(`Зона «${zoneId}» не заведена. Сначала --init-zone.`);
  const html = fs.readFileSync(path.join(PACK, zone.canvas), 'utf8');
  const { rows, error } = contractRows(html, zone.contractOnly);
  if (error) throw new Error(`${zoneId}: ${error}`);
  const value = rows.get(key);
  if (value === undefined) throw new Error(`${zoneId}: ключ «${key}» не найден в контракте`);
  zone.rows[key] = { v: verdict, f: fact, h: hash(value) };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const data = readVerdicts();

  if (args.initZone) {
    const canvas = args.canvas || `${args.initZone}.v4.dc.html`;
    ensureZone(data, args.initZone, canvas, args.recorded);
    writeVerdicts(data);
    console.log(`Зона «${args.initZone}» заведена (${canvas}).`);
    return;
  }

  if (args.batch) {
    const batchPath = path.isAbsolute(args.batch) ? args.batch : path.join(ROOT, args.batch);
    const batch = JSON.parse(fs.readFileSync(batchPath, 'utf8'));
    const zoneId = args.zone || batch.zone;
    if (!zoneId) throw new Error('Укажите --zone или batch.zone');
    if (batch.canvas) ensureZone(data, zoneId, batch.canvas, batch.recorded || args.recorded);
    else ensureZone(data, zoneId, `${zoneId}.v4.dc.html`, args.recorded);
    const items = batch.rows || batch.verdicts || batch;
    for (const item of items) {
      applyOne(data, zoneId, item.key, item.v ?? item.verdict, item.f ?? item.fact);
    }
    writeVerdicts(data);
    console.log(`${zoneId}: применено ${items.length} вердиктов.`);
    return;
  }

  if (!args.zone || !args.key || args.verdict == null || !args.fact) {
    console.error('Нужно: --zone --key --verdict --fact  или  --batch  или  --init-zone');
    process.exit(1);
  }
  ensureZone(data, args.zone, args.canvas || `${args.zone}.v4.dc.html`, args.recorded);
  applyOne(data, args.zone, args.key, args.verdict, args.fact);
  writeVerdicts(data);
  console.log(`${args.zone} «${args.key}» → ${args.verdict}`);
}

main();
