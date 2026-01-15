// heys_day_stats_vm_v1.js — Stats View Model builder
// Creates structured data for stats rendering (6 logical groups instead of 50 scattered fields)
// Part of PR-1: Reduce "shotgun surgery" for stats changes

;(function(global){
  const HEYS = global.HEYS = global.HEYS || {};
  
  /**
   * Build stats view model from raw data
   * @param {Object} params - Input parameters
   * @param {Object} params.prof - User profile
   * @param {Object} params.day - Current day data
   * @param {Object} params.dayTot - Day totals (macros)
   * @param {number} params.optimum - Target calories
   * @param {Object} params.normAbs - Absolute norms
   * @param {number} params.weight - Current weight
   * @param {Object} params.cycleDay - Menstrual cycle day info
   * @param {Object} params.ndteData - NDTE boost data
   * @param {Object} params.tefData - TEF data
   * @param {Array} params.hrZones - Heart rate zones (METs)
   * @param {string} params.chartPeriod - Chart period selection
   * @param {number} params.tdee - Total daily energy expenditure
   * @param {number} params.bmr - Basal metabolic rate
   * @param {number} params.eatenKcal - Calories eaten
   * @param {number} params.stepsK - Steps calories
   * @param {number} params.householdK - Household activities calories
   * @param {number} params.train1k - Training zone 1 calories
   * @param {number} params.train2k - Training zone 2 calories
   * @param {number} params.train3k - Training zone 3 calories
   * @param {number} params.tefKcal - TEF calories
   * @param {number} params.dayTargetDef - Day target deficit %
   * @param {number} params.baseExpenditure - Base expenditure
   * @param {Object} params.caloricDebt - Caloric debt analytics
   * @param {Array} params.sparklineData - Sparkline chart data
   * @param {Object} params.currentRatio - Current ratio status
   * @param {number} params.displayOptimum - Display optimum (with boosts)
   * @param {number} params.displayRemainingKcal - Display remaining calories
   * @returns {Object} Structured view model with 6 groups
   */
  function buildStatsVm(params) {
    const {
      prof = {},
      day = {},
      dayTot = {},
      optimum = 0,
      normAbs = {},
      weight = 70,
      cycleDay = null,
      ndteData = {},
      tefData = {},
      hrZones = [],
      chartPeriod = '7d',
      tdee = 0,
      bmr = 0,
      eatenKcal = 0,
      stepsK = 0,
      householdK = 0,
      train1k = 0,
      train2k = 0,
      train3k = 0,
      tefKcal = 0,
      dayTargetDef = 0,
      baseExpenditure = 0,
      caloricDebt = {},
      sparklineData = [],
      currentRatio = {},
      displayOptimum = 0,
      displayRemainingKcal = 0
    } = params;
    
    // Group 1: Energy metrics (TDEE, optimum, eaten, remaining)
    const energy = {
      tdee,
      bmr,
      baseExpenditure,
      optimum,
      displayOptimum,
      eatenKcal,
      remainingKcal: optimum - eatenKcal,
      displayRemainingKcal,
      deficitPct: dayTargetDef,
      actualDeficitPct: tdee ? Math.round(((eatenKcal - tdee) / tdee) * 100) : 0,
      // Activity breakdown
      stepsKcal: stepsK,
      householdKcal: householdK,
      training: {
        zone1: train1k,
        zone2: train2k,
        zone3: train3k,
        total: train1k + train2k + train3k
      },
      tefKcal,
      ndteBoost: ndteData?.tdeeBoost || 0
    };
    
    // Group 2: Macros (protein, carbs, fat, fiber)
    const macros = {
      protein: {
        value: dayTot?.prot || 0,
        norm: normAbs?.protMin || 0,
        normMax: normAbs?.protMax || 0,
        ratio: (dayTot?.prot || 0) / (normAbs?.protMin || 1)
      },
      carbs: {
        value: dayTot?.carbs || 0,
        norm: normAbs?.carbsMin || 0,
        normMax: normAbs?.carbsMax || 0,
        ratio: (dayTot?.carbs || 0) / (normAbs?.carbsMin || 1),
        simple: dayTot?.simple || 0,
        complex: dayTot?.complex || 0
      },
      fat: {
        value: dayTot?.fat || 0,
        norm: normAbs?.fatMin || 0,
        normMax: normAbs?.fatMax || 0,
        ratio: (dayTot?.fat || 0) / (normAbs?.fatMin || 1),
        good: dayTot?.good || 0,
        bad: dayTot?.bad || 0,
        trans: dayTot?.trans || 0
      },
      fiber: {
        value: dayTot?.fiber || 0,
        norm: normAbs?.fiberMin || 0
      }
    };
    
    // Group 3: Progress tracking (ratio, sparkline, weight)
    const progress = {
      currentRatio: currentRatio || {},
      sparklineData: sparklineData || [],
      chartPeriod,
      weight,
      weightMorning: day?.weightMorning || null,
      steps: day?.steps || 0,
      stepsGoal: prof?.stepsGoal || 7000
    };
    
    // Group 4: Debt & context (caloric debt, NDTE, cycle, training day)
    const debt = {
      caloricDebt: caloricDebt || {},
      ndteData: ndteData || {},
      tefData: tefData || {},
      cycleDay: cycleDay || null,
      isRefeedDay: day?.isRefeedDay || false,
      refeedReason: day?.refeedReason || null,
      hrZones: hrZones || []
    };
    
    // Group 5: UI state (expanded, popups, animations)
    const ui = {
      // These are typically passed from parent component state
      // Placeholder for future state management
      balanceCardExpanded: false,
      chartPeriod,
      showConfetti: false,
      shakeEaten: false,
      shakeOver: false
    };
    
    // Group 6: Computed display values (colors, labels, badges)
    const computed = {
      // Ratio status
      ratioStatus: currentRatio?.status || { emoji: '', text: '', color: '' },
      // Eaten color
      eatenColor: getEatenColor(eatenKcal, displayOptimum),
      // Remaining color
      remainingColor: getRemainingColor(displayRemainingKcal),
      // Context badges
      hasCycleContext: !!cycleDay,
      hasTrainingContext: !!caloricDebt?.trainingDayContext?.isTrainingDay,
      hasEmotionalRisk: (caloricDebt?.emotionalRisk?.bingeRisk || 0) >= 40,
      // Tour mode
      isTourActive: !!(global.HEYS?.OnboardingTour?.isActive?.())
    };
    
    return {
      energy,
      macros,
      progress,
      debt,
      ui,
      computed
    };
  }
  
  // Helper: Get eaten color based on amount vs goal
  function getEatenColor(eaten, goal) {
    if (!goal) return { bg: '#f8fafc', text: '#64748b', border: '#e2e8f0' };
    const ratio = eaten / goal;
    if (ratio < 0.8) {
      return { bg: '#fef9c320', text: '#eab308', border: '#eab30860' }; // Warning yellow
    } else if (ratio <= 1.05) {
      return { bg: '#dcfce720', text: '#22c55e', border: '#22c55e60' }; // Good green
    } else {
      return { bg: '#fee2e220', text: '#ef4444', border: '#ef444460' }; // Excess red
    }
  }
  
  // Helper: Get remaining color
  function getRemainingColor(remaining) {
    if (remaining > 100) {
      return { bg: '#22c55e20', text: '#22c55e', border: '#22c55e60' }; // Green
    } else if (remaining >= 0) {
      return { bg: '#eab30820', text: '#eab308', border: '#eab30860' }; // Yellow
    } else {
      return { bg: '#ef444420', text: '#ef4444', border: '#ef444460' }; // Red
    }
  }
  
  // Export
  HEYS.dayStatsVm = {
    build: buildStatsVm
  };
  
})(window);
