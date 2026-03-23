// heys_day_water_v1.js — Water tracking card component
// Extracted from heys_day_v12.js (PR-2: Step 1/2)
// Renders water intake tracking with ring progress and presets

; (function (global) {
  const HEYS = global.HEYS = global.HEYS || {};

  const WEEKDAY_LABELS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

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

  function buildWeeklyWaterSeries(day, waterGoal) {
    const anchorIso = (typeof day?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day.date))
      ? day.date
      : formatIsoDate(new Date());
    const anchorDate = new Date(anchorIso + 'T12:00:00');
    const goal = Math.max(1, Number(waterGoal) || 2000);
    const series = [];

    for (let offset = 13; offset >= 0; offset--) {
      const date = new Date(anchorDate);
      date.setDate(date.getDate() - offset);
      const iso = formatIsoDate(date);
      const isToday = iso === anchorIso;
      const sourceDay = iso === day?.date
        ? (day || {})
        : (getWaterLsValue('heys_dayv2_' + iso, null) || {});
      const waterMl = Math.max(0, Number(sourceDay?.waterMl) || 0);
      series.push({
        iso,
        waterMl,
        ratio: waterMl / goal,
        label: WEEKDAY_LABELS[date.getDay()],
        showLabel: offset % 2 === 1 || isToday,
        isToday
      });
    }

    return {
      series,
      avgMl: Math.round(series.reduce((sum, item) => sum + item.waterMl, 0) / Math.max(series.length, 1)),
      goalHitDays: series.filter(item => item.waterMl >= goal).length,
      maxRatio: Math.max(1, ...series.map(item => item.ratio), 1.05)
    };
  }

  function buildSparklineGeometry(weeklySeries) {
    const width = 300;
    const height = 40;
    const padX = 5;
    const padY = 5;
    const maxRatio = Math.max(1, Number(weeklySeries?.maxRatio) || 1);
    const innerWidth = width - padX * 2;
    const innerHeight = height - padY * 2;
    const points = (weeklySeries?.series || []).map((item, index, arr) => {
      const x = padX + (arr.length <= 1 ? innerWidth / 2 : (innerWidth * index) / (arr.length - 1));
      const y = padY + innerHeight - (Math.min(item.ratio, maxRatio) / maxRatio) * innerHeight;
      return { ...item, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
    });

    if (!points.length) {
      return {
        width,
        height,
        goalY: Math.round((padY + innerHeight) * 10) / 10,
        linePoints: '',
        areaPoints: ''
      };
    }

    const linePoints = points.map(point => `${point.x},${point.y}`).join(' ');
    const areaPoints = [
      `${points[0].x},${height - padY}`,
      ...points.map(point => `${point.x},${point.y}`),
      `${points[points.length - 1].x},${height - padY}`
    ].join(' ');
    const goalY = Math.round((padY + innerHeight - Math.min(1, maxRatio) / maxRatio * innerHeight) * 10) / 10;

    return { width, height, goalY, points, linePoints, areaPoints };
  }

  function formatWaterLiters(ml) {
    if (!ml) return '0 л';
    return (ml / 1000).toFixed(1).replace('.0', '') + ' л';
  }

  /**
   * Render water card
   * @param {Object} params - Render parameters
   * @param {Object} params.React - React reference
   * @param {Object} params.ctx - Context with day, prof, waterGoal, waterGoalBreakdown, waterPresets, 
   *                              waterMotivation, waterLastDrink, waterAddedAnim, showWaterDrop, showWaterTooltip
   * @param {Object} params.actions - Action handlers: setDay, haptic, setWaterAddedAnim, setShowWaterDrop,
   *                                  setShowWaterTooltip, handleWaterRingDown/Up/Leave, openExclusivePopup, addWater, removeWater
   * @returns {ReactElement} Water card element
   */
  function renderWaterCard({ React, ctx, actions }) {
    // Destructure all context variables
    const {
      day, prof,
      waterGoal, waterGoalBreakdown, waterPresets,
      waterMotivation, waterLastDrink, waterAddedAnim,
      showWaterDrop, showWaterTooltip
    } = ctx;

    // Destructure all actions
    const {
      setDay, haptic,
      setWaterAddedAnim, setShowWaterDrop, setShowWaterTooltip,
      handleWaterRingDown, handleWaterRingUp, handleWaterRingLeave,
      openExclusivePopup, addWater, removeWater
    } = actions;

    const weeklyWater = buildWeeklyWaterSeries(day, waterGoal);
    const sparkline = buildSparklineGeometry(weeklyWater);

    return React.createElement('div', { id: 'water-card', className: 'compact-water compact-card widget-shadow-diary-glass widget-outline-diary-glass' },
      React.createElement('div', { className: 'compact-card-header' }, '💧 ВОДА'),

      // Основной контент: кольцо + инфо + пресеты
      React.createElement('div', { className: 'water-card-content' },
        // Левая часть: кольцо прогресса + breakdown
        React.createElement('div', { className: 'water-ring-container' },
          React.createElement('div', {
            className: 'water-ring-large',
            onMouseDown: handleWaterRingDown,
            onMouseUp: handleWaterRingUp,
            onMouseLeave: handleWaterRingLeave,
            onTouchStart: handleWaterRingDown,
            onTouchEnd: handleWaterRingUp
          },
            React.createElement('svg', { viewBox: '0 0 36 36', className: 'water-ring-svg' },
              React.createElement('circle', { className: 'water-ring-bg', cx: 18, cy: 18, r: 15.9 }),
              React.createElement('circle', {
                className: 'water-ring-fill',
                cx: 18, cy: 18, r: 15.9,
                style: { strokeDasharray: Math.min(100, ((day.waterMl || 0) / waterGoal) * 100) + ' 100' }
              })
            ),
            React.createElement('div', {
              className: 'water-ring-center',
              onClick: (e) => {
                e.stopPropagation();
                const rect = e.currentTarget.getBoundingClientRect();
                openExclusivePopup('metric', {
                  type: 'water',
                  x: rect.left + rect.width / 2,
                  y: rect.top,
                  data: {
                    value: day.waterMl || 0,
                    goal: waterGoal,
                    ratio: (day.waterMl || 0) / waterGoal,
                    breakdown: waterGoalBreakdown,
                    lastDrink: waterLastDrink
                  }
                });
                haptic('light');
              },
              style: { cursor: 'pointer' }
            },
              React.createElement('span', { className: 'water-ring-value' },
                (day.waterMl || 0) >= 1000
                  ? ((day.waterMl || 0) / 1000).toFixed(1).replace('.0', '')
                  : (day.waterMl || 0)
              ),
              React.createElement('span', { className: 'water-ring-unit' },
                (day.waterMl || 0) >= 1000 ? 'л' : 'мл'
              )
            )
          ),
          // Анимация добавления (над кольцом)
          waterAddedAnim && React.createElement('span', {
            className: 'water-card-anim water-card-anim-above',
            key: 'water-anim-' + Date.now()
          }, waterAddedAnim),
          // Краткий breakdown под кольцом
          React.createElement('div', { className: 'water-goal-breakdown' },
            React.createElement('span', { className: 'water-breakdown-item' },
              '⚖️ ' + waterGoalBreakdown.base + 'мл'
            ),
            waterGoalBreakdown.stepsBonus > 0 && React.createElement('span', { className: 'water-breakdown-item water-breakdown-bonus' },
              '👟 +' + waterGoalBreakdown.stepsBonus
            ),
            waterGoalBreakdown.trainBonus > 0 && React.createElement('span', { className: 'water-breakdown-item water-breakdown-bonus' },
              '🏃 +' + waterGoalBreakdown.trainBonus
            ),
            waterGoalBreakdown.seasonBonus > 0 && React.createElement('span', { className: 'water-breakdown-item water-breakdown-bonus' },
              '☀️ +' + waterGoalBreakdown.seasonBonus
            ),
            waterGoalBreakdown.cycleBonus > 0 && React.createElement('span', { className: 'water-breakdown-item water-breakdown-bonus water-breakdown-cycle' },
              '🌸 +' + waterGoalBreakdown.cycleBonus
            )
          ),
          // Напоминание "Давно не пил" (если >2ч)
          waterLastDrink && waterLastDrink.isLong && (day.waterMl || 0) < waterGoal && React.createElement('div', {
            className: 'water-reminder'
          }, '⏰ ' + waterLastDrink.text)
        ),

        // Тултип с полной формулой (при долгом нажатии)
        showWaterTooltip && React.createElement('div', {
          className: 'water-formula-tooltip',
          onClick: () => setShowWaterTooltip(false)
        },
          React.createElement('div', { className: 'water-formula-title' }, '📊 Расчёт нормы воды'),
          React.createElement('div', { className: 'water-formula-row' },
            'Базовая: ' + waterGoalBreakdown.weight + ' кг × ' + waterGoalBreakdown.coef + ' мл = ' + waterGoalBreakdown.baseRaw + ' мл'
          ),
          waterGoalBreakdown.ageNote && React.createElement('div', { className: 'water-formula-row water-formula-sub' },
            'Возраст: ' + waterGoalBreakdown.ageNote
          ),
          waterGoalBreakdown.stepsBonus > 0 && React.createElement('div', { className: 'water-formula-row' },
            'Шаги: ' + (day.steps || 0).toLocaleString() + ' (' + waterGoalBreakdown.stepsCount + '×5000) → +' + waterGoalBreakdown.stepsBonus + ' мл'
          ),
          waterGoalBreakdown.trainBonus > 0 && React.createElement('div', { className: 'water-formula-row' },
            'Тренировки: ' + waterGoalBreakdown.trainCount + ' шт → +' + waterGoalBreakdown.trainBonus + ' мл'
          ),
          waterGoalBreakdown.seasonBonus > 0 && React.createElement('div', { className: 'water-formula-row' },
            'Сезон: ☀️ Лето → +' + waterGoalBreakdown.seasonBonus + ' мл'
          ),
          waterGoalBreakdown.cycleBonus > 0 && React.createElement('div', { className: 'water-formula-row water-formula-cycle' },
            '🌸 Особый период → +' + waterGoalBreakdown.cycleBonus + ' мл'
          ),
          React.createElement('div', { className: 'water-formula-total' },
            'Итого: ' + (waterGoal / 1000).toFixed(1) + ' л'
          ),
          React.createElement('div', { className: 'water-formula-hint' }, 'Нажми, чтобы закрыть')
        ),

        // Правая часть: пресеты + прогресс
        React.createElement('div', { className: 'water-card-right' },
          // Верхняя строка: мотивация + кнопка удаления
          React.createElement('div', { className: 'water-top-row' },
            React.createElement('div', { className: 'water-motivation-inline' },
              React.createElement('span', { className: 'water-motivation-emoji' }, waterMotivation.emoji),
              React.createElement('span', { className: 'water-motivation-text' }, waterMotivation.text)
            ),
            // Кнопка уменьшения (справа)
            (day.waterMl || 0) > 0 && React.createElement('button', {
              className: 'water-minus-compact',
              onClick: () => removeWater(100)
            }, '−100')
          ),

          // Прогресс-бар с волной
          React.createElement('div', { className: 'water-progress-inline' },
            // 💧 Падающая капля
            showWaterDrop && React.createElement('div', { className: 'water-drop-container' },
              React.createElement('div', { className: 'water-drop' }),
              React.createElement('div', { className: 'water-splash' })
            ),
            // Заливка
            React.createElement('div', {
              className: 'water-progress-fill',
              style: { width: Math.min(100, ((day.waterMl || 0) / waterGoal) * 100) + '%' }
            }),
            // Пузырьки (на уровне контейнера, чтобы не обрезались)
            (day.waterMl || 0) > 0 && React.createElement('div', { className: 'water-bubbles' },
              React.createElement('div', { className: 'water-bubble' }),
              React.createElement('div', { className: 'water-bubble' }),
              React.createElement('div', { className: 'water-bubble' }),
              React.createElement('div', { className: 'water-bubble' }),
              React.createElement('div', { className: 'water-bubble' })
            ),
            // Блик сверху
            React.createElement('div', { className: 'water-shine' }),
            // Волна на краю заливки
            (day.waterMl || 0) > 0 && ((day.waterMl || 0) / waterGoal) < 1 && React.createElement('div', {
              className: 'water-wave-edge',
              style: { left: Math.min(100, ((day.waterMl || 0) / waterGoal) * 100) + '%' }
            })
          ),

          // Пресеты в ряд
          React.createElement('div', { className: 'water-presets-row' },
            waterPresets.map(preset =>
              React.createElement('button', {
                key: preset.ml,
                className: 'water-preset-compact',
                // 🚀 PERF R34: defer addWater — day data save + re-render (88ms → ~0ms click)
                onClick: () => setTimeout(() => addWater(preset.ml, true), 0)
              },
                React.createElement('span', { className: 'water-preset-icon' }, preset.icon),
                React.createElement('span', { className: 'water-preset-ml' }, '+' + preset.ml)
              )
            )
          )
        )
      ),

      React.createElement('div', {
        className: 'water-weekly',
        'aria-label': `Вода за 14 дней: в среднем ${formatWaterLiters(weeklyWater.avgMl)}, цель выполнена ${weeklyWater.goalHitDays} из 14 дней`
      },
        React.createElement('div', { className: 'water-weekly-chart-shell' },
          React.createElement('span', { className: 'water-weekly-goal-meta' }, `${weeklyWater.goalHitDays}/14`),
          React.createElement('svg', {
            className: 'water-weekly-chart',
            viewBox: `0 0 ${sparkline.width} ${sparkline.height}`,
            preserveAspectRatio: 'none',
            role: 'img',
            'aria-hidden': 'true'
          },
            React.createElement('defs', null,
              React.createElement('linearGradient', { id: 'waterWeeklyArea', x1: '0%', y1: '0%', x2: '0%', y2: '100%' },
                React.createElement('stop', { offset: '0%', stopColor: 'rgba(14,165,233,0.34)' }),
                React.createElement('stop', { offset: '100%', stopColor: 'rgba(14,165,233,0.02)' })
              ),
              React.createElement('linearGradient', { id: 'waterWeeklyStroke', x1: '0%', y1: '0%', x2: '100%', y2: '0%' },
                React.createElement('stop', { offset: '0%', stopColor: '#38bdf8' }),
                React.createElement('stop', { offset: '100%', stopColor: '#0284c7' })
              )
            ),
            React.createElement('line', {
              className: 'water-weekly-goal-line',
              x1: 0,
              y1: sparkline.goalY,
              x2: sparkline.width,
              y2: sparkline.goalY
            }),
            sparkline.linePoints && React.createElement('polyline', {
              className: 'water-weekly-line',
              points: sparkline.linePoints
            }),
            (sparkline.points || []).map(point => React.createElement('circle', {
              key: point.iso,
              className: point.isToday
                ? 'water-weekly-dot water-weekly-dot--today'
                : point.ratio >= 1
                  ? 'water-weekly-dot water-weekly-dot--goal'
                  : 'water-weekly-dot',
              cx: point.x,
              cy: point.y,
              r: point.isToday ? 3.0 : point.ratio >= 1 ? 2.5 : 1.4
            }))
          )
        )
      ),

      // Лайфхак внизу карточки — на всю ширину
      React.createElement('div', { className: 'water-tip' },
        React.createElement('span', { className: 'water-tip-icon' }, '💡'),
        React.createElement('span', { className: 'water-tip-text' },
          'Утром поставь 4-5 бутылок 0,5л на кухне — вечером точно знаешь сколько выпил'
        )
      )
    );
  }

  // Export
  HEYS.dayWater = {
    render: renderWaterCard
  };

})(window);
