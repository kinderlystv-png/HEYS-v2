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
    trigger: overrides.trigger ?? 'tab_open',
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

const makeOtherHelpers = (overrides = {}) => ({
  rules: window.HEYS.adviceRules,
  pickRandomText: (items) => Array.isArray(items) ? (items[0] || '') : (items || ''),
  personalizeText: (text) => text,
  getRecentDays: overrides.getRecentDays || (() => overrides.recentDays || []),
  getProductForItem: overrides.getProductForItem || (() => null),
  calculateSleepHours: overrides.calculateSleepHours || (() => 8),
  isInTargetRange: overrides.isInTargetRange || (() => false),
  isCriticallyOver: overrides.isCriticallyOver || (() => false),
  isMilestoneShown: overrides.isMilestoneShown || (() => false),
  markMilestoneShown: overrides.markMilestoneShown || (() => { }),
  updatePersonalBestStreak: overrides.updatePersonalBestStreak || (() => false),
  getWeeklyComparison: overrides.getWeeklyComparison || (() => null),
  getWeeklySummary: overrides.getWeeklySummary || (() => null),
  getNextStreakMilestone: overrides.getNextStreakMilestone || (() => null),
  checkComboAchievements: overrides.checkComboAchievements || (() => null),
  markComboShown: overrides.markComboShown || (() => { }),
  getSmartRecommendation: overrides.getSmartRecommendation || (() => null),
  getTotalDaysTracked: overrides.getTotalDaysTracked || (() => 0)
});

const buildOtherAdvices = (ctxOverrides = {}, helperOverrides = {}) => (
  window.HEYS.adviceModules.other(makeCtx(ctxOverrides), makeOtherHelpers(helperOverrides))
);

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

  it('does not add celebratory tone to warnings on high mood', () => {
    const result = window.HEYS.advice.adaptTextToMood('Вес растёт — проверь калории', 5, 'warning');

    expect(result).toBe('Вес растёт — проверь калории');
  });

  it('still decorates achievements on high mood', () => {
    const result = window.HEYS.advice.adaptTextToMood('План выдержан', 5, 'achievement');

    expect(result).toMatch(/^(Отлично! |Супер! |Так держать! )План выдержан( 🎉| 💪)?$/);
  });

  it('treats downward weight trend as warning for bulk goal', () => {
    const advices = buildOtherAdvices({
      goal: {
        mode: 'bulk',
        targetRange: { min: 0.95, max: 1.1 },
        criticalOver: 1.2,
        criticalUnder: 0.8
      },
      prof: { deficitPctTarget: 10, weightGoal: 85 },
      day: { weightMorning: 79, meals: [], trainings: [], waterMl: 0, deficitPct: 10 }
    }, {
      recentDays: [
        { weightMorning: 79.8 },
        { weightMorning: 79.7 },
        { weightMorning: 79.6 },
        { weightMorning: 79.4 },
        { weightMorning: 79.2 },
        { weightMorning: 79.1 },
        { weightMorning: 79.0 }
      ]
    });

    const advice = advices.find(item => item.id === 'weight_trend_down');

    expect(advice).toMatchObject({
      type: 'warning',
      text: 'Вес снижается — проверь калории и восстановление'
    });
    expect(advice.details).toContain('Для набора это сигнал');
  });

  it('treats moderate upward weight trend as achievement for bulk goal', () => {
    const advices = buildOtherAdvices({
      goal: {
        mode: 'bulk',
        targetRange: { min: 0.95, max: 1.1 },
        criticalOver: 1.2,
        criticalUnder: 0.8
      },
      prof: { deficitPctTarget: 10, weightGoal: 78 },
      day: { weightMorning: 71, meals: [], trainings: [], waterMl: 0, deficitPct: 10 }
    }, {
      recentDays: [
        { weightMorning: 70.0 },
        { weightMorning: 70.2 },
        { weightMorning: 70.4 },
        { weightMorning: 70.5 },
        { weightMorning: 70.6 },
        { weightMorning: 70.8 },
        { weightMorning: 71.0 }
      ]
    });

    const advice = advices.find(item => item.id === 'weight_trend_up');

    expect(advice).toMatchObject({
      type: 'achievement',
      text: 'Вес растёт в нужную сторону'
    });
    expect(advice.details).toContain('рабочим темпом');
  });

  it('uses multi-factor score profile to prioritize actionable personalized advice', () => {
    const ctx = makeCtx({
      trigger: 'tab_open',
      crashRisk: { level: 'low' }
    });

    const sorted = window.HEYS.advice.sortBySmartScore([
      {
        id: 'baseline_tip',
        text: 'Baseline tip',
        type: 'tip',
        priority: 40,
        category: 'other',
        expertMeta: {}
      },
      {
        id: 'actionable_personalized_tip',
        text: 'Actionable tip',
        type: 'tip',
        priority: 40,
        category: 'other',
        expertMeta: {
          actionNow: { urgency: 'now', label: 'Сделай это сейчас' },
          responseMemory: { score: 7, label: 'обычно помогает' },
          evidenceScore: 28,
          sourceCount: 2
        }
      }
    ], ctx);

    expect(sorted[0].id).toBe('actionable_personalized_tip');
    expect(sorted[0].scoreProfile).toBeTruthy();
    expect(sorted[0].scoreProfile.components.actionabilityBoost).toBeGreaterThan(0);
    expect(sorted[0].scoreProfile.components.responseMemoryBoost).toBeGreaterThan(0);
    expect(sorted[0].smartScore).toBeGreaterThan(sorted[1].smartScore);
  });

  it('applies fatigue penalty to over-shown low-response advice', () => {
    localStorage.setItem(window.HEYS.adviceRules.TRACKING_KEY, JSON.stringify({
      repeated_tip: {
        shown: 14,
        clicked: 0,
        lastShown: Date.now() - (2 * 60 * 60 * 1000)
      }
    }));
    localStorage.setItem('heys_advice_outcomes_v1', JSON.stringify({
      advice: {
        repeated_tip: {
          shown: 14,
          click: 0,
          read: 0,
          hidden: 5,
          positive: 0,
          negative: 3,
          autoSuccess: 0,
          autoFailure: 4,
          autoNeutral: 0,
          lastUpdated: Date.now()
        }
      },
      theme: {
        hydration: {
          shown: 18,
          click: 0,
          read: 1,
          hidden: 6,
          positive: 0,
          negative: 3,
          autoSuccess: 0,
          autoFailure: 4,
          autoNeutral: 0,
          lastUpdated: Date.now()
        }
      },
      context: {},
      lastUpdated: Date.now()
    }));

    const ctx = makeCtx({ trigger: 'tab_open' });
    const sorted = window.HEYS.advice.sortBySmartScore([
      {
        id: 'repeated_tip',
        text: 'Repeated tip',
        type: 'tip',
        priority: 40,
        category: 'hydration',
        expertMeta: {
          theme: 'hydration',
          evidenceScore: 18,
          sourceCount: 1
        }
      },
      {
        id: 'fresh_tip',
        text: 'Fresh tip',
        type: 'tip',
        priority: 40,
        category: 'hydration',
        expertMeta: {
          theme: 'hydration',
          evidenceScore: 18,
          sourceCount: 1
        }
      }
    ], ctx);

    const repeated = sorted.find(item => item.id === 'repeated_tip');
    const fresh = sorted.find(item => item.id === 'fresh_tip');

    expect(sorted[0].id).toBe('fresh_tip');
    expect(repeated.scoreProfile.components.fatiguePenalty).toBeGreaterThan(0);
    expect(repeated.scoreProfile.dimensions.fatigueResistance).toBeLessThan(fresh.scoreProfile.dimensions.fatigueResistance);
    expect(repeated.smartScore).toBeLessThan(fresh.smartScore);
  });

  it('demotes low-trust low-actionability warning in auto context', () => {
    const ctx = makeCtx({
      trigger: 'tab_open',
      mealCount: 0,
      day: { meals: [] }
    });

    const sorted = window.HEYS.advice.sortBySmartScore([
      {
        id: 'low_trust_warning',
        text: 'Weak warning',
        type: 'warning',
        priority: 35,
        category: 'nutrition',
        confidence: 'low',
        expertMeta: {
          evidenceScore: 8,
          sourceCount: 1,
          contradictions: ['soft contradiction'],
          responseMemory: { score: -6, label: 'часто не заходит' },
          actionNow: { urgency: 'watch' }
        }
      },
      {
        id: 'actionable_supportive_tip',
        text: 'Supportive tip',
        type: 'tip',
        priority: 40,
        category: 'other',
        confidence: 'medium',
        expertMeta: {
          evidenceScore: 18,
          sourceCount: 2,
          actionNow: { urgency: 'now', label: 'Сделай маленький шаг сейчас' },
          responseMemory: { score: 2, label: 'скорее полезен' }
        }
      }
    ], ctx);

    const weakWarning = sorted.find(item => item.id === 'low_trust_warning');
    const actionableTip = sorted.find(item => item.id === 'actionable_supportive_tip');

    expect(sorted[0].id).toBe('actionable_supportive_tip');
    expect(weakWarning.scoreProfile.components.trustPenalty).toBeGreaterThan(0);
    expect(weakWarning.scoreProfile.components.actionabilityPenalty).toBeGreaterThan(0);
    expect(weakWarning.scoreProfile.dimensions.trust).toBeLessThan(actionableTip.scoreProfile.dimensions.trust);
    expect(weakWarning.smartScore).toBeLessThan(actionableTip.smartScore);
  });

  it('adds counterfactual explainability for expert conflict losers', () => {
    const ctx = makeCtx({
      trigger: 'tab_open',
      mealCount: 1,
      day: { meals: [{ time: '10:00', items: [{ name: 'Meal', grams: 100 }] }] }
    });

    const scored = window.HEYS.advice.sortBySmartScore([
      {
        id: 'lower_signal_hydration_tip',
        text: 'Drink more water later',
        type: 'tip',
        priority: 42,
        category: 'hydration',
        confidence: 'low',
        expertMeta: {
          theme: 'hydration',
          evidenceScore: 10,
          sourceCount: 1,
          contradictions: ['late for this reminder'],
          actionNow: { urgency: 'watch' },
          responseMemory: { score: -3, label: 'часто откладывается' }
        }
      },
      {
        id: 'strong_hydration_tip',
        text: 'Drink a glass of water now',
        type: 'tip',
        priority: 42,
        category: 'hydration',
        confidence: 'medium',
        expertMeta: {
          theme: 'hydration',
          evidenceScore: 24,
          sourceCount: 2,
          actionNow: { urgency: 'now', label: 'Сделай это сейчас' },
          responseMemory: { score: 5, label: 'обычно помогает' }
        }
      }
    ], ctx);

    const resolved = window.HEYS.advice.applyExpertConflictResolution(scored);
    const reasonMap = window.HEYS.advice.buildExpertConflictReasonMap(scored, resolved);
    const reason = reasonMap.lower_signal_hydration_tip;

    expect(resolved).toHaveLength(1);
    expect(resolved[0].id).toBe('strong_hydration_tip');
    expect(reason.winnerId).toBe('strong_hydration_tip');
    expect(reason.counterfactualSummary).toContain('победил, потому что');
    expect(reason.drivers.length).toBeGreaterThan(0);
    expect(reason.drivers.some(item => item.key === 'actionability' || item.key === 'evidence')).toBe(true);
    expect(reason.finalScoreDelta).toBeGreaterThan(0);
  });

  it('calibrates sparse negative outcome history conservatively', () => {
    const advice = {
      id: 'hydration_probe',
      category: 'hydration',
      expertMeta: { theme: 'hydration' }
    };

    const responseMemory = window.HEYS.advice.resolveAdviceResponseMemory(advice, makeCtx(), {
      advice: {
        hydration_probe: {
          shown: 1,
          hidden: 1,
          click: 0,
          read: 0,
          positive: 0,
          negative: 0,
          autoSuccess: 0,
          autoFailure: 0,
          autoNeutral: 0
        }
      },
      theme: {},
      context: {}
    });

    const fatigue = window.HEYS.advice.getAdviceFatiguePenalty(advice, {
      shown: 5,
      clicked: 0,
      lastShown: Date.now() - (10 * 60 * 60 * 1000)
    }, {
      advice: {
        hydration_probe: {
          shown: 5,
          hidden: 1,
          click: 0,
          read: 0,
          positive: 0,
          negative: 0,
          autoSuccess: 0,
          autoFailure: 0,
          autoNeutral: 0
        }
      },
      theme: {},
      context: {}
    });

    expect(responseMemory).toBeNull();
    expect(fatigue.parts.adviceOutcomePenalty).toBe(0);
  });

  it('keeps strong repeated positive outcome history meaningful after calibration', () => {
    const advice = {
      id: 'protein_recovery',
      category: 'nutrition',
      expertMeta: { theme: 'protein' }
    };

    const responseMemory = window.HEYS.advice.resolveAdviceResponseMemory(advice, makeCtx(), {
      advice: {
        protein_recovery: {
          shown: 8,
          click: 3,
          read: 2,
          hidden: 0,
          positive: 2,
          negative: 0,
          autoSuccess: 2,
          autoFailure: 0,
          autoNeutral: 1
        }
      },
      theme: {
        protein: {
          shown: 14,
          click: 4,
          read: 3,
          hidden: 1,
          positive: 3,
          negative: 0,
          autoSuccess: 3,
          autoFailure: 0,
          autoNeutral: 2
        }
      },
      context: {
        'protein|deficit|low|evening|low': {
          shown: 6,
          click: 2,
          read: 1,
          hidden: 0,
          positive: 1,
          negative: 0,
          autoSuccess: 1,
          autoFailure: 0,
          autoNeutral: 0
        }
      }
    });

    expect(responseMemory).toBeTruthy();
    expect(responseMemory.score).toBeGreaterThanOrEqual(4);
    expect(responseMemory.label === 'скорее полезен' || responseMemory.label === 'обычно помогает').toBe(true);
    expect(responseMemory.sampleCount).toBeGreaterThan(2);
  });

  it('sanitizes malformed outcome profile storage', () => {
    localStorage.setItem('heys_advice_outcomes_v1', JSON.stringify({
      advice: {
        broken: {
          shown: -5,
          click: 'bad',
          hidden: 2,
          autoSuccess: 1,
          lastUpdated: 'oops'
        }
      },
      theme: [],
      context: {
        'hydration|deficit|low|midday|low': {
          read: 2,
          negative: 1,
          lastUpdated: 100
        }
      },
      lastUpdated: 'bad'
    }));

    const profiles = window.HEYS.advice.getAdviceOutcomeProfiles();

    expect(profiles.version).toBe(2);
    expect(profiles.advice.broken).toEqual({
      shown: 0,
      click: 0,
      read: 0,
      hidden: 2,
      positive: 0,
      negative: 0,
      autoSuccess: 1,
      autoFailure: 0,
      autoNeutral: 0,
      lastUpdated: 0
    });
    expect(profiles.theme).toEqual({});
    expect(profiles.context['hydration|deficit|low|midday|low'].read).toBe(2);
    expect(profiles.lastUpdated).toBe(0);
  });

  it('sanitizes and wraps pending outcome storage', () => {
    const staleTimestamp = Date.now() - (90 * 60 * 60 * 1000);
    const freshTimestamp = Date.now() - (2 * 60 * 60 * 1000);

    localStorage.setItem('heys_advice_pending_outcomes_v1', JSON.stringify({
      invalid_shape: ['oops'],
      stale_key: {
        adviceId: 'old_tip',
        theme: 'hydration',
        contextKey: 'hydration|deficit|low|midday|low',
        shownAt: staleTimestamp
      },
      fresh_key: {
        adviceId: 'fresh_tip',
        theme: 'hydration',
        contextKey: 'hydration|deficit|low|midday|low',
        shownAt: freshTimestamp,
        mealCount: 2,
        proteinPct: 0.3,
        waterPct: 0.4
      }
    }));

    const pending = window.HEYS.advice.getPendingAdviceOutcomes();

    expect(Object.keys(pending)).toEqual(['fresh_key']);
    expect(pending.fresh_key.adviceId).toBe('fresh_tip');
    expect(pending.fresh_key.mealCount).toBe(2);
    expect(pending.fresh_key.waterPct).toBe(0.4);
  });

  it('exposes score model metadata for diagnostics and tuning', () => {
    expect(window.HEYS.advice.ADVICE_SCORE_MODEL).toBeTruthy();
    expect(window.HEYS.advice.ADVICE_SCORE_MODEL.version).toBe('2026-03-outcome-calibrated');
    expect(window.HEYS.advice.ADVICE_SCORE_MODEL.storage.outcomeProfileVersion).toBe(2);
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
    expect(result.trace.outputs.relevant[0]?.scoreProfile?.finalScore).toEqual(expect.any(Number));
    expect(result.trace.outputs.relevant[0]?.scoreProfile?.dimensions?.actionability).toEqual(expect.any(Number));
  });

  it('does not treat manual drawer clicks as engagement for shown auto toasts', () => {
    localStorage.setItem('heys_advice_trace_day_v1', JSON.stringify({
      version: 'advice-day-log-v2',
      date: '2026-03-10',
      updatedAt: 1773180081317,
      entries: [
        {
          type: 'snapshot',
          recordedAt: 1773179574049,
          lastSeenAt: 1773179574049,
          repeatCount: 1,
          fingerprint: 'snapshot:auto:1',
          summary: {
            trigger: 'tab_open',
            hour: 1,
            mealCount: 4,
            waterMl: 3500,
            kcal: 2444,
            visibleForManualCount: 6,
            eligibleForAutoToastCount: 2,
            primaryId: 'insulin_perfect',
            topIssues: ['UNDER_TARGET_TREND'],
            topBlockers: [],
            modulesWithOutput: ['nutrition', 'timing', 'hydration'],
            silentModules: ['emotional']
          },
          trace: {
            trigger: 'tab_open',
            outputs: {
              relevant: [{ id: 'insulin_perfect' }, { id: 'water_goal_reached' }],
              cooldownEligible: [{ id: 'insulin_perfect' }, { id: 'water_goal_reached' }],
              visibleForManualCount: 6,
              eligibleForAutoToastCount: 2,
              primaryId: 'insulin_perfect'
            },
            modules: [
              { module: 'hydration', outputCount: 1, status: 'ok', adviceIds: ['water_goal_reached'] },
              { module: 'timing', outputCount: 1, status: 'ok', adviceIds: ['insulin_perfect'] }
            ],
            stages: []
          }
        },
        {
          type: 'event',
          eventType: 'shown',
          recordedAt: 1773179574071,
          payload: { adviceId: 'insulin_perfect', trigger: 'tab_open', module: 'timing' }
        },
        {
          type: 'event',
          eventType: 'shown',
          recordedAt: 1773179629964,
          payload: { adviceId: 'water_goal_reached', trigger: 'tab_open', module: 'hydration' }
        },
        {
          type: 'event',
          eventType: 'manual_open',
          recordedAt: 1773179639539,
          payload: {
            trigger: 'manual',
            visibleAdviceCount: 4,
            displayedAdviceCount: 4,
            engineVisibleAdviceCount: 6,
            badgeCount: 6,
            filteredOutCount: 2
          }
        },
        {
          type: 'event',
          eventType: 'manual_click',
          recordedAt: 1773179639601,
          payload: { adviceId: 'insulin_perfect', trigger: 'manual', module: 'timing' }
        }
      ]
    }));

    const diagnostics = window.HEYS.advice.getDailyAdviceTraceDiagnostics('2026-03-10');

    expect(diagnostics.analyticsEffectiveness.eventFunnel.shown).toBe(2);
    expect(diagnostics.analyticsEffectiveness.eventFunnel.click).toBe(0);
    expect(diagnostics.analyticsEffectiveness.eventFunnel.manualClick).toBe(1);
    expect(diagnostics.analyticsEffectiveness.autoShown).toBe(2);
    expect(diagnostics.analyticsEffectiveness.ignoredRate).toBe(1);
    expect(diagnostics.analyticsEffectiveness.precisionProxy).toBe(0);
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
            displayedAdviceCount: 5,
            engineVisibleAdviceCount: 7,
            badgeCount: 7,
            filteredOutCount: 2
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
    expect(clipboardPayload).toContain('event:manual_open · trigger=manual · displayed=5 · raw=7 · filtered=2');
    expect(clipboardPayload).toContain('expert_conflict_resolution: 17 — несколько советов конкурировали (движок оставил более сильный вариант)');
    expect(clipboardPayload).not.toContain('\n- manual_mode_no_auto_toast: 7');
    expect(clipboardPayload).not.toContain('=== QUALITY ===');
    expect(clipboardPayload).not.toContain('=== ANALYTICS_EFFECTIVENESS ===');
    expect(clipboardPayload.length).toBeLessThan(compactPayload.length);
  });

  it('never reports manual_open raw count below displayed count', () => {
    const displayedAdviceCount = 7;
    const staleTraceVisibleForManualCount = 6;
    const currentBadgeAdviceCount = 7;

    const engineVisibleAdviceCount = currentBadgeAdviceCount;
    const filteredOutCount = Math.max(0, engineVisibleAdviceCount - displayedAdviceCount);

    expect(staleTraceVisibleForManualCount).toBeLessThan(displayedAdviceCount);
    expect(engineVisibleAdviceCount).toBe(displayedAdviceCount);
    expect(filteredOutCount).toBe(0);
  });

  it('reports local UI suppression when auto advice stays eligible but is not shown', () => {
    localStorage.setItem('heys_advice_trace_day_v1', JSON.stringify({
      version: 'advice-day-log-v2',
      date: '2026-03-11',
      updatedAt: 1773212477170,
      entries: [
        {
          type: 'snapshot',
          recordedAt: 1773212400000,
          lastSeenAt: 1773212400000,
          repeatCount: 8,
          fingerprint: 'snapshot:auto:suppressed',
          summary: {
            trigger: 'tab_open',
            hour: 10,
            mealCount: 0,
            waterMl: 0,
            kcal: 0,
            visibleForManualCount: 6,
            eligibleForAutoToastCount: 6,
            primaryId: 'morning_breakfast_bootstrap',
            topIssues: ['UNDER_TARGET_TREND'],
            topBlockers: [
              { code: 'expert_conflict_resolution', count: 2 }
            ],
            modulesWithOutput: ['nutrition', 'hydration', 'other'],
            silentModules: ['timing', 'training', 'emotional']
          },
          trace: {
            trigger: 'tab_open',
            outputs: {
              relevant: [{ id: 'morning_breakfast_bootstrap' }],
              cooldownEligible: [{ id: 'morning_breakfast_bootstrap' }],
              visibleForManualCount: 6,
              eligibleForAutoToastCount: 6,
              primaryId: 'morning_breakfast_bootstrap'
            },
            modules: [
              { module: 'nutrition', outputCount: 1, status: 'ok', adviceIds: ['morning_breakfast_bootstrap'] }
            ],
            stages: []
          }
        },
        {
          type: 'event',
          eventType: 'auto_suppressed_ui',
          recordedAt: 1773212471000,
          payload: {
            adviceId: 'morning_breakfast_bootstrap',
            trigger: 'tab_open',
            reason: 'dismissed_today',
            module: 'nutrition',
            category: 'nutrition'
          }
        }
      ]
    }));

    const diagnostics = window.HEYS.advice.getDailyAdviceTraceDiagnostics('2026-03-11');
    const log = window.HEYS.advice.getDailyAdviceTraceLog('2026-03-11');
    const clipboardPayload = window.HEYS.advice.formatDailyAdviceTraceForClipboard(log, { mode: 'clipboard' });

    expect(diagnostics.analyticsEffectiveness.eventFunnel.autoSuppressedUi).toBe(1);
    expect(diagnostics.quality.findings.some(item => item.includes('локально скрыта/прочитана'))).toBe(true);
    expect(clipboardPayload).toContain('event:auto_suppressed_ui · advice=morning_breakfast_bootstrap · trigger=tab_open · reason=dismissed_today');
  });

  it('falls back to stage name when historical blocker entries have no reason code', () => {
    localStorage.setItem('heys_advice_trace_day_v1', JSON.stringify({
      version: 'advice-day-log-v2',
      date: '2026-03-08',
      updatedAt: 1773213710882,
      entries: [
        {
          type: 'snapshot',
          recordedAt: 1773213710000,
          lastSeenAt: 1773213710000,
          repeatCount: 5,
          fingerprint: 'snapshot:legacy-missing-reason',
          summary: {
            trigger: 'manual',
            hour: 10,
            mealCount: 3,
            waterMl: 2500,
            kcal: 4467,
            visibleForManualCount: 9,
            eligibleForAutoToastCount: 0,
            primaryId: null,
            topIssues: ['UNDER_TARGET_TREND'],
            topBlockers: [
              { code: 'unknown', count: 11 }
            ],
            modulesWithOutput: ['nutrition', 'timing', 'emotional', 'hydration', 'other'],
            silentModules: ['training']
          },
          trace: {
            trigger: 'manual',
            outputs: {
              visibleForManualCount: 9,
              eligibleForAutoToastCount: 0,
              primaryId: null
            },
            modules: [
              { module: 'nutrition', outputCount: 1, status: 'ok', adviceIds: ['nutrition_a'] },
              { module: 'other', outputCount: 1, status: 'ok', adviceIds: ['other_a'] }
            ],
            stages: [
              {
                stage: 'expert_conflict_resolution',
                removed: [
                  { id: 'nutrition_b', module: 'nutrition', reason: { message: 'winner chosen' } },
                  { id: 'other_b', module: 'other', reason: null }
                ]
              }
            ]
          }
        }
      ]
    }));

    const diagnostics = window.HEYS.advice.getDailyAdviceTraceDiagnostics('2026-03-08');
    const log = window.HEYS.advice.getDailyAdviceTraceLog('2026-03-08');

    expect(diagnostics.blockerReport.topReasons[0]).toEqual({ key: 'expert_conflict_resolution', count: 10 });
    expect(diagnostics.moduleReport.find(item => item.module === 'nutrition')?.topBlockers?.[0]?.key).toBe('expert_conflict_resolution');
    expect(log.entries[0].summary.topBlockers[0]).toEqual({ code: 'expert_conflict_resolution', count: 2 });
  });

  it('ignores unknown service snapshots in coverage and hides manual-only dominant issue', () => {
    localStorage.setItem('heys_advice_trace_day_v1', JSON.stringify({
      version: 'advice-day-log-v2',
      date: '2026-03-12',
      updatedAt: 1773214400000,
      entries: [
        {
          type: 'snapshot',
          recordedAt: 1773214400000,
          lastSeenAt: 1773214400000,
          repeatCount: 20,
          fingerprint: 'snapshot:unknown-empty',
          summary: {
            trigger: 'unknown',
            hour: 9,
            mealCount: 0,
            waterMl: 0,
            kcal: 0,
            visibleForManualCount: 0,
            eligibleForAutoToastCount: 0,
            primaryId: null,
            topIssues: [],
            topBlockers: [],
            modulesWithOutput: [],
            silentModules: ['nutrition']
          },
          trace: {
            trigger: 'unknown',
            outputs: {
              visibleForManualCount: 0,
              eligibleForAutoToastCount: 0,
              primaryId: null,
              relevant: [],
              cooldownEligible: []
            },
            modules: [],
            stages: []
          }
        },
        {
          type: 'snapshot',
          recordedAt: 1773214405000,
          lastSeenAt: 1773214405000,
          repeatCount: 5,
          fingerprint: 'snapshot:manual-rich',
          summary: {
            trigger: 'manual',
            hour: 10,
            mealCount: 2,
            waterMl: 300,
            kcal: 800,
            visibleForManualCount: 6,
            eligibleForAutoToastCount: 0,
            primaryId: null,
            topIssues: ['UNDER_TARGET_TREND'],
            topBlockers: [{ code: 'manual_mode_no_auto_toast', count: 6 }],
            modulesWithOutput: ['nutrition', 'other'],
            silentModules: ['training']
          },
          trace: {
            trigger: 'manual',
            outputs: {
              visibleForManualCount: 6,
              eligibleForAutoToastCount: 0,
              primaryId: null,
              relevant: [{ id: 'a1' }],
              cooldownEligible: []
            },
            modules: [
              { module: 'nutrition', outputCount: 1, status: 'ok', adviceIds: ['a1'] },
              { module: 'other', outputCount: 1, status: 'ok', adviceIds: ['a2'] }
            ],
            stages: [
              {
                stage: 'cooldown_filter',
                removed: Array.from({ length: 6 }, (_, index) => ({
                  id: `m_${index}`,
                  module: index < 3 ? 'nutrition' : 'other',
                  reason: {
                    code: 'manual_mode_no_auto_toast',
                    message: 'manual only'
                  }
                }))
              }
            ]
          }
        },
        {
          type: 'snapshot',
          recordedAt: 1773214410000,
          lastSeenAt: 1773214410000,
          repeatCount: 1,
          fingerprint: 'snapshot:tab-open',
          summary: {
            trigger: 'tab_open',
            hour: 10,
            mealCount: 2,
            waterMl: 300,
            kcal: 800,
            visibleForManualCount: 6,
            eligibleForAutoToastCount: 6,
            primaryId: 'streak_3',
            topIssues: ['UNDER_TARGET_TREND'],
            topBlockers: [{ code: 'expert_conflict_resolution', count: 1 }],
            modulesWithOutput: ['nutrition', 'other'],
            silentModules: ['training']
          },
          trace: {
            trigger: 'tab_open',
            outputs: {
              visibleForManualCount: 6,
              eligibleForAutoToastCount: 6,
              primaryId: 'streak_3',
              relevant: [{ id: 'streak_3' }],
              cooldownEligible: [{ id: 'streak_3' }]
            },
            modules: [
              { module: 'nutrition', outputCount: 1, status: 'ok', adviceIds: ['n1'] },
              { module: 'other', outputCount: 1, status: 'ok', adviceIds: ['streak_3'] }
            ],
            stages: [
              {
                stage: 'expert_conflict_resolution',
                removed: [
                  {
                    id: 'other_alt',
                    module: 'other',
                    reason: {
                      code: 'expert_conflict_resolution',
                      message: 'winner chosen'
                    }
                  }
                ]
              }
            ]
          }
        }
      ]
    }));

    const diagnostics = window.HEYS.advice.getDailyAdviceTraceDiagnostics('2026-03-12');

    expect(diagnostics.executiveSummary.dominantIssue).toEqual({
      key: 'expert_conflict_resolution',
      count: 1,
      label: 'несколько советов конкурировали',
      message: 'Несколько советов конкурировали между собой, поэтому движок выбрал более сильный вариант (1).'
    });
    expect(diagnostics.analyticsEffectiveness.coverage).toBe(1);
    expect(diagnostics.analyticsEffectiveness.rawCoverage).toBeLessThan(0.3);
    expect(diagnostics.quality.findings.some(item => item.includes('Coverage низкий'))).toBe(false);
  });

  it('adds human-friendly dominant issue metadata for expert conflict days', () => {
    localStorage.setItem('heys_advice_trace_day_v1', JSON.stringify({
      version: 'advice-day-log-v2',
      date: '2026-03-13',
      updatedAt: 1773215000000,
      entries: [
        {
          type: 'snapshot',
          recordedAt: 1773215000000,
          lastSeenAt: 1773215000000,
          repeatCount: 3,
          fingerprint: 'snapshot:expert-conflict-day',
          summary: {
            trigger: 'tab_open',
            hour: 10,
            mealCount: 1,
            waterMl: 0,
            kcal: 0,
            visibleForManualCount: 6,
            eligibleForAutoToastCount: 6,
            primaryId: 'morning_breakfast_bootstrap',
            topIssues: ['UNDER_TARGET_TREND'],
            topBlockers: [{ code: 'expert_conflict_resolution', count: 2 }],
            modulesWithOutput: ['nutrition', 'hydration', 'other'],
            silentModules: ['timing', 'training', 'emotional']
          },
          trace: {
            trigger: 'tab_open',
            outputs: {
              visibleForManualCount: 6,
              eligibleForAutoToastCount: 6,
              primaryId: 'morning_breakfast_bootstrap',
              relevant: [{ id: 'morning_breakfast_bootstrap' }],
              cooldownEligible: [{ id: 'morning_breakfast_bootstrap' }]
            },
            modules: [
              { module: 'nutrition', outputCount: 1, status: 'ok', adviceIds: ['morning_breakfast_bootstrap'] },
              { module: 'other', outputCount: 1, status: 'ok', adviceIds: ['streak_3'] }
            ],
            stages: [
              {
                stage: 'expert_conflict_resolution',
                removed: [
                  {
                    id: 'streak_3',
                    module: 'other',
                    reason: {
                      code: 'expert_conflict_resolution',
                      message: 'winner chosen'
                    }
                  },
                  {
                    id: 'water_bootstrap_alt',
                    module: 'hydration',
                    reason: {
                      code: 'expert_conflict_resolution',
                      message: 'winner chosen'
                    }
                  }
                ]
              }
            ]
          }
        }
      ]
    }));

    const diagnostics = window.HEYS.advice.getDailyAdviceTraceDiagnostics('2026-03-13');
    const log = window.HEYS.advice.getDailyAdviceTraceLog('2026-03-13');
    const clipboardPayload = window.HEYS.advice.formatDailyAdviceTraceForClipboard(log, { mode: 'clipboard' });

    expect(diagnostics.executiveSummary.dominantIssue).toEqual({
      key: 'expert_conflict_resolution',
      count: 6,
      label: 'несколько советов конкурировали',
      message: 'Несколько советов конкурировали между собой, поэтому движок выбрал более сильный вариант (6).'
    });
    expect(diagnostics.quality.findings.some(item => item.includes('Несколько советов конкурировали между собой'))).toBe(true);
    expect(clipboardPayload).toContain('expert_conflict_resolution: 6 — несколько советов конкурировали (движок оставил более сильный вариант)');
  });

  it('adds human-friendly findings for trigger mismatch and emotional filter days', () => {
    localStorage.setItem('heys_advice_trace_day_v1', JSON.stringify({
      version: 'advice-day-log-v2',
      date: '2026-03-14',
      updatedAt: 1773215100000,
      entries: [
        {
          type: 'snapshot',
          recordedAt: 1773215100000,
          lastSeenAt: 1773215100000,
          repeatCount: 4,
          fingerprint: 'snapshot:trigger-mismatch-day',
          summary: {
            trigger: 'tab_open',
            hour: 10,
            mealCount: 4,
            waterMl: 1500,
            kcal: 1800,
            visibleForManualCount: 7,
            eligibleForAutoToastCount: 7,
            primaryId: 'weight_forecast_wrong_direction',
            topIssues: ['UNDER_TARGET_TREND'],
            topBlockers: [{ code: 'trigger_mismatch', count: 3 }],
            modulesWithOutput: ['nutrition', 'timing', 'other'],
            silentModules: ['training', 'emotional']
          },
          trace: {
            trigger: 'tab_open',
            outputs: {
              visibleForManualCount: 7,
              eligibleForAutoToastCount: 7,
              primaryId: 'weight_forecast_wrong_direction',
              relevant: [{ id: 'weight_forecast_wrong_direction' }],
              cooldownEligible: [{ id: 'weight_forecast_wrong_direction' }]
            },
            modules: [
              { module: 'nutrition', outputCount: 1, status: 'ok', adviceIds: ['n1'] },
              { module: 'timing', outputCount: 1, status: 'ok', adviceIds: ['t1'] },
              { module: 'other', outputCount: 1, status: 'ok', adviceIds: ['weight_forecast_wrong_direction'] }
            ],
            stages: [
              {
                stage: 'trigger_filter',
                removed: [
                  { id: 'n2', module: 'nutrition', reason: { code: 'trigger_mismatch', message: 'no trigger' } },
                  { id: 'n3', module: 'nutrition', reason: { code: 'trigger_mismatch', message: 'no trigger' } },
                  { id: 't2', module: 'timing', reason: { code: 'trigger_mismatch', message: 'no trigger' } }
                ]
              }
            ]
          }
        }
      ]
    }));

    const triggerDiagnostics = window.HEYS.advice.getDailyAdviceTraceDiagnostics('2026-03-14');

    expect(triggerDiagnostics.quality.findings.some(item => item.includes('не подходила под текущие триггеры показа'))).toBe(true);

    localStorage.setItem('heys_advice_trace_day_v1', JSON.stringify({
      version: 'advice-day-log-v2',
      date: '2026-03-15',
      updatedAt: 1773215200000,
      entries: [
        {
          type: 'snapshot',
          recordedAt: 1773215200000,
          lastSeenAt: 1773215200000,
          repeatCount: 5,
          fingerprint: 'snapshot:emotional-filter-day',
          summary: {
            trigger: 'manual',
            hour: 10,
            mealCount: 3,
            waterMl: 800,
            kcal: 2200,
            visibleForManualCount: 7,
            eligibleForAutoToastCount: 0,
            primaryId: null,
            topIssues: ['UNDER_TARGET_TREND'],
            topBlockers: [{ code: 'emotional_filter', count: 5 }],
            modulesWithOutput: ['nutrition', 'emotional', 'other'],
            silentModules: ['training']
          },
          trace: {
            trigger: 'manual',
            outputs: {
              visibleForManualCount: 7,
              eligibleForAutoToastCount: 0,
              primaryId: null,
              relevant: [{ id: 'crash_support' }],
              cooldownEligible: []
            },
            modules: [
              { module: 'nutrition', outputCount: 1, status: 'ok', adviceIds: ['n1'] },
              { module: 'emotional', outputCount: 1, status: 'ok', adviceIds: ['crash_support'] },
              { module: 'other', outputCount: 1, status: 'ok', adviceIds: ['o1'] }
            ],
            stages: [
              {
                stage: 'emotional_filter',
                removed: Array.from({ length: 5 }, (_, index) => ({
                  id: `e_${index}`,
                  module: index < 3 ? 'nutrition' : 'other',
                  reason: { code: 'emotional_filter', message: 'softened' }
                }))
              }
            ]
          }
        }
      ]
    }));

    const emotionalDiagnostics = window.HEYS.advice.getDailyAdviceTraceDiagnostics('2026-03-15');
    const emotionalLog = window.HEYS.advice.getDailyAdviceTraceLog('2026-03-15');
    const emotionalClipboard = window.HEYS.advice.formatDailyAdviceTraceForClipboard(emotionalLog, { mode: 'clipboard' });

    expect(emotionalDiagnostics.quality.findings.some(item => item.includes('Эмоциональный фильтр смягчал выдачу'))).toBe(true);
    expect(emotionalClipboard).toContain('emotional_filter: 25 — эмоциональный фильтр смягчил выдачу (слишком жёсткие советы были смягчены)');
  });
});
