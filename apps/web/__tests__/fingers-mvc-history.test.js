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
