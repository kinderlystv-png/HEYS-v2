// heys_day_water_v1.js — Water tracking card component
// Extracted from heys_day_v12.js (PR-2: Step 1/2)
// Renders water intake tracking with ring progress and presets

; (function (global) {
  const HEYS = global.HEYS = global.HEYS || {};

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
                onClick: () => addWater(preset.ml, true) // skipScroll: уже внутри карточки
              },
                React.createElement('span', { className: 'water-preset-icon' }, preset.icon),
                React.createElement('span', { className: 'water-preset-ml' }, '+' + preset.ml)
              )
            )
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
