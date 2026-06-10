// fingers-today-recommend.test.js — regression для B0 Today Coach.
//
// Цель: _recommendForBucket НИКОГДА не должна рекомендовать программу выше
// safety-потолка дня (data.bucket = readiness ∩ cooldown). Без клампа экран
// советовал бы max-протокол в recovery-день (бейдж «восстановление» + кнопка
// «Начать Hörst Max Hangs») — противоречие и подрыв safety-слоя.
//
// Модуль session_ui — IIFE, рано выходит без global.React, а функции приватные.
// Поэтому: React-shim (рендер не нужен) + eval зависимостей + экспортируемая
// Fingers._recommendForBucket.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FINGERS_DIR = path.resolve(__dirname, '..', 'fingers');

const createStorageMock = () => {
  const store = {};
  return {
    get length() { return Object.keys(store).length; },
    key: (i) => Object.keys(store)[i] ?? null,
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
  };
};

// Минимальный React-shim: createElement возвращает плоский маркер, хуки —
// passthrough (мы не рендерим, только дёргаем чистую _recommendForBucket).
const reactShim = () => ({
  createElement: (...args) => ({ __el: true, args }),
  useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
  useMemo: (fn) => fn(),
  useEffect: () => {},
  useCallback: (fn) => fn,
  Fragment: 'Fragment',
});

const evalSource = (relPath) => {
  const src = fs.readFileSync(path.join(FINGERS_DIR, relPath), 'utf8');
  // eslint-disable-next-line no-eval
  eval(src);
};

const INTENSITY_RANK = { recovery: 1, moderate: 2, max: 3 };
const iRank = (p) => INTENSITY_RANK[(p && p.intensity) || 'moderate'] || 2;

// Eval один раз: session_ui — тяжёлый IIFE с idempotent-гардом
// (SessionUI__registered), повторный eval в beforeEach его пропускает и
// функция «исчезает». Регистрируем модули один раз, профиль — в beforeEach.
const setupOnce = () => {
  if (!globalThis.window) globalThis.window = globalThis;
  globalThis.window.HEYS = globalThis.HEYS = {};
  globalThis.localStorage = createStorageMock();
  globalThis.window.localStorage = globalThis.localStorage;
  globalThis.React = globalThis.window.React = reactShim();
  globalThis.window.HEYS.utils = {
    lsGet: (key, dflt) => {
      try {
        const raw = globalThis.localStorage.getItem(key);
        return raw ? JSON.parse(raw) : dflt;
      } catch (_) { return dflt; }
    },
    lsSet: (key, val) => { globalThis.localStorage.setItem(key, JSON.stringify(val)); },
  };
  // Зависимости в порядке: каталог + age-gate (без React), затем session_ui.
  evalSource('heys_fingers_programs_catalog_v1.js');
  evalSource('heys_fingers_age_gating_v1.js');
  evalSource('heys_fingers_session_ui_v1.js');
};

const setProfile = () => {
  // Профиль: взрослый V7-V8, оборудование full+none — eligible одновременно
  // max-программы (board) и recovery (no-equipment). Так naive-рекомендация
  // была бы max, и кламп есть что понижать.
  globalThis.window.HEYS.utils.lsSet('heys_profile', {
    age: 25,
    fingerboardProfile: { age: 25, maxVGrade: 'V7-V8', equipmentTypes: ['full', 'none'] },
  });
};

describe('B0 _recommendForBucket — safety clamp', () => {
  beforeAll(setupOnce);
  beforeEach(setProfile);

  it('экспортирована из модуля', () => {
    expect(typeof globalThis.HEYS.Fingers._recommendForBucket).toBe('function');
  });

  it('предусловие: штатный рекомендатор для V7-V8 даёт max-программу (иначе тест пустой)', () => {
    const F = globalThis.HEYS.Fingers;
    const recId = F.getRecommendedProgramId();
    const prog = F.PROGRAMS.find((p) => p.id === recId);
    expect(prog).toBeTruthy();
    expect(prog.intensity).toBe('max');
  });

  it('max-день — возвращает max-программу', () => {
    const prog = globalThis.HEYS.Fingers._recommendForBucket('max');
    expect(prog).toBeTruthy();
    expect(iRank(prog)).toBe(3);
  });

  it('recovery-день — НЕ возвращает max (кламп вниз до recovery)', () => {
    const prog = globalThis.HEYS.Fingers._recommendForBucket('recovery');
    expect(prog).toBeTruthy();          // recovery-программа eligible → понижает, не null
    expect(prog.intensity).not.toBe('max');
    expect(iRank(prog)).toBeLessThanOrEqual(1);
  });

  it('moderate-день — не выше moderate', () => {
    const prog = globalThis.HEYS.Fingers._recommendForBucket('moderate');
    expect(prog).toBeTruthy();
    expect(iRank(prog)).toBeLessThanOrEqual(2);
  });

  it('rest / unknown — нет рекомендации', () => {
    expect(globalThis.HEYS.Fingers._recommendForBucket('rest')).toBeNull();
    expect(globalThis.HEYS.Fingers._recommendForBucket('unknown')).toBeNull();
  });

  it('инвариант: для любого бакета результат ≤ потолка', () => {
    const ceil = { recovery: 1, moderate: 2, max: 3 };
    Object.keys(ceil).forEach((b) => {
      const prog = globalThis.HEYS.Fingers._recommendForBucket(b);
      if (prog) expect(iRank(prog)).toBeLessThanOrEqual(ceil[b]);
    });
  });
});

// B16: цель тренировки влияет на getRecommendedProgramId. Профиль V7-V8 без
// цели даёт horst_max_hangs (strength); смена цели должна перебивать grade.
const setGoal = (goal) => {
  globalThis.window.HEYS.utils.lsSet('heys_profile', {
    age: 25,
    fingerboardProfile: { age: 25, maxVGrade: 'V7-V8', equipmentTypes: ['full', 'none'], goal },
  });
};

describe('B16 goal → getRecommendedProgramId', () => {
  beforeAll(setupOnce);

  it('strength / null → grade-based (V7-V8 = horst_max_hangs)', () => {
    setGoal('strength');
    expect(globalThis.HEYS.Fingers.getRecommendedProgramId()).toBe('horst_max_hangs');
    setGoal(null);
    expect(globalThis.HEYS.Fingers.getRecommendedProgramId()).toBe('horst_max_hangs');
  });

  it('recovery → nelson_no_hangs (перебивает grade)', () => {
    setGoal('recovery');
    expect(globalThis.HEYS.Fingers.getRecommendedProgramId()).toBe('nelson_no_hangs');
  });

  it('endurance → repeaters_7_3', () => {
    setGoal('endurance');
    expect(globalThis.HEYS.Fingers.getRecommendedProgramId()).toBe('repeaters_7_3');
  });

  it('maintenance → repeaters_7_3', () => {
    setGoal('maintenance');
    expect(globalThis.HEYS.Fingers.getRecommendedProgramId()).toBe('repeaters_7_3');
  });
});

describe('generated mix routing', () => {
  beforeAll(setupOnce);
  beforeEach(() => {
    delete globalThis.HEYS.Fingers.engineRouter;
    delete globalThis.HEYS.Fingers.mixEngine;
    delete globalThis.HEYS.Fingers.generateMixedWorkout;
  });

  it('uses engineRouter when available, so newEngine/telemetry are on the mix path', () => {
    const F = globalThis.HEYS.Fingers;
    const routerResult = { name: 'router-result', exercises: [] };
    const oldResult = { name: 'old-result', exercises: [] };
    F.engineRouter = { recommendDay: vi.fn(() => routerResult) };
    F.mixEngine = { recommendDay: vi.fn(() => oldResult) };

    expect(F._recommendMixedWorkout({ readiness: 'max' })).toBe(routerResult);
    expect(F.engineRouter.recommendDay).toHaveBeenCalledWith({ readiness: 'max' });
    expect(F.mixEngine.recommendDay).not.toHaveBeenCalled();
  });

  it('falls back to mixEngine, then legacy generateMixedWorkout', () => {
    const F = globalThis.HEYS.Fingers;
    const oldResult = { name: 'old-result', exercises: [] };
    const legacyResult = { name: 'legacy-result', exercises: [] };

    F.mixEngine = { recommendDay: vi.fn(() => oldResult) };
    F.generateMixedWorkout = vi.fn(() => legacyResult);
    expect(F._recommendMixedWorkout({ readiness: 'max' })).toBe(oldResult);
    expect(F.generateMixedWorkout).not.toHaveBeenCalled();

    delete F.mixEngine;
    expect(F._recommendMixedWorkout({ readiness: 'recovery' })).toBe(legacyResult);
    expect(F.generateMixedWorkout).toHaveBeenCalledWith({ readiness: 'recovery' });
  });
});

// B1: _mergeSetFeedback — additive merge per-set RPE/боли в fingersLog.exercises.
describe('B1 _mergeSetFeedback', () => {
  beforeAll(setupOnce);

  const EX = [
    { gripId: 'halfcrimp', setsCount: 3, addedWeightKg: 10 },
    { gripId: 'openhand', setsCount: 2, addedWeightKg: 5 },
  ];

  it('экспортирована', () => {
    expect(typeof globalThis.HEYS.Fingers._mergeSetFeedback).toBe('function');
  });

  it('пустой feedback → тот же массив (additive-инвариант, контракт прежний)', () => {
    const M = globalThis.HEYS.Fingers._mergeSetFeedback;
    expect(M(EX, {})).toBe(EX);
    expect(M(EX, null)).toBe(EX);
    expect(M(EX, undefined)).toBe(EX);
  });

  it('feedback вмерживается в setFeedback нужного упражнения, без мутации входа', () => {
    const M = globalThis.HEYS.Fingers._mergeSetFeedback;
    const out = M(EX, { 0: [{ rpe: 'hard', pain: true }, { rpe: 'ok', pain: false }] });
    expect(out).not.toBe(EX);                 // новый массив
    expect(EX[0].setFeedback).toBeUndefined(); // вход не мутирован
    expect(out[0].setFeedback).toEqual([
      { rpe: 'hard', pain: true },
      { rpe: 'ok', pain: false },
    ]);
    expect(out[1].setFeedback).toBeUndefined(); // упр без feedback не тронуто
    expect(out[1]).toBe(EX[1]);
  });

  it('нормализует пропуски/мусор в {rpe:null, pain:false}', () => {
    const M = globalThis.HEYS.Fingers._mergeSetFeedback;
    const out = M(EX, { 0: [{ pain: 1 }, null, { rpe: 'easy' }] });
    expect(out[0].setFeedback[0]).toEqual({ rpe: null, pain: true });
    expect(out[0].setFeedback[2]).toEqual({ rpe: 'easy', pain: false });
  });
});
