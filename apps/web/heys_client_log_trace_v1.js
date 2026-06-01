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

  // Original methods — никогда НЕ заменяются, чтобы flush() не зацикливался.
  var orig = {
    log:   console.log.bind(console),
    info:  console.info.bind(console),
    warn:  console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug ? console.debug.bind(console) : console.log.bind(console)
  };

  var ring = []; // [{level, message, args, client_ts, page_url}]
  var ringDropped = 0;
  var lastFlushAt = 0;
  var flushInProgress = false;

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
      if (i > 0) extras.push(args[i]);
    }
    var msg = parts.join(' ');
    if (msg.length > MAX_MSG_LEN) msg = msg.slice(0, MAX_MSG_LEN) + ' …[truncated]';
    return { message: msg, args: extras.length ? extras : null };
  }

  function push(level, args) {
    try {
      var c = captureArgs(args);
      if (ring.length >= RING_MAX) {
        ring.shift();
        ringDropped++;
      }
      ring.push({
        level: level,
        message: c.message,
        args: c.args,
        client_ts: new Date().toISOString(),
        page_url: typeof location !== 'undefined' ? location.href.slice(0, 1000) : null
      });
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
    push('error', ['[window.error]', ev.message, ev.filename + ':' + ev.lineno + ':' + ev.colno, ev.error && ev.error.stack]);
    flush('error-event');
  });
  global.addEventListener('unhandledrejection', function (ev) {
    var reason = ev.reason;
    push('error', ['[unhandledrejection]', reason && (reason.message || reason)]);
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
        page_url: e.page_url
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
        keepalive: true
      }).catch(function () {
        // Сетевой сбой — НЕ возвращаем строки в ring (риск зацикливания).
        // Просто теряем batch — это диагностика, не критичные данные.
      }).then(function () {
        flushInProgress = false;
      });
    } catch (_) {
      flushInProgress = false;
    }
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
    stats: function () {
      return {
        buffered: ring.length,
        dropped: ringDropped,
        lastFlushAt: lastFlushAt,
        sessionId: SESSION_ID,
        endpoint: ENDPOINT
      };
    },
    sessionId: SESSION_ID
  };

  // Маркер для timing-диагностики (отдельный console.info чтобы поймать сам бутстрап в логе)
  orig.info('[heys.log-trace] installed v1, session=' + SESSION_ID + ', endpoint=' + ENDPOINT);
})(typeof window !== 'undefined' ? window : globalThis);
