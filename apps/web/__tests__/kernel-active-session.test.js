// kernel-active-session.test.js — shared active training-session persistence.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(
  resolve(__dirname, '../_kernel/heys_kernel_active_session_v1.js'),
  'utf8'
);

const CID = '12345678-aaaa-bbbb-cccc-1234567890ab';
const OTHER_CID = '87654321-aaaa-bbbb-cccc-1234567890ab';

const ensureLocalStorage = () => {
  if (typeof window === 'undefined') globalThis.window = globalThis;
  globalThis.localStorage = window.localStorage;
};

function loadKernel(cid = CID) {
  ensureLocalStorage();
  window.HEYS = { currentClientId: cid };
  globalThis.HEYS = window.HEYS;
  // eslint-disable-next-line no-new-func
  new Function(SRC)();
  return window.HEYS.TrainingKernel.activeSession;
}

function createStore(opts = {}) {
  return loadKernel(opts.cid).create({
    keySuffix: opts.keySuffix || 'test_active_session',
    staleMs: opts.staleMs || 60_000,
    debounceMs: opts.debounceMs == null ? 50 : opts.debounceMs,
    matchFn: opts.matchFn
  });
}

describe('TrainingKernel.activeSession', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-17T12:00:00Z'));
    ensureLocalStorage();
    window.localStorage.clear();
    delete window.HEYS;
    delete globalThis.HEYS;
    delete window.__heysSyncCompletedFired;
  });

  afterEach(() => {
    vi.useRealTimers();
    try { window.localStorage.clear(); } catch (_) { /* noop */ }
    delete window.HEYS;
    delete globalThis.HEYS;
    delete window.__heysSyncCompletedFired;
  });

  it('writes local-only client-scoped snapshots with debounce and stale detection', () => {
    const store = createStore({ staleMs: 1_000 });
    store.save({ id: 'fresh', stateEnteredAt: 10 });

    expect(window.localStorage.getItem(`heys_${CID}_test_active_session`)).toBeNull();
    vi.advanceTimersByTime(60);

    const key = `heys_${CID}_test_active_session`;
    expect(JSON.parse(window.localStorage.getItem(key))).toMatchObject({
      id: 'fresh',
      stateEnteredAt: 10
    });
    expect(store.load()).toMatchObject({ stale: false, snapshot: { id: 'fresh' } });

    vi.advanceTimersByTime(1_001);
    expect(store.load()).toMatchObject({ stale: true, snapshot: { id: 'fresh' } });
  });

  it('does not overwrite a newer stateEnteredAt snapshot with an older pending save', () => {
    const store = createStore();
    const key = `heys_${CID}_test_active_session`;

    store.save({ id: 'newer', stateEnteredAt: 200 });
    vi.advanceTimersByTime(60);
    store.save({ id: 'older', stateEnteredAt: 100 });
    vi.advanceTimersByTime(60);

    expect(JSON.parse(window.localStorage.getItem(key))).toMatchObject({
      id: 'newer',
      stateEnteredAt: 200
    });
  });

  it('clearForTraining removes only current-client matching snapshots', () => {
    const store = createStore();
    const current = `heys_${CID}_test_active_session`;
    const foreign = `heys_${OTHER_CID}_test_active_session`;
    const globalKey = 'heys_test_active_session';

    window.localStorage.setItem(current, JSON.stringify({ dateKey: '2026-06-17', trainingIndex: 1 }));
    window.localStorage.setItem(foreign, JSON.stringify({ dateKey: '2026-06-17', trainingIndex: 1 }));
    window.localStorage.setItem(globalKey, JSON.stringify({ dateKey: '2026-06-17', trainingIndex: 1 }));

    expect(store.clearForTraining({ dateKey: '2026-06-17', trainingIndex: 1 })).toBe(1);
    expect(window.localStorage.getItem(current)).toBeNull();
    expect(window.localStorage.getItem(foreign)).not.toBeNull();
    expect(window.localStorage.getItem(globalKey)).not.toBeNull();
  });

  it('treats keySuffix as a literal when matching client-scoped keys', () => {
    const store = createStore({ keySuffix: 'test.active+session' });
    const literalKey = `heys_${CID}_test.active+session`;
    const regexLikeKey = `heys_${CID}_testXactiveeeeesession`;

    window.localStorage.setItem(literalKey, JSON.stringify({ dateKey: '2026-06-17' }));
    window.localStorage.setItem(regexLikeKey, JSON.stringify({ dateKey: '2026-06-17' }));

    expect(store.__isActiveSessionKey(literalKey)).toBe(true);
    expect(store.__isActiveSessionKey(regexLikeKey)).toBe(false);
    expect(store.clearForTraining({ dateKey: '2026-06-17' })).toBe(1);
    expect(window.localStorage.getItem(literalKey)).toBeNull();
    expect(window.localStorage.getItem(regexLikeKey)).not.toBeNull();
  });

  it('detectOnBoot waits for sync event, fires once, and supports already-synced boot', async () => {
    const store = createStore();
    window.localStorage.setItem(`heys_${CID}_test_active_session`, JSON.stringify({
      id: 'resume',
      lastTickAt: Date.now()
    }));
    const callback = vi.fn();

    store.detectOnBoot(callback);
    expect(callback).not.toHaveBeenCalled();
    window.dispatchEvent(new Event('heysSyncCompleted'));
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback.mock.calls[0][0]).toMatchObject({ stale: false, snapshot: { id: 'resume' } });
    window.dispatchEvent(new Event('heysSyncCompleted'));
    expect(callback).toHaveBeenCalledTimes(1);

    delete window.HEYS;
    delete globalThis.HEYS;
    window.__heysSyncCompletedFired = true;
    const alreadySyncedStore = createStore({ keySuffix: 'already_synced_session' });
    window.localStorage.setItem(`heys_${CID}_already_synced_session`, JSON.stringify({
      id: 'already',
      lastTickAt: Date.now()
    }));
    const alreadySynced = vi.fn();
    alreadySyncedStore.detectOnBoot(alreadySynced);
    await Promise.resolve();
    expect(alreadySynced).toHaveBeenCalledWith(expect.objectContaining({
      snapshot: expect.objectContaining({ id: 'already' })
    }));
  });
});
