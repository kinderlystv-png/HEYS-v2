import fs from 'fs';
import path from 'path';

import { afterAll, describe, expect, it } from 'vitest';

const originalWindow = global.window;
const originalHEYS = global.HEYS;
global.window = global;
global.HEYS = {};

const source = fs.readFileSync(path.resolve(__dirname, '../heys_hunger_energy_calibration_v1.js'), 'utf8');
eval(source);

const Calibration = global.HEYS.HungerEnergyCalibration;

afterAll(() => {
  global.window = originalWindow;
  global.HEYS = originalHEYS;
});

function row({ id, at, hunger = 6, action = 'delayWithCheck', outcome = 'calculated', lastMealAt = null, trace = [] }) {
  return {
    id,
    date: at.slice(0, 10),
    recordedAt: at,
    hungerLevel: hunger,
    outcome,
    context: { lastMealAt },
    decisionSnapshot: { suggestedAction: action },
    decisionTrace: trace
  };
}

describe('HungerEnergyCalibration offline evaluator', () => {
  it('combines explicit outcomes with conservative next-event inference', () => {
    const report = Calibration.evaluate([
      row({ id: 'delay', at: '2026-07-01T10:00:00Z', hunger: 8 }),
      row({ id: 'food', at: '2026-07-01T11:00:00Z', hunger: 5, action: 'riskBrakeMeal', outcome: 'ate_calmly' })
    ]);

    expect(report.decisionCount).toBe(2);
    expect(report.ratedOutcomeCount).toBe(2);
    expect(report.explicitOutcomeCount).toBe(1);
    expect(report.inferredOutcomeCount).toBe(1);
    expect(report.actionFamilies.delay.success).toBe(1);
    expect(report.actionFamilies.food.success).toBe(1);
  });

  it('infers a food outcome only when a meal is recorded between assessments', () => {
    const withMeal = Calibration.evaluate([
      row({ id: 'food', at: '2026-07-01T10:00:00Z', hunger: 8, action: 'riskBrakeMeal' }),
      row({ id: 'next', at: '2026-07-01T11:00:00Z', hunger: 5, lastMealAt: '2026-07-01T10:20:00Z' })
    ]);
    const withoutMeal = Calibration.evaluate([
      row({ id: 'food', at: '2026-07-01T10:00:00Z', hunger: 8, action: 'riskBrakeMeal' }),
      row({ id: 'next', at: '2026-07-01T11:00:00Z', hunger: 5 })
    ]);

    expect(withMeal.inferredOutcomeCount).toBe(1);
    expect(withMeal.actionFamilies.food.success).toBe(1);
    expect(withoutMeal.ratedOutcomeCount).toBe(0);
  });

  it('flags permissive delay thresholds only after the minimum sample', () => {
    const rows = Array.from({ length: 6 }, (_, index) => row({
      id: 'delay-' + index,
      at: `2026-07-0${(index % 3) + 1}T1${index}:00:00Z`,
      outcome: 'hunger_grew'
    }));
    const report = Calibration.evaluate(rows);

    expect(report.actionFamilies.delay.underSupportRate).toBe(1);
    expect(report.flags).toContainEqual(expect.objectContaining({ id: 'delay_threshold_too_permissive' }));
  });

  it('treats overeating after a delay recommendation as under-support', () => {
    expect(Calibration.classifyOutcome('overeating', 'delay')).toBe('under_support');
    expect(Calibration.classifyOutcome('overeating', 'food')).toBe('over_support');
  });

  it('does not flag an action family from a single-day burst', () => {
    const rows = Array.from({ length: 6 }, (_, index) => row({
      id: 'same-day-' + index,
      at: `2026-07-01T1${index}:00:00Z`,
      outcome: 'hunger_grew'
    }));
    const report = Calibration.evaluate(rows);

    expect(report.actionFamilies.delay.days).toBe(1);
    expect(report.flags).not.toContainEqual(expect.objectContaining({ id: 'delay_threshold_too_permissive' }));
  });

  it('marks a repeatedly contradicted positive factor as a review candidate', () => {
    const trace = [{ factor: 'hungerRising', label: 'голод растёт', activeDriver: true, riskDelta: 8, foodDelta: 8 }];
    const rows = Array.from({ length: 6 }, (_, index) => row({
      id: 'wait-' + index,
      at: `2026-07-0${(index % 3) + 1}T1${index}:00:00Z`,
      outcome: 'hunger_passed',
      trace
    }));
    const report = Calibration.evaluate(rows);
    const factor = report.factorDiagnostics.find((item) => item.factor === 'hungerRising');

    expect(factor).toMatchObject({ direction: 'overweighted', confidence: 'medium', sampleSize: 6 });
    expect(report.flags).toContainEqual(expect.objectContaining({ id: 'factor_hungerRising', direction: 'overweighted' }));
  });

  it('never changes production weights automatically', () => {
    const report = Calibration.evaluate([]);

    expect(report.status).toBe('collecting');
    expect(report.autoAdjustmentAllowed).toBe(false);
  });

  it('marks the overall report ready only after 12 outcomes across 5 days', () => {
    const rows = Array.from({ length: 12 }, (_, index) => row({
      id: 'ready-' + index,
      at: `2026-07-${String((index % 5) + 1).padStart(2, '0')}T${String(8 + index).padStart(2, '0')}:00:00Z`,
      outcome: 'hunger_passed'
    }));
    const report = Calibration.evaluate(rows);

    expect(report).toMatchObject({ status: 'ready', ratedOutcomeCount: 12, outcomeDays: 5 });
  });
});
