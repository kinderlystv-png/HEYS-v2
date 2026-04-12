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

  await import('../heys_models_v1.js');
  await import('../heys_relapse_risk_v1.js');
  await import('../heys_risk_radar_v1.js');
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
    expect(result.level).not.toMatch(/high|critical/);
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
      meals: [{ items: [{ id: 'x' }] }],
    }, 2200);

    expect(ratio).toBeCloseTo(0.5, 3);
  });

  it('keeps compensated evening risk above absolute zero when multiple drivers are active', () => {
    const result = global.HEYS.RelapseRisk.calculate({
      now: '2026-03-23T22:31:11',
      dayData: {
        date: '2026-03-23',
        stressAvg: 1.2,
        moodAvg: 8.8,
        wellbeingAvg: 6.4,
        dayScore: 8,
        sleepHours: 9,
        sleepQuality: 7,
        waterMl: 1860,
        weightMorning: 70,
        trainings: [
          { z: [0, 60, 0, 0] },
        ],
        meals: [
          { time: '09:00' },
          { time: '13:20' },
          { time: '18:40' },
        ],
      },
      dayTot: {
        kcal: 2080,
        prot: 78,
        simple: 33,
        harm: 0,
      },
      normAbs: {
        kcal: 2000,
        prot: 100,
      },
      profile: {
        sleepHours: 9.6,
        optimum: 2000,
        protTarget: 100,
      },
      historyDays: Array.from({ length: 14 }, (_, index) => ({
        ratio: 1,
        stressAvg: 1.5,
        sleepHours: 9,
        savedEatenKcal: 2000,
        savedEatenProt: index < 3 ? 78 : 100,
      })),
    });

    expect(result.level).toBe('low');
    expect(result.score).toBeGreaterThanOrEqual(6);
    expect(result.score).toBeLessThan(20);
    expect(result.windows.tonight).toBeGreaterThanOrEqual(6);
    expect(result.windows.next3h).toBeGreaterThanOrEqual(4);
  });

  it('describes carryover stress more precisely when current stress is low but recent load was high', () => {
    const result = global.HEYS.RelapseRisk.calculate(makeBaseOptions({
      dayData: {
        date: '2026-03-19',
        stressAvg: 2,
        moodAvg: 7,
        wellbeingAvg: 7,
        dayScore: 7,
        sleepHours: 8,
        sleepQuality: 7,
        waterMl: 2200,
        meals: [
          { time: '08:00' },
          { time: '13:00' },
          { time: '18:00' },
        ],
      },
      historyDays: [
        { ratio: 0.95, stressAvg: 6.3, sleepHours: 8 },
        { ratio: 0.92, stressAvg: 5.8, sleepHours: 8 },
        { ratio: 0.9, stressAvg: 5.1, sleepHours: 7.8 },
        { ratio: 0.96, stressAvg: 4.9, sleepHours: 8 },
      ],
    }));

    const stressDriver = result.primaryDrivers.find((driver) => driver.id === 'stress_load');
    expect(stressDriver?.label).toBe('Накопленная стрессовая нагрузка');
    expect(stressDriver?.explanation).toMatch(/накопленное напряжение/i);
    expect(result.protectiveFactors.some((factor) => factor.id === 'low_stress')).toBe(true);
    expect(result.debug.stressLoadState.mode).toBe('carryover');
  });

  it('describes recovery debt more precisely when latest sleep is fine but recent sleep debt persists', () => {
    const result = global.HEYS.RelapseRisk.calculate(makeBaseOptions({
      dayData: {
        date: '2026-03-19',
        stressAvg: 2,
        moodAvg: 7,
        wellbeingAvg: 7,
        dayScore: 7,
        sleepHours: 8.2,
        sleepQuality: 7,
        waterMl: 2200,
        meals: [
          { time: '08:00' },
          { time: '13:00' },
          { time: '18:00' },
        ],
      },
      profile: {
        sleepHours: 8,
        optimum: 2000,
      },
      historyDays: [
        { ratio: 0.95, stressAvg: 2, sleepHours: 6.4 },
        { ratio: 0.92, stressAvg: 2, sleepHours: 6.8 },
        { ratio: 0.9, stressAvg: 2, sleepHours: 6.7 },
        { ratio: 0.96, stressAvg: 2, sleepHours: 7.0 },
      ],
    }));

    const sleepDriver = result.primaryDrivers.find((driver) => driver.id === 'sleep_debt');
    expect(sleepDriver?.label).toBe('Накопленный недосып');
    expect(sleepDriver?.explanation).toMatch(/не догнал восстановление|голод и тяга к еде сильнее/i);
    expect(result.protectiveFactors.some((factor) => factor.id === 'good_sleep')).toBe(true);
    expect(result.debug.sleepDebtState.mode).toBe('recovery_debt');
  });

  it('does not over-credit evening energy when calories are high but protein is too low after training', () => {
    const result = global.HEYS.RelapseRisk.calculate(makeBaseOptions({
      now: '2026-03-19T20:30:00.000Z',
      dayData: {
        date: '2026-03-19',
        stressAvg: 2,
        moodAvg: 7,
        wellbeingAvg: 7,
        dayScore: 7,
        sleepHours: 8,
        sleepQuality: 7,
        waterMl: 2200,
        weightMorning: 70,
        trainings: [
          { z: [0, 70, 0, 0] },
        ],
        meals: [
          { time: '08:00' },
          { time: '13:00' },
          { time: '18:00' },
        ],
      },
      dayTot: {
        kcal: 1900,
        prot: 60,
        simple: 20,
        harm: 2,
      },
      normAbs: {
        kcal: 2000,
        prot: 120,
      },
    }));

    expect(result.protectiveFactors.some((factor) => factor.id === 'enough_calories')).toBe(false);
  });

  it('applies targeted relief to relevant domains instead of only subtracting a flat global buffer', () => {
    const result = global.HEYS.RelapseRisk.calculate(makeBaseOptions({
      now: '2026-03-19T20:30:00.000Z',
      dayData: {
        date: '2026-03-19',
        stressAvg: 2,
        moodAvg: 7,
        wellbeingAvg: 7,
        dayScore: 7,
        sleepHours: 7.4,
        sleepQuality: 7,
        waterMl: 2200,
        meals: [
          { time: '08:00' },
          { time: '13:00' },
          { time: '18:00' },
        ],
      },
      dayTot: {
        kcal: 1850,
        prot: 120,
        simple: 36,
        harm: 2,
      },
    }));

    expect(result.debug.protectiveBufferState.domainRelief.restrictionPressure).toBeGreaterThan(0);
    expect(result.debug.protectiveBufferState.domainRelief.rewardExposure).toBeGreaterThan(0);
    expect(result.debug.protectiveBufferState.domainRelief.emotionalVulnerability).toBeGreaterThan(0);
    expect(result.debug.effectiveComponents.restrictionPressure).toBeLessThanOrEqual(result.debug.components.restrictionPressure);
    expect(result.debug.effectiveComponents.rewardExposure).toBeLessThanOrEqual(result.debug.components.rewardExposure);
    expect(result.debug.effectiveComponents.emotionalVulnerability).toBeLessThanOrEqual(result.debug.components.emotionalVulnerability);
  });

  it('ranks primary drivers by effective components after domain relief, not by raw pre-protection values', () => {
    const result = global.HEYS.RelapseRisk.calculate({
      now: '2026-03-23T23:19:28',
      dayData: {
        date: '2026-03-23',
        stressAvg: 1.2,
        moodAvg: 8.8,
        wellbeingAvg: 6.4,
        dayScore: 8,
        sleepHours: 9,
        sleepQuality: 7,
        waterMl: 3320,
        weightMorning: 70,
        trainings: [
          { z: [0, 60, 0, 0] },
        ],
        meals: [
          { time: '09:00' },
          { time: '13:20' },
          { time: '18:40' },
        ],
      },
      dayTot: {
        kcal: 2080,
        prot: 78,
        simple: 33,
        harm: 0,
      },
      normAbs: {
        kcal: 2000,
        prot: 100,
      },
      profile: {
        sleepHours: 9.6,
        optimum: 2000,
        protTarget: 100,
      },
      historyDays: Array.from({ length: 14 }, (_, index) => ({
        ratio: 1,
        stressAvg: 1.2,
        sleepHours: 9,
        savedEatenKcal: 2000,
        savedEatenProt: index < 3 ? 78 : 100,
      })),
    });

    expect(result.primaryDrivers[0]?.id).toBe('timing_context');
    expect(result.primaryDrivers.some((driver) => driver.id === 'reward_exposure')).toBe(true);
    expect(result.primaryDrivers.some((driver) => driver.id === 'restriction_pressure')).toBe(false);
  });

  it('uses recovery-debt specific recommendation when latest sleep is okay but accumulated sleep debt persists', () => {
    const result = global.HEYS.RelapseRisk.calculate(makeBaseOptions({
      now: '2026-03-19T21:30:00.000Z',
      dayData: {
        date: '2026-03-19',
        stressAvg: 2,
        moodAvg: 7,
        wellbeingAvg: 7,
        dayScore: 7,
        sleepHours: 8.3,
        sleepQuality: 7,
        waterMl: 2200,
        meals: [
          { time: '08:00' },
          { time: '13:00' },
          { time: '18:00' },
        ],
      },
      profile: {
        sleepHours: 8,
        optimum: 2000,
      },
      historyDays: [
        { ratio: 0.95, stressAvg: 2, sleepHours: 6.1 },
        { ratio: 0.92, stressAvg: 2, sleepHours: 6.4 },
        { ratio: 0.9, stressAvg: 2, sleepHours: 6.3 },
        { ratio: 0.96, stressAvg: 2, sleepHours: 6.8 },
        { ratio: 0.98, stressAvg: 2, sleepHours: 6.7 },
      ],
    }));

    const sleepRec = result.recommendations.find((item) => item.id === 'sleep_protect');
    expect(sleepRec?.text).toMatch(/догоняет восстановление|лучше без жёсткого дефицита/i);
    expect(sleepRec?.text).not.toMatch(/recovery debt|recovery mode/i);
  });

  it('uses carryover-stress specific recommendation when stress is historical rather than acute', () => {
    const result = global.HEYS.RelapseRisk.calculate(makeBaseOptions({
      now: '2026-03-19T20:30:00.000Z',
      dayData: {
        date: '2026-03-19',
        stressAvg: 2,
        moodAvg: 8,
        wellbeingAvg: 8,
        dayScore: 8,
        sleepHours: 8,
        sleepQuality: 7,
        waterMl: 2200,
        meals: [
          { time: '08:00' },
          { time: '13:00' },
          { time: '18:00' },
        ],
      },
      dayTot: {
        kcal: 1500,
        prot: 110,
        simple: 20,
        harm: 2,
      },
      historyDays: [
        { ratio: 0.82, stressAvg: 7.2, sleepHours: 8 },
        { ratio: 0.85, stressAvg: 6.8, sleepHours: 8 },
        { ratio: 0.84, stressAvg: 6.1, sleepHours: 8 },
        { ratio: 0.88, stressAvg: 5.7, sleepHours: 8 },
      ],
    }));

    expect(result.primaryDrivers.some((driver) => driver.id === 'stress_load')).toBe(true);
    const stressRec = result.recommendations.find((item) => item.id === 'stress_pause');
    expect(stressRec?.text).toMatch(/накопилось напряжение|короткую паузу/i);
  });

  it('keeps recommendations client-friendly instead of leaking internal technical jargon', () => {
    const result = global.HEYS.RelapseRisk.calculate(makeBaseOptions({
      now: '2026-03-19T21:30:00.000Z',
      dayData: {
        date: '2026-03-19',
        stressAvg: 7,
        moodAvg: 4,
        wellbeingAvg: 4,
        dayScore: 4,
        sleepHours: 6,
        sleepQuality: 3,
        waterMl: 1200,
        meals: [
          { time: '09:00' },
          { time: '13:00' },
        ],
      },
      dayTot: {
        kcal: 900,
        prot: 45,
        simple: 56,
        harm: 6,
      },
      normAbs: {
        kcal: 2100,
        prot: 120,
      },
    }));

    const recommendationText = result.recommendations.map((item) => item.text).join(' | ');
    expect(recommendationText).not.toMatch(/aggressive cut|structured recovery meal|safe structured meal|reward-food|hyperpalatable|recovery mode|anti-stress|impulsive eating/i);
    expect(recommendationText).toMatch(/нормальн|пауза|голод|ужин|приём пищи/i);
  });

  it('uses adaptive radar weights so near-zero crash risk does not over-dilute relapse risk', () => {
    const radar = global.HEYS.RiskRadar.calculate({
      relapseSnapshot: {
        score: 60,
        confidence: 0.8,
        windows: { next3h: 62, tonight: 66, next24h: 54 },
        primaryDrivers: [
          { id: 'restriction_pressure', label: 'Давление дефицита', impact: 18 },
        ],
        recommendations: [
          { id: 'safe_meal', text: 'Сейчас лучше сделать обычный нормальный приём пищи.' },
        ],
      },
      crashRiskResult: {
        score: 0,
        confidence: 0.7,
        factors: [],
        actions: [],
      },
    });

    expect(radar.relapse.score).toBe(60);
    expect(radar.crash.score).toBe(0);
    expect(radar.score).toBeGreaterThanOrEqual(50);
    expect(radar.score).toBeLessThanOrEqual(60);
    expect(radar.blend.weights.relapse).toBeGreaterThan(radar.blend.baseWeights.relapse);
    expect(radar.blend.weights.crash).toBeLessThan(radar.blend.baseWeights.crash);
  });

  it('exposes raw relapse score fields in canonical realtime snapshot', () => {
    const todayKey = 'heys_dayv2_2026-03-23';
    const store = {
      [todayKey]: {
        date: '2026-03-23',
        stressAvg: 2,
        moodAvg: 8,
        wellbeingAvg: 8,
        dayScore: 8,
        sleepHours: 8,
        sleepQuality: 7,
        waterMl: 2200,
        meals: [
          { time: '08:00' },
          { time: '13:00' },
          { time: '18:00' },
        ],
      },
      heys_profile: {
        sleepHours: 8,
        optimum: 2000,
      },
    };

    global.HEYS.dayUtils.todayISO = () => '2026-03-23';
    global.HEYS.DayData = {
      getCurrentDay: () => store[todayKey],
      getDayTot: () => ({ kcal: 1800, prot: 120, simple: 20, harm: 2 }),
    };
    global.HEYS.norms = {
      getNormAbs: () => ({ kcal: 2000, prot: 120 }),
    };
    global.HEYS.utils = {
      lsGet: (key, fallback) => (key in store ? store[key] : fallback),
    };

    global.HEYS.RelapseRisk.invalidateSnapshot();
    const snapshot = global.HEYS.RelapseRisk.getCurrentSnapshot({ now: '2026-03-23T20:00:00.000Z' });

    expect(snapshot.hasData).toBe(true);
    expect(snapshot.rawScore).toBe(snapshot.score);
    expect(snapshot.relapseScore).toBe(snapshot.score);
    expect(snapshot.crashScore).toBe(0);
    expect(snapshot.scoreModel).toBe('relapse_raw');
  });
});
