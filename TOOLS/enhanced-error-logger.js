/**
 * 🔧 ENHANCED ERROR LOGGER
 * Система детального логирования ошибок диагностических тестов
 *
 * Возможности:
 * - Многоуровневое логирование с автоматической классификацией
 * - Точная локализация ошибок до строки кода
 * - Real-time мониторинг и анализ
 * - Интеграция с существующей системой HEYS
 *
 * @version 1.0.0
 * @created 26.08.2025
 */

class EnhancedErrorLogger {
  constructor() {
    this.logs = [];
    this.errorClassifier = null;
    this.stackAnalyzer = null;
    this.isActive = true;
    this.sessionId = this.generateSessionId();
    this.startTime = Date.now();

    // Настройки логирования
    this.config = {
      maxLogs: 1000,
      logLevels: ['error', 'warning', 'info', 'debug'],
      autoClassify: true,
      realTimeUpdates: true,
      detailedStackTrace: true,
      performanceTracking: true,
    };

    // Инициализация
    this.init();
  }

  init() {
    this.setupConsoleInterceptor();
    this.setupErrorHandlers();
    this.setupPerformanceMonitoring();
    this.initializeComponents();
    this.logInfo('Enhanced Error Logger initialized', {
      sessionId: this.sessionId,
      config: this.config,
    });
  }

  /**
   * 🔧 Инициализация компонентов системы
   */
  initializeComponents() {
    // Инициализация анализатора стека
    if (window.StackTraceAnalyzer) {
      this.stackAnalyzer = new window.StackTraceAnalyzer();
    }

    // Инициализация классификатора ошибок
    if (window.ErrorClassificationEngine) {
      this.errorClassifier = new window.ErrorClassificationEngine();
    }

    // Интеграция с существующим HEYS трекером
    this.integrateWithHeysTracker();
  }

  /**
   * 🏠 Интеграция с существующим HEYS error tracker
   */
  integrateWithHeysTracker() {
    if (window.HEYS && window.HEYS.advancedErrorTracker) {
      const heysTracker = window.HEYS.advancedErrorTracker;

      // Добавляем наш логгер как обработчик в HEYS
      if (heysTracker.addErrorHandler) {
        heysTracker.addErrorHandler((error, context) => {
          this.logError('HEYS Error Tracker', {
            error: error,
            context: context,
            source: 'heys_advanced_error_tracker',
            timestamp: Date.now(),
          });
        });
      }
    }
  }

  /**
   * 🔍 Настройка перехвата консольных сообщений
   */
  setupConsoleInterceptor() {
    const originalConsole = {
      error: console.error,
      warn: console.warn,
      log: console.log,
      info: console.info,
    };

    // Перехват console.error
    console.error = (...args) => {
      originalConsole.error.apply(console, args);
      this.logError('Console Error', {
        message: args.join(' '),
        source: 'console.error',
        stackTrace: this.getStackTrace(),
        timestamp: Date.now(),
      });
    };

    // Перехват console.warn
    console.warn = (...args) => {
      originalConsole.warn.apply(console, args);
      this.logWarning('Console Warning', {
        message: args.join(' '),
        source: 'console.warn',
        stackTrace: this.getStackTrace(),
        timestamp: Date.now(),
      });
    };

    // Сохраняем оригинальные методы для внутреннего использования
    this.originalConsole = originalConsole;
  }

  /**
   * ⚠️ Настройка глобальных обработчиков ошибок
   */
  setupErrorHandlers() {
    // Глобальный обработчик JavaScript ошибок
    window.addEventListener('error', (event) => {
      this.logError('JavaScript Error', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error,
        stackTrace: event.error ? event.error.stack : null,
        timestamp: Date.now(),
        type: 'javascript',
      });
    });

    // Обработчик unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.logError('Unhandled Promise Rejection', {
        reason: event.reason,
        promise: event.promise,
        stackTrace: event.reason ? event.reason.stack : null,
        timestamp: Date.now(),
        type: 'promise',
      });
    });
  }

  /**
   * 📊 Настройка мониторинга производительности
   */
  setupPerformanceMonitoring() {
    if (!this.config.performanceTracking) return;

    // Мониторинг времени выполнения функций
    this.performanceMarkers = new Map();

    // Observer для мониторинга DOM изменений
    if (typeof MutationObserver !== 'undefined') {
      this.domObserver = new MutationObserver((mutations) => {
        if (mutations.length > 100) {
          this.logWarning('High DOM Mutation Activity', {
            mutationsCount: mutations.length,
            timestamp: Date.now(),
            type: 'performance',
          });
        }
      });
    }
  }

  /**
   * 🔍 Получение детального stack trace
   */
  getStackTrace() {
    try {
      throw new Error();
    } catch (e) {
      return e.stack;
    }
  }

  /**
   * 🏷️ Генерация уникального ID сессии
   */
  generateSessionId() {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * 🔧 Основные методы логирования
   */
  logError(title, details = {}) {
    return this.log('error', title, details);
  }

  logWarning(title, details = {}) {
    return this.log('warning', title, details);
  }

  logInfo(title, details = {}) {
    return this.log('info', title, details);
  }

  logDebug(title, details = {}) {
    return this.log('debug', title, details);
  }

  /**
   * 📝 Центральный метод логирования
   */
  log(level, title, details = {}) {
    if (!this.isActive || !this.config.logLevels.includes(level)) {
      return;
    }

    const logEntry = {
      id: this.generateLogId(),
      sessionId: this.sessionId,
      timestamp: Date.now(),
      level: level,
      title: title,
      details: details,
      stackTrace: details.stackTrace || this.getStackTrace(),
      classification: null,
      suggestions: [],
    };

    // Автоматическая классификация
    if (this.config.autoClassify && this.errorClassifier) {
      logEntry.classification = this.errorClassifier.classify(logEntry);
      logEntry.suggestions = this.errorClassifier.getSuggestions(logEntry);
    }

    // Анализ stack trace
    if (this.config.detailedStackTrace && this.stackAnalyzer) {
      logEntry.stackAnalysis = this.stackAnalyzer.analyze(logEntry.stackTrace);
    }

    // Добавление в коллекцию
    this.logs.push(logEntry);

    // Отладочное логирование
    this.originalConsole.log(
      `📝 EnhancedErrorLogger: Added log entry [${level}] "${title}" (total: ${this.logs.length})`,
    );

    // Управление размером коллекции
    if (this.logs.length > this.config.maxLogs) {
      this.logs = this.logs.slice(-this.config.maxLogs);
    }

    // Real-time обновления
    if (this.config.realTimeUpdates) {
      this.notifyListeners(logEntry);
    }

    // Внутреннее логирование для debugging
    this.originalConsole.log(`[${level.toUpperCase()}] ${title}`, logEntry);

    return logEntry;
  }

  /**
   * 🆔 Генерация уникального ID для лога
   */
  generateLogId() {
    return 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
  }

  /**
   * 📡 Уведомление слушателей о новых логах
   */
  notifyListeners(logEntry) {
    if (this.listeners) {
      this.listeners.forEach((listener) => {
        try {
          listener(logEntry);
        } catch (e) {
          this.originalConsole.error('Error in log listener:', e);
        }
      });
    }

    // Отправка в custom event
    window.dispatchEvent(
      new CustomEvent('enhancedLogEntry', {
        detail: logEntry,
      }),
    );
  }

  /**
   * 👂 Управление слушателями
   */
  addListener(callback) {
    if (!this.listeners) {
      this.listeners = [];
    }
    this.listeners.push(callback);
  }

  removeListener(callback) {
    if (this.listeners) {
      this.listeners = this.listeners.filter((l) => l !== callback);
    }
  }

  /**
   * 📊 Получение статистики
   */
  getStats() {
    const stats = {
      total: this.logs.length,
      byLevel: {},
      byType: {},
      sessionDuration: Date.now() - this.startTime,
      sessionId: this.sessionId,
    };

    this.config.logLevels.forEach((level) => {
      stats.byLevel[level] = this.logs.filter((log) => log.level === level).length;
    });

    // Группировка по типам классификации
    this.logs.forEach((log) => {
      if (log.classification && log.classification.type) {
        stats.byType[log.classification.type] = (stats.byType[log.classification.type] || 0) + 1;
      }
    });

    return stats;
  }

  /**
   * 🔍 Фильтрация логов
   */
  getLogs(filter = {}) {
    let filteredLogs = [...this.logs];

    // Отладочная информация
    const debugInfo = {
      originalCount: this.logs.length,
      filter: filter,
      hasLevelFilter: !!filter.level,
      hasSinceFilter: !!filter.since,
      hasSearchFilter: !!filter.searchText,
      hasClassificationFilter: !!filter.classification,
    };

    if (filter.level) {
      filteredLogs = filteredLogs.filter((log) => log.level === filter.level);
      debugInfo.afterLevelFilter = filteredLogs.length;
    }

    if (filter.since) {
      filteredLogs = filteredLogs.filter((log) => log.timestamp >= filter.since);
      debugInfo.afterSinceFilter = filteredLogs.length;
    }

    if (filter.searchText) {
      const searchText = filter.searchText.toLowerCase();
      filteredLogs = filteredLogs.filter(
        (log) =>
          log.title.toLowerCase().includes(searchText) ||
          JSON.stringify(log.details).toLowerCase().includes(searchText),
      );
      debugInfo.afterSearchFilter = filteredLogs.length;
    }

    if (filter.classification) {
      filteredLogs = filteredLogs.filter(
        (log) => log.classification && log.classification.type === filter.classification,
      );
      debugInfo.afterClassificationFilter = filteredLogs.length;
    }

    debugInfo.finalCount = filteredLogs.length;

    // Логируем если есть проблемы
    if (this.logs.length > 0 && filteredLogs.length === 0 && Object.keys(filter).length > 0) {
      this.originalConsole.warn(
        '⚠️ Enhanced Error Logger: getLogs() returned empty array despite having logs',
        debugInfo,
      );
    }

    return filteredLogs;
  }

  /**
   * 📤 Экспорт логов
   */
  exportLogs(format = 'json') {
    const exportData = {
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      exportTime: Date.now(),
      stats: this.getStats(),
      logs: this.logs,
      config: this.config,
      debugInfo: {
        logsArrayLength: this.logs.length,
        isActive: this.isActive,
        startTime: this.startTime,
        sessionDuration: Date.now() - this.startTime,
      },
    };

    // Логируем информацию об экспорте для отладки
    this.originalConsole.log('📤 Enhanced Error Logger Export:', {
      totalLogs: this.logs.length,
      sessionId: this.sessionId,
      isActive: this.isActive,
    });

    switch (format) {
      case 'json':
        return JSON.stringify(exportData, null, 2);
      case 'csv':
        return this.convertToCSV(this.logs);
      default:
        return exportData;
    }
  }

  /**
   * 📊 Конвертация в CSV
   */
  convertToCSV(logs) {
    const headers = ['timestamp', 'level', 'title', 'message', 'type', 'filename', 'line'];
    const rows = logs.map((log) => [
      new Date(log.timestamp).toISOString(),
      log.level,
      log.title,
      log.details.message || '',
      log.classification?.type || '',
      log.details.filename || '',
      log.details.lineno || '',
    ]);

    return [headers, ...rows].map((row) => row.join(',')).join('\n');
  }

  /**
   * 🧹 Очистка логов
   */
  clearLogs() {
    this.logs = [];
    this.logInfo('Logs cleared', { clearedAt: Date.now() });
  }

  /**
   * ⚙️ Настройка конфигурации
   */
  setConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    this.logInfo('Configuration updated', { newConfig });
  }

  /**
   * 🔄 Перезапуск логгера
   */
  restart() {
    this.sessionId = this.generateSessionId();
    this.startTime = Date.now();
    this.clearLogs();
    this.logInfo('Enhanced Error Logger restarted', { sessionId: this.sessionId });
  }

  /**
   * 🛑 Остановка логгера
   */
  stop() {
    this.isActive = false;
    if (this.domObserver) {
      this.domObserver.disconnect();
    }
    this.logInfo('Enhanced Error Logger stopped');
  }

  /**
   * ▶️ Запуск логгера
   */
  start() {
    this.isActive = true;
    this.logInfo('Enhanced Error Logger started');
  }
}

// Создание глобального экземпляра
if (typeof window !== 'undefined') {
  window.EnhancedErrorLogger = EnhancedErrorLogger;

  // Автоматическая инициализация если нет других указаний
  if (!window.HEYS_ENHANCED_LOGGER_NO_AUTO_INIT) {
    window.enhancedLogger = new EnhancedErrorLogger();
  }

  // Глобальная функция диагностики
  window.diagnosticEnhancedLogger = function () {
    console.log('🔍 ДИАГНОСТИКА ENHANCED ERROR LOGGER');
    console.log('===================================');

    const logger = window.enhancedLogger;
    if (!logger) {
      console.log('❌ Логгер не найден');
      return;
    }

    console.log(`📍 Session ID: ${logger.sessionId}`);
    console.log(`⚡ Is Active: ${logger.isActive}`);
    console.log(`📊 Logs Array Length: ${logger.logs?.length || 0}`);
    console.log(`📈 Stats:`, logger.getStats());

    // Тест getLogs
    const allLogs = logger.getLogs();
    const emptyFilter = logger.getLogs({});

    console.log(`📋 getLogs(): ${allLogs.length} логов`);
    console.log(`📋 getLogs({}): ${emptyFilter.length} логов`);

    if (logger.logs.length > 0) {
      console.log('📝 Первые 3 лога:');
      logger.logs.slice(0, 3).forEach((log, i) => {
        console.log(`  ${i + 1}. [${log.level}] ${log.title}`);
      });
    }

    return {
      logger: logger,
      logsCount: logger.logs?.length || 0,
      getLogsCount: allLogs.length,
      stats: logger.getStats(),
    };
  };
}

// Экспорт для модульных систем
if (typeof module !== 'undefined' && module.exports) {
  module.exports = EnhancedErrorLogger;
}
