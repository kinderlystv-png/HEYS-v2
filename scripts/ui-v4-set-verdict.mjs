#!/usr/bin/env node
// Ставит вердикт одной строке контракта v4.
//
//   node scripts/ui-v4-set-verdict.mjs <зона> "<ключ>" "<вердикт>" "<факт>"
//
// Меняет только `v` и `f`. Отпечаток `h` не трогает — он принадлежит тексту
// строки в канвасе, а не нашему мнению о ней. Если дизайнер текст правил,
// ui-v4-check-contract-drift.mjs скажет об этом, и тогда нужен пересчёт.
import fs from 'node:fs';

const P = 'docs/ui/ui-v4-contract-verdicts.json';
const VALID = new Set(['=', '≠', '?', '—']);
const [zone, key, verdict, ...fact] = process.argv.slice(2);

if (!zone || !key || !verdict) {
  console.error('Использование: node scripts/ui-v4-set-verdict.mjs <зона> "<ключ>" "<вердикт>" "<факт>"');
  console.error('Вердикты: = ≠ ? —');
  process.exit(1);
}
if (!VALID.has(verdict)) {
  console.error(`Вердикт «${verdict}» не из набора = ≠ ? —`);
  process.exit(1);
}

const raw = fs.readFileSync(P, 'utf8');
const nl = raw.includes('\r\n') ? '\r\n' : '\n';
const data = JSON.parse(raw);

const zoneData = data.zones[zone];
if (!zoneData) {
  console.error(`Зоны «${zone}» нет. Есть: ${Object.keys(data.zones).join(', ')}`);
  process.exit(1);
}
const row = zoneData.rows[key];
if (!row) {
  console.error(`Строки «${key}» в зоне «${zone}» нет.`);
  process.exit(1);
}

const was = row.v;
row.v = verdict;
if (fact.length) row.f = fact.join(' ');

let out = JSON.stringify(data, null, 2);
if (nl === '\r\n') out = out.replace(/\n/g, '\r\n');
fs.writeFileSync(P, out + nl);

console.log(`${zone} :: ${key}   ${was} → ${verdict}`);
