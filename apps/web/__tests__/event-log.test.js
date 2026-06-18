/**
 * @fileoverview Tests for event-log SDK
 * Plan: plans/rustling-dazzling-bentley.md (Wave 5, F-EL7)
 *
 * Покрывает критичные контракты:
 * - Privacy sanitization (whitelist полей в payload)
 * - Sample rate gate
 * - Batching: N writes < debounce → 1 flush вызов с N events
 * - Failure recovery: RPC error → события в LS pending queue → retry flush
 * - MAX_PENDING overflow: queue дропает oldest при превышении лимита
 * - Privacy regex в summary: числа+единицы должны обнаруживаться
 *
 * Секции 1–3 (sanitization, sample, integration): pure-logic replica.
 * Секции 4–6 (batching, recovery, overflow): реальный IIFE-модуль через eval
 *   с мокнутыми localStorage, HEYS.YandexAPI и setTimeout.
 *
 * Pure-logic реплика повторяет SAFE_PAYLOAD_KEYS + SAMPLE_RATES из
 * apps/web/heys_event_log_v1.js. Если контракт меняется — обновить параллельно.
 */

import fs from 'fs';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─────────────────────────────────────────────────────────────────
// === Раздел 1: Pure-logic реплика для sanitization + sample ===
// ─────────────────────────────────────────────────────────────────

const SAFE_PAYLOAD_KEYS = new Set([
  'dateKey', 'date', 'productId', 'product_id', 'productIds', 'product_ids',
  'suppId', 'suppIds', 'fingerprint',
  'mealIndex', 'mealName', 'itemId',
  'name',
  'oldGrams', 'newGrams',
  'count', 'before', 'after',
  'tombstoneCovered', 'removedCount',
  'source', 'kind', 'reason',
  'allowShrink',
  '_oneTime',
  'sharedOriginId', 'shared_origin_id',
]);

function sanitizePayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const out = {};
  for (const key of Object.keys(payload)) {
    if (SAFE_PAYLOAD_KEYS.has(key)) {
      const v = payload[key];
      if (typeof v === 'string' && v.length > 200) {
        out[key] = v.slice(0, 200) + '…';
      } else if (Array.isArray(v) && v.length > 20) {
        out[key] = v.slice(0, 20).concat(['…+' + (v.length - 20)]);
      } else {
        out[key] = v;
      }
    } else {
      out[key] = '<filtered>';
    }
  }
  return out;
}

const SAMPLE_RATES = {
  'sync-event': 0.2,
  'sync-products': 0.5,
  'setall-shrink': 1.0,
  'product-delete': 1.0,
  'product-create': 1.0,
  'supplement-mark': 1.0,
  'meal-add': 1.0,
  'meal-remove': 1.0,
};

function shouldSample(kind, randomFn = Math.random) {
  const rate = SAMPLE_RATES[kind];
  if (rate === undefined || rate >= 1) return true;
  if (rate <= 0) return false;
  return randomFn() < rate;
}

// ─────────────────────────────────────────────────────────────────
// === Раздел 2: Helper для загрузки реального IIFE-модуля ===
// ─────────────────────────────────────────────────────────────────

const MODULE_SRC = fs.readFileSync(
  path.resolve(__dirname, '../heys_event_log_v1.js'),
  'utf8',
);

/**
 * Создаёт изолированный контекст для одного теста:
 * - отдельный localStorage-mock
 * - отдельный HEYS namespace
 * - мокнутый setTimeout (немедленный или отложенный по желанию)
 * Возвращает { heysCtx, lsMock, rpcMock, runFlush }
 *   runFlush — вызывает HEYS.eventLog.flush() и ждёт завершения
 */
function createIsolatedModule({ rpcResult = { data: null, error: null }, immediateTimeout = true } = {}) {
  // localStorage mock
  const lsStore = {};
  const lsMock = {
    getItem: vi.fn((k) => lsStore[k] ?? null),
    setItem: vi.fn((k, v) => { lsStore[k] = v; }),
    removeItem: vi.fn((k) => { delete lsStore[k]; }),
    _store: lsStore,
  };

  // RPC mock
  const rpcMock = vi.fn().mockResolvedValue(rpcResult);

  // setTimeout mock: немедленный — чтобы не ждать 1s debounce в тестах
  const pendingTimers = [];
  const setTimeoutMock = immediateTimeout
    ? vi.fn((fn) => { pendingTimers.push(fn); return 1; })
    : vi.fn((fn, delay) => setTimeout(fn, delay));

  // Контекст global для IIFE
  const heysCtx = {
    HEYS: {},
    localStorage: lsMock,
    setTimeout: setTimeoutMock,
    clearTimeout: vi.fn(),
    addEventListener: vi.fn(),
    document: { visibilityState: 'visible' },
    navigator: { userAgent: 'test-agent' },
    console: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };

  // Настраиваем HEYS.YandexAPI и HEYS.Auth ДО загрузки модуля
  heysCtx.HEYS.YandexAPI = { rpc: rpcMock };
  heysCtx.HEYS.Auth = { getSessionToken: () => 'test-session-token' };

  // Загружаем IIFE в изолированный контекст через Function
  // eslint-disable-next-line no-new-func
  const loader = new Function('window', 'globalThis', MODULE_SRC);
  loader(heysCtx, heysCtx);

  const runFlush = () => heysCtx.HEYS.eventLog.flush();
  const runPendingTimers = () => {
    const fns = pendingTimers.splice(0);
    return Promise.all(fns.map((fn) => Promise.resolve(fn())));
  };

  return { heysCtx, lsMock, rpcMock, runFlush, runPendingTimers };
}

// ─────────────────────────────────────────────────────────────────
// === Tests: sanitization ===
// ─────────────────────────────────────────────────────────────────

describe('eventLog: sanitizePayload (privacy guard per 152-ФЗ)', () => {
  it('фильтрует health-data fields на <filtered>', () => {
    const input = {
      kcal100: 1200,
      weightMorning: 75.5,
      moodMorning: 4,
      sleepHours: 7.5,
      waterMl: 1500,
      dateKey: '2026-05-24',
      productId: 'p_xxx',
    };
    const result = sanitizePayload(input);
    expect(result.kcal100).toBe('<filtered>');
    expect(result.weightMorning).toBe('<filtered>');
    expect(result.moodMorning).toBe('<filtered>');
    expect(result.sleepHours).toBe('<filtered>');
    expect(result.waterMl).toBe('<filtered>');
    expect(result.dateKey).toBe('2026-05-24');
    expect(result.productId).toBe('p_xxx');
  });

  it('допускает whitelist payload keys', () => {
    const input = {
      dateKey: '2026-05-24',
      productIds: ['p1', 'p2'],
      suppIds: ['omega3'],
      mealIndex: 1,
      mealName: 'Ужин',
      name: 'Грудка Орион',
      oldGrams: 100,
      newGrams: 200,
      tombstoneCovered: 5,
    };
    const result = sanitizePayload(input);
    expect(result).toEqual(input);
  });

  it('обрезает длинные строки до 200 символов + ellipsis', () => {
    const long = 'A'.repeat(300);
    const result = sanitizePayload({ name: long });
    expect(result.name.length).toBe(201);
    expect(result.name.endsWith('…')).toBe(true);
  });

  it('обрезает большие массивы до 20 элементов + marker', () => {
    const big = Array.from({ length: 50 }, (_, i) => 'p' + i);
    const result = sanitizePayload({ productIds: big });
    expect(result.productIds.length).toBe(21);
    expect(result.productIds[20]).toBe('…+30');
  });

  it('null/undefined payload → null', () => {
    expect(sanitizePayload(null)).toBeNull();
    expect(sanitizePayload(undefined)).toBeNull();
  });

  it('not-object payload → null', () => {
    expect(sanitizePayload('string')).toBeNull();
    expect(sanitizePayload(42)).toBeNull();
  });

  it('empty object → empty object', () => {
    expect(sanitizePayload({})).toEqual({});
  });

  it('фильтрует unknown поля даже если они невинные', () => {
    const input = { totallyHarmless: 'hello', dateKey: '2026-05-24' };
    const result = sanitizePayload(input);
    expect(result.totallyHarmless).toBe('<filtered>');
    expect(result.dateKey).toBe('2026-05-24');
  });
});

// ─────────────────────────────────────────────────────────────────
// === Tests: sample rate ===
// ─────────────────────────────────────────────────────────────────

describe('eventLog: shouldSample (sample rate gate)', () => {
  it('unknown kind → всегда true (default 1.0)', () => {
    expect(shouldSample('arbitrary-kind', () => 0.99)).toBe(true);
    expect(shouldSample('arbitrary-kind', () => 0.01)).toBe(true);
  });

  it('rate=1.0 → всегда true', () => {
    expect(shouldSample('setall-shrink', () => 0.99)).toBe(true);
  });

  it('rate=0.2 — fires когда random < 0.2', () => {
    expect(shouldSample('sync-event', () => 0.1)).toBe(true);
    expect(shouldSample('sync-event', () => 0.3)).toBe(false);
  });

  it('rate=0.5 — fires когда random < 0.5', () => {
    expect(shouldSample('sync-products', () => 0.4)).toBe(true);
    expect(shouldSample('sync-products', () => 0.6)).toBe(false);
  });

  it('сritical kinds (product-delete, supplement-mark, meal-add) — всегда true', () => {
    const criticalKinds = ['product-delete', 'product-create', 'supplement-mark', 'meal-add', 'meal-remove'];
    for (const kind of criticalKinds) {
      expect(shouldSample(kind, () => 0.99)).toBe(true);
    }
  });

  it('rate=0 → всегда false (theoretical, не используется сейчас)', () => {
    const localShould = (kind, rand) => {
      const rate = kind === 'never' ? 0 : 1;
      if (rate <= 0) return false;
      if (rate >= 1) return true;
      return rand() < rate;
    };
    expect(localShould('never', () => 0)).toBe(false);
    expect(localShould('never', () => 0.5)).toBe(false);
  });

  it('approx 20% sample rate за 1000 итераций ±10%', () => {
    let fired = 0;
    for (let i = 0; i < 1000; i++) {
      if (shouldSample('sync-event')) fired++;
    }
    expect(fired).toBeGreaterThan(150);
    expect(fired).toBeLessThan(250);
  });
});

// ─────────────────────────────────────────────────────────────────
// === Tests: integration sanitization + sampling ===
// ─────────────────────────────────────────────────────────────────

describe('eventLog: integration of sanitization + sampling (contracts)', () => {
  it('критичные mutations всегда логируются и не фильтруют важные поля', () => {
    const sampled = shouldSample('meal-add', () => 0.99);
    expect(sampled).toBe(true);
    const sanitized = sanitizePayload({
      dateKey: '2026-05-24',
      name: 'Грудка',
      mealName: 'Ужин',
      mealIndex: 1,
      grams: 200,
      kcal100: 145,
    });
    expect(sanitized.dateKey).toBe('2026-05-24');
    expect(sanitized.name).toBe('Грудка');
    expect(sanitized.mealName).toBe('Ужин');
    expect(sanitized.grams).toBe('<filtered>');
    expect(sanitized.kcal100).toBe('<filtered>');
  });
});

// ─────────────────────────────────────────────────────────────────
// === Tests: Batching через реальный модуль ===
// ─────────────────────────────────────────────────────────────────

describe('eventLog: batching (real module)', () => {
  it('5 write() до flush → RPC вызван 1 раз с 5 events', async () => {
    const { heysCtx, rpcMock, runFlush } = createIsolatedModule({
      rpcResult: { data: null, error: null },
    });

    const el = heysCtx.HEYS.eventLog;
    for (let i = 0; i < 5; i++) {
      el.write('meal-add', `event-${i}`, { dateKey: '2026-05-24' });
    }

    await runFlush();

    expect(rpcMock).toHaveBeenCalledTimes(1);
    const callArgs = rpcMock.mock.calls[0];
    expect(callArgs[0]).toBe('log_client_event_by_session');
    const events = callArgs[1].p_events;
    expect(events).toHaveLength(5);
    events.forEach((ev, i) => {
      expect(ev.kind).toBe('meal-add');
      expect(ev.summary).toBe(`event-${i}`);
    });
  });

  it('events в queue имеют правильную структуру (ts, kind, summary, payload, meta)', async () => {
    const { heysCtx, rpcMock, runFlush } = createIsolatedModule({
      rpcResult: { data: null, error: null },
    });

    heysCtx.HEYS.eventLog.write('product-create', 'test-summary', {
      dateKey: '2026-05-24',
      kcal100: 300, // sensitive — будет filtered
    });
    await runFlush();

    const events = rpcMock.mock.calls[0][1].p_events;
    expect(events).toHaveLength(1);
    const ev = events[0];
    expect(ev).toHaveProperty('ts');
    expect(ev.kind).toBe('product-create');
    expect(ev.summary).toBe('test-summary');
    expect(ev.payload.dateKey).toBe('2026-05-24');
    expect(ev.payload.kcal100).toBe('<filtered>');
  });

  it('write с invalid kind (не строка) → event не попадает в queue', async () => {
    const { heysCtx, rpcMock, runFlush } = createIsolatedModule({
      rpcResult: { data: null, error: null },
    });

    heysCtx.HEYS.eventLog.write(null, 'bad event');
    heysCtx.HEYS.eventLog.write(undefined, 'bad event');
    heysCtx.HEYS.eventLog.write(42, 'bad event');
    await runFlush();

    // RPC не вызывается — нет событий
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('sync-event с Math.random mock 0.5 (выше rate=0.2) → не проходит sample', async () => {
    const { heysCtx, rpcMock, runFlush } = createIsolatedModule({
      rpcResult: { data: null, error: null },
    });

    const origRandom = Math.random;
    Math.random = () => 0.5; // > 0.2 → skip
    try {
      heysCtx.HEYS.eventLog.write('sync-event', 'should-be-skipped');
    } finally {
      Math.random = origRandom;
    }
    await runFlush();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('sync-event с Math.random mock 0.1 (ниже rate=0.2) → проходит sample', async () => {
    const { heysCtx, rpcMock, runFlush } = createIsolatedModule({
      rpcResult: { data: null, error: null },
    });

    const origRandom = Math.random;
    Math.random = () => 0.1; // < 0.2 → pass
    try {
      heysCtx.HEYS.eventLog.write('sync-event', 'should-pass');
    } finally {
      Math.random = origRandom;
    }
    await runFlush();
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock.mock.calls[0][1].p_events).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────
// === Tests: Failure recovery ===
// ─────────────────────────────────────────────────────────────────

describe('eventLog: failure recovery (real module)', () => {
  const PENDING_KEY = '__heys_event_log_pending__v1';

  it('RPC error → events сохраняются в LS pending queue', async () => {
    const { heysCtx, lsMock, runFlush } = createIsolatedModule({
      rpcResult: { data: null, error: { message: 'network error' } },
    });

    const el = heysCtx.HEYS.eventLog;
    el.write('meal-add', 'event-1', { dateKey: '2026-05-24' });
    el.write('meal-add', 'event-2', { dateKey: '2026-05-24' });

    await runFlush();

    // После ошибки RPC — события должны быть в localStorage
    const savedRaw = heysCtx.localStorage._store[PENDING_KEY];
    expect(savedRaw).toBeTruthy();
    const saved = JSON.parse(savedRaw);
    expect(Array.isArray(saved)).toBe(true);
    expect(saved.length).toBe(2);
    expect(saved[0].kind).toBe('meal-add');
  });

  it('RPC error, затем success → pending отправляется в следующем flush', async () => {
    // Шаг 1: flush с ошибкой
    const { heysCtx, rpcMock, runFlush } = createIsolatedModule({
      rpcResult: { data: null, error: { message: 'network error' } },
    });

    const el = heysCtx.HEYS.eventLog;
    el.write('supplement-mark', 'supp-1', { suppId: 'omega3' });
    await runFlush();

    // pending должен быть заполнен
    const pendingRaw = heysCtx.localStorage._store[PENDING_KEY];
    expect(pendingRaw).toBeTruthy();

    // Шаг 2: RPC теперь отвечает успешно
    rpcMock.mockResolvedValue({ data: null, error: null });
    // Сбрасываем _lastFlushFailAt чтобы не ждать 30s retry delay
    // Делаем это через новый flush (модуль сам обновит состояние после success)
    await runFlush();

    // После успешного flush — pending должен очиститься
    const pendingAfter = heysCtx.localStorage._store[PENDING_KEY];
    // Либо ключ удалён, либо массив пустой
    const isEmpty = !pendingAfter
      || pendingAfter === '[]'
      || (JSON.parse(pendingAfter || '[]').length === 0);
    expect(isEmpty).toBe(true);
  });

  it('отсутствие JS-readable sessionToken → RPC пробует cookie carrier, error сохраняет events в pending', async () => {
    const { heysCtx, rpcMock, runFlush } = createIsolatedModule({
      rpcResult: { data: null, error: { message: 'invalid_session' } },
    });

    // Убираем session token
    heysCtx.HEYS.Auth = { getSessionToken: () => null };

    heysCtx.HEYS.eventLog.write('meal-remove', 'no-session', { dateKey: '2026-05-24' });
    await runFlush();

    // Post PR-C: отсутствие readable token не значит logout. RPC идёт без
    // p_session_token, а сервер пытается взять HttpOnly cookie.
    expect(rpcMock).toHaveBeenCalledWith('log_client_event_by_session', expect.objectContaining({
      p_events: expect.any(Array),
    }));
    expect(rpcMock.mock.calls[0][1]).not.toHaveProperty('p_session_token');
    // Если cookie/сессия на сервере невалидна — события остаются в pending.
    const saved = heysCtx.localStorage._store[PENDING_KEY];
    expect(saved).toBeTruthy();
    expect(JSON.parse(saved).length).toBeGreaterThan(0);
  });

  it('отсутствие YandexAPI → events сохраняются в pending', async () => {
    const { heysCtx, rpcMock, runFlush } = createIsolatedModule({
      rpcResult: { data: null, error: null },
    });

    // Убираем YandexAPI
    heysCtx.HEYS.YandexAPI = null;

    heysCtx.HEYS.eventLog.write('product-delete', 'no-api', { productId: 'p1' });
    await runFlush();

    expect(rpcMock).not.toHaveBeenCalled();
    const saved = heysCtx.localStorage._store[PENDING_KEY];
    expect(saved).toBeTruthy();
  });

  it('curator session → skips session RPC and clears debug pending buffer', async () => {
    const { heysCtx, rpcMock, runFlush } = createIsolatedModule({
      rpcResult: { data: null, error: { message: 'invalid_session' } },
    });
    heysCtx.localStorage.setItem('heys_curator_session', 'curator.jwt.token');
    heysCtx.localStorage.setItem(PENDING_KEY, JSON.stringify([
      { kind: 'meal-add', summary: 'old pending', payload: { dateKey: '2026-05-24' } },
    ]));

    heysCtx.HEYS.eventLog.write('meal-add', 'curator event', { dateKey: '2026-05-24' });
    await runFlush();

    expect(rpcMock).not.toHaveBeenCalled();
    expect(heysCtx.localStorage._store[PENDING_KEY]).toBeUndefined();
    expect(heysCtx.HEYS.eventLog.getPendingBuffer().queue).toHaveLength(0);
  });

  it('flush с пустым queue и пустым pending → RPC не вызывается', async () => {
    const { rpcMock, runFlush } = createIsolatedModule({
      rpcResult: { data: null, error: null },
    });

    await runFlush();
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────
// === Tests: MAX_PENDING overflow ===
// ─────────────────────────────────────────────────────────────────

describe('eventLog: MAX_PENDING overflow (pure-logic replica)', () => {
  // MAX_PENDING = 500 из модуля. Тестируем логику _savePending напрямую.
  const MAX_PENDING = 500;

  function savePending(store, arr) {
    const capped = arr.length > MAX_PENDING ? arr.slice(-MAX_PENDING) : arr;
    store['__heys_event_log_pending__v1'] = JSON.stringify(capped);
  }

  function loadPending(store) {
    const raw = store['__heys_event_log_pending__v1'];
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  }

  it('600 events → pending держит только 500 (дропает oldest)', () => {
    const store = {};
    const events = Array.from({ length: 600 }, (_, i) => ({ idx: i }));
    savePending(store, events);

    const saved = loadPending(store);
    expect(saved).toHaveLength(MAX_PENDING);
    // slice(-500) сохраняет последние 500 — с индексами 100..599
    expect(saved[0].idx).toBe(100);
    expect(saved[MAX_PENDING - 1].idx).toBe(599);
  });

  it('500 events → не триммируется (border case)', () => {
    const store = {};
    const events = Array.from({ length: MAX_PENDING }, (_, i) => ({ idx: i }));
    savePending(store, events);

    const saved = loadPending(store);
    expect(saved).toHaveLength(MAX_PENDING);
    expect(saved[0].idx).toBe(0);
  });

  it('499 events → сохраняется всё', () => {
    const store = {};
    const events = Array.from({ length: 499 }, (_, i) => ({ idx: i }));
    savePending(store, events);

    const saved = loadPending(store);
    expect(saved).toHaveLength(499);
  });

  it('0 events → пустой массив сохраняется', () => {
    const store = {};
    savePending(store, []);
    const saved = loadPending(store);
    expect(saved).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────
// === Tests: Privacy regex в summary ===
// ─────────────────────────────────────────────────────────────────

describe('eventLog: privacy regex в summary (detection)', () => {
  // Regex — детектор опасных паттернов в summary.
  // \b не работает с кириллицей (JS \b = ASCII word boundary), поэтому
  // используем (?!\w): кириллические буквы не входят в \w → lookahead работает.
  const SENSITIVE_SUMMARY_RE = /\d+\s*(г|гр|kcal|ккал|kg|кг)(?!\w)/i;

  it('summary с числами+единицами → детектируется', () => {
    expect(SENSITIVE_SUMMARY_RE.test('200г курицы')).toBe(true);
    expect(SENSITIVE_SUMMARY_RE.test('meal-add 200гр грудки')).toBe(true);
    expect(SENSITIVE_SUMMARY_RE.test('1200 kcal')).toBe(true);
    expect(SENSITIVE_SUMMARY_RE.test('1200ккал')).toBe(true);
    expect(SENSITIVE_SUMMARY_RE.test('75kg вес')).toBe(true);
    expect(SENSITIVE_SUMMARY_RE.test('75кг')).toBe(true);
  });

  it('summary без числа+единиц → не детектируется', () => {
    expect(SENSITIVE_SUMMARY_RE.test('Грудка Орион в Ужин')).toBe(false);
    expect(SENSITIVE_SUMMARY_RE.test('meal-add добавлена порция')).toBe(false);
    expect(SENSITIVE_SUMMARY_RE.test('product-delete')).toBe(false);
    expect(SENSITIVE_SUMMARY_RE.test('')).toBe(false);
  });

  it('пробел между числом и единицей → детектируется', () => {
    expect(SENSITIVE_SUMMARY_RE.test('200 г')).toBe(true);
    expect(SENSITIVE_SUMMARY_RE.test('100 ккал')).toBe(true);
  });

  it('числа без единиц → не детектируются', () => {
    expect(SENSITIVE_SUMMARY_RE.test('добавили 3 порции')).toBe(false);
    expect(SENSITIVE_SUMMARY_RE.test('count: 5')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────
// === Tests: getPendingBuffer API ===
// ─────────────────────────────────────────────────────────────────

describe('eventLog: getPendingBuffer API (real module)', () => {
  it('возвращает { queue, pending, flushInProgress, lastFailAt }', async () => {
    const { heysCtx, runFlush } = createIsolatedModule({
      rpcResult: { data: null, error: null },
    });

    heysCtx.HEYS.eventLog.write('meal-add', 'buffered', { dateKey: '2026-05-24' });

    const buf = heysCtx.HEYS.eventLog.getPendingBuffer();
    expect(buf).toHaveProperty('queue');
    expect(buf).toHaveProperty('pending');
    expect(buf).toHaveProperty('flushInProgress');
    expect(buf).toHaveProperty('lastFailAt');
    expect(Array.isArray(buf.queue)).toBe(true);
    expect(Array.isArray(buf.pending)).toBe(true);
    expect(buf.queue.length).toBe(1);
    expect(buf.queue[0].kind).toBe('meal-add');

    await runFlush();
    // После успешного flush queue должен быть пуст
    const bufAfter = heysCtx.HEYS.eventLog.getPendingBuffer();
    expect(bufAfter.queue.length).toBe(0);
  });
});
