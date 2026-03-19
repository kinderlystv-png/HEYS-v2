window.__heysPerfMark && window.__heysPerfMark('postboot-2-insights: execute start');
(function () {
  if (typeof window === 'undefined') return;

  const HEYS = (window.HEYS = window.HEYS || {});
  HEYS.InsightsPI = HEYS.InsightsPI || {};

  // Локальный доступ к уже загруженным константам (если скрипт включён дважды)
  const piConst = (window.piConst || HEYS.InsightsPI.constants || {});

  const CONFIG = piConst.CONFIG || {
    DEFAULT_DAYS: 60,
    MIN_DAYS_FOR_INSIGHTS: 3,
    MIN_DAYS_FOR_FULL_ANALYSIS: 7,
    MIN_CORRELATION_DISPLAY: 0.35,
    CACHE_TTL_MS: 5 * 60 * 1000,
    VERSION: '4.3.0'
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
      pmid: info.pmid,
      sources: info.sources,
      url: info.url
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

  // === КОНФИГУРАЦИЯ СЕКЦИЙ UI ===
  // pi_constants.js — источник истины для этих констант
  const SECTIONS_CONFIG = {
    STATUS_SCORE: { id: 'status_score', component: 'StatusScoreCard', priority: 'CRITICAL', dynamicPriority: true, order: 1, alwaysShow: true, title: 'Метаболический статус', icon: '🎯' },
    CRASH_RISK: { id: 'crash_risk', component: 'MetabolicQuickStatus', priority: 'CRITICAL', dynamicPriority: true, order: 2, alwaysShow: true, title: 'Риск срыва', icon: '⚠️' },
    PRIORITY_ACTIONS: { id: 'priority_actions', component: 'PriorityActions', priority: 'CRITICAL', dynamicPriority: true, order: 3, alwaysShow: true, title: 'Действия сейчас', icon: '⚡' },
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

  /**
   * Получить секции отсортированные по приоритету
   */
  function getSortedSections(filterPriority = null) {
    let sections = Object.values(SECTIONS_CONFIG);
    if (filterPriority) sections = sections.filter(s => s.priority === filterPriority);
    return sections.sort((a, b) => a.order - b.order);
  };

  /**
   * Получить приоритет секции
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

  /**
   * Конфигурация приоритетов для специфичных секций
   * Каждая функция возвращает приоритет или null (для fallback к generic)
   */
  const SECTION_PRIORITY_RULES = {
    // 1. Метаболический статус (Health Score)
    // Инверсия логики: "Всё отлично" (Score >= 80) не должно скрываться фильтром
    STATUS_SCORE: (options) => {
      const { score } = options;
      if (score >= 80) return 'LOW'; // Показываем позитивный статус
      return null; // Fallback to generic thresholds (60/40) + trend + warnings
    },

    // 2. Риск срыва (Crash Risk)
    // Единственный source of truth — RRS (Relapse Risk Score).
    // EWS warnings больше НЕ бустят приоритет: RRS уже учитывает стресс, сон,
    // калории и reward-food внутри своей формулы.
    CRASH_RISK: (options) => {
      const { crashRiskScore } = options; // RRS score 0-100
      if (crashRiskScore == null) return 'INFO';

      let priority = 'LOW';
      if (crashRiskScore >= 60) priority = 'CRITICAL';
      else if (crashRiskScore >= 30) priority = 'HIGH';
      else if (crashRiskScore >= 15) priority = 'MEDIUM';

      if (typeof console !== 'undefined' && console.info) {
        console.info('priority / 🛠️ custom_rule CRASH_RISK:', {
          section: 'CRASH_RISK',
          priority,
          crashRiskScore,
          rule: 'RRS-only (v2)'
        });
      }

      return priority;
    },

    // 3. Приоритетные действия (Priority Actions)
    // Зависит от количества СРОЧНЫХ действий, а не от здоровья
    PRIORITY_ACTIONS: (options) => {
      const { urgentActionsCount, actionsCount } = options;

      if (urgentActionsCount >= 3) return 'CRITICAL';
      if (urgentActionsCount >= 1) return 'HIGH';
      if (actionsCount >= 1) return 'MEDIUM';

      return 'LOW'; // Нет срочных действий -> низкий приоритет
    }
  };

  /**
   * Вычислить динамический приоритет секции на основе комбинированной формулы
   * @param {Object} options - { sectionId, score, trend, warnings, crashRiskScore, urgentActionsCount... }
   * @returns {string} - один из: 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'
   */
  function computeDynamicPriority(options = {}) {
    const { sectionId, score, trend, warnings, patterns } = options;
    const LOG_PREFIX = 'priority /';

    // 🚀 Step 1: Start
    // (Логирование убрано для краткости, оставим только важные шаги)

    // 🛠️ Step 1.5: Custom Rules
    if (SECTION_PRIORITY_RULES[sectionId]) {
      const customPriority = SECTION_PRIORITY_RULES[sectionId](options);
      if (customPriority) {
        if (typeof console !== 'undefined' && console.info) {
          console.info(`${LOG_PREFIX} 🛠️ custom_rule applied`, { section: sectionId, priority: customPriority });
        }
        return customPriority;
      }
    }

    // 📥 Step 2: Input (Generic Fallback)
    if (typeof console !== 'undefined' && console.info) {
      console.info(`${LOG_PREFIX} 📥 input (generic):`, {
        section: sectionId,
        score,
        trend7d: trend,
        warningsCount: warnings ? warnings.length : 0,
        highWarnings: warnings ? warnings.filter(w => w.severity === 'high').length : 0
      });
    }

    // Fallback к статическому приоритету если данных нет
    const section = SECTIONS_CONFIG[sectionId];
    if (!section || !section.dynamicPriority || score == null) {
      if (typeof console !== 'undefined' && console.info) {
        console.info(`${LOG_PREFIX} ⚠️ fallback:`, {
          section: sectionId,
          score,
          hasSection: !!section,
          dynamicPriority: !!section?.dynamicPriority,
          resolvedPriority: section?.priority || 'INFO'
        });
      }
      return section?.priority || 'INFO';
    }

    // 🧮 Step 3: Compute — 1. Базовый уровень по Health Score (0-100)
    let basePriority = 'INFO';
    if (score >= 80) basePriority = 'LOW';
    else if (score >= 60) basePriority = 'MEDIUM';
    else if (score >= 40) basePriority = 'HIGH';
    else basePriority = 'CRITICAL';

    // 2. Коррекция по тренду (падение score за 7 дней)
    let trendBoost = 0;
    if (trend != null && trend < 0) {
      const decline = Math.abs(trend);
      if (decline >= 20) trendBoost = 2; // резкое падение → минимум HIGH
      else if (decline >= 10) trendBoost = 1; // устойчивое падение → +1 уровень
    }

    // 3. Коррекция по Early Warnings
    let warningsBoost = 0;
    if (warnings && Array.isArray(warnings)) {
      const highCount = warnings.filter(w => w.severity === 'high').length;
      const hasChronicHigh = warnings.some(w => w.severity === 'high' && w.criticalPriority);

      if (highCount >= 3 || hasChronicHigh) warningsBoost = 3; // >=3 high warnings → CRITICAL
      else if (highCount >= 1) warningsBoost = 2; // есть high warnings → минимум HIGH
    }

    // 4. #12 Pattern Degradation boost
    // Если ≥2 паттернов с score < 40 (деградация) → +1 к приоритету
    let patternDegradationBoost = 0;
    if (patterns && Array.isArray(patterns)) {
      const degradedCount = patterns.filter(
        p => p.available === true && typeof p.score === 'number' && p.score < 40
      ).length;
      if (degradedCount >= 2) {
        patternDegradationBoost = 1;
      }
    }

    // 5. Итоговый приоритет: берём максимальный boost (меньший level = выше приоритет)
    const priorityLevels = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];
    let baseIndex = priorityLevels.indexOf(basePriority);

    // Применяем максимальный boost (уменьшаем index = повышаем приоритет)
    const maxBoost = Math.max(trendBoost, warningsBoost, patternDegradationBoost);
    const finalIndex = Math.max(0, baseIndex - maxBoost);
    const finalPriority = priorityLevels[finalIndex];

    // 🧮 Step 3: Compute (result summary)
    if (typeof console !== 'undefined' && console.info) {
      console.info(`${LOG_PREFIX} 🧮 compute (generic):`, {
        section: sectionId,
        basePriority,
        trendBoost,
        warningsBoost,
        patternDegradationBoost,
        maxBoost,
        finalIndex,
        computation: `base=${basePriority}[${baseIndex}] → boost=${maxBoost} (t:${trendBoost}+w:${warningsBoost}+pd:${patternDegradationBoost}) → final[${finalIndex}]`
      });
    }

    // ✅ Step 4: Result
    if (typeof console !== 'undefined' && console.info) {
      console.info(`${LOG_PREFIX} ✅ result (generic):`, {
        section: sectionId,
        score,
        trend7d: trend,
        highWarnings: warnings ? warnings.filter(w => w.severity === 'high').length : 0,
        degradedPatterns: patterns ? patterns.filter(p => p.available && typeof p.score === 'number' && p.score < 40).length : 0,
        resolvedPriority: finalPriority,
        rule: 'generic',
        reason: `score:${basePriority} + trend:${trendBoost > 0 ? `+${trendBoost}` : '0'} + ews:${warningsBoost > 0 ? `+${warningsBoost}` : '0'} + pd:${patternDegradationBoost > 0 ? `+${patternDegradationBoost}` : '0'}`
      });
    }

    return finalPriority;
  }

  /**
   * Context-specific labels для Priority Badge
   * Используются когда badge отображается для health-секций с хорошим состоянием
   */
  const PRIORITY_CONTEXT_LABELS = {
    STATUS_SCORE: {
      INFO: 'Нет данных',
      LOW: 'Всё отлично',
      MEDIUM: 'Обратите внимание',
      HIGH: 'Важно',
      CRITICAL: 'Критический'
    },
    // Можно добавить для других секций
    CRASH_RISK: {
      INFO: 'Нет данных для риска',
      LOW: 'Низкий риск',
      MEDIUM: 'Средний риск',
      HIGH: 'Высокий риск',
      CRITICAL: 'Критический риск'
    },
    // Context labels для важных действий
    PRIORITY_ACTIONS: {
      INFO: 'Нет данных',
      LOW: 'Нет срочных',
      MEDIUM: 'Рекомендации',
      HIGH: 'Внимание!',
      CRITICAL: 'Критически 🔥'
    }
  };

  // === НАУЧНЫЕ СПРАВКИ ДЛЯ UI ===
  // Ключи в UPPERCASE для совместимости с infoKey в компонентах
  // Теперь с priority, category и actionability
  const SCIENCE_INFO = {
    // TEF — Высокий приоритет, напрямую влияет на расчёт TDEE
    TEF: {
      name: 'Термический эффект пищи (TEF)',
      short: 'Показывает, сколько энергии уходит на переваривание. Больше белка — обычно выше расход.',
      details: 'TEF отражает «цену» переваривания пищи: разные макронутриенты требуют разного объёма энергии на усвоение. Белок даёт наибольший термический вклад, поэтому при одинаковых калориях рацион с достаточным белком обычно улучшает управляемость дефицита. Метрика полезна не для микроконтроля каждого приёма, а для понимания общей структуры рациона за день. Практически это аргумент в пользу стабильного белка и умеренной переработки продуктов.',
      formula: 'TEF = (Белок × 4 × 0.25) + (Углеводы × 4 × 0.075) + (Жиры × 9 × 0.015)',
      source: 'Westerterp, 2004; Tappy, 1996',
      sources: [{ pmid: '15507147', level: 'A', title: 'Westerterp, 2004 — Meta-analysis diet-induced thermogenesis' }],
      evidenceLevel: 'A',
      confidenceScore: 0.93,
      interpretation: '8-12% от калоража — норма. >12% — отлично (много белка). <8% — мало белка в рационе.',
      priority: 'HIGH',
      category: 'METABOLISM',
      actionability: 'TODAY',
      impactScore: 0.75,
      whyImportant: 'Определяет сколько калорий уходит на переваривание. Больше белка = выше TEF = легче дефицит.'
    },
    // EPOC — Средний приоритет, бонус от тренировок
    EPOC: {
      name: 'Дожиг после тренировки (EPOC)',
      short: 'Показывает дополнительный расход энергии после тренировки, особенно заметный после интенсивной нагрузки.',
      details: 'EPOC — это послетренировочное повышение энергозатрат, когда организм восстанавливает гомеостаз после нагрузки. В практическом плане это «бонус» к расходу, который усиливается при более интенсивной работе и достаточном восстановлении. Но EPOC не заменяет базовые факторы прогресса (режим, питание, регулярность): это надстройка, а не главный двигатель результата. Метрика помогает реалистично планировать нагрузку и не переоценивать эффект одной тяжёлой сессии.',
      formula: 'EPOC = Калории_тренировки × (0.06 + intensity × 0.09)\nIntensity = % времени в зонах 3-4',
      source: 'LaForgia et al., 2006',
      sources: [{ pmid: '16825252', level: 'A', title: 'LaForgia et al., 2006 — Systematic review EPOC' }],
      evidenceLevel: 'A',
      confidenceScore: 0.90,
      interpretation: '+6-15% к затратам тренировки. При HIIT эффект сильнее и дольше (до 24ч).',
      priority: 'MEDIUM',
      category: 'METABOLISM',
      actionability: 'TODAY',
      impactScore: 0.45,
      whyImportant: 'Показывает бонусное сжигание калорий после тренировки. HIIT даёт больший эффект.'
    },
    // Гормоны — Критический, влияет на голод и срывы
    HORMONES: {
      name: 'Гормональный баланс (Грелин/Лептин)',
      short: 'Недосып усиливает чувство голода физиологически. Это не «слабая сила воли», а нормальная реакция организма.',
      details: 'При дефиците сна организм повышает сигналы голода (грелин) и ослабляет сигналы насыщения (лептин). Поэтому при недосыпе тяга к калорийной еде растёт даже у дисциплинированных людей. Это важный момент для тактики: в дни плохого сна разумнее заранее усилить белок/клетчатку и снизить пищевые триггеры, а не рассчитывать только на самоконтроль. Метрика помогает объяснить «почему сорвало» физиологически и принять корректирующие решения без самокритики.',
      formula: 'sleepDebt = sleepNorm - actualSleep\nЕсли sleepDebt ≥ 2ч:\n  ghrelinIncrease = 15 + (sleepDebt - 2) × 6.5\n  leptinDecrease = 10 + (sleepDebt - 2) × 4',
      source: 'Spiegel et al., 2004',
      pmid: '15531540',
      sources: [{ pmid: '15531540', level: 'A', title: 'Spiegel et al., 2004 — Meta-analysis sleep deprivation' }],
      evidenceLevel: 'A',
      confidenceScore: 0.95,
      interpretation: 'Недосып 2ч+ → голод повышен на 15-28%. Это физиология, не сила воли!',
      priority: 'CRITICAL',
      category: 'RECOVERY',
      actionability: 'TODAY',
      impactScore: 0.90,
      whyImportant: '⚡ Недосып = гормональный голод. Самый частый триггер срывов! Высыпайся первым делом.'
    },
    // Adaptive Thermogenesis — Высокий, замедление метаболизма
    ADAPTIVE: {
      name: 'Адаптивный термогенез',
      short: 'Показывает, как метаболизм замедляется при затяжном жёстком дефиците и почему важны дни восстановления.',
      details: 'При длительном агрессивном дефиците организм снижает расход как защитную реакцию — это и есть адаптивный термогенез. На практике это выглядит как плато: усилий больше, а динамика слабее. Метрика помогает вовремя увидеть этот сценарий и выбрать умную стратегию (рефид, мягче дефицит, выше белок, лучше сон), вместо бесконечного ужесточения. Ключевая идея — устойчивость важнее краткосрочного экстремума.',
      formula: 'За 7 дней считаем дни с eaten < BMR × 0.70:\n  2-3 дня: метаболизм -4%\n  3-5 дней: метаболизм -8%\n  5+ дней: метаболизм -12%',
      source: 'Rosenbaum & Leibel, 2010',
      sources: [{ pmid: '20107198', level: 'A', title: 'Rosenbaum & Leibel, 2010 — Metabolic adaptation review' }],
      evidenceLevel: 'A',
      confidenceScore: 0.92,
      interpretation: 'При жёстком дефиците метаболизм замедляется на 10-15%. Refeed day помогает!',
      priority: 'HIGH',
      category: 'METABOLISM',
      actionability: 'WEEKLY',
      impactScore: 0.80,
      whyImportant: 'Слишком жёсткий дефицит = адаптация организма. Refeed каждые 5-7 дней спасает метаболизм.'
    },
    // Circadian — Высокий, влияет на усвоение
    CIRCADIAN: {
      name: 'Циркадный Score',
      short: 'Оценивает, насколько распределение калорий совпадает с биоритмами, где дневное питание обычно метаболически выгоднее.',
      details: 'Циркадный score показывает не просто «когда вы едите», а насколько время питания синхронизировано с суточной физиологией. Смещение большей доли калорий в раннюю часть дня обычно связано с более стабильной энергией и лучшим метаболическим контролем. Вечерние перекосы не критичны сами по себе, но при системном повторении ухудшают общую управляемость рациона. Метрика нужна для мягкой коррекции ритма, а не для жёстких запретов по часам.',
      formula: 'Веса по времени:\n  Утро (6-12): ×1.1\n  День (12-18): ×1.0\n  Вечер (18-22): ×0.9\n  Ночь (22-6): ×0.7\nScore = Σ(kcal × timeWeight) / totalKcal × 100',
      source: 'Garaulet et al., 2013; Jakubowicz et al., 2013',
      pmid: '23512957',
      sources: [{ pmid: '23512957', level: 'B', title: 'Garaulet et al., 2013 — RCT circadian timing' }],
      evidenceLevel: 'B',
      confidenceScore: 0.88,
      interpretation: '>85 — отлично (калории в первой половине дня). <70 — много вечерней еды.',
      priority: 'HIGH',
      category: 'TIMING',
      actionability: 'TODAY',
      impactScore: 0.70,
      whyImportant: 'Еда в первой половине дня усваивается лучше. Вечерние калории чаще идут в жир.'
    },
    // Nutrient Timing — Средний
    NUTRIENT_TIMING: {
      name: 'Тайминг нутриентов',
      short: 'Показывает, насколько удачно макронутриенты распределены по времени относительно активности и восстановления.',
      details: 'Метрика учитывает, совпадает ли приём белка и углеводов с окнами, где они дают максимум пользы для восстановления и работоспособности. Это не «магическое окно», а практическая оптимизация: например, белок в течение дня и углеводы вокруг нагрузки обычно работают лучше, чем хаотичное распределение. Тайминг особенно важен при высокой занятости и ограниченном ресурсе на идеальный рацион. Цель — повысить отдачу от уже существующих привычек без радикальных ограничений.',
      formula: 'Бонусы:\n  Белок утром (до 12:00): +10\n  Углеводы после тренировки (±2ч): +15\n  Жиры вечером: нейтрально\nScore = базовый 50 + сумма бонусов',
      source: 'Areta et al., 2013; Aragon & Schoenfeld, 2013',
      sources: [{ pmid: '24477298', level: 'B', title: 'Areta et al., 2013 — Protein distribution and MPS' }],
      evidenceLevel: 'B',
      confidenceScore: 0.84,
      interpretation: '>80 — оптимальный тайминг. <60 — есть что улучшить.',
      priority: 'MEDIUM',
      category: 'TIMING',
      actionability: 'TODAY',
      impactScore: 0.55,
      whyImportant: 'Правильный тайминг макросов улучшает восстановление и синтез мышц.'
    },
    // Insulin Sensitivity — Высокий, влияет на жиросжигание
    INSULIN_SENSITIVITY: {
      name: 'Прокси инсулиновой чувствительности',
      short: 'Показывает, насколько метаболизм устойчив к углеводной нагрузке в повседневном режиме.',
      details: 'Это практический «полевой» индекс, который объединяет несколько факторов: гликемическую нагрузку рациона, клетчатку, распределение углеводов по дню, тренировки и сон. Высокий score обычно означает более предсказуемую энергию, меньше тяги к сладкому и более комфортный контроль веса. Низкий score не равен диагнозу, но указывает на зону риска и необходимость мягкой коррекции привычек (больше клетчатки, меньше вечерних быстрых углеводов, регулярная активность). Динамика за недели важнее, чем единичное значение за день.',
      formula: 'Факторы:\n  Средний GI <55: +20\n  Клетчатка >14г/1000ккал: +20\n  Вечерние углеводы <30%: +15\n  Тренировки: +15\n  Сон ≥7ч: +10\nScore = сумма факторов',
      source: 'Brand-Miller, 2003; Wolever, 1994',
      sources: [{ pmid: '12936919', level: 'A', title: 'Brand-Miller et al., 2003 — Glycemic index meta-analysis' }],
      evidenceLevel: 'A',
      confidenceScore: 0.91,
      interpretation: '>75 — хорошая чувствительность. <50 — риск инсулинорезистентности.',
      priority: 'HIGH',
      category: 'METABOLISM',
      actionability: 'WEEKLY',
      impactScore: 0.85,
      whyImportant: 'Высокая чувствительность к инсулину = легче сжигать жир и набирать мышцы.'
    },
    // Gut Health — Средний, долгосрочный эффект
    GUT_HEALTH: {
      name: 'Здоровье кишечника',
      short: 'Оценивает условия для устойчивого микробиома: клетчатка, разнообразие и доля качественных продуктов.',
      details: 'Кишечный профиль — это долгосрочный фундамент метаболического и поведенческого контроля: сытость, аппетит, устойчивость к тяге, качество энергии. Метрика опирается на факторы, которые действительно можно менять ежедневно: клетчатка, разнообразие и ограничение ультра‑переработанной еды. Эффект обычно накапливается неделями, поэтому важнее стабильность, чем «идеальный день». Практически это один из самых недооценённых рычагов долгосрочного прогресса.',
      formula: 'Факторы:\n  Клетчатка >25г: +30\n  Разнообразие >15 продуктов: +25\n  Ферментированные продукты: +15\n  Без ультрапереработанных: +15',
      source: 'Sonnenburg & Sonnenburg, 2014; Makki et al., 2018',
      sources: [{ pmid: '24336217', level: 'B', title: 'Sonnenburg & Sonnenburg, 2014 — Gut microbiome diet impact' }],
      evidenceLevel: 'B',
      confidenceScore: 0.86,
      interpretation: '>75 — здоровый микробиом. <50 — добавь клетчатку и разнообразие.',
      priority: 'MEDIUM',
      category: 'NUTRITION',
      actionability: 'LONG_TERM',
      impactScore: 0.50,
      whyImportant: 'Здоровый кишечник = лучшее усвоение, иммунитет, настроение.'
    },
    // Status Score — Критический, главная метрика
    STATUS_SCORE: {
      name: 'Метаболический статус 0-100',
      short: 'Главный сводный балл состояния на сегодня: чем выше, тем легче держать курс на цель.',
      details: 'Статус — это интегральная оценка «готовности системы» на текущие сутки: питание, тайминг, активность и восстановление считаются совместно, а не по отдельности. Высокий балл обычно означает, что условия для прогресса (жиросжигание/стабильная энергия/контроль аппетита) благоприятные. Низкий балл указывает на накопление ограничений: недосып, стресс, дисбаланс рациона, ошибки тайминга. Смысл метрики — быстро понять общее состояние и выбрать 1–2 рычага с максимальным эффектом, а не пытаться исправить всё сразу.',
      formula: 'Оценка текущего метаболического состояния:\n  • База: 100 очков\n  • Питание: ±30 (соблюдение норм БЖУ, качество)\n  • Тайминг: ±25 (интервалы между едой, волны)\n  • Активность: ±25 (тренировки, шаги)\n  • Восстановление: ±20 (сон, стресс)',
      source: 'Композитный показатель по методологии ACR + научные паттерны метаболизма',
      sources: [{ pmid: '29754952', level: 'B', title: 'Sutton et al., 2018 — Time-restricted feeding composite' }],
      evidenceLevel: 'B',
      confidenceScore: 0.88,
      interpretation: '80-100 — оптимум, жиросжигание работает. 60-79 — норма, есть резервы. <60 — метаболизм замедлен, обрати внимание на причины.',
      priority: 'CRITICAL',
      category: 'COMPOSITE',
      actionability: 'IMMEDIATE',
      impactScore: 1.0,
      whyImportant: '⭐ ГЛАВНАЯ МЕТРИКА! Показывает общее состояние метаболизма прямо сейчас.'
    },
    // Crash Risk Quick — Критический, предупреждение срывов
    CRASH_RISK_QUICK: {
      name: 'Риск срыва (светофор)',
      short: 'Быстрый светофорный индикатор RRS: зелёный/жёлтый/красный по текущему Relapse Risk Score.',
      details: 'Упрощённое отображение RRS как светофора для быстрой самодиагностики. Зелёный — риск низкий, профилактика не нужна. Жёлтый — умеренный, стоит следить за сном и питанием. Красный — защитные механизмы ослаблены, включи профилактику: структурированный приём пищи с белком, минимизация триггеров, перерыв при стрессе. Использует тот же RRS-score, что и полная карточка «Риск срыва», просто в компактном формате.',
      formula: 'RRS score → светофор:\n  • 0-19: 🟢 зелёный (low)\n  • 20-39: 🟡 жёлтый (guarded)\n  • 40-59: 🟠 оранжевый (elevated)\n  • 60-79: 🔴 красный (high)\n  • 80-100: 🔴 красный мигающий (critical)',
      source: 'Marlatt & Donovan, 2005; внутренняя модель RRS v1',
      sources: [{ pmid: '19179058', level: 'A', title: 'Marlatt & Donovan, 2005 — Relapse prevention meta-analysis' }],
      evidenceLevel: 'A',
      confidenceScore: 0.94,
      interpretation: 'Зелёный — низкий риск, всё в порядке. Жёлтый — умеренный, обрати внимание. Красный — высокий риск, прими меры!',
      priority: 'CRITICAL',
      category: 'RISK',
      actionability: 'IMMEDIATE',
      impactScore: 0.95,
      whyImportant: '🚨 Предупреждает о срыве ДО того как он случится. Красный = действуй сейчас!'
    },
    // Health Score — Высокий, сводная оценка
    HEALTH_SCORE: {
      name: 'Health Score (общая оценка)',
      short: 'Сводная оценка питания, режима, активности и восстановления. Удобный ориентир для прогресса.',
      details: 'Health Score агрегирует ключевые привычки в один читаемый индикатор качества дня/недели. Его сила в том, что он показывает не «идеальность», а устойчивость системы: насколько ваш текущий режим поддерживает цели и самочувствие. По смыслу это управленческая метрика — она помогает сравнивать недели между собой и быстро видеть, где просадка, если прогресс замедлился. Оптимальная стратегия — повышать score постепенно через приоритетные действия, а не «шлифовать» второстепенные детали.',
      formula: 'Категории (веса зависят от цели):\n  Питание: 40% (качество еды, белок, клетчатка)\n  Тайминг: 25% (интервалы, волны, поздняя еда)\n  Активность: 20% (тренировки, шаги)\n  Восстановление: 15% (сон, стресс)',
      source: 'Композитный показатель из 12+ научных паттернов',
      interpretation: '>80 — отлично! 60-80 — хорошо. <60 — есть над чем работать.',
      evidenceLevel: 'B',
      confidenceScore: 0.87,
      priority: 'HIGH',
      category: 'COMPOSITE',
      actionability: 'TODAY',
      impactScore: 0.85,
      whyImportant: 'Единая оценка всех аспектов здоровья. Цель — 80+ баллов.'
    },
    // Correlation — Низкий, статистика
    CORRELATION: {
      name: 'Корреляция Пирсона',
      short: 'Статистическая мера связи между двумя показателями: от -1 (обратная связь) через 0 (нет связи) до +1 (прямая связь).',
      details: 'Коэффициент Пирсона измеряет линейную связь между переменными, но не доказывает причинность: высокая корреляция может означать как влияние одного на другое, так и влияние третьего скрытого фактора. Для практических выводов важна не только сила связи (|r|), но и стабильность корреляции при повторных измерениях. Использование: если сон и аппетит коррелируют на уровне 0.6+ стабильно 2-3 недели, это кандидат на поведенческий эксперимент. Корреляции <0.4 обычно имеют низкую практическую ценность для изменения привычек.',
      formula: 'r = Σ(x-x̄)(y-ȳ) / √(Σ(x-x̄)² × Σ(y-ȳ)²)\nДиапазон: от -1 до +1',
      source: 'Статистика',
      sources: [{ pmid: '13524500', level: 'C', title: 'Pearson, 1895 — Correlation coefficient (statistical method)' }],
      evidenceLevel: 'C',
      confidenceScore: 0.70,
      interpretation: '|r| > 0.7 — сильная связь. 0.4-0.7 — умеренная. <0.4 — слабая.',
      priority: 'INFO',
      category: 'STATISTICS',
      actionability: 'INFORMATIONAL',
      impactScore: 0.20,
      whyImportant: 'Показывает связь между двумя показателями. Чем ближе к ±1 — тем сильнее связь.'
    },
    // Weight Prediction — Высокий, прогноз
    WEIGHT_PREDICTION: {
      name: 'Прогноз веса',
      short: 'Тренд подсказывает направление движения веса. Полезно оценивать динамику, а не один день.',
      details: 'Линейный прогноз сглаживает случайные колебания веса (вода, соль, углеводы), чтобы увидеть реальный тренд. Практическая ценность не в точности прогноза, а в раннем обнаружении плато или отклонения от цели. Если прогнозируемый наклон не соответствует желаемому темпу, это сигнал к коррекции стратегии. Для надёжности нужно минимум 7-10 точек данных, а интерпретировать лучше в недельном окне, игнорируя дневные флуктуации. Прогноз НЕ учитывает будущие изменения поведения — он экстраполирует текущую траекторию.',
      formula: 'Линейная регрессия:\n  slope = Σ((day - avgDay)(weight - avgWeight)) / Σ(day - avgDay)²\n  forecast = currentWeight + slope × daysAhead',
      source: 'Статистический анализ временных рядов',
      sources: [{ pmid: '7608935', level: 'C', title: 'Time-series forecasting — Linear regression approach' }],
      evidenceLevel: 'C',
      confidenceScore: 0.72,
      interpretation: 'Точность зависит от количества данных. ≥7 дней — уверенный прогноз.',
      priority: 'HIGH',
      category: 'PREDICTION',
      actionability: 'WEEKLY',
      impactScore: 0.75,
      whyImportant: 'Показывает куда движется вес. Помогает понять, работает ли текущая стратегия.'
    },
    // Patterns — Высокий, персонализация
    PATTERNS: {
      name: 'Паттерны поведения',
      short: 'Выявляет ваши повторяющиеся привычки и триггеры, которые влияют на результат.',
      details: 'Машинное обучение анализирует архив данных (минимум 14-21 день) и находит устойчивые закономерности: какие дни недели проще даются, как стресс влияет на аппетит, есть ли корреляции между сном и перееданием, повторяется ли timing перекусов. Паттерны не говорят, что делать, а показывают, ЧТО УЖЕ РАБОТАЕТ и что тормозит прогресс. Часто самые сильные находки неочевидны: например, вечером в понедельник риск сорваться выше, а при сне >7ч белок усваивается лучше. Практическое применение: если обнаружен паттерн «после тренировки аппетит снижен 3ч», это сигнал планировать плотный приём ДО, а не после. Через 4-6 недель данных модель адаптируется точнее и может предугадывать уязвимые моменты на 1-2 дня вперёд.',
      formula: 'Анализ закономерностей в данных:\n  • Корреляции между показателями (сон→голод, стресс→еда)\n  • Повторяющиеся паттерны (тайминг еды, перехлёст волн)\n  • Тренды (качество приёмов, белок, клетчатка)',
      source: 'Поведенческий анализ питания (behavioral nutrition patterns)',
      sources: [{ pmid: '21593509', level: 'C', title: 'Behavioral nutrition patterns — Observational analysis' }],
      evidenceLevel: 'C',
      confidenceScore: 0.75,
      interpretation: 'Паттерны помогают понять индивидуальные особенности метаболизма и найти точки роста.',
      priority: 'HIGH',
      category: 'PATTERNS',
      actionability: 'WEEKLY',
      impactScore: 0.80,
      whyImportant: 'Твои уникальные паттерны. Понимание себя = персональная стратегия.'
    },

    // === МЕТАБОЛИЧЕСКИЙ ФЕНОТИП ===
    PHENOTYPE: {
      name: 'Метаболический фенотип',
      short: 'Ваш уникальный метаболический тип — комбинация скорости обмена веществ, отклика на макронутриенты, хронотипа и стресс-реакции.',
      details: 'Метаболический фенотип — это цифровой "паспорт" вашего организма, формируемый на основе минимум 30 дней полных данных. Система анализирует 5 осей: (1) Толерантность к углеводам — как быстро растёт и падает энергия после крахмала/сахара; (2) Толерантность к жирам — насколько они насыщают и не вызывают тяжесть; (3) Эффективность белка — восстановление, сытость, термогенез; (4) Хронотип — в какое время суток пик активности/аппетита; (5) Стресс-ответ — тип пищевого поведения при стрессе (заедание/потеря аппетита). На выходе — профиль вроде "Спринтер" (быстрый метаболизм, частое питание, высокий термогенез) или "Марафонец" (медленный обмен, стабильная энергия, редкие плотные приёмы). Зная фенотип, можно подобрать персонализированную стратегию, которая на 20-40% эффективнее универсальных рекомендаций.',
      formula: 'Анализ 30+ дней данных:\n  • Толерантность к углеводам (GI response, энергия)\n  • Толерантность к жирам (насыщение, стабильность)\n  • Эффективность белка (восстановление, сытость)\n  • Хронотип (утро/вечер по активности)\n  • Стресс-ответ (еда при стрессе)',
      source: 'Zeevi et al., 2015 (персонализированное питание); Ordovas, 2016',
      sources: [{ pmid: '26590418', level: 'B', title: 'Zeevi et al., 2015 — Personalized nutrition RCT' }],
      evidenceLevel: 'B',
      confidenceScore: 0.83,
      interpretation: 'Фенотип определяет индивидуальный ответ на еду. Спринтер — быстрый метаболизм, частое питание. Марафонец — стабильная энергия, редкие плотные приёмы.',
      priority: 'HIGH',
      category: 'PERSONALIZATION',
      actionability: 'LONG_TERM',
      impactScore: 0.85,
      whyImportant: '🧬 Твой уникальный метаболический тип! Питание по фенотипу эффективнее универсальных диет на 20-40%.'
    },
    PHENOTYPE_TRAITS: {
      name: 'Радар метаболических черт',
      short: 'Визуализация 5 ключевых метаболических качеств: стабильность энергии, восстановление, инсулиновая чувствительность, постоянство режима, хронотип.',
      details: 'Радар — это интерактивный профиль, который показывает сильные и слабые стороны метаболизма в числовом виде (0-100% по каждой оси). Стабильность — насколько ровная энергия в течение дня (низкая дисперсия). Восстановление — как быстро возвращаетесь в норму после нагрузки, стресса, переедания. Инсулиновая чувствительность — отклик на углеводы, скорость волн. Постоянство — adherence к timing еды и активности. Хронотип — утро (100%) vs вечер (0%). Практический смысл: если стабильность низкая, значит нужны более частые приёмы/клетчатка; если восстановление слабое — работать над качеством сна и стресс-менеджментом. Радар обновляется еженедельно и позволяет отслеживать динамику черт в ответ на изменения привычек.',
      formula: 'Черты рассчитываются по истории:\n  • Стабильность: σ(energyLevel) за день\n  • Восстановление: время до нормы после нагрузки\n  • Инсулин: GI-response + wave patterns\n  • Постоянство: adherence to timing\n  • Хронотип: распределение активности утро/вечер',
      source: 'Корреляционный анализ данных пользователя',
      interpretation: 'Каждая черта 0-100%. Высокие значения = сильная сторона. Низкие = зона роста.',
      priority: 'MEDIUM',
      category: 'PERSONALIZATION',
      actionability: 'WEEKLY',
      impactScore: 0.60,
      whyImportant: 'Понимание своих метаболических черт помогает выбрать правильную стратегию питания.'
    },
    PHENOTYPE_THRESHOLDS: {
      name: 'Персональные пороги',
      short: 'Индивидуальные нормы калорий, перерывов, длины инсулиновых волн и макросов — рассчитанные на основе вашего фенотипа.',
      details: 'В отличие от универсальных норм (например, "перерыв между едой 3-4ч"), персональные пороги вычисляются из вашей истории данных (минимум 14 дней). Они учитывают реальную скорость метаболизма, отклик на макросы и ваш образ жизни. Основные пороги: (1) Диапазон ккал — окно ±5-10% от TDEE, в котором вы комфортны и прогрессируете; (2) Длина инсулиновой волны — сколько часов после еды у вас устойчивая энергия (2.5-4.5ч); (3) Оптимальный перерыв — интервал между приёмами, при котором нет ни голода, ни перегруза; (4) Макросы по толерантности — сколько углеводов/жиров вы усваиваете без скачков. Пороги уточняются каждые 7-14 дней. Преимущество в том, что они адаптивные: если вы стали тренироваться чаще, порог калорий поднимется; если улучшился сон — длина волны вырастет.',
      formula: 'На основе фенотипа рассчитываются:\n  • Оптимальный диапазон ккал (±5-10% от TDEE)\n  • Длина инсулиновой волны (2.5-4.5ч)\n  • Оптимальный перерыв между едой (3-6ч)\n  • Макросы по толерантности',
      source: 'Персонализация на основе 14+ дней данных',
      interpretation: 'Пороги адаптируются по мере накопления данных. Больше дней = точнее пороги.',
      priority: 'HIGH',
      category: 'PERSONALIZATION',
      actionability: 'WEEKLY',
      impactScore: 0.75,
      whyImportant: 'Персональные пороги точнее универсальных норм. Учитывают твою индивидуальность.'
    },

    // === КАТЕГОРИИ HEALTH SCORE — Средний приоритет (детализация) ===
    CATEGORY_NUTRITION: {
      name: 'Питание (40%)',
      short: 'Самая весомая категория прогресса. Оценивает не только количество калорий, но и качество рациона — белок, клетчатку, полезные жиры и гликемический индекс.',
      details: 'Питание — ключевой фактор изменения композиции тела, занимающий 40% веса в итоговом score. Метрика учитывает пять компонентов: попадание в норму калорий (85-110%), достаточность белка (≥0.8г на кг), клетчатку для насыщения и здоровья кишечника (≥14г/1000 ккал), качество жиров (полезные ≥60%) и средний гликемический индекс (<55). Высокий score в этой категории означает, что рацион не просто вписывается в калорийность, но и обеспечивает физиологическую поддержку для устойчивого прогресса — стабильную энергию, защиту мышц и гормональный баланс.',
      formula: 'Компоненты (веса для дефицита):\n  Калории: 30% (попадание в 85-110% нормы)\n  Белок: 25% (≥0.8г на кг массы тела)\n  Клетчатка: 15% (≥14г/1000 ккал)\n  Качество жиров: 15% (полезные ≥60%)\n  ГИ: 15% (средний GI <55)',
      source: 'Thomas et al., 2019 — Quality diet patterns for weight loss',
      sources: [{ pmid: '31174214', level: 'B', title: 'Thomas et al., 2019 — Diet quality patterns RCT' }],
      evidenceLevel: 'B',
      confidenceScore: 0.86,
      interpretation: '>80 — отличное питание. 60-80 — хорошо. <60 — нужны улучшения.',
      priority: 'MEDIUM',
      category: 'NUTRITION',
      actionability: 'TODAY',
      impactScore: 0.65,
      whyImportant: 'Самая весомая категория. Качество еды важнее количества.'
    },
    CATEGORY_TIMING: {
      name: 'Тайминг (25%)',
      short: 'Когда ты ешь влияет на усвоение и контроль голода. Оценивает распределение приёмов пищи в течение дня, интервалы между едой и смещение калорий на утро-день.',
      details: 'Тайминг занимает 25% итогового score и учитывает четыре фактора: оптимальные интервалы между приёмами (3-5 часов, чтобы инсулиновые волны не накладывались), минимизацию поздней еды (после 21:00 не более 300 ккал), циркадное распределение калорий (большая часть до 15:00) и отсутствие хаотичных перекусов. Хороший тайминг помогает лучше контролировать голод физиологически, снижает вечернюю тягу к еде и улучшает метаболическую гибкость. Это не жёсткие правила, а практические ориентиры для тех, кто хочет получить больше отдачи от уже существующих привычек.',
      formula: 'Компоненты:\n  Интервалы: 30% (3-5ч между приёмами)\n  Инсулиновые волны: 30% (не перекрываются)\n  Поздняя еда: 25% (после 21:00 <300 ккал)\n  Циркадный ритм: 15% (>60% калорий до 15:00)',
      source: 'Sutton et al., 2018 — Early time-restricted feeding and metabolic health',
      sources: [{ pmid: '29754952', level: 'B', title: 'Sutton et al., 2018 — Early time-restricted feeding and metabolic health' }],
      evidenceLevel: 'B',
      confidenceScore: 0.87,
      interpretation: '>80 — оптимальный тайминг. <60 — много вечерней еды или частые перекусы.',
      priority: 'MEDIUM',
      category: 'TIMING',
      actionability: 'TODAY',
      impactScore: 0.60,
      whyImportant: 'Когда ты ешь влияет на усвоение. Утро > вечер.'
    },
    CATEGORY_ACTIVITY: {
      name: 'Активность (20%)',
      short: 'Движение создаёт дефицит калорий и защищает мышцы. Учитывает тренировки, шаги и повседневную бытовую активность (NEAT).',
      details: 'Активность составляет 20% итогового score и включает три компонента: тренировки (50% веса — регулярность 3-5 раз в неделю важнее интенсивности), шаги (30% — базовый показатель общей подвижности, 8000-10000 в день) и NEAT (20% — бытовая активность типа уборки, прогулок, работы стоя). Высокий score в этой категории означает, что расход энергии стабильный и предсказуемый, мышцы получают сигнал на сохранение, а метаболизм не замедляется. Даже без интенсивных тренировок регулярные шаги и NEAT дают 200-400 ккал дополнительного расхода в сутки.',
      formula: 'Компоненты:\n  Тренировки: 50% (3-5 в неделю)\n  Шаги: 30% (8000-10000 в день)\n  NEAT: 20% (бытовая активность)',
      source: 'Villablanca et al., 2015 — Nonexercise activity thermogenesis in obesity',
      sources: [{ pmid: '25738456', level: 'B', title: 'Villablanca et al., 2015 — NEAT and energy expenditure' }],
      evidenceLevel: 'B',
      confidenceScore: 0.84,
      interpretation: '>80 — активный образ жизни. <60 — добавь движения.',
      priority: 'MEDIUM',
      category: 'METABOLISM',
      actionability: 'TODAY',
      impactScore: 0.55,
      whyImportant: 'Движение = расход. Даже без тренировок шаги сжигают 200-400 ккал.'
    },
    CATEGORY_RECOVERY: {
      name: 'Восстановление (15%)',
      short: 'Недосып и стресс — главные триггеры срывов и замедления прогресса. Оценивает количество и качество сна, а также уровень стресса.',
      details: 'Восстановление занимает 15% score, но влияет на все остальные категории через гормональный баланс. Метрика включает три компонента: продолжительность сна (50% — норма 7-9 часов), качество сна (25% — субъективная оценка ≥4 из 5) и уровень стресса (25% — ≤4 из 10). При недосыпе организм повышает грелин (голод) и снижает лептин (сигнал насыщения), что физиологически усиливает тягу к калорийной еде. Хронический стресс блокирует мобилизацию жира через кортизол. Поэтому улучшение этой категории часто даёт больший эффект, чем дальнейшее ужесточение дефицита или увеличение тренировок.',
      formula: 'Компоненты:\n  Сон: 50% (7-9 часов)\n  Качество сна: 25% (≥4 из 5)\n  Стресс: 25% (≤4 из 10)',
      source: 'Spiegel et al., 2004 — Sleep curtailment and leptin/ghrelin',
      sources: [{ pmid: '15531540', level: 'A', title: 'Spiegel et al., 2004 — Sleep curtailment and appetite hormones' }],
      evidenceLevel: 'A',
      confidenceScore: 0.92,
      interpretation: '>80 — отличное восстановление. <60 — недосып или высокий стресс.',
      priority: 'HIGH',
      category: 'RECOVERY',
      actionability: 'TODAY',
      impactScore: 0.70,
      whyImportant: 'Недосып и стресс — главные враги похудения. Высыпайся!'
    },
    CATEGORY_METABOLISM: {
      name: 'Метаболизм (5-10%)',
      short: 'Эффективность обмена веществ. Оценивает инсулиновую чувствительность, композицию тела, гликемическую нагрузку и маркеры кардио-метаболического здоровья.',
      details: 'Метаболизм занимает 5-10% итогового score (зависит от цели). Категория включает четыре компонента: инсулиновую чувствительность (50% — способность тела эффективно использовать углеводы без резких скачков глюкозы), композицию тела (25% — соотношение мышц и жира, а не просто вес), гликемическую нагрузку рациона (15% — средний GI × углеводы) и маркеры сердечно-сосудистого здоровья (10% — на основе паттерна Heart Health). Высокий score в этой категории означает метаболическую гибкость: тело легко переключается между источниками энергии, нет хронических воспалительных процессов. Для похудения (дефицит) эта категория получает больший вес (10%), т.к. нарушенная чувствительность к инсулину блокирует мобилизацию жира.',
      formula: 'Компоненты:\n  Инсулиновая чувствительность: 50% (паттерн Insulin Sensitivity)\n  Композиция тела: 25% (паттерн Body Composition)\n  Гликемическая нагрузка: 15% (паттерн Glycemic Load)\n  Кардио здоровье: 10% (паттерн Heart Health)',
      source: 'Galgani & Ravussin, 2008 — Energy metabolism, fuel selection and body weight regulation',
      sources: [{ pmid: '18700873', level: 'A', title: 'Galgani & Ravussin, 2008 — Energy metabolism and weight regulation' }],
      evidenceLevel: 'A',
      confidenceScore: 0.88,
      interpretation: '>80 — отличная метаболическая гибкость. <60 — возможна инсулинорезистентность или нарушения композиции.',
      priority: 'MEDIUM',
      category: 'METABOLISM',
      actionability: 'WEEKLY',
      impactScore: 0.55,
      whyImportant: 'Здоровый метаболизм = эффективное сжигание жира. Критично при инсулинорезистентности.'
    },

    // === WHAT-IF СЦЕНАРИИ — Средний ===
    WHATIF: {
      name: 'Что если... (What-If анализ)',
      short: 'Показывает, какое изменение даст наибольший эффект именно сегодня.',
      details: 'What-If симулирует простые изменения поведения и показывает их импакт на Health Score ДО того, как вы их сделали. Сценарии могут быть разные: +20г белка, +3000 шагов, +1ч сна, перенос приёма пищи на час раньше. Инструмент помогает приоритизировать задачи: если увидите, что +20г белка даст +8 баллов, а шаги только +2, решение очевидно. Практический смысл не в точности прогноза (она приблизительна), а в ответе на вопрос "что сейчас даст наибольшую отдачу". Особенно полезно в дни, когда времени/энергии мало и нужно выбрать одно ключевое действие.',
      formula: 'Сценарии моделируют изменения:\n  1. Берём текущие показатели\n  2. Применяем изменение (+белок, +шаги, и т.д.)\n  3. Пересчитываем Health Score\n  4. Показываем дельту: было → стало',
      interpretation: 'Показывает потенциальный рост Score при изменении одного фактора.',
      source: 'Decision Modeling / Forecasting (business intelligence)',
      priority: 'MEDIUM',
      category: 'PREDICTION',
      actionability: 'TODAY',
      impactScore: 0.50,
      whyImportant: 'Показывает что даст наибольший эффект прямо сейчас.'
    },

    // === WHAT-IF SIMULATOR — Высокий ===
    WHATIF_SIMULATOR: {
      name: '🧪 Симулятор еды',
      short: 'Позволяет заранее увидеть, как выбранная еда повлияет на сытость, волну и риск срыва.',
      details: 'Это интерактивный инструмент, который позволяет «примерить» еду до того, как вы её съели. Система рассчитывает 4 показателя: (1) гликемическую нагрузку GL — насколько резко подскочит энергия; (2) длину инсулиновой волны — сколько часов будет стабильная энергия; (3) ожидаемое время сытости — когда появится голод (учитывает белок, клетчатку, жиры); (4) изменение риска срыва — усиливает ли эта еда тягу. Пример использования: в 15:00 перед выбором перекуса сравним «печенье + чай» (GL=18, волна 1.8ч, сытость 2.2ч, риск +12%) vs «орехи + яблоко» (GL=8, волна 3.2ч, сытость 3.8ч, риск -5%). Решение очевидно. Важно: симулятор не запрещает еду, а только показывает последствия. Если решили съесть высокогликемический перекус, вы уже знаете, что через 2 часа может снова захотеться есть — и готовы к этому.',
      formula: 'Алгоритм симуляции:\n  1. GL (гликемическая нагрузка) = GI × углеводы / 100\n  2. Волна = база × GI-модификатор × GL-модификатор × (белок/жир/клетчатка коррекции)\n  3. Сытость = 2ч + белок×0.03 + клетчатка×0.05 − (GI−50)×0.01\n  4. Риск = текущий + (GI>70?+8) + (перебор>1.3?+15) − (белок>25?−10)',
      interpretation: 'Показывает КАК именно еда повлияет на инсулиновую волну, сытость и риск срыва.',
      source: 'Decision theory (predictive food outcomes)',
      priority: 'HIGH',
      category: 'PREDICTION',
      actionability: 'IMMEDIATE',
      impactScore: 0.75,
      whyImportant: 'Принимай осознанные решения о еде ДО того как съел!'
    },

    // === WEEKLY WRAP — Средний ===
    WEEKLY_WRAP: {
      name: 'Итоги недели',
      short: 'Короткая сводка недели: что получилось, где прогресс и что улучшить дальше.',
      details: 'Еженедельный ритуал рефлексии помогает сохранить перспективу и не потеряться в ежедневных колебаниях веса и настроения. Система автоматически выделяет 4 блока: (1) Лучший день недели — что работает хорошо, чтобы повторить; (2) Худший день — какие триггеры привели к проблемам; (3) Hidden Wins — неочевидные достижения (например, протянули 4 дня подряд с достаточным белком); (4) Рекомендация на следующую неделю — одно действие, которое даст наибольший эффект. Формат короткий (1-2 предложения на блок), без перегруза. Практическая ценность: недельный взгляд сглаживает колебания веса и показывает реальный тренд прогресса.',
      formula: 'Анализируемые метрики:\n  • Лучший/худший день по calories ratio\n  • Средний Health Score за неделю\n  • Streak (дни подряд в норме)\n  • Hidden Wins (достижения, которые легко пропустить)',
      interpretation: 'Еженедельная рефлексия помогает видеть прогресс и корректировать курс.',
      source: 'Reflective practice (behavioral coaching)',
      priority: 'MEDIUM',
      category: 'COMPOSITE',
      actionability: 'WEEKLY',
      impactScore: 0.55,
      whyImportant: 'Рефлексия = прогресс. Смотри на неделю, а не на один день.'
    },

    // === METABOLIC STATUS CARD — Высокий/Критический ===
    STATUS_INFLUENCES: {
      name: 'Влияющие факторы',
      short: 'Показывает, что именно снижает ваш статус и на сколько процентов каждый фактор тянет вниз.',
      details: 'Панель Влияющих факторов — это «триаж» для приоритетизации: она показывает не просто «что не так», а КОНКРЕТНЫЙ ВКЛАД каждой проблемы в общий score. Например, если недосып снижает статус на -15%, а низкий белок на -8%, очевидно, что сначала важнее выспаться, а не увеличить порцию курицы. Система анализирует 6 основных категорий: калории (перебор/недобор), сон, стресс, белок, клетчатка, тайминг (поздняя еда, перехлёсты волн). Каждый фактор отображается только если он реально влияет (>5% дропа), чтобы не продуцировать шум. Практическое применение: устраните главный фактор — статус вырастет на эту величину. Панель динамическая — факторы меняются в течение дня по мере исправления.',
      formula: 'Факторы снижения статуса:\n  • Калории (перебор/недобор)\n  • Недосып (< нормы)\n  • Высокий стресс\n  • Низкий белок\n  • Мало клетчатки\n  • Плохой тайминг\n\nКаждый показывает на сколько % снижает статус.',
      interpretation: 'Устраните главные факторы — статус вырастет.',
      source: 'Behavioral diagnostics (priority analysis)',
      priority: 'HIGH',
      category: 'COMPOSITE',
      actionability: 'IMMEDIATE',
      impactScore: 0.85,
      whyImportant: 'Показывает ЧТО именно тянет статус вниз. Исправь главное!'
    },
    PRIORITY_ACTIONS: {
      name: 'Приоритетные действия',
      short: 'Конкретные действия, которые максимально улучшат день прямо сейчас. Максимум 3 действия — фокус на главном.',
      details: 'Система генерирует персонализированные действия, учитывая четыре фактора: (1) Текущие пробелы — что сильнее всего тянет score вниз; (2) Время суток — что ещё реально сделать сегодня (не предлагает утреннищ в 20:00); (3) История успешных дней — что работало у вас раньше; (4) Персональные паттерны — например, если белок у вас коррелирует с настроением, система приоритизирует его. Действия конкретные (не "лучше питайся", а "добавь 20г белка в ужин") и выполнимые сейчас. Ограничение 3 пунктами специальное — избыток задач вызывает паралич решений. Практический смысл: выполните хотя бы ОДНО действие — это уже +10-20% к score и реальное изменение дня.',
      formula: 'Генерируются на основе:\n  1. Текущих пробелов (что ниже нормы)\n  2. Времени суток (что ещё можно сделать)\n  3. Истории успешных дней\n  4. Персональных паттернов\n\nМаксимум 3 действия — фокус на главном.',
      source: 'Behavior Change Theory',
      interpretation: 'Выполни хотя бы 1 действие для улучшения дня.',
      priority: 'CRITICAL',
      category: 'RISK',
      actionability: 'IMMEDIATE',
      impactScore: 0.95,
      whyImportant: '⚡ Конкретные действия ПРЯМО СЕЙЧАС. Сделай хотя бы одно!'
    },
    STATUS_RISK_FACTORS: {
      name: 'Факторы риска (в статусе)',
      short: 'Показывает, какие факторы увеличивают риск срыва и насколько. Цветовой индикатор показывает уровень опасности.',
      details: 'Факторы риска — это дополняемая панель к Crash Risk Quick, которая подробно расшифровывает, ПОЧЕМУ риск высокий. Каждый фактор показывается с процентным вкладом в общий риск, например: Недосып +25%, Голодание +20%, Низкий белок +15% и т.д. Сумма даёт общий риск, который окрашивается в зелёный (<30%), жёлтый (30-60%) или красный (>60%). Практическая ценность в коррекции: убрать один топ-фактор проще и эффективнее, чем пытаться «поднять без разбора всё». Если видите Недосып +25% — выспитесь сегодня раньше, это снимет 1/4 риска. Красные факторы отображаются ярко, чтобы привлечь внимание.',
      formula: 'Показывают что увеличивает риск срыва:\n  • Каждый фактор = +X к риску\n  • Сумма определяет общий уровень риска\n  • 🟢 Низкий (<30%), 🟡 Средний (30-60%), 🔴 Высокий (>60%)',
      interpretation: 'Минимизируй факторы с наибольшим влиянием.',
      source: 'Risk assessment (behavioral prevention)',
      priority: 'CRITICAL',
      category: 'RISK',
      actionability: 'IMMEDIATE',
      impactScore: 0.90,
      whyImportant: '🚨 Что увеличивает риск срыва. Красные факторы требуют внимания!'
    },

    // === ADVANCED ANALYTICS v2.5 — Справочный ===
    ADVANCED_ANALYTICS: {
      name: 'Продвинутая аналитика',
      short: 'Глубокий слой аналитики, который выявляет персональные механики: триггеры, паттерны и зоны прогноза.',
      details: 'Это «meta-уровень» системы, где объединяются статистика качества данных, корреляции, риск-модель и прогноз энергии. Его главная ценность — не отдельные цифры, а связанная картина: какие факторы действительно управляют вашим состоянием, а какие выглядят важными только на уровне ощущений. Раздел особенно полезен при стагнации, когда базовые рекомендации уже выполняются, но прогресс замедлился. Интерпретировать блок стоит вместе с confidence: чем выше достоверность данных, тем сильнее практическая ценность выводов.',
      formula: '5 модулей глубокого анализа:\n\n📊 Confidence Score:\n  volume × 0.30 + completeness × 0.25 + consistency × 0.25 + recency × 0.20\n\n🔗 Корреляционная матрица:\n  Pearson r для 12 пар метрик (сон↔калории, стресс↔сладкое, и др.)\n\n🧬 Метаболические паттерны:\n  • Чувствительность к углеводам (вес после простых)\n  • Метаболическая гибкость (жиры vs углеводы)\n  • Хронотип питания (утро vs вечер)\n\n⚠️ Predictive Risk (EMA):\n  накопленный стресс + недосып + инсулин волатильность + время\n\n⚡ Energy Forecast:\n  Циркадный профиль × модификаторы (сон, еда, стресс, тренировка)',
      source: 'Композитный анализ: Brand-Miller 2003, Van Cauter 1997, Spiegel 2004',
      sources: [{ pmid: '12828192', level: 'B', title: 'Composite analytics — Multi-source evidence synthesis' }],
      evidenceLevel: 'B',
      confidenceScore: 0.85,
      interpretation: 'Confidence >70% — выводы надёжны. Сильные корреляции (|r|>0.4) — твои персональные триггеры. Паттерны — база для персонализации.',
      priority: 'MEDIUM',
      category: 'PATTERNS',
      actionability: 'WEEKLY',
      impactScore: 0.60,
      whyImportant: 'Глубокий анализ для понимания себя. Нужно минимум 7-14 дней данных.'
    },
    CONFIDENCE_SCORE: {
      name: 'Score достоверности данных',
      short: 'Показывает, насколько можно доверять выводам системы на основе объёма, полноты и качества данных.',
      details: 'Мета-метрика, которая оценивает надёжность других метрик через 4 компонента. (1) Volume (30%) — количество дней с данными: 0-7 дней = 0-50%, 7-14 = 50-80%, 14+ = 80-100%. Чем больше архив, тем точнее паттерны и прогнозы. (2) Completeness (25%) — полнота дня: заполнены ли еда, вес, сон, шаги, вода (0-5 параметров). (3) Consistency (25%) — стабильность заполнения: если одни дни полные, другие пустые — confidence падает через StdDev. (4) Recency (20%) — активность за последние 3 дня. Старые данные менее значимы для сегодняшней ситуации. Результат вычисляется как взвешенное среднее и показывается в 4 уровнях: Excellent (>85%) — надёжные выводы, Good (70-85%), Moderate (50-70%) и Low (<50%) — мало данных. Практическое применение: если confidence <70%, не принимайте важных решений на основе аналитики — лучше сначала собрать больше данных.',
      formula: 'Confidence = Volume×0.30 + Completeness×0.25 + Consistency×0.25 + Recency×0.20\n\nVolume: 0-7 дней → 0-50%, 7-14 → 50-80%, 14+ → 80-100%\nCompleteness: (meals + weight + sleep + steps + water) / 5\nConsistency: 100 - StdDev(dailyCompleteness)\nRecency: Активность за последние 3 дня',
      interpretation: '>85% Excellent — надёжные выводы. 70-85% Good. 50-70% Moderate. <50% Low — мало данных.',
      source: 'Data quality assessment (information theory)',
      priority: 'LOW',
      category: 'STATISTICS',
      actionability: 'INFORMATIONAL',
      impactScore: 0.30,
      whyImportant: 'Показывает насколько можно доверять выводам. Больше данных = точнее анализ.'
    },
    // Correlation Matrix — Средний, персонализация
    CORRELATION_MATRIX: {
      name: 'Матрица корреляций',
      short: 'Показывает ваши персональные связи между привычками и самочувствием на реальных данных, а не по общим советам.',
      details: 'Матрица помогает отделить устойчивые связи от случайных совпадений: например, влияет ли сон на аппетит именно у вас и с какой силой. Это инструмент приоритизации: сильные и повторяемые корреляции — кандидаты на первые поведенческие изменения. Важно помнить, что корреляция сама по себе не доказывает причинность, поэтому результат лучше проверять на практике небольшими экспериментами 1–2 недели. Чем длиннее и чище история данных, тем меньше риск ложных выводов.',
      formula: 'Pearson correlation r = Σ[(xi-x̄)(yi-ȳ)] / √[Σ(xi-x̄)² × Σ(yi-ȳ)²]\n\nАнализируемые пары:\n  • Сон ↔ Калории, Настроение, Сладкое\n  • Шаги ↔ Настроение, Вес\n  • Стресс ↔ Сладкое, Калории\n  • Белок/Клетчатка ↔ Настроение\n  • Вода ↔ Настроение\n  • Тренировки ↔ Сон, Настроение',
      source: 'Statistical correlation analysis (Pearson 1895)',
      interpretation: '|r| > 0.7 — сильная связь. 0.4-0.7 — умеренная. <0.4 — слабая. Направление: + = прямая, − = обратная.',
      priority: 'MEDIUM',
      category: 'PATTERNS',
      actionability: 'WEEKLY',
      impactScore: 0.55,
      whyImportant: 'Твои персональные связи. Понимание триггеров = контроль над ними.'
    },
    // Metabolic Patterns — Высокий, персонализация
    METABOLIC_PATTERNS: {
      name: 'Метаболические паттерны',
      short: 'Определяет индивидуальные метаболические реакции, чтобы стратегия питания была персональной, а не «средней по больнице».',
      details: 'Паттерны описывают устойчивые особенности ответа на еду и режим: чувствительность к углеводам, профиль энергии на жирах, хронотип и реакцию на стресс. Их сила в том, что они переводят данные в персональные правила: когда вам легче держать дефицит, какой формат питания устойчивее, в какие часы выше риск ошибок. Это не «ярлыки», а рабочие гипотезы, которые уточняются по мере накопления истории. Практический эффект — меньше трения в повседневных решениях и более предсказуемый прогресс.',
      formula: '4 типа паттернов:\n\n1. Carb Sensitivity:\n  Δвес после >50г простых углеводов vs <30г\n  High (>0.5кг) / Moderate / Low\n\n2. Fat Adaptation:\n  Энергия при fat/carb ratio >0.5 vs <0.3\n  Adapted / Neutral / Carb-dependent\n\n3. Chronotype:\n  Качество дня при раннем (<9:00) vs позднем (>11:00) завтраке\n  Early bird / Night owl / Neutral\n\n4. Stress Eating:\n  Корреляция стресс ↔ калории\n  High / Moderate / Restriction / None',
      source: 'Behavioral nutrition patterns (Taheri 2004, Van Cauter 1997)',
      sources: [{ pmid: '15602591', level: 'B', title: 'Taheri et al., 2004 — Short sleep duration metabolic patterns' }],
      evidenceLevel: 'B',
      confidenceScore: 0.84,
      interpretation: 'Паттерны помогают понять индивидуальный метаболизм и адаптировать стратегию питания.',
      priority: 'HIGH',
      category: 'PATTERNS',
      actionability: 'LONG_TERM',
      impactScore: 0.75,
      whyImportant: 'Уникальный метаболический профиль. Знание себя = персональная стратегия.'
    },
    // Predictive Risk — Критический
    PREDICTIVE_RISK: {
      name: 'Предиктивный риск срыва',
      short: 'Предупреждает о вероятности срыва заранее, чтобы успеть включить профилактику до критической точки.',
      details: 'Модель объединяет не один триггер, а накопительный эффект факторов: стресс, долг сна, метаболическая нестабильность и временные паттерны поведения. За счёт экспоненциального сглаживания (EMA) учитывается не только «сегодняшнее состояние», но и инерция последних дней — это приближает прогноз к реальной жизни. Высокий риск не означает, что срыв неизбежен, а сигнализирует, что нужно заранее упростить решения: регулярный приём пищи, белок/клетчатка, ограничение триггерных продуктов и разгрузка стресса. Цель метрики — перевести реактивное поведение в превентивное.',
      formula: 'Risk Score = Σ(факторы × веса):\n  • Накопленный стресс EMA (α=0.3): 25%\n  • Долг сна за 7 дней: 25%\n  • Инсулиновая волатильность: 20%\n  • Временные паттерны (выходные, вечер): 20%\n  • Сегодняшний недобор: 10%\n\nEMA = α × current + (1-α) × previous',
      source: 'Behavioral relapse prevention (Marlatt 1985), Sleep debt (Spiegel 1999)',
      sources: [{ pmid: '19179058', level: 'A', title: 'Marlatt & Donovan, 2005 — Relapse prevention evidence synthesis' }],
      evidenceLevel: 'A',
      confidenceScore: 0.92,
      interpretation: '>70% High — будь особенно внимательным. 40-70% Moderate — следи за триггерами. <40% Low — всё под контролем.',
      priority: 'CRITICAL',
      category: 'RISK',
      actionability: 'IMMEDIATE',
      impactScore: 0.92,
      whyImportant: '🚨 Предсказывает срыв ДО того как он случится. Красный = действуй!'
    },
    // Energy Forecast — Высокий
    ENERGY_FORECAST: {
      name: 'Прогноз энергии',
      short: 'Подсказывает, в какие часы ожидается пик или спад энергии, чтобы лучше планировать питание, задачи и тренировки.',
      details: 'Прогноз строится на циркадной кривой и корректируется вашим текущим контекстом: сон, стресс, питание и тренировки. Это позволяет планировать день «по ресурсу», а не против него: важные решения и нагрузку ставить на пики, а рутинные дела — на периоды спада. Метрика особенно полезна для профилактики вечерних ошибок в питании, когда когнитивный ресурс снижается. Главное — смотреть не на один час, а на профиль дня в целом.',
      formula: 'EnergyHour = BaseCircadian × TotalMod\n\nBaseCircadian (Van Cauter 1997):\n  00-05: 10-25%\n  06-11: 40-90%\n  12-17: 70-90%\n  18-23: 25-65%\n\nTotalMod = sleepMod × kcalMod × stressMod × trainingMod\n  Sleep: ≥7h=1.1, <5h=0.7\n  Kcal: ≥80%=1.1, <30%=0.75\n  Stress: ≤3=1.1, >7=0.8\n  Training: yes=1.15, no=1.0',
      source: 'Circadian rhythm research (Van Cauter 1997, Scheer 2009)',
      sources: [{ pmid: '9331550', level: 'B', title: 'Van Cauter et al., 1997 — Circadian variation in metabolism' }],
      evidenceLevel: 'B',
      confidenceScore: 0.86,
      interpretation: 'Peak — оптимальное время для важных дел и тренировок. Dip — запланируй отдых или рутину.',
      priority: 'HIGH',
      category: 'PREDICTION',
      actionability: 'TODAY',
      impactScore: 0.70,
      whyImportant: 'Планируй день по энергии. Важные дела — на пике!'
    },

    // === SCIENTIFIC ANALYTICS v3.0 — Научные метрики ===
    BAYESIAN_CONFIDENCE: {
      name: 'Байесовская уверенность + MAPE',
      short: 'Оценивает, насколько прогнозам можно доверять с учётом ошибок модели и объёма данных.',
      details: 'Метрика объединяет классическую ошибку прогноза (MAPE/MAE/RMSE) и байесовское обновление доверия по мере поступления новых наблюдений. Это защищает от «ложной уверенности», когда данных мало или они шумные. На практике высокий confidence означает, что прогнозы можно использовать для планирования, а низкий — что сначала лучше улучшить полноту и регулярность трекинга. Смысл блока — показывать не только «что прогнозируем», но и «насколько это надёжно».',
      formula: 'MAPE = (1/n) × Σ|actual - predicted| / actual × 100%\n\nBayesian update:\n  posterior ∝ prior × likelihood\n  prior = 0.5 (базовая уверенность)\n  likelihood = mapeLikelihood × nLikelihood × consistencyLikelihood\n\nCross-validation:\n  R² = 1 - SSres/SStot\n  RMSE = √(Σ(actual-pred)²/n)\n  MAE = Σ|actual-pred|/n',
      source: 'Gelman et al. "Bayesian Data Analysis" (2013); Hyndman & Koehler 2006',
      pmid: '13524500',
      interpretation: '>80% confidence — высокая точность предсказаний. <50% — нужно больше данных.',
      priority: 'LOW',
      category: 'STATISTICS',
      actionability: 'INFORMATIONAL',
      impactScore: 0.25,
      whyImportant: 'Насколько точны прогнозы. Высокая уверенность = можно доверять.'
    },
    // Time-Lagged — Средний, причинность
    TIME_LAGGED_CORRELATIONS: {
      name: 'Time-Lagged корреляции (причинность)',
      short: 'Анализ с задержкой (lags 0-3 дня) показывает, какие факторы РЕАЛЬНО влияют на другие (причинность).',
      details: 'В отличие от обычной корреляции («связь»), time-lagged анализ проверяет, есть ли причинный лаг (задержка во времени) между событиями. Пример: если недосып в понедельник коррелирует с перееданием в вторник (lag=1), это указывает на причинно-следственную связь. Алгоритм проверяет лаги 0-3 дня для каждой пары и считает причинность подтверждённой, если |r(lag>0)| > |r(lag=0)| + 0.1 (т.е. корреляция с лагом сильнее, чем одновременная). Практическая ценность: если сон РЕАЛЬНО влияет на калории на следующий день, то это knowledge-based точка воздействия. Основные пары: сон→калории, стресс→сладкое, калории→вес (lag 1-2 дня для веса). Сила метода в том, что он переводит «наблюдение» в «вмешательство»: даёт место для эксперимента.',
      formula: 'Granger-like causality:\n  Лаги 0-3 дня для каждой пары\n  r(lag) = corr(X[t-lag], Y[t])\n  \nПричинность подтверждена если:\n  |r(lag>0)| > |r(lag=0)| + 0.1\n\nПары: сон→калории, стресс→сладкое, калории→вес',
      source: 'Granger 1969 — Investigating Causal Relations',
      pmid: '7608935',
      interpretation: 'Подтверждённая причинность означает, что X действительно влияет на Y с задержкой.',
      priority: 'MEDIUM',
      category: 'PATTERNS',
      actionability: 'WEEKLY',
      impactScore: 0.50,
      whyImportant: 'Что РЕАЛЬНО влияет на что. Не просто связь, а причина!'
    },
    // GVI — Высокий, влияет на инсулин
    GLYCEMIC_VARIABILITY: {
      name: 'Гликемическая волатильность (GVI + CONGA)',
      short: 'Оценивает выраженность «скачков сахара» по пищевому профилю: ниже вариабельность — стабильнее энергия и аппетит.',
      details: 'Метрика использует показатели вариабельности (CV%, CONGA), чтобы оценить, насколько резко колеблется гликемическая нагрузка между приёмами пищи. Даже без постоянного мониторинга глюкозы это полезный прокси метаболической стабильности: чем выше волатильность, тем чаще наблюдаются энергетические «качели» и тяга к быстрым углеводам. Практический смысл — не убрать углеводы, а сделать кривую ровнее: добавить клетчатку, белок, контролировать долю простых сахаров и тайминг. Устойчивое снижение вариабельности обычно улучшает контроль голода и качество восстановления.',
      formula: 'GVI (CV%) = (SD / Mean) × 100\n  SD = стандартное отклонение GL приёмов\n  Mean = средняя GL приёмов\n\nCONGA = среднее |GL[i] - GL[i-1]|\n  (Continuous Overall Net Glycemic Action)\n\nПороги (Monnier 2006):\n  <25% — низкая (хорошо)\n  25-36% — умеренная\n  36-50% — повышенная\n  >50% — высокая (риск)',
      source: 'Monnier et al. 2006 — Glycemic variability and diabetes',
      sources: [{ pmid: '16936182', level: 'A', title: 'Monnier et al., 2006 — Glycemic variability meta-analysis' }],
      evidenceLevel: 'A',
      confidenceScore: 0.91,
      interpretation: 'Высокая волатильность = скачки сахара = инсулинорезистентность. Цель: CV% <36%.',
      priority: 'HIGH',
      category: 'METABOLISM',
      actionability: 'WEEKLY',
      impactScore: 0.80,
      whyImportant: 'Скачки сахара = инсулинорезистентность. Стабильность = здоровье.'
    },
    // Allostatic Load — Высокий, общий стресс
    ALLOSTATIC_LOAD: {
      name: 'Аллостатическая нагрузка',
      short: 'Показывает суммарный «износ» системы от хронического стресса, недосыпа и метаболического напряжения.',
      details: 'Аллостатическая нагрузка отражает накопительный эффект факторов, которые по отдельности могут выглядеть умеренно, но в сумме перегружают адаптационные механизмы. В отличие от разовых метрик, этот индекс помогает увидеть тренд хронического перенапряжения. Высокие значения связаны с ухудшением восстановления, настроения, контроля аппетита и устойчивости к стрессу. Практически это сигнал разгрузить систему: выровнять сон, снизить интенсивность на короткий период и упростить режим питания.',
      formula: 'AL Score = Σ(component × weight)\n\nКомпоненты (веса):\n  1. Кортизол proxy (стресс): 20%\n  2. Недосып (sleep debt): 20%\n  3. Метаболический стресс: 15%\n  4. Воспаление (harm proxy): 15%\n  5. Гиподинамия: 15%\n  6. Эмоц. нестабильность: 15%\n\nКаждый компонент 0-100, итог нормализован.',
      source: 'McEwen 1998 — Protective and Damaging Effects of Stress Mediators',
      sources: [{ pmid: '9428090', level: 'A', title: 'McEwen, 1998 — Allostatic load meta-analysis' }],
      evidenceLevel: 'A',
      confidenceScore: 0.90,
      interpretation: '<30 — низкая нагрузка. 30-50 — умеренная. 50-70 — повышенная. >70 — высокая (burnout риск).',
      priority: 'HIGH',
      category: 'RECOVERY',
      actionability: 'WEEKLY',
      impactScore: 0.75,
      whyImportant: 'Накопленный стресс организма. Высокая нагрузка = риск выгорания.'
    },
    // EWS — Критический, раннее предупреждение
    EARLY_WARNING_SIGNALS: {
      name: 'Ранние предупреждающие сигналы (EWS)',
      short: 'Ищет ранние признаки приближения срыва, чтобы вмешаться заранее, пока ситуация управляемая.',
      details: 'EWS отслеживает «предвестники нестабильности» системы: рост вариативности, автокорреляцию и смещение распределения поведения. Эти сигналы важны тем, что появляются до явного ухудшения результата (например, до эпизода переедания). Метрика не заменяет клиническую диагностику, но хорошо работает как ранний поведенческий радар. Высокий EWS — повод переключиться в режим профилактики: снизить нагрузку решений, усилить базовые ритуалы и убрать триггеры из среды.',
      formula: 'Теория критических переходов:\n  1. Rising variance: var(recent) / var(previous) > 1.5\n  2. Autocorrelation: lag-1 autocorr > 0.5 (система "застревает")\n  3. Skewness: >0.5 = перекос к перееданию\n  4. Trend: slope отклонений >0.05\n\nEWS Score = Σ(signal × weight)\n  variance: 35%, autocorr: 35%, skewness: 20%, trend: 10%',
      source: 'Scheffer et al. 2009 — Early Warning Signals for Critical Transitions (Nature)',
      sources: [{ pmid: '19727193', level: 'A', title: 'Scheffer et al., 2009 — Early-warning signals for critical transitions' }],
      evidenceLevel: 'A',
      confidenceScore: 0.93,
      interpretation: 'EWS >70 — система на грани срыва, действуй превентивно!',
      priority: 'CRITICAL',
      category: 'RISK',
      actionability: 'IMMEDIATE',
      impactScore: 0.88,
      whyImportant: '⚡ Раннее предупреждение! Система замечает проблемы ДО срыва.'
    },
    // 2-Process — Средний, бодрость
    TWO_PROCESS_MODEL: {
      name: '2-Process Model (Бодрость)',
      short: 'Математическая модель бодрости и энергии, учитывающая время бодрствования и циркадный ритм.',
      details: 'Two-Process Model (Borbély 1982) — классическая модель регуляции сна/бодрствования, которая разделяет два независимых процесса. Process S (гомеостатическое давление сна) — растёт экспоненциально с каждым часом бодрствования (тау равен 18.2ч), чем дольше не спите — тем сильнее хочется. Process C (циркадный ритм) — синусоида с пиком в 15-16ч и минимумом в 4ч, независимо от продолжительности бодрствования, 24-часовой внутренний часовой механизм. Alertness (бодрость) = C − S. Чем выше циркадный пик и ниже долг сна, тем выше бодрость. Практическое применение: модель показывает, почему после обеда (14-16ч) есть провал энергии, несмотря на пик C (т.к. S уже накопилось), и почему утром (6-9ч) может быть трудно, если недосып (низкое C + высокое S). Модель также учитывает ultradian циклы (90 минут внимания). Полезно для планирования дня: сложные задачи — на утро (9-12ч, когда C растёт), рутину — на 14-16ч (post-lunch dip), тренировки — на 16-19ч (пик C).',
      formula: 'Borbély 1982:\n  Alertness = Process C - Process S\n\nProcess S (гомеостатическое давление сна):\n  S(t) = S0 × e^(t/τ_w)\n  τ_w = 18.2ч, S0 = 0.2-0.4 (зависит от долга сна)\n\nProcess C (циркадный ритм):\n  C(t) = 0.5 + 0.5 × cos(2π × (t - 16) / 24)\n  Пик в 15-16ч, минимум в 4ч\n\nUltradian: 90-мин циклы внимания',
      source: 'Borbély 1982 — A two process model of sleep regulation',
      sources: [{ pmid: '6128309', level: 'A', title: 'Borbély, 1982 — Two-process model of sleep regulation' }],
      evidenceLevel: 'A',
      confidenceScore: 0.92,
      interpretation: 'Alertness показывает реальный уровень бодрости с учётом времени бодрствования и циркадности.',
      priority: 'MEDIUM',
      category: 'RECOVERY',
      actionability: 'TODAY',
      impactScore: 0.45,
      whyImportant: 'Понимание циклов бодрости помогает планировать день эффективнее.'
    },

    // === CONFIDENCE (уверенность) — Низкий ===
    CONFIDENCE: {
      name: 'Уверенность в анализе',
      short: 'Показывает, насколько выводы надёжны на текущем объёме и качестве данных.',
      details: 'Простой индикатор надёжности, который вычисляется как процент накопленных полных дней данных относительно целевого количества (targetDays), скорректированный на dataQuality (полноту и регулярность заполнения). dataQuality учитывает: (1) Полнота — есть ли вес, сон, еда, тренировки в каждом дне; (2) Регулярность — нет ли пропусков >2 дней подряд; (3) Отсутствие пробелов — данные должны быть непрерывными. Практический смысл: >80% — надёжно, можно принимать решения; 50-80% — тренды видны, но осторожно с экспериментами; <50% — нужно накопить больше данных. Отличие от Confidence Score: CONFIDENCE — упрощённая версия, Confidence Score — сложная взвешенная модель с 4 компонентами.',
      formula: 'confidence = (daysWithData / targetDays) × dataQuality\n\ndataQuality зависит от:\n  • Полнота данных (вес, сон, еда, тренировки)\n  • Регулярность заполнения\n  • Отсутствие пропусков',
      sources: [{ pmid: '24566440', level: 'C', title: 'Data quality in digital health (statistical methods)' }],
      evidenceLevel: 'C',
      confidenceScore: 0.73,
      interpretation: '>80% — надёжные выводы. 50-80% — тренды видны. <50% — нужно больше данных.',
      priority: 'LOW',
      category: 'STATISTICS',
      actionability: 'INFORMATIONAL',
      impactScore: 0.25,
      whyImportant: 'Чем больше данных — тем точнее анализ. Заполняй каждый день!'
    },

    // === RISK PANEL — Критический ===
    CRASH_RISK: {
      name: 'Риск срыва (Relapse Risk Score)',
      short: 'Предиктивная оценка вероятности срыва в ближайшие часы. Чем выше — тем важнее профилактика прямо сейчас.',
      details: 'Relapse Risk Score (RRS) — единая формула, интегрирующая 6 компонентов риска: стресс, недосып, ограничительное давление (голод/дефицит), воздействие reward-food, контекст времени суток и эмоциональную уязвимость. В отличие от отдельных EWS warnings, RRS даёт непрерывную оценку 0-100 с тремя временными окнами: next3h, tonight, next24h. Красная зона (60+) не означает гарантированный срыв, но указывает, что защитные механизмы ослаблены. Это инструмент early intervention, а не оценка «силы воли».',
      formula: 'RRS = Σ(component × weight) – protectiveBuffer\n\nКомпоненты:\n  • stressLoad (24%): стресс, тренд\n  • restrictionPressure (22%): дефицит ккал, белка, gaps\n  • sleepDebt (18%): дефицит сна, качество, стрик\n  • rewardExposure (16%): harm-score, simple carbs\n  • timingContext (10%): вечер, выходные\n  • emotionalVulnerability (10%): dayScore, mood, wellbeing\n\nProtective buffer: max −30 (low stress, good sleep, enough calories/protein, hydration, meal structure)',
      source: 'Spaeth et al., 2013; Nedeltcheva et al., 2010; Marlatt & Donovan, 2005',
      sources: [{ pmid: '23479616', level: 'A', title: 'Spaeth et al., 2013 — Sleep restriction and craving meta-analysis' }],
      evidenceLevel: 'A',
      confidenceScore: 0.95,
      interpretation: '<20 — low. 20-39 — guarded. 40-59 — elevated. 60-79 — high. 80-100 — critical.',
      priority: 'CRITICAL',
      category: 'RISK',
      actionability: 'IMMEDIATE',
      impactScore: 0.95,
      whyImportant: '🚨 Главный индикатор! Предсказывает вероятность срыва в ближайшие часы.'
    },
    // Risk Factors — Высокий
    RISK_FACTORS: {
      name: 'Факторы риска',
      short: 'Разбирает риск на конкретные причины и показывает, какие из них дают максимальный вклад прямо сейчас.',
      details: 'Этот блок декомпозирует общий риск на отдельные факторы с весами, чтобы было понятно, что именно нужно менять первым. Главная польза — приоритизация: факторы с высоким весом дают непропорционально большой эффект при коррекции. Важно смотреть на повторяемость причин 3-7 дней подряд, а не только на одно измерение. Метрика превращает абстрактный «красный риск» в конкретный план действий.',
      formula: 'Каждый фактор имеет вес:\n  • Критические (+15-25): недосып, сильный стресс, большой долг\n  • Важные (+8-14): паттерны срывов, низкий белок\n  • Умеренные (+3-7): вечернее время, мало клетчатки\n\nПоказываем топ-5 факторов с наибольшим весом.',
      source: 'Machine Learning на исторических данных пользователя',
      interpretation: 'Фокусируйтесь на факторах с весом >10 — они критичны.',
      priority: 'HIGH',
      category: 'RISK',
      actionability: 'TODAY',
      impactScore: 0.80,
      whyImportant: 'Конкретные причины риска. Знаешь враг — побеждаешь!'
    },
    // Prevention Strategy — Высокий
    PREVENTION_STRATEGY: {
      name: 'Профилактика срыва',
      short: 'Даёт короткий набор наиболее эффективных шагов, которые снижают риск срыва в текущем контексте.',
      details: 'Стратегии формируются персонально: учитываются главные триггеры, успешные кейсы из вашей истории и текущее время суток. Это не список «идеальных привычек», а минимально достаточные действия с высоким шансом сработать именно сейчас. Ценность в простоте: 1-3 шага легче выполнить, чем длинный план. Метрика помогает перейти от тревоги к управляемому действию.',
      formula: 'Стратегии генерируются на основе:\n  1. Главного триггера (причины риска)\n  2. Истории успешных дней\n  3. Персональных паттернов\n  4. Времени суток и контекста\n\nКаждая стратегия содержит конкретное действие и причину.',
      source: 'Behavior Change Theory (Prochaska, 1992)',
      interpretation: 'Выполните хотя бы 1 из 3 рекомендаций для снижения риска.',
      priority: 'HIGH',
      category: 'RISK',
      actionability: 'IMMEDIATE',
      impactScore: 0.85,
      whyImportant: 'Конкретные действия для снижения риска. Следуй — победишь!'
    },

    // Next Meal — Высокий, ближайшее действие
    NEXT_MEAL: {
      name: 'Следующий приём пищи',
      short: 'Подсказывает, когда и каким сделать ближайший приём пищи с учётом текущего метаболического контекста.',
      details: 'Рекомендация учитывает статус инсулиновой волны, время до липолиза, текущий баланс дня и ваши поведенческие паттерны. Это снижает вероятность импульсивного выбора в моменты усталости и голода. Метрика не «запрещает» продукты, а помогает выбрать оптимальный момент и состав приёма пищи. В результате легче удерживать стабильную энергию и контроль аппетита.',
      formula: 'Рекомендация основана на:\n  • Текущем состоянии инсулиновой волны\n  • Времени до липолиза\n  • Калорийном балансе дня\n  • Истории паттернов еды\n\nПоказывает когда и что лучше съесть.',
      source: 'Brand-Miller & Foster-Powell, 2003',
      sources: [{ pmid: '12828192', level: 'B', title: 'Brand-Miller et al., 2003 — Glycemic index and meal composition guidance' }],
      evidenceLevel: 'B',
      confidenceScore: 0.84,
      interpretation: 'Следуй рекомендации для оптимального усвоения.',
      priority: 'HIGH',
      category: 'TIMING',
      actionability: 'IMMEDIATE',
      impactScore: 0.75,
      whyImportant: 'Что съесть СЕЙЧАС. Практическая рекомендация на ближайшие часы.'
    },

    // === FORECAST PANEL — Средний приоритет ===
    ENERGY_WINDOWS: {
      name: 'Окна энергии',
      short: 'Показывает благоприятные периоды дня для задач, приёмов пищи и активности по прогнозу энергии.',
      details: 'Окна формируются на пересечении циркадного ритма, статуса волны, недавнего питания и активности. Это практический инструмент тайминга: сложные задачи и тренировки — в пики, рутину — в спады. Даже небольшое попадание в «свои» окна обычно повышает качество выполнения и снижает вечерние ошибки. Метрика особенно полезна в дни с высокой когнитивной нагрузкой.',
      formula: 'Определяются на основе:\n  • Циркадного ритма (пик 10:00-12:00, 16:00-18:00)\n  • Состояния инсулиновой волны\n  • Времени последнего приёма пищи\n  • Уровня активности\n\n⭐ Оптимальное — когда все факторы совпадают.',
      source: 'Van Cauter et al., 1997; Scheer et al., 2009',
      sources: [{ pmid: '19164701', level: 'B', title: 'Scheer et al., 2009 — Circadian meal timing metabolic effects' }],
      evidenceLevel: 'B',
      confidenceScore: 0.87,
      interpretation: 'Приём пищи в "оптимальные" окна улучшает усвоение на 15-25%.',
      priority: 'MEDIUM',
      category: 'TIMING',
      actionability: 'TODAY',
      impactScore: 0.60,
      whyImportant: 'Когда лучше есть. Оптимизация тайминга даёт до +25% усвоения.'
    },
    // Training Window — Средний
    TRAINING_WINDOW: {
      name: 'Окно для тренировки',
      short: 'Помогает выбрать время, в которое тренировка даст максимальную отдачу при текущем состоянии организма.',
      details: 'Метрика сопоставляет уровень доступной энергии, фазу инсулиновой волны и время последнего приёма пищи. Это позволяет выбирать более «выигрышный» слот: когда выше мощность, лучше переносимость и ниже риск срыва после нагрузки. При нерегулярном графике особенно полезно знать не «идеальное время по учебнику», а лучшее окно внутри текущего дня. Цель — повысить качество тренировки, а не усложнить расписание.',
      formula: 'Факторы выбора времени:\n  • Состояние гликогена (натощак или после еды)\n  • Инсулиновая волна (идеально в липолизе)\n  • Циркадный ритм силы (пик 16:00-19:00)\n  • Последний приём пищи (2-3ч назад)',
      source: 'Chtourou & Souissi, 2012',
      sources: [{ pmid: '22531613', level: 'B', title: 'Chtourou & Souissi, 2012 — Circadian timing and performance' }],
      evidenceLevel: 'B',
      confidenceScore: 0.85,
      interpretation: 'Силовые — вечером (16-19ч), кардио — утром натощак.',
      priority: 'MEDIUM',
      category: 'TIMING',
      actionability: 'TODAY',
      impactScore: 0.55,
      whyImportant: 'Когда тренировка будет эффективнее. Время влияет на результат!'
    },
    // Insulin Wave Status — Средний
    INSULIN_WAVE_STATUS: {
      name: 'Статус инсулиновой волны',
      short: 'Показывает текущую фазу метаболизма: идёт волна усвоения или уже активен липолиз.',
      details: 'Статус волны помогает понять, в какой «энергетической фазе» вы находитесь прямо сейчас: накопление, переход или жиросжигание. Это полезно для решений о перекусе, тренировке и темпе задач в течение дня. Метрика опирается на многокомпонентную модель (GI/GL, состав пищи, время суток, активность), поэтому даёт более реалистичную картину, чем простой счёт часов после еды. Практический эффект — меньше хаотичных решений и лучшее управление режимом.',
      formula: 'Состояния:\n  🔥 Липолиз — инсулин низкий, идёт жиросжигание\n  ⏳ Волна — инсулин повышен, накопление энергии\n  ⚡ Почти — волна скоро закончится\n\nДлина волны зависит от 33+ факторов (GI, GL, белок, жиры, время суток и др.)',
      source: 'Wolever & Jenkins, 1994; Brand-Miller, 2003',
      sources: [{ pmid: '8198048', level: 'B', title: 'Wolever & Jenkins, 1994 — Glycemic response and insulin wave dynamics' }],
      evidenceLevel: 'B',
      confidenceScore: 0.85,
      interpretation: 'Для жиросжигания старайтесь увеличить время в "липолизе".',
      priority: 'MEDIUM',
      category: 'METABOLISM',
      actionability: 'TODAY',
      impactScore: 0.65,
      whyImportant: 'Текущее состояние жиросжигания. Показывает идёт ли липолиз.'
    },
    // What-If Scenarios — Средний
    WHATIF_SCENARIOS: {
      name: 'Сценарии "Что если"',
      short: 'Сравнивает базовый и улучшенный сценарий, чтобы показать реальный потенциал изменений до конца дня.',
      details: 'Сценарии визуализируют разницу между «оставить как есть» и «выполнить 1-2 рекомендации». Это снижает неопределённость и усиливает мотивацию через понятный ожидаемый эффект. Важно воспринимать их как вероятностный ориентир, а не жёсткое предсказание: задача сценариев — помочь выбрать лучший следующий шаг. Метрика особенно полезна, когда нужно быстро решить, стоит ли менять план прямо сейчас.',
      formula: 'Моделирование:\n  📊 Вероятный — текущий тренд без изменений\n  🌟 Оптимистичный — при выполнении рекомендаций\n\nКаждый сценарий рассчитывается на основе:\n  • Текущих показателей дня\n  • Исторических паттернов\n  • Времени до конца дня',
      source: 'Прогнозная аналитика временных рядов; Scenario-based decision support systems',
      interpretation: 'Сравни сценарии — разница показывает потенциал улучшения.',
      priority: 'MEDIUM',
      category: 'PREDICTION',
      actionability: 'TODAY',
      impactScore: 0.50,
      whyImportant: 'Что будет если... Мотивация через визуализацию потенциала.'
    },

    // === PHENOTYPE PANEL — Долгосрочный ===
    PHENOTYPE_PANEL: {
      name: 'Панель фенотипа',
      short: 'Сводно показывает ваш метаболический тип и помогает персонализировать питание/нагрузку.',
      details: 'Панель фенотипа агрегирует долгосрочные паттерны (ритм, реакцию на углеводы, восстановление, стабильность), чтобы дать практическое направление персонализации. Это не «ярлык», а рабочая модель, которая уточняется по мере накопления данных. Полезно смотреть в динамике 3–6 недель и проверять рекомендации на практике.',
      formula: 'Определение на основе 30+ дней данных:\n  • Анализ паттернов энергии (утро/вечер)\n  • Скорость инсулинового ответа\n  • Восстановление после нагрузок\n  • Стабильность веса и настроения\n\nТипы: 🏃Спринтер, 🏃‍♂️Марафонец, 🏋️Силовик, ⚖️Сбалансированный, 🦉Сова, 🐦Жаворонок',
      source: 'Хронобиология (Roenneberg, 2012); Метаболическая типология',
      sources: [{ pmid: '22738673', level: 'B', title: 'Roenneberg et al., 2012 — Chronotype and metabolic traits' }],
      evidenceLevel: 'B',
      confidenceScore: 0.83,
      interpretation: 'Фенотип помогает подобрать оптимальные тайминги еды и тренировок.',
      priority: 'MEDIUM',
      category: 'PATTERNS',
      actionability: 'LONG_TERM',
      impactScore: 0.55,
      whyImportant: 'Твой метаболический тип. Понимание себя = персональная стратегия.'
    },
    // Phenotype Confidence — Низкий
    PHENOTYPE_CONFIDENCE: {
      name: 'Уверенность в фенотипе',
      short: 'Показывает, насколько надёжно определён ваш фенотип на текущем объёме данных.',
      details: 'Уверенность растёт не только от количества дней, но и от регулярности/полноты трекинга. Низкое значение не «ошибка», а сигнал, что выводы пока предварительные. Практически это маркер качества персонализации: чем выше confidence, тем точнее рекомендации.',
      formula: 'confidence = √(daysWithData/30) × dataConsistency\n\nРастёт при:\n  • Больше данных (30+ дней = 100%)\n  • Стабильность паттернов (меньше шума)\n  • Полнота записей (еда + сон + активность)',
      source: 'Data quality scoring in personalized health analytics',
      interpretation: '>70% — фенотип определён надёжно. <50% — нужно больше данных.',
      priority: 'LOW',
      category: 'STATISTICS',
      actionability: 'INFORMATIONAL',
      impactScore: 0.25,
      whyImportant: 'Насколько точно определён твой тип.'
    },
    // Phenotype Radar — Средний
    PHENOTYPE_RADAR: {
      name: 'Профиль метаболизма (Radar)',
      short: 'Радар сильных и слабых сторон: стабильность, восстановление, чувствительность к углеводам и хронотип.',
      details: 'Радар помогает быстро увидеть перекосы профиля и выбрать один приоритетный фокус на ближайшую неделю. Большая площадь полезна, но важнее баланс осей: слабое звено часто ограничивает общий прогресс. Смотрите на тренд, а не только на один срез.',
      formula: 'Оси радара:\n  • Стабильность — постоянство калорий день ото дня\n  • Восстановление — качество сна и стресс\n  • Инсулин. чувств. — реакция на углеводы\n  • Постоянство — streak, регулярность\n  • Хронотип — утренний или вечерний тип\n\nКаждая ось: 0-100',
      source: 'Композитный анализ на основе данных пользователя',
      interpretation: 'Чем больше площадь — тем лучше общий профиль.',
      priority: 'MEDIUM',
      category: 'PATTERNS',
      actionability: 'LONG_TERM',
      impactScore: 0.45,
      whyImportant: 'Визуализация сильных и слабых сторон метаболизма.'
    },
    // Personal Thresholds — Высокий
    PERSONAL_THRESHOLDS: {
      name: 'Персональные пороги',
      short: 'Индивидуальные ориентиры по калориям, волнам и интервалам между приёмами пищи.',
      details: 'Пороги рассчитываются из ваших успешных дней и обновляются по мере накопления истории. Они точнее «средних норм», потому что учитывают ваш отклик на питание и режим. Это ключ к практичной персонализации без лишней сложности.',
      formula: 'Рассчитываются индивидуально:\n  • Оптимальные ккал — на основе истории успешных дней\n  • Инсулиновая волна — средняя по вашим данным\n  • Перерыв между едой — ваш оптимум\n  • Порог риска — когда вы обычно срываетесь',
      source: 'Персонализация на основе машинного обучения',
      interpretation: 'Эти пороги адаптированы под ВАС, а не средние значения.',
      priority: 'HIGH',
      category: 'PATTERNS',
      actionability: 'LONG_TERM',
      impactScore: 0.70,
      whyImportant: 'Персональные значения вместо средних. Твои уникальные пороги!'
    },

    // === TRAITS — характеристики метаболизма ===
    TRAIT_STABILITY: {
      name: 'Стабильность',
      short: 'Насколько ровно вы держите режим питания день за днём.',
      details: 'Высокая стабильность обычно делает результаты более предсказуемыми и снижает риск импульсивных решений. Метрика не требует идеальности: важна умеренная вариативность без резких «качелей».',
      formula: 'stability = 100 - (σ_calories / avg_calories × 100)\n\nГде σ — стандартное отклонение калорий за 7 дней.\nВысокая стабильность = мало колебаний день ото дня.',
      source: 'Статистический анализ вариабельности',
      interpretation: '>80 — очень стабильный режим. <50 — большие колебания.',
      priority: 'MEDIUM',
      category: 'PATTERNS',
      actionability: 'WEEKLY',
      impactScore: 0.50,
      whyImportant: 'Постоянство = предсказуемость результата.'
    },
    // Trait Recovery — Высокий
    TRAIT_RECOVERY: {
      name: 'Восстановление',
      short: 'Оценивает, насколько хорошо организм восстанавливается между нагрузками.',
      details: 'Восстановление связывает сон, стресс и структуру тренировочных дней. При низком значении даже «правильный» план может давать слабый отклик, поэтому сначала стоит укрепить базу восстановления.',
      formula: 'recovery = (sleepScore × 0.5) + (stressScore × 0.3) + (restDays × 0.2)\n\nГде:\n  sleepScore = (часы/норма) × качество\n  stressScore = 100 - (стресс × 10)\n  restDays = дни без тренировок / неделю',
      source: 'Meeusen et al., 2013 — восстановление спортсменов',
      sources: [{ pmid: '23252566', level: 'A', title: 'Meeusen et al., 2013 — Overtraining and recovery meta-analysis' }],
      evidenceLevel: 'A',
      confidenceScore: 0.90,
      interpretation: '>75 — отличное восстановление. <50 — риск перетренированности.',
      priority: 'HIGH',
      category: 'RECOVERY',
      actionability: 'WEEKLY',
      impactScore: 0.70,
      whyImportant: 'Способность организма восстанавливаться. Влияет на прогресс!'
    },
    // Trait Insulin Sensitivity — Высокий
    TRAIT_INSULIN_SENSITIVITY: {
      name: 'Инсулиновая чувствительность (Trait)',
      short: 'Долгосрочный прокси метаболической гибкости в ответ на углеводы.',
      details: 'Метрика использует пищевой профиль и активность как прикладной индикатор устойчивости к углеводной нагрузке. Это не диагноз, а ориентир для корректировки структуры рациона и ритма активности.',
      formula: 'Косвенные маркеры:\n  • Средний GI рациона (ниже = лучше)\n  • Клетчатка г/1000ккал (больше = лучше)\n  • Распределение углеводов (утро vs вечер)\n  • Регулярность тренировок',
      source: 'DeFronzo, 2004; Weickert & Pfeiffer, 2008',
      sources: [{ pmid: '15161807', level: 'A', title: 'DeFronzo, 2004 — Insulin sensitivity measures meta-analysis' }],
      evidenceLevel: 'A',
      confidenceScore: 0.91,
      interpretation: '>80 — отличная чувствительность. <50 — риск резистентности.',
      priority: 'HIGH',
      category: 'METABOLISM',
      actionability: 'LONG_TERM',
      impactScore: 0.75,
      whyImportant: 'Главный маркер метаболического здоровья. Влияет на всё!'
    },
    // Trait Consistency — Средний
    TRAIT_CONSISTENCY: {
      name: 'Постоянство',
      short: 'Показывает, насколько регулярно вы держитесь плана по дням.',
      details: 'Постоянство важнее «идеального дня»: именно оно определяет долгосрочный тренд. Рост метрики обычно снижает вероятность отката и делает изменения устойчивыми.',
      formula: 'consistency = (daysInStreak / totalDays) × (avgCompleteness)\n\nГде:\n  daysInStreak — дни подряд в норме\n  avgCompleteness — полнота заполнения данных',
      source: 'Behavioral adherence metrics in digital health',
      interpretation: '>80 — высокое постоянство. <50 — нужна регулярность.',
      priority: 'MEDIUM',
      category: 'PATTERNS',
      actionability: 'WEEKLY',
      impactScore: 0.55,
      whyImportant: 'Дисциплина = результат. Постоянство важнее идеальности.'
    },
    TRAIT_CHRONOTYPE: {
      name: 'Хронотип',
      short: 'Определяет ваш ритм «сова/жаворонок», чтобы точнее настроить тайминг дня.',
      details: 'Согласование режима с хронотипом повышает переносимость плана и снижает трение в повседневных решениях. Вместо борьбы с биоритмом лучше адаптировать ключевые действия под «свои» часы.',
      formula: 'Определяется по:\n  • Времени первого приёма пищи\n  • Времени засыпания/пробуждения\n  • Распределению калорий (утро/вечер)\n  • Времени тренировок\n\n<40 = 🐦Жаворонок, >60 = 🦉Сова, 40-60 = нейтральный',
      source: 'Roenneberg et al., 2003 — Munich Chronotype Questionnaire',
      sources: [{ pmid: '14715839', level: 'B', title: 'Roenneberg et al., 2003 — Chronotype assessment and validation' }],
      evidenceLevel: 'B',
      confidenceScore: 0.85,
      interpretation: 'Подстраивай тайминги под свой хронотип для лучших результатов.',
      priority: 'MEDIUM',
      category: 'PATTERNS',
      actionability: 'LONG_TERM',
      impactScore: 0.50,
      whyImportant: 'Понимание своего типа (сова/жаворонок) для оптимизации режима.'
    },

    // === PHENOTYPE SECTIONS — Средний приоритет ===
    PHENOTYPE_STRENGTHS: {
      name: 'Сильные стороны',
      short: 'Показывает ваши устойчивые преимущества, на которых лучше строить стратегию.',
      details: 'Сильные стороны — это повторяемые паттерны, которые дают лучший отклик при минимальном усилии. Опора на них повышает устойчивость плана и снижает риск выгорания.',
      formula: 'Определяются автоматически на основе:\n  • Трейтов с показателем >75%\n  • Стабильных паттернов в данных\n  • Сравнения с "идеальным" профилем\n\nПоказывают что у вас хорошо получается.',
      source: 'Strength-based behavior change approach',
      interpretation: 'Опирайтесь на сильные стороны при планировании питания.',
      priority: 'MEDIUM',
      category: 'PATTERNS',
      actionability: 'LONG_TERM',
      impactScore: 0.45,
      whyImportant: 'Знание сильных сторон помогает строить стратегию на них.'
    },
    // Phenotype Weaknesses — Высокий
    PHENOTYPE_WEAKNESSES: {
      name: 'Зоны роста',
      short: 'Ключевые ограничения профиля, которые сильнее всего тормозят прогресс.',
      details: 'Это не «слабости», а приоритетные точки роста. Лучше последовательно улучшать 1–2 зоны, чем пытаться исправить всё сразу — так выше вероятность закрепления результата.',
      formula: 'Определяются на основе:\n  • Трейтов с показателем <50%\n  • Повторяющихся проблем в истории\n  • Отклонений от оптимума\n\nПоказывают где нужна работа.',
      source: 'Behavioral gap analysis in coaching practice',
      interpretation: 'Фокусируйтесь на 1-2 зонах роста за раз — не на всех сразу.',
      priority: 'HIGH',
      category: 'PATTERNS',
      actionability: 'WEEKLY',
      impactScore: 0.70,
      whyImportant: 'Зоны роста = точки приложения усилий для максимального эффекта.'
    },
    // Phenotype Recommendations — Высокий
    PHENOTYPE_RECOMMENDATIONS: {
      name: 'Рекомендации',
      short: 'Персональные шаги с максимальным ожидаемым эффектом в текущем контексте.',
      details: 'Рекомендации приоритизируются по вашему фенотипу и истории отклика. Формат «до трёх действий» оставляет фокус и повышает вероятность реального выполнения.',
      formula: 'Генерируются персонально:\n  1. Анализ вашего фенотипа\n  2. Учёт сильных сторон и зон роста\n  3. Адаптация под время суток\n  4. Учёт исторических данных\n\nМаксимум 3 рекомендации — фокус на главном.',
      source: 'Behavior Change Theory + Персонализация',
      interpretation: 'Начните с первой рекомендации — она самая важная.',
      priority: 'HIGH',
      category: 'PATTERNS',
      actionability: 'TODAY',
      impactScore: 0.80,
      whyImportant: 'Конкретные персональные действия. Начни с первой!'
    },

    // === NEW v4.0 PATTERNS (B1-B6) ===
    // B1: Sleep Quality → Next Day Metrics
    SLEEP_QUALITY: {
      name: 'Качество сна и метрики дня',
      short: 'Показывает, как качество сна влияет на голод, калории и самочувствие на следующий день.',
      details: 'Анализ с лагом 1 день помогает отделить причину от совпадения: плохой сон часто проявляется в питании и энергии именно завтра, а не «прямо сейчас». Это полезно для профилактики срывов через сон, а не через жёсткие ограничения.',
      formula: 'Time-lagged Pearson correlation:\n  sleepQuality[day] → (weight, hunger, steps, kcal)[day+1]\n  Min n=14 для надёжности\n  Confidence = baseConf × (1 + |r|) если |r| > 0.35',
      source: 'Walker, 2017 — Why We Sleep; Nedeltcheva et al., 2010',
      sources: [{ pmid: '20921542', level: 'A', title: 'Nedeltcheva et al., 2010 — Sleep curtailment metabolic effects' }],
      evidenceLevel: 'A',
      confidenceScore: 0.93,
      interpretation: '|r| > 0.5 — сильное влияние сна на следующий день. r < -0.4 — плохой сон → вес↑/голод↑',
      priority: 'HIGH',
      category: 'RECOVERY',
      actionability: 'TODAY',
      impactScore: 0.75,
      whyImportant: 'Качество сна (не только длительность) определяет продуктивность и голод на следующий день.'
    },
    // B2: Wellbeing Correlation
    WELLBEING_CORRELATION: {
      name: 'Самочувствие и образ жизни',
      short: 'Определяет, какие привычки сильнее всего связаны с вашим самочувствием.',
      details: 'Корреляция самочувствия с режимом помогает найти «ваши» рычаги энергии и настроения. Часто это даёт более практичные выводы, чем универсальные рекомендации.',
      formula: 'Pearson correlation:\n  wellbeingAvg[day] → (sleepQuality, steps, protein, kcal)[day]\n  Min n=14, confidence logic',
      source: 'Seligman, 2018 — PERMA model; Lyubomirsky et al., 2005',
      sources: [{ pmid: '16045394', level: 'B', title: 'Lyubomirsky et al., 2005 — Wellbeing and life satisfaction RCT' }],
      evidenceLevel: 'B',
      confidenceScore: 0.84,
      interpretation: 'r > 0.4 — найден ключевой фактор хорошего самочувствия (сон/движение/питание)',
      priority: 'MEDIUM',
      category: 'RECOVERY',
      actionability: 'WEEKLY',
      impactScore: 0.60,
      whyImportant: 'Определяет что именно влияет на ваше самочувствие — персонально для вас.'
    },
    // B3: Hydration
    HYDRATION: {
      name: 'Гидратация',
      short: 'Показывает, насколько вы закрываете персональную дневную потребность в воде.',
      details: 'Даже умеренный дефицит воды может снижать концентрацию и переносимость нагрузки. Метрика помогает отслеживать не разовые «пики», а устойчивую привычку гидратации.',
      formula: 'Goal = weight × 30 ml/kg (ВОЗ рекомендация)\n  Достижение: waterMl / goal × 100%\n  Тренд: EMA(waterMl, span=7)',
      source: 'EFSA, 2010 — Water intake recommendations',
      interpretation: '>90% — отлично. 70-90% — норма. <70% — недостаточно',
      priority: 'MEDIUM',
      category: 'NUTRITION',
      actionability: 'TODAY',
      impactScore: 0.50,
      whyImportant: 'Дегидратация 1-2% → снижение физической и когнитивной производительности.'
    },
    // B4: Body Composition
    HYDRATION_TREND: {
      name: 'Тренд гидратации',
      short: 'Показывает направление изменений привычки пить воду за неделю.',
      details: 'Сглаженный тренд отсекает дневной шум и показывает, закрепляется ли привычка. Это удобнее для контроля, чем оценивать каждый день отдельно.',
      formula: 'EMA(waterMl, span=7) / goal × 100\n  Slope > 0 — улучшение, < 0 — ухудшение',
      source: 'Exponential Moving Average для сглаживания флуктуаций',
      interpretation: 'Тренд показывает направление изменений в привычках гидратации',
      priority: 'LOW',
      category: 'NUTRITION',
      actionability: 'WEEKLY',
      impactScore: 0.35,
      whyImportant: 'Отслеживание динамики гидратации для формирования стабильной привычки.'
    },
    // B4: Body Composition
    BODY_COMPOSITION: {
      name: 'Композиция тела (WHR)',
      short: 'Отслеживает изменения талии/бёдер как более точный сигнал кардиометаболического риска, чем вес.',
      details: 'WHR полезен, когда вес «стоит», но композиция меняется: можно видеть улучшение по снижению абдоминального жира. Метрика особенно важна при рекомпозиции, где масса тела не всегда отражает прогресс.',
      formula: 'WHR = waist_cm / hip_cm\n  Норма: <0.85 (жен), <0.9 (муж)\n  Тренд: linear regression за 30+ дней, min n=10',
      source: 'WHO, 2008 — Waist-Hip Ratio guidelines',
      interpretation: 'WHR снижается — висцеральный жир уходит. Рост — риск метаболических нарушений.',
      priority: 'HIGH',
      category: 'METABOLISM',
      actionability: 'LONG_TERM',
      impactScore: 0.80,
      whyImportant: 'WHR — лучший предиктор кардиометаболического риска, точнее чем просто вес.'
    },
    // B5: Cycle Impact
    CYCLE_IMPACT: {
      name: 'Влияние цикла (фазы)',
      short: 'Показывает, как фазы цикла меняют голод, энергию и метаболизм.',
      details: 'Фазовый анализ позволяет заранее адаптировать план, а не воспринимать колебания как «срыв дисциплины». Это снижает фрустрацию и помогает держать устойчивую стратегию на дистанции.',
      formula: 'Dynamic phase detection:\n  Фолликулярная: дни 1 до овуляции (kcal avg, steps avg)\n  Лютеиновая: после овуляции до конца\n  Сравнение метрик (kcal, weight, mood) между фазами',
      source: 'Davidsen et al., 2007 — Menstrual cycle and metabolism',
      sources: [{ pmid: '17466403', level: 'A', title: 'Davidsen et al., 2007 — Menstrual cycle metabolic impact meta-analysis' }],
      evidenceLevel: 'A',
      confidenceScore: 0.89,
      interpretation: 'Лютеиновая фаза: +150-300 ккал норма (прогестерон↑ BMR). Mood↓ — ПМС.',
      priority: 'HIGH',
      category: 'PATTERNS',
      actionability: 'WEEKLY',
      impactScore: 0.70,
      whyImportant: 'Цикл влияет на голод, метаболизм, настроение. Научись работать с ним, а не против.'
    },
    // B6: Weekend Effect
    WEEKEND_EFFECT: {
      name: 'Выходные vs будни',
      short: 'Сравнивает ритм выходных и будней, чтобы выявить «саботаж выходного дня».',
      details: 'Небольшой рост калорий в выходные нормален, но системный перекос может съедать недельный дефицит. Метрика помогает мягко скорректировать именно выходные паттерны без ужесточения всего плана.',
      formula: 'Weekend = пт/сб/вс, Weekdays = пн/вт/ср/чт\n  Сравнение: avg_kcal, avg_sleep, avg_steps\n  Разница: (weekend - weekdays) / weekdays × 100%',
      source: 'Racette et al., 2008 — Weekend weight gain patterns',
      sources: [{ pmid: '17389702', level: 'B', title: 'Racette et al., 2008 — Weekend eating patterns and weight' }],
      evidenceLevel: 'B',
      confidenceScore: 0.83,
      interpretation: '+10-20% калорий в выходные — норма. >30% — риск саботажа прогресса.',
      priority: 'MEDIUM',
      category: 'PATTERNS',
      actionability: 'WEEKLY',
      impactScore: 0.55,
      whyImportant: 'Выходные могут съесть весь недельный дефицит. Осознанность = контроль.'
    },
    // C2: Nutrition Quality
    NUTRITION_QUALITY: {
      name: 'Качество питания (Nutrition Quality)',
      short: 'Сводный индекс пищевой плотности и структуры рациона, а не только калорий.',
      details: 'Метрика сочетает белок, клетчатку, качество жиров, долю простых сахаров и разнообразие. Это помогает улучшать «фундамент» питания, который влияет на сытость, энергию и устойчивость к тяге.',
      formula: 'Составной score из: белок%, клетчатка/1000ккал, доля простых, качество жиров, разнообразие категорий/продуктов',
      source: 'Сводный индекс качества питания (DQI-подобный подход)',
      interpretation: '>80 — отличное качество. 60-80 — хорошо. <60 — есть пробелы',
      priority: 'MEDIUM',
      category: 'NUTRITION',
      actionability: 'TODAY',
      impactScore: 0.60,
      whyImportant: 'Качество еды влияет на энергию, сытость и стабильность веса.'
    },
    // C4: NEAT Activity
    NEAT_ACTIVITY: {
      name: 'NEAT — бытовая активность',
      short: 'Оценивает расход из повседневного движения вне тренировок.',
      details: 'NEAT часто недооценивают, хотя именно он создаёт заметный вклад в расход при сидячей работе. Малые изменения (больше ходьбы, бытовая активность) могут существенно улучшить баланс энергии.',
      formula: 'Avg household minutes + trend (linear). Порог: <20 низко, 20-40 умеренно, 40-60 хорошо, 60+ отлично',
      source: 'Hamilton et al., 2007 — NEAT improves metabolic health',
      interpretation: 'NEAT может добавлять 150-350 ккал расхода в день.',
      priority: 'MEDIUM',
      category: 'METABOLISM',
      actionability: 'TODAY',
      impactScore: 0.55,
      whyImportant: 'Бытовая активность — скрытый рычаг метаболизма и дефицита.'
    },
    // C6: Mood Trajectory
    MOOD_TRAJECTORY: {
      name: 'Траектория настроения по приёмам',
      short: 'Показывает, как состав еды связан с последующим состоянием и эмоциональной устойчивостью.',
      details: 'Связь настроения с макросоставом помогает увидеть пищевые триггеры эмоциональных спадов. Это полезно для профилактики вечерних срывов и выбора более устойчивых комбинаций продуктов.',
      formula: 'corr(mood, simple%) и corr(mood, protein%) по каждому приёму пищи',
      source: 'Поведенческий анализ питания и настроения',
      interpretation: 'Негативная связь с простыми углеводами → риск эмоциональных спадов.',
      priority: 'HIGH',
      category: 'RECOVERY',
      actionability: 'TODAY',
      impactScore: 0.65,
      whyImportant: 'Настроение напрямую влияет на контроль питания и риск срыва.'
    },
    // C7: Micronutrient Radar
    MICRONUTRIENT_RADAR: {
      name: 'Микронутриентный радар',
      short: 'Показывает, каких микроэлементов может не хватать по среднему рациону за неделю.',
      details: 'Радар оценивает устойчивый недельный фон по ключевым микроэлементам (Fe, Mg, Zn, Ca), а не случайный один день. Порог <80% от RDA/AI используется как ранний сигнал возможного дефицита: это ещё не клинический диагноз, но повод усилить продукты‑источники и пересмотреть структуру рациона. Практически полезно смотреть динамику 2–4 недели подряд: если показатель стабильно низкий, вероятность функционального дефицита выше.',
      formula: '7-дневное среднее по Fe/Mg/Zn/Ca.\nДефицит = <80% от рекомендованной нормы (RDA/AI).',
      sources: [
        {
          label: 'WHO/FAO — Vitamin and Mineral Requirements in Human Nutrition',
          url: 'https://apps.who.int/iris/handle/10665/42716'
        },
        {
          label: 'NIH ODS — Dietary Supplement Fact Sheets (RDA/AI)',
          url: 'https://ods.od.nih.gov/factsheets/'
        }
      ],
      interpretation: 'Если показатель <80% — вероятный дефицит. Усиль продукты‑источники.',
      priority: 'HIGH',
      category: 'NUTRITION',
      actionability: 'WEEKLY',
      impactScore: 0.70,
      whyImportant: 'Скрытые дефициты влияют на энергию, сон и аппетит даже без явных симптомов.'
    },
    // C8: Omega Balancer
    OMEGA_BALANCER: {
      name: 'Омега‑баланс (Omega‑6 : Omega‑3)',
      short: 'Оценивает баланс омега‑жиров: чем ближе к целевому соотношению, тем ниже воспалительный фон.',
      details: 'Соотношение omega‑6:omega‑3 — маркер качества жирового профиля. Высокий перекос в сторону omega‑6 ассоциирован с провоспалительным фоном, тогда как достаточный omega‑3 улучшает регуляцию воспалительных медиаторов и восстановление. Целевой ориентир <4:1 — практическая зона, в которой обычно легче поддерживать сердечно‑метаболическое здоровье. Для коррекции важны не только добавки, но и ежедневные источники (рыба, семена, орехи) при одновременном снижении трансжиров и избытка сахара.',
      formula: 'Ratio = omega6 / omega3.\nЦель: <4:1. Дополнительно учитываем сахар и трансжиры как усилители воспаления.',
      sources: [
        {
          label: 'NIH ODS — Omega‑3 Fatty Acids (consumer fact sheet)',
          url: 'https://ods.od.nih.gov/factsheets/Omega3FattyAcids-Consumer/'
        }
      ],
      interpretation: 'Чем ниже соотношение, тем лучше баланс. Высокое — признак перекоса.',
      priority: 'MEDIUM',
      category: 'NUTRITION',
      actionability: 'WEEKLY',
      impactScore: 0.55,
      whyImportant: 'Баланс омега‑жиров влияет на воспаление, сосуды и восстановление.'
    },
    // C9: Heart Health
    HEART_HEALTH: {
      name: 'Здоровье сердца: Na/K + холестерин',
      short: 'Следит за факторами давления и сосудистого риска: натрий, калий и холестерин в динамике.',
      details: 'Панель объединяет три практичных оси кардиориска: натрий, калий и холестерин. Отношение Na/K <1.0 связано с более благоприятным профилем артериального давления, а избыток натрия при низком калии повышает риск гипертензии. Анализ по 7‑дневному среднему нужен, чтобы убрать «шум» отдельных дней (например, солёный ужин) и видеть устойчивый паттерн. Смысл метрики — не запрет соли, а управляемый баланс электролитов и качества рациона.',
      formula: 'Na/K ratio (цель <1.0) + суточный натрий (<2000 мг) + холестерин.\nСчитаем по 7‑дневному среднему.',
      sources: [
        {
          label: 'WHO Guideline — Sodium intake for adults and children (2012)',
          url: 'https://www.who.int/publications/i/item/9789241504836'
        },
        {
          label: 'WHO Guideline — Potassium intake for adults and children (2012)',
          url: 'https://www.who.int/publications/i/item/9789241504829'
        }
      ],
      interpretation: 'Na/K <1.0 — хорошо. Высокий натрий или низкий калий = риск давления.',
      priority: 'HIGH',
      category: 'NUTRITION',
      actionability: 'WEEKLY',
      impactScore: 0.75,
      whyImportant: 'Баланс натрия/калия — один из самых сильных факторов давления и риска ССЗ.'
    },
    // C10: NOVA Quality
    NOVA_QUALITY: {
      name: 'Качество еды (NOVA)',
      short: 'Показывает долю ультра‑переработанной еды: чем она ниже, тем лучше качество рациона.',
      details: 'Классификация NOVA оценивает не только «калории», но и степень промышленной переработки. Высокая доля NOVA‑4 (ультра‑переработанные продукты) связана с более высоким риском ожирения и метаболических нарушений в популяционных исследованиях. Порог >50% удобен как сигнал, что рацион смещён в сторону продуктов с низкой пищевой плотностью и высокой «гипервкусностью». Практический фокус — постепенно заменять часть NOVA‑4 на цельные и минимально обработанные продукты, а не пытаться резко убрать всё сразу.',
      formula: '% калорий из NOVA‑4 (ультра‑переработанные).\nБольше доля = ниже Quality Score. Ферментированные/сырые дают небольшой бонус.',
      sources: [
        {
          label: 'Monteiro et al., 2019 — Ultra‑processed foods and health (BMJ)',
          url: 'https://www.bmj.com/content/365/bmj.l2289'
        }
      ],
      interpretation: 'Если NOVA‑4 >50% — качество рациона низкое. Цель — снизить долю UPF.',
      priority: 'HIGH',
      category: 'NUTRITION',
      actionability: 'WEEKLY',
      impactScore: 0.70,
      whyImportant: 'Ультра‑переработанные продукты связаны с риском метаболических заболеваний.'
    },
    // C11: Training & Recovery
    TRAINING_RECOVERY: {
      name: 'Нагрузка и восстановление',
      short: 'Помогает держать баланс между интенсивными днями и восстановлением, чтобы не перегружаться.',
      details: 'Метрика сопоставляет долю высокоинтенсивной работы (Z4‑Z5) с низкоинтенсивной (Z1‑Z2) и признаками восстановления (сон, настроение). Если высокие зоны накапливаются 3+ дня подряд при ухудшении субъективного состояния, растёт вероятность функционального перегруза и снижения адаптации. На практике это не значит «тренироваться меньше», а значит циклировать нагрузку: тяжёлые дни чередовать с лёгкими, сохраняя общий прогресс и снижая риск травм.',
      formula: 'Доля времени в Z4‑Z5 vs Z1‑Z2.\nПеретрен: 3+ подряд высокоинтенсивных дней + ухудшение сна/настроения.',
      sources: [
        {
          label: 'Seiler, 2010 — intensity distribution in endurance training',
          pmid: '20847704'
        }
      ],
      interpretation: 'Много Z4‑Z5 без восстановления = риск перегруза. Нужны лёгкие дни.',
      priority: 'HIGH',
      category: 'RECOVERY',
      actionability: 'WEEKLY',
      impactScore: 0.65,
      whyImportant: 'Баланс нагрузки и восстановления влияет на прогресс и риск травм.'
    },
    // C12: Hypertrophy & Composition
    HYPERTROPHY_COMPOSITION: {
      name: 'Гипертрофия и композиция',
      short: 'Отслеживает набор мышц по изменениям замеров на фоне достаточного белка и силовых тренировок.',
      details: 'Для оценки гипертрофии важнее смотреть тренд замеров и контекст, чем только массу тела. Рост обхватов при стабильном весе часто указывает на рекомпозицию (мышцы ↑ при контроле жира), особенно если соблюдаются два условия: белок около 1.6 г/кг/сут и регулярная силовая нагрузка. Метрика опирается на 2–4-недельную динамику, потому что краткосрочные колебания воды и гликогена могут маскировать реальный прогресс. Ключевая идея — отслеживать устойчивые изменения, а не разовые скачки.',
      formula: 'Сравниваем измерения (biceps/thigh) на фоне:\nбелок ≥1.6 г/кг/день + силовые тренировки.\nРост обхватов при стабильном весе = набор мышц.',
      sources: [
        {
          label: 'Morton et al., 2018 — protein and resistance training meta‑analysis',
          pmid: '28698222'
        }
      ],
      interpretation: 'Рост обхватов при норме калорий — хороший знак. Без белка эффекта мало.',
      priority: 'MEDIUM',
      category: 'METABOLISM',
      actionability: 'WEEKLY',
      impactScore: 0.60,
      whyImportant: 'Измерения показывают прогресс лучше, чем вес на весах.'
    },
    // C13: Vitamin Defense Radar (NEW v6.0 — Phase 1, 12.02.2026)
    VITAMIN_DEFENSE: {
      name: 'Радар 11 витаминов',
      short: 'Отслеживает дефицит ключевых витаминов относительно DRI: A, C, D, E, K, B1-B6, B9, B12.',
      details: 'Метрика анализирует поступление 11 витаминов за 7+ дней и выявляет дефициты (<70% DRI). Используется функциональная кластеризация: антиоксиданты (A/C/E), костная система (D/K), энергообмен (B1/B2/B3/B6), кроветворение (B9/B12). Снижение балла указывает на высокий риск: множественный дефицит (≥5 витаминов) требует коррекции рациона. Используются gender-adjusted DRI из IOM 2011.',
      formula: 'Для каждого витамина:\n  intake = Σ(products × grams/100) / days\n  pctDV = (intake / DRI[gender]) × 100\n  deficit = pctDV < 70%\n\nScore = 100 - (countDeficits × 8), clamp [0, 100]\nКластеры: antioxidant / bone / energy / blood.',
      sources: [
        {
          label: 'IOM, 2011 — Dietary Reference Intakes',
          pmid: '24566440'
        },
        {
          label: 'Kennedy, 2016 — Vitamin defence mechanisms',
          pmid: '26828517'
        }
      ],
      interpretation: '≥85 — отлично (0-1 дефицит). 70-84 — риск (2-3 дефицита). <70 — опасно (≥5 дефицитов).',
      priority: 'HIGH',
      category: 'NUTRITION',
      actionability: 'WEEKLY',
      impactScore: 0.75,
      whyImportant: 'Витамины определяют иммунитет, энергию, восстановление. Дефицит множественных витаминов = высокий риск.'
    },
    // C22: B-Complex Energy & Anemia Risk (NEW v6.0 — Phase 1, 12.02.2026)
    B_COMPLEX_ANEMIA: {
      name: 'B-комплекс + анемия',
      short: 'Оценивает витамины группы B (энергообмен) + железо (риск анемии).',
      details: 'Метрика анализирует 6 витаминов группы B (B1/B2/B3/B6 — "energy quartet", B9/B12 — "blood pair") + железо за 7+ дней. Два кластера: energyBscore (энергетический метаболизм) и bloodBscore (кроветворение). Риск анемии рассчитывается на основе дефицитов: железо <70% DRI → iron-deficiency anemia (+30), B12 <70% → pernicious anemia (+30), фолат (B9) <70% → megaloblastic anemia (+25). Все три дефицита → compound risk (100). Gender-adjusted: железо 18mg (female) vs 8mg (male). Vegetarian risk flag: если B12 дефицит + <30% дней с источниками B12.',
      formula: 'energyBscore = avg(B1%, B2%, B3%, B6%)\nbloodBscore = avg(B9%, B12%)\n\nanemiaRisk = 0\n  if Fe < 70% → +30 (iron-def)\n  if B12 < 70% → +30 (pernicious)\n  if B9 < 70% → +25 (megaloblastic)\n  if all three → 100 (compound)\n\nScore = energyBscore × 0.4 + bloodBscore × 0.3 + (100 - anemiaRisk) × 0.3',
      sources: [
        {
          label: 'Kennedy, 2016 — B-vitamins and brain function',
          pmid: '26828517'
        },
        {
          label: 'Ssonko, 2018 — Anemia and micronutrients',
          pmid: '29215971'
        }
      ],
      interpretation: '≥70 — хорошо (низкий риск анемии). 50-69 — риск (умеренный). <50 — опасно (высокий риск анемии).',
      priority: 'HIGH',
      category: 'METABOLISM',
      actionability: 'WEEKLY',
      impactScore: 0.80,
      whyImportant: 'B-комплекс критичен для энергии и настроения. Анемия (Fe/B12/B9 дефицит) = снижение работоспособности и здоровья.'
    },
    // C14: Glycemic Load Optimizer (NEW v6.0 — Phase 2, 12.02.2026)
    GLYCEMIC_LOAD: {
      name: 'Гликемическая нагрузка (GL)',
      short: 'Оценивает гликемическую нагрузку по приёмам и за день: GI × количество углеводов.',
      details: 'В отличие от GI, метрика GL учитывает и качество, и количество углеводов. Расчёт ведётся по каждому приёму: GI × (simple+complex carbs) × grams / 10000, затем суммируется за день. Классы: mealGL <10 low, 10-20 medium, >20 high; dailyGL <80 low, 80-120 medium, >120 high. Дополнительно оценивается вечерняя нагрузка (после 18:00): если >50% суточного GL приходится на вечер, применяется штраф к score. Это помогает снижать риск сахарных «качелей», вечерних пиков глюкозы и ухудшения сна.',
      formula: 'mealGL = Σ(GI × (simple100 + complex100) × grams / 10000)\ndailyGL = Σ(mealGL)\neveningRatio = eveningGL / dailyGL\n\nScore = max(0, 100 - (dailyGL - 80) × 0.5 - eveningPenalty)\nwhere eveningPenalty = 15 if eveningRatio > 0.5 else 0',
      sources: [
        {
          label: 'Brand-Miller et al., 2003 — Glycemic index and glycemic load in chronic disease',
          pmid: '12081850'
        },
        {
          label: 'Barclay et al., 2008 — Glycemic index, glycemic load and chronic disease risk',
          pmid: '18835944'
        }
      ],
      interpretation: '≥80 — хорошо. 60-79 — умеренный риск. <60 — высокий GL/вечерняя углеводная нагрузка.',
      priority: 'HIGH',
      category: 'METABOLISM',
      actionability: 'DAILY',
      impactScore: 0.78,
      whyImportant: 'GL точнее GI для реального рациона: учитывает порции и лучше отражает гликемическую нагрузку дня.'
    },
    // C15: Protein Distribution (NEW v6.0 — Phase 2, 12.02.2026)
    PROTEIN_DISTRIBUTION: {
      name: 'Распределение белка',
      short: 'Показывает, насколько белок распределён по приёмам с попаданием в зону 20–40г/приём.',
      details: 'Метрика оценивает не только суточный белок, но и распределение по приёмам. Для каждого приёма рассчитывается mealProtein = Σ(protein100 × grams / 100), затем классификация: <10г subthreshold, 10-20г below optimal, 20-40г optimal, >50г excess. На уровне дня считается доля optimal-приёмов и равномерность распределения (protein spread). Если разница между max и min приёмом <20г — даётся bonus за равномерность. Итоговый score объединяет распределение (70%), достижение суточной цели по белку (до 30%) и evenness-бонус.',
      formula: 'mealProtein = Σ(protein100 × grams / 100)\ndistributionScore = optimalMeals / totalMeals × 100\nevenBonus = 10 if (maxMealProtein - minMealProtein) < 20 else 0\n\nScore = distributionScore × 0.7 + min(100, totalProtein/targetProtein × 100) × 0.3 + evenBonus',
      sources: [
        {
          label: 'Schoenfeld et al., 2018 — Protein timing and hypertrophy',
          pmid: '29497353'
        },
        {
          label: 'Moore et al., 2009 — Dose-response of muscle protein synthesis',
          pmid: '19056590'
        },
        {
          label: 'Leidy et al., 2015 — Morning protein and satiety',
          pmid: '25926512'
        }
      ],
      interpretation: '≥80 — отличное распределение. 60-79 — частично оптимально. <60 — белок распределён неэффективно.',
      priority: 'HIGH',
      category: 'NUTRITION',
      actionability: 'DAILY',
      impactScore: 0.76,
      whyImportant: 'Распределение белка по приёмам усиливает MPS и улучшает сытость, даже при одинаковом суточном белке.'
    },
    // C16: Antioxidant Defense (NEW v6.0 — Phase 3, 12.02.2026)
    ANTIOXIDANT_DEFENSE: {
      name: 'Антиоксидантная защита',
      short: 'Оценивает индекс антиоксидантной защиты (A/C/E + Se + Zn) с учётом тренировочной нагрузки.',
      details: 'Метрика агрегирует 5 ключевых нутриентов антиоксидантной системы: витамин A (20%), витамин C (30%), витамин E (20%), селен (15%), цинк (15%). Дополнительно учитывается оксидативный спрос от тренировок: high demand при нагрузке Z4-Z5 >20 минут, moderate при любой тренировке, low при отсутствии тренировок. При high demand итоговый score понижается мультипликатором 0.85, поскольку одинаковое поступление нутриентов покрывает большую физиологическую потребность. Флаги риска: antioxidant index <60, vitC <50% при high demand, vitE <50% в связке с высокой долей NOVA-4.',
      formula: 'antioxidantIndex = min(1, A/DRI_A)×20 + min(1, C/DRI_C)×30 + min(1, E/DRI_E)×20 + min(1, Se/55)×15 + min(1, Zn/11)×15\n\nScore = antioxidantIndex × (demand === high ? 0.85 : 1.0)',
      sources: [
        {
          label: 'Carlsen et al., 2010 — Total antioxidant content of foods',
          pmid: '20096093'
        },
        {
          label: 'Powers et al., 2004 — Exercise-induced oxidative stress',
          pmid: '12424324'
        }
      ],
      interpretation: '≥80 — хорошая защита. 60-79 — умеренный дефицит антиоксидантов. <60 — защитный дефицит.',
      priority: 'HIGH',
      category: 'RECOVERY',
      actionability: 'DAILY',
      impactScore: 0.77,
      whyImportant: 'Оксидативный стресс от тренировок без нутриентной поддержки может ухудшать восстановление и прогресс.'
    },
    // C18: Added Sugar & Dependency (NEW v6.0 — Phase 3, 12.02.2026)
    ADDED_SUGAR_DEPENDENCY: {
      name: 'Добавленный сахар и зависимость',
      short: 'Tier-оценка добавленного сахара (A/B/C) + паттерн зависимости и сахарные streak-риски.',
      details: 'Метрика использует data reality проекта: в shared_products нет колонки sugar100, поэтому применяется tier-based оценка. Tier A: прямое sugar100 (confidence 1.0), Tier B: simple100×0.70 при NOVA-4 (confidence 0.70), Tier C: simple100×0.30 при NOVA<4 (confidence 0.50). Рассчитывается dailySugar, streak дней >25г (WHO threshold), доля сахара в углеводах, а также cross-pattern флаг «ultra-processed sugar trap» при сочетании high sugar и NOVA-4. Итоговый score масштабируется на confidence, чтобы отличать измеренные и оценочные данные.',
      formula: 'dailySugar = Σ(tierAdjustedSugar)\nScore = max(0, 100 - max(0, dailySugar - 25)×1.5 - dependencyPenalty - moodSwingPenalty) × dayConfidence',
      sources: [
        {
          label: 'WHO, 2015 — Guideline: Sugars intake for adults and children',
          pmid: '25231862'
        },
        {
          label: 'Lustig et al., 2012 — Metabolic effects of sugar',
          pmid: '22351714'
        },
        {
          label: 'Monteiro et al., 2019 — NOVA and ultra-processed foods',
          pmid: '31142457'
        }
      ],
      interpretation: '≥80 — контролируемый уровень сахара. 60-79 — зона внимания. <60 — избыток/зависимый паттерн.',
      priority: 'HIGH',
      category: 'METABOLISM',
      actionability: 'DAILY',
      impactScore: 0.79,
      whyImportant: 'Избыточный добавленный сахар связан с метаболическими рисками и нестабильностью энергии/настроения.'
    },
    // C17: Bone Health Index (NEW v6.0 — Phase 4, 12.02.2026)
    BONE_HEALTH: {
      name: 'Здоровье костей',
      short: 'Комплексная оценка костного профиля: Ca + D + K + P + силовая нагрузка и Ca:P ratio.',
      details: 'Метрика оценивает нутриентную поддержку костной ткани (кальций, витамин D, витамин K, фосфор), баланс Ca:P и наличие weight-bearing нагрузки (strength training). Базовые веса: Ca 35%, D 25%, K 15%, P 10%. Ratio-блок: оптимум Ca:P 1.0–2.0 даёт бонус, крайние значения дают штраф. Exercise-блок: регулярные силовые добавляют бонус как стимул костного ремоделирования. Риск-модификатор для женщин старшего возраста ужесточает целевые пороги. Синергетические флаги: VitD<50% и VitK<50% как признаки ухудшения утилизации кальция.',
      formula: 'Score = Ca_pct + VitD_pct + VitK_pct + P_pct + ratioBonus + exerciseBonus - riskPenalty\nwhere Ca_pct=min(1,Ca/1000)×35, VitD_pct=min(1,D/15)×25, VitK_pct=min(1,K/DRI_K)×15, P_pct=min(1,P/700)×10',
      sources: [
        {
          label: 'Weaver et al., 2016 — Calcium plus vitamin D and bone health',
          pmid: '26856587'
        },
        {
          label: 'Cashman et al., 2011 — Vitamin D and musculoskeletal health',
          pmid: '21118827'
        }
      ],
      interpretation: '≥80 — хороший костный профиль. 60-79 — умеренный риск. <60 — выраженный дефицит поддержки костей.',
      priority: 'HIGH',
      category: 'RECOVERY',
      actionability: 'WEEKLY',
      impactScore: 0.74,
      whyImportant: 'Костное здоровье зависит от сочетания питания и силовой нагрузки, а не от одного нутриента.'
    },
    // C19: Training-Type Nutrition Match (NEW v6.0 — Phase 4, 12.02.2026)
    TRAINING_TYPE_MATCH: {
      name: 'Питание под тип тренировки',
      short: 'Сопоставляет тип тренировок (cardio/strength/hobby) с макро- и post-workout стратегией.',
      details: 'Метрика определяет преобладающий тренировочный профиль и проверяет соответствие питания целям этой нагрузки. Для cardio-intense фокус на углеводах и восполнении гликогена; для strength — повышенный белок и белковое окно после тренировки; для hobby/light — поддерживающий режим без жёсткого тайминга. Дополнительно оценивается post-workout окно (2ч), а также recovery-нутриенты (Mg и VitC) как поддержка восстановления. Итоговый score объединяет macro-match (50%), post-workout (30%) и recovery-блок (20%).',
      formula: 'Score = macroMatchScore×0.5 + postWorkoutScore×0.3 + recoveryNutrientScore×0.2',
      sources: [
        {
          label: 'Thomas et al., 2016 — Position of the Academy/ACSM on nutrition and athletic performance',
          pmid: '26891166'
        },
        {
          label: 'Kerksick et al., 2017 — Nutrient timing and exercise outcomes',
          pmid: '29182451'
        }
      ],
      interpretation: '≥80 — питание хорошо соответствует типу нагрузок. 60-79 — частичное соответствие. <60 — mismatch.',
      priority: 'HIGH',
      category: 'ACTIVITY',
      actionability: 'DAILY',
      impactScore: 0.81,
      whyImportant: 'Одинаковое питание не работает одинаково для cardio и strength: нужен тип-специфичный подход.'
    },
    // C20: Electrolyte Homeostasis (NEW v6.0 — Phase 5, 12.02.2026)
    ELECTROLYTE_HOMEOSTASIS: {
      name: 'Электролитный баланс',
      short: 'Оценивает Na/K/Mg/Ca баланс с учётом потерь при тренировках и рисков гипонатриемии/дисбаланса.',
      details: 'Метрика анализирует ключевые электролиты (натрий, калий, магний, кальций) и их соотношения. Основной риск-фактор — высокий Na:K ratio (цель <1.0), а также низкий натрий при высоком потоотделении (гипонатриемический паттерн) и дефицит магния. При нагрузках с потом >800 мл/ч потребности в электролитах повышаются, поэтому применяется demand-модификатор. Итоговый score учитывает ratio-блок, абсолютное покрытие и тренировочную нагрузку.',
      formula: 'Base = NaK_score×0.5 + Mg_score×0.2 + Ca_score×0.15 + K_score×0.15\nScore = Base - demandPenalty + adaptationBonus',
      sources: [
        {
          label: 'Shirreffs et al., 2005 — Fluid and electrolyte needs for training and competition',
          pmid: '16078019'
        },
        {
          label: 'Maughan et al., 2012 — IOC hydration consensus',
          pmid: '22308527'
        }
      ],
      interpretation: '≥80 — хороший электролитный профиль. 60-79 — умеренный риск. <60 — выраженный дисбаланс.',
      priority: 'HIGH',
      category: 'RECOVERY',
      actionability: 'DAILY',
      impactScore: 0.78,
      whyImportant: 'Электролитный баланс влияет на восстановление, работоспособность и сердечно-мышечную функцию.'
    },
    // C21: Nutrient Density Score (NEW v6.0 — Phase 5, 12.02.2026)
    NUTRIENT_DENSITY: {
      name: 'Плотность нутриентов',
      short: 'Показывает, сколько микронутриентов рацион даёт на 1000 ккал (без перерасхода калорий).',
      details: 'Метрика отражает «качество калории»: отношение полезных нутриентов к энергоёмкости рациона. Используется NRF-подобный подход: суммируется вклад белка, клетчатки, витаминов и минералов на 1000 ккал с вычетом пенальти за добавленный сахар и избыток натрия. Важный плюс метрики — она не зависит только от количества еды: даже при дефиците калорий можно держать высокий nutrient density за счёт выбора продуктов.',
      formula: 'DensityScore = Σ(nutrients_per_1000kcal / target)×weights - penalty(sugar, sodium)',
      sources: [
        {
          label: 'Drewnowski, 2005 — Concept of nutrient density',
          pmid: '15795449'
        },
        {
          label: 'Drewnowski et al., 2018 — NRF nutrient profiling models',
          pmid: '29581729'
        }
      ],
      interpretation: '≥80 — высокая нутриентная плотность. 60-79 — средняя. <60 — калории бедны нутриентами.',
      priority: 'HIGH',
      category: 'NUTRITION',
      actionability: 'DAILY',
      impactScore: 0.82,
      whyImportant: 'Высокая плотность нутриентов улучшает насыщение и покрытие дефицитов без лишних калорий.'
    },

    // === CORE PATTERNS (v2-v3) — Scientific metadata (12.02.2026) ===
    MEAL_TIMING: {
      name: 'Тайминг приёмов пищи',
      short: 'Анализирует частоту приёмов и интервалы между ними в контексте инсулиновых волн.',
      details: 'Паттерн оценивает, насколько оптимальна частота ваших приёмов пищи. Слишком частые приёмы (<3ч интервал) могут приводить к перехлёсту инсулиновых волн — когда новая волна начинается до завершения предыдущей, что снижает эффективность липолиза. Слишком редкие (>6ч) — к гормональному голоду и перееданию на следующем приёме. Оптимум: 3-5ч интервал между приёмами для большинства людей. Метрика также учитывает количество приёмов в день: 3-5 — норма, <3 — недостаточно (риск переедания), >6 — избыточно (постоянная инсулиновая нагрузка). Индивидуальная толерантность может варьироваться в зависимости от инсулиновой чувствительности и метаболического типа.',
      formula: 'Для каждой пары приёмов:\n  interval = meal[i+1].time - meal[i].time\n  classify: <3h "frequent", 3-5h "optimal", >6h "long"\n\nScore:\n  optimalCount / totalIntervals × 70\n  + mealCount penalty/bonus (3-5 = +30, <3 or >6 = -20)\n  - overlap penalty (wave перехлёст)',
      sources: [
        {
          label: 'Kahleova et al., 2014 — Meal frequency and metabolic health',
          pmid: '25489333'
        },
        {
          label: 'Paoli et al., 2019 — Intermittent fasting vs frequent meals',
          pmid: '30472870'
        }
      ],
      interpretation: '≥80 — оптимальная частота. 60-79 — можно улучшить. <60 — слишком частые или редкие приёмы.',
      priority: 'HIGH',
      category: 'TIMING',
      actionability: 'TODAY',
      impactScore: 0.75,
      whyImportant: '⏰ Правильные интервалы между едой = стабильная энергия + эффективное жиросжигание без голода.'
    },
    WAVE_OVERLAP: {
      name: 'Перехлёст инсулиновых волн',
      short: 'Детекция ситуаций, когда новый приём начинается до завершения предыдущей инсулиновой волны.',
      details: 'Инсулиновая волна — это период повышенного инсулина после приёма пищи, длящийся 2.5-4.5ч в зависимости от состава еды (гликемический индекс, белок, жиры). Перехлёст происходит, когда следующий приём случается до того, как инсулин вернулся к базовому уровню. Последствия: блокировка липолиза (жиросжигание останавливается), постоянная инсулиновая нагрузка (риск инсулинорезистентности), труднее контролировать вес. Метрика моделирует длительность волны для каждого приёма (учитывая GI, protein, fat) и флагует перехлёсты. Частые перехлёсты (>50% приёмов) — сигнал пересмотреть частоту или состав еды.',
      formula: 'Для каждого приёма:\n  waveDuration = estimateInsulinWave(meal)\n    // 2.5h для низкого GI+белок, 4.5h для высокого GI+мало белка\n\n  if (nextMeal.time - meal.time) < waveDuration:\n    overlap = true\n\nScore = 100 - (overlapCount / totalMeals × 100)',
      sources: [
        {
          label: 'Hall et al., 2016 — Insulin dynamics and energy balance',
          pmid: '27385608'
        },
        {
          label: 'Bray et al., 2016 — Meal timing and insulin sensitivity',
          pmid: '27431364'
        }
      ],
      interpretation: '≥80 — минимум перехлёстов. 60-79 — умеренные перехлёсты. <60 — частые перехлёсты (ухудшение липолиза).',
      priority: 'HIGH',
      category: 'TIMING',
      actionability: 'TODAY',
      impactScore: 0.80,
      whyImportant: '🌊 Перехлёст волн = блокировка жиросжигания. Давай инсулину вернуться к базе между приёмами!'
    },
    LATE_EATING: {
      name: 'Поздние приёмы пищи',
      short: 'Оценивает количество и калорийность приёмов после 21:00 и их влияние на сон и вес.',
      details: 'Приёмы пищи в позднее время (после 21:00) нарушают циркадные ритмы метаболизма. Инсулиновая чувствительность вечером снижена на 20-30%, что означает худшую переносимость углеводов и больший риск отложения жира. Кроме того, поздняя еда повышает core body temperature, что мешает засыпанию и снижает качество сна. Недосып усиливает голод на следующий день (грелин ↑, лептин ↓), создавая порочный круг. Метрика считает процент калорий после 21:00 и количество таких приёмов. Оптимально: <10% калорий после 21:00, лучше вообще избегать. Исключение: лёгкий белковый снек (казеин) перед сном для ночного синтеза мышц — допустим.',
      formula: 'lateKcal = Σ(kcal for meals after 21:00)\nlateRatio = lateKcal / totalDayKcal × 100\nlateMeals = count(meals after 21:00)\n\nScore:\n  if lateRatio < 10% → 100\n  else 100 - (lateRatio - 10) × 2\n  - lateMeals × 5 (penalty per meal)',
      sources: [
        {
          label: 'Bandín et al., 2015 — Late eating and obesity risk',
          pmid: '25311617'
        },
        {
          label: 'Garaulet & Gómez-Abellán, 2014 — Meal timing and circadian rhythms',
          pmid: '24847856'
        }
      ],
      interpretation: '≥85 — оптимально. 70-84 — умеренная поздняя еда. <70 — частые поздние приёмы (риск для сна/веса).',
      priority: 'MEDIUM',
      category: 'TIMING',
      actionability: 'TODAY',
      impactScore: 0.68,
      whyImportant: '🌙 Поздняя еда = плохой сон + труднее худеть. Закрывай кухню за 3ч до сна!'
    },
    MEAL_QUALITY_TREND: {
      name: 'Тренд качества приёмов',
      short: 'Отслеживает динамику среднего Meal Quality Score за 7-14 дней.',
      details: 'Метрика агрегирует MQS (Meal Quality Score) каждого приёма за период и показывает тренд: улучшается ли качество рациона или деградирует. MQS учитывает баланс макронутриентов (белок, клетчатка, полезные жиры), гликемический индекс, разнообразие категорий продуктов. Положительный тренд (slope > 0.5 points/week) — признак устойчивого прогресса. Отрицательный — сигнал о спаде дисциплины или внешних факторах (стресс, путешествие). Важно: случайные «плохие дни» не страшны, важен общий вектор. Метрика фильтрует шум через 3-день moving average.',
      formula: 'mealsQuality[] = [MQS per meal over 7-14 days]\ntrendSlope = linearRegression(mealsQuality, time).slope\n\nScore:\n  avgMQS × 0.7 + trendBonus × 0.3\n  where trendBonus = min(30, max(-30, slope × 10))',
      sources: [
        {
          label: 'Chiuve et al., 2012 — Diet quality and mortality',
          pmid: '22535969'
        },
        {
          label: 'Schwingshackl & Hoffmann, 2015 — Diet quality indexes',
          pmid: '25318818'
        }
      ],
      interpretation: '≥80 — высокое качество + позитивный тренд. 60-79 — среднее. <60 — низкое качество или негативный тренд.',
      priority: 'MEDIUM',
      category: 'NUTRITION',
      actionability: 'WEEKLY',
      impactScore: 0.65,
      whyImportant: '📈 Тренд важнее отдельных дней. Растущее качество = устойчивый прогресс!'
    },
    SLEEP_WEIGHT: {
      name: 'Сон ↔ Вес',
      short: 'Анализирует корреляцию между качеством/длительностью сна и динамикой веса.',
      details: 'Недостаток сна (<7ч) нарушает гормональный баланс: грелин (гормон голода) повышается на 15%, лептин (гормон сытости) снижается на 15-20%, что создаёт дополнительный голод ~300 ккал/день. Кортизол растёт, способствуя накоплению висцерального жира. Плюс снижается willpower и самоконтроль — выше риск срывов. Метрика отслеживает корреляцию: если в дни с <7ч сна вес растёт/не падает, а в дни с ≥7.5ч — снижается, это сильный сигнал. Threshold: |r| > 0.3 считается значимой связью. Для женщин связь сильнее из-за более выраженных гормональных флуктуаций.',
      formula: 'days[] = {sleepHours, weightChange}\ncorrelation = pearson(sleepHours, -weightChange)\n  // negative weight change = weight loss = positive outcome\n\nScore:\n  if |r| > 0.5 → 100 (сильная связь)\n  if |r| > 0.3 → 75 (умеренная)\n  if |r| < 0.2 → 50 (слабая/нет)',
      sources: [
        {
          label: 'Taheri et al., 2004 — Short sleep and obesity',
          pmid: '15583226'
        },
        {
          label: 'Spiegel et al., 2004 — Sleep curtailment and appetite hormones',
          pmid: '15531540'
        }
      ],
      interpretation: '|r| > 0.5 — сильная связь (сон критичен для твоего веса). 0.3-0.5 — умеренная. <0.3 — слабая.',
      priority: 'HIGH',
      category: 'RECOVERY',
      actionability: 'DAILY',
      impactScore: 0.85,
      whyImportant: '😴 Недосып = +300 ккал голода в день. Высыпайся — это самый простой путь к прогрессу!'
    },
    SLEEP_HUNGER: {
      name: 'Сон → Голод',
      short: 'Оценивает, как недосып влияет на аппетит и выбор еды на следующий день.',
      details: 'Метрика анализирует каузальную связь: недостаток сна → усиление голода на следующий день. После ночи с <7ч сна грелин (гормон голода) повышается на 15%, лептин (сытость) снижается на 15%. Это создаёт дополнительный голод ~200-400 ккал/день + тягу к быстрым углеводам и жирам (механизм: мозг ищет быструю энергию для компенсации усталости). Кроме количественного голода страдает качество выбора: в днях после недосыпа вырастает доля простых углеводов и NOVA-4 продуктов. Метрика считает корреляцию sleepHours[day-1] с totalKcal[day], avgGI[day], stressLevel[day]. Лаг 1 день — потому что последствия недосыпа проявляются на следующий день, не мгновенно.',
      formula: 'For each day:\n  prevSleep = day[-1].sleepHours\n  todayKcal = day.tot.kcal\n  todayGI = avg(meal.items[].gi)\n\ncorr1 = pearson(prevSleep, -todayKcal)  // less sleep → more kcal\ncorr2 = pearson(prevSleep, -todayGI)    // less sleep → higher GI\n\nScore = (corr1 + corr2) / 2 × 50 + 50  // normalized 0-100',
      sources: [
        {
          label: 'St-Onge et al., 2016 — Sleep duration and food intake',
          pmid: '27568993'
        },
        {
          label: 'Hogenkamp et al., 2013 — Sleep restriction and food choice',
          pmid: '23414424'
        }
      ],
      interpretation: '≥75 — сильная связь (высыпайся обязательно!). 50-74 — умеренная. <50 — слабая связь (но всё равно важно).',
      priority: 'HIGH',
      category: 'RECOVERY',
      actionability: 'TODAY',
      impactScore: 0.80,
      whyImportant: '😴 Недосып = гормональный голод +300 ккал + тяга к джанку. Сон вместо силы воли!'
    },
    TRAINING_KCAL: {
      name: 'Тренировки ↔ Калории',
      short: 'Анализирует паттерн компенсации тренировок едой: съедаешь ли ты больше в дни тренировок.',
      details: 'Феномен exercise compensation — распространённая ловушка: после тренировки человек переоценивает расход калорий и переедает, компенсируя ~75-150% от реально потраченного. Это объясняет эффект «тренируюсь, но не худею». Метрика сравнивает калорийность в дни с тренировками vs без. Если разница > 400 ккал, а тренировка «стоит» ~300-500 ккал → compensation > 100% → прогресс блокируется. Оптимальный паттерн: небольшое повышение калорий (+10-15%) для восстановления, но не «награда за тренировку». Важный нюанс: для силовых тренировок допустимо +200-300 ккал, для кардио — минимальная компенсация (~50-100), так как цель обычно = дефицит.',
      formula: 'trainingDays[] = days with trainings\nrestDays[] = days without trainings\n\navgKcal_training = mean(trainingDays.kcal)\navgKcal_rest = mean(restDays.kcal)\ndelta = avgKcal_training - avgKcal_rest\n\navgExpenditure = mean(trainingDays.totalExpenditure)\ncompensationRatio = delta / avgExpenditure\n\nScore:\n  if compensationRatio < 0.2 → 100 (minimal comp)\n  if 0.2-0.5 → 80 (moderate)\n  if 0.5-0.8 → 60 (high comp)\n  if >0.8 → 40 (full comp, блокирует прогресс)',
      sources: [
        {
          label: 'King et al., 2012 — Exercise and appetite compensation',
          pmid: '22564864'
        },
        {
          label: 'Thomas et al., 2012 — Compensatory responses to exercise',
          pmid: '22885926'
        }
      ],
      interpretation: '≥80 — минимальная компенсация (отлично). 60-79 — умеренная. <60 — высокая компенсация (ограничивает прогресс).',
      priority: 'MEDIUM',
      category: 'ACTIVITY',
      actionability: 'WEEKLY',
      impactScore: 0.70,
      whyImportant: '🏋️ Тренировка не = +500 ккал к ужину. Не компенсируй весь расход едой!'
    },
    STEPS_WEIGHT: {
      name: 'Шаги ↔ Вес',
      short: 'Корреляция между количеством шагов (NEAT-активность) и динамикой веса.',
      details: 'NEAT (Non-Exercise Activity Thermogenesis) — бытовая активность, не являющаяся тренировкой: ходьба, уборка, игра с детьми. NEAT может давать 200-600 ккал/день расхода у активных людей (10-15k шагов) vs сидячих (<5k). Это мощный инструмент для дефицита без тренировок. Метрика анализирует связь: больше шагов → быстрее уходит вес. Correlation r > 0.4 считается сильной связью. Важный инсайт: NEAT эффективнее тренировок для долгосрочного контроля веса, так как не вызывает компенсаторного голода (в отличие от интенсивных кардио). 10k шагов/день — хороший baseline, 12-15k — отличный. Меньше 7k — риск застоя веса даже при дефиците калорий.',
      formula: 'days[] = {steps, weightChange}\ncorrelation = pearson(steps, -weightChange)\n  // more steps → weight loss → negative change\n\navgSteps = mean(days.steps)\n\nScore:\n  corr_score = |r| × 50\n  volume_score = min(50, avgSteps / 200)  // 10k steps = 50 points\n  total = corr_score + volume_score',
      sources: [
        {
          label: 'Levine, 2004 — NEAT and obesity',
          pmid: '14722404'
        },
        {
          label: 'Tudor-Locke et al., 2011 — Daily step recommendations',
          pmid: '21471817'
        }
      ],
      interpretation: '≥80 — сильная связь + высокая активность. 60-79 — умеренная. <60 — слабая связь или мало шагов.',
      priority: 'MEDIUM',
      category: 'ACTIVITY',
      actionability: 'DAILY',
      impactScore: 0.72,
      whyImportant: '🚶 NEAT = 200-600 ккал расхода без тренировок. Больше шагов = легче худеть!'
    },
    PROTEIN_SATIETY: {
      name: 'Белок → Сытость',
      short: 'Анализирует связь между количеством белка в приёме пищи и последующей сытостью/временем до голода.',
      details: 'Белок — самый насыщающий макронутриент (TEF 20-30%, vs 5-10% углеводы, 0-3% жиры). Высокобелковые приёмы (≥25г белка) дают сытость на 3-4ч, низкобелковые (<15г) — 2-2.5ч. Механизм: белок стимулирует выработку пептида YY и GLP-1 (гормоны сытости), замедляет опорожнение желудка. Метрика моделирует timeToNextMeal для каждого приёма и коррелирует с protein content. Если после высокобелковых приёмов интервалы длиннее → паттерн подтверждён. Практическое применение: 20-30г белка на приём = оптимум для сытости + синтез мышц. Меньше 15г — риск раннего голода, больше 40г — diminishing returns (излишки окисляются).',
      formula: 'For each meal:\n  proteinGrams = Σ(items.protein)\n  timeToNextMeal = nextMeal.time - meal.time\n\ncorrelation = pearson(proteinGrams, timeToNextMeal)\n\navgProteinPerMeal = mean(meals.protein)\n\nScore:\n  corr_score = r × 50 + 50  // normalized\n  adequacy_score = min(50, avgProteinPerMeal / 0.5)  // 25g = 50 pts\n  total = (corr_score + adequacy_score) / 2',
      sources: [
        {
          label: 'Westerterp-Plantenga et al., 2009 — Protein and satiety',
          pmid: '19400750'
        },
        {
          label: 'Leidy et al., 2015 — Protein intake and appetite control',
          pmid: '25926512'
        }
      ],
      interpretation: '≥80 — сильная связь белка и сытости. 60-79 — умеренная. <60 — слабая или мало белка.',
      priority: 'MEDIUM',
      category: 'NUTRITION',
      actionability: 'TODAY',
      impactScore: 0.75,
      whyImportant: '🥩 Белок = сытость на 3-4ч без лишних калорий. 20-30г на приём!'
    },
    FIBER_REGULARITY: {
      name: 'Клетчатка → Регулярность',
      short: 'Связь между потреблением клетчатки и регулярностью пищеварения (комфорт, стабильность энергии).',
      details: 'Клетчатка (fiber) — ключевой нутриент для здоровья кишечника и метаболизма. Норма: 14г/1000 ккал (≈25-35г/день). Преимущества: замедляет всасывание глюкозы (снижает GI реального приёма на 10-20%), питает микробиом (SCFA production → противовоспалительный эффект), увеличивает объём пищи → сытость без калорий, регулирует стул. Метрика отслеживает adequacy (достаточность клетчатки) и корреляцию с wellbeing/digestive comfort (если есть данные). Низкое потребление (<15г/день) → риск запоров, dysbiosis, insulin spikes. Оптимальные источники: овощи, цельнозерновые, бобовые, ягоды. Важно: повышать клетчатку постепенно (+5г/неделю), иначе дискомфорт.',
      formula: 'For each day:\n  fiberPerDay = Σ(items.fiber)\n  fiberPer1000kcal = fiber / (totalKcal / 1000)\n\navgFiber = mean(days.fiber)\nadequacy = min(1.0, avgFiber / 25)  // 25g target\n\nif wellbeing data available:\n  corr = pearson(fiber, wellbeing)\n  score = adequacy × 70 + (corr × 0.5 + 0.5) × 30\nelse:\n  score = adequacy × 100',
      sources: [
        {
          label: 'Slavin, 2013 — Fiber and prebiotics',
          pmid: '23609775'
        },
        {
          label: 'Reynolds et al., 2019 — Carbohydrate quality and health',
          pmid: '30638909'
        }
      ],
      interpretation: '≥80 — достаточно клетчатки (≥25г/день). 60-79 — умеренно. <60 — недостаток клетчатки.',
      priority: 'MEDIUM',
      category: 'NUTRITION',
      actionability: 'WEEKLY',
      impactScore: 0.68,
      whyImportant: '🌾 Клетчатка = стабильная энергия + сытость + здоровый кишечник. Цель: 25-35г/день!'
    },
    STRESS_EATING: {
      name: 'Стресс → Переедание',
      short: 'Детектирует паттерн эмоционального переедания в стрессовые дни.',
      details: 'Стресс активирует HPA-ось (hypothalamic-pituitary-adrenal), повышая кортизол. Высокий кортизол стимулирует аппетит (особенно тягу к сахару и жирам — «comfort food»). Механизм: быстрые углеводы + жиры временно снижают стресс через серотонин/дофамин release, создавая reinforcement loop. Метрика анализирует: в дни с высоким стрессом (stress ≥7/10) калорийность выше? GI выше? Доля простых углеводов выше? Если да → паттерн stress eating подтверждён. Корреляция r > 0.4 = значимая связь. Важно: эмоциональное переедание — не «слабость характера», а физиологическая реакция на стресс. Альтернативы: прогулка, медитация, белковый перекус вместо сахара.',
      formula: 'stressDays[] = days where stress ≥ 7\nlowStressDays[] = days where stress ≤ 4\n\navgKcal_stress = mean(stressDays.kcal)\navgKcal_low = mean(lowStressDays.kcal)\ndelta = avgKcal_stress - avgKcal_low\n\navgSimple_stress = mean(stressDays.simple100_pct)\navgSimple_low = mean(lowStressDays.simple100_pct)\n\nScore:\n  if delta < 200 && simple_delta < 10% → 100\n  else 100 - (delta / 10) - (simple_delta × 2)',
      sources: [
        {
          label: 'Tomiyama et al., 2011 — Stress and eating behavior',
          pmid: '21676152'
        },
        {
          label: 'Dallman, 2010 — Stress-induced obesity',
          pmid: '20357041'
        }
      ],
      interpretation: '≥80 — минимальная связь стресса и переедания. 60-79 — умеренная. <60 — сильная связь (нужны альтернативы).',
      priority: 'MEDIUM',
      category: 'PSYCHOLOGY',
      actionability: 'WEEKLY',
      impactScore: 0.72,
      whyImportant: '😰 Стресс = кортизол = +300 ккал комфортной еды. Найди альтернативы заеданию!'
    },
    MOOD_FOOD: {
      name: 'Настроение ↔ Еда',
      short: 'Двусторонняя связь: как еда влияет на настроение и как настроение влияет на выбор еды.',
      details: 'Метрика анализирует bidirectional relationship. Направление 1: плохое настроение утром → выбор менее здоровой еды (↑GI, ↑простые углеводы, ↓белок) = эмоциональный выбор. Направление 2: качество еды → настроение через 2-4ч. Высокий GI/мало белка → sugar crash → падение настроения. Низкий GI + достаточно белка → stable energy → stable mood. Механизм: stable glucose → stable neurotransmitters (серотонин, дофамин). Метрика считает две корреляции: mood[morning] ↔ mealQuality[day], mealQuality[meal] ↔ mood[2h later]. Если обе значимы → bidirectional pattern подтверждён. Практически: начинай день с белкового завтрака → стабилизирует настроение → лучше выбор еды весь день.',
      formula: 'For each day:\n  corr1 = pearson(mood_morning, avgMealQuality_day)\n  corr2 = pearson(mealGI, mood_afternoon)\n\navgMoodStability = stddev(mood across hours)\n\nScore:\n  pattern_strength = (|corr1| + |corr2|) / 2 × 50\n  stability_score = (1 - avgMoodStability / 3) × 50\n  total = pattern_strength + stability_score',
      sources: [
        {
          label: 'Macht, 2008 — How emotions affect eating',
          pmid: '18457711'
        },
        {
          label: 'Penckofer et al., 2017 — Diet and mood',
          pmid: '28179633'
        }
      ],
      interpretation: '≥75 — сильная связь еды и настроения (работай над качеством!). 50-74 — умеренная. <50 — слабая.',
      priority: 'MEDIUM',
      category: 'PSYCHOLOGY',
      actionability: 'DAILY',
      impactScore: 0.70,
      whyImportant: '😊 Еда влияет на настроение, настроение — на выбор еды. Разорви цикл!'
    },
    HYPERTROPHY: {
      name: 'Гипертрофия',
      short: 'Оценивает изменения композиции тела: мышечная масса vs жир через динамику веса и обхватов.',
      details: 'Метрика использует два источника данных: вес (profile.weight) и обхваты (measurements: biceps, thigh, waist). Тренды обхватов рассчитываются через линейную регрессию за 14-30 дней. Сценарии: (1) Muscle gain — вес ↑ + обхваты бицепс/бедро ↑ + талия = или ↓ (идеальный набор). (2) Fat gain — вес ↑ + обхваты мышц = + талия ↑ (плохой набор). (3) Fat loss — вес ↓ + обхваты мышц = (сохранение) + талия ↓ (дефицит с защитой мышц). (4) Muscle loss — вес ↓ + обхваты мышц ↓ (слишком жёсткий дефицит или мало белка). Оптимально: protein ≥1.6 g/kg/day + силовые тренировки 3+ раз/неделю. Score учитывает направление трендов + достаточность белка.',
      formula: 'trends = linearRegression(days.measurements, days.weight)\n\nscenario detection:\n  if weight↑ && biceps↑ && thigh↑ && waist≤ → muscle_gain\n  if weight↑ && biceps= && waist↑ → fat_gain\n  if weight↓ && biceps= && waist↓ → fat_loss (good)\n  if weight↓ && biceps↓ → muscle_loss (bad)\n\nprotAdequacy = avgProtein / (weight × 1.6)\n\nScore:\n  scenario_score (60): muscle_gain=100, fat_loss=90, fat_gain=40, muscle_loss=30\n  protein_score (40): protAdequacy × 100',
      sources: [
        {
          label: 'Schoenfeld et al., 2017 — Resistance training and hypertrophy',
          pmid: '28834797'
        },
        {
          label: 'Morton et al., 2018 — Protein and muscle mass',
          pmid: '29497353'
        }
      ],
      interpretation: '≥80 — отличная композиция (мышцы растут или сохраняются). 60-79 — умеренная. <60 — негативная динамика.',
      priority: 'MEDIUM',
      category: 'METABOLISM',
      actionability: 'LONG_TERM',
      impactScore: 0.78,
      whyImportant: '💪 Композиция важнее веса. Цель: мышцы растут, жир уходит!'
    },

    // === Умный планировщик — Sprint 9 science engine (v4.0.6) ===
    SMART_PLANNER: {
      name: 'Умный планировщик — научное обоснование v4',
      short: 'Планировщик строит расписание на основе 9 научных спринтов (S0–S8): хроно-питание, метаболический фенотип, синтез белка (MPS), гликемическая нагрузка (GL), анаболическое окно, качество сна, адаптивная инсулиновая волна и first-meal logic.',
      details: 'Система v4.0.6 использует 9-уровневый конвейер (S0–S8). S0: First-Meal Logic при 0 ккал планирует день с чистого листа. S1: Хроно-питание распределяет калории по циркадным ритмам (больше днем, меньше вечером). S2: MPS Boost гарантирует 0.4 г/кг белка на приём для синтеза мышц. S3: GL Targets ограничивает гликемическую нагрузку вечером (GL<10). S4: Анаболическое окно после тренировки (+60% углеводов). S5: Sleep-Friendly подбор продуктов (казеин/триптофан) за 3ч до сна. S6: Адаптивная волна (история 14 дней). S7: Фенотипическая коррекция макросов. S8: Volume-Scaled Wave — длительность сытости зависит от объёма порции (ккал).',
      formula: 'S0 First-Meal: if kcal=0 → force BALANCED scenario\n\nS1 Chrono: ratio = MORNING 0.33 / LUNCH 0.38 / SNACK 0.20 / EVENING 0.28\n\nS2 MPS: protein = min(40, weight × 0.4) g per meal\n\nS3 GL: targetGL = sleep<3h ? 10 : 20\n\nS4 Post-Workout: carb ratio → 60%, budget +300kcal\n\nS6 Adaptive Wave: median(gap 2–6h from 14 days)\n\nS8 Scaled Wave: time = personalWave × √(mealKcal / totalBudget)',
      sources: [
        { label: 'Garaulet & Gómez-Abellán, 2014 — Timing of food intake', pmid: '23877420', level: 'A' },
        { label: 'Areta et al., 2013 — Protein ingestion & MPS', pmid: '23459753', level: 'A' },
        { label: 'Ludwig, 2002 — The glycemic index', pmid: '12002800', level: 'A' },
        { label: 'Ivy, 2004 — Glycogen repletion after exercise', pmid: '15212750', level: 'B' },
        { label: 'Halson, 2014 — Sleep and nutritional interventions', pmid: '24435400', level: 'B' },
        { label: 'Louis-Sylvestre & Le Magnen, 1980 — Volume-scaled satiety', pmid: '7413695', level: 'B' }
      ],
      evidenceLevel: 'A',
      confidenceScore: 0.92,
      interpretation: 'Планировщик автоматически адаптируется под ваши цели, тренировки и режим сна. При 0 ккал (утро) запускается режим полного дня (S0).',
      priority: 'HIGH',
      category: 'TIMING',
      actionability: 'TODAY',
      impactScore: 0.89,
      whyImportant: '🧠 9 принципов доказательной науки в каждом приёме. Хроно · MPS · GL · Анаб.окно · Сон · Фенотип · Личный ритм.'
    }
  };

  // === ПАТТЕРНЫ ===
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
    GUT_HEALTH: 'gut_health',

    // NEW v4.0 (B1-B6)
    SLEEP_QUALITY: 'sleep_quality',         // B1: влияние качества сна на метрики следующего дня
    WELLBEING_CORRELATION: 'wellbeing_correlation', // B2: связь самочувствия с питанием/сном
    HYDRATION: 'hydration',                 // B3: достаточность гидратации
    BODY_COMPOSITION: 'body_composition',   // B4: динамика обхватов талия/бёдра
    CYCLE_IMPACT: 'cycle_impact',           // B5: влияние цикла (фаз) на метрики
    WEEKEND_EFFECT: 'weekend_effect',       // B6: паттерн пт-вс vs пн-чт
    NUTRITION_QUALITY: 'nutrition_quality', // C2: качество питания
    NEAT_ACTIVITY: 'neat_activity',         // C4: бытовая активность
    MOOD_TRAJECTORY: 'mood_trajectory',     // C6: траектория настроения

    // NEW v5.0 (C7-C12)
    MICRONUTRIENT_RADAR: 'micronutrient_radar', // C7: микронутриенты
    OMEGA_BALANCER: 'omega_balancer',           // C8: омега-баланс
    HEART_HEALTH: 'heart_health',               // C9: сердце/метаболизм
    NOVA_QUALITY: 'nova_quality',               // C10: качество по NOVA
    TRAINING_RECOVERY: 'training_recovery',     // C11: нагрузка/восстановление
    HYPERTROPHY: 'hypertrophy',                 // C12: гипертрофия/композиция

    // NEW v6.0 (C13-C22) — Phase 1-4 implementation
    VITAMIN_DEFENSE: 'vitamin_defense',         // C13: радар 11 витаминов (Phase 1, 12.02.2026)
    B_COMPLEX_ANEMIA: 'b_complex_anemia',       // C22: B-комплекс + риск анемии (Phase 1, 12.02.2026)
    GLYCEMIC_LOAD: 'glycemic_load',             // C14: гликемическая нагрузка (Phase 2, 12.02.2026)
    PROTEIN_DISTRIBUTION: 'protein_distribution', // C15: распределение белка (Phase 2, 12.02.2026)
    ANTIOXIDANT_DEFENSE: 'antioxidant_defense',   // C16: антиоксидантная защита (Phase 3, 12.02.2026)
    ADDED_SUGAR_DEPENDENCY: 'added_sugar_dependency', // C18: добавленный сахар + зависимость (Phase 3, 12.02.2026)
    BONE_HEALTH: 'bone_health',                   // C17: здоровье костей (Phase 4, 12.02.2026)
    TRAINING_TYPE_MATCH: 'training_type_match',  // C19: питание под тип тренировки (Phase 4, 12.02.2026)
    ELECTROLYTE_HOMEOSTASIS: 'electrolyte_homeostasis', // C20: электролитный баланс (Phase 5, 12.02.2026)
    NUTRIENT_DENSITY: 'nutrient_density'         // C21: плотность нутриентов (Phase 5, 12.02.2026)
  };

  // === UNIT REGISTRY (Phase 0, 12.02.2026) ===
  // Canonical units for all minerals/vitamins — prevents mg/mcg confusion in C13+C22 patterns
  // Source: docs/DATA_MODEL_REFERENCE.md:315-340, USDA FoodData Central canonical units
  const UNIT_REGISTRY = {
    // Minerals (8 fields)
    calcium: { unit: 'mg', dri: 1000, label: 'Кальций' },
    iron: { unit: 'mg', dri: 18, label: 'Железо' },
    magnesium: { unit: 'mg', dri: 400, label: 'Магний' },
    phosphorus: { unit: 'mg', dri: 700, label: 'Фосфор' },
    potassium: { unit: 'mg', dri: 3500, label: 'Калий' },
    zinc: { unit: 'mg', dri: 11, label: 'Цинк' },
    selenium: { unit: 'mcg', dri: 55, label: 'Селен' },
    iodine: { unit: 'mcg', dri: 150, label: 'Йод' },

    // Vitamins (11 fields) — already used in v5.0 C07 Micronutrient Radar, repeated for completeness
    vitamin_a: { unit: 'mcg', dri: 900, label: 'Витамин A' },
    vitamin_c: { unit: 'mg', dri: 90, label: 'Витамин C' },
    vitamin_d: { unit: 'mcg', dri: 20, label: 'Витамин D' },
    vitamin_e: { unit: 'mg', dri: 15, label: 'Витамин E' },
    vitamin_k: { unit: 'mcg', dri: 120, label: 'Витамин K' },
    vitamin_b1: { unit: 'mg', dri: 1.2, label: 'Тиамин' },
    vitamin_b2: { unit: 'mg', dri: 1.3, label: 'Рибофлавин' },
    vitamin_b3: { unit: 'mg', dri: 16, label: 'Ниацин' },
    vitamin_b6: { unit: 'mg', dri: 1.7, label: 'Пиридоксин' },
    vitamin_b9: { unit: 'mcg', dri: 400, label: 'Фолат' },
    vitamin_b12: { unit: 'mcg', dri: 2.4, label: 'Кобаламин' }
  };

  // Helper: normalize mineral value to canonical unit (mg → mg, mcg → mcg)
  // Usage: UNIT_REGISTRY[field]?.unit === 'mcg' ? valMcg : valMg
  const normalizeToUnit = (fieldName, value) => {
    const def = UNIT_REGISTRY[fieldName];
    if (!def || value == null) return null;
    return typeof value === 'number' ? value : parseFloat(value) || null;
  };

  HEYS.InsightsPI.constants = {
    CONFIG,
    PRIORITY_LEVELS,
    CATEGORIES,
    ACTIONABILITY,
    SECTIONS_CONFIG,
    getSortedSections,
    getSectionPriority,
    computeDynamicPriority,      // NEW: Dynamic priority resolver
    PRIORITY_CONTEXT_LABELS,     // NEW: Context-specific badge labels
    getMetricPriority,
    getAllMetricsByPriority,
    getMetricsByCategory,
    getMetricsByActionability,
    getCriticalMetrics,
    getPriorityStats,
    SCIENCE_INFO,
    PATTERNS,
    UNIT_REGISTRY,       // NEW: Phase 0
    normalizeToUnit      // NEW: Phase 0
  };

  // Экспорт в глобальную область для повторного использования/диагностики
  window.piConst = HEYS.InsightsPI.constants;
})();
