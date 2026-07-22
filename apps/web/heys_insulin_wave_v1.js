// heys_insulin_wave_v1.js — postprandial response orchestration + legacy adapter
(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  HEYS.InsulinWave = HEYS.InsulinWave || {};

  const React = global.React;
  const I = HEYS.InsulinWave.__internals || {};
  const Calc = HEYS.InsulinWave.Calc;
  const Model = HEYS.InsulinWave.ResponseModel;
  const UI = HEYS.InsulinWave.UI;
  const Graph = HEYS.InsulinWave.Graph;
  const NDTE = HEYS.InsulinWave.NDTE;

  const assertDependencies = () => {
    if (!Model?.estimate || !Model?.readTimeMinutes || !Model?.formatTime) {
      throw new Error('HEYS.InsulinWave: canonical ResponseModel is required');
    }
  };

  const formatDuration = (minutes) => {
    const safe = Math.max(0, Math.round(Number(minutes) || 0));
    if (safe < 60) return `${safe} мин`;
    const hours = Math.floor(safe / 60);
    const rest = safe % 60;
    return rest ? `${hours} ч ${rest} мин` : `${hours} ч`;
  };

  const roundForDisplay = (minutes) => Math.round(Number(minutes) / 10) * 10;

  const giCategory = (gi) => {
    if (!Number.isFinite(gi)) return { id: 'unknown', text: 'GI не указан', color: '#94a3b8', desc: 'точность диапазона снижена' };
    if (gi <= 35) return { id: 'low', text: 'Низкий GI', color: '#22c55e', desc: 'меньше гликемическая нагрузка' };
    if (gi <= 55) return { id: 'medium', text: 'Средний GI', color: '#eab308', desc: 'умеренная гликемическая нагрузка' };
    if (gi <= 70) return { id: 'high', text: 'Высокий GI', color: '#f97316', desc: 'быстрее доступные углеводы' };
    return { id: 'very-high', text: 'Очень высокий GI', color: '#ef4444', desc: 'быстро доступные углеводы' };
  };

  const getNowMinutes = (now, latestStart) => {
    const date = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
    let minutes = date.getHours() * 60 + date.getMinutes();
    if (latestStart >= 1440 && minutes < 1440) minutes += 1440;
    return minutes;
  };

  const getMealName = (meal) => meal?.name || meal?.mealName || meal?.mealType || 'Приём пищи';

  function buildHistory({ meals, pIndex, getProductFromItem, trainings }) {
    return meals
      .map((meal, sourceIndex) => ({ meal, sourceIndex, startMin: Model.readTimeMinutes(meal?.time) }))
      .filter((entry) => entry.startMin !== null)
      .sort((a, b) => a.startMin - b.startMin || a.sourceIndex - b.sourceIndex)
      .map(({ meal, startMin }, index) => {
        const estimate = Model.estimate({ meal, pIndex, getProductFromItem, trainings });
        const duration = estimate.estimatedWindow.centralMinutes;
        const endMin = startMin + duration;
        return {
          ...estimate,
          id: meal.id || `meal-${index}`,
          meal,
          mealName: getMealName(meal),
          time: meal.time,
          timeDisplay: Model.formatTime(startMin),
          startMin,
          endMin,
          endTime: Model.formatTime(endMin),
          endTimeDisplay: Model.formatTime(endMin),
          earliestEndMin: startMin + estimate.estimatedWindow.lowerMinutes,
          latestEndMin: startMin + estimate.estimatedWindow.upperMinutes,
          duration,
          waveHours: duration / 60,
          insulinWaveHours: duration / 60,
          gi: estimate.nutrients.avgGI,
          gl: estimate.responseLoad.estimatedGlycemicLoad.central,
          protein: estimate.nutrients.totalProtein,
          fiber: estimate.nutrients.totalFiber,
          carbs: estimate.nutrients.totalCarbs,
          fat: estimate.nutrients.totalFat,
          hasLiquid: estimate.nutrients.liquidRatio >= 0.5,
          isActive: false,
        };
      });
  }

  function buildOverlaps(history) {
    const overlaps = [];
    for (let index = 0; index < history.length - 1; index += 1) {
      const current = history[index];
      const next = history[index + 1];
      if (current.endMin <= next.startMin) continue;
      const overlapMinutes = current.endMin - next.startMin;
      overlaps.push({
        from: current.time,
        fromDisplay: current.timeDisplay,
        to: next.time,
        toDisplay: next.timeDisplay,
        overlapMinutes,
        severity: overlapMinutes > 60 ? 'high' : overlapMinutes > 30 ? 'medium' : 'low',
        composition: {
          kind: 'superposition',
          responseIds: [current.id, next.id],
          combinedLoadScore: Math.min(100, current.responseLoad.score + next.responseLoad.score),
          durationAdjusted: false,
        },
      });
    }
    return overlaps;
  }

  function calculate({
    meals,
    pIndex,
    getProductFromItem,
    trainings = [],
    now = new Date(),
    nowMinutes: explicitNowMinutes,
  } = {}) {
    assertDependencies();
    if (!Array.isArray(meals) || meals.length === 0) return null;
    if (typeof getProductFromItem !== 'function') {
      throw new TypeError('HEYS.InsulinWave.calculate: getProductFromItem must be a function');
    }

    const waveHistory = buildHistory({ meals, pIndex, getProductFromItem, trainings });
    if (waveHistory.length === 0) return null;

    const latest = waveHistory[waveHistory.length - 1];
    const nowMinutes = Number.isFinite(Number(explicitNowMinutes))
      ? Number(explicitNowMinutes)
      : getNowMinutes(now, latest.startMin);
    const elapsedMinutes = Math.max(0, nowMinutes - latest.startMin);
    const remaining = Math.max(0, latest.endMin - nowMinutes);
    const rangeRemaining = Math.max(0, latest.latestEndMin - nowMinutes);
    const minutesAfterWindow = Math.max(0, nowMinutes - latest.latestEndMin);
    const centralProgress = Math.max(0, Math.min(100, elapsedMinutes / latest.duration * 100));
    const rangeDuration = Math.max(1, latest.latestEndMin - latest.startMin);
    const rangeProgress = Math.max(0, Math.min(100, elapsedMinutes / rangeDuration * 100));
    const progress = centralProgress;
    const status = nowMinutes < latest.startMin ? 'scheduled' : remaining > 0 ? 'settling' : 'complete';
    const rangeStatus = nowMinutes < latest.startMin ? 'scheduled' : rangeRemaining > 0 ? 'settling' : 'complete';
    latest.isActive = rangeStatus === 'settling';
    const overlaps = buildOverlaps(waveHistory);
    const gaps = waveHistory.slice(1).map((entry, index) => entry.startMin - waveHistory[index].startMin);
    const avgGapToday = gaps.length ? Math.round(gaps.reduce((sum, value) => sum + value, 0) / gaps.length) : 0;
    const category = giCategory(latest.nutrients.avgGI);
    const windowRange = `${Model.formatTime(roundForDisplay(latest.earliestEndMin))}–${Model.formatTime(roundForDisplay(latest.latestEndMin))}`;
    const complete = status === 'complete';

    return {
      modelVersion: latest.modelVersion,
      configSource: latest.configSource,
      estimateKind: latest.estimateKind,
      responseLoad: latest.responseLoad,
      responseShape: latest.responseShape,
      estimatedWindow: {
        ...latest.estimatedWindow,
        startMin: latest.startMin,
        centralEndMin: latest.endMin,
        earliestEndMin: latest.earliestEndMin,
        latestEndMin: latest.latestEndMin,
        centralEndTime: latest.endTime,
        rangeLabel: windowRange,
      },
      confidence: latest.confidence,
      trace: latest.trace,
      currentResponse: latest,
      status,
      statusLabel: complete ? 'Ориентир завершён' : status === 'scheduled' ? 'Приём ещё впереди' : 'Идёт расчётное окно после еды',
      emoji: complete ? '✓' : '◷',
      color: complete ? '#16a34a' : '#2F6BFF',
      text: complete ? 'Окно завершено' : formatDuration(remaining),
      subtext: complete
        ? 'Ориентируйся на голод, самочувствие и план питания.'
        : `Ориентировочное завершение: ${windowRange}. Это оценка, а не измерение.` ,
      progress,
      centralProgress,
      rangeProgress,
      remaining,
      rangeRemaining,
      rangeStatus,
      minutesAfterWindow,
      lastMealTime: latest.time,
      lastMealTimeDisplay: latest.timeDisplay,
      endTime: latest.endTime,
      endTimeDisplay: latest.endTimeDisplay,
      endTimeRange: windowRange,
      duration: latest.duration,
      waveHours: latest.duration / 60,
      insulinWaveHours: latest.duration / 60,
      baseWaveHours: null,
      lipolysisMinutes: 0,
      curve: latest.responseProfile,
      responseProfile: latest.responseProfile,
      waveShape: latest.responseShape.type,
      waveShapeDesc: latest.responseShape.label,
      currentPhase: status,
      avgGI: latest.nutrients.avgGI,
      gi: latest.nutrients.avgGI,
      giCategory: category,
      glycemicLoad: latest.responseLoad.estimatedGlycemicLoad.central,
      gl: latest.responseLoad.estimatedGlycemicLoad.central,
      totalProtein: latest.nutrients.totalProtein,
      protein: latest.nutrients.totalProtein,
      totalFiber: latest.nutrients.totalFiber,
      fiber: latest.nutrients.totalFiber,
      totalCarbs: latest.nutrients.totalCarbs,
      carbs: latest.nutrients.totalCarbs,
      totalSimple: latest.nutrients.totalSimple,
      totalFat: latest.nutrients.totalFat,
      fat: latest.nutrients.totalFat,
      hasLiquid: latest.nutrients.liquidRatio >= 0.5,
      liquidRatio: Math.round(latest.nutrients.liquidRatio * 100),
      insulinDemandProxy: latest.responseLoad.insulinDemandProxy,
      waveHistory,
      overlaps,
      hasOverlaps: overlaps.length > 0,
      worstOverlap: overlaps.reduce((worst, item) => !worst || item.overlapMinutes > worst.overlapMinutes ? item : worst, null),
      avgGapToday,
      personalAvgGap: 0,
      recommendedGap: latest.duration,
      gapQuality: overlaps.length ? 'close' : gaps.length ? 'clear' : 'unknown',
      nextMealTime: {
        time: latest.endTime,
        range: windowRange,
        isNextDay: latest.endMin >= 1440,
        label: complete ? 'по голоду и плану' : `ориентир ${windowRange}`,
      },
      foodAdvice: {
        good: ['Ориентируйся на голод и план питания'],
        avoid: [],
        reason: 'Расчётное окно не является запретом на еду.',
      },
      dataQuality: latest.confidence.dataQuality,
      legacy: {
        insulinWaveHours: latest.duration / 60,
        lipolysisMinutes: 0,
        aliasesOnly: true,
      },
    };
  }

  function useInsulinWave(params) {
    if (!React?.useMemo || !React?.useState || !React?.useEffect) {
      throw new Error('HEYS.InsulinWave.useInsulinWave requires React');
    }
    const [expanded, setExpanded] = React.useState(false);
    const [currentMinute, setCurrentMinute] = React.useState(() => Math.floor(Date.now() / 60000));
    React.useEffect(() => {
      const timer = setInterval(() => setCurrentMinute(Math.floor(Date.now() / 60000)), 60000);
      return () => clearInterval(timer);
    }, []);
    const data = React.useMemo(() => calculate(params), [params?.meals, params?.pIndex, params?.getProductFromItem, params?.trainings, params?.dayData, currentMinute]);
    return {
      data,
      expanded,
      setExpanded,
      toggle: () => setExpanded((value) => !value),
      isShaking: false,
      renderProgressBar: () => data && HEYS.InsulinWave.renderProgressBar?.(data),
      renderWaveHistory: () => data && HEYS.InsulinWave.renderWaveHistory?.(data),
      renderExpandedSection: () => data && HEYS.InsulinWave.renderExpandedSection?.(data),
    };
  }

  Object.assign(HEYS.InsulinWave, {
    calculate,
    useInsulinWave,
    VERSION: Model?.VERSION || '5.0.1',
    MODEL_VERSION: Model?.VERSION || '5.0.1',
    estimatePostprandialResponse: Model?.estimate,
    calculateMealNutrients: Calc?.calculateMealNutrients,
    utils: HEYS.InsulinWave.utils,
    GI_CATEGORIES: I.GI_CATEGORIES,
    STATUS_CONFIG: I.STATUS_CONFIG,
    PROTEIN_BONUS: I.PROTEIN_BONUS,
    CIRCADIAN_CONFIG: I.CIRCADIAN_CONFIG,
    calculateActivityContext: I.calculateActivityContext,
    calculateHypoglycemiaRisk: I.calculateHypoglycemiaRisk,
    getHypoglycemiaWarning: I.getHypoglycemiaWarning,
  });

  if (UI) Object.assign(HEYS.InsulinWave, {
    renderProgressBar: UI.renderProgressBar,
    renderWaveHistory: UI.renderWaveHistory,
    renderCalculationTrace: UI.renderCalculationTrace,
    renderExpandedSection: UI.renderExpandedSection,
    MealWaveExpandSection: UI.MealWaveExpandSection,
    renderActivityContextBadge: UI.renderActivityContextBadge,
  });
  if (Graph?.renderWaveChart) HEYS.InsulinWave.renderWaveChart = Graph.renderWaveChart;
  if (NDTE?.renderNDTEBadge) HEYS.InsulinWave.renderNDTEBadge = NDTE.renderNDTEBadge;

  if (typeof document !== 'undefined' && typeof CustomEvent === 'function') {
    document.dispatchEvent(new CustomEvent('heys-insulinwave-ready'));
  }
})(typeof window !== 'undefined' ? window : globalThis);
