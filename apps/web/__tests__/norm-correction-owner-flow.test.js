import fs from 'node:fs';
import path from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

const src = fs.readFileSync(
  path.resolve(__dirname, '../heys_norm_correction_v1.js'),
  'utf8'
);

let NC;

beforeEach(() => {
  window.HEYS = {};
  // eslint-disable-next-line no-eval
  (0, eval)(src);
  NC = window.HEYS.NormCorrection;
});

function loggedDays(n, kcal) {
  return Array.from({ length: n }, () => ({
    kcal,
    isLogged: true,
    isIncomplete: false
  }));
}

function nextWeekResult() {
  return NC.compute({
    days: loggedDays(21, 2112),
    formulaPerDay: 2400,
    trend: { deltaKg: -0.267, measuredDays: 21, windowDays: 21 },
    currentFactor: 0.97,
    historyDays: 60
  });
}

function appliedDecision(overrides = {}) {
  return {
    schemaVersion: 2,
    what: 'applied',
    by: 'curator',
    periodEnd: '2026-08-30',
    effectiveAt: '2026-08-31',
    previousFactor: 1,
    factor: 0.97,
    normBefore: 2112,
    normAfter: 2049,
    deficitPct: -12,
    evidence: { kind: 'stable_girths' },
    ...overrides
  };
}

function findDecision(row, overrides = {}) {
  return NC.findAppliedDecision({
    weeks: [row],
    periodEnd: '2026-08-30',
    appliedAt: '2026-08-31T00:00:00.000Z',
    currentFactor: 0.97,
    now: new Date('2026-08-31T09:00:00.000Z'),
    ...overrides
  });
}

describe('NC5 · решение владельца и применённый снимок', () => {
  it('до effectiveAt не объявляет решение применённым, после — показывает lowered', () => {
    const row = appliedDecision();
    const before = findDecision(row, {
      now: new Date('2026-08-30T23:59:59.999Z')
    });
    const after = findDecision(row);

    expect(before).toBeNull();
    expect(after).toEqual(row);

    const result = nextWeekResult();
    expect(result.nextFactor).toBe(0.94);
    expect(NC.buildWeeklySyncCard({
      result,
      tariff: 'pro',
      appliedDecision: before,
      expenditure: 2400,
      deficitPct: -12,
      basalMetabolism: 1520
    }).frame).toBe('pending_curator');
    expect(NC.buildWeeklySyncCard({
      result,
      tariff: 'pro',
      appliedDecision: after,
      expenditure: 2400,
      deficitPct: -12,
      basalMetabolism: 1520
    }).frame).toBe('lowered');
  });

  it('не пересчитывает уже применённые 2 049 / −63 из нового предложения ×0,94', () => {
    const result = nextWeekResult();
    const decision = findDecision(appliedDecision());
    const card = NC.buildWeeklySyncCard({
      result,
      tariff: 'pro',
      appliedDecision: decision,
      expenditure: 2400,
      deficitPct: -12,
      basalMetabolism: 1520
    });

    expect(result.currentFactor).toBe(0.97);
    expect(result.nextFactor).toBe(0.94);
    expect(card.frame).toBe('lowered');
    expect(card.norms).toMatchObject({
      current: 2112,
      next: 2049,
      deltaKcal: -63
    });
    expect(card.copy.heroCaption).toBe('−63\u00a0ккал');
  });

  it('fail-closed отвергает решение не от этого периода или не от текущего factor', () => {
    const row = appliedDecision();

    expect(findDecision(row, { periodEnd: '2026-09-06' })).toBeNull();
    expect(findDecision(row, { currentFactor: 0.94 })).toBeNull();
    expect(findDecision(appliedDecision({ periodEnd: '2026-08-23' }))).toBeNull();
    expect(findDecision(appliedDecision({ factor: 0.94 }))).toBeNull();
  });

  it('точный текст про стабильные обхваты разрешает только evidence.kind stable_girths', () => {
    const exactStableBody = 'Три недели вес и обхваты держатся на месте. Значит, наш расчёт расхода для вас завышен — мы поправили его, а не вас.';
    const result = nextWeekResult();
    const cardFor = (kind) => NC.buildWeeklySyncCard({
      result,
      tariff: 'pro',
      appliedDecision: findDecision(appliedDecision({ evidence: { kind } })),
      expenditure: 2400,
      deficitPct: -12,
      basalMetabolism: 1520
    });

    expect(cardFor('stable_girths').copy.body).toBe(exactStableBody);

    for (const kind of ['missing', 'waist_only', 'insufficient', 'unknown', 'error']) {
      const body = cardFor(kind).copy.body;
      expect(body).not.toBe(exactStableBody);
      expect(body).not.toContain('вес и обхваты держатся на месте');
    }
  });
});
