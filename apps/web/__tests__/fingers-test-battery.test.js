// fingers-test-battery.test.js — UI-хелперы ввода тест-батареи (§8.1) + round-trip.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeEach, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FINGERS_DIR = path.resolve(__dirname, '..', 'fingers');

function boot(clientId = 'client-a') {
  const store = {};
  globalThis.window = globalThis;
  globalThis.localStorage = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; }
  };
  globalThis.HEYS = globalThis.window.HEYS = {
    currentClientId: clientId,
    utils: {
      lsGet: (k, d) => { const r = globalThis.localStorage.getItem(k); return r ? JSON.parse(r) : d; },
      lsSet: (k, v) => { globalThis.localStorage.setItem(k, JSON.stringify(v)); return true; }
    }
  };
  const ev = (f) => { /* eslint-disable-next-line no-eval */ eval(fs.readFileSync(path.join(FINGERS_DIR, f), 'utf8')); };
  ev('heys_fingers_grips_catalog_v1.js');
  ev('heys_fingers_quality_catalog_v1.js');
  ev('heys_fingers_assessment_v1.js');
  ev('heys_fingers_records_store_v1.js');
  ev('heys_fingers_test_battery_v1.js');
  const F = globalThis.HEYS.Fingers;
  return { F, TB: F.assessment.TEST_BATTERY, mod: F.testBattery, A: F.assessment, R: F.records, labels: F.qualityCatalog.QUALITY_LABELS };
}

describe('testBattery.buildRawFromState', () => {
  beforeEach(() => { delete globalThis.HEYS; delete globalThis.localStorage; });

  it('включает числовой score, игнорит пустые поля', () => {
    const { mod, TB } = boot();
    const raw = mod.buildRawFromState({
      maxHang20mmHalf: { score: '120', markers: '' },
      weightedPull: { score: '', markers: '' }
    }, TB);
    expect(raw.maxHang20mmHalf).toEqual({ score: 120 });
    expect(raw.weightedPull).toBeUndefined();
  });

  it('маркеры чек-листа несут maxMarkers из батареи', () => {
    const { mod, TB } = boot();
    const raw = mod.buildRawFromState({ techniqueMarkers: { score: '', markers: '3' } }, TB);
    expect(raw.techniqueMarkers).toEqual({ markers: 3, maxMarkers: 5 });
  });

  it('NaN/мусор отбрасывается', () => {
    const { mod, TB } = boot();
    const raw = mod.buildRawFromState({ maxHang20mmHalf: { score: 'abc' } }, TB);
    expect(raw.maxHang20mmHalf).toBeUndefined();
  });
});

describe('testBattery.summarizeAssessment', () => {
  beforeEach(() => { delete globalThis.HEYS; delete globalThis.localStorage; });

  it('сортирует веса по убыванию и режет до top-N', () => {
    const { mod, labels } = boot();
    const sm = mod.summarizeAssessment(
      { leadingLimiter: 'finger_strength', blockWeights: { finger_strength: 0.5, power: 0.3, mental: 0.2 } },
      labels, 2
    );
    expect(sm.limiter).toBe('finger_strength');
    expect(sm.weights.map((w) => w.quality)).toEqual(['finger_strength', 'power']);
    expect(sm.label).not.toBe('finger_strength'); // переведено в RU-метку
  });

  it('пустой результат → null', () => {
    const { mod } = boot();
    expect(mod.summarizeAssessment(null)).toBeNull();
    expect(mod.summarizeAssessment({})).toBeNull();
  });
});

describe('testBattery.summarizeDue (§8.4 ретест)', () => {
  beforeEach(() => { delete globalThis.HEYS; delete globalThis.localStorage; });

  it('пустая батарея → все тесты due и never', () => {
    const { mod, A } = boot();
    const s = mod.summarizeDue(A.dueTests({}));
    expect(s.total).toBe(9);
    expect(s.dueCount).toBe(9);
    expect(s.neverCount).toBe(9);
  });

  it('один свежий тест → на единицу меньше due', () => {
    const { mod, A } = boot();
    const s = mod.summarizeDue(A.dueTests({ maxHang20mmHalf: { score: 120, testedAt: new Date().toISOString() } }));
    expect(s.dueCount).toBe(8);
    expect(s.neverCount).toBe(8);
  });
});

describe('testBattery.buildSparkline (§8.6 графики)', () => {
  beforeEach(() => { delete globalThis.HEYS; delete globalThis.localStorage; });

  it('меньше 2 точек → null', () => {
    const { mod } = boot();
    expect(mod.buildSparkline([10])).toBeNull();
    expect(mod.buildSparkline([])).toBeNull();
  });

  it('считает deltaPct, min/max, путь и последнюю точку', () => {
    const { mod } = boot();
    const s = mod.buildSparkline([10, 11, 12], { width: 240, height: 48 });
    expect(s.deltaPct).toBe(20);
    expect([s.min, s.max, s.last]).toEqual([10, 12, 12]);
    expect(s.path.startsWith('M')).toBe(true);
    expect(s.lastPoint[0]).toBeGreaterThan(s.points[0][0]);
  });

  it('нисходящий ряд → отрицательный deltaPct', () => {
    const { mod } = boot();
    expect(mod.buildSparkline([20, 10]).deltaPct).toBe(-50);
  });

  it('строит тренд силы из MVC-истории records', () => {
    const { mod, R } = boot();
    R.updateIfPR('halfcrimp', 20, { type: 'weight', mvcKg: 40, bw: 70, testedAt: '2026-05-01T10:00:00Z' });
    R.updateIfPR('halfcrimp', 20, { type: 'weight', mvcKg: 44, bw: 70, testedAt: '2026-06-01T10:00:00Z' });
    const vals = R.getMvcHistory('halfcrimp', 20).map((p) => p.strengthRatio);
    const s = mod.buildSparkline(vals);
    expect(s).toBeTruthy();
    expect(s.deltaPct).toBeGreaterThan(0);
  });
});

describe('testBattery: round-trip state → save → assess', () => {
  beforeEach(() => { delete globalThis.HEYS; delete globalThis.localStorage; });

  it('низкий finger_strength → лимитёр finger_strength, батарея персистится', () => {
    const { mod, TB, R, labels } = boot();
    const raw = mod.buildRawFromState({ maxHang20mmHalf: { score: '40' } }, TB);
    R.saveAssessmentBattery(raw, { source: 'manual' });
    const res = R.assessLatestBattery('intermediate');
    expect(res.leadingLimiter).toBe('finger_strength');
    expect(Object.keys(R.loadAssessmentBattery()).length).toBeGreaterThan(0);
    const sm = mod.summarizeAssessment(res, labels, 4);
    expect(sm.weights.length).toBe(4);
  });
});
