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
    expect(YESTERDAY_SRC).toContain('packBulkCloseLabel');
    expect(YESTERDAY_SRC).toContain('Закрыть оба примерно');
    expect(YESTERDAY_SRC).toContain('openPackBulkForce');
    expect(YESTERDAY_SRC).toContain('openPackDay');
    expect(YESTERDAY_SRC).toContain('forceVisibleStepIds');
    expect(YESTERDAY_SRC).toContain('diagnosticPreview');
    expect(YESTERDAY_SRC).toContain('pack_days_resolved');
    expect(YESTERDAY_SRC).toContain('isEmptyFoodDay');
    expect(YESTERDAY_SRC).toContain('yv-v4-slider');
    expect(YESTERDAY_SRC).toContain('findPresetByPercent');
    expect(YESTERDAY_SRC).toContain('Насколько от нормы каждого дня');
  });

  it('findPresetByPercent highlights only exact preset percents', () => {
    const YesterdayVerify = loadYesterdayVerify();
    expect(YesterdayVerify.findPresetByPercent(110)?.id).toBe('around_norm');
    expect(YesterdayVerify.findPresetByPercent(130)).toBeNull();
    expect(YesterdayVerify.snapQuickFillSliderPercent(127)).toBe(125);
    expect(YesterdayVerify.snapQuickFillSliderPercent(128)).toBe(130);
  });

  it('slider track aligns 100% label with norm center and green band', () => {
    const YesterdayVerify = loadYesterdayVerify();
    expect(YesterdayVerify.quickFillSliderTrackPercent(50)).toBe(0);
    expect(YesterdayVerify.quickFillSliderTrackPercent(100)).toBeCloseTo(33.333, 2);
    expect(YesterdayVerify.quickFillSliderTrackPercent(200)).toBe(100);
    expect(YesterdayVerify.getQuickFillSliderFillTone(100)).toBe('norm');
    expect(YesterdayVerify.getQuickFillSliderFillTone(105)).toBe('norm');
    expect(YesterdayVerify.getQuickFillSliderFillTone(89)).toBe('under');
    expect(YesterdayVerify.getQuickFillSliderFillTone(111)).toBe('over');
    expect(YESTERDAY_SRC).toContain('yv-v4-slider-norm-zone');
    expect(YESTERDAY_SRC).toContain('yv-slider-tick--norm');
  });

  it('computePackDayCaption returns day index among unresolved keys', () => {
    const YesterdayVerify = loadYesterdayVerify();
    const keys = ['2026-08-10', '2026-08-11', '2026-08-12'];
    expect(YesterdayVerify.computePackDayCaption('2026-08-11', keys, [], [], {})).toBe('День 2 из 3');
    expect(YesterdayVerify.computePackDayCaption(
      '2026-08-12',
      keys,
      ['2026-08-10'],
      [],
      { '2026-08-11': { percent: 110 } }
    )).toBe('День 1 из 1');
  });

  it('packBulkCloseLabel and confirmAsWrittenLabel match canvas copy', () => {
    const YesterdayVerify = loadYesterdayVerify();
    expect(YesterdayVerify.packBulkCloseLabel(2)).toBe('Закрыть оба примерно');
    expect(YesterdayVerify.packBulkCloseLabel(5)).toBe('Закрыть все примерно');
    expect(YesterdayVerify.confirmAsWrittenLabel({ kcal: 640, mealCount: 1 })).toBe('Так и было · 640 ккал');
    expect(YesterdayVerify.confirmAsWrittenLabel({ kcal: 0, mealCount: 0 })).toBe('Так и было · ничего не ел');
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
    expect(writtenFood.meals).toHaveLength(2);
    expect(writtenFood.meals.some((meal) => meal.estimatedTopUp)).toBe(true);
    expect(writtenFood.estimatedDayFill?.mode).toBe('top-up');
  });

  it('confirmedDateKeys marks a day as real data without estimated fill', () => {
    const YesterdayVerify = loadYesterdayVerify();
    const yesterday = YesterdayVerify.getYesterdayKey();
    localStorage.setItem(dayKey(yesterday), JSON.stringify(lowFoodDay(yesterday)));

    YesterdayVerify.save({
      incompleteAction: 'pack_days_resolved',
      confirmedDateKeys: [yesterday],
    });

    const writtenFood = JSON.parse(localStorage.getItem(dayKey(yesterday)));
    expect(writtenFood.yesterdayVerifyAction).toBe('confirm_real_data');
    expect(writtenFood.estimatedDayFill).toBeUndefined();
    expect(writtenFood.meals).toHaveLength(1);
  });

  it('packBulkPreset applies chosen percent on bulk estimated_fill', () => {
    const YesterdayVerify = loadYesterdayVerify();
    const yesterday = YesterdayVerify.getYesterdayKey();
    const emptyA = addDays(yesterday, -1);
    localStorage.setItem(dayKey(emptyA), JSON.stringify(emptyDay(emptyA)));
    localStorage.setItem(dayKey(yesterday), JSON.stringify(emptyDay(yesterday)));

    YesterdayVerify.save({
      incompleteAction: 'estimated_fill',
      packBulkPreset: { presetId: 'under_norm', percent: 78 },
    });

    const writtenEmpty = JSON.parse(localStorage.getItem(dayKey(emptyA)));
    expect(writtenEmpty.estimatedDayFill?.percent).toBe(78);
    expect(writtenEmpty.estimatedDayFill?.presetId).toBe('under_norm');
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

  it('diagnostic preview save does not write day data', () => {
    const YesterdayVerify = loadYesterdayVerify();
    const yesterday = YesterdayVerify.getYesterdayKey();
    localStorage.setItem(dayKey(yesterday), JSON.stringify(lowFoodDay(yesterday)));

    const result = YesterdayVerify.save({
      diagnosticPreview: true,
      incompleteAction: 'estimated_fill',
      pendingDateKeys: YesterdayVerify.buildDiagnosticPreviewPendingDays().missingDays.map((day) => day.date),
    }, { diagnosticPreview: true });

    const writtenFood = JSON.parse(localStorage.getItem(dayKey(yesterday)));
    expect(result?.skipped).toBe(true);
    expect(writtenFood.yesterdayVerifyAction).toBeUndefined();
    expect(writtenFood.meals).toHaveLength(1);
  });

  it('diagnostic preview pending pack has four mixed days', () => {
    const YesterdayVerify = loadYesterdayVerify();
    const preview = YesterdayVerify.buildDiagnosticPreviewPendingDays();
    expect(preview.missingDays).toHaveLength(4);
    expect(preview.missingDays.filter((day) => day.mealCount === 0)).toHaveLength(2);
    expect(preview.missingDays.some((day) => day.kcal === 640)).toBe(true);
  });
});
