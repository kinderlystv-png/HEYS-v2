import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeEach, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MODULE_PATH = path.resolve(
  __dirname,
  '..',
  'hobby',
  'drums-finger-control',
  'heys_drums_finger_trainer_v1.js',
);

function setupModule() {
  const store = new Map();
  globalThis.window = globalThis;
  globalThis.HEYS = {
    utils: {
      lsGet(key, fallback) {
        return store.has(key) ? JSON.parse(store.get(key)) : fallback;
      },
      lsSet(key, value) {
        store.set(key, JSON.stringify(value));
      },
    },
  };
  globalThis.localStorage = {
    get length() {
      return store.size;
    },
    key(index) {
      return Array.from(store.keys())[index] || null;
    },
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
  };
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, init) {
      this.type = type;
      this.detail = init?.detail;
    }
  };
  globalThis.dispatchEvent = () => true;

  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(MODULE_PATH, 'utf8'));
  return { api: globalThis.HEYS.Hobby.DrumsFingerControl, store };
}

describe('drums finger trainer', () => {
  beforeEach(() => {
    delete globalThis.HEYS;
    delete globalThis.window;
    delete globalThis.localStorage;
  });

  it('registers lightweight hobby API and four method sessions', () => {
    const { api } = setupModule();
    expect(api.MODULE_ID).toBe('drums_finger_control');
    expect(api.SESSIONS.map((s) => s.id)).toEqual([
      'balanced_25',
      'speed_breakthrough_30',
      'low_tension_rebuild_23',
      'micro_15',
    ]);
    expect(api.expandSession('balanced_25').blockItems.map((b) => b.id)).toContain(
      'finger_rebound',
    );
  });

  it('builds a completed hobbyLog with clean BPM metrics', () => {
    const { api } = setupModule();
    const state = api._test.makeSessionState('balanced_25', {
      dateKey: '2026-06-09',
      trainingIndex: 0,
    });
    state.results[0].done = true;
    state.results[0].clean = true;
    state.results[0].bpm = 80;
    state.metrics.cleanBpmSingles16 = 112;
    state.metrics.cleanBpmDoubles16 = 94;

    const log = api._test.buildHobbyLog(state);
    expect(log.moduleId).toBe('drums_finger_control');
    expect(log.sessionId).toBe('balanced_25');
    expect(log.metrics.cleanBpmSingles16).toBe(112);
    expect(log.completedBlocks).toBe(1);
  });

  it('saves session into hobby training without changing it to strength/fingers', () => {
    const { api } = setupModule();
    const state = api._test.makeSessionState('micro_15', {
      dateKey: '2026-06-09',
      trainingIndex: 1,
    });
    state.metrics.tensionScore = 4;
    api._test.saveSessionToTraining(state);

    const saved = api._test.readDay('2026-06-09').day.trainings[1];
    expect(saved.type).toBe('hobby');
    expect(saved.hobbySubtype).toBe('drums_finger_control');
    expect(saved.hobbyLog.sessionId).toBe('micro_15');
    expect(saved.z[0]).toBe(15);
  });

  it('summarizes progress and downshifts recommendation after high tension', () => {
    const { api } = setupModule();
    const logs = [
      {
        dateKey: '2026-06-09',
        log: {
          sessionId: 'speed_breakthrough_30',
          totalDurationMinutes: 30,
          completedAt: Date.now(),
          metrics: { cleanBpmSingles16: 120, cleanBpmDoubles16: 90, tensionScore: 8 },
          blockResults: [{ clean: true }, { clean: false }],
        },
      },
    ];

    const stats = api.summarizeProgress(logs);
    expect(stats.totalSessions).toBe(1);
    expect(stats.bestSingles).toBe(120);
    expect(stats.cleanRate).toBe(50);
    expect(stats.nextSuggestion).toBe('low_tension_rebuild_23');
  });
});
