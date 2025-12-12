/**
 * @fileoverview Quota/cleanup protections for localStorage
 * Критические сценарии переполнения: очистка старых данных, очередей и агрессивный fallback.
 */

import { describe, it, expect, beforeEach } from 'vitest';

const PENDING_QUEUE_KEY = 'heys_pending_queue';
const PENDING_CLIENT_QUEUE_KEY = 'heys_pending_client_queue';
const SYNC_LOG_KEY = 'heys_sync_log';

let cleanupCalls;
let aggressiveCalls;
let removedKeys;
let originalSetItem;
let logMessages;

function logCritical(msg) {
  logMessages.push(msg);
}

function cleanupOldData(daysToKeep = 90) {
  cleanupCalls.push(daysToKeep);
  return 0;
}

function aggressiveCleanup() {
  aggressiveCalls += 1;
}

function makeStorage(failPlan = []) {
  const store = {};
  let call = 0;
  removedKeys = [];
  return {
    store,
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => {
      const step = failPlan[call] ?? 'ok';
      call += 1;
      if (step === 'quota') {
        const err = new Error('QuotaExceeded');
        err.name = 'QuotaExceededError';
        err.code = 22;
        throw err;
      }
      if (step === 'fail') {
        throw new Error('fail');
      }
      store[k] = v;
    },
    removeItem: (k) => {
      removedKeys.push(k);
      delete store[k];
    },
    key: () => null,
    length: 0,
  };
}

function safeSetItem(key, value) {
  const setFn = originalSetItem || global.localStorage.setItem.bind(global.localStorage);
  try {
    setFn(key, value);
    return true;
  } catch (e) {
    if (e.name === 'QuotaExceededError' || e.code === 22) {
      logCritical('⚠️ localStorage переполнен, очищаем старые данные...');
      cleanupOldData();
      try {
        setFn(key, value);
        return true;
      } catch (e2) {
        global.localStorage.removeItem(PENDING_QUEUE_KEY);
        global.localStorage.removeItem(PENDING_CLIENT_QUEUE_KEY);
        global.localStorage.removeItem(SYNC_LOG_KEY);
        try {
          setFn(key, value);
          return true;
        } catch (e3) {
          aggressiveCleanup();
          try {
            setFn(key, value);
            return true;
          } catch (e4) {
            logCritical('❌ Не удалось сохранить данные: storage критически переполнен');
            return false;
          }
        }
      }
    }
    return false;
  }
}

describe('storage quota protections', () => {
  beforeEach(() => {
    cleanupCalls = [];
    aggressiveCalls = 0;
    removedKeys = [];
    logMessages = [];
    originalSetItem = undefined;
  });

  it('успешно сохраняет после cleanupOldData при первом QuotaExceeded', () => {
    global.localStorage = makeStorage(['quota', 'ok']);

    const result = safeSetItem('k', 'v');

    expect(result).toBe(true);
    expect(cleanupCalls).toEqual([90]);
    expect(aggressiveCalls).toBe(0);
    expect(removedKeys).toEqual([]);
  });

  it('после очистки очередей сохраняет без агрессивного режима', () => {
    global.localStorage = makeStorage(['quota', 'quota', 'ok']);

    const result = safeSetItem('k', 'v');

    expect(result).toBe(true);
    expect(cleanupCalls).toEqual([90]);
    expect(removedKeys).toEqual([
      PENDING_QUEUE_KEY,
      PENDING_CLIENT_QUEUE_KEY,
      SYNC_LOG_KEY,
    ]);
    expect(aggressiveCalls).toBe(0);
  });

  it('возвращает false после агрессивной очистки при многократном переполнении', () => {
    global.localStorage = makeStorage(['quota', 'quota', 'quota', 'quota']);

    const result = safeSetItem('k', 'v');

    expect(result).toBe(false);
    expect(cleanupCalls).toEqual([90]);
    expect(removedKeys).toEqual([
      PENDING_QUEUE_KEY,
      PENDING_CLIENT_QUEUE_KEY,
      SYNC_LOG_KEY,
    ]);
    expect(aggressiveCalls).toBe(1);
    expect(logMessages.at(-1)).toContain('storage критически переполнен');
  });
});
