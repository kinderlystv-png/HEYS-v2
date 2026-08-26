#!/usr/bin/env node
// ui-v4-set-verdict.mjs — ставит вердикт по строке контракта (v и f), h не трогает.
//
// Использование:
//   node scripts/ui-v4-set-verdict.mjs <зона> "<ключ>" "<вердикт>" "<факт>"

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERDICTS = path.join(ROOT, 'docs/ui/ui-v4-contract-verdicts.json');

const [zoneId, key, verdict, fact] = process.argv.slice(2);

if (!zoneId || !key || !verdict || !fact) {
  console.error('Использование: node scripts/ui-v4-set-verdict.mjs <зона> "<ключ>" "<вердикт>" "<факт>"');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(VERDICTS, 'utf8'));
const zone = data.zones?.[zoneId];
if (!zone) {
  console.error(`Неизвестная зона: ${zoneId}`);
  process.exit(1);
}

if (!zone.rows[key]) {
  zone.rows[key] = { v: verdict, f: fact };
} else {
  zone.rows[key].v = verdict;
  zone.rows[key].f = fact;
}

fs.writeFileSync(VERDICTS, `${JSON.stringify(data, null, 2)}\n`);
console.log(`${zoneId} · ${key} → ${verdict}`);
