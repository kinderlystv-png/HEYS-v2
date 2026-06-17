import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(
  resolve(__dirname, '../mobility/heys_mobility_session_persistence_v1.js'),
  'utf8'
);
const KERNEL_SRC = readFileSync(
  resolve(__dirname, '../_kernel/heys_kernel_active_session_v1.js'),
  'utf8'
);

const CID = '12345678-aaaa-bbbb-cccc-1234567890ab';
const OTHER_CID = '87654321-aaaa-bbbb-cccc-1234567890ab';

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

const ensureLocalStorage = () => {
  if (typeof window === 'undefined') globalThis.window = globalThis;
  if (!window.localStorage || typeof window.localStorage.clear !== 'function') {
    window.localStorage = createStorageMock();
  }
  globalThis.localStorage = window.localStorage;
};

function loadPersistence() {
  ensureLocalStorage();
  window.HEYS = {
    currentClientId: CID,
    Mobility: {},
    utils: {
      lsSet: vi.fn(),
    },
  };
  globalThis.HEYS = window.HEYS;
  // eslint-disable-next-line no-new-func
  new Function(KERNEL_SRC)();
  // eslint-disable-next-line no-new-func
  new Function(SRC)();
  return window.HEYS.Mobility.persistence;
}

describe('Mobility session persistence', () => {
  const safeClearLS = () => {
    try {
      ensureLocalStorage();
      window.localStorage.clear();
    } catch (_) { /* noop */ }
  };

  beforeEach(() => {
    vi.useFakeTimers();
    ensureLocalStorage();
    safeClearLS();
    if (typeof window !== 'undefined') delete window.HEYS;
    delete globalThis.HEYS;
  });

  afterEach(() => {
    vi.useRealTimers();
    safeClearLS();
    if (typeof window !== 'undefined') delete window.HEYS;
    delete globalThis.HEYS;
  });

  it('saves active mobility snapshot as raw localStorage, not through cloud-synced lsSet', () => {
    const persistence = loadPersistence();
    const snapshot = {
      planSteps: [{ atomId: 'joint_cars_hip' }],
      sessionMode: 'morning_tonify',
      index: 0,
      remainingSec: 20,
      stateEnteredAt: 100,
    };

    persistence.save(snapshot);
    vi.advanceTimersByTime(260);

    expect(window.HEYS.utils.lsSet).not.toHaveBeenCalled();
    const key = `heys_${CID}_routine_active_session`;
    const stored = JSON.parse(window.localStorage.getItem(key));
    expect(stored.sessionMode).toBe('morning_tonify');
    expect(stored.planSteps[0].atomId).toBe('joint_cars_hip');
    expect(stored.lastTickAt).toBeTypeOf('number');
  });

  it('clearForTraining removes only current-client routine snapshots', () => {
    const persistence = loadPersistence();
    const matchingKey = `heys_${CID}_routine_active_session`;
    const globalKey = 'heys_routine_active_session';
    const foreignKey = `heys_${OTHER_CID}_routine_active_session`;

    window.localStorage.setItem(matchingKey, JSON.stringify({
      dateKey: '2026-06-17',
      trainingIndex: 1,
      planSteps: [{}],
    }));
    window.localStorage.setItem(globalKey, JSON.stringify({
      dateKey: '2026-06-17',
      trainingIndex: 1,
      planSteps: [{}],
    }));
    window.localStorage.setItem(foreignKey, JSON.stringify({
      dateKey: '2026-06-17',
      trainingIndex: 1,
      planSteps: [{}],
    }));

    const cleared = persistence.clearForTraining({
      dateKey: '2026-06-17',
      trainingIndex: 1,
    });

    expect(cleared).toBe(1);
    expect(window.localStorage.getItem(matchingKey)).toBeNull();
    expect(window.localStorage.getItem(globalKey)).not.toBeNull();
    expect(window.localStorage.getItem(foreignKey)).not.toBeNull();
  });

  it('load ignores foreign-scoped routine snapshots', () => {
    const persistence = loadPersistence();
    const foreignKey = `heys_${OTHER_CID}_routine_active_session`;
    window.localStorage.setItem(foreignKey, JSON.stringify({
      planSteps: [{}],
      sessionMode: 'evening_relax',
      lastTickAt: Date.now(),
    }));

    expect(persistence.load()).toBeNull();
  });
});
