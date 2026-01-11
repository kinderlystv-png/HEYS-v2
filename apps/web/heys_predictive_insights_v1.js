// heys_predictive_insights_v1.js — Predictive Insights Module v3.0.0
// Анализ данных за 7-30 дней, корреляции, паттерны, прогнозы
// v2.2.0: What-If Simulator — интерактивный симулятор еды
// v2.2.1: Refactored - constants extracted to insights/pi_constants.js
// v3.0.0: Major refactoring - extracted Layer B modules (stats, science, patterns, advanced)
//         Main file reduced from 10,206 to ~7,800 lines (-23%)
// Зависимости: HEYS.InsulinWave, HEYS.Cycle, HEYS.ratioZones, HEYS.models, U.lsGet
//              HEYS.InsightsPI.* (pi_constants, pi_math, pi_stats, pi_science_info, pi_patterns, pi_advanced)
(function(global) {
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
  
  const CONFIG = piConst.CONFIG || {
    DEFAULT_DAYS: 14,
    MIN_DAYS_FOR_INSIGHTS: 3,
    MIN_DAYS_FOR_FULL_ANALYSIS: 7,
    MIN_CORRELATION_DISPLAY: 0.35,
    CACHE_TTL_MS: 5 * 60 * 1000,
    VERSION: '3.0.0'
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
  const getSortedSections = piConst.getSortedSections || function(filterPriority = null) {
    let sections = Object.values(SECTIONS_CONFIG);
    if (filterPriority) sections = sections.filter(s => s.priority === filterPriority);
    return sections.sort((a, b) => a.order - b.order);
  };

  /**
   * Получить приоритет секции (используем из pi_constants если есть)
   */
  const getSectionPriority = piConst.getSectionPriority || function(sectionId) {
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
    clientId: null
  };

  // === УТИЛИТЫ ===
  
  // Статистические функции делегируем в pi_stats.js
  const average = piStats.average || function(arr) {
    if (!arr || arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  };
  
  const stdDev = piStats.stdDev || function(arr) {
    if (!arr || arr.length < 2) return 0;
    const avg = average(arr);
    const squareDiffs = arr.map(v => Math.pow(v - avg, 2));
    return Math.sqrt(average(squareDiffs));
  };
  
  const pearsonCorrelation = piStats.pearsonCorrelation || function(x, y) {
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
  
  const calculateTrend = piStats.calculateTrend || function(values) {
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
  
  const calculateLinearRegression = piStats.calculateLinearRegression || function(points) {
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
  const calculateItemKcal = piCalculations.calculateItemKcal || function(item, pIndex) {
    if (!item || !item.grams) return 0;
    const prod = pIndex?.byId?.get?.(String(item.product_id || item.id)?.toLowerCase());
    if (!prod) return 0;
    const p = prod.protein100 || 0;
    const c = (prod.simple100 || 0) + (prod.complex100 || 0);
    const f = (prod.badFat100 || 0) + (prod.goodFat100 || 0) + (prod.trans100 || 0);
    return (p * 4 + c * 4 + f * 9) * item.grams / 100;
  };
  
  const calculateDayKcal = piCalculations.calculateDayKcal || function(day, pIndex) {
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
  
  const calculateBMR = piCalculations.calculateBMR || function(profile) {
    if (HEYS.TDEE?.calcBMR) return HEYS.TDEE.calcBMR(profile);
    const weight = profile?.weight || 70;
    const height = profile?.height || 170;
    const age = profile?.age || 30;
    const isMale = profile?.gender !== 'Женский';
    return isMale ? (10 * weight + 6.25 * height - 5 * age + 5) : (10 * weight + 6.25 * height - 5 * age - 161);
  };

  const getDaysData = piCalculations.getDaysData || function(daysBack, lsGet) {
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
  const HealthRing = piUIRings.HealthRing || function() { return h('div', {}, 'HealthRing not loaded'); };
  const TotalHealthRing = piUIRings.TotalHealthRing || function() { return h('div', {}, 'TotalHealthRing not loaded'); };
  const StatusProgressRing = piUIRings.StatusProgressRing || function() { return h('div', {}, 'StatusProgressRing not loaded'); };
  const MiniRiskMeter = piUIRings.MiniRiskMeter || function() { return h('div', {}, 'MiniRiskMeter not loaded'); };
  const MetabolicStateRing = piUIRings.MetabolicStateRing || function() { return h('div', {}, 'MetabolicStateRing not loaded'); };
  
  // Card Components
  const CollapsibleSection = piUICards.CollapsibleSection || function() { return h('div', {}, 'CollapsibleSection not loaded'); };
  const AdvancedAnalyticsCard = piUICards.AdvancedAnalyticsCard || function() { return h('div', {}, 'AdvancedAnalyticsCard not loaded'); };
  const MetabolismCard = piUICards.MetabolismCard || function() { return h('div', {}, 'MetabolismCard not loaded'); };
  const MetabolismSection = piUICards.MetabolismSection || function() { return h('div', {}, 'MetabolismSection not loaded'); };
  const PatternCard = piUICards.PatternCard || function() { return h('div', {}, 'PatternCard not loaded'); };
  const PatternsList = piUICards.PatternsList || function() { return h('div', {}, 'PatternsList not loaded'); };
  const WeeklyWrap = piUICards.WeeklyWrap || function() { return h('div', {}, 'WeeklyWrap not loaded'); };
  const EmptyState = piUICards.EmptyState || function() { return h('div', {}, 'EmptyState not loaded'); };
  const InsightsCard = piUICards.InsightsCard || function() { return h('div', {}, 'InsightsCard not loaded'); };
  const InfoButton = piUICards.InfoButton || function() { return h('button', {}, 'ℹ️'); };
  const MetricWithInfo = piUICards.MetricWithInfo || function() { return h('div', {}, 'Metric'); };
  const MetabolicStatusCard = piUICards.MetabolicStatusCard || function() { return h('div', {}, 'Status'); };
  const ReasonCard = piUICards.ReasonCard || function() { return h('div', {}, 'Reason'); };
  const ActionCard = piUICards.ActionCard || function() { return h('div', {}, 'Action'); };
  
  // What-If Components
  const WhatIfSimulator = piUIWhatIf.WhatIfSimulator || function() { return h('div', {}, 'WhatIfSimulator not loaded'); };
  const WhatIfCard = piUIWhatIf.WhatIfCard || function() { return h('div', {}, 'WhatIfCard not loaded'); };
  const ScenarioCard = piUIWhatIf.ScenarioCard || function() { return h('div', {}, 'ScenarioCard not loaded'); };
  const WhatIfSection = piUIWhatIf.WhatIfSection || function() { return h('div', {}, 'WhatIfSection not loaded'); };
  
  // Dashboard Components
  const WeightPrediction = piUIDashboard.WeightPrediction || function() { return h('div', {}, 'WeightPrediction not loaded'); };
  const PriorityFilterBar = piUIDashboard.PriorityFilterBar || function() { return h('div', {}, 'PriorityFilterBar not loaded'); };
  const PillarBreakdownBars = piUIDashboard.PillarBreakdownBars || function() { return h('div', {}, 'PillarBreakdownBars not loaded'); };
  const DualRiskPanel = piUIDashboard.DualRiskPanel || function() { return h('div', {}, 'DualRiskPanel not loaded'); };
  const RiskPanel = piUIDashboard.RiskPanel || function() { return h('div', {}, 'RiskPanel not loaded'); };
  const RiskMeter = piUIDashboard.RiskMeter || function() { return h('div', {}, 'RiskMeter not loaded'); };
  const ForecastPanel = piUIDashboard.ForecastPanel || function() { return h('div', {}, 'ForecastPanel not loaded'); };
  const FeedbackPrompt = piUIDashboard.FeedbackPrompt || function() { return h('div', {}, 'FeedbackPrompt not loaded'); };
  const AccuracyBadge = piUIDashboard.AccuracyBadge || function() { return h('span', {}, 'Accuracy'); };
  const PredictiveDashboardLegacy = piUIDashboard.PredictiveDashboardLegacy || function() { return h('div', {}, 'Dashboard not loaded'); };
  const DataCompletenessCard = piUIDashboard.DataCompletenessCard || function() { return h('div', {}, 'DataCompletenessCard not loaded'); };
  const MealTimingCard = piUIDashboard.MealTimingCard || function() { return h('div', {}, 'MealTimingCard not loaded'); };

  // === АНАЛИЗ ПАТТЕРНОВ ===
  // Делегируем в pi_patterns.js
  const analyzeMealTiming = piPatterns.analyzeMealTiming || function() { return { pattern: 'meal_timing', available: false }; };
  const analyzeWaveOverlap = piPatterns.analyzeWaveOverlap || function() { return { pattern: 'wave_overlap', available: false }; };
  const analyzeLateEating = piPatterns.analyzeLateEating || function() { return { pattern: 'late_eating', available: false }; };
  const analyzeMealQualityTrend = piPatterns.analyzeMealQualityTrend || function() { return { pattern: 'meal_quality', available: false }; };
  const analyzeSleepWeight = piPatterns.analyzeSleepWeight || function() { return { pattern: 'sleep_weight', available: false }; };
  const analyzeSleepHunger = piPatterns.analyzeSleepHunger || function() { return { pattern: 'sleep_hunger', available: false }; };
  const analyzeTrainingKcal = piPatterns.analyzeTrainingKcal || function() { return { pattern: 'training_kcal', available: false }; };
  const analyzeStepsWeight = piPatterns.analyzeStepsWeight || function() { return { pattern: 'steps_weight', available: false }; };
  const analyzeProteinSatiety = piPatterns.analyzeProteinSatiety || function() { return { pattern: 'protein_satiety', available: false }; };
  const analyzeFiberRegularity = piPatterns.analyzeFiberRegularity || function() { return { pattern: 'fiber_regularity', available: false }; };
  const analyzeStressEating = piPatterns.analyzeStressEating || function() { return { pattern: 'stress_eating', available: false }; };
  const analyzeMoodFood = piPatterns.analyzeMoodFood || function() { return { pattern: 'mood_food', available: false }; };
  const analyzeCircadianTiming = piPatterns.analyzeCircadianTiming || function() { return { pattern: 'circadian', available: false }; };
  const analyzeNutrientTiming = piPatterns.analyzeNutrientTiming || function() { return { pattern: 'nutrient_timing', available: false }; };
  const analyzeInsulinSensitivity = piPatterns.analyzeInsulinSensitivity || function() { return { pattern: 'insulin_sensitivity', available: false }; };
  const analyzeGutHealth = piPatterns.analyzeGutHealth || function() { return { pattern: 'gut_health', available: false }; };

  // === ПРОДВИНУТАЯ АНАЛИТИКА ===
  // Делегируем в pi_advanced.js
  const calculateHealthScore = piAdvanced.calculateHealthScore || function(patterns, profile) {
    return { total: 0, categories: {}, available: false };
  };
  
  const generateWhatIfScenarios = piAdvanced.generateWhatIfScenarios || function(patterns, healthScore, days, profile) {
    return [];
  };
  
  const predictWeight = piAdvanced.predictWeight || function(days, profile) {
    return { available: false };
  };
  
  const generateWeeklyWrap = piAdvanced.generateWeeklyWrap || function(days, patterns, healthScore, weightPrediction) {
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
      pIndex = null,
      optimum = 2000
    } = options;
    
    // Проверяем кэш
    const clientId = lsGet('heys_client_current', 'default');
    const now = Date.now();
    
    if (_cache.data && 
        _cache.clientId === clientId && 
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
      analyzeProteinSatiety(days, profile, pIndex),     // v2.0: добавлен pIndex
      analyzeFiberRegularity(days, pIndex),              // v2.0: добавлен pIndex
      analyzeMoodFood(days, pIndex, optimum),
      
      // === Сон и корреляции ===
      analyzeSleepWeight(days),
      analyzeSleepHunger(days, profile, pIndex),         // v2.0: добавлен pIndex
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
                h(InfoButton, { infoKey: cat.infoKey, size: 'small' })
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

  /**
   * Pattern Card — карточка одного паттерна (v2.0: с InfoButton)
   */
    if (!scenario) return null;
    
    const diff = scenario.projectedScore - scenario.currentScore;
    const arrowClass = diff > 0 ? 'up' : diff < 0 ? 'down' : 'stable';
    const arrow = diff > 0 ? '↑' : diff < 0 ? '↓' : '→';
    
    return h('div', { className: `insights-scenario insights-scenario--${scenario.id}` },
      h('div', { className: 'insights-scenario__icon' }, scenario.icon),
      h('div', { className: 'insights-scenario__content' },
        h('div', { className: 'insights-scenario__name' }, scenario.name),
        h('div', { className: 'insights-scenario__desc' }, scenario.description)
      ),
      h('div', { className: `insights-scenario__arrow insights-scenario__arrow--${arrowClass}` },
        scenario.currentScore, ' ', arrow, ' ', scenario.projectedScore
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
  
  /**
   * WhatIfSimulator — главный компонент симулятора
   * @param {Object} props - { context, onClose }
   */
  function WhatIfSimulator({ context, onClose, expanded = false }) {
    const [selectedPreset, setSelectedPreset] = React.useState(null);
    const [customFood, setCustomFood] = React.useState(null);
    const [simulation, setSimulation] = React.useState(null);
    const [activeCategory, setActiveCategory] = React.useState('fast');
    const [isCustomMode, setIsCustomMode] = React.useState(false);
    const [customValues, setCustomValues] = React.useState({ kcal: 300, prot: 15, carbs: 30, fat: 10, gi: 50, name: '' });
    
    // Симуляция при выборе preset
    React.useEffect(() => {
      if (selectedPreset && context) {
        const result = simulateFood(selectedPreset, context);
        setSimulation(result);
      }
    }, [selectedPreset, context]);
    
    // Симуляция кастомной еды
    React.useEffect(() => {
      if (isCustomMode && customValues.kcal > 0 && context) {
        const food = {
          ...customValues,
          id: 'custom',
          emoji: '🍽️',
          category: 'custom'
        };
        const result = simulateFood(food, context);
        setSimulation(result);
      }
      };
      
      // Слушаем storage event (work inside same tab thanks to dispatch in InsightsTour)
      window.addEventListener('storage', handleStorageChange);
      
      return () => {
        window.removeEventListener('storage', handleStorageChange);
      };
    }, [insightsTourCompleted]);
    
    // Анализ данных
    const realInsights = useMemo(() => {
      return HEYS.PredictiveInsights.analyze({
        lsGet: lsGet || (window.HEYS?.utils?.lsGet),
        daysBack: activeTab === 'today' ? 7 : 30
      });
    }, [lsGet, activeTab, selectedDate]);
    
    // 🎭 Используем демо-данные если тур не пройден И реальных данных нет
    const showDemoMode = !insightsTourCompleted && !realInsights.available;
    const insights = showDemoMode ? DEMO_INSIGHTS : realInsights;
    
    // 🆕 Расчёт статуса 0-100 (или демо)
    const status = useMemo(() => {
      if (showDemoMode) return DEMO_STATUS;
      if (!HEYS.Status?.calculateStatus) return null;
      return HEYS.Status.calculateStatus({
        dayData: dayData || {},
        profile: profile || {},
        dayTot: dayTot || {},
        normAbs: normAbs || {},
        waterGoal: waterGoal || 2000
      });
    }, [dayData, profile, dayTot, normAbs, waterGoal, showDemoMode]);
    
    // Получить все метрики для фильтров
    const allMetrics = useMemo(() => getAllMetricsByPriority(), []);
    
    // 🎯 Автозапуск мини-тура при первом посещении Insights
    useEffect(() => {
      // Даём время на рендер секций перед запуском тура
      const timer = setTimeout(() => {
        if (HEYS.InsightsTour?.shouldShow?.() && HEYS.InsightsTour.start) {
          HEYS.InsightsTour.start();
        }
      }, 800);
      return () => clearTimeout(timer);
    }, []); // Только при первом монтировании
    
    // EmptyState если мало данных И тур уже пройден
    if (!insights.available && insightsTourCompleted) {
      return h('div', { className: 'insights-tab' },
        h('div', { className: 'insights-tab__hero' },
          h('div', { className: 'insights-tab__header' },
            h('h2', { className: 'insights-tab__title' }, '🔮 Умная аналитика')
          )
        ),
        h('div', { className: 'insights-tab__content' },
          h(EmptyState, { 
            daysAnalyzed: realInsights.daysAnalyzed || realInsights.daysWithData || 0,
            minRequired: realInsights.minDaysRequired || 3
          })
        )
      );
    }
    
    // Определяем какие секции показывать на основе фильтров
    const shouldShowSection = (sectionPriority) => {
      if (!priorityFilter) return true;
      return sectionPriority === priorityFilter;
    };
    
    return h('div', { className: 'insights-tab' },
      // === HERO HEADER ===
      h('div', { className: 'insights-tab__hero' },
        h('div', { className: 'insights-tab__header' },
          h('h2', { className: 'insights-tab__title' }, '🔮 Умная аналитика'),
          h('div', { className: 'insights-tab__subtitle' },
            activeTab === 'today' 
              ? 'Анализ за 7 дней' 
              : 'Глубокий анализ за 30 дней'
          )
        ),
        
        // Glass Tabs внутри hero
        h('div', { className: 'insights-tab__tabs' },
          h('button', {
            className: 'insights-tab__tab' + (activeTab === 'today' ? ' active' : ''),
            onClick: () => setActiveTab('today')
          }, '📅 Сегодня'),
          h('button', {
            className: 'insights-tab__tab' + (activeTab === 'week' ? ' active' : ''),
            onClick: () => setActiveTab('week')
          }, '📊 Неделя')
        ),
        
        // 🎯 Demo Mode Banner — показываем только в демо режиме
        showDemoMode && h('div', { 
          className: 'insights-tab__demo-banner',
          style: {
            background: 'linear-gradient(135deg, rgba(138, 43, 226, 0.15), rgba(75, 0, 130, 0.1))',
            border: '1px solid rgba(138, 43, 226, 0.3)',
            borderRadius: '12px',
            padding: '12px 16px',
            marginBottom: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '13px',
            color: 'var(--color-text-secondary)'
          }
        },
          h('span', { style: { fontSize: '20px' } }, '✨'),
          h('div', null,
            h('div', { style: { fontWeight: '600', color: 'var(--color-text-primary)', marginBottom: '2px' } }, 
              'Демо-режим аналитики'
            ),
            h('div', null, 'Это пример данных. После 3 дней использования появится ваша реальная статистика')
          )
        ),
        
        // Priority Filter (compact)
        h('div', { className: 'insights-tab__filters' },
          h('button', {
            className: `insights-tab__filter-btn ${!priorityFilter ? 'active' : ''}`,
            onClick: () => setPriorityFilter(null)
          }, '🎯 Всё'),
          h('button', {
            className: `insights-tab__filter-btn ${priorityFilter === 'CRITICAL' ? 'active' : ''}`,
            onClick: () => setPriorityFilter(priorityFilter === 'CRITICAL' ? null : 'CRITICAL'),
            style: { '--filter-color': PRIORITY_LEVELS.CRITICAL.color }
          }, '🔴 Важное'),
          h('button', {
            className: `insights-tab__filter-btn ${priorityFilter === 'HIGH' ? 'active' : ''}`,
            onClick: () => setPriorityFilter(priorityFilter === 'HIGH' ? null : 'HIGH'),
            style: { '--filter-color': PRIORITY_LEVELS.HIGH.color }
          }, '🟠 Полезное')
        )
      ),
      
      // === MAIN CONTENT (отсортировано по приоритету) ===
      h('div', { className: 'insights-tab__content' },
        
        // ═══════════════════════════════════════════════════════════
        // 🔴 КРИТИЧЕСКИЙ ПРИОРИТЕТ — Самое важное сверху
        // ═══════════════════════════════════════════════════════════
        
        // L0: Status 0-100 Card (CRITICAL — показывается всегда)
        shouldShowSection('CRITICAL') && h('div', { 
          className: 'insights-tab__section insights-tab__section--critical',
          id: 'tour-insights-status' // 🎯 Mini-tour target
        },
          h('div', { className: 'insights-tab__section-badge' },
            h(PriorityBadge, { priority: 'CRITICAL', showLabel: true })
          ),
          
          // 🆕 StatusCard вместо TotalHealthRing + HealthRingsGrid
          status && HEYS.Status?.StatusCard 
            ? h(HEYS.Status.StatusCard, { status })
            : h('div', { className: 'insights-tab__score-card' },
                h('div', { className: 'insights-tab__score' },
                  h(TotalHealthRing, {
                    score: insights.healthScore.total,
                    size: 140,
                    strokeWidth: 12,
                    debugData: insights.healthScore.debug || {
                      mode: insights.healthScore.mode,
                      weights: insights.healthScore.weights,
                      breakdown: insights.healthScore.breakdown
                    }
                  })
                ),
                h('div', { className: 'insights-tab__rings' },
                  h(HealthRingsGrid, {
                    healthScore: insights.healthScore,
                    onCategoryClick: setSelectedCategory,
                    compact: true
                  })
                )
              )
        ),
        
        // Metabolic Status + Risk (CRITICAL) — собственный заголовок внутри
        shouldShowSection('CRITICAL') && h('div', { 
          className: 'insights-tab__section insights-tab__section--critical insights-tab__section--no-header',
          id: 'tour-insights-metabolic' // 🎯 Mini-tour target
        },
          h(MetabolicQuickStatus, {
            lsGet,
            profile,
            pIndex,
            selectedDate
          })
        ),
        
        // Divider между критическими и важными
        shouldShowSection('CRITICAL') && h('div', { className: 'insights-tab__divider insights-tab__divider--priority' },
          h('span', null, '↓ Важные инсайты ↓')
        ),
        
        // ═══════════════════════════════════════════════════════════
        // 🟠 ВЫСОКИЙ ПРИОРИТЕТ — Важно для результата
        // ═══════════════════════════════════════════════════════════
        
        // Predictive Dashboard (HIGH) — собственный заголовок внутри
        shouldShowSection('HIGH') && h('div', { 
          className: 'insights-tab__section insights-tab__section--high insights-tab__section--no-header',
          id: 'tour-insights-prediction' // 🎯 Mini-tour target
        },
          h(PredictiveDashboard, {
            lsGet,
            profile,
            selectedDate
          })
        ),
        
        // Phenotype Card (HIGH) — отдельная expandable карточка
        // В демо-режиме показываем placeholder если компонент ещё не загружен
        shouldShowSection('HIGH') && h('div', { 
          className: 'insights-tab__section insights-tab__section--high insights-tab__section--no-header',
          id: 'tour-insights-phenotype' // 🎯 Mini-tour target
        },
          HEYS.Phenotype?.PhenotypeExpandableCard
            ? h(HEYS.Phenotype.PhenotypeExpandableCard, { profile })
            : showDemoMode && h('div', { 
                className: 'insights-card',
                style: { 
                  background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1), rgba(109, 40, 217, 0.05))',
                  border: '1px solid rgba(139, 92, 246, 0.2)',
                  borderRadius: '16px',
                  padding: '16px',
                  minHeight: '120px'
                }
              },
                h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' } },
                  h('span', { style: { fontSize: '20px' } }, '🧬'),
                  h('span', { style: { fontWeight: '600', color: 'var(--color-text-primary)' } }, 'Метаболический фенотип')
                ),
                h('div', { style: { fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: '1.5' } },
                  'После анализа ваших данных за 7+ дней система определит ваш метаболический тип и даст персональные рекомендации.'
                )
              )
        ),
        
        // Advanced Analytics (HIGH) — собственный заголовок внутри
        shouldShowSection('HIGH') && h('div', { 
          className: 'insights-tab__section insights-tab__section--high insights-tab__section--no-header',
          id: 'tour-insights-analytics' // 🎯 Mini-tour target
        },
          h(AdvancedAnalyticsCard, {
            lsGet,
            profile,
            pIndex,
            selectedDate
          })
        ),
        
        // Metabolism Section (HIGH) — собственный заголовок внутри
        shouldShowSection('HIGH') && h('div', { 
          className: 'insights-tab__section insights-tab__section--high insights-tab__section--no-header',
          id: 'tour-insights-metabolism' // 🎯 Mini-tour target
        },
          h(MetabolismSection, {
            lsGet,
            profile,
            pIndex,
            selectedDate
          })
        ),
        
        // Meal Timing (HIGH) — собственный заголовок внутри
        shouldShowSection('HIGH') && h('div', { 
          className: 'insights-tab__section insights-tab__section--high insights-tab__section--no-header',
          id: 'tour-insights-timing' // 🎯 Mini-tour target
        },
          h(MealTimingCard, {
            lsGet,
            profile,
            pIndex,
            selectedDate
          })
        ),
        
        // Divider между важными и средними
        (shouldShowSection('HIGH') || shouldShowSection('CRITICAL')) && shouldShowSection('MEDIUM') && 
          h('div', { className: 'insights-tab__divider insights-tab__divider--priority' },
            h('span', null, '↓ Дополнительно ↓')
          ),
        
        // ═══════════════════════════════════════════════════════════
        // 🟡 СРЕДНИЙ ПРИОРИТЕТ — Полезный контекст
        // ═══════════════════════════════════════════════════════════
        
        // What-If (MEDIUM)
        shouldShowSection('MEDIUM') && h(CollapsibleSection, {
          title: 'Что если...',
          icon: '🎯',
          badge: insights.whatIf?.length > 0 ? `${insights.whatIf.length} сценариев` : null,
          defaultOpen: true,
          infoKey: 'WHATIF',
          priority: 'MEDIUM'
        },
          h(WhatIfSection, { scenarios: insights.whatIf })
        ),
        
        // Patterns (MEDIUM)
        shouldShowSection('MEDIUM') && insights.patterns?.length > 0 && h(CollapsibleSection, {
          title: 'Паттерны',
          icon: '🔍',
          badge: `${insights.patterns.filter(p => p.available).length} найдено`,
          defaultOpen: false,
          infoKey: 'PATTERNS',
          priority: 'MEDIUM'
        },
          h(PatternsList, { patterns: insights.patterns })
        ),
        
        // Weight Prediction (MEDIUM)
        shouldShowSection('MEDIUM') && insights.weightPrediction && h(CollapsibleSection, {
          title: 'Прогноз веса',
          icon: '⚖️',
          badge: insights.weightPrediction.weeklyChange ? 
            `${insights.weightPrediction.weeklyChange > 0 ? '+' : ''}${insights.weightPrediction.weeklyChange.toFixed(1)} кг/нед` : null,
          defaultOpen: false,
          infoKey: 'WEIGHT_PREDICTION',
          priority: 'MEDIUM'
        },
          h(WeightPrediction, { prediction: insights.weightPrediction })
        ),
        
        // ═══════════════════════════════════════════════════════════
        // 🟢 НИЗКИЙ ПРИОРИТЕТ — Дополнительная информация
        // ═══════════════════════════════════════════════════════════
        
        // Weekly Wrap (LOW — только на вкладке "Неделя")
        shouldShowSection('LOW') && activeTab === 'week' && insights.weeklyWrap && h(CollapsibleSection, {
          title: 'Итоги недели',
          icon: '📋',
          defaultOpen: true,
          infoKey: 'WEEKLY_WRAP',
          priority: 'LOW'
        },
          h(WeeklyWrap, { wrap: insights.weeklyWrap })
        ),
        
        // Data Completeness (LOW)
        shouldShowSection('LOW') && h('div', { className: 'insights-tab__section insights-tab__section--low' },
          h(SectionHeader, {
            title: 'Полнота данных',
            icon: '📊',
            priority: 'LOW',
            infoKey: 'CONFIDENCE'
          }),
          h(DataCompletenessCard, {
            lsGet,
            selectedDate
          })
        ),
        
        // ═══════════════════════════════════════════════════════════
        // 🔵 FOOTER — Информационные метрики
        // ═══════════════════════════════════════════════════════════
        
        // Footer: Confidence
        h('div', { className: 'insights-tab__confidence' },
          h('span', { className: 'insights-tab__confidence-icon' }, '📊'),
          h('span', { className: 'insights-tab__confidence-text' },
            `Уверенность: ${insights.confidence || 50}% (${insights.daysWithData || 0} дней данных)`
          ),
          h(InfoButton, {
            infoKey: 'CONFIDENCE',
            debugData: {
              confidence: insights.confidence,
              daysWithData: insights.daysWithData,
              daysAnalyzed: insights.daysAnalyzed
            }
          })
        )
        
      ) // закрытие insights-tab__content
    );
  }

  // === INFO BUTTON — Кнопка ? с объяснением формулы ===
  
  /**
   * InfoButton — маленькая кнопка (?) рядом с метрикой
   * @param {string} infoKey — ключ из SCIENCE_INFO
   * @param {Object} debugData — дополнительные данные для отладки (опционально)
   * @param {string} size — 'small' для маленькой кнопки (в кольцах)
   */
    if (prevScore === null || prevScore === undefined) return null;
    
    const diff = currentScore - prevScore;
    if (diff === 0) return null;
    
    const isUp = diff > 0;
    const absDiff = Math.abs(diff);
    
    return h('div', { 
      className: `status-trend-badge status-trend-badge--${isUp ? 'up' : 'down'}`
    },
      h('span', { className: 'status-trend-badge__arrow' }, isUp ? '↑' : '↓'),
      h('span', { className: 'status-trend-badge__value' }, absDiff),
      h('span', { className: 'status-trend-badge__label' }, 'vs вчера')
    );
  }
  
  /**
   * PillarBreakdownBars — breakdown по столпам (nutrition/timing/activity/recovery)
   */
  function PillarBreakdownBars({ pillars }) {
    if (!pillars || Object.keys(pillars).length === 0) return null;
    
    const pillarConfig = {
      nutrition: { label: 'Питание', icon: '🍽️', color: '#22c55e' },
      timing: { label: 'Тайминг', icon: '⏰', color: '#3b82f6' },
      activity: { label: 'Активность', icon: '🏃', color: '#f59e0b' },
      recovery: { label: 'Восстановление', icon: '😴', color: '#8b5cf6' }
    };
    
    return h('div', { className: 'pillar-breakdown-bars' },
      Object.entries(pillars).map(([key, value]) => {
        const config = pillarConfig[key] || { label: key, icon: '📊', color: '#64748b' };
        const pct = Math.min(100, Math.max(0, value));
        
        return h('div', { key, className: 'pillar-breakdown-bars__item' },
          h('div', { className: 'pillar-breakdown-bars__header' },
            h('span', { className: 'pillar-breakdown-bars__icon' }, config.icon),
            h('span', { className: 'pillar-breakdown-bars__label' }, config.label),
            h('span', { className: 'pillar-breakdown-bars__value' }, `${Math.round(pct)}%`)
          ),
          h('div', { className: 'pillar-breakdown-bars__track' },
            h('div', { 
              className: 'pillar-breakdown-bars__fill',
              style: { 
                width: `${pct}%`,
                backgroundColor: config.color
              }
          if (dData.meals?.length > 0) {
            const idx = pIndex || window.HEYS?.products?.buildIndex?.();
            let prot = 0, kcal = 0;
            (dData.meals || []).forEach(m => {
              (m.items || []).forEach(item => {
                const prod = idx?.byId?.get?.(item.product_id) || item;
                const g = item.grams || 0;
                prot += (prod.protein100 || 0) * g / 100;
                kcal += (prod.kcal100 || 0) * g / 100;
              });
            });
            if (kcal > 500) proteinDays.push({ prot, kcal, protPct: prot * 4 / kcal });
          }
        }
        if (proteinDays.length >= 2) {
          const avgPct = proteinDays.reduce((s, d) => s + d.protPct, 0) / proteinDays.length;
          proteinDebt.avgProteinPct = Math.round(avgPct * 100);
          if (avgPct < 0.18) {
            proteinDebt = { hasDebt: true, severity: 'critical', avgProteinPct: Math.round(avgPct * 100), pmid: '20095013' };
          } else if (avgPct < 0.21) {
            proteinDebt = { hasDebt: true, severity: 'moderate', avgProteinPct: Math.round(avgPct * 100), pmid: '20095013' };
    return h('div', { className: 'metabolic-quick-status' },
      // Header
      h('div', { className: 'metabolic-quick-status__title-header' },
        h('div', { className: 'metabolic-quick-status__title' },
          h('span', { className: 'metabolic-quick-status__title-icon' }, '⚠️'),
          h('span', null, 'Статус и риски'),
          h(InfoButton, { infoKey: 'CRASH_RISK' })
        )
      ),
      // Cards container
      h('div', { className: 'metabolic-quick-status__cards' },
        // Card 1: Status Score
        h('div', { className: 'metabolic-quick-status__card' },
          h('div', { className: 'metabolic-quick-status__header' },
            h('div', { className: 'metabolic-quick-status__score', style: { color: getScoreColor(status.score) } },
              status.score
            ),
            h(InfoButton, { infoKey: 'STATUS_SCORE', size: 'small' })
          ),
          h('div', { className: 'metabolic-quick-status__score-label' }, 'Метаболизм'),
          phase && h('div', { className: 'metabolic-quick-status__phase' },
            h('span', { className: 'metabolic-quick-status__phase-emoji' }, phase.emoji || '⚡'),
          h('span', { className: 'metabolic-quick-status__phase-text' }, phase.label || phase.phase)
        ),
        phase?.timeToLipolysis > 0 && h('div', { className: 'metabolic-quick-status__time' },
          `→ ${Math.round(phase.timeToLipolysis * 60)} мин`
        ),
        phase?.isLipolysis && h('div', { className: 'metabolic-quick-status__lipolysis' }, '🔥 Жиросжигание')
      ),
      
      // Card 2: Risk
      h('div', { className: `metabolic-quick-status__card metabolic-quick-status__card--${risk.level}` },
        h('div', { className: 'metabolic-quick-status__risk-header' },
          h('div', { className: 'metabolic-quick-status__risk-indicator' },
            h('div', { className: 'metabolic-quick-status__light metabolic-quick-status__light--green', 
              style: { opacity: risk.level === 'low' ? 1 : 0.2 } }),
            h('div', { className: 'metabolic-quick-status__light metabolic-quick-status__light--yellow', 
              style: { opacity: risk.level === 'medium' ? 1 : 0.2 } }),
            h('div', { className: 'metabolic-quick-status__light metabolic-quick-status__light--red', 
              style: { opacity: risk.level === 'high' ? 1 : 0.2 } })
          ),
          h(InfoButton, { infoKey: 'CRASH_RISK_QUICK', size: 'small' })
        ),
        h('div', { className: 'metabolic-quick-status__risk-label' },
          h('span', null, risk.emoji),
          'Риск срыва'
        ),
        h('div', { className: 'metabolic-quick-status__risk-level', style: { color: risk.color } },
          risk.label
        )
      )
      ), // Close __cards
      
      // 🆕 v3.22.0: Extended Analytics Row (proteinDebt, emotionalRisk, trainingContext)
      (extendedAnalytics?.proteinDebt?.hasDebt || extendedAnalytics?.emotionalRisk?.level !== 'low' || extendedAnalytics?.trainingContext?.isTrainingDay) && 
        h('div', { className: 'metabolic-quick-status__extended' },
          // Protein Debt Badge
          extendedAnalytics?.proteinDebt?.hasDebt && h('div', { 
            className: `metabolic-quick-status__badge metabolic-quick-status__badge--${extendedAnalytics.proteinDebt.severity}`,
            title: `Средний белок за 3 дня: ${extendedAnalytics.proteinDebt.avgProteinPct}% (норма 25%)\n🔬 PMID: ${extendedAnalytics.proteinDebt.pmid}`
          },
            h('span', { className: 'metabolic-quick-status__badge-icon' }, '🥩'),
            h('span', { className: 'metabolic-quick-status__badge-text' }, 
              extendedAnalytics.proteinDebt.severity === 'critical' ? 'Белок ↓↓' : 'Белок ↓'
            ),
            h('a', { 
              href: `https://pubmed.ncbi.nlm.nih.gov/${extendedAnalytics.proteinDebt.pmid}/`,
              target: '_blank',
              className: 'metabolic-quick-status__pmid',
              onClick: (e) => e.stopPropagation()
            }, '?')
          ),
          
          // Emotional Risk Badge
          extendedAnalytics?.emotionalRisk?.level !== 'low' && h('div', { 
            className: `metabolic-quick-status__badge metabolic-quick-status__badge--${extendedAnalytics.emotionalRisk.level}`,
            title: `Риск срыва: ${extendedAnalytics.emotionalRisk.bingeRisk}%\nФакторы: ${extendedAnalytics.emotionalRisk.factors.join(', ')}\n🔬 PMID: ${extendedAnalytics.emotionalRisk.pmid}`
          },
            h('span', { className: 'metabolic-quick-status__badge-icon' }, '😰'),
            h('span', { className: 'metabolic-quick-status__badge-text' }, 
              `${extendedAnalytics.emotionalRisk.bingeRisk}%`
            ),
            h('a', { 
              href: `https://pubmed.ncbi.nlm.nih.gov/${extendedAnalytics.emotionalRisk.pmid}/`,
              target: '_blank',
              className: 'metabolic-quick-status__pmid',
              onClick: (e) => e.stopPropagation()
            }, '?')
          ),
          
          // Training Context Badge
          extendedAnalytics?.trainingContext?.isTrainingDay && h('div', { 
            className: `metabolic-quick-status__badge metabolic-quick-status__badge--training metabolic-quick-status__badge--${extendedAnalytics.trainingContext.intensity}`,
            title: `Тренировочный день: ${extendedAnalytics.trainingContext.type}\nИнтенсивность: ${extendedAnalytics.trainingContext.intensity}`
          },
            h('span', { className: 'metabolic-quick-status__badge-icon' }, 
              extendedAnalytics.trainingContext.type === 'strength' ? '💪' : 
              extendedAnalytics.trainingContext.type === 'cardio' ? '🏃' : '⚽'
            ),
            h('span', { className: 'metabolic-quick-status__badge-text' }, 
              extendedAnalytics.trainingContext.intensity === 'high' ? 'Интенсив' : 'Трени'
            )
          )
        )
    );
  }

  /**
   * MetabolicStatusCard — главная карточка метаболического статуса 0-100
   * v2.0: с ring animation, trend, breakdown bars, confidence badge
   */
    const [activeTab, setActiveTab] = useState('risk');
    const [dateOffset, setDateOffset] = useState(0); // -7..+7 дней — только для forecast
    
    // Базовая дата (сегодня)
    const todayDate = useMemo(() => {
      return selectedDate || new Date().toISOString().split('T')[0];
    }, [selectedDate]);
    
    // Завтра
    const tomorrowDate = useMemo(() => {
      const d = new Date(todayDate);
      d.setDate(d.getDate() + 1);
      return d.toISOString().split('T')[0];
    }, [todayDate]);
    
    // Дата для forecast (с offset)
    const forecastDate = useMemo(() => {
      const base = new Date(todayDate);
      base.setDate(base.getDate() + dateOffset);
      return base.toISOString().split('T')[0];
    }, [todayDate, dateOffset]);
    
    const isForecastToday = dateOffset === 0;
    const isForecastFuture = dateOffset > 0;
    const isForecastPast = dateOffset < 0;
    
    // Риск на сегодня
    const predictionToday = useMemo(() => {
      if (!HEYS.Metabolic?.calculateCrashRisk24h) return null;
      
      const history = HEYS.Metabolic.getDaysHistory ? HEYS.Metabolic.getDaysHistory(30) : [];
      
      return HEYS.Metabolic.calculateCrashRisk24h(
        todayDate,
        profile || window.HEYS?.utils?.lsGet?.('heys_profile', {}),
        history
      );
    }, [lsGet, profile, todayDate]);
    
    // Риск на завтра
    const predictionTomorrow = useMemo(() => {
      if (!HEYS.Metabolic?.calculateCrashRisk24h) return null;
      
      const history = HEYS.Metabolic.getDaysHistory ? HEYS.Metabolic.getDaysHistory(30) : [];
      
      return HEYS.Metabolic.calculateCrashRisk24h(
        tomorrowDate,
        profile || window.HEYS?.utils?.lsGet?.('heys_profile', {}),
        history
      );
    }, [lsGet, profile, tomorrowDate]);
    
    // Прогноз (с offset для timeline)
    const forecast = useMemo(() => {
      if (!HEYS.Metabolic?.calculatePerformanceForecast) return null;
      
      const history = HEYS.Metabolic.getDaysHistory ? HEYS.Metabolic.getDaysHistory(30) : [];
      
      return HEYS.Metabolic.calculatePerformanceForecast(
        forecastDate,
        profile || window.HEYS?.utils?.lsGet?.('heys_profile', {}),
        history
      );
    }, [lsGet, profile, forecastDate]);
    
    // Phenotype теперь вычисляется внутри HEYS.Phenotype.PhenotypeWidget
    
    const riskColors = {
      low: '#22c55e',
      medium: '#eab308',
      high: '#ef4444'
    };

    
    // Форматирование даты для timeline (только для forecast)
    const formatTimelineDate = (offset) => {
      const d = new Date(todayDate);
      d.setDate(d.getDate() + offset);
      const day = d.getDate();
      const weekday = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'][d.getDay()];
      if (offset === 0) return 'Сегодня';
      if (offset === 1) return 'Завтра';
      if (offset === -1) return 'Вчера';
      return `${weekday}`;
    };
    
    // Badge для риска — показываем максимальный риск (сегодня или завтра)
    const maxRisk = Math.max(predictionToday?.risk || 0, predictionTomorrow?.risk || 0);
    
    // Tabs — только Risk и Forecast (Phenotype теперь отдельная карточка)
    const tabs = [
      { id: 'risk', label: '🚨 Риск', badge: maxRisk > 30 ? maxRisk + '%' : null },
      { id: 'forecast', label: '🔮 Прогноз', badge: null }
    ];
    
    // Timeline показывается ТОЛЬКО для forecast
    const showTimeline = activeTab === 'forecast';
    
    return h('div', { className: 'predictive-dashboard predictive-dashboard--v2' },
      // Header с InfoButton
      h('div', { className: 'predictive-dashboard__header' },
        h('div', { className: 'predictive-dashboard__title' },
          h('span', { className: 'predictive-dashboard__title-icon' }, '🔮'),
          h('span', null, 'Прогнозы на сегодня'),
          h(InfoButton, { infoKey: 'PREDICTIVE_RISK' })
        )
      ),
      
      // Tabs
      h('div', { className: 'predictive-dashboard__tabs' },
        tabs.map(tab =>
          h('button', {
            key: tab.id,
            className: `predictive-dashboard__tab ${activeTab === tab.id ? 'predictive-dashboard__tab--active' : ''}`,
            onClick: () => setActiveTab(tab.id)
          },
            h('span', { className: 'predictive-dashboard__tab-label' }, tab.label),
            tab.badge && h('span', { className: 'predictive-dashboard__tab-badge' }, tab.badge)
          )
        )
      ),
      
      // Timeline Navigation — ТОЛЬКО для Forecast
      showTimeline && h('div', { className: 'predictive-dashboard__timeline' },
        h('button', { 
          className: 'predictive-dashboard__timeline-btn',
          disabled: dateOffset <= -7,
          onClick: () => setDateOffset(d => Math.max(-7, d - 1))
        }, '←'),
        h('div', { className: 'predictive-dashboard__timeline-dates' },
          [-3, -2, -1, 0, 1, 2, 3].map(offset =>
            h('button', {
              key: offset,
              className: `predictive-dashboard__timeline-date ${dateOffset === offset ? 'predictive-dashboard__timeline-date--active' : ''} ${offset === 0 ? 'predictive-dashboard__timeline-date--today' : ''}`,
              onClick: () => setDateOffset(offset)
            }, formatTimelineDate(offset))
          )
        ),
        h('button', { 
          className: 'predictive-dashboard__timeline-btn',
          disabled: dateOffset >= 7,
          onClick: () => setDateOffset(d => Math.min(7, d + 1))
        }, '→')
      ),
      
      // Tab Content
      h('div', { className: 'predictive-dashboard__content' },
        // RISK TAB — Dual meters (сегодня + завтра)
        activeTab === 'risk' && h('div', { className: 'predictive-dashboard__panel' },
          (predictionToday || predictionTomorrow) 
            ? h(DualRiskPanel, { 
                predictionToday, 
                predictionTomorrow, 
                riskColors 
              }) 
            : h('div', { className: 'predictive-dashboard__empty' }, 'Нет данных для анализа риска')
        ),
        
        // FORECAST TAB — с timeline
        activeTab === 'forecast' && h('div', { className: 'predictive-dashboard__panel' },
          forecast ? h(ForecastPanel, { forecast, isPast: isForecastPast }) :
            h('div', { className: 'predictive-dashboard__empty' }, 'Нет данных для прогноза')
        )
      )
    );
  }
  
  /**
   * DualRiskPanel — два полукруга рядом: Сегодня + Завтра
   * v3.0: Убрана навигация по дням, сразу видно оба риска
   * v3.22.0: Интеграция emotionalRisk в факторы (Epel 2001, PMID: 11070333)
   */
  function DualRiskPanel({ predictionToday, predictionTomorrow, riskColors }) {
    // Определяем какой риск выше для акцента
    const todayRisk = predictionToday?.risk || 0;
    const tomorrowRisk = predictionTomorrow?.risk || 0;
    const maxRisk = Math.max(todayRisk, tomorrowRisk);
    
    // Активный прогноз для деталей (показываем тот где риск выше, если оба есть)
    const [activePrediction, setActivePrediction] = useState(tomorrowRisk > todayRisk ? 'tomorrow' : 'today');
    
    // 🆕 v3.22.0: Extended Analytics для emotional risk
    const extendedAnalytics = useMemo(() => {
      const U = window.HEYS?.utils;
      const lsGet = U?.lsGet || ((k, d) => {
        try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; }
      });
      const profile = lsGet('heys_profile', {});
      const todayDate = new Date().toISOString().split('T')[0];
      const dayKey = `heys_dayv2_${todayDate}`;
      const day = lsGet(dayKey, {});
      
      // Emotional Risk (Epel 2001, PMID: 11070333)
      const stressAvg = day.stressAvg || 0;
      const factors = [];
      let bingeRisk = 0;
      
      if (stressAvg >= 6) {
        factors.push('Высокий стресс');
        bingeRisk += 35;
            )
          ),
          
          // Tab: Chart — v3.22.0: с training/stress overlay
          activeTab === 'chart' && h('div', { className: 'weekly-wrap-card__chart' },
            h('div', { className: 'weekly-wrap-card__chart-title' }, 'Score по дням'),
            h('div', { className: 'weekly-wrap-card__chart-bars' },
              dailyData.map(day => {
                // 🆕 v3.22.0: training/stress overlay
                const hasTraining = day.trainings?.length > 0 || day.hasTraining;
                const hasHighStress = day.stressAvg >= 6 || day.highStress;
                
                return h('div', { 
                  key: day.date,
                  className: `weekly-wrap-card__bar-container ${hasTraining ? 'weekly-wrap-card__bar-container--training' : ''} ${hasHighStress ? 'weekly-wrap-card__bar-container--stress' : ''}`
                },
                  // Training/Stress indicators
                  h('div', { className: 'weekly-wrap-card__bar-indicators' },
                    hasTraining && h('span', { 
                      className: 'weekly-wrap-card__bar-indicator weekly-wrap-card__bar-indicator--training',
                      title: 'Тренировочный день'
                    }, '💪'),
                    hasHighStress && h('span', { 
                      className: 'weekly-wrap-card__bar-indicator weekly-wrap-card__bar-indicator--stress',
                      title: 'Высокий стресс'
                    }, '😰')
                  ),
                  h('div', { 
                    className: 'weekly-wrap-card__bar',
                    style: { 
                      height: `${day.score}%`,
                      backgroundColor: hasHighStress ? '#f87171' : getScoreColor(day.score)
                    }
                  }),
                  h('div', { className: 'weekly-wrap-card__bar-label' }, day.dayName),
                  h('div', { className: 'weekly-wrap-card__bar-value' }, day.score)
                );
              })
            ),
            
            // Chart Legend
            h('div', { className: 'weekly-wrap-card__chart-legend' },
              h('div', { className: 'weekly-wrap-card__legend-item' },
                h('span', { className: 'weekly-wrap-card__legend-indicator weekly-wrap-card__legend-indicator--training' }),
                'Тренировка'
              ),
              h('div', { className: 'weekly-wrap-card__legend-item' },
                h('span', { className: 'weekly-wrap-card__legend-indicator weekly-wrap-card__legend-indicator--stress' }),
                'Стресс'
              )
            ),
            
            // Trends
            h('div', { className: 'weekly-wrap-card__trends' },
              h('div', { className: 'weekly-wrap-card__trend' },
                h('span', null, getTrendIcon(trends.score.direction)),
                ' Score: ',
                trends.score.direction === 'up' ? 'растёт' : 
                trends.score.direction === 'down' ? 'падает' : 'стабилен'
              ),
              h('div', { className: 'weekly-wrap-card__trend' },
                h('span', null, getTrendIcon(trends.risk.direction)),
                ' Риск: ',
                trends.risk.direction === 'up' ? 'растёт ⚠️' : 
                trends.risk.direction === 'down' ? 'снижается ✅' : 'стабилен'
              )
            )
          ),
          
          // Tab: Insights
          activeTab === 'insights' && h('div', { className: 'weekly-wrap-card__insights' },
            insights.length > 0 
              ? insights.map(insight =>
                  h('div', { 
                    key: insight.id,
                    className: 'weekly-wrap-card__insight'
                  },
                    h('span', { className: 'weekly-wrap-card__insight-emoji' }, insight.emoji),
                    h('span', { className: 'weekly-wrap-card__insight-text' }, insight.text)
                  )
                )
              : h('div', { className: 'weekly-wrap-card__no-insights' },
                  '✨ На этой неделе всё отлично!'
                ),
            
            // Forecast
            h('div', { className: 'weekly-wrap-card__forecast' },
              h('div', { className: 'weekly-wrap-card__forecast-title' }, '🔮 Прогноз на следующую неделю'),
              h('div', { className: 'weekly-wrap-card__forecast-content' },
                h('div', { className: 'weekly-wrap-card__forecast-score' },
                  'Ожидаемый score: ',
                  h('span', { style: { color: getScoreColor(nextWeekForecast.predictedScore) } },
                    Math.round(nextWeekForecast.predictedScore)
                  )
                ),
                h('div', { className: 'weekly-wrap-card__forecast-rec' },
                  '💡 ',
                  nextWeekForecast.recommendation
                )
              )
            )
          )
        ),
        
        // Footer
        h('div', { className: 'weekly-wrap-card__footer' },
          h('button', {
            className: 'weekly-wrap-card__share',
            onClick: shareResults
          },
            showShare ? '✓ Скопировано!' : '📤 Поделиться'
          ),
          h('button', {
            className: 'weekly-wrap-card__done',
            onClick: handleClose
          }, 'Готово')
        )
      )
    );
  }
  
  // Добавляем компоненты в экспорт
  HEYS.PredictiveInsights.components = {
    HealthRing,
    TotalHealthRing,
    HealthRingsGrid,
    PatternCard,
    PatternsList,
    ScenarioCard,
    WhatIfSection,
    WeightPrediction,
    WeeklyWrap,
    WeeklyWrapCard,  // NEW
    EmptyState,
    InsightsCard,
    InsightsTab,
    // Новые компоненты
    CollapsibleSection,
    MetabolismCard,
    MetabolismSection,
    // v2.0: Info компоненты
    InfoButton,
    MetricWithInfo,
    // Metabolic Intelligence компоненты
    MetabolicStatusCard,
    ReasonCard,
    ActionCard,
    PredictiveDashboard,
    // v2.1: Новые компоненты Metabolic Intelligence
    MetabolicStateRing,
    RiskTrafficLight,
    DataCompletenessCard,
    MealTimingCard,
    // v2.2: What-If Simulator
    WhatIfSimulator,
    WhatIfCard,
    simulateFood,
    WHATIF_PRESETS,
    WHATIF_CATEGORIES
  };
  
  // Debug в консоли
  if (typeof window !== 'undefined') {
    window.debugPredictiveInsights = () => {
      const result = HEYS.PredictiveInsights.analyze();
      console.log('🔮 Predictive Insights:', result);
      return result;
    };
    
    window.debugMetabolicStatus = () => {
      if (!HEYS.Metabolic?.getStatus) {
        console.error('❌ HEYS.Metabolic not loaded');
        return null;
      }
      
      const result = HEYS.Metabolic.getStatus();
      console.log('💪 Metabolic Status:', result);
      return result;
    };
    
    window.debugWeeklyWrap = () => {
      if (!HEYS.Metabolic?.generateWeeklyWrap) {
        console.error('❌ HEYS.Metabolic.generateWeeklyWrap not loaded');
        return null;
      }
      
      const result = HEYS.Metabolic.generateWeeklyWrap();
      console.log('📊 Weekly Wrap:', result);
      return result;
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
      console.log('🎯 Current Variant:', variant.id, '-', variant.name);
      console.log('⚖️ Weights:', weights);
      console.log('📈 Stats:', stats);
      
      if (Object.keys(stats.variantStats).length > 0) {
        console.table(stats.variantStats);
        console.log('🏆 Best Variant (by F1):', stats.bestVariant);
      } else {
        console.log('⏳ Not enough data yet');
      }
      console.groupEnd();
      
      return { variant, weights, stats };
    };
  }
  
})(typeof window !== 'undefined' ? window : global);
