// verdict-writers-foreign-guard.test.js — class-level gate for ALL verdict JSON writers.
//
// Discovers scripts under scripts/ that write docs/ui/verdicts/*.json, injects
// foreign rows, runs each HIGH-risk writer, and asserts every non-scope row stays
// byte-identical (JSON.stringify per key).
//
// All owner lanes are guarded (HIGH tier must stay 0). Vacuity is covered by the
// wholesale-row-wipe helper test; HIGH batch asserts zero unguarded writers.

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
import { testVerdictWriterForeignGuard } from './helpers/verdict-writer-guard-runner.mjs';

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
  it('no HIGH-risk writers remain — every lane is GUARDED or SAFE', () => {
    // eslint-disable-next-line no-console
    console.log(
      `Discovered ${summary.total} writers — SAFE ${summary.byTier.SAFE || 0}, GUARDED ${summary.byTier.GUARDED || 0}, HIGH ${summary.byTier.HIGH || 0}`,
    );
    expect(summary.byTier.HIGH || 0).toBe(0);
    expect(summary.highRisk).toEqual([]);
  });
});
