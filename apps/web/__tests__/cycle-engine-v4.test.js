/**
 * @fileoverview v4 cycle engine — multipliers, count day, trend exclusion, wiring hooks
 */

import fs from 'fs';
import path from 'path';

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const originalWindow = global.window;
const originalHEYS = global.HEYS;
const originalLocalStorage = global.localStorage;

const dayStore = new Map();

function mockLsGet(key, fallback = null) {
  return dayStore.has(key) ? dayStore.get(key) : fallback;
}

function seedDay(dateStr, payload) {
  const clientId = 'test-client-00000000-0000-0000-0000-000000000001';
  dayStore.set(`heys_${clientId}_dayv2_${dateStr}`, { date: dateStr, ...payload });
}

global.HEYS = {
  utils: { lsGet: mockLsGet },
  currentClientId: 'test-client-00000000-0000-0000-0000-000000000001',
  store: null,
  healthFeatures: { isCycleFeatureAvailable: () => true }
};

global.window = global;
global.localStorage = {
  getItem: (key) => (dayStore.has(key) ? JSON.stringify(dayStore.get(key)) : null),
  setItem: (key, val) => {
    try { dayStore.set(key, JSON.parse(val)); } catch { dayStore.set(key, val); }
  }
};

const filePath = path.resolve(__dirname, '../heys_cycle_v1.js');
eval(fs.readFileSync(filePath, 'utf8'));

describe('Cycle engine v4 (contract multipliers)', () => {
  const Cycle = global.HEYS.Cycle;

  beforeEach(() => {
    dayStore.clear();
  });

  describe('1. Kcal multipliers (data-v)', () => {
    it('days 1–14 → 0%', () => {
      expect(Cycle.getKcalMultiplier(1)).toBe(1.0);
      expect(Cycle.getKcalMultiplier(14)).toBe(1.0);
    });

    it('days 15–19 → +3%', () => {
      expect(Cycle.getKcalMultiplier(15)).toBe(1.03);
      expect(Cycle.getKcalMultiplier(19)).toBe(1.03);
    });

    it('days 20–28 → +5%', () => {
      expect(Cycle.getKcalMultiplier(20)).toBe(1.05);
      expect(Cycle.getKcalMultiplier(28)).toBe(1.05);
    });

    it('average ≈ 2.14%', () => {
      const avg = Cycle.getAverageKcalMultiplier();
      expect(avg).toBeCloseTo(1.0214, 3);
    });
  });

  describe('2. Water multipliers (data-v)', () => {
    it('days 1–5 → +10%', () => {
      expect(Cycle.getWaterMultiplier(1)).toBe(1.10);
      expect(Cycle.getWaterMultiplier(5)).toBe(1.10);
    });

    it('days 20–28 → +5%', () => {
      expect(Cycle.getWaterMultiplier(20)).toBe(1.05);
      expect(Cycle.getWaterMultiplier(28)).toBe(1.05);
    });

    it('days 6–19 → 0%', () => {
      expect(Cycle.getWaterMultiplier(6)).toBe(1.0);
      expect(Cycle.getWaterMultiplier(19)).toBe(1.0);
    });
  });

  describe('3. Insulin wave (data-v)', () => {
    it('days 20–28 → +12%', () => {
      expect(Cycle.getInsulinWaveMultiplier(20)).toBe(1.12);
      expect(Cycle.getInsulinWaveMultiplier(28)).toBe(1.12);
    });

    it('other days → 0%', () => {
      expect(Cycle.getInsulinWaveMultiplier(1)).toBe(1.0);
      expect(Cycle.getInsulinWaveMultiplier(19)).toBe(1.0);
    });
  });

  describe('4. Weight trend exclusion (26–28 + 1–5)', () => {
    it('excludes contract window days', () => {
      [1, 2, 3, 4, 5, 26, 27, 28].forEach((d) => {
        expect(Cycle.shouldExcludeFromWeightTrend(d)).toBe(true);
      });
    });

    it('includes mid-cycle days', () => {
      [6, 10, 15, 20, 25].forEach((d) => {
        expect(Cycle.shouldExcludeFromWeightTrend(d)).toBe(false);
      });
    });

    it('day 7 no longer excluded (was legacy 1–7)', () => {
      expect(Cycle.shouldExcludeFromWeightTrend(7)).toBe(false);
    });
  });

  describe('5. Phase count day auto-advance', () => {
    it('derives count from day-1 mark through silent days 8+', () => {
      seedDay('2026-08-01', { cycleDay: 1 });
      seedDay('2026-08-07', { cycleDay: 7 });
      expect(Cycle.getCycleCountDay('2026-08-01', mockLsGet)).toBe(1);
      expect(Cycle.getCycleCountDay('2026-08-08', mockLsGet)).toBe(8);
      expect(Cycle.getCycleCountDay('2026-08-20', mockLsGet)).toBe(20);
    });

    it('returns null after day 29', () => {
      seedDay('2026-07-01', { cycleDay: 1 });
      expect(Cycle.getCycleCountDay('2026-07-30', mockLsGet)).toBeNull();
    });

    it('resolveCycleCountDay falls back to mark 1–7 without date store', () => {
      expect(Cycle.resolveCycleCountDay({ cycleDay: 3 })).toBe(3);
    });
  });

  describe('6. Phases and labels', () => {
    it('maps day 18 to early luteal', () => {
      expect(Cycle.getCyclePhase(18).id).toBe('early_luteal');
    });

    it('maps day 22 to late luteal', () => {
      expect(Cycle.getCyclePhase(22).id).toBe('late_luteal');
    });

    it('period week labels 1–7', () => {
      expect(Cycle.getPeriodWeekLabel(2)).toBe('начало');
      expect(Cycle.getPeriodWeekLabel(4)).toBe('середина');
      expect(Cycle.getPeriodWeekLabel(6)).toBe('конец');
    });
  });
});

describe('Cycle wiring hooks (source contracts)', () => {
  it('TDEE source uses resolveCycleCountDay', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../heys_tdee_v1.js'), 'utf8');
    expect(src).toContain('resolveCycleCountDay');
    expect(src).toContain('getKcalMultiplier');
  });

  it('water state uses resolveCycleCountDay', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../heys_day_water_state.js'), 'utf8');
    expect(src).toContain('resolveCycleCountDay');
    expect(src).toContain('getWaterMultiplier');
  });

  it('insulin calc uses resolveCycleCountDay', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../heys_iw_calc.js'), 'utf8');
    expect(src).toContain('resolveCycleCountDay');
    expect(src).toContain('getInsulinWaveMultiplier');
  });

  it('weight trends uses count day for exclusion', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../heys_day_weight_trends_v1.js'), 'utf8');
    expect(src).toContain('resolveCycleCountDay');
    expect(src).toContain('shouldExcludeFromWeightTrend');
  });
});

afterAll(() => {
  global.window = originalWindow;
  global.HEYS = originalHEYS;
  global.localStorage = originalLocalStorage;
});
