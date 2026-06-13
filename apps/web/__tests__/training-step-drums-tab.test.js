import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeEach, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MODULE_PATH = path.resolve(__dirname, '..', 'heys_training_step_v1.js');

function setupTrainingStep() {
  const registeredSteps = {};
  const storage = new Map();
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

describe('training step drums tab', () => {
  beforeEach(() => {
    delete globalThis.window;
    delete globalThis.navigator;
    delete globalThis.localStorage;
    delete globalThis.React;
    delete globalThis.HEYS;
  });

  it('exports drums as a dedicated training type tab', () => {
    const { trainingStep, registeredSteps } = setupTrainingStep();

    expect(Object.keys(registeredSteps)).toContain('training-info');
    expect(trainingStep.TRAINING_TYPES.map((type) => type.id)).toEqual([
      'cardio',
      'strength',
      'hobby',
      'drums',
      'fingers',
      'mobility',
    ]);
    expect(trainingStep.TRAINING_TYPES.find((type) => type.id === 'drums')).toMatchObject({
      icon: '🥁',
      label: 'Барабаны',
    });
    expect(trainingStep.TRAINING_TYPES.find((type) => type.id === 'mobility')).toMatchObject({
      icon: '🧘',
      label: 'Мобильность',
    });
  });

  it('persists mobilityLog through the shared training step storage contract', () => {
    const { trainingStep, storage } = setupTrainingStep();
    const log = {
      version: 1,
      mode: 'evening_relax',
      totalDurationMinutes: 12,
      ok: true,
    };

    trainingStep.saveMobility({ dateKey: '2026-06-13', trainingIndex: 1 }, log, {
      time: '20:30',
      comment: 'after desk work',
    });

    const day = JSON.parse(storage.get('heys_dayv2_2026-06-13'));
    expect(day.trainings[1]).toMatchObject({
      type: 'mobility',
      activityLabel: 'Мобильность',
      time: '20:30',
      comment: 'after desk work',
      mobilityLog: log,
    });
  });

  it('opens Mobility fullscreen from the type tab when the module is loaded', () => {
    const { registeredSteps } = setupTrainingStep();
    const opened = [];
    globalThis.HEYS.Mobility = {
      openFullscreen: (opts) => opened.push(opts),
    };
    const tree = registeredSteps['training-info'].component({
      data: { type: 'cardio', time: '09:00' },
      onChange: () => undefined,
      context: { dateKey: '2026-06-13', trainingIndex: 3 },
    });

    const button = findButtonByText(tree, 'Мобильность');
    expect(button).not.toBeNull();
    expect(button.args[1].type).toBe('button');
    expect(button.args[1].title).toBe('Открыть режим мобильности');
    button.args[1].onClick();

    expect(opened).toEqual([{
      dateKey: '2026-06-13',
      trainingIndex: 3,
      mode: 'new',
    }]);
  });

  it('keeps Mobility as a normal selected type when fullscreen module is unavailable', () => {
    const { registeredSteps } = setupTrainingStep();
    const changes = [];
    const tree = registeredSteps['training-info'].component({
      data: { type: 'cardio', time: '09:00' },
      onChange: (next) => changes.push(next),
      context: { dateKey: '2026-06-13', trainingIndex: 0 },
    });

    const button = findButtonByText(tree, 'Мобильность');
    expect(button).not.toBeNull();
    expect(button.args[1].type).toBe('button');
    button.args[1].onClick();

    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      type: 'mobility',
      activityLabel: 'Мобильность',
      hobbySubtype: '',
      time: '09:00',
    });
  });

  it('skips shared heart-rate zones for Mobility dedicated overlay flow', () => {
    const { registeredSteps } = setupTrainingStep();
    const shouldShow = registeredSteps['training-zones'].shouldShow;

    expect(shouldShow({}, { 'training-info': { type: 'mobility' } })).toBe(false);
    expect(shouldShow({}, { 'training-info': { type: 'fingers' } })).toBe(false);
    expect(shouldShow({}, { 'training-info': { type: 'cardio' } })).toBe(true);
  });
});
