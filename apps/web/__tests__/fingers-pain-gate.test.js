// fingers-pain-gate.test.js — B6: блокировка risky-хватов при недавней боли.
//
// Чистое ядро в Fingers.painGate (age_gating module): detect боли из dayv2
// (B1: fingersLog.hadPain / setFeedback[].pain) + fail-safe фильтр хватов
// (убирает full crimp / mono). Reader Fingers.recentFingerPain (session_ui)
// и UI-вызов в конструкторе — отдельно (нужен dayv2 + рендер).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeAll, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FINGERS_DIR = path.resolve(__dirname, '..', 'fingers');

const setupOnce = () => {
  if (!globalThis.window) globalThis.window = globalThis;
  globalThis.window.HEYS = globalThis.HEYS = {};
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(path.join(FINGERS_DIR, 'heys_fingers_age_gating_v1.js'), 'utf8'));
};

describe('B6 painGate.dayHasFingerPain', () => {
  beforeAll(setupOnce);
  const has = (d) => globalThis.HEYS.Fingers.painGate.dayHasFingerPain(d);

  it('день с fingersLog.hadPain → true', () => {
    expect(has({ trainings: [{ type: 'fingers', fingersLog: { hadPain: true } }] })).toBe(true);
  });

  it('день с setFeedback[].pain → true (без явного hadPain)', () => {
    expect(has({ trainings: [{ type: 'fingers', fingersLog: {
      exercises: [{ setFeedback: [{ rpe: 'ok', pain: false }, { rpe: 'hard', pain: true }] }],
    } }] })).toBe(true);
  });

  it('finger-день без боли → false', () => {
    expect(has({ trainings: [{ type: 'fingers', fingersLog: {
      exercises: [{ setFeedback: [{ rpe: 'ok', pain: false }] }],
    } }] })).toBe(false);
  });

  it('не-finger тренировка / пустой день / null → false', () => {
    expect(has({ trainings: [{ type: 'running' }] })).toBe(false);
    expect(has({ trainings: [] })).toBe(false);
    expect(has(null)).toBe(false);
  });
});

describe('B6 painGate.filterGripsForPain', () => {
  beforeAll(setupOnce);
  const filt = (g, p) => globalThis.HEYS.Fingers.painGate.filterGripsForPain(g, p);

  const GRIPS = [
    { id: 'openhand4' }, { id: 'halfcrimp' }, { id: 'fullcrimp' },
    { id: 'mono' }, { id: 'pinch' },
  ];

  it('hasPain=false → массив без изменений (тот же ref)', () => {
    expect(filt(GRIPS, false)).toBe(GRIPS);
  });

  it('hasPain=true → убраны fullcrimp и mono, остальные на месте', () => {
    const out = filt(GRIPS, true).map((g) => g.id);
    expect(out).toEqual(['openhand4', 'halfcrimp', 'pinch']);
    expect(out).not.toContain('fullcrimp');
    expect(out).not.toContain('mono');
  });

  it('работает и со строковыми id', () => {
    expect(filt(['openhand4', 'fullcrimp', 'mono'], true)).toEqual(['openhand4']);
  });

  it('не-массив → []', () => {
    expect(filt(null, true)).toEqual([]);
  });
});
