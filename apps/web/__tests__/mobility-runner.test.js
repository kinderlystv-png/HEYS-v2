// mobility-runner.test.js — routine_runner + breath_runner.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeAll, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MOB_DIR = path.resolve(__dirname, '..', 'mobility');

const setupOnce = () => {
  if (!globalThis.window) globalThis.window = globalThis;
  globalThis.window.HEYS = globalThis.HEYS = {};
  const ev = (f) => { /* eslint-disable-next-line no-eval */ eval(fs.readFileSync(path.join(MOB_DIR, f), 'utf8')); };
  ev('heys_mobility_axis_catalog_v1.js');
  ev('heys_mobility_validators_v1.js');
  ev('heys_mobility_atom_catalog_v1.js');
  ev('heys_mobility_mode_engine_v1.js');
  ev('heys_mobility_routine_builder_v1.js');
  ev('heys_mobility_breath_runner_v1.js');
  ev('heys_mobility_routine_runner_v1.js');
};

const HEYS_M = () => globalThis.HEYS.Mobility;
const profile = () => ({
  age: 30,
  level: 'intermediate',
  populations: [],
  equipment: ['band', 'strap', 'foam_roll', 'ball', 'percussion', 'bolster']
});

describe('mobility breath_runner', () => {
  beforeAll(setupOnce);

  it('строит resonant breath plan', () => {
    const atom = HEYS_M().atomCatalog.getAtom('breath_resonant');
    const plan = HEYS_M().breathRunner.buildBreathPlan(atom);
    expect(plan.ok).toBe(true);
    expect(plan.pattern).toBe('resonant');
    expect(plan.cycleSec).toBe(10);
    expect(plan.cycles).toBe(30);
  });

  it('box breathing содержит 4 фазы', () => {
    const atom = HEYS_M().atomCatalog.getAtom('breath_box_tonify');
    const plan = HEYS_M().breathRunner.buildBreathPlan(atom);
    expect(plan.phases.map((p) => p.type)).toEqual(['inhale', 'hold', 'exhale', 'hold']);
  });
});

describe('mobility routine_runner', () => {
  beforeAll(setupOnce);

  it('materializeAtom разворачивает PNF на contract/relax/hold фазы', () => {
    const atom = HEYS_M().atomCatalog.getAtom('flex_pnf_hamstring_hr');
    const steps = HEYS_M().routineRunner.materializeAtom(atom);
    expect(steps.length).toBe(9);
    expect(steps.slice(0, 3).map((s) => s.kind)).toEqual(['pnf_contract', 'pnf_relax', 'pnf_hold']);
  });

  it('materializeAtom для hold создаёт timer step', () => {
    const atom = HEYS_M().atomCatalog.getAtom('flex_static_hamstring');
    const steps = HEYS_M().routineRunner.materializeAtom(atom);
    expect(steps[0].kind).toBe('hold');
    expect(steps[0].durationSec).toBe(30);
  });

  it('buildRunPlan принимает session из builder', () => {
    const built = HEYS_M().routineBuilder.buildSession('evening_relax', profile(), {});
    const plan = HEYS_M().routineRunner.buildRunPlan(built.session);
    expect(plan.totalSteps).toBeGreaterThan(0);
    expect(plan.steps.some((s) => s.kind === 'breath')).toBe(true);
    expect(plan.estimatedDurationSec).toBeGreaterThan(0);
  });

  it('lifecycle transition поддерживает start/pause/resume/abort', () => {
    const state = HEYS_M().routineRunner.createState({ steps: [{}, {}] });
    const running = HEYS_M().routineRunner.transition(state, 'start');
    const paused = HEYS_M().routineRunner.transition(running, 'pause');
    const resumed = HEYS_M().routineRunner.transition(paused, 'resume');
    const aborted = HEYS_M().routineRunner.transition(resumed, 'abort');
    expect([running.status, paused.status, resumed.status, aborted.status]).toEqual(['running', 'paused', 'running', 'aborted']);
    expect(aborted.aborted).toBe(true);
  });
});
