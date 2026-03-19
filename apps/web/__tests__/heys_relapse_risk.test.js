import { beforeAll, describe, expect, it } from 'vitest';

beforeAll(async () => {
  global.window = global;
  global.HEYS = global.HEYS || {};
  global.HEYS.dayUtils = global.HEYS.dayUtils || {};

  global.HEYS.dayUtils.getTotalSleepHours = function getTotalSleepHours(dayData) {
    return Number(dayData?.sleepHours || 0);
  };

  global.HEYS.dayUtils.sleepHours = function sleepHours(start, end) {
    if (!start || !end) return 0;
    const [startH, startM] = start.split(':').map(Number);
    const [endH, endM] = end.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    const diff = endMinutes >= startMinutes
      ? endMinutes - startMinutes
      : 24 * 60 - startMinutes + endMinutes;
    return Math.round((diff / 60) * 10) / 10;
  };

  await import('../heys_relapse_risk_v1.js');
});

function makeBaseOptions(overrides = {}) {
  return {
    now: '2026-03-19T19:30:00.000Z',
    dayData: {
      date: '2026-03-19',
      stressAvg: 2,
      moodAvg: 8,
      wellbeingAvg: 8,
      dayScore: 8,
      sleepHours: 8,
      sleepQuality: 4,
      waterMl: 2200,
      meals: [
        { time: '08:00' },
        { time: '13:00' },
        { time: '18:00' },
      ],
    },
    dayTot: {
      kcal: 1800,
      prot: 120,
      simple: 20,
      harm: 2,
    },
    normAbs: {
      kcal: 2000,
      prot: 120,
    },
    profile: {
      sleepHours: 8,
      optimum: 2000,
    },
    historyDays: [
      { ratio: 0.95, stressAvg: 2, sleepHours: 8 },
      { ratio: 0.9, stressAvg: 3, sleepHours: 8 },
      { ratio: 1.0, stressAvg: 2, sleepHours: 7.8 },
    ],
    ...overrides,
  };
}

describe('HEYS.RelapseRisk', () => {
  it('returns low risk for a stable day', () => {
    const result = global.HEYS.RelapseRisk.calculate(makeBaseOptions());

    expect(result.level).toBe('low');
    expect(result.score).toBeLessThan(20);
    expect(result.windows.tonight).toBeLessThan(25);
    expect(result.primaryDrivers.length).toBeGreaterThan(0);
  });

  it('returns high risk for evening underfed stress day', () => {
    const result = global.HEYS.RelapseRisk.calculate(makeBaseOptions({
      now: '2026-03-19T21:30:00.000Z',
      dayData: {
        date: '2026-03-19',
        stressAvg: 8,
        moodAvg: 4,
        wellbeingAvg: 4,
        dayScore: 4,
        sleepHours: 5.5,
        sleepQuality: 2,
        waterMl: 800,
        meals: [
          { time: '09:00' },
          { time: '13:30' },
        ],
      },
      dayTot: {
        kcal: 850,
        prot: 42,
        simple: 55,
        harm: 6,
      },
      normAbs: {
        kcal: 2200,
        prot: 120,
      },
      historyDays: [
        { ratio: 0.62, stressAvg: 7, sleepHours: 5.5 },
        { ratio: 0.68, stressAvg: 7, sleepHours: 6 },
        { ratio: 0.73, stressAvg: 6.5, sleepHours: 5.8 },
        { ratio: 0.75, stressAvg: 6, sleepHours: 6 },
      ],
    }));

    expect(result.level).toMatch(/high|critical/);
    expect(result.score).toBeGreaterThanOrEqual(60);
    expect(result.windows.tonight).toBeGreaterThanOrEqual(60);
    expect(result.primaryDrivers.some(driver => driver.id === 'restriction_pressure')).toBe(true);
  });

  it('does not become critical from low subjective state alone', () => {
    const result = global.HEYS.RelapseRisk.calculate(makeBaseOptions({
      dayData: {
        date: '2026-03-19',
        stressAvg: 4,
        moodAvg: 3,
        wellbeingAvg: 3,
        dayScore: 3,
        sleepHours: 8,
        sleepQuality: 4,
        waterMl: 2000,
        meals: [
          { time: '08:00' },
          { time: '13:00' },
          { time: '18:00' },
        ],
      },
      dayTot: {
        kcal: 1900,
        prot: 115,
        simple: 18,
        harm: 2,
      },
    }));

    expect(result.score).toBeLessThan(60);
    expect(result.level).toMatch(/guarded|elevated/);
  });

  it('detects restriction pressure even with good dayScore', () => {
    const result = global.HEYS.RelapseRisk.calculate(makeBaseOptions({
      now: '2026-03-19T20:30:00.000Z',
      dayData: {
        date: '2026-03-19',
        stressAvg: 3,
        moodAvg: 8,
        wellbeingAvg: 8,
        dayScore: 8,
        sleepHours: 7.5,
        sleepQuality: 4,
        waterMl: 1500,
        meals: [
          { time: '09:00' },
          { time: '12:30' },
        ],
      },
      dayTot: {
        kcal: 980,
        prot: 52,
        simple: 24,
        harm: 3,
      },
      normAbs: {
        kcal: 2100,
        prot: 120,
      },
      historyDays: [
        { ratio: 0.72, stressAvg: 3, sleepHours: 7.5 },
        { ratio: 0.78, stressAvg: 3, sleepHours: 7.8 },
        { ratio: 0.76, stressAvg: 2, sleepHours: 7.8 },
      ],
    }));

    expect(result.score).toBeGreaterThanOrEqual(30);
    expect(result.primaryDrivers[0].id).toBe('restriction_pressure');
    expect(result.windows.tonight).toBeGreaterThanOrEqual(30);
  });

  it('normalizes history ratios from raw day-style records', () => {
    const ratio = global.HEYS.RelapseRisk.__private.getHistoryKcalRatio({
      savedEatenKcal: 1000,
      optimum: 2000,
    }, 2200);

    expect(ratio).toBeCloseTo(0.5, 3);
  });
});
