import fs from 'fs';
import path from 'path';
import vm from 'vm';

import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(path.resolve(__dirname, '../heys_day_stats_v1.js'), 'utf8');
const testWindow = { HEYS: {} };
vm.runInNewContext(source, { window: testWindow });

describe('morning check-in reset from the morning-weight card', () => {
  it('clears only the check-in fields and preserves the rest of the selected day', () => {
    const reset = testWindow.HEYS.dayStats._test.resetMorningCheckinDay;
    const day = {
      date: '2026-07-25',
      weightMorning: 51.7,
      sleepStart: '03:00',
      sleepEnd: '09:10',
      sleepHours: 6.2,
      sleepQuality: 4,
      moodMorning: 7,
      meals: [{ id: 'meal-1' }],
      trainings: [{ id: 'training-1' }],
    };

    const result = reset(day, 123456);

    expect(result).toEqual({
      ...day,
      weightMorning: '',
      sleepStart: '',
      sleepEnd: '',
      sleepHours: '',
      sleepQuality: '',
      updatedAt: 123456,
    });
    expect(result.moodMorning).toBe(7);
    expect(result.meals).toEqual(day.meals);
    expect(result.trainings).toEqual(day.trainings);
  });
});
