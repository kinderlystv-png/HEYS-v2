// fingers-calendar-cooldown.test.js — cooldown timestamp compatibility.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB = path.resolve(__dirname, '..');
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
  globalThis.window.HEYS.utils = {
    lsGet: (key, dflt) => {
      try {
        const raw = globalThis.localStorage.getItem(key);
        return raw ? JSON.parse(raw) : dflt;
      } catch (_) { return dflt; }
    },
    lsSet: (key, val) => { globalThis.localStorage.setItem(key, JSON.stringify(val)); },
  };
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(path.join(WEB, '_kernel', 'heys_kernel_dates_v1.js'), 'utf8'));
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(path.join(WEB, '_kernel', 'heys_kernel_calendar_v1.js'), 'utf8'));
  evalSource('heys_fingers_programs_catalog_v1.js');
  evalSource('heys_fingers_calendar_v1.js');
};

const F = () => globalThis.HEYS.Fingers;

describe('calendar cooldown timestamp compatibility', () => {
  beforeAll(setupOnce);
  beforeEach(() => {
    globalThis.localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-05T12:00:00.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses fingersLog.endedAt when present', () => {
    globalThis.HEYS.utils.lsSet('heys_dayv2_2026-06-05', {
      date: '2026-06-05',
      trainings: [{ type: 'fingers', fingersLog: {
        programId: 'max_hang_test',
        endedAt: '2026-06-05T10:00:00.000Z'
      } }]
    });

    const result = F().cooldownCheck();
    expect(result.lastWasMax).toBe(true);
    expect(result.hoursSinceLast).toBeCloseTo(2, 5);
    expect(result.allowedNow).toBe(false);
    expect(result.recommendation).toBe('rest');
  });

  it('falls back to legacy fingersLog.completedAt instead of noon fallback', () => {
    globalThis.HEYS.utils.lsSet('heys_dayv2_2026-06-05', {
      date: '2026-06-05',
      trainings: [{ type: 'fingers', fingersLog: {
        programId: 'max_hang_test',
        completedAt: '2026-06-05T09:00:00.000Z'
      } }]
    });

    const result = F().cooldownCheck();
    expect(result.lastWasMax).toBe(true);
    expect(result.hoursSinceLast).toBeCloseTo(3, 5);
    expect(result.recommendation).toBe('rest');
  });
});
