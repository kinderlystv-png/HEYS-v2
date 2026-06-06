import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(
  resolve(__dirname, '../fingers/heys_fingers_session_persistence_v1.js'),
  'utf8'
);

const CID = '12345678-aaaa-bbbb-cccc-1234567890ab';

function loadPersistence() {
  window.HEYS = {
    currentClientId: CID,
    Fingers: {},
    utils: {
      lsSet: vi.fn(),
    },
  };
  // eslint-disable-next-line no-new-func
  new Function(SRC)();
  return window.HEYS.Fingers.persistence;
}

describe('Fingers session persistence', () => {
  // Defensive: в полном прогоне vitest (single-thread, shared globalThis)
  // соседний файл может обнулить window.localStorage между хуками. Teardown/
  // setup не должен кидать из-за чужого загрязнения — гардим существование.
  const safeClearLS = () => {
    try { if (typeof window !== 'undefined' && window.localStorage) window.localStorage.clear(); } catch (_) { /* noop */ }
  };

  beforeEach(() => {
    vi.useFakeTimers();
    safeClearLS();
    if (typeof window !== 'undefined') delete window.HEYS;
  });

  afterEach(() => {
    vi.useRealTimers();
    safeClearLS();
    if (typeof window !== 'undefined') delete window.HEYS;
  });

  it('saves active snapshot as raw localStorage, not through cloud-synced lsSet', () => {
    const persistence = loadPersistence();
    const snapshot = {
      dateKey: '2026-06-02',
      trainingIndex: 1,
      exercises: [{ gripId: 'openhand4' }],
      state: 'HANG',
      stateEnteredAt: 100,
    };

    persistence.save(snapshot);
    vi.advanceTimersByTime(260);

    expect(window.HEYS.utils.lsSet).not.toHaveBeenCalled();
    const key = `heys_${CID}_finger_active_session`;
    const stored = JSON.parse(window.localStorage.getItem(key));
    expect(stored.dateKey).toBe('2026-06-02');
    expect(stored.trainingIndex).toBe(1);
    expect(stored.lastTickAt).toBeTypeOf('number');
  });

  it('clearForTraining removes only matching active-session snapshots', () => {
    const persistence = loadPersistence();
    const matchingKey = `heys_${CID}_finger_active_session`;
    const otherKey = 'heys_finger_active_session';

    window.localStorage.setItem(matchingKey, JSON.stringify({
      dateKey: '2026-06-02',
      trainingIndex: 1,
      exercises: [{}],
    }));
    window.localStorage.setItem(otherKey, JSON.stringify({
      dateKey: '2026-06-03',
      trainingIndex: 0,
      exercises: [{}],
    }));

    const cleared = persistence.clearForTraining({
      dateKey: '2026-06-02',
      trainingIndex: 1,
    });

    expect(cleared).toBe(1);
    expect(window.localStorage.getItem(matchingKey)).toBeNull();
    expect(window.localStorage.getItem(otherKey)).not.toBeNull();
  });
});
