// heys_predictive_insights_v1.js — Predictive Insights Module v4.0.0
// Анализ данных за 7-30 дней, корреляции, паттерны, прогнозы
// v2.2.0: What-If Simulator — интерактивный симулятор еды
// v2.2.1: Refactored - constants extracted to insights/pi_constants.js
// v3.0.0: Major refactoring - extracted Layer B modules (stats, science, patterns, advanced, analytics_api)
//         Main file reduced from 10,206 to 3,557 lines (-65%)
// v3.1.0: Final refactoring (Phases 10-12) - extracted calculations, removed UI duplicates
//         Main file reduced to 1,005 lines (-90% from original, pure orchestration)
// v4.0.0: Insights Deep Analytics — 6 new patterns (sleep quality, wellbeing, hydration, body composition,
//         cycle impact, weekend effect), EMA smoothing, TEF-adjusted protein=3kcal/g, scientific thresholds,
//         25 patterns total (was 19)
//         Total 11 Layer B modules created
// Зависимости: HEYS.InsulinWave, HEYS.Cycle, HEYS.ratioZones, HEYS.models, U.lsGet
//              HEYS.InsightsPI.* (pi_constants, pi_math, pi_stats, pi_science_info, pi_patterns, 
//                                 pi_advanced, pi_analytics_api, pi_calculations, pi_ui_*)
(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const U = HEYS.utils || {};

  // === КОНСТАНТЫ (из pi_constants.js) ===
  // Используем извлечённые константы, fallback на локальные если модуль не загружен
  const piConst = HEYS.InsightsPI?.constants || window.piConst || {};

  // === СТАТИСТИЧЕСКИЕ ФУНКЦИИ (из pi_stats.js) ===
  // Используем извлечённые функции, fallback если модуль не загружен
  const piStats = HEYS.InsightsPI?.stats || window.piStats || {};

  // === НАУЧНАЯ БД (из pi_science_info.js) ===
  // Используем извлечённую базу данных, fallback если модуль не загружен
  const SCIENCE_INFO = HEYS.InsightsPI?.science || window.piScience || {};

  // === АНАЛИЗ ПАТТЕРНОВ (из pi_patterns.js) ===
  // Используем извлечённые функции анализа, fallback если модуль не загружен
  const piPatterns = HEYS.InsightsPI?.patterns || window.piPatterns || {};

  // === ПРОДВИНУТАЯ АНАЛИТИКА (из pi_advanced.js) ===
  // Используем извлечённые функции, fallback если модуль не загружен
  const piAdvanced = HEYS.InsightsPI?.advanced || window.piAdvanced || {};

  // === АНАЛИТИКА API (из pi_analytics_api.js) ===
  // Используем извлечённые методы глубокого анализа, fallback если модуль не загружен
  const piAnalyticsAPI = HEYS.InsightsPI?.analyticsAPI || window.piAnalyticsAPI || {};

  // === ВЫЧИСЛИТЕЛЬНЫЕ УТИЛИТЫ (из pi_calculations.js) ===
  // Используем извлечённые функции расчётов, fallback если модуль не загружен
  const piCalculations = HEYS.InsightsPI?.calculations || window.piCalculations || {};

  // === UI КОМПОНЕНТЫ (из pi_ui_*.js) ===
  // Используем извлечённые React компоненты, fallback если модули не загружены
  const piUIRings = HEYS.InsightsPI?.uiRings || window.piUIRings || {};
  const piUICards = HEYS.InsightsPI?.uiCards || window.piUICards || {};
  const piUIWhatIf = HEYS.InsightsPI?.uiWhatIf || window.piUIWhatIf || {};
  const piUIDashboard = HEYS.InsightsPI?.uiDashboard || window.piUIDashboard || {};

  // === LAZY GETTER для InfoButton с полной fallback цепочкой (fix load order) ===
  function getInfoButton() {
    return HEYS.InsightsPI?.uiDashboard?.InfoButton ||
      HEYS.PredictiveInsights?.components?.InfoButton ||
      HEYS.day?.InfoButton ||
      HEYS.InfoButton ||
      window.InfoButton ||
      function FallbackInfoButton() { return null; };
  }

  const CONFIG = piConst.CONFIG || {
    DEFAULT_DAYS: 14,
    MIN_DAYS_FOR_INSIGHTS: 3,
    MIN_DAYS_FOR_FULL_ANALYSIS: 7,
    MIN_CORRELATION_DISPLAY: 0.35,
    CACHE_TTL_MS: 5 * 60 * 1000,
    VERSION: '3.1.0'
  };

  // === СИСТЕМА ПРИОРИТЕТОВ И КРИТЕРИЕВ ===
  // Используем извлечённые константы из pi_constants.js

  const PRIORITY_LEVELS = piConst.PRIORITY_LEVELS || {
    CRITICAL: { level: 1, name: 'Критический', emoji: '🔴', color: '#ef4444', description: 'Требует немедленного внимания.' },
    HIGH: { level: 2, name: 'Высокий', emoji: '🟠', color: '#f97316', description: 'Важно для достижения целей.' },
    MEDIUM: { level: 3, name: 'Средний', emoji: '🟡', color: '#eab308', description: 'Полезный контекст.' },
    LOW: { level: 4, name: 'Низкий', emoji: '🟢', color: '#22c55e', description: 'Дополнительная информация.' },
    INFO: { level: 5, name: 'Справочный', emoji: '🔵', color: '#3b82f6', description: 'Образовательная информация.' }
  };

  const CATEGORIES = piConst.CATEGORIES || {
    METABOLISM: { id: 'metabolism', name: 'Метаболизм', emoji: '🔥', color: '#f97316', description: 'Как организм использует энергию' },
    NUTRITION: { id: 'nutrition', name: 'Питание', emoji: '🍽️', color: '#22c55e', description: 'Качество и состав питания' },
    TIMING: { id: 'timing', name: 'Тайминг', emoji: '⏰', color: '#8b5cf6', description: 'Когда есть и действовать' },
    RECOVERY: { id: 'recovery', name: 'Восстановление', emoji: '😴', color: '#6366f1', description: 'Сон, стресс, отдых' },
    RISK: { id: 'risk', name: 'Риски', emoji: '⚠️', color: '#ef4444', description: 'Предупреждение проблем' },
    PREDICTION: { id: 'prediction', name: 'Прогнозы', emoji: '🔮', color: '#a855f7', description: 'Что будет дальше' },
    PATTERNS: { id: 'patterns', name: 'Паттерны', emoji: '🧬', color: '#ec4899', description: 'Индивидуальные особенности' },
    COMPOSITE: { id: 'composite', name: 'Композитные', emoji: '📊', color: '#14b8a6', description: 'Сводные показатели' },
    STATISTICS: { id: 'statistics', name: 'Статистика', emoji: '📈', color: '#64748b', description: 'Научные расчёты' }
  };

  // Критерии для определения actionability (используем из pi_constants.js)
  const ACTIONABILITY = piConst.ACTIONABILITY || {
    IMMEDIATE: { level: 1, name: 'Немедленно', emoji: '⚡', description: 'Можно исправить прямо сейчас' },
    TODAY: { level: 2, name: 'Сегодня', emoji: '📅', description: 'Влияет на сегодняшние решения' },
    WEEKLY: { level: 3, name: 'Неделя', emoji: '📆', description: 'Требует времени для изменений' },
    LONG_TERM: { level: 4, name: 'Долгосрочно', emoji: '🎯', description: 'Стратегическое планирование' },
    INFORMATIONAL: { level: 5, name: 'Информационно', emoji: 'ℹ️', description: 'Только для понимания' }
  };

  // === API для работы с приоритетами ===

  /**
   * Получить полную информацию о приоритете метрики
   * @param {string} key - ключ из SCIENCE_INFO
   * @returns {Object} { priority, category, actionability, impactScore, whyImportant, ... }
   */
  function getMetricPriority(key) {
    const info = SCIENCE_INFO[key];
    if (!info) return null;

    const priorityLevel = PRIORITY_LEVELS[info.priority] || PRIORITY_LEVELS.INFO;
    const category = CATEGORIES[info.category] || CATEGORIES.STATISTICS;
    const actionability = ACTIONABILITY[info.actionability] || ACTIONABILITY.INFORMATIONAL;

    return {
      key,
      name: info.name,
      priority: info.priority || 'INFO',
      priorityLevel: priorityLevel.level,
      priorityName: priorityLevel.name,
      priorityEmoji: priorityLevel.emoji,
      priorityColor: priorityLevel.color,
      category: info.category || 'STATISTICS',
      categoryName: category.name,
      categoryEmoji: category.emoji,
      categoryColor: category.color,
      actionability: info.actionability || 'INFORMATIONAL',
      actionabilityLevel: actionability.level,
      actionabilityName: actionability.name,
      actionabilityEmoji: actionability.emoji,
      impactScore: info.impactScore || 0,
      whyImportant: info.whyImportant || '',
      source: info.source,
      pmid: info.pmid
    };
  }

  /**
   * Получить все метрики отсортированные по приоритету и impact score
   * @returns {Array} массив метрик с полной информацией
   */
  function getAllMetricsByPriority() {
    const metrics = [];
    for (const key of Object.keys(SCIENCE_INFO)) {
      const priority = getMetricPriority(key);
      if (priority) metrics.push(priority);
    }

    // Сортировка: по priorityLevel (1=CRITICAL сначала), затем по impactScore (выше = важнее)
    return metrics.sort((a, b) => {
      if (a.priorityLevel !== b.priorityLevel) {
        return a.priorityLevel - b.priorityLevel;
      }
      return b.impactScore - a.impactScore;
    });
  }

  /**
   * Получить метрики по категории
   * @param {string} category - ключ категории (METABOLISM, NUTRITION, etc)
   * @returns {Array} массив метрик категории
   */
  function getMetricsByCategory(category) {
    return getAllMetricsByPriority().filter(m => m.category === category);
  }

  /**
   * Получить метрики по actionability
   * @param {string} actionability - IMMEDIATE, TODAY, WEEKLY, etc
   * @returns {Array} массив метрик
   */
  function getMetricsByActionability(actionability) {
    return getAllMetricsByPriority().filter(m => m.actionability === actionability);
  }

  /**
   * Получить только CRITICAL и HIGH priority метрики
   * @returns {Array} массив важных метрик
   */
  function getCriticalMetrics() {
    return getAllMetricsByPriority().filter(m =>
      m.priority === 'CRITICAL' || m.priority === 'HIGH'
    );
  }

  /**
   * Получить статистику приоритетов
   * @returns {Object} { total, byPriority, byCategory, byActionability }
   */
  function getPriorityStats() {
    const all = getAllMetricsByPriority();

    const byPriority = {};
    const byCategory = {};
    const byActionability = {};

    for (const m of all) {
      byPriority[m.priority] = (byPriority[m.priority] || 0) + 1;
      byCategory[m.category] = (byCategory[m.category] || 0) + 1;
      byActionability[m.actionability] = (byActionability[m.actionability] || 0) + 1;
    }

    return {
      total: all.length,
      avgImpactScore: all.length > 0
        ? Math.round(all.reduce((s, m) => s + m.impactScore, 0) / all.length * 100) / 100
        : 0,
      byPriority,
      byCategory,
      byActionability
    };
  }

  // === КОНФИГУРАЦИЯ СЕКЦИЙ UI (из pi_constants.js) ===
  // Используем извлечённые константы, fallback на локальные если модуль не загружен
  const SECTIONS_CONFIG = piConst.SECTIONS_CONFIG || (() => {
    // Fallback секции если pi_constants.js не загружен
    console.warn('[PI] pi_constants.js not loaded, using fallback SECTIONS_CONFIG');
    return {
      STATUS_SCORE: { id: 'status_score', component: 'StatusScoreCard', priority: 'CRITICAL', order: 1, alwaysShow: true, title: 'Метаболический статус', icon: '🎯' },
      CRASH_RISK: { id: 'crash_risk', component: 'MetabolicQuickStatus', priority: 'CRITICAL', order: 2, alwaysShow: true, title: 'Риск срыва', icon: '⚠️' },
      PRIORITY_ACTIONS: { id: 'priority_actions', component: 'PriorityActions', priority: 'CRITICAL', order: 3, alwaysShow: true, title: 'Действия сейчас', icon: '⚡' },
      PREDICTIVE_DASHBOARD: { id: 'predictive_dashboard', component: 'PredictiveDashboard', priority: 'HIGH', order: 10, title: 'Прогнозы на сегодня', icon: '🔮' },
      ADVANCED_ANALYTICS: { id: 'advanced_analytics', component: 'AdvancedAnalyticsCard', priority: 'HIGH', order: 11, title: 'Продвинутая аналитика', icon: '📊' },
      METABOLISM: { id: 'metabolism', component: 'MetabolismSection', priority: 'HIGH', order: 12, title: 'Метаболизм', icon: '🔥' },
      MEAL_TIMING: { id: 'meal_timing', component: 'MealTimingCard', priority: 'HIGH', order: 13, title: 'Тайминг приёмов', icon: '⏰' },
      WHAT_IF: { id: 'what_if', component: 'WhatIfSection', priority: 'MEDIUM', order: 20, title: 'Что если...', icon: '🎯' },
      PATTERNS: { id: 'patterns', component: 'PatternsList', priority: 'MEDIUM', order: 21, title: 'Паттерны', icon: '🔍' },
      WEIGHT_PREDICTION: { id: 'weight_prediction', component: 'WeightPrediction', priority: 'MEDIUM', order: 22, title: 'Прогноз веса', icon: '⚖️' },
      WEEKLY_WRAP: { id: 'weekly_wrap', component: 'WeeklyWrap', priority: 'LOW', order: 30, title: 'Итоги недели', icon: '📋' },
      DATA_COMPLETENESS: { id: 'data_completeness', component: 'DataCompletenessCard', priority: 'LOW', order: 31, title: 'Полнота данных', icon: '📊' }
    };
  })();

  /**
   * Получить секции отсортированные по приоритету (используем из pi_constants если есть)
   */
  const getSortedSections = piConst.getSortedSections || function (filterPriority = null) {
    let sections = Object.values(SECTIONS_CONFIG);
    if (filterPriority) sections = sections.filter(s => s.priority === filterPriority);
    return sections.sort((a, b) => a.order - b.order);
  };

  /**
   * Получить приоритет секции (используем из pi_constants если есть)
   */
  const getSectionPriority = piConst.getSectionPriority || function (sectionId) {
    const section = Object.values(SECTIONS_CONFIG).find(s => s.id === sectionId);
    if (!section) return null;
    const priorityLevel = PRIORITY_LEVELS[section.priority];
    return {
      ...section,
      priorityLevel: priorityLevel?.level || 5,
      priorityEmoji: priorityLevel?.emoji || '🔵',
      priorityColor: priorityLevel?.color || '#3b82f6',
      priorityName: priorityLevel?.name || 'Справочный'
    };
  }

  const PATTERNS = {
    // Еда + волны (приоритет)
    MEAL_TIMING: 'meal_timing',
    WAVE_OVERLAP: 'wave_overlap',
    LATE_EATING: 'late_eating',
    MEAL_QUALITY_TREND: 'meal_quality',

    // Сон + вес
    SLEEP_WEIGHT: 'sleep_weight',
    SLEEP_HUNGER: 'sleep_hunger',

    // Активность
    TRAINING_KCAL: 'training_kcal',
    STEPS_WEIGHT: 'steps_weight',

    // Макросы
    PROTEIN_SATIETY: 'protein_satiety',
    FIBER_REGULARITY: 'fiber_regularity',

    // Эмоции
    STRESS_EATING: 'stress_eating',
    MOOD_FOOD: 'mood_food',

    // NEW v2.0
    CIRCADIAN: 'circadian',
    NUTRIENT_TIMING: 'nutrient_timing',
    INSULIN_SENSITIVITY: 'insulin_sensitivity',
    GUT_HEALTH: 'gut_health'
  };

  // === КЭШ ===
  let _cache = {
    data: null,
    timestamp: 0,
    clientId: null,
    daysBack: null
  };

  // === УТИЛИТЫ ===

  // Статистические функции делегируем в pi_stats.js
  const average = piStats.average || function (arr) {
    if (!arr || arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  };

  const stdDev = piStats.stdDev || function (arr) {
    if (!arr || arr.length < 2) return 0;
    const avg = average(arr);
    const squareDiffs = arr.map(v => Math.pow(v - avg, 2));
    return Math.sqrt(average(squareDiffs));
  };

  const pearsonCorrelation = piStats.pearsonCorrelation || function (x, y) {
    if (x.length !== y.length || x.length < 3) return 0;
    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i], 0);
    const sumX2 = x.reduce((acc, xi) => acc + xi * xi, 0);
    const sumY2 = y.reduce((acc, yi) => acc + yi * yi, 0);
    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    if (denominator === 0) return 0;
    return numerator / denominator;
  };

  const calculateTrend = piStats.calculateTrend || function (values) {
    if (values.length < 2) return 0;
    const n = values.length;
    const x = values.map((_, i) => i);
    const y = values;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i], 0);
    const sumX2 = x.reduce((acc, xi) => acc + xi * xi, 0);
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    return isNaN(slope) ? 0 : slope;
  };

  const calculateLinearRegression = piStats.calculateLinearRegression || function (points) {
    if (points.length < 2) return 0;
    const n = points.length;
    const sumX = points.reduce((a, p) => a + p.x, 0);
    const sumY = points.reduce((a, p) => a + p.y, 0);
    const sumXY = points.reduce((a, p) => a + p.x * p.y, 0);
    const sumX2 = points.reduce((a, p) => a + p.x * p.x, 0);
    const denominator = (n * sumX2 - sumX * sumX);
    if (denominator === 0) return 0;
    const slope = (n * sumXY - sumX * sumY) / denominator;
    return isNaN(slope) ? 0 : slope;
  };

  // === ВЫЧИСЛИТЕЛЬНЫЕ ФУНКЦИИ (делегируем в pi_calculations.js) ===
  const calculateItemKcal = piCalculations.calculateItemKcal || function (item, pIndex) {
    if (!item || !item.grams) return 0;
    const prod = pIndex?.byId?.get?.(String(item.product_id || item.id)?.toLowerCase());
    if (!prod) return 0;
    const p = prod.protein100 || 0;
    const c = (prod.simple100 || 0) + (prod.complex100 || 0);
    const f = (prod.badFat100 || 0) + (prod.goodFat100 || 0) + (prod.trans100 || 0);
    return (p * 4 + c * 4 + f * 9) * item.grams / 100;
  };

  const calculateDayKcal = piCalculations.calculateDayKcal || function (day, pIndex) {
    let total = 0;
    if (!day.meals) return 0;
    for (const meal of day.meals) {
      if (!meal.items) continue;
      for (const item of meal.items) {
        total += calculateItemKcal(item, pIndex);
      }
    }
    return total;
  };

  const calculateBMR = piCalculations.calculateBMR || function (profile) {
    if (HEYS.TDEE?.calcBMR) return HEYS.TDEE.calcBMR(profile);
    const weight = profile?.weight || 70;
    const height = profile?.height || 170;
    const age = profile?.age || 30;
    const isMale = profile?.gender !== 'Женский';
    return isMale ? (10 * weight + 6.25 * height - 5 * age + 5) : (10 * weight + 6.25 * height - 5 * age - 161);
  };

  const getDaysData = piCalculations.getDaysData || function (daysBack, lsGet) {
    const days = [];
    const today = new Date();
    for (let i = 0; i < daysBack; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const dayData = lsGet(`heys_dayv2_${dateStr}`, null);
      if (dayData && dayData.meals && dayData.meals.length > 0) {
        days.push({ date: dateStr, daysAgo: i, ...dayData });
      }
    }
    return days;
  };

  // === UI КОМПОНЕНТЫ - Fallback references (делегируем в pi_ui_*.js модули) ===
  // Ring Components
  const HealthRing = piUIRings.HealthRing || function () { return h('div', {}, 'HealthRing not loaded'); };
  const TotalHealthRing = piUIRings.TotalHealthRing || function () { return h('div', {}, 'TotalHealthRing not loaded'); };
  const StatusProgressRing = piUIRings.StatusProgressRing || function () { return h('div', {}, 'StatusProgressRing not loaded'); };
  const MiniRiskMeter = piUIRings.MiniRiskMeter || function () { return h('div', {}, 'MiniRiskMeter not loaded'); };
  const MetabolicStateRing = piUIRings.MetabolicStateRing || function () { return h('div', {}, 'MetabolicStateRing not loaded'); };

  // Card Components
  const CollapsibleSection = piUICards.CollapsibleSection || function () { return h('div', {}, 'CollapsibleSection not loaded'); };
  const AdvancedAnalyticsCard = piUICards.AdvancedAnalyticsCard || function () { return h('div', {}, 'AdvancedAnalyticsCard not loaded'); };
  const MetabolismCard = piUICards.MetabolismCard || function () { return h('div', {}, 'MetabolismCard not loaded'); };
  const MetabolismSection = piUICards.MetabolismSection || function () { return h('div', {}, 'MetabolismSection not loaded'); };
  const PatternCard = piUICards.PatternCard || function () { return h('div', {}, 'PatternCard not loaded'); };
  const PatternsList = piUICards.PatternsList || function () { return h('div', {}, 'PatternsList not loaded'); };
  const WeeklyWrap = piUICards.WeeklyWrap || function () { return h('div', {}, 'WeeklyWrap not loaded'); };
  const EmptyState = piUICards.EmptyState || function () { return h('div', {}, 'EmptyState not loaded'); };
  const InsightsCard = piUICards.InsightsCard || function () { return h('div', {}, 'InsightsCard not loaded'); };
  const InfoButton = piUICards.InfoButton || function () { return h('button', {}, 'ℹ️'); };
  const MetricWithInfo = piUICards.MetricWithInfo || function () { return h('div', {}, 'Metric'); };
  const MetabolicStatusCard = piUICards.MetabolicStatusCard || function () { return h('div', {}, 'Status'); };
  const ReasonCard = piUICards.ReasonCard || function () { return h('div', {}, 'Reason'); };
  const ActionCard = piUICards.ActionCard || function () { return h('div', {}, 'Action'); };

  // What-If Components
  const WhatIfSimulator = piUIWhatIf.WhatIfSimulator || function () { return h('div', {}, 'WhatIfSimulator not loaded'); };
  const WhatIfCard = piUIWhatIf.WhatIfCard || function () { return h('div', {}, 'WhatIfCard not loaded'); };
  const ScenarioCard = piUIWhatIf.ScenarioCard || function () { return h('div', {}, 'ScenarioCard not loaded'); };
  const WhatIfSection = piUIWhatIf.WhatIfSection || function () { return h('div', {}, 'WhatIfSection not loaded'); };

  // Dashboard Components
  const WeightPrediction = piUIDashboard.WeightPrediction || function () { return h('div', {}, 'WeightPrediction not loaded'); };
  const PriorityFilterBar = piUIDashboard.PriorityFilterBar || function () { return h('div', {}, 'PriorityFilterBar not loaded'); };
  const PillarBreakdownBars = piUIDashboard.PillarBreakdownBars || function () { return h('div', {}, 'PillarBreakdownBars not loaded'); };
  const DualRiskPanel = piUIDashboard.DualRiskPanel || function () { return h('div', {}, 'DualRiskPanel not loaded'); };
  const RiskPanel = piUIDashboard.RiskPanel || function () { return h('div', {}, 'RiskPanel not loaded'); };
  const RiskMeter = piUIDashboard.RiskMeter || function () { return h('div', {}, 'RiskMeter not loaded'); };
  const ForecastPanel = piUIDashboard.ForecastPanel || function () { return h('div', {}, 'ForecastPanel not loaded'); };
  const FeedbackPrompt = piUIDashboard.FeedbackPrompt || function () { return h('div', {}, 'FeedbackPrompt not loaded'); };
  const AccuracyBadge = piUIDashboard.AccuracyBadge || function () { return h('span', {}, 'Accuracy'); };
  const PredictiveDashboardLegacy = piUIDashboard.PredictiveDashboardLegacy || function () { return h('div', {}, 'Dashboard not loaded'); };
  const DataCompletenessCard = piUIDashboard.DataCompletenessCard || function () { return h('div', {}, 'DataCompletenessCard not loaded'); };
  const MealTimingCard = piUIDashboard.MealTimingCard || function () { return h('div', {}, 'MealTimingCard not loaded'); };

  // === АНАЛИЗ ПАТТЕРНОВ ===
  // Делегируем в pi_patterns.js
  const analyzeMealTiming = piPatterns.analyzeMealTiming || function () { return { pattern: 'meal_timing', available: false }; };
  const analyzeWaveOverlap = piPatterns.analyzeWaveOverlap || function () { return { pattern: 'wave_overlap', available: false }; };
  const analyzeLateEating = piPatterns.analyzeLateEating || function () { return { pattern: 'late_eating', available: false }; };
  const analyzeMealQualityTrend = piPatterns.analyzeMealQualityTrend || function () { return { pattern: 'meal_quality', available: false }; };
  const analyzeSleepWeight = piPatterns.analyzeSleepWeight || function () { return { pattern: 'sleep_weight', available: false }; };
  const analyzeSleepHunger = piPatterns.analyzeSleepHunger || function () { return { pattern: 'sleep_hunger', available: false }; };
  const analyzeTrainingKcal = piPatterns.analyzeTrainingKcal || function () { return { pattern: 'training_kcal', available: false }; };
  const analyzeStepsWeight = piPatterns.analyzeStepsWeight || function () { return { pattern: 'steps_weight', available: false }; };
  const analyzeProteinSatiety = piPatterns.analyzeProteinSatiety || function () { return { pattern: 'protein_satiety', available: false }; };
  const analyzeFiberRegularity = piPatterns.analyzeFiberRegularity || function () { return { pattern: 'fiber_regularity', available: false }; };
  const analyzeNutritionQuality = piPatterns.analyzeNutritionQuality || function () { return { pattern: 'nutrition_quality', available: false }; };
  const analyzeStressEating = piPatterns.analyzeStressEating || function () { return { pattern: 'stress_eating', available: false }; };
  const analyzeMoodFood = piPatterns.analyzeMoodFood || function () { return { pattern: 'mood_food', available: false }; };
  const analyzeMoodTrajectory = piPatterns.analyzeMoodTrajectory || function () { return { pattern: 'mood_trajectory', available: false }; };
  const analyzeCircadianTiming = piPatterns.analyzeCircadianTiming || function () { return { pattern: 'circadian', available: false }; };
  const analyzeNutrientTiming = piPatterns.analyzeNutrientTiming || function () { return { pattern: 'nutrient_timing', available: false }; };
  const analyzeInsulinSensitivity = piPatterns.analyzeInsulinSensitivity || function () { return { pattern: 'insulin_sensitivity', available: false }; };
  const analyzeGutHealth = piPatterns.analyzeGutHealth || function () { return { pattern: 'gut_health', available: false }; };
  const analyzeNEATTrend = piPatterns.analyzeNEATTrend || function () { return { pattern: 'neat_activity', available: false }; };

  // NEW v4.0 (B1-B6)
  const analyzeSleepQuality = piPatterns.analyzeSleepQuality || function () { return { pattern: 'sleep_quality', available: false }; };
  const analyzeWellbeing = piPatterns.analyzeWellbeing || function () { return { pattern: 'wellbeing_correlation', available: false }; };
  const analyzeHydration = piPatterns.analyzeHydration || function () { return { pattern: 'hydration', available: false }; };
  const analyzeBodyComposition = piPatterns.analyzeBodyComposition || function () { return { pattern: 'body_composition', available: false }; };
  const analyzeCyclePatterns = piPatterns.analyzeCyclePatterns || function () { return { pattern: 'cycle_impact', available: false }; };
  const analyzeWeekendEffect = piPatterns.analyzeWeekendEffect || function () { return { pattern: 'weekend_effect', available: false }; };

  // NEW v5.0 (C7-C12)
  const analyzeNOVAQuality = piPatterns.analyzeNOVAQuality || function () { return { pattern: 'nova_quality', available: false }; };
  const analyzeTrainingRecovery = piPatterns.analyzeTrainingRecovery || function () { return { pattern: 'training_recovery', available: false }; };
  const analyzeHypertrophy = piPatterns.analyzeHypertrophy || function () { return { pattern: 'hypertrophy', available: false }; };
  const analyzeMicronutrients = piPatterns.analyzeMicronutrients || function () { return { pattern: 'micronutrient_radar', available: false }; };
  const analyzeHeartHealth = piPatterns.analyzeHeartHealth || function () { return { pattern: 'heart_health', available: false }; };
  const analyzeOmegaBalance = piPatterns.analyzeOmegaBalance || function () { return { pattern: 'omega_balancer', available: false }; };

  // NEW v6.0 (C13-C22)
  const analyzeVitaminDefense = piPatterns.analyzeVitaminDefense || function () { return { pattern: 'vitamin_defense', available: false }; };
  const analyzeBComplexAnemia = piPatterns.analyzeBComplexAnemia || function () { return { pattern: 'b_complex_anemia', available: false }; };
  const analyzeGlycemicLoad = piPatterns.analyzeGlycemicLoad || function () { return { pattern: 'glycemic_load', available: false }; };
  const analyzeProteinDistribution = piPatterns.analyzeProteinDistribution || function () { return { pattern: 'protein_distribution', available: false }; };
  const analyzeAntioxidantDefense = piPatterns.analyzeAntioxidantDefense || function () { return { pattern: 'antioxidant_defense', available: false }; };
  const analyzeAddedSugarDependency = piPatterns.analyzeAddedSugarDependency || function () { return { pattern: 'added_sugar_dependency', available: false }; };
  const analyzeBoneHealth = piPatterns.analyzeBoneHealth || function () { return { pattern: 'bone_health', available: false }; };
  const analyzeTrainingTypeMatch = piPatterns.analyzeTrainingTypeMatch || function () { return { pattern: 'training_type_match', available: false }; };
  const analyzeElectrolyteHomeostasis = piPatterns.analyzeElectrolyteHomeostasis || function () { return { pattern: 'electrolyte_homeostasis', available: false }; };
  const analyzeNutrientDensity = piPatterns.analyzeNutrientDensity || function () { return { pattern: 'nutrient_density', available: false }; };

  // === ПРОДВИНУТАЯ АНАЛИТИКА ===
  // Делегируем в pi_advanced.js
  const calculateHealthScore = piAdvanced.calculateHealthScore || function (patterns, profile) {
    return { total: 0, categories: {}, available: false };
  };

  const generateWhatIfScenarios = piAdvanced.generateWhatIfScenarios || function (patterns, healthScore, days, profile) {
    return [];
  };

  const predictWeight = piAdvanced.predictWeight || function (days, profile) {
    return { available: false };
  };

  const generateWeeklyWrap = piAdvanced.generateWeeklyWrap || function (days, patterns, healthScore, weightPrediction, profile) {
    return null;
  };

  // === ГЛАВНАЯ ФУНКЦИЯ АНАЛИЗА ===

  /**
   * Запустить полный анализ
   * @param {Object} options - опции
   * @param {number} options.daysBack - сколько дней анализировать (по умолчанию 14)
   * @param {Function} options.lsGet - функция U.lsGet
   * @param {Object} options.profile - профиль пользователя
   * @param {Object} options.pIndex - индекс продуктов
   * @param {number} options.optimum - целевой калораж
   * @returns {Object} результат анализа
   */
  function analyze(options = {}) {
    const {
      daysBack = CONFIG.DEFAULT_DAYS,
      lsGet = U.lsGet || ((k, d) => {
        try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; }
      }),
      profile = lsGet('heys_profile', {}),
      optimum = 2000
    } = options;

    // Получаем pIndex: из аргументов или строим из массива продуктов
    let pIndex = options.pIndex || null;
    if (!pIndex || !pIndex.byId) {
      const products = HEYS.products?.getAll?.() || [];
      const buildIndex = HEYS.dayUtils?.buildProductIndex || HEYS.models?.buildProductIndex;
      if (buildIndex && products.length > 0) {
        pIndex = buildIndex(products);
      } else if (products.length > 0) {
        const byId = new Map();
        const byName = new Map();
        for (const p of products) {
          if (p.id) byId.set(String(p.id).toLowerCase(), p);
          if (p.name) byName.set(p.name.toLowerCase(), p);
        }
        pIndex = { byId, byName };
      }
    }

    // Проверяем кэш
    const clientId = lsGet('heys_client_current', 'default');
    const now = Date.now();

    if (_cache.data &&
      _cache.clientId === clientId &&
      _cache.daysBack === daysBack &&
      (now - _cache.timestamp) < CONFIG.CACHE_TTL_MS) {
      return _cache.data;
    }

    // Получаем данные
    const days = getDaysData(daysBack, lsGet);

    if (days.length < CONFIG.MIN_DAYS_FOR_INSIGHTS) {
      return {
        available: false,
        daysAnalyzed: days.length,
        daysWithData: days.length,
        confidence: Math.round((days.length / CONFIG.MIN_DAYS_FOR_INSIGHTS) * 50),
        minDaysRequired: CONFIG.MIN_DAYS_FOR_INSIGHTS,
        message: `Нужно минимум ${CONFIG.MIN_DAYS_FOR_INSIGHTS} дня данных. Сейчас: ${days.length}`,
        patterns: [],
        healthScore: { total: 0, categories: {} },
        whatIf: [],
        weightPrediction: { available: false },
        weeklyWrap: null
      };
    }

    // Анализируем паттерны — v2.0: добавлены pIndex и новые анализаторы
    const patterns = [
      // === Тайминг и волны ===
      analyzeMealTiming(days, profile),
      analyzeWaveOverlap(days, profile),
      analyzeLateEating(days),

      // === Качество питания ===
      analyzeMealQualityTrend(days, pIndex, optimum),
      analyzeNutritionQuality(days, pIndex),
      analyzeProteinSatiety(days, profile, pIndex),     // v2.0: добавлен pIndex
      analyzeFiberRegularity(days, pIndex),              // v2.0: добавлен pIndex
      analyzeMoodFood(days, pIndex, optimum),
      analyzeMoodTrajectory(days, pIndex),

      // === Сон и корреляции ===
      analyzeSleepWeight(days),
      analyzeSleepHunger(days, profile, pIndex),         // v2.0: добавлен pIndex

      // === Активность ===
      analyzeTrainingKcal(days, pIndex),                 // v2.0: добавлен pIndex
      analyzeStepsWeight(days),
      analyzeNEATTrend(days),

      // === Стресс ===
      analyzeStressEating(days, pIndex),                 // v2.0: добавлен pIndex

      // === Научные анализаторы (v2.1) ===
      analyzeCircadianTiming(days, pIndex),              // Циркадные ритмы
      analyzeNutrientTiming(days, pIndex, profile),      // Тайминг нутриентов
      analyzeInsulinSensitivity(days, pIndex, profile),  // Чувствительность к инсулину
      analyzeGutHealth(days, pIndex),                    // Здоровье ЖКТ

      // === NEW v4.0 (B1-B6) ===
      analyzeSleepQuality(days, pIndex),                 // B1: качество сна → метрики след. дня
      analyzeWellbeing(days, pIndex),                    // B2: самочувствие ↔ образ жизни
      analyzeHydration(days),                            // B3: гидратация (30ml/кг)
      analyzeBodyComposition(days, profile),             // B4: WHR тренд
      analyzeCyclePatterns(days, pIndex, profile),       // B5: цикл (фолликулярная/лютеиновая)
      analyzeWeekendEffect(days, pIndex),                // B6: выходные vs будни

      // === NEW v5.0 (C7-C12) ===
      analyzeNOVAQuality(days, pIndex),                  // C10: NOVA Quality Score (ультрапереработка)
      analyzeTrainingRecovery(days),                     // C11: интенсивность тренировок + восстановление
      analyzeHypertrophy(days, profile),                 // C12: гипертрофия + композиция тела
      analyzeMicronutrients(days, pIndex, profile),      // C7: микронутриенты (железо, магний, цинк, кальций)
      analyzeHeartHealth(days, pIndex),                  // C9: Na/K ratio + холестерин
      analyzeOmegaBalance(days, pIndex),                 // C8: омега-6:3 баланс + воспалительная нагрузка

      // === NEW v6.0 (C13-C22) ===
      analyzeVitaminDefense(days, profile),     // C13: Vitamin Defense Radar (11 vitamins)
      analyzeBComplexAnemia(days, profile),      // C22: B-Complex Energy & Anemia Risk
      analyzeGlycemicLoad(days, pIndex),         // C14: Glycemic Load Optimizer
      analyzeProteinDistribution(days, profile, pIndex), // C15: Protein Distribution
      analyzeAntioxidantDefense(days, pIndex), // C16: Antioxidant Defense Score
      analyzeAddedSugarDependency(days, pIndex), // C18: Added Sugar & Dependency
      analyzeBoneHealth(days, profile, pIndex), // C17: Bone Health Index
      analyzeTrainingTypeMatch(days, profile, pIndex), // C19: Training-Type Nutrition Match
      analyzeElectrolyteHomeostasis(days, pIndex), // C20: Electrolyte Homeostasis
      analyzeNutrientDensity(days, pIndex) // C21: Nutrient Density
    ].filter(p => p && (p.available || p.hasPattern));

    console.info(`[HEYS.insights] 📊 v6.0 | daysBack=${daysBack}, days=${days.length}, patterns=${patterns.length}/41 possible (v6.0: +C13+C22+C14+C15+C16+C18+C17+C19+C20+C21)`,
      patterns.map(p => `${p.pattern || 'unknown_pattern'}:${p.score ?? 'n/a'}`));

    // Рассчитываем Health Score
    const healthScore = calculateHealthScore(patterns, profile);

    console.info(`[HEYS.insights] 🎯 healthScore=${healthScore.total}, categories=`, healthScore.categories);

    // What-If Scenarios
    const whatIfScenarios = generateWhatIfScenarios(patterns, healthScore, days, profile);

    // Weight Prediction
    const weightPrediction = predictWeight(days, profile);

    // Weekly Wrap - сигнатура: (days, patterns, healthScore, weightPrediction)
    const weeklyWrap = generateWeeklyWrap(days, patterns, healthScore, weightPrediction, profile);

    // Сохраняем в кэш
    const result = {
      available: true,
      daysAnalyzed: daysBack,
      daysWithData: days.length,
      confidence: Math.round(Math.min(100, (days.length / CONFIG.MIN_DAYS_FOR_FULL_ANALYSIS) * 100)),
      patterns,
      healthScore,
      whatIf: whatIfScenarios,
      weightPrediction,
      weeklyWrap,
      generatedAt: now
    };

    _cache = {
      data: result,
      clientId,
      daysBack,
      timestamp: now
    };

    return result;
  }

  // === HealthRingsGrid Component ===
  function HealthRingsGrid({ healthScore, compact, onCategoryClick, lsGet }) {
    if (!healthScore || !healthScore.breakdown) return null;

    // 🆕 v3.22.0: Вычисляем emotionalRisk для Recovery overlay
    const emotionalRiskData = useMemo(() => {
      const U = window.HEYS?.utils;
      const getter = lsGet || U?.lsGet || ((k, d) => {
        try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; }
      });
      const profile = getter('heys_profile', {});
      const todayDate = new Date().toISOString().split('T')[0];
      const day = getter(`heys_dayv2_${todayDate}`, {});

      const stressAvg = day.stressAvg || 0;
      const factors = [];
      let bingeRisk = 0;

      if (stressAvg >= 6) { factors.push('Стресс'); bingeRisk += 35; }
      else if (stressAvg >= 4) { factors.push('Стресс'); bingeRisk += 15; }

      const hour = new Date().getHours();
      if (hour >= 20) bingeRisk += 20;

      const sleepDeficit = (profile.sleepHours || 8) - (day.sleepHours || 0);
      if (sleepDeficit > 2) { factors.push('Недосып'); bingeRisk += 15; }

      return {
        hasRisk: bingeRisk >= 30,
        bingeRisk: Math.min(90, bingeRisk),
        factors,
        level: bingeRisk >= 60 ? 'high' : bingeRisk >= 40 ? 'medium' : 'low'
      };
    }, [lsGet]);

    const categories = [
      { key: 'nutrition', label: 'Питание', color: '#22c55e', infoKey: 'CATEGORY_NUTRITION' },
      { key: 'timing', label: 'Тайминг', color: '#3b82f6', infoKey: 'CATEGORY_TIMING' },
      { key: 'activity', label: 'Активность', color: '#f59e0b', infoKey: 'CATEGORY_ACTIVITY' },
      { key: 'recovery', label: 'Восстановление', color: '#8b5cf6', infoKey: 'CATEGORY_RECOVERY' }
    ];

    // Compact mode: карточки с мини-кольцами
    if (compact) {
      return h('div', { className: 'insights-rings-grid' },
        categories.map(cat => {
          const score = healthScore.breakdown[cat.key]?.score || 0;
          const radius = 18;
          const circumference = 2 * Math.PI * radius;
          const offset = circumference - (score / 100) * circumference;

          // 🆕 emotionalRisk overlay для Recovery
          const hasEmotionalWarning = cat.key === 'recovery' && emotionalRiskData.hasRisk;

          return h('div', {
            key: cat.key,
            className: `insights-ring-card insights-ring-card--${cat.key} ${hasEmotionalWarning ? 'insights-ring-card--emotional-warning' : ''}`,
            onClick: () => onCategoryClick && onCategoryClick(cat.key)
          },
            // Mini ring
            h('div', { className: 'insights-ring-card__ring' },
              h('svg', { width: 48, height: 48, viewBox: '0 0 48 48' },
                h('circle', {
                  cx: 24, cy: 24, r: radius,
                  fill: 'none',
                  stroke: 'rgba(0,0,0,0.06)',
                  strokeWidth: 4
                }),
                h('circle', {
                  cx: 24, cy: 24, r: radius,
                  fill: 'none',
                  stroke: hasEmotionalWarning ? '#f87171' : cat.color, // красный при риске
                  strokeWidth: 4,
                  strokeLinecap: 'round',
                  strokeDasharray: circumference,
                  strokeDashoffset: offset,
                  style: { transition: 'stroke-dashoffset 0.8s ease' }
                })
              ),
              h('span', { className: 'insights-ring-card__value' }, Math.round(score)),
              // 🆕 Emotional warning badge
              hasEmotionalWarning && h('span', {
                className: 'insights-ring-card__emotional-badge',
                title: `Эмоц. риск: ${emotionalRiskData.bingeRisk}%\n${emotionalRiskData.factors.join(', ')}`
              }, '🧠')
            ),
            // Info
            h('div', { className: 'insights-ring-card__info' },
              h('div', { className: 'insights-ring-card__header' },
                h('div', { className: 'insights-ring-card__label' }, cat.label),
                h(getInfoButton(), { infoKey: cat.infoKey, size: 'small' })
              ),
              h('div', { className: 'insights-ring-card__title' },
                hasEmotionalWarning
                  ? `🧠 ${emotionalRiskData.bingeRisk}%`
                  : score >= 80 ? 'Отлично' : score >= 60 ? 'Хорошо' : score >= 40 ? 'Норма' : 'Улучшить'
              ),
              // 🆕 PMID link при высоком риске
              hasEmotionalWarning && emotionalRiskData.level !== 'low' && h('a', {
                href: 'https://pubmed.ncbi.nlm.nih.gov/11070333/',
                target: '_blank',
                className: 'insights-ring-card__pmid',
                title: 'Epel 2001 — стресс и кортизол',
                onClick: (e) => e.stopPropagation()
              }, '🔬')
            )
          );
        })
      );
    }

    // Full mode: стандартные кольца
    return h('div', { className: 'insights-rings' },
      categories.map(cat =>
        h(HealthRing, {
          key: cat.key,
          score: healthScore.breakdown[cat.key]?.score,
          category: cat.key,
          label: cat.label,
          color: cat.key === 'recovery' && emotionalRiskData.hasRisk ? '#f87171' : cat.color,
          onClick: onCategoryClick,
          infoKey: cat.infoKey,
          debugData: healthScore.breakdown[cat.key],
          emotionalWarning: cat.key === 'recovery' ? emotionalRiskData : null
        })
      )
    );
  }

  // ============================================================
  // 🧪 WHAT-IF SIMULATOR v1.0.0
  // Интерактивный симулятор: "Что если я съем X?"
  // ============================================================

  /**
   * Preset-продукты для быстрого выбора
   * Реальные нутриенты из базы или типичные значения
   */
  const WHATIF_PRESETS = [
    // Быстрые углеводы (высокий GI, короткая сытость)
    { id: 'pizza', name: 'Пицца', emoji: '🍕', kcal: 400, prot: 15, carbs: 45, fat: 18, gi: 65, category: 'fast' },
    { id: 'chocolate', name: 'Шоколад', emoji: '🍫', kcal: 250, prot: 3, carbs: 28, fat: 14, gi: 70, category: 'fast' },
    { id: 'cookie', name: 'Печенье', emoji: '🍪', kcal: 200, prot: 2, carbs: 30, fat: 8, gi: 75, category: 'fast' },
    { id: 'icecream', name: 'Мороженое', emoji: '🍨', kcal: 250, prot: 3, carbs: 30, fat: 12, gi: 62, category: 'fast' },
    { id: 'soda', name: 'Газировка 330мл', emoji: '🥤', kcal: 140, prot: 0, carbs: 35, fat: 0, gi: 90, category: 'fast' },

    // Здоровые опции (низкий GI, высокий белок/клетчатка)
    { id: 'salad', name: 'Салат', emoji: '🥗', kcal: 200, prot: 5, carbs: 15, fat: 12, gi: 25, fiber: 5, category: 'healthy' },
    { id: 'chicken', name: 'Куриная грудка', emoji: '🍗', kcal: 250, prot: 35, carbs: 0, fat: 10, gi: 0, category: 'healthy' },
    { id: 'eggs', name: 'Яйца (2 шт)', emoji: '🥚', kcal: 180, prot: 14, carbs: 1, fat: 12, gi: 0, category: 'healthy' },
    { id: 'cottage', name: 'Творог', emoji: '🧀', kcal: 180, prot: 25, carbs: 5, fat: 5, gi: 30, category: 'healthy' },
    { id: 'nuts', name: 'Орехи 50г', emoji: '🥜', kcal: 300, prot: 10, carbs: 10, fat: 28, gi: 15, fiber: 4, category: 'healthy' },

    // Комплексные приёмы
    { id: 'breakfast', name: 'Овсянка + банан', emoji: '🥣', kcal: 350, prot: 10, carbs: 55, fat: 8, gi: 55, fiber: 6, category: 'meal' },
    { id: 'lunch', name: 'Рис + курица + салат', emoji: '🍱', kcal: 500, prot: 35, carbs: 50, fat: 15, gi: 50, fiber: 5, category: 'meal' },
    { id: 'dinner', name: 'Рыба + овощи', emoji: '🐟', kcal: 400, prot: 30, carbs: 20, fat: 18, gi: 35, fiber: 8, category: 'meal' }
  ];

  /**
   * Категории preset-ов
   */
  const WHATIF_CATEGORIES = {
    fast: { name: 'Быстрые углеводы', emoji: '⚡', color: '#ef4444' },
    healthy: { name: 'Полезные опции', emoji: '💚', color: '#22c55e' },
    meal: { name: 'Полные приёмы', emoji: '🍽️', color: '#3b82f6' }
  };

  /**
   * Рассчитать эффект от еды (симуляция)
   * @param {Object} food - продукт { kcal, prot, carbs, fat, gi, fiber }
   * @param {Object} context - контекст { currentWave, currentRisk, dayTot, optimum, profile, trainings }
   * @returns {Object} результат симуляции
   */
  function simulateFood(food, context) {
    const { currentWave, currentRisk, dayTot, optimum, profile, trainings } = context;

    // 1. Расчёт новой инсулиновой волны
    const gl = ((food.gi || 50) * (food.carbs || 0)) / 100;
    const baseWaveHours = profile?.insulinWaveHours || 3;

    // Модификаторы волны (из InsulinWave module)
    let waveMultiplier = 1.0;

    // GI модификатор
    if (food.gi >= 70) waveMultiplier *= 1.2;
    else if (food.gi >= 55) waveMultiplier *= 1.1;
    else if (food.gi <= 35) waveMultiplier *= 0.85;

    // GL модификатор (плавная кривая)
    const glMult = 0.15 + (Math.min(gl, 40) / 40) ** 0.6 * 1.15;
    waveMultiplier *= Math.min(1.3, Math.max(0.2, glMult));

    // Белок удлиняет (инсулиногенный эффект)
    if (food.prot >= 30) waveMultiplier *= 1.10;
    else if (food.prot >= 20) waveMultiplier *= 1.05;

    // Клетчатка сокращает
    if (food.fiber >= 8) waveMultiplier *= 0.85;
    else if (food.fiber >= 5) waveMultiplier *= 0.92;

    // Жиры удлиняют
    if (food.fat >= 20) waveMultiplier *= 1.10;
    else if (food.fat >= 10) waveMultiplier *= 1.05;

    // Activity Context (если есть тренировка)
    let activityBonus = 0;
    if (trainings && trainings.length > 0) {
      const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
      for (const t of trainings) {
        const tMin = parseInt((t.time || '').split(':')[0]) * 60 + parseInt((t.time || '').split(':')[1] || 0);
        const gap = Math.abs(nowMin - tMin);
        if (gap <= 120) {
          activityBonus = -0.25; // POST-workout
          break;
        }
      }
    }
    waveMultiplier *= (1 + activityBonus);

    const newWaveMinutes = Math.round(baseWaveHours * 60 * waveMultiplier);
    const newWaveEndTime = new Date(Date.now() + newWaveMinutes * 60 * 1000);
    const newWaveEndStr = newWaveEndTime.toTimeString().slice(0, 5);

    // 2. Сравнение с текущей волной
    let waveImpact = 'neutral';
    let waveCompare = null;

    if (currentWave && currentWave.status !== 'lipolysis') {
      // Сейчас волна активна — добавление еды продлит её
      waveImpact = 'extends';
      waveCompare = {
        before: currentWave.remaining || 0,
        after: newWaveMinutes,
        diff: newWaveMinutes - (currentWave.remaining || 0)
      };
    } else if (currentWave && currentWave.status === 'lipolysis') {
      // Сейчас липолиз — еда прервёт его
      waveImpact = 'interrupts';
      waveCompare = {
        lipolysisLost: currentWave.lipolysisMinutes || 0,
        newWaveMinutes
      };
    }

    // 3. Расчёт влияния на риск срыва
    const newDayKcal = (dayTot?.kcal || 0) + food.kcal;
    const newRatio = optimum ? newDayKcal / optimum : 1;

    let riskDelta = 0;
    let riskReason = null;

    // Риск растёт если:
    if (food.gi >= 70) {
      riskDelta += 8; // Высокий GI → быстрый голод позже
      riskReason = 'Высокий ГИ → быстрый голод через 2-3ч';
    }
    if (newRatio > 1.1 && newRatio < 1.3) {
      riskDelta += 5; // Лёгкий перебор → психологический стресс
    } else if (newRatio >= 1.3) {
      riskDelta += 15; // Сильный перебор → стресс и "да гори оно всё"
      riskReason = 'Сильный перебор калорий → психологический срыв';
    }

    // Риск снижается если:
    if (food.prot >= 25 && food.gi <= 40) {
      riskDelta -= 10; // Белок + низкий GI = долгая сытость
      riskReason = 'Много белка + низкий ГИ → долгая сытость';
    }
    if (food.fiber >= 5) {
      riskDelta -= 5; // Клетчатка = сытость
    }

    const newRisk = Math.min(100, Math.max(0, (currentRisk || 0) + riskDelta));

    // 4. Советы на основе симуляции
    const advice = [];

    // Совет про тайминг
    if (currentWave && currentWave.status !== 'lipolysis' && currentWave.remaining >= 60) {
      advice.push({
        type: 'timing',
        icon: '⏳',
        text: `Подожди ${Math.round(currentWave.remaining / 60 * 10) / 10}ч до конца текущей волны`,
        priority: 1
      });
    }

    // Совет про замену
    if (food.gi >= 65 && food.category === 'fast') {
      const healthyAlt = WHATIF_PRESETS.find(p => p.category === 'healthy' && Math.abs(p.kcal - food.kcal) < 100);
      if (healthyAlt) {
        advice.push({
          type: 'alternative',
          icon: '💡',
          text: `Замени на ${healthyAlt.emoji} ${healthyAlt.name} — волна на ${Math.round((waveMultiplier - 0.85) / waveMultiplier * 100)}% короче`,
          priority: 2,
          altPreset: healthyAlt
        });
      }
    }

    // Совет про белок
    if (food.prot < 15 && food.kcal >= 300) {
      advice.push({
        type: 'add_protein',
        icon: '🥚',
        text: 'Добавь белок — дольше сытость',
        priority: 3
      });
    }

    // Совет про калории
    if (newRatio >= 1.3) {
      advice.push({
        type: 'warning',
        icon: '⚠️',
        text: 'Перебор калорий! Рассмотри меньшую порцию',
        priority: 0
      });
    } else if (newRatio >= 0.9 && newRatio <= 1.1) {
      advice.push({
        type: 'success',
        icon: '✅',
        text: 'Калории будут в норме',
        priority: 4
      });
    }

    // 5. Сатиация (насколько долго будет сыто)
    let satietyHours = 2; // базовая
    satietyHours += food.prot * 0.03; // +0.03ч на грамм белка
    satietyHours += (food.fiber || 0) * 0.05; // +0.05ч на грамм клетчатки
    satietyHours -= (food.gi - 50) * 0.01; // -0.01ч за каждый пункт GI выше 50
    satietyHours = Math.max(1, Math.min(6, satietyHours));

    return {
      food,
      wave: {
        minutes: newWaveMinutes,
        hours: Math.round(newWaveMinutes / 60 * 10) / 10,
        endTime: newWaveEndStr,
        impact: waveImpact,
        compare: waveCompare,
        multiplier: waveMultiplier,
        gl
      },
      risk: {
        before: currentRisk || 0,
        after: newRisk,
        delta: riskDelta,
        reason: riskReason
      },
      calories: {
        add: food.kcal,
        newTotal: newDayKcal,
        ratio: Math.round(newRatio * 100),
        optimum
      },
      satiety: {
        hours: Math.round(satietyHours * 10) / 10,
        desc: satietyHours >= 4 ? 'Долгая сытость' : satietyHours >= 2.5 ? 'Средняя сытость' : 'Быстро захочется есть'
      },
      advice: advice.sort((a, b) => a.priority - b.priority),
      verdict: newRatio <= 1.1 && riskDelta <= 0 ? 'good' : newRatio <= 1.2 && riskDelta <= 10 ? 'neutral' : 'bad'
    };
  }

  // === DEBUG HELPERS ===

  window.debugWeeklyWrap = () => {
    if (!HEYS.PredictiveInsights?.analyze) {
      console.error('❌ HEYS.PredictiveInsights.analyze not loaded');
      return null;
    }

    const lsGet = U.lsGet || ((k, d) => {
      try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; }
    });
    const analysis = HEYS.PredictiveInsights.analyze({ daysBack: 14, lsGet });
    return analysis?.weeklyWrap || null;
  };

  window.debugABTest = () => {
    if (!HEYS.Metabolic?.getABStats) {
      console.error('❌ HEYS.Metabolic.getABStats not loaded');
      return null;
    }

    const stats = HEYS.Metabolic.getABStats();
    const variant = HEYS.Metabolic.getABVariant();
    const weights = HEYS.Metabolic.getABWeights();

    console.group('📊 A/B Test Results');
    // console.log('🎯 Current Variant:', variant.id, '-', variant.name);
    // console.log('⚖️ Weights:', weights);
    // console.log('📈 Stats:', stats);

    if (Object.keys(stats.variantStats).length > 0) {
      console.table(stats.variantStats);
      // console.log('🏆 Best Variant (by F1):', stats.bestVariant);
    } else {
      // console.log('⏳ Not enough data yet');
    }
    console.groupEnd();

    return { variant, weights, stats };
  };

  // === EXPORT HEYS.PredictiveInsights ===
  // Собираем все публичные функции и компоненты из модулей InsightsPI.* для обратной совместимости
  // ВАЖНО: Используем геттеры для ленивой загрузки (UI модули могут загружаться с задержкой из-за React CDN)

  HEYS.PredictiveInsights = HEYS.PredictiveInsights || {};

  // === Экспорт основных функций ===
  // analyze() — главная точка входа для анализа данных
  HEYS.PredictiveInsights.analyze = analyze;

  // clearCache() — очистка кэша анализа
  HEYS.PredictiveInsights.clearCache = function () {
    _cache = {};
    // console.log('[PI] Cache cleared');
  };

  // getDaysData() — получение данных дней
  HEYS.PredictiveInsights.getDaysData = getDaysData;

  // Паттерн-анализаторы (делегируем в HEYS.InsightsPI.patterns если есть)
  HEYS.PredictiveInsights.analyzeMealTiming = analyzeMealTiming;
  HEYS.PredictiveInsights.analyzeWaveOverlap = analyzeWaveOverlap;
  HEYS.PredictiveInsights.analyzeLateEating = analyzeLateEating;
  HEYS.PredictiveInsights.analyzeMealQualityTrend = analyzeMealQualityTrend;
  HEYS.PredictiveInsights.analyzeSleepWeight = analyzeSleepWeight;
  HEYS.PredictiveInsights.analyzeSleepHunger = analyzeSleepHunger;
  HEYS.PredictiveInsights.analyzeTrainingKcal = analyzeTrainingKcal;
  HEYS.PredictiveInsights.analyzeStepsWeight = analyzeStepsWeight;
  HEYS.PredictiveInsights.analyzeProteinSatiety = analyzeProteinSatiety;
  HEYS.PredictiveInsights.analyzeFiberRegularity = analyzeFiberRegularity;
  HEYS.PredictiveInsights.analyzeStressEating = analyzeStressEating;
  HEYS.PredictiveInsights.analyzeMoodFood = analyzeMoodFood;
  HEYS.PredictiveInsights.analyzeCircadianTiming = analyzeCircadianTiming;
  HEYS.PredictiveInsights.analyzeNutrientTiming = analyzeNutrientTiming;
  HEYS.PredictiveInsights.analyzeInsulinSensitivity = analyzeInsulinSensitivity;
  HEYS.PredictiveInsights.analyzeGutHealth = analyzeGutHealth;

  // Продвинутые функции
  HEYS.PredictiveInsights.calculateHealthScore = calculateHealthScore;
  HEYS.PredictiveInsights.generateWhatIfScenarios = generateWhatIfScenarios;
  HEYS.PredictiveInsights.predictWeight = predictWeight;
  HEYS.PredictiveInsights.generateWeeklyWrap = generateWeeklyWrap;

  // Статистические утилиты
  HEYS.PredictiveInsights.pearsonCorrelation = pearsonCorrelation;
  HEYS.PredictiveInsights.calculateTrend = calculateTrend;
  HEYS.PredictiveInsights.average = average;
  HEYS.PredictiveInsights.stdDev = stdDev;

  // Константы и конфигурация
  HEYS.PredictiveInsights.VERSION = CONFIG.VERSION;
  HEYS.PredictiveInsights.CONFIG = CONFIG;
  HEYS.PredictiveInsights.PATTERNS = PATTERNS;
  HEYS.PredictiveInsights.PRIORITY_LEVELS = PRIORITY_LEVELS;
  HEYS.PredictiveInsights.CATEGORIES = CATEGORIES;
  HEYS.PredictiveInsights.ACTIONABILITY = ACTIONABILITY;
  HEYS.PredictiveInsights.SCIENCE_INFO = SCIENCE_INFO;

  // Хелперы для SCIENCE_INFO
  HEYS.PredictiveInsights.getMetricPriority = getMetricPriority;
  HEYS.PredictiveInsights.getAllMetricsByPriority = getAllMetricsByPriority;
  HEYS.PredictiveInsights.getMetricsByCategory = getMetricsByCategory;
  HEYS.PredictiveInsights.getMetricsByActionability = getMetricsByActionability;
  HEYS.PredictiveInsights.getCriticalMetrics = getCriticalMetrics;
  HEYS.PredictiveInsights.getPriorityStats = getPriorityStats;

  // What-If функции
  HEYS.PredictiveInsights.simulateFood = simulateFood;
  HEYS.PredictiveInsights.WHATIF_PRESETS = WHATIF_PRESETS;
  HEYS.PredictiveInsights.WHATIF_CATEGORIES = WHATIF_CATEGORIES;

  // Analytics API функции (из pi_analytics_api.js) - ленивые геттеры для load order
  const analyticsApiFunctions = [
    'calculateConfidenceScore', 'analyzeMetabolism', 'calculateCorrelationMatrix',
    'detectMetabolicPatterns', 'calculatePredictiveRisk', 'forecastEnergy',
    'calculateBayesianConfidence', 'calculateTimeLaggedCorrelations',
    'calculateGlycemicVariability', 'calculateAllostaticLoad',
    'detectEarlyWarningSignals', 'calculate2ProcessModel', 'analyticsAPI'
  ];

  analyticsApiFunctions.forEach(fnName => {
    Object.defineProperty(HEYS.PredictiveInsights, fnName, {
      get: function () {
        return HEYS.InsightsPI?.analyticsAPI?.[fnName] ||
          HEYS.InsightsPI?.[fnName] ||
          (typeof window !== 'undefined' && window[fnName]);
      },
      configurable: true,
      enumerable: true
    });
  });

  // console.log('[PI] ✅ HEYS.PredictiveInsights functions exported (analyze, patterns, advanced, stats, analyticsAPI)');

  // Ленивый геттер для components - собирает все UI модули в момент обращения
  Object.defineProperty(HEYS.PredictiveInsights, 'components', {
    get: function () {
      const uiDashboard = HEYS.InsightsPI?.uiDashboard || {};
      const uiCards = HEYS.InsightsPI?.uiCards || {};
      const uiRings = HEYS.InsightsPI?.uiRings || {};
      const uiWhatIf = HEYS.InsightsPI?.uiWhatIf || {};

      return {
        // Dashboard components (from pi_ui_dashboard.js)
        ...uiDashboard,
        // Cards components (from pi_ui_cards.js)  
        ...uiCards,
        // Rings components (from pi_ui_rings.js)
        ...uiRings,
        // What-If components (from pi_ui_whatif.js)
        ...uiWhatIf,
        // Direct exports for legacy compatibility
        InsightsTab: uiDashboard?.InsightsTab,
        PredictiveDashboard: uiDashboard?.PredictiveDashboard,
        WeeklyWrap: uiCards?.WeeklyWrap || uiDashboard?.WeeklyWrap,
        WeeklyWrapCard: uiCards?.WeeklyWrapCard || uiDashboard?.WeeklyWrapCard,
        simulateFood,
        WHATIF_PRESETS,
        WHATIF_CATEGORIES
      };
    },
    configurable: true,
    enumerable: true
  });

  // console.log('[PI] ✅ HEYS.PredictiveInsights.components getter configured (lazy loading)');

})(typeof window !== 'undefined' ? window : global);
