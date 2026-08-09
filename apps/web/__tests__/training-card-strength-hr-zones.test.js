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
  // Карточка конструктора отдаёт тело через проп, а не через children.
  return findNode(node.children, predicate) || findNode(node.props?.foldedContentEl, predicate);
}

function byClass(className) {
  return (node) => node.props?.className === className;
}

function loadTrainingsModule(dayState) {
  global.window = global;
  global.React = makeReactTree();
  global.HEYS = {
    ConfirmModal: { confirmDelete: vi.fn(async () => true) },
    Day: {
      getDay: () => dayState.current,
      requestFlush: vi.fn(),
      setLastLoadedUpdatedAt: vi.fn(),
      setBlockCloudUpdates: vi.fn(),
      markPendingMutation: vi.fn(),
    },
    Undo: { runAction: vi.fn((options) => { options.apply(); return true; }) },
  };
  // eslint-disable-next-line no-eval
  eval(TRAININGS_SRC);
  return global.HEYS.dayTrainings;
}

const WORKOUT_LOG = {
  version: 1,
  zoneMinutes: [0, 45, 0, 0],
  totalDurationMinutes: 45,
  exercises: [
    {
      id: 'ex_0',
      name: 'Жим лёжа',
      note: '',
      ssGroup: 0,
      rpe: 8,
      approaches: [{ id: 'ap_0_0', weightKg: 70, reps: 8 }],
    },
  ],
};

function renderCard(training) {
  const dayState = { current: { date: '2026-08-09', trainings: [training] } };
  const setDay = vi.fn((updater) => {
    dayState.current = updater(dayState.current);
  });
  const dayTrainings = loadTrainingsModule(dayState);
  const tree = dayTrainings.renderTrainingsBlock({
    setDay,
    setVisibleTrainings: vi.fn(),
    visibleTrainings: 1,
    trainingTypes: [{ id: 'strength', label: 'Силовая', icon: '💪' }],
    TR: [training],
    kcalMin: [0, 5, 0, 0],
    dateKey: '2026-08-09',
    r0: (v) => Math.round(v || 0),
  });
  return { tree, dayState };
}

describe('strength card in hr_zones mode with a preserved workout log', () => {
  afterEach(() => {
    global.HEYS = originalHEYS;
    global.window = originalWindow;
    global.React = originalReact;
    vi.restoreAllMocks();
  });

  it('hides the exercise journal and shows the plain zones row', () => {
    const { tree } = renderCard({
      z: [0, 20, 10, 0],
      time: '18:00',
      type: 'strength',
      activityLabel: 'Зал',
      strengthEntryMode: 'hr_zones',
      workoutLog: WORKOUT_LOG,
    });

    expect(findNode(tree, byClass('ct-wb-card-body'))).toBeNull();
    expect(findNode(tree, byClass('compact-train-zones-inline'))).not.toBeNull();
  });

  it('still renders the journal for an explicit workout_builder record', () => {
    const { tree } = renderCard({
      z: [0, 45, 0, 0],
      time: '18:00',
      type: 'strength',
      activityLabel: 'Зал',
      strengthEntryMode: 'workout_builder',
      workoutLog: WORKOUT_LOG,
    });

    expect(findNode(tree, byClass('ct-wb-card-body'))).not.toBeNull();
    expect(findNode(tree, byClass('compact-train-zones-inline'))).toBeNull();
  });

  it('offers the journal back and revives the preserved exercises instead of blanking them', () => {
    const { tree, dayState } = renderCard({
      z: [0, 20, 10, 0],
      time: '18:00',
      type: 'strength',
      activityLabel: 'Зал',
      strengthEntryMode: 'hr_zones',
      workoutLog: WORKOUT_LOG,
    });

    const cta = findNode(tree, byClass('ct-wb-enable-btn'));
    expect(cta).not.toBeNull();

    cta.props.onClick({ stopPropagation: vi.fn() });

    const saved = dayState.current.trainings[0];
    expect(saved.strengthEntryMode).toBe('workout_builder');
    expect(saved.workoutLog.exercises).toEqual(WORKOUT_LOG.exercises);
    // Минуты берутся из актуальных зон карточки.
    expect(saved.workoutLog.zoneMinutes).toEqual([0, 20, 10, 0]);
    expect(saved.workoutLog.totalDurationMinutes).toBe(30);
  });
});
