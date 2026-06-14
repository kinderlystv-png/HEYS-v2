import fs from 'fs';
import path from 'path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const originalHEYS = global.HEYS;

function loadModule() {
  const srcPath = path.resolve(__dirname, '../heys_sync_queue_runtime_pure_v1.js');
  const source = fs.readFileSync(srcPath, 'utf8');
  eval(source);
}

describe('HEYS.syncQueueRuntimePure', () => {
  afterEach(() => {
    global.HEYS = originalHEYS;
    vi.restoreAllMocks();
  });

  it('does not schedule retry for auth errors', () => {
    global.HEYS = {};
    loadModule();
    const { shouldScheduleRetryAfterRpcError } = global.HEYS.syncQueueRuntimePure;

    expect(
      shouldScheduleRetryAfterRpcError({
        isAuthError: true,
        retryAttempt: 1,
        maxRetryAttempts: 5,
      }),
    ).toBe(false);
  });

  it('enqueueClientSave persists queue and schedules push immediately', () => {
    global.HEYS = {};
    loadModule();
    const { enqueueClientSave } = global.HEYS.syncQueueRuntimePure;

    const queue = [];
    const persistQueue = vi.fn();
    const notifyPendingChange = vi.fn();
    const scheduleClientPush = vi.fn();

    const result = enqueueClientSave({
      queue,
      item: { k: 'heys_profile', v: { name: 'A' } },
      normalizedKey: 'heys_profile',
      waitingForSync: true,
      isOnline: true,
      persistQueue,
      notifyPendingChange,
      scheduleClientPush,
      doImmediateClientUpload: vi.fn(),
    });

    expect(queue).toHaveLength(1);
    expect(persistQueue).toHaveBeenCalledTimes(1);
    expect(notifyPendingChange).toHaveBeenCalledTimes(1);
    expect(scheduleClientPush).toHaveBeenCalledTimes(1);
    expect(scheduleClientPush).toHaveBeenCalledWith({ __fromEnqueue: true });
    expect(result.shouldImmediate).toBe(false);
  });

  it('enqueueClientSave compacts duplicate client identities when pendingQueueStorageKey is set', () => {
    global.HEYS = {};
    const pqPath = path.resolve(__dirname, '../heys_pending_queue_pure_v1.js');
    eval(fs.readFileSync(pqPath, 'utf8'));
    loadModule();
    const { enqueueClientSave } = global.HEYS.syncQueueRuntimePure;
    const { PENDING_CLIENT_QUEUE_KEY } = global.HEYS.pendingQueuePure;

    const queue = [];
    const persistQueue = vi.fn();

    enqueueClientSave({
      queue,
      item: { client_id: 'c1', k: 'heys_cascade_dcs_v9', v: { a: 1 } },
      normalizedKey: 'heys_cascade_dcs_v9',
      waitingForSync: true,
      isOnline: true,
      pendingQueueStorageKey: PENDING_CLIENT_QUEUE_KEY,
      persistQueue,
      notifyPendingChange: vi.fn(),
      scheduleClientPush: vi.fn(),
      doImmediateClientUpload: vi.fn(),
    });

    enqueueClientSave({
      queue,
      item: { client_id: 'c1', k: 'heys_cascade_dcs_v9', v: { a: 2 } },
      normalizedKey: 'heys_cascade_dcs_v9',
      waitingForSync: true,
      isOnline: true,
      pendingQueueStorageKey: PENDING_CLIENT_QUEUE_KEY,
      persistQueue,
      notifyPendingChange: vi.fn(),
      scheduleClientPush: vi.fn(),
      doImmediateClientUpload: vi.fn(),
    });

    expect(queue).toHaveLength(1);
    expect(queue[0].v).toEqual({ a: 2 });
    expect(persistQueue).toHaveBeenCalled();
  });

  it('enqueueClientSave triggers immediate upload for critical keys when online', () => {
    global.HEYS = {};
    loadModule();
    const { enqueueClientSave } = global.HEYS.syncQueueRuntimePure;

    const queue = [];
    const doImmediateClientUpload = vi.fn(() => Promise.resolve());

    const result = enqueueClientSave({
      queue,
      item: { k: 'heys_dayv2_2026-04-12', v: { meals: [] } },
      normalizedKey: 'heys_dayv2_2026-04-12',
      waitingForSync: false,
      isOnline: true,
      persistQueue: vi.fn(),
      notifyPendingChange: vi.fn(),
      scheduleClientPush: vi.fn(),
      doImmediateClientUpload,
      onImmediateUploadError: vi.fn(),
    });

    expect(result.shouldImmediate).toBe(true);
    expect(doImmediateClientUpload).toHaveBeenCalledTimes(1);
  });

  it('enqueueClientSave treats planning chrono keys as immediate critical writes', () => {
    global.HEYS = {};
    loadModule();
    const { enqueueClientSave } = global.HEYS.syncQueueRuntimePure;

    const queue = [];
    const doImmediateClientUpload = vi.fn(() => Promise.resolve());

    const result = enqueueClientSave({
      queue,
      item: { k: 'heys_planning_chrono_activities', v: [] },
      normalizedKey: 'heys_planning_chrono_activities',
      waitingForSync: false,
      isOnline: true,
      persistQueue: vi.fn(),
      notifyPendingChange: vi.fn(),
      scheduleClientPush: vi.fn(),
      doImmediateClientUpload,
      onImmediateUploadError: vi.fn(),
    });

    expect(result.shouldImmediate).toBe(true);
    expect(doImmediateClientUpload).toHaveBeenCalledTimes(1);
  });

  it('restorePersistentQueueState rehydrates in-flight batch after reload', () => {
    global.HEYS = {};
    loadModule();
    const { restorePersistentQueueState } = global.HEYS.syncQueueRuntimePure;

    const result = restorePersistentQueueState({
      queue: [{ client_id: 'c1', k: 'heys_profile', v: { name: 'new' } }],
      inFlightQueue: [{ client_id: 'c1', k: 'heys_dayv2_2026-04-21', v: { meals: [{ id: 1 }] } }],
      compactQueue: (items) => items,
    });

    expect(result.restoredCount).toBe(1);
    expect(result.queue).toHaveLength(2);
    expect(result.queue[0].k).toBe('heys_dayv2_2026-04-21');
  });

  it('restorePersistentQueueState also rehydrates generic user-level in-flight batches', () => {
    global.HEYS = {};
    loadModule();
    const { restorePersistentQueueState } = global.HEYS.syncQueueRuntimePure;

    const result = restorePersistentQueueState({
      queue: [{ user_id: 'u1', k: 'heys_profile', v: { firstName: 'New' } }],
      inFlightQueue: [{ user_id: 'u1', k: 'heys_widget_layout_v1', v: { widgets: [{ id: 'water' }] } }],
      compactQueue: (items) => {
        const seen = new Map();
        items.forEach((item) => seen.set(`${item.user_id}:${item.k}`, item));
        return Array.from(seen.values());
      },
    });

    expect(result.restoredCount).toBe(1);
    expect(result.queue).toHaveLength(2);
    expect(result.queue[0].k).toBe('heys_widget_layout_v1');
  });

  it('requeueInFlightBatch keeps newer queued write over older in-flight value', () => {
    global.HEYS = {};
    loadModule();
    const { requeueInFlightBatch } = global.HEYS.syncQueueRuntimePure;

    const result = requeueInFlightBatch({
      batch: [{ client_id: 'c1', k: 'heys_profile', v: { name: 'old' } }],
      queue: [{ client_id: 'c1', k: 'heys_profile', v: { name: 'new' } }],
      compactQueue: (items) => {
        const seen = new Map();
        items.forEach((item) => seen.set(`${item.client_id}:${item.k}`, item));
        return Array.from(seen.values());
      },
    });

    expect(result).toHaveLength(1);
    expect(result[0].v).toEqual({ name: 'new' });
  });

  it('requeueInFlightBatch keeps newer queued user-level write over older in-flight value', () => {
    global.HEYS = {};
    loadModule();
    const { requeueInFlightBatch } = global.HEYS.syncQueueRuntimePure;

    const result = requeueInFlightBatch({
      batch: [{ user_id: 'u1', k: 'heys_profile', v: { theme: 'old' } }],
      queue: [{ user_id: 'u1', k: 'heys_profile', v: { theme: 'new' } }],
      compactQueue: (items) => {
        const seen = new Map();
        items.forEach((item) => seen.set(`${item.user_id}:${item.k}`, item));
        return Array.from(seen.values());
      },
    });

    expect(result).toHaveLength(1);
    expect(result[0].v).toEqual({ theme: 'new' });
  });

  it('getSyncStatusForKey treats in-flight key as pending', () => {
    global.HEYS = {};
    loadModule();
    const { getSyncStatusForKey } = global.HEYS.syncQueueRuntimePure;

    expect(
      getSyncStatusForKey({
        key: 'heys_dayv2_2026-04-21',
        queue: [],
        inFlightQueue: [{ k: 'heys_dayv2_2026-04-21', v: {} }],
      }),
    ).toBe('pending');
  });

  it('flushPendingQueueCore resolves true after immediate upload drains queue', async () => {
    global.HEYS = {};
    loadModule();
    const { flushPendingQueueCore } = global.HEYS.syncQueueRuntimePure;

    const state = { queueLen: 2, inFlight: 0, uploadInProgress: false };
    const result = await flushPendingQueueCore({
      timeoutMs: 100,
      getSnapshot: () => ({ ...state }),
      doImmediateClientUpload: async () => {
        state.queueLen = 0;
      },
      getPendingCount: () => state.queueLen + state.inFlight,
      addQueueDrainedListener: vi.fn(),
      removeQueueDrainedListener: vi.fn(),
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (id) => clearTimeout(id),
    });

    expect(result).toBe(true);
    expect(state.queueLen).toBe(0);
  });

  it('flushPendingQueueCore returns false on timeout when queue stays non-empty', async () => {
    global.HEYS = {};
    loadModule();
    const { flushPendingQueueCore } = global.HEYS.syncQueueRuntimePure;

    const listeners = [];
    const state = { queueLen: 1, inFlight: 0, uploadInProgress: false };

    const result = await flushPendingQueueCore({
      timeoutMs: 20,
      getSnapshot: () => ({ ...state }),
      doImmediateClientUpload: async () => { },
      getPendingCount: () => 1,
      addQueueDrainedListener: (handler) => listeners.push(handler),
      removeQueueDrainedListener: vi.fn(),
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (id) => clearTimeout(id),
      now: () => Date.now(),
      onLog: vi.fn(),
    });

    expect(result).toBe(false);
    expect(listeners.length).toBe(1);
  });

  describe('shouldApplyByRevision (L3 pull-side gate)', () => {
    function gate() {
      global.HEYS = {};
      loadModule();
      return global.HEYS.syncQueueRuntimePure.shouldApplyByRevision;
    }

    it('applies when remote revision is strictly newer', () => {
      expect(gate()({ remoteRevision: 5, localRevision: 3 })).toBe(true);
    });

    it('skips when remote revision was already seen (equal)', () => {
      expect(gate()({ remoteRevision: 5, localRevision: 5 })).toBe(false);
    });

    it('skips when remote revision is older than what we applied', () => {
      expect(gate()({ remoteRevision: 2, localRevision: 5 })).toBe(false);
    });

    it('applies when the key has never been seen locally (undefined local)', () => {
      expect(gate()({ remoteRevision: 7, localRevision: undefined })).toBe(true);
    });

    it('falls back to apply when remote revision is absent (deploy-lag / old row)', () => {
      const shouldApply = gate();
      expect(shouldApply({ remoteRevision: undefined, localRevision: 9 })).toBe(true);
      expect(shouldApply({ remoteRevision: null, localRevision: 9 })).toBe(true);
      expect(shouldApply({ remoteRevision: 0, localRevision: 9 })).toBe(true);
    });

    it('blocks no-revision pulls after the rollout gate requires server revisions', () => {
      const shouldApply = gate();
      expect(shouldApply({ remoteRevision: undefined, localRevision: 9, requireRemoteRevision: true })).toBe(false);
      expect(shouldApply({ remoteRevision: null, localRevision: 9, requireRemoteRevision: true })).toBe(false);
      expect(shouldApply({ remoteRevision: 0, localRevision: 9, requireRemoteRevision: true })).toBe(false);
    });

    it('still allows first hydration without a known local revision', () => {
      const shouldApply = gate();
      expect(shouldApply({ remoteRevision: undefined, localRevision: undefined, requireRemoteRevision: true })).toBe(true);
      expect(shouldApply({ remoteRevision: 0, localRevision: 0, requireRemoteRevision: true })).toBe(true);
    });

    it('is robust to missing params', () => {
      const shouldApply = gate();
      expect(shouldApply({})).toBe(true);
      expect(shouldApply()).toBe(true);
    });
  });
});
