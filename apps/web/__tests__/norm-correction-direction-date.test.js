import fs from 'node:fs';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const normSrc = fs.readFileSync(
  path.resolve(__dirname, '../heys_norm_correction_v1.js'),
  'utf8'
);
const curatorSrc = fs.readFileSync(
  path.resolve(__dirname, '../heys_curator_panel_v1.js'),
  'utf8'
);

const originalTz = process.env.TZ;
let NC;
let CP;

beforeAll(() => {
  process.env.TZ = 'Europe/Moscow';
});

afterAll(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

beforeEach(() => {
  window.HEYS = {};
  // eslint-disable-next-line no-eval
  (0, eval)(normSrc);
  // eslint-disable-next-line no-eval
  (0, eval)(curatorSrc);
  NC = window.HEYS.NormCorrection;
  CP = window.HEYS.CuratorPanel;
});

function increaseDecision(overrides = {}) {
  return {
    schemaVersion: 2,
    what: 'applied',
    by: 'curator',
    periodEnd: '2026-08-30',
    effectiveAt: '2026-09-01',
    previousFactor: 1,
    factor: 1.03,
    normBefore: 2112,
    normAfter: 2175,
    deficitPct: -12,
    evidence: { kind: 'unknown' },
    ...overrides
  };
}

describe('NC5 direction and local-date fail-closed contracts', () => {
  it('CuratorPanel keeps a Moscow post-midnight decision on the local calendar date', () => {
    const localTomorrow = new Date(2026, 8, 1, 0, 30);

    expect(localTomorrow.toISOString().slice(0, 10)).toBe('2026-08-31');
    expect(CP.localIsoDate(localTomorrow)).toBe('2026-09-01');
  });

  it('does not build an applied decrease snapshot from increasing factors and norms', () => {
    const snapshot = NC.buildDecisionSnapshot({
      result: { currentFactor: 1, nextFactor: 1.03 },
      card: {
        recommendation: {
          currentNorm: 2112,
          norm: 2175,
          deficitPct: -12
        }
      },
      periodEnd: '2026-08-30',
      effectiveAt: '2026-09-01',
      evidence: { kind: 'unknown' }
    });

    expect(snapshot).toBeNull();
  });

  it('does not discover an increasing history row as an applied decrease', () => {
    const discovered = NC.findAppliedDecision({
      weeks: [increaseDecision()],
      periodEnd: '2026-08-30',
      appliedAt: '2026-09-01T00:30:00+03:00',
      currentFactor: 1.03,
      now: new Date('2026-09-01T01:00:00+03:00')
    });

    expect(discovered).toBeNull();
  });

  it('never renders an increasing applied snapshot as the lowered frame', () => {
    const card = NC.buildWeeklySyncCard({
      result: {
        status: 'ready',
        direction: 'down',
        currentFactor: 1,
        nextFactor: 0.97,
        formulaPerDay: 2400,
        factPerDay: 2300
      },
      tariff: 'pro',
      appliedDecision: increaseDecision(),
      expenditure: 2400,
      deficitPct: -12,
      basalMetabolism: 1520
    });

    expect(card.frame).not.toBe('lowered');
  });
});
