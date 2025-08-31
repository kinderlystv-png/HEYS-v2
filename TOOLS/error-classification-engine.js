/**
 * 🧠 ERROR CLASSIFICATION ENGINE
 * Автоматическая классификация ошибок и генерация рекомендаций
 *
 * Возможности:
 * - Интеллектуальная классификация ошибок по типам
 * - Автоматическое определение критичности
 * - Генерация контекстных рекомендаций по исправлению
 * - Обучение на основе паттернов ошибок HEYS проекта
 *
 * @version 1.0.0
 * @created 26.08.2025
 */

class ErrorClassificationEngine {
  constructor() {
    this.classificationRules = this.initializeClassificationRules();
    this.heysSpecificRules = this.initializeHeysRules();
    this.severityMatrix = this.initializeSeverityMatrix();
    this.learningData = new Map(); // Для обучения на паттернах
    this.init();
  }

  init() {
    this.loadLearningData();
  }

  /**
   * 📚 Инициализация правил классификации
   */
  initializeClassificationRules() {
    return {
      // Ошибки модулей и зависимостей
      moduleErrors: {
        patterns: [
          /is not defined/i,
          /Cannot read propert(y|ies) of undefined/i,
          /Cannot access.*before initialization/i,
          /ReferenceError/i,
        ],
        severity: 'high',
        category: 'module',
        tags: ['dependency', 'initialization'],
      },

      // Ошибки типов данных
      typeErrors: {
        patterns: [
          /TypeError/i,
          /Cannot read propert(y|ies) of null/i,
          /is not a function/i,
          /Cannot convert.*to.*type/i,
        ],
        severity: 'medium',
        category: 'type',
        tags: ['data', 'validation'],
      },

      // Синтаксические ошибки
      syntaxErrors: {
        patterns: [
          /SyntaxError/i,
          /Unexpected token/i,
          /Invalid or unexpected token/i,
          /Unexpected end of input/i,
        ],
        severity: 'critical',
        category: 'syntax',
        tags: ['code', 'parsing'],
      },

      // Сетевые ошибки
      networkErrors: {
        patterns: [
          /Failed to fetch/i,
          /NetworkError/i,
          /ERR_NETWORK/i,
          /fetch.*error/i,
          /CORS.*error/i,
        ],
        severity: 'medium',
        category: 'network',
        tags: ['connectivity', 'api'],
      },

      // Ошибки производительности
      performanceErrors: {
        patterns: [
          /Maximum call stack size exceeded/i,
          /Script.*timeout/i,
          /Memory.*exceeded/i,
          /Too much recursion/i,
        ],
        severity: 'high',
        category: 'performance',
        tags: ['memory', 'recursion', 'timeout'],
      },

      // Ошибки разрешений и безопасности
      securityErrors: {
        patterns: [
          /Permission denied/i,
          /Access.*denied/i,
          /Blocked.*security/i,
          /Content Security Policy/i,
        ],
        severity: 'high',
        category: 'security',
        tags: ['permissions', 'csp', 'access'],
      },
    };
  }

  /**
   * 🏠 Инициализация HEYS-специфичных правил
   */
  initializeHeysRules() {
    return {
      // Ошибки ядра HEYS
      heysCore: {
        patterns: [/HEYS\.core/i, /heys_core.*undefined/i, /namespace.*not.*initialized/i],
        severity: 'critical',
        category: 'heys-core',
        tags: ['initialization', 'namespace'],
        suggestions: [
          'Проверьте загрузку heys_core_v12.js',
          'Убедитесь что HEYS namespace инициализирован',
          'Проверьте порядок загрузки модулей',
        ],
      },

      // Ошибки хранилища
      heysStorage: {
        patterns: [
          /HEYS\.storage/i,
          /supabase.*not.*defined/i,
          /storage.*connection/i,
          /heys_storage.*error/i,
        ],
        severity: 'high',
        category: 'heys-storage',
        tags: ['database', 'supabase', 'connection'],
        suggestions: [
          'Проверьте соединение с Supabase',
          'Убедитесь что ключи API настроены',
          'Проверьте статус сервиса Supabase',
        ],
      },

      // Ошибки пользовательской системы
      heysUser: {
        patterns: [
          /HEYS\.user/i,
          /user.*not.*authenticated/i,
          /session.*expired/i,
          /heys_user.*error/i,
        ],
        severity: 'medium',
        category: 'heys-user',
        tags: ['authentication', 'session', 'user'],
        suggestions: [
          'Проверьте статус аутентификации',
          'Обновите сессию пользователя',
          'Проверьте токены доступа',
        ],
      },

      // Ошибки диагностической системы
      heysDiagnostics: {
        patterns: [/diagnostic.*error/i, /test.*failed/i, /super-diagnostic/i, /test-.*\.html/i],
        severity: 'low',
        category: 'heys-diagnostics',
        tags: ['testing', 'diagnostics'],
        suggestions: [
          'Запустите полную диагностику системы',
          'Проверьте логи в консоли',
          'Используйте отладочный режим',
        ],
      },

      // Ошибки отчетной системы
      heysReports: {
        patterns: [
          /HEYS\.reports/i,
          /export.*failed/i,
          /report.*generation/i,
          /heys_reports.*error/i,
        ],
        severity: 'low',
        category: 'heys-reports',
        tags: ['reporting', 'export'],
        suggestions: [
          'Проверьте права доступа к файлам',
          'Убедитесь что все данные загружены',
          'Попробуйте другой формат экспорта',
        ],
      },
    };
  }

  /**
   * ⚖️ Инициализация матрицы критичности
   */
  initializeSeverityMatrix() {
    return {
      critical: {
        weight: 4,
        description: 'Критическая ошибка - система не функционирует',
        color: '#dc2626',
        priority: 1,
        actionRequired: 'immediate',
      },
      high: {
        weight: 3,
        description: 'Серьезная ошибка - ограничена функциональность',
        color: '#ea580c',
        priority: 2,
        actionRequired: 'urgent',
      },
      medium: {
        weight: 2,
        description: 'Умеренная ошибка - возможны проблемы',
        color: '#ca8a04',
        priority: 3,
        actionRequired: 'planned',
      },
      low: {
        weight: 1,
        description: 'Незначительная ошибка - минимальное влияние',
        color: '#16a34a',
        priority: 4,
        actionRequired: 'optional',
      },
    };
  }

  /**
   * 🔍 Основной метод классификации
   */
  classify(logEntry) {
    try {
      const classification = {
        type: 'unknown',
        category: 'general',
        severity: 'medium',
        confidence: 0.0,
        tags: [],
        heysSpecific: false,
        patterns: [],
        timestamp: Date.now(),
      };

      // Анализ сообщения и стека
      const text = this.extractTextForAnalysis(logEntry);

      // Применяем HEYS-специфичные правила первыми
      const heysClassification = this.applyHeysRules(text, logEntry);
      if (heysClassification.confidence > 0.7) {
        return { ...classification, ...heysClassification };
      }

      // Применяем общие правила классификации
      const generalClassification = this.applyGeneralRules(text, logEntry);

      // Комбинируем результаты
      const finalClassification = this.combineClassifications(
        classification,
        heysClassification,
        generalClassification
      );

      // Обучение на основе результата
      this.updateLearningData(text, finalClassification);

      return finalClassification;
    } catch (error) {
      return {
        type: 'classification-error',
        category: 'system',
        severity: 'low',
        confidence: 0.0,
        error: error.message,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * 📝 Извлечение текста для анализа
   */
  extractTextForAnalysis(logEntry) {
    const parts = [];

    if (logEntry.title) parts.push(logEntry.title);
    if (logEntry.details?.message) parts.push(logEntry.details.message);
    if (logEntry.stackTrace) parts.push(logEntry.stackTrace);
    if (logEntry.details?.error?.message) parts.push(logEntry.details.error.message);

    return parts.join(' ').toLowerCase();
  }

  /**
   * 🏠 Применение HEYS-специфичных правил
   */
  applyHeysRules(text, logEntry) {
    let bestMatch = {
      confidence: 0.0,
      type: 'unknown',
      category: 'general',
      severity: 'medium',
      heysSpecific: false,
      suggestions: [],
    };

    for (const [ruleName, rule] of Object.entries(this.heysSpecificRules)) {
      const confidence = this.calculateRuleConfidence(rule.patterns, text);

      if (confidence > bestMatch.confidence) {
        bestMatch = {
          confidence: confidence,
          type: ruleName,
          category: rule.category,
          severity: rule.severity,
          heysSpecific: true,
          tags: rule.tags || [],
          suggestions: rule.suggestions || [],
          patterns: rule.patterns.filter(p => p.test(text)),
        };
      }
    }

    return bestMatch;
  }

  /**
   * 🔧 Применение общих правил классификации
   */
  applyGeneralRules(text, logEntry) {
    let bestMatch = {
      confidence: 0.0,
      type: 'unknown',
      category: 'general',
      severity: 'medium',
      heysSpecific: false,
    };

    for (const [ruleName, rule] of Object.entries(this.classificationRules)) {
      const confidence = this.calculateRuleConfidence(rule.patterns, text);

      if (confidence > bestMatch.confidence) {
        bestMatch = {
          confidence: confidence,
          type: ruleName,
          category: rule.category,
          severity: rule.severity,
          heysSpecific: false,
          tags: rule.tags || [],
          patterns: rule.patterns.filter(p => p.test(text)),
        };
      }
    }

    return bestMatch;
  }

  /**
   * 📊 Вычисление уверенности правила
   */
  calculateRuleConfidence(patterns, text) {
    let matchCount = 0;
    let totalWeight = 0;

    for (const pattern of patterns) {
      totalWeight++;
      if (pattern.test(text)) {
        matchCount++;
      }
    }

    const baseConfidence = matchCount / patterns.length;

    // Бонус за множественные совпадения
    const multiMatchBonus = matchCount > 1 ? 0.1 : 0;

    // Бонус за точность совпадения (длина совпавшего текста)
    const precisionBonus = this.calculatePrecisionBonus(patterns, text);

    return Math.min(baseConfidence + multiMatchBonus + precisionBonus, 1.0);
  }

  /**
   * 🎯 Вычисление бонуса за точность
   */
  calculatePrecisionBonus(patterns, text) {
    let maxMatchLength = 0;

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[0]) {
        maxMatchLength = Math.max(maxMatchLength, match[0].length);
      }
    }

    // Чем длиннее совпадение, тем выше бонус (до 0.2)
    return Math.min(maxMatchLength / 100, 0.2);
  }

  /**
   * 🔄 Комбинирование результатов классификации
   */
  combineClassifications(base, heysResult, generalResult) {
    // HEYS-специфичные результаты имеют приоритет
    if (heysResult.confidence > 0.7) {
      return { ...base, ...heysResult };
    }

    // Иначе используем лучший из результатов
    const bestResult =
      heysResult.confidence > generalResult.confidence ? heysResult : generalResult;

    return { ...base, ...bestResult };
  }

  /**
   * 💡 Генерация рекомендаций
   */
  getSuggestions(logEntry) {
    const classification = logEntry.classification || this.classify(logEntry);
    const suggestions = [];

    // Специфичные рекомендации из классификации
    if (classification.suggestions) {
      suggestions.push(
        ...classification.suggestions.map(s => ({
          type: 'specific',
          priority: 'high',
          message: s,
          source: 'classification',
        }))
      );
    }

    // Общие рекомендации по категории
    const categoryGeneral = this.getCategorySuggestions(classification.category);
    suggestions.push(...categoryGeneral);

    // Рекомендации по критичности
    const severitySuggestions = this.getSeveritySuggestions(classification.severity);
    suggestions.push(...severitySuggestions);

    // HEYS-специфичные рекомендации
    if (classification.heysSpecific) {
      const heysSuggestions = this.getHeysSuggestions(logEntry);
      suggestions.push(...heysSuggestions);
    }

    return this.prioritizeAndDeduplicateSuggestions(suggestions);
  }

  /**
   * 📂 Рекомендации по категории
   */
  getCategorySuggestions(category) {
    const suggestions = {
      module: [
        { type: 'check', priority: 'high', message: 'Проверьте загрузку всех зависимостей' },
        {
          type: 'order',
          priority: 'medium',
          message: 'Убедитесь в правильном порядке загрузки модулей',
        },
      ],
      type: [
        { type: 'validate', priority: 'high', message: 'Добавьте проверки типов данных' },
        {
          type: 'guard',
          priority: 'medium',
          message: 'Используйте защитные конструкции (if, try-catch)',
        },
      ],
      network: [
        { type: 'connection', priority: 'high', message: 'Проверьте сетевое соединение' },
        { type: 'retry', priority: 'medium', message: 'Добавьте механизм повторных попыток' },
      ],
      performance: [
        {
          type: 'optimize',
          priority: 'high',
          message: 'Оптимизируйте алгоритм или структуру данных',
        },
        { type: 'monitor', priority: 'medium', message: 'Добавьте мониторинг производительности' },
      ],
    };

    return suggestions[category] || [];
  }

  /**
   * ⚖️ Рекомендации по критичности
   */
  getSeveritySuggestions(severity) {
    const suggestions = {
      critical: [
        { type: 'immediate', priority: 'critical', message: 'Требуется немедленное исправление' },
      ],
      high: [
        { type: 'urgent', priority: 'high', message: 'Запланируйте исправление в ближайшее время' },
      ],
      medium: [
        { type: 'planned', priority: 'medium', message: 'Включите в план следующего релиза' },
      ],
      low: [{ type: 'optional', priority: 'low', message: 'Рассмотрите при рефакторинге' }],
    };

    return suggestions[severity] || [];
  }

  /**
   * 🏠 HEYS-специфичные рекомендации
   */
  getHeysSuggestions(logEntry) {
    return [
      {
        type: 'diagnostic',
        priority: 'medium',
        message: 'Запустите диагностику HEYS системы',
        action: 'Используйте super-diagnostic-center.html для проверки',
      },
      {
        type: 'logs',
        priority: 'low',
        message: 'Проверьте системные логи HEYS',
        action: 'Откройте консоль разработчика для детального анализа',
      },
    ];
  }

  /**
   * 🔄 Приоритизация и удаление дубликатов
   */
  prioritizeAndDeduplicateSuggestions(suggestions) {
    // Удаление дубликатов по message
    const unique = suggestions.filter(
      (suggestion, index, array) => array.findIndex(s => s.message === suggestion.message) === index
    );

    // Сортировка по приоритету
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };

    return unique
      .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])
      .slice(0, 10); // Максимум 10 рекомендаций
  }

  /**
   * 🧠 Обновление данных для обучения
   */
  updateLearningData(text, classification) {
    const key = classification.type;

    if (!this.learningData.has(key)) {
      this.learningData.set(key, {
        count: 0,
        examples: [],
        avgConfidence: 0,
      });
    }

    const data = this.learningData.get(key);
    data.count++;
    data.avgConfidence =
      (data.avgConfidence * (data.count - 1) + classification.confidence) / data.count;

    // Сохраняем только лучшие примеры
    if (data.examples.length < 5 || classification.confidence > 0.8) {
      data.examples.push({
        text: text.substring(0, 200), // Ограничиваем длину
        confidence: classification.confidence,
        timestamp: Date.now(),
      });

      // Оставляем только 5 лучших примеров
      data.examples = data.examples.sort((a, b) => b.confidence - a.confidence).slice(0, 5);
    }
  }

  /**
   * 💾 Загрузка данных обучения
   */
  loadLearningData() {
    try {
      const stored = localStorage.getItem('heys_error_classification_learning');
      if (stored) {
        const data = JSON.parse(stored);
        this.learningData = new Map(Object.entries(data));
      }
    } catch (error) {
      console.warn('Failed to load learning data:', error);
    }
  }

  /**
   * 💾 Сохранение данных обучения
   */
  saveLearningData() {
    try {
      const data = Object.fromEntries(this.learningData);
      localStorage.setItem('heys_error_classification_learning', JSON.stringify(data));
    } catch (error) {
      console.warn('Failed to save learning data:', error);
    }
  }

  /**
   * 📊 Получение статистики классификации
   */
  getClassificationStats() {
    const stats = {
      totalClassified: 0,
      byType: {},
      byCategory: {},
      bySeverity: {},
      avgConfidence: 0,
      heysSpecificRatio: 0,
    };

    let totalConfidence = 0;
    let heysSpecificCount = 0;

    for (const [type, data] of this.learningData.entries()) {
      stats.totalClassified += data.count;
      stats.byType[type] = data.count;
      totalConfidence += data.avgConfidence * data.count;

      // Определяем если это HEYS-специфичный тип
      if (type.startsWith('heys')) {
        heysSpecificCount += data.count;
      }
    }

    if (stats.totalClassified > 0) {
      stats.avgConfidence = totalConfidence / stats.totalClassified;
      stats.heysSpecificRatio = heysSpecificCount / stats.totalClassified;
    }

    return stats;
  }

  /**
   * 🔧 Настройка правил классификации
   */
  addCustomRule(name, rule) {
    this.classificationRules[name] = rule;
  }

  /**
   * 🗑️ Очистка данных обучения
   */
  clearLearningData() {
    this.learningData.clear();
    localStorage.removeItem('heys_error_classification_learning');
  }
}

// Создание глобального экземпляра
if (typeof window !== 'undefined') {
  window.ErrorClassificationEngine = ErrorClassificationEngine;
}

// Экспорт для модульных систем
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ErrorClassificationEngine;
}
