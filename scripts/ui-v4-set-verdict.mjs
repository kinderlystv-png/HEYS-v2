#!/usr/bin/env node
// Ставит вердикт одной строке контракта v4.
//
//   node scripts/ui-v4-set-verdict.mjs <зона> "<ключ>" "<вердикт>" "<факт>"
//
// Меняет только `v` и `f`. Отпечаток `h` не трогает — он принадлежит тексту
// строки в канвасе, а не нашему мнению о ней. Если дизайнер текст правил,
// ui-v4-check-contract-drift.mjs скажет об этом, и тогда нужен пересчёт.
import { readZone, writeZone, listZoneIds } from './lib/ui-v4-verdicts.mjs';

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

const zoneData = readZone(zone);
if (!zoneData) {
  console.error(`Зоны «${zone}» нет. Есть: ${listZoneIds().join(', ')}`);
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

writeZone(zone, zoneData);

console.log(`${zone} :: ${key}   ${was} → ${verdict}`);
