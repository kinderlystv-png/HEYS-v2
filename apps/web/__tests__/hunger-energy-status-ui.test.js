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
});

afterAll(() => {
  vi.useRealTimers();
  global.window = originalWindow;
  global.HEYS = originalHEYS;
  global.localStorage = originalLocalStorage;
  global.document = originalDocument;
});

describe('Hunger Energy Status UI adapter', () => {
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
});
