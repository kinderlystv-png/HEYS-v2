import fs from 'fs';
import path from 'path';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const originalHEYS = global.HEYS;
const originalWindow = global.window;
const originalDocument = global.document;
const originalCustomEvent = global.CustomEvent;
const originalReact = global.React;
const originalReactDOM = global.ReactDOM;
const originalSessionStorage = global.sessionStorage;
const STEP_MODAL_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_step_modal_v1.js'), 'utf8');
const STEPS_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_steps_v1.js'), 'utf8');

function loadModule(overrides = {}) {
  global.HEYS = {
    store: {
      readSafe: () => null,
      set: vi.fn(),
    },
    utils: {
      getCurrentClientId: () => 'client-1',
    },
    dayUtils: {
      todayISO: () => '2026-06-09',
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
    cleanup();
    localStorage.clear();
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

  it('does not reopen when first-half training replacement is the synced activity evidence', () => {
    const utils = loadModule();

    const result = utils.shouldOpenMorningActivationFollowup(mealDay({
      trainings: [{
        type: 'strength',
        activityLabel: 'Тренировка в первой половине дня',
        source: 'morning_activation_replacement',
        z: [0, 45, 0, 0],
      }],
      morningActivation: {
        status: 'pending',
        firstMealTime: '09:00',
      },
    }));

    expect(result.ok).toBe(false);
  });

  it('does not reopen after Сделаю позже until another meal is added', () => {
    const utils = loadModule();

    const snoozedNow = utils.shouldOpenMorningActivationFollowup(mealDay({
      morningActivation: {
        status: 'pending',
        followupSnoozeUntilMealCount: 1,
      },
    }));
    const afterNextMeal = utils.shouldOpenMorningActivationFollowup(mealDay({
      meals: [
        { id: 'meal-1', time: '09:00', items: [{ id: 'item-1' }] },
        { id: 'meal-2', time: '13:00', items: [{ id: 'item-2' }] },
      ],
      morningActivation: {
        status: 'pending',
        followupSnoozeUntilMealCount: 1,
      },
    }));

    expect(snoozedNow.ok).toBe(false);
    expect(afterNextMeal.ok).toBe(true);
  });

  it('closes an already-open followup when completion event confirms terminal state', () => {
    vi.useFakeTimers();
    const listeners = {};
    const dayData = mealDay({
      morningActivation: {
        status: 'done',
        intensity: 'high',
        followupSnoozeUntilMealCount: null,
      },
      trainings: [{ source: 'morning_activation' }],
    });
    const storeSet = vi.fn();
    const stepModalHide = vi.fn();
    const sessionSet = vi.fn();

    loadModule({
      HEYS: {
        currentClientId: 'client-1',
        store: {
          readSafe: vi.fn((key, fallback) => (
            key === 'heys_client-1_dayv2_2026-06-09' ? dayData : fallback
          )),
          set: storeSet,
        },
        utils: {
          getCurrentClientId: () => 'client-1',
        },
        StepModal: {
          hide: stepModalHide,
        },
      },
      addEventListener: vi.fn((type, handler) => {
        listeners[type] = handler;
      }),
      document: {
        addEventListener: vi.fn(),
        getElementById: vi.fn((id) => (id === 'heys-step-modal-root' ? {} : null)),
        dispatchEvent: vi.fn(),
      },
      sessionStorage: {
        getItem: vi.fn(() => null),
        setItem: sessionSet,
        removeItem: vi.fn(),
      },
    });

    listeners['heys:morning-activation-followup-completed']?.({
      detail: { dateKey: '2026-06-09', source: 'test' },
    });
    vi.advanceTimersByTime(0);

    expect(stepModalHide).toHaveBeenCalledWith({ scrollToDiary: false });
    expect(storeSet).toHaveBeenCalledWith(
      'heys_client-1_dayv2_2026-06-09',
      expect.objectContaining({
        morningActivation: expect.objectContaining({
          status: 'done',
          followupSnoozeUntilMealCount: null,
        }),
      })
    );
    expect(sessionSet).toHaveBeenCalledWith(
      'heys_morning_activation_followup_guard_client-1_2026-06-09',
      String(Number.MAX_SAFE_INTEGER)
    );
  });

  it('waits for meal-flow finish before stacking the followup over an active StepModal', () => {
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
    vi.advanceTimersByTime(500);

    expect(stepModalShow).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();

    listeners['heys:meal-flow-finished']?.({ detail: { dateKey: '2026-06-09', source: 'test' } });
    vi.advanceTimersByTime(220);

    expect(stepModalShow).not.toHaveBeenCalled();
    expect(global.ReactDOM.createRoot).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledTimes(1);
    expect(appended[0].id).toBe('heys-morning-activation-modal-root');
    expect(render.mock.calls[0][0].props.steps).toEqual(['morning_activation_followup']);
  });

  it('adds a regular first-half training from the charge followup modal', () => {
    const dateKey = '2026-06-09';
    const clientId = 'client-1';
    const day = mealDay({ date: dateKey });
    const scopedKey = `heys_${clientId}_dayv2_${dateKey}`;
    localStorage.setItem(scopedKey, JSON.stringify(day));

    const domWindow = global.document?.defaultView || originalDocument?.defaultView || originalWindow || global.window;
    global.window = domWindow;
    global.document = domWindow.document;
    if (typeof domWindow.addEventListener !== 'function') domWindow.addEventListener = vi.fn();
    if (typeof domWindow.removeEventListener !== 'function') domWindow.removeEventListener = vi.fn();
    global.React = React;
    global.ReactDOM = { render: vi.fn(), unmountComponentAtNode: vi.fn() };
    domWindow.React = React;
    domWindow.ReactDOM = global.ReactDOM;
    domWindow.HEYS = {
      currentClientId: clientId,
      utils: {
        getCurrentClientId: () => clientId,
      },
      dayUtils: {
        todayISO: () => dateKey,
      },
    };
    global.CustomEvent = class CustomEvent {
      constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
      }
    };
    global.HEYS = domWindow.HEYS;
    domWindow.CustomEvent = global.CustomEvent;
    const dispatchSpy = vi.fn();
    domWindow.dispatchEvent = dispatchSpy;

    // eslint-disable-next-line no-new-func
    new Function(STEP_MODAL_SRC)();
    // eslint-disable-next-line no-new-func
    new Function(STEPS_SRC)();

    const onNext = vi.fn();
    const Step = domWindow.HEYS.StepModal.registry.morning_activation_followup.component;
    render(React.createElement(Step, { context: { dateKey, firstMealTime: '09:00', onNext } }));

    fireEvent.click(screen.getByRole('button', {
      name: 'Вместо зарядки: тренировка в первой половине дня',
    }));

    const saved = JSON.parse(localStorage.getItem(scopedKey));
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(saved.morningActivation.status).toBe('done');
    expect(saved.morningActivation.replacement).toBe('first_half_training');
    expect(saved.trainings).toHaveLength(1);
    expect(saved.trainings[0]).toMatchObject({
      type: 'strength',
      time: '09:00',
      activityLabel: 'Тренировка в первой половине дня',
      source: 'morning_activation_replacement',
    });
    expect(saved.trainings[0].source).not.toBe('morning_activation');
    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({
      type: 'heys:day-updated',
    }));
    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({
      type: 'heys:morning-activation-followup-completed',
      detail: expect.objectContaining({
        dateKey,
        source: 'morning-activation-replacement',
      }),
    }));
  });
});
