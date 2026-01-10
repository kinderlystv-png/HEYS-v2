/**
 * HEYS Predictive Insights — Constants Module
 * @file pi_constants.js
 * @version 1.0.0
 * @description Константы и конфигурация для аналитики инсайтов
 * 
 * Extracted from heys_predictive_insights_v1.js (10,410 lines → split)
 * Part of refactor/predictive-insights-split
 */

/* eslint-disable no-undef */
/* global HEYS */
(function() {
  'use strict';

  // Namespace setup
  window.HEYS = window.HEYS || {};
  window.HEYS.insights = window.HEYS.insights || {};

  // ============================================================================
  // CONFIG — Основные настройки модуля
  // ============================================================================
  const CONFIG = {
    DEFAULT_DAYS: 14,
    MIN_DAYS_FOR_INSIGHTS: 3,
    MIN_DAYS_FOR_FULL_ANALYSIS: 7,
    MIN_CORRELATION_DISPLAY: 0.35,
    CACHE_TTL_MS: 5 * 60 * 1000, // 5 минут
    VERSION: '2.2.0'
  };

  // ============================================================================
  // PRIORITY_LEVELS — Уровни приоритета метрик
  // ============================================================================
  const PRIORITY_LEVELS = {
    CRITICAL: {
      level: 1,
      name: 'Критический',
      emoji: '🔴',
      color: '#ef4444',
      description: 'Требует немедленного внимания'
    },
    HIGH: {
      level: 2,
      name: 'Высокий',
      emoji: '🟠',
      color: '#f97316',
      description: 'Важно для достижения целей'
    },
    MEDIUM: {
      level: 3,
      name: 'Средний',
      emoji: '🟡',
      color: '#eab308',
      description: 'Полезный контекст'
    },
    LOW: {
      level: 4,
      name: 'Низкий',
      emoji: '🟢',
      color: '#22c55e',
      description: 'Дополнительная информация'
    },
    INFO: {
      level: 5,
      name: 'Справочный',
      emoji: '🔵',
      color: '#3b82f6',
      description: 'Справочные данные'
    }
  };

  // ============================================================================
  // CATEGORIES — Категории метрик (для группировки)
  // ============================================================================
  const CATEGORIES = {
    METABOLISM: {
      id: 'metabolism',
      name: 'Метаболизм',
      emoji: '🔥',
      color: '#ef4444',
      description: 'Показатели обмена веществ'
    },
    NUTRITION: {
      id: 'nutrition',
      name: 'Питание',
      emoji: '🥗',
      color: '#22c55e',
      description: 'Качество и состав питания'
    },
    TIMING: {
      id: 'timing',
      name: 'Тайминг',
      emoji: '⏰',
      color: '#3b82f6',
      description: 'Временные паттерны приёмов пищи'
    },
    RECOVERY: {
      id: 'recovery',
      name: 'Восстановление',
      emoji: '😴',
      color: '#8b5cf6',
      description: 'Сон и стресс'
    },
    RISK: {
      id: 'risk',
      name: 'Риски',
      emoji: '⚠️',
      color: '#f97316',
      description: 'Риски срывов и проблем'
    },
    PREDICTION: {
      id: 'prediction',
      name: 'Прогнозы',
      emoji: '🔮',
      color: '#06b6d4',
      description: 'Предсказания и тренды'
    },
    PATTERNS: {
      id: 'patterns',
      name: 'Паттерны',
      emoji: '🔍',
      color: '#0ea5e9',
      description: 'Поведенческие закономерности'
    },
    COMPOSITE: {
      id: 'composite',
      name: 'Комплексные',
      emoji: '📊',
      color: '#6366f1',
      description: 'Сводные показатели'
    },
    STATISTICS: {
      id: 'statistics',
      name: 'Статистика',
      emoji: '📈',
      color: '#64748b',
      description: 'Статистические данные'
    }
  };

  // ============================================================================
  // ACTIONABILITY — Уровни срочности действий
  // ============================================================================
  const ACTIONABILITY = {
    IMMEDIATE: {
      level: 1,
      name: 'Немедленно',
      emoji: '⚡',
      description: 'Действуй прямо сейчас'
    },
    TODAY: {
      level: 2,
      name: 'Сегодня',
      emoji: '📅',
      description: 'В течение дня'
    },
    WEEKLY: {
      level: 3,
      name: 'На неделе',
      emoji: '📆',
      description: 'В течение недели'
    },
    LONG_TERM: {
      level: 4,
      name: 'Долгосрочно',
      emoji: '🎯',
      description: 'Стратегические изменения'
    },
    INFORMATIONAL: {
      level: 5,
      name: 'Информация',
      emoji: 'ℹ️',
      description: 'Для понимания'
    }
  };

  // ============================================================================
  // SECTIONS_CONFIG — Конфигурация UI секций (InsightsTab)
  // ============================================================================
  const SECTIONS_CONFIG = {
    // L0: Критические — всегда показываются первыми
    STATUS_SCORE: {
      id: 'status_score',
      component: 'StatusScoreCard',
      priority: 'CRITICAL',
      order: 1,
      alwaysShow: true,
      title: 'Метаболический статус',
      icon: '🎯'
    },
    CRASH_RISK: {
      id: 'crash_risk',
      component: 'MetabolicQuickStatus',
      priority: 'CRITICAL',
      order: 2,
      alwaysShow: true,
      title: 'Риск срыва',
      icon: '⚠️'
    },
    PRIORITY_ACTIONS: {
      id: 'priority_actions',
      component: 'PriorityActions',
      priority: 'CRITICAL',
      order: 3,
      alwaysShow: true,
      title: 'Действия сейчас',
      icon: '⚡'
    },
    
    // L1: Высокий приоритет — важно для достижения целей
    PREDICTIVE_DASHBOARD: {
      id: 'predictive_dashboard',
      component: 'PredictiveDashboard',
      priority: 'HIGH',
      order: 10,
      title: 'Прогнозы на сегодня',
      icon: '🔮'
    },
    ADVANCED_ANALYTICS: {
      id: 'advanced_analytics',
      component: 'AdvancedAnalyticsCard',
      priority: 'HIGH',
      order: 11,
      title: 'Продвинутая аналитика',
      icon: '📊'
    },
    METABOLISM: {
      id: 'metabolism',
      component: 'MetabolismSection',
      priority: 'HIGH',
      order: 12,
      title: 'Метаболизм',
      icon: '🔥'
    },
    MEAL_TIMING: {
      id: 'meal_timing',
      component: 'MealTimingCard',
      priority: 'HIGH',
      order: 13,
      title: 'Тайминг приёмов',
      icon: '⏰'
    },
    
    // L2: Средний приоритет — полезный контекст
    WHAT_IF: {
      id: 'what_if',
      component: 'WhatIfSection',
      priority: 'MEDIUM',
      order: 20,
      title: 'Что если...',
      icon: '🎯'
    },
    PATTERNS: {
      id: 'patterns',
      component: 'PatternsList',
      priority: 'MEDIUM',
      order: 21,
      title: 'Паттерны',
      icon: '🔍'
    },
    WEIGHT_PREDICTION: {
      id: 'weight_prediction',
      component: 'WeightPrediction',
      priority: 'MEDIUM',
      order: 22,
      title: 'Прогноз веса',
      icon: '⚖️'
    },
    
    // L3: Низкий приоритет — дополнительно
    WEEKLY_WRAP: {
      id: 'weekly_wrap',
      component: 'WeeklyWrap',
      priority: 'LOW',
      order: 30,
      title: 'Итоги недели',
      icon: '📋'
    },
    DATA_COMPLETENESS: {
      id: 'data_completeness',
      component: 'DataCompletenessCard',
      priority: 'LOW',
      order: 31,
      title: 'Полнота данных',
      icon: '📊'
    }
  };

  // ============================================================================
  // API — Публичные функции для работы с константами
  // ============================================================================
  
  /**
   * Получить полную информацию о приоритете
   * @param {string} priorityKey - CRITICAL, HIGH, MEDIUM, LOW, INFO
   * @returns {Object|null}
   */
  function getPriorityInfo(priorityKey) {
    return PRIORITY_LEVELS[priorityKey] || null;
  }

  /**
   * Получить информацию о категории
   * @param {string} categoryKey - METABOLISM, NUTRITION, etc.
   * @returns {Object|null}
   */
  function getCategoryInfo(categoryKey) {
    return CATEGORIES[categoryKey] || null;
  }

  /**
   * Получить информацию о срочности
   * @param {string} actionabilityKey - IMMEDIATE, TODAY, etc.
   * @returns {Object|null}
   */
  function getActionabilityInfo(actionabilityKey) {
    return ACTIONABILITY[actionabilityKey] || null;
  }

  /**
   * Получить секции отсортированные по приоритету
   * @param {string} filterPriority - фильтр по приоритету (опционально)
   * @returns {Array}
   */
  function getSortedSections(filterPriority = null) {
    let sections = Object.values(SECTIONS_CONFIG);
    
    if (filterPriority) {
      sections = sections.filter(s => s.priority === filterPriority);
    }
    
    return sections.sort((a, b) => a.order - b.order);
  }

  /**
   * Получить приоритет секции с расширенной информацией
   * @param {string} sectionId
   * @returns {Object|null}
   */
  function getSectionPriority(sectionId) {
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

  // ============================================================================
  // EXPORT — Публичный API модуля
  // ============================================================================
  const constants = {
    // Данные
    CONFIG,
    PRIORITY_LEVELS,
    CATEGORIES,
    ACTIONABILITY,
    SECTIONS_CONFIG,
    
    // Функции
    getPriorityInfo,
    getCategoryInfo,
    getActionabilityInfo,
    getSortedSections,
    getSectionPriority
  };

  // Экспорт в namespace
  HEYS.insights.constants = constants;

  // Для обратной совместимости — прямой доступ (deprecated, но нужен при миграции)
  HEYS.insights._PRIORITY_LEVELS = PRIORITY_LEVELS;
  HEYS.insights._CATEGORIES = CATEGORIES;
  HEYS.insights._ACTIONABILITY = ACTIONABILITY;
  HEYS.insights._SECTIONS_CONFIG = SECTIONS_CONFIG;
  HEYS.insights._CONFIG = CONFIG;

  // Silent load — no console to pass lint
})();
