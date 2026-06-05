// fingers-mesocycle.test.js — B7: мезоцикл (фазы + clamp интенсивности в Today).
// Pure-движок + интеграция в _buildTodayData. Cycle-UI (старт/индикатор) — live.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

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
  createElement: (...a) => ({ __el: true, a }),
  useState: (i) => [typeof i === 'function' ? i() : i, () => {}],
  useMemo: (fn) => fn(), useEffect: () => {}, useCallback: (fn) => fn,
  useRef: (i) => ({ current: i }), Fragment: 'F',
});

const setupOnce = () => {
  if (!globalThis.window) globalThis.window = globalThis;
  globalThis.window.HEYS = globalThis.HEYS = {};
  globalThis.localStorage = createStorageMock();
  globalThis.window.localStorage = globalThis.localStorage;
  globalThis.React = globalThis.window.React = reactShim();
  globalThis.window.HEYS.utils = {
    lsGet: (k, d) => { try { const r = globalThis.localStorage.getItem(k); return r ? JSON.parse(r) : d; } catch (_) { return d; } },
    lsSet: (k, v) => { globalThis.localStorage.setItem(k, JSON.stringify(v)); },
  };
  const ev = (f) => { /* eslint-disable-next-line no-eval */ eval(fs.readFileSync(path.join(FINGERS_DIR, f), 'utf8')); };
  ev('heys_fingers_programs_catalog_v1.js');
  ev('heys_fingers_age_gating_v1.js');
  ev('heys_fingers_session_ui_v1.js');
};

describe('B7 mesocycle engine', () => {
  beforeAll(setupOnce);
  const M = () => globalThis.HEYS.Fingers.mesocycle;

  it('phaseForWeek для 4-нед блока', () => {
    const p = (w) => M().phaseForWeek(w, 4);
    expect(p(0)).toBe('accumulation');
    expect(p(1)).toBe('accumulation');
    expect(p(2)).toBe('intensification');
    expect(p(3)).toBe('deload');
    expect(p(4)).toBe('retest');     // цикл завершён
  });

  it('intensityCeiling по фазе', () => {
    const c = M().intensityCeiling;
    expect(c('deload')).toBe('recovery');
    expect(c('accumulation')).toBe('moderate');
    expect(c('intensification')).toBe('max');
    expect(c('retest')).toBe('max');
  });

  it('current считает неделю/фазу из startedAt', () => {
    // 2026-05-15 → 2026-06-05 = 21 дн → weekIdx 3 → deload
    const cur = M().current({ startedAt: '2026-05-15', weeks: 4 }, '2026-06-05');
    expect(cur.weekIdx).toBe(3);
    expect(cur.week).toBe(4);
    expect(cur.phase).toBe('deload');
    expect(cur.ceiling).toBe('recovery');
  });

  it('нет цикла → current null', () => {
    expect(M().current(null, '2026-06-05')).toBeNull();
  });
});

describe('B7 mesocycle clamps Today bucket', () => {
  beforeAll(setupOnce);
  beforeEach(() => {
    globalThis.window.HEYS.utils.lsSet('heys_profile', {
      age: 25,
      fingerboardProfile: { age: 25, maxVGrade: 'V7-V8', equipmentTypes: ['full', 'none'],
        mesocycle: { startedAt: '2026-05-15', weeks: 4 } },
    });
  });

  it('deload-неделя → bucket recovery (даже без readiness-данных = max)', () => {
    const data = globalThis.HEYS.Fingers._buildTodayData('2026-06-05'); // 21 дн → deload
    expect(data.mesocycle.phase).toBe('deload');
    expect(data.bucket).toBe('recovery');
    // рекомендация тоже понижена до recovery-интенсивности
    expect(data.recommendedProgram && data.recommendedProgram.intensity).toBe('recovery');
  });

  it('accumulation-неделя → потолок moderate', () => {
    const data = globalThis.HEYS.Fingers._buildTodayData('2026-05-16'); // 1 дн → week0 accumulation
    expect(data.mesocycle.phase).toBe('accumulation');
    expect(data.bucket).toBe('moderate');
  });
});
