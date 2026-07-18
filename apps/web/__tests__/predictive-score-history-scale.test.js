import fs from 'fs';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  path.resolve(__dirname, '../heys_predictive_insights_v1.js'),
  'utf8'
);
const originalHEYS = globalThis.HEYS;

describe('Predictive Insights score history scale', () => {
  beforeEach(() => {
    globalThis.window = globalThis;
    globalThis.HEYS = {};
    // eslint-disable-next-line no-eval
    eval(source);
  });

  afterEach(() => {
    globalThis.HEYS = originalHEYS;
  });

  it('emits stored and proxy history on one explicit 0-100 scale', () => {
    const history = globalThis.HEYS.PredictiveInsights.buildScoreHistory([
      { date: '2026-07-01', dayScore: 1 },
      { date: '2026-07-02', dayScore: 8 },
      { date: '2026-07-03', dayScoreRaw: 7.5, dayScore: 8 },
      { date: '2026-07-04', dayScore: 10 },
      { date: '2026-07-05', meals: [{}, {}, {}], sleepHours: 8, stressAvg: 4, weight: 70 },
    ]);

    expect(history.map((point) => point.score)).toEqual([10, 80, 75, 100, 100]);
    expect(history.every((point) => point.score >= 0 && point.score <= 100)).toBe(true);
  });

  it('does not reinterpret values outside the persisted 1-10 contract', () => {
    const history = globalThis.HEYS.PredictiveInsights.buildScoreHistory([
      { date: '2026-07-01', dayScoreRaw: 75, dayScore: 8 },
      { date: '2026-07-02', dayScore: 75 },
      { date: '2026-07-03', dayScore: 0 },
    ]);

    expect(history.map((point) => point.score)).toEqual([80, 50, 50]);
  });
});
