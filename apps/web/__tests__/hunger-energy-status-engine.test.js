import fs from 'fs';
import path from 'path';

import { afterAll, describe, expect, it } from 'vitest';

const originalWindow = global.window;
const originalHEYS = global.HEYS;

global.window = global;
global.HEYS = {};

const enginePath = path.resolve(__dirname, '../heys_hunger_energy_status_v1.js');
const engineSource = fs.readFileSync(enginePath, 'utf8');
eval(engineSource);

const HES = global.HEYS.HungerEnergyStatus;
const F = HES.SAFETY_FLAGS;
const O = HES.SAFETY_OVERRIDES;

afterAll(() => {
  global.window = originalWindow;
  global.HEYS = originalHEYS;
});

const scenarios = [
  {
    id: 1,
    name: 'morning hunger after late sweet meal stays a checkpoint when red flags are absent',
    input: { hungerLevel: 5, controlLevel: 7, hungerTrend: 'stable', safetyFlags: [] },
    context: {
      lastMealAt: '2026-07-03T01:00:00+03:00',
      lateSweetMeal: true,
      caffeineHabitual: false,
      sleepQuality: 'ok',
      focus: 'stable'
    },
    expected: {
      status: ['stableBetweenMeals', 'reboundRisk'],
      risk: ['low', 'medium'],
      food: ['checkpoint'],
      action: ['hydratePause', 'delayWithCheck', 'observe']
    }
  },
  {
    id: 2,
    name: 'same morning context becomes a risk brake when sleep stress and control are bad',
    input: { hungerLevel: 6, controlLevel: 3, hungerTrend: 'rising', cravingLevel: 8, safetyFlags: [] },
    context: {
      lastMealAt: '2026-07-03T01:00:00+03:00',
      lateSweetMeal: true,
      sleepQuality: 'poor',
      stressLevel: 'high',
      knownReboundPattern: true
    },
    expected: {
      status: ['reboundRisk'],
      risk: ['high'],
      food: ['snack', 'meal', 'foodFirst'],
      action: ['riskBrakeMeal', 'eatMeal']
    }
  },
  {
    id: 3,
    name: 'active insulin wave plus sweet craving does not claim new energy need',
    input: { hungerLevel: 6, controlLevel: 6, hungerTrend: 'rising', cravingLevel: 8, safetyFlags: [] },
    context: {
      lastMealAt: '2026-07-03T09:00:00+03:00',
      insulinWaveState: 'active',
      recentMeal: true,
      specificFoodPull: true
    },
    expected: {
      status: ['fed'],
      risk: ['medium', 'high'],
      food: ['checkpoint', 'snack'],
      action: ['hydratePause', 'delayWithCheck', 'riskBrakeMeal']
    }
  },
  {
    id: 4,
    name: 'calm low-wave hunger can be observed with a check',
    input: { hungerLevel: 4, controlLevel: 8, hungerTrend: 'stable', safetyFlags: [] },
    context: {
      lastMealAt: '2026-07-03T09:00:00+03:00',
      insulinWaveState: 'low',
      focus: 'stable',
      successfulWaitHistory: true
    },
    expected: {
      status: ['stableBetweenMeals'],
      risk: ['low'],
      food: ['wait', 'checkpoint'],
      action: ['observe', 'delayWithCheck', 'hydratePause']
    }
  },
  {
    id: 5,
    name: 'dizziness or shaking blocks delay even if wave is low',
    input: { hungerLevel: 8, controlLevel: 6, hungerTrend: 'rising', safetyFlags: [F.shaky] },
    context: { lastMealAt: '2026-07-03T08:00:00+03:00', insulinWaveState: 'low' },
    expected: {
      status: ['stableBetweenMeals'],
      risk: ['stop'],
      food: ['foodFirst'],
      action: ['doNotDelay'],
      hardOverride: O.delayForbidden,
      delayAllowed: false
    }
  },
  {
    id: 6,
    name: 'planned fasting cannot override hard recovery and protein debt',
    input: { hungerLevel: 5, controlLevel: 7, safetyFlags: [F.hardTrainingRecovery] },
    context: {
      lastMealAt: '2026-07-03T07:30:00+03:00',
      plannedFastingWindow: true,
      trainingRecovery: 'hard',
      proteinDebt: true
    },
    expected: {
      status: ['recoveryNeed'],
      risk: ['high'],
      food: ['foodFirst'],
      action: ['doNotDelay'],
      hardOverride: O.recoveryFoodFirst,
      delayAllowed: false
    }
  },
  {
    id: 7,
    name: 'very low evening intake with mood drop becomes a meal recommendation',
    input: { hungerLevel: 7, controlLevel: 4, hungerTrend: 'rising', safetyFlags: [] },
    context: {
      lastMealAt: '2026-07-03T11:00:00+03:00',
      veryLowIntakeDay: true,
      longGap: true,
      moodDropping: true,
      remainingKcal: 900
    },
    expected: {
      status: ['deficitPressure'],
      risk: ['high'],
      food: ['meal', 'foodFirst'],
      action: ['riskBrakeMeal', 'eatMeal']
    }
  },
  {
    id: 8,
    name: 'stress skipped meal and evening craving raise rebound risk',
    input: { hungerLevel: 6, controlLevel: 3, cravingLevel: 9, hungerTrend: 'rising', safetyFlags: [] },
    context: {
      lastMealAt: '2026-07-03T07:00:00+03:00',
      stressLevel: 'high',
      skippedMeal: true,
      highRiskTimePattern: true,
      strongCraving: true
    },
    expected: {
      status: ['reboundRisk'],
      risk: ['high'],
      food: ['snack', 'meal', 'foodFirst'],
      action: ['riskBrakeMeal', 'eatMeal']
    }
  },
  {
    id: 9,
    name: 'social dinner soon prefers a bridge over a full pre-meal',
    input: { hungerLevel: 4, controlLevel: 7, hungerTrend: 'stable', safetyFlags: [] },
    context: {
      lastMealAt: '2026-07-03T15:00:00+03:00',
      plannedMealMinutes: 45,
      socialMealSoon: true,
      focus: 'stable'
    },
    expected: {
      status: ['stableBetweenMeals'],
      risk: ['low', 'medium'],
      food: ['checkpoint', 'snack'],
      action: ['hydratePause', 'delayWithCheck', 'eatSnack', 'observe']
    }
  },
  {
    id: 10,
    name: 'shift worker is evaluated by wake and meal rhythm rather than clock label',
    input: { hungerLevel: 6, controlLevel: 6, hungerTrend: 'stable', safetyFlags: [] },
    context: {
      lastMealAt: '2026-07-03T09:00:00+03:00',
      shiftWork: true,
      timeSinceWakingMin: 45,
      usualMealRhythm: 'afterWake'
    },
    expected: {
      status: ['stableBetweenMeals'],
      risk: ['medium'],
      food: ['checkpoint', 'snack'],
      action: ['hydratePause', 'delayWithCheck', 'riskBrakeMeal']
    }
  },
  {
    id: 11,
    name: 'alcohol poor sleep morning starts with hydration and lower confidence',
    input: { hungerLevel: 5, controlLevel: 6, hungerTrend: 'rising', safetyFlags: [] },
    context: {
      lastMealAt: '2026-07-03T01:00:00+03:00',
      alcoholRecent: true,
      sleepQuality: 'poor',
      thirsty: true,
      morningSymptoms: true
    },
    expected: {
      status: ['reboundRisk'],
      risk: ['medium', 'high'],
      food: ['checkpoint', 'snack', 'meal'],
      action: ['hydratePause', 'riskBrakeMeal']
    }
  },
  {
    id: 12,
    name: 'repeated night wake-to-eat pattern is high risk without diagnosis language',
    input: { hungerLevel: 7, controlLevel: 4, hungerTrend: 'rising', cravingLevel: 7, safetyFlags: [] },
    context: {
      lastMealAt: '2026-07-02T22:00:00+03:00',
      nightWakeToEatPattern: true,
      knownReboundPattern: true,
      failedDelayHistory: true
    },
    expected: {
      status: ['reboundRisk'],
      risk: ['high'],
      food: ['meal', 'foodFirst'],
      action: ['riskBrakeMeal', 'eatMeal']
    }
  },
  {
    id: 13,
    name: 'hypoglycemia-like symptoms in diabetes context trigger fast carb safety',
    input: { hungerLevel: 5, controlLevel: 7, safetyFlags: [F.diabetes, F.shaky] },
    context: { lastMealAt: '2026-07-03T09:00:00+03:00', diabetes: true },
    expected: {
      status: ['medicalCaution'],
      risk: ['stop'],
      food: ['foodFirst'],
      action: ['fastCarbSafety'],
      hardOverride: O.fastCarbSafety,
      delayAllowed: false
    }
  },
  {
    id: 14,
    name: 'single possible pattern stays low confidence instead of becoming a trigger claim',
    input: { hungerLevel: 5, controlLevel: 7, hungerTrend: 'stable', safetyFlags: [] },
    context: {
      lastMealAt: '2026-07-03T01:00:00+03:00',
      lateSweetMeal: true,
      personalPatternEvents: 1,
      personalPatternDays: 1,
      dataFreshness: 'partial'
    },
    expected: {
      status: ['reboundRisk', 'stableBetweenMeals'],
      risk: ['low', 'medium'],
      food: ['checkpoint'],
      action: ['hydratePause', 'delayWithCheck', 'observe'],
      confidence: ['medium', 'high']
    }
  },
  {
    id: 15,
    name: 'low energy availability concern is a food-first hard stop',
    input: { hungerLevel: 4, controlLevel: 8, safetyFlags: [F.possibleLowEnergyAvailability] },
    context: {
      lastMealAt: '2026-07-03T10:00:00+03:00',
      lowEnergyAvailabilityConcern: true,
      veryLowIntakeDay: true,
      trainingRecovery: 'hard',
      fatiguePersistent: true,
      cycleDisruption: true
    },
    expected: {
      status: ['nutritionFloorRisk'],
      risk: ['high'],
      food: ['foodFirst'],
      action: ['doNotDelay'],
      hardOverride: O.nutritionFloor,
      delayAllowed: false
    }
  },
  {
    id: 16,
    name: 'premenstrual stronger cravings with okay control get a planned anchor',
    input: { hungerLevel: 6, controlLevel: 7, cravingLevel: 7, hungerTrend: 'stable', safetyFlags: [] },
    context: {
      lastMealAt: '2026-07-03T13:00:00+03:00',
      premenstrualContext: true,
      strongCraving: true,
      focus: 'stable'
    },
    expected: {
      status: ['reboundRisk'],
      risk: ['medium'],
      food: ['checkpoint', 'snack'],
      action: ['hydratePause', 'delayWithCheck', 'riskBrakeMeal']
    }
  },
  {
    id: 17,
    name: 'hunger shortly after a balanced meal is treated as satiety lag',
    input: { hungerLevel: 5, controlLevel: 8, hungerTrend: 'stable', safetyFlags: [] },
    context: {
      justAte: true,
      recentBalancedMeal: true,
      satietyLagLikely: true,
      focus: 'stable'
    },
    expected: {
      status: ['fed'],
      risk: ['low'],
      food: ['checkpoint'],
      action: ['observe', 'hydratePause', 'delayWithCheck']
    }
  },
  {
    id: 18,
    name: 'hunger only input lowers confidence and asks for context before delay',
    input: { hungerLevel: 7 },
    context: {},
    expected: {
      status: ['stableBetweenMeals'],
      risk: ['medium'],
      food: ['checkpoint'],
      action: ['delayWithCheck', 'hydratePause'],
      confidence: ['medium', 'low']
    }
  },
  {
    id: 19,
    name: 'modal input produces computed risk and food rails',
    input: { hungerLevel: 6, controlLevel: 6, safetyFlags: [] },
    context: { lastMealAt: '2026-07-03T09:00:00+03:00' },
    expected: {
      status: ['stableBetweenMeals'],
      risk: ['medium'],
      food: ['checkpoint', 'snack'],
      action: ['hydratePause', 'delayWithCheck', 'riskBrakeMeal']
    }
  },
  {
    id: 20,
    name: 'raising hunger slider after recent meal raises food support only mildly',
    input: { hungerLevel: 8, controlLevel: 8, hungerTrend: 'rising', safetyFlags: [] },
    context: {
      justAte: true,
      recentBalancedMeal: true,
      satietyLagLikely: true,
      focus: 'stable'
    },
    expected: {
      status: ['fed'],
      risk: ['low', 'medium'],
      food: ['checkpoint'],
      action: ['observe', 'hydratePause', 'delayWithCheck']
    }
  },
  {
    id: 21,
    name: 'moderate hunger with stress skipped meal poor sleep and failed delays is high risk',
    input: { hungerLevel: 5, controlLevel: 4, cravingLevel: 8, hungerTrend: 'rising', safetyFlags: [] },
    context: {
      lastMealAt: '2026-07-03T07:00:00+03:00',
      stressLevel: 'high',
      skippedMeal: true,
      sleepQuality: 'poor',
      failedDelayHistory: true,
      strongCraving: true
    },
    expected: {
      status: ['reboundRisk'],
      risk: ['high'],
      food: ['meal', 'foodFirst'],
      action: ['riskBrakeMeal', 'eatMeal']
    }
  },
  {
    id: 22,
    name: 'same hunger changes by personal rhythm and high-risk time pattern',
    input: { hungerLevel: 6, controlLevel: 6, hungerTrend: 'stable', safetyFlags: [] },
    context: {
      lastMealAt: '2026-07-03T17:00:00+03:00',
      highRiskTimePattern: true,
      knownReboundPattern: true,
      personalPatternEvents: 8,
      personalPatternDays: 14
    },
    expected: {
      status: ['reboundRisk'],
      risk: ['medium', 'high'],
      food: ['snack', 'meal'],
      action: ['riskBrakeMeal', 'hydratePause', 'delayWithCheck']
    }
  },
  {
    id: 23,
    name: 'stale meal and training data avoid precise kcal bands',
    input: { hungerLevel: 6, controlLevel: 6, hungerTrend: 'stable', safetyFlags: [], dataFreshness: 'stale' },
    context: { dataFreshness: 'stale' },
    expected: {
      status: ['stableBetweenMeals'],
      risk: ['medium'],
      food: ['checkpoint', 'snack'],
      action: ['hydratePause', 'delayWithCheck', 'riskBrakeMeal'],
      confidence: ['low']
    }
  },
  {
    id: 24,
    name: 'recent meal context loses to shaking and dizziness',
    input: { hungerLevel: 5, controlLevel: 8, safetyFlags: [F.dizzy, F.shaky] },
    context: { justAte: true, recentBalancedMeal: true, satietyLagLikely: true },
    expected: {
      status: ['fed'],
      risk: ['stop'],
      food: ['foodFirst'],
      action: ['doNotDelay'],
      hardOverride: O.delayForbidden,
      delayAllowed: false
    }
  },
  {
    id: 25,
    name: 'low control and failed history make moderate hunger high risk',
    input: { hungerLevel: 5, controlLevel: 2, cravingLevel: 9, hungerTrend: 'rising', safetyFlags: [] },
    context: {
      lastMealAt: '2026-07-03T14:00:00+03:00',
      strongCraving: true,
      failedDelayHistory: true
    },
    expected: {
      status: ['reboundRisk', 'stableBetweenMeals'],
      risk: ['high'],
      food: ['meal', 'foodFirst'],
      action: ['riskBrakeMeal', 'eatMeal']
    }
  },
  {
    id: 26,
    name: 'UI state exposes non-numeric Food Support Need and computed risk rail',
    input: { hungerLevel: 5, controlLevel: 7, safetyFlags: [] },
    context: { lastMealAt: '2026-07-03T09:00:00+03:00' },
    expected: {
      status: ['stableBetweenMeals'],
      risk: ['low', 'medium'],
      food: ['checkpoint'],
      action: ['observe', 'hydratePause', 'delayWithCheck']
    }
  },
  {
    id: 27,
    name: 'ED-sensitive profile removes delay and zero-kcal language',
    input: { hungerLevel: 4, controlLevel: 8, safetyFlags: [F.activeOrPastEatingDisorder] },
    context: {
      lastMealAt: '2026-07-03T10:00:00+03:00',
      activeOrPastEatingDisorder: true,
      edSensitive: true
    },
    expected: {
      status: ['medicalCaution'],
      risk: ['high'],
      food: ['foodFirst'],
      action: ['doNotDelay'],
      hardOverride: O.medicalBoundary,
      delayAllowed: false,
      copyRisk: 'foodFirstOnly'
    }
  }
];

function expectIn(values, actual, label) {
  expect(values, label).toContain(actual);
}

function expectFoodBandShape(decision) {
  if (!decision.foodBandKcal) return;
  expect(Array.isArray(decision.foodBandKcal)).toBe(true);
  expect(decision.foodBandKcal.length).toBe(2);
  expect(decision.foodBandKcal[0]).toBeLessThanOrEqual(decision.foodBandKcal[1]);
}

describe('HungerEnergyStatus pure engine', () => {
  it('is exposed as a pure HEYS module', () => {
    expect(HES).toBeDefined();
    expect(typeof HES.assessHungerEvent).toBe('function');
    expect(typeof HES.calculateFoodPriority).toBe('function');
  });

  it.each(scenarios)('scenario $id: $name', ({ input, context, expected }) => {
    const decision = HES.assessHungerEvent(input, context);

    expect(decision.invariantErrors).toEqual([]);
    expectIn(expected.status, decision.energyStatus.label, 'Energy Status band');
    expectIn(expected.risk, decision.riskBudget.level, 'Risk Budget band');
    expectIn(expected.food, decision.foodPriority.level, 'Food Priority band');
    expectIn(expected.action, decision.suggestedAction, 'Action family');
    expectFoodBandShape(decision);

    if (expected.confidence) expectIn(expected.confidence, decision.confidence, 'Confidence band');
    if (expected.hardOverride !== undefined) expect(decision.hardOverride).toBe(expected.hardOverride);
    if (expected.delayAllowed !== undefined) expect(decision.delayAllowed).toBe(expected.delayAllowed);
    if (expected.copyRisk) expect(decision.copyRisk).toBe(expected.copyRisk);
  });

  it('covers the 27 documented acceptance scenarios', () => {
    expect(scenarios).toHaveLength(27);
  });

  it('never exposes numeric Food Priority score as user-facing UI', () => {
    for (const scenario of scenarios) {
      const decision = HES.assessHungerEvent(scenario.input, scenario.context);
      expect(decision.foodPriority.userLabel).toBe('Food Support Need');
      expect(decision.foodPriority.displayScore).toBe(false);
      expect(decision.ui.foodSupportNeed.displayScore).toBe(false);
    }
  });

  it('keeps hard overrides fail-closed', () => {
    const cases = scenarios
      .map((scenario) => HES.assessHungerEvent(scenario.input, scenario.context))
      .filter((decision) => decision.hardOverride);

    expect(cases.length).toBeGreaterThan(0);
    for (const decision of cases) {
      expect(decision.delayAllowed).toBe(false);
      expect(decision.recheckAfterMin).toBeUndefined();
      expect(['observe', 'hydratePause', 'coffeePause', 'delayWithCheck']).not.toContain(decision.suggestedAction);
    }
  });

  it('uses fastCarbSafety only for hypoglycemia or glucose-related medical context', () => {
    const ordinaryWeakHunger = HES.assessHungerEvent(
      { hungerLevel: 8, controlLevel: 6, safetyFlags: [F.shaky] },
      { lastMealAt: '2026-07-03T08:00:00+03:00' }
    );
    const glucoseContext = HES.assessHungerEvent(
      { hungerLevel: 8, controlLevel: 6, safetyFlags: [F.shaky, F.diabetes] },
      { lastMealAt: '2026-07-03T08:00:00+03:00', diabetes: true }
    );

    expect(ordinaryWeakHunger.hardOverride).toBe(O.delayForbidden);
    expect(glucoseContext.hardOverride).toBe(O.fastCarbSafety);
    expect(glucoseContext.suggestedAction).toBe('fastCarbSafety');
    expect(glucoseContext.postFoodOutcomeAfterMin).toEqual([15, 15]);
    expect(glucoseContext.foodBandKcal).toBeUndefined();
    expect(glucoseContext.requiresCuratorReview).toBe(true);
  });

  it('does not let hunger intensity directly equal risk or food priority', () => {
    const highHungerRecentMeal = HES.assessHungerEvent(
      { hungerLevel: 8, controlLevel: 8, hungerTrend: 'rising', safetyFlags: [] },
      { justAte: true, recentBalancedMeal: true, satietyLagLikely: true, focus: 'stable' }
    );
    const moderateHungerHighRisk = HES.assessHungerEvent(
      { hungerLevel: 5, controlLevel: 2, cravingLevel: 9, hungerTrend: 'rising', safetyFlags: [] },
      { lastMealAt: '2026-07-03T14:00:00+03:00', strongCraving: true, failedDelayHistory: true }
    );

    expect(highHungerRecentMeal.foodPriority.level).toBe('checkpoint');
    expect(['low', 'medium']).toContain(highHungerRecentMeal.riskBudget.level);
    expect(moderateHungerHighRisk.riskBudget.level).toBe('high');
    expect(['meal', 'foodFirst']).toContain(moderateHungerHighRisk.foodPriority.level);
  });

  it('treats recentFullMeal as the same protective context as recentBalancedMeal', () => {
    const highHungerAfterFullMeal = HES.assessHungerEvent(
      { hungerLevel: 8, controlLevel: 8, hungerTrend: 'rising', safetyFlags: [] },
      {
        recentMeal: true,
        recentFullMeal: true,
        lastMealQualityTone: 'good',
        lastMealKcal: 850,
        lastMealProtein: 45,
        hoursSinceMeal: 0.4,
        focus: 'stable'
      }
    );

    expect(highHungerAfterFullMeal.energyStatus.label).toBe('fed');
    expect(highHungerAfterFullMeal.foodPriority.level).toBe('checkpoint');
    expect(highHungerAfterFullMeal.riskBudget.driversDown).toContain('recent_meal_or_satiety_lag');
    expect(highHungerAfterFullMeal.foodPriority.driversDown).toContain('recent_balanced_meal');
  });

  it('uses clarification answers as algorithm inputs', () => {
    const stressAnswer = HES.assessHungerEvent(
      { hungerLevel: 6, controlLevel: 6, hungerTrend: 'stable', safetyFlags: [], hungerReasons: ['stress'] },
      { lastMealAt: '2026-07-03T14:00:00+03:00' }
    );
    const mismatchAnswer = HES.assessHungerEvent(
      { hungerLevel: 8, controlLevel: 8, hungerTrend: 'rising', safetyFlags: [], hungerReasons: ['meal_time_mismatch'] },
      {
        recentMeal: true,
        recentFullMeal: true,
        lastMealQualityTone: 'good',
        lastMealKcal: 850,
        lastMealProtein: 45,
        hoursSinceMeal: 0.4,
        focus: 'stable'
      }
    );

    expect(stressAnswer.riskBudget.driversUp).toContain('reported_stress');
    expect(stressAnswer.foodPriority.driversUp).toContain('reported_stress');
    expect(mismatchAnswer.foodPriority.driversDown).toContain('meal_time_mismatch');
    expect(mismatchAnswer.confidence).toBe('medium');

    const stableRecentFood = HES.assessHungerEvent(
      { hungerLevel: 1, hungerTrend: 'stable', safetyFlags: [], stableHungerReasons: ['recent_food'] },
      { recentMeal: true, recentFullMeal: true, lastMealKcal: 800, lastMealProtein: 40, hoursSinceMeal: 1 }
    );
    expect(stableRecentFood.foodPriority.driversDown).toContain('stable_hunger_recent_food');
    expect(stableRecentFood.explanation).toContain('stable_hunger_recent_food');
  });

  it('keeps meal-level food support aligned with meal-level action and kcal band', () => {
    const repeatedRisingHungerAfterLongGap = HES.assessHungerEvent(
      { hungerLevel: 8, controlLevel: 8, hungerTrend: 'rising', safetyFlags: [] },
      {
        lastMealAt: '2026-07-02T23:35:00',
        hoursSinceMeal: 14.85,
        remainingKcal: 1525,
        repeatedHighHungerToday: true,
        checkpointAttemptCount: 4
      }
    );

    expect(repeatedRisingHungerAfterLongGap.invariantErrors).toEqual([]);
    expect(repeatedRisingHungerAfterLongGap.foodPriority.level).toBe('meal');
    expect(repeatedRisingHungerAfterLongGap.suggestedAction).toBe('eatMeal');
    expect(repeatedRisingHungerAfterLongGap.foodBandKcal).toEqual([400, 700]);
    expect(repeatedRisingHungerAfterLongGap.delayAllowed).toBe(false);
  });

  it('does not describe repeated checkpoints as failed delay history', () => {
    const recentMealRisingHunger = HES.assessHungerEvent(
      { hungerLevel: 2, hungerTrend: 'rising', safetyFlags: [] },
      {
        lastMealAt: '2026-07-04T23:35:00',
        hoursSinceMeal: 0.5,
        recentMeal: true,
        todayMealCount: 3,
        remainingKcal: 0,
        checkpointAttemptCount: 2,
        failedDelayHistory: false
      }
    );

    expect(recentMealRisingHunger.suggestedAction).toBe('hydratePause');
    expect(recentMealRisingHunger.riskBudget.driversUp).toContain('repeated_checkpoints');
    expect(recentMealRisingHunger.riskBudget.driversUp).not.toContain('failed_delay_history');
  });

  it('plans the next meal instead of recommending food now when low hunger follows a recent meal', () => {
    const lowHungerAfterRecentMeal = HES.assessHungerEvent(
      { hungerLevel: 1, hungerTrend: 'falling', safetyFlags: [] },
      {
        lastMealAt: '2026-07-06T17:45:00',
        hoursSinceMeal: 0.63,
        recentMeal: true,
        todayMealCount: 2,
        veryLowIntakeDay: true,
        previousHungerLevel: 4,
        minutesSinceLastHungerEvent: 43
      }
    );

    expect(lowHungerAfterRecentMeal.invariantErrors).toEqual([]);
    expect(lowHungerAfterRecentMeal.energyStatus.label).toBe('fed');
    expect(lowHungerAfterRecentMeal.riskBudget.driversUp).toContain('nutrition_floor_risk');
    expect(lowHungerAfterRecentMeal.suggestedAction).toBe('planNextMeal');
    expect(lowHungerAfterRecentMeal.delayAllowed).toBe(true);
    expect(lowHungerAfterRecentMeal.foodBandKcal).toBeUndefined();
    expect(lowHungerAfterRecentMeal.recheckAfterMin).toBe(45);
  });

  it('plans the next meal for low hunger after a very long gap without encoding zero food', () => {
    const lowHungerLongGap = HES.assessHungerEvent(
      { hungerLevel: 2, hungerTrend: 'unknown', safetyFlags: [] },
      {
        lastMealAt: '2026-07-03T19:00:00',
        hoursSinceMeal: 25.35,
        remainingKcal: 1526,
        noIntakeToday: true
      }
    );

    expect(lowHungerLongGap.invariantErrors).toEqual([]);
    expect(lowHungerLongGap.suggestedAction).toBe('planNextMeal');
    expect(lowHungerLongGap.delayAllowed).toBe(true);
    expect(lowHungerLongGap.foodBandKcal).toBeUndefined();
    expect(lowHungerLongGap.recheckAfterMin).toBe(60);
  });

  it('avoids exact food bands when meal data is stale or missing', () => {
    const stale = HES.assessHungerEvent(
      { hungerLevel: 6, controlLevel: 6, safetyFlags: [], dataFreshness: 'stale' },
      { dataFreshness: 'stale' }
    );
    const missingMeal = HES.assessHungerEvent(
      { hungerLevel: 6, controlLevel: 6, safetyFlags: [] },
      {}
    );

    expect(stale.foodBandKcal).toBeUndefined();
    expect(missingMeal.foodBandKcal).toBeUndefined();
  });
});
