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
    goal: overrides.goal ?? {
      mode: 'deficit',
      targetRange: { min: 0.9, max: 1.05 },
      criticalOver: 1.15,
      criticalUnder: 0.75
    }
  };
};

beforeAll(async () => {
  ensureWindow();
  await import('../apps/web/heys_advice_rules_v1.js');
  await import('../apps/web/heys_advice_bundle_v1.js');
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

  it('downgrades daily quality when cooldown suppresses almost all auto delivery', () => {
    localStorage.setItem('heys_advice_trace_day_v1', JSON.stringify({
      version: 'advice-day-log-v2',
      date: '2026-03-10',
      updatedAt: 1773153944933,
      entries: [
        {
          type: 'snapshot',
          recordedAt: 1773153909398,
          lastSeenAt: 1773153909398,
          repeatCount: 20,
          summary: {
            trigger: 'manual',
            hour: 17,
            mealCount: 2,
            waterMl: 0,
            kcal: 844,
            visibleForManualCount: 6,
            eligibleForAutoToastCount: 0,
            primaryId: null,
            topIssues: [],
            topBlockers: [
              { code: 'global_cooldown', count: 6 }
            ],
            modulesWithOutput: ['nutrition', 'timing', 'hydration', 'other'],
            silentModules: ['training', 'emotional']
          },
          trace: {
            trigger: 'manual',
            outputs: {
              relevant: Array.from({ length: 6 }, (_, index) => ({ id: `advice_${index}` })),
              cooldownEligible: [],
              visibleForManualCount: 6,
              eligibleForAutoToastCount: 0
            },
            modules: [
              { module: 'nutrition', outputCount: 2, status: 'ok', adviceIds: ['advice_0', 'advice_1'] },
              { module: 'timing', outputCount: 1, status: 'ok', adviceIds: ['advice_2'] },
              { module: 'hydration', outputCount: 1, status: 'ok', adviceIds: ['advice_3'] },
              { module: 'other', outputCount: 2, status: 'ok', adviceIds: ['advice_4', 'advice_5'] },
              { module: 'training', outputCount: 0, status: 'no_output', adviceIds: [], note: 'Нет тренировочного триггера на сегодня.' },
              { module: 'emotional', outputCount: 0, status: 'no_output', adviceIds: [] }
            ],
            stages: [
              {
                stage: 'cooldown_filter',
                removed: Array.from({ length: 6 }, (_, index) => ({
                  id: `advice_${index}`,
                  module: index === 3 ? 'hydration' : index >= 4 ? 'other' : 'nutrition',
                  reason: {
                    code: 'global_cooldown',
                    message: 'Глобальный cooldown активен ещё 45с'
                  }
                }))
              }
            ]
          }
        },
        {
          type: 'event',
          eventType: 'manual_open',
          recordedAt: 1773153909319,
          payload: {
            trigger: 'manual',
            badgeCount: 6,
            visibleAdviceCount: 6
          }
        },
        {
          type: 'event',
          eventType: 'click',
          recordedAt: 1773153918958,
          payload: {
            adviceId: 'advice_0',
            module: 'nutrition',
            trigger: 'manual'
          }
        }
      ]
    }));

    const diagnostics = window.HEYS.advice.getDailyAdviceTraceDiagnostics('2026-03-10');

    expect(diagnostics.analyticsEffectiveness.suppressedByCooldownRate).toBe(1);
    expect(diagnostics.quality.grade).not.toBe('strong');
    expect(diagnostics.quality.heuristicScore).toBeLessThanOrEqual(68);
  });

  it('keeps manual drawer visible but disables auto-toast eligibility for manual trigger', () => {
    const result = window.HEYS.advice.useAdviceEngine({
      dayTot: {
        ...baseTotals,
        kcal: 844,
        prot: 31,
        fat: 37,
        carbs: 106,
        fiber: 6,
        simple: 63,
      },
      normAbs: baseNorms,
      optimum: 2325,
      displayOptimum: 2325,
      caloricDebt: null,
      day: {
        date: '2026-03-10',
        meals: [
          { time: '09:00', items: [{ name: 'Breakfast', grams: 100 }] },
          { time: '14:00', items: [{ name: 'Lunch', grams: 100 }] },
        ],
        trainings: [],
        waterMl: 0,
        stressAvg: 0,
      },
      pIndex: { byId: new Map(), byName: new Map() },
      currentStreak: 0,
      trigger: 'manual',
      uiState: {},
      prof: { deficitPctTarget: 0, sleepHours: 8 },
      waterGoal: 2700,
    });

    expect(result.relevant.length).toBeGreaterThan(0);
    expect(result.primary).toBeNull();
    expect(result.trace.outputs.visibleForManualCount).toBeGreaterThan(0);
    expect(result.trace.outputs.eligibleForAutoToastCount).toBe(0);
    expect(result.trace.summary.whyNoPrimary).toContain('intentionally disables auto-toast primary');
  });

  it('exports a shorter clipboard daily log without heavyweight duplicate sections', () => {
    localStorage.setItem('heys_advice_trace_day_v1', JSON.stringify({
      version: 'advice-day-log-v2',
      date: '2026-03-10',
      updatedAt: 1773179639622,
      entries: [
        {
          type: 'snapshot',
          recordedAt: 1773179574049,
          lastSeenAt: 1773179574049,
          repeatCount: 17,
          fingerprint: 'snapshot:1',
          summary: {
            trigger: 'manual',
            hour: 0,
            mealCount: 4,
            waterMl: 3500,
            kcal: 2444,
            visibleForManualCount: 7,
            eligibleForAutoToastCount: 0,
            primaryId: null,
            topIssues: ['UNDER_TARGET_TREND'],
            topBlockers: [
              { code: 'expert_conflict_resolution', count: 14 },
              { code: 'manual_mode_no_auto_toast', count: 7 }
            ],
            modulesWithOutput: ['nutrition', 'timing', 'training', 'hydration', 'other'],
            silentModules: ['emotional']
          },
          trace: {
            trigger: 'manual',
            outputs: {
              relevant: [{ id: 'insulin_perfect' }, { id: 'water_goal_reached' }],
              cooldownEligible: [],
              visibleForManualCount: 7,
              eligibleForAutoToastCount: 0
            },
            modules: [
              { module: 'hydration', outputCount: 1, status: 'ok', adviceIds: ['water_goal_reached'] },
              { module: 'timing', outputCount: 1, status: 'ok', adviceIds: ['insulin_perfect'] },
              { module: 'emotional', outputCount: 0, status: 'no_output', adviceIds: [] }
            ],
            stages: [
              {
                stage: 'expert_conflict_resolution',
                removed: [
                  {
                    id: 'advice_a',
                    module: 'hydration',
                    reason: { code: 'expert_conflict_resolution', message: 'Suppressed by expert conflict resolution' }
                  },
                  {
                    id: 'advice_b',
                    module: 'timing',
                    reason: { code: 'manual_mode_no_auto_toast', message: 'Manual mode disables auto toast' }
                  }
                ]
              }
            ]
          }
        },
        {
          type: 'event',
          eventType: 'shown',
          recordedAt: 1773179629964,
          payload: {
            adviceId: 'water_goal_reached',
            trigger: 'tab_open',
            module: 'hydration'
          }
        },
        {
          type: 'event',
          eventType: 'manual_open',
          recordedAt: 1773179639539,
          payload: {
            trigger: 'manual',
            visibleAdviceCount: 5,
            badgeCount: 7
          }
        }
      ]
    }));

    const log = window.HEYS.advice.getDailyAdviceTraceLog('2026-03-10');
    const clipboardPayload = window.HEYS.advice.formatDailyAdviceTraceForClipboard(log, { mode: 'clipboard' });
    const compactPayload = window.HEYS.advice.formatDailyAdviceTraceForClipboard(log, { mode: 'compact' });

    expect(clipboardPayload).toContain('mode: clipboard');
    expect(clipboardPayload).toContain('=== FINDINGS ===');
    expect(clipboardPayload).toContain('=== RECENT_ACTIVITY ===');
    expect(clipboardPayload).not.toContain('=== QUALITY ===');
    expect(clipboardPayload).not.toContain('=== ANALYTICS_EFFECTIVENESS ===');
    expect(clipboardPayload.length).toBeLessThan(compactPayload.length);
  });
});
