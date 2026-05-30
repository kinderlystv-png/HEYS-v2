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

  // Protocol-ID → intensity classification (см. план «State machine»).
  const MAX_PROTOCOL_IDS = new Set([
    'horst_max_hangs_v1',
    'lattice_max_hangs_v1',
    'beastmaker_2k_max_v1',
    'critical_force_test',
    'max_hang_test',
  ]);
  const RECOVERY_PROTOCOL_IDS = new Set([
    'recovery_pumpers_v1',
    'easy_arc_v1',
    'mobility_only',
  ]);

  function _classifyProgramId(programId) {
    if (!programId) return 'moderate';
    if (MAX_PROTOCOL_IDS.has(programId)) return 'max';
    if (RECOVERY_PROTOCOL_IDS.has(programId)) return 'recovery';
    return 'moderate';
  }

  function _intensityRank(intensity) {
    return intensity === 'max' ? 3
      : intensity === 'moderate' ? 2
      : intensity === 'recovery' ? 1 : 0;
  }

  function _formatDateKey(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
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
        sessions.push({
          dateKey,
          trainingIndex: idx,
          programId: log.programId || null,
          intensity,
          holdsCount: Array.isArray(log.holds) ? log.holds.length : 0,
          notes: tr.notes || '',
          startedAt: log.startedAt || null,
          endedAt: log.endedAt || null,
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

  // ─── YearHeatmap component ─────────────────────────────────────────────
  function YearHeatmap(props) {
    const React = global.React;
    if (!React) return null;
    const h = React.createElement;

    const year = (props && Number(props.year)) || new Date().getFullYear();
    const onDayClick = props && typeof props.onDayClick === 'function' ? props.onDayClick : null;

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
  Fingers.__calendarConstants = { MAX_PROTOCOL_IDS, RECOVERY_PROTOCOL_IDS };
})(typeof window !== 'undefined' ? window : globalThis);
