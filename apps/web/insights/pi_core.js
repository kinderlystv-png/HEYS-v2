/**
 * pi_core.js — Layer D: Core API proxy for Predictive Insights
 * -----------------------------------------------------------
 * Проксирует публичные функции/константы HEYS.PredictiveInsights в
 * стабильное пространство имён HEYS.InsightsPI.core (и window.piCore).
 * 
 * Это обеспечивает обратную совместимость и постепенный переход на
 * многослойную архитектуру без переписывания основного монолита.
 */

(function initPiCore(global) {
  'use strict';

  const HEYS = (global.HEYS = global.HEYS || {});
  HEYS.InsightsPI = HEYS.InsightsPI || {};

  // Lazily pull from основной модуль (или из components как fallback)
  const getPI = () => HEYS.PredictiveInsights || {};
  const getComp = () => (getPI().components) || {};

  const core = {};

  const exportKeys = [
    'VERSION',
    'CONFIG',
    'PATTERNS',
    'PRIORITY_LEVELS',
    'CATEGORIES',
    'ACTIONABILITY',
    'SCIENCE_INFO',
    'getMetricPriority',
    'getAllMetricsByPriority',
    'getMetricsByCategory',
    'getMetricsByActionability',
    'getCriticalMetrics',
    'getPriorityStats',
    'analyze',
    'clearCache',
    'getDaysData',
    'pearsonCorrelation',
    'calculateTrend',
    'average',
    'stdDev',
    'analyzeMealTiming',
    'analyzeWaveOverlap',
    'analyzeLateEating',
    'analyzeMealQualityTrend',
    'analyzeSleepWeight',
    'analyzeSleepHunger',
    'analyzeTrainingKcal',
    'analyzeStepsWeight',
    'analyzeProteinSatiety',
    'analyzeFiberRegularity',
    'analyzeStressEating',
    'analyzeMoodFood',
    'calculateHealthScore',
    'generateWhatIfScenarios',
    'predictWeight',
    'generateWeeklyWrap',
    'InfoButton',
    'getTopCorrelations',
    'getUserPatterns',
    'getRiskFactors',
    'analyzeMetabolism',
    'calculateConfidenceScore',
    'calculateCorrelationMatrix',
    'detectMetabolicPatterns',
    'calculatePredictiveRisk',
    'forecastEnergy',
    'calculateBayesianConfidence',
    'calculateTimeLaggedCorrelations',
    'calculateGlycemicVariability',
    'calculateAllostaticLoad',
    'detectEarlyWarningSignals',
    'calculate2ProcessModel'
  ];

  exportKeys.forEach((key) => {
    Object.defineProperty(core, key, {
      enumerable: true,
      get() {
        const pi = getPI();
        if (Object.prototype.hasOwnProperty.call(pi, key)) return pi[key];
        const comps = getComp();
        if (Object.prototype.hasOwnProperty.call(comps, key)) return comps[key];
        return undefined;
      }
    });
  });

  HEYS.InsightsPI.core = core;
  global.piCore = core; // fallback для прямого доступа из консоли

})(typeof window !== 'undefined' ? window : global);