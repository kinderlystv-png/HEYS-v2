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
          console.warn('[CHECKIN.trace] status_event', {
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
