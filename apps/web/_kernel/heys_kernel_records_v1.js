// heys_kernel_records_v1.js — ОБЩЕЕ ЯДРО: client-scoped JSON records storage.
//
// Single source нижнего storage-слоя для тренировочных режимов: построение
// client-scoped ключей, safe JSON read/write, memory storage для тестов,
// capped/windowed append для историй. Доменные PR/ROM/session semantics остаются
// в режимах.

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const TK = HEYS.TrainingKernel = HEYS.TrainingKernel || {};
  if (TK.records && TK.records.__registered) return; // idempotent

  function createMemoryStorage() {
    const data = {};
    return {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
      setItem: function (k, v) { data[k] = String(v); },
      removeItem: function (k) { delete data[k]; },
      _data: data
    };
  }

  function cloneEmpty(empty) {
    const base = (typeof empty === 'function') ? empty() : (empty || {});
    return Object.assign({}, base);
  }

  function clientKey(prefix, clientId, opts) {
    const o = opts || {};
    const cid = clientId || '';
    if (o.style === 'heys-client-prefix') {
      return cid ? ('heys_' + cid + '_' + prefix) : ('heys_' + prefix);
    }
    const sep = o.separator || ':';
    return String(prefix || '') + sep + (cid || (o.defaultClientId || 'default'));
  }

  function readJson(storage, key, empty) {
    const fallback = cloneEmpty(empty);
    const s = storage || global.localStorage || null;
    if (!s || typeof s.getItem !== 'function' || !key) return fallback;
    try {
      const raw = s.getItem(key);
      const parsed = raw ? JSON.parse(raw) : {};
      return Object.assign(fallback, parsed && typeof parsed === 'object' ? parsed : {});
    } catch (_e) {
      return fallback;
    }
  }

  function writeJson(storage, key, data, empty) {
    const s = storage || global.localStorage || null;
    if (!s || typeof s.setItem !== 'function' || !key) return false;
    try {
      const payload = Object.assign(cloneEmpty(empty), data || {});
      s.setItem(key, JSON.stringify(payload));
      return true;
    } catch (_e) {
      return false;
    }
  }

  function appendCapped(list, item, cap) {
    const arr = Array.isArray(list) ? list : [];
    arr.push(item);
    return capList(arr, cap);
  }

  function capList(list, cap) {
    const arr = Array.isArray(list) ? list : [];
    const max = Number(cap) || 0;
    if (max > 0 && arr.length > max) arr.splice(0, arr.length - max);
    return arr;
  }

  function windowMs(opts) {
    const o = opts || {};
    if (typeof o.windowMs === 'number') return o.windowMs;
    if (typeof o.windowHours === 'number') return o.windowHours * 3600 * 1000;
    if (typeof o.windowDays === 'number') return o.windowDays * 24 * 3600 * 1000;
    return 0;
  }

  function timestampOf(entry, key) {
    if (!entry || typeof entry !== 'object') return null;
    const value = entry[key || 'timestamp'];
    return typeof value === 'number' ? value : null;
  }

  function timestampFrom(entry, keys) {
    if (!entry || typeof entry !== 'object') return null;
    const list = Array.isArray(keys) ? keys : [keys || 'timestamp'];
    for (let i = 0; i < list.length; i++) {
      const value = entry[list[i]];
      if (typeof value === 'number' && isFinite(value)) return value;
      if (typeof value === 'string') {
        const parsed = Date.parse(value);
        if (isFinite(parsed) && parsed > 0) return parsed;
      }
    }
    return null;
  }

  function inWindow(entry, opts) {
    const o = opts || {};
    const key = o.timestampKey || 'timestamp';
    const ts = timestampOf(entry, key);
    if (ts === null) return true;
    const nowMs = typeof o.nowMs === 'number' ? o.nowMs : Date.now();
    const span = windowMs(o);
    if (span > 0 && ts < nowMs - span) return false;
    if (o.upperBoundNow === true && ts > nowMs) return false;
    return true;
  }

  function appendWindowed(existing, incoming, opts) {
    const o = opts || {};
    const base = Array.isArray(existing) ? existing.slice() : [];
    const items = Array.isArray(incoming) ? incoming : (incoming ? [incoming] : []);
    const next = base.concat(items).filter(function (entry) { return inWindow(entry, o); });
    return capList(next, o.cap);
  }

  function recentWindow(entries, opts) {
    const o = opts || {};
    const key = o.timestampKey || 'timestamp';
    const limit = typeof o.limit === 'number' ? o.limit : 0;
    const filtered = (Array.isArray(entries) ? entries : [])
      .filter(function (entry) { return inWindow(entry, o); });
    if (o.sortAsc !== false) {
      filtered.sort(function (a, b) { return (timestampOf(a, key) || 0) - (timestampOf(b, key) || 0); });
    }
    return limit > 0 ? filtered.slice(Math.max(0, filtered.length - limit)) : filtered;
  }

  function sortByTimestamp(entries, opts) {
    const o = opts || {};
    const keys = o.timestampKeys || o.timestampKey || 'timestamp';
    const arr = (Array.isArray(entries) ? entries : []).slice();
    arr.sort(function (a, b) {
      const ta = timestampFrom(a, keys) || 0;
      const tb = timestampFrom(b, keys) || 0;
      return o.desc === true ? tb - ta : ta - tb;
    });
    return arr;
  }

  function mapTimeSeries(entries, mapper, opts) {
    const o = opts || {};
    const fn = typeof mapper === 'function' ? mapper : function (x) { return x; };
    const valueKey = o.valueKey || null;
    const minValue = typeof o.minValue === 'number' ? o.minValue : 0;
    const out = [];
    (Array.isArray(entries) ? entries : []).forEach(function (entry, index) {
      const point = fn(entry, index);
      if (!point || typeof point !== 'object') return;
      const ts = Number(point.ts != null ? point.ts : timestampFrom(point, o.timestampKeys || o.timestampKey || 'ts'));
      if (o.requireTimestamp !== false && (!isFinite(ts) || ts <= 0)) return;
      const next = Object.assign({}, point, isFinite(ts) && ts > 0 ? { ts: ts } : {});
      if (valueKey) {
        const value = Number(next[valueKey]);
        if (!isFinite(value) || value <= minValue) return;
      }
      out.push(next);
    });
    return o.sort === false ? out : sortByTimestamp(out, { timestampKey: 'ts', desc: o.desc === true });
  }

  function selectSeries(seriesByKey, opts) {
    const o = opts || {};
    const map = seriesByKey && typeof seriesByKey === 'object' ? seriesByKey : {};
    const canonicalKey = o.canonicalKey || null;
    const tsKey = o.timestampKey || 'ts';
    const canonical = canonicalKey && Array.isArray(map[canonicalKey]) ? map[canonicalKey] : [];
    if (canonical.length) return { key: canonicalKey, series: canonical };
    let chosenKey = null;
    let chosenSeries = [];
    Object.keys(map).forEach(function (key) {
      const series = Array.isArray(map[key]) ? map[key] : [];
      if (!series.length) return;
      const last = series.length ? (timestampFrom(series[series.length - 1], tsKey) || 0) : 0;
      const chosenLast = chosenSeries.length ? (timestampFrom(chosenSeries[chosenSeries.length - 1], tsKey) || 0) : 0;
      if (series.length > chosenSeries.length || (series.length === chosenSeries.length && last > chosenLast)) {
        chosenKey = key;
        chosenSeries = series;
      }
    });
    return { key: chosenKey, series: chosenSeries };
  }

  function appendField(data, field, item, opts) {
    const o = opts || {};
    const key = String(field || '');
    const next = Object.assign({}, data || {});
    const current = Array.isArray(next[key]) ? next[key] : [];
    next[key] = o.windowed === true
      ? appendWindowed(current, item, o)
      : appendCapped(current.slice(), item, o.cap);
    return next;
  }

  function latestInField(data, field) {
    const list = data && Array.isArray(data[field]) ? data[field] : [];
    return list.length ? list[list.length - 1] : null;
  }

  function makeId(parts, opts) {
    const o = opts || {};
    const sep = o.separator || '_';
    return (Array.isArray(parts) ? parts : [parts]).map(function (p) {
      return String(p == null ? '' : p).trim().replace(/\s+/g, '-');
    }).filter(Boolean).join(sep);
  }

  function maxWins(existing, candidate, opts) {
    const o = opts || {};
    if (!existing) return true;
    if (!candidate || typeof candidate !== 'object') return false;
    const typeKey = o.typeKey || 'type';
    const dateKey = o.dateKey || 'testedAt';
    if (existing[typeKey] !== candidate[typeKey]) return true;
    const metrics = o.metricsByType || {};
    const metricKey = metrics[candidate[typeKey]] || o.metricKey;
    if (!metricKey) return false;
    const newVal = Number(candidate[metricKey]) || 0;
    const oldVal = Number(existing[metricKey]) || 0;
    if (newVal > oldVal) return true;
    if (newVal < oldVal) return false;
    const newT = Date.parse(candidate[dateKey]) || 0;
    const oldT = Date.parse(existing[dateKey]) || 0;
    return newT >= oldT;
  }

  TK.records = {
    __registered: true,
    createMemoryStorage: createMemoryStorage,
    clientKey: clientKey,
    readJson: readJson,
    writeJson: writeJson,
    appendCapped: appendCapped,
    capList: capList,
    appendWindowed: appendWindowed,
    recentWindow: recentWindow,
    timestampFrom: timestampFrom,
    sortByTimestamp: sortByTimestamp,
    mapTimeSeries: mapTimeSeries,
    selectSeries: selectSeries,
    appendField: appendField,
    latestInField: latestInField,
    makeId: makeId,
    maxWins: maxWins
  };
})(typeof window !== 'undefined' ? window : globalThis);
