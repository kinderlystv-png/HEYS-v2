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
