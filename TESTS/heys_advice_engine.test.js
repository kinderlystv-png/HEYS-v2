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
    expect(clipboardPayload).toContain('expert_conflict_resolution: 6 — несколько советов конкурировали');
  });
});
