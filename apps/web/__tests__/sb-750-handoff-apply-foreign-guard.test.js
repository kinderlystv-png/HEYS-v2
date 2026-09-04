// sb-750-handoff-apply-foreign-guard.test.js — class-level guard for handoff apply.
//
// Applying a handoff may ONLY change verdict rows whose keys are listed in that
// handoff. Every other row must stay byte-identical (JSON.stringify per key).
//
// State A exercises production scripts/.sb-750-verdict-batch-apply.mjs on a
// temp-swapped fixture copy (never commits strength-builder.json).
// State B exercises referenceScopedApply in the test helper to prove the guard
// assertions are not vacuous.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  collectForeignViolations,
  formatForeignViolations,
  loadHandoffKeys,
  referenceScopedApply,
  runPreFixBrokenApply,
  runProductionApplyOnFixture,
  simulateWholesaleRowWipe,
  snapshotForeignRowStrings,
} from './helpers/handoff-apply-foreign-guard.mjs';

const FIXTURE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/handoff-apply-guard');
const FIXTURE_ZONE = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'zone.json'), 'utf8'));
const FIXTURE_HANDOFF = path.join(FIXTURE_DIR, 'handoff.json');

function cloneZone(zone) {
  return JSON.parse(JSON.stringify(zone));
}

describe('handoff apply foreign-key guard', () => {
  describe('guard helper (vacuity check)', () => {
    it('detects wholesale wipe of foreign rows', () => {
      const zone = cloneZone(FIXTURE_ZONE);
      const handoffKeys = loadHandoffKeys(FIXTURE_HANDOFF);
      const beforeSnap = snapshotForeignRowStrings(zone.rows, handoffKeys);
      const wiped = simulateWholesaleRowWipe(zone, handoffKeys);
      const violations = collectForeignViolations(beforeSnap, wiped.rows);

      expect(violations.length).toBeGreaterThan(0);
      expect(violations.some((v) => v.kind === 'deleted')).toBe(true);
      expect(violations.map((v) => v.key)).toEqual(
        expect.arrayContaining(['foreign-one', 'Программа · цикл · 01']),
      );
    });
  });

  describe('State A — production .sb-750-verdict-batch-apply.mjs', () => {
    it('only handoff keys may change; every other row byte-identical', async () => {
      const zone = cloneZone(FIXTURE_ZONE);
      const { violations, applyError, handoffKeys, afterZone } = await runProductionApplyOnFixture(
        zone,
        FIXTURE_HANDOFF,
      );

      const alphaBefore = JSON.stringify(zone.rows['handoff-alpha']);
      const alphaAfter = JSON.stringify(afterZone.rows['handoff-alpha']);
      expect(alphaBefore).not.toBe(alphaAfter);

      const betaBefore = JSON.stringify(zone.rows['handoff-beta']);
      const betaAfter = JSON.stringify(afterZone.rows['handoff-beta']);
      expect(betaBefore).not.toBe(betaAfter);

      if (violations.length) {
        throw new Error(formatForeignViolations(violations));
      }
      if (applyError) {
        throw applyError;
      }

      expect(handoffKeys.has('handoff-alpha')).toBe(true);
      expect(handoffKeys.has('handoff-beta')).toBe(true);
      expect(Object.keys(afterZone.rows).length).toBe(Object.keys(zone.rows).length);
    });

    it('pre-fix wholesale wipe produces the guard failure message shape', () => {
      const zone = cloneZone(FIXTURE_ZONE);
      const handoffKeys = loadHandoffKeys(FIXTURE_HANDOFF);
      const beforeSnap = snapshotForeignRowStrings(zone.rows, handoffKeys);
      const broken = runPreFixBrokenApply(zone, FIXTURE_HANDOFF);
      const violations = collectForeignViolations(beforeSnap, broken.rows);
      const message = formatForeignViolations(violations);

      expect(violations).toHaveLength(6);
      expect(violations.every((v) => v.kind === 'deleted')).toBe(true);
      expect(message).toMatch(/6 foreign row violation/);
      expect(message).toContain('foreign-one: deleted');
      expect(message).toContain('Программа · цикл · 01: deleted');
    });
  });

  describe('State B — reference scoped apply', () => {
    it('only handoff keys may change; every other row byte-identical', async () => {
      const zone = cloneZone(FIXTURE_ZONE);
      const handoffKeys = loadHandoffKeys(FIXTURE_HANDOFF);
      const beforeSnap = snapshotForeignRowStrings(zone.rows, handoffKeys);

      await referenceScopedApply(zone, FIXTURE_HANDOFF);

      const violations = collectForeignViolations(beforeSnap, zone.rows);
      expect(violations, formatForeignViolations(violations)).toEqual([]);
      expect(JSON.stringify(zone.rows['handoff-alpha'])).toContain('Applied scoped fact for handoff-alpha');
      expect(JSON.stringify(zone.rows['handoff-beta'])).toContain('Applied scoped fact for handoff-beta');
    });

    it('handoff keys update while G1-cycle foreign block stays identical', async () => {
      const zone = cloneZone(FIXTURE_ZONE);
      const handoffKeys = loadHandoffKeys(FIXTURE_HANDOFF);
      const g1Keys = ['Программа · цикл · 01', 'Программа · цикл · 02', 'Программа · цикл · 03'];
      const g1Before = new Map(g1Keys.map((key) => [key, JSON.stringify(zone.rows[key])]));

      await referenceScopedApply(zone, FIXTURE_HANDOFF);

      for (const key of g1Keys) {
        expect(JSON.stringify(zone.rows[key])).toBe(g1Before.get(key));
        expect(handoffKeys.has(key)).toBe(false);
      }
    });
  });
});
