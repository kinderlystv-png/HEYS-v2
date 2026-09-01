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

  function getTodayIso() {
    try {
      return HEYS.dayUtils?.todayISO?.() || HEYS.dayUtils?.calendarTodayISO?.() || formatIsoDate(new Date());
    } catch (_) {
      return formatIsoDate(new Date());
    }
  }

  function formatHumanDate(iso) {
    const dt = parseIsoDate(iso);
    if (!dt) return iso || '';
    return dt.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  function formatShortHumanDate(iso) {
    const dt = parseIsoDate(iso);
    if (!dt) return iso || '';
    return dt.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  }

  function formatConfirmHeadline(markDate, todayIso) {
    if (markDate === todayIso) return 'Это было сегодня';
    return formatHumanDate(markDate);
  }

  function formatWeekRangeForMark(markDate, cycleDay) {
    const dayNum = Number(cycleDay);
    if (!Number.isFinite(dayNum) || dayNum < 1 || dayNum > 7) return '';
    const start = addDaysIso(markDate, -(dayNum - 1));
    const end = addDaysIso(markDate, 7 - dayNum);
    return `Период встанет на ${formatShortHumanDate(start)}–${formatShortHumanDate(end)}`;
  }

  function formatCycleDayOrdinal(n) {
    return `${n}-й`;
  }

  function isWithinBackdateWindow(dateKey, todayIso, maxDays) {
    const today = parseIsoDate(todayIso || getTodayIso());
    const target = parseIsoDate(dateKey);
    if (!today || !target) return false;
    const diff = Math.round((today - target) / 86400000);
    const limit = Number.isFinite(maxDays) ? maxDays : 28;
    return diff >= 0 && diff <= limit;
  }

  function getCycleCountDayForDate(dateKey, lsGet) {
    if (Cycle.getCycleCountDay) return Cycle.getCycleCountDay(dateKey, lsGet);
    return null;
  }

  function shouldShowDay29Question(dateKey, lsGet) {
    const start = Cycle.findCycleStartForDate?.(dateKey, lsGet);
    if (!start) return false;
    const count = (Cycle.daysBetween?.(start, dateKey) ?? 0) + 1;
    return count > 28;
  }

  function getEarlyMarkWarningDay(dateKey, lsGet) {
    const countDay = getCycleCountDayForDate(dateKey, lsGet);
    if (!countDay || countDay < 8 || countDay > 20) return null;
    return countDay;
  }

  function shouldHideCycleForecast(lastMark, todayIso, lsGet) {
    if (!lastMark) return true;
    const diff = Cycle.daysBetween?.(lastMark, todayIso) ?? 999;
    if (diff > 28) return true;
    const getter = lsGet || HEYS.utils?.lsGet;
    const lastDay = getter?.(`heys_dayv2_${lastMark}`, null);
    if (lastDay?.cycleStatus === 'none') return true;
    return false;
  }

  function notifyDayUpdated(markDate) {
    if (typeof global.dispatchEvent !== 'function') return;
    try {
      global.dispatchEvent(new CustomEvent('heys:day-updated', { detail: { date: markDate } }));
    } catch (_) { /* noop */ }
  }

  function renderDecisionButtons(React, buttons) {
    return React.createElement('div', { className: 'cycle-v4-btns' },
      buttons.map((btn) => React.createElement('button', {
        key: btn.key,
        type: 'button',
        className: 'cycle-v4-btn' + (btn.kind ? ` cycle-v4-btn--${btn.kind}` : ''),
        onClick: btn.onClick,
      }, btn.label)));
  }

  function formatCycleNormKcal(value) {
    const n = Math.round(Number(value) || 0);
    return n.toLocaleString('ru-RU') + ' ккал';
  }

  function renderCycleNormRows(React, params) {
    const { eatenKcal, budgetKcal, cycleKcalMultiplier } = params || {};
    const mult = Number(cycleKcalMultiplier) || 1;
    if (mult <= 1) return null;
    const pct = Math.round((mult - 1) * 100);
    return React.createElement('div', { className: 'cycle-card-v4__norm-rows' },
      React.createElement('div', { className: 'cycle-card-v4__norm-row' },
        React.createElement('span', null, 'Съедено'),
        React.createElement('span', { className: 'cycle-card-v4__norm-value is-muted' },
          formatCycleNormKcal(eatenKcal))
      ),
      React.createElement('div', { className: 'cycle-card-v4__norm-row' },
        React.createElement('span', null, 'Нужно съесть'),
        React.createElement('span', { className: 'cycle-card-v4__norm-value' },
          React.createElement('span', { className: 'cycle-card-v4__norm-pill' }, '+' + pct + ' %'),
          formatCycleNormKcal(budgetKcal)
        )
      )
    );
  }

  function renderCycleMarkingPanel(ctx) {
    const {
      React,
      variant = 'card',
      date,
      day,
      setDay,
      lsGet,
      lsSet,
      haptic,
      isReadOnly,
      cyclePhase,
      showCycleCard = true,
      eatenKcal,
      budgetKcal,
      cycleKcalMultiplier,
    } = ctx || {};

    if (!React || !showCycleCard) return null;

    const dateKey = date || day?.date || getTodayIso();
    const todayIso = getTodayIso();
    const backdateAllowed = isWithinBackdateWindow(dateKey, todayIso, 28);
    const getter = lsGet || HEYS.utils?.lsGet;
    const setter = lsSet || HEYS.utils?.lsSet;

    function Panel() {
      const [editMode, setEditMode] = React.useState(false);
      const [pendingDay, setPendingDay] = React.useState(null);
      const [pendingDate, setPendingDate] = React.useState(dateKey);
      const [calendarOpen, setCalendarOpen] = React.useState(false);
      const [earlyWarn, setEarlyWarn] = React.useState(null);
      const [day29Open, setDay29Open] = React.useState(false);

      const storedDay = Number(day?.cycleDay);
      const hasStoredDay = Number.isFinite(storedDay) && storedDay >= 1 && storedDay <= 7;
      const countDay = getCycleCountDayForDate(dateKey, getter);
      const phase = cyclePhase || Cycle.getCyclePhase?.(countDay || storedDay);
      const phaseLabel = phase?.shortName || 'Особый период';
      const showDay29 = !hasStoredDay && !editMode && shouldShowDay29Question(dateKey, getter);

      const commitSelection = React.useCallback((markDay, markDate) => {
        if (isReadOnly || !Number.isFinite(markDay)) return;
        applyCycleDaySelection(markDate, markDay, getter, setter);
        if (typeof setDay === 'function') {
          setDay((prev) => ({
            ...(prev || {}),
            date: markDate,
            cycleDay: markDay,
            cycleStatus: null,
            cycleAnsweredAt: Date.now(),
            cycleUpdatedAt: Date.now(),
            updatedAt: Date.now(),
          }));
        } else {
          notifyDayUpdated(markDate);
        }
        setEditMode(false);
        setPendingDay(null);
        setPendingDate(markDate);
        setEarlyWarn(null);
        setDay29Open(false);
        haptic?.('light');
      }, [getter, setter, haptic, isReadOnly, setDay]);

      const requestDaySelection = React.useCallback((markDay) => {
        if (isReadOnly) return;
        setPendingDay(markDay);
        setPendingDate(dateKey);
        setEditMode(true);
        setEarlyWarn(markDay === 1 ? getEarlyMarkWarningDay(dateKey, getter) : null);
      }, [dateKey, getter, isReadOnly]);

      const confirmDefaultDate = React.useCallback(() => {
        if (pendingDay == null || earlyWarn != null) return;
        commitSelection(pendingDay, pendingDate || dateKey);
      }, [pendingDay, pendingDate, dateKey, earlyWarn, commitSelection]);

      const dayButtons = React.createElement('div', {
        className: variant === 'nutrition' ? 'nutrition-v4-cycle-days' : 'cycle-card-v4__days',
        role: 'radiogroup',
        'aria-label': 'Какой день',
      }, [1, 2, 3, 4, 5, 6, 7].map((d) => React.createElement('button', {
        key: d,
        type: 'button',
        role: 'radio',
        className: (variant === 'nutrition' ? 'nutrition-v4-cycle-day' : 'cycle-card-v4__day-btn')
          + ((pendingDay === d || (!pendingDay && storedDay === d))
            ? (variant === 'nutrition' ? ' is-on' : ' cycle-card-v4__day-btn--active')
            : ''),
        'aria-checked': (pendingDay === d || storedDay === d) ? 'true' : 'false',
        'aria-label': `День ${d}`,
        disabled: !!isReadOnly,
        onClick: () => requestDaySelection(d),
      }, d)));

      const confirmRow = (pendingDay != null) && React.createElement('div', { className: 'cycle-card-v4__date-confirm' },
        React.createElement('button', {
          type: 'button',
          className: 'cycle-card-v4__date-confirm-main',
          onClick: confirmDefaultDate,
          disabled: !!isReadOnly || earlyWarn != null,
        },
          React.createElement('span', { className: 'cycle-card-v4__date-confirm-title' },
            formatConfirmHeadline(pendingDate || dateKey, todayIso)
          ),
          React.createElement('span', { className: 'cycle-card-v4__date-confirm-sub' },
            formatWeekRangeForMark(pendingDate || dateKey, pendingDay)
          )
        ),
        React.createElement('button', {
          type: 'button',
          className: 'cycle-card-v4__date-confirm-chip',
          onClick: () => setCalendarOpen(true),
          disabled: !!isReadOnly,
        }, 'Другой день')
      );

      const earlyWarnCard = earlyWarn != null && React.createElement('div', { className: 'cycle-card-v4__warn' },
        React.createElement('div', { className: 'cycle-card-v4__warn-title' },
          `Сейчас ${formatCycleDayOrdinal(earlyWarn)} день по счёту`
        ),
        React.createElement('div', { className: 'cycle-card-v4__warn-text' },
          'Отметить сегодня первым днём? Счёт начнётся заново, прошлые дни останутся как записаны.'
        ),
        renderDecisionButtons(React, [
          { key: 'no', label: 'Не надо', kind: 'secondary', onClick: () => setEarlyWarn(null) },
          {
            key: 'yes',
            label: 'Первый день',
            kind: 'primary',
            onClick: () => {
              setEarlyWarn(null);
              commitSelection(1, pendingDate || dateKey);
            },
          },
        ])
      );

      const day29Card = (showDay29 || day29Open) && React.createElement('div', { className: 'cycle-card-v4 cycle-card-v4--day29' },
        React.createElement('div', { className: 'cycle-card-v4__day29-title' }, 'Период начался?'),
        React.createElement('div', { className: 'cycle-card-v4__day29-sub' },
          'С последней отметки прошло 28 дней. Пока не ответите, нормы считаются базовыми.'
        ),
        renderDecisionButtons(React, [
          { key: 'not', label: 'Ещё нет', kind: 'secondary', onClick: () => setDay29Open(false) },
          {
            key: 'yes',
            label: 'Да, первый день',
            kind: 'primary',
            onClick: () => {
              setDay29Open(false);
              setEditMode(true);
              setPendingDay(1);
              setPendingDate(dateKey);
            },
          },
        ])
      );

      const calendarSheet = calendarOpen && HEYS.dayPickers?.CycleDatePickerSheet
        ? React.createElement(HEYS.dayPickers.CycleDatePickerSheet, {
          React,
          isOpen: calendarOpen,
          cycleDay: pendingDay || 1,
          valueISO: pendingDate || dateKey,
          todayISO: todayIso,
          onClose: () => setCalendarOpen(false),
          onConfirm: (pickedDate) => {
            setCalendarOpen(false);
            setPendingDate(pickedDate);
            if (pendingDay === 1) {
              const warnDay = getEarlyMarkWarningDay(pickedDate, getter);
              if (warnDay != null) {
                setEarlyWarn(warnDay);
                return;
              }
            }
            commitSelection(pendingDay || 1, pickedDate);
          },
        })
        : null;

      if (showDay29 && !editMode && !day29Open) {
        return variant === 'nutrition'
          ? React.createElement('section', { className: 'nutrition-v4-block', 'data-block': 'cycle' }, day29Card)
          : day29Card;
      }

      if (!hasStoredDay || editMode) {
        const emptyBody = React.createElement(React.Fragment, null,
          !editMode && React.createElement('button', {
            type: 'button',
            className: 'cycle-card-v4__action',
            onClick: () => { setEditMode(true); setPendingDay(null); },
            disabled: !!isReadOnly || !backdateAllowed,
          }, 'Указать день'),
          editMode && dayButtons,
          editMode && confirmRow,
          editMode && earlyWarnCard,
          editMode && React.createElement('div', { className: 'cycle-card-v4__actions' },
            React.createElement('button', {
              type: 'button',
              className: 'cycle-card-v4__cancel',
              onClick: () => { setEditMode(false); setPendingDay(null); setEarlyWarn(null); },
            }, 'Отмена')
          ),
          calendarSheet
        );

        if (variant === 'nutrition') {
          return React.createElement('section', { className: 'nutrition-v4-block', 'data-block': 'cycle' },
            React.createElement('div', { className: 'nutrition-v4-block__head' },
              React.createElement('b', null, 'Особый период'),
              React.createElement('span', { className: 'nutrition-v4-block__meta' }, 'Указать день')
            ),
            emptyBody
          );
        }

        return React.createElement('div', { className: 'cycle-card-v4 cycle-card-v4--empty' },
          React.createElement('div', { className: 'cycle-card-v4__head' },
            React.createElement('span', { className: 'cycle-card-v4__title' }, 'Особый период')
          ),
          emptyBody
        );
      }

      const filled = React.createElement('div', { className: 'cycle-card-v4 cycle-card-v4--filled' },
        React.createElement('button', {
          type: 'button',
          className: 'cycle-card-v4__head cycle-card-v4__head--filled',
          onClick: () => { if (!isReadOnly && backdateAllowed) setEditMode(true); },
        },
          React.createElement('span', { className: 'cycle-card-v4__phase' }, phaseLabel),
          React.createElement('span', { className: 'cycle-card-v4__day' }, `День ${storedDay}`)
        ),
        phase && React.createElement('div', { className: 'cycle-card-v4__badges' },
          phase.kcalMultiplier !== 1 && React.createElement('span', { className: 'cycle-card-v4__badge' },
            `+${Math.round((phase.kcalMultiplier - 1) * 100)} % ккал`
          ),
          phase.waterMultiplier !== 1 && React.createElement('span', { className: 'cycle-card-v4__badge' },
            `+${Math.round((phase.waterMultiplier - 1) * 100)} % вода`
          ),
          phase.insulinWaveMultiplier !== 1 && React.createElement('span', { className: 'cycle-card-v4__badge' },
            `+${Math.round((phase.insulinWaveMultiplier - 1) * 100)} % волна`
          )
        ),
        React.createElement('div', { className: 'cycle-card-v4__insight' },
          React.createElement('div', { className: 'cycle-card-v4__insight-title' }, 'Особый период'),
          React.createElement('div', { className: 'cycle-card-v4__insight-text' },
            phase?.name ? `${phase.shortName || 'Особый период'}. Нормы дня уже подстроены.` : 'Нормы дня подстроены под особые дни.'
          )
        )
      );

      if (variant === 'nutrition') {
        return React.createElement('section', { className: 'nutrition-v4-block', 'data-block': 'cycle' },
          React.createElement('div', { className: 'nutrition-v4-block__head' },
            React.createElement('b', null, 'Особый период'),
            React.createElement('span', { className: 'nutrition-v4-block__meta is-ok' },
              formatCycleWeekBadge(storedDay)
            )
          ),
          filled,
          renderCycleNormRows(React, { eatenKcal, budgetKcal, cycleKcalMultiplier })
        );
      }

      return filled;
    }

    return React.createElement(Panel);
  }

  function renderNutritionCycleBlock(React, params) {
    return renderCycleMarkingPanel({
      React,
      variant: 'nutrition',
      ...params,
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
    getTodayIso,
    formatHumanDate,
    formatShortHumanDate,
    formatConfirmHeadline,
    formatWeekRangeForMark,
    formatCycleDayOrdinal,
    isWithinBackdateWindow,
    getCycleCountDayForDate,
    shouldShowDay29Question,
    getEarlyMarkWarningDay,
    shouldHideCycleForecast,
    renderCycleMarkingPanel,
    renderNutritionCycleBlock,
  };
})(typeof window !== 'undefined' ? window : globalThis);
