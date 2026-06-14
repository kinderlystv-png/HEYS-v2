// heys_kernel_dates_v1.js — ОБЩЕЕ ЯДРО: date keys and day arithmetic.
//
// Training modes intentionally use both local and UTC date keys:
// - fingers calendar/day logs are local user days;
// - mobility weekly helper already used UTC ISO days for incoming Date values.
// Kernel exposes both variants explicitly so domains do not accidentally change
// calendar semantics while sharing one tested implementation.

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const TK = HEYS.TrainingKernel = HEYS.TrainingKernel || {};
  if (TK.dates && TK.dates.__registered) return; // idempotent

  const DAY_MS = 24 * 60 * 60 * 1000;

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function asDate(input) {
    const d = input instanceof Date ? new Date(input.getTime()) : new Date(input);
    return isFinite(d.getTime()) ? d : null;
  }

  function startDate(input, fallback) {
    const d = input ? asDate(input) : null;
    if (d) return d;
    const fb = fallback ? asDate(fallback) : null;
    return fb || new Date();
  }

  function dateKeyLocal(input) {
    const d = startDate(input);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function dateKeyUTC(input) {
    const d = startDate(input);
    return d.toISOString().slice(0, 10);
  }

  function todayKeyLocal(now) {
    return dateKeyLocal(now || new Date());
  }

  function addDays(input, days) {
    const d = startDate(input);
    return new Date(d.getTime() + (Number(days) || 0) * DAY_MS);
  }

  function dayLabel(index, labels) {
    const list = Array.isArray(labels) && labels.length ? labels : ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    return list[index % list.length] || String(index + 1);
  }

  function sequenceDays(startInput, count, opts) {
    const o = opts || {};
    const start = startDate(startInput, o.fallbackDate);
    const total = Math.max(0, Number(count) || 0);
    const keyFn = typeof o.dateKey === 'function'
      ? o.dateKey
      : (o.utc === true ? dateKeyUTC : dateKeyLocal);
    const out = [];
    for (let i = 0; i < total; i++) {
      const date = addDays(start, i);
      out.push({
        index: i,
        date: date,
        dateKey: keyFn(date),
        label: dayLabel(i, o.labels)
      });
    }
    return out;
  }

  // ТОЛЬКО для LOCAL date-keys (YYYY-MM-DD от dateKeyLocal): 'T00:00:00' без Z
  // парсится в локальной зоне. НЕ смешивать с dateKeyUTC-ключами — разница зон/DST
  // даст дрейф на сутки. mobility weekly planner (UTC-дни) не должен звать это.
  function daysBetweenDateKeys(startKey, endKey) {
    const a = Date.parse(String(startKey || '') + 'T00:00:00');
    const b = Date.parse(String(endKey || '') + 'T00:00:00');
    if (!isFinite(a) || !isFinite(b)) return 0;
    return Math.max(0, Math.floor((b - a) / DAY_MS));
  }

  TK.dates = {
    __registered: true,
    DAY_MS: DAY_MS,
    asDate: asDate,
    startDate: startDate,
    dateKeyLocal: dateKeyLocal,
    dateKeyUTC: dateKeyUTC,
    todayKeyLocal: todayKeyLocal,
    addDays: addDays,
    dayLabel: dayLabel,
    sequenceDays: sequenceDays,
    daysBetweenDateKeys: daysBetweenDateKeys
  };
})(typeof window !== 'undefined' ? window : globalThis);
