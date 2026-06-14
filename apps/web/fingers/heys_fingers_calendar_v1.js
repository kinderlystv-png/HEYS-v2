// heys_fingers_calendar_v1.js — Year heatmap calendar + cooldown utility.
//
// Public API:
//   HEYS.Fingers.YearHeatmap({year, onDayClick})  — React component
//   HEYS.Fingers.cooldownCheck() → {
//     hoursSinceLast: number|null,
//     lastWasMax: boolean,
//     allowedNow: boolean,
//     recommendation: 'rest'|'recovery'|'moderate'|'max'
//   }
//
// Heatmap data source: читает `heys_dayv2_<YYYY-MM-DD>` для всех дат в году,
// фильтрует training.type === 'fingers'. Intensity classification по
// fingersLog.programId (известные max-protocol IDs → max, иначе по эвристике).
//
// Layout: 53 колонки (max weeks in year) × 7 строк (Mon-Sun).
// Стилизация — vanilla CSS inline; никаких внешних зависимостей.

;(function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  const Fingers = HEYS.Fingers = HEYS.Fingers || {};

  if (Fingers.YearHeatmap && Fingers.cooldownCheck) return; // idempotent

  // Protocol-ID → intensity classification.
  // Single source of truth: `program.intensity` поле в каталоге программ
  // (heys_fingers_programs_catalog_v1.js). Fallback к hardcoded для test
  // IDs (calibration tests не в каталоге программ).
  const CALIBRATION_TEST_IDS = new Set([
    'critical_force_test',
    'max_hang_test',
    'min_edge_test',
  ]);

  function _classifyProgramId(programId) {
    if (!programId) return 'moderate';
    if (CALIBRATION_TEST_IDS.has(programId)) return 'max'; // tests are max-load
    if (typeof Fingers.getProgramIntensity === 'function') {
      return Fingers.getProgramIntensity(programId);
    }
    return 'moderate';
  }

  function _intensityRank(intensity) {
    return intensity === 'max' ? 3
      : intensity === 'moderate' ? 2
      : intensity === 'recovery' ? 1 : 0;
  }

  function _formatDateKey(d) {
    const kd = HEYS.TrainingKernel && HEYS.TrainingKernel.dates;
    if (kd && typeof kd.dateKeyLocal === 'function') return kd.dateKeyLocal(d);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function _calendarKernel() {
    return HEYS.TrainingKernel && HEYS.TrainingKernel.calendar;
  }

  function _readDay(dateKey) {
    try {
      if (HEYS.utils && typeof HEYS.utils.lsGet === 'function') {
        return HEYS.utils.lsGet(`heys_dayv2_${dateKey}`, null);
      }
      const raw = localStorage.getItem(`heys_dayv2_${dateKey}`);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Extracts all fingers-sessions из day record. Возвращает массив
   * { dateKey, programId, intensity, holdsCount, ... }.
   */
  function _extractFingerSessions(dateKey) {
    const day = _readDay(dateKey);
    if (!day || !Array.isArray(day.trainings)) return [];
    const sessions = [];
    day.trainings.forEach((tr, idx) => {
      if (tr && tr.type === 'fingers') {
        const log = tr.fingersLog || {};
        const intensity = _classifyProgramId(log.programId);
        const completedAt = log.completedAt || null;
        sessions.push({
          dateKey,
          trainingIndex: idx,
          programId: log.programId || null,
          intensity,
          holdsCount: Array.isArray(log.holds) ? log.holds.length : 0,
          notes: tr.notes || '',
          startedAt: log.startedAt || completedAt,
          endedAt: log.endedAt || completedAt,
        });
      }
    });
    return sessions;
  }

  /**
   * cooldownCheck — читает последние 14 дней, ищет последнюю finger-сессию.
   * Returns:
   *   hoursSinceLast: часов с последнего finger-training (null если нет)
   *   lastWasMax: true если последняя сессия была max-intensity
   *   allowedNow: false если <48h после max
   *   recommendation:
   *     - 'rest' если <24h после max
   *     - 'recovery' если 24-48h после max
   *     - 'moderate' если 48-72h после max или <24h после moderate
   *     - 'max' если ≥72h или нет данных
   */
  function cooldownCheck() {
    const now = new Date();
    let lastSession = null;
    let lastSessionTime = null;

    for (let i = 0; i < 14; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateKey = _formatDateKey(d);
      const sessions = _extractFingerSessions(dateKey);
      if (sessions.length) {
        // Берём последнюю (highest endedAt в этом дне)
        let pick = sessions[sessions.length - 1];
        if (pick.endedAt) {
          const sorted = sessions.slice().sort((a, b) =>
            (Date.parse(b.endedAt || 0) || 0) - (Date.parse(a.endedAt || 0) || 0));
          pick = sorted[0];
          lastSessionTime = Date.parse(pick.endedAt);
        } else {
          // Fallback: середина дня
          lastSessionTime = new Date(`${dateKey}T12:00:00`).getTime();
        }
        lastSession = pick;
        break;
      }
    }

    if (!lastSession) {
      return {
        hoursSinceLast: null,
        lastWasMax: false,
        allowedNow: true,
        recommendation: 'max',
      };
    }

    const hoursSinceLast = (Date.now() - lastSessionTime) / (1000 * 60 * 60);
    const lastWasMax = lastSession.intensity === 'max';

    let recommendation;
    let allowedNow = true;
    if (lastWasMax) {
      if (hoursSinceLast < 24) {
        recommendation = 'rest';
        allowedNow = false;
      } else if (hoursSinceLast < 48) {
        recommendation = 'recovery';
        allowedNow = false; // soft block; UI решит soft warning vs hard
      } else if (hoursSinceLast < 72) {
        recommendation = 'moderate';
      } else {
        recommendation = 'max';
      }
    } else if (lastSession.intensity === 'moderate') {
      if (hoursSinceLast < 24) recommendation = 'recovery';
      else if (hoursSinceLast < 48) recommendation = 'moderate';
      else recommendation = 'max';
    } else {
      // recovery — мало нагрузки, можно практически сразу
      recommendation = hoursSinceLast < 12 ? 'recovery' : 'max';
    }

    return {
      hoursSinceLast: Number(hoursSinceLast.toFixed(1)),
      lastWasMax,
      allowedNow,
      recommendation,
    };
  }

  // ─── Mobile MonthGrid ──────────────────────────────────────────────────
  // На узком экране year-heatmap превращается в нечитаемые 12px квадратики
  // (см. audit #5). Показываем месяц с ячейками 36×36 и навигацией prev/next.
  function _MonthGrid(props) {
    const React = global.React;
    if (!React) return null;
    const h = React.createElement;
    const monthDate = props.monthDate; // первое число месяца
    const data = props.data;
    const onDayClick = props.onDayClick;
    const onPrev = props.onPrev;
    const onNext = props.onNext;

    const monthNames = ['Январь','Февраль','Март','Апрель','Май','Июнь',
      'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
    const weekdayNames = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const kc = _calendarKernel();
    const cells = kc && typeof kc.monthCells === 'function'
      ? kc.monthCells(year, month).map(function (cell) {
        if (cell.empty) return cell;
        return Object.assign({}, cell, { info: data[cell.dateKey] });
      })
      : (function () {
        const firstDayOfWeek = (new Date(year, month, 1).getDay() + 6) % 7; // 0=Mon
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const out = [];
        for (let i = 0; i < firstDayOfWeek; i++) out.push({ empty: true, key: 'e-' + i });
        for (let day = 1; day <= daysInMonth; day++) {
          const d = new Date(year, month, day);
          const k = _formatDateKey(d);
          out.push({ day: day, dateKey: k, info: data[k], key: k });
        }
        return out;
      })();

    const cellColor = (info) => {
      if (!info) return 'transparent';
      const i = info.maxIntensity;
      const opacity = Math.min(1, 0.3 + (info.count - 1) * 0.2);
      return i === 'max' ? `rgba(220, 38, 38, ${Math.max(opacity, 0.8)})`
        : i === 'moderate' ? `rgba(14, 116, 144, ${Math.max(opacity, 0.5)})`
        : `rgba(132, 204, 22, ${Math.max(opacity, 0.4)})`;
    };

    return h('div', {
      className: 'heys-fingers-month-grid',
      style: { padding: '12px', fontFamily: 'system-ui, -apple-system, sans-serif' },
    },
      h('div', {
        style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 12, gap: 8 },
      },
        h('button', {
          type: 'button', onClick: onPrev,
          'aria-label': 'Предыдущий месяц',
          style: { width: 44, height: 44, border: 'none', background: 'rgba(0,0,0,0.05)',
            borderRadius: 10, cursor: 'pointer', fontSize: 18, color: '#374151' },
        }, '‹'),
        h('div', {
          style: { flex: 1, textAlign: 'center', fontSize: 15, fontWeight: 600, color: '#374151' },
        }, monthNames[month] + ' ' + year),
        h('button', {
          type: 'button', onClick: onNext,
          'aria-label': 'Следующий месяц',
          style: { width: 44, height: 44, border: 'none', background: 'rgba(0,0,0,0.05)',
            borderRadius: 10, cursor: 'pointer', fontSize: 18, color: '#374151' },
        }, '›')
      ),
      h('div', {
        style: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4,
          marginBottom: 4 },
      },
        weekdayNames.map(function (n) {
          return h('div', { key: n, style: { fontSize: 10, textAlign: 'center',
            color: '#9ca3af', fontWeight: 500 } }, n);
        })
      ),
      h('div', {
        style: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 },
      },
        cells.map(function (c) {
          if (c.empty) return h('div', { key: c.key, style: { aspectRatio: '1 / 1' } });
          const bg = cellColor(c.info);
          const hasSession = !!c.info;
          return h('button', {
            key: c.key, type: 'button',
            disabled: !hasSession || !onDayClick,
            onClick: hasSession && onDayClick
              ? function () { onDayClick(c.dateKey, c.info.sessions); }
              : undefined,
            'aria-label': c.dateKey + (hasSession
              ? ' — ' + c.info.count + ' сессий (' + c.info.maxIntensity + ')' : ''),
            style: {
              aspectRatio: '1 / 1', minHeight: 36,
              border: hasSession ? '1px solid rgba(0,0,0,0.06)' : '1px solid rgba(0,0,0,0.04)',
              borderRadius: 8,
              background: hasSession ? bg : 'rgba(0,0,0,0.02)',
              color: hasSession ? '#fff' : '#9ca3af',
              fontSize: 13, fontWeight: hasSession ? 600 : 400,
              cursor: hasSession && onDayClick ? 'pointer' : 'default',
              padding: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            },
          }, String(c.day));
        })
      ),
      h('div', {
        style: { display: 'flex', gap: 12, marginTop: 12, fontSize: 11,
          color: '#6b7280', alignItems: 'center', flexWrap: 'wrap' },
      },
        h('span', null, 'Цвет:'),
        h('div', { style: { display: 'flex', gap: 4, alignItems: 'center' } },
          h('div', { style: { width: 12, height: 12, background: 'rgba(132, 204, 22, 0.5)', borderRadius: 3 } }),
          h('span', null, 'recovery')),
        h('div', { style: { display: 'flex', gap: 4, alignItems: 'center' } },
          h('div', { style: { width: 12, height: 12, background: 'rgba(14, 116, 144, 0.7)', borderRadius: 3 } }),
          h('span', null, 'moderate')),
        h('div', { style: { display: 'flex', gap: 4, alignItems: 'center' } },
          h('div', { style: { width: 12, height: 12, background: 'rgba(220, 38, 38, 0.9)', borderRadius: 3 } }),
          h('span', null, 'max'))
      )
    );
  }

  // ─── YearHeatmap component ─────────────────────────────────────────────
  function YearHeatmap(props) {
    const React = global.React;
    if (!React) return null;
    const h = React.createElement;

    const year = (props && Number(props.year)) || new Date().getFullYear();
    const onDayClick = props && typeof props.onDayClick === 'function' ? props.onDayClick : null;

    // Mobile detection через matchMedia. Реактивно — обновляется при resize
    // (например, поворот устройства).
    const [isMobile, setIsMobile] = React.useState(function () {
      if (typeof window === 'undefined') return false;
      return window.matchMedia ? window.matchMedia('(max-width: 600px)').matches : false;
    });
    React.useEffect(function () {
      if (typeof window === 'undefined' || !window.matchMedia) return;
      const mq = window.matchMedia('(max-width: 600px)');
      const onChange = function (e) { setIsMobile(e.matches); };
      if (mq.addEventListener) mq.addEventListener('change', onChange);
      else mq.addListener(onChange);
      return function () {
        if (mq.removeEventListener) mq.removeEventListener('change', onChange);
        else mq.removeListener(onChange);
      };
    }, []);

    // Month navigation для мобильной версии. monthOffset=0 → текущий месяц.
    const [monthOffset, setMonthOffset] = React.useState(0);

    // Aggregate: для каждой даты года считаем sessions + max intensity
    const data = React.useMemo(() => {
      const map = {};
      const start = new Date(year, 0, 1);
      const end = new Date(year, 11, 31);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const k = _formatDateKey(d);
        const sessions = _extractFingerSessions(k);
        if (sessions.length) {
          const maxIntensity = sessions.reduce((acc, s) => {
            return _intensityRank(s.intensity) > _intensityRank(acc) ? s.intensity : acc;
          }, 'recovery');
          map[k] = { sessions, maxIntensity, count: sessions.length };
        }
      }
      return map;
    }, [year]);

    // Build grid: array of 53 weeks × 7 days, каждый день = {date, info}
    const grid = React.useMemo(() => {
      const kc = _calendarKernel();
      if (kc && typeof kc.yearGrid === 'function') {
        return kc.yearGrid(year).map(function (week) {
          return week.map(function (cell) {
            return Object.assign({}, cell, { info: cell.dateKey ? data[cell.dateKey] : null });
          });
        });
      }
      const start = new Date(year, 0, 1);
      // Align к Monday — week starts Mon в RU UX.
      const dayOfWeek = (start.getDay() + 6) % 7; // 0=Mon
      const firstCol = new Date(start);
      firstCol.setDate(start.getDate() - dayOfWeek);

      const weeks = [];
      for (let w = 0; w < 53; w++) {
        const week = [];
        for (let dow = 0; dow < 7; dow++) {
          const d = new Date(firstCol);
          d.setDate(firstCol.getDate() + w * 7 + dow);
          const inYear = d.getFullYear() === year;
          const k = inYear ? _formatDateKey(d) : null;
          week.push({ date: new Date(d), dateKey: k, info: k ? data[k] : null });
        }
        weeks.push(week);
      }
      return weeks;
    }, [year, data]);

    const cellColor = (info) => {
      if (!info) return '#f3f4f6'; // empty
      const i = info.maxIntensity;
      const opacity = Math.min(1, 0.3 + (info.count - 1) * 0.2);
      // base accents
      const base = i === 'max' ? `rgba(220, 38, 38, ${Math.max(opacity, 0.8)})`     // red
        : i === 'moderate' ? `rgba(14, 116, 144, ${Math.max(opacity, 0.5)})`        // teal
        : `rgba(132, 204, 22, ${Math.max(opacity, 0.25)})`;                          // lime — recovery
      return base;
    };

    // Mobile-first: на узких экранах year-grid становится 12px квадратиками
    // невозможными для тапа. Переключаемся на месячный grid с навигацией.
    if (isMobile) {
      const now = new Date();
      const targetMonth = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
      return h(_MonthGrid, {
        monthDate: targetMonth,
        data: data,
        onDayClick: onDayClick,
        onPrev: function () { setMonthOffset(function (o) { return o - 1; }); },
        onNext: function () { setMonthOffset(function (o) { return o + 1; }); },
      });
    }

    const CELL_SIZE = 12;
    const CELL_GAP = 2;

    return h('div', {
      className: 'heys-fingers-year-heatmap',
      style: { fontFamily: 'system-ui, -apple-system, sans-serif', padding: '12px' },
    },
      h('div', {
        style: { fontSize: '14px', fontWeight: 600, marginBottom: '8px', color: '#374151' },
      }, `Тренировки пальцев — ${year}`),
      h('div', {
        style: {
          display: 'grid',
          gridTemplateColumns: `repeat(53, ${CELL_SIZE}px)`,
          gridTemplateRows: `repeat(7, ${CELL_SIZE}px)`,
          gridAutoFlow: 'column',
          gap: `${CELL_GAP}px`,
        },
      },
        grid.flatMap((week, wIdx) =>
          week.map((cell, dIdx) => h('div', {
            key: `${wIdx}_${dIdx}`,
            title: cell.dateKey ? `${cell.dateKey}${cell.info ? ` — ${cell.info.count} сессий (${cell.info.maxIntensity})` : ''}` : '',
            style: {
              width: `${CELL_SIZE}px`, height: `${CELL_SIZE}px`,
              background: cell.dateKey ? cellColor(cell.info) : 'transparent',
              borderRadius: '2px',
              cursor: (cell.info && onDayClick) ? 'pointer' : 'default',
            },
            onClick: cell.info && onDayClick
              ? () => onDayClick(cell.dateKey, cell.info.sessions)
              : undefined,
          }))
        )
      ),
      // Legend
      h('div', {
        style: { display: 'flex', gap: '12px', marginTop: '12px', fontSize: '12px', color: '#6b7280', alignItems: 'center' },
      },
        h('span', null, 'Меньше'),
        h('div', { style: { width: `${CELL_SIZE}px`, height: `${CELL_SIZE}px`, background: '#f3f4f6', borderRadius: '2px' } }),
        h('div', { style: { width: `${CELL_SIZE}px`, height: `${CELL_SIZE}px`, background: 'rgba(132, 204, 22, 0.5)', borderRadius: '2px' } }),
        h('div', { style: { width: `${CELL_SIZE}px`, height: `${CELL_SIZE}px`, background: 'rgba(14, 116, 144, 0.7)', borderRadius: '2px' } }),
        h('div', { style: { width: `${CELL_SIZE}px`, height: `${CELL_SIZE}px`, background: 'rgba(220, 38, 38, 0.9)', borderRadius: '2px' } }),
        h('span', null, 'Больше')
      )
    );
  }

  Fingers.YearHeatmap = YearHeatmap;
  Fingers.cooldownCheck = cooldownCheck;
  Fingers.__calendarConstants = { CALIBRATION_TEST_IDS };
})(typeof window !== 'undefined' ? window : globalThis);
