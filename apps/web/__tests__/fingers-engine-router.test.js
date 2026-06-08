// fingers-engine-router.test.js — Phase 1 / step 4 part 1: strangler scaffold.
// Главный safety-инвариант: при flag=off результат идентичен прямому mix_engine.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FINGERS_DIR = path.resolve(__dirname, '..', 'fingers');

const setupOnce = () => {
  if (!globalThis.window) globalThis.window = globalThis;
  globalThis.window.HEYS = globalThis.HEYS = {};
  globalThis.React = globalThis.window.React = {
    createElement: (...a) => ({ __el: true, a }), Fragment: 'F',
    useState: (i) => [typeof i === 'function' ? i() : i, () => {}],
    useMemo: (fn) => fn(), useEffect: () => {}, useCallback: (fn) => fn, useRef: (i) => ({ current: i }),
  };
  const ev = (f) => { /* eslint-disable-next-line no-eval */ eval(fs.readFileSync(path.join(FINGERS_DIR, f), 'utf8')); };
  ev('heys_fingers_grips_catalog_v1.js');
  ev('heys_fingers_programs_catalog_v1.js');
  ev('heys_fingers_age_gating_v1.js');
  ev('heys_fingers_mix_engine_v1.js');
  ev('heys_fingers_engine_router_v1.js');
};

const F = () => globalThis.HEYS.Fingers;
const R = () => globalThis.HEYS.Fingers.engineRouter;

describe('engineRouter: флаг и default', () => {
  beforeAll(setupOnce);

  it('default флаг newEngine = false', () => {
    expect(F().flags.newEngine).toBe(false);
  });

  it('engineRouter.recommendDay существует', () => {
    expect(typeof R().recommendDay).toBe('function');
  });
});

describe('engineRouter: flag=off — прозрачное делегирование на mixEngine', () => {
  beforeAll(setupOnce);
  beforeEach(() => { F().flags.newEngine = false; });

  it('lastSource = "old" после вызова', () => {
    R().recommendDay({ equipmentTypes: ['full'], intensity: 'all', age: 25, readiness: 'max' });
    expect(R().lastSource).toBe('old');
  });

  it('результат router(off) бит-в-бит == прямой mixEngine для max-сессии', () => {
    const opts = { equipmentTypes: ['full'], intensity: 'all', age: 25, readiness: 'max' };
    const direct = F().mixEngine.recommendDay(opts);
    const viaRouter = R().recommendDay(opts);
    // Структурное равенство: одинаковая интенсивность, роли, число упражнений.
    expect(viaRouter.intensity).toBe(direct.intensity);
    expect(viaRouter.exercises.map((e) => e.__role)).toEqual(direct.exercises.map((e) => e.__role));
    expect(viaRouter.exercises.length).toBe(direct.exercises.length);
  });

  it('результат router(off) == прямой mixEngine для recovery-сессии', () => {
    const opts = { equipmentTypes: ['full'], intensity: 'all', age: 25, readiness: 'recovery' };
    const direct = F().mixEngine.recommendDay(opts);
    const viaRouter = R().recommendDay(opts);
    expect(viaRouter.exercises.map((e) => e.__role)).toEqual(direct.exercises.map((e) => e.__role));
  });

  it('age fail-closed: router(off) с невалидным возрастом → null как mix_engine', () => {
    const direct = F().mixEngine.recommendDay({ equipmentTypes: ['full'], intensity: 'all', age: NaN, readiness: 'max' });
    const viaRouter = R().recommendDay({ equipmentTypes: ['full'], intensity: 'all', age: NaN, readiness: 'max' });
    expect(direct).toBeNull();
    expect(viaRouter).toBeNull();
  });
});

describe('engineRouter: flag=on без sessionBuilder → fallback', () => {
  beforeAll(setupOnce);
  beforeEach(() => {
    F().flags.newEngine = true;
    // Гарантия что sessionBuilder отсутствует — Phase 4.2 ещё не реализован.
    delete F().sessionBuilder;
  });

  it('flag=on без sessionBuilder → lastSource = "fallback", результат как у mixEngine', () => {
    const opts = { equipmentTypes: ['full'], intensity: 'all', age: 25, readiness: 'max' };
    const direct = F().mixEngine.recommendDay(opts);
    const viaRouter = R().recommendDay(opts);
    expect(R().lastSource).toBe('fallback');
    expect(viaRouter.exercises.length).toBe(direct.exercises.length);
  });
});

describe('engineRouter: flag=on, sessionBuilder вернул null → fallback', () => {
  beforeAll(setupOnce);
  beforeEach(() => {
    F().flags.newEngine = true;
    F().sessionBuilder = { recommendDay: () => null };
  });

  it('null → fallback на mixEngine', () => {
    const opts = { equipmentTypes: ['full'], intensity: 'all', age: 25, readiness: 'max' };
    const viaRouter = R().recommendDay(opts);
    const direct = F().mixEngine.recommendDay(opts);
    expect(R().lastSource).toBe('fallback');
    expect(viaRouter.exercises.length).toBe(direct.exercises.length);
  });
});

describe('engineRouter: flag=on, sessionBuilder бросает → fallback-error', () => {
  beforeAll(setupOnce);
  beforeEach(() => {
    F().flags.newEngine = true;
    F().sessionBuilder = { recommendDay: () => { throw new Error('boom'); } };
  });

  it('exception → lastSource = fallback-error, fallback на mixEngine, не падает', () => {
    const opts = { equipmentTypes: ['full'], intensity: 'all', age: 25, readiness: 'max' };
    const viaRouter = R().recommendDay(opts);
    expect(R().lastSource).toBe('fallback-error');
    expect(viaRouter).not.toBeNull();
    expect(viaRouter.exercises.length).toBeGreaterThan(0);
  });
});

describe('engineRouter: flag=on, sessionBuilder вернул валидную сессию → используется', () => {
  beforeAll(setupOnce);
  beforeEach(() => {
    F().flags.newEngine = true;
    F().sessionBuilder = {
      recommendDay: (opts) => ({ intensity: 'max', exercises: [{ __role: 'stub', name: 'stub' }], __from: 'new' })
    };
  });

  it('новая сессия используется напрямую', () => {
    const opts = { equipmentTypes: ['full'], intensity: 'all', age: 25, readiness: 'max' };
    const viaRouter = R().recommendDay(opts);
    expect(R().lastSource).toBe('new');
    expect(viaRouter.__from).toBe('new');
    expect(viaRouter.exercises[0].__role).toBe('stub');
  });
});
