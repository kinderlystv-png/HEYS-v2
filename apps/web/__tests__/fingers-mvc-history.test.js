// fingers-mvc-history.test.js — B3: MVC timeseries в records-store.
//
// updateIfPR теперь фиксирует КАЖДЫЙ тест в history[slug] (не только PR), чтобы
// строить тренд измеренной силы и ловить регрессии. maxHangs остаётся max-wins
// PR (backward compat). getMvcHistory отдаёт точки + strengthRatio (mvc/bw).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeEach, describe, expect, it } from 'vitest';

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

const setup = () => {
  if (!globalThis.window) globalThis.window = globalThis;
  globalThis.window.HEYS = globalThis.HEYS = {};
  globalThis.localStorage = createStorageMock();
  globalThis.window.localStorage = globalThis.localStorage;
  globalThis.window.HEYS.utils = {
    lsGet: (k, d) => { try { const r = globalThis.localStorage.getItem(k); return r ? JSON.parse(r) : d; } catch (_) { return d; } },
    lsSet: (k, v) => { globalThis.localStorage.setItem(k, JSON.stringify(v)); },
  };
  // records_store — IIFE с idempotent-гардом __registered; HEYS свежий → регистрируется.
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(path.join(FINGERS_DIR, 'heys_fingers_records_store_v1.js'), 'utf8'));
};

const wRec = (mvcKg, addedKg, holdTime, testedAt) => ({
  type: 'weight', mvcKg, addedKg, bw: 70, holdTime, testedAt, source: 'calibration',
});

describe('B3 MVC timeseries', () => {
  beforeEach(setup);
  const R = () => globalThis.HEYS.Fingers.records;

  it('фиксирует КАЖДЫЙ тест в history (PR и не-PR), maxHangs остаётся max-wins', () => {
    const r = R();
    expect(r.updateIfPR('halfcrimp', 20, wRec(80, 10, 8, '2026-06-01T10:00:00Z'))).toBe(true);  // первый = PR
    expect(r.updateIfPR('halfcrimp', 20, wRec(75, 5, 7, '2026-06-03T10:00:00Z'))).toBe(false);  // регрессия, не PR
    expect(r.updateIfPR('halfcrimp', 20, wRec(85, 15, 8, '2026-06-05T10:00:00Z'))).toBe(true);  // новый PR

    const hist = r.getMvcHistory('halfcrimp', 20);
    expect(hist).toHaveLength(3);                       // все три теста, включая регрессию
    expect(r.getMVC('halfcrimp', 20).mvcKg).toBe(85);   // maxHangs = максимум
  });

  it('getMvcHistory отсортирована по времени + strengthRatio = mvc/bw', () => {
    const r = R();
    r.updateIfPR('openhand4', 18, wRec(84, 14, 8, '2026-06-05T10:00:00Z'));
    r.updateIfPR('openhand4', 18, wRec(70, 0, 7, '2026-06-01T10:00:00Z')); // раньше по времени
    const hist = r.getMvcHistory('openhand4', 18);
    expect(hist.map((p) => p.testedAt)).toEqual(['2026-06-01T10:00:00Z', '2026-06-05T10:00:00Z']);
    expect(hist[0].strengthRatio).toBe(1);      // 70/70
    expect(hist[1].strengthRatio).toBe(1.2);    // 84/70
  });

  it('progressionSnapshot отдаёт recordsByQuality/currentAxes из canonical halfcrimp 20mm', () => {
    const r = R();
    r.updateIfPR('openhand4', 18, wRec(90, 20, 7, '2026-06-01T10:00:00Z'));
    r.updateIfPR('halfcrimp', 20, wRec(70, 0, 7, '2026-06-01T10:00:00Z'));
    r.updateIfPR('halfcrimp', 20, wRec(77, 7, 7, '2026-06-03T10:00:00Z'));

    const snap = r.progressionSnapshot();
    expect(snap.recordsByQuality.finger_strength).toEqual([
      { ts: Date.parse('2026-06-01T10:00:00Z'), value: 1 },
      { ts: Date.parse('2026-06-03T10:00:00Z'), value: 1.1 }
    ]);
    expect(snap.currentAxes.finger_strength).toBe('volume');
    expect(snap.axisSources.finger_strength).toBe('default');
    expect(snap.qualitySources.finger_strength.slug).toBe('halfcrimp_20mm');
  });

  it('progressionSnapshot уважает сохранённую progressionAxes', () => {
    const r = R();
    r.updateIfPR('halfcrimp', 20, wRec(70, 0, 7, '2026-06-01T10:00:00Z'));
    expect(r.saveProgressionAxis('finger_strength', 'edge')).toBe(true);

    const snap = r.progressionSnapshot();
    expect(snap.currentAxes.finger_strength).toBe('edge');
    expect(snap.axisSources.finger_strength).toBe('stored');
  });

  it('recordProgressionSession пишет non-MVC quality series для live progression breadth', () => {
    const r = R();
    r.recordProgressionSession({
      completedAt: '2026-06-01T10:00:00Z',
      exercises: [
        { quality: 'power', doseShape: 'attempts', dose: { attempts: 8 } },
        { quality: 'power', doseShape: 'attempts', dose: { attempts: 10 } },
        { quality: 'aerobic_base', doseShape: 'continuous', dose: { workSec: 1200, sets: 1 } }
      ]
    });
    r.recordProgressionSession({
      completedAt: '2026-06-03T10:00:00Z',
      exercises: [
        { quality: 'power', doseShape: 'attempts', dose: { attempts: 12 } }
      ]
    });

    const snap = r.progressionSnapshot();
    expect(snap.recordsByQuality.power).toEqual([
      { ts: Date.parse('2026-06-01T10:00:00Z'), value: 18 },
      { ts: Date.parse('2026-06-03T10:00:00Z'), value: 12 }
    ]);
    expect(snap.recordsByQuality.aerobic_base).toEqual([
      { ts: Date.parse('2026-06-01T10:00:00Z'), value: 1200 }
    ]);
    expect(snap.currentAxes.power).toBe('volume');
    expect(snap.qualitySources.power.source).toBe('sessionLog');
  });

  it('saveProgressionAxis сохраняет оси non-MVC качеств и валидирует policy', () => {
    const r = R();
    r.recordProgressionSession({
      completedAt: '2026-06-01T10:00:00Z',
      exercises: [{ quality: 'power', doseShape: 'attempts', dose: { attempts: 8 } }]
    });

    expect(r.saveProgressionAxis('power', 'speed')).toBe(true);
    expect(r.saveProgressionAxis('power', 'load')).toBe(false);
    expect(r.loadProgressionAxes().power).toBe('speed');

    const snap = r.progressionSnapshot();
    expect(snap.currentAxes.power).toBe('speed');
    expect(snap.axisSources.power).toBe('stored');
  });

  it('progressionSnapshot без canonical берёт один самый длинный slug, не смешивает хваты', () => {
    const r = R();
    r.updateIfPR('openhand4', 18, wRec(70, 0, 7, '2026-06-01T10:00:00Z'));
    r.updateIfPR('openhand4', 18, wRec(72, 2, 7, '2026-06-03T10:00:00Z'));
    r.updateIfPR('pinch', 25, wRec(80, 10, 7, '2026-06-04T10:00:00Z'));

    const snap = r.progressionSnapshot();
    expect(snap.recordsByQuality.finger_strength).toHaveLength(2);
    expect(snap.qualitySources.finger_strength.slug).toBe('openhand4_18mm');
  });

  it('progressionSnapshot без history → null (fail-safe для router)', () => {
    expect(R().progressionSnapshot()).toBeNull();
  });

  it('backward compat: slug без history → []', () => {
    expect(R().getMvcHistory('pinch', 25)).toEqual([]);
  });

  it('кап 100 точек на slug', () => {
    const r = R();
    for (let i = 0; i < 110; i++) {
      r.updateIfPR('mono', 10, wRec(50 + (i % 3), i % 3, 7, '2026-06-01T' + String(i).padStart(2, '0') + ':00:00Z'));
    }
    expect(r.getMvcHistory('mono', 10).length).toBe(100);
  });
});

// B5: asymmetry-aware — flag знает слабую руку + конкретный bias-совет 2:1.
describe('B5 asymmetry advice', () => {
  beforeEach(setup);
  const R = () => globalThis.HEYS.Fingers.records;

  it('lr_asymmetry flag указывает weakerSide + base', () => {
    const r = R();
    r.updateIfPR('halfcrimp_L', 20, wRec(70, 0, 7, '2026-06-01T10:00:00Z')); // слабее
    r.updateIfPR('halfcrimp_R', 20, wRec(85, 15, 7, '2026-06-01T10:00:00Z')); // сильнее
    const flags = r.asymmetries();
    const lr = flags.find((f) => f.kind === 'lr_asymmetry');
    expect(lr).toBeTruthy();
    expect(lr.weakerSide).toBe('left');
    expect(lr.base).toBe('halfcrimp');
    expect(lr.ratio).toBeCloseTo(1.21, 1);
  });

  it('asymmetryAdvice даёт конкретный 2:1 совет на слабую руку', () => {
    const r = R();
    r.updateIfPR('openhand4_L', 18, wRec(90, 20, 7, '2026-06-01T10:00:00Z')); // сильнее
    r.updateIfPR('openhand4_R', 18, wRec(72, 2, 7, '2026-06-01T10:00:00Z'));  // слабее
    const lr = r.asymmetries().find((f) => f.kind === 'lr_asymmetry');
    const adv = r.asymmetryAdvice(lr);
    expect(adv.weakerSide).toBe('right');
    expect(adv.weakSets).toBe(2);
    expect(adv.strongSets).toBe(1);
    expect(adv.text).toContain('правую');
  });

  it('asymmetryAdvice(не-lr флаг) → null', () => {
    expect(R().asymmetryAdvice({ kind: 'crimp_weak' })).toBeNull();
    expect(R().asymmetryAdvice(null)).toBeNull();
  });
});
