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

  it('результат router(off) структурно == прямой mixEngine для max-сессии', () => {
    const opts = { equipmentTypes: ['full'], intensity: 'all', age: 25, readiness: 'max' };
    const direct = F().mixEngine.recommendDay(opts);
    const viaRouter = R().recommendDay(opts);
    // Нит ревью: попытка усилить до toEqual упёрлась в неидемпотентность
    // mixEngine (random/перетасовка внутри). Bit-identity при flag=off
    // доказывается КОНСТРУКЦИЕЙ (router L49: `return mixEngine.recommendDay(opts)`
    // — тот же ref-объект из одного вызова). Здесь — структурный поднабор:
    // intensity, последовательность ролей, длина.
    expect(viaRouter.intensity).toBe(direct.intensity);
    expect(viaRouter.exercises.map((e) => e.__role)).toEqual(direct.exercises.map((e) => e.__role));
    expect(viaRouter.exercises.length).toBe(direct.exercises.length);
  });

  it('reference passthrough при flag=off: stub mixEngine → router возвращает тот самый объект (===)', () => {
    const stubResult = { intensity: 'max', exercises: [{ __role: 'x' }], __stub: true };
    const origRecommend = F().mixEngine.recommendDay;
    F().mixEngine.recommendDay = () => stubResult;
    try {
      const viaRouter = R().recommendDay({});
      expect(viaRouter).toBe(stubResult); // reference equality — passthrough доказан
    } finally {
      F().mixEngine.recommendDay = origRecommend;
    }
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
      recommendDay: (opts) => ({
        intensity: 'max', exercises: [{ __role: 'stub', name: 'stub' }],
        // Усиленный контракт (4.3 #2): полный набор UI-полей.
        name: 'Stub session', durationMin: 30, requiresWarmup: true,
        __from: 'new'
      })
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

describe('engineRouter: contract-guard (Риск 2 ревью)', () => {
  beforeAll(setupOnce);
  beforeEach(() => { F().flags.newEngine = true; });

  // Усилен контракт-guard (ревью 4.3 #2): UI-релевантные поля.
  const validSession = () => ({
    intensity: 'max', exercises: [{ __role: 'power' }],
    name: 'X', durationMin: 30, requiresWarmup: true
  });

  it('isValidSession: валидная форма (полный контракт)', () => {
    expect(R().isValidSession(validSession())).toBe(true);
  });

  it('isValidSession: пустой exercises → false', () => {
    expect(R().isValidSession(Object.assign(validSession(), { exercises: [] }))).toBe(false);
  });

  it('isValidSession: нет intensity → false', () => {
    const s = validSession(); delete s.intensity;
    expect(R().isValidSession(s)).toBe(false);
  });

  it('isValidSession: intensity не строка → false', () => {
    expect(R().isValidSession(Object.assign(validSession(), { intensity: 42 }))).toBe(false);
  });

  it('ревью 4.3 #2: exercises без __role → false', () => {
    expect(R().isValidSession(Object.assign(validSession(), {
      exercises: [{ name: 'nope' }]
    }))).toBe(false);
  });

  it('ревью 4.3 #2: нет name → false (UI L1027 читает)', () => {
    const s = validSession(); delete s.name;
    expect(R().isValidSession(s)).toBe(false);
  });

  it('ревью 4.3 #2: нет durationMin → false (UI L1035 читает)', () => {
    const s = validSession(); delete s.durationMin;
    expect(R().isValidSession(s)).toBe(false);
  });

  it('ревью 4.3 #2: requiresWarmup undefined → true (backward-compat)', () => {
    const s = validSession(); delete s.requiresWarmup;
    expect(R().isValidSession(s)).toBe(true);
  });

  it('ревью 4.3 #2: requiresWarmup не boolean → false', () => {
    expect(R().isValidSession(Object.assign(validSession(), { requiresWarmup: 'yes' }))).toBe(false);
  });

  it('builder вернул объект без exercises → fallback-contract, прод не видит кривое', () => {
    F().sessionBuilder = { recommendDay: () => ({ intensity: 'max' /* нет exercises */ }) };
    const opts = { equipmentTypes: ['full'], intensity: 'all', age: 25, readiness: 'max' };
    const viaRouter = R().recommendDay(opts);
    expect(R().lastSource).toBe('fallback-contract');
    // fallback вернул сессию от mixEngine
    expect(viaRouter.exercises.length).toBeGreaterThan(0);
  });

  it('builder вернул пустой exercises → fallback-contract', () => {
    F().sessionBuilder = { recommendDay: () => ({ intensity: 'max', exercises: [] }) };
    const opts = { equipmentTypes: ['full'], intensity: 'all', age: 25, readiness: 'max' };
    R().recommendDay(opts);
    expect(R().lastSource).toBe('fallback-contract');
  });

  it('builder вернул строку (не объект) → fallback-contract', () => {
    F().sessionBuilder = { recommendDay: () => 'oops' };
    const opts = { equipmentTypes: ['full'], intensity: 'all', age: 25, readiness: 'max' };
    R().recommendDay(opts);
    expect(R().lastSource).toBe('fallback-contract');
  });
});

describe('engineRouter: plumbing Гейта #1 (ревью #8) — enrichment opts', () => {
  beforeAll(setupOnce);
  beforeEach(() => {
    F().flags.newEngine = false;
    F().flags.shadowCompare = false;
    // Reset stub stores
    delete F().records;
    delete F().getBodyWeight;
    delete F().bodyMetrics;
    delete F().getProfile;
  });

  it('нет records/bw → opts as-is (без mvcPctBW)', () => {
    const enriched = R()._enrichOpts({ equipmentTypes: ['full'], age: 25, readiness: 'max' });
    expect(enriched.mvcPctBW).toBeUndefined();
    expect(enriched.level).toBeUndefined();
  });

  it('records.getMVC + getBodyWeight → mvcPctBW = (addedKg/bw)×100', () => {
    F().records = { getMVC: (g, e) => (g === 'halfcrimp' && e === 20) ? { addedKg: 30, mvcKg: 105 } : null };
    F().getBodyWeight = () => ({ kg: 75, source: 'profile' });
    const enriched = R()._enrichOpts({ equipmentTypes: ['full'], age: 25, readiness: 'max' });
    expect(enriched.mvcPctBW).toBeCloseTo((30 / 75) * 100, 3); // 40 → derive 'beginner'
  });

  it('bodyMetrics namespace тоже работает (legacy alias)', () => {
    F().records = { getMVC: () => ({ addedKg: 50 }) };
    F().bodyMetrics = { getBodyWeight: () => ({ kg: 70 }) };
    const enriched = R()._enrichOpts({ age: 25 });
    expect(enriched.mvcPctBW).toBeCloseTo((50 / 70) * 100, 3); // ~71 → derive 'intermediate'
  });

  it('addedKg отсутствует (только time-record) → mvcPctBW не задаётся', () => {
    F().records = { getMVC: () => ({ holdTime: 13, addedKg: null }) }; // time-only record
    F().getBodyWeight = () => ({ kg: 75 });
    const enriched = R()._enrichOpts({ age: 25 });
    expect(enriched.mvcPctBW).toBeUndefined();
  });

  it('bw=0 → защита от деления на 0 → mvcPctBW не задаётся', () => {
    F().records = { getMVC: () => ({ addedKg: 30 }) };
    F().getBodyWeight = () => ({ kg: 0 });
    const enriched = R()._enrichOpts({ age: 25 });
    expect(enriched.mvcPctBW).toBeUndefined();
  });

  it('explicit opts.mvcPctBW > enrichment (не перезаписывается)', () => {
    F().records = { getMVC: () => ({ addedKg: 30 }) };
    F().getBodyWeight = () => ({ kg: 75 });
    const enriched = R()._enrichOpts({ age: 25, mvcPctBW: 90 }); // explicit
    expect(enriched.mvcPctBW).toBe(90);
  });

  it('explicit profile.level → MVC enrichment пропускается', () => {
    F().records = { getMVC: () => ({ addedKg: 30 }) };
    F().getBodyWeight = () => ({ kg: 75 });
    const enriched = R()._enrichOpts({ age: 25, profile: { age: 25, level: 'advanced' } });
    expect(enriched.mvcPctBW).toBeUndefined(); // не дёргаем records
    expect(enriched.profile.level).toBe('advanced');
  });

  it('getProfile().level → opts.level (если не задан)', () => {
    F().getProfile = () => ({ level: 'intermediate', age: 30 });
    const enriched = R()._enrichOpts({ age: 30 });
    expect(enriched.level).toBe('intermediate');
  });

  it('getProfile.level НЕ перезаписывает explicit opts.level', () => {
    F().getProfile = () => ({ level: 'advanced' });
    const enriched = R()._enrichOpts({ age: 30, level: 'beginner' });
    expect(enriched.level).toBe('beginner');
  });

  it('enrichment безопасна: исключения в источниках не валят', () => {
    F().records = { getMVC: () => { throw new Error('LS corrupted'); } };
    F().getBodyWeight = () => { throw new Error('profile null'); };
    F().getProfile = () => { throw new Error('boom'); };
    expect(() => R()._enrichOpts({ age: 25 })).not.toThrow();
    const enriched = R()._enrichOpts({ age: 25 });
    expect(enriched.mvcPctBW).toBeUndefined();
    expect(enriched.level).toBeUndefined();
  });

  it('mixEngine получает enriched opts (поля игнорируются — нет регресса)', () => {
    F().records = { getMVC: () => ({ addedKg: 30 }) };
    F().getBodyWeight = () => ({ kg: 75 });
    // flag=off, builder не вызывается; mixEngine получает enriched, но
    // не читает mvcPctBW → результат как раньше.
    const opts = { equipmentTypes: ['full'], age: 25, readiness: 'max' };
    const direct = F().mixEngine.recommendDay(opts);
    const viaRouter = R().recommendDay(opts);
    expect(viaRouter.intensity).toBe(direct.intensity);
    expect(viaRouter.exercises.length).toBe(direct.exercises.length);
  });
});

describe('engineRouter: shadow-compare (ревью 4.3 #4.3e — наблюдаемость)', () => {
  beforeAll(setupOnce);
  beforeEach(() => {
    F().flags.newEngine = true;
    F().flags.shadowCompare = false;
  });

  it('default shadowCompare=false (флаг существует, не активен)', () => {
    expect(F().flags.shadowCompare).toBe(false);
  });

  it('shadowCompare=on + builder вернул new → lastShadowDiff заполнен полями diff', () => {
    F().flags.shadowCompare = true;
    F().sessionBuilder = {
      recommendDay: () => ({
        intensity: 'recovery', exercises: [{ __role: 'antagonist' }],
        name: 'Builder', durationMin: 15, requiresWarmup: false
      })
    };
    R().recommendDay({ equipmentTypes: ['full'], age: 25, readiness: 'max' });
    const diff = R().lastShadowDiff;
    expect(diff).not.toBeNull();
    expect(diff.intensity.new).toBe('recovery');
    expect(typeof diff.intensity.old).toBe('string');
    expect(diff.intensity.same).toBe(diff.intensity.new === diff.intensity.old);
    expect(diff.exerciseCount.new).toBe(1);
    expect(typeof diff.exerciseCount.old).toBe('number');
    expect(Array.isArray(diff.roles.new)).toBe(true);
    expect(Array.isArray(diff.roles.old)).toBe(true);
  });

  it('ревью #3 ограничение 2: shadow-diff содержит doseShape/modality distribution + nonHangCount', () => {
    F().flags.shadowCompare = true;
    F().sessionBuilder = {
      recommendDay: () => ({
        intensity: 'max',
        exercises: [
          { __role: 'power', doseShape: 'attempts', modality: 'campus' },
          { __role: 'max-strength', doseShape: 'hang', modality: 'fingerboard' },
          { __role: 'antagonist', doseShape: 'reps', modality: 'antagonist' }
        ],
        name: 'Mixed shapes', durationMin: 40, requiresWarmup: true
      })
    };
    R().recommendDay({ equipmentTypes: ['full'], age: 25, readiness: 'max' });
    const diff = R().lastShadowDiff;
    expect(diff.doseShape.new).toEqual({ attempts: 1, hang: 1, reps: 1 });
    expect(diff.modality.new).toEqual({ campus: 1, fingerboard: 1, antagonist: 1 });
    // 2 атома non-hang → uiRendererRisk должен быть true.
    expect(diff.nonHangCount.new).toBe(2);
    expect(diff.nonHangCount.uiRendererRisk).toBe(true);
  });

  it('shadowCompare ошибка mixEngine не валит builder-выход', () => {
    F().flags.shadowCompare = true;
    F().sessionBuilder = {
      recommendDay: () => ({
        intensity: 'max', exercises: [{ __role: 'power' }],
        name: 'X', durationMin: 30, requiresWarmup: true
      })
    };
    const orig = F().mixEngine.recommendDay;
    F().mixEngine.recommendDay = () => { throw new Error('shadow boom'); };
    try {
      const r = R().recommendDay({ equipmentTypes: ['full'], age: 25, readiness: 'max' });
      expect(r).not.toBeNull();
      expect(r.name).toBe('X');
    } finally {
      F().mixEngine.recommendDay = orig;
    }
  });
});
