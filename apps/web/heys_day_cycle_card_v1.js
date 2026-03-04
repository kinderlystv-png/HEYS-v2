// heys_day_cycle_card_v1.js — extracted cycle card renderer

(function () {
  const root = (typeof window !== 'undefined' ? window : globalThis) || {};
  const HEYS = (root.HEYS = root.HEYS || {});

  HEYS.dayCycleCard = HEYS.dayCycleCard || {};

  HEYS.dayCycleCard.renderCycleCard = function renderCycleCard(ctx) {
    const {
      React,
      showCycleCard,
      cyclePhase,
      cycleEditMode,
      setCycleEditMode,
      day,
      saveCycleDay,
      clearCycleDay
    } = ctx || {};

    if (!showCycleCard) return null;

    return React.createElement('div', {
      className: 'cycle-card compact-card widget-shadow-diary-glass widget-outline-diary-glass' + (cycleEditMode ? ' cycle-card--editing' : ''),
      key: 'cycle-card'
    },
      // Если есть данные — показываем фазу
      cyclePhase ? React.createElement(React.Fragment, null,
        React.createElement('div', {
          className: 'cycle-card__header',
          onClick: () => setCycleEditMode(!cycleEditMode)
        },
          React.createElement('span', { className: 'cycle-card__icon' }, cyclePhase.icon),
          React.createElement('span', { className: 'cycle-card__title' }, cyclePhase.shortName),
          React.createElement('span', { className: 'cycle-card__day' }, 'День ' + day.cycleDay),
          React.createElement('span', { className: 'cycle-card__edit-hint' }, '✏️')
        ),
        !cycleEditMode && React.createElement('div', { className: 'cycle-card__info' },
          cyclePhase.kcalMultiplier !== 1 && React.createElement('span', { className: 'cycle-card__badge' },
            '🔥 ' + (cyclePhase.kcalMultiplier > 1 ? '+' : '') + Math.round((cyclePhase.kcalMultiplier - 1) * 100) + '% ккал'
          ),
          cyclePhase.waterMultiplier !== 1 && React.createElement('span', { className: 'cycle-card__badge' },
            '💧 +' + Math.round((cyclePhase.waterMultiplier - 1) * 100) + '% вода'
          ),
          cyclePhase.insulinWaveMultiplier !== 1 && React.createElement('span', { className: 'cycle-card__badge' },
            '📈 +' + Math.round((cyclePhase.insulinWaveMultiplier - 1) * 100) + '% волна'
          )
        )
      )
        // Если нет данных — показываем "Указать"
        : React.createElement('div', {
          className: 'cycle-card__header cycle-card__header--empty',
          onClick: () => setCycleEditMode(true)
        },
          React.createElement('span', { className: 'cycle-card__icon' }, '🌸'),
          React.createElement('span', { className: 'cycle-card__title' }, 'Особый период'),
          React.createElement('span', { className: 'cycle-card__empty-hint' }, 'Указать день →')
        ),

      // Режим редактирования — кнопки выбора дня
      cycleEditMode && React.createElement('div', { className: 'cycle-card__edit' },
        React.createElement('div', { className: 'cycle-card__days' },
          [1, 2, 3, 4, 5, 6, 7].map(d =>
            React.createElement('button', {
              key: d,
              className: 'cycle-card__day-btn' + (day.cycleDay === d ? ' cycle-card__day-btn--active' : ''),
              onClick: () => saveCycleDay(d)
            }, d)
          )
        ),
        React.createElement('div', { className: 'cycle-card__actions' },
          day.cycleDay && React.createElement('button', {
            className: 'cycle-card__clear-btn',
            onClick: clearCycleDay
          }, 'Сбросить'),
          React.createElement('button', {
            className: 'cycle-card__cancel-btn',
            onClick: () => setCycleEditMode(false)
          }, 'Отмена')
        )
      )
    );
  };
})();