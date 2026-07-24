// heys_client_log_trace_v1.js — клиентский console buffer → облако.
//
// Зачем: на мобильных нет DevTools. Когда визард чекина или sync падают
// тихо, диагностировать нечем. Этот модуль перехватывает console.* в
// кольцевой буфер и flush'ит batches на сервер (таблица client_log_trace).
//
// Когда flush:
//   - На visibilitychange → hidden и pagehide через navigator.sendBeacon
//     (работает при закрытии вкладки/sleep телефона)
//   - Периодически (30s) если буфер не пуст
//   - Сразу при error / unhandledrejection
//
// Должен загружаться РАНО (до остальных heys_* скриптов), чтобы перехватить
// init-логи. Hard-coded API URL — не зависит от HEYS.YandexAPI.
(function (global) {
  if (global.__HEYS_LOG_TRACE_INSTALLED__) return;
  global.__HEYS_LOG_TRACE_INSTALLED__ = true;

  var isLocalDev = typeof location !== 'undefined' &&
    (location.hostname === 'localhost' || location.hostname === '127.0.0.1');
  var API_URL = isLocalDev ? 'http://localhost:4001' : 'https://api.heyslab.ru';
  var ENDPOINT = API_URL + '/rest/client_log_trace';

  var RING_MAX = 1500;           // max entries в буфере (поднято 2026-06-01: 500 не хватало активным сессиям)
  var FLUSH_INTERVAL_MS = 20000; // periodic flush каждые 20s (раньше 30s — снижаем риск overflow до flush)
  var FLUSH_BATCH = 300;         // max строк за один POST (сервер capped 500)
  var MAX_MSG_LEN = 4000;        // обрезка длинных строк
  function randomId(prefix) {
    try {
      if (global.crypto && typeof global.crypto.randomUUID === 'function') return global.crypto.randomUUID();
    } catch (_) { /* fallback below */ }
    if (prefix === 'event') {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (char) {
        var value = Math.random() * 16 | 0;
        return (char === 'x' ? value : (value & 0x3 | 0x8)).toString(16);
      });
    }
    return (prefix || 'id') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  var SESSION_ID = (function () {
    try {
      var k = '_heys_log_session';
      var v = sessionStorage.getItem(k);
      if (!v) {
        v = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        sessionStorage.setItem(k, v);
      }
      return v;
    } catch (_) {
      return 'no-ss-' + Date.now().toString(36);
    }
  })();
  // SESSION_ID identifies the browser tab; BOOT_ID identifies this exact page load.
  // A reload/update therefore starts a fresh diagnostic session even in the same tab.
  var BOOT_ID = randomId('boot');
  var DEVICE_ID = (function () {
    try {
      var k = '_heys_observability_device';
      var v = localStorage.getItem(k);
      if (!v) {
        v = randomId('device');
        localStorage.setItem(k, v);
      }
      return v;
    } catch (_) {
      return randomId('ephemeral-device');
    }
  })();
  var BOOT_STARTED_AT = Date.now();
  var OFFLINE_QUEUE_KEY = '_heys_observability_queue_v1';
  var OFFLINE_QUEUE_MAX = 200;

  function detectRuntime() {
    var ua = (typeof navigator !== 'undefined' && navigator.userAgent) ? navigator.userAgent : '';
    var ios = /iPhone|iPad|iPod/i.test(ua);
    var android = /Android/i.test(ua);
    var standalone = false;
    try {
      standalone = !!((global.matchMedia && global.matchMedia('(display-mode: standalone)').matches) || navigator.standalone);
    } catch (_) { /* noop */ }
    var buildId = null;
    try {
      var scripts = document.scripts || [];
      for (var i = scripts.length - 1; i >= 0; i--) {
        var src = scripts[i].src || '';
        var match = src.match(/boot-app\.([a-f0-9]+)\.js/i);
        if (match) { buildId = match[1]; break; }
      }
    } catch (_) { /* noop */ }
    return {
      buildId: buildId || (global.HEYS && global.HEYS.version) || global.APP_VERSION || 'unknown',
      deviceClass: /iPad|Tablet/i.test(ua) ? 'tablet' : (/Mobile|iPhone|Android/i.test(ua) ? 'mobile' : 'desktop'),
      osName: ios ? 'iOS' : (android ? 'Android' : (/Windows/i.test(ua) ? 'Windows' : (/Mac OS/i.test(ua) ? 'macOS' : 'other'))),
      browserName: /CriOS|Chrome/i.test(ua) ? 'Chrome' : (/FxiOS|Firefox/i.test(ua) ? 'Firefox' : (/Safari/i.test(ua) ? 'Safari' : 'other')),
      displayMode: standalone ? 'standalone' : 'browser'
    };
  }
  var RUNTIME = detectRuntime();

  var EVENT_CONTEXT_KEYS = {
    phase: 1, step: 1, step_id: 1, screen: 1, source: 1, reason: 1,
    release_version: 1, unseen_count: 1, update_version: 1,
    pending_count: 1, missing_days_count: 1, action: 1, mode: 1,
    from: 1, to: 1, online: 1, attempt: 1, result: 1,
    bundle: 1, route: 1, tab: 1, flow_kind: 1,
    count: 1, queue_size: 1, key_group: 1, problem_stage: 1
  };

  function sanitizeEventContext(input) {
    var out = {};
    if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
    Object.keys(input).forEach(function (key) {
      if (!EVENT_CONTEXT_KEYS[key]) return;
      var value = input[key];
      if (typeof value === 'string') out[key] = value.slice(0, 160);
      else if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
      else if (typeof value === 'boolean') out[key] = value;
    });
    return out;
  }

  function readOfflineEvents() {
    try {
      var parsed = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
      return Array.isArray(parsed) ? parsed.slice(-OFFLINE_QUEUE_MAX) : [];
    } catch (_) { return []; }
  }

  function writeOfflineEvents(events) {
    try { localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(events.slice(-OFFLINE_QUEUE_MAX))); }
    catch (_) { /* diagnostics must never break the app */ }
  }

  function persistStructuredEvent(entry) {
    var queue = readOfflineEvents();
    queue.push(entry);
    writeOfflineEvents(queue);
  }

  function acknowledgeStructuredEvents(eventIds) {
    if (!eventIds || !eventIds.length) return;
    var accepted = {};
    eventIds.forEach(function (id) { if (id) accepted[id] = 1; });
    writeOfflineEvents(readOfflineEvents().filter(function (entry) { return !accepted[entry.event_id]; }));
  }

  // Original methods — никогда НЕ заменяются, чтобы flush() не зацикливался.
  var orig = {
    log:   console.log.bind(console),
    info:  console.info.bind(console),
    warn:  console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug ? console.debug.bind(console) : console.log.bind(console)
  };

  var ring = readOfflineEvents(); // raw console rows + persisted structured lifecycle events
  var ringDropped = 0;
  var lastFlushAt = 0;
  var flushInProgress = false;
  var recentTraces = [];
  var RECENT_TRACE_MAX = 250;
  var readbackTimers = {};

  // ⚡ PERF A2 (2026-06-13): бюджетная сериализация. Раньше каждый console.* с
  // объектом шёл в полный JSON.stringify (цена платится ДО обрезки по
  // MAX_MSG_LEN), а args уходили в batch сырыми объектами без капа. Теперь:
  // depth ≤ 3, ≤ 24 ключей/элементов на уровень, строки ≤ 256 симв., ≤ 400
  // узлов на вызов. Полный режим (отладка): localStorage heys_logtrace_full = '1'.
  var FULL_TRACE = (function () {
    try { return localStorage.getItem('heys_logtrace_full') === '1'; } catch (_) { return false; }
  })();
  var BUDGET_DEPTH = 3;
  var BUDGET_KEYS = 24;
  var BUDGET_STR = 256;
  var BUDGET_NODES = 400;

  function budgetSerialize(v, depth, state) {
    if (++state.nodes > BUDGET_NODES) return '"…"';
    if (v === null) return 'null';
    var t = typeof v;
    if (t === 'undefined') return '"undefined"';
    if (t === 'number' || t === 'boolean') return String(v);
    if (t === 'string') {
      var s = v.length > BUDGET_STR ? v.slice(0, BUDGET_STR) + '…' : v;
      try { return JSON.stringify(s); } catch (_) { return '"…"'; }
    }
    if (t === 'function') return '"[fn]"';
    if (v instanceof Error) {
      try { return JSON.stringify(v.name + ': ' + v.message); } catch (_) { return '"[error]"'; }
    }
    if (depth >= BUDGET_DEPTH) return Array.isArray(v) ? '"[…array]"' : '"{…object}"';
    var i, out;
    if (Array.isArray(v)) {
      out = [];
      var n = Math.min(v.length, BUDGET_KEYS);
      for (i = 0; i < n; i++) out.push(budgetSerialize(v[i], depth + 1, state));
      if (v.length > n) out.push('"…+' + (v.length - n) + '"');
      return '[' + out.join(',') + ']';
    }
    if (t === 'object') {
      out = [];
      var count = 0, total = 0, k, vv;
      for (k in v) {
        if (!Object.prototype.hasOwnProperty.call(v, k)) continue;
        total++;
        if (count < BUDGET_KEYS) {
          try { vv = v[k]; } catch (_) { vv = '[getter]'; }
          out.push(JSON.stringify(k) + ':' + budgetSerialize(vv, depth + 1, state));
          count++;
        }
      }
      if (total > count) out.push('"…":"+' + (total - count) + ' keys"');
      return '{' + out.join(',') + '}';
    }
    return '"' + t + '"';
  }

  function safeStringify(v) {
    if (v === null) return 'null';
    if (v === undefined) return 'undefined';
    var t = typeof v;
    if (t === 'string') return v;
    if (t === 'number' || t === 'boolean') return String(v);
    if (v instanceof Error) {
      // Stack может быть длинным — обрежем разумно
      var stack = v.stack || '';
      return v.name + ': ' + v.message + (stack ? '\n' + stack.split('\n').slice(0, 8).join('\n') : '');
    }
    if (!FULL_TRACE) {
      try { return budgetSerialize(v, 0, { nodes: 0 }); }
      catch (_) { try { return String(v); } catch (__) { return '[unserializable]'; } }
    }
    try {
      return JSON.stringify(v, function (k, val) {
        if (val instanceof Error) return { _error: true, name: val.name, message: val.message };
        return val;
      });
    } catch (_) {
      try { return String(v); } catch (__) { return '[unserializable]'; }
    }
  }

  function captureArgs(args) {
    // args[0] идёт в message (строкой), остальное — в jsonb args
    var parts = [];
    var extras = [];
    for (var i = 0; i < args.length; i++) {
      parts.push(safeStringify(args[i]));
      // ⚡ PERF A2: в batch уходит бюджетная строка, а не сырой объект —
      // иначе JSON.stringify(batch) на flush сериализует объекты целиком.
      if (i > 0) extras.push(FULL_TRACE ? args[i] : parts[i]);
    }
    var msg = parts.join(' ');
    if (msg.length > MAX_MSG_LEN) msg = msg.slice(0, MAX_MSG_LEN) + ' …[truncated]';
    return { message: msg, args: extras.length ? extras : null };
  }

  function makeFlowId(scope) {
    var prefix = String(scope || 'flow').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'flow';
    return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  }

  function extractTraceMeta(args) {
    var prefix = args && typeof args[0] === 'string' ? args[0] : '';
    var body = args && args[1] && typeof args[1] === 'object' && !Array.isArray(args[1]) ? args[1] : null;
    return {
      prefix: prefix,
      event: body && body.event ? String(body.event) : null,
      source: body && body.source ? String(body.source) : null,
      flowId: body && body.flowId ? String(body.flowId) : null,
      body: body
    };
  }

  function deriveStructuredMeta(level, args) {
    var meta = extractTraceMeta(args);
    if (!meta.body || !meta.event) return null;
    var body = meta.body;
    return {
      event_id: randomId('event'),
      event_name: String(meta.event).slice(0, 100),
      event_source: String(meta.source || meta.prefix.replace(/^\[|\]$/g, '') || 'app').slice(0, 100),
      event_status: String(body.status || (level === 'error' ? 'failed' : 'ok')).slice(0, 40),
      flow_id: meta.flowId ? String(meta.flowId).slice(0, 100) : null,
      duration_ms: Number.isFinite(Number(body.durationMs)) ? Math.max(0, Math.min(86400000, Math.round(Number(body.durationMs)))) : null,
      event_context: sanitizeEventContext(Object.assign({}, body, {
        step_id: body.step_id || body.stepId,
        missing_days_count: body.missing_days_count || body.missingDaysCount
      }))
    };
  }

  function rememberTrace(level, args) {
    try {
      var meta = extractTraceMeta(args);
      if (!meta.prefix || meta.prefix.indexOf('[HEYS.') !== 0) return;
      recentTraces.push({
        at: Date.now(),
        ts: new Date().toISOString(),
        level: level,
        prefix: meta.prefix,
        event: meta.event,
        source: meta.source,
        flowId: meta.flowId,
        body: meta.body
      });
      if (recentTraces.length > RECENT_TRACE_MAX) {
        recentTraces.splice(0, recentTraces.length - RECENT_TRACE_MAX);
      }
    } catch (_) { /* noop */ }
  }

  function stableHash(value) {
    var raw = '';
    try { raw = JSON.stringify(value); } catch (_) { raw = String(value); }
    var hash = 2166136261 >>> 0;
    for (var i = 0; i < raw.length; i++) {
      hash ^= raw.charCodeAt(i);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    return hash.toString(16);
  }

  function summarizeValue(value) {
    var kind = value === null ? 'null' : (Array.isArray(value) ? 'array' : typeof value);
    var out = { kind: kind, hash: stableHash(value) };
    if (Array.isArray(value)) {
      out.length = value.length;
      out.last = value.length ? summarizeSmallObject(value[value.length - 1]) : null;
    } else if (value && typeof value === 'object') {
      out.keys = Object.keys(value).slice(0, 20);
      if (Object.prototype.hasOwnProperty.call(value, 'updatedAt')) out.updatedAt = value.updatedAt;
    }
    return out;
  }

  function summarizeSmallObject(value) {
    if (!value || typeof value !== 'object') return value == null ? null : String(value).slice(0, 80);
    var out = {};
    ['id', 'activityId', 'date', 'minutes', 'at', 'createdAt', 'updatedAt'].forEach(function (k) {
      if (Object.prototype.hasOwnProperty.call(value, k)) out[k] = value[k];
    });
    return out;
  }

  function summarizeSyncHealth() {
    var H = global.HEYS || {};
    var cloud = H.cloud || {};
    var stats = {
      client: String(getClientId() || '').slice(0, 8) || null,
      online: typeof navigator !== 'undefined' ? navigator.onLine : null,
      logTrace: {
        buffered: ring.length,
        dropped: ringDropped,
        recent: recentTraces.length,
        lastFlushAgeMs: lastFlushAt ? Date.now() - lastFlushAt : null
      }
    };
    try {
      stats.cloud = {
        status: typeof cloud.getStatus === 'function' ? cloud.getStatus() : null,
        routing: typeof cloud.getRoutingStatus === 'function' ? cloud.getRoutingStatus() : null,
        pending: typeof cloud.getPendingCount === 'function' ? cloud.getPendingCount() : null,
        pendingDetails: typeof cloud.getPendingDetails === 'function' ? cloud.getPendingDetails() : null,
        syncing: typeof cloud.isSyncing === 'function' ? !!cloud.isSyncing() : null,
        uploading: typeof cloud.isUploadInProgress === 'function' ? !!cloud.isUploadInProgress() : null,
        queue: typeof cloud.getQueueDebug === 'function' ? cloud.getQueueDebug() : null,
        retry: typeof cloud.getRetryDebug === 'function' ? cloud.getRetryDebug() : null
      };
    } catch (_) { /* noop */ }
    try {
      stats.yandex = H.YandexAPI && typeof H.YandexAPI._debug === 'function' ? H.YandexAPI._debug() : null;
    } catch (_) { /* noop */ }
    return stats;
  }

  function exportSnapshot() {
    var lines = [];
    var now = new Date();
    lines.push('=== HEYS Log Trace Snapshot @ ' + now.toISOString() + ' ===');
    lines.push('session: ' + SESSION_ID);
    lines.push('endpoint: ' + ENDPOINT);
    try { lines.push('health: ' + JSON.stringify(summarizeSyncHealth())); } catch (_) {}
    lines.push('');
    lines.push('=== Recent Trace Events (' + recentTraces.length + ') ===');
    recentTraces.slice(-120).forEach(function (row) {
      var age = Date.now() - row.at;
      var body = row.body;
      var compact = '';
      try { compact = JSON.stringify(body); } catch (_) { compact = String(body || ''); }
      lines.push([
        row.ts,
        row.level,
        row.prefix,
        row.flowId || '-',
        row.event || '-',
        row.source || '-',
        age + 'ms',
        compact.slice(0, 900)
      ].join(' | '));
    });
    return lines.join('\n');
  }

  function lastFlowId(prefix, maxAgeMs) {
    var now = Date.now();
    var age = Math.max(250, Number(maxAgeMs) || 5000);
    for (var i = recentTraces.length - 1; i >= 0; i--) {
      var row = recentTraces[i];
      if (!row || !row.flowId) continue;
      if (prefix && row.prefix !== prefix) continue;
      if (now - row.at > age) break;
      return row.flowId;
    }
    return null;
  }

  function readCloudKv(clientId, key) {
    var H = global.HEYS || {};
    if (!clientId || !key || !H.YandexAPI || typeof H.YandexAPI.getKV !== 'function') {
      return Promise.resolve({ ok: false, error: 'yandex_api_unavailable' });
    }
    return H.YandexAPI.getKV(clientId, key).then(function (res) {
      if (res && res.error) return { ok: false, error: res.error };
      return { ok: true, value: res ? res.data : null };
    }).catch(function (error) {
      return { ok: false, error: error && (error.message || String(error)) };
    });
  }

  function verifyKvWrite(opts) {
    try {
      opts = opts || {};
      var key = opts.key ? String(opts.key) : '';
      var prefix = opts.prefix || '[HEYS.trace]';
      var flowId = opts.flowId || null;
      var delayMs = Math.max(500, Math.min(15000, Number(opts.delayMs) || 2500));
      var clientId = opts.clientId || getClientId();
      if (!key || !clientId) {
        trace('warn', prefix, {
          event: 'cloud_readback_skipped',
          source: 'logtrace-readback',
          flowId: flowId,
          key: key || null,
          reason: !key ? 'missing_key' : 'missing_client'
        });
        return null;
      }
      var timerKey = String(clientId) + '\u0000' + key + '\u0000' + (flowId || '');
      if (readbackTimers[timerKey]) clearTimeout(readbackTimers[timerKey]);
      readbackTimers[timerKey] = setTimeout(function () {
        delete readbackTimers[timerKey];
        readCloudKv(clientId, key).then(function (res) {
          if (!res.ok) {
            trace('warn', prefix, {
              event: 'cloud_readback_error',
              source: 'logtrace-readback',
              flowId: flowId,
              key: key,
              client: String(clientId).slice(0, 8),
              error: String(res.error || 'unknown').slice(0, 240)
            });
            return;
          }
          var actual = summarizeValue(res.value);
          var expected = opts.expectedSummary || null;
          var ok = !!res.value;
          if (expected && expected.hash && actual && actual.hash) ok = ok && expected.hash === actual.hash;
          if (expected && expected.length != null && actual && actual.length != null) ok = ok && expected.length === actual.length;
          trace(ok ? 'info' : 'warn', prefix, {
            event: ok ? 'cloud_readback_ok' : 'cloud_readback_mismatch',
            source: 'logtrace-readback',
            flowId: flowId,
            key: key,
            client: String(clientId).slice(0, 8),
            expected: expected,
            actual: actual
          });
        });
      }, delayMs);
      return timerKey;
    } catch (error) {
      trace('warn', (opts && opts.prefix) || '[HEYS.trace]', {
        event: 'cloud_readback_schedule_error',
        source: 'logtrace-readback',
        flowId: opts && opts.flowId || null,
        error: error && (error.message || String(error))
      });
      return null;
    }
  }

  function push(level, args, explicitStructured) {
    try {
      var c = captureArgs(args);
      if (ring.length >= RING_MAX) {
        ring.shift();
        ringDropped++;
      }
      var structured = explicitStructured || deriveStructuredMeta(level, args);
      var entry = {
        level: level,
        message: c.message,
        args: c.args,
        client_ts: new Date().toISOString(),
        page_url: typeof location !== 'undefined' ? location.href.slice(0, 1000) : null
      };
      if (structured) {
        Object.keys(structured).forEach(function (key) { entry[key] = structured[key]; });
        entry.boot_id = BOOT_ID;
        entry.build_id = RUNTIME.buildId;
        entry.device_id = DEVICE_ID;
        entry.device_class = RUNTIME.deviceClass;
        entry.os_name = RUNTIME.osName;
        entry.browser_name = RUNTIME.browserName;
        entry.display_mode = RUNTIME.displayMode;
        persistStructuredEvent(entry);
      }
      ring.push(entry);
      rememberTrace(level, args);
    } catch (_) { /* never throw из console patch */ }
  }

  // Patch console
  ['log', 'info', 'warn', 'error', 'debug'].forEach(function (level) {
    console[level] = function () {
      try { push(level, arguments); } catch (_) {}
      try { orig[level].apply(console, arguments); } catch (_) {}
    };
  });

  // Global error handlers
  global.addEventListener('error', function (ev) {
    push('error', ['[window.error]', ev.message, ev.filename + ':' + ev.lineno + ':' + ev.colno, ev.error && ev.error.stack], {
      event_id: randomId('event'), event_name: global.__heysAppReady ? 'app_runtime_failed' : 'boot_failed',
      event_source: 'window', event_status: 'failed', flow_id: null,
      duration_ms: Date.now() - BOOT_STARTED_AT, event_context: { phase: global.__heysAppReady ? 'runtime' : 'boot' }
    });
    flush('error-event');
  });
  global.addEventListener('unhandledrejection', function (ev) {
    var reason = ev.reason;
    push('error', ['[unhandledrejection]', reason && (reason.message || reason)], {
      event_id: randomId('event'), event_name: global.__heysAppReady ? 'app_runtime_failed' : 'boot_failed',
      event_source: 'promise', event_status: 'failed', flow_id: null,
      duration_ms: Date.now() - BOOT_STARTED_AT, event_context: { phase: global.__heysAppReady ? 'runtime' : 'boot' }
    });
    flush('unhandledrejection');
  });

  function getClientId() {
    try {
      if (global.HEYS) {
        if (typeof global.HEYS.currentClientId === 'string' && global.HEYS.currentClientId) {
          return global.HEYS.currentClientId;
        }
        if (global.HEYS.utils && typeof global.HEYS.utils.getCurrentClientId === 'function') {
          var id = global.HEYS.utils.getCurrentClientId();
          if (id) return id;
        }
      }
    } catch (_) {}
    return null;
  }

  function buildBatch(entries) {
    var cid = getClientId();
    var ua = (typeof navigator !== 'undefined' && navigator.userAgent) ? navigator.userAgent : null;
    return entries.map(function (e) {
      return {
        client_id: cid,
        client_ts: e.client_ts,
        level: e.level,
        message: e.message,
        args: e.args,
        session_id: SESSION_ID,
        user_agent: ua,
        page_url: e.page_url,
        event_id: e.event_id || null,
        boot_id: e.boot_id || BOOT_ID,
        event_name: e.event_name || null,
        event_source: e.event_source || null,
        event_status: e.event_status || null,
        flow_id: e.flow_id || null,
        duration_ms: e.duration_ms == null ? null : e.duration_ms,
        build_id: e.build_id || RUNTIME.buildId,
        device_id: e.device_id || DEVICE_ID,
        device_class: e.device_class || RUNTIME.deviceClass,
        os_name: e.os_name || RUNTIME.osName,
        browser_name: e.browser_name || RUNTIME.browserName,
        display_mode: e.display_mode || RUNTIME.displayMode,
        event_context: e.event_context || null
      };
    });
  }

  function flush(reason) {
    if (flushInProgress) return;
    if (ring.length === 0) return;

    // Drain до FLUSH_BATCH строк
    var slice = ring.splice(0, FLUSH_BATCH);
    var dropped = ringDropped; ringDropped = 0;
    if (dropped > 0) {
      slice.unshift({
        level: 'warn',
        message: '[log-trace] ring buffer dropped ' + dropped + ' entries before this flush',
        args: { reason: reason, dropped: dropped },
        client_ts: new Date().toISOString(),
        page_url: typeof location !== 'undefined' ? location.href.slice(0, 1000) : null
      });
    }
    var batch = buildBatch(slice);
    var payload = JSON.stringify(batch);
    var structuredEventIds = slice.map(function (entry) { return entry.event_id; }).filter(Boolean);
    lastFlushAt = Date.now();

    // Под visibilitychange/pagehide — sendBeacon (fire-and-forget, не блокирует unload).
    // Иначе — обычный fetch чтобы видеть результат.
    var useBeacon = (reason === 'pagehide' || reason === 'visibilitychange' || reason === 'beforeunload');
    if (useBeacon && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      try {
        var blob = new Blob([payload], { type: 'application/json' });
        navigator.sendBeacon(ENDPOINT, blob);
        return;
      } catch (_) {
        // fallthrough → fetch
      }
    }

    flushInProgress = true;
    try {
      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
        credentials: 'include'
      }).then(function (response) {
        if (response && response.ok) acknowledgeStructuredEvents(structuredEventIds);
      }).catch(function () {
        // Raw console rows may be dropped. Structured events remain in the
        // bounded local queue and return to the in-memory queue for online retry.
        var retryRows = slice.filter(function (entry) { return !!entry.event_id; });
        if (retryRows.length) ring = retryRows.concat(ring).slice(-RING_MAX);
      }).then(function () {
        flushInProgress = false;
      });
    } catch (_) {
      flushInProgress = false;
    }
  }

  function trace(level) {
    var lvl = (level === 'warn' || level === 'error' || level === 'debug' || level === 'log') ? level : 'info';
    var args = Array.prototype.slice.call(arguments, 1);
    try { push(lvl, args); } catch (_) {}
    try {
      var out = orig[lvl] || orig.info || orig.log;
      if (typeof out === 'function') out.apply(console, args);
    } catch (_) {}
    setTimeout(function () {
      try { flush('trace-direct'); } catch (_) {}
    }, 250);
  }

  function event(eventName, context, level) {
    var safeName = String(eventName || '').replace(/[^a-z0-9_.-]+/gi, '_').slice(0, 100);
    if (!safeName) return null;
    var input = context && typeof context === 'object' ? context : {};
    var lvl = (level === 'warn' || level === 'error' || level === 'debug') ? level : 'info';
    var structured = {
      event_id: randomId('event'),
      event_name: safeName,
      event_source: String(input.source || 'app').slice(0, 100),
      event_status: String(input.status || (lvl === 'error' ? 'failed' : 'ok')).slice(0, 40),
      flow_id: input.flowId ? String(input.flowId).slice(0, 100) : null,
      duration_ms: Number.isFinite(Number(input.durationMs)) ? Math.max(0, Math.min(86400000, Math.round(Number(input.durationMs)))) : null,
      event_context: sanitizeEventContext(input)
    };
    push(lvl, ['[HEYS.observability]', { event: safeName, source: structured.event_source, status: structured.event_status }], structured);
    if (lvl === 'error') flush('structured-error');
    return structured.event_id;
  }

  // Periodic flush
  setInterval(function () {
    if (ring.length > 0 && Date.now() - lastFlushAt > FLUSH_INTERVAL_MS - 1000) {
      flush('periodic');
    }
  }, FLUSH_INTERVAL_MS);

  // Visibility / unload
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') flush('visibilitychange');
    });
  }
  global.addEventListener('pagehide', function () { flush('pagehide'); });
  global.addEventListener('beforeunload', function () { flush('beforeunload'); });

  // Manual API для отладки
  global.HEYS = global.HEYS || {};
  global.HEYS.LogTrace = {
    flush: function () { flush('manual'); },
    trace: trace,
    event: event,
    makeFlowId: makeFlowId,
    lastFlowId: lastFlowId,
    verifyKvWrite: verifyKvWrite,
    summarizeValue: summarizeValue,
    recent: function () { return recentTraces.slice(); },
    exportSnapshot: exportSnapshot,
    health: summarizeSyncHealth,
    stats: function () {
      return {
        buffered: ring.length,
        dropped: ringDropped,
        lastFlushAt: lastFlushAt,
        recentTraces: recentTraces.length,
        sessionId: SESSION_ID,
        bootId: BOOT_ID,
        deviceId: DEVICE_ID,
        runtime: RUNTIME,
        endpoint: ENDPOINT
      };
    },
    sessionId: SESSION_ID,
    bootId: BOOT_ID
  };

  // Маркер для timing-диагностики (отдельный console.info чтобы поймать сам бутстрап в логе)
  orig.info('[heys.log-trace] installed v1, session=' + SESSION_ID + ', endpoint=' + ENDPOINT);

  event('boot_started', {
    source: 'bootstrap',
    phase: 'bootstrap',
    online: typeof navigator !== 'undefined' ? navigator.onLine : true
  });

  global.addEventListener('online', function () {
    event('network_online', { source: 'browser', online: true });
    flush('online');
  });
  global.addEventListener('offline', function () {
    event('network_offline', { source: 'browser', status: 'degraded', online: false }, 'warn');
  });
  global.addEventListener('heys:client-changed', function () {
    event('client_context_ready', { source: 'auth', phase: 'identity' });
  });
  global.addEventListener('heysSyncCompleted', function () {
    event('initial_sync_ready', { source: 'sync', phase: 'initial_sync', durationMs: Date.now() - BOOT_STARTED_AT });
  });
  global.addEventListener('heys:progress', function (ev) {
    var phase = ev && ev.detail && ev.detail.phase ? String(ev.detail.phase) : '';
    if (!phase) return;
    if (phase === 'ready') event('app_shell_ready', { source: 'bootstrap', phase: phase, durationMs: Date.now() - BOOT_STARTED_AT });
    else if (phase.indexOf('bundle') !== -1 || phase.indexOf('postboot') !== -1) {
      event('boot_phase_ready', { source: 'bootstrap', phase: phase, durationMs: Date.now() - BOOT_STARTED_AT });
    }
  });
  (function waitForPostboot() {
    var attempts = 0;
    var timer = setInterval(function () {
      attempts++;
      if (global.__heysPostbootDone) {
        clearInterval(timer);
        event('postboot_ready', { source: 'bootstrap', phase: 'postboot', durationMs: Date.now() - BOOT_STARTED_AT });
      } else if (attempts >= 120) {
        clearInterval(timer);
        event('postboot_timeout', { source: 'bootstrap', status: 'degraded', phase: 'postboot', durationMs: Date.now() - BOOT_STARTED_AT }, 'warn');
      }
    }, 500);
  })();

  // === [CHECKIN.trace] — облачный трейс шагов чекина (TASK-012) ===
  // Слушает heys:day-updated, логирует presence ключевых полей дня + source +
  // dropped (поле было true → стало пусто = клоббер, см. TASK-010). Чистый
  // listener: НЕ трогает запись дня, всё в try/catch — трейс не ломает app.
  // console.info перехватывается этим же модулем → уезжает в client_log_trace.
  // Приватность: только presence (true/false) + имена полей, НЕ значения.
  (function () {
    function present(v) { return !(v === undefined || v === null || v === ''); }
    function presenceMap(d) {
      if (!d || typeof d !== 'object') return null;
      return {
        sleepStart: present(d.sleepStart),
        sleepEnd: present(d.sleepEnd),
        sleepQuality: present(d.sleepQuality),
        sleepHours: present(d.sleepHours) && Number(d.sleepHours) > 0,
        moodMorning: present(d.moodMorning),
        wellbeingMorning: present(d.wellbeingMorning),
        stressMorning: present(d.stressMorning),
        weightMorning: present(d.weightMorning),
        mealItems: Array.isArray(d.meals) ? d.meals.reduce(function (s, m) { return s + ((m && Array.isArray(m.items)) ? m.items.length : 0); }, 0) : 0,
        yvAction: d.yesterdayVerifyAction || null,
        updatedAt: d.updatedAt || null
      };
    }
    function getDayDateFromKey(k) {
      var m = String(k || '').match(/(?:^|_)dayv2_(\d{4}-\d{2}-\d{2})$/);
      return m ? m[1] : null;
    }
    function parseDayValue(v) {
      if (!v || typeof v !== 'string') return null;
      try {
        var d = JSON.parse(v);
        return d && typeof d === 'object' ? d : null;
      } catch (_) {
        return null;
      }
    }
    function readScopedDay(date) {
      try {
        var H = global.HEYS;
        var cid = (H && typeof H.currentClientId === 'string') ? H.currentClientId : '';
        var raw = cid ? global.localStorage.getItem('heys_' + cid + '_dayv2_' + date) : null;
        if (!raw) raw = global.localStorage.getItem('heys_dayv2_' + date);
        return raw ? JSON.parse(raw) : null;
      } catch (_) { return null; }
    }
    function isChronoEntriesKey(k) {
      return /(?:^|_)planning_chrono_entries$/.test(String(k || ''));
    }
    function summarizeChronoEntriesValue(v) {
      var arr = null;
      try {
        arr = typeof v === 'string' ? JSON.parse(v) : v;
      } catch (_) {
        arr = null;
      }
      if (!Array.isArray(arr)) return { kind: arr === null ? 'null' : typeof arr, entriesLen: null };
      var total = 0;
      for (var i = 0; i < arr.length; i++) total += Math.max(0, Math.round(Number(arr[i] && arr[i].minutes) || 0));
      var last = arr.length ? arr[arr.length - 1] : null;
      return {
        kind: 'array',
        entriesLen: arr.length,
        totalMinutes: total,
        lastEntry: last ? {
          id: last.id ? String(last.id) : null,
          activityId: last.activityId ? String(last.activityId) : null,
          date: last.date ? String(last.date) : null,
          minutes: Math.round(Number(last.minutes) || 0),
          at: last.at || null,
          createdAt: last.createdAt || null
        } : null
      };
    }
    var SUBJ = ['sleepStart', 'sleepEnd', 'sleepQuality', 'sleepHours', 'moodMorning', 'wellbeingMorning', 'stressMorning', 'weightMorning'];
    var prevByDate = {};
    var CHECKIN_RE = /checkin|sleep|mood|weight|supplement|cold-exposure|morning|yesterday-verify|step|persist|water/i;
    try {
      global.addEventListener('heys:day-updated', function (ev) {
        try {
          var detail = (ev && ev.detail) || {};
          var date = detail.date;
          if (!date || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
          var src = detail.source || detail.field || 'unknown';
          var d = (detail.data && typeof detail.data === 'object') ? detail.data : readScopedDay(date);
          var cur = presenceMap(d);
          if (!cur) return;
          var prev = prevByDate[date];
          var dropped = [];
          if (prev) {
            for (var i = 0; i < SUBJ.length; i++) {
              var k = SUBJ[i];
              if (prev[k] === true && cur[k] === false) dropped.push(k);
            }
          }
          prevByDate[date] = cur;
          // Шумоподавление: логируем только чекин-related источники ИЛИ клоббер.
          if (dropped.length || CHECKIN_RE.test(String(src))) {
            console.info('[CHECKIN.trace]', { date: date, source: src, dropped: dropped, presence: cur });
          }
        } catch (_) { /* trace must never break app */ }
      });
    } catch (_) { /* noop */ }
    try {
      var checkinFlushTimer = 0;
      global.addEventListener('heys:morning-checkin-status', function (ev) {
        try {
          var status = ev && ev.detail && ev.detail.status;
          console.info('[CHECKIN.trace] status_event', {
            reason: ev && ev.detail && ev.detail.reason,
            state: status && status.state,
            label: status && status.label,
            date: status && status.dateKey,
            flowStatus: status && status.flowStatus,
            counts: status && status.counts
          });
          if (checkinFlushTimer) clearTimeout(checkinFlushTimer);
          checkinFlushTimer = setTimeout(function () {
            checkinFlushTimer = 0;
            flush('checkin-status');
          }, 350);
        } catch (_) { /* trace must never break app */ }
      });
    } catch (_) { /* noop */ }

    // Storage-level trace: ловит фактические dayv2 writes, включая bypass через
    // сохранённый originalSetItem в storage bridge. Важно патчить prototype: сам
    // storage bridge позже оборачивает localStorage.setItem на instance-level.
    try {
      var proto = global.Storage && global.Storage.prototype;
      if (proto && typeof proto.setItem === 'function' && !proto.setItem.__HEYS_CHECKIN_TRACE__) {
        var rawSetItem = proto.setItem;
        var previousByDate = prevByDate;
        var tracedSetItem = function (k, v) {
          var ret = rawSetItem.apply(this, arguments);
          try {
            if (isChronoEntriesKey(k)) {
              trace('info', '[HEYS.chrono.trace]', {
                event: 'storage_chrono_entries_write',
                source: 'storage-setItem',
                flowId: lastFlowId('[HEYS.chrono.trace]', 4000),
                key: String(k || '').slice(0, 140),
                bytes: typeof v === 'string' ? v.length : null,
                summary: summarizeChronoEntriesValue(v)
              });
            }
          } catch (_) { /* trace must never break storage */ }
          try {
            var date = getDayDateFromKey(k);
            if (!date) return ret;
            var d = parseDayValue(v);
            var cur = presenceMap(d);
            if (!cur) return ret;
            var prev = previousByDate[date];
            var dropped = [];
            if (prev) {
              for (var i = 0; i < SUBJ.length; i++) {
                var name = SUBJ[i];
                if (prev[name] === true && cur[name] === false) dropped.push(name);
              }
            }
            previousByDate[date] = cur;
            if (dropped.length || cur.weightMorning || cur.sleepHours || cur.sleepStart || cur.sleepEnd) {
              console.info('[CHECKIN.trace]', {
                date: date,
                source: 'storage-setItem',
                key: String(k || '').slice(0, 140),
                dropped: dropped,
                presence: cur
              });
            }
          } catch (_) { /* trace must never break storage */ }
          return ret;
        };
        tracedSetItem.__HEYS_CHECKIN_TRACE__ = true;
        proto.setItem = tracedSetItem;
      }
    } catch (_) { /* noop */ }
  })();
})(typeof window !== 'undefined' ? window : globalThis);
