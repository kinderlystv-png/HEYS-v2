// fingers-periodization.test.js — periodization engine and scoped storage.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeEach, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB = path.resolve(__dirname, '..');
const FINGERS_DIR = path.resolve(__dirname, '..', 'fingers');

function createStorageMock() {
  const store = {};
  return {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    keys: () => Object.keys(store)
  };
}

function boot(clientId = 'client-a') {
  const localStorage = createStorageMock();
  globalThis.window = globalThis;
  globalThis.localStorage = localStorage;
  globalThis.HEYS = globalThis.window.HEYS = {
    currentClientId: clientId,
    utils: {
      lsGet: (k, d) => {
        const raw = localStorage.getItem(k);
        return raw ? JSON.parse(raw) : d;
      },
      lsSet: (k, v) => { localStorage.setItem(k, JSON.stringify(v)); return true; }
    }
  };
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(path.join(WEB, '_kernel', 'heys_kernel_dates_v1.js'), 'utf8'));
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(path.join(WEB, '_kernel', 'heys_kernel_periodization_v1.js'), 'utf8'));
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(path.join(FINGERS_DIR, 'heys_fingers_periodization_engine_v1.js'), 'utf8'));
  return { storage: localStorage, P: globalThis.HEYS.Fingers.periodization };
}

describe('periodization engine', () => {
  beforeEach(() => {
    delete globalThis.window;
    delete globalThis.HEYS;
    delete globalThis.localStorage;
  });

  it('builds linear 4-week mesocycle with deload', () => {
    const { P } = boot();
    const plan = P.buildPlan({ model: 'linear', startedAt: '2026-06-01', weeks: 4, focusQuality: 'finger_strength' });

    expect(plan.weeks.map((w) => w.phase)).toEqual([
      'accumulation', 'accumulation', 'intensification', 'deload'
    ]);
    expect(P.current(plan, '2026-06-22').phase).toBe('deload');
    expect(P.current(plan, '2026-06-29').phase).toBe('retest');
  });

  it('uses assessment leadingLimiter as focusQuality when explicit focus is absent', () => {
    const { P } = boot();
    const plan = P.buildPlan({
      model: 'linear',
      startedAt: '2026-06-01',
      assessment: { leadingLimiter: 'max_strength' }
    });

    expect(plan.focusQuality).toBe('max_strength');
    expect(plan.weeks[0].focusQuality).toBe('max_strength');
    expect(P.current(plan, '2026-06-08').focusQuality).toBe('max_strength');
  });

  it('annotates phase energy focus for validator/review consumers', () => {
    const { P } = boot();
    const plan = P.buildPlan({ model: 'linear', startedAt: '2026-06-01', weeks: 4 });

    expect(plan.weeks.map((w) => w.energyFocus)).toEqual([
      'aerobic', 'aerobic', 'phosphagen', 'recovery'
    ]);
    expect(P.energyFocusForPhase('dup')).toBe('undulating');
  });

  it('models nonlinear, DUP, taper, and maintenance phases', () => {
    const { P } = boot();
    expect(P.buildPlan({ model: 'nonlinear', weeks: 4 }).weeks.map((w) => w.phase))
      .toEqual(['accumulation', 'intensification', 'accumulation', 'deload']);
    expect(P.buildPlan({ model: 'dup', weeks: 3 }).weeks.map((w) => w.phase))
      .toEqual(['dup', 'dup', 'deload']);
    expect(P.buildPlan({ model: 'taper', weeks: 2 }).weeks.map((w) => w.phase))
      .toEqual(['intensification', 'taper']);
    expect(P.buildPlan({ model: 'maintenance', weeks: 2 }).weeks.map((w) => w.phase))
      .toEqual(['maintenance', 'maintenance']);
  });

  it('persists plans under current client key only', () => {
    const env = boot('client-a');
    const plan = env.P.buildPlan({ model: 'linear', startedAt: '2026-06-01' });
    expect(env.P.savePlan(plan)).toBe(true);
    expect(env.storage.keys()).toEqual(['heys_client-a_fingers_periodization_v1']);
    expect(env.P.loadPlan().startedAt).toBe('2026-06-01');

    globalThis.HEYS.currentClientId = 'client-b';
    expect(env.P.loadPlan()).toBeNull();
    expect(env.P.savePlan(env.P.buildPlan({ model: 'maintenance', startedAt: '2026-07-01' }))).toBe(true);
    expect(env.storage.keys().sort()).toEqual([
      'heys_client-a_fingers_periodization_v1',
      'heys_client-b_fingers_periodization_v1'
    ]);
  });
});

describe('selectModel (§6.4 авто-выбор модели)', () => {
  const sm = (i) => boot().P.selectModel(i);

  it('новичок → maintenance, periodize:false (без периодизации)', () => {
    expect(sm({ level: 'beginner' })).toMatchObject({ model: 'maintenance', periodize: false });
  });
  it('лимитер technique/mental → periodize:false', () => {
    expect(sm({ level: 'intermediate', leadingLimiter: 'technique' }).periodize).toBe(false);
    expect(sm({ level: 'intermediate', leadingLimiter: 'mental' }).periodize).toBe(false);
  });
  it('дата-цель → linear (Anderson к пику)', () => {
    expect(sm({ level: 'intermediate', goalDate: '2026-08-01' }).model).toBe('linear');
  });
  it('лимитер сила пальцев / max_strength → linear', () => {
    expect(sm({ level: 'intermediate', leadingLimiter: 'finger_strength' }).model).toBe('linear');
    expect(sm({ level: 'advanced', leadingLimiter: 'max_strength' }).model).toBe('linear');
  });
  it('лимитер аэробная/анаэробная → nonlinear', () => {
    expect(sm({ level: 'intermediate', leadingLimiter: 'aerobic_base' }).model).toBe('nonlinear');
    expect(sm({ level: 'intermediate', leadingLimiter: 'anaerobic_capacity' }).model).toBe('nonlinear');
  });
  it('3+ сессий/нед on-season → dup', () => {
    expect(sm({ level: 'intermediate', sessionsPerWeek: 4, onSeason: true }).model).toBe('dup');
  });
  it('дефолт (круглый год) → nonlinear', () => {
    expect(sm({ level: 'intermediate' }).model).toBe('nonlinear');
  });
  it('приоритет: дата-цель побеждает частоту', () => {
    expect(sm({ level: 'intermediate', goalDate: '2026-08-01', sessionsPerWeek: 5, onSeason: true }).model).toBe('linear');
  });

  it('buildPlan авто-выбирает модель из лимитера (autoSelected)', () => {
    const plan = boot().P.buildPlan({ level: 'intermediate', assessment: { leadingLimiter: 'finger_strength' } });
    expect(plan.model).toBe('linear');
    expect(plan.modelAutoSelected).toBe(true);
  });
  it('buildPlan: явная model побеждает авто-выбор', () => {
    const plan = boot().P.buildPlan({ level: 'beginner', model: 'dup' });
    expect(plan.model).toBe('dup');
    expect(plan.modelAutoSelected).toBe(false);
  });
});
