import fs from 'fs';
import path from 'path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const originalHEYS = global.HEYS;
const originalWindow = global.window;
const originalReact = global.React;
const TRAININGS_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_day_trainings_v1.js'), 'utf8');

function makeReactTree() {
  return {
    Fragment: 'Fragment',
    createElement(type, props, ...children) {
      return { type, props: props || {}, children };
    },
  };
}

function findNode(node, predicate) {
  if (!node) return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findNode(child, predicate);
      if (found) return found;
    }
    return null;
  }
  if (predicate(node)) return node;
  return findNode(node.children, predicate);
}

function loadTrainingsModule(dayState) {
  let undoContext = null;
  let undoHandler = null;
  global.window = global;
  global.React = makeReactTree();
  global.HEYS = {
    ConfirmModal: {
      confirmDelete: vi.fn(async () => true),
    },
    Day: {
      getDay: () => dayState.current,
      requestFlush: vi.fn(),
    },
    Undo: {
      runAction: vi.fn((options) => {
        undoContext = options.apply();
        undoHandler = options.undo;
        return true;
      }),
    },
  };
  eval(TRAININGS_SRC);
  return {
    dayTrainings: global.HEYS.dayTrainings,
    undo: () => undoHandler?.(undoContext),
  };
}

describe('morning activation replacement training deletion', () => {
  afterEach(() => {
    global.HEYS = originalHEYS;
    global.window = originalWindow;
    global.React = originalReact;
    vi.restoreAllMocks();
  });

  it('clears the habit state when the first-half replacement training is deleted and restores it on undo', async () => {
    const initialMorningActivation = {
      status: 'done',
      replacement: 'first_half_training',
      firstMealTime: '09:00',
      decidedAt: 1770486000000,
    };
    const replacementTraining = {
      z: [0, 45, 0, 0],
      time: '09:00',
      type: 'strength',
      activityLabel: 'Тренировка в первой половине дня',
      source: 'morning_activation_replacement',
    };
    const dayState = {
      current: {
        date: '2026-06-09',
        trainings: [replacementTraining],
        morningActivation: initialMorningActivation,
      },
    };
    let visibleTrainings = 1;
    const setDay = vi.fn((updater) => {
      dayState.current = updater(dayState.current);
    });
    const setVisibleTrainings = vi.fn((updater) => {
      visibleTrainings = typeof updater === 'function' ? updater(visibleTrainings) : updater;
    });
    const { dayTrainings, undo } = loadTrainingsModule(dayState);

    const tree = dayTrainings.renderTrainingsBlock({
      setDay,
      setVisibleTrainings,
      visibleTrainings,
      trainingTypes: [{ id: 'strength', label: 'Силовая', icon: '💪' }],
      TR: [replacementTraining],
      kcalMin: [0, 5, 0, 0],
      r0: (v) => Math.round(v || 0),
    });
    const removeButton = findNode(tree, (node) =>
      node.type === 'button' && node.props?.className === 'compact-train-remove'
    );

    removeButton.props.onClick({ stopPropagation: vi.fn() });
    await Promise.resolve();
    await Promise.resolve();

    expect(dayState.current.trainings[0]).toMatchObject({ type: '', time: '' });
    expect(dayState.current.morningActivation).toMatchObject({
      status: 'pending',
      replacement: null,
      clearedByUser: true,
      followupSnoozeUntilMealCount: null,
    });

    undo();

    expect(dayState.current.trainings).toEqual([replacementTraining]);
    expect(dayState.current.morningActivation).toEqual(initialMorningActivation);
  });
});
