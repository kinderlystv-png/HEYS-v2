// heys_day_water_v1.js — карточка воды в «Разборе дня» (вкладка «Питание»)
// Канвас: nutrition-tab.v4.dc.html (блок «Вода на вкладке»), вторичен water-add.
// Компактный вид — кнопка воды на FAB включена; полный — выключена.

; (function (global) {
  const HEYS = global.HEYS = global.HEYS || {};

  const WEEK_DAYS = 7;
  const RING_FULL = { size: 58, radius: 24, stroke: 6, center: 29 };
  const RING_COMPACT = { size: 44, radius: 19, stroke: 5, center: 22 };
  const CURVE_WIDTH = 268;
  const CURVE_HEIGHT = 56;
  const CURVE_X0 = 4;
  const CURVE_X1 = 264;
  const CURVE_BASE_Y = 50;
  const CURVE_TOP_Y = 4;
  const RING_VOLUMES = [100, 200, 330, 500];
  const MINUS_VOLUME = 200;
  const ALARM_LAG_SHARE = 0.25;
  const HABIT_HINT_KEY = 'heys_water_habit_hint_week';
  const HABIT_HINT_TEXT = 'Поставьте с утра четыре бутылки по 0,5 л на видное место — вечером не придётся вспоминать, сколько выпили.';
  const WEEKDAY_LABELS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

  function formatIsoDate(date) {
    return date.toISOString().slice(0, 10);
  }

  function getWaterLsValue(key, fallbackValue) {
    const lsGet = HEYS?.utils?.lsGet || HEYS?.dayUtils?.lsGet;
    if (typeof lsGet === 'function') return lsGet(key, fallbackValue);
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallbackValue;
    } catch (_error) {
      return fallbackValue;
    }
  }

  function setWaterLsValue(key, value) {
    const lsSet = HEYS?.utils?.lsSet || HEYS?.dayUtils?.lsSet;
    if (typeof lsSet === 'function') lsSet(key, value);
  }

  function readWaterFabEnabled() {
    const visibility = HEYS.FabVisibility?.read?.();
    return visibility ? visibility.water !== false : true;
  }

  function isWaterEmptyDay(day, waterMl) {
    const value = Math.max(0, Number(waterMl) || 0);
    return value <= 0 && !day?.lastWaterTime;
  }

  function resolveDayGoal(sourceDay, prof, fallbackGoal) {
    const breakdown = HEYS.dayWaterState?.computeWaterGoalBreakdown?.({
      day: sourceDay || {},
      profile: prof || {}
    });
    return Math.max(1, Number(breakdown?.finalGoal) || Number(fallbackGoal) || 2000);
  }

  function buildWeekSeries(day, waterGoal, prof) {
    const anchorIso = (typeof day?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day.date))
      ? day.date
      : formatIsoDate(new Date());
    const anchorDate = new Date(anchorIso + 'T12:00:00');
    const fallbackGoal = Math.max(1, Number(waterGoal) || 2000);
    const series = [];

    for (let offset = WEEK_DAYS - 1; offset >= 0; offset--) {
      const date = new Date(anchorDate);
      date.setDate(date.getDate() - offset);
      const iso = formatIsoDate(date);
      const isToday = iso === anchorIso;
      const sourceDay = isToday
        ? (day || {})
        : (getWaterLsValue('heys_dayv2_' + iso, null) || { date: iso });
      const waterMl = Math.max(0, Number(sourceDay?.waterMl) || 0);
      const goalMl = resolveDayGoal(sourceDay, prof, fallbackGoal);
      series.push({
        iso,
        waterMl,
        goalMl,
        ratio: waterMl / goalMl,
        isToday,
        weekday: WEEKDAY_LABELS[date.getDay()]
      });
    }

    const total = series.reduce((sum, item) => sum + item.waterMl, 0);
    return { series, avgMl: Math.round(total / WEEK_DAYS) };
  }

  function computeCurveScaleMax(series) {
    const peak = series.reduce((max, item) => Math.max(max, item.waterMl, item.goalMl), 0);
    return Math.max(200, Math.ceil((peak + 200) / 200) * 200);
  }

  function waterAlarmProgressK(day, isPastDay) {
    if (typeof HEYS.NutritionV4?.waterAlarmProgressK === 'function') {
      return HEYS.NutritionV4.waterAlarmProgressK(day, isPastDay);
    }
    if (isPastDay) return 1;
    return 0.5;
  }

  function isWaterAlarm({ day, waterMl, waterGoal, isPastDay }) {
    if (isPastDay) return false;
    if (isWaterEmptyDay(day, waterMl)) return true;
    const goal = Math.max(1, Number(waterGoal) || 2000);
    const expected = goal * waterAlarmProgressK(day, isPastDay);
    return (expected - waterMl) > goal * ALARM_LAG_SHARE;
  }

  function formatLiters(ml) {
    return ((Math.max(0, Number(ml) || 0)) / 1000).toFixed(1).replace('.', ',');
  }

  function formatFactDisplay(ml, _emptyDay) {
    const value = Math.max(0, Number(ml) || 0);
    return value > 0 ? formatLiters(value) : '0';
  }

  function formatStatusTail(waterMl, goal, emptyDay) {
    if (emptyDay) return 'за день не отмечено';
    const value = Math.max(0, Number(waterMl) || 0);
    const target = Math.max(1, Number(goal) || 2000);
    if (value >= target) {
      if (value > target) return 'сверх нормы ' + formatLiters(value - target) + ' л';
      return 'норма набрана';
    }
    return 'осталось ' + formatLiters(target - value);
  }

  function formatLastDrinkLine(waterLastDrink, emptyDay) {
    if (emptyDay || !waterLastDrink?.text) return null;
    return 'последний раз ' + waterLastDrink.text;
  }

  function isoWeekKey(iso) {
    const date = new Date((iso || formatIsoDate(new Date())) + 'T12:00:00');
    const day = (date.getDay() + 6) % 7;
    date.setDate(date.getDate() - day + 3);
    const year = date.getFullYear();
    const firstThursday = new Date(year, 0, 4);
    const week = 1 + Math.round(((date - firstThursday) / 86400000 - 3 + ((firstThursday.getDay() + 6) % 7)) / 7);
    return year + '-W' + String(week).padStart(2, '0');
  }

  function shouldShowHabitHint(prof, dateIso, isCompact) {
    if (isCompact) return false;
    if (prof?.water_hint_enabled === false) return false;
    const weekKey = isoWeekKey(dateIso);
    try {
      return getWaterLsValue(HABIT_HINT_KEY, null) !== weekKey;
    } catch (_error) {
      return false;
    }
  }

  function markHabitHintShown(dateIso) {
    setWaterLsValue(HABIT_HINT_KEY, isoWeekKey(dateIso));
  }

  // ─── Два самых частых объёма за месяц ────────────────────────────────────
  // Строка контракта water-add: «в карточку быстрых действий попадают два самых
  // частых объёма за последний месяц; пересчёт раз в неделю, не после каждого
  // глотка». Считается по журналу воды (waterEntries): без него частоту объёмов
  // взять неоткуда — одно число за день её не хранит.
  //
  // Кеш привязан к клиенту: ключ идёт через HEYS.utils.lsGet/lsSet, которые
  // добавляют heys_<clientId>_ сами (инв. №9 — чужой клиент свой кеш не видит).
  const FREQ_VOLUMES_KEY = 'heys_water_freq_volumes';
  // Две недели, а не месяц: строка контракта «какие объёмы идут в карточку».
  // При нескольких глотках в день это уже под шестьдесят замеров — хватает
  // с запасом, зато состав быстрее догоняет смену привычки. Дрожать он не
  // может по построению: пересчёт раз в неделю, внутри недели состав тот же.
  const FREQ_VOLUMES_DAYS = 14;
  const FREQ_VOLUMES_DEFAULT = [200, 500];

  function countWaterVolumes(dateIso) {
    const counts = new Map();
    const anchor = new Date((dateIso || formatIsoDate(new Date())) + 'T12:00:00');
    for (let offset = 0; offset < FREQ_VOLUMES_DAYS; offset++) {
      const date = new Date(anchor);
      date.setDate(date.getDate() - offset);
      const sourceDay = getWaterLsValue('heys_dayv2_' + formatIsoDate(date), null);
      const entries = Array.isArray(sourceDay?.waterEntries) ? sourceDay.waterEntries : [];
      entries.forEach((entry) => {
        // Убавление (ml < 0) объёмом не является, а seed старого дня
        // (kind:'legacy') — не глоток, а перенесённая сумма без времени.
        if (!entry || entry.kind === 'legacy') return;
        const ml = Math.round(Number(entry.ml) || 0);
        if (ml <= 0) return;
        counts.set(ml, (counts.get(ml) || 0) + 1);
      });
    }
    return counts;
  }

  function computeFrequentVolumes(dateIso) {
    const counts = countWaterVolumes(dateIso);
    const top = Array.from(counts.entries())
      .sort((a, b) => (b[1] - a[1]) || (a[0] - b[0]))
      .slice(0, 2)
      .map((pair) => pair[0]);
    // Меньше двух своих объёмов — недостаточно данных, а не «объёмов нет»:
    // недостающие места занимают значения по умолчанию из контракта.
    FREQ_VOLUMES_DEFAULT.forEach((ml) => {
      if (top.length < 2 && !top.includes(ml)) top.push(ml);
    });
    return top.slice(0, 2).sort((a, b) => a - b);
  }

  function getFrequentVolumes(dateIso) {
    const iso = (typeof dateIso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateIso))
      ? dateIso
      : formatIsoDate(new Date());
    const weekKey = isoWeekKey(iso);
    const cached = getWaterLsValue(FREQ_VOLUMES_KEY, null);
    if (cached && cached.week === weekKey && Array.isArray(cached.volumes) && cached.volumes.length === 2) {
      return cached.volumes.map((ml) => Number(ml) || 0).sort((a, b) => a - b);
    }
    const volumes = computeFrequentVolumes(iso);
    setWaterLsValue(FREQ_VOLUMES_KEY, { week: weekKey, volumes });
    return volumes;
  }

  function curvePoint(item, index, scaleMaxMl) {
    const step = (CURVE_X1 - CURVE_X0) / (WEEK_DAYS - 1);
    const x = Math.round((CURVE_X0 + step * index) * 10) / 10;
    const ratio = scaleMaxMl > 0 ? (Number(item.waterMl) || 0) / scaleMaxMl : 0;
    const rawY = CURVE_BASE_Y - (CURVE_BASE_Y - CURVE_TOP_Y) * ratio;
    const y = Math.round(Math.max(CURVE_TOP_Y, Math.min(CURVE_BASE_Y, rawY)) * 10) / 10;
    const goalRatio = scaleMaxMl > 0 ? (Number(item.goalMl) || 0) / scaleMaxMl : 0;
    const goalY = Math.round((CURVE_BASE_Y - (CURVE_BASE_Y - CURVE_TOP_Y) * goalRatio) * 10) / 10;
    return { ...item, x, y, goalY };
  }

  function catmullRomPath(points) {
    if (!points.length) return '';
    if (points.length === 1) return 'M ' + points[0].x + ' ' + points[0].y;
    let path = 'M ' + points[0].x + ' ' + points[0].y;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i - 1] || points[i];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2] || p2;
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      path += ' C ' + cp1x + ' ' + cp1y + ', ' + cp2x + ' ' + cp2y + ', ' + p2.x + ' ' + p2.y;
    }
    return path;
  }

  function ringLengthFor(ring) {
    return Math.round(2 * Math.PI * ring.radius * 10) / 10;
  }

  function applyOptimistic(cardEl, waterMl, waterGoal) {
    if (!cardEl) return;
    const goal = Math.max(1, Number(waterGoal) || 2000);
    const value = Math.max(0, Number(waterMl) || 0);
    const ratio = value / goal;
    const emptyDay = value <= 0;
    const tail = formatStatusTail(value, goal, emptyDay);

    const ringFact = cardEl.querySelector('.water-review__ring-fact');
    if (ringFact) ringFact.textContent = formatFactDisplay(value, emptyDay) + (emptyDay ? '' : ' л');

    const ringTail = cardEl.querySelector('.water-review__ring-tail');
    if (ringTail) ringTail.textContent = tail;

    const ringFill = cardEl.querySelector('.water-review__ring-fill');
    if (ringFill) {
      const ring = cardEl.classList.contains('water-review--compact') ? RING_COMPACT : RING_FULL;
      const length = ringLengthFor(ring);
      ringFill.setAttribute('stroke-dasharray', (emptyDay ? 0 : Math.min(1, ratio) * length) + ' ' + length);
    }

    cardEl.querySelectorAll('.water-review__chip--sub').forEach((el) => {
      el.classList.toggle('is-off', value <= 0);
      if (value <= 0) el.setAttribute('disabled', 'disabled');
      else el.removeAttribute('disabled');
    });
  }

  let _WaterReviewCard = null;

  function getWaterReviewComponent(React) {
    if (_WaterReviewCard) return _WaterReviewCard;

    function VolumeChip({ ml, kind, extraClass, disabled, onPick, readOnly }) {
      const openCustomVolume = React.useCallback((event) => {
        if (readOnly) return;
        HEYS.WaterCustomVolume?.open?.({
          onAdd: (volume) => onPick(volume, event)
        });
      }, [onPick, readOnly]);

      const useWaterLongPress = HEYS.WaterCustomVolume.useLongPress350;
      const press = useWaterLongPress(openCustomVolume, {
        disabled: disabled || readOnly,
        onShortClick: (event) => onPick(ml, event)
      });

      return React.createElement('button', {
        type: 'button',
        className: 'water-review__chip water-review__chip--' + kind
          + (extraClass ? ' ' + extraClass : '')
          + (disabled ? ' is-off' : '')
          + (readOnly ? ' is-readonly' : ''),
        disabled: disabled || readOnly || undefined,
        onPointerDown: press.onPointerDown,
        onPointerMove: press.onPointerMove,
        onPointerUp: press.onPointerUp,
        onClick: press.onClick
      }, (kind === 'sub' ? '−' : '+') + ml);
    }

    function CheckIcon() {
      return React.createElement('svg', {
        width: 7, height: 7, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 4.5, strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': 'true'
      }, React.createElement('path', { d: 'M5 13l4 4L19 7' }));
    }

    _WaterReviewCard = function WaterReviewCard(props) {
      const {
        day, prof, waterGoal, waterGoalBreakdown, waterLastDrink,
        addWater, removeWater, haptic, openExclusivePopup,
        isPastDay, isReadOnly
      } = props;

      const [waterFabOn, setWaterFabOn] = React.useState(readWaterFabEnabled);
      React.useEffect(() => {
        const sync = () => setWaterFabOn(readWaterFabEnabled());
        global.addEventListener('heys:fab-visibility-changed', sync);
        return () => global.removeEventListener('heys:fab-visibility-changed', sync);
      }, []);

      const isCompact = waterFabOn;
      const goal = Math.max(1, Number(waterGoal) || 2000);
      const waterMl = Math.max(0, Number(day?.waterMl) || 0);
      const emptyDay = isWaterEmptyDay(day, waterMl);
      const ratio = emptyDay ? 0 : waterMl / goal;
      const week = buildWeekSeries(day, goal, prof);
      const scaleMaxMl = computeCurveScaleMax(week.series);
      const points = week.series.map((item, index) => curvePoint(item, index, scaleMaxMl));
      const alarm = isWaterAlarm({ day, waterMl, waterGoal: goal, isPastDay: !!isPastDay });
      const ring = isCompact ? RING_COMPACT : RING_FULL;
      const ringLength = ringLengthFor(ring);
      const canRemove = waterMl > 0 && !isReadOnly;
      const lastDrinkLine = formatLastDrinkLine(waterLastDrink, emptyDay);
      const statusTail = formatStatusTail(waterMl, goal, emptyDay);
      const showHint = shouldShowHabitHint(prof, day?.date, isCompact);

      const pickAdd = (ml, event) => {
        if (isReadOnly) return;
        addWater?.(ml, {
          skipScroll: true,
          source: 'water-review-card',
          sourceEl: event?.currentTarget
        });
      };

      const pickRemove = () => {
        if (!canRemove) return;
        removeWater?.(MINUS_VOLUME);
      };

      const openDetails = (event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        openExclusivePopup?.('metric', {
          type: 'water',
          x: rect.left + rect.width / 2,
          y: rect.top,
          data: {
            value: waterMl,
            goal,
            ratio,
            breakdown: waterGoalBreakdown,
            lastDrink: waterLastDrink
          }
        });
        haptic?.('light');
      };

      const linePath = catmullRomPath(points);
      const goalPath = catmullRomPath(points.map((point) => ({ x: point.x, y: point.goalY })));
      const areaPath = linePath
        + ' L ' + CURVE_X1 + ' ' + CURVE_BASE_Y
        + ' L ' + CURVE_X0 + ' ' + CURVE_BASE_Y + ' Z';

      const cardProps = {
        id: 'water-card',
        className: 'water-review water-review--ring'
          + (isCompact ? ' water-review--compact' : ' water-review--full')
          + (alarm ? ' water-review--alarm' : '')
          + (emptyDay ? ' water-review--empty' : '')
          + (isReadOnly ? ' water-review--readonly' : '')
          + ' compact-card widget-shadow-diary-glass widget-outline-diary-glass',
        'aria-label': 'Вода: ' + formatFactDisplay(waterMl, emptyDay)
          + (emptyDay ? '' : ' л из ' + formatLiters(goal) + ' л')
      };

      return React.createElement('div', cardProps,
        React.createElement('div', { className: 'water-review__top' },
          React.createElement('span', { className: 'water-review__kicker' }, 'Вода'),
          React.createElement('span', { className: 'water-review__top-meta' },
            React.createElement('span', { className: 'water-review__avg' },
              'в среднем ' + formatLiters(week.avgMl) + ' л'
            ),
          )
        ),

        React.createElement('div', { className: 'water-review__ring-row' },
          React.createElement('svg', {
            className: 'water-review__ring-svg',
            width: ring.size, height: ring.size,
            viewBox: '0 0 ' + ring.size + ' ' + ring.size,
            'aria-hidden': 'true'
          },
            React.createElement('circle', {
              className: 'water-review__ring-track',
              cx: ring.center, cy: ring.center, r: ring.radius,
              fill: 'none', strokeWidth: ring.stroke
            }),
            !emptyDay ? React.createElement('circle', {
              className: 'water-review__ring-fill',
              cx: ring.center, cy: ring.center, r: ring.radius,
              fill: 'none', strokeWidth: ring.stroke,
              strokeLinecap: 'round',
              strokeDasharray: (Math.min(1, ratio) * ringLength) + ' ' + ringLength,
              transform: 'rotate(-90 ' + ring.center + ' ' + ring.center + ')'
            }) : null
          ),
          React.createElement('div', { className: 'water-review__ring-text' },
            React.createElement('b', { className: 'water-review__ring-fact' },
              formatFactDisplay(waterMl, emptyDay) + (emptyDay ? '' : ' л')
            ),
            React.createElement('span', { className: 'water-review__ring-meta' },
              'из ',
              React.createElement('button', {
                type: 'button',
                className: 'water-review__norm-link',
                onClick: openDetails
              }, formatLiters(goal) + ' л'),
              ' · ',
              React.createElement('span', { className: 'water-review__ring-tail' }, statusTail)
            ),
            emptyDay
              ? React.createElement('span', { className: 'water-review__empty-note' },
                'внесите выпитое или добавьте 200 мл')
              : (lastDrinkLine
                ? React.createElement('span', { className: 'water-review__last' }, lastDrinkLine)
                : null)
          )
        ),

        // Строка контракта «минус в «Кольце»» (water-add): в ряду четырёх
        // объёмов минуса нет — он стоит первым в том же ряду пятой пилюлей
        // обводкой, зазор 12 px до первого плюса (gap 6 px ряда + свои 6 px у
        // --in-row); в шапке карточки ему места нет.
        //
        // Отступление от кадра названо вслух: кадр «Вода · карточка · Кольцо»
        // (data-demo="stop") рисует минус в .bTop, то есть в шапке, а ряд .bChips
        // держит ровно четыре плюса. Контракт старше кадра. Строка
        // «чип −200 в шапке» в nutrition-tab тоже говорит про шапку, но там же
        // сказано: «карточка воды здесь для контекста — при расхождении верен
        // water-add.v4.dc.html».
        !isCompact ? React.createElement('div', { className: 'water-review__quick' },
          // Длинного нажатия у минуса нет намеренно: лист своего объёма умеет
          // только добавлять (строка «свой объём»), на убавляющем чипе он
          // сработал бы в обратную сторону.
          React.createElement('button', {
            type: 'button',
            key: 'sub',
            className: 'water-review__chip water-review__chip--sub water-review__chip--in-row'
              + (canRemove ? '' : ' is-off'),
            disabled: !canRemove || undefined,
            onClick: pickRemove
          }, '−' + MINUS_VOLUME),
          RING_VOLUMES.map((ml) => React.createElement(VolumeChip, {
            key: ml, ml, kind: 'quick', readOnly: isReadOnly, onPick: pickAdd
          }))
        ) : null,

        React.createElement('div', { className: 'water-review__curve' + (alarm ? ' is-alarm' : '') },
          React.createElement('svg', {
            width: CURVE_WIDTH, height: CURVE_HEIGHT,
            viewBox: '0 0 ' + CURVE_WIDTH + ' ' + CURVE_HEIGHT,
            fill: 'none', preserveAspectRatio: 'none', 'aria-hidden': 'true'
          },
            React.createElement('defs', null,
              alarm ? React.createElement('linearGradient', {
                id: 'water-review-alarm-gradient',
                x1: '0%', y1: '0%', x2: '100%', y2: '0%'
              },
                React.createElement('stop', { offset: '0%', stopColor: 'currentColor' }),
                React.createElement('stop', { offset: '76%', stopColor: 'currentColor' }),
                React.createElement('stop', { offset: '100%', stopColor: 'var(--wr-alarm)' })
              ) : null
            ),
            React.createElement('path', {
              className: 'water-review__curve-area',
              d: areaPath, fill: 'currentColor', opacity: 0.16
            }),
            React.createElement('path', {
              className: 'water-review__curve-goal',
              d: goalPath,
              fill: 'none', stroke: 'currentColor', strokeWidth: 1,
              strokeDasharray: '3 3', opacity: 0.5
            }),
            React.createElement('path', {
              className: 'water-review__curve-line',
              d: linePath,
              fill: 'none',
              stroke: alarm ? 'url(#water-review-alarm-gradient)' : 'currentColor',
              strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round'
            }),
            // Контракт «неделя в «Кольце»»: попадание в норму — залитая точка,
            // промах — контурная (фон карточки внутри); сегодня — только ореол,
            // заливку точки он не меняет.
            points.map((point) => React.createElement(React.Fragment, { key: point.iso },
              point.isToday ? React.createElement('circle', {
                className: 'water-review__curve-today',
                cx: point.x, cy: point.y, r: 6.8
              }) : null,
              React.createElement('circle', {
                className: 'water-review__curve-dot'
                  + (point.goalMl > 0 && point.waterMl >= point.goalMl ? '' : ' water-review__curve-dot--miss'),
                cx: point.x, cy: point.y, r: 2.6
              })
            ))
          )
        ),

        React.createElement('div', { className: 'water-review__days' },
          points.map((point) => (
            point.waterMl >= point.goalMl && point.goalMl > 0
              ? React.createElement('span', {
                key: point.iso, className: 'water-review__day-done', 'aria-label': point.weekday
              }, React.createElement(CheckIcon))
              : React.createElement('span', {
                key: point.iso,
                className: 'water-review__day-label' + (point.isToday ? ' is-today' : '')
              }, point.weekday)
          ))
        ),

        showHint ? React.createElement('div', {
          className: 'water-review__hint',
          onMouseEnter: () => markHabitHintShown(day?.date)
        }, HABIT_HINT_TEXT) : null
      );
    };

    return _WaterReviewCard;
  }

  function renderWaterCard({ React, ctx, actions }) {
    const {
      day, prof, waterGoal, waterGoalBreakdown, waterLastDrink,
      isPastDay, isReadOnly
    } = ctx || {};
    const { addWater, removeWater, haptic, openExclusivePopup } = actions || {};

    return React.createElement(getWaterReviewComponent(React), {
      day,
      prof,
      waterGoal,
      waterGoalBreakdown,
      waterLastDrink,
      isPastDay,
      isReadOnly,
      addWater,
      removeWater,
      haptic,
      openExclusivePopup
    });
  }

  HEYS.dayWater = {
    render: renderWaterCard,
    applyOptimistic,
    getFrequentVolumes,
    _test: {
      countWaterVolumes,
      computeFrequentVolumes,
      getFrequentVolumes,
      FREQ_VOLUMES_KEY,
      buildWeekSeries,
      formatLiters,
      formatFactDisplay,
      curvePoint,
      catmullRomPath,
      isWaterAlarm,
      isWaterEmptyDay,
      formatStatusTail,
      readWaterFabEnabled,
      computeCurveScaleMax
    }
  };

})(window);
