// heys_morning_activation_calendar_v1.js — shared «утренняя зарядка» habit calendar (modal + activity card)
; (function (global) {
  'use strict';

  const HEYS = (global.HEYS = global.HEYS || {});
  const React = global.React;
  if (!React) return;

  const { useState, useMemo, useCallback, useEffect, useRef } = React;

  const WEEKDAY_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const CALENDAR_VIEW_KEY = 'morningActivationCalendarView';
  const VIEW_28_DAYS = 'last_28_days';
  const VIEW_MONTH = 'calendar_month';

  function profileLsGet() {
    const u = HEYS.utils || {};
    if (typeof u.lsGet === 'function') return u.lsGet.bind(u);
    if (HEYS.dayStorage?.lsGet) return HEYS.dayStorage.lsGet.bind(HEYS.dayStorage);
    return (k, d) => d;
  }

  function profileLsSet() {
    const u = HEYS.utils || {};
    if (typeof u.lsSet === 'function') return u.lsSet.bind(u);
    if (HEYS.dayStorage?.lsSet) return HEYS.dayStorage.lsSet.bind(HEYS.dayStorage);
    return () => { };
  }

  function getTodayKeyFallback() {
    if (HEYS.dayUtils?.todayISO) return HEYS.dayUtils.todayISO();
    if (HEYS.StepModal?.utils?.getTodayKey) return HEYS.StepModal.utils.getTodayKey();
    return new Date().toISOString().slice(0, 10);
  }

  function parseIsoDateKeyToLocalDate(dateKey) {
    if (typeof dateKey !== 'string') return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    const date = new Date(year, month, day, 12, 0, 0, 0);
    if (Number.isNaN(date.getTime())) return null;
    return date;
  }

  function formatDateToIsoKeyLocal(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return getTodayKeyFallback();
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  function getWeekdayMonFirst(date) {
    const day = date.getDay();
    return day === 0 ? 6 : day - 1;
  }

  function firstOfMonthIsoFromDateKey(dateKey) {
    const d = parseIsoDateKeyToLocalDate(dateKey) || parseIsoDateKeyToLocalDate(getTodayKeyFallback());
    return formatDateToIsoKeyLocal(new Date(d.getFullYear(), d.getMonth(), 1, 12, 0, 0, 0));
  }

  function shiftMonthAnchorIso(monthFirstIso, deltaMonths) {
    const d = parseIsoDateKeyToLocalDate(monthFirstIso);
    if (!d) return firstOfMonthIsoFromDateKey(getTodayKeyFallback());
    const y = d.getFullYear();
    const m = d.getMonth() + deltaMonths;
    return formatDateToIsoKeyLocal(new Date(y, m, 1, 12, 0, 0, 0));
  }

  function isWeekendDateKey(dateKey) {
    const d = parseIsoDateKeyToLocalDate(dateKey);
    if (!d) return false;
    const mon = getWeekdayMonFirst(d);
    return mon === 5 || mon === 6;
  }

  function parseTimeToMinutes(time) {
    if (typeof time !== 'string') return null;
    const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
    return hours * 60 + minutes;
  }

  function getFirstMealTimeFromDay(dayData) {
    const meals = Array.isArray(dayData?.meals) ? dayData.meals : [];
    const withItems = meals.filter((meal) => Array.isArray(meal?.items) && meal.items.length > 0);
    if (!withItems.length) return null;
    const minutesList = withItems
      .map((meal) => parseTimeToMinutes(meal?.time))
      .filter((m) => Number.isFinite(m));
    if (minutesList.length) {
      const first = Math.min(...minutesList);
      const hh = String(Math.floor(first / 60)).padStart(2, '0');
      const mm = String(first % 60).padStart(2, '0');
      return `${hh}:${mm}`;
    }
    return null;
  }

  function clampMoodValue(value, fallback) {
    const f = fallback === undefined ? 5 : fallback;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return f;
    return Math.max(1, Math.min(10, Math.round(numeric)));
  }

  function normalizePostState(postState, fallback) {
    if (!postState || typeof postState !== 'object') return fallback;
    return {
      mood: clampMoodValue(postState.mood, 5),
      wellbeing: clampMoodValue(postState.wellbeing, 5),
      stress: clampMoodValue(postState.stress, 5)
    };
  }

  function normalizeMorningActivationState(dateKey, dayDataInput, readDayFn) {
    const read = typeof readDayFn === 'function' ? readDayFn : () => ({});
    const dayData = dayDataInput && typeof dayDataInput === 'object' ? dayDataInput : read(dateKey);
    const stored = dayData?.morningActivation && typeof dayData.morningActivation === 'object'
      ? dayData.morningActivation
      : {};
    const firstMealTime = stored.firstMealTime || getFirstMealTimeFromDay(dayData);
    let status = stored.status;
    if (status !== 'done' && status !== 'missed') {
      status = firstMealTime ? 'pending' : 'pre_meal';
    }
    return {
      status,
      firstMealTime: firstMealTime || null,
      intensity: stored.intensity || null,
      postState: normalizePostState(stored.postState, null),
      postEffect: stored.postEffect && typeof stored.postEffect === 'object' ? stored.postEffect : null,
      copyId: stored.copyId || null,
      decidedAt: stored.decidedAt || null
    };
  }

  /** Align with activity card: charge logged as training/household counts as done for habit calendar. */
  function hasMorningActivationEvidence(dayData) {
    if (!dayData || typeof dayData !== 'object') return false;
    if (dayData.morningActivation && dayData.morningActivation.status === 'done') return true;
    const trainings = Array.isArray(dayData.trainings) ? dayData.trainings : [];
    if (trainings.some((t) => t && t.source === 'morning_activation')) return true;
    const household = Array.isArray(dayData.householdActivities) ? dayData.householdActivities : [];
    if (household.some((h) => h && h.source === 'morning_activation')) return true;
    return false;
  }

  /**
   * effectiveTodayKey — граница «сегодня» (HEYS day, см. dayUtils.todayISO / 03:00).
   * Прошлые дни без зарядки и без явного done → для календаря считаем пропуском (красный),
   * даже если не открывали модалку и нет записей в дне.
   */
  function habitCalendarDisplayStatus(dateKey, readDayFn, effectiveTodayKey) {
    const todayKey = effectiveTodayKey || getTodayKeyFallback();
    const dayData = (typeof readDayFn === 'function' ? readDayFn(dateKey) : null) || {};
    const state = normalizeMorningActivationState(dateKey, dayData, readDayFn);
    if (state.status === 'missed') return 'missed';
    if (state.status === 'done') return 'done';
    if (hasMorningActivationEvidence(dayData)) return 'done';
    // Будущие даты (режим «Месяц») — без окраски
    if (dateKey > todayKey) return null;
    // Сегодня: ещё можно сделать зарядку — нейтрально, пока нет done/пропуска/факта зарядки
    if (dateKey === todayKey) return null;
    // Прошлый HEYS-день без отметки «сделано» и без карточки зарядки → как пропуск
    return 'missed';
  }

  function getMorningActivationCalendarViewPreference() {
    const lsGet = profileLsGet();
    const profile = lsGet('heys_profile', {}) || {};
    const view = profile?.[CALENDAR_VIEW_KEY];
    if (view === VIEW_MONTH) return VIEW_MONTH;
    return VIEW_28_DAYS;
  }

  function saveMorningActivationCalendarViewPreference(view) {
    if (view !== VIEW_28_DAYS && view !== VIEW_MONTH) return;
    const lsGet = profileLsGet();
    const lsSet = profileLsSet();
    const profile = lsGet('heys_profile', {}) || {};
    if (profile?.[CALENDAR_VIEW_KEY] === view) return;
    profile[CALENDAR_VIEW_KEY] = view;
    lsSet('heys_profile', profile);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('heys:profile-updated', {
        detail: { profile, source: 'morning-activation-calendar-view' }
      }));
    }
  }

  function buildMorningActivationCalendarData(anchorDateKey, viewMode, readDayFn) {
    const heysTodayKey = getTodayKeyFallback();
    const anchorDate = parseIsoDateKeyToLocalDate(anchorDateKey) || parseIsoDateKeyToLocalDate(heysTodayKey) || new Date();
    const isMonthView = viewMode === VIEW_MONTH;
    const effectiveDays = isMonthView
      ? new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 0).getDate()
      : 28;
    const dayEntries = [];
    const monthDate = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1, 12, 0, 0, 0);

    for (let offset = 0; offset < effectiveDays; offset++) {
      const date = isMonthView
        ? new Date(anchorDate.getFullYear(), anchorDate.getMonth(), offset + 1, 12, 0, 0, 0)
        : (() => {
          const d = new Date(anchorDate);
          d.setDate(anchorDate.getDate() - (effectiveDays - 1 - offset));
          return d;
        })();
      const dateKey = formatDateToIsoKeyLocal(date);
      const display = habitCalendarDisplayStatus(dateKey, readDayFn, heysTodayKey);
      dayEntries.push({
        dateKey,
        dayOfMonth: date.getDate(),
        status: display,
        isToday: dateKey === heysTodayKey
      });
    }

    const firstDate = parseIsoDateKeyToLocalDate(dayEntries[0]?.dateKey);
    const leadingEmpty = firstDate ? getWeekdayMonFirst(firstDate) : 0;
    const grid = [];
    for (let i = 0; i < leadingEmpty; i++) {
      grid.push({ isEmpty: true, id: `empty-${i}` });
    }
    dayEntries.forEach((item) => grid.push({ ...item, isEmpty: false, id: item.dateKey }));
    while (grid.length % 7 !== 0) {
      grid.push({ isEmpty: true, id: `tail-${grid.length}` });
    }

    const doneCount = dayEntries.filter((item) => item.status === 'done').length;
    const missedCount = dayEntries.filter((item) => item.status === 'missed').length;
    return {
      grid,
      doneCount,
      missedCount,
      viewMode: isMonthView ? VIEW_MONTH : VIEW_28_DAYS,
      title: isMonthView
        ? monthDate.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })
        : 'Последние 28 дней'
    };
  }

  /**
   * @param {Object} props
   * @param {string} props.dateKey — anchor ISO date
   * @param {(dateKey: string) => object} props.readDayData
   * @param {string} [props.headingTitle]
   * @param {string} [props.layoutClass] — extra class on root shell (e.g. activity card)
   */
  function MorningActivationHabitCalendar(props) {
    const {
      dateKey,
      readDayData,
      headingTitle = 'Календарь привычки',
      layoutClass = ''
    } = props || {};

    const stableRead = useCallback((dk) => {
      if (typeof readDayData !== 'function') return {};
      return readDayData(dk) || {};
    }, [readDayData]);

    const [calendarViewMode, setCalendarViewMode] = useState(() => getMorningActivationCalendarViewPreference());
    const [monthAnchorKey, setMonthAnchorKey] = useState(() => firstOfMonthIsoFromDateKey(dateKey));
    const prevDateKeyRef = useRef(dateKey);

    useEffect(() => {
      if (prevDateKeyRef.current === dateKey) return;
      prevDateKeyRef.current = dateKey;
      if (calendarViewMode !== VIEW_MONTH) return;
      setMonthAnchorKey(firstOfMonthIsoFromDateKey(dateKey));
    }, [dateKey, calendarViewMode]);

    const effectiveAnchorKey = calendarViewMode === VIEW_MONTH ? monthAnchorKey : dateKey;

    const calendarData = useMemo(
      () => buildMorningActivationCalendarData(effectiveAnchorKey, calendarViewMode, stableRead),
      [effectiveAnchorKey, calendarViewMode, stableRead]
    );

    const periodRow = calendarViewMode === VIEW_MONTH
      ? React.createElement('div', { className: 'ma-habit-cal-period ma-habit-cal-period--month' },
        React.createElement('button', {
          type: 'button',
          className: 'ma-habit-cal-period-nav',
          'aria-label': 'Предыдущий месяц',
          onClick: () => {
            setMonthAnchorKey((k) => shiftMonthAnchorIso(k, -1));
          }
        }, '\u2039'),
        React.createElement('span', {
          className: 'ma-habit-cal-period-label ma-habit-cal-period-label--month',
          'aria-live': 'polite'
        }, calendarData.title),
        React.createElement('button', {
          type: 'button',
          className: 'ma-habit-cal-period-nav',
          'aria-label': 'Следующий месяц',
          onClick: () => {
            setMonthAnchorKey((k) => shiftMonthAnchorIso(k, 1));
          }
        }, '\u203A')
      )
      : React.createElement('div', { className: 'ma-habit-cal-period ma-habit-cal-period--28' },
        React.createElement('span', { className: 'ma-habit-cal-period-label ma-habit-cal-period-label--28' }, calendarData.title)
      );

    return React.createElement('div', { className: 'ma-habit-cal-shell compact-card widget-shadow-diary-glass widget-outline-diary-glass ' + (layoutClass || '').trim() },
      React.createElement('div', { className: 'ma-habit-cal-head' },
        React.createElement('div', { className: 'ma-habit-cal-head-title-group' },
          React.createElement('span', { className: 'ma-habit-cal-heading' }, headingTitle),
          React.createElement('span', { className: 'ma-habit-cal-head-dot', 'aria-hidden': 'true' }, '\u00B7'),
          React.createElement('button', {
            type: 'button',
            className: 'ma-habit-cal-mode-btn ma-habit-cal-mode-btn--inline' + (calendarViewMode === VIEW_28_DAYS ? ' is-active' : ''),
            onClick: () => {
              setCalendarViewMode(VIEW_28_DAYS);
              saveMorningActivationCalendarViewPreference(VIEW_28_DAYS);
            }
          }, '28 дней'),
          React.createElement('span', { className: 'ma-habit-cal-head-dot', 'aria-hidden': 'true' }, '\u00B7'),
          React.createElement('button', {
            type: 'button',
            className: 'ma-habit-cal-mode-btn ma-habit-cal-mode-btn--inline' + (calendarViewMode === VIEW_MONTH ? ' is-active' : ''),
            onClick: () => {
              setCalendarViewMode(VIEW_MONTH);
              saveMorningActivationCalendarViewPreference(VIEW_MONTH);
              setMonthAnchorKey(firstOfMonthIsoFromDateKey(dateKey));
            }
          }, 'Месяц')
        )
      ),
      periodRow,
      React.createElement('div', { className: 'ma-habit-cal-matrix' },
        React.createElement('div', { className: 'ma-habit-cal-weekdays' },
          WEEKDAY_SHORT.map((label, idx) => React.createElement('div', {
            key: 'wd-' + label,
            className: 'ma-habit-cal-wd' + (idx >= 5 ? ' ma-habit-cal-wd--weekend' : '')
          }, label))
        ),
        React.createElement('div', { className: 'ma-habit-cal-grid' },
          calendarData.grid.map((cell) => {
          if (cell.isEmpty) {
            return React.createElement('div', { key: cell.id, className: 'ma-habit-cal-cell ma-habit-cal-cell--empty' });
          }
          const rowStatus = cell.status === 'done'
            ? 'is-done'
            : (cell.status === 'missed' ? 'is-missed' : 'is-neutral');
          const weekend = isWeekendDateKey(cell.dateKey);
          const title = `${cell.dateKey}: ${cell.status === 'done' ? 'сделано' : (cell.status === 'missed' ? 'пропущено' : 'нет отметки')}`;
          return React.createElement('div', {
            key: cell.id,
            className: 'ma-habit-cal-cell ' + rowStatus + (cell.isToday ? ' is-today' : '') + (weekend ? ' is-weekend' : ''),
            title
          },
          React.createElement('div', { className: 'ma-habit-cal-cell-inner' },
            React.createElement('span', { className: 'ma-habit-cal-daynum' }, cell.dayOfMonth)
          )
          );
        })
        )
      ),
      React.createElement('div', { className: 'ma-habit-cal-footer' },
        React.createElement('span', null, `Сделано: ${calendarData.doneCount}`),
        React.createElement('span', null, `Пропущено: ${calendarData.missedCount}`)
      )
    );
  }

  HEYS.morningActivationCalendar = {
    MorningActivationHabitCalendar,
    buildMorningActivationCalendarData,
    getMorningActivationCalendarViewPreference,
    saveMorningActivationCalendarViewPreference,
    VIEW_28_DAYS,
    VIEW_MONTH,
    WEEKDAY_SHORT
  };
})(window);
