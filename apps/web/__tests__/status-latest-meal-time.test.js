import fs from 'fs';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const source = fs.readFileSync(path.resolve(__dirname, '../heys_status_v1.js'), 'utf8');
const originalHEYS = globalThis.HEYS;
const originalReact = globalThis.React;

function timingResult(meals) {
  const status = globalThis.HEYS.Status.calculateStatus({
    dayData: { date: '2026-07-01', meals },
  });
  return {
    score: status.factorScores.timing,
    details: status.factorDetails.timing,
  };
}

describe('Status latest valid meal time', () => {
  beforeEach(() => {
    globalThis.window = globalThis;
    globalThis.HEYS = {};
    globalThis.React = { createElement: () => null };
    // eslint-disable-next-line no-eval
    eval(source);
  });

  afterEach(() => {
    globalThis.HEYS = originalHEYS;
    globalThis.React = originalReact;
  });

  it('uses the latest valid clock time regardless of array order', () => {
    const meals = [
      { id: 'late', time: '23:05' },
      { id: 'invalid', time: '25:10' },
      { id: 'early', time: '09:30' },
      { id: 'middle', time: '21:15' },
    ];
    const expected = {
      score: 20,
      details: { value: '23:05', target: '20:00', unit: null, label: 'последний приём 23:05' },
    };

    expect(timingResult(meals)).toEqual(expected);
    expect(timingResult([meals[2], meals[3], meals[0], meals[1]])).toEqual(expected);
    expect(timingResult([meals[1], meals[0], meals[3], meals[2]])).toEqual(expected);
  });

  it('handles empty and invalid times explicitly as no data', () => {
    const expected = {
      score: 50,
      details: { value: null, target: null, unit: null, label: 'нет данных' },
    };

    expect(timingResult([])).toEqual(expected);
    expect(timingResult([{ time: '' }, { time: '9:7' }, { time: 'nope' }])).toEqual(expected);
  });
});
