import fs from 'fs';
import path from 'path';

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const originalWindow = global.window;
const originalHEYS = global.HEYS;
const originalLocalStorage = global.localStorage;
const originalDocument = global.document;

const memory = new Map();

global.window = global;
global.document = undefined;
global.localStorage = {
  getItem(key) {
    return memory.has(key) ? memory.get(key) : null;
  },
  setItem(key, value) {
    memory.set(key, String(value));
  }
};
global.HEYS = {
  utils: {
    lsGet(key, fallback) {
      const raw = memory.get(key);
      return raw ? JSON.parse(raw) : fallback;
    },
    lsSet(key, value) {
      memory.set(key, JSON.stringify(value));
    },
    getCurrentClientId() {
      return 'client-a';
    },
    uuid() {
      return 'test-id';
    }
  },
  HungerEnergyStatus: {
    SAFETY_FLAGS: { shaky: 'shaky' }
  }
};

const uiPath = path.resolve(__dirname, '../heys_hunger_energy_status_ui_v1.js');
const uiSource = fs.readFileSync(uiPath, 'utf8');
const dayTabImplSource = fs.readFileSync(path.resolve(__dirname, '../heys_day_tab_impl_v1.js'), 'utf8');
const dayTabRenderSource = fs.readFileSync(path.resolve(__dirname, '../heys_day_tab_render_v1.js'), 'utf8');
const dayPageShellSource = fs.readFileSync(path.resolve(__dirname, '../heys_day_page_shell.js'), 'utf8');
const dayDiarySectionSource = fs.readFileSync(path.resolve(__dirname, '../heys_day_diary_section.js'), 'utf8');
eval(uiSource);

const Storage = global.HEYS.HungerEnergyStatusStorage;
const Adapter = global.HEYS.HungerEnergyStatusAdapter;

beforeEach(() => {
  memory.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-04T12:00:00Z'));
  global.HEYS.dayUtils = { loadDay: () => null };
});

afterAll(() => {
  vi.useRealTimers();
  global.window = originalWindow;
  global.HEYS = originalHEYS;
  global.localStorage = originalLocalStorage;
  global.document = originalDocument;
});

describe('Hunger Energy Status UI adapter', () => {
  it('passes expenditure and the effective day target into hunger context', () => {
    expect(dayTabImplSource).toContain('displayOptimum,\n            tdee,');
    expect(dayTabRenderSource).toContain('displayOptimum: ctx.displayOptimum');
    expect(dayTabRenderSource).toContain('tdee: ctx.tdee');
    expect(dayPageShellSource).toContain('optimum: displayOptimum || optimum');
  });

  it('builds a relative daily energy context and preserves an explicit zero intake', () => {
    vi.setSystemTime(new Date('2026-07-04T18:00:00'));

    const low = Adapter.buildContextFromDay({
      date: '2026-07-04',
      day: { date: '2026-07-04', meals: [], savedEatenKcal: 1600 },
      eatenKcal: 800,
      optimum: 2000,
      tdee: 2300
    });
    const over = Adapter.buildContextFromDay({
      date: '2026-07-04',
      day: { date: '2026-07-04', meals: [] },
      eatenKcal: 2150,
      optimum: 2000,
      tdee: 2300
    });
    const cleared = Adapter.buildContextFromDay({
      date: '2026-07-04',
      day: { date: '2026-07-04', meals: [], savedEatenKcal: 1600, savedDisplayOptimum: 2100 },
      eatenKcal: 0
    });

    expect(low).toMatchObject({
      dayEatenKcal: 800,
      dayTargetKcal: 2000,
      dayTdeeKcal: 2300,
      dayIntakeRatio: 0.4,
      dayEnergyBalanceKcal: 1200,
      remainingKcal: 1200,
      veryLowIntakeDay: true
    });
    expect(over).toMatchObject({
      dayEnergyBalanceKcal: -150,
      remainingKcal: 0,
      veryLowIntakeDay: false
    });
    expect(cleared).toMatchObject({
      dayEatenKcal: 0,
      dayTargetKcal: 2100,
      dayEnergyBalanceKcal: 2100,
      remainingKcal: 2100,
      veryLowIntakeDay: false
    });
  });

  it('calculates energy context when hunger assessment opens outside the day tab', () => {
    global.HEYS.TDEE = {
      calculate(day, profile) {
        expect(day.date).toBe('2026-07-04');
        expect(profile.goal).toBe('maintain');
        return { optimum: 2050, tdee: 2280 };
      }
    };
    memory.set('heys_profile', JSON.stringify({ goal: 'maintain' }));

    try {
      const context = Adapter.buildContextFromDay({
        date: '2026-07-04',
        day: {
          date: '2026-07-04',
          meals: [{ time: '11:00', items: [{ name: 'Обед', grams: 100, kcal100: 700 }] }]
        }
      });

      expect(context).toMatchObject({
        dayEatenKcal: 700,
        dayTargetKcal: 2050,
        dayTdeeKcal: 2280,
        dayEnergyBalanceKcal: 1350,
        remainingKcal: 1350
      });
    } finally {
      delete global.HEYS.TDEE;
    }
  });

  it('does not auto-open over an active morning check-in', () => {
    expect(uiSource).toContain('function hasActiveMorningCheckin()');
    expect(uiSource).toContain("['open', 'in_progress', 'failed'].includes(status.state)");
    expect(uiSource).toContain('if (hasActiveMorningCheckin())');
    expect(uiSource).toContain('if (attempt < 24) scheduleAutoOpen(reason, attempt + 1);');
    expect(uiSource).toContain("global.addEventListener?.('heys:checkin-complete', onCheckinComplete)");
  });

  it('does not auto-open hunger clarification over an active meal modal', () => {
    expect(uiSource).toContain('function hasBlockingModal()');
    expect(uiSource).toContain("modalId !== 'hunger-energy-status-modal'");
    expect(uiSource).toContain('if (hasBlockingModal()) return;');
    expect(uiSource.indexOf('if (hasBlockingModal()) return;')).toBeLessThan(
      uiSource.indexOf('if (findDueOutcomeFollowUp())')
    );
  });

  it('does not auto-open within 15 minutes of the previous hunger assessment', () => {
    Storage.writeEvents([
      { id: 'recent', recordedAt: '2026-07-04T11:45:00Z', hungerLevel: 4 }
    ]);

    expect(Adapter.hasRecentHungerAssessment()).toBe(true);

    Storage.writeEvents([
      { id: 'older', recordedAt: '2026-07-04T11:44:59Z', hungerLevel: 4 }
    ]);

    expect(Adapter.hasRecentHungerAssessment()).toBe(false);
    expect(uiSource).toContain('if (hasRecentHungerAssessment()) return;');
  });

  it('stores hunger events as cloud-ready idempotent rows', () => {
    const row = Storage.addEvent({
      id: 'event-1',
      source: 'day-fab',
      recordedAt: '2026-07-04T11:00:00Z',
      hungerLevel: 5,
      outcome: 'calculated'
    });

    expect(row.schemaVersion).toBe(1);
    expect(row.storageKey).toBe('heys_hunger_energy_status_events_v1');
    expect(row.cloudSyncKey).toBe('heys_hunger_energy_status_events_v1');
    expect(row.syncStatus).toBe('queued');
    expect(row.clientId).toBe('client-a');

    Storage.writeEvents([
      row,
      {
        ...row,
        hungerLevel: 6,
        updatedAt: '2026-07-04T11:10:00Z'
      }
    ]);

    const rows = Storage.readEvents();
    expect(rows).toHaveLength(1);
    expect(rows[0].hungerLevel).toBe(6);
    expect(rows[0].updatedAt).toBe('2026-07-04T11:10:00Z');
  });

  it('schedules delay follow-up by time but waits for a meal after food advice', () => {
    const delay = Storage.buildOutcomePlan(
      { suggestedAction: 'delayWithCheck', recheckAfterMin: 25 },
      '2026-07-04T12:00:00Z'
    );
    const food = Storage.buildOutcomePlan(
      { suggestedAction: 'riskBrakeMeal' },
      '2026-07-04T12:00:00Z'
    );

    expect(delay).toMatchObject({ family: 'delay', status: 'pending', dueAt: '2026-07-04T12:25:00.000Z' });
    expect(food).toMatchObject({ family: 'food', status: 'waiting_for_meal', dueAt: null });
  });

  it('starts a food follow-up only after a recorded meal', () => {
    Storage.addEvent({
      id: 'food-advice',
      recordedAt: '2026-07-04T11:00:00Z',
      date: '2026-07-04',
      decisionSnapshot: { suggestedAction: 'riskBrakeMeal' },
      outcomePlan: Storage.buildOutcomePlan({ suggestedAction: 'riskBrakeMeal' }, '2026-07-04T11:00:00Z'),
      outcome: 'calculated'
    });

    expect(Storage.linkMealToWaitingOutcome({ time: '2026-07-04T12:00:00Z', items: [] }, '2026-07-04')).toBeNull();
    Storage.linkMealToWaitingOutcome({ time: '2026-07-04T12:00:00Z', items: [{ name: 'Обед' }] }, '2026-07-04');

    expect(Storage.readEvents()[0].outcomePlan).toMatchObject({
      status: 'pending',
      mealAt: '2026-07-04T12:00:00.000Z',
      dueAt: '2026-07-04T12:45:00.000Z'
    });
  });

  it('stores an explicit follow-up answer for calibration', () => {
    Storage.addEvent({
      id: 'delay-advice',
      recordedAt: '2026-07-04T10:00:00Z',
      decisionSnapshot: { suggestedAction: 'delayWithCheck' },
      outcomePlan: Storage.buildOutcomePlan({ suggestedAction: 'delayWithCheck' }, '2026-07-04T10:00:00Z'),
      outcome: 'calculated'
    });

    Storage.recordOutcomeFollowUp('delay-advice', 'hunger_passed');

    expect(Storage.readEvents()[0]).toMatchObject({
      outcome: 'hunger_passed',
      outcomePlan: { status: 'answered', userReported: 'hunger_passed' }
    });
  });

  it('stops follow-up reminders after two snoozes', () => {
    Storage.addEvent({
      id: 'delay-snooze',
      recordedAt: '2026-07-04T10:00:00Z',
      outcomePlan: Storage.buildOutcomePlan({ suggestedAction: 'delayWithCheck' }, '2026-07-04T10:00:00Z')
    });

    Storage.snoozeOutcomeFollowUp('delay-snooze');
    expect(Storage.readEvents()[0].outcomePlan).toMatchObject({ status: 'pending', snoozeCount: 1 });

    Storage.snoozeOutcomeFollowUp('delay-snooze');
    expect(Storage.readEvents()[0].outcomePlan).toMatchObject({
      status: 'dismissed_after_snoozes',
      dueAt: null,
      snoozeCount: 2
    });
  });

  it('keeps the saved hunger change and exposes the exact recheck time', () => {
    expect(Adapter.getHungerChangeNote(
      { hungerLevel: 2 },
      { previousHungerLevel: 3, minutesSinceLastHungerEvent: 56 }
    )).toBe('Было 3 → стало 2 за 56 мин');
    expect(Adapter.getRecommendationDetail({ suggestedAction: 'hydratePause', recheckAfterMin: 20 }))
      .toContain('через 20 мин');
    expect(Adapter.getNextBestAction({ decision: { suggestedAction: 'hydratePause', recheckAfterMin: 20 } }))
      .toMatchObject({ title: 'Повторить оценку через 20 мин', type: 'check' });
  });

  it('compacts low-hunger history rows before cloud sync storage', () => {
    const heavyText = 'x'.repeat(12000);
    Storage.addEvent({
      id: 'heavy-low-hunger',
      eventType: 'low_hunger_meal_reason',
      recordedAt: '2026-07-04T11:00:00Z',
      reason: 'habit_snack',
      patternKey: 'snack:cookie',
      mealSignature: 'cookie',
      mealAnalysis: {
        category: 'snack',
        suggestedReason: 'habit_snack',
        patternKey: 'snack:cookie',
        signature: 'cookie',
        kcal: 340,
        macroGrams: 41.234,
        names: ['Cookie', heavyText]
      },
      patternStats: {
        windowDays: 30,
        repeatCount: 4,
        sameReason: 4,
        samePattern: 3,
        needsPatternWork: true,
        isRepeated: true
      },
      curatorCard: {
        title: 'Еда при низком голоде',
        reason: 'habit_snack',
        weeklyDigest: heavyText,
        debugPayload: heavyText
      },
      gentlePlan: {
        experiment: {
          title: 'Мягкий эксперимент',
          detail: heavyText
        }
      },
      savedSummary: heavyText,
      suggestionConfidence: { detail: heavyText }
    });

    const raw = memory.get('heys_hunger_energy_status_events_v1');
    const rows = Storage.readEvents();
    expect(raw.length).toBeLessThan(6000);
    expect(rows[0]).toMatchObject({
      eventType: 'low_hunger_meal_reason',
      reason: 'habit_snack',
      patternKey: 'snack:cookie',
      mealSignature: 'cookie',
      mealAnalysis: {
        category: 'snack',
        kcal: 340,
        names: ['Cookie', 'x'.repeat(80)]
      },
      patternStats: {
        repeatCount: 4,
        needsPatternWork: true
      }
    });
    expect(rows[0].curatorCard.debugPayload).toBeUndefined();
    expect(rows[0].savedSummary).toBeUndefined();
  });

  it('migrates already bloated low-hunger rows on read', () => {
    const heavyText = 'y'.repeat(14000);
    memory.set('heys_hunger_energy_status_events_v1', JSON.stringify([
      {
        id: 'old-heavy-low-hunger',
        eventType: 'low_hunger_meal_reason',
        storageKey: 'heys_hunger_energy_status_events_v1',
        cloudSyncKey: 'heys_hunger_energy_status_events_v1',
        syncStatus: 'queued',
        clientId: 'client-a',
        createdAt: '2026-07-04T11:00:00Z',
        recordedAt: '2026-07-04T11:00:00Z',
        updatedAt: '2026-07-04T11:00:00Z',
        reason: 'caffeine_additions',
        patternKey: 'caffeine_additions:latte',
        mealSignature: 'latte',
        mealAnalysis: {
          category: 'caffeine_additions',
          suggestedReason: 'caffeine_additions',
          patternKey: 'caffeine_additions:latte',
          signature: 'latte',
          kcal: 180,
          names: ['Latte', heavyText]
        },
        curatorCard: { title: 'Еда при низком голоде', debugPayload: heavyText },
        savedSummary: heavyText
      }
    ]));

    const before = memory.get('heys_hunger_energy_status_events_v1');
    const rows = Storage.readEvents();
    const after = memory.get('heys_hunger_energy_status_events_v1');

    expect(before.length).toBeGreaterThan(20000);
    expect(after.length).toBeLessThan(6000);
    expect(rows[0]).toMatchObject({
      id: 'old-heavy-low-hunger',
      reason: 'caffeine_additions',
      patternKey: 'caffeine_additions:latte',
      mealAnalysis: {
        category: 'caffeine_additions',
        kcal: 180,
        names: ['Latte', 'y'.repeat(80)]
      }
    });
    expect(rows[0].savedSummary).toBeUndefined();
  });

  it('updates an existing hunger event without creating a new row', () => {
    Storage.addEvent({
      id: 'edit-me',
      source: 'day-fab',
      recordedAt: '2026-07-04T11:00:00Z',
      hungerLevel: 4,
      input: { hungerLevel: 4 }
    });

    const updated = Storage.updateEvent('edit-me', (row) => ({
      hungerLevel: 7,
      input: { ...(row.input || {}), hungerLevel: 7 },
      editedAt: '2026-07-04T11:05:00Z'
    }));

    const rows = Storage.readEvents();
    expect(rows).toHaveLength(1);
    expect(updated.hungerLevel).toBe(7);
    expect(rows[0].input.hungerLevel).toBe(7);
    expect(rows[0].syncStatus).toBe('queued');
    expect(rows[0].editedAt).toBe('2026-07-04T11:05:00Z');
  });

  it('ignores qa events when building personal hunger history', () => {
    Storage.writeEvents([
      {
        id: 'qa-risk',
        source: 'qa',
        createdAt: '2026-07-04T09:00:00Z',
        recordedAt: '2026-07-04T09:00:00Z',
        hungerLevel: 9,
        outcome: 'lost_control',
        decision: { riskLevel: 'high', suggestedAction: 'observe' }
      },
      {
        id: 'real-calm',
        source: 'day-fab',
        createdAt: '2026-07-04T10:00:00Z',
        recordedAt: '2026-07-04T10:00:00Z',
        hungerLevel: 3,
        outcome: 'calculated',
        decision: { riskLevel: 'low', suggestedAction: 'observe' }
      }
    ]);

    const history = Storage.buildHistorySignals();

    expect(history.personalPatternEvents).toBe(0);
    expect(history.recentHighHungerCount6h).toBe(0);
    expect(history.previousHungerLevel).toBe(3);
    expect(history.personalHungerModel.sampleSize).toBe(0);
  });

  it('counts only real delay recommendations after the latest meal as checkpoints', () => {
    Storage.writeEvents([
      {
        id: 'delay-before-meal',
        source: 'day-fab',
        createdAt: '2026-07-04T10:30:00Z',
        recordedAt: '2026-07-04T10:30:00Z',
        hungerLevel: 5,
        outcome: 'hunger_grew',
        decision: { suggestedAction: 'observe', riskLevel: 'medium' }
      },
      {
        id: 'delay-after-meal',
        source: 'day-fab',
        createdAt: '2026-07-04T11:00:00Z',
        recordedAt: '2026-07-04T11:00:00Z',
        hungerLevel: 6,
        outcome: 'hunger_grew',
        decision: { suggestedAction: 'delayWithCheck', riskLevel: 'medium' }
      },
      {
        id: 'food-assessment',
        source: 'day-fab',
        createdAt: '2026-07-04T11:30:00Z',
        recordedAt: '2026-07-04T11:30:00Z',
        hungerLevel: 7,
        outcome: 'calculated',
        decision: { suggestedAction: 'riskBrakeMeal', riskLevel: 'medium' }
      }
    ]);

    const history = Storage.buildHistorySignals('2026-07-04T10:45:00Z');

    expect(history.checkpointAttemptCount).toBe(1);
    expect(history.recentFailedCheckpointCount).toBe(1);
  });

  it('treats one-point noise as stable and expires trend after three hours', () => {
    expect(Adapter.resolveHungerTrend(6, {
      previousHungerLevel: 5,
      minutesSinceLastHungerEvent: 179
    })).toBe('stable');
    expect(Adapter.resolveHungerTrend(7, {
      previousHungerLevel: 5,
      minutesSinceLastHungerEvent: 179
    })).toBe('rising');
    expect(Adapter.resolveHungerTrend(7, {
      previousHungerLevel: 5,
      minutesSinceLastHungerEvent: 181
    })).toBe('unknown');
  });

  it('marks score-changing factors as active and keeps counterfactuals distinct', () => {
    const previousAssess = global.HEYS.HungerEnergyStatus.assessHungerEvent;
    global.HEYS.HungerEnergyStatus.assessHungerEvent = (input, context) => {
      const hunger = Number(input.hungerLevel) || 0;
      const isRecent = Number(context.hoursSinceMeal) === 2;
      const noTrend = input.hungerTrend === 'unknown';
      const firstCheck = Number(context.checkpointAttemptCount) === 0;
      const suggestedAction = isRecent ? 'eatSnack' : noTrend ? 'observe' : firstCheck ? 'hydratePause' : 'eatMeal';
      return {
        riskBudget: { score: hunger * 2 + (firstCheck ? 0 : 5), level: firstCheck ? 'low' : 'medium', driversUp: [], driversDown: [] },
        foodPriority: { score: hunger * 3, level: isRecent ? 'snack' : 'meal', driversUp: [], driversDown: [] },
        suggestedAction,
        foodBandKcal: isRecent ? [200, 400] : [400, 700]
      };
    };

    try {
      const input = { now: '2026-07-04T12:00:00Z', hungerLevel: 8, hungerTrend: 'rising' };
      const context = { hoursSinceMeal: 3.7, checkpointAttemptCount: 2 };
      const base = global.HEYS.HungerEnergyStatus.assessHungerEvent(input, context);
      const trace = Adapter.buildDecisionTrace(input, context, base);
      const counterfactuals = Adapter.buildCounterfactuals(input, context);

      expect(trace.find((row) => row.factor === 'hungerLevel')?.activeDriver).toBe(true);
      expect(counterfactuals.map((row) => row.id)).toEqual(['meal_two_hours_ago', 'trend_not_rising', 'without_repeat']);
      expect(new Set(counterfactuals.map((row) => row.suggestedAction)).size).toBe(3);
    } finally {
      global.HEYS.HungerEnergyStatus.assessHungerEvent = previousAssess;
    }
  });

  it('applies learned long-gap delay risk only when the current meal gap is long', () => {
    Storage.writeEvents([
      ...[1, 2, 3].map((n) => ({
        id: 'bad-delay-' + n,
        source: 'day-fab',
        createdAt: `2026-07-0${n}T10:00:00Z`,
        recordedAt: `2026-07-0${n}T10:00:00Z`,
        hungerLevel: 7,
        outcome: 'hunger_grew',
        decision: { suggestedAction: 'observe', riskLevel: 'medium' },
        context: { hoursSinceMeal: 10 }
      })),
      ...[1, 2, 3].map((n) => ({
        id: 'food-ok-' + n,
        source: 'day-fab',
        createdAt: `2026-07-0${n}T16:00:00Z`,
        recordedAt: `2026-07-0${n}T16:00:00Z`,
        hungerLevel: 6,
        outcome: 'ate_calmly',
        decision: { suggestedAction: 'riskBrakeMeal', riskLevel: 'medium' },
        context: { hoursSinceMeal: 10 }
      }))
    ]);

    const recentContext = Adapter.buildContextFromDay({
      date: '2026-07-04',
      day: {
        date: '2026-07-04',
        meals: [{ time: '10:30', items: [{ name: 'meal' }] }]
      }
    });
    const longGapContext = Adapter.buildContextFromDay({
      date: '2026-07-04',
      day: {
        date: '2026-07-04',
        meals: [{ time: '01:00', items: [{ name: 'meal' }] }]
      }
    });

    expect(recentContext.personalHungerModel.learnedEnough).toBe(true);
    expect(recentContext.personalHungerModel.longGapDelayRiskHigh).toBe(true);
    expect(recentContext.failedDelayHistory).toBe(false);
    expect(longGapContext.failedDelayHistory).toBe(true);
    expect(longGapContext.personalLearningApplied.longGapNow).toBe(true);
  });

  it('does not train normal hunger model from fast-carb safety outcomes', () => {
    Storage.writeEvents([
      {
        id: 'safety-1',
        source: 'day-fab',
        createdAt: '2026-07-04T09:00:00Z',
        recordedAt: '2026-07-04T09:00:00Z',
        hungerLevel: 6,
        outcome: 'symptoms_better',
        decision: { suggestedAction: 'fastCarbSafety', riskLevel: 'stop' },
        outcomePlan: { userReported: 'symptoms_better', userReportedAt: '2026-07-04T09:15:00Z' }
      },
      {
        id: 'food-1',
        source: 'day-fab',
        createdAt: '2026-07-04T10:00:00Z',
        recordedAt: '2026-07-04T10:00:00Z',
        hungerLevel: 5,
        outcome: 'hunger_lower',
        decision: { suggestedAction: 'riskBrakeMeal', riskLevel: 'medium' },
        outcomePlan: { userReported: 'hunger_lower', userReportedAt: '2026-07-04T10:45:00Z' }
      }
    ]);

    const history = Storage.buildHistorySignals();

    expect(history.personalHungerModel.sampleSize).toBe(1);
    expect(history.personalHungerModel.ignoredSafetyOutcomeCount).toBe(1);
    expect(history.personalHungerModel.goodFoodCount).toBe(1);
  });

  it('prompts for context when hunger stays within one point for a long time', () => {
    const repeatPrompt = Adapter.buildStableHungerPrompt(
      { hungerLevel: 1, now: '2026-07-04T12:00:00Z' },
      { previousHungerLevel: 1, previousHungerEventId: 'repeat-anchor', previousHungerEventAt: '2026-07-04T11:59:00Z', minutesSinceLastHungerEvent: 1 }
    );
    expect(repeatPrompt).toMatchObject({
      type: 'stable_hunger_repeat',
      question: 'Почему оценка не меняется?',
      previousLevel: 1,
      currentLevel: 1,
      minutesSincePrevious: 1,
      anchorEventId: 'repeat-anchor'
    });

    Storage.writeEvents([
      {
        id: 'stable-anchor',
        source: 'day-fab',
        createdAt: '2026-07-04T10:00:00Z',
        recordedAt: '2026-07-04T10:00:00Z',
        hungerLevel: 4
      },
      {
        id: 'stable-recent',
        source: 'day-fab',
        createdAt: '2026-07-04T11:45:00Z',
        recordedAt: '2026-07-04T11:45:00Z',
        hungerLevel: 5
      }
    ]);
    const prompt = Adapter.buildStableHungerPrompt(
      { hungerLevel: 5, now: '2026-07-04T12:00:00Z' },
      { previousHungerLevel: 5, minutesSinceLastHungerEvent: 15 }
    );

    expect(prompt).toMatchObject({
      type: 'stable_hunger_long',
      question: 'Почему голод не растёт?',
      previousLevel: 4,
      currentLevel: 5,
      minutesSincePrevious: 120,
      anchorEventId: 'stable-anchor'
    });
    expect(uiSource).toContain("label: 'На суете'");
    expect(uiSource).toContain("label: 'Еда держит'");
    expect(Adapter.buildStableHungerPrompt(
      { hungerLevel: 7, now: '2026-07-04T12:00:00Z' },
      { previousHungerLevel: 4, minutesSinceLastHungerEvent: 120 }
    )).toBeNull();
    expect(Adapter.buildStableHungerPrompt(
      { hungerLevel: 5, now: '2026-07-04T12:00:00Z' },
      { previousHungerLevel: 2, minutesSinceLastHungerEvent: 15 }
    )).toBeNull();
    Storage.writeEvents([]);
    expect(Adapter.buildStableHungerPrompt(
      { hungerLevel: 5 },
      { previousHungerLevel: 4, minutesSinceLastHungerEvent: 40 }
    )).toBeNull();
  });

  it('builds stable hunger prompt for backfilled time from events before that time', () => {
    Storage.writeEvents([
      {
        id: 'before-backfill',
        source: 'day-fab',
        createdAt: '2026-07-04T18:00:00Z',
        recordedAt: '2026-07-04T18:00:00Z',
        hungerLevel: 1
      },
      {
        id: 'after-backfill',
        source: 'day-fab',
        createdAt: '2026-07-04T20:00:00Z',
        recordedAt: '2026-07-04T20:00:00Z',
        hungerLevel: 7
      }
    ]);

    const prompt = Adapter.buildStableHungerPrompt(
      { hungerLevel: 1, now: '2026-07-04T19:00:00Z' },
      { previousHungerLevel: 7, previousHungerEventId: 'after-backfill', previousHungerEventAt: '2026-07-04T20:00:00Z', minutesSinceLastHungerEvent: 0 }
    );

    expect(prompt).toMatchObject({
      type: 'stable_hunger_repeat',
      question: 'Почему оценка не меняется?',
      previousLevel: 1,
      currentLevel: 1,
      minutesSincePrevious: 60,
      anchorEventId: 'before-backfill'
    });
    expect(uiSource).toContain('const stableHungerPrompt = isEditingEvent ? null : buildStableHungerPrompt(promptInput, context)');
    expect(uiSource).toContain('stableHungerPrompt: cloneStableHungerPrompt(stableHungerPrompt)');
  });

  it('renders spark with current hunger point and all today meal markers', () => {
    vi.setSystemTime(new Date('2026-07-05T12:00:00Z'));
    Storage.writeEvents([
      {
        id: 'old-hunger',
        source: 'day-fab',
        createdAt: '2026-07-04T08:00:00Z',
        recordedAt: '2026-07-04T08:00:00Z',
        hungerLevel: 8
      },
      {
        id: 'today-hunger',
        source: 'day-fab',
        createdAt: '2026-07-05T07:00:00Z',
        recordedAt: '2026-07-05T07:00:00Z',
        hungerLevel: 4
      },
      {
        id: 'night-hunger',
        source: 'day-fab',
        createdAt: '2026-07-05T01:30:00',
        recordedAt: '2026-07-05T01:30:00',
        hungerLevel: 9
      },
      {
        id: 'today-hunger-2',
        source: 'day-fab',
        createdAt: '2026-07-05T09:30:00Z',
        recordedAt: '2026-07-05T09:30:00Z',
        hungerLevel: 5
      }
    ]);

    const spark = Adapter.buildSparkTimeline({
      date: '2026-07-05',
      day: {
        date: '2026-07-05',
        sleepStart: '23:00',
        sleepEnd: '07:00',
        meals: [
          { time: '08:00', items: [{ name: 'breakfast' }] },
          { time: '10:00', items: [{ name: 'snack' }] }
        ]
      },
      draft: { hungerLevel: 2 }
    });

    expect(spark.meals).toHaveLength(2);
    expect(spark.meals.map((meal) => meal.label)).toEqual(['еда 08:00', 'еда 10:00']);
    expect(spark.meals.every((meal) => meal.quality)).toBe(true);
    expect(spark.hungerPoints).toHaveLength(3);
    expect(spark.hungerPoints.map((point) => point.level)).toEqual([4, 5, 2]);
    expect(spark.hungerPoints[2].type).toBe('preview');
    expect(spark.hungerPoints.every((point) => /^rgb\(/.test(point.color))).toBe(true);
    expect(new Set(spark.hungerPoints.map((point) => point.color)).size).toBeGreaterThan(1);
    expect(spark.lineStops[0].color).toBe(spark.hungerPoints[0].color);
    expect(spark.lineStops.at(-1).color).toBe(spark.hungerPoints.at(-1).color);
    expect(spark.lineStops.length).toBeGreaterThanOrEqual(spark.hungerPoints.length);
    expect(uiSource).toContain('const SPARK_X_MIN = 8');
    expect(uiSource).toContain('const SPARK_X_MAX = 312');
    expect(uiSource).toContain("h('line', { className: 'hes-spark__axis', x1: SPARK_X_MIN, y1: 64, x2: SPARK_X_MAX, y2: 64 })");
    expect(spark.hungerPoints.every((point) => point.x >= 8 && point.x <= 312)).toBe(true);
    expect(spark.path).toMatch(/^M/);
    expect(spark.ticks.length).toBeGreaterThan(0);
    expect(spark.nightBands).toEqual([]);
    expect(spark.sleepInterval).toBeNull();
  });

  it('keeps hunger line level until a meal marker when hunger drops after food', () => {
    vi.setSystemTime(new Date('2026-07-05T13:20:00'));
    Storage.writeEvents([
      {
        id: 'before-food',
        source: 'day-fab',
        createdAt: '2026-07-05T12:00:00',
        recordedAt: '2026-07-05T12:00:00',
        hungerLevel: 4
      }
    ]);

    const spark = Adapter.buildSparkTimeline({
      date: '2026-07-05',
      day: {
        date: '2026-07-05',
        meals: [{ time: '13:00', items: [{ name: 'lunch' }] }]
      },
      draft: { hungerLevel: 1 }
    });

    const mealX = spark.meals[0].x.toFixed(1);
    const beforeFoodY = spark.hungerPoints[0].y.toFixed(1);
    const currentY = spark.hungerPoints[1].y.toFixed(1);
    expect(spark.path).toContain('L' + mealX + ' ' + beforeFoodY);
    expect(spark.path.endsWith(currentY)).toBe(true);
    expect(spark.lineStops).toHaveLength(3);
    expect(spark.lineStops[1].color).toBe(spark.hungerPoints[0].color);
  });

  it('compacts nearby similar hunger points into small spark dots', () => {
    vi.setSystemTime(new Date('2026-07-05T13:20:00'));
    Storage.writeEvents([
      {
        id: 'nearby-hunger-1',
        source: 'day-fab',
        createdAt: '2026-07-05T12:00:00',
        recordedAt: '2026-07-05T12:00:00',
        hungerLevel: 3
      },
      {
        id: 'nearby-hunger-2',
        source: 'day-fab',
        createdAt: '2026-07-05T12:05:00',
        recordedAt: '2026-07-05T12:05:00',
        hungerLevel: 4
      }
    ]);

    const spark = Adapter.buildSparkTimeline({
      date: '2026-07-05',
      day: { date: '2026-07-05', meals: [] },
      draft: { hungerLevel: 8 }
    });

    expect(spark.hungerPoints[0]).toMatchObject({ id: 'nearby-hunger-1', isCompactClusterPoint: true });
    expect(spark.hungerPoints[1]).toMatchObject({ id: 'nearby-hunger-2', isCompactClusterPoint: true });
    expect(spark.hungerPoints.at(-1).isCompactClusterPoint).toBeUndefined();
  });

  it('colors meal markers by hunger context and meal quality', () => {
    vi.setSystemTime(new Date('2026-07-05T13:20:00'));
    Storage.writeEvents([
      {
        id: 'low-before-sweet',
        source: 'day-fab',
        createdAt: '2026-07-05T12:00:00',
        recordedAt: '2026-07-05T12:00:00',
        hungerLevel: 1
      }
    ]);

    const lowStressSpark = Adapter.buildSparkTimeline({
      date: '2026-07-05',
      day: {
        date: '2026-07-05',
        meals: [{
          time: '12:30',
          items: [{ name: 'Шоколадка после созвона', grams: 40, kcal100: 530, protein100: 6, carbs100: 58, simple100: 52, fat100: 31, fiber100: 2, harm: 7 }]
        }]
      },
      draft: { hungerLevel: 1 }
    });

    expect(lowStressSpark.meals[0].quality).toMatchObject({
      tone: 'attention',
      lowBefore: true,
      lowAfter: true
    });

    Storage.writeEvents([
      {
        id: 'high-before-meal',
        source: 'day-fab',
        createdAt: '2026-07-05T12:00:00',
        recordedAt: '2026-07-05T12:00:00',
        hungerLevel: 8
      }
    ]);

    const goodMealSpark = Adapter.buildSparkTimeline({
      date: '2026-07-05',
      day: {
        date: '2026-07-05',
        meals: [{
          time: '12:30',
          items: [
            { name: 'Курица', grams: 140, kcal100: 165, protein100: 31, carbs100: 0, fat100: 4, harm: 1 },
            { name: 'Гречка с овощами', grams: 180, kcal100: 110, protein100: 4, carbs100: 20, complex100: 18, simple100: 1, fat100: 1, fiber100: 4, harm: 1 }
          ]
        }]
      },
      draft: { hungerLevel: 4 }
    });

    expect(goodMealSpark.meals[0].quality).toMatchObject({
      tone: 'good',
      beforeLevel: 8
    });
  });

  it('marks a recent full meal in hunger decision context', () => {
    vi.setSystemTime(new Date('2026-07-05T13:20:00'));
    Storage.writeEvents([
      {
        id: 'hungry-before-full-meal',
        source: 'day-fab',
        createdAt: '2026-07-05T12:00:00',
        recordedAt: '2026-07-05T12:00:00',
        hungerLevel: 8
      }
    ]);

    const context = Adapter.buildContextFromDay({
      date: '2026-07-05',
      day: {
        date: '2026-07-05',
        meals: [{
          time: '12:30',
          items: [
            { name: 'Курица', grams: 140, kcal100: 165, protein100: 31, carbs100: 0, fat100: 4, harm: 1 },
            { name: 'Гречка с овощами', grams: 180, kcal100: 110, protein100: 4, carbs100: 20, complex100: 18, simple100: 1, fat100: 1, fiber100: 4, harm: 1 }
          ]
        }]
      }
    });

    expect(context.recentFullMeal).toBe(true);
    expect(context.recentBalancedMeal).toBe(true);
    expect(context.lastMealQualityTone).toBe('good');
    expect(context.lastMealQuality).toMatchObject({ tone: 'good' });
    expect(context.lastMealProtein).toBeGreaterThanOrEqual(25);
    expect(context.mealQualitySnapshot).toHaveLength(1);
    expect(context.mealQualitySnapshot[0].quality).toMatchObject({ tone: 'good' });
  });

  it('asks for context when meaningful food appears after low hunger', () => {
    vi.setSystemTime(new Date('2026-07-05T13:20:00'));
    Storage.writeEvents([
      {
        id: 'low-before-food',
        source: 'day-fab',
        createdAt: '2026-07-05T12:00:00',
        recordedAt: '2026-07-05T12:00:00',
        hungerLevel: 1
      }
    ]);

    const review = Adapter.buildLowHungerMealReview('2026-07-05', {
      date: '2026-07-05',
      meals: [{
        time: '12:45',
        items: [{ name: 'Латте с сиропом', grams: 300, kcal100: 90, carbs100: 12, fat100: 3, protein100: 3 }]
      }]
    });

    expect(review).toMatchObject({
      hungerLevel: 1,
      hungerEvent: { id: 'low-before-food' },
      mealAt: '2026-07-05T12:45:00',
      mealQuality: {
        tone: 'attention',
        lowBefore: true
      },
      analysis: {
        isMeaningful: true,
        category: 'caffeine_additions',
        suggestedReason: 'caffeine_additions',
        kcal: 270
      }
    });
    expect(review.patternStats).toMatchObject({ repeatCount: 0, isRepeated: false });
    expect(Adapter.getLowHungerNextStep('caffeine_additions', review).title).toContain('кофе');
    expect(Adapter.getLowHungerAnalyticsTags('caffeine_additions', review)).toContain('auto_reason_confirmed');
    const gentlePlan = Adapter.getLowHungerGentlePlan('caffeine_additions', review);
    expect(gentlePlan.replacement.detail).toContain('кофе без сиропа');
    expect(gentlePlan.experiment.detail).toContain('3 дня');
    expect(gentlePlan.quietCue).toBeNull();
  });

  it('tracks stress calorie cue as a separate low-hunger pattern', () => {
    vi.setSystemTime(new Date('2026-07-05T13:20:00'));
    Storage.writeEvents([
      {
        id: 'low-before-sweet',
        source: 'day-fab',
        createdAt: '2026-07-05T12:00:00',
        recordedAt: '2026-07-05T12:00:00',
        hungerLevel: 1
      }
    ]);

    const review = Adapter.buildLowHungerMealReview('2026-07-05', {
      date: '2026-07-05',
      meals: [{
        time: '12:45',
        items: [{ name: 'Конфета после созвона', grams: 30, kcal100: 450, carbs100: 70, fat100: 18, protein100: 4 }]
      }]
    });

    expect(Adapter.getLowHungerSavedSummary('stress_calorie_cue', review)).toContain('стрессовый добор');
    expect(Adapter.buildStressCalorieLink(review)).toMatchObject({
      choiceType: 'sweet',
      choiceLabel: 'сладкое',
      hungerLevelBeforeMeal: 1
    });
    expect(Adapter.getLowHungerAnalyticsTags('stress_calorie_cue', review)).toContain('stress_calorie_cue');
    expect(Adapter.getLowHungerNextStep('stress_calorie_cue', review).title).toContain('напряжение');
    expect(Adapter.getLowHungerGentlePlan('stress_calorie_cue', review).experiment.detail).toContain('стресс');
    expect(Adapter.buildLowHungerHabitPattern('stress_calorie_cue', review)).toMatchObject({
      type: 'low_hunger_stress_calorie_cue',
      reason: 'stress_calorie_cue',
      mealIntent: 'stress_cue',
      choiceType: 'sweet',
      stressCalorieLink: { choiceType: 'sweet' }
    });
    const curatorCard = Adapter.buildLowHungerCuratorCard('stress_calorie_cue', review);
    expect(curatorCard).toMatchObject({
      title: 'Стрессовый добор при низком голоде',
      reason: 'stress_calorie_cue',
      mealIntent: 'stress_cue',
      choiceType: 'sweet',
      stressCalorieLink: { choiceLabel: 'сладкое' }
    });
    expect(curatorCard.summary).toContain('Стресс/нервозность → сладкое');
  });

  it('tracks planned-ahead eating when future food access is limited', () => {
    const review = {
      mealAt: '2026-07-05T12:45:00',
      hungerLevel: 1,
      analysis: {
        category: 'meal',
        names: ['Боул заранее'],
        kcal: 420
      },
      patternStats: { repeatCount: 1, isRepeated: false, needsPatternWork: false }
    };

    expect(Adapter.getLowHungerSavedSummary('future_food_access', review)).toContain('еда заранее');
    expect(Adapter.getLowHungerNextStep('future_food_access', review).detail).toContain('позже не будет доступа к еде');
    expect(Adapter.getLowHungerGentlePlan('future_food_access', review).replacement.detail).toContain('записать её как плановую');
    expect(Adapter.getLowHungerContextOptions('future_food_access').map(([, label]) => label)).toContain('Не будет еды');
    expect(Adapter.buildLowHungerCuratorCard('future_food_access', review)).toMatchObject({
      reason: 'future_food_access',
      mealIntent: 'planned_ahead'
    });
    expect(uiSource).toContain("future_food_access: 'еда заранее'");
    expect(uiSource).toContain("['future_food_access', 'Заранее / не скоро еда']");
  });

  it('does not ask for low-hunger context for zero drinks', () => {
    vi.setSystemTime(new Date('2026-07-05T13:20:00'));
    Storage.writeEvents([
      {
        id: 'low-before-zero',
        source: 'day-fab',
        createdAt: '2026-07-05T12:00:00',
        recordedAt: '2026-07-05T12:00:00',
        hungerLevel: 1
      }
    ]);

    const review = Adapter.buildLowHungerMealReview('2026-07-05', {
      date: '2026-07-05',
      meals: [{
        time: '12:45',
        items: [{ name: 'Кока-Кола Zero без сахара', grams: 330, kcal100: 0 }]
      }]
    });

    expect(review).toBeNull();
    expect(Adapter.analyzeMealForLowHungerReview({
      items: [{ name: 'Кока-Кола Zero без сахара', grams: 330, kcal100: 0 }]
    })).toMatchObject({ isMeaningful: false, category: 'non_caloric' });
  });

  it('separates almost-zero drinks from true zero drinks', () => {
    vi.setSystemTime(new Date('2026-07-05T13:20:00'));
    Storage.writeEvents([
      {
        id: 'low-before-coffee',
        source: 'day-fab',
        createdAt: '2026-07-05T12:00:00',
        recordedAt: '2026-07-05T12:00:00',
        hungerLevel: 1
      }
    ]);

    const review = Adapter.buildLowHungerMealReview('2026-07-05', {
      date: '2026-07-05',
      meals: [{
        time: '12:45',
        items: [{ name: 'Кофе с молоком', grams: 120, kcal100: 40, carbs100: 4, fat100: 1, protein100: 1 }]
      }]
    });

    expect(review.analysis).toMatchObject({
      isMeaningful: true,
      category: 'near_zero_drink',
      suggestedReason: 'caffeine_additions'
    });
    expect(Adapter.getLowHungerNextStep('caffeine_additions', review).title).toBe('Отделить от zero-напитков');
    expect(Adapter.getLowHungerSuggestionConfidence(review)).toMatchObject({ level: 'medium' });
    expect(Adapter.getLowHungerRitualProfile('caffeine_additions', review)).toMatchObject({
      type: 'ritual',
      label: 'почти zero-напиток'
    });
    expect(Adapter.getLowHungerSavedSummary('caffeine_additions', review)).toContain('Запомнили');
  });

  it('keeps low-impact near-zero drinks passive when the pattern is not repeated', () => {
    vi.setSystemTime(new Date('2026-07-05T13:20:00'));
    Storage.writeEvents([
      {
        id: 'low-before-small-coffee',
        source: 'day-fab',
        createdAt: '2026-07-05T12:00:00',
        recordedAt: '2026-07-05T12:00:00',
        hungerLevel: 1
      }
    ]);

    const day = {
      date: '2026-07-05',
      meals: [{
        time: '12:45',
        items: [{ name: 'Кофе с молоком', grams: 100, kcal100: 20, carbs100: 2, fat100: 0.5, protein100: 0.5 }]
      }]
    };

    expect(Adapter.buildLowHungerMealReview('2026-07-05', day)).toBeNull();
    expect(Adapter.buildLowHungerMealReview('2026-07-05', day, { includePassive: true })).toMatchObject({
      passiveContext: { reason: 'caffeine_additions' },
      analysis: { category: 'near_zero_drink' }
    });
  });

  it('groups coffee drinks into one low-hunger pattern', () => {
    expect(Adapter.analyzeMealForLowHungerReview({
      items: [{ name: 'Латте с сиропом', grams: 250, kcal100: 90 }]
    }).patternKey).toBe('caffeine_additions:coffee_additions');
    expect(Adapter.analyzeMealForLowHungerReview({
      items: [{ name: 'Капучино', grams: 220, kcal100: 65 }]
    }).patternKey).toBe('caffeine_additions:coffee_additions');
    expect(Adapter.analyzeMealForLowHungerReview({
      items: [{ name: 'Кофе с молоком', grams: 120, kcal100: 40 }]
    }).patternKey).toBe('caffeine_additions:coffee_additions');
  });

  it('does not repeat the low-hunger meal question after a saved reason', () => {
    vi.setSystemTime(new Date('2026-07-05T13:20:00'));
    Storage.writeEvents([
      {
        id: 'low-before-snack',
        source: 'day-fab',
        createdAt: '2026-07-05T12:00:00',
        recordedAt: '2026-07-05T12:00:00',
        hungerLevel: 2
      },
      {
        id: 'reason',
        eventType: 'low_hunger_meal_reason',
        source: 'hunger-low-meal-review',
        createdAt: '2026-07-05T13:00:00',
        recordedAt: '2026-07-05T13:00:00',
        hungerEventId: 'low-before-snack',
        mealAt: '2026-07-05T12:45:00',
        mealSignature: 'печенье',
        reason: 'habit_snack'
      }
    ]);

    const review = Adapter.buildLowHungerMealReview('2026-07-05', {
      date: '2026-07-05',
      meals: [{
        time: '12:45',
        items: [{ name: 'Печенье', grams: 40, kcal100: 430, carbs100: 70, fat100: 14, protein100: 7 }]
      }]
    });

    expect(review).toBeNull();
  });

  it('temporarily suppresses repeated one-off answers for a similar low-hunger meal', () => {
    vi.setSystemTime(new Date('2026-07-05T13:20:00'));
    Storage.writeEvents([
      {
        id: 'one-off-1',
        eventType: 'low_hunger_meal_reason',
        recordedAt: '2026-07-01T12:00:00',
        reason: 'one_off',
        patternKey: 'snack:печенье',
        mealSignature: 'печенье'
      },
      {
        id: 'one-off-2',
        eventType: 'low_hunger_meal_reason',
        recordedAt: '2026-07-03T12:00:00',
        reason: 'one_off',
        patternKey: 'snack:печенье',
        mealSignature: 'печенье'
      },
      {
        id: 'low-before-cookie',
        source: 'day-fab',
        createdAt: '2026-07-05T12:00:00',
        recordedAt: '2026-07-05T12:00:00',
        hungerLevel: 1
      }
    ]);

    const review = Adapter.buildLowHungerMealReview('2026-07-05', {
      date: '2026-07-05',
      meals: [{
        time: '12:45',
        items: [{ name: 'Печенье', grams: 30, kcal100: 430, carbs100: 70, fat100: 14, protein100: 7 }]
      }]
    });

    expect(review).toBeNull();
  });

  it('treats quiet skip and hunger correction as closing the same low-hunger meal episode', () => {
    vi.setSystemTime(new Date('2026-07-05T13:20:00'));
    const lowEvent = {
      id: 'low-before-cookie',
      source: 'day-fab',
      createdAt: '2026-07-05T12:00:00',
      recordedAt: '2026-07-05T12:00:00',
      hungerLevel: 1
    };
    const day = {
      date: '2026-07-05',
      meals: [{
        time: '12:45',
        items: [{ name: 'Печенье', grams: 30, kcal100: 430, carbs100: 70, fat100: 14, protein100: 7 }]
      }]
    };

    Storage.writeEvents([
      lowEvent,
      {
        id: 'deferred',
        eventType: 'low_hunger_meal_deferred',
        recordedAt: '2026-07-05T13:00:00',
        hungerEventId: 'low-before-cookie',
        mealAt: '2026-07-05T12:45:00',
        mealSignature: 'печенье',
        reason: 'not_now'
      }
    ]);
    expect(Adapter.buildLowHungerMealReview('2026-07-05', day)).toBeNull();

    Storage.writeEvents([
      lowEvent,
      {
        id: 'data-fix',
        eventType: 'low_hunger_meal_data_fix',
        recordedAt: '2026-07-05T13:00:00',
        hungerEventId: 'low-before-cookie',
        mealAt: '2026-07-05T12:45:00',
        mealSignature: 'печенье',
        reason: 'correct_previous_hunger'
      }
    ]);
    expect(Adapter.buildLowHungerMealReview('2026-07-05', day)).toBeNull();
  });

  it('keeps additional same-day low-hunger food episodes passive after one prompt', () => {
    vi.setSystemTime(new Date('2026-07-05T18:20:00'));
    Storage.writeEvents([
      {
        id: 'first-prompt',
        eventType: 'low_hunger_meal_reason',
        date: '2026-07-05',
        recordedAt: '2026-07-05T13:00:00',
        reason: 'caffeine_additions'
      },
      {
        id: 'low-before-evening-snack',
        source: 'day-fab',
        createdAt: '2026-07-05T17:00:00',
        recordedAt: '2026-07-05T17:00:00',
        hungerLevel: 1
      }
    ]);
    const day = {
      date: '2026-07-05',
      meals: [{
        time: '17:20',
        items: [{ name: 'Печенье', grams: 35, kcal100: 430, carbs100: 70, fat100: 14, protein100: 7 }]
      }]
    };

    expect(Adapter.buildLowHungerMealReview('2026-07-05', day)).toBeNull();
    expect(Adapter.buildLowHungerMealReview('2026-07-05', day, { includePassive: true })).toMatchObject({
      passiveContext: {
        reason: 'habit_snack',
        dailyPromptLimitReached: true
      }
    });
  });

  it('uses the configurable daily prompt limit for low-hunger food clarifications', () => {
    vi.setSystemTime(new Date('2026-07-05T18:20:00'));
    const day = {
      date: '2026-07-05',
      meals: [{
        time: '17:20',
        items: [{ name: 'Печенье', grams: 35, kcal100: 430, carbs100: 70, fat100: 14, protein100: 7 }]
      }]
    };
    const lowEvent = {
      id: 'low-before-configured-limit',
      source: 'day-fab',
      createdAt: '2026-07-05T17:00:00',
      recordedAt: '2026-07-05T17:00:00',
      hungerLevel: 1
    };

    Adapter.writeHungerFeatureSettings({ lowHungerDailyPromptLimit: 2 });
    Storage.writeEvents([
      {
        id: 'first-prompt',
        eventType: 'low_hunger_meal_reason',
        date: '2026-07-05',
        recordedAt: '2026-07-05T13:00:00',
        reason: 'caffeine_additions'
      },
      lowEvent
    ]);
    expect(Adapter.buildLowHungerMealReview('2026-07-05', day)).toMatchObject({
      passiveContext: null,
      analysis: { suggestedReason: 'habit_snack' }
    });

    Adapter.writeHungerFeatureSettings({ lowHungerDailyPromptLimit: 0 });
    Storage.writeEvents([lowEvent]);
    expect(Adapter.buildLowHungerMealReview('2026-07-05', day)).toBeNull();
    expect(Adapter.buildLowHungerMealReview('2026-07-05', day, { includePassive: true })).toMatchObject({
      passiveContext: {
        dailyPromptLimit: 0,
        dailyPromptLimitReached: true
      }
    });
  });

  it('can turn low-hunger food clarifications into passive context only', () => {
    vi.setSystemTime(new Date('2026-07-05T18:20:00'));
    const day = {
      date: '2026-07-05',
      meals: [{
        time: '17:20',
        items: [{ name: 'Печенье', grams: 35, kcal100: 430, carbs100: 70, fat100: 14, protein100: 7 }]
      }]
    };
    const lowEvent = {
      id: 'low-before-disabled-clarification',
      source: 'day-fab',
      createdAt: '2026-07-05T17:00:00',
      recordedAt: '2026-07-05T17:00:00',
      hungerLevel: 1
    };

    Adapter.writeHungerFeatureSettings({ lowHungerClarifications: false, lowHungerDailyPromptLimit: 3 });
    Storage.writeEvents([lowEvent]);

    expect(Adapter.buildLowHungerMealReview('2026-07-05', day)).toBeNull();
    expect(Adapter.buildLowHungerMealReview('2026-07-05', day, { includePassive: true })).toMatchObject({
      passiveContext: {
        clarificationsDisabled: true,
        dailyPromptLimit: 3,
        dailyPromptLimitReached: false
      },
      analysis: { suggestedReason: 'habit_snack' }
    });
  });

  it('supports cooking tasting as a separate low-hunger context', () => {
    vi.setSystemTime(new Date('2026-07-05T13:20:00'));
    Storage.writeEvents([
      {
        id: 'low-before-tasting',
        source: 'day-fab',
        createdAt: '2026-07-05T12:00:00',
        recordedAt: '2026-07-05T12:00:00',
        hungerLevel: 1
      }
    ]);

    const review = Adapter.buildLowHungerMealReview('2026-07-05', {
      date: '2026-07-05',
      meals: [{
        time: '12:45',
        items: [{ name: 'Готовка: пробовал соус ложкой', grams: 30, kcal100: 200, carbs100: 12, fat100: 14, protein100: 3 }]
      }]
    });

    expect(review.analysis).toMatchObject({
      category: 'cooking_taste',
      suggestedReason: 'cooking_taste',
      patternKey: 'cooking_taste:preparation'
    });
    expect(Adapter.getLowHungerRitualProfile('cooking_taste', review)).toMatchObject({
      type: 'tasting',
      label: 'проба при готовке'
    });
    expect(Adapter.getLowHungerNextStep('cooking_taste', review).title).toContain('проб');
    expect(Adapter.getLowHungerGentlePlan('cooking_taste', review).experiment.detail).toContain('готовке');
  });

  it('surfaces repeated low-hunger food patterns for the next similar episode', () => {
    vi.setSystemTime(new Date('2026-07-05T13:20:00'));
    Storage.writeEvents([
      {
        id: 'old-reason-1',
        eventType: 'low_hunger_meal_reason',
        recordedAt: '2026-07-01T12:00:00',
        reason: 'caffeine_additions',
        reasonCategory: 'caffeine_additions',
        patternKey: 'caffeine_additions:латте'
      },
      {
        id: 'old-reason-2',
        eventType: 'low_hunger_meal_reason',
        recordedAt: '2026-07-03T12:00:00',
        reason: 'caffeine_additions',
        reasonCategory: 'caffeine_additions',
        patternKey: 'caffeine_additions:капучино'
      },
      {
        id: 'old-reason-3',
        eventType: 'low_hunger_meal_reason',
        recordedAt: '2026-07-04T12:00:00',
        reason: 'caffeine_additions',
        reasonCategory: 'caffeine_additions',
        patternKey: 'caffeine_additions:раф'
      },
      {
        id: 'low-before-new-coffee',
        source: 'day-fab',
        createdAt: '2026-07-05T12:00:00',
        recordedAt: '2026-07-05T12:00:00',
        hungerLevel: 1
      }
    ]);

    const review = Adapter.buildLowHungerMealReview('2026-07-05', {
      date: '2026-07-05',
      meals: [{
        time: '12:45',
        items: [{ name: 'Латте с сиропом', grams: 250, kcal100: 90, carbs100: 12, fat100: 3, protein100: 3 }]
      }]
    });

    expect(review.patternStats).toMatchObject({
      sameReason: 3,
      repeatCount: 3,
      isRepeated: true
    });
    expect(Adapter.getLowHungerAnalyticsTags('caffeine_additions', review)).toContain('repeat_seen');
    expect(Adapter.getLowHungerGentlePlan('caffeine_additions', review).quietCue).toMatchObject({
      title: 'Тихая подсказка'
    });
    expect(Adapter.buildLowHungerHabitPattern('caffeine_additions', review)).toMatchObject({
      type: 'low_hunger_food',
      reason: 'caffeine_additions',
      mealIntent: 'ritual',
      timeBucket: 'midday'
    });
    expect(Adapter.buildLowHungerCuratorCard('caffeine_additions', review)).toMatchObject({
      title: 'Еда при низком голоде',
      reason: 'caffeine_additions',
      mealIntent: 'ritual',
      count: 3,
      weekFocus: { title: 'Фокус недели' }
    });
    expect(Adapter.getLowHungerSuggestionConfidence(review)).toMatchObject({ level: 'high' });
    expect(Adapter.getLowHungerUpcomingCue('caffeine_additions', review)).toMatchObject({
      title: 'Перед похожим временем',
      mode: 'diary_inline'
    });
    expect(Adapter.buildLowHungerCuratorWeekFocus()).toMatchObject({
      title: 'Фокус недели',
      reason: 'caffeine_additions',
      count: 3,
      extraKcal: 0,
      equivalents: { kcal: 0 }
    });
  });

  it('adds weekly extra calories and movement equivalents to curator focus', () => {
    vi.setSystemTime(new Date('2026-07-05T13:20:00'));
    Storage.writeEvents([
      {
        id: 'week-kcal-1',
        eventType: 'low_hunger_meal_reason',
        recordedAt: '2026-07-01T12:00:00',
        reason: 'caffeine_additions',
        mealAnalysis: { kcal: 120 },
        habitPattern: { timeBucket: 'afternoon' }
      },
      {
        id: 'week-kcal-2',
        eventType: 'low_hunger_meal_reason',
        recordedAt: '2026-07-02T12:00:00',
        reason: 'caffeine_additions',
        mealAnalysis: { kcal: 180 },
        habitPattern: { timeBucket: 'afternoon' }
      },
      {
        id: 'week-kcal-3',
        eventType: 'low_hunger_meal_passive_context',
        recordedAt: '2026-07-03T12:00:00',
        reason: 'caffeine_additions',
        mealAnalysis: { kcal: 20 },
        habitPattern: { timeBucket: 'afternoon' }
      }
    ]);

    expect(Adapter.buildLowHungerCuratorWeekFocus()).toMatchObject({
      title: 'Фокус недели',
      extraKcal: 320,
      equivalents: {
        kcal: 320,
        steps: 8000,
        cardioMin: 46
      }
    });
    expect(Adapter.buildLowHungerCuratorWeekFocus().summary).toContain('320 ккал');
  });

  it('can hide weekly kcal equivalents while keeping the repeated context summary', () => {
    vi.setSystemTime(new Date('2026-07-05T13:20:00'));
    Storage.writeEvents([
      {
        id: 'week-kcal-hidden-1',
        eventType: 'low_hunger_meal_reason',
        recordedAt: '2026-07-01T12:00:00',
        reason: 'caffeine_additions',
        mealAnalysis: { kcal: 120 },
        habitPattern: { timeBucket: 'afternoon' }
      },
      {
        id: 'week-kcal-hidden-2',
        eventType: 'low_hunger_meal_reason',
        recordedAt: '2026-07-02T12:00:00',
        reason: 'caffeine_additions',
        mealAnalysis: { kcal: 180 },
        habitPattern: { timeBucket: 'afternoon' }
      },
      {
        id: 'week-kcal-hidden-3',
        eventType: 'low_hunger_meal_reason',
        recordedAt: '2026-07-03T12:00:00',
        reason: 'caffeine_additions',
        mealAnalysis: { kcal: 20 },
        habitPattern: { timeBucket: 'afternoon' }
      }
    ]);

    const focus = Adapter.buildLowHungerCuratorWeekFocus(null, null, { lowHungerWeeklyDigest: false });

    expect(focus).toMatchObject({
      title: 'Фокус недели',
      extraKcal: null,
      equivalents: null
    });
    expect(focus.summary).not.toContain('ккал');
  });

  it('can turn off the curator week focus card', () => {
    vi.setSystemTime(new Date('2026-07-05T13:20:00'));
    Storage.writeEvents([
      {
        id: 'old-focus-1',
        eventType: 'low_hunger_meal_reason',
        recordedAt: '2026-07-01T12:00:00',
        reason: 'caffeine_additions',
        reasonCategory: 'caffeine_additions',
        patternKey: 'caffeine_additions:латте'
      },
      {
        id: 'old-focus-2',
        eventType: 'low_hunger_meal_reason',
        recordedAt: '2026-07-03T12:00:00',
        reason: 'caffeine_additions',
        reasonCategory: 'caffeine_additions',
        patternKey: 'caffeine_additions:капучино'
      },
      {
        id: 'old-focus-3',
        eventType: 'low_hunger_meal_reason',
        recordedAt: '2026-07-04T12:00:00',
        reason: 'caffeine_additions',
        reasonCategory: 'caffeine_additions',
        patternKey: 'caffeine_additions:раф'
      },
      {
        id: 'low-before-focus-off',
        source: 'day-fab',
        createdAt: '2026-07-05T12:00:00',
        recordedAt: '2026-07-05T12:00:00',
        hungerLevel: 1
      }
    ]);

    const review = Adapter.buildLowHungerMealReview('2026-07-05', {
      date: '2026-07-05',
      meals: [{
        time: '12:45',
        items: [{ name: 'Латте с сиропом', grams: 250, kcal100: 90, carbs100: 12, fat100: 3, protein100: 3 }]
      }]
    });

    expect(Adapter.buildLowHungerCuratorWeekFocus(review, 'caffeine_additions', { lowHungerCuratorFocus: false })).toBeNull();
    expect(Adapter.buildLowHungerCuratorCard('caffeine_additions', review, { lowHungerCuratorFocus: false })).toMatchObject({
      title: 'Еда при низком голоде',
      weeklyDigest: null,
      weekFocus: null
    });
  });

  it('adds a weekly summary and quiet experiment follow-up inside the next clarification', () => {
    vi.setSystemTime(new Date('2026-07-05T13:20:00'));
    Storage.writeEvents([
      {
        id: 'experiment-due',
        eventType: 'low_hunger_meal_reason',
        recordedAt: '2026-07-01T12:00:00',
        reason: 'caffeine_additions',
        patternKey: 'caffeine_additions:латте',
        gentlePlan: { experiment: { title: 'Мягкий эксперимент', detail: '3 дня проверить базовый кофе.' } }
      },
      {
        id: 'week-context',
        eventType: 'low_hunger_meal_reason',
        recordedAt: '2026-07-03T12:00:00',
        reason: 'habit_snack',
        patternKey: 'snack:печенье'
      },
      {
        id: 'low-before-new',
        source: 'day-fab',
        createdAt: '2026-07-05T12:00:00',
        recordedAt: '2026-07-05T12:00:00',
        hungerLevel: 1
      }
    ]);

    const review = Adapter.buildLowHungerMealReview('2026-07-05', {
      date: '2026-07-05',
      meals: [{
        time: '12:45',
        items: [{ name: 'Латте с сиропом', grams: 250, kcal100: 90, carbs100: 12, fat100: 3, protein100: 3 }]
      }]
    });

    expect(review.weeklySummary).toMatchObject({ total: 2 });
    expect(review.experimentFollowUp).toMatchObject({ eventId: 'experiment-due' });
    expect(Adapter.buildLowHungerExperimentFollowUp()).toMatchObject({ eventId: 'experiment-due' });
    expect(Adapter.buildLowHungerExperimentFollowUp({ lowHungerExperiments: false })).toBeNull();
    expect(Adapter.getLowHungerGentlePlan('caffeine_additions', review, { lowHungerExperiments: false }).experiment).toBeNull();
  });

  it('renders low-hunger meal clarification as a standalone step before hunger input', () => {
    expect(uiSource).toContain("isLowHungerStep ? h('div', { className: 'hes-input hes-input--clarify' }");
    expect(uiSource).toContain("!isLowHungerClarification && !isHungerOutcomeFollowUp && h('footer'");
    expect(uiSource).toContain('isLowHungerClarification ? h(LowHungerMealPrompt');
    expect(uiSource).toContain('patternKey: lowHungerMealReview.analysis?.patternKey || null');
    expect(uiSource).toContain('analyticsTags');
    expect(uiSource).toContain('curatorTag');
    expect(uiSource).toContain("mode: 'inline_only'");
    expect(uiSource).toContain('lowHungerContextTag');
    expect(uiSource).toContain('gentlePlan');
    expect(uiSource).toContain('weeklySummary');
    expect(uiSource).toContain('experimentOutcome');
    expect(uiSource).toContain('curatorCard');
    expect(uiSource).toContain('suggestionConfidence');
    expect(uiSource).toContain('ritualProfile');
    expect(uiSource).toContain('savedSummary');
    expect(uiSource).toContain('low_hunger_meal_deferred');
    expect(uiSource).toContain('low_hunger_meal_data_fix');
    expect(uiSource).toContain('low_hunger_meal_passive_context');
    expect(uiSource).toContain('getLowHungerUpcomingCue');
    expect(uiSource).toContain('buildLowHungerCuratorWeekFocus');
    expect(uiSource).toContain('LOW_HUNGER_DAILY_PROMPT_LIMIT_OPTIONS');
    expect(uiSource).toContain('cooking_taste');
    expect(uiSource).toContain('Спросили, потому что');
    expect(uiSource).toContain('Итог недели');
    expect(uiSource).toContain("function ClarificationDetails({ children, label = 'Подробнее' })");
    expect(uiSource).toContain("h('details', { className: 'hes-clarification-details' }");
    expect(uiSource).toContain("h('span', null, 'Верно?')");
    expect(uiSource).toContain('Другое');
    expect(uiSource).toContain('Не спрашивать сейчас');
  });

  it('renders a selected event as editable instead of adding the current preview point', () => {
    vi.setSystemTime(new Date('2026-07-05T13:20:00'));
    Storage.writeEvents([
      {
        id: 'hunger-before',
        source: 'day-fab',
        createdAt: '2026-07-05T12:00:00',
        recordedAt: '2026-07-05T12:00:00',
        hungerLevel: 4
      },
      {
        id: 'hunger-edit',
        source: 'day-fab',
        createdAt: '2026-07-05T12:40:00',
        recordedAt: '2026-07-05T12:40:00',
        hungerLevel: 5
      }
    ]);

    const spark = Adapter.buildSparkTimeline({
      date: '2026-07-05',
      day: { date: '2026-07-05', meals: [] },
      draft: { hungerLevel: 8 },
      editTarget: { id: 'hunger-edit', hungerLevel: 8 }
    });

    expect(spark.hungerPoints).toHaveLength(2);
    expect(spark.hungerPoints.map((point) => point.type)).toEqual(['hunger', 'edit-preview']);
    expect(spark.hungerPoints[1]).toMatchObject({ id: 'hunger-edit', level: 8, isEditing: true });
    expect(spark.hungerPoints.some((point) => point.type === 'preview')).toBe(false);
  });

  it('keeps spark scale while moving an edited event timestamp', () => {
    vi.setSystemTime(new Date('2026-07-05T13:20:00'));
    Storage.writeEvents([
      {
        id: 'hunger-before',
        source: 'day-fab',
        createdAt: '2026-07-05T12:00:00',
        recordedAt: '2026-07-05T12:00:00',
        hungerLevel: 4
      },
      {
        id: 'hunger-edit-time',
        source: 'day-fab',
        createdAt: '2026-07-05T12:40:00',
        recordedAt: '2026-07-05T12:40:00',
        hungerLevel: 5
      }
    ]);
    const assessmentTime = new Date('2026-07-05T13:20:00').getTime();
    const shiftedTime = new Date('2026-07-05T13:10:00').getTime();

    const base = Adapter.buildSparkTimeline({
      date: '2026-07-05',
      day: { date: '2026-07-05', meals: [] },
      draft: { hungerLevel: 8 },
      assessmentTime
    });
    const editing = Adapter.buildSparkTimeline({
      date: '2026-07-05',
      day: { date: '2026-07-05', meals: [] },
      draft: { hungerLevel: 8 },
      editTarget: { id: 'hunger-edit-time', hungerLevel: 8, t: shiftedTime },
      assessmentTime
    });

    const editedPoint = editing.hungerPoints.find((point) => point.id === 'hunger-edit-time');
    expect(editing.scaleStart).toBe(base.scaleStart);
    expect(editing.scaleEnd).toBe(base.scaleEnd);
    expect(editedPoint).toMatchObject({ type: 'edit-preview', level: 8, isEditing: true, t: shiftedTime });
    expect(editedPoint.x).toBeGreaterThan(base.hungerPoints.find((point) => point.id === 'hunger-edit-time').x);
    expect(uiSource).toContain('assessmentTime: selectedAssessmentTime');
    expect(uiSource).toContain("field: 'recordedAt'");
    expect(uiSource).toContain('+30 мин');
  });

  it('moves the current and edited spark point from the live slider visual value', () => {
    vi.setSystemTime(new Date('2026-07-05T13:20:00'));
    Storage.writeEvents([
      {
        id: 'hunger-edit-live',
        source: 'day-fab',
        createdAt: '2026-07-05T12:40:00',
        recordedAt: '2026-07-05T12:40:00',
        hungerLevel: 4
      }
    ]);

    const editing = Adapter.buildSparkTimeline({
      date: '2026-07-05',
      day: { date: '2026-07-05', meals: [] },
      draft: { hungerLevel: 4, hungerVisual: 7.6 },
      editTarget: { id: 'hunger-edit-live', hungerLevel: 7.6 }
    });
    expect(editing.hungerPoints[0]).toMatchObject({
      id: 'hunger-edit-live',
      level: 7.6,
      isEditing: true
    });

    const current = Adapter.buildSparkTimeline({
      date: '2026-07-05',
      day: { date: '2026-07-05', meals: [] },
      draft: { hungerLevel: 4, hungerVisual: 8.2 }
    });
    expect(current.hungerPoints.at(-1)).toMatchObject({
      type: 'preview',
      level: 8.2
    });
  });

  it('snaps spark clicks to 30-minute timestamps and blocks future slots', () => {
    const noon = Date.parse('2026-07-05T12:00:00');
    const thirteen = Date.parse('2026-07-05T13:00:00');

    expect(Adapter.sparkTimeFromX(160, noon, thirteen)).toBe(noon + 30 * 60 * 1000);
    expect(Adapter.snapSparkTimestamp(noon + 14 * 60 * 1000, thirteen)).toBe(noon);
    expect(Adapter.snapSparkTimestamp(noon + 16 * 60 * 1000, thirteen)).toBe(noon + 30 * 60 * 1000);
    expect(Adapter.snapSparkTimestamp(thirteen + 20 * 60 * 1000, thirteen)).toBe(thirteen);
  });

  it('renders a backfilled past point instead of the current preview point', () => {
    vi.setSystemTime(new Date('2026-07-05T13:20:00'));
    Storage.writeEvents([
      {
        id: 'hunger-before',
        source: 'day-fab',
        createdAt: '2026-07-05T12:00:00',
        recordedAt: '2026-07-05T12:00:00',
        hungerLevel: 4
      }
    ]);

    const target = Date.parse('2026-07-05T12:30:00');
    const spark = Adapter.buildSparkTimeline({
      date: '2026-07-05',
      day: { date: '2026-07-05', meals: [] },
      draft: { hungerLevel: 8 },
      backfillTarget: { t: target }
    });

    expect(spark.hungerPoints).toHaveLength(2);
    expect(spark.hungerPoints.map((point) => point.type)).toEqual(['hunger', 'backfill-preview']);
    expect(spark.hungerPoints[1]).toMatchObject({ t: target, level: 8, isBackfilling: true });
    expect(spark.backfillMarker).toMatchObject({ label: '12:30' });
    expect(spark.backfillMarker.x).toBe(spark.hungerPoints[1].x);
    expect(spark.hungerPoints.some((point) => point.type === 'preview')).toBe(false);
  });

  it('stores feature settings and uses them to control forecast and craving graph layers', () => {
    vi.setSystemTime(new Date('2026-07-05T13:20:00'));
    Storage.writeEvents([
      {
        id: 'hunger-with-craving',
        source: 'day-fab',
        createdAt: '2026-07-05T12:00:00',
        recordedAt: '2026-07-05T12:00:00',
        hungerLevel: 4,
        input: { hungerLevel: 4, cravingLevel: 7 }
      }
    ]);

    expect(Adapter.readHungerFeatureSettings()).toMatchObject({
      showDiaryCard: true,
      microForecast: true,
      cravingGraph: true,
      mealEffectReview: true,
      smartReminders: true,
      patternInsights: true,
      lowHungerClarifications: true,
      lowHungerWeeklyDigest: true,
      lowHungerCompactConfirm: true,
      lowHungerExperiments: true,
      lowHungerCuratorFocus: true,
      lowHungerDailyPromptLimit: 1
    });

    Adapter.writeHungerFeatureSettings({ microForecast: false, cravingGraph: false, lowHungerDailyPromptLimit: 3 });
    expect(Adapter.readHungerFeatureSettings()).toMatchObject({
      showDiaryCard: true,
      microForecast: false,
      cravingGraph: false,
      mealEffectReview: true,
      lowHungerDailyPromptLimit: 3
    });

    const disabled = Adapter.buildSparkTimeline({
      date: '2026-07-05',
      day: { date: '2026-07-05', meals: [] },
      draft: { hungerLevel: 5, cravingLevel: 8 },
      settings: Adapter.readHungerFeatureSettings()
    });
    expect(disabled.forecast).toBeNull();
    expect(disabled.cravingPoints).toEqual([]);

    const enabled = Adapter.buildSparkTimeline({
      date: '2026-07-05',
      day: { date: '2026-07-05', meals: [] },
      draft: { hungerLevel: 5, cravingLevel: 8 },
      settings: { microForecast: true, cravingGraph: true }
    });
    expect(enabled.forecast).toMatchObject({ type: 'forecast' });
    expect(enabled.cravingPoints.map((point) => point.level)).toEqual([7, 8]);
    expect(enabled.cravingPath).toMatch(/^M/);

    const migrated = Adapter.writeHungerFeatureSettings({ showReportsCard: false });
    expect(migrated.showDiaryCard).toBe(false);
    expect(migrated).not.toHaveProperty('showReportsCard');
  });

  it('renders a separate settings button and feature rails in the hunger modal', () => {
    expect(uiSource).toContain("className: 'hes-settings-btn'");
    expect(uiSource).toContain('HungerFeatureSettings');
    expect(uiSource).toContain('lowHungerDailyPromptLimit');
    expect(uiSource).toContain('LOW_HUNGER_DAILY_PROMPT_LIMIT_OPTIONS');
    expect(uiSource).toContain('Лимит уточнений за день');
    expect(uiSource).toContain("className: 'hes-limit-row'");
    expect(uiSource).toContain("id: 'microForecast'");
    expect(uiSource).toContain("id: 'showDiaryCard'");
    expect(uiSource).toContain("id: 'cravingGraph'");
    expect(uiSource).toContain("id: 'mealEffectReview'");
    expect(uiSource).toContain("id: 'smartReminders'");
    expect(uiSource).toContain("id: 'patternInsights'");
    expect(uiSource).toContain("id: 'lowHungerClarifications'");
    expect(uiSource).toContain("id: 'lowHungerWeeklyDigest'");
    expect(uiSource).toContain("id: 'lowHungerCompactConfirm'");
    expect(uiSource).toContain("id: 'lowHungerExperiments'");
    expect(uiSource).toContain("id: 'lowHungerCuratorFocus'");
    expect(uiSource).toContain('lowHungerCompactConfirm !== false');
    expect(uiSource).toContain("className: 'hes-feature-row'");
    expect(uiSource).toContain('shouldShowSmartReminder');
  });

  it('reuses the hunger timeline after fiber as an optional diary card with a compact time axis', () => {
    vi.setSystemTime(new Date('2026-07-05T13:20:00'));
    Storage.writeEvents([{
      id: 'report-point',
      source: 'day-fab',
      recordedAt: '2026-07-05T12:00:00',
      hungerLevel: 4
    }]);

    const spark = Adapter.buildSparkTimeline({
      date: '2026-07-05',
      day: { date: '2026-07-05', meals: [{ time: '00:30', items: [{ name: 'late meal' }] }] },
      draft: { hungerLevel: 9 },
      includeCurrentPreview: false,
      compactTimeAxis: true
    });

    expect(spark.hungerPoints).toHaveLength(1);
    expect(spark.hungerPoints[0]).toMatchObject({ id: 'report-point', level: 4 });
    expect(spark.forecast).toBeNull();
    expect(spark.ticks.length).toBeGreaterThan(0);
    expect(spark.ticks.every((tick) => /^\d{2}$/.test(tick.label))).toBe(true);
    expect(spark.ticks.length).toBeLessThanOrEqual(5);
    expect(uiSource).toContain('DiaryCard: DiaryHungerCard');
    const fiberCardIndex = dayDiarySectionSource.lastIndexOf('React.createElement(DiaryFiberPanel');
    const hungerCardIndex = dayDiarySectionSource.indexOf('React.createElement(DiaryHungerCard', fiberCardIndex);
    const nextDiarySlotIndex = dayDiarySectionSource.indexOf('goalProgressBar,', hungerCardIndex);
    expect(hungerCardIndex).toBeGreaterThan(fiberCardIndex);
    expect(hungerCardIndex).toBeLessThan(nextDiarySlotIndex);
  });

  it('wires graph gestures to creation, long-press meal flow, undo, and follow-up context', () => {
    expect(uiSource).toContain("h('div', { className: 'hes-spark__gesture-hint' }, 'тап — оценка · удержание — еда')");
    expect(uiSource).toContain("className: 'hes-spark-menu'");
    expect(uiSource).toContain("onBackfillTime?.(press.target.t)");
    expect(uiSource).toContain("addMeal({ time, dateKey, source: 'hunger-spark-long-press' })");
    expect(uiSource).toContain('pushEventsUndo');
    expect(uiSource).toContain('installMealEffectFollowUps');
    expect(uiSource).toContain('Есть слабость, дрожь или головокружение?');
    expect(uiSource).toContain("['Нет таких симптомов', { safetyFlags: [] }]");
    expect(uiSource).toContain("['Пропущен приём пищи', { hungerReasons: ['missed_meal'] }]");
    expect(uiSource).toContain("['Стресс', { hungerReasons: ['stress'] }]");
    expect(uiSource).toContain("['Время еды указано неверно', { hungerReasons: ['meal_time_mismatch'] }]");
    expect(uiSource).toContain('isRecentFullMealContext(context)');
    expect(uiSource).toContain('const recentFullMeal = minSinceMeal != null && minSinceMeal <= 180');
    expect(uiSource).toContain('recentBalancedMeal: recentFullMeal');
    expect(uiSource).toContain('lastMealQuality: buildMealQualityLog(lastMealQuality)');
    expect(uiSource).toContain('mealQualitySnapshot: safeArray(context.mealQualitySnapshot)');
    expect(uiSource).toContain('mealQuality: context.lowHungerMealReview.mealQuality || null');
    expect(uiSource).toContain('input: cloneDecisionInput(finalInput)');
    expect(uiSource).toContain('stableHungerPrompt: cloneStableHungerPrompt(finalInput.stableHungerPrompt)');
    expect(uiSource).toContain('stableHungerReasons: copyArray(finalInput.stableHungerReasons)');
    expect(uiSource).toContain("hasDriver('stable_hunger_recent_food')");
    expect(uiSource).toContain("drivers.push('полноценная еда недавно')");
    expect(uiSource).toContain("drivers.push('еда держит голод')");
    expect(uiSource).toContain('return unique(drivers).slice(0, 6)');
    expect(uiSource).toContain("className: 'hes-user-why'");
    expect(uiSource).toContain("h('div', { className: 'hes-user-why__title' }, 'Почему так')");
    expect(uiSource).toContain("className: 'hes-energy-budget'");
    expect(uiSource).toContain('dayIntakeRatio < 0.45');
    expect(uiSource).toContain('dayTdeeKcal: context.dayTdeeKcal ?? null');
    expect(uiSource).toContain("meta.push('затраты ' + tdee)");
    expect(uiSource).toContain("className: 'hes-result-tools'");
    expect(uiSource).toContain("className: 'hes-result' + (detailsOpen ? ' is-expanded' : '')");
    expect(uiSource).toContain('.hes-result.is-expanded{padding-bottom:14px}');
    expect(uiSource).toContain("const showPrimaryNextAction = !!primaryNextAction && !['food', 'plan'].includes(primaryNextAction.type)");
    expect(uiSource).toContain("!showPrimaryNextAction && h('span', { className: 'hes-verdict__detail' }");
    expect(uiSource).toContain("detailsOpen ? 'Скрыть подробности' : 'Подробнее'");
    expect(uiSource).toContain("debugOpen ? 'Скрыть диагностику' : 'Диагностика'");
    expect(uiSource.indexOf("detailsOpen && h('div', { className: 'hes-details-panel'")).toBeLessThan(uiSource.indexOf("className: 'hes-user-why'"));
    expect(uiSource.indexOf("detailsOpen && h('div', { className: 'hes-details-panel'")).toBeLessThan(uiSource.indexOf("className: 'hes-debug-toggle'"));
    expect(uiSource).toContain("h('strong', null, 'Техническая диагностика')");
    expect(uiSource).not.toContain("h('div', { className: 'hes-reasons__title' }, 'Ключевые причины')");
    expect(uiSource).toContain('function formatTraceImpact(row)');
    expect(uiSource).toContain("'снизило риск ' + Math.abs(risk)");
    expect(uiSource).toContain("id: 'meal_time_mismatch'");
    expect(uiSource).toContain("id: 'stable_recent_food'");
    expect(uiSource).not.toContain('Есть дрожь, слабость или головокружение?');
    expect(uiSource).toContain('stableHungerPrompt ? h(StableHungerReasonPrompt');
    expect(uiSource).toContain('}) : h(MissingPrompt');
    expect(uiSource).toContain('context,');
    expect(uiSource).toContain('.hes-prompt.is-empty{opacity:0;background:transparent;border-color:transparent;pointer-events:none}');
    expect(uiSource).toContain("0: 'не голоден абсолютно'");
    expect(uiSource).toContain('const liveHungerLevel = clampHungerLevel(activeDraft.hungerVisual ?? activeDraft.hungerLevel)');
    expect(uiSource).toContain('min: HUNGER_MIN_LEVEL');
    expect(uiSource).toContain('hungerLevel: liveHungerLevel');
    expect(uiSource).toContain('const requiredInputs = isPastDraft ? [] : getRequiredInputs(previewDecision, draftForDecision)');
    expect(uiSource).toContain("'stable:' + stableHungerPrompt.type + ':' + (stableHungerPrompt.question || '')");
    expect(uiSource).not.toContain("'stable:' + stableHungerPrompt.type + ':' + stableHungerPrompt.currentLevel");
    expect(uiSource).toContain('animation:hesPromptFade .24s ease both');
    expect(uiSource).toContain('.hes-slider__change{grid-column:1/-1;grid-row:3;justify-self:center;max-width:270px;min-height:38px');
    expect(uiSource).toContain('.hes-slider__control{grid-column:2;grid-row:4;position:relative;width:68px;height:205px;justify-self:center;margin-top:18px;margin-bottom:18px}');
    expect(uiSource).toContain('patchDraft({ stableHungerReasons: [reason] })');
    expect(uiSource).toContain('.hes-chip.is-selected{background:#434587;color:#fff;border-color:#434587');
    expect(uiSource).toContain('@media (max-width:520px){.hes-input{padding:8px 14px 8px;gap:10px}');
    expect(uiSource).toContain('.hes-prompt{height:104px;min-height:104px;padding:10px}');
    expect(uiSource).toContain('MealEffectPrompt');
  });

  it('uses yesterday latest meal as the only meal marker when today has no meals', () => {
    vi.setSystemTime(new Date('2026-07-05T12:00:00Z'));
    global.HEYS.dayUtils = {
      loadDay(date) {
        if (date !== '2026-07-04') return null;
        return {
          date,
          meals: [
            { time: '20:00', items: [{ name: 'dinner' }] },
            { time: '23:35', items: [{ name: 'late snack' }] }
          ]
        };
      }
    };

    const spark = Adapter.buildSparkTimeline({
      date: '2026-07-05',
      day: { date: '2026-07-05', meals: [], sleepStart: '23:00', sleepEnd: '07:00' },
      draft: { hungerLevel: 3 }
    });

    expect(spark.meals).toHaveLength(1);
    expect(spark.meals[0].label).toBe('еда 23:35');
    expect(spark.hungerPoints).toHaveLength(1);
    expect(spark.nightBands.length).toBeGreaterThan(0);
    expect(spark.sleepInterval).toMatchObject({ sleepStart: '23:00', sleepEnd: '07:00', source: 'sleep' });
    expect(spark.ticks.length).toBeGreaterThan(0);
    expect(spark.path).toBe('');
  });

  it('keeps the hunger graph on the previous HEYS day before 03:00', () => {
    vi.setSystemTime(new Date(2026, 6, 8, 2, 30, 0));
    global.HEYS.dayUtils = {
      loadDay(date) {
        if (date === '2026-07-07') {
          return {
            date,
            meals: [
              { time: '21:20', items: [{ name: 'dinner' }] }
            ],
            sleepStart: '23:30',
            sleepEnd: '08:00'
          };
        }
        if (date === '2026-07-08') {
          return {
            date,
            meals: [
              { time: '01:15', items: [{ name: 'night snack' }] },
              { time: '10:00', items: [{ name: 'breakfast' }] }
            ]
          };
        }
        return null;
      }
    };

    const spark = Adapter.buildSparkTimeline({
      draft: { hungerLevel: 4 }
    });

    expect(spark.meals.map((meal) => meal.label)).toEqual(['еда 21:20', 'еда 01:15']);
    expect(spark.meals.every((meal) => meal.t <= Date.now())).toBe(true);
    expect(spark.meals[1].t).toBeGreaterThan(spark.meals[0].t);
  });

  it('does not draw a fake night band when sleep time is missing', () => {
    vi.setSystemTime(new Date('2026-07-05T12:00:00Z'));

    const spark = Adapter.buildSparkTimeline({
      date: '2026-07-05',
      day: { date: '2026-07-05', meals: [] },
      draft: { hungerLevel: 3 }
    });

    expect(spark.nightBands).toEqual([]);
    expect(spark.sleepInterval).toBeNull();
  });
});
