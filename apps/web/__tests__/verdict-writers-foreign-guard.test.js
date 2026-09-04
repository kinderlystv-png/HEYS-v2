// verdict-writers-foreign-guard.test.js — class-level gate for ALL verdict JSON writers.
//
// Discovers scripts under scripts/ that write docs/ui/verdicts/*.json, injects
// foreign rows, runs each HIGH-risk writer, and asserts every non-scope row stays
// byte-identical (JSON.stringify per key).
//
// Until owner lanes add per-key guards, the gate must catch ≥1 broken script
// (vacuity check) and name failing scripts explicitly.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  collectForeignViolations,
  formatForeignViolations,
  ROOT,
  runProductionApplyOnFixture,
  simulateWholesaleRowWipe,
  snapshotForeignRowStrings,
} from './helpers/handoff-apply-foreign-guard.mjs';
import {
  discoverVerdictWriters,
  summarizeDiscovery,
} from './helpers/verdict-writer-discovery.mjs';
import {
  formatGuardReport,
  runAllWriterGuards,
  testVerdictWriterForeignGuard,
} from './helpers/verdict-writer-guard-runner.mjs';

const FIXTURE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/handoff-apply-guard');
const FIXTURE_ZONE = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'zone.json'), 'utf8'));
const FIXTURE_HANDOFF = path.join(FIXTURE_DIR, 'handoff.json');

const SCRIPTS_DIR = path.join(ROOT, 'scripts');
const allWriters = discoverVerdictWriters(SCRIPTS_DIR);
const summary = summarizeDiscovery(allWriters);

describe('verdict writers foreign-key guard (discovery)', () => {
  it('discovers verdict JSON writers under scripts/', () => {
    expect(allWriters.length).toBeGreaterThan(20);
    expect(summary.highRisk.length + summary.guarded.length + summary.safe.length).toBe(allWriters.length);
    // eslint-disable-next-line no-console
    console.log(
      `Discovered ${summary.total} writers — SAFE ${summary.byTier.SAFE || 0}, GUARDED ${summary.byTier.GUARDED || 0}, HIGH ${summary.byTier.HIGH || 0}`,
    );
  });

  it('vacuity: wholesale row wipe is detected by guard helper', () => {
    const zone = JSON.parse(JSON.stringify(FIXTURE_ZONE));
    const handoffKeys = new Set(['handoff-alpha', 'handoff-beta']);
    const beforeSnap = snapshotForeignRowStrings(zone.rows, handoffKeys);
    const wiped = simulateWholesaleRowWipe(zone, handoffKeys);
    const violations = collectForeignViolations(beforeSnap, wiped.rows);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some((v) => v.kind === 'deleted')).toBe(true);
  });
});

describe('verdict writers foreign-key guard (safe references)', () => {
  it('ui-v4-set-verdict.mjs — only named key may change', async () => {
    const safeWriter = allWriters.find((w) => w.basename === 'ui-v4-set-verdict.mjs');
    expect(safeWriter).toBeTruthy();
    const result = await testVerdictWriterForeignGuard(ROOT, safeWriter);
    expect(result.status, result.detail).toBe('pass');
  });

  it('.sb-750-verdict-batch-apply.mjs — GUARDED handoff apply on fixture', async () => {
    const zone = JSON.parse(JSON.stringify(FIXTURE_ZONE));
    const { violations, applyError } = await runProductionApplyOnFixture(zone, FIXTURE_HANDOFF);
    if (violations.length) throw new Error(formatForeignViolations(violations));
    if (applyError) throw applyError;
    expect(violations).toEqual([]);
  });
});

describe('verdict writers foreign-key guard (HIGH-risk batch)', () => {
  it('each HIGH-risk writer preserves injected foreign rows or is named on failure', async () => {
    const targets = summary.highRisk;
    expect(targets.length).toBeGreaterThan(10);

    const results = await runAllWriterGuards(ROOT, targets);
    const report = formatGuardReport(results);

    // eslint-disable-next-line no-console
    console.log('\n=== Verdict writer foreign guard report ===');
    // eslint-disable-next-line no-console
    console.log(`Discovery total: ${summary.total} (user seed ~36 HIGH-risk lanes)`);
    // eslint-disable-next-line no-console
    console.log(report.text);

    const failed = results.filter((r) => r.status === 'fail');

    // Vacuity: gate must catch broken writers while lanes are unfixed.
    expect(
      failed.length,
      'guard must fail on ≥1 unfixed script (vacuity — if zero failures, guard is blind)',
    ).toBeGreaterThanOrEqual(1);

    if (failed.length) {
      const lines = failed.map((r) => `  ${r.writer.relPath}\n    ${r.detail}`);
      throw new Error(
        `${failed.length} verdict writer(s) touch foreign rows outside scope:\n${lines.join('\n')}`,
      );
    }
  }, 600_000);
});
