// heys_day_cycle_card_v1.js — v4 cycle card on nutrition tab

(function () {
  const root = (typeof window !== 'undefined' ? window : globalThis) || {};
  const HEYS = (root.HEYS = root.HEYS || {});

  HEYS.dayCycleCard = HEYS.dayCycleCard || {};

  function renderCycleDayButtons(React, day, saveCycleDay) {
    return [1, 2, 3, 4, 5, 6, 7].map((d) =>
      React.createElement('button', {
        key: d,
        type: 'button',
        role: 'radio',
        className: 'cycle-card-v4__day-btn' + (day.cycleDay === d ? ' cycle-card-v4__day-btn--active' : ''),
        'aria-checked': day.cycleDay === d,
        'aria-label': `День ${d}`,
        onClick: () => saveCycleDay(d)
      }, d)
    );
  }

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

    const phaseLabel = cyclePhase?.shortName || 'Особый период';
    const dayLabel = day?.cycleDay ? `День ${day.cycleDay}` : null;

    if (!day?.cycleDay || cycleEditMode) {
      return React.createElement('div', {
        className: 'cycle-card-v4 cycle-card-v4--empty',
        key: 'cycle-card'
      },
        React.createElement('div', { className: 'cycle-card-v4__head' },
          React.createElement('span', { className: 'cycle-card-v4__title' }, 'Особый период'),
          !cycleEditMode && React.createElement('button', {
            type: 'button',
            className: 'cycle-card-v4__action',
            onClick: () => setCycleEditMode(true)
          }, 'Указать день')
        ),
        cycleEditMode && React.createElement('div', {
          className: 'cycle-card-v4__days',
          role: 'radiogroup',
          'aria-label': 'Какой день'
        }, renderCycleDayButtons(React, day, saveCycleDay)),
        cycleEditMode && React.createElement('div', { className: 'cycle-card-v4__actions' },
          day.cycleDay && React.createElement('button', {
            type: 'button',
            className: 'cycle-card-v4__clear',
            onClick: clearCycleDay
          }, 'Сбросить'),
          React.createElement('button', {
            type: 'button',
            className: 'cycle-card-v4__cancel',
            onClick: () => setCycleEditMode(false)
          }, 'Отмена')
        )
      );
    }

    return React.createElement('div', {
      className: 'cycle-card-v4 cycle-card-v4--filled',
      key: 'cycle-card'
    },
      React.createElement('button', {
        type: 'button',
        className: 'cycle-card-v4__head cycle-card-v4__head--filled',
        onClick: () => setCycleEditMode(true)
      },
        React.createElement('span', { className: 'cycle-card-v4__phase' }, phaseLabel),
        dayLabel && React.createElement('span', { className: 'cycle-card-v4__day' }, dayLabel)
      ),
      cyclePhase && React.createElement('div', { className: 'cycle-card-v4__badges' },
        cyclePhase.kcalMultiplier !== 1 && React.createElement('span', { className: 'cycle-card-v4__badge' },
          `+${Math.round((cyclePhase.kcalMultiplier - 1) * 100)} % ккал`
        ),
        cyclePhase.waterMultiplier !== 1 && React.createElement('span', { className: 'cycle-card-v4__badge' },
          `+${Math.round((cyclePhase.waterMultiplier - 1) * 100)} % вода`
        ),
        cyclePhase.insulinWaveMultiplier !== 1 && React.createElement('span', { className: 'cycle-card-v4__badge' },
          `+${Math.round((cyclePhase.insulinWaveMultiplier - 1) * 100)} % волна`
        )
      )
    );
  };
})();
