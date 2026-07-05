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
  it('does not auto-open over an active morning check-in', () => {
    expect(uiSource).toContain('function hasActiveMorningCheckin()');
    expect(uiSource).toContain("['open', 'in_progress', 'failed'].includes(status.state)");
    expect(uiSource).toContain('if (hasActiveMorningCheckin())');
    expect(uiSource).toContain('if (attempt < 24) scheduleAutoOpen(reason, attempt + 1);');
    expect(uiSource).toContain("global.addEventListener?.('heys:checkin-complete', onCheckinComplete)");
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

  it('renders spark with only current hunger point and the latest meal marker', () => {
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

    expect(spark.meals).toHaveLength(1);
    expect(spark.meals[0].label).toBe('еда 10:00');
    expect(spark.hungerPoints).toHaveLength(3);
    expect(spark.hungerPoints.map((point) => point.level)).toEqual([4, 5, 2]);
    expect(spark.hungerPoints[2].type).toBe('preview');
    expect(spark.hungerPoints.every((point) => /^rgb\(/.test(point.color))).toBe(true);
    expect(new Set(spark.hungerPoints.map((point) => point.color)).size).toBeGreaterThan(1);
    expect(spark.lineStops[0].color).toBe(spark.hungerPoints[0].color);
    expect(spark.lineStops.at(-1).color).toBe(spark.hungerPoints.at(-1).color);
    expect(spark.lineStops.length).toBeGreaterThanOrEqual(spark.hungerPoints.length);
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
    expect(uiSource).toContain("!isLowHungerClarification && h('footer'");
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
    expect(uiSource).toContain('Это ближе к:');
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
  });

  it('renders a separate settings button and feature rails in the hunger modal', () => {
    expect(uiSource).toContain("className: 'hes-settings-btn'");
    expect(uiSource).toContain('HungerFeatureSettings');
    expect(uiSource).toContain('lowHungerDailyPromptLimit');
    expect(uiSource).toContain('LOW_HUNGER_DAILY_PROMPT_LIMIT_OPTIONS');
    expect(uiSource).toContain('Лимит уточнений за день');
    expect(uiSource).toContain("className: 'hes-limit-row'");
    expect(uiSource).toContain("id: 'microForecast'");
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

  it('wires graph gestures to creation, long-press meal flow, undo, and follow-up context', () => {
    expect(uiSource).toContain("h('div', { className: 'hes-spark__gesture-hint' }, 'тап — оценка · удержание — еда')");
    expect(uiSource).toContain("className: 'hes-spark-menu'");
    expect(uiSource).toContain("onBackfillTime?.(press.target.t)");
    expect(uiSource).toContain("addMeal({ time, dateKey, source: 'hunger-spark-long-press' })");
    expect(uiSource).toContain('pushEventsUndo');
    expect(uiSource).toContain('installMealEffectFollowUps');
    expect(uiSource).toContain('HungerReasonPresets');
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
