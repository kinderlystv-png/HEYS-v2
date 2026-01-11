// pi_science_info.js — Science Information Database v3.0.0
// Extracted from heys_predictive_insights_v1.js (Phase 2)
// Научная база данных: 50+ метрик с PMID, категориями и приоритетами
(function(global) {
  'use strict';
  
  const HEYS = global.HEYS = global.HEYS || {};
  HEYS.InsightsPI = HEYS.InsightsPI || {};
  
  // Зависимости от pi_constants.js (fallback если не загружен)
  const piConst = HEYS.InsightsPI?.constants || {};
  const PRIORITY_LEVELS = piConst.PRIORITY_LEVELS || {};
  const CATEGORIES = piConst.CATEGORIES || {};
  const ACTIONABILITY = piConst.ACTIONABILITY || {};
  
