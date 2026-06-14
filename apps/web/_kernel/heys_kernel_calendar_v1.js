// heys_kernel_calendar_v1.js — ОБЩЕЕ ЯДРО: calendar/grid primitives.
//
// Домен сам решает, что ставить в день (modeId, cooldown, sessions). Ядро
// строит только календарную сетку: N дней, месяц, годовая Monday-first heatmap.

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const TK = HEYS.TrainingKernel = HEYS.TrainingKernel || {};
  if (TK.calendar && TK.calendar.__registered) return;

  const DAY_MS = 24 * 60 * 60 * 1000;
  const WEEKDAY_LABELS = Object.freeze(['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']);

  function datesKernel() {
    return TK.dates || null;
  }

  function startDate(input) {
    const kd = datesKernel();
    if (kd && typeof kd.startDate === 'function') return kd.startDate(input);
    const d = input ? new Date(input) : new Date();
    return isFinite(d.getTime()) ? d : new Date();
  }

  function dateKey(date, opts) {
    const kd = datesKernel();
    const utc = opts && opts.utc === true;
    if (kd && utc && typeof kd.dateKeyUTC === 'function') return kd.dateKeyUTC(date);
    if (kd && !utc && typeof kd.dateKeyLocal === 'function') return kd.dateKeyLocal(date);
    const d = new Date(date);
    if (utc) return d.toISOString().slice(0, 10);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function addDays(date, delta) {
    const kd = datesKernel();
    if (kd && typeof kd.addDays === 'function') return kd.addDays(date, delta);
    return new Date(new Date(date).getTime() + Number(delta || 0) * DAY_MS);
  }

  function dayLabel(index) {
    const kd = datesKernel();
    if (kd && typeof kd.dayLabel === 'function') return kd.dayLabel(index);
    return WEEKDAY_LABELS[index] || String(Number(index) + 1);
  }

  function buildDays(input, count, opts) {
    const o = opts || {};
    const start = startDate(input);
    const len = Math.max(0, Number(count) || 0);
    const kd = datesKernel();
    const base = kd && typeof kd.sequenceDays === 'function'
      ? kd.sequenceDays(start, len, { utc: o.utc === true })
      : Array.from({ length: len }, function (_, i) {
        const date = addDays(start, i);
        return { index: i, date: date, dateKey: dateKey(date, o), label: dayLabel(i) };
      });
    return base.map(function (day, i) {
      return {
        index: day.index != null ? day.index : i,
        date: day.date || addDays(start, i),
        dateKey: day.dateKey || dateKey(day.date || addDays(start, i), o),
        label: day.label || dayLabel(i)
      };
    });
  }

  function monthCells(year, month) {
    const y = Number(year);
    const m = Number(month);
    const first = new Date(y, m, 1);
    const firstDayOfWeek = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstDayOfWeek; i++) {
      cells.push({ empty: true, key: 'e-' + i });
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(y, m, day);
      const key = dateKey(d, { utc: false });
      cells.push({ day: day, date: d, dateKey: key, key: key });
    }
    return cells;
  }

  function yearGrid(year) {
    const y = Number(year) || new Date().getFullYear();
    const start = new Date(y, 0, 1);
    const dayOfWeek = (start.getDay() + 6) % 7;
    const firstCol = new Date(start);
    firstCol.setDate(start.getDate() - dayOfWeek);

    const weeks = [];
    for (let w = 0; w < 53; w++) {
      const week = [];
      for (let dow = 0; dow < 7; dow++) {
        const d = new Date(firstCol);
        d.setDate(firstCol.getDate() + w * 7 + dow);
        const inYear = d.getFullYear() === y;
        week.push({
          weekIndex: w,
          dayIndex: dow,
          date: d,
          dateKey: inYear ? dateKey(d, { utc: false }) : null,
          inYear: inYear
        });
      }
      weeks.push(week);
    }
    return weeks;
  }

  TK.calendar = {
    __registered: true,
    WEEKDAY_LABELS: WEEKDAY_LABELS,
    startDate: startDate,
    dateKey: dateKey,
    addDays: addDays,
    dayLabel: dayLabel,
    buildDays: buildDays,
    monthCells: monthCells,
    yearGrid: yearGrid
  };
})(typeof window !== 'undefined' ? window : globalThis);
