// fingers-progress-ext.test.js — B11 (weekly volume target) + B18 (day detail).
// Чистые ядра обоих; прогресс-бар и модалка календаря — UI (live).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeAll, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FINGERS_DIR = path.resolve(__dirname, '..', 'fingers');

const reactShim = () => ({
  createElement: (...a) => ({ __el: true, a }),
  useState: (i) => [typeof i === 'function' ? i() : i, () => {}],
  useMemo: (fn) => fn(), useEffect: () => {}, useCallback: (fn) => fn,
  useRef: (i) => ({ current: i }), Fragment: 'F',
});

const setupOnce = () => {
  if (!globalThis.window) globalThis.window = globalThis;
  globalThis.window.HEYS = globalThis.HEYS = {};
  globalThis.React = globalThis.window.React = reactShim();
  globalThis.window.HEYS.utils = { lsGet: (k, d) => d, lsSet: () => {} };
  const ev = (f) => { /* eslint-disable-next-line no-eval */ eval(fs.readFileSync(path.join(FINGERS_DIR, f), 'utf8')); };
  ev('heys_fingers_programs_catalog_v1.js');
  ev('heys_fingers_age_gating_v1.js');
  ev('heys_fingers_session_ui_v1.js');
};

describe('B11 _weeklyVolumeTarget', () => {
  beforeAll(setupOnce);
  const T = (wv) => globalThis.HEYS.Fingers._weeklyVolumeTarget(wv);

  it('нет прошлых недель → target null', () => {
    expect(T([100]).target).toBeNull();
    expect(T([]).target).toBeNull();
  });

  it('target = среднее по прошлым неделям с данными (1..4), нули исключены', () => {
    // [thisWeek, w1, w2, w3, w4, ...] — prior с данными: 200, 240 (w3=0 пропущен)
    const r = T([180, 200, 240, 0, 0]);
    expect(r.thisWeek).toBe(180);
    expect(r.target).toBe(220);          // (200+240)/2
    expect(r.pct).toBe(82);              // round(100*180/220)
  });

  it('перевыполнение → pct ≥ 100', () => {
    const r = T([300, 200, 200, 200, 200]);
    expect(r.target).toBe(200);
    expect(r.pct).toBe(150);
  });
});

describe('B18 _buildDayDetail', () => {
  beforeAll(setupOnce);
  const D = (day) => globalThis.HEYS.Fingers._buildDayDetail(day);

  const DAY = {
    trainings: [
      { type: 'running' },
      { type: 'fingers', notes: 'тяжело шло', fingersLog: {
        programId: 'horst_max_hangs', totalDurationMinutes: 24, hadPain: true,
        exercises: [
          { gripId: 'halfcrimp', edgeSizeMm: 20, addedWeightKg: 12, setsCount: 3,
            setFeedback: [{ rpe: 'ok', pain: false }, { rpe: 'hard', pain: true }] },
        ],
      } },
    ],
  };

  it('извлекает finger-сессии с упражнениями, RPE и болью', () => {
    const out = D(DAY);
    expect(out.sessions).toHaveLength(1);              // running пропущен
    const s = out.sessions[0];
    expect(s.programId).toBe('horst_max_hangs');
    expect(s.durationMinutes).toBe(24);
    expect(s.hadPain).toBe(true);
    expect(s.notes).toBe('тяжело шло');
    expect(s.exercises[0].gripId).toBe('halfcrimp');
    expect(s.exercises[0].rpe).toEqual(['ok', 'hard']);
    expect(s.exercises[0].pain).toBe(true);
  });

  it('hadPain выводится из setFeedback даже без явного флага', () => {
    const out = D({ trainings: [{ type: 'fingers', fingersLog: {
      exercises: [{ gripId: 'openhand4', setFeedback: [{ rpe: 'hard', pain: true }] }],
    } }] });
    expect(out.sessions[0].hadPain).toBe(true);
  });

  it('нет finger-тренировок / null → пустой список', () => {
    expect(D({ trainings: [{ type: 'running' }] }).sessions).toEqual([]);
    expect(D(null).sessions).toEqual([]);
  });
});
