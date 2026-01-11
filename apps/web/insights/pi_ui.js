/**
 * pi_ui.js — Layer E: UI Components proxy for Predictive Insights
 * --------------------------------------------------------------
 * Публикует React-компоненты/утилиты из монолита heys_predictive_insights_v1.js
 * в единое пространство HEYS.InsightsPI.ui (и window.piUI) для пошагового
 * рефакторинга на модульную архитектуру.
 */

(function initPiUI(global) {
  'use strict';

  const HEYS = (global.HEYS = global.HEYS || {});
  HEYS.InsightsPI = HEYS.InsightsPI || {};

  const getComp = () => (HEYS.PredictiveInsights?.components) || {};

  const ui = {};

  const componentKeys = [
    'HealthRing',
    'TotalHealthRing',
    'HealthRingsGrid',
    'PatternCard',
    'PatternsList',
    'ScenarioCard',
    'WhatIfSection',
    'WeightPrediction',
    'WeeklyWrap',
    'WeeklyWrapCard',
    'EmptyState',
    'InsightsCard',
    'InsightsTab',
    'CollapsibleSection',
    'MetabolismCard',
    'MetabolismSection',
    'InfoButton',
    'MetricWithInfo',
    'MetabolicStatusCard',
    'ReasonCard',
    'ActionCard',
    'PredictiveDashboard',
    'MetabolicStateRing',
    'RiskTrafficLight',
    'DataCompletenessCard',
    'MealTimingCard',
    'WhatIfSimulator',
    'WhatIfCard',
    'simulateFood',
    'WHATIF_PRESETS',
    'WHATIF_CATEGORIES'
  ];

  componentKeys.forEach((key) => {
    Object.defineProperty(ui, key, {
      enumerable: true,
      get() {
        const comps = getComp();
        return Object.prototype.hasOwnProperty.call(comps, key) ? comps[key] : undefined;
      }
    });
  });

  HEYS.InsightsPI.ui = ui;
  global.piUI = ui; // fallback для консоли/legacy вызовов

})(typeof window !== 'undefined' ? window : global);