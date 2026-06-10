// fingers-happy-path.test.js — B19 happy-path integration (data-flow level).
//
// Сшивает реальные экспортированные функции fingers в сквозной сценарий
// «профиль (онбординг) → рекомендация → Today → контракт дневника», проверяя
// что каждое звено передаёт ожидаемое дальше. Детерминированный (без живого
// таймера) — гоняется в vitest-гейте.
//
// ВНЕ scope этого файла (нужен запущенный app + mock-время): UI-взаимодействие
// мастера онбординга и pause/resume живого таймера — это Playwright-задача
// (TESTS/e2e/), не vitest. Здесь — контрактный happy-path данных.
//
// Harness как в fingers-today-recommend: React-shim + eval source + профиль.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

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

const reactShim = () => ({
  createElement: (...args) => ({ __el: true, args }),
  useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
  useMemo: (fn) => fn(),
  useEffect: () => {},
  useCallback: (fn) => fn,
  useRef: (init) => ({ current: init }),
  Fragment: 'Fragment',
});

const evalSource = (relPath) => {
  const src = fs.readFileSync(path.join(FINGERS_DIR, relPath), 'utf8');
  // eslint-disable-next-line no-eval
  eval(src);
};

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
  evalSource('heys_fingers_programs_catalog_v1.js');
  evalSource('heys_fingers_age_gating_v1.js');
  evalSource('heys_fingers_timer_v1.js');
  evalSource('heys_fingers_session_ui_v1.js');
};

const setProfile = (goal) => {
  globalThis.window.HEYS.utils.lsSet('heys_profile', {
    age: 25,
    fingerboardProfile: { age: 25, maxVGrade: 'V7-V8', equipmentTypes: ['full', 'none'], goal: goal || null },
  });
};

// Один сценарный сет упражнения (как из протокола): 7s×6×3, rest 3/180, +10кг.
const EX = [{
  gripId: 'halfcrimp', hangSec: 7, restSec: 3, repsPerSet: 6,
  setsCount: 3, restBetweenSetsSec: 180, addedWeightKg: 10,
}];

describe('B19 happy-path: профиль → рекомендация → Today → дневник', () => {
  beforeAll(setupOnce);
  beforeEach(() => setProfile('strength'));
  afterEach(() => {
    vi.useRealTimers();
    delete globalThis.window.HEYS.__fingersDiaryVersion;
  });

  it('strength-профиль: онбординг-рекомендация = max-протокол', () => {
    const F = globalThis.HEYS.Fingers;
    expect(F.getRecommendedProgramId()).toBe('horst_max_hangs');
  });

  it('Today собирает startable-рекомендацию и клампит к safety-потолку дня', () => {
    const F = globalThis.HEYS.Fingers;
    // Без readiness/cooldown-модулей в харнессе assess/cooldownCheck отсутствуют
    // → _buildTodayData деградирует к bucket=max (оба ранга по умолчанию 3).
    const data = F._buildTodayData('2026-06-05');
    expect(data.profileIncomplete).toBe(false);
    expect(data.bucket).toBe('max');
    expect(data.recommendedProgram).toBeTruthy();
    expect(data.recommendedProgram.id).toBe('horst_max_hangs'); // max в пределах потолка
  });

  it('recovery-цель протягивается до Today-рекомендации', () => {
    setProfile('recovery');
    const F = globalThis.HEYS.Fingers;
    expect(F.getRecommendedProgramId()).toBe('nelson_no_hangs');
    const data = F._buildTodayData('2026-06-05');
    expect(data.recommendedProgram.id).toBe('nelson_no_hangs'); // recovery ≤ max-потолок
  });

  it('finish → дневник: fingersLog содержит per-set RPE/боль + hadPain', () => {
    const F = globalThis.HEYS.Fingers;
    const feedback = { 0: [
      { rpe: 'ok', pain: false },
      { rpe: 'hard', pain: true },
      { rpe: 'hard', pain: false },
    ] };
    const log = F._buildFingersLog(EX, {
      programId: 'horst_max_hangs', feedback, viaTimer: true, nowIso: '2026-06-05T10:00:00.000Z',
    });
    expect(log.version).toBe(1);
    expect(log.programId).toBe('horst_max_hangs');
    expect(log.viaTimer).toBe(true);
    expect(log.completedAt).toBe('2026-06-05T10:00:00.000Z');
    expect(log.endedAt).toBe('2026-06-05T10:00:00.000Z');
    expect(log.startedAt).toBe('2026-06-05T09:48:00.000Z');
    expect(log.totalDurationMinutes).toBe(12); // ((7+3)*6+180)*3/60
    expect(log.exercises[0].setFeedback).toHaveLength(3);
    expect(log.exercises[0].setFeedback[1]).toEqual({ rpe: 'hard', pain: true });
    expect(log.hadPain).toBe(true);
  });

  it('finish без feedback: контракт дневника байт-в-байт прежний (additive)', () => {
    const F = globalThis.HEYS.Fingers;
    const log = F._buildFingersLog(EX, { programId: 'horst_max_hangs', viaTimer: true });
    expect(log.exercises).toBe(EX);              // тот же массив — нет setFeedback
    expect(log.exercises[0].setFeedback).toBeUndefined();
    expect('hadPain' in log).toBe(false);        // флаг боли не выставлен
    expect(log.totalDurationMinutes).toBe(12);
  });

  it('finish для non-hang doseShape считает длительность и объём не как hang', () => {
    const F = globalThis.HEYS.Fingers;
    const circuit = [{
      doseShape: 'circuit',
      dose: { problemsPerRound: 4, rounds: 4, restRoundsSec: 180 },
      gripId: 'pe_boulder_4x4',
    }];
    const log = F._buildFingersLog(circuit, {
      programId: 'session_builder_test',
      viaTimer: true,
      nowIso: '2026-06-05T10:00:00.000Z',
    });
    expect(log.totalDurationMinutes).toBe(16); // 4*4*25s work + 3*180s rest
    expect(log.totalWorkSeconds).toBe(400);
    expect(log.totalUnits).toBe(4);
    expect(log.unitLabel).toBe('раунда');
    expect(log.shapeCounts).toEqual({ circuit: 1 });
  });

  it('partial abort сохраняет только выполненную часть текущего doseShape', () => {
    const F = globalThis.HEYS.Fingers;
    const S = F.STATES;
    const attempts = [{
      doseShape: 'attempts',
      dose: { movesPerAttempt: [1, 3], attempts: [6, 8], restSetsSec: 240 },
      gripId: 'pow_limit_boulder',
    }];
    const partialExercises = F._buildPartialExercises(attempts, 0, {
      state: S.BIG_REST,
      setIdx: 2,
      repIdx: 0,
    });
    expect(partialExercises).toHaveLength(1);
    expect(partialExercises[0].completion.completedUnits).toBe(3);
    expect(partialExercises[0].completion.plannedUnits).toBe(7);

    const full = F._buildFingersLog(attempts, { programId: 'attempts', nowIso: '2026-06-05T10:00:00.000Z' });
    const partial = F._buildFingersLog(partialExercises, { programId: 'attempts', nowIso: '2026-06-05T10:00:00.000Z' });
    expect(partial.totalUnits).toBe(3);
    expect(partial.totalDurationMinutes).toBeLessThan(full.totalDurationMinutes);
    expect(partial.exercises[0].partial).toBe(true);
  });

  it('local date fallback uses local calendar date, not UTC ISO day', () => {
    const F = globalThis.HEYS.Fingers;
    vi.useFakeTimers();
    const localTime = new Date(2026, 0, 2, 0, 30);
    vi.setSystemTime(localTime);
    const expected = localTime.getFullYear() + '-'
      + String(localTime.getMonth() + 1).padStart(2, '0') + '-'
      + String(localTime.getDate()).padStart(2, '0');
    expect(F._todayDateKey()).toBe(expected);
  });

  it('diary version bump invalidates progress/program memo dependencies', () => {
    const F = globalThis.HEYS.Fingers;
    delete globalThis.window.HEYS.__fingersDiaryVersion;
    expect(F._bumpFingersDiaryVersion()).toBe(1);
    expect(F._bumpFingersDiaryVersion()).toBe(2);
  });
});
