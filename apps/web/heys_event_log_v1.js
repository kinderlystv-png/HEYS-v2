// heys_event_log_v1.js — Client SDK для debug event log
// Plan: plans/rustling-dazzling-bentley.md (Wave 5.2, F-EL4)
//
// API:
//   HEYS.eventLog.write(kind, summary, payload?, source?)
//   HEYS.eventLog.flush()
//   HEYS.eventLog.getPendingBuffer()
//
// Поведение:
// - Каждый write → пушит в memory queue + schedule flush через 1s debounce
// - Flush → bulk RPC log_client_event_by_session (до 50 events за вызов)
// - При network/RPC fail → события переходят в LS key '__heys_event_log_pending__v1'
//   (без heys_ префикса → НЕ зеркалится в облако), retry при следующем flush
// - Privacy: payload sanitization через SAFE_PAYLOAD_KEYS whitelist
// - Sample rate для noisy kinds (sync-events, sync-products)
//
// Failure-safe: все экспорты обёрнуты в try/catch, не ронят основной flow.

(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  if (HEYS.eventLog) return; // idempotent

  // ─────────────────────────────────────────────────────────────────
  // Config
  // ─────────────────────────────────────────────────────────────────
  const PENDING_LS_KEY = '__heys_event_log_pending__v1';
  const DEBOUNCE_MS = 1000;
  const MAX_BATCH = 50;          // совпадает с серверным limit
  const MAX_PENDING = 500;       // защита от unbounded growth LS
  const FLUSH_RETRY_DELAY_MS = 30 * 1000;  // после неудачи ждём 30s

  // Privacy whitelist — поля, которые МОЖНО логировать.
  // Остальные ключи заменяются на '<filtered>'. Per 152-ФЗ (см. is_health_key()
  // в database/2026-01-24_audit_masking.sql) — health_data (вес, mood, ккал,
  // sleep) категорически нельзя.
  const SAFE_PAYLOAD_KEYS = new Set([
    'dateKey', 'date', 'productId', 'product_id', 'productIds', 'product_ids',
    'suppId', 'suppIds', 'fingerprint',
    'mealIndex', 'mealName', 'itemId',
    'name',                    // product/meal name = catalog data, не PII
    'oldGrams', 'newGrams',    // граммы порций — admin может скрыть отдельно
    'count', 'before', 'after',
    'tombstoneCovered', 'removedCount',
    'source', 'kind', 'reason',
    'allowShrink',
    '_oneTime',
    'sharedOriginId', 'shared_origin_id',
  ]);

  // Sample rate для шумных kind'ов. 1.0 = всё, 0.2 = каждый 5й.
  const SAMPLE_RATES = {
    'sync-event': 0.2,
    'sync-products': 0.5,
    'setall-shrink': 1.0,      // critical — всегда
    'product-delete': 1.0,
    'product-create': 1.0,
    'supplement-mark': 1.0,
    'meal-add': 1.0,
    'meal-remove': 1.0,
  };

  // ─────────────────────────────────────────────────────────────────
  // State
  // ─────────────────────────────────────────────────────────────────
  let _queue = [];               // events waiting to flush
  let _flushTimer = null;
  let _flushInProgress = false;
  let _lastFlushFailAt = 0;

  // 🧪 Poison-pill detection: если ОДИН и тот же head event падает N раз
  // подряд — drop его и попробовать остаток. Иначе один битый event
  // (BigInt в payload, null-byte в summary, oversize jsonb, etc) навсегда
  // блокирует всю очередь — retry loops пожизненно на одних и тех же
  // данных, события за ним никогда не дойдут. См. BUGS_HISTORY.md
  // «Morning checkin: cascade diagnosis (2026-05-26)» → Урок 2 + поиск
  // poison-pill после RPC 500 расследования.
  let _lastFailedFingerprint = null;
  let _consecutiveFailCount = 0;
  const POISON_PILL_THRESHOLD = 5;

  // ─────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────
  // Fingerprint head event'a батча — для poison-pill detection. Считаем
  // одним и тем же event если совпадают kind и первые 60 chars summary.
  // Намеренно НЕ берём в fingerprint payload/meta — те могут содержать
  // timestamps / случайные id, тогда idempotent retry будет иметь разный
  // fingerprint каждый раз и poison-pill detection не сработает.
  function _fingerprintEvent(e) {
    if (!e || typeof e !== 'object') return '';
    try { return (e.kind || '') + '|' + String(e.summary || '').slice(0, 60); }
    catch (_) { return ''; }
  }

  function _getSessionToken() {
    try {
      return (typeof HEYS !== 'undefined' && HEYS.Auth?.getSessionToken?.())
        || (HEYS.auth?.getSessionToken?.())
        || HEYS.utils?.lsGet?.('heys_session_token', null)
        || (() => { try { return JSON.parse(global.localStorage.getItem('heys_session_token')); } catch { return null; } })();
    } catch (_) { return null; }
  }

  function _readGlobalValue(key) {
    try {
      const raw = global.localStorage?.getItem?.(key);
      if (raw === null || raw === undefined) return null;
      try { return JSON.parse(raw); } catch (_) { return raw; }
    } catch (_) {
      return null;
    }
  }

  function _isCuratorSession() {
    try {
      if (_readGlobalValue('heys_pin_auth_client') || _readGlobalValue('heys_pin_cookie_session_hint')) {
        return false;
      }
      if (HEYS.auth?.isCuratorSession?.() === true) return true;
      return !!(HEYS.cloud?.getUser?.()
        || HEYS.YandexAPI?.getCuratorToken?.()
        || _readGlobalValue('heys_curator_cookie_session_hint'));
    } catch (_) {
      return false;
    }
  }

  // Privacy filter для summary: маскирует числовые значения с единицами,
  // которые могут быть health_data (200г, 1200 ккал, 75кг, 8ч сна).
  // Pattern: число + опциональный пробел + единица. Не word-boundary (\b не
  // работает с кириллицей в JS) — используем (?!\w) lookahead.
  const _SUMMARY_SENSITIVE_RE = /\d+\s*(г|гр|kcal|ккал|kg|кг|мл|ml|ч|h|мин|min)(?!\w)/gi;

  function _sanitizeSummary(s) {
    if (typeof s !== 'string') return '';
    const truncated = s.length > 500 ? s.slice(0, 500) : s;
    return truncated.replace(_SUMMARY_SENSITIVE_RE, '<n>');
  }

  function _sanitizePayload(payload) {
    if (!payload || typeof payload !== 'object') return null;
    const out = {};
    for (const key of Object.keys(payload)) {
      if (SAFE_PAYLOAD_KEYS.has(key)) {
        const v = payload[key];
        // Защита: даже whitelist-поля не дольше 200 символов (огромные dump'ы не нужны)
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

  function _buildMeta() {
    try {
      const now = new Date();
      const localTimeStr = now.toTimeString().slice(0, 5);
      const isNightTime = typeof HEYS.dayUtils?.isNightTime === 'function'
        ? HEYS.dayUtils.isNightTime(localTimeStr)
        : null;
      return {
        wallTimeUTC: now.toISOString(),
        localTimeStr,
        isNightTime,
        ua: (global.navigator?.userAgent || '').slice(0, 80),
      };
    } catch (_) {
      return null;
    }
  }

  function _shouldSample(kind) {
    const rate = SAMPLE_RATES[kind];
    if (rate === undefined || rate >= 1) return true;
    if (rate <= 0) return false;
    return Math.random() < rate;
  }

  // ─────────────────────────────────────────────────────────────────
  // Pending LS persistence
  // ─────────────────────────────────────────────────────────────────
  function _loadPending() {
    try {
      const raw = global.localStorage.getItem(PENDING_LS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) { return []; }
  }

  function _savePending(arr) {
    try {
      const capped = arr.length > MAX_PENDING ? arr.slice(-MAX_PENDING) : arr;
      global.localStorage.setItem(PENDING_LS_KEY, JSON.stringify(capped));
    } catch (_) { /* quota / serialization fail — accept loss */ }
  }

  function _clearPending() {
    try { global.localStorage.removeItem(PENDING_LS_KEY); } catch (_) { /* noop */ }
  }

  // ─────────────────────────────────────────────────────────────────
  // Flush
  // ─────────────────────────────────────────────────────────────────
  function _scheduleFlush() {
    if (_flushTimer) return;
    // Если совсем недавно не получилось — отложим
    const sinceFail = Date.now() - _lastFlushFailAt;
    const delay = sinceFail < FLUSH_RETRY_DELAY_MS && _lastFlushFailAt > 0
      ? Math.max(DEBOUNCE_MS, FLUSH_RETRY_DELAY_MS - sinceFail)
      : DEBOUNCE_MS;
    _flushTimer = setTimeout(() => {
      _flushTimer = null;
      _flush().catch(() => { /* swallow — _flush сам сохраняет в pending */ });
    }, delay);
  }

  async function _flush() {
    if (_flushInProgress) return;
    _flushInProgress = true;
    try {
      if (_isCuratorSession()) {
        _queue = [];
        _clearPending();
        _lastFlushFailAt = 0;
        _lastFailedFingerprint = null;
        _consecutiveFailCount = 0;
        return;
      }

      // Берём pending + текущий queue
      const pending = _loadPending();
      const batch = pending.concat(_queue).slice(0, MAX_BATCH);
      if (batch.length === 0) {
        _clearPending();
        return;
      }
      const remaining = pending.concat(_queue).slice(MAX_BATCH);

      // Если есть остаток — оставим его в pending, planируем ещё flush
      _queue = [];
      if (remaining.length > 0) {
        _savePending(remaining);
      }

      const sessionToken = _getSessionToken();
      const YandexAPI = HEYS.YandexAPI;
      if (!YandexAPI?.rpc) {
        // Нет session или API — сохраняем всё обратно в pending, ретраи позже
        _savePending(remaining.concat(batch));
        _lastFlushFailAt = Date.now();
        return;
      }

      const rpcParams = {
        p_events: batch,
      };
      if (sessionToken) rpcParams.p_session_token = sessionToken;
      const { data, error } = await YandexAPI.rpc('log_client_event_by_session', rpcParams);

      if (error || (data && data.error)) {
        // 🧪 Poison-pill detection: если ОДИН и тот же head event валит batch
        // N раз подряд — drop его и попробовать остаток. Защита от случая
        // когда битый event (BigInt, null-byte, oversize jsonb) навсегда
        // блокирует очередь.
        const headFp = batch.length > 0 ? _fingerprintEvent(batch[0]) : '';
        if (headFp && headFp === _lastFailedFingerprint) {
          _consecutiveFailCount++;
          if (_consecutiveFailCount >= POISON_PILL_THRESHOLD) {
            try {
              console.warn('[HEYS.eventLog] poison-pill detected — drop head event after',
                _consecutiveFailCount, 'consecutive failures:', batch[0]);
            } catch (_) { /* noop */ }
            _savePending(remaining.concat(batch.slice(1)));
            _consecutiveFailCount = 0;
            _lastFailedFingerprint = null;
            _lastFlushFailAt = Date.now();
            return;
          }
        } else {
          _lastFailedFingerprint = headFp;
          _consecutiveFailCount = 1;
        }
        // Network/server error → возвращаем batch в pending
        _savePending(remaining.concat(batch));
        _lastFlushFailAt = Date.now();
        try {
          console.warn('[HEYS.eventLog] flush failed, requeued', {
            batchSize: batch.length,
            consecutiveFails: _consecutiveFailCount,
            error: error || data.error,
          });
        } catch (_) { /* noop */ }
        return;
      }

      // Success — pending очистится (мы уже сохранили remaining без отправленных)
      if (remaining.length === 0) {
        _clearPending();
      }
      _lastFlushFailAt = 0;
      // 🧪 Reset poison-pill counter — успешный flush означает batch здоров
      _lastFailedFingerprint = null;
      _consecutiveFailCount = 0;

      // Если в remaining есть события — продолжаем flush'ить (другой batch)
      if (remaining.length > 0) {
        _scheduleFlush();
      }
    } catch (e) {
      // Любая непредвиденная ошибка → не теряем
      try {
        const pending = _loadPending();
        _savePending(pending.concat(_queue));
        _queue = [];
        _lastFlushFailAt = Date.now();
      } catch (_) { /* nothing more we can do */ }
      try {
        console.warn('[HEYS.eventLog] flush exception:', e?.message || e);
      } catch (_) { /* noop */ }
    } finally {
      _flushInProgress = false;
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────
  HEYS.eventLog = {
    /**
     * Записать event в queue (failure-safe).
     * @param {string} kind — типа 'meal-add', 'supplement-mark', etc.
     * @param {string} summary — human-readable, sanitized (без kcal/weight/mood)
     * @param {Object} [payload] — structured fields, sanitized по whitelist
     * @param {string} [source] — caller context, 'morning_supplements_reminder' etc.
     */
    write(kind, summary, payload, source) {
      try {
        if (!kind || typeof kind !== 'string') return;
        if (_isCuratorSession()) return;
        if (!_shouldSample(kind)) return;
        const event = {
          ts: new Date().toISOString(),
          kind,
          summary: _sanitizeSummary(summary || ''),
          source: source ? String(source).slice(0, 100) : null,
          payload: _sanitizePayload(payload),
          meta: _buildMeta(),
        };
        _queue.push(event);
        _scheduleFlush();
      } catch (_) { /* never throw */ }
    },

    flush() {
      return _flush().catch(() => { /* swallow */ });
    },

    getPendingBuffer() {
      try {
        return {
          queue: _queue.slice(),
          pending: _loadPending(),
          flushInProgress: _flushInProgress,
          lastFailAt: _lastFlushFailAt,
        };
      } catch (_) {
        return { queue: [], pending: [], flushInProgress: false, lastFailAt: 0 };
      }
    },

    // For tests/debug — internal helpers exposed без public contract
    _internals: {
      sanitizePayload: _sanitizePayload,
      shouldSample: _shouldSample,
      SAFE_PAYLOAD_KEYS,
      SAMPLE_RATES,
    },
  };

  // Flush на page unload — пытаемся не потерять последний batch
  try {
    if (global.addEventListener) {
      global.addEventListener('beforeunload', () => {
        try { _flush(); } catch (_) { /* noop */ }
      });
      global.addEventListener('visibilitychange', () => {
        if (global.document?.visibilityState === 'hidden') {
          try { _flush(); } catch (_) { /* noop */ }
        }
      });
    }
  } catch (_) { /* noop */ }

  // Если есть pending с прошлой сессии — попробуем flush сразу
  try {
    const initialPending = _loadPending();
    if (initialPending.length > 0) {
      _scheduleFlush();
    }
  } catch (_) { /* noop */ }

  try { console.info('[HEYS.eventLog] ready (v1)'); } catch (_) { /* noop */ }
})(typeof window !== 'undefined' ? window : globalThis);
