// heys_day_popups_state_v1.js — popup state + helpers for DayTab
;(function (global) {
  const HEYS = global.HEYS = global.HEYS || {};

  const MOD = {};

  MOD.usePopupsState = function usePopupsState({ React }) {
    const { useState, useCallback, useEffect } = React;

    const [sparklinePopup, setSparklinePopup] = useState(null); // { type: 'kcal'|'weight', point, x, y }
    const [macroBadgePopup, setMacroBadgePopup] = useState(null); // { macro, emoji, desc, x, y }
    const [metricPopup, setMetricPopup] = useState(null); // { type: 'water'|'steps'|'kcal', x, y, data }
    const [tdeePopup, setTdeePopup] = useState(null); // { x, y, data }
    const [mealQualityPopup, setMealQualityPopup] = useState(null); // { meal, quality, mealTypeInfo, x, y }
    const [weekNormPopup, setWeekNormPopup] = useState(null); // { days, inNorm, withData, x, y }
    const [weekDeficitPopup, setWeekDeficitPopup] = useState(null); // { x, y, data }
    const [balanceDayPopup, setBalanceDayPopup] = useState(null); // { day, x, y }
    const [tefInfoPopup, setTefInfoPopup] = useState(null); // { x, y }
    const [goalPopup, setGoalPopup] = useState(null); // { x, y, data }
    const [debtSciencePopup, setDebtSciencePopup] = useState(null); // { title, content, links }

    // === Управление попапами: одновременно может быть только один ===
    const closeAllPopups = useCallback(() => {
      setSparklinePopup(null);
      setMacroBadgePopup(null);
      setMetricPopup(null);
      setTdeePopup(null);
      setMealQualityPopup(null);
      setWeekNormPopup(null);
      setGoalPopup(null);
      setDebtSciencePopup(null);
    }, []);

    const openExclusivePopup = useCallback((type, payload) => {
      setSparklinePopup(type === 'sparkline' ? payload : null);
      setMacroBadgePopup(type === 'macro' ? payload : null);
      setMetricPopup(type === 'metric' ? payload : null);
      setTdeePopup(type === 'tdee' ? payload : null);
      setMealQualityPopup(type === 'mealQuality' ? payload : null);
      setWeekNormPopup(type === 'weekNorm' ? payload : null);
      setGoalPopup(type === 'goal' ? payload : null);
      setDebtSciencePopup(type === 'debt-science' ? payload : null);
    }, []);

    // === Утилита для умного позиционирования попапов ===
    const getSmartPopupPosition = useCallback((clickX, clickY, popupWidth, popupHeight, options = {}) => {
      const {
        preferAbove = false,
        margin = 12,
        offset = 15,
        arrowSize = 8
      } = options;

      const screenW = window.innerWidth;
      const screenH = window.innerHeight;

      // Горизонтальная позиция
      let left, arrowPos = 'center';
      if (clickX < popupWidth / 2 + margin) {
        left = margin;
        arrowPos = 'left';
      } else if (clickX > screenW - popupWidth / 2 - margin) {
        left = screenW - popupWidth - margin;
        arrowPos = 'right';
      } else {
        left = clickX - popupWidth / 2;
      }

      // Вертикальная позиция
      let top, showAbove = false;
      const spaceBelow = screenH - clickY - offset;
      const spaceAbove = clickY - offset;

      if (preferAbove && spaceAbove >= popupHeight) {
        top = clickY - popupHeight - offset;
        showAbove = true;
      } else if (spaceBelow >= popupHeight) {
        top = clickY + offset;
      } else if (spaceAbove >= popupHeight) {
        top = clickY - popupHeight - offset;
        showAbove = true;
      } else {
        top = Math.max(margin, (screenH - popupHeight) / 2);
      }

      if (top < margin) top = margin;
      if (top + popupHeight > screenH - margin) {
        top = screenH - popupHeight - margin;
      }

      return { left, top, arrowPos, showAbove };
    }, []);

    // Закрытие popup при клике вне
    useEffect(() => {
      if (!sparklinePopup && !macroBadgePopup && !metricPopup && !mealQualityPopup && !tdeePopup && !weekNormPopup && !tefInfoPopup && !goalPopup && !weekDeficitPopup && !balanceDayPopup && !debtSciencePopup) return;
      const handleClickOutside = (e) => {
        if (sparklinePopup && !e.target.closest('.sparkline-popup')) {
          setSparklinePopup(null);
        }
        if (macroBadgePopup && !e.target.closest('.macro-badge-popup')) {
          setMacroBadgePopup(null);
        }
        if (metricPopup && !e.target.closest('.metric-popup')) {
          setMetricPopup(null);
        }
        if (mealQualityPopup && !e.target.closest('.meal-quality-popup') && !e.target.closest('.meal-bar-container')) {
          setMealQualityPopup(null);
        }
        if (tdeePopup && !e.target.closest('.tdee-popup')) {
          setTdeePopup(null);
        }
        if (weekNormPopup && !e.target.closest('.week-norm-popup')) {
          setWeekNormPopup(null);
        }
        if (weekDeficitPopup && !e.target.closest('.week-deficit-popup') && !e.target.closest('.week-heatmap-deficit')) {
          setWeekDeficitPopup(null);
        }
        if (balanceDayPopup && !e.target.closest('.balance-day-popup') && !e.target.closest('.balance-viz-bar') && !e.target.closest('.balance-viz-bar-clickable')) {
          setBalanceDayPopup(null);
        }
        if (tefInfoPopup && !e.target.closest('.tef-info-popup') && !e.target.closest('.tef-help-icon')) {
          setTefInfoPopup(null);
        }
        if (goalPopup && !e.target.closest('.goal-popup')) {
          setGoalPopup(null);
        }
        // debtSciencePopup закрывается через overlay onClick
      };
      const timerId = setTimeout(() => {
        document.addEventListener('click', handleClickOutside);
      }, 10);
      return () => {
        clearTimeout(timerId);
        document.removeEventListener('click', handleClickOutside);
      };
    }, [
      sparklinePopup,
      macroBadgePopup,
      metricPopup,
      mealQualityPopup,
      tdeePopup,
      weekNormPopup,
      weekDeficitPopup,
      balanceDayPopup,
      tefInfoPopup,
      goalPopup,
      debtSciencePopup
    ]);

    return {
      sparklinePopup,
      setSparklinePopup,
      macroBadgePopup,
      setMacroBadgePopup,
      metricPopup,
      setMetricPopup,
      tdeePopup,
      setTdeePopup,
      mealQualityPopup,
      setMealQualityPopup,
      weekNormPopup,
      setWeekNormPopup,
      weekDeficitPopup,
      setWeekDeficitPopup,
      balanceDayPopup,
      setBalanceDayPopup,
      tefInfoPopup,
      setTefInfoPopup,
      goalPopup,
      setGoalPopup,
      debtSciencePopup,
      setDebtSciencePopup,
      closeAllPopups,
      openExclusivePopup,
      getSmartPopupPosition
    };
  };

  HEYS.dayPopupsState = MOD;
})(window);
