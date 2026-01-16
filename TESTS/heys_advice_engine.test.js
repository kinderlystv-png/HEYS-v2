import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const ensureWindow = () => {
  if (!globalThis.window) {
    globalThis.window = globalThis;
  }
  if (!window.HEYS) {
    window.HEYS = {};
  }
};

const baseTotals = {
  kcal: 0,
  prot: 0,
  fat: 0,
  carbs: 0,
  fiber: 0,
  simple: 0,
  complex: 0,
  trans: 0,
  harm: 0,
  good: 0,
  bad: 0,
  gi: 0
};

const baseNorms = {
  prot: 100,
  fat: 70,
  carbs: 200,
  fiber: 25,
  simple: 50,
  complex: 150,
  trans: 1,
  harm: 100,
  good: 50,
  bad: 20
};

const makeCtx = (overrides = {}) => {
  const dayTot = { ...baseTotals, ...(overrides.dayTot || {}) };
  const normAbs = { ...baseNorms, ...(overrides.normAbs || {}) };
  const optimum = overrides.optimum ?? 2000;
  const kcalPct = overrides.kcalPct ?? (dayTot.kcal / optimum || 0);

  return {
    dayTot,
    normAbs,
    optimum,
    displayOptimum: overrides.displayOptimum ?? optimum,
    caloricDebt: overrides.caloricDebt ?? null,
    day: {
      meals: [],
      trainings: [],
      waterMl: 0,
      deficitPct: -15,
      ...overrides.day
    },
    pIndex: overrides.pIndex ?? { byId: new Map(), byName: new Map() },
    currentStreak: overrides.currentStreak ?? 0,
    hour: overrides.hour ?? 19,
    mealCount: overrides.mealCount ?? 1,
    hasTraining: overrides.hasTraining ?? false,
    kcalPct,
    tone: overrides.tone ?? 'active',
    specialDay: overrides.specialDay ?? null,
    emotionalState: overrides.emotionalState ?? 'normal',
    prof: overrides.prof ?? { deficitPctTarget: -15, sleepHours: 8 },
    waterGoal: overrides.waterGoal ?? 2000,
    goal: overrides.goal
  };
};

beforeAll(async () => {
  ensureWindow();
  await import('../apps/web/heys_advice_rules_v1.js');
  await import('../apps/web/heys_advice_v1.js');
});

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.useRealTimers();
});

describe('HEYS advice engine', () => {
  it('adds critical excess advice when over critical threshold', () => {
    const ctx = makeCtx({
      dayTot: { kcal: 2320 },
      hour: 19,
      mealCount: 2
    });

    const advices = window.HEYS.adviceEngine.generateAdvices(ctx);
    const ids = advices.map(a => a.id);

    expect(ids).toContain('kcal_excess_critical');
  });

  it('does not add excess advice on refeed day within OK range', () => {
    const ctx = makeCtx({
      dayTot: { kcal: 2400 },
      day: { isRefeedDay: true },
      hour: 19,
      mealCount: 2
    });

    const advices = window.HEYS.adviceEngine.generateAdvices(ctx);
    const ids = advices.map(a => a.id);

    expect(ids).not.toContain('kcal_excess_critical');
    expect(ids).not.toContain('kcal_excess_mild');
  });

  it('deduplicates advices by group rules', () => {
    const advices = [
      { id: 'protein_low', priority: 10 },
      { id: 'protein_sources', priority: 20 }
    ];

    const deduped = window.HEYS.advice.deduplicateAdvices(advices);
    const ids = deduped.map(a => a.id);

    expect(ids.length).toBe(1);
    expect(['protein_low', 'protein_sources']).toContain(ids[0]);
  });

  it('filters time-restricted advices by current hour', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 16, 13, 0, 0));

    const advices = [
      { id: 'morning_breakfast' },
      { id: 'lunch_time' }
    ];

    const filtered = window.HEYS.advice.filterByTimeRestrictions(advices);
    const ids = filtered.map(a => a.id);

    expect(ids).not.toContain('morning_breakfast');
    expect(ids).toContain('lunch_time');
  });

  it('adapts tone and blocks harsh advice on low mood', () => {
    const result = window.HEYS.advice.adaptTextToMood('Текст', 1, 'warning');

    expect(result).toBeNull();
  });
});
