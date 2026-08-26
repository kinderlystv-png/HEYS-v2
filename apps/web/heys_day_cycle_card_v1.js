// heys_day_cycle_card_v1.js — v4 cycle card on nutrition/stats tab

(function () {
  const root = (typeof window !== 'undefined' ? window : globalThis) || {};
  const HEYS = (root.HEYS = root.HEYS || {});

  HEYS.dayCycleCard = HEYS.dayCycleCard || {};

  HEYS.dayCycleCard.renderCycleCard = function renderCycleCard(ctx) {
    const {
      React,
      showCycleCard,
      cyclePhase,
      day,
      date,
      setDay,
      lsGet,
      lsSet,
      isReadOnly,
      haptic,
    } = ctx || {};

    if (HEYS.CycleUI?.renderCycleMarkingPanel) {
      return HEYS.CycleUI.renderCycleMarkingPanel({
        React,
        variant: 'card',
        showCycleCard,
        cyclePhase,
        day,
        date: date || day?.date,
        setDay,
        lsGet,
        lsSet,
        isReadOnly,
        haptic,
        eatenKcal: ctx.eatenKcal,
        budgetKcal: ctx.budgetKcal,
        cycleKcalMultiplier: ctx.cycleKcalMultiplier,
      });
    }

    return null;
  };
})();
