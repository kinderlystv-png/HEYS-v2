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

  // === SCIENCE_INFO: Научные справки для UI ===
  const SCIENCE_INFO = {
    TEF: {
      name: 'Термический эффект пищи (TEF)',
      formula: 'TEF = (Белок × 4 × 0.25) + (Углеводы × 4 × 0.075) + (Жиры × 9 × 0.015)',
      source: 'Westerterp, 2004; Tappy, 1996',
      pmid: '15507147',
      interpretation: '8-12% от калоража — норма. >12% — отлично (много белка). <8% — мало белка в рационе.',
      priority: 'HIGH',
      category: 'METABOLISM',
      actionability: 'TODAY',
      impactScore: 0.75,
      whyImportant: 'Определяет сколько калорий уходит на переваривание. Больше белка = выше TEF = легче дефицит.'
    },
    EPOC: {
      name: 'Дожиг после тренировки (EPOC)',
      formula: 'EPOC = Калории_тренировки × (0.06 + intensity × 0.09)\nIntensity = % времени в зонах 3-4',
      source: 'LaForgia et al., 2006',
      pmid: '16825252',
      interpretation: '+6-15% к затратам тренировки. При HIIT эффект сильнее и дольше (до 24ч).',
      priority: 'MEDIUM',
      category: 'METABOLISM',
      actionability: 'TODAY',
      impactScore: 0.45,
      whyImportant: 'Показывает бонусное сжигание калорий после тренировки. HIIT даёт больший эффект.'
    },
    HORMONES: {
      name: 'Гормональный баланс (Грелин/Лептин)',
      formula: 'sleepDebt = sleepNorm - actualSleep\nЕсли sleepDebt ≥ 2ч:\n  ghrelinIncrease = 15 + (sleepDebt - 2) × 6.5\n  leptinDecrease = 10 + (sleepDebt - 2) × 4',
      source: 'Spiegel et al., 2004',
      pmid: '15531540',
      interpretation: 'Недосып 2ч+ → голод повышен на 15-28%. Это физиология, не сила воли!',
      priority: 'CRITICAL',
      category: 'RECOVERY',
      actionability: 'TODAY',
      impactScore: 0.90,
      whyImportant: '⚡ Недосып = гормональный голод. Самый частый триггер срывов! Высыпайся первым делом.'
    },
    ADAPTIVE: {
      name: 'Адаптивный термогенез',
      formula: 'За 7 дней считаем дни с eaten < BMR × 0.70:\n  2-3 дня: метаболизм -4%\n  3-5 дней: метаболизм -8%\n  5+ дней: метаболизм -12%',
      source: 'Rosenbaum & Leibel, 2010',
      pmid: '20107198',
      interpretation: 'При жёстком дефиците метаболизм замедляется на 10-15%. Refeed day помогает!',
      priority: 'HIGH',
      category: 'METABOLISM',
      actionability: 'WEEKLY',
      impactScore: 0.80,
      whyImportant: 'Слишком жёсткий дефицит = адаптация организма. Refeed каждые 5-7 дней спасает метаболизм.'
    },
    CIRCADIAN: {
      name: 'Циркадный Score',
      formula: 'Веса по времени:\n  Утро (6-12): ×1.1\n  День (12-18): ×1.0\n  Вечер (18-22): ×0.9\n  Ночь (22-6): ×0.7\nScore = Σ(kcal × timeWeight) / totalKcal × 100',
      source: 'Garaulet et al., 2013; Jakubowicz et al., 2013',
      pmid: '23512957',
      interpretation: '>85 — отлично (калории в первой половине дня). <70 — много вечерней еды.',
      priority: 'HIGH',
      category: 'TIMING',
      actionability: 'TODAY',
      impactScore: 0.70,
      whyImportant: 'Еда в первой половине дня усваивается лучше. Вечерние калории чаще идут в жир.'
    },
    NUTRIENT_TIMING: {
      name: 'Тайминг нутриентов',
      formula: 'Бонусы:\n  Белок утром (до 12:00): +10\n  Углеводы после тренировки (±2ч): +15\n  Жиры вечером: нейтрально\nScore = базовый 50 + сумма бонусов',
      source: 'Areta et al., 2013; Aragon & Schoenfeld, 2013',
      pmid: '24477298',
      interpretation: '>80 — оптимальный тайминг. <60 — есть что улучшить.',
      priority: 'MEDIUM',
      category: 'TIMING',
      actionability: 'TODAY',
      impactScore: 0.55,
      whyImportant: 'Правильный тайминг макросов улучшает восстановление и синтез мышц.'
    },
    INSULIN_SENSITIVITY: {
      name: 'Прокси инсулиновой чувствительности',
      formula: 'Факторы:\n  Средний GI <55: +20\n  Клетчатка >14г/1000ккал: +20\n  Вечерние углеводы <30%: +15\n  Тренировки: +15\n  Сон ≥7ч: +10\nScore = сумма факторов',
      source: 'Brand-Miller, 2003; Wolever, 1994',
      pmid: '12936919',
      interpretation: '>75 — хорошая чувствительность. <50 — риск инсулинорезистентности.',
      priority: 'HIGH',
      category: 'METABOLISM',
      actionability: 'WEEKLY',
      impactScore: 0.85,
      whyImportant: 'Высокая чувствительность к инсулину = легче сжигать жир и набирать мышцы.'
    },
    GUT_HEALTH: {
      name: 'Здоровье кишечника',
      formula: 'Факторы:\n  Клетчатка >25г: +30\n  Разнообразие >15 продуктов: +25\n  Ферментированные продукты: +15\n  Без ультрапереработанных: +15',
      source: 'Sonnenburg & Sonnenburg, 2014; Makki et al., 2018',
      pmid: '24336217',
      interpretation: '>75 — здоровый микробиом. <50 — добавь клетчатку и разнообразие.',
      priority: 'MEDIUM',
      category: 'NUTRITION',
      actionability: 'LONG_TERM',
      impactScore: 0.50,
      whyImportant: 'Здоровый кишечник = лучшее усвоение, иммунитет, настроение.'
    },
    STATUS_SCORE: {
      name: 'Метаболический статус 0-100',
      formula: 'Оценка текущего метаболического состояния:\n  • База: 100 очков\n  • Питание: ±30 (соблюдение норм БЖУ, качество)\n  • Тайминг: ±25 (интервалы между едой, волны)\n  • Активность: ±25 (тренировки, шаги)\n  • Восстановление: ±20 (сон, стресс)',
      source: 'Композитный показатель по методологии ACR + научные паттерны метаболизма',
      pmid: '29754952',
      interpretation: '80-100 — оптимум, жиросжигание работает. 60-79 — норма, есть резервы. <60 — метаболизм замедлен, обрати внимание на причины.',
      priority: 'CRITICAL',
      category: 'COMPOSITE',
      actionability: 'IMMEDIATE',
      impactScore: 1.0,
      whyImportant: '⭐ ГЛАВНАЯ МЕТРИКА! Показывает общее состояние метаболизма прямо сейчас.'
    },
    CRASH_RISK_QUICK: {
      name: 'Риск срыва (светофор)',
      formula: 'Факторы риска:\n  • Недосып (<6ч): +25%\n  • Голодание (>5ч): +20%\n  • Низкий белок (<60г): +15%\n  • Стресс (>4): +15%\n  • Низкий калораж (<70% нормы): +25%',
      source: 'Поведенческие исследования срывов (behavioral relapse prevention)',
      pmid: '19179058',
      interpretation: 'Зелёный — низкий риск, всё в порядке. Жёлтый — умеренный, обрати внимание. Красный — высокий риск, прими меры!',
      priority: 'CRITICAL',
      category: 'RISK',
      actionability: 'IMMEDIATE',
      impactScore: 0.95,
      whyImportant: '🚨 Предупреждает о срыве ДО того как он случится. Красный = действуй сейчас!'
    },
    HEALTH_SCORE: {
      name: 'Health Score (общая оценка)',
      formula: 'Категории (веса зависят от цели):\n  Питание: 40% (качество еды, белок, клетчатка)\n  Тайминг: 25% (интервалы, волны, поздняя еда)\n  Активность: 20% (тренировки, шаги)\n  Восстановление: 15% (сон, стресс)',
      source: 'Композитный показатель из 12+ научных паттернов',
      interpretation: '>80 — отлично! 60-80 — хорошо. <60 — есть над чем работать.',
      priority: 'HIGH',
      category: 'COMPOSITE',
      actionability: 'TODAY',
      impactScore: 0.85,
      whyImportant: 'Единая оценка всех аспектов здоровья. Цель — 80+ баллов.'
    },
    CORRELATION: {
      name: 'Корреляция Пирсона',
      formula: 'r = Σ(x-x̄)(y-ȳ) / √(Σ(x-x̄)² × Σ(y-ȳ)²)\nДиапазон: от -1 до +1',
      source: 'Статистика',
      interpretation: '|r| > 0.7 — сильная связь. 0.4-0.7 — умеренная. <0.4 — слабая.',
      priority: 'INFO',
      category: 'STATISTICS',
      actionability: 'INFORMATIONAL',
      impactScore: 0.20,
      whyImportant: 'Показывает связь между двумя показателями. Чем ближе к ±1 — тем сильнее связь.'
    },
    WEIGHT_PREDICTION: {
      name: 'Прогноз веса',
      formula: 'Линейная регрессия:\n  slope = Σ((day - avgDay)(weight - avgWeight)) / Σ(day - avgDay)²\n  forecast = currentWeight + slope × daysAhead',
      source: 'Статистический анализ временных рядов',
      interpretation: 'Точность зависит от количества данных. ≥7 дней — уверенный прогноз.',
      priority: 'HIGH',
      category: 'PREDICTION',
      actionability: 'WEEKLY',
      impactScore: 0.75,
      whyImportant: 'Показывает куда движется вес. Помогает понять, работает ли текущая стратегия.'
    },
    PATTERNS: {
      name: 'Паттерны поведения',
      formula: 'Анализ закономерностей в данных:\n  • Корреляции между показателями (сон→голод, стресс→еда)\n  • Повторяющиеся паттерны (тайминг еды, перехлёст волн)\n  • Тренды (качество приёмов, белок, клетчатка)',
      source: 'Поведенческий анализ питания (behavioral nutrition patterns)',
      pmid: '21593509',
      interpretation: 'Паттерны помогают понять индивидуальные особенности метаболизма и найти точки роста.',
      priority: 'HIGH',
      category: 'PATTERNS',
      actionability: 'WEEKLY',
      impactScore: 0.80,
      whyImportant: 'Твои уникальные паттерны. Понимание себя = персональная стратегия.'
    }
  };

  // Добавляем SCIENCE_INFO в объект констант
  constants.SCIENCE_INFO = SCIENCE_INFO;

  // Экспорт в namespace
  HEYS.insights.constants = constants;

  // Для обратной совместимости — прямой доступ (deprecated, но нужен при миграции)
  HEYS.insights._PRIORITY_LEVELS = PRIORITY_LEVELS;
  HEYS.insights._CATEGORIES = CATEGORIES;
  HEYS.insights._ACTIONABILITY = ACTIONABILITY;
  HEYS.insights._SECTIONS_CONFIG = SECTIONS_CONFIG;
  HEYS.insights._CONFIG = CONFIG;
  HEYS.insights._SCIENCE_INFO = SCIENCE_INFO;

  // Silent load — no console to pass lint
})();
