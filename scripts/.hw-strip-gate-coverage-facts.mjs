#!/usr/bin/env node
/**
 * home-widgets: убрать протухшие числа охвата гейта из фактов «=» (путь б).
 * Вердикт не меняется — только текст факта. Одна запись файла зоны.
 */
import { readZone, writeZone, withZoneWriteLock } from './lib/ui-v4-verdicts.mjs';
import { snapshotForeignRowStrings, assertForeignRowsUnchanged } from './lib/handoff-batch-apply.mjs';

const ZONE = 'home-widgets';
const STALE_SUFFIX = / — разбор охвата 31 августа \(гейт читает \d+ из \d+ ссылающихся строк\)/g;
const COVERAGE_REF =
  ' Охват строк гейт называет сам — тест «гейт называет свой охват» в widgets-bd-sheet-canvas-razbor.test.js.';

export function rewriteGateCoverageFact(fact) {
  if (!STALE_SUFFIX.test(fact)) return null;
  STALE_SUFFIX.lastIndex = 0;
  const next = fact.replace(STALE_SUFFIX, `.${COVERAGE_REF}`);
  return next === fact ? null : next;
}

const dryRun = process.argv.includes('--dry-run');

const result = withZoneWriteLock(ZONE, () => {
  const zone = readZone(ZONE);
  if (!zone) throw new Error(`Зоны «${ZONE}» нет.`);

  let updated = 0;
  let skipped = 0;
  const sample = [];
  const scopeKeys = new Set();

  for (const [key, row] of Object.entries(zone.rows)) {
    if (row.v !== '=') {
      skipped += 1;
      continue;
    }
    const next = rewriteGateCoverageFact(row.f || '');
    if (!next) {
      skipped += 1;
      continue;
    }
    scopeKeys.add(key);
    if (sample.length < 2) sample.push({ key, was: row.f, now: next });
    row.f = next;
    updated += 1;
  }

  const foreignBefore = snapshotForeignRowStrings(zone.rows, scopeKeys);

  if (!dryRun && updated > 0) {
    writeZone(ZONE, zone);
    assertForeignRowsUnchanged(foreignBefore, readZone(ZONE).rows, scopeKeys);
  }

  return { dryRun, updated, skipped, sample };
});

console.log(JSON.stringify(result, null, 2));
