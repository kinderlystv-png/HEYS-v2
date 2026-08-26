// heys_cycle_ui_v1.js — v4 cycle UI helpers (check-in, calendar, nutrition card)
(function (global) {
  'use strict';

  const HEYS = (global.HEYS = global.HEYS || {});
  const Cycle = HEYS.Cycle || {};

  const DAY_LABELS_1_7 = Object.freeze({
    1: 'начало',
    2: 'начало',
    3: 'начало',
    4: 'середина',
    5: 'середина',
    6: 'конец',
    7: 'конец',
  });

  function parseIsoDate(iso) {
    if (!iso || typeof iso !== 'string') return null;
    const parts = iso.split('-').map(Number);
    if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function formatIsoDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function addDaysIso(iso, offset) {
    const dt = parseIsoDate(iso);
    if (!dt) return iso;
    dt.setDate(dt.getDate() + offset);
    return formatIsoDate(dt);
  }

  function readDayCycleDay(dateKey, lsGet) {
    try {
      const getter = lsGet || HEYS.utils?.lsGet;
      if (!getter) return null;
      const key = `heys_dayv2_${dateKey}`;
      const day = getter(key, null);
      const value = Number(day?.cycleDay);
      return Number.isFinite(value) && value >= 1 && value <= 7 ? value : null;
    } catch (_) {
      return null;
    }
  }

  function getDayLabelWithinWeek(cycleDay) {
    const n = Number(cycleDay);
    if (!Number.isFinite(n) || n < 1 || n > 7) return '';
    return DAY_LABELS_1_7[n] || '';
  }

  function getSuggestedCycleDay(dateKey, lsGet) {
    const yesterday = addDaysIso(dateKey, -1);
    const prev = readDayCycleDay(yesterday, lsGet);
    if (!prev) return null;
    if (prev >= 7) return null;
    return prev + 1;
  }

  function isCycleWeekCardMode(dateKey, cycleDay, lsGet) {
    const dayNum = Number(cycleDay);
    if (Number.isFinite(dayNum) && dayNum >= 1 && dayNum <= 7) return true;
    const suggested = getSuggestedCycleDay(dateKey, lsGet);
    return suggested != null;
  }

  function resolveCycleDayForUi(dateKey, cycleDay, lsGet) {
    const dayNum = Number(cycleDay);
    if (Number.isFinite(dayNum) && dayNum >= 1 && dayNum <= 7) return dayNum;
    return getSuggestedCycleDay(dateKey, lsGet) || 1;
  }

  function formatCycleWeekBadge(cycleDay) {
    const label = getDayLabelWithinWeek(cycleDay);
    return label ? `День ${cycleDay} · ${label}` : `День ${cycleDay}`;
  }

  function formatCycleWeekHint(dateKey, cycleDay, lsGet) {
    const suggested = getSuggestedCycleDay(dateKey, lsGet);
    if (!suggested) return 'Выберите номер дня периода.';
    const prev = suggested - 1;
    if (prev >= 1 && prev <= 7) {
      return `Вчера был ${prev}-й. Если сегодня иначе — переставьте номер.`;
    }
    return 'Если сегодня иначе — переставьте номер.';
  }

  function buildCycleRibbonMeta(daysDataMap, dateStr, calendarCells) {
    const dayData = daysDataMap?.get?.(dateStr);
    const cycleDay = Number(dayData?.cycleDay);
    const hasPeriod = Number.isFinite(cycleDay) && cycleDay >= 1 && cycleDay <= 7;
    if (!hasPeriod) {
      return { ribbon: null, ariaSuffix: '' };
    }

    const idx = Array.isArray(calendarCells)
      ? calendarCells.findIndex((cell) => cell && formatIsoDate(cell) === dateStr)
      : -1;
    const prevStr = idx > 0 && calendarCells[idx - 1] ? formatIsoDate(calendarCells[idx - 1]) : null;
    const nextStr = idx >= 0 && calendarCells[idx + 1] ? formatIsoDate(calendarCells[idx + 1]) : null;
    const prevDay = prevStr ? daysDataMap.get(prevStr) : null;
    const nextDay = nextStr ? daysDataMap.get(nextStr) : null;
    const prevPeriod = Number(prevDay?.cycleDay) >= 1 && Number(prevDay?.cycleDay) <= 7;
    const nextPeriod = Number(nextDay?.cycleDay) >= 1 && Number(nextDay?.cycleDay) <= 7;

    const classes = ['cycle-ribbon', 'cycle-ribbon--period'];
    if (!prevPeriod) classes.push('cycle-ribbon--start');
    if (!nextPeriod) classes.push('cycle-ribbon--end');

    return {
      ribbon: classes.join(' '),
      ariaSuffix: ', особые дни',
    };
  }

  function buildCycleForecastMeta(dateStr, forecastDates) {
    if (!Array.isArray(forecastDates) || !forecastDates.includes(dateStr)) {
      return { ribbon: null, ariaSuffix: '', forecastLabel: null };
    }
    return {
      ribbon: 'cycle-ribbon cycle-ribbon--forecast',
      ariaSuffix: ', ожидается период',
      forecastLabel: null,
    };
  }

  function computeCycleForecastDates(lastMarkedDate, todayIso) {
    if (!lastMarkedDate || !todayIso) return [];
    const anchor = parseIsoDate(lastMarkedDate);
    const today = parseIsoDate(todayIso);
    if (!anchor || !today) return [];
    const expectedStart = new Date(anchor.getTime());
    expectedStart.setDate(expectedStart.getDate() + 28);
    const out = [];
    for (let i = 0; i < 5; i += 1) {
      const d = new Date(expectedStart.getTime());
      d.setDate(d.getDate() + i);
      out.push(formatIsoDate(d));
    }
    return out;
  }

  function findLastCycleMarkDate(todayIso, lsGet, lookbackDays) {
    const getter = lsGet || HEYS.utils?.lsGet;
    if (!getter || !todayIso) return null;
    const max = Number.isFinite(lookbackDays) ? lookbackDays : 60;
    for (let i = 0; i <= max; i += 1) {
      const key = addDaysIso(todayIso, -i);
      const day = getter(`heys_dayv2_${key}`, null);
      if (day?.cycleDay >= 1 && day?.cycleDay <= 7) return key;
    }
    return null;
  }

  function formatForecastMonthLine(forecastDates) {
    if (!Array.isArray(forecastDates) || forecastDates.length === 0) return null;
    const first = parseIsoDate(forecastDates[0]);
    if (!first) return null;
    const day = first.getDate();
    const month = first.toLocaleDateString('ru-RU', { month: 'long' });
    return `следующий — ${day}-го`;
  }

  function pushCycleUndo(label, onUndo, onExpire) {
    if (!HEYS.Undo || typeof HEYS.Undo.push !== 'function') {
      if (typeof onExpire === 'function') onExpire('no-undo');
      return;
    }
    HEYS.Undo.push({
      label,
      onUndo,
      onExpire,
      duration: 5000,
    });
  }

  function applyCycleDaySelection(dateKey, cycleDay, lsGet, lsSet) {
    if (Cycle.setCycleDaysAuto) {
      Cycle.setCycleDaysAuto(dateKey, cycleDay, lsGet, lsSet);
      return;
    }
    const getter = lsGet || HEYS.utils?.lsGet;
    const setter = lsSet || HEYS.utils?.lsSet;
    if (!getter || !setter) return;
    const key = `heys_dayv2_${dateKey}`;
    const day = { ...(getter(key, {}) || {}), date: dateKey, cycleDay, cycleStatus: null, cycleAnsweredAt: Date.now() };
    setter(key, day);
  }

  function clearCycleWeek(dateKey, lsGet, lsSet) {
    if (Cycle.clearCycleDays) {
      return Cycle.clearCycleDays(dateKey, lsGet, lsSet);
    }
    return { cleared: 0, dates: [] };
  }

  function snapshotCycleWeek(dateKey, lsGet) {
    const getter = lsGet || HEYS.utils?.lsGet;
    const snap = [];
    if (!getter) return snap;
    for (let d = 1; d <= 7; d += 1) {
      const offset = d - (Number(readDayCycleDay(dateKey, getter)) || 1);
      const key = addDaysIso(dateKey, offset);
      const day = getter(`heys_dayv2_${key}`, null);
      if (day?.cycleDay >= 1 && day?.cycleDay <= 7) {
        snap.push({ date: key, cycleDay: day.cycleDay, cycleStatus: day.cycleStatus || null });
      }
    }
    return snap;
  }

  function restoreCycleWeekSnapshot(snapshot, lsGet, lsSet) {
    const getter = lsGet || HEYS.utils?.lsGet;
    const setter = lsSet || HEYS.utils?.lsSet;
    if (!getter || !setter || !Array.isArray(snapshot)) return;
    snapshot.forEach((row) => {
      const key = `heys_dayv2_${row.date}`;
      const day = { ...(getter(key, {}) || {}), date: row.date, cycleDay: row.cycleDay, cycleStatus: row.cycleStatus };
      setter(key, day);
    });
  }

  HEYS.CycleUI = {
    DAY_LABELS_1_7,
    parseIsoDate,
    formatIsoDate,
    addDaysIso,
    readDayCycleDay,
    getDayLabelWithinWeek,
    getSuggestedCycleDay,
    isCycleWeekCardMode,
    resolveCycleDayForUi,
    formatCycleWeekBadge,
    formatCycleWeekHint,
    buildCycleRibbonMeta,
    buildCycleForecastMeta,
    computeCycleForecastDates,
    findLastCycleMarkDate,
    formatForecastMonthLine,
    pushCycleUndo,
    applyCycleDaySelection,
    clearCycleWeek,
    snapshotCycleWeek,
    restoreCycleWeekSnapshot,
  };
})(typeof window !== 'undefined' ? window : globalThis);
