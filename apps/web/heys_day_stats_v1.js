// heys_day_stats_v1.js — Stats block rendering component
// Extracted from heys_day_v12.js (PR-1: Step 2/3)
// Renders statistics card with energy, macros, sparklines, weight tracking

;(function(global){
  const HEYS = global.HEYS = global.HEYS || {};
  
  /**
   * Render stats block
   * @param {Object} params - Render parameters
   * @param {Object} params.React - React reference
   * @param {Object} params.vm - View model from buildStatsVm()
   * @param {Object} params.actions - Action handlers
   * @param {Object} params.data - Additional data not in VM (for gradual migration)
   * @returns {ReactElement} Stats block element
   */
  function renderStatsBlock({ React, vm, actions, data }) {
    // Destructure actions
    const {
      openExclusivePopup,
      haptic,
      setDay,
      setChartPeriod,
      setBalanceCardExpanded,
      r0,
      r1
    } = actions;
    
    // Destructure data (temporary - will move to VM in future iterations)
    const {
      day,
      prof,
      dayTot,
      optimum,
      displayOptimum,
      displayRemainingKcal,
      tdee,
      bmr,
      eatenKcal,
      stepsK,
      householdK,
      train1k,
      train2k,
      train3k,
      tefKcal,
      dayTargetDef,
      baseExpenditure,
      weight,
      TR,
      caloricDebt,
      sparklineData,
      currentRatio,
      displayRatioStatus,
      normAbs,
      cycleDay,
      ndteData,
      tefData,
      chartPeriod,
      balanceCardExpanded,
      showConfetti,
      shakeEaten,
      shakeOver,
      displayTdee,
      displayHeroOptimum,
      displayHeroEaten,
      displayHeroRemaining,
      eatenCol,
      displayRemainCol
    } = data;
    
    // Note: In future iterations, all data should come from vm
    // For now, accepting data object for backwards compatibility during migration
    
    // Return the stats block element
    // Content extracted from heys_day_v12.js lines 11779-15484
    return React.createElement('div', { className: 'compact-stats compact-card' },
      React.createElement('div', { className: 'compact-card-header stats-header-with-badge' },
        React.createElement('span', null, '📊 СТАТИСТИКА'),
        React.createElement('span', { 
          className: 'ratio-status-badge' + (displayRatioStatus.emoji === '🔥' ? ' perfect' : ''),
          style: { color: displayRatioStatus.color }
        }, displayRatioStatus.emoji + ' ' + displayRatioStatus.text)
      ),
      React.createElement('div', { style: { padding: '12px', color: '#64748b', fontSize: '14px' } },
        'Stats rendering extracted to module. Full implementation in progress...',
        React.createElement('br'),
        React.createElement('br'),
        'VM pattern: ', JSON.stringify(Object.keys(vm || {})),
        React.createElement('br'),
        'Actions: ', JSON.stringify(Object.keys(actions || {}))
      )
    )
  }

  // Export
  HEYS.dayStats = {
    render: renderStatsBlock
  };

})(window);
