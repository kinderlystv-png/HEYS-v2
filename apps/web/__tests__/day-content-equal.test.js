import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

import { afterEach, describe, expect, it } from 'vitest';

const originalWindow = global.window;
const originalHEYS = global.HEYS;
const require = createRequire(import.meta.url);
const syncMerge = require('../../../yandex-cloud-functions/heys-api-rpc/lib/heys_sync_merge_v1.cjs');

function loadDayUtils() {
  global.window = global;
  global.localStorage = {
    _d: Object.create(null),
    getItem(k) {
      return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null;
    },
    setItem(k, v) {
      this._d[k] = String(v);
    },
    removeItem(k) {
      delete this._d[k];
    },
  };
  global.HEYS = { sync: syncMerge };
  const src = fs.readFileSync(path.resolve(__dirname, '../heys_day_utils.js'), 'utf8');
  eval(src);
}

describe('HEYS.dayUtils day content equality', () => {
  afterEach(() => {
    global.window = originalWindow;
    global.HEYS = originalHEYS;
  });

  it('isSameDayHydratedContent matches fingerprint without full JSON drift', () => {
    loadDayUtils();
    const { isSameDayHydratedContent } = global.HEYS.dayUtils;
    const meal = {
      id: 'm1',
      updatedAt: 1700000000001,
      grams: 120,
      kcal: 300,
      time: '12:30',
      name: 'Oats',
      items: [{ productId: 'p1', grams: 120, kcal: 300 }],
    };
    const prev = {
      date: '2026-04-24',
      meals: [meal],
      trainings: [],
      waterMl: 1,
      steps: 2,
      weightMorning: 3,
      isFastingDay: false,
      isIncomplete: false,
      moodMorning: 'ok',
      wellbeingMorning: 'ok',
      stressMorning: 'ok',
      moodAvg: '1',
      wellbeingAvg: '2',
      stressAvg: '3',
      dayScore: '4',
      dayScoreRaw: '5',
      dayScoreManual: '6',
      sleepStart: '23:00',
      sleepEnd: '07:00',
      sleepHours: 8,
      sleepQuality: 'good',
      updatedAt: 1,
    };
    const next = {
      ...prev,
      updatedAt: 999999,
      meals: [{ ...meal, meta: 'cloud-only' }],
    };
    expect(isSameDayHydratedContent(prev, next)).toBe(true);
  });

  it('isSameDayStorageMergeContent detects supplements change', () => {
    loadDayUtils();
    const { isSameDayStorageMergeContent } = global.HEYS.dayUtils;
    const base = {
      date: '2026-04-24',
      meals: [],
      trainings: [],
      supplementsPlanned: [{ id: 's1' }],
      supplementsTaken: [],
      householdActivities: [],
      waterMl: 0,
      steps: 0,
      weightMorning: 0,
      moodMorning: '',
      wellbeingMorning: '',
      stressMorning: '',
      sleepStart: '',
      sleepEnd: '',
      sleepHours: 0,
      sleepQuality: '',
      morningActivation: { status: 'x' },
      householdMin: 0,
    };
    const a = { ...base };
    const b = { ...base, supplementsPlanned: [{ id: 's2' }] };
    expect(isSameDayStorageMergeContent(a, b)).toBe(false);
  });

  it('mergeSubjectiveFieldsPreferFresh preserves a terminal activation from a stale-tab snapshot', () => {
    loadDayUtils();
    const { mergeSubjectiveFieldsPreferFresh } = global.HEYS.dayUtils;
    const snapshot = {
      date: '2026-07-20',
      updatedAt: 4000,
      _sourceId: 'stale-tab',
      moodMorning: 8,
      morningActivation: { copyId: 'ma-9' },
    };
    const freshLsDay = {
      date: '2026-07-20',
      updatedAt: 3000,
      _sourceId: 'active-tab',
      moodMorning: 7,
      morningActivation: {
        copyId: 'ma-9',
        status: 'missed',
        decidedAt: 2000,
        skipReasonId: 'low_energy',
        skipReasonPending: false,
        skipReasonCapturedAt: 2500,
      },
    };

    const merged = mergeSubjectiveFieldsPreferFresh(snapshot, freshLsDay);

    expect(merged.moodMorning).toBe(8);
    expect(merged.morningActivation).toMatchObject({
      status: 'missed',
      skipReasonId: 'low_energy',
      skipReasonPending: false,
    });
  });

  it('mergeSubjectiveFieldsPreferFresh keeps an explicit activation clear', () => {
    loadDayUtils();
    const { mergeSubjectiveFieldsPreferFresh } = global.HEYS.dayUtils;
    const snapshot = {
      morningActivation: {
        status: 'pending',
        clearedByUser: true,
        clearedAt: 3000,
      },
    };
    const freshLsDay = {
      morningActivation: {
        status: 'done',
        decidedAt: 2000,
        intensity: 'medium',
      },
    };

    expect(mergeSubjectiveFieldsPreferFresh(snapshot, freshLsDay).morningActivation).toMatchObject({
      status: 'pending',
      clearedByUser: true,
      clearedAt: 3000,
    });
  });
});
