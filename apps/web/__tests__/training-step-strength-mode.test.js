import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeEach, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MODULE_PATH = path.resolve(__dirname, '..', 'heys_training_step_v1.js');

const DATE_KEY = '2026-08-09';
const DAY_KEY = `heys_dayv2_${DATE_KEY}`;

function setupTrainingStep() {
  const registeredSteps = {};
  const storage = new Map();
  if (globalThis.document) {
    globalThis.document.head.innerHTML = '';
    globalThis.document.body.innerHTML = '';
  }
  globalThis.window = globalThis;
  globalThis.navigator = { vibrate: () => true };
  globalThis.CustomEvent = globalThis.CustomEvent || class CustomEvent extends Event {
    constructor(type, params) {
      super(type);
      this.detail = params?.detail;
    }
  };
  globalThis.localStorage = {
    getItem: (key) => storage.has(key) ? storage.get(key) : null,
    setItem: (key, value) => storage.set(key, value),
  };
  globalThis.React = {
    createElement: (...args) => ({ args }),
    useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => undefined],
    useMemo: (factory) => factory(),
    useCallback: (callback) => callback,
    useEffect: () => undefined,
    useRef: (value) => ({ current: value }),
  };
  globalThis.HEYS = {
    StepModal: {
      registerStep(id, config) {
        registeredSteps[id] = config;
      },
      WheelPicker: () => null,
      TimePicker: () => null,
      show: () => undefined,
      hide: () => undefined,
    },
  };

  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(MODULE_PATH, 'utf8'));
  return { trainingStep: globalThis.HEYS.TrainingStep, registeredSteps, storage };
}

function nodeText(node) {
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join('');
  if (node.args) return node.args.slice(2).map(nodeText).join('');
  return '';
}

function findButtonByText(node, needle) {
  if (!node) return null;
  if (node.args && node.args[0] === 'button' && nodeText(node).includes(needle)) return node;
  const children = Array.isArray(node) ? node : (node.args ? node.args.slice(2) : []);
  for (const child of children) {
    const found = findButtonByText(child, needle);
    if (found) return found;
  }
  return null;
}

function seedDay(storage, training) {
  storage.set(DAY_KEY, JSON.stringify({ date: DATE_KEY, trainings: [training] }));
}

function readDay(storage) {
  return JSON.parse(storage.get(DAY_KEY));
}

/** Повторяет реальный порядок мастера: каждый шаг берёт initial data так же, как StepModal. */
function collectStepData(registeredSteps, ctx, overrides = {}) {
  const info = { ...registeredSteps['training-info'].getInitialData(ctx), ...(overrides['training-info'] || {}) };
  const allStepData = { 'training-info': info };
  allStepData['training-feedback'] = {
    ...registeredSteps['training-feedback'].getInitialData(ctx, allStepData),
    ...(overrides['training-feedback'] || {}),
  };
  allStepData['training-strength-mode'] = {
    ...registeredSteps['training-strength-mode'].getInitialData(ctx, allStepData),
    ...(overrides['training-strength-mode'] || {}),
  };
  allStepData['training-zones'] = {
    ...registeredSteps['training-zones'].getInitialData(ctx, allStepData),
    ...(overrides['training-zones'] || {}),
  };
  return allStepData;
}

const WORKOUT_LOG = {
  version: 1,
  zoneMinutes: [0, 45, 0, 0],
  totalDurationMinutes: 45,
  exercises: [
    {
      id: 'ex_0',
      name: 'Жим лёжа',
      note: 'разминка 20 кг',
      ssGroup: 0,
      rpe: 8,
      approaches: [
        { id: 'ap_0_0', weightKg: 60, reps: 10 },
        { id: 'ap_0_1', weightKg: 70, reps: 8 },
      ],
    },
    {
      id: 'ex_1',
      name: 'Тяга штанги',
      note: '',
      ssGroup: 0,
      rpe: 7,
      approaches: [{ id: 'ap_1_0', weightKg: 55, reps: 12 }],
    },
  ],
  startedAt: 1754700000000,
  finishedAt: 1754702700000,
};

const STRENGTH_WITH_LOG = {
  id: 'tr_strength_1',
  source: 'connector',
  intensity: 'high',
  type: 'strength',
  activityLabel: 'Зал',
  time: '18:00',
  z: [0, 45, 0, 0],
  mood: 7,
  wellbeing: 8,
  stress: 3,
  comment: 'база',
  strengthEntryMode: 'workout_builder',
  workoutLog: WORKOUT_LOG,
};

describe('training step: strength mode switch', () => {
  beforeEach(() => {
    delete globalThis.window;
    delete globalThis.navigator;
    delete globalThis.localStorage;
    delete globalThis.React;
    delete globalThis.HEYS;
  });

  it('keeps the workout log when the wizard switches strength to heart-rate zones', () => {
    const { registeredSteps, storage } = setupTrainingStep();
    const ctx = { dateKey: DATE_KEY, trainingIndex: 0 };
    seedDay(storage, STRENGTH_WITH_LOG);

    const allStepData = collectStepData(registeredSteps, ctx, {
      'training-strength-mode': { mode: 'hr_zones' },
      'training-zones': { zones: [0, 20, 10, 0] },
    });
    registeredSteps['training-zones'].save(allStepData['training-zones'], ctx, allStepData);

    const saved = readDay(storage).trainings[0];
    expect(saved.strengthEntryMode).toBe('hr_zones');
    expect(saved.z).toEqual([0, 20, 10, 0]);
    expect(saved.workoutLog).toEqual(WORKOUT_LOG);
    expect(saved.workoutLog.exercises).toHaveLength(2);
    expect(saved.workoutLog.exercises[0].approaches).toEqual(WORKOUT_LOG.exercises[0].approaches);
  });

  it('revives the same workout log after a round trip through heart-rate zones', () => {
    const { registeredSteps, storage } = setupTrainingStep();
    const ctx = { dateKey: DATE_KEY, trainingIndex: 0 };
    seedDay(storage, STRENGTH_WITH_LOG);

    const toZones = collectStepData(registeredSteps, ctx, {
      'training-strength-mode': { mode: 'hr_zones' },
      'training-zones': { zones: [0, 20, 10, 0] },
    });
    registeredSteps['training-zones'].save(toZones['training-zones'], ctx, toZones);

    const backToBuilder = collectStepData(registeredSteps, ctx, {
      'training-strength-mode': { mode: 'workout_builder' },
    });
    registeredSteps['training-strength-mode'].save(
      backToBuilder['training-strength-mode'],
      ctx,
      backToBuilder,
    );

    const saved = readDay(storage).trainings[0];
    expect(saved.strengthEntryMode).toBe('workout_builder');
    expect(saved.workoutLog.exercises).toEqual(WORKOUT_LOG.exercises);
    expect(saved.workoutLog.startedAt).toBe(WORKOUT_LOG.startedAt);
    expect(saved.workoutLog.finishedAt).toBe(WORKOUT_LOG.finishedAt);
    // Минуты подтягиваются под актуальные зоны, упражнения при этом не трогаем.
    expect(saved.workoutLog.zoneMinutes).toEqual([0, 20, 10, 0]);
    expect(saved.workoutLog.totalDurationMinutes).toBe(30);
  });

  it('carries id, source and intensity through the wizard save', () => {
    const { registeredSteps, storage } = setupTrainingStep();
    const ctx = { dateKey: DATE_KEY, trainingIndex: 0 };
    seedDay(storage, STRENGTH_WITH_LOG);

    const allStepData = collectStepData(registeredSteps, ctx, {
      'training-strength-mode': { mode: 'hr_zones' },
      'training-zones': { zones: [0, 30, 0, 0] },
    });
    registeredSteps['training-zones'].save(allStepData['training-zones'], ctx, allStepData);

    const saved = readDay(storage).trainings[0];
    expect(saved.id).toBe('tr_strength_1');
    expect(saved.source).toBe('connector');
    expect(saved.intensity).toBe('high');
  });

  it('carries id from disk even when the wizard step data never saw it', () => {
    const { registeredSteps, storage } = setupTrainingStep();
    const ctx = { dateKey: DATE_KEY, trainingIndex: 0 };
    seedDay(storage, { ...STRENGTH_WITH_LOG, strengthEntryMode: 'hr_zones', workoutLog: undefined });

    const allStepData = collectStepData(registeredSteps, ctx, {
      'training-strength-mode': { mode: 'hr_zones' },
      'training-zones': { zones: [0, 30, 0, 0] },
    });
    // Имитируем шаг, чей data потерял поля коннектора: подхват обязан идти с диска.
    delete allStepData['training-info'].id;
    delete allStepData['training-info'].source;
    delete allStepData['training-info'].intensity;
    delete allStepData['training-feedback'].id;
    delete allStepData['training-feedback'].source;
    delete allStepData['training-feedback'].intensity;
    delete allStepData['training-zones'].id;
    delete allStepData['training-zones'].source;
    delete allStepData['training-zones'].intensity;

    registeredSteps['training-zones'].save(allStepData['training-zones'], ctx, allStepData);

    const saved = readDay(storage).trainings[0];
    expect(saved.id).toBe('tr_strength_1');
    expect(saved.source).toBe('connector');
    expect(saved.intensity).toBe('high');
  });

  it('spreads the fallback workout log over all four zones', () => {
    const { registeredSteps, storage } = setupTrainingStep();
    const ctx = { dateKey: DATE_KEY, trainingIndex: 0 };
    // Силовая с режимом конструктора, но без журнала (так приходят записи коннектора);
    // тип меняют на кардио, поэтому шаг «Силовая» не сохраняет журнал сам.
    seedDay(storage, {
      type: 'strength',
      activityLabel: 'Зал',
      time: '18:00',
      z: [0, 0, 0, 0],
      strengthEntryMode: 'workout_builder',
    });

    const allStepData = collectStepData(registeredSteps, ctx, {
      'training-info': { type: 'cardio', activityLabel: 'Бег' },
      'training-zones': { zones: [5, 20, 10, 5] },
    });
    registeredSteps['training-zones'].save(allStepData['training-zones'], ctx, allStepData);

    const saved = readDay(storage).trainings[0];
    expect(saved.workoutLog.zoneMinutes).toEqual([5, 20, 10, 5]);
    expect(saved.workoutLog.totalDurationMinutes).toBe(40);
  });
});

describe('training step: quick duration presets', () => {
  beforeEach(() => {
    delete globalThis.window;
    delete globalThis.navigator;
    delete globalThis.localStorage;
    delete globalThis.React;
    delete globalThis.HEYS;
  });

  it('splits the preset 40/35/20/5 over Z1…Z4 and keeps the exact total', () => {
    const { registeredSteps } = setupTrainingStep();
    const expected = {
      15: [6, 6, 3, 0],
      30: [12, 11, 6, 1],
      45: [18, 16, 9, 2],
      60: [24, 21, 12, 3],
    };

    Object.entries(expected).forEach(([minutes, zones]) => {
      const changes = [];
      const tree = registeredSteps['training-zones'].component({
        data: { zones: [0, 0, 0, 0] },
        onChange: (next) => changes.push(next),
        context: { dateKey: DATE_KEY, trainingIndex: 0 },
      });

      const button = findButtonByText(tree, `${minutes} мин`);
      expect(button).not.toBeNull();
      button.args[1].onClick();

      expect(changes.at(-1).zones).toEqual(zones);
      expect(changes.at(-1).zones.reduce((sum, v) => sum + v, 0)).toBe(Number(minutes));
    });
  });
});
