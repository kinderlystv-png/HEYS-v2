import fs from 'fs';
import path from 'path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const originalHEYS = global.HEYS;
const originalWindow = global.window;
const originalDocument = global.document;
const originalCustomEvent = global.CustomEvent;

function loadModule() {
  global.HEYS = {
    store: {
      readSafe: () => null,
    },
    utils: {
      getCurrentClientId: () => 'client-1',
    },
  };
  global.window = global;
  global.addEventListener = vi.fn();
  global.dispatchEvent = vi.fn();
  global.document = {
    addEventListener: vi.fn(),
    getElementById: vi.fn(() => null),
  };
  global.CustomEvent = class CustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  };

  const srcPath = path.resolve(__dirname, '../heys_morning_checkin_v1.js');
  eval(fs.readFileSync(srcPath, 'utf8'));
  return global.HEYS.MorningCheckinUtils;
}

function mealDay(patch = {}) {
  return {
    date: '2026-06-09',
    meals: [{ id: 'meal-1', time: '09:00', items: [{ id: 'item-1' }] }],
    trainings: [],
    householdActivities: [],
    ...patch,
  };
}

describe('morning activation followup decision', () => {
  afterEach(() => {
    global.HEYS = originalHEYS;
    global.window = originalWindow;
    global.document = originalDocument;
    global.CustomEvent = originalCustomEvent;
    delete global.addEventListener;
    delete global.dispatchEvent;
    vi.restoreAllMocks();
  });

  it('does not reopen when morning activation is done even if the generated training is absent', () => {
    const utils = loadModule();

    const result = utils.shouldOpenMorningActivationFollowup(mealDay({
      morningActivation: { status: 'done', intensity: 'medium' },
    }));

    expect(result.ok).toBe(false);
  });

  it('reopens after an explicit user-cleared marker, not from absence alone', () => {
    const utils = loadModule();

    const result = utils.shouldOpenMorningActivationFollowup(mealDay({
      morningActivation: {
        status: 'done',
        intensity: 'medium',
        clearedByUser: true,
        clearedAt: 1770486000000,
      },
    }));

    expect(result.ok).toBe(true);
    expect(result.firstMealTime).toBe('09:00');
  });
});
