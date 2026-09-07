#!/usr/bin/env node
// Gate wrapper: ratchet baseline для «имя уехало» + scope/remainder.

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readAllZones } from './lib/ui-v4-verdicts.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const INNER = path.join(HERE, 'ui-v4-check-verdict-addresses.mjs');

// 08.09: checkin-morning «вес · 18» 7250→7351 (flex weight picker); hard 0, moved 17.
const BASELINE = Object.freeze({
  truncated: 0,
  missing: 0,
  beyond: 0,
  absent: 0,
  moved: 17,
});

function countScope() {
  let zones = 0;
  let rows = 0;
  let withEvidence = 0;
  for (const zone of Object.values(readAllZones().zones || {})) {
    zones += 1;
    for (const row of Object.values(zone?.rows || {})) {
      rows += 1;
      if (String(row?.f || '').trim()) withEvidence += 1;
    }
  }
  return { zones, rows, withEvidence };
}

function runInnerJson() {
  const result = spawnSync(process.execPath, [INNER, '--json'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !result.stdout) {
    console.error(result.stderr || 'ui-v4-check-verdict-addresses.mjs failed');
    process.exit(result.status || 1);
  }
  return JSON.parse(result.stdout);
}

function runCli() {
  const payload = runInnerJson();
  const problems = payload.problems;
  const scope = countScope();

  const counts = {
    truncated: problems.truncated.length,
    missing: problems.missing.length,
    beyond: problems.beyond.length,
    absent: problems.absent.length,
    moved: problems.moved.length,
  };

  const hard = counts.truncated + counts.missing + counts.beyond + counts.absent;
  const checked = payload.addressesChecked ?? 0;
  const multiSkipped = payload.rowsSeen - checked;

  console.log(
    `Адреса вердиктов: hard ${hard} (trunc ${counts.truncated} · missing ${counts.missing} · ` +
      `beyond ${counts.beyond} · absent ${counts.absent}), soft moved ${counts.moved}.`,
  );
  console.log(
    `Охват: ${scope.zones} зон, ${scope.rows} строк, ${scope.withEvidence} с доказательством; ` +
      `разрешимых адресов проверено ${checked}; ` +
      `вне точной проверки имён (multi-addr/shorthand): ${multiSkipped}.`,
  );

  const grew = Object.keys(BASELINE).filter((key) => counts[key] > BASELINE[key]);
  const shrank = Object.keys(BASELINE).filter((key) => counts[key] < BASELINE[key]);

  if (grew.length) {
    console.error('\n❌ Долг адресов вырос относительно заморозки gate:');
    for (const key of grew) {
      console.error(`  ${key}: было ${BASELINE[key]}, стало ${counts[key]}`);
    }
    process.exitCode = 1;
    return;
  }

  if (shrank.length) {
    console.log('\nДолг уменьшился — обновите BASELINE в ui-v4-check-verdict-addresses-gate.mjs:');
    for (const key of shrank) console.log(`  ${key}: ${BASELINE[key]} → ${counts[key]}`);
  }

  if (!grew.length) {
    console.log('Адреса в пределах заморозки gate: рост hard/moved не допускается.');
  }
}

runCli();
