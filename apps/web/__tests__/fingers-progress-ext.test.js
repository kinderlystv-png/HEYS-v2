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

// B12: pure CSV-сериализация экспорта тренировок.
describe('B12 buildFingersCsv', () => {
  beforeAll(setupOnce);
  const C = (rows) => globalThis.HEYS.Fingers.buildFingersCsv(rows);
  const HEADER = 'date,program,intensity,durationMin,grip,edgeMm,addedKg,sets,rpe,pain';

  it('пустой вход → только заголовок', () => {
    expect(C([])).toBe(HEADER);
    expect(C(null)).toBe(HEADER);
  });

  it('строка: rpe-массив через пробел, pain → yes/пусто', () => {
    const csv = C([
      { date: '2026-06-05', program: 'horst_max_hangs', intensity: 'max', durationMin: 24,
        grip: 'halfcrimp', edgeMm: 20, addedKg: 12, sets: 3, rpe: ['ok', 'hard'], pain: true },
      { date: '2026-06-03', program: 'repeaters_7_3', intensity: 'moderate', durationMin: 18,
        grip: 'openhand4', edgeMm: 18, addedKg: 0, sets: 4, rpe: [], pain: false },
    ]);
    const lines = csv.split('\n');
    expect(lines[0]).toBe(HEADER);
    expect(lines[1]).toBe('2026-06-05,horst_max_hangs,max,24,halfcrimp,20,12,3,ok hard,yes');
    expect(lines[2]).toBe('2026-06-03,repeaters_7_3,moderate,18,openhand4,18,0,4,,');
  });

  it('RFC4180-эскейпинг полей с запятой/кавычкой', () => {
    const csv = C([{ date: '2026-06-05', program: 'a,b', grip: 'x"y', rpe: [], pain: false }]);
    const line = csv.split('\n')[1];
    expect(line).toContain('"a,b"');     // запятая → кавычки
    expect(line).toContain('"x""y"');    // кавычка удвоена
  });
});

describe('B12 debug dump', () => {
  beforeAll(setupOnce);

  it('buildFingersDebugDump returns review-ready JSON shape', () => {
    globalThis.HEYS.Fingers.getProfile = () => ({ level: 'advanced' });
    globalThis.HEYS.Fingers.periodization = {
      current: () => ({ phase: 'deload', ceiling: 'recovery' })
    };
    globalThis.HEYS.Fingers.assessment = {
      dueTests: () => [{ id: 'maxHang20mmHalf', due: true }]
    };
    const rec = {
      id: 'session_builder_recovery_2',
      name: 'Сессия',
      intensity: 'recovery',
      durationMin: 20,
      coachReason: 'Фаза плана ограничила интенсивность дня.',
      __trace: { resolution: { bucket: 'recovery' } },
      __progressionHints: { finger_strength: { action: 'keep' } },
      __safetyTrace: { picks: [] }
    };

    const dump = globalThis.HEYS.Fingers.buildFingersDebugDump(rec, {
      nowMs: Date.parse('2026-06-10T00:00:00.000Z'),
      dateKey: '2026-06-10',
      lookbackDays: 1
    });

    expect(dump.version).toBe(1);
    expect(dump.profile.level).toBe('advanced');
    expect(dump.periodization.phase).toBe('deload');
    expect(dump.assessmentDue[0].due).toBe(true);
    expect(dump.recommendation.trace.resolution.bucket).toBe('recovery');
    expect(Array.isArray(dump.exportRows)).toBe(true);
  });
});
