import fs from 'fs';
import path from 'path';

import { afterEach, describe, expect, it } from 'vitest';

const originalHEYS = global.HEYS;

function loadModule() {
  const srcPath = path.resolve(__dirname, '../heys_day_realdata_actions_v1.js');
  eval(fs.readFileSync(srcPath, 'utf8'));
}

describe('HEYS.DayRealDataActions', () => {
  afterEach(() => {
    global.HEYS = originalHEYS;
  });

  it('recommends clear_day for empty day under 30%', () => {
    global.HEYS = {};
    loadModule();
    const api = global.HEYS.DayRealDataActions;

    expect(api.getPreferredAction({ ratio: 0.2, mealCount: 0 })).toBe('clear_day');
  });

  it('recommends confirm_real_data when meals exist', () => {
    global.HEYS = {};
    loadModule();
    const api = global.HEYS.DayRealDataActions;

    expect(api.getPreferredAction({ ratio: 0.2, mealCount: 2 })).toBe('confirm_real_data');
  });

  it('shouldOfferConfirmation works for ratio 0.49 and meal day', () => {
    global.HEYS = {};
    loadModule();
    const api = global.HEYS.DayRealDataActions;

    expect(api.shouldOfferConfirmation({
      dateKey: '2026-04-11',
      isFuture: false,
      isToday: false,
      isFastingDay: false,
      isIncomplete: false,
      hasEstimatedFill: false,
      ratio: 0.49,
      eatenKcal: 600,
      mealCount: 2
    })).toBe(true);
  });

  it('shouldOfferConfirmation blocks estimated / ratio 0 / today cases', () => {
    global.HEYS = {};
    loadModule();
    const api = global.HEYS.DayRealDataActions;

    expect(api.shouldOfferConfirmation({
      dateKey: '2026-04-11',
      isFuture: false,
      isToday: false,
      isFastingDay: false,
      isIncomplete: false,
      hasEstimatedFill: true,
      ratio: 0.49,
      eatenKcal: 600,
      mealCount: 2
    })).toBe(false);

    expect(api.shouldOfferConfirmation({
      dateKey: '2026-04-11',
      isFuture: false,
      isToday: true,
      isFastingDay: false,
      isIncomplete: false,
      hasEstimatedFill: false,
      ratio: 0.49,
      eatenKcal: 600,
      mealCount: 2
    })).toBe(false);

    expect(api.shouldOfferConfirmation({
      dateKey: '2026-04-11',
      isFuture: false,
      isToday: false,
      isFastingDay: false,
      isIncomplete: false,
      hasEstimatedFill: false,
      ratio: 0,
      eatenKcal: 0,
      mealCount: 0
    })).toBe(false);
  });

  it('clear_day action clears meals and estimated fields', () => {
    global.HEYS = {};
    loadModule();
    const api = global.HEYS.DayRealDataActions;

    const day = {
      date: '2026-04-11',
      meals: [{ id: 'm1' }],
      isFastingDay: true,
      isIncomplete: false,
      savedEatenKcal: 1200,
      estimatedDayFill: { source: 'morning-checkin' }
    };

    const next = api.applyDayStatusAction(day, 'clear_day', { nowTs: 123 });
    expect(next.meals).toEqual([]);
    expect(next.isFastingDay).toBe(false);
    expect(next.isIncomplete).toBe(false);
    expect(next.savedEatenKcal).toBeUndefined();
    expect(next.estimatedDayFill).toBeUndefined();
    expect(next.updatedAt).toBe(123);
  });

  it('confirm_real_data keeps meals and marks fasting', () => {
    global.HEYS = {};
    loadModule();
    const api = global.HEYS.DayRealDataActions;

    const day = {
      date: '2026-04-11',
      meals: [{ id: 'm1' }],
      isFastingDay: false,
      isIncomplete: true,
      caloricDebt: 300,
      isRefeedDay: false
    };

    const next = api.applyDayStatusAction(day, 'confirm_real_data', { nowTs: 456 });
    expect(next.meals).toEqual([{ id: 'm1' }]);
    expect(next.isFastingDay).toBe(true);
    expect(next.isIncomplete).toBe(false);
    expect(next.caloricDebt).toBe(300);
    expect(next.isRefeedDay).toBe(false);
    expect(next.updatedAt).toBe(456);
  });
});
