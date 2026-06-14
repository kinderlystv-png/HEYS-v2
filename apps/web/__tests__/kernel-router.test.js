// kernel-router.test.js — shared strangler router primitives.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeEach, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB = path.resolve(__dirname, '..');

const setup = () => {
  if (!globalThis.window) globalThis.window = globalThis;
  globalThis.window.HEYS = globalThis.HEYS = {};
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(path.join(WEB, '_kernel', 'heys_kernel_router_v1.js'), 'utf8'));
};

const R = () => globalThis.HEYS.TrainingKernel.router;
const session = (id) => ({ id, ok: true, exercises: [{}] });

describe('TrainingKernel.router', () => {
  beforeEach(setup);

  it('routes old when flag off and tracks telemetry', () => {
    const router = R().createStranglerRouter({
      oldEngine: () => session('old'),
      useNew: () => false
    });
    expect(router.recommend({}).id).toBe('old');
    expect(router.lastSource).toBe('old');
    expect(router.getTelemetry()).toMatchObject({ total: 1, fallbackTotal: 0 });
  });

  it('falls back when builder missing, empty, invalid or throwing', () => {
    let mode = 'missing';
    const router = R().createStranglerRouter({
      oldEngine: () => session('old'),
      newEngine: () => {
        if (mode === 'missing') return null;
        if (mode === 'empty') return { recommendDay: () => null };
        if (mode === 'invalid') return { recommendDay: () => ({ bad: true }) };
        return { recommendDay: () => { throw new Error('boom'); } };
      },
      validate: (x) => !!(x && x.ok),
      useNew: () => true
    });

    expect(router.recommend({}).id).toBe('old');
    expect(router.lastSource).toBe('fallback');
    mode = 'empty';
    expect(router.recommend({}).id).toBe('old');
    expect(router.lastSource).toBe('fallback');
    mode = 'invalid';
    expect(router.recommend({}).id).toBe('old');
    expect(router.lastSource).toBe('fallback-contract');
    mode = 'throw';
    expect(router.recommend({}).id).toBe('old');
    expect(router.lastSource).toBe('fallback-error');
    expect(router.getTelemetry()).toMatchObject({ total: 4, fallbackTotal: 4 });
  });

  it('returns new result and records shadow diff without double-counting route total', () => {
    const router = R().createStranglerRouter({
      oldEngine: () => ({ id: 'old', exercises: [{}, {}], durationMin: 20 }),
      newEngine: () => ({ recommendDay: () => ({ id: 'new', ok: true, exercises: [{}], durationMin: 18 }) }),
      validate: (x) => !!(x && x.ok),
      useNew: () => true,
      useShadow: () => true,
      shadowDiff: (newS, oldS) => ({ durationMin: { deltaMin: newS.durationMin - oldS.durationMin }, exerciseCount: { new: newS.exercises.length, old: oldS.exercises.length } })
    });
    expect(router.recommend({}).id).toBe('new');
    expect(router.lastSource).toBe('new');
    expect(router.lastShadowDiff).toMatchObject({ durationMin: { deltaMin: -2 } });
    expect(router.getTelemetry()).toMatchObject({ total: 1, shadowCompareTotal: 1, shadowCompareErrors: 0 });
  });

  it('evaluateRolloutGate fails closed on missing samples and passes clean telemetry', () => {
    const missing = R().evaluateRolloutGate({ telemetry: R().emptyTelemetry(), lastShadowDiff: null });
    expect(missing.ok).toBe(false);
    expect(missing.reasons).toContain('no-shadow-data');

    const telemetry = {
      total: 50,
      bySource: { old: 0, new: 50 },
      fallbackTotal: 0,
      shadowCompareTotal: 8,
      shadowCompareErrors: 0
    };
    const clean = R().evaluateRolloutGate({
      telemetry,
      lastShadowDiff: {
        durationMin: { deltaMin: 2 },
        exerciseCount: { new: 3, old: 3 },
        dangerBudget: { new: { overBy: 0 } },
        nonRenderableCount: { uiRendererRisk: false }
      }
    });
    expect(clean.ok).toBe(true);
  });
});
