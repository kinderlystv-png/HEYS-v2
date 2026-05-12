// heys_day_stats_vm_v1.js — Stats View Model builder
// Creates structured data for stats rendering (6 logical groups instead of 50 scattered fields)
// Part of PR-1: Reduce "shotgun surgery" for stats changes

; (function (global) {
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
  * @param {Object} params.displayRatioStatus - Display ratio status (debt-aware)
   * @param {number} params.displayOptimum - Display optimum (with boosts)
   * @param {number} params.displayRemainingKcal - Display remaining calories
  * @param {boolean} params.balanceCardExpanded - UI state: balance card expanded
  * @param {boolean} params.showConfetti - UI state: confetti flag
  * @param {boolean} params.shakeEaten - UI state: shake eaten
  * @param {boolean} params.shakeOver - UI state: shake over
  * @param {number|string} params.displayTdee - Displayed TDEE (tour-aware)
  * @param {number} params.displayHeroOptimum - Displayed optimum (tour-aware)
  * @param {number} params.displayHeroEaten - Displayed eaten kcal (tour-aware)
  * @param {number} params.displayHeroRemaining - Displayed remaining kcal (tour-aware)
  * @param {Object} params.sparklinePopup - UI state: sparkline popup
  * @param {Object} params.weekNormPopup - UI state: week norm popup
  * @param {Object} params.weekDeficitPopup - UI state: week deficit popup
  * @param {Object} params.balanceDayPopup - UI state: balance day popup
  * @param {Object} params.tdeePopup - UI state: tdee popup
  * @param {Object} params.tefInfoPopup - UI state: tef info popup
  * @param {Object} params.goalPopup - UI state: goal popup
  * @param {Object} params.debtSciencePopup - UI state: debt science popup
  * @param {Object} params.metricPopup - UI state: metric popup
  * @param {Object} params.macroBadgePopup - UI state: macro badge popup
  * @param {boolean} params.chartTransitioning - UI state: chart transition flag
  * @param {Object} params.metricPopupDeps - Deps for metric popup history (U, M, pIndex)
  * @param {Object} params.macroPopupDeps - Deps for macro popup history (U, pIndex)
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
      chartPeriod = 7,
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
      sparklineRenderData = null,
      currentRatio = {},
      currentDeficit = 0,
      profileDeficit = 0,
      date = '',
      insulinWaveData = null,
      balanceViz = null,
      displayOptimum = 0,
      displayRemainingKcal = 0,
      balanceCardExpanded = false,
      showConfetti = false,
      shakeEaten = false,
      shakeOver = false,
      displayTdee = 0,
      displayHeroOptimum = 0,
      displayHeroEaten = 0,
      displayHeroRemaining = 0,
      displayRatioStatus = null,
      ratioZones = null,
      weightSparklineData = [],
      weightTrend = null,
      kcalTrend = null,
      monthForecast = null,
      cycleHistoryAnalysis = null,
      weekHeatmapData = null,
      mealsChartData = null,
      sparklinePopup = null,
      weekNormPopup = null,
      weekDeficitPopup = null,
      balanceDayPopup = null,
      tdeePopup = null,
      tefInfoPopup = null,
      goalPopup = null,
      debtSciencePopup = null,
      metricPopup = null,
      macroBadgePopup = null,
      chartTransitioning = false,
      mealChartHintShown = false,
      newMealAnimatingIndex = -1,
      showFirstPerfectAchievement = false,
      insulinExpanded = false,
      isMobile = false,
      mobileSubTab = 'stats',
      metricPopupDeps = null,
      macroPopupDeps = null,
      mealsChartDeps = null,
      tefInfoDeps = null
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
      sparklineRenderData: sparklineRenderData || null,
      chartPeriod,
      currentDeficit: Number(currentDeficit) || 0,
      profileDeficit: Number(profileDeficit) || 0,
      date,
      insulinWaveData,
      balanceViz,
      weight,
      weightMorning: day?.weightMorning || null,
      steps: day?.steps || 0,
      stepsGoal: prof?.stepsGoal || 7000,
      weightSparklineData,
      weightTrend,
      kcalTrend,
      monthForecast,
      cycleHistoryAnalysis,
      weekHeatmapData,
      mealsChartData
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
      balanceCardExpanded,
      showConfetti,
      shakeEaten,
      shakeOver,
      sparklinePopup,
      weekNormPopup,
      weekDeficitPopup,
      balanceDayPopup,
      tdeePopup,
      tefInfoPopup,
      goalPopup,
      debtSciencePopup,
      metricPopup,
      macroBadgePopup,
      chartTransitioning,
      mealChartHintShown,
      newMealAnimatingIndex,
      showFirstPerfectAchievement,
      insulinExpanded,
      isMobile,
      mobileSubTab
    };

    // Group 6: Computed display values (colors, labels, badges)
    const computed = {
      // Ratio status
      ratioStatus: displayRatioStatus || currentRatio?.status || { emoji: '', text: '', color: '' },
      ratioBadgeStyle: { color: (displayRatioStatus || currentRatio?.status || {}).color },
      // Eaten color
      eatenColor: getEatenColor(displayHeroEaten, displayHeroOptimum),
      // Remaining color
      remainingColor: getRemainingColor(displayHeroRemaining),
      // Hero cards (TDEE/Goal)
      heroCardsMeta: buildHeroCardsMeta(day, displayHeroOptimum, optimum) || {},
      // Debt card
      debtCardMeta: buildDebtCardMeta(caloricDebt) || {},
      debtDaysMeta: buildDebtDaysMeta(caloricDebt),
      // Insight rows
      insightRowsMeta: buildInsightRowsMeta(caloricDebt) || {},
      // Day score styles
      dayScoreStyleMeta: buildDayScoreStyleMeta,
      // Progress gradient helper
      progressGradient: getProgressGradient,
      // Heatmap day styles
      heatmapDayStyleMeta: buildHeatmapDayStyleMeta,
      // Tour-aware display values
      displayTdee,
      displayHeroOptimum,
      displayHeroEaten,
      displayHeroRemaining,
      // Context badges
      hasCycleContext: !!cycleDay,
      hasTrainingContext: !!caloricDebt?.trainingDayContext?.isTrainingDay,
      hasEmotionalRisk: (caloricDebt?.emotionalRisk?.bingeRisk || 0) >= 40,
      // Tour mode
      isTourActive: !!(global.HEYS?.OnboardingTour?.isActive?.()),
      // Metric popup history (water/steps/kcal)
      metricPopupMeta: buildMetricPopupMeta(metricPopup, date, metricPopupDeps) || { styles: {}, sparkStyles: {} },
      macroPopupMeta: buildMacroPopupMeta(macroBadgePopup, date, normAbs, macroPopupDeps) || { styles: {}, sparkStyles: {} },
      sparklinePeriodMeta: buildSparklinePeriodMeta(sparklineData, ratioZones) || {},
      sparklineContainerStyle: { transition: 'opacity 0.15s ease' },
      weekHeatmapMeta: buildWeekHeatmapMeta(weekHeatmapData, ratioZones) || {},
      weekHeatmapDaysMeta: buildWeekHeatmapDaysMeta(weekHeatmapData),
      weekHeatmapDeficitMeta: buildWeekHeatmapDeficitMeta(weekHeatmapData) || {},
      weekDeficitPopupMeta: buildWeekDeficitPopupMeta(weekDeficitPopup) || { styles: {} },
      weekNormPopupMeta: buildWeekNormPopupMeta(weekNormPopup, ratioZones) || { styles: {} },
      balanceDayPopupMeta: buildBalanceDayPopupMeta(balanceDayPopup) || { styles: {} },
      mealsChartMeta: buildMealsChartMeta(mealsChartData, date, mealsChartDeps),
      sparklinePopupMeta: buildSparklinePopupMeta(sparklinePopup, sparklineData) || { styles: {} },
      sparklinePerfectPopupMeta: buildSparklinePerfectPopupMeta(sparklinePopup) || { styles: {} },
      weightPopupMeta: buildWeightPopupMeta(sparklinePopup) || { styles: {} },
      weightForecastPopupMeta: buildWeightForecastPopupMeta(sparklinePopup) || { styles: {} },
      macroRingsMeta: buildMacroRingsMeta(day, dayTot, normAbs, dayTargetDef, train1k, train2k, displayOptimum) || { styles: {} },
      tdeePopupMeta: buildTdeePopupMeta(tdeePopup) || { styles: {}, bmrBarStyle: {}, actBarStyle: {}, bmrPct: 0, actPct: 0, trainMinutes: [0, 0, 0] },
      goalPopupMeta: buildGoalPopupMeta(goalPopup) || { styles: {} },
      tefInfoPopupMeta: buildTefInfoPopupMeta(tefInfoDeps) || { styles: {} },
      debtSciencePopupMeta: buildDebtSciencePopupMeta(debtSciencePopup) || { styles: {} },
      excessStyleMeta: buildExcessStyleMeta(caloricDebt) || { style: {}, cardStyle: {}, badgeStyle: {} },
      excessCardMeta: buildExcessCardMeta(caloricDebt) || { styles: {} },
      excessSciencePopupMeta: buildExcessSciencePopupMeta() || {},
      balanceInsightsMeta: buildBalanceInsightsMeta(balanceViz),
      popupPositionStyle: buildPopupPositionStyle
    };

    // Group 7: Raw context (minimal raw data needed by view)
    const context = {
      day,
      prof,
      dayTot,
      normAbs
    };

    return {
      energy,
      macros,
      progress,
      debt,
      ui,
      computed,
      context
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

  function getProgressGradient(ratio) {
    if (ratio <= 0.5) return 'linear-gradient(90deg, #ef4444 0%, #f97316 100%)';
    if (ratio <= 0.8) return 'linear-gradient(90deg, #f97316 0%, #eab308 100%)';
    if (ratio <= 1.0) return 'linear-gradient(90deg, #eab308 0%, #22c55e 100%)';
    if (ratio <= 1.2) return 'linear-gradient(90deg, #22c55e 0%, #10b981 100%)';
    return 'linear-gradient(90deg, #f97316 0%, #ef4444 100%)';
  }

  function buildHeroCardsMeta(day, displayHeroOptimum, optimum) {
    const isRefeedDay = !!day?.isRefeedDay;
    const isBoosted = !isRefeedDay && displayHeroOptimum > optimum;

    return {
      tdeeCardStyle: { background: 'var(--bg-secondary, #f8fafc)', borderColor: '#e2e8f0', cursor: 'pointer' },
      tdeeValueStyle: { color: '#64748b' },
      goalCardStyle: {
        background: isRefeedDay ? '#fff7ed' : '#f0f9ff',
        borderColor: isRefeedDay ? '#fdba74' : '#bae6fd',
        cursor: 'pointer'
      },
      goalValueStyle: { color: isRefeedDay ? '#f97316' : (isBoosted ? '#10b981' : '#0369a1') },
      goalLabelSuffix: !isRefeedDay && isBoosted ? ' 💰' : '',
      refeedHintStyle: { fontSize: '9px', color: '#f97316', marginTop: '2px', textAlign: 'center' },
      getEatenCardStyle: (eatenCol) => ({
        background: eatenCol?.bg || '#f8fafc',
        borderColor: eatenCol?.border || '#e2e8f0',
        cursor: 'pointer'
      }),
      getEatenValueStyle: (eatenCol) => ({
        color: eatenCol?.text || '#64748b'
      }),
      getRemainingCardStyle: (remainCol) => ({
        background: remainCol?.bg || '#f8fafc',
        borderColor: remainCol?.border || '#e2e8f0'
      }),
      getRemainingValueStyle: (remainCol) => ({
        color: remainCol?.text || '#64748b'
      })
    };
  }

  function buildDebtCardMeta(caloricDebt) {
    const debt = caloricDebt?.debt || 0;
    const accentColor = debt > 700 ? '#ef4444' : debt > 400 ? '#f59e0b' : '#3b82f6';
    return { accentColor, iconStyle: { color: accentColor } };
  }

  function buildDebtDaysMeta(caloricDebt) {
    const dayBreakdown = caloricDebt?.dayBreakdown || [];
    if (!Array.isArray(dayBreakdown) || dayBreakdown.length === 0) return [];

    return dayBreakdown.map((d) => {
      const pct = Math.min(100, Math.abs(d.delta) / 500 * 100);
      return {
        ...d,
        barStyle: { height: pct + '%' }
      };
    });
  }

  function buildInsightRowsMeta(caloricDebt) {
    const proteinSeverity = caloricDebt?.proteinDebt?.severity || null;
    const emotionalLevel = caloricDebt?.emotionalRisk?.level || 'low';
    const circadianUrgency = caloricDebt?.circadianContext?.urgency || 'low';
    const trainingPriority = caloricDebt?.trainingDayContext?.nutritionPriority || null;
    const bmiRecommendation = caloricDebt?.bmiContext?.recommendation || null;

    return {
      flexGrow: { flex: 1 },
      proteinDebt: {
        containerStyle: {
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 12px',
          background: proteinSeverity === 'critical' ? 'rgba(239, 68, 68, 0.08)' : 'rgba(245, 158, 11, 0.08)',
          borderRadius: '8px',
          borderLeft: '3px solid ' + (proteinSeverity === 'critical' ? '#ef4444' : '#f59e0b')
        },
        iconStyle: { fontSize: '16px' },
        titleStyle: {
          fontWeight: 600,
          fontSize: '12px',
          color: proteinSeverity === 'critical' ? '#dc2626' : '#d97706'
        },
        subtitleStyle: { fontSize: '11px', color: '#64748b' },
        pmidStyle: { fontSize: '9px', color: '#94a3b8', textDecoration: 'none' }
      },
      emotionalRisk: {
        containerStyle: {
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 12px',
          background: emotionalLevel === 'critical'
            ? 'rgba(239, 68, 68, 0.12)'
            : emotionalLevel === 'high'
              ? 'rgba(239, 68, 68, 0.08)'
              : 'rgba(245, 158, 11, 0.06)',
          borderRadius: '8px',
          borderLeft: '3px solid ' + (
            emotionalLevel === 'critical' ? '#ef4444'
              : emotionalLevel === 'high' ? '#f97316'
                : '#eab308'
          ),
          animation: emotionalLevel === 'critical' ? 'pulse 2s infinite' : 'none'
        },
        iconStyle: { fontSize: '16px' },
        titleStyle: {
          fontWeight: 600,
          fontSize: '12px',
          color: emotionalLevel === 'critical' ? '#dc2626' : '#92400e'
        },
        subtitleStyle: { fontSize: '11px', color: '#64748b' },
        pmidStyle: { fontSize: '9px', color: '#94a3b8', textDecoration: 'none' }
      },
      circadianContext: {
        containerStyle: {
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 12px',
          background: circadianUrgency === 'high' ? 'rgba(99, 102, 241, 0.08)' : 'rgba(99, 102, 241, 0.08)',
          borderRadius: '8px',
          borderLeft: '3px solid #6366f1'
        },
        iconStyle: { fontSize: '16px' },
        titleStyle: { fontWeight: 600, fontSize: '12px', color: '#4f46e5' },
        subtitleStyle: { fontSize: '11px', color: '#64748b' },
        pmidStyle: { fontSize: '9px', color: '#94a3b8', textDecoration: 'none' }
      },
      trainingDayContext: {
        containerStyle: {
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 12px',
          background: 'rgba(34, 197, 94, 0.08)',
          borderRadius: '8px',
          borderLeft: '3px solid #22c55e'
        },
        iconStyle: { fontSize: '16px' },
        titleStyle: { fontWeight: 600, fontSize: '12px', color: '#166534' },
        subtitleStyle: { fontSize: '11px', color: '#64748b' },
        pmidStyle: { fontSize: '9px', color: '#94a3b8', textDecoration: 'none' },
        isActive: trainingPriority === 'highest'
      },
      bmiContext: {
        containerStyle: {
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 12px',
          background: 'rgba(148, 163, 184, 0.08)',
          borderRadius: '8px',
          fontSize: '11px',
          color: '#64748b'
        },
        iconStyle: {},
        pmidStyle: { fontSize: '9px', color: '#94a3b8', textDecoration: 'none', marginLeft: 'auto' },
        hasRecommendation: !!bmiRecommendation
      }
    };
  }

  function buildDayScoreStyleMeta(score) {
    if (!score || score <= 0) return null;
    const backgroundColor = score <= 3 ? '#fee2e2'
      : score <= 5 ? '#fef3c7'
        : score <= 7 ? '#fef3c7' : '#dcfce7';
    const color = score <= 3 ? '#dc2626'
      : score <= 5 ? '#d97706'
        : score <= 7 ? '#d97706' : '#16a34a';
    return { backgroundColor, color };
  }

  function buildHeatmapDayStyleMeta(day) {
    if (!day) return null;
    const nameColor = day.isWeekend ? '#ef4444' : (day.isToday ? '#3b82f6' : '#475569');
    return { nameColor };
  }

  function buildSparklinePeriodMeta(sparklineData, ratioZones) {
    if (!ratioZones || !Array.isArray(sparklineData)) return null;

    const daysWithDeficit = sparklineData.filter(p => p.kcal > 0 && p.target > 0);
    const ratios = daysWithDeficit.map(p => p.kcal / p.target);
    const avgRatio = ratios.length > 0
      ? ratios.reduce((a, b) => a + b, 0) / ratios.length
      : 0;
    const avgRatioPct = Math.round(avgRatio * 100);

    const zone = ratioZones.getZone ? ratioZones.getZone(avgRatio) : null;
    const isSuccess = ratioZones.isSuccess ? ratioZones.isSuccess(avgRatio) : false;
    const isPerfect = ratioZones.isPerfect ? ratioZones.isPerfect(avgRatio) : false;

    const deficitBadgeClass = 'sparkline-goal-badge' +
      (isSuccess ? '' :
        (zone?.id === 'low' || zone?.id === 'over') ? ' goal-low' : ' goal-critical');

    const deviation = avgRatioPct - 100;
    const deviationText = deviation >= 0 ? '+' + deviation + '%' : deviation + '%';
    const deficitIcon = isPerfect ? '✓' : isSuccess ? '✓' :
      (zone?.id === 'low' || zone?.id === 'over') ? '~' : '!';
    const deficitText = 'в среднем ' + deficitIcon + ' ' + deviationText;

    const tooltipText = zone
      ? 'Среднее выполнение нормы: ' + avgRatioPct + '% (' + zone.name + ')'
      : 'Среднее выполнение нормы: ' + avgRatioPct + '%';

    return {
      avgRatio,
      avgRatioPct,
      zone,
      isSuccess,
      isPerfect,
      deficitBadgeClass,
      deficitText,
      tooltipText
    };
  }

  function buildWeekHeatmapMeta(weekHeatmapData, ratioZones) {
    if (!ratioZones || !weekHeatmapData) return null;

    const avgRatio = (weekHeatmapData.avgRatioPct || 0) / 100;
    const avgRatioPct = weekHeatmapData.avgRatioPct || 0;

    const zone = ratioZones.getZone ? ratioZones.getZone(avgRatio) : null;
    const isSuccess = ratioZones.isSuccess ? ratioZones.isSuccess(avgRatio) : false;
    const isPerfect = ratioZones.isPerfect ? ratioZones.isPerfect(avgRatio) : false;

    const colorClass = isSuccess ? 'deficit-good' :
      (zone?.id === 'low' || zone?.id === 'over') ? 'deficit-warn' : 'deficit-bad';

    const deviation = avgRatioPct - 100;
    const deviationText = deviation >= 0 ? '+' + deviation + '%' : deviation + '%';
    const deficitIcon = isPerfect ? '✓' : isSuccess ? '✓' :
      (zone?.id === 'low' || zone?.id === 'over') ? '~' : '!';

    return {
      avgRatio,
      avgRatioPct,
      zone,
      isSuccess,
      isPerfect,
      colorClass,
      deviationText,
      deficitIcon
    };
  }

  function buildWeekHeatmapDeficitMeta(weekHeatmapData) {
    if (!weekHeatmapData || !(weekHeatmapData.totalEaten > 0)) return null;

    const totalEaten = weekHeatmapData.totalEaten;
    const totalBurned = weekHeatmapData.totalBurned;
    const daysWithData = weekHeatmapData.withData || 7;
    const hasRefeedInWeek = Array.isArray(weekHeatmapData.days)
      ? weekHeatmapData.days.some((d) => d?.isRefeedDay)
      : false;
    const diff = totalEaten - totalBurned;
    const diffPct = totalBurned > 0 ? Math.round((diff / totalBurned) * 100) : 0;
    const isDeficit = diff < 0;
    const targetDef = weekHeatmapData.avgTargetDeficit || 0;
    const deviation = Math.abs(diffPct - targetDef);

    const getDeltaPctTone = (delta, target) => {
      if (!Number.isFinite(delta) || !Number.isFinite(target)) return 'gray';

      const targetAbs = Math.abs(target);
      const hasTarget = targetAbs >= 1;

      if (!hasTarget) {
        if (delta === 0) return 'gray';
        return delta > 0 ? 'red' : 'green';
      }

      if (delta === 0) return 'yellow';

      if (Math.sign(delta) !== Math.sign(target)) {
        return 'red';
      }

      const deltaAbs = Math.abs(delta);
      const greenMin = targetAbs * 0.55;
      const greenMax = targetAbs * 1.25;

      if (deltaAbs >= greenMin && deltaAbs <= greenMax) {
        return 'green';
      }

      return 'yellow';
    };

    const getDeltaPctColor = (delta, target) => {
      const tone = getDeltaPctTone(delta, target);
      if (tone === 'green') return '#22c55e';
      if (tone === 'yellow') return '#f59e0b';
      if (tone === 'red') return '#ef4444';
      return '#94a3b8';
    };

    const tone = getDeltaPctTone(diffPct, targetDef);
    let colorClass;
    let icon;
    if (tone === 'green') {
      colorClass = 'positive';
      icon = '✅';
    } else if (tone === 'yellow') {
      colorClass = 'mixed';
      icon = isDeficit ? '📉' : '📈';
    } else if (tone === 'red') {
      colorClass = 'warning';
      icon = '⚠️';
    } else {
      colorClass = 'mixed';
      icon = '•';
    }
    const pctColor = getDeltaPctColor(diffPct, targetDef);
    const diffSign = diffPct >= 0 ? '+' : '';
    const targetSign = targetDef >= 0 ? '+' : '';

    const FAT_PERCENT = 0.77;
    const deficitKcal = Math.abs(diff);
    const fatBurnedGrams = isDeficit ? Math.round((deficitKcal * FAT_PERCENT) / 7.7) : 0;
    const fatBurnedText = fatBurnedGrams > 0
      ? (fatBurnedGrams >= 1000 ? (fatBurnedGrams / 1000).toFixed(1) + ' кг' : fatBurnedGrams + ' г') + ' жира'
      : null;

    const styles = {
      stack: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' },
      row: { display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px' },
      value: { fontWeight: '600' },
      slash: { color: '#9ca3af' },
      pct: { marginLeft: '6px', fontWeight: '600' },
      target: { marginLeft: '4px', fontSize: '11px', color: '#9ca3af' },
      fatText: { fontSize: '12px', color: '#16a34a', fontWeight: '500' }
    };

    const pctStyle = { ...styles.pct, color: pctColor };

    return {
      totalEaten,
      totalBurned,
      daysWithData,
      diff,
      diffPct,
      isDeficit,
      targetDef,
      deviation,
      colorClass,
      icon,
      pctColor,
      diffSign,
      targetSign,
      pctStyle,
      deficitKcal,
      fatBurnedGrams,
      fatBurnedText,
      styles,
      hasRefeedInWeek,
      popupData: {
        totalEaten,
        totalBurned,
        deficitKcal,
        deficitPct: diffPct,
        fatBurnedGrams,
        avgTargetDeficit: targetDef,
        daysWithData,
        isDeficit
      }
    };
  }

  function buildWeekHeatmapDaysMeta(weekHeatmapData) {
    if (!weekHeatmapData || !Array.isArray(weekHeatmapData.days)) return null;

    return weekHeatmapData.days.map((d, i) => {
      const title = d.isFuture
        ? d.name
        : (d.kcal > 0
          ? (d.isRefeedDay ? '🍕 Загрузочный день\n' : '') +
          d.kcal + ' ккал (' + Math.round(d.ratio * 100) + '%)' +
          (d.isStreakDay ? '\n✅ Streak +1' : '\n⚠️ Вне нормы')
          : 'Нет данных');

      const className = 'week-heatmap-day ' + d.status +
        (d.isToday ? ' today' : '') +
        (d.isWeekend ? ' weekend' : '') +
        (d.isRefeedDay ? ' refeed-day' : '') +
        (d.isStreakDay ? ' streak-day' : '');

      const style = {
        '--stagger-delay': (i * 50) + 'ms',
        '--day-bg-color': d.bgColor || 'transparent'
      };

      const cellStyle = d.bgColor
        ? { background: d.bgColor, display: 'flex', alignItems: 'center', justifyContent: 'center' }
        : { display: 'flex', alignItems: 'center', justifyContent: 'center' };

      const emojiStyle = { fontSize: '14px', lineHeight: 1 };

      return {
        ...d,
        title,
        className,
        style,
        cellStyle,
        emojiStyle
      };
    });
  }

  function buildWeekNormPopupMeta(weekNormPopup, ratioZones) {
    if (!weekNormPopup || !Array.isArray(weekNormPopup.days)) return null;

    const styles = {
      popup: {
        position: 'fixed',
        zIndex: 9999
      },
      stripe: { background: 'linear-gradient(90deg, #22c55e 0%, #10b981 100%)' },
      headerValue: { color: '#16a34a', fontSize: '16px', fontWeight: 700 },
      list: { display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '12px' }
    };

    const days = weekNormPopup.days
      .filter(d => !d.isFuture)
      .map((d) => {
        const ratioPct = Math.round((d.ratio || 0) * 100);
        const hasRatio = d.status !== 'empty' && d.status !== 'in-progress';
        const badgeColor = hasRatio
          ? (ratioZones?.getGradientColor ? ratioZones.getGradientColor(d.ratio, 0.9) : '#22c55e')
          : null;

        const statusText = d.status === 'in-progress'
          ? '⏳ в процессе'
          : d.status === 'empty'
            ? '— нет данных'
            : null;

        const rowStyle = {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 8px',
          borderRadius: '8px',
          background: d.isToday ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
          border: d.isToday ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid transparent'
        };

        const nameStyle = {
          fontWeight: d.isToday ? 700 : 500,
          color: d.isWeekend ? '#ef4444' : (d.isToday ? '#3b82f6' : '#475569')
        };

        const statusTextStyle = { color: '#94a3b8', fontSize: '12px' };

        const badgeStyle = {
          padding: '2px 8px',
          borderRadius: '12px',
          fontSize: '12px',
          fontWeight: 600,
          color: '#fff',
          background: badgeColor || (ratioZones?.getGradientColor ? ratioZones.getGradientColor(d.ratio, 0.9) : '#22c55e')
        };

        return {
          ...d,
          ratioPct,
          badgeColor,
          statusText,
          rowStyle,
          nameStyle,
          statusTextStyle,
          badgeStyle
        };
      });

    return {
      inNorm: weekNormPopup.inNorm,
      withData: weekNormPopup.withData,
      days,
      styles
    };
  }

  function buildMealsChartMeta(mealsChartData, date, deps) {
    if (!mealsChartData || !date || !deps) return null;
    const { U, pIndex } = deps || {};
    if (!U || !U.lsGet) return null;

    const parseTime = (t) => {
      if (!t) return 0;
      const parts = t.split(':').map(Number);
      const h = parts[0] || 0;
      const m = parts[1] || 0;
      return h * 60 + m;
    };

    try {
      const yesterday = new Date(date);
      if (Number.isNaN(yesterday.getTime())) return null;
      yesterday.setDate(yesterday.getDate() - 1);
      const yStr = yesterday.toISOString().slice(0, 10);
      const yData = U.lsGet('heys_dayv2_' + yStr, null);
      if (!yData || !Array.isArray(yData.meals)) return { yesterdayMeals: [] };

      const yMeals = yData.meals.filter(m => m.time && Array.isArray(m.items) && m.items.length > 0);
      if (yMeals.length < 2) return { yesterdayMeals: [] };

      const yesterdayMeals = yMeals.map(m => {
        const t = parseTime(m.time);
        let kcal = 0;
        (m.items || []).forEach(item => {
          const g = +item.grams || 0;
          const nameKey = (item.name || '').trim().toLowerCase();
          const prod = (nameKey && pIndex?.byName?.get(nameKey)) ||
            (item.product_id != null ? pIndex?.byId?.get(String(item.product_id).toLowerCase()) : null);
          const src = prod || item;
          if (src.kcal100 != null && g > 0) kcal += (+src.kcal100 || 0) * g / 100;
        });
        return { time: m.time, t, kcal };
      }).filter(p => p.t > 0 && p.kcal > 0);

      if (yesterdayMeals.length < 2) return { yesterdayMeals: [] };

      return { yesterdayMeals };
    } catch (e) {
      return { yesterdayMeals: [] };
    }
  }

  function buildSparklinePopupMeta(sparklinePopup, sparklineData) {
    if (!sparklinePopup || sparklinePopup.type !== 'kcal') return null;
    const point = sparklinePopup.point;
    if (!point || !point.target) return null;

    const ratio = point.kcal / point.target;
    const pct = Math.round(ratio * 100);

    const getColor = (r) => {
      if (r <= 0.5) return '#ef4444';
      if (r < 0.75) return '#eab308';
      if (r < 0.9) return '#22c55e';
      if (r < 1.1) return '#10b981';
      if (r < 1.3) return '#eab308';
      return '#ef4444';
    };

    const getGradient = (r) => {
      if (r < 0.5) return 'linear-gradient(90deg, #ef4444 0%, #ef4444 100%)';
      if (r < 0.75) return 'linear-gradient(90deg, #ef4444 0%, #eab308 100%)';
      if (r < 1.0) return 'linear-gradient(90deg, #eab308 0%, #22c55e 100%)';
      if (r < 1.15) return 'linear-gradient(90deg, #22c55e 0%, #10b981 100%)';
      return 'linear-gradient(90deg, #eab308 0%, #ef4444 100%)';
    };

    const color = getColor(ratio);
    const gradient = getGradient(ratio);

    let diff = null;
    if (Array.isArray(sparklineData)) {
      const idx = sparklineData.findIndex(p => p.date === point.date);
      const prevPoint = idx > 0 ? sparklineData[idx - 1] : null;
      diff = prevPoint ? point.kcal - prevPoint.kcal : null;
    }

    const styles = {
      popup: { position: 'fixed', zIndex: 9999 },
      stripe: { background: color },
      pct: { color },
      progressFill: { width: Math.min(100, pct) + '%', background: gradient },
      value: { color, fontWeight: 700, fontSize: '15px' }
    };

    return {
      point,
      ratio,
      pct,
      color,
      gradient,
      diff,
      styles
    };
  }

  function buildSparklinePerfectPopupMeta(sparklinePopup) {
    if (!sparklinePopup || sparklinePopup.type !== 'perfect') return null;
    const point = sparklinePopup.point;
    if (!point || !point.target) return null;

    const pct = Math.round((point.kcal / point.target) * 100);
    const stripeGradient = 'linear-gradient(90deg, #f59e0b, #fbbf24)';
    const pctColor = '#f59e0b';

    const styles = {
      popup: { position: 'fixed', zIndex: 9999 },
      stripe: { background: stripeGradient },
      pct: { color: pctColor },
      progressFill: { width: Math.min(100, pct) + '%', background: stripeGradient },
      value: { color: pctColor, fontWeight: 700, fontSize: '15px' }
    };

    return { pct, styles };
  }

  function buildMacroRingsMeta(day, dayTot, normAbs, dayTargetDef, train1k, train2k, displayOptimum) {
    if (!dayTot || !normAbs) return null;

    const hasDeficit = (dayTargetDef || 0) < 0;
    const hasTraining = (day?.trainings && day.trainings.length > 0) || ((train1k || 0) + (train2k || 0) > 0);

    // Унификация колец БЖУ с шапкой и виджетами: target пересчитываем
    // от displayOptimum (включает рефид/dailyBoost/dailyReduction).
    // Базовый normAbs остаётся для других мест DayTab — кольца берут displayNormAbs.
    let displayNormAbs = null;
    if (Number.isFinite(displayOptimum) && displayOptimum > 0
        && HEYS.dayCalculations && typeof HEYS.dayCalculations.computeDailyNorms === 'function') {
      const _normPerc = (HEYS.utils && typeof HEYS.utils.lsGet === 'function') ? (HEYS.utils.lsGet('heys_norms', {}) || {}) : {};
      try {
        const _calc = HEYS.dayCalculations.computeDailyNorms(displayOptimum, _normPerc);
        if (_calc) {
          displayNormAbs = _calc;
          normAbs = _calc; // переопределяем для всех расчётов ниже (ratio, color, overData, ringStrokeStyle)
        }
      } catch (_) { /* fallback на базовый normAbs */ }
    }

    const getProteinColor = (actual, norm, hasTrainingFlag) => {
      if (!norm || norm === 0) return '#6b7280';
      const ratio = actual / norm;
      const minGood = hasTrainingFlag ? 1.0 : 0.9;
      const minOk = hasTrainingFlag ? 0.7 : 0.6;
      if (ratio < minOk) return '#ef4444';
      if (ratio < minGood) return '#f59e0b';
      return '#22c55e';
    };

    const getFatColor = (actual, norm) => {
      if (!norm || norm === 0) return '#6b7280';
      const ratio = actual / norm;
      if (ratio < 0.5) return '#ef4444';
      if (ratio < 0.8) return '#f59e0b';
      if (ratio <= 1.2) return '#22c55e';
      if (ratio <= 1.5) return '#f59e0b';
      return '#ef4444';
    };

    const getCarbsColor = (actual, norm, hasDeficitFlag) => {
      if (!norm || norm === 0) return '#6b7280';
      const ratio = actual / norm;
      if (hasDeficitFlag) {
        if (ratio < 0.3) return '#f59e0b';
        if (ratio <= 0.8) return '#22c55e';
        if (ratio <= 1.0) return '#22c55e';
        if (ratio <= 1.2) return '#f59e0b';
        return '#ef4444';
      }
      if (ratio < 0.5) return '#ef4444';
      if (ratio < 0.8) return '#f59e0b';
      if (ratio <= 1.1) return '#22c55e';
      if (ratio <= 1.3) return '#f59e0b';
      return '#ef4444';
    };

    const getBadges = (color, isProtein, ratio, contextEmoji, contextDesc) => {
      const badges = [];

      if (color === '#ef4444') {
        if (ratio < 0.6) badges.push({ emoji: '⚠️', desc: 'Критически мало! Нужно добавить.' });
        else badges.push({ emoji: '⚠️', desc: 'Перебор! Слишком много.' });
      } else if (color === '#22c55e') {
        if (isProtein && ratio >= 1.2) {
          badges.push({ emoji: '💪', desc: 'Отлично! Много белка для мышц.' });
        } else if (ratio >= 0.95 && ratio <= 1.05) {
          badges.push({ emoji: '✓', desc: 'Идеально! Точно в норме.' });
        }
      }

      if (contextEmoji && badges.length < 2) badges.push({ emoji: contextEmoji, desc: contextDesc });

      return badges;
    };

    const protRatio = (dayTot.prot || 0) / (normAbs.prot || 1);
    const fatRatio = (dayTot.fat || 0) / (normAbs.fat || 1);
    const carbsRatio = (dayTot.carbs || 0) / (normAbs.carbs || 1);

    // Унифицированный источник цветов — HEYS.MacroRings.computeRingData (heys_macro_rings_core_v1.js).
    // Виджеты и недельный отчёт дёргают то же — кольца перестают расходиться между вкладками.
    // Inline getProteinColor/getFatColor/getCarbsColor остаются как fallback для случаев когда
    // core ещё не загружен (PWA cold start, неверный порядок бандлов).
    const _ringsCore = (HEYS.MacroRings && HEYS.MacroRings.computeRingData)
      ? HEYS.MacroRings.computeRingData({ dayTot, normAbs, hasTraining, hasDeficit })
      : null;
    const protColor = _ringsCore ? _ringsCore.protein.color : getProteinColor(dayTot.prot || 0, normAbs.prot, hasTraining);
    const fatColor = _ringsCore ? _ringsCore.fat.color : getFatColor(dayTot.fat || 0, normAbs.fat);
    const carbsColor = _ringsCore ? _ringsCore.carbs.color : getCarbsColor(dayTot.carbs || 0, normAbs.carbs, hasDeficit);

    const protBadges = getBadges(protColor, true, protRatio, hasTraining ? '🏋️' : null, 'Сегодня тренировка — белок важнее!');
    const fatBadges = getBadges(fatColor, false, fatRatio, null, null);
    const carbsBadges = getBadges(carbsColor, false, carbsRatio, hasDeficit ? '📉' : null, 'Режим дефицита — меньше углеводов = лучше');

    const clampPct = (ratio) => {
      const raw = Number.isFinite(ratio) ? ratio : 0;
      return Math.min(100, Math.max(0, raw * 100));
    };

    const ringStartOffsetPct = 7; // чуть больше (~25°)
    const ringCapCompPct = 5; // компенсация скруглённых концов
    const ringStrokeStyle = (ratio, color, gradientId) => ({
      strokeDasharray: Math.max(0, clampPct(ratio) - ringCapCompPct) + ' 100',
      '--ring-dasharray': Math.max(0, clampPct(ratio) - ringCapCompPct) + ' 100',
      '--ring-start-offset': -ringStartOffsetPct,
      stroke: gradientId ? 'url(#' + gradientId + ')' : color
    });

    // Данные для отрисовки перебора
    const getOverData = (ratio) => {
      const hasOver = ratio > 1;
      const overPctRaw = hasOver ? Math.min(50, Math.round((ratio - 1) * 100)) : 0;
      const overPct = Math.max(0, overPctRaw - ringCapCompPct);
      return { hasOver, overPct };
    };

    const protOverData = getOverData(protRatio);
    const fatOverData = getOverData(fatRatio);
    const carbsOverData = getOverData(carbsRatio);

    const styles = {
      ringButton: { cursor: 'pointer' },
      value: (color) => ({ color })
    };

    return {
      hasDeficit,
      hasTraining,
      protRatio,
      fatRatio,
      carbsRatio,
      protColor,
      fatColor,
      carbsColor,
      protBadges,
      fatBadges,
      carbsBadges,
      protRingStrokeStyle: ringStrokeStyle(protRatio, protColor, 'macro-ring-gradient-protein'),
      fatRingStrokeStyle: ringStrokeStyle(fatRatio, fatColor, 'macro-ring-gradient-fat'),
      carbsRingStrokeStyle: ringStrokeStyle(carbsRatio, carbsColor, 'macro-ring-gradient-carbs'),
      protOverData,
      fatOverData,
      carbsOverData,
      styles,
      displayNormAbs, // null если displayOptimum не передан/невалиден — рендер использует базовый normAbs
    };
  }

  function buildTdeePopupMeta(tdeePopup) {
    if (!tdeePopup || !tdeePopup.data) return null;
    const d = tdeePopup.data;

    const trainTotal = (d.train1k || 0) + (d.train2k || 0) + (d.train3k || 0);
    const actTotal = trainTotal + (d.stepsK || 0) + (d.householdK || 0);

    const bmrPct = d.tdee > 0 ? Math.round((d.bmr / d.tdee) * 100) : 0;
    const actPct = 100 - bmrPct;

    const trainMinutes = (idx) => {
      const t = d.trainings && d.trainings[idx];
      if (!t || !t.z) return 0;
      return t.z.reduce((sum, m) => sum + (+m || 0), 0);
    };

    const styles = {
      popup: {
        position: 'fixed',
        background: 'var(--card, white)',
        borderRadius: '16px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        padding: '16px',
        zIndex: 10000,
        animation: 'fadeIn 0.15s ease-out'
      },
      header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '12px',
        paddingRight: '28px'
      },
      headerTitle: { fontSize: '14px', fontWeight: 600, color: '#0f172a' },
      headerValue: { fontSize: '18px', fontWeight: 800, color: '#475569' },
      ndteLabel: { display: 'flex', alignItems: 'center', gap: '4px' },
      ndteLink: { fontSize: '9px', color: '#6366f1', textDecoration: 'none' },
      bmiRow: { marginTop: '4px', padding: '6px 8px', background: 'var(--bg-secondary, #f8fafc)', borderRadius: '8px' },
      bmiRowText: {
        fontSize: '10px',
        color: '#64748b',
        display: 'flex',
        alignItems: 'center',
        gap: '4px'
      },
      bmiRowLink: { fontSize: '9px', color: '#6366f1', textDecoration: 'none', marginLeft: 'auto' },
      closeBtn: {
        position: 'absolute',
        top: '12px',
        right: '12px',
        width: '24px',
        height: '24px',
        background: 'rgba(0,0,0,0.05)',
        border: 'none',
        borderRadius: '50%',
        cursor: 'pointer',
        fontSize: '14px',
        color: '#64748b',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    };

    return {
      trainTotal,
      actTotal,
      bmrPct,
      actPct,
      trainMinutes: [trainMinutes(0), trainMinutes(1), trainMinutes(2)],
      bmrBarStyle: { width: bmrPct + '%' },
      actBarStyle: { width: actPct + '%' },
      styles
    };
  }

  function buildGoalPopupMeta(goalPopup) {
    if (!goalPopup || !goalPopup.data) return null;
    const d = goalPopup.data;
    const baseOptimumCalc = Math.round(d.baseExpenditure * (1 + d.deficitPct / 100));
    const deficitColor = d.deficitPct >= 0 ? '#10b981' : '#f59e0b';
    const styles = {
      popup: {
        position: 'fixed',
        background: 'var(--card, white)',
        borderRadius: '16px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        padding: '16px',
        zIndex: 10000,
        animation: 'fadeIn 0.15s ease-out'
      },
      title: { fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: '#0f172a' },
      rows: { display: 'flex', flexDirection: 'column', gap: '8px' },
      row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
      rowLabel: { fontSize: '13px', color: '#64748b' },
      rowValue: { fontSize: '13px', fontWeight: 500, color: '#0f172a' },
      deficitValue: { fontSize: '13px', fontWeight: 500, color: deficitColor },
      separatorDashed: { borderTop: '1px dashed #e2e8f0', margin: '4px 0' },
      totalWrap: { borderTop: '1px solid #e2e8f0', paddingTop: '8px', marginTop: '4px' },
      totalLabel: { fontSize: '14px', fontWeight: 600, color: '#0f172a' },
      totalValue: { fontSize: '14px', fontWeight: 600, color: '#0369a1' },
      boostLabel: { fontSize: '13px', color: '#10b981' },
      boostValue: { fontSize: '13px', fontWeight: 500, color: '#10b981' },
      refeedLabel: { fontSize: '13px', color: '#f97316' },
      refeedValue: { fontSize: '13px', fontWeight: 500, color: '#f97316' },
      tefNote: {
        marginTop: '12px',
        padding: '8px',
        background: 'var(--bg-secondary, #f8fafc)',
        borderRadius: '8px',
        fontSize: '11px',
        color: '#64748b',
        lineHeight: '1.4'
      },
      closeBtn: {
        position: 'absolute',
        top: '12px',
        right: '12px',
        width: '24px',
        height: '24px',
        background: 'rgba(0,0,0,0.05)',
        border: 'none',
        borderRadius: '50%',
        cursor: 'pointer',
        fontSize: '14px',
        color: '#64748b',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    };
    return { baseOptimumCalc, styles };
  }

  function buildDebtSciencePopupMeta(debtSciencePopup) {
    if (!debtSciencePopup) return null;

    const styles = {
      popup: {
        position: 'fixed',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        width: '320px',
        maxWidth: '90vw',
        background: 'var(--card, white)',
        borderRadius: '20px',
        boxShadow: '0 16px 64px rgba(0,0,0,0.2)',
        padding: '20px',
        animation: 'fadeIn 0.2s ease-out',
        zIndex: 10001
      },
      title: { fontSize: '15px', fontWeight: 700, marginBottom: '16px', color: '#0f172a' },
      content: { display: 'flex', flexDirection: 'column', gap: '14px' },
      item: { display: 'flex', flexDirection: 'column', gap: '4px' },
      itemLabel: { fontSize: '13px', fontWeight: 600, color: '#3b82f6' },
      itemValue: { fontSize: '13px', color: '#475569', lineHeight: '1.5' },
      links: {
        marginTop: '16px',
        paddingTop: '12px',
        borderTop: '1px solid #e2e8f0',
        display: 'flex',
        gap: '8px',
        flexWrap: 'wrap'
      },
      linksLabel: { fontSize: '11px', color: '#94a3b8' },
      link: {
        fontSize: '11px',
        color: '#3b82f6',
        textDecoration: 'none',
        padding: '2px 6px',
        background: 'rgba(59, 130, 246, 0.1)',
        borderRadius: '4px'
      },
      closeBtn: {
        position: 'absolute',
        top: '14px',
        right: '14px',
        width: '28px',
        height: '28px',
        background: 'rgba(0,0,0,0.05)',
        border: 'none',
        borderRadius: '50%',
        cursor: 'pointer',
        fontSize: '16px',
        color: '#64748b',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    };

    return { styles };
  }

  function buildMetricPopupMeta(metricPopup, date, deps) {
    if (!metricPopup || !date || !deps) return null;
    const { U, M, pIndex } = deps || {};
    if (!U || !U.lsGet) return null;

    const history = [];
    const currentD = new Date(date);
    if (Number.isNaN(currentD.getTime())) return null;

    for (let i = 6; i >= 0; i--) {
      const d = new Date(currentD);
      d.setDate(d.getDate() - i);
      const key = 'heys_dayv2_' + d.toISOString().slice(0, 10);
      const stored = U.lsGet(key, null);
      if (stored) {
        if (metricPopup.type === 'water') {
          history.push(stored.waterMl || 0);
        } else if (metricPopup.type === 'steps') {
          history.push(stored.steps || 0);
        } else {
          const dayTotKcal = (stored.meals || []).reduce((a, m) => {
            const t = M?.mealTotals ? M.mealTotals(m, pIndex) : { kcal: 0 };
            return a + (t.kcal || 0);
          }, 0);
          history.push(dayTotKcal);
        }
      } else {
        history.push(0);
      }
    }

    const data = metricPopup.data || {};
    const goal = data.goal || 1;
    const sparkMax = Math.max(...history, goal) * 1.1;

    let streak = 0;
    for (let i = history.length - 1; i >= 0; i--) {
      const val = history[i];
      if (metricPopup.type === 'steps') {
        if (val >= goal * 0.8) streak++; else break;
      } else if (metricPopup.type === 'water') {
        if (val >= goal * 0.8) streak++; else break;
      } else {
        const ratio = goal > 0 ? val / goal : 0;
        if (ratio >= 0.75 && ratio <= 1.15) streak++; else break;
      }
    }

    const yesterdayVal = history.length >= 2 ? history[history.length - 2] : null;
    const todayVal = history[history.length - 1] || 0;
    const diff = yesterdayVal !== null ? todayVal - yesterdayVal : null;

    const type = metricPopup.type || data.type || 'kcal';
    const config = {
      water: { icon: '💧', name: 'Вода', unit: 'мл', color: '#3b82f6', goal },
      steps: { icon: '👟', name: 'Шаги', unit: '', color: data.color || '#22c55e', goal },
      kcal: { icon: '🔥', name: 'Калории', unit: 'ккал', color: '#f59e0b', goal }
    }[type] || { icon: '•', name: 'Метрика', unit: '', color: '#64748b', goal };

    const ratio = typeof data.ratio === 'number'
      ? data.ratio
      : (type === 'kcal' && goal > 0 ? (data.eaten || 0) / goal : 0);
    const pct = Math.round(ratio * 100);

    const getGradient = (r) => {
      if (r < 0.5) return 'linear-gradient(90deg, #ef4444 0%, #ef4444 100%)';
      if (r < 0.75) return 'linear-gradient(90deg, #ef4444 0%, #eab308 100%)';
      if (r < 1.0) return 'linear-gradient(90deg, #eab308 0%, #22c55e 100%)';
      if (r < 1.15) return 'linear-gradient(90deg, #22c55e 0%, #10b981 100%)';
      return 'linear-gradient(90deg, #eab308 0%, #ef4444 100%)';
    };

    const formatWater = (val) => (val >= 1000 ? (val / 1000).toFixed(1) + 'л' : val + 'мл');
    const formatNumber = (val) => (typeof val === 'number' ? val.toLocaleString() : val);

    const valueText = type === 'water'
      ? formatWater(data.value || 0)
      : type === 'steps'
        ? formatNumber(data.value || 0)
        : Math.round(data.eaten || 0) + ' ккал';

    const goalText = type === 'water'
      ? formatWater(goal)
      : type === 'steps'
        ? formatNumber(goal)
        : Math.round(goal) + ' ккал';

    let compareText = null;
    let compareClass = '';
    if (diff !== null) {
      compareClass = diff > 0 ? ' up' : diff < 0 ? ' down' : '';
      compareText = (diff > 0 ? '↑' : diff < 0 ? '↓' : '=') + ' ' +
        (type === 'steps' ? Math.abs(diff).toLocaleString() : Math.abs(Math.round(diff))) +
        ' vs вчера';
    }

    const styles = {
      popup: { position: 'fixed', zIndex: 9999 },
      stripe: { background: config.color },
      pct: { color: config.color },
      progressFill: { width: Math.min(100, pct) + '%', background: getGradient(ratio) },
      value: { color: config.color, fontWeight: 700 }
    };

    const sparkStyles = {
      goalLine: { stroke: '#e2e8f0', strokeWidth: 1, strokeDasharray: '2,2' },
      connector: { stroke: config.color, strokeWidth: 1.5, strokeOpacity: 0.6 },
      point: { fill: '#94a3b8', r: 2 },
      pointToday: { fill: config.color, r: 3 }
    };

    return {
      type,
      config,
      ratio,
      pct,
      gradient: getGradient(ratio),
      valueText,
      goalText,
      compareText,
      compareClass,
      history,
      sparkMax,
      streak,
      diff,
      todayVal,
      yesterdayVal,
      styles,
      sparkStyles
    };
  }

  function buildMacroPopupMeta(macroBadgePopup, date, normAbs, deps) {
    if (!macroBadgePopup || !date || !deps) return null;
    const { U, pIndex } = deps || {};
    if (!U || !U.lsGet) return null;

    const macroKey = macroBadgePopup.macro === 'Белки'
      ? 'prot'
      : macroBadgePopup.macro === 'Жиры'
        ? 'fat'
        : 'carbs';

    const history = [];
    const currentD = new Date(date);
    if (Number.isNaN(currentD.getTime())) return null;

    const calcMacroSum = (dayData) => {
      if (!dayData || !dayData.meals) return 0;
      let macroSum = 0;
      dayData.meals.forEach((meal) => {
        (meal.items || []).forEach((item) => {
          const nameKey = (item.name || '').trim().toLowerCase();
          const prod = (nameKey && pIndex?.byName?.get(nameKey)) ||
            (item.product_id != null ? pIndex?.byId?.get(String(item.product_id).toLowerCase()) : null);
          const src = prod || item;
          const g = item.grams || 100;
          if (macroKey === 'prot') macroSum += (+src.protein100 || 0) * g / 100;
          else if (macroKey === 'fat') macroSum += ((+src.badFat100 || 0) + (+src.goodFat100 || 0) + (+src.trans100 || 0)) * g / 100;
          else macroSum += ((+src.simple100 || 0) + (+src.complex100 || 0)) * g / 100;
        });
      });
      return macroSum;
    };

    for (let i = 6; i >= 0; i--) {
      const d = new Date(currentD);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const dayData = U.lsGet('heys_dayv2_' + dateStr);
      history.push(calcMacroSum(dayData));
    }

    if (typeof macroBadgePopup.value === 'number') {
      history[history.length - 1] = macroBadgePopup.value;
    }

    const norm = macroBadgePopup.norm || normAbs?.[macroKey] || 100;
    const sparkMax = Math.max(...history, norm) || 100;

    let macroStreak = 0;
    for (let i = history.length - 1; i >= 0; i--) {
      const ratio = norm > 0 ? history[i] / norm : 0;
      if (ratio >= 0.8 && ratio <= 1.2) macroStreak++;
      else break;
    }

    const yesterdayVal = history.length >= 2 ? history[history.length - 2] : null;
    const diff = yesterdayVal !== null ? (macroBadgePopup.value - yesterdayVal) : null;

    let yesterdayCompare = null;
    if (diff !== null) {
      if (Math.abs(diff) < 5) yesterdayCompare = { icon: '↔️', text: 'как вчера', diff: 0 };
      else if (diff > 0) yesterdayCompare = { icon: '📈', text: '+' + Math.round(diff) + 'г', diff };
      else yesterdayCompare = { icon: '📉', text: Math.round(diff) + 'г', diff };
    }

    const getRec = () => {
      if (macroBadgePopup.ratio >= 0.9) return null;
      const deficit = norm - macroBadgePopup.value;
      const macro = macroBadgePopup.macro;
      if (macro === 'Белки' && deficit > 20) {
        return { icon: '🍗', text: 'Добавь курицу 100г', amount: '+25г' };
      } else if (macro === 'Белки' && deficit > 10) {
        return { icon: '🥚', text: 'Добавь яйцо', amount: '+12г' };
      } else if (macro === 'Жиры' && deficit > 10) {
        return { icon: '🥑', text: 'Добавь авокадо', amount: '+15г' };
      } else if (macro === 'Углеводы' && deficit > 20) {
        return { icon: '🍌', text: 'Добавь банан', amount: '+25г' };
      }
      return null;
    };

    const getTimeMsg = () => {
      const hour = new Date().getHours();
      const ratio = macroBadgePopup.ratio;
      if (ratio >= 0.9 && ratio <= 1.1) return { icon: '✅', text: 'В норме!' };
      if (ratio > 1.1) return { icon: '😅', text: 'Немного перебор' };
      if (hour < 12) return { icon: '🌅', text: 'Ещё целый день впереди!' };
      if (hour < 17) return { icon: '☀️', text: 'Время ещё есть' };
      if (hour < 20) return { icon: '🌆', text: 'Осталось немного времени' };
      return { icon: '🌙', text: 'День почти закончен' };
    };

    const macroRatio = macroBadgePopup.ratio || 0;
    const styles = {
      popup: { position: 'fixed', zIndex: 9999 },
      stripe: { background: macroBadgePopup.color },
      pct: { color: macroBadgePopup.color },
      progressFill: {
        width: Math.min(100, macroRatio * 100) + '%',
        background: getProgressGradient(macroRatio)
      },
      value: { color: macroBadgePopup.color, fontWeight: 700 }
    };

    const sparkStyles = {
      goalLine: { stroke: '#e2e8f0', strokeWidth: 1, strokeDasharray: '2,2' },
      connector: { stroke: macroBadgePopup.color, strokeWidth: 1.5, strokeOpacity: 0.6 },
      point: { fill: '#94a3b8', r: 2 },
      pointToday: { fill: macroBadgePopup.color, r: 3 }
    };

    return {
      sparkData: history,
      sparkMax,
      macroStreak,
      yesterdayCompare,
      rec: getRec(),
      timeMsg: getTimeMsg(),
      styles,
      sparkStyles
    };
  }

  function buildWeekDeficitPopupMeta(weekDeficitPopup) {
    if (!weekDeficitPopup || !weekDeficitPopup.data) return null;

    const {
      deficitKcal = 0,
      isDeficit = false
    } = weekDeficitPopup.data;

    const stripeColor = !isDeficit
      ? 'linear-gradient(90deg, #ef4444 0%, #dc2626 100%)'
      : deficitKcal > 5000
        ? 'linear-gradient(90deg, #22c55e 0%, #16a34a 100%)'
        : deficitKcal > 2000
          ? 'linear-gradient(90deg, #10b981 0%, #059669 100%)'
          : 'linear-gradient(90deg, #3b82f6 0%, #2563eb 100%)';

    const KCAL_PER_KG = 7700;
    const FAT_PERCENT = 0.77;
    const GLYCOGEN_PERCENT = 0.18;
    const MUSCLE_PERCENT = 0.05;

    const fatKcal = isDeficit ? Math.round(deficitKcal * FAT_PERCENT) : 0;
    const glycogenKcal = isDeficit ? Math.round(deficitKcal * GLYCOGEN_PERCENT) : 0;
    const muscleKcal = isDeficit ? Math.round(deficitKcal * MUSCLE_PERCENT) : 0;

    const fatGrams = Math.round(fatKcal / 7.7);
    const glycogenGrams = Math.round(glycogenKcal / 4);
    const muscleGrams = Math.round(muscleKcal / 4);

    const waterFromGlycogen = glycogenGrams * 3;
    const totalWeightLoss = fatGrams + glycogenGrams + waterFromGlycogen + muscleGrams;

    const formatWeight = (g) => (g >= 1000 ? (g / 1000).toFixed(2) + ' кг' : g + ' г');

    const surplusWeight = Math.round(Math.abs(deficitKcal) / 7.7);

    const styles = {
      popup: { position: 'fixed', zIndex: 9999 },
      stripe: { background: stripeColor },
      header: { flexDirection: 'column', alignItems: 'flex-start', gap: '4px' },
      headerDate: { fontSize: '14px', color: '#64748b' },
      headerValue: { color: isDeficit ? '#22c55e' : '#ef4444', fontSize: '24px', fontWeight: 700 },
      grid: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '12px',
        marginTop: '16px',
        padding: '12px',
        background: 'rgba(100, 116, 139, 0.05)',
        borderRadius: '12px'
      },
      gridCell: { textAlign: 'center' },
      gridLabel: { fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' },
      gridValueBurned: { fontSize: '18px', fontWeight: 700, color: '#16a34a' },
      gridValueEaten: { fontSize: '18px', fontWeight: 700, color: '#0ea5e9' },
      gridSubLabel: { fontSize: '11px', color: '#94a3b8' },
      divider: { height: '1px', background: 'rgba(100, 116, 139, 0.2)', margin: '16px 0' },
      formulaBlock: { marginBottom: '12px' },
      formulaHeader: {
        fontSize: '12px',
        fontWeight: 600,
        color: '#475569',
        marginBottom: '8px',
        display: 'flex',
        alignItems: 'center',
        gap: '6px'
      },
      formulaList: { display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px' },
      inlineRow: { display: 'flex', alignItems: 'center', gap: '8px' },
      rowFat: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '8px 10px',
        background: 'rgba(34, 197, 94, 0.1)',
        borderRadius: '8px',
        border: '1px solid rgba(34, 197, 94, 0.2)'
      },
      rowGlycogen: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '8px 10px',
        background: 'rgba(14, 165, 233, 0.1)',
        borderRadius: '8px',
        border: '1px solid rgba(14, 165, 233, 0.2)'
      },
      rowMuscle: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '8px 10px',
        background: 'rgba(234, 179, 8, 0.1)',
        borderRadius: '8px',
        border: '1px solid rgba(234, 179, 8, 0.2)'
      },
      rowLabel: { color: '#475569' },
      valueFat: { fontWeight: 600, color: '#16a34a' },
      valueGlycogen: { fontWeight: 600, color: '#0ea5e9' },
      valueMuscle: { fontWeight: 600, color: '#d97706' },
      totalBox: {
        padding: '12px 14px',
        background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.15) 0%, rgba(16, 185, 129, 0.1) 100%)',
        borderRadius: '12px',
        border: '1px solid rgba(34, 197, 94, 0.3)',
        marginTop: '8px'
      },
      totalRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
      totalLabel: { fontWeight: 600, color: '#16a34a' },
      totalValue: { fontSize: '18px', fontWeight: 700, color: '#16a34a' },
      surplusBox: {
        padding: '12px 14px',
        background: 'rgba(239, 68, 68, 0.1)',
        borderRadius: '12px',
        border: '1px solid rgba(239, 68, 68, 0.3)',
        marginTop: '8px'
      },
      surplusText: { fontSize: '13px', color: '#dc2626' },
      footnote: { fontSize: '10px', color: '#94a3b8', marginTop: '12px', lineHeight: '1.4' },
      footnoteItalic: { fontStyle: 'italic' }
    };

    return {
      stripeColor,
      styles,
      constants: {
        KCAL_PER_KG,
        FAT_PERCENT,
        GLYCOGEN_PERCENT,
        MUSCLE_PERCENT
      },
      fatKcal,
      glycogenKcal,
      muscleKcal,
      fatGrams,
      glycogenGrams,
      muscleGrams,
      waterFromGlycogen,
      totalWeightLoss,
      fatText: isDeficit ? formatWeight(fatGrams) : null,
      glycogenWaterText: isDeficit ? formatWeight(glycogenGrams + waterFromGlycogen) : null,
      muscleText: isDeficit ? formatWeight(muscleGrams) : null,
      surplusWeightText: formatWeight(surplusWeight)
    };
  }

  function buildBalanceDayPopupMeta(balanceDayPopup) {
    if (!balanceDayPopup || !balanceDayPopup.day) return null;
    const v = balanceDayPopup.day;

    const stripeColor = Math.abs(v.delta) <= 100
      ? '#22c55e'
      : v.delta < 0
        ? '#f59e0b'
        : '#ef4444';

    const dateLabel = v.date && typeof v.date === 'string'
      ? v.date.split('-').slice(1).reverse().join('.')
      : '';

    const ratioPct = Math.round((v.ratio || 0) * 100);

    const styles = {
      popup: {
        position: 'fixed',
        width: '240px',
        zIndex: 10001,
        background: 'var(--card, #fff)',
        borderRadius: '16px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        overflow: 'hidden',
        animation: 'fadeInScale 0.2s ease'
      },
      stripe: { height: '4px', background: stripeColor, borderRadius: '16px 16px 0 0' },
      content: { padding: '16px' },
      header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '12px',
        paddingRight: '24px'
      },
      headerTitle: { fontSize: '16px', fontWeight: 600, color: 'var(--text, #1e293b)' },
      trainingIcon: { fontSize: '14px' },
      grid: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '12px',
        marginBottom: '12px'
      },
      eatenBox: {
        textAlign: 'center',
        padding: '10px',
        background: 'rgba(14, 165, 233, 0.1)',
        borderRadius: '10px'
      },
      targetBox: {
        textAlign: 'center',
        padding: '10px',
        background: 'rgba(100, 116, 139, 0.1)',
        borderRadius: '10px'
      },
      boxLabel: { fontSize: '11px', color: '#64748b', textTransform: 'uppercase' },
      eatenValue: { fontSize: '18px', fontWeight: 700, color: '#0ea5e9' },
      targetValue: { fontSize: '18px', fontWeight: 700, color: '#475569' },
      balanceRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 12px',
        background: stripeColor + '15',
        borderRadius: '10px',
        border: '1px solid ' + stripeColor + '30'
      },
      balanceLabel: { color: '#475569', fontSize: '13px' },
      balanceValue: { fontSize: '18px', fontWeight: 700, color: stripeColor },
      ratioText: { marginTop: '8px', fontSize: '12px', color: '#94a3b8', textAlign: 'center' },
      baseRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '8px 10px',
        background: 'rgba(148, 163, 184, 0.08)',
        borderRadius: '8px',
        marginTop: '8px'
      },
      baseLabel: { fontSize: '12px', color: '#64748b' },
      baseValue: { fontSize: '13px', fontWeight: 600, color: '#334155' },
      refeedBadge: {
        fontSize: '10px',
        color: '#f97316',
        background: 'rgba(249, 115, 22, 0.12)',
        padding: '2px 6px',
        borderRadius: '10px',
        marginLeft: '6px'
      },
      closeBtn: {
        position: 'absolute',
        top: '8px',
        right: '8px',
        width: '24px',
        height: '24px',
        background: 'rgba(0,0,0,0.05)',
        border: 'none',
        borderRadius: '50%',
        cursor: 'pointer',
        fontSize: '14px',
        color: '#64748b',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    };

    return {
      stripeColor,
      dateLabel,
      ratioPct,
      styles
    };
  }

  function buildWeightPopupMeta(sparklinePopup) {
    if (!sparklinePopup || sparklinePopup.type !== 'weight') return null;
    const point = sparklinePopup.point || {};
    const trend = point.localTrend || 0;
    const color = trend < -0.05 ? '#22c55e' : trend > 0.05 ? '#ef4444' : '#6b7280';
    const trendIcon = trend < -0.05 ? '↓' : trend > 0.05 ? '↑' : '→';
    const trendText = (trend > 0 ? '+' : '') + trend.toFixed(1) + ' кг';

    const styles = {
      popup: { position: 'fixed', zIndex: 9999 },
      stripe: { background: color },
      pct: { color },
      value: { color: 'var(--text, #374151)', fontWeight: 700, fontSize: '18px' }
    };

    return { trend, color, trendIcon, trendText, styles };
  }

  function buildWeightForecastPopupMeta(sparklinePopup) {
    if (!sparklinePopup || sparklinePopup.type !== 'weight-forecast') return null;
    const point = sparklinePopup.point || {};
    const change = point.forecastChange || 0;
    const color = change < -0.05 ? '#22c55e' : change > 0.05 ? '#ef4444' : '#6b7280';
    const trendIcon = change < -0.05 ? '↓' : change > 0.05 ? '↑' : '→';
    const trendText = (change > 0 ? '+' : '') + change.toFixed(1) + ' кг';

    const styles = {
      popup: { position: 'fixed', zIndex: 9999 },
      stripe: { background: 'linear-gradient(90deg, #3b82f6, #60a5fa)' },
      pct: { color },
      value: { color: '#3b82f6', fontWeight: 700, fontSize: '18px' }
    };

    return { change, color, trendIcon, trendText, styles };
  }

  function buildTefInfoPopupMeta(deps) {
    const TEF = deps?.TEF;
    const fallback = {
      name: 'Thermic Effect of Food',
      nameRu: 'Термический эффект пищи',
      description: 'Энергия на переваривание',
      formula: 'TEF = Б×4×25% + У×4×7.5% + Ж×9×1.5%',
      sources: [{ author: 'Westerterp', year: 2004, pmid: '15507147' }],
      ranges: {
        protein: { label: '20-30%', used: 0.25 },
        carbs: { label: '5-10%', used: 0.075 },
        fat: { label: '0-3%', used: 0.015 }
      }
    };

    const info = TEF?.SCIENCE_INFO || {};
    const data = {
      name: info.name || fallback.name,
      nameRu: info.nameRu || fallback.nameRu,
      description: info.description || fallback.description,
      formula: info.formula || fallback.formula,
      sources: Array.isArray(info.sources) && info.sources.length > 0 ? info.sources : fallback.sources,
      ranges: info.ranges || fallback.ranges
    };

    const styles = {
      popup: {
        position: 'fixed',
        zIndex: 10001,
        background: 'var(--card, #fff)',
        borderRadius: '20px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
        overflow: 'hidden',
        animation: 'fadeInScale 0.2s ease'
      },
      stripe: { height: '4px', background: 'linear-gradient(90deg, #f97316 0%, #fb923c 100%)' },
      content: { padding: '20px' },
      header: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' },
      headerIcon: { fontSize: '28px' },
      title: { fontSize: '18px', fontWeight: 700, color: 'var(--text, #1e293b)' },
      subtitle: { fontSize: '13px', color: '#64748b' },
      description: { fontSize: '14px', color: '#475569', marginBottom: '16px', lineHeight: '1.5' },
      formulaBox: { background: 'rgba(249, 115, 22, 0.08)', borderRadius: '12px', padding: '14px', marginBottom: '16px' },
      formulaLabel: { fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#f97316', fontWeight: 600, marginBottom: '8px' },
      formulaCode: { fontSize: '13px', fontFamily: 'monospace', color: 'var(--text, #1e293b)', background: 'rgba(0,0,0,0.04)', padding: '10px 12px', borderRadius: '8px', lineHeight: '1.6' },
      formulaIndent: { paddingLeft: '38px' },
      rangeGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '16px' },
      rangeBoxProtein: { textAlign: 'center', padding: '10px', background: 'rgba(239, 68, 68, 0.08)', borderRadius: '10px' },
      rangeBoxCarbs: { textAlign: 'center', padding: '10px', background: 'rgba(34, 197, 94, 0.08)', borderRadius: '10px' },
      rangeBoxFat: { textAlign: 'center', padding: '10px', background: 'rgba(234, 179, 8, 0.08)', borderRadius: '10px' },
      rangeLabel: { fontSize: '11px', color: '#64748b' },
      rangeValueProtein: { fontSize: '16px', fontWeight: 700, color: '#ef4444' },
      rangeValueCarbs: { fontSize: '16px', fontWeight: 700, color: '#22c55e' },
      rangeValueFat: { fontSize: '16px', fontWeight: 700, color: '#eab308' },
      rangeHint: { fontSize: '10px', color: '#94a3b8' },
      sourcesBlock: { borderTop: '1px solid rgba(100, 116, 139, 0.15)', paddingTop: '14px' },
      sourcesLabel: { fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#64748b', fontWeight: 600, marginBottom: '8px' },
      sourceRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: '#475569', padding: '6px 0' },
      sourceLink: { fontSize: '11px', color: '#3b82f6', textDecoration: 'none' },
      closeBtn: {
        position: 'absolute',
        top: '12px',
        right: '12px',
        width: '28px',
        height: '28px',
        background: 'rgba(0,0,0,0.05)',
        border: 'none',
        borderRadius: '50%',
        cursor: 'pointer',
        fontSize: '16px',
        color: '#64748b',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    };

    return { ...data, styles };
  }

  function buildExcessStyleMeta(caloricDebt) {
    if (!caloricDebt || !caloricDebt.hasExcess || caloricDebt.hasDebt) return null;

    const severity = caloricDebt.severity || 0;
    let style;

    if (severity === 2) {
      style = { icon: '📊', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.06)', border: 'rgba(245, 158, 11, 0.15)', label: 'Значительный профицит' };
    } else if (severity === 1) {
      style = { icon: '📈', color: '#eab308', bg: 'rgba(234, 179, 8, 0.06)', border: 'rgba(234, 179, 8, 0.15)', label: 'Умеренный профицит' };
    } else {
      style = { icon: '➕', color: '#a3a3a3', bg: 'rgba(163, 163, 163, 0.05)', border: 'rgba(163, 163, 163, 0.12)', label: 'Небольшой плюс' };
    }

    const cardStyle = {
      background: style.bg,
      borderColor: style.border,
      '--balance-color': style.color
    };

    const badgeStyle = { backgroundColor: style.color };

    return { severity, style, cardStyle, badgeStyle };
  }

  function buildExcessCardMeta(caloricDebt) {
    if (!caloricDebt || !caloricDebt.hasExcess || caloricDebt.hasDebt) return null;

    const styles = {
      headerRecShort: { color: '#94a3b8' },
      balanceVizBar: { fontSize: '16px', lineHeight: 1, cursor: 'pointer' },
      infoIcon: {
        fontSize: '11px',
        color: '#94a3b8',
        marginLeft: '6px',
        cursor: 'help'
      },
      softCorrection: {
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '10px 12px',
        background: 'rgba(148, 163, 184, 0.08)',
        borderRadius: '8px',
        marginBottom: '10px'
      },
      softCorrectionIcon: { fontSize: '20px' },
      softCorrectionTextWrap: { flex: 1 },
      softCorrectionTitle: { fontWeight: 500, color: '#475569', fontSize: '13px' },
      softCorrectionSub: { fontSize: '11px', color: '#94a3b8', marginTop: '2px' },
      scienceBtn: {
        fontSize: '11px',
        color: '#94a3b8',
        cursor: 'pointer',
        padding: '2px 6px',
        borderRadius: '4px',
        background: 'rgba(148, 163, 184, 0.1)'
      },
      scienceSummary: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 12px',
        background: 'rgba(59, 130, 246, 0.08)',
        borderRadius: '8px',
        marginBottom: '8px',
        fontSize: '13px'
      },
      scienceSummaryTitle: { fontWeight: 500, color: '#1e40af' },
      scienceSummarySub: { fontSize: '11px', color: '#64748b' },
      scienceSummaryLink: { fontSize: '10px', color: '#3b82f6', textDecoration: 'none' },
      cardioRec: {
        background: 'rgba(34, 197, 94, 0.08)',
        borderRadius: '8px',
        padding: '10px 12px',
        marginTop: '8px'
      },
      cardioRecIcon: { fontSize: '20px' },
      cardioRecTitle: { fontWeight: 600, color: '#166534' },
      success: {
        background: 'rgba(34, 197, 94, 0.12)',
        borderRadius: '8px',
        padding: '12px',
        marginTop: '8px',
        textAlign: 'center'
      },
      successText: { fontSize: '15px' },
      legend: {
        display: 'flex',
        alignItems: 'flex-start',
        gap: '8px',
        padding: '8px 10px',
        marginTop: '8px',
        background: 'rgba(148, 163, 184, 0.08)',
        borderRadius: '8px'
      },
      legendIcon: { fontSize: '14px', lineHeight: 1.2 },
      legendText: { fontSize: '11px', color: '#64748b', lineHeight: '1.4' },
      explanation: { marginTop: '10px', fontSize: '12px', color: '#64748b' }
    };

    const getBalanceVizBarStyle = (color) => ({
      ...(styles.balanceVizBar || {}),
      color
    });

    return { styles, getBalanceVizBarStyle };
  }

  function buildExcessSciencePopupMeta() {
    return {
      title: '🔬 Почему мягкая коррекция?',
      content: [
        {
          label: '❌ Проблема жёстких ограничений',
          value: 'Строгие диеты (>15% дефицит) провоцируют срывы и переедание. Организм воспринимает это как угрозу.'
        },
        {
          label: '✅ Решение HEYS',
          value: 'Мягкая коррекция 5-10% + акцент на активности. Это не наказание, а баланс.'
        },
        {
          label: '🏃 Почему активность?',
          value: '70% компенсации через движение. Это здоровее и приятнее, чем голодать.'
        }
      ],
      links: [
        { text: 'Herman & Polivy 1984', url: 'https://pubmed.ncbi.nlm.nih.gov/6727817/' },
        { text: 'Tomiyama 2018', url: 'https://pubmed.ncbi.nlm.nih.gov/29866473/' }
      ]
    };
  }

  function buildBalanceInsightsMeta(balanceViz) {
    const insights = balanceViz?.balanceInsights;
    if (!Array.isArray(insights) || insights.length === 0) return [];

    return insights.map((insight) => {
      const borderWidth = (insight.type === 'trend' || insight.type === 'pattern' || insight.type === 'goal')
        ? 4
        : (insight.type === 'epoc' || insight.type === 'forbes' || insight.type === 'timing')
          ? 3
          : 2;
      const itemStyle = {
        color: insight.color,
        borderLeftWidth: borderWidth + 'px'
      };
      const pmidStyle = {
        fontSize: '9px',
        color: '#94a3b8',
        textDecoration: 'none',
        marginLeft: '4px'
      };
      return { ...insight, borderWidth, itemStyle, pmidStyle };
    });
  }

  function buildPopupPositionStyle(baseStyle, left, top, width) {
    const style = {
      boxSizing: 'border-box',
      ...(baseStyle || {})
    };
    const margin = 12;
    const screenW = typeof window !== 'undefined' ? window.innerWidth : null;
    const screenH = typeof window !== 'undefined' ? window.innerHeight : null;
    const safeWidth = screenW && width != null
      ? Math.min(width, Math.max(180, screenW - margin * 2))
      : width;

    if (screenW) {
      style.maxWidth = `calc(100vw - ${margin * 2}px)`;
    }
    if (screenH) {
      style.maxHeight = style.maxHeight || `calc(100dvh - ${margin * 2}px)`;
      style.overflowY = style.overflowY || 'auto';
      style.overscrollBehavior = style.overscrollBehavior || 'contain';
    }
    if (safeWidth != null) style.width = safeWidth + 'px';
    if (left != null) {
      if (screenW && safeWidth != null) {
        const maxLeft = Math.max(margin, screenW - safeWidth - margin);
        style.left = Math.min(Math.max(left, margin), maxLeft) + 'px';
      } else {
        style.left = left + 'px';
      }
    }
    if (top != null) {
      if (screenH) {
        style.top = Math.max(margin, Math.min(top, screenH - margin - 80)) + 'px';
      } else {
        style.top = top + 'px';
      }
    }
    return style;
  }

  // Export
  HEYS.dayStatsVm = {
    build: buildStatsVm
  };

})(window);
