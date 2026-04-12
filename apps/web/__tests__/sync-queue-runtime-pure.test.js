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
    expect(result.shouldImmediate).toBe(false);
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
      doImmediateClientUpload: async () => {},
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
});
