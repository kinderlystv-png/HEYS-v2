// fingers-run-adapter.test.js — Этап 5: exercises[] → общий RunPlan-контракт.
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

beforeAll(() => {
  if (!globalThis.window) globalThis.window = globalThis;
  globalThis.window.HEYS = globalThis.HEYS = {};
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(path.resolve(__dirname, '..', '_kernel', 'heys_kernel_runner_v1.js'), 'utf8'));
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(path.resolve(__dirname, '..', 'fingers', 'heys_fingers_run_adapter_v1.js'), 'utf8'));
});

const build = (rec) => globalThis.HEYS.Fingers.runAdapter.buildFingersRunPlan(rec);

describe('fingers run adapter → shared RunPlan contract', () => {
  it('вис (без doseShape) → kind=hang, sets/reps/meta, оценка hangSec×reps×sets', () => {
    const plan = build({
      id: 'mix1',
      exercises: [
        { gripId: 'halfcrimp', hangSec: 7, repsPerSet: 6, setsCount: 5, edgeSizeMm: 20, addedWeightKg: 10 }
      ]
    });
    expect(plan.totalSteps).toBe(1);
    expect(plan.steps[0].kind).toBe('hang');
    expect(plan.steps[0].durationSec).toBe(7);
    expect(plan.steps[0].sets).toBe(5);
    expect(plan.steps[0].reps).toBe(6);
    expect(plan.steps[0].meta.gripId).toBe('halfcrimp');
    expect(plan.steps[0].meta.addedWeightKg).toBe(10);
    expect(plan.estimatedDurationSec).toBe(210); // 7 * (6 reps * 5 sets)
  });

  it('doseShape маппится в step.kind через общий контракт', () => {
    const plan = build({
      exercises: [
        { doseShape: 'reps', reps: 8, sets: 3 },
        { doseShape: 'continuous', durationSec: 30, sets: 1 },
        { doseShape: 'circuit', sets: 2 },
        { doseShape: 'process' }
      ]
    });
    expect(plan.steps.map((s) => s.kind)).toEqual(['reps', 'timer', 'circuit', 'process']);
    expect(plan.totalSteps).toBe(4);
  });

  it('пустой/невалидный вход → пустой план, без падения', () => {
    expect(build({}).totalSteps).toBe(0);
    expect(build(null).totalSteps).toBe(0);
    expect(build({ exercises: [] }).estimatedDurationSec).toBe(0);
  });

  it('RunPlan совместим по форме с mobility (steps/totalSteps/estimatedDurationSec)', () => {
    const plan = build({ exercises: [{ hangSec: 5, repsPerSet: 1, setsCount: 1 }] });
    expect(plan).toHaveProperty('steps');
    expect(plan).toHaveProperty('totalSteps');
    expect(plan).toHaveProperty('estimatedDurationSec');
    expect(Array.isArray(plan.steps)).toBe(true);
  });
});
