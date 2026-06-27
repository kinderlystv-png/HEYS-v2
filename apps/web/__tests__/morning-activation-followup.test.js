import fs from 'fs';
import path from 'path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const originalHEYS = global.HEYS;
const originalWindow = global.window;
const originalDocument = global.document;
const originalCustomEvent = global.CustomEvent;
const originalReact = global.React;
const originalReactDOM = global.ReactDOM;
const originalSessionStorage = global.sessionStorage;

function loadModule(overrides = {}) {
  global.HEYS = {
    store: {
      readSafe: () => null,
      set: vi.fn(),
    },
    utils: {
      getCurrentClientId: () => 'client-1',
    },
    ...(overrides.HEYS || {}),
  };
  global.window = global;
  global.addEventListener = overrides.addEventListener || vi.fn();
  global.dispatchEvent = overrides.dispatchEvent || vi.fn();
  global.document = overrides.document || {
    addEventListener: vi.fn(),
    getElementById: vi.fn(() => null),
  };
  global.React = overrides.React || originalReact;
  global.ReactDOM = overrides.ReactDOM || originalReactDOM;
  global.sessionStorage = overrides.sessionStorage || originalSessionStorage || {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
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
    global.React = originalReact;
    global.ReactDOM = originalReactDOM;
    global.sessionStorage = originalSessionStorage;
    delete global.addEventListener;
    delete global.dispatchEvent;
    vi.useRealTimers();
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

  it('stacks the followup over an active StepModal instead of replacing it', () => {
    vi.useFakeTimers();
    const listeners = {};
    const documentListeners = {};
    const appended = [];
    const render = vi.fn();
    const unmount = vi.fn();
    const stepModalShow = vi.fn();
    const dayData = mealDay();

    loadModule({
      HEYS: {
        store: {
          readSafe: vi.fn(() => dayData),
          set: vi.fn(),
        },
        StepModal: {
          show: stepModalShow,
          registry: { morning_activation_followup: true },
          Component: function StepModalComponent() {
            return null;
          },
        },
      },
      addEventListener: vi.fn((type, handler) => {
        listeners[type] = handler;
      }),
      dispatchEvent: vi.fn(),
      document: {
        addEventListener: vi.fn((type, handler) => {
          documentListeners[type] = handler;
        }),
        getElementById: vi.fn((id) => (id === 'heys-step-modal-root' ? {} : null)),
        createElement: vi.fn((tag) => ({
          tag,
          style: {},
          parentNode: {
            removeChild: vi.fn(),
          },
        })),
        body: {
          appendChild: vi.fn((node) => appended.push(node)),
        },
      },
      React: {
        createElement: vi.fn((type, props) => ({ type, props })),
      },
      ReactDOM: {
        createRoot: vi.fn(() => ({ render, unmount })),
      },
      sessionStorage: {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
    });

    listeners.heysProductAdded?.();
    documentListeners['heys-stepmodal-closed']?.();
    vi.advanceTimersByTime(220);

    expect(stepModalShow).not.toHaveBeenCalled();
    expect(global.ReactDOM.createRoot).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledTimes(1);
    expect(appended[0].id).toBe('heys-morning-activation-modal-root');
    expect(render.mock.calls[0][0].props.steps).toEqual(['morning_activation_followup']);
  });
});
