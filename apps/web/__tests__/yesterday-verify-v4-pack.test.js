import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const YESTERDAY_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_yesterday_verify_v1.js'), 'utf8');

const originalHEYS = window.HEYS;
const originalReact = window.React;
const originalDEV = window.DEV;
const CLIENT_ID = 'client-1';

function addDays(dateKey, delta) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day + delta);
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dayKey(date) {
  return `heys_${CLIENT_ID}_dayv2_${date}`;
}

function filledDay(date) {
  return {
    date,
    meals: [
      {
        items: [
          {
            id: `item-${date}`,
            product_id: `product-${date}`,
            grams: 100,
            kcal100: 2200,
            protein100: 100,
            carbs100: 200,
            fat100: 80,
          },
        ],
      },
    ],
  };
}

function emptyDay(date) {
  return { date, meals: [] };
}

function lowFoodDay(date) {
  return {
    date,
    meals: [
      {
        items: [
          {
            id: `item-${date}`,
            product_id: `product-${date}`,
            grams: 100,
            kcal100: 640,
            protein100: 20,
            carbs100: 40,
            fat100: 20,
          },
        ],
      },
    ],
  };
}

function loadYesterdayVerify() {
  window.HEYS.MorningCheckinUtils = {
    writeDayV2Scoped: (dateKey, dayData) => {
      localStorage.setItem(dayKey(dateKey), JSON.stringify(dayData));
      return true;
    },
  };
  // eslint-disable-next-line no-eval
  (0, eval)(YESTERDAY_SRC);
  return window.HEYS.YesterdayVerify;
}

describe('Yesterday verify v4 pack', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.HEYS = {
      currentClientId: CLIENT_ID,
      utils: { getCurrentClientId: () => CLIENT_ID },
      dayUtils: { todayISO: () => '2026-08-16' },
      StepModal: { registerStep: vi.fn() },
    };
    window.React = {};
    window.DEV = {};
    localStorage.setItem(`heys_${CLIENT_ID}_profile`, JSON.stringify({ firstName: 'Анна' }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.HEYS = originalHEYS;
    window.React = originalReact;
    window.DEV = originalDEV;
  });

  it('source has pack CTAs and empty-day guard', () => {
    expect(YESTERDAY_SRC).toContain('Оценить все по ощущениям');
    expect(YESTERDAY_SRC).toContain('Очистить ');
    expect(YESTERDAY_SRC).toContain('incompleteAction === \'estimated_fill\'');
    expect(YESTERDAY_SRC).toContain('isEmptyFoodDay');
  });

  it('isEmptyFoodDay is true only without meals and kcal', () => {
    const YesterdayVerify = loadYesterdayVerify();
    expect(YesterdayVerify.isEmptyFoodDay({ kcal: 0, mealCount: 0 })).toBe(true);
    expect(YesterdayVerify.isEmptyFoodDay({ kcal: 640, mealCount: 1 })).toBe(false);
    expect(YesterdayVerify.isEmptyFoodDay({ kcal: 0, mealCount: 1 })).toBe(false);
  });

  it('estimated_fill writes the around-norm mark to every pending day', () => {
    const YesterdayVerify = loadYesterdayVerify();
    const yesterday = YesterdayVerify.getYesterdayKey();
    const filled = addDays(yesterday, -3);
    const emptyA = addDays(yesterday, -2);
    const emptyB = addDays(yesterday, -1);
    localStorage.setItem(dayKey(filled), JSON.stringify(filledDay(filled)));
    localStorage.setItem(dayKey(emptyA), JSON.stringify(emptyDay(emptyA)));
    localStorage.setItem(dayKey(emptyB), JSON.stringify(emptyDay(emptyB)));
    localStorage.setItem(dayKey(yesterday), JSON.stringify(lowFoodDay(yesterday)));

    YesterdayVerify.save({ incompleteAction: 'estimated_fill' });

    const writtenEmpty = JSON.parse(localStorage.getItem(dayKey(emptyA)));
    const writtenFood = JSON.parse(localStorage.getItem(dayKey(yesterday)));
    expect(writtenEmpty.yesterdayVerifyAction).toBe('estimated_fill');
    expect(writtenEmpty.estimatedDayFill?.source).toBe('morning-checkin');
    expect(writtenFood.yesterdayVerifyAction).toBe('estimated_fill');
    expect(writtenFood.estimatedDayFill?.source).toBe('morning-checkin');
  });

  it('clear_day does not wipe a day that already has food', () => {
    const YesterdayVerify = loadYesterdayVerify();
    const yesterday = YesterdayVerify.getYesterdayKey();
    const filled = addDays(yesterday, -3);
    const emptyA = addDays(yesterday, -2);
    localStorage.setItem(dayKey(filled), JSON.stringify(filledDay(filled)));
    localStorage.setItem(dayKey(emptyA), JSON.stringify(emptyDay(emptyA)));
    localStorage.setItem(dayKey(yesterday), JSON.stringify(lowFoodDay(yesterday)));

    YesterdayVerify.save({ incompleteAction: 'clear_day' });

    const writtenEmpty = JSON.parse(localStorage.getItem(dayKey(emptyA)));
    const writtenFood = JSON.parse(localStorage.getItem(dayKey(yesterday)));
    expect(writtenEmpty.yesterdayVerifyAction).toBe('clear_day');
    expect(writtenFood.yesterdayVerifyAction).not.toBe('clear_day');
    expect(writtenFood.meals).toHaveLength(1);
  });

  it('clearedDateKeys can empty only the blank days while fill_later keeps the food day for tomorrow', () => {
    const YesterdayVerify = loadYesterdayVerify();
    const yesterday = YesterdayVerify.getYesterdayKey();
    const filled = addDays(yesterday, -3);
    const emptyA = addDays(yesterday, -2);
    localStorage.setItem(dayKey(filled), JSON.stringify(filledDay(filled)));
    localStorage.setItem(dayKey(emptyA), JSON.stringify(emptyDay(emptyA)));
    localStorage.setItem(dayKey(yesterday), JSON.stringify(lowFoodDay(yesterday)));

    YesterdayVerify.save({
      incompleteAction: 'fill_later',
      clearedDateKeys: [emptyA],
    });

    const writtenEmpty = JSON.parse(localStorage.getItem(dayKey(emptyA)));
    const writtenFood = JSON.parse(localStorage.getItem(dayKey(yesterday)));
    expect(writtenEmpty.yesterdayVerifyAction).toBe('clear_day');
    expect(writtenFood.yesterdayVerifyAction).toBe('fill_later');
    expect(writtenFood.meals).toHaveLength(1);
  });
});
