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
  
  // === UI КОМПОНЕНТЫ (из pi_ui_*.js) ===
  // Используем извлечённые React компоненты, fallback если модули не загружены
  const piUIRings = HEYS.InsightsPI?.uiRings || window.piUIRings || {};
  
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
  
  /**
   * Рассчитать калории из MealItem через pIndex
   */
  function calculateItemKcal(item, pIndex) {
    if (!item || !item.grams) return 0;
    const prod = pIndex?.byId?.get?.(String(item.product_id || item.id)?.toLowerCase());
    if (!prod) return 0;
    const p = prod.protein100 || 0;
    const c = (prod.simple100 || 0) + (prod.complex100 || 0);
    const f = (prod.badFat100 || 0) + (prod.goodFat100 || 0) + (prod.trans100 || 0);
    return (p * 4 + c * 4 + f * 9) * item.grams / 100;
  }
  
  /**
   * Рассчитать калории за день
   */
  function calculateDayKcal(day, pIndex) {
    let total = 0;
    if (!day.meals) return 0;
    for (const meal of day.meals) {
      if (!meal.items) continue;
      for (const item of meal.items) {
        total += calculateItemKcal(item, pIndex);
      }
    }
    return total;
  }
  
  /**
   * Рассчитать BMR (Mifflin-St Jeor)
   * 🔬 TDEE v1.1.0: делегируем в HEYS.TDEE.calcBMR() если доступен
   */
  function calculateBMR(profile) {
    // Если есть модуль TDEE — используем его
    if (HEYS.TDEE?.calcBMR) {
      return HEYS.TDEE.calcBMR(profile);
    }
    
    // Fallback: inline расчёт
    const weight = profile?.weight || 70;
    const height = profile?.height || 170;
    const age = profile?.age || 30;
    const isMale = profile?.gender !== 'Женский';
    
    if (isMale) {
      return 10 * weight + 6.25 * height - 5 * age + 5;
    } else {
      return 10 * weight + 6.25 * height - 5 * age - 161;
    }
  }

  /**
   * Получить данные дней из localStorage
   * @param {number} daysBack - сколько дней назад
   * @param {Function} lsGet - функция U.lsGet
   * @returns {Array} массив дней [{date, ...dayData}]
   */
  function getDaysData(daysBack, lsGet) {
    const days = [];
    const today = new Date();
    
    for (let i = 0; i < daysBack; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const dayData = lsGet(`heys_dayv2_${dateStr}`, null);
      
      if (dayData && dayData.meals && dayData.meals.length > 0) {
        days.push({
          date: dateStr,
          daysAgo: i,
          ...dayData
        });
      }
    }
    
    return days;
  }

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
      
      // === Активность ===
      analyzeTrainingKcal(days, pIndex),                 // v2.0: добавлен pIndex
      analyzeStepsWeight(days),
      analyzeStressEating(days, pIndex),                 // v2.0: добавлен pIndex
      
      // === NEW v2.0: Научные анализаторы ===
      analyzeCircadianTiming(days, pIndex),              // Циркадные ритмы
      analyzeNutrientTiming(days, pIndex, profile),      // Тайминг нутриентов
      analyzeInsulinSensitivity(days, pIndex, profile),  // Чувствительность к инсулину
      analyzeGutHealth(days, pIndex)                     // Здоровье ЖКТ
    ];
    
    // Считаем Health Score — v2.0: goal-aware
    const healthScore = calculateHealthScore(patterns, profile);
    
    // Генерируем What-If
    const whatIf = generateWhatIfScenarios(patterns, healthScore, days, profile);
    
    // Прогноз веса
    const weightPrediction = predictWeight(days, profile);
    
    // Weekly Wrap
    const weeklyWrap = generateWeeklyWrap(days, patterns, healthScore, weightPrediction);
    
    const result = {
      available: true,
      daysAnalyzed: days.length,
      daysWithData: days.length,
      confidence: Math.round((days.length / CONFIG.MIN_DAYS_FOR_FULL_ANALYSIS) * 100),
      isFullAnalysis: days.length >= CONFIG.MIN_DAYS_FOR_FULL_ANALYSIS,
      patterns,
      healthScore,
      whatIf,
      weightPrediction,
      weeklyWrap,
      generatedAt: new Date().toISOString(),
      version: CONFIG.VERSION
    };
    
    // Кэшируем
    _cache = {
      data: result,
      timestamp: now,
      clientId
    };
    
    return result;
  }

  /**
   * Очистить кэш (вызывать при добавлении продукта)
   */
  function clearCache() {
    _cache = { data: null, timestamp: 0, clientId: null };
  }

  // === ЭКСПОРТ ===
  HEYS.PredictiveInsights = {
    VERSION: CONFIG.VERSION,
    CONFIG,
    PATTERNS,
    
    // === СИСТЕМА ПРИОРИТЕТОВ v2.1 ===
    PRIORITY_LEVELS,
    CATEGORIES,
    ACTIONABILITY,
    SCIENCE_INFO,
    
    // Функции работы с приоритетами
    getMetricPriority,
    getAllMetricsByPriority,
    getMetricsByCategory,
    getMetricsByActionability,
    getCriticalMetrics,
    getPriorityStats,
    
    // Главные функции
    analyze,
    clearCache,
    
    // Утилиты (для тестирования)
    getDaysData,
    pearsonCorrelation,
    calculateTrend,
    average,
    stdDev,
    
    // Отдельные анализаторы
    analyzeMealTiming,
    analyzeWaveOverlap,
    analyzeLateEating,
    analyzeMealQualityTrend,
    analyzeSleepWeight,
    analyzeSleepHunger,
    analyzeTrainingKcal,
    analyzeStepsWeight,
    analyzeProteinSatiety,
    analyzeFiberRegularity,
    analyzeStressEating,
    analyzeMoodFood,
    
    // Композитные функции
    calculateHealthScore,
    generateWhatIfScenarios,
    predictWeight,
    generateWeeklyWrap,
    
    
    // === ПРОДВИНУТАЯ АНАЛИТИКА API ===
    // Делегируем в pi_analytics_api.js
    analyzeMetabolism: piAnalyticsAPI.analyzeMetabolism,
    calculateConfidenceScore: piAnalyticsAPI.calculateConfidenceScore,
    calculateCorrelationMatrix: piAnalyticsAPI.calculateCorrelationMatrix,
    detectMetabolicPatterns: piAnalyticsAPI.detectMetabolicPatterns,
    calculatePredictiveRisk: piAnalyticsAPI.calculatePredictiveRisk,
    forecastEnergy: piAnalyticsAPI.forecastEnergy,
    calculateBayesianConfidence: piAnalyticsAPI.calculateBayesianConfidence,
    calculateTimeLaggedCorrelations: piAnalyticsAPI.calculateTimeLaggedCorrelations,
    calculateGlycemicVariability: piAnalyticsAPI.calculateGlycemicVariability,
    calculateAllostaticLoad: piAnalyticsAPI.calculateAllostaticLoad,
    detectEarlyWarningSignals: piAnalyticsAPI.detectEarlyWarningSignals,
    
  // === REACT COMPONENTS ===
  const { createElement: h, useState, useEffect, useMemo } = window.React || {};
  const ReactDOM = window.ReactDOM || {};

  // === UI RING COMPONENTS (из pi_ui_rings.js) ===
  const HealthRing = piUIRings.HealthRing || function() { return h('div', {}, 'HealthRing not loaded'); };
  const TotalHealthRing = piUIRings.TotalHealthRing || function() { return h('div', {}, 'TotalHealthRing not loaded'); };
  const StatusProgressRing = piUIRings.StatusProgressRing || function() { return h('div', {}, 'StatusProgressRing not loaded'); };
  const MiniRiskMeter = piUIRings.MiniRiskMeter || function() { return h('div', {}, 'MiniRiskMeter not loaded'); };
  const MetabolicStateRing = piUIRings.MetabolicStateRing || function() { return h('div', {}, 'MetabolicStateRing not loaded'); };

  /**
   * Health Ring — кольцевой индикатор прогресса (v2.0: с InfoButton)
   */
  /**
   * HealthRing — кольцо здоровья для категории
   * v3.22.0: Поддержка emotionalWarning overlay для Recovery
   */
        
        // Legacy Quick Stats
        h('div', { className: 'adv-analytics__quick-stats' },
          // Risk Score
          h('div', { className: `adv-analytics__stat adv-analytics__stat--${risk.riskLevel}` },
            h('div', { className: 'adv-analytics__stat-icon' }, risk.riskEmoji),
            h('div', { className: 'adv-analytics__stat-value' }, `${risk.riskScore}%`),
            h('div', { className: 'adv-analytics__stat-label' }, 'Риск срыва')
          ),
          // Patterns Found
          h('div', { className: 'adv-analytics__stat' },
            h('div', { className: 'adv-analytics__stat-icon' }, '🧬'),
            h('div', { className: 'adv-analytics__stat-value' }, patterns.patterns.length),
            h('div', { className: 'adv-analytics__stat-label' }, 'Паттернов')
          ),
          // Correlations Found
          h('div', { className: 'adv-analytics__stat' },
            h('div', { className: 'adv-analytics__stat-icon' }, '🔗'),
            h('div', { className: 'adv-analytics__stat-value' }, correlations.correlations.filter(c => c.strength !== 'none').length),
            h('div', { className: 'adv-analytics__stat-label' }, 'Связей')
          ),
          // Causality
          timeLag.hasData && h('div', { className: 'adv-analytics__stat' },
            h('div', { className: 'adv-analytics__stat-icon' }, '⏳'),
            h('div', { className: 'adv-analytics__stat-value' }, timeLag.confirmedCount),
            h('div', { className: 'adv-analytics__stat-label' }, 'Причинностей')
          )
        )
      );
    };
    
    // === RENDER SCIENCE TAB (новый) ===
    const renderScience = () => {
      return h('div', { className: 'adv-analytics__science' },
        
        // Bayesian Section
        bayesian.hasData && h('div', { className: 'adv-analytics__science-section' },
          h('div', { className: 'adv-analytics__science-header' },
            h('span', null, '📊 Байесовская уверенность'),
            h(InfoButton, { infoKey: 'BAYESIAN_CONFIDENCE' })
          ),
          h('div', { className: `adv-analytics__science-card adv-analytics__science-card--${bayesian.qualityGrade}` },
            h('div', { className: 'adv-analytics__science-main' },
              h('span', { className: 'adv-analytics__science-emoji' }, bayesian.gradeEmoji),
              h('span', { className: 'adv-analytics__science-value' }, `${bayesian.confidencePercent}%`)
            ),
            bayesian.mape !== null && h('div', { className: 'adv-analytics__science-detail' },
              `MAPE: ${bayesian.mape}% | R²: ${bayesian.crossValidation?.r2?.toFixed(2) || 'N/A'}`
            ),
            h('div', { className: 'adv-analytics__science-insight' }, bayesian.message)
          )
        ),
        
        // GVI Section
        gvi.hasData && h('div', { className: 'adv-analytics__science-section' },
          h('div', { className: 'adv-analytics__science-header' },
            h('span', null, '📈 Гликемическая волатильность'),
            h(InfoButton, { infoKey: 'GLYCEMIC_VARIABILITY' })
          ),
          h('div', { className: `adv-analytics__science-card adv-analytics__science-card--${gvi.riskCategory}` },
            h('div', { className: 'adv-analytics__science-main' },
              h('span', { className: 'adv-analytics__science-emoji' }, gvi.riskEmoji),
              h('span', { className: 'adv-analytics__science-value' }, `CV ${gvi.gvi}%`)
            ),
            h('div', { className: 'adv-analytics__science-detail' },
              `CONGA: ${gvi.conga} | Mean GL: ${gvi.mealGLMean}`
            ),
            h('div', { className: 'adv-analytics__science-insight' }, gvi.riskLabel),
            gvi.recommendations.length > 0 && h('div', { className: 'adv-analytics__science-recs' },
              gvi.recommendations.map((r, i) => h('div', { key: i }, r))
            )
          )
        ),
        
        // Allostatic Load Section
        allostatic.hasData && h('div', { className: 'adv-analytics__science-section' },
          h('div', { className: 'adv-analytics__science-header' },
            h('span', null, '🧠 Аллостатическая нагрузка'),
            h(InfoButton, { infoKey: 'ALLOSTATIC_LOAD' })
          ),
          h('div', { className: `adv-analytics__science-card adv-analytics__science-card--${allostatic.riskLevel}` },
            h('div', { className: 'adv-analytics__science-main' },
              h('span', { className: 'adv-analytics__science-emoji' }, allostatic.riskEmoji),
              h('span', { className: 'adv-analytics__science-value' }, allostatic.alScore)
            ),
            h('div', { className: 'adv-analytics__science-detail' }, allostatic.riskLabel),
            // Components
            h('div', { className: 'adv-analytics__science-components' },
              Object.entries(allostatic.components).map(([key, comp]) =>
                h('div', { 
                  key, 
                  className: `adv-analytics__al-component ${comp.status === 'elevated' ? 'adv-analytics__al-component--elevated' : ''}` 
                },
                  h('span', null, comp.label),
                  h('span', null, `${comp.score}%`)
                )
              )
            ),
            allostatic.recovery.length > 0 && h('div', { className: 'adv-analytics__science-recs' },
              allostatic.recovery.map((r, i) => h('div', { key: i }, r))
            )
          )
        ),
        
        // Early Warning Signals Section
        ews.hasData && h('div', { className: 'adv-analytics__science-section' },
          h('div', { className: 'adv-analytics__science-header' },
            h('span', null, '⚠️ Ранние сигналы срыва'),
            h(InfoButton, { infoKey: 'EARLY_WARNING_SIGNALS' })
          ),
          h('div', { className: `adv-analytics__science-card adv-analytics__science-card--${ews.criticalTransitionRisk}` },
            h('div', { className: 'adv-analytics__science-main' },
              h('span', { className: 'adv-analytics__science-emoji' }, ews.riskEmoji),
              h('span', { className: 'adv-analytics__science-value' }, `EWS ${ews.ewsScore}%`)
            ),
            h('div', { className: 'adv-analytics__science-detail' }, ews.prediction),
            // Signals
            h('div', { className: 'adv-analytics__ews-signals' },
              ews.signals.map((s, i) =>
                h('div', { 
                  key: i, 
                  className: `adv-analytics__ews-signal ${s.detected ? 'adv-analytics__ews-signal--active' : ''}` 
                },
                  h('span', null, s.label),
                  h('span', null, s.detected ? '⚠️' : '✅'),
                  h('div', { className: 'adv-analytics__ews-insight' }, s.insight)
                )
              )
            )
          )
        ),
        
        // 2-Process Model Section
        twoProcess.hasData && h('div', { className: 'adv-analytics__science-section' },
          h('div', { className: 'adv-analytics__science-header' },
            h('span', null, '💤 Модель бодрости (Borbély)'),
            h(InfoButton, { infoKey: 'TWO_PROCESS_MODEL' })
          ),
          h('div', { className: `adv-analytics__science-card adv-analytics__science-card--${twoProcess.alertnessLevel}` },
            h('div', { className: 'adv-analytics__science-main' },
              h('span', { className: 'adv-analytics__science-emoji' }, twoProcess.alertnessEmoji),
              h('span', { className: 'adv-analytics__science-value' }, `${twoProcess.alertness}%`)
            ),
            h('div', { className: 'adv-analytics__science-detail' },
              `Process S: ${twoProcess.processS}% | Process C: ${twoProcess.processC}%`
            ),
            h('div', { className: 'adv-analytics__science-detail' },
              `Бодрствуешь: ${twoProcess.hoursAwake}ч | Долг сна: ${twoProcess.sleepDebt}ч`
            ),
            // Peak/Dip windows
            h('div', { className: 'adv-analytics__2p-windows' },
              h('div', { className: 'adv-analytics__2p-window adv-analytics__2p-window--peak' },
                '🔥 Пик: ', twoProcess.peakWindow.hour, ':00 (', twoProcess.peakWindow.alertness, '%)'
              ),
              h('div', { className: 'adv-analytics__2p-window adv-analytics__2p-window--dip' },
                '😴 Спад: ', twoProcess.dipWindow.hour, ':00 (', twoProcess.dipWindow.alertness, '%)'
              )
            ),
            twoProcess.recommendations.length > 0 && h('div', { className: 'adv-analytics__science-recs' },
              twoProcess.recommendations.map((r, i) => h('div', { key: i }, r))
            )
          )
        ),
        
        // Time-Lagged Correlations Section
        timeLag.hasData && h('div', { className: 'adv-analytics__science-section' },
          h('div', { className: 'adv-analytics__science-header' },
            h('span', null, '⏳ Причинность (Time-Lag)'),
            h(InfoButton, { infoKey: 'TIME_LAGGED_CORRELATIONS' })
          ),
          h('div', { className: 'adv-analytics__science-card' },
            timeLag.strongest && h('div', { className: 'adv-analytics__science-main' },
              h('span', { className: 'adv-analytics__science-emoji' }, 
                timeLag.strongest.hasCausality ? '✅' : '📊'
              ),
              h('span', { className: 'adv-analytics__science-value' }, timeLag.strongest.label)
            ),
            h('div', { className: 'adv-analytics__science-detail' },
              `Подтверждённых связей: ${timeLag.confirmedCount} из ${timeLag.totalAnalyzed}`
            ),
            // Causal Links
            h('div', { className: 'adv-analytics__causality-list' },
              timeLag.lagAnalysis.slice(0, 5).map((link, i) =>
                h('div', { 
                  key: i, 
                  className: `adv-analytics__causality-item ${link.hasCausality ? 'adv-analytics__causality-item--confirmed' : ''}` 
                },
                  h('div', { className: 'adv-analytics__causality-label' }, link.label),
                  h('div', { className: 'adv-analytics__causality-detail' },
                    `r=${link.bestCorrelation} (лаг ${link.bestLag}д)`
                  ),
                  h('div', { className: 'adv-analytics__causality-strength' }, 
                    link.causalStrength === 'confirmed' ? '✅ Подтверждено' :
                    link.causalStrength === 'possible' ? '📊 Возможно' : '⚪ Слабо'
                  )
                )
              )
            )
          )
        )
      );
    };
    
    // Render Correlations Tab
    const renderCorrelations = () => {
      if (!correlations.hasData) {
        return h('div', { className: 'adv-analytics__empty' },
          h('div', null, '📊'),
          h('div', null, 'Нужно минимум 7 дней данных')
        );
      }
      
      return h('div', { className: 'adv-analytics__correlations' },
        // Insights
        correlations.insights.map((insight, i) =>
          h('div', { key: i, className: 'adv-analytics__insight' }, insight)
        ),
        
        // Correlation List
        h('div', { className: 'adv-analytics__corr-list' },
          correlations.correlations.slice(0, 6).map((corr, i) =>
            h('div', { 
              key: i, 
              className: `adv-analytics__corr-item adv-analytics__corr-item--${corr.strength}` 
            },
              h('div', { className: 'adv-analytics__corr-label' }, corr.label),
              h('div', { className: 'adv-analytics__corr-bar' },
                h('div', { 
                  className: `adv-analytics__corr-fill adv-analytics__corr-fill--${corr.direction}`,
                  style: { width: `${Math.abs(corr.correlation) * 100}%` }
                })
              ),
              h('div', { className: 'adv-analytics__corr-value' }, 
                `${corr.correlation > 0 ? '+' : ''}${Math.round(corr.correlation * 100)}%`
              )
            )
          )
        )
      );
    };
    
    // Render Patterns Tab
    const renderPatterns = () => {
      if (!patterns.hasData) {
        return h('div', { className: 'adv-analytics__empty' },
          h('div', null, '🧬'),
          h('div', null, 'Продолжай вести учёт для выявления паттернов')
        );
      }
      
      return h('div', { className: 'adv-analytics__patterns' },
        patterns.patterns.map((pattern, i) =>
          h('div', { key: i, className: `adv-analytics__pattern adv-analytics__pattern--${pattern.level}` },
            h('div', { className: 'adv-analytics__pattern-header' },
              h('span', { className: 'adv-analytics__pattern-label' }, pattern.label),
              h('span', { className: 'adv-analytics__pattern-level' }, pattern.level)
            ),
            h('div', { className: 'adv-analytics__pattern-insight' }, pattern.insight)
          )
        ),
        
        // Recommendations
        patterns.recommendations.length > 0 && h('div', { className: 'adv-analytics__recommendations' },
          h('div', { className: 'adv-analytics__recommendations-title' }, '💡 Рекомендации'),
          patterns.recommendations.map((rec, i) =>
            h('div', { key: i, className: 'adv-analytics__recommendation' }, rec)
          )
        )
      );
    };
    
    // Render Risk Tab
    const renderRisk = () => {
      return h('div', { className: 'adv-analytics__risk' },
        // Main Risk Score
        h('div', { className: `adv-analytics__risk-main adv-analytics__risk-main--${risk.riskLevel}` },
          h('div', { className: 'adv-analytics__risk-score' },
            h('span', { className: 'adv-analytics__risk-emoji' }, risk.riskEmoji),
            h('span', { className: 'adv-analytics__risk-value' }, `${risk.riskScore}%`)
          ),
          h('div', { className: 'adv-analytics__risk-label' }, risk.riskLabel + ' риск'),
          h('div', { className: 'adv-analytics__risk-prediction' }, risk.prediction)
        ),
        
        // Risk Factors
        h('div', { className: 'adv-analytics__risk-factors' },
          risk.factors.map((factor, i) =>
            h('div', { 
              key: i, 
              className: `adv-analytics__risk-factor ${factor.risk > 50 ? 'adv-analytics__risk-factor--high' : ''}` 
            },
              h('div', { className: 'adv-analytics__risk-factor-header' },
                h('span', null, factor.name),
                h('span', null, `${factor.risk}%`)
              ),
              h('div', { className: 'adv-analytics__risk-factor-bar' },
                h('div', { 
                  className: 'adv-analytics__risk-factor-fill',
                  style: { width: `${factor.risk}%` }
                })
              ),
              h('div', { className: 'adv-analytics__risk-factor-insight' }, factor.insight)
            )
          )
        )
      );
    };
    
    // Render Energy Tab
    const renderEnergy = () => {
      const { hourlyForecast, currentHour, peakWindow, dipWindow, recommendations } = energy;
      
      // Показываем только будущие часы + текущий
      const visibleHours = hourlyForecast.filter(h => h.hour >= currentHour && h.hour <= 23);
      
      return h('div', { className: 'adv-analytics__energy' },
        // Energy Graph (simplified bar chart)
        h('div', { className: 'adv-analytics__energy-graph' },
          visibleHours.map((hr, i) =>
            h('div', { 
              key: i, 
              className: `adv-analytics__energy-bar adv-analytics__energy-bar--${hr.level}`,
              style: { height: `${hr.energy}%` },
              title: `${hr.hour}:00 — ${hr.energy}%`
            },
              h('span', { className: 'adv-analytics__energy-label' }, hr.hour)
            )
          )
        ),
        
        // Peak & Dip Windows
        h('div', { className: 'adv-analytics__energy-windows' },
          h('div', { className: 'adv-analytics__energy-window adv-analytics__energy-window--peak' },
            h('span', null, '🔥'),
            h('span', null, `Пик: ${peakWindow.hour}:00`),
            h('span', null, `${peakWindow.energy}%`)
          ),
          h('div', { className: 'adv-analytics__energy-window adv-analytics__energy-window--dip' },
            h('span', null, '😴'),
            h('span', null, `Спад: ${dipWindow.hour}:00`),
            h('span', null, `${dipWindow.energy}%`)
          )
        ),
        
        // Recommendations
        h('div', { className: 'adv-analytics__energy-recs' },
          recommendations.map((rec, i) =>
            h('div', { key: i, className: 'adv-analytics__energy-rec' }, rec)
          )
        )
      );
    };
    
    // Tab content mapping
    const tabContent = {
      overview: renderOverview,
      science: renderScience,
      correlations: renderCorrelations,
      patterns: renderPatterns,
      risk: renderRisk,
      energy: renderEnergy
    };
    
    return h('div', { className: 'adv-analytics-card' },
      // Header
      h('div', { className: 'adv-analytics-card__header' },
        h('div', { className: 'adv-analytics-card__title' },
          h('span', null, '🔬'),
          h('span', null, 'Научная аналитика v3'),
          h(InfoButton, { infoKey: 'ADVANCED_ANALYTICS' })
        ),
        // Confidence Badge (mini)
        h('div', { className: `adv-analytics-card__confidence-mini adv-analytics-card__confidence-mini--${bayesian.hasData ? bayesian.qualityGrade : confidence.level}` },
          bayesian.hasData ? bayesian.gradeEmoji : confidence.levelEmoji,
          ` ${bayesian.hasData ? bayesian.confidencePercent : confidence.score}%`
        )
      ),
      
      // Tabs
      h('div', { className: 'adv-analytics-card__tabs' },
        tabs.map(tab =>
          h('button', {
            key: tab.id,
            className: `adv-analytics-card__tab ${activeTab === tab.id ? 'adv-analytics-card__tab--active' : ''}`,
            onClick: () => setActiveTab(tab.id),
            title: tab.title
          }, tab.label)
        )
      ),
      
      // Content
      h('div', { className: 'adv-analytics-card__content' },
        tabContent[activeTab]?.()
      )
    );
  }

  /**
   * MetabolismCard — карточка одного метаболического показателя (v2.0: с InfoButton)
   */
  function MetabolismCard({ title, icon, value, unit, quality, insight, pmid, details, infoKey, debugData }) {
    const [showDetails, setShowDetails] = useState(false);
    
    const qualityColors = {
      excellent: '#22c55e',
      good: '#10b981',
      normal: '#3b82f6',
      low: '#f59e0b',
      warning: '#ef4444'
    };
    const color = qualityColors[quality] || qualityColors.normal;
    
    return h('div', { 
      className: `insights-metabolism-card insights-metabolism-card--${quality} ${showDetails ? 'insights-metabolism-card--expanded' : ''}`,
      onClick: () => setShowDetails(!showDetails)
    },
      h('div', { className: 'insights-metabolism-card__header' },
        h('div', { className: 'insights-metabolism-card__icon', style: { color } }, icon),
        h('div', { className: 'insights-metabolism-card__info' },
          h('div', { className: 'insights-metabolism-card__title' },
            title,
            // v2.0: InfoButton рядом с заголовком
            infoKey && h(InfoButton, { infoKey, debugData })
          ),
          h('div', { className: 'insights-metabolism-card__value' },
            h('span', { style: { color, fontWeight: 700 } }, value),
            unit && h('span', { className: 'insights-metabolism-card__unit' }, ' ', unit)
          )
        ),
        pmid && h('a', {
          className: 'insights-metabolism-card__pmid',
          href: `https://pubmed.ncbi.nlm.nih.gov/${pmid}`,
          target: '_blank',
          rel: 'noopener',
          onClick: e => e.stopPropagation()
        }, '📚')
      ),
      showDetails && h('div', { className: 'insights-metabolism-card__details' },
        h('div', { className: 'insights-metabolism-card__insight' }, insight),
        details && h('div', { className: 'insights-metabolism-card__breakdown' }, details)
      )
    );
  }

  /**
   * MetabolismSection — секция научной аналитики (v2.0: с InfoButtons)
   */
  function MetabolismSection({ lsGet, profile, pIndex, selectedDate }) {
    const metabolism = useMemo(() => {
      return HEYS.PredictiveInsights.analyzeMetabolism({
        lsGet: lsGet || window.HEYS?.utils?.lsGet,
        profile: profile || window.HEYS?.utils?.lsGet?.('heys_profile', {}),
        pIndex: pIndex || window.HEYS?.products?.buildIndex?.(),
        selectedDate
      });
    }, [lsGet, profile, pIndex, selectedDate]);
    
    if (!metabolism || !metabolism.hasData) {
      return h('div', { className: 'insights-metabolism-empty' },
        h('div', { className: 'insights-metabolism-empty__icon' }, '📊'),
        'Добавь данные для анализа метаболизма'
      );
    }
    
    const { tefAnalysis, epocAnalysis, hormonalBalance, adaptiveThermogenesis } = metabolism;
    
    // Компактная сводка для заголовка
    const summaryParts = [];
    if (tefAnalysis.percent > 0) summaryParts.push(`TEF ${tefAnalysis.percent}%`);
    if (epocAnalysis.kcal > 0) summaryParts.push(`EPOC +${epocAnalysis.kcal}`);
    if (hormonalBalance.isDisrupted) summaryParts.push('⚠️ Гормоны');
    else summaryParts.push('✓ Гормоны');
    
    return h('div', { className: 'metabolism-section' },
      // Header с InfoButton
      h('div', { className: 'metabolism-section__header' },
        h('div', { className: 'metabolism-section__title' },
          h('span', { className: 'metabolism-section__icon' }, '🔥'),
          h('span', null, 'Метаболизм'),
          h(InfoButton, { infoKey: 'TEF' })
        ),
        h('div', { className: 'metabolism-section__badge' }, summaryParts.join(' • '))
      ),
      // Content
      h('div', { className: 'insights-metabolism' },
        // TEF — v2.0: добавлен infoKey и debugData
        h(MetabolismCard, {
          title: 'Термический эффект (TEF)',
          icon: '🔥',
          value: tefAnalysis.total,
          unit: 'ккал',
          quality: tefAnalysis.quality,
          insight: tefAnalysis.insight,
          pmid: tefAnalysis.pmid,
          details: `Белок: ${tefAnalysis.breakdown.protein} | Углеводы: ${tefAnalysis.breakdown.carbs} | Жиры: ${tefAnalysis.breakdown.fat}`,
          infoKey: 'TEF',
          debugData: {
            breakdown: tefAnalysis.breakdown,
            percent: tefAnalysis.percent,
            quality: tefAnalysis.quality
          }
        }),
        
        // EPOC — v2.0: добавлен infoKey и debugData
        epocAnalysis.hasTraining && h(MetabolismCard, {
          title: 'Дожиг после тренировки (EPOC)',
          icon: '⚡',
          value: epocAnalysis.kcal > 0 ? `+${epocAnalysis.kcal}` : '—',
          unit: 'ккал',
          quality: epocAnalysis.kcal > 50 ? 'excellent' : epocAnalysis.kcal > 20 ? 'good' : 'normal',
          insight: epocAnalysis.insight,
          pmid: epocAnalysis.pmid,
          details: `Тренировка: ${epocAnalysis.trainingKcal} ккал`,
          infoKey: 'EPOC',
          debugData: {
            epocKcal: epocAnalysis.kcal,
            trainingKcal: epocAnalysis.trainingKcal,
            hasTraining: epocAnalysis.hasTraining
          }
        }),
        
        // Гормоны — v2.0: добавлен infoKey и debugData
        h(MetabolismCard, {
          title: 'Гормональный баланс',
          icon: '😴',
          value: hormonalBalance.isDisrupted ? `+${hormonalBalance.ghrelinIncrease}%` : '✓',
          unit: hormonalBalance.isDisrupted ? 'голод' : 'норма',
          quality: hormonalBalance.ghrelinIncrease > 15 ? 'warning' : hormonalBalance.ghrelinIncrease > 0 ? 'low' : 'good',
          insight: hormonalBalance.insight,
          pmid: hormonalBalance.pmid,
          details: hormonalBalance.sleepDebt > 0 ? `Недосып: ${hormonalBalance.sleepDebt} ч` : 'Сон в норме',
          infoKey: 'HORMONES',
          debugData: {
            sleepDebt: hormonalBalance.sleepDebt,
            ghrelinIncrease: hormonalBalance.ghrelinIncrease,
            leptinDecrease: hormonalBalance.leptinDecrease
          }
        }),
        
        // Адаптивный термогенез — v2.0: добавлен infoKey и debugData
        adaptiveThermogenesis.isAdapted && h(MetabolismCard, {
          title: 'Адаптация метаболизма',
          icon: '📉',
          value: `-${Math.round(adaptiveThermogenesis.metabolicReduction * 100)}%`,
          unit: 'замедление',
          quality: 'warning',
          insight: adaptiveThermogenesis.insight,
          pmid: adaptiveThermogenesis.pmid,
          details: `Дней в жёстком дефиците: ${adaptiveThermogenesis.chronicDeficitDays}`,
          infoKey: 'ADAPTIVE',
          debugData: {
            chronicDeficitDays: adaptiveThermogenesis.chronicDeficitDays,
            metabolicReduction: adaptiveThermogenesis.metabolicReduction
          }
        })
      )
    );
  }

  /**
   * HealthRingsGrid — сетка колец здоровья
   * v3.22.0: Интеграция emotionalRisk overlay для Recovery
   */
  function HealthRingsGrid({ healthScore, onCategoryClick, compact, lsGet }) {
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
  function PatternCard({ pattern }) {
    if (!pattern || !pattern.available) return null;
    
    const iconClass = pattern.score >= 70 ? 'good' : pattern.score >= 40 ? 'warn' : 'bad';
    const icon = pattern.score >= 70 ? '✓' : pattern.score >= 40 ? '!' : '✗';
    
    const patternLabels = {
      meal_timing: '⏱️ Тайминг еды',
      wave_overlap: '🌊 Перехлёст волн',
      late_eating: '🌙 Поздняя еда',
      meal_quality: '🍽️ Качество еды',
      sleep_weight: '💤 Сон → Вес',
      sleep_hunger: '😴 Сон → Голод',
      training_kcal: '🏋️ Тренировки',
      steps_weight: '👟 Шаги → Вес',
      protein_satiety: '🥩 Белок',
      fiber_regularity: '🥗 Клетчатка',
      stress_eating: '😰 Стресс → Еда',
      mood_food: '😊 Настроение',
      // v2.0: новые паттерны
      circadian_timing: '🌅 Циркадные ритмы',
      nutrient_timing: '⏰ Тайминг нутриентов',
      insulin_sensitivity: '📉 Инсулин. чувств.',
      gut_health: '🦠 Здоровье ЖКТ'
    };
    
    // v2.0: Маппинг pattern → SCIENCE_INFO ключ
    const patternToInfoKey = {
      circadian_timing: 'CIRCADIAN',
      nutrient_timing: 'NUTRIENT_TIMING',
      insulin_sensitivity: 'INSULIN_SENSITIVITY',
      gut_health: 'GUT_HEALTH'
    };
    
    const infoKey = patternToInfoKey[pattern.pattern];
    
    return h('div', { className: 'insights-pattern' },
      h('div', { className: `insights-pattern__icon insights-pattern__icon--${iconClass}` }, icon),
      h('div', { className: 'insights-pattern__content' },
        h('div', { className: 'insights-pattern__title' },
          patternLabels[pattern.pattern] || pattern.pattern,
          // v2.0: InfoButton для новых паттернов с формулами
          (infoKey || pattern.formula) && h(InfoButton, {
            infoKey: infoKey,
            debugData: pattern.debug || {
              formula: pattern.formula,
              score: pattern.score,
              confidence: pattern.confidence
            }
          })
        ),
        h('div', { className: 'insights-pattern__insight' }, pattern.insight),
        pattern.confidence && h('div', { className: 'insights-pattern__confidence' },
          `Уверенность: ${Math.round(pattern.confidence * 100)}%`
        )
      )
    );
  }

  /**
   * Patterns List — список всех паттернов
   */
  function PatternsList({ patterns }) {
    if (!patterns || patterns.length === 0) return null;
    
    const availablePatterns = patterns.filter(p => p.available);
    
    return h('div', { className: 'insights-patterns' },
      availablePatterns.map((p, i) =>
        h(PatternCard, { key: p.pattern || i, pattern: p })
      )
    );
  }

  /**
   * What-If Scenario Card
   */
  function ScenarioCard({ scenario }) {
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
    }, [customValues, isCustomMode, context]);
    
    const handlePresetClick = (preset) => {
      setSelectedPreset(preset);
      setIsCustomMode(false);
    };
    
    const handleCustomToggle = () => {
      setIsCustomMode(!isCustomMode);
      setSelectedPreset(null);
      if (!isCustomMode) {
        setSimulation(null);
      }
    };
    
    const handleCustomChange = (field, value) => {
      setCustomValues(prev => ({ ...prev, [field]: parseFloat(value) || 0 }));
    };
    
    // Фильтрация по категории
    const filteredPresets = WHATIF_PRESETS.filter(p => p.category === activeCategory);
    
    return h('div', { className: `whatif-simulator ${expanded ? 'whatif-simulator--expanded' : ''}` },
      // Header
      h('div', { className: 'whatif-simulator__header' },
        h('div', { className: 'whatif-simulator__title' },
          h('span', { className: 'whatif-simulator__emoji' }, '🧪'),
          'Что если съесть?'
        ),
        h('div', { className: 'whatif-simulator__subtitle' },
          'Симуляция влияния еды на организм'
        )
      ),
      
      // Категории preset-ов
      h('div', { className: 'whatif-simulator__categories' },
        Object.entries(WHATIF_CATEGORIES).map(([key, cat]) =>
          h('button', {
            key,
            className: `whatif-simulator__category ${activeCategory === key ? 'whatif-simulator__category--active' : ''}`,
            onClick: () => setActiveCategory(key),
            style: activeCategory === key ? { borderColor: cat.color, color: cat.color } : {}
          },
            h('span', null, cat.emoji),
            h('span', null, cat.name)
          )
        ),
        h('button', {
          className: `whatif-simulator__category ${isCustomMode ? 'whatif-simulator__category--active' : ''}`,
          onClick: handleCustomToggle
        },
          h('span', null, '✏️'),
          h('span', null, 'Своё')
        )
      ),
      
      // Preset-ы или кастомный ввод
      !isCustomMode ? h('div', { className: 'whatif-simulator__presets' },
        filteredPresets.map(preset =>
          h('button', {
            key: preset.id,
            className: `whatif-preset ${selectedPreset?.id === preset.id ? 'whatif-preset--selected' : ''}`,
            onClick: () => handlePresetClick(preset)
          },
            h('span', { className: 'whatif-preset__emoji' }, preset.emoji),
            h('div', { className: 'whatif-preset__info' },
              h('div', { className: 'whatif-preset__name' }, preset.name),
              h('div', { className: 'whatif-preset__kcal' }, preset.kcal, ' ккал')
            )
          )
        )
      ) : h('div', { className: 'whatif-simulator__custom' },
        h('div', { className: 'whatif-custom__row' },
          h('label', { className: 'whatif-custom__field' },
            h('span', null, 'Ккал'),
            h('input', {
              type: 'number',
              value: customValues.kcal,
              onChange: (e) => handleCustomChange('kcal', e.target.value),
              min: 0,
              max: 2000
            })
          ),
          h('label', { className: 'whatif-custom__field' },
            h('span', null, 'Белок'),
            h('input', {
              type: 'number',
              value: customValues.prot,
              onChange: (e) => handleCustomChange('prot', e.target.value),
              min: 0,
              max: 100
            })
          )
        ),
        h('div', { className: 'whatif-custom__row' },
          h('label', { className: 'whatif-custom__field' },
            h('span', null, 'Углеводы'),
            h('input', {
              type: 'number',
              value: customValues.carbs,
              onChange: (e) => handleCustomChange('carbs', e.target.value),
              min: 0,
              max: 200
            })
          ),
          h('label', { className: 'whatif-custom__field' },
            h('span', null, 'Жиры'),
            h('input', {
              type: 'number',
              value: customValues.fat,
              onChange: (e) => handleCustomChange('fat', e.target.value),
              min: 0,
              max: 100
            })
          )
        ),
        h('div', { className: 'whatif-custom__row' },
          h('label', { className: 'whatif-custom__field whatif-custom__field--wide' },
            h('span', null, 'ГИ (0-100)'),
            h('input', {
              type: 'range',
              value: customValues.gi,
              onChange: (e) => handleCustomChange('gi', e.target.value),
              min: 0,
              max: 100
            }),
            h('span', { className: 'whatif-custom__gi-value' }, customValues.gi)
          )
        )
      ),
      
      // Результаты симуляции
      simulation && h('div', { className: 'whatif-simulator__results' },
        // Verdict banner
        h('div', { className: `whatif-result__verdict whatif-result__verdict--${simulation.verdict}` },
          simulation.verdict === 'good' ? '✅ Хороший выбор!' :
          simulation.verdict === 'neutral' ? '😐 Нормально' :
          '⚠️ Рискованно'
        ),
        
        // Metrics grid
        h('div', { className: 'whatif-result__grid' },
          // Инсулиновая волна
          h('div', { className: 'whatif-result__card' },
            h('div', { className: 'whatif-result__card-header' },
              h('span', { className: 'whatif-result__card-emoji' }, '🌊'),
              h('span', null, 'Волна')
            ),
            h('div', { className: 'whatif-result__card-value' },
              simulation.wave.hours, 'ч'
            ),
            h('div', { className: 'whatif-result__card-detail' },
              'до ', simulation.wave.endTime
            ),
            simulation.wave.impact === 'interrupts' && h('div', { className: 'whatif-result__card-warning' },
              '⚠️ Прервёт липолиз!'
            )
          ),
          
          // Риск срыва
          h('div', { className: 'whatif-result__card' },
            h('div', { className: 'whatif-result__card-header' },
              h('span', { className: 'whatif-result__card-emoji' }, '⚠️'),
              h('span', null, 'Риск')
            ),
            h('div', { className: `whatif-result__card-value ${simulation.risk.delta > 0 ? 'whatif-result__card-value--bad' : simulation.risk.delta < 0 ? 'whatif-result__card-value--good' : ''}` },
              simulation.risk.before, '%',
              simulation.risk.delta !== 0 && h('span', { className: 'whatif-result__delta' },
                ' → ', simulation.risk.after, '%'
              )
            ),
            simulation.risk.delta !== 0 && h('div', { className: `whatif-result__card-detail ${simulation.risk.delta > 0 ? 'whatif-result__card-detail--bad' : 'whatif-result__card-detail--good'}` },
              simulation.risk.delta > 0 ? '+' : '', simulation.risk.delta, '%'
            )
          ),
          
          // Калории
          h('div', { className: 'whatif-result__card' },
            h('div', { className: 'whatif-result__card-header' },
              h('span', { className: 'whatif-result__card-emoji' }, '🔥'),
              h('span', null, 'Калории')
            ),
            h('div', { className: 'whatif-result__card-value' },
              '+', simulation.calories.add
            ),
            h('div', { className: `whatif-result__card-detail ${simulation.calories.ratio > 110 ? 'whatif-result__card-detail--bad' : simulation.calories.ratio >= 90 ? 'whatif-result__card-detail--good' : ''}` },
              simulation.calories.ratio, '% от нормы'
            )
          ),
          
          // Сытость
          h('div', { className: 'whatif-result__card' },
            h('div', { className: 'whatif-result__card-header' },
              h('span', { className: 'whatif-result__card-emoji' }, '😋'),
              h('span', null, 'Сытость')
            ),
            h('div', { className: 'whatif-result__card-value' },
              '~', simulation.satiety.hours, 'ч'
            ),
            h('div', { className: 'whatif-result__card-detail' },
              simulation.satiety.desc
            )
          )
        ),
        
        // Советы
        simulation.advice.length > 0 && h('div', { className: 'whatif-result__advice' },
          h('div', { className: 'whatif-result__advice-title' }, '💡 Советы'),
          simulation.advice.map((adv, i) =>
            h('div', { 
              key: i, 
              className: `whatif-result__advice-item whatif-result__advice-item--${adv.type}`,
              onClick: adv.altPreset ? () => handlePresetClick(adv.altPreset) : undefined
            },
              h('span', { className: 'whatif-result__advice-icon' }, adv.icon),
              h('span', null, adv.text)
            )
          )
        ),
        
        // Debug: GL и множитель
        h('div', { className: 'whatif-result__debug' },
          'GL: ', Math.round(simulation.wave.gl * 10) / 10,
          ' | Множитель: ×', Math.round(simulation.wave.multiplier * 100) / 100
        )
      ),
      
      // Footer с кнопкой
      expanded && onClose && h('div', { className: 'whatif-simulator__footer' },
        h('button', {
          className: 'whatif-simulator__close',
          onClick: onClose
        }, 'Закрыть')
      )
    );
  }
  
  /**
   * WhatIfCard — компактная карточка для вставки в Insights
   * Показывает мини-симулятор с популярными preset-ами
   */
  function WhatIfCard({ context }) {
    const [isExpanded, setIsExpanded] = React.useState(false);
    const [quickResult, setQuickResult] = React.useState(null);
    const [selectedQuick, setSelectedQuick] = React.useState(null);
    
    // Быстрые preset-ы для карточки
    const quickPresets = WHATIF_PRESETS.slice(0, 4);
    
    const handleQuickSelect = (preset) => {
      setSelectedQuick(preset);
      if (context) {
        const result = simulateFood(preset, context);
        setQuickResult(result);
      }
    };
    
    return h('div', { className: 'whatif-card' },
      h('div', { className: 'whatif-card__header' },
        h('div', { className: 'whatif-card__title' },
          h('span', null, '🧪'),
          ' Что если съесть?'
        ),
        h(InfoButton, { infoKey: 'WHATIF_SIMULATOR' }),
        h('button', {
          className: 'whatif-card__expand',
          onClick: () => setIsExpanded(true)
        }, 'Развернуть →')
      ),
      
      // Quick presets
      h('div', { className: 'whatif-card__quick' },
        quickPresets.map(preset =>
          h('button', {
            key: preset.id,
            className: `whatif-card__quick-btn ${selectedQuick?.id === preset.id ? 'whatif-card__quick-btn--selected' : ''}`,
            onClick: () => handleQuickSelect(preset)
          },
            h('span', null, preset.emoji),
            h('span', null, preset.kcal, ' ккал')
          )
        )
      ),
      
      // Quick result
      quickResult && h('div', { className: 'whatif-card__result' },
        h('div', { className: `whatif-card__verdict whatif-card__verdict--${quickResult.verdict}` },
          quickResult.verdict === 'good' ? '✅' : quickResult.verdict === 'neutral' ? '😐' : '⚠️',
          ' Волна ', quickResult.wave.hours, 'ч',
          ' | Риск ', quickResult.risk.delta > 0 ? '+' : '', quickResult.risk.delta, '%'
        ),
        quickResult.advice[0] && h('div', { className: 'whatif-card__advice' },
          quickResult.advice[0].icon, ' ', quickResult.advice[0].text
        )
      ),
      
      // Modal
      isExpanded && h('div', { className: 'whatif-modal-overlay', onClick: () => setIsExpanded(false) },
        h('div', { className: 'whatif-modal', onClick: (e) => e.stopPropagation() },
          h(WhatIfSimulator, {
            context,
            expanded: true,
            onClose: () => setIsExpanded(false)
          })
        )
      )
    );
  }

  /**
   * What-If Scenario Card
   */
  function ScenarioCard({ scenario }) {
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

  /**
   * What-If Section (v2.0: с InfoButton)
   */
  function WhatIfSection({ scenarios }) {
    if (!scenarios || scenarios.length === 0) return null;
    
    return h('div', { className: 'insights-whatif' },
      h('div', { className: 'insights-whatif__header' },
        h('span', { className: 'insights-whatif__title' }, '🎯 Сценарии'),
        h(InfoButton, {
          infoKey: 'WHATIF',
          debugData: { scenariosCount: scenarios.length }
        })
      ),
      h('div', { className: 'insights-whatif__list' },
        scenarios.map((s, i) =>
          h(ScenarioCard, { key: s.id || i, scenario: s })
        )
      )
    );
  }

  /**
   * Weight Prediction Card (v2.0: с InfoButton)
   */
  function WeightPrediction({ prediction }) {
    if (!prediction || !prediction.available) return null;
    
    const changeClass = prediction.weeklyChange < -0.1 ? 'down' 
      : prediction.weeklyChange > 0.1 ? 'up' 
      : 'stable';
    const changeSign = prediction.weeklyChange > 0 ? '+' : '';
    
    return h('div', { className: 'insights-weight' },
      h('div', { className: 'insights-weight__header' },
        h('span', null, '⚖️ Прогноз веса'),
        h(InfoButton, {
          infoKey: 'WEIGHT_PREDICTION',
          debugData: {
            currentWeight: prediction.currentWeight,
            projectedWeight: prediction.projectedWeight,
            weeklyChange: prediction.weeklyChange,
            slope: prediction.slope,
            dataPoints: prediction.dataPoints
          }
        })
      ),
      h('div', { className: 'insights-weight__body' },
        h('div', { className: 'insights-weight__current' },
          h('div', { className: 'insights-weight__label' }, 'Сейчас'),
          h('div', { className: 'insights-weight__value' }, prediction.currentWeight, ' кг')
        ),
        h('div', { className: 'insights-weight__arrow' },
          '→',
          h('div', { className: `insights-weight__change insights-weight__change--${changeClass}` },
            changeSign, Math.round(prediction.weeklyChange * 10) / 10, ' кг/нед'
          )
        ),
        h('div', { className: 'insights-weight__projected' },
          h('div', { className: 'insights-weight__label' }, 'Через неделю'),
          h('div', { className: 'insights-weight__value' }, prediction.projectedWeight, ' кг')
        )
      )
    );
  }

  /**
   * Weekly Wrap — итоги недели (v2.0: с InfoButton)
   */
  /**
   * WeeklyWrap — итоги недели
   * v3.22.0: Интеграция Extended Analytics summary
   */
  function WeeklyWrap({ wrap, lsGet }) {
    if (!wrap) return null;
    
    // 🆕 v3.22.0: Extended Analytics Summary за неделю
    const extendedSummary = useMemo(() => {
      const U = window.HEYS?.utils;
      const getter = lsGet || U?.lsGet || ((k, d) => {
        try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; }
      });
      const profile = getter('heys_profile', {});
      const pIndex = window.HEYS?.products?.getIndex?.();
      
      let proteinDeficitDays = 0;
      let highStressDays = 0;
      let trainingDays = 0;
      let avgEmotionalRisk = 0;
      let totalDays = 0;
      
      // Анализ за 7 дней
      for (let i = 0; i < 7; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const day = getter(`heys_dayv2_${dateStr}`, {});
        
        if (!day.meals || day.meals.length === 0) continue;
        totalDays++;
        
        // Protein analysis
        let dayProtein = 0;
        let dayKcal = 0;
        
        for (const meal of day.meals) {
          for (const item of (meal.items || [])) {
            const product = pIndex?.byId?.get(item.product_id) || item;
            const grams = item.grams || 0;
            dayProtein += (product.protein100 || 0) * grams / 100;
            dayKcal += (product.kcal100 || 0) * grams / 100;
          }
        }
        
        const targetProtein = (dayKcal * 0.25) / 4;
        if (targetProtein > 0 && dayProtein < targetProtein * 0.8) {
          proteinDeficitDays++;
        }
        
        // Stress
        if (day.stressAvg >= 6) highStressDays++;
        
        // Training
        if (day.trainings?.length > 0) trainingDays++;
        
        // Emotional risk accumulator
        let dayRisk = 0;
        if (day.stressAvg >= 6) dayRisk += 35;
        else if (day.stressAvg >= 4) dayRisk += 15;
        const sleepDef = (profile.sleepHours || 8) - (day.sleepHours || 0);
        if (sleepDef > 2) dayRisk += 15;
        avgEmotionalRisk += dayRisk;
      }
      
      if (totalDays > 0) {
        avgEmotionalRisk = Math.round(avgEmotionalRisk / totalDays);
      }
      
      return {
        proteinDeficitDays,
        highStressDays,
        trainingDays,
        avgEmotionalRisk,
        totalDays,
        hasData: totalDays >= 3
      };
    }, [wrap, lsGet]);
    
    return h('div', { className: 'insights-wrap' },
      h('div', { className: 'insights-wrap__header' },
        h('span', { className: 'insights-wrap__title' }, '📋 Итоги'),
        h(InfoButton, {
          infoKey: 'WEEKLY_WRAP',
          debugData: {
            daysWithData: wrap.daysWithData,
            healthScore: wrap.healthScore,
            bestDay: wrap.bestDay,
            hiddenWinsCount: wrap.hiddenWins?.length || 0
          }
        })
      ),
      h('div', { className: 'insights-wrap__summary' },
        h('div', { className: 'insights-wrap__stat' },
          h('div', { className: 'insights-wrap__stat-value' }, wrap.daysWithData),
          h('div', { className: 'insights-wrap__stat-label' }, 'дней с данными')
        ),
        h('div', { className: 'insights-wrap__stat' },
          h('div', { className: 'insights-wrap__stat-value' }, wrap.healthScore),
          h('div', { className: 'insights-wrap__stat-label' }, 'Health Score')
        )
      ),
      
      // 🆕 v3.22.0: Extended Analytics Summary
      extendedSummary.hasData && h('div', { className: 'insights-wrap__extended' },
        h('div', { className: 'insights-wrap__extended-title' }, '🧠 Расширенная аналитика'),
        h('div', { className: 'insights-wrap__extended-grid' },
          // Protein Debt Days
          h('div', { 
            className: `insights-wrap__extended-item ${extendedSummary.proteinDeficitDays >= 3 ? 'insights-wrap__extended-item--warning' : ''}`
          },
            h('span', { className: 'insights-wrap__extended-value' }, 
              extendedSummary.proteinDeficitDays === 0 ? '✅' : extendedSummary.proteinDeficitDays
            ),
            h('span', { className: 'insights-wrap__extended-label' }, 
              extendedSummary.proteinDeficitDays === 0 ? 'Белок ОК' : 'дн. мало белка'
            ),
            extendedSummary.proteinDeficitDays >= 3 && h('a', {
              href: 'https://pubmed.ncbi.nlm.nih.gov/20095013/',
              target: '_blank',
              className: 'insights-wrap__extended-pmid',
              title: 'Mettler 2010 — белок при дефиците'
            }, '🔬')
          ),
          
          // High Stress Days
          h('div', { 
            className: `insights-wrap__extended-item ${extendedSummary.highStressDays >= 3 ? 'insights-wrap__extended-item--warning' : ''}`
          },
            h('span', { className: 'insights-wrap__extended-value' }, 
              extendedSummary.highStressDays === 0 ? '😌' : extendedSummary.highStressDays
            ),
            h('span', { className: 'insights-wrap__extended-label' }, 
              extendedSummary.highStressDays === 0 ? 'Стресс ОК' : 'дн. стресс ≥6'
            ),
            extendedSummary.highStressDays >= 3 && h('a', {
              href: 'https://pubmed.ncbi.nlm.nih.gov/11070333/',
              target: '_blank',
              className: 'insights-wrap__extended-pmid',
              title: 'Epel 2001 — стресс и переедание'
            }, '🔬')
          ),
          
          // Training Days
          h('div', { className: 'insights-wrap__extended-item insights-wrap__extended-item--positive' },
            h('span', { className: 'insights-wrap__extended-value' }, 
              extendedSummary.trainingDays === 0 ? '—' : `💪 ${extendedSummary.trainingDays}`
            ),
            h('span', { className: 'insights-wrap__extended-label' }, 'тренировок')
          ),
          
          // Avg Emotional Risk
          h('div', { 
            className: `insights-wrap__extended-item ${extendedSummary.avgEmotionalRisk >= 40 ? 'insights-wrap__extended-item--warning' : ''}`
          },
            h('span', { className: 'insights-wrap__extended-value' }, 
              extendedSummary.avgEmotionalRisk < 20 ? '🧘' : `${extendedSummary.avgEmotionalRisk}%`
            ),
            h('span', { className: 'insights-wrap__extended-label' }, 
              extendedSummary.avgEmotionalRisk < 20 ? 'Эмоц. ОК' : 'ср. эмоц.риск'
            )
          )
        )
      ),
      
      wrap.bestDay && h('div', { className: 'insights-wrap__highlight' },
        h('div', { className: 'insights-wrap__highlight-title' }, '🏆 Лучший день'),
        h('div', { className: 'insights-wrap__highlight-value' },
          wrap.bestDay.date, ' — ', wrap.bestDay.kcal, ' ккал'
        )
      ),
      wrap.hiddenWins && wrap.hiddenWins.length > 0 && h('div', { className: 'insights-wins' },
        h('div', { className: 'insights-wins__title' }, '🎯 Скрытые победы'),
        wrap.hiddenWins.map((win, i) =>
          h('div', { key: i, className: 'insights-win' }, win)
        )
      )
    );
  }

  /**
   * Empty State — нет данных
   */
  function EmptyState({ daysAnalyzed, minRequired }) {
    const progress = Math.min(100, Math.round((daysAnalyzed / minRequired) * 100));
    const daysLeft = Math.max(0, minRequired - daysAnalyzed);
    
    // Мотивирующие сообщения в зависимости от прогресса
    const getMessage = () => {
      if (daysAnalyzed === 0) return 'Начните вести дневник — и аналитика заработает!';
      if (progress < 50) return 'Отличное начало! Продолжайте вести дневник';
      if (progress < 100) return 'Почти готово! Осталось совсем немного';
      return 'Данные собраны! Анализируем...';
    };
    
    return h('div', { className: 'insights-empty' },
      // Анимированная иконка
      h('div', { className: 'insights-empty__icon' }, '🔮'),
      
      // Заголовок
      h('div', { className: 'insights-empty__title' }, 'Собираем данные для аналитики'),
      
      // Подзаголовок с мотивацией
      h('div', { className: 'insights-empty__subtitle' }, getMessage()),
      
      // Прогресс-бар
      h('div', { className: 'insights-empty__progress' },
        h('div', { 
          className: 'insights-empty__progress-fill',
          style: { width: `${progress}%` }
        })
      ),
      
      // Статистика
      h('div', { className: 'insights-empty__stats' },
        h('div', { style: { textAlign: 'center' } },
          h('div', { className: 'insights-empty__stat-value insights-empty__stat-value--primary' }, daysAnalyzed),
          h('div', { className: 'insights-empty__stat-label' }, 'дней есть')
        ),
        h('div', { style: { textAlign: 'center' } },
          h('div', { className: 'insights-empty__stat-value insights-empty__stat-value--secondary' }, daysLeft),
          h('div', { className: 'insights-empty__stat-label' }, 'осталось')
        )
      ),
      
      // Что будет доступно
      h('div', { className: 'insights-empty__features' },
        h('div', { className: 'insights-empty__features-title' }, '✨ Скоро будет доступно:'),
        h('div', { className: 'insights-empty__feature-list' },
          h('div', { className: 'insights-empty__feature-item' },
            h('span', null, '📊'), 'Статус здоровья 0-100'
          ),
          h('div', { className: 'insights-empty__feature-item' },
            h('span', null, '🧬'), 'Метаболический фенотип'
          ),
          h('div', { className: 'insights-empty__feature-item' },
            h('span', null, '💡'), 'Персональные рекомендации'
          ),
          h('div', { className: 'insights-empty__feature-item' },
            h('span', null, '📈'), 'Прогнозы и паттерны'
          )
        )
      )
    );
  }

  /**
   * Main Insights Card — главный компонент
   */
  function InsightsCard({ lsGet, profile, pIndex, optimum }) {
    const [activeTab, setActiveTab] = useState('today');
    const [selectedCategory, setSelectedCategory] = useState(null);
    
    const insights = useMemo(() => {
      return analyze({
        daysBack: activeTab === 'today' ? 7 : 14,
        lsGet,
        profile,
        pIndex,
        optimum
      });
    }, [activeTab, lsGet, profile, pIndex, optimum]);
    
    // Собираем context для What-If симулятора
    const whatIfContext = useMemo(() => {
      if (!lsGet) return null;
      
      const todayKey = new Date().toISOString().slice(0, 10);
      const today = lsGet(`heys_dayv2_${todayKey}`, {});
      const dayTot = today.dayTot || { kcal: 0, prot: 0, carbs: 0, fat: 0 };
      
      // Текущая волна
      let currentWave = null;
      if (HEYS.InsulinWave?.calculate && today.meals?.length > 0) {
        try {
          currentWave = HEYS.InsulinWave.calculate({
            meals: today.meals,
            pIndex,
            getProductFromItem: (item) => pIndex?.byId?.get(item.product_id) || item,
            baseWaveHours: profile?.insulinWaveHours || 3,
            trainings: today.trainings || [],
            dayData: {
              sleepHours: today.sleepHours,
              sleepQuality: today.sleepQuality,
              waterMl: today.waterMl,
              stressAvg: today.stressAvg,
              householdMin: today.householdMin,
              steps: today.steps,
              profile
            }
          });
        } catch (e) {
          console.warn('[WhatIfSimulator] Failed to calculate wave:', e);
        }
      }
      
      // Текущий риск срыва
      let currentRisk = 0;
      if (HEYS.Metabolic?.calculateCrashRisk24h) {
        try {
          const riskData = HEYS.Metabolic.calculateCrashRisk24h({
            today,
            profile,
            kcalPct: optimum ? dayTot.kcal / optimum : 0,
            proteinPct: dayTot.prot ? dayTot.prot / ((optimum || 2000) * 0.25 / 4) : 0
          });
          currentRisk = riskData?.risk || 0;
        } catch (e) {}
      }
      
      return {
        currentWave,
        currentRisk,
        dayTot,
        optimum,
        profile,
        trainings: today.trainings || []
      };
    }, [lsGet, profile, pIndex, optimum]);
    
    if (!insights.available) {
      return h('div', { className: 'insights-card' },
        h('div', { className: 'insights-card__header' },
          h('div', { className: 'insights-card__title' }, '📊 Инсайты недели')
        ),
        h(EmptyState, {
          daysAnalyzed: insights.daysAnalyzed,
          minRequired: insights.minDaysRequired
        })
      );
    }
    
    return h('div', { className: 'insights-card' },
      h('div', { className: 'insights-card__header' },
        h('div', { className: 'insights-card__title' },
          '📊 Инсайты недели',
          h('span', { className: 'insights-card__badge' }, insights.healthScore.total)
        )
      ),
      h('div', { className: 'insights-card__tabs' },
        h('button', {
          className: `insights-card__tab ${activeTab === 'today' ? 'insights-card__tab--active' : ''}`,
          onClick: () => setActiveTab('today')
        }, 'Сегодня'),
        h('button', {
          className: `insights-card__tab ${activeTab === 'week' ? 'insights-card__tab--active' : ''}`,
          onClick: () => setActiveTab('week')
        }, 'Неделя')
      ),
      
      // Health Score кольца
      h(TotalHealthRing, { score: insights.healthScore.total }),
      h(HealthRingsGrid, {
        healthScore: insights.healthScore,
        onCategoryClick: setSelectedCategory
      }),
      
      // 🧪 What-If Simulator (новый!)
      activeTab === 'today' && whatIfContext && h(WhatIfCard, { context: whatIfContext }),
      
      // Старая What-If секция (сценарии на основе истории)
      h(WhatIfSection, { scenarios: insights.whatIf }),
      
      // Weight Prediction
      h(WeightPrediction, { prediction: insights.weightPrediction }),
      
      // Паттерны (сворачиваемый список)
      activeTab === 'week' && h(PatternsList, { patterns: insights.patterns }),
      
      // Weekly Wrap
      activeTab === 'week' && h(WeeklyWrap, { wrap: insights.weeklyWrap })
    );
  }

  // === PRIORITY UI COMPONENTS ===
  
  /**
   * PriorityBadge — визуализация приоритета с emoji и цветом
   */
  function PriorityBadge({ priority, showLabel = false, size = 'normal' }) {
    const config = PRIORITY_LEVELS[priority] || PRIORITY_LEVELS.INFO;
    
    return h('span', {
      className: `priority-badge priority-badge--${priority?.toLowerCase() || 'info'} priority-badge--${size}`,
      style: { 
        '--priority-color': config.color,
        backgroundColor: config.color + '20',
        color: config.color,
        borderColor: config.color + '40'
      },
      title: config.description
    },
      h('span', { className: 'priority-badge__emoji' }, config.emoji),
      showLabel && h('span', { className: 'priority-badge__label' }, config.name)
    );
  }

  /**
   * CategoryBadge — бейдж категории
   */
  function CategoryBadge({ category, showLabel = true }) {
    const config = CATEGORIES[category] || CATEGORIES.STATISTICS;
    
    return h('span', {
      className: `category-badge category-badge--${category?.toLowerCase() || 'statistics'}`,
      style: {
        '--category-color': config.color,
        backgroundColor: config.color + '15',
        color: config.color
      },
      title: config.description
    },
      h('span', { className: 'category-badge__emoji' }, config.emoji),
      showLabel && h('span', { className: 'category-badge__label' }, config.name)
    );
  }

  /**
   * ActionabilityBadge — срочность действия
   */
  function ActionabilityBadge({ actionability }) {
    const config = ACTIONABILITY[actionability] || ACTIONABILITY.INFORMATIONAL;
    
    return h('span', {
      className: `actionability-badge actionability-badge--${actionability?.toLowerCase() || 'informational'}`,
      title: config.description
    },
      h('span', { className: 'actionability-badge__emoji' }, config.emoji),
      h('span', { className: 'actionability-badge__label' }, config.name)
    );
  }

  /**
   * CategoryFilterBar — фильтры по категориям
   */
  function CategoryFilterBar({ selectedCategory, onCategoryChange, metrics }) {
    // Подсчёт метрик в каждой категории
    const categoryCounts = useMemo(() => {
      const counts = {};
      for (const cat of Object.keys(CATEGORIES)) {
        counts[cat] = metrics?.filter(m => m.category === cat).length || 0;
      }
      return counts;
    }, [metrics]);
    
    return h('div', { className: 'category-filter-bar' },
      // All button
      h('button', {
        className: `category-filter-bar__btn ${!selectedCategory ? 'active' : ''}`,
        onClick: () => onCategoryChange(null)
      },
        h('span', { className: 'category-filter-bar__emoji' }, '📊'),
        h('span', { className: 'category-filter-bar__label' }, 'Все'),
        h('span', { className: 'category-filter-bar__count' }, metrics?.length || 0)
      ),
      
      // Category buttons
      Object.entries(CATEGORIES).map(([key, config]) => {
        const count = categoryCounts[key];
        if (count === 0) return null;
        
        return h('button', {
          key,
          className: `category-filter-bar__btn ${selectedCategory === key ? 'active' : ''}`,
          onClick: () => onCategoryChange(key),
          style: { '--cat-color': config.color }
        },
          h('span', { className: 'category-filter-bar__emoji' }, config.emoji),
          h('span', { className: 'category-filter-bar__label' }, config.name),
          h('span', { className: 'category-filter-bar__count' }, count)
        );
      })
    );
  }

  /**
   * PriorityFilterBar — фильтры по приоритету
   */
  function PriorityFilterBar({ selectedPriority, onPriorityChange, metrics }) {
    // Подсчёт метрик в каждом приоритете
    const priorityCounts = useMemo(() => {
      const counts = {};
      for (const pri of Object.keys(PRIORITY_LEVELS)) {
        counts[pri] = metrics?.filter(m => m.priority === pri).length || 0;
      }
      return counts;
    }, [metrics]);
    
    return h('div', { className: 'priority-filter-bar' },
      // All button
      h('button', {
        className: `priority-filter-bar__btn ${!selectedPriority ? 'active' : ''}`,
        onClick: () => onPriorityChange(null)
      },
        '🔮 Всё'
      ),
      
      // Priority buttons (только CRITICAL, HIGH, MEDIUM — остальные редко нужны как фильтр)
      ['CRITICAL', 'HIGH', 'MEDIUM'].map(key => {
        const config = PRIORITY_LEVELS[key];
        const count = priorityCounts[key];
        if (count === 0) return null;
        
        return h('button', {
          key,
          className: `priority-filter-bar__btn ${selectedPriority === key ? 'active' : ''}`,
          onClick: () => onPriorityChange(key),
          style: { '--pri-color': config.color }
        },
          h('span', null, config.emoji),
          h('span', null, ` ${config.name}`),
          h('span', { className: 'priority-filter-bar__count' }, count)
        );
      })
    );
  }

  /**
   * SectionHeader — заголовок секции с приоритетом
   */
  function SectionHeader({ title, icon, priority, infoKey, badge }) {
    const priorityConfig = PRIORITY_LEVELS[priority] || PRIORITY_LEVELS.INFO;
    
    return h('div', { className: 'section-header section-header--with-priority' },
      h('div', { className: 'section-header__left' },
        icon && h('span', { className: 'section-header__icon' }, icon),
        h('span', { className: 'section-header__title' }, title),
        priority && h(PriorityBadge, { priority, size: 'small' })
      ),
      h('div', { className: 'section-header__right' },
        badge && h('span', { className: 'section-header__badge' }, badge),
        infoKey && h(InfoButton, { infoKey })
      )
    );
  }

  // === INSIGHTS TAB — Полноэкранная вкладка ===
  // Секции отсортированы по приоритету: CRITICAL → HIGH → MEDIUM → LOW
  // 🎭 Демо-данные для показа тура новым пользователям
  const DEMO_INSIGHTS = {
    available: true,
    isDemo: true,
    daysAnalyzed: 7,
    daysWithData: 7,
    confidence: 85,
    isFullAnalysis: false,
    patterns: [
      {
        id: 'demo_meal_timing',
        type: 'timing',
        name: 'Оптимальное время приёмов',
        priority: 'HIGH',
        confidence: 0.82,
        impact: 0.7,
        desc: 'Ваши завтраки в 8-9 утра идеально синхронизированы с циркадными ритмами',
        recommendation: 'Продолжайте завтракать в это время — метаболизм работает оптимально',
        trend: 'stable',
        science: { pmid: '9331550', category: 'TIMING' }
      },
      {
        id: 'demo_protein',
        type: 'nutrition',
        name: 'Распределение белка',
        priority: 'MEDIUM',
        confidence: 0.75,
        impact: 0.6,
        desc: 'Белок распределён равномерно: ~30г на приём',
        recommendation: 'Отличный баланс! Это оптимально для синтеза мышечного белка',
        trend: 'improving',
        science: { pmid: '23360586', category: 'NUTRITION' }
      }
    ],
    healthScore: {
      total: 78,
      trend: 'improving',
      categories: {
        nutrition: { score: 82, trend: 'stable' },
        timing: { score: 75, trend: 'improving' },
        recovery: { score: 72, trend: 'stable' },
        activity: { score: 80, trend: 'improving' }
      }
    },
    whatIf: [
      {
        id: 'demo_whatif_1',
        title: '+30 мин ходьбы',
        impact: '+5% к сжиганию',
        desc: 'Добавьте прогулку после обеда',
        priority: 'MEDIUM'
      }
    ],
    weightPrediction: {
      available: true,
      currentTrend: -0.3,
      weeklyRate: -0.3,
      projectedDays: 60,
      confidence: 0.7
    },
    weeklyWrap: {
      highlights: ['Стабильный режим питания', 'Хороший баланс БЖУ'],
      improvements: ['Добавьте больше клетчатки'],
      avgScore: 78
    }
  };

  // 🎭 Демо-статус для тура
  const DEMO_STATUS = {
    score: 78,
    level: {
      id: 'good',
      label: 'Хорошо',
      emoji: '✓',
      color: '#22c55e'
    },
    factorScores: {
      kcal: 85,
      protein: 80,
      timing: 70,
      steps: 75,
      training: 60,
      household: 50,
      sleep: 85,
      stress: 70,
      water: 90
    },
    categoryScores: {
      nutrition: { score: 78, label: 'Питание', icon: '🍽️', color: '#22c55e' },
      activity: { score: 62, label: 'Активность', icon: '🏃', color: '#eab308' },
      recovery: { score: 77, label: 'Восстановление', icon: '😴', color: '#22c55e' },
      hydration: { score: 90, label: 'Гидратация', icon: '💧', color: '#22c55e' }
    },
    topIssues: [
      { factor: { icon: '🏋️', label: 'Тренировки' }, score: 60 },
      { factor: { icon: '⏰', label: 'Тайминг' }, score: 70 }
    ],
    topActions: [
      'Добавьте тренировку',
      'Оптимизируйте время приёмов'
    ]
  };

  function InsightsTab({ lsGet, profile, pIndex, optimum, selectedDate, dayData, dayTot, normAbs, waterGoal }) {
    const [activeTab, setActiveTab] = useState('today');
    const [selectedCategory, setSelectedCategory] = useState(null);
    const [priorityFilter, setPriorityFilter] = useState(null); // null = показать всё
    
    // 🎯 State для отслеживания прохождения тура (нужен для перерисовки после завершения)
    // 🔧 v1.13 FIX: Проверяем ОБА источника — scoped (HEYS.store) И unscoped (localStorage)
    const [insightsTourCompleted, setInsightsTourCompleted] = useState(() => {
      try {
        // 1. Сначала проверяем scoped хранилище (для существующих пользователей)
        const scopedValue = HEYS.store?.get?.('heys_insights_tour_completed');
        if (scopedValue === true || scopedValue === 'true') return true;
        // 2. Затем fallback на unscoped localStorage
        return localStorage.getItem('heys_insights_tour_completed') === 'true';
      } catch { return true; }
    });
    
    // Слушаем изменения localStorage для переключения из демо-режима
    useEffect(() => {
      const handleStorageChange = () => {
        try {
          // 🔧 v1.13: Проверяем оба источника
          const scopedValue = HEYS.store?.get?.('heys_insights_tour_completed');
          const unscopedValue = localStorage.getItem('heys_insights_tour_completed') === 'true';
          const completed = scopedValue === true || scopedValue === 'true' || unscopedValue;
          if (completed !== insightsTourCompleted) {
            console.log('[InsightsTab] Tour status changed:', completed, '(scoped:', scopedValue, ', unscoped:', unscopedValue, ')');
            setInsightsTourCompleted(completed);
          }
        } catch { /* игнорируем */ }
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
  function InfoButton({ infoKey, debugData, size }) {
    const [isOpen, setIsOpen] = useState(false);
    
    const info = SCIENCE_INFO[infoKey];
    if (!info) return null;
    
    const handleButtonClick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (navigator.vibrate) navigator.vibrate(10);
      setIsOpen(true);
    };
    
    const handleOverlayClick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      setIsOpen(false);
    };
    
    const handleModalClick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Не закрываем при клике внутри модалки
    };
    
    const handleCloseClick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      setIsOpen(false);
    };
    
    // Рендерим модалку через Portal в body
    const modal = isOpen && ReactDOM.createPortal(
      h('div', { 
        className: 'info-modal-overlay', 
        onClick: handleOverlayClick,
        onTouchEnd: handleOverlayClick
      },
        h('div', { 
          className: 'info-modal', 
          onClick: handleModalClick,
          onTouchEnd: handleModalClick
        },
          // Header
          h('div', { className: 'info-modal__header' },
            h('span', { className: 'info-modal__title' }, info.name),
            h('button', { 
              className: 'info-modal__close', 
              onClick: handleCloseClick,
              onTouchEnd: handleCloseClick,
              type: 'button'
            }, '×')
          ),
          
          // Formula
          h('div', { className: 'info-modal__section' },
            h('div', { className: 'info-modal__label' }, '📐 Формула'),
            h('pre', { className: 'info-modal__formula' }, info.formula)
          ),
          
          // Source
          info.source && h('div', { className: 'info-modal__section' },
            h('div', { className: 'info-modal__label' }, '📚 Источник'),
            h('div', { className: 'info-modal__source' },
              info.pmid 
                ? h('a', {
                    href: `https://pubmed.ncbi.nlm.nih.gov/${info.pmid}/`,
                    target: '_blank',
                    rel: 'noopener noreferrer',
                    className: 'info-modal__link',
                    onClick: (e) => e.stopPropagation()
                  }, `${info.source} (PMID: ${info.pmid})`)
                : info.source
            )
          ),
          
          // Interpretation
          info.interpretation && h('div', { className: 'info-modal__section' },
            h('div', { className: 'info-modal__label' }, '💡 Интерпретация'),
            h('div', { className: 'info-modal__text' }, info.interpretation)
          ),
          
          // Debug data (for testing)
          debugData && h('div', { className: 'info-modal__section info-modal__section--debug' },
            h('div', { className: 'info-modal__label' }, '🔧 Debug'),
            h('pre', { className: 'info-modal__debug' },
              JSON.stringify(debugData, null, 2)
            )
          )
        )
      ),
      document.body
    );
    
    return h('span', { className: 'info-button-wrapper' },
      // Кнопка (?)
      h('button', {
        className: `info-button ${size === 'small' ? 'info-button--small' : ''}`,
        onClick: handleButtonClick,
        onTouchEnd: handleButtonClick,
        type: 'button',
        title: 'Как это считается?'
      }, '?'),
      modal
    );
  }

  /**
   * Метрика с кнопкой info — переиспользуемый компонент
   */
  function MetricWithInfo({ label, value, unit, infoKey, debugData, color, className }) {
    return h('div', { className: `metric-with-info ${className || ''}` },
      h('div', { className: 'metric-with-info__row' },
        h('span', { className: 'metric-with-info__label' }, label),
        h(InfoButton, { infoKey, debugData })
      ),
      h('div', { className: 'metric-with-info__value', style: color ? { color } : null },
        value,
        unit && h('span', { className: 'metric-with-info__unit' }, ` ${unit}`)
      )
    );
  }

  // === METABOLIC INTELLIGENCE UI COMPONENTS ===
  
  /**
   * StatusProgressRing — SVG кольцо прогресса 0-100 с count-up анимацией
   */
  function StatusTrendBadge({ currentScore, prevScore }) {
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
            })
          )
        );
      })
    );
  }
  
  /**
   * ConfidenceBadge — бейдж уверенности (low/medium/high)
   */
  function ConfidenceBadge({ confidence, completeness }) {
    const config = {
      high: { label: 'Высокая', color: '#22c55e', icon: '✓' },
      medium: { label: 'Средняя', color: '#eab308', icon: '~' },
      low: { label: 'Низкая', color: '#ef4444', icon: '?' }
    };
    
    const c = config[confidence] || config.low;
    
    return h('div', { 
      className: 'confidence-badge',
      style: { borderColor: c.color }
    },
      h('span', { 
        className: 'confidence-badge__icon',
        style: { backgroundColor: c.color }
      }, c.icon),
      h('span', { className: 'confidence-badge__label' }, 
        `${c.label} уверенность`
      ),
      completeness !== undefined && h('span', { className: 'confidence-badge__pct' },
        ` (${completeness}% данных)`
      )
    );
  }
  
  /**
   * MetabolicQuickStatus — компактная карточка статуса + риска
   * Показывает: Score 0-100, фазу метаболизма, риск срыва
   */
  function MetabolicQuickStatus({ lsGet, profile, pIndex, selectedDate }) {
    const status = useMemo(() => {
      if (!HEYS.Metabolic?.getStatus) return null;
      
      return HEYS.Metabolic.getStatus({
        dateStr: selectedDate || new Date().toISOString().split('T')[0],
        pIndex: pIndex || window.HEYS?.products?.buildIndex?.(),
        profile: profile || window.HEYS?.utils?.lsGet?.('heys_profile', {}),
        forceRefresh: false
      });
    }, [lsGet, profile, pIndex, selectedDate]);
    
    // 🆕 v3.22.0: Extended Analytics (proteinDebt, emotionalRisk, trainingContext)
    const extendedAnalytics = useMemo(() => {
      const getter = lsGet || window.HEYS?.utils?.lsGet;
      if (!getter) return null;
      
      const dateStr = selectedDate || new Date().toISOString().split('T')[0];
      const prof = profile || getter('heys_profile', {});
      const day = getter('heys_dayv2_' + dateStr, {});
      
      // Protein Debt: анализ последних 3 дней
      let proteinDebt = { hasDebt: false, severity: 'none', avgProteinPct: 0 };
      try {
        const proteinDays = [];
        for (let i = 1; i <= 3; i++) {
          const d = new Date(dateStr);
          d.setDate(d.getDate() - i);
          const dStr = d.toISOString().split('T')[0];
          const dData = getter('heys_dayv2_' + dStr, {});
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
  function MetabolicStatusCard({ lsGet, profile, pIndex, selectedDate }) {
    const [showDetails, setShowDetails] = useState(false);
    
    // Получаем текущий статус
    const status = useMemo(() => {
      if (!HEYS.Metabolic?.getStatus) return null;
      
      return HEYS.Metabolic.getStatus({
        dateStr: selectedDate || new Date().toISOString().split('T')[0],
        pIndex: pIndex || window.HEYS?.products?.buildIndex?.(),
        profile: profile || window.HEYS?.utils?.lsGet?.('heys_profile', {}),
        forceRefresh: false
      });
    }, [lsGet, profile, pIndex, selectedDate]);
    
    // Получаем вчерашний статус для тренда
    const prevStatus = useMemo(() => {
      if (!HEYS.Metabolic?.getStatus) return null;
      
      const today = selectedDate || new Date().toISOString().split('T')[0];
      const prevDate = new Date(today);
      prevDate.setDate(prevDate.getDate() - 1);
      const prevDateStr = prevDate.toISOString().split('T')[0];
      
      try {
        return HEYS.Metabolic.getStatus({
          dateStr: prevDateStr,
          pIndex: pIndex || window.HEYS?.products?.buildIndex?.(),
          profile: profile || window.HEYS?.utils?.lsGet?.('heys_profile', {}),
          forceRefresh: false
        });
      } catch {
        return null;
      }
    }, [lsGet, profile, pIndex, selectedDate]);
    
    // Вычисляем breakdown по столпам из reasons
    const pillarScores = useMemo(() => {
      if (!status?.reasons?.length) return null;
      
      const pillars = { nutrition: 100, timing: 100, activity: 100, recovery: 100 };
      status.reasons.forEach(r => {
        if (r.pillar && pillars[r.pillar] !== undefined) {
          pillars[r.pillar] = Math.max(0, pillars[r.pillar] - (r.impact || 10));
        }
      });
      return pillars;
    }, [status]);
    
    if (!status || !status.available) {
      return h('div', { className: 'metabolic-status-card metabolic-status-card--empty' },
        h('div', { className: 'metabolic-status-card__icon' }, '📊'),
        h('div', { className: 'metabolic-status-card__message' },
          status?.message || 'Добавь данные для анализа статуса'
        )
      );
    }
    
    // Эмодзи по risk level
    const riskEmojis = {
      low: '✅',
      medium: '⚠️',
      high: '🚨'
    };
    
    return h('div', { className: `metabolic-status-card metabolic-status-card--v2 ${showDetails ? 'metabolic-status-card--expanded' : ''}` },
      // Заголовок с ring и trend
      h('div', { 
        className: 'metabolic-status-card__header metabolic-status-card__header--v2',
        onClick: () => setShowDetails(!showDetails)
      },
        h('div', { className: 'metabolic-status-card__ring-container' },
          h(StatusProgressRing, { score: status.score, size: 100, strokeWidth: 8 }),
          prevStatus?.available && h(StatusTrendBadge, { 
            currentScore: status.score, 
            prevScore: prevStatus.score 
          })
        ),
        h('div', { className: 'metabolic-status-card__info' },
          h('div', { className: 'metabolic-status-card__title-v2' }, 'Метаболический Статус'),
          // Metabolic Phase
          status.metabolicPhase && h('div', { className: 'metabolic-status-card__phase' },
            h('span', { className: 'metabolic-status-card__phase-emoji' }, status.metabolicPhase.emoji),
            h('span', { className: 'metabolic-status-card__phase-label' }, status.metabolicPhase.label),
            status.metabolicPhase.timeToLipolysis > 0 && h('span', { className: 'metabolic-status-card__phase-time' },
              ` → ${Math.round(status.metabolicPhase.timeToLipolysis * 60)} мин`
            )
          ),
          // Risk Level
          h('div', { className: `metabolic-status-card__risk metabolic-status-card__risk--${status.riskLevel}` },
            h('span', { className: 'metabolic-status-card__risk-emoji' }, riskEmojis[status.riskLevel]),
            h('span', { className: 'metabolic-status-card__risk-label' },
              status.riskLevel === 'low' ? 'Низкий риск' :
              status.riskLevel === 'medium' ? 'Средний риск' :
              'Высокий риск'
            )
          )
        ),
        h('span', { className: 'metabolic-status-card__chevron' }, showDetails ? '▼' : '▶')
      ),
      
      // Breakdown по столпам (всегда видим)
      pillarScores && h('div', { className: 'metabolic-status-card__breakdown' },
        h(PillarBreakdownBars, { pillars: pillarScores })
      ),
      
      // Детали (развернутые)
      showDetails && h('div', { className: 'metabolic-status-card__details' },
        // Причины снижения статуса
        status.reasons && status.reasons.length > 0 && h('div', { className: 'metabolic-status-card__section' },
          h('div', { className: 'metabolic-status-card__section-header' },
            h('span', { className: 'metabolic-status-card__section-title' }, '📉 Что влияет на статус'),
            h(InfoButton, { infoKey: 'STATUS_INFLUENCES', size: 'small' })
          ),
          h('div', { className: 'metabolic-status-card__reasons' },
            status.reasons.map((reason, idx) =>
              h(ReasonCard, { key: reason.id || idx, reason })
            )
          )
        ),
        
        // Приоритизированные действия
        status.nextSteps && status.nextSteps.length > 0 && h('div', { className: 'metabolic-status-card__section' },
          h('div', { className: 'metabolic-status-card__section-header' },
            h('span', { className: 'metabolic-status-card__section-title' }, '🎯 Приоритетные действия'),
            h(InfoButton, { infoKey: 'PRIORITY_ACTIONS', size: 'small' })
          ),
          h('div', { className: 'metabolic-status-card__steps' },
            status.nextSteps.slice(0, 3).map((step, idx) =>
              h(ActionCard, { key: step.id || idx, step })
            )
          )
        ),
        
        // Риск факторы
        status.riskFactors && status.riskFactors.length > 0 && h('div', { className: 'metabolic-status-card__section' },
          h('div', { className: 'metabolic-status-card__section-header' },
            h('span', { className: 'metabolic-status-card__section-title' }, 
              `${riskEmojis[status.riskLevel]} Факторы риска`
            ),
            h(InfoButton, { infoKey: 'STATUS_RISK_FACTORS', size: 'small' })
          ),
          h('div', { className: 'metabolic-status-card__risk-factors' },
            status.riskFactors.map((factor, idx) =>
              h('div', { key: factor.id || idx, className: 'metabolic-status-card__risk-factor' },
                h('span', { className: 'metabolic-status-card__risk-factor-label' }, factor.label),
                h('span', { className: 'metabolic-status-card__risk-factor-impact' }, `+${factor.impact}`)
              )
            )
          )
        ),
        
        // Confidence Badge
        h('div', { className: 'metabolic-status-card__confidence-section' },
          h(ConfidenceBadge, { 
            confidence: status.confidence,
            completeness: status.debug?.inventory?.completeness 
          })
        )
      )
    );
  }
  
  /**
   * ReasonCard — карточка причины снижения статуса
   */
  function ReasonCard({ reason }) {
    const [showScience, setShowScience] = useState(false);
    
    const pillarIcons = {
      nutrition: '🍽️',
      timing: '⏰',
      activity: '🏃',
      recovery: '😴'
    };
    
    return h('div', { className: `reason-card reason-card--${reason.pillar}` },
      h('div', { className: 'reason-card__header' },
        h('span', { className: 'reason-card__icon' }, pillarIcons[reason.pillar] || '📊'),
        h('span', { className: 'reason-card__label' }, reason.label),
        h('span', { className: 'reason-card__impact' }, `-${reason.impact}`)
      ),
      h('div', { className: 'reason-card__short' }, reason.short),
      reason.details && h('div', { className: 'reason-card__details' }, reason.details),
      reason.scientificBasis && h('div', { className: 'reason-card__science' },
        h('button', {
          className: 'reason-card__science-toggle',
          onClick: () => setShowScience(!showScience)
        }, showScience ? '📖 Скрыть обоснование' : '📖 Научное обоснование'),
        showScience && h('div', { className: 'reason-card__science-text' }, reason.scientificBasis)
      )
    );
  }
  
  /**
   * ActionCard — карточка приоритизированного действия
   */
  function ActionCard({ step }) {
    const priorityColors = {
      0: '#ef4444', // urgent
      1: '#f97316', // high
      2: '#eab308', // medium
      3: '#22c55e'  // low
    };
    
    const priorityLabels = {
      0: 'СРОЧНО',
      1: 'Важно',
      2: 'Желательно',
      3: 'Опционально'
    };
    
    return h('div', { className: 'action-card' },
      h('div', { className: 'action-card__header' },
        h('span', { className: 'action-card__label' }, step.label),
        h('span', { 
          className: 'action-card__priority',
          style: { backgroundColor: priorityColors[step.priority || 3] }
        }, priorityLabels[step.priority || 3])
      ),
      step.why && h('div', { className: 'action-card__why' }, step.why),
      h('div', { className: 'action-card__footer' },
        step.etaMin && h('span', { className: 'action-card__eta' },
          `⏱️ ${step.etaMin < 60 ? `${step.etaMin} мин` : `${Math.round(step.etaMin / 60)} ч`}`
        ),
        step.expectedEffect && h('span', { className: 'action-card__effect' },
          `💫 ${step.expectedEffect}`
        )
      )
    );
  }
  
  /**
   * PredictiveDashboard — предиктивная панель с табами (Risk | Forecast | Phenotype)
   * v3.0: Dual Risk Meter (сегодня + завтра), без timeline для risk и phenotype
   */
  function PredictiveDashboard({ lsGet, profile, selectedDate, pIndex }) {
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
      } else if (stressAvg >= 4) {
        factors.push('Умеренный стресс');
        bingeRisk += 15;
      }
      
      const hour = new Date().getHours();
      if (hour >= 20) {
        factors.push('Вечер');
        bingeRisk += 20;
      } else if (hour >= 18) {
        bingeRisk += 10;
      }
      
      const sleepDeficit = (profile.sleepHours || 8) - (day.sleepHours || 0);
      if (sleepDeficit > 2) {
        factors.push('Недосып');
        bingeRisk += 15;
      }
      
      // День дефицита? (недобор калорий)
      const deficitDays = [];
      for (let i = 1; i <= 3; i++) {
        const d = new Date(todayDate);
        d.setDate(d.getDate() - i);
        const pastDay = lsGet(`heys_dayv2_${d.toISOString().split('T')[0]}`, {});
        const optimum = 2000; // примерно
        const eaten = pastDay.meals?.reduce((sum, m) => {
          return sum + (m.items?.reduce((s, item) => s + (item.kcal || 0), 0) || 0);
        }, 0) || 0;
        if (eaten > 0 && eaten < optimum * 0.75) deficitDays.push(i);
      }
      if (deficitDays.length >= 2) {
        factors.push('Калорийный долг');
        bingeRisk += 20;
      }
      
      const emotionalRisk = {
        hasRisk: bingeRisk >= 30 || factors.length >= 2,
        level: bingeRisk >= 60 ? 'high' : bingeRisk >= 40 ? 'medium' : 'low',
        bingeRisk: Math.min(90, bingeRisk),
        factors,
        stressLevel: stressAvg,
        pmid: '11070333'
      };
      
      // Training Context (Aragon 2013, PMID: 23360586)
      const trainings = day.trainings || [];
      const isTrainingDay = trainings.length > 0;
      let trainingType = null;
      let trainingIntensity = 'moderate';
      
      if (isTrainingDay) {
        const t = trainings[0];
        trainingType = t.type || 'cardio';
        const totalMins = (t.z || []).reduce((a, b) => a + b, 0);
        const highZoneMins = (t.z?.[2] || 0) + (t.z?.[3] || 0);
        if (highZoneMins > totalMins * 0.4) trainingIntensity = 'high';
        else if (totalMins < 30) trainingIntensity = 'light';
      }
      
      return { emotionalRisk, isTrainingDay, trainingType, trainingIntensity };
    }, []);
    
    // Расширяем factors emotionalRisk если есть риск
    const getEnhancedFactors = (prediction) => {
      if (!prediction?.factors) return [];
      const factors = [...prediction.factors];
      
      // Добавляем emotionalRisk если высокий
      if (extendedAnalytics.emotionalRisk.hasRisk) {
        const { bingeRisk, factors: riskFactors } = extendedAnalytics.emotionalRisk;
        factors.push({
          label: `🧠 Эмоц. риск: ${riskFactors.slice(0, 2).join(', ')}`,
          weight: Math.round(bingeRisk * 0.3), // переводим в +weight
          pmid: '11070333',
          isEmotional: true
        });
      }
      
      // Добавляем training context как защитный фактор (отрицательный вес)
      if (extendedAnalytics.isTrainingDay) {
        const typeLabels = { strength: '💪 Силовая', cardio: '🏃 Кардио', hobby: '⚽ Хобби' };
        factors.push({
          label: `${typeLabels[extendedAnalytics.trainingType] || '🏋️ Трен.'} сегодня`,
          weight: extendedAnalytics.trainingIntensity === 'high' ? -15 : -10,
          isProtective: true
        });
      }
      
      return factors;
    };
    
    const basePredictionData = activePrediction === 'today' ? predictionToday : predictionTomorrow;
    const activePredictionData = basePredictionData ? {
      ...basePredictionData,
      factors: getEnhancedFactors(basePredictionData)
    } : null;
    const activeLabel = activePrediction === 'today' ? 'Сегодня' : 'Завтра';
    
    const getRiskLevel = (risk) => risk < 30 ? 'low' : risk < 60 ? 'medium' : 'high';
    
    return h('div', { className: 'dual-risk-panel' },
      // Два полукруга рядом
      h('div', { className: 'dual-risk-panel__meters' },
        // Сегодня
        h('div', { 
          className: `dual-risk-panel__meter-card ${activePrediction === 'today' ? 'dual-risk-panel__meter-card--active' : ''}`,
          onClick: () => setActivePrediction('today')
        },
          h('div', { className: 'dual-risk-panel__meter-label' }, 'Сегодня'),
          h(MiniRiskMeter, { 
            risk: todayRisk, 
            riskLevel: getRiskLevel(todayRisk),
            size: 120
          }),
          todayRisk < 30 && h('div', { className: 'dual-risk-panel__ok-badge' }, '✅')
        ),
        
        // Завтра
        h('div', { 
          className: `dual-risk-panel__meter-card ${activePrediction === 'tomorrow' ? 'dual-risk-panel__meter-card--active' : ''}`,
          onClick: () => setActivePrediction('tomorrow')
        },
          h('div', { className: 'dual-risk-panel__meter-label' }, 'Завтра'),
          h(MiniRiskMeter, { 
            risk: tomorrowRisk, 
            riskLevel: getRiskLevel(tomorrowRisk),
            size: 120
          }),
          tomorrowRisk >= 30 && h('div', { className: 'dual-risk-panel__warning-badge' }, '⚠️')
        )
      ),
      
      // Статус строка
      h('div', { className: 'dual-risk-panel__status' },
        maxRisk < 30 
          ? h('span', { className: 'dual-risk-panel__status-ok' }, '✅ Всё под контролем')
          : tomorrowRisk > todayRisk 
            ? h('span', { className: 'dual-risk-panel__status-warn' }, '🔮 Прогноз на будущее')
            : h('span', { className: 'dual-risk-panel__status-warn' }, '⚠️ Требует внимания')
      ),
      
      // Детали активного прогноза
      activePredictionData && h('div', { className: 'dual-risk-panel__details' },
        // Hint - какой день показываем
        h('div', { className: 'dual-risk-panel__details-hint' }, 
          `Детали: ${activeLabel} (нажми на полукруг для переключения)`
        ),
        
        // Primary Trigger
        activePredictionData.primaryTrigger && h('div', { className: 'risk-panel__trigger' },
          h('div', { className: 'risk-panel__trigger-label' }, 'Главный триггер:'),
          h('div', { className: 'risk-panel__trigger-value' }, activePredictionData.primaryTrigger.label)
        ),
        
        // Prevention Strategies
        activePredictionData.preventionStrategy && activePredictionData.preventionStrategy.length > 0 && 
        h('div', { className: 'risk-panel__prevention' },
          h('div', { className: 'risk-panel__prevention-header' },
            h('span', { className: 'risk-panel__prevention-title' }, '🛡️ Профилактика'),
            h(InfoButton, { infoKey: 'PREVENTION_STRATEGY', size: 'small' })
          ),
          activePredictionData.preventionStrategy.slice(0, 3).map((strategy, idx) =>
            h('div', { key: idx, className: 'risk-panel__strategy' },
              h('span', { className: 'risk-panel__strategy-num' }, idx + 1),
              h('div', { className: 'risk-panel__strategy-content' },
                h('div', { className: 'risk-panel__strategy-action' }, strategy.action),
                h('div', { className: 'risk-panel__strategy-reason' }, strategy.reason)
              )
            )
          )
        ),
        
        // Risk Factors — 🆕 v3.22.0: улучшенный рендеринг с PMID и защитными факторами
        activePredictionData.factors && activePredictionData.factors.length > 0 && 
        h('div', { className: 'risk-panel__factors' },
          h('div', { className: 'risk-panel__factors-header' },
            h('span', { className: 'risk-panel__factors-title' }, '📋 Факторы риска'),
            h(InfoButton, { infoKey: 'RISK_FACTORS', size: 'small' })
          ),
          activePredictionData.factors.slice(0, 6).map((factor, idx) =>
            h('div', { 
              key: idx, 
              className: `risk-panel__factor ${factor.isProtective ? 'risk-panel__factor--protective' : ''} ${factor.isEmotional ? 'risk-panel__factor--emotional' : ''}`
            },
              h('span', { className: 'risk-panel__factor-label' }, factor.label),
              h('span', { 
                className: `risk-panel__factor-weight ${factor.weight < 0 ? 'risk-panel__factor-weight--negative' : ''}`
              }, factor.weight < 0 ? factor.weight : `+${factor.weight || factor.impact}`),
              factor.pmid && h('a', {
                href: `https://pubmed.ncbi.nlm.nih.gov/${factor.pmid}/`,
                target: '_blank',
                rel: 'noopener noreferrer',
                className: 'risk-panel__factor-pmid',
                title: `PMID: ${factor.pmid}`,
                onClick: (e) => e.stopPropagation()
              }, '🔬')
            )
          )
        )
      )
    );
  }
  
  /**
   * MiniRiskMeter — компактный полукруг для dual view
   */
  function RiskPanel({ prediction, riskColors, isPast, isFuture }) {
    const riskLevel = prediction.riskLevel || (prediction.risk < 30 ? 'low' : prediction.risk < 60 ? 'medium' : 'high');
    
    // Генерируем predictionId для feedback
    const predictionId = prediction.id || `risk_${prediction.date || Date.now()}`;
    
    return h('div', { className: 'risk-panel' },
      // Risk Meter (gauge) with InfoButton
      h('div', { className: 'risk-panel__meter-wrapper' },
        h('div', { className: 'risk-panel__meter' },
          h(RiskMeter, { risk: prediction.risk, riskLevel })
        ),
        h('div', { className: 'risk-panel__meter-info' },
          h(InfoButton, { 
            infoKey: 'CRASH_RISK', 
            size: 'small',
            debugData: { 
              risk: prediction.risk, 
              riskLevel, 
              factors: prediction.factors?.length || 0 
            } 
          })
        )
      ),
      
      // Status with inline feedback
      h('div', { className: 'risk-panel__status-row' },
        h('div', { className: 'risk-panel__status' },
          isPast ? '📊 Анализ прошлого дня' :
          isFuture ? '🔮 Прогноз на будущее' :
          prediction.risk >= 30 ? '⚠️ Требует внимания' : '✅ Всё под контролем'
        ),
        // Inline feedback для прошлых дней
        isPast && h(FeedbackPrompt, { predictionId, type: 'risk', compact: true })
      ),
      
      // Primary Trigger
      prediction.primaryTrigger && h('div', { className: 'risk-panel__trigger' },
        h('div', { className: 'risk-panel__trigger-label' }, 'Главный триггер:'),
        h('div', { className: 'risk-panel__trigger-value' }, prediction.primaryTrigger.label)
      ),
      
      // Prevention Strategies
      prediction.preventionStrategy && prediction.preventionStrategy.length > 0 && h('div', { className: 'risk-panel__prevention' },
        h('div', { className: 'risk-panel__prevention-header' },
          h('span', { className: 'risk-panel__prevention-title' }, '🛡️ Профилактика'),
          h(InfoButton, { infoKey: 'PREVENTION_STRATEGY', size: 'small' })
        ),
        prediction.preventionStrategy.slice(0, 3).map((strategy, idx) =>
          h('div', { key: idx, className: 'risk-panel__strategy' },
            h('span', { className: 'risk-panel__strategy-num' }, idx + 1),
            h('div', { className: 'risk-panel__strategy-content' },
              h('div', { className: 'risk-panel__strategy-action' }, strategy.action),
              h('div', { className: 'risk-panel__strategy-reason' }, strategy.reason)
            )
          )
        )
      ),
      
      // Risk Factors
      prediction.factors && prediction.factors.length > 0 && h('div', { className: 'risk-panel__factors' },
        h('div', { className: 'risk-panel__factors-header' },
          h('span', { className: 'risk-panel__factors-title' }, '📋 Факторы риска'),
          h(InfoButton, { infoKey: 'RISK_FACTORS', size: 'small' })
        ),
        prediction.factors.slice(0, 5).map((factor, idx) =>
          h('div', { key: idx, className: 'risk-panel__factor' },
            h('span', { className: 'risk-panel__factor-label' }, factor.label),
            h('span', { className: 'risk-panel__factor-weight' }, `+${factor.weight || factor.impact}`)
          )
        )
      ),
      
      // Full feedback widget for past days
      isPast && prediction.risk >= 30 && h(FeedbackWidget, { 
        predictionType: 'crash_risk',
        predictionId
      })
    );
  }
  
  /**
   * RiskMeter — визуальный спидометр риска 0-100%
   */
  function RiskMeter({ risk, riskLevel }) {
    // 🔧 FIX: защита от NaN
    const safeRisk = typeof risk === 'number' && !isNaN(risk) ? Math.min(100, Math.max(0, risk)) : 0;
    const size = 160;
    const strokeWidth = 12;
    const radius = (size - strokeWidth) / 2;
    // Полукруг (180 градусов)
    const halfCircumference = Math.PI * radius;
    const progress = (safeRisk / 100) * halfCircumference;
    const offset = halfCircumference - progress;
    
    const colors = {
      low: '#22c55e',
      medium: '#eab308',
      high: '#ef4444'
    };
    
    return h('div', { className: 'risk-meter', style: { width: size, height: size / 2 + 30 } },
      h('svg', {
        viewBox: `0 0 ${size} ${size / 2 + 20}`,
        className: 'risk-meter__svg'
      },
        // Background arc
        h('path', {
          d: `M ${strokeWidth / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${size / 2}`,
          fill: 'none',
          stroke: 'var(--border-color, #e2e8f0)',
          strokeWidth: strokeWidth,
          strokeLinecap: 'round'
        }),
        // Progress arc
        h('path', {
          d: `M ${strokeWidth / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${size / 2}`,
          fill: 'none',
          stroke: colors[riskLevel] || colors.medium,
          strokeWidth: strokeWidth,
          strokeLinecap: 'round',
          strokeDasharray: halfCircumference,
          strokeDashoffset: offset,
          style: { transition: 'stroke-dashoffset 0.6s ease' }
        }),
        // Value text
        h('text', {
          x: size / 2,
          y: size / 2 - 5,
          textAnchor: 'middle',
          className: 'risk-meter__value',
          style: { 
            fontSize: 36,
            fontWeight: 700,
            fill: colors[riskLevel] || 'var(--text-primary)'
          }
        }, `${safeRisk}%`),
        // Label
        h('text', {
          x: size / 2,
          y: size / 2 + 20,
          textAnchor: 'middle',
          className: 'risk-meter__label',
          style: { fontSize: 12, fill: 'var(--text-secondary, #64748b)' }
        }, 'Риск срыва')
      )
    );
  }
  
  /**
   * ForecastPanel — содержимое таба Forecast
   * Интегрирован с InsulinWave для показа окон еды
   */
  function ForecastPanel({ forecast, isPast }) {
    // 🆕 Получаем данные инсулиновой волны для более точного прогноза
    const [insulinWaveData, setInsulinWaveData] = useState(null);
    
    useEffect(() => {
      if (window.HEYS?.InsulinWave?.calculate) {
        try {
          // Получаем текущее состояние волны
          const waveData = window.HEYS.InsulinWave.getLatestWaveData?.() || null;
          setInsulinWaveData(waveData);
        } catch (e) {
          // Игнорируем ошибки
        }
      }
    }, []);
    
    // Форматирование времени окончания волны
    const getWaveEndInfo = () => {
      if (!insulinWaveData) return null;
      
      const { status, remaining, endTime, currentPhase } = insulinWaveData;
      
      if (status === 'lipolysis') {
        return { 
          status: 'burning', 
          label: '🔥 Липолиз активен',
          desc: 'Сейчас идёт активное жиросжигание',
          color: '#22c55e'
        };
      }
      
      if (status === 'active' && remaining > 0) {
        return {
          status: 'wave',
          label: `⏳ ${remaining} мин до окончания волны`,
          desc: `Окончание в ${endTime}${currentPhase ? ` • Фаза: ${currentPhase}` : ''}`,
          color: '#f59e0b'
        };
      }
      
      if (status === 'almost') {
        return {
          status: 'almost',
          label: `⚡ ${remaining} мин до липолиза`,
          desc: 'Скоро начнётся жиросжигание',
          color: '#3b82f6'
        };
      }
      
      return null;
    };
    
    const waveEndInfo = getWaveEndInfo();
    
    return h('div', { className: 'forecast-panel' },
      isPast && h('div', { className: 'forecast-panel__note' },
        '📊 Анализ прошлого дня'
      ),
      
      // 🆕 Insulin Wave Status
      waveEndInfo && h('div', { 
        className: 'forecast-panel__wave-status',
        style: { borderColor: waveEndInfo.color }
      },
        h('div', { className: 'forecast-panel__wave-header' },
          h('div', { className: 'forecast-panel__wave-label', style: { color: waveEndInfo.color } }, 
            waveEndInfo.label
          ),
          h(InfoButton, { infoKey: 'INSULIN_WAVE_STATUS', size: 'small' })
        ),
        h('div', { className: 'forecast-panel__wave-desc' }, waveEndInfo.desc)
      ),
      
      // Energy Windows
      forecast.energyWindows && forecast.energyWindows.length > 0 && h('div', { className: 'forecast-panel__section' },
        h('div', { className: 'forecast-panel__section-header' },
          h('span', { className: 'forecast-panel__section-title' }, '⚡ Окна энергии'),
          h(InfoButton, { infoKey: 'ENERGY_WINDOWS', size: 'small' })
        ),
        h('div', { className: 'forecast-panel__windows' },
          forecast.energyWindows.map((window, idx) =>
            h('div', { 
              key: idx, 
              className: `forecast-panel__window ${window.optimal ? 'forecast-panel__window--optimal' : ''}`
            },
              h('div', { className: 'forecast-panel__window-period' }, window.period),
              h('div', { className: 'forecast-panel__window-label' }, window.label),
              window.optimal && h('span', { className: 'forecast-panel__window-badge' }, '⭐ Оптимально'),
              h('div', { className: 'forecast-panel__window-rec' }, window.recommendation)
            )
          )
        )
      ),
      
      // Training Window
    // Статистика точности
    const stats = useMemo(() => {
      if (HEYS.Metabolic?.getFeedbackStats) {
        return HEYS.Metabolic.getFeedbackStats();
      }
      return { total: 0, accuracy: 0 };
    }, []);
    
    const handleFeedback = (correct) => {
      if (HEYS.Metabolic?.submitFeedback) {
        const details = detailText ? { comment: detailText } : {};
        HEYS.Metabolic.submitFeedback(predictionId, correct, {
          ...details,
          type: predictionType
        });
      }
      setSubmitted(true);
      if (onSubmit) onSubmit(correct);
    };
    
    if (submitted) {
      return h('div', { className: 'feedback-widget feedback-widget--submitted' },
        h('span', { className: 'feedback-widget__thanks' }, '✅ Спасибо за отзыв!'),
        stats.total > 5 && h('span', { className: 'feedback-widget__accuracy' },
          `Точность прогнозов: ${stats.accuracy}%`
        )
      );
    }
    
    return h('div', { className: 'feedback-widget' },
      h('div', { className: 'feedback-widget__question' },
        '🎯 Прогноз оказался точным?'
      ),
      
      h('div', { className: 'feedback-widget__buttons' },
        h('button', {
          className: 'feedback-widget__btn feedback-widget__btn--yes',
          onClick: () => handleFeedback(true)
        }, '👍 Да'),
        h('button', {
          className: 'feedback-widget__btn feedback-widget__btn--no',
          onClick: () => setShowDetails(true)
        }, '👎 Нет'),
        h('button', {
          className: 'feedback-widget__btn feedback-widget__btn--skip',
          onClick: () => setSubmitted(true)
        }, 'Пропустить')
      ),
      
      showDetails && h('div', { className: 'feedback-widget__details' },
        h('textarea', {
          className: 'feedback-widget__textarea',
          placeholder: 'Что пошло не так? (опционально)',
          value: detailText,
          onChange: (e) => setDetailText(e.target.value),
          rows: 2
        }),
        h('button', {
          className: 'feedback-widget__submit',
          onClick: () => handleFeedback(false)
        }, 'Отправить')
      ),
      
      stats.total > 0 && h('div', { className: 'feedback-widget__stats' },
        `📊 Отзывов: ${stats.total} • Точность: ${stats.accuracy}%`
      )
    );
  }
  
  /**
   * FeedbackPrompt — inline prompt для конкретного прогноза
   * Меньше чем FeedbackWidget, встраивается в карточки
   */
  function FeedbackPrompt({ predictionId, type, compact = false }) {
    const [voted, setVoted] = useState(false);
    
    const handleVote = (correct) => {
      if (HEYS.Metabolic?.submitFeedback) {
        HEYS.Metabolic.submitFeedback(predictionId, correct, { type });
      }
      setVoted(true);
    };
    
    if (voted) {
      return h('span', { className: 'feedback-prompt feedback-prompt--voted' }, '✓');
    }
    
    return h('div', { className: `feedback-prompt ${compact ? 'feedback-prompt--compact' : ''}` },
      h('button', {
        className: 'feedback-prompt__btn feedback-prompt__btn--up',
        onClick: () => handleVote(true),
        title: 'Прогноз точный'
      }, '👍'),
      h('button', {
        className: 'feedback-prompt__btn feedback-prompt__btn--down',
        onClick: () => handleVote(false),
        title: 'Прогноз неточный'
      }, '👎')
    );
  }
  
  /**
   * AccuracyBadge — бейдж с точностью системы
   */
  function AccuracyBadge() {
    const stats = useMemo(() => {
      if (HEYS.Metabolic?.getFeedbackStats) {
        return HEYS.Metabolic.getFeedbackStats();
      }
      return { total: 0, accuracy: 0 };
    }, []);
    
    if (stats.total < 5) return null;
    
    const color = stats.accuracy >= 80 ? '#22c55e' : stats.accuracy >= 60 ? '#eab308' : '#ef4444';
    
    return h('div', { 
      className: 'accuracy-badge',
      style: { borderColor: color },
      title: `На основе ${stats.total} отзывов`
    },
      h('span', { className: 'accuracy-badge__icon' }, '🎯'),
      h('span', { className: 'accuracy-badge__value', style: { color } }, `${stats.accuracy}%`),
      h('span', { className: 'accuracy-badge__label' }, 'точность')
    );
  }
  
  // Legacy PredictiveDashboard wrapper for backward compatibility
  function PredictiveDashboardLegacy({ lsGet, profile, selectedDate }) {
    const [showForecast, setShowForecast] = useState(false);
    
    const prediction = useMemo(() => {
      if (!HEYS.Metabolic?.calculateCrashRisk24h) return null;
      
      const history = HEYS.Metabolic.getDaysHistory ? HEYS.Metabolic.getDaysHistory(30) : [];
      
      return HEYS.Metabolic.calculateCrashRisk24h(
        selectedDate || new Date().toISOString().split('T')[0],
        profile || window.HEYS?.utils?.lsGet?.('heys_profile', {}),
        history
      );
    }, [lsGet, profile, selectedDate]);
    
    const forecast = useMemo(() => {
      if (!HEYS.Metabolic?.calculatePerformanceForecast) return null;
      
      const history = HEYS.Metabolic.getDaysHistory ? HEYS.Metabolic.getDaysHistory(30) : [];
      
      return HEYS.Metabolic.calculatePerformanceForecast(
        selectedDate || new Date().toISOString().split('T')[0],
        profile || window.HEYS?.utils?.lsGet?.('heys_profile', {}),
        history
      );
    }, [lsGet, profile, selectedDate]);
    
    if (!prediction || prediction.risk < 30) {
      // Не показываем если риск низкий
      return null;
    }
    
    const riskColors = {
      low: '#22c55e',
      medium: '#eab308',
      high: '#ef4444'
    };
    
    return h('div', { className: 'predictive-dashboard' },
      // Crash Risk Alert
      h('div', { 
        className: `crash-risk-alert crash-risk-alert--${prediction.riskLevel}`,
        style: { borderColor: riskColors[prediction.riskLevel] }
      },
        h('div', { className: 'crash-risk-alert__header' },
          h('span', { className: 'crash-risk-alert__icon' }, '🚨'),
          h('span', { className: 'crash-risk-alert__title' }, 'Прогноз риска срыва'),
          h('span', { 
            className: 'crash-risk-alert__risk',
            style: { color: riskColors[prediction.riskLevel] }
          }, `${prediction.risk}%`)
        ),
        
        prediction.primaryTrigger && h('div', { className: 'crash-risk-alert__trigger' },
          h('strong', null, 'Главный триггер: '),
          prediction.primaryTrigger.label
        ),
        
        prediction.preventionStrategy && prediction.preventionStrategy.length > 0 && h('div', { className: 'crash-risk-alert__prevention' },
          h('div', { className: 'crash-risk-alert__prevention-title' }, '🛡️ Профилактика:'),
          prediction.preventionStrategy.slice(0, 2).map((strategy, idx) =>
            h('div', { key: idx, className: 'crash-risk-alert__strategy' },
              `${idx + 1}. ${strategy.action} — ${strategy.reason}`
            )
          )
        )
      ),
      
      // Tomorrow Forecast (collapsible)
      forecast && h('div', { className: 'tomorrow-forecast' },
        h('div', {
          className: 'tomorrow-forecast__header',
          onClick: () => setShowForecast(!showForecast)
        },
          h('span', { className: 'tomorrow-forecast__title' }, '🔮 Прогноз на завтра'),
          h('span', { className: 'tomorrow-forecast__chevron' }, showForecast ? '▼' : '▶')
        ),
        
        showForecast && h('div', { className: 'tomorrow-forecast__content' },
          // Energy Windows
          forecast.energyWindows && h('div', { className: 'tomorrow-forecast__windows' },
            h('div', { className: 'tomorrow-forecast__windows-title' }, '⚡ Окна энергии'),
            forecast.energyWindows.map((window, idx) =>
              h('div', { 
                key: idx, 
                className: `energy-window ${window.optimal ? 'energy-window--optimal' : ''}`
              },
                h('div', { className: 'energy-window__period' }, window.period),
                h('div', { className: 'energy-window__label' }, window.label),
                h('div', { className: 'energy-window__recommendation' }, window.recommendation)
              )
            )
          ),
          
          // Training Window
          forecast.trainingWindow && h('div', { className: 'tomorrow-forecast__training' },
            h('div', { className: 'tomorrow-forecast__training-title' }, '🏋️ Лучшее время для тренировки'),
            h('div', { className: 'tomorrow-forecast__training-time' }, forecast.trainingWindow.time),
            h('div', { className: 'tomorrow-forecast__training-reason' }, forecast.trainingWindow.reason)
          )
        )
      )
    );
  }
  
  // === METABOLIC STATE RING — кольцевая визуализация фаз ===
  
  /**
   * MetabolicStateRing — визуализация текущей метаболической фазы
   * Показывает: анаболическая → переходная → катаболическая (липолиз)
   */
    return h('div', { className: `risk-traffic-light risk-traffic-light--${currentLevel}` },
      // Светофор
      h('div', { className: 'risk-traffic-light__housing' },
        lights.map(light => 
          h('div', { 
            key: light.level,
            className: `risk-traffic-light__light risk-traffic-light__light--${light.level}`,
            style: { 
              backgroundColor: light.level === currentLevel ? light.color : '#374151',
              boxShadow: light.level === currentLevel ? `0 0 20px ${light.color}` : 'none',
              opacity: light.level === currentLevel ? 1 : 0.3
            }
          })
        )
      ),
      // Детали
      h('div', { className: 'risk-traffic-light__details' },
        h('div', { className: 'risk-traffic-light__header' },
          h('span', { className: 'risk-traffic-light__emoji' }, currentLight.emoji),
          h('span', { className: 'risk-traffic-light__title' }, 'Риск срыва'),
          h('span', { className: 'risk-traffic-light__level', style: { color: currentLight.color } }, 
            currentLight.label
          ),
          riskValue !== undefined && h('span', { className: 'risk-traffic-light__percent' }, `${riskValue}%`)
        ),
        // Факторы (если есть)
        factors && factors.length > 0 && h('div', { className: 'risk-traffic-light__factors' },
          factors.slice(0, 3).map((factor, idx) =>
            h('div', { key: idx, className: 'risk-traffic-light__factor' },
              h('span', { className: 'risk-traffic-light__factor-label' }, factor.label),
              h('span', { className: 'risk-traffic-light__factor-impact' }, `+${factor.impact}`)
            )
          )
        ),
        // Совет по снижению
        currentLevel !== 'low' && h('div', { className: 'risk-traffic-light__tip' },
          h('span', { className: 'risk-traffic-light__tip-icon' }, '💡'),
          h('span', { className: 'risk-traffic-light__tip-text' },
            currentLevel === 'high' 
              ? 'Сделай refeed день или высыпись'
              : 'Добавь прогулку или лёгкий перекус'
          )
        )
      )
    );
  }
  
  // === DATA COMPLETENESS UI ===
  
  /**
   * DataCompletenessCard — карточка полноты данных
   * Показывает прогресс заполнения и что разблокируется
   */
  /**
   * DataCompletenessCard — показывает прогресс сбора данных и разблокировку фичей
   * v3.22.0: Добавлена Extended Analytics как премиум-фича (7+ дней)
   */
  function DataCompletenessCard({ lsGet, profile, daysRequired = 30 }) {
    const completeness = useMemo(() => {
      if (!HEYS.Metabolic?.getDaysHistory) return null;
      
      const history = HEYS.Metabolic.getDaysHistory(daysRequired);
      const daysWithData = history.length;
      const percentage = Math.round((daysWithData / daysRequired) * 100);
      const daysRemaining = Math.max(0, daysRequired - daysWithData);
      
      // Проверяем полноту последнего дня (сегодня)
      const today = new Date().toISOString().split('T')[0];
      const inventory = HEYS.Metabolic.inventoryData ? HEYS.Metabolic.inventoryData(today) : null;
      const todayCompleteness = inventory ? HEYS.Metabolic.calculateDataCompleteness(inventory) : 0;
      
      // 🆕 v3.22.0: Extended Analytics features с научными обоснованиями
      const features = [
        { name: 'Базовый статус', required: 1, emoji: '📊', unlocked: daysWithData >= 1 },
        { name: 'Риск срыва', required: 3, emoji: '⚠️', unlocked: daysWithData >= 3 },
        { name: 'Паттерны', required: 7, emoji: '🔍', unlocked: daysWithData >= 7 },
        { 
          name: '🧠 Эмоц. риск', 
          required: 7, 
          emoji: '🧠', 
          unlocked: daysWithData >= 7,
          pmid: '11070333',
          science: 'Epel 2001 — стресс-переедание'
        },
        { 
          name: '🥩 Белковый долг', 
          required: 7, 
          emoji: '🥩', 
          unlocked: daysWithData >= 7,
          pmid: '20095013',
          science: 'Mettler 2010 — белок при дефиците'
        },
        { name: 'Персональные пороги', required: 14, emoji: '🎯', unlocked: daysWithData >= 14 },
        { 
          name: '🔬 Циркадный контекст', 
          required: 14, 
          emoji: '🌅', 
          unlocked: daysWithData >= 14,
          pmid: '9331550',
          science: 'Van Cauter 1997 — циркадные ритмы'
        },
        { name: 'Метаболический фенотип', required: 30, emoji: '🧬', unlocked: daysWithData >= 30 }
      ];
      
      const nextFeature = features.find(f => !f.unlocked);
      
      // 🆕 Считаем сколько extended analytics разблокировано
      const extendedFeatures = features.filter(f => f.pmid);
      const extendedUnlocked = extendedFeatures.filter(f => f.unlocked).length;
      const extendedTotal = extendedFeatures.length;
      
      return {
        daysWithData,
        daysRequired,
        percentage,
        daysRemaining,
        todayCompleteness,
        features,
        nextFeature,
        extendedUnlocked,
        extendedTotal
      };
    }, [lsGet, daysRequired]);
    
    if (!completeness) {
      return null;
    }
    
    return h('div', { className: 'data-completeness-card' },
      h('div', { className: 'data-completeness-card__header' },
        h('span', { className: 'data-completeness-card__icon' }, '📊'),
        h('span', { className: 'data-completeness-card__title' }, 'Данные'),
        h('span', { className: 'data-completeness-card__count' },
          `${completeness.daysWithData}/${completeness.daysRequired} дней`
        )
      ),
      
      // Прогресс-бар
      h('div', { className: 'data-completeness-card__progress' },
        h('div', { className: 'data-completeness-card__progress-bar' },
          h('div', { 
            className: 'data-completeness-card__progress-fill',
            style: { width: `${completeness.percentage}%` }
          })
        ),
        h('span', { className: 'data-completeness-card__progress-text' }, `${completeness.percentage}%`)
      ),
      
      // Сегодняшняя полнота
      h('div', { className: 'data-completeness-card__today' },
        h('span', { className: 'data-completeness-card__today-label' }, 'Сегодня: '),
        h('span', { 
          className: 'data-completeness-card__today-value',
          style: { color: completeness.todayCompleteness >= 80 ? '#22c55e' : completeness.todayCompleteness >= 50 ? '#eab308' : '#ef4444' }
        }, `${completeness.todayCompleteness}% заполнено`)
      ),
      
      // 🆕 v3.22.0: Extended Analytics Status
      h('div', { className: 'data-completeness-card__extended' },
        h('span', { className: 'data-completeness-card__extended-label' }, '🧠 Extended Analytics: '),
        h('span', { 
          className: 'data-completeness-card__extended-value',
          style: { color: completeness.extendedUnlocked === completeness.extendedTotal ? '#22c55e' : '#6366f1' }
        }, `${completeness.extendedUnlocked}/${completeness.extendedTotal}`),
        completeness.extendedUnlocked === completeness.extendedTotal && h('span', { className: 'data-completeness-card__extended-badge' }, '✓')
      ),
      
      // Следующая разблокировка
      completeness.nextFeature && h('div', { className: 'data-completeness-card__next' },
        h('span', { className: 'data-completeness-card__next-emoji' }, completeness.nextFeature.emoji),
        h('span', { className: 'data-completeness-card__next-text' },
          `${completeness.nextFeature.name} через ${completeness.nextFeature.required - completeness.daysWithData} дн.`
        ),
        completeness.nextFeature.pmid && h('a', {
          href: `https://pubmed.ncbi.nlm.nih.gov/${completeness.nextFeature.pmid}/`,
          target: '_blank',
          className: 'data-completeness-card__next-pmid',
          title: completeness.nextFeature.science
        }, '🔬')
      ),
      
      // Разблокированные фичи (иконки) — 🆕 с tooltip для extended
      h('div', { className: 'data-completeness-card__features' },
        completeness.features.map((feature, idx) =>
          h('div', { 
            key: idx,
            className: `data-completeness-card__feature ${feature.unlocked ? 'data-completeness-card__feature--unlocked' : ''} ${feature.pmid ? 'data-completeness-card__feature--science' : ''}`,
            title: `${feature.name} (${feature.required} дней)${feature.science ? '\n' + feature.science : ''}`
          }, feature.emoji)
        )
      )
    );
  }
  
  // === MEAL TIMING RECOMMENDATIONS (v2 — Premium Design) ===
  
  /**
   * MealTimingCard v2 — WOW дизайн с timeline и иконками
   */
  function MealTimingCard({ lsGet, profile, selectedDate }) {
    const timing = useMemo(() => {
      if (!HEYS.Metabolic?.calculatePerformanceForecast) return null;
      
      const history = HEYS.Metabolic.getDaysHistory ? HEYS.Metabolic.getDaysHistory(7) : [];
      
      return HEYS.Metabolic.calculatePerformanceForecast(
        selectedDate || new Date().toISOString().split('T')[0],
        profile || window.HEYS?.utils?.lsGet?.('heys_profile', {}),
        history
      );
    }, [lsGet, profile, selectedDate]);
    
    if (!timing || !timing.optimalMeals) {
      return null;
    }
    
    // Конфиг иконок и цветов для типов приёмов
    const mealConfig = {
      'Завтрак': { icon: '🌅', gradient: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)', lightBg: '#fef3c7' },
      'Обед': { icon: '☀️', gradient: 'linear-gradient(135deg, #34d399 0%, #10b981 100%)', lightBg: '#d1fae5' },
      'Ужин': { icon: '🌙', gradient: 'linear-gradient(135deg, #818cf8 0%, #6366f1 100%)', lightBg: '#e0e7ff' },
      'Перекус': { icon: '🍎', gradient: 'linear-gradient(135deg, #f472b6 0%, #ec4899 100%)', lightBg: '#fce7f3' }
    };
    
    const getMealConfig = (name) => {
      for (const [key, config] of Object.entries(mealConfig)) {
        if (name.toLowerCase().includes(key.toLowerCase())) return config;
      }
      return { icon: '🍽️', gradient: 'linear-gradient(135deg, #94a3b8 0%, #64748b 100%)', lightBg: '#f1f5f9' };
    };
    
    // Вычисляем текущее время для индикатора "сейчас"
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    
    return h('div', { className: 'meal-timing-v2' },
      // Header с градиентом
      h('div', { className: 'meal-timing-v2__header' },
        h('div', { className: 'meal-timing-v2__header-icon' }, '⏰'),
        h('div', { className: 'meal-timing-v2__header-content' },
          h('h3', { className: 'meal-timing-v2__title' }, 'Твой идеальный день'),
          h('p', { className: 'meal-timing-v2__subtitle' }, 'Персональное расписание на основе твоего ритма')
        )
      ),
      
      // Timeline с приёмами
      h('div', { className: 'meal-timing-v2__timeline' },
        timing.optimalMeals.filter(m => m.priority !== 'low').map((meal, idx, arr) => {
          const config = getMealConfig(meal.name);
          const [startHour] = meal.time.split('-')[0].split(':').map(Number);
          const isNow = currentHour >= startHour && currentHour < startHour + 2;
          const isPast = currentHour > startHour + 2;
          
          return h('div', { 
            key: idx, 
            className: `meal-timing-v2__item ${isNow ? 'meal-timing-v2__item--active' : ''} ${isPast ? 'meal-timing-v2__item--past' : ''}`
          },
            // Timeline connector
            idx < arr.length - 1 && h('div', { className: 'meal-timing-v2__connector' }),
            
            // Time badge
            h('div', { className: 'meal-timing-v2__time-badge', style: { background: config.gradient } },
              h('span', { className: 'meal-timing-v2__time' }, meal.time.split('-')[0])
            ),
            
            // Card content
            h('div', { className: 'meal-timing-v2__card', style: { '--accent-bg': config.lightBg } },
              h('div', { className: 'meal-timing-v2__card-header' },
                h('span', { className: 'meal-timing-v2__card-icon' }, config.icon),
                h('div', { className: 'meal-timing-v2__card-title' },
                  h('span', { className: 'meal-timing-v2__card-name' }, meal.name),
                  isNow && h('span', { className: 'meal-timing-v2__now-badge' }, '● СЕЙЧАС')
                )
              ),
              h('div', { className: 'meal-timing-v2__card-body' },
                h('p', { className: 'meal-timing-v2__card-focus' }, meal.focus),
                h('div', { className: 'meal-timing-v2__card-meta' },
                  h('span', { className: 'meal-timing-v2__card-pct' }, 
                    h('span', { className: 'meal-timing-v2__pct-value' }, `${meal.caloriesPct}%`),
                    ' дневных ккал'
                  ),
                  meal.priority === 'high' && h('span', { className: 'meal-timing-v2__priority-badge' }, '⭐ Важно')
                )
              )
            )
          );
        })
      ),
      
      // Тренировочное окно (если есть)
      timing.trainingWindow && h('div', { className: 'meal-timing-v2__training' },
        h('div', { className: 'meal-timing-v2__training-icon' }, '💪'),
        h('div', { className: 'meal-timing-v2__training-content' },
          h('div', { className: 'meal-timing-v2__training-title' }, 'Пик силы и выносливости'),
          h('div', { className: 'meal-timing-v2__training-time' }, timing.trainingWindow.time),
          h('div', { className: 'meal-timing-v2__training-reason' }, timing.trainingWindow.reason)
        )
      ),
      
      // Sleep impact chip
      h('div', { className: `meal-timing-v2__sleep meal-timing-v2__sleep--${timing.sleepImpact}` },
        h('span', { className: 'meal-timing-v2__sleep-icon' }, 
          timing.sleepImpact === 'positive' ? '😴' : '⚠️'
        ),
        h('span', { className: 'meal-timing-v2__sleep-text' },
          timing.sleepImpact === 'positive' 
            ? 'Сон в норме — энергия стабильна весь день'
            : 'Недосып — рекомендуем лёгкий день'
        ),
        ),
        
        // Content
        h('div', { className: 'weekly-wrap-card__content' },
          
          // Tab: Summary
          activeTab === 'summary' && h(React.Fragment, null,
            // Main score
            h('div', { className: 'weekly-wrap-card__main-score' },
              h('div', { 
                className: 'weekly-wrap-card__score-value',
                style: { color: getScoreColor(summary.avgScore) }
              }, summary.avgScore),
              h('div', { className: 'weekly-wrap-card__score-label' }, 'Средний score'),
              comparison && h('div', { 
                className: `weekly-wrap-card__comparison ${comparison.improved ? 'weekly-wrap-card__comparison--up' : 'weekly-wrap-card__comparison--down'}`
              },
                comparison.improved ? '↑' : '↓',
                ` ${Math.abs(comparison.delta)} vs прошлая неделя`
              )
            ),
            
            // Stats grid
            h('div', { className: 'weekly-wrap-card__stats' },
              h('div', { className: 'weekly-wrap-card__stat' },
                h('div', { className: 'weekly-wrap-card__stat-value' }, summary.goodDays),
                h('div', { className: 'weekly-wrap-card__stat-label' }, 'Хороших дней')
              ),
              h('div', { className: 'weekly-wrap-card__stat' },
                h('div', { className: 'weekly-wrap-card__stat-value' }, summary.lowRiskDays),
                h('div', { className: 'weekly-wrap-card__stat-label' }, 'Дней без риска')
              ),
              h('div', { className: 'weekly-wrap-card__stat' },
                h('div', { className: 'weekly-wrap-card__stat-value' }, summary.streakDays),
                h('div', { className: 'weekly-wrap-card__stat-label' }, 'В streak')
              )
            ),
            
            // Best/Worst day
            h('div', { className: 'weekly-wrap-card__highlights' },
              h('div', { className: 'weekly-wrap-card__highlight weekly-wrap-card__highlight--best' },
                h('span', { className: 'weekly-wrap-card__highlight-emoji' }, '🏆'),
                h('span', { className: 'weekly-wrap-card__highlight-day' }, summary.bestDay.dayName),
                h('span', { className: 'weekly-wrap-card__highlight-score' }, summary.bestDay.score)
              ),
              h('div', { className: 'weekly-wrap-card__highlight weekly-wrap-card__highlight--worst' },
                h('span', { className: 'weekly-wrap-card__highlight-emoji' }, '😔'),
                h('span', { className: 'weekly-wrap-card__highlight-day' }, summary.worstDay.dayName),
                h('span', { className: 'weekly-wrap-card__highlight-score' }, summary.worstDay.score)
              )
            ),
            
            // Achievements
            achievements.length > 0 && h('div', { className: 'weekly-wrap-card__achievements' },
              h('div', { className: 'weekly-wrap-card__achievements-title' }, '🎖️ Достижения'),
              h('div', { className: 'weekly-wrap-card__achievements-list' },
                achievements.map(a =>
                  h('div', { 
                    key: a.id,
                    className: 'weekly-wrap-card__achievement'
                  },
                    h('span', { className: 'weekly-wrap-card__achievement-emoji' }, a.emoji),
                    h('span', { className: 'weekly-wrap-card__achievement-label' }, a.label)
                  )
                )
              )
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
