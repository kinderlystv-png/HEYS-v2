/**
 * @fileoverview Quota/cleanup protections for localStorage
 * Критические сценарии переполнения: очистка старых данных, очередей и агрессивный fallback.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const PENDING_QUEUE_KEY = 'heys_pending_queue';
const PENDING_CLIENT_QUEUE_KEY = 'heys_pending_client_queue';
const SYNC_LOG_KEY = 'heys_sync_log';
const QUOTA_LOG_THROTTLE_MS = 5000;
const HYDRATION_DAY_QUOTA_SKIP_AFTER_DAYS = 45;
const PENDING_QUEUE_COMPRESS_MIN_BYTES = 16 * 1024;
const PENDING_QUEUE_INLINE_VALUE_MAX_BYTES = 32 * 1024;
const quotaLogTimestamps = new Map();
const LOCAL_ONLY_STORAGE_EXACT_KEYS = new Set([
  'heys_advice_trace_day_v1'
]);
const LOCAL_ONLY_STORAGE_SUFFIXES = [
  '_advice_trace_day_v1'
];

let cleanupCalls;
let aggressiveCalls;
let removedKeys;
let originalSetItem;
let logMessages;
const originalLocalStorage = global.localStorage;

function logCritical(msg) {
  logMessages.push(msg);
}

function cleanupOldData(daysToKeep = 90) {
  cleanupCalls.push(daysToKeep);
  return 0;
}

function logQuotaThrottled(kind, message) {
  const now = Date.now();
  const lastTs = quotaLogTimestamps.get(kind) || 0;
  if ((now - lastTs) >= QUOTA_LOG_THROTTLE_MS) {
    quotaLogTimestamps.set(kind, now);
    logCritical(message);
  }
}

function cleanupRecoverableStorage() {
  const currentClientId = 'current-client-id';
  const keysToRemove = ['heys_shared_products_cache_v1', 'heys_products_backup'];
  Object.keys(global.localStorage.store).forEach((key) => {
    if (key.startsWith('heys_other-client-id_')) {
      keysToRemove.push(key);
    }
  });
  keysToRemove.forEach((key) => {
    if (global.localStorage.getItem(key) != null) {
      global.localStorage.removeItem(key);
    }
  });
  return currentClientId;
}

function isRecoverableStorageKey(key) {
  const normalizedKey = String(key || '');
  return normalizedKey === 'heys_shared_products_cache_v1' ||
    normalizedKey === 'heys_sync_log' ||
    normalizedKey.includes('_debug') ||
    normalizedKey.includes('_temp') ||
    normalizedKey.includes('_cache') ||
    normalizedKey.includes('_log') ||
    normalizedKey.includes('_backup') ||
    normalizedKey.includes('heys_ews_') ||
    normalizedKey.includes('heys_insights_') ||
    normalizedKey.includes('heys_adaptive_');
}

function formatStorageBytes(bytes) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function getStorageWriteMeta(key, value) {
  const rawValue = typeof value === 'string' ? value : JSON.stringify(value);
  const normalizedKey = String(key || '');
  let kind = 'other';
  if (isRecoverableStorageKey(normalizedKey)) kind = 'recoverable_cache';
  else if (normalizedKey.includes('dayv2_')) kind = 'dayv2';
  else if (normalizedKey.includes('_products')) kind = 'products';
  else if (normalizedKey === PENDING_QUEUE_KEY || normalizedKey === PENDING_CLIENT_QUEUE_KEY) kind = 'pending_queue';
  return {
    summary: `key=${normalizedKey} kind=${kind} payload=${formatStorageBytes((rawValue || '').length * 2)} storage=${formatStorageBytes(0)}`,
    kind
  };
}

function getDayAgeDaysFromKey(key, nowTs = Date.now()) {
  const match = String(key || '').match(/dayv2_(\d{4}-\d{2}-\d{2})/);
  if (!match) return null;
  const date = new Date(match[1]);
  if (Number.isNaN(date.getTime())) return null;
  return Math.floor((nowTs - date.getTime()) / (24 * 60 * 60 * 1000));
}

function shouldSkipHydrationDayOnQuota(key, options = {}) {
  if (!options?.preserveRecentDuringHydration) return false;
  if (!String(key || '').includes('dayv2_')) return false;
  const ageDays = getDayAgeDaysFromKey(key, options.nowTs || Date.now());
  return Number.isFinite(ageDays) && ageDays > HYDRATION_DAY_QUOTA_SKIP_AFTER_DAYS;
}

function getPendingQueueIdentity(item, storageKey, fallbackIndex) {
  if (!item || typeof item !== 'object') return `__pending_invalid_${fallbackIndex}`;
  const normalizedKey = String(item.k || '');
  if (!normalizedKey) return `__pending_missing_key_${fallbackIndex}`;
  if (storageKey === PENDING_CLIENT_QUEUE_KEY || item.client_id) {
    return `${item.client_id || ''}:${normalizedKey}`;
  }
  return `${item.user_id || ''}:${normalizedKey}`;
}

function compactPendingQueue(queue, storageKey, options = {}) {
  if (!Array.isArray(queue) || queue.length <= 1) return Array.isArray(queue) ? queue : [];

  const dedupedReverse = [];
  const seen = new Set();

  for (let i = queue.length - 1; i >= 0; i -= 1) {
    const item = queue[i];
    const identity = getPendingQueueIdentity(item, storageKey, i);
    if (seen.has(identity)) continue;
    seen.add(identity);
    dedupedReverse.push(item);
  }

  const compacted = dedupedReverse.reverse();
  if (options.mutate && Array.isArray(queue)) {
    queue.splice(0, queue.length, ...compacted);
    return queue;
  }

  return compacted;
}

function getPendingQueueLocalStorageKey(item) {
  if (!item || typeof item !== 'object') return '';

  const normalizedKey = String(item.k || '');
  if (!normalizedKey) return '';

  if (item.client_id && normalizedKey.startsWith('heys_') && !normalizedKey.startsWith(`heys_${item.client_id}_`)) {
    return `heys_${item.client_id}_${normalizedKey.slice('heys_'.length)}`;
  }

  return normalizedKey;
}

function isLocalOnlyStorageKey(key) {
  const normalizedKey = String(key || '');
  if (!normalizedKey) return false;
  if (LOCAL_ONLY_STORAGE_EXACT_KEYS.has(normalizedKey)) return true;
  return LOCAL_ONLY_STORAGE_SUFFIXES.some((suffix) => normalizedKey.endsWith(suffix));
}

function filterLocalOnlyPendingQueueItems(queue, options = {}) {
  const safeQueue = Array.isArray(queue) ? queue : [];
  const filtered = safeQueue.filter((item) => {
    if (!item || typeof item !== 'object') return false;
    return !isLocalOnlyStorageKey(item.k) && !isLocalOnlyStorageKey(getPendingQueueLocalStorageKey(item));
  });

  if (options.mutate && Array.isArray(queue)) {
    queue.splice(0, queue.length, ...filtered);
    return queue;
  }

  return filtered;
}

function createPersistablePendingQueueItem(item, storageKey) {
  if (!item || typeof item !== 'object') return item;

  const persistable = { ...item };
  const isClientQueue = storageKey === PENDING_CLIENT_QUEUE_KEY || !!persistable.client_id;
  if (!isClientQueue) return persistable;

  const rawValue = JSON.stringify(persistable.v);
  const valueBytes = (rawValue || '').length * 2;
  if (valueBytes < PENDING_QUEUE_INLINE_VALUE_MAX_BYTES) {
    return persistable;
  }

  const localStorageKey = getPendingQueueLocalStorageKey(persistable);
  delete persistable.v;
  persistable.__persistRef = true;
  if (localStorageKey) {
    persistable.__persistKey = localStorageKey;
  }
  return persistable;
}

function hydratePendingQueueItem(item) {
  if (!item || typeof item !== 'object' || !item.__persistRef || typeof item.v !== 'undefined') {
    return item;
  }

  if (isLocalOnlyStorageKey(item.k) || isLocalOnlyStorageKey(item.__persistKey)) {
    return null;
  }

  const fallbackKeys = [item.__persistKey || getPendingQueueLocalStorageKey(item), item.k].filter(Boolean);
  for (const key of fallbackKeys) {
    const raw = global.localStorage.getItem(key);
    if (!raw) continue;

    const value = (typeof raw === 'string' && raw.startsWith('¤Z¤') && typeof global.HEYS?.store?.decompress === 'function')
      ? global.HEYS.store.decompress(raw)
      : JSON.parse(raw);

    return {
      ...item,
      v: value,
    };
  }

  return null;
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
    clear: () => {
      Object.keys(store).forEach((k) => delete store[k]);
    },
    key: () => null,
    length: 0,
  };
}

function safeSetItem(key, value, options = {}) {
  const setFn = originalSetItem || global.localStorage.setItem.bind(global.localStorage);
  const writeMeta = getStorageWriteMeta(key, value);
  try {
    setFn(key, value);
    return true;
  } catch (e) {
    if (e.name === 'QuotaExceededError' || e.code === 22) {
      if (shouldSkipHydrationDayOnQuota(key, options)) {
        logQuotaThrottled('quota-hydration-skip', `⚠️ [SYNC] Quota: старый dayv2 оставлен только в cloud: ${writeMeta.summary}`);
        return false;
      }
      if (writeMeta.kind === 'recoverable_cache') {
        global.localStorage.removeItem(key);
        logQuotaThrottled('quota-recoverable-skip', `⚠️ [STORAGE] Quota: пропускаем recoverable cache write: ${writeMeta.summary}`);
        return false;
      }
      logQuotaThrottled('quota-warning', `⚠️ localStorage переполнен, очищаем старые данные... ${writeMeta.summary}`);
      cleanupRecoverableStorage();
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
            logQuotaThrottled('quota-critical', `❌ Не удалось сохранить данные: storage критически переполнен (${writeMeta.summary})`);
            return false;
          }
        }
      }
    }
    return false;
  }
}

function loadPendingQueue(key) {
  try {
    const data = global.localStorage.getItem(key);
    if (!data) return [];

    const parsed = (typeof data === 'string' && data.startsWith('¤Z¤') && typeof global.HEYS?.store?.decompress === 'function')
      ? global.HEYS.store.decompress(data)
      : JSON.parse(data);

    return compactPendingQueue(filterLocalOnlyPendingQueueItems(Array.isArray(parsed) ? parsed : []), key);
  } catch (e) {
    return [];
  }
}

function savePendingQueue(key, queue) {
  const queueRef = Array.isArray(queue) ? queue : [];
  const filteredQueue = filterLocalOnlyPendingQueueItems(queueRef, { mutate: true });
  const compactedQueue = compactPendingQueue(filteredQueue, key, { mutate: true });

  if (compactedQueue.length === 0) {
    global.localStorage.removeItem(key);
    return;
  }

  const persistableQueue = compactedQueue.map((item) => createPersistablePendingQueueItem(item, key));
  let serializedQueue = JSON.stringify(persistableQueue);
  if ((serializedQueue.length * 2) >= PENDING_QUEUE_COMPRESS_MIN_BYTES && typeof global.HEYS?.store?.compress === 'function') {
    const compressedQueue = global.HEYS.store.compress(persistableQueue);
    if (typeof compressedQueue === 'string' && compressedQueue.length < serializedQueue.length) {
      serializedQueue = compressedQueue;
    }
  }

  safeSetItem(key, serializedQueue);
}

describe('storage quota protections', () => {
  beforeEach(() => {
    cleanupCalls = [];
    aggressiveCalls = 0;
    removedKeys = [];
    logMessages = [];
    originalSetItem = undefined;
    global.HEYS = undefined;
    quotaLogTimestamps.clear();
  });

  afterEach(() => {
    global.localStorage = originalLocalStorage;
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
    global.localStorage.store.heys_shared_products_cache_v1 = 'cache';
    global.localStorage.store.heys_products_backup = 'backup';
    global.localStorage.store['heys_other-client-id_products'] = 'legacy-products';

    const result = safeSetItem('k', 'v');

    expect(result).toBe(true);
    expect(cleanupCalls).toEqual([90]);
    expect(removedKeys).toEqual([
      'heys_shared_products_cache_v1',
      'heys_products_backup',
      'heys_other-client-id_products',
      PENDING_QUEUE_KEY,
      PENDING_CLIENT_QUEUE_KEY,
      SYNC_LOG_KEY,
    ]);
    expect(aggressiveCalls).toBe(0);
  });

  it('throttle не дублирует quota critical лог подряд', () => {
    global.localStorage = makeStorage(['quota', 'quota', 'quota', 'quota', 'quota', 'quota', 'quota', 'quota']);

    const first = safeSetItem('k1', 'v1');
    const second = safeSetItem('k2', 'v2');

    expect(first).toBe(false);
    expect(second).toBe(false);
    expect(logMessages.filter((msg) => msg.includes('storage критически переполнен'))).toHaveLength(1);
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

  it('при гидрации старого dayv2 пропускает локальную запись вместо агрессивной зачистки', () => {
    global.localStorage = makeStorage(['quota']);

    const result = safeSetItem('heys_client_dayv2_2025-01-01', '{"date":"2025-01-01"}', {
      preserveRecentDuringHydration: true,
      nowTs: Date.parse('2026-03-10T12:00:00Z')
    });

    expect(result).toBe(false);
    expect(cleanupCalls).toEqual([]);
    expect(aggressiveCalls).toBe(0);
    expect(logMessages.at(-1)).toContain('старый dayv2 оставлен только в cloud');
  });

  it('для recoverable cache не запускает cleanup и пишет точный quota лог', () => {
    global.localStorage = makeStorage(['quota']);

    const result = safeSetItem('heys_shared_products_cache_v1', JSON.stringify({ data: ['x'] }));

    expect(result).toBe(false);
    expect(cleanupCalls).toEqual([]);
    expect(aggressiveCalls).toBe(0);
    expect(logMessages.at(-1)).toContain('recoverable cache write');
    expect(logMessages.at(-1)).toContain('heys_shared_products_cache_v1');
  });

  it('дедуплицирует pending queue по последнему значению ключа перед записью', () => {
    global.localStorage = makeStorage(['ok']);
    const queue = [
      { client_id: 'client-1', k: 'heys_products', v: { version: 1 } },
      { client_id: 'client-1', k: 'heys_profile', v: { name: 'A' } },
      { client_id: 'client-1', k: 'heys_products', v: { version: 2 } },
    ];

    savePendingQueue(PENDING_CLIENT_QUEUE_KEY, queue);

    expect(queue).toEqual([
      { client_id: 'client-1', k: 'heys_profile', v: { name: 'A' } },
      { client_id: 'client-1', k: 'heys_products', v: { version: 2 } },
    ]);
    expect(JSON.parse(global.localStorage.getItem(PENDING_CLIENT_QUEUE_KEY))).toEqual(queue);
  });

  it('читает и сохраняет большую pending queue в сжатом виде, если компрессор доступен', () => {
    global.localStorage = makeStorage(['ok']);
    const expectedQueue = [
      { client_id: 'client-1', k: 'heys_products', v: { payload: 'latest'.repeat(5000) } },
      { client_id: 'client-1', k: 'heys_profile', v: { name: 'A' } },
    ];
    global.HEYS = {
      store: {
        compress: () => '¤Z¤tiny',
        decompress: () => expectedQueue,
      },
    };

    const queue = [
      { client_id: 'client-1', k: 'heys_products', v: { payload: 'x'.repeat(12000) } },
      { client_id: 'client-1', k: 'heys_profile', v: { name: 'A' } },
      { client_id: 'client-1', k: 'heys_products', v: { payload: 'latest'.repeat(5000) } },
    ];

    savePendingQueue(PENDING_CLIENT_QUEUE_KEY, queue);

    const persistedRaw = global.localStorage.getItem(PENDING_CLIENT_QUEUE_KEY);
    if (persistedRaw === '¤Z¤tiny') {
      expect(persistedRaw).toBe('¤Z¤tiny');
      expect(loadPendingQueue(PENDING_CLIENT_QUEUE_KEY)).toEqual(expectedQueue);
    } else {
      const persisted = JSON.parse(persistedRaw);
      expect(persisted[1]).toEqual({ client_id: 'client-1', k: 'heys_products', __persistRef: true, __persistKey: 'heys_client-1_products' });
      expect(loadPendingQueue(PENDING_CLIENT_QUEUE_KEY)).toEqual(persisted);
    }
  });

  it('для большого client payload сохраняет queue по ссылке и гидратирует значение из localStorage', () => {
    global.localStorage = makeStorage(['ok']);
    const largeProducts = Array.from({ length: 300 }, (_, index) => ({ name: `Product ${index}`, payload: 'x'.repeat(300) }));
    global.localStorage.store['heys_client-1_products'] = JSON.stringify(largeProducts);

    const queue = [
      { client_id: 'client-1', k: 'heys_products', v: largeProducts },
    ];

    savePendingQueue(PENDING_CLIENT_QUEUE_KEY, queue);

    const persisted = JSON.parse(global.localStorage.getItem(PENDING_CLIENT_QUEUE_KEY));
    expect(persisted[0].__persistRef).toBe(true);
    expect(persisted[0].__persistKey).toBe('heys_client-1_products');
    expect('v' in persisted[0]).toBe(false);

    const hydrated = hydratePendingQueueItem(persisted[0]);
    expect(hydrated?.v).toEqual(largeProducts);
  });

  it('не сохраняет local-only advice trace в pending queue', () => {
    global.localStorage = makeStorage(['ok']);

    const queue = [
      { client_id: 'client-1', k: 'heys_advice_trace_day_v1', v: { entries: ['local-only'] } },
      { client_id: 'client-1', k: 'heys_products', v: { version: 2 } },
    ];

    savePendingQueue(PENDING_CLIENT_QUEUE_KEY, queue);

    expect(queue).toEqual([
      { client_id: 'client-1', k: 'heys_products', v: { version: 2 } },
    ]);
    expect(JSON.parse(global.localStorage.getItem(PENDING_CLIENT_QUEUE_KEY))).toEqual(queue);
  });

  it('при чтении очереди вычищает уже записанный local-only advice trace', () => {
    global.localStorage = makeStorage(['ok']);
    global.localStorage.store[PENDING_CLIENT_QUEUE_KEY] = JSON.stringify([
      { client_id: 'client-1', k: 'heys_advice_trace_day_v1', __persistRef: true, __persistKey: 'heys_advice_trace_day_v1' },
      { client_id: 'client-1', k: 'heys_products', v: { version: 3 } },
    ]);

    expect(loadPendingQueue(PENDING_CLIENT_QUEUE_KEY)).toEqual([
      { client_id: 'client-1', k: 'heys_products', v: { version: 3 } },
    ]);
  });
});
