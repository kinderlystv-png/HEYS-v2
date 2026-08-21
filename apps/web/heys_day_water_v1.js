// heys_day_water_v1.js — карточка воды в «Разборе дня» (вкладка «Питание»)
// Канвас: water-add.v4.dc.html, кадр «Вода · карточка · Кольцо».
// Вид один: «Полоса» снята с продукта ревью 22 августа, её кадры остались
// протоколом сравнения. Переключателя вида нет — переключать нечего.
// Контракт [data-contract="water-add"]: строки 13, 35, 42–52, 55–61, 64.

; (function (global) {
  const HEYS = global.HEYS = global.HEYS || {};

  const WEEK_DAYS = 7;

  // Кольцо (контракт 44): 58 × 58, r 24, обводка 6.
  const RING_RADIUS = 24;
  const RING_LENGTH = Math.round(2 * Math.PI * RING_RADIUS * 10) / 10;

  // Кривая недели в виде «Кольцо» (контракт 45): норма — пунктир, база — низ дорожки.
  const CURVE_WIDTH = 268;
  const CURVE_HEIGHT = 34;
  const CURVE_X0 = 4;
  const CURVE_X1 = 264;
  const CURVE_BASE_Y = 30;
  const CURVE_GOAL_Y = 12;
  const CURVE_TOP_Y = 4;

  // Объёмы «Кольца» — строка контракта «вид карточки»: четыре готовых.
  const RING_VOLUMES = [100, 200, 330, 500];
  const MINUS_VOLUME = 200;

  function formatIsoDate(date) {
    return date.toISOString().slice(0, 10);
  }

  function getWaterLsValue(key, fallbackValue) {
    const lsGet = HEYS?.utils?.lsGet || HEYS?.dayUtils?.lsGet;
    if (typeof lsGet === 'function') {
      return lsGet(key, fallbackValue);
    }
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallbackValue;
    } catch (_error) {
      return fallbackValue;
    }
  }

  function buildWeekSeries(day, waterGoal) {
    const anchorIso = (typeof day?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day.date))
      ? day.date
      : formatIsoDate(new Date());
    const anchorDate = new Date(anchorIso + 'T12:00:00');
    const goal = Math.max(1, Number(waterGoal) || 2000);
    const series = [];

    // Сегодня всегда правый (контракт 51): идём от −6 дней к нулю.
    for (let offset = WEEK_DAYS - 1; offset >= 0; offset--) {
      const date = new Date(anchorDate);
      date.setDate(date.getDate() - offset);
      const iso = formatIsoDate(date);
      const isToday = iso === anchorIso;
      const sourceDay = isToday
        ? (day || {})
        : (getWaterLsValue('heys_dayv2_' + iso, null) || {});
      const waterMl = Math.max(0, Number(sourceDay?.waterMl) || 0);
      series.push({ iso, waterMl, ratio: waterMl / goal, isToday });
    }

    const total = series.reduce((sum, item) => sum + item.waterMl, 0);
    return { series, avgMl: Math.round(total / WEEK_DAYS) };
  }

  function formatLiters(ml) {
    return ((Math.max(0, Number(ml) || 0)) / 1000).toFixed(1).replace('.', ',');
  }

  // Факт: ноль пишем «0», а не «0,0».
  function formatFact(ml) {
    const value = Math.max(0, Number(ml) || 0);
    return value > 0 ? formatLiters(value) : '0';
  }

  function curvePoint(item, index) {
    const step = (CURVE_X1 - CURVE_X0) / (WEEK_DAYS - 1);
    const x = Math.round((CURVE_X0 + step * index) * 10) / 10;
    const rawY = CURVE_BASE_Y - (CURVE_BASE_Y - CURVE_GOAL_Y) * (Number(item.ratio) || 0);
    const y = Math.round(Math.max(CURVE_TOP_Y, Math.min(CURVE_BASE_Y, rawY)) * 10) / 10;
    return { ...item, x, y };
  }

  /**
   * Оптимистичное обновление карточки без ре-рендера React.
   * Один вызов на addWater и removeWater — раньше этот DOM-код был скопирован дважды.
   */
  function applyOptimistic(cardEl, waterMl, waterGoal) {
    if (!cardEl) return;
    const goal = Math.max(1, Number(waterGoal) || 2000);
    const value = Math.max(0, Number(waterMl) || 0);
    const ratio = value / goal;
    const left = 'осталось ' + formatLiters(Math.max(0, goal - value));

    const factEl = cardEl.querySelector('.water-review__fact-value');
    if (factEl) factEl.textContent = formatFact(value);

    const leftEl = cardEl.querySelector('.water-review__left');
    if (leftEl) leftEl.textContent = left;

    const ringFill = cardEl.querySelector('.water-review__ring-fill');
    if (ringFill) {
      ringFill.setAttribute('stroke-dasharray', (Math.min(1, ratio) * RING_LENGTH) + ' ' + RING_LENGTH);
    }

    const ringFact = cardEl.querySelector('.water-review__ring-fact');
    if (ringFact) ringFact.textContent = formatFact(value) + ' л';

    const ringMeta = cardEl.querySelector('.water-review__ring-meta');
    if (ringMeta) ringMeta.textContent = 'из ' + formatLiters(goal) + ' · ' + left;

    // Убавить нечего — чип гаснет, но остаётся в ряду (контракт 59).
    cardEl.querySelectorAll('.water-review__chip--sub').forEach((el) => {
      el.classList.toggle('is-off', value <= 0);
      if (value <= 0) el.setAttribute('disabled', 'disabled');
      else el.removeAttribute('disabled');
    });
  }

  let _WaterReviewCard = null;

  function getWaterReviewComponent(React) {
    if (_WaterReviewCard) return _WaterReviewCard;

    function VolumeChip({ ml, kind, extraClass, disabled, onPick }) {
      return React.createElement('button', {
        type: 'button',
        className: 'water-review__chip water-review__chip--' + kind
          + (extraClass ? ' ' + extraClass : '')
          + (disabled ? ' is-off' : ''),
        disabled: disabled || undefined,
        onClick: (event) => onPick(ml, event)
      }, (kind === 'sub' ? '−' : '+') + ml);
    }

    _WaterReviewCard = function WaterReviewCard(props) {
      const {
        day, waterGoal, waterGoalBreakdown, waterLastDrink,
        addWater, removeWater, haptic, openExclusivePopup
      } = props;

      const goal = Math.max(1, Number(waterGoal) || 2000);
      const waterMl = Math.max(0, Number(day?.waterMl) || 0);
      const ratio = waterMl / goal;
      const week = buildWeekSeries(day, goal);
      const canRemove = waterMl > 0;
      const leftText = 'осталось ' + formatLiters(Math.max(0, goal - waterMl));

      const pickAdd = (ml, event) => {
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

      // Второй слой: разбор нормы и напоминание «давно не пил» — в metric-popup.
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

      const minusChip = React.createElement(VolumeChip, {
        ml: MINUS_VOLUME,
        kind: 'sub',
        disabled: !canRemove,
        onPick: pickRemove
      });

      const cardProps = {
        id: 'water-card',
        className: 'water-review water-review--ring'
          + ' compact-card widget-shadow-diary-glass widget-outline-diary-glass',
        'aria-label': 'Вода: ' + formatFact(waterMl) + ' л из ' + formatLiters(goal) + ' л'
      };

      {
        const points = week.series.map(curvePoint);
        const linePoints = points.map((point) => point.x + ',' + point.y).join(' ');
        const areaPath = 'M ' + points.map((point) => point.x + ' ' + point.y).join(' L ')
          + ' L ' + CURVE_X1 + ' ' + CURVE_BASE_Y + ' L ' + CURVE_X0 + ' ' + CURVE_BASE_Y + ' Z';

        const ringCard = React.createElement('div', cardProps,
          React.createElement('div', { className: 'water-review__top' },
            React.createElement('span', { className: 'water-review__kicker' },
              'Вода · 7 дней в среднем ' + formatLiters(week.avgMl) + ' л'
            )
          ),
          React.createElement('div', {
            className: 'water-review__ring',
            role: 'button',
            tabIndex: 0,
            onClick: openDetails
          },
            React.createElement('svg', {
              className: 'water-review__ring-svg',
              width: 58, height: 58, viewBox: '0 0 58 58', 'aria-hidden': 'true'
            },
              React.createElement('circle', {
                className: 'water-review__ring-track',
                cx: 29, cy: 29, r: RING_RADIUS, fill: 'none', strokeWidth: 6
              }),
              React.createElement('circle', {
                className: 'water-review__ring-fill',
                cx: 29, cy: 29, r: RING_RADIUS, fill: 'none', strokeWidth: 6,
                strokeLinecap: 'round',
                strokeDasharray: (Math.min(1, ratio) * RING_LENGTH) + ' ' + RING_LENGTH,
                transform: 'rotate(-90 29 29)'
              })
            ),
            React.createElement('span', { className: 'water-review__ring-text' },
              React.createElement('b', { className: 'water-review__ring-fact' }, formatFact(waterMl) + ' л'),
              React.createElement('span', { className: 'water-review__ring-meta' },
                'из ' + formatLiters(goal) + ' · ' + leftText
              )
            )
          ),
          React.createElement('div', { className: 'water-review__quick' },
            React.createElement(VolumeChip, {
              ml: MINUS_VOLUME,
              kind: 'sub',
              extraClass: 'water-review__chip--in-row',
              disabled: !canRemove,
              onPick: pickRemove
            }),
            RING_VOLUMES.map((ml) => React.createElement(VolumeChip, {
              key: ml, ml, kind: 'quick', onPick: pickAdd
            }))
          ),
          React.createElement('div', { className: 'water-review__curve' },
            React.createElement('svg', {
              width: CURVE_WIDTH, height: CURVE_HEIGHT,
              viewBox: '0 0 ' + CURVE_WIDTH + ' ' + CURVE_HEIGHT,
              fill: 'none', 'aria-hidden': 'true'
            },
              React.createElement('path', {
                className: 'water-review__curve-area', d: areaPath, fill: 'currentColor', opacity: 0.16
              }),
              React.createElement('line', {
                className: 'water-review__curve-goal',
                x1: CURVE_X0, y1: CURVE_GOAL_Y, x2: CURVE_X1, y2: CURVE_GOAL_Y,
                stroke: 'currentColor', strokeWidth: 1, strokeDasharray: '3 3', opacity: 0.5
              }),
              React.createElement('polyline', {
                className: 'water-review__curve-line',
                points: linePoints,
                stroke: 'currentColor', strokeWidth: 2.5,
                strokeLinecap: 'round', strokeLinejoin: 'round'
              }),
              points.map((point) => React.createElement('g', { key: point.iso },
                point.isToday && React.createElement('circle', {
                  className: 'water-review__curve-halo',
                  cx: point.x, cy: point.y, r: 6.8, fill: 'none',
                  stroke: 'currentColor', strokeWidth: 1.2, opacity: 0.45
                }),
                // Заливка означает ровно одно: норма взята. Сегодня несёт ореол, не заливку.
                point.ratio >= 1
                  ? React.createElement('circle', {
                    className: 'water-review__curve-dot is-goal',
                    cx: point.x, cy: point.y, r: point.isToday ? 3.4 : 2.6, fill: 'currentColor'
                  })
                  : React.createElement('circle', {
                    className: 'water-review__curve-dot',
                    cx: point.x, cy: point.y, r: point.isToday ? 3.4 : 2.6,
                    stroke: 'currentColor', strokeWidth: point.isToday ? 1.8 : 1.5
                  })
              ))
            )
          ),
        );

        return ringCard;
      }

    };

    return _WaterReviewCard;
  }

  /**
   * Render water card
   * @param {Object} params - Render parameters
   * @param {Object} params.React - React reference
   * @param {Object} params.ctx - day, waterGoal, waterGoalBreakdown, waterLastDrink
   * @param {Object} params.actions - addWater, removeWater, haptic, openExclusivePopup
   * @returns {ReactElement} Water card element
   */
  function renderWaterCard({ React, ctx, actions }) {
    const { day, waterGoal, waterGoalBreakdown, waterLastDrink } = ctx || {};
    const { addWater, removeWater, haptic, openExclusivePopup } = actions || {};

    return React.createElement(getWaterReviewComponent(React), {
      day,
      waterGoal,
      waterGoalBreakdown,
      waterLastDrink,
      addWater,
      removeWater,
      haptic,
      openExclusivePopup
    });
  }

  // Export
  HEYS.dayWater = {
    render: renderWaterCard,
    applyOptimistic,
    _test: { buildWeekSeries, formatLiters, formatFact, curvePoint }
  };

})(window);
