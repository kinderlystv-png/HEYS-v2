// kernel-runner.test.js — shared linear runner lifecycle.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeAll, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB = path.resolve(__dirname, '..');

const setupOnce = () => {
  if (!globalThis.window) globalThis.window = globalThis;
  globalThis.window.HEYS = globalThis.HEYS = {};
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(path.join(WEB, '_kernel', 'heys_kernel_runner_v1.js'), 'utf8'));
};

const R = () => globalThis.HEYS.TrainingKernel.runner;

describe('TrainingKernel.runner', () => {
  beforeAll(setupOnce);

  it('creates linear state from plan steps', () => {
    expect(R().createLinearState({ steps: [{}, {}, {}] })).toEqual({
      status: 'idle',
      index: 0,
      totalSteps: 3,
      aborted: false
    });
  });

  it('supports start/pause/resume/next/prev/complete/abort', () => {
    let s = R().createLinearState({ steps: [{}, {}] });
    s = R().transitionLinear(s, 'start');
    s = R().transitionLinear(s, 'next');
    s = R().transitionLinear(s, 'next');
    expect(s).toMatchObject({ status: 'running', index: 1 });
    s = R().transitionLinear(s, 'prev');
    s = R().transitionLinear(s, 'pause');
    s = R().transitionLinear(s, 'resume');
    s = R().transitionLinear(s, 'complete');
    expect(s).toMatchObject({ status: 'complete', index: 0, aborted: false });
    expect(R().transitionLinear(s, 'abort')).toMatchObject({ status: 'aborted', aborted: true });
  });

  it('builds cyclic phase plans without mutating phases', () => {
    const phases = [{ type: 'in', durationSec: 4 }, { type: 'out', durationSec: 6 }];
    const plan = R().buildCyclicPhasePlan(phases, {
      durationSec: 65,
      meta: { atomId: 'breath_a', pattern: 'resonant' }
    });
    expect(plan).toMatchObject({ ok: true, atomId: 'breath_a', pattern: 'resonant', cycleSec: 10, durationSec: 65, cycles: 6 });
    plan.phases[0].durationSec = 99;
    expect(phases[0].durationSec).toBe(4);
  });

  it('computes remaining seconds from persisted phase snapshots', () => {
    expect(R().remainingSecFromSnapshot({
      phaseStartedAt: 10_000,
      durationSec: 7
    }, { nowMs: 12_100 })).toBe(5);
    expect(R().remainingSecFromSnapshot({
      phaseStartedAt: 10_000,
      durationSec: 2
    }, { nowMs: 12_000 })).toBe(0.5);
  });

  it('creates run plans and estimates duration with domain multiplier', () => {
    const steps = [
      { kind: 'hold', durationSec: 30, sets: 2, reps: 3 },
      { kind: 'reps', durationSec: 10, sets: 2, reps: 5 }
    ];
    const plan = R().createRunPlan({ mode: 'morning' }, steps, {
      multiplier: (s) => (Number(s.sets) || 1) * (Number(s.reps) && s.kind === 'hold' ? Number(s.reps) : 1)
    });
    expect(plan).toMatchObject({
      sessionMode: 'morning',
      totalSteps: 2,
      estimatedDurationSec: 200
    });
    expect(plan.steps).not.toBe(steps);
  });

  it('estimateDoseSec runs domain dose-shape formulas with shared num/avg helpers', () => {
    const atom = {
      doseShape: 'hang',
      dose: { workSec: 7, reps: [5, 7], sets: 2, restSec: 3, restSetsSec: 60 }
    };
    const sec = R().estimateDoseSec(atom, {
      hang: ({ dose, num, avg }) => {
        const reps = num(dose.reps, avg(dose.reps, 1));
        const sets = num(dose.sets, 1);
        return num(dose.workSec) * reps * sets +
               num(dose.restSec) * Math.max(0, reps - 1) * sets +
               num(dose.restSetsSec) * Math.max(0, sets - 1);
      }
    });
    expect(sec).toBe(174);
  });

  it('estimateDoseMetrics delegates dose-shape math and normalizes output', () => {
    const ex = {
      doseShape: 'circuit',
      dose: { problemsPerRound: 4, rounds: 3, restRoundsSec: 120 }
    };
    const metrics = R().estimateDoseMetrics(ex, {
      circuit: ({ dose, num, max, shape }) => {
        const rounds = max(1, num(dose.rounds, 1));
        const problems = max(1, num(dose.problemsPerRound, 1));
        const workSec = problems * rounds * 25;
        const restSec = num(dose.restRoundsSec, 0) * max(0, rounds - 1);
        return { shape, durationSec: workSec + restSec, workSec, units: rounds, unitKind: 'rounds' };
      }
    });
    expect(metrics).toEqual({
      shape: 'circuit',
      durationSec: 540,
      workSec: 300,
      units: 3,
      unitKind: 'rounds'
    });
  });

  it('scaleMetrics preserves metadata and scales numeric workload fields', () => {
    expect(R().scaleMetrics({
      shape: 'attempts',
      durationSec: 700,
      workSec: 35,
      units: 7,
      unitKind: 'attempts',
      extra: 'kept'
    }, 3 / 7)).toEqual({
      shape: 'attempts',
      durationSec: 300,
      workSec: 15,
      units: 3,
      unitKind: 'attempts',
      extra: 'kept'
    });
  });

  it('summarizeMetrics totals metrics and detects mixed unit kinds', () => {
    expect(R().summarizeMetrics([
      { shape: 'hang', durationSec: 120, workSec: 42, units: 6, unitKind: 'hangs' },
      { shape: 'reps', durationSec: 30, workSec: 18, units: 6, unitKind: 'reps' }
    ])).toEqual({
      durationSec: 150,
      workSec: 60,
      units: 12,
      unitKind: 'hangs',
      shapeCounts: { hang: 1, reps: 1 },
      mixedUnits: true
    });
  });

  it('createPhaseGraph routes timed/manual phase transitions from config', () => {
    const graph = R().createPhaseGraph({
      initialState: 'prep',
      terminalStates: ['done'],
      initialContext: { setIdx: 0, repIdx: 0 },
      transitions: {
        prep: {
          advance: () => ({ state: 'work', durationSec: 7 })
        },
        work: {
          advance: (ctx) => ctx.repIdx >= 1
            ? { state: 'done', durationSec: 0, context: ctx }
            : { state: 'rest', durationSec: 3, context: ctx }
        },
        rest: {
          advance: (ctx) => ({ state: 'prep', durationSec: 5, context: { repIdx: ctx.repIdx + 1 } })
        }
      }
    });

    let s = graph.state('prep', { setIdx: 0, repIdx: 0 });
    s = graph.transition(s, 'advance');
    expect(s).toMatchObject({ state: 'work', durationSec: 7, context: { setIdx: 0, repIdx: 0 }, changed: true });
    s = graph.transition(s, 'advance');
    expect(s).toMatchObject({ state: 'rest', durationSec: 3, context: { setIdx: 0, repIdx: 0 }, changed: true });
    s = graph.transition(s, 'advance');
    expect(s).toMatchObject({ state: 'prep', durationSec: 5, context: { setIdx: 0, repIdx: 1 }, changed: true });
    s = graph.transition(graph.state('done'), 'advance');
    expect(s).toMatchObject({ state: 'done', changed: false });
  });

  it('createPhaseGraph restores paused and timed snapshots with shared remaining logic', () => {
    const graph = R().createPhaseGraph({ initialState: 'prep' });
    expect(graph.restore({
      state: 'paused',
      resumeTo: 'work',
      pausedAtRemainingSec: 4
    }, { pausedState: 'paused', context: { setIdx: 2 } })).toMatchObject({
      state: 'work',
      durationSec: 4,
      context: { setIdx: 2 },
      wasPaused: true
    });
    expect(graph.restore({
      state: 'rest',
      phaseStartedAt: 10_000,
      durationSec: 10
    }, { nowMs: 13_400, minSec: 0.5 })).toMatchObject({
      state: 'rest',
      durationSec: 7,
      wasPaused: false
    });
  });

  it('owner lock acquires, denies fresh foreign owner, steals stale and touches heartbeat', () => {
    let now = 1000;
    const storage = R().createMemoryStorage
      ? R().createMemoryStorage()
      : { _data: {}, getItem(k) { return this._data[k] || null; }, setItem(k, v) { this._data[k] = String(v); }, removeItem(k) { delete this._data[k]; } };
    const a = R().createOwnerLock({ storage, key: 'runner-lock', ownerId: 'a', ttlMs: 100, now: () => now });
    const b = R().createOwnerLock({ storage, key: 'runner-lock', ownerId: 'b', ttlMs: 100, now: () => now });

    expect(a.acquire('start')).toMatchObject({ ok: true });
    expect(b.acquire('start')).toMatchObject({ ok: false, reason: 'held-by-another-owner' });
    now = 1200;
    expect(b.acquire('restart')).toMatchObject({ ok: true });
    now = 1250;
    expect(b.touch()).toBe(true);
    expect(b.read()).toMatchObject({ ownerTabId: 'b', heartbeatAt: 1250 });
    expect(a.release()).toBe(false);
    expect(b.release()).toBe(true);
  });
});
