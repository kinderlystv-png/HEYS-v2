#!/usr/bin/env node
// Gate wrapper: hard-дефекты адресов блокируют; moved — сверка, не блокирует.

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readAllZones } from './lib/ui-v4-verdicts.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const INNER = path.join(HERE, 'ui-v4-check-verdict-addresses.mjs');

const HARD_KEYS = ['truncated', 'missing', 'beyond', 'absent'];

// 08.09 freeze: hard 0; moved ~48 после параллельных CSS-сдвигов — warn-only.
const HARD_BASELINE = Object.freeze({
  truncated: 0,
  missing: 0,
  beyond: 0,
  absent: 0,
});
const MOVED_BASELINE = 0;
const MOVED_ALERT_FACTOR = 10;

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

  const hard = HARD_KEYS.reduce((sum, key) => sum + counts[key], 0);
  const checked = payload.addressesChecked ?? 0;
  const multiSkipped = payload.rowsSeen - checked;

  console.log(
    `Адреса вердиктов: hard ${hard} (trunc ${counts.truncated} · missing ${counts.missing} · ` +
      `beyond ${counts.beyond} · absent ${counts.absent}), moved ${counts.moved} (сверка, не блокирует).`,
  );
  console.log(
    `Охват: ${scope.zones} зон, ${scope.rows} строк, ${scope.withEvidence} с доказательством; ` +
      `разрешимых адресов проверено ${checked}; ` +
      `вне точной проверки имён (multi-addr/shorthand): ${multiSkipped}.`,
  );

  if (counts.moved > 0) {
    console.log(`\nСверка moved: ${counts.moved} — имя есть в файле, но уехало от указанной строки.`);
    const preview = problems.moved.slice(0, 5);
    for (const item of preview) {
      console.log(`  · ${item.zone || '?'} / ${item.key || '?'}: ${item.detail || item.reason || ''}`);
    }
    if (counts.moved > preview.length) {
      console.log(`  … ещё ${counts.moved - preview.length}; полный список: node scripts/ui-v4-check-verdict-addresses.mjs --list`);
    }
  }

  const movedAlertThreshold = Math.max(MOVED_ALERT_FACTOR, MOVED_BASELINE * MOVED_ALERT_FACTOR);
  if (counts.moved >= movedAlertThreshold && counts.moved > MOVED_BASELINE) {
    console.warn(
      `\n⚠️  moved вырос сильно: было ${MOVED_BASELINE}, стало ${counts.moved} ` +
        `(порог оповещения ${movedAlertThreshold}). Gate не блокирует — сверка для bookkeeping.`,
    );
  }

  const hardGrew = HARD_KEYS.filter((key) => counts[key] > HARD_BASELINE[key]);
  const hardShrank = HARD_KEYS.filter((key) => counts[key] < HARD_BASELINE[key]);

  if (hardGrew.length) {
    console.error('\n❌ Hard-дефекты адресов выросли относительно заморозки gate:');
    for (const key of hardGrew) {
      console.error(`  ${key}: было ${HARD_BASELINE[key]}, стало ${counts[key]}`);
    }
    process.exitCode = 1;
    return;
  }

  if (hardShrank.length) {
    console.log('\nHard-долг уменьшился — обновите HARD_BASELINE в ui-v4-check-verdict-addresses-gate.mjs:');
    for (const key of hardShrank) console.log(`  ${key}: ${HARD_BASELINE[key]} → ${counts[key]}`);
  }

  if (!hardGrew.length) {
    console.log('Hard-адреса в пределах заморозки gate: рост trunc/missing/beyond/absent не допускается.');
  }
}

runCli();
