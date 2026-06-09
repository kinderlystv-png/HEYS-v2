import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeEach, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MODULE_PATH = path.resolve(__dirname, '..', 'heys_training_step_v1.js');

function setupTrainingStep() {
  const registeredSteps = {};
  globalThis.window = globalThis;
  globalThis.navigator = { vibrate: () => true };
  globalThis.localStorage = {
    getItem: () => null,
    setItem: () => undefined,
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
  return { trainingStep: globalThis.HEYS.TrainingStep, registeredSteps };
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
    ]);
    expect(trainingStep.TRAINING_TYPES.find((type) => type.id === 'drums')).toMatchObject({
      icon: '🥁',
      label: 'Барабаны',
    });
  });
});
