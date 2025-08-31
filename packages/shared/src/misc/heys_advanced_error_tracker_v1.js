/*
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ 🗺️ НАВИГАЦИОННАЯ КАРТА ФАЙЛА heys_advanced_error_tracker_v1.js (415 строк)              │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ 📋 СТРУКТУРА ФАЙЛА:                                                                       │
│                                                                                           │
│ 🔧 КОНФИГУРАЦИЯ И ИНИЦИАЛИЗАЦИЯ (строки 1-80):                                           │
│    ├── Namespace инициализация (6)                                                      │
│    ├── CONFIG объект (8-18)                                                             │
│    ├── errorStorage хранилище (20-27)                                                   │
│    ├── userContext контекст (29-37)                                                     │
│    ├── generateSessionId() (39-42)                                                      │
│    └── formatTimestamp() (44-48)                                                        │
│                                                                                           │
│ 🛠️ ОСНОВНЫЕ УТИЛИТЫ (строки 81-150):                                                    │
│    ├── getStackTrace() - стек вызовов (50-70)                                           │
│    ├── sanitizeError() - очистка ошибок (71-90)                                         │
│    ├── classifyError() - классификация (91-110)                                         │
│    ├── extractErrorInfo() - извлечение информации (111-130)                             │
│    └── addUserAction() - действия пользователя (131-150)                                │
│                                                                                           │
│ 📊 СИСТЕМА ОТСЛЕЖИВАНИЯ (строки 151-280):                                                │
│    ├── trackJSError() - JS ошибки (151-180)                                             │
│    ├── trackNetworkError() - сетевые ошибки (181-210)                                   │
│    ├── trackConsoleError() - консольные ошибки (211-240)                                │
│    ├── trackPerformanceIssue() - производительность (241-270)                          │
│    └── logError() - основное логирование (271-280)                                      │
│                                                                                           │
│ 📈 АНАЛИТИКА И ОТЧЕТЫ (строки 281-350):                                                  │
│    ├── generateErrorReport() - генерация отчетов (281-310)                              │
│    ├── getErrorStats() - статистика ошибок (311-330)                                    │
│    ├── findSimilarErrors() - поиск похожих (331-340)                                    │
│    └── exportErrorData() - экспорт данных (341-350)                                     │
│                                                                                           │
│ 🔄 УПРАВЛЕНИЕ ДАННЫМИ (строки 351-400):                                                  │
│    ├── saveToStorage() - сохранение в localStorage (351-370)                            │
│    ├── loadFromStorage() - загрузка из localStorage (371-380)                           │
│    ├── clearOldErrors() - очистка старых ошибок (381-390)                               │
│    └── resetErrorTracker() - сброс трекера (391-400)                                    │
│                                                                                           │
│ 🔗 ЭКСПОРТ И ИНИЦИАЛИЗАЦИЯ (строки 401-415):                                             │
│    ├── HEYS.ErrorTracker экспорт (401-410)                                              │
│    ├── Автоматическая инициализация (411-413)                                           │
│    └── Window error handlers (414-415)                                                  │
│                                                                                           │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ 🎯 БЫСТРЫЙ ПОИСК:                                                                        │
│    • Конфигурация: CONFIG (8), userContext (29)                                        │
│    • Трекинг: trackJSError() (151), trackNetworkError() (181)                          │
│    • Утилиты: getStackTrace() (50), sanitizeError() (71)                               │
│    • Отчеты: generateErrorReport() (281), getErrorStats() (311)                        │
└─────────────────────────────────────────────────────────────────────────────────────────┘
*/

// heys_advanced_error_tracker_v1.js - Продвинутая система отслеживания ошибок
;(function(global) {
  'use strict';

  // Инициализация HEYS namespace
  global.HEYS = global.HEYS || {};

  // Конфигурация системы отслеживания ошибок
  const CONFIG = {
    maxErrorsInMemory: 100,
    maxErrorsInStorage: 500,
    errorRetentionDays: 7,
    autoReport: true,
    logLevel: 'info', // debug, info, warn, error
    enableStackTrace: true,
    enableUserContext: true,
    enablePerformanceMetrics: true
  };

  // Хранилище ошибок
  let errorStorage = {
    jsErrors: [],
    networkErrors: [],
    consoleErrors: [],
    userActions: [],
    performanceIssues: []
  };

  // Контекст пользователя для отладки
  let userContext = {
    sessionId: generateSessionId(),
    userAgent: navigator.userAgent,
    startTime: Date.now(),
    pageLoadTime: null,
    lastActions: [],
    currentPage: window.location.href
  };

  // Генерация уникального ID сессии
  function generateSessionId() {
    return 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  // Форматирование временной метки
  function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('ru-RU') + '.' + date.getMilliseconds().toString().padStart(3, '0');
  }

  // Получение стека вызовов
  function getStackTrace() {
    if (!CONFIG.enableStackTrace) return null;
    
    try {
      throw new Error('Stack trace');
    } catch (e) {
      return e.stack ? e.stack.split('\n').slice(2, 10).join('\n') : null;
    }
  }

  // Определение критичности ошибки
  function getErrorSeverity(error, context = {}) {
    const message = error.message || error.toString();
    
    // Критические ошибки
    if (message.includes('Uncaught') || 
        message.includes('TypeError') ||
        message.includes('ReferenceError') ||
        context.type === 'unhandledrejection') {
      return 'critical';
    }
    
    // Сетевые ошибки
    if (context.type === 'network' || message.includes('fetch')) {
      return 'high';
    }
    
    // Предупреждения
    if (context.type === 'warning' || message.includes('warn')) {
      return 'medium';
    }
    
    return 'low';
  }

  // Расширенное логирование ошибок
  function logAdvancedError(error, context = {}) {
    const timestamp = Date.now();
    const severity = getErrorSeverity(error, context);
    
    const errorReport = {
      id: generateErrorId(),
      timestamp: timestamp,
      formattedTime: formatTimestamp(timestamp),
      severity: severity,
      type: context.type || 'javascript',
      message: error.message || error.toString(),
      stack: error.stack || getStackTrace(),
      url: context.url || window.location.href,
      line: context.line || null,
      column: context.column || null,
      userAgent: navigator.userAgent,
      sessionId: userContext.sessionId,
      userContext: CONFIG.enableUserContext ? {
        lastActions: [...userContext.lastActions].slice(-5),
        currentPage: userContext.currentPage,
        sessionDuration: timestamp - userContext.startTime
      } : null,
      additionalData: context.additionalData || {}
    };

    // Добавляем в соответствующее хранилище
    const storageKey = getStorageKey(context.type || 'javascript');
    if (errorStorage[storageKey]) {
      errorStorage[storageKey].push(errorReport);
      
      // Ограничиваем размер хранилища
      if (errorStorage[storageKey].length > CONFIG.maxErrorsInMemory) {
        errorStorage[storageKey].shift();
      }
    }

    // Консольный вывод с цветовой кодировкой
    logToConsole(errorReport);

    // Сохраняем в localStorage для постоянного хранения
    saveErrorToStorage(errorReport);

    // Автоматическая отправка критических ошибок
    if (CONFIG.autoReport && severity === 'critical') {
      reportErrorAutomatically(errorReport);
    }

    return errorReport;
  }

  // Генерация ID ошибки
  function generateErrorId() {
    return 'err_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
  }

  // Определение ключа хранилища по типу ошибки
  function getStorageKey(type) {
    const mapping = {
      'javascript': 'jsErrors',
      'network': 'networkErrors',
      'console': 'consoleErrors',
      'performance': 'performanceIssues'
    };
    return mapping[type] || 'jsErrors';
  }

  // Цветной вывод в консоль
  function logToConsole(errorReport) {
    const colors = {
      critical: 'color: #ff4757; font-weight: bold;',
      high: 'color: #ff6b35; font-weight: bold;',
      medium: 'color: #f39c12;',
      low: 'color: #7f8c8d;'
    };

    const style = colors[errorReport.severity] || colors.low;
    
    console.group(`%c🚨 [${errorReport.severity.toUpperCase()}] ${errorReport.formattedTime}`, style);
    console.log('📝 Сообщение:', errorReport.message);
    console.log('🔗 URL:', errorReport.url);
    if (errorReport.line) console.log('📍 Позиция:', `${errorReport.line}:${errorReport.column}`);
    if (errorReport.stack) console.log('📚 Стек:', errorReport.stack);
    if (errorReport.userContext) console.log('👤 Контекст:', errorReport.userContext);
    console.log('🆔 ID:', errorReport.id);
    console.groupEnd();
  }

  // Сохранение ошибки в localStorage
  function saveErrorToStorage(errorReport) {
    try {
      const storageKey = 'heys_error_reports';
      const existingErrors = JSON.parse(localStorage.getItem(storageKey) || '[]');
      
      // Добавляем новую ошибку
      existingErrors.push({
        ...errorReport,
        // Удаляем объемные данные для экономии места
        stack: errorReport.stack ? errorReport.stack.slice(0, 500) : null
      });

      // Очищаем старые ошибки
      const cutoffTime = Date.now() - (CONFIG.errorRetentionDays * 24 * 60 * 60 * 1000);
      const filteredErrors = existingErrors.filter(err => err.timestamp > cutoffTime);

      // Ограничиваем количество
      const finalErrors = filteredErrors.slice(-CONFIG.maxErrorsInStorage);

      localStorage.setItem(storageKey, JSON.stringify(finalErrors));
    } catch (e) {
      console.warn('Не удалось сохранить ошибку в localStorage:', e);
    }
  }

  // Автоматическая отправка критических ошибок
  function reportErrorAutomatically(errorReport) {
    // Здесь можно добавить отправку на сервер
    console.warn('🚨 Критическая ошибка зафиксирована:', errorReport.id);
    
    // Пример интеграции с аналитикой
    if (global.HEYS && global.HEYS.analytics) {
      global.HEYS.analytics.trackError('CriticalError', {
        errorId: errorReport.id,
        message: errorReport.message,
        severity: errorReport.severity
      });
    }
  }

  // Трекинг действий пользователя для контекста
  function trackUserAction(action, details = {}) {
    if (!CONFIG.enableUserContext) return;

    const actionRecord = {
      timestamp: Date.now(),
      action: action,
      details: details,
      url: window.location.href
    };

    userContext.lastActions.push(actionRecord);
    
    // Ограничиваем историю действий
    if (userContext.lastActions.length > 20) {
      userContext.lastActions.shift();
    }
  }

  // Установка глобальных обработчиков ошибок
  function setupGlobalErrorHandlers() {
    // JavaScript ошибки
    window.addEventListener('error', (event) => {
      logAdvancedError(event.error || new Error(event.message), {
        type: 'javascript',
        url: event.filename,
        line: event.lineno,
        column: event.colno
      });
    });

    // Необработанные Promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
      logAdvancedError(error, {
        type: 'unhandledrejection'
      });
    });

    // Перехват fetch для сетевых ошибок
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
      const startTime = performance.now();
      try {
        const response = await originalFetch.apply(this, args);
        
        // Логируем медленные запросы
        const duration = performance.now() - startTime;
        if (duration > 3000) { // Более 3 секунд
          logAdvancedError(new Error('Медленный сетевой запрос'), {
            type: 'performance',
            additionalData: {
              url: args[0],
              duration: duration,
              status: response.status
            }
          });
        }

        // Логируем ошибки HTTP
        if (!response.ok) {
          logAdvancedError(new Error(`HTTP ${response.status}: ${response.statusText}`), {
            type: 'network',
            additionalData: {
              url: args[0],
              status: response.status,
              statusText: response.statusText
            }
          });
        }

        return response;
      } catch (error) {
        logAdvancedError(error, {
          type: 'network',
          url: args[0],
          additionalData: {
            duration: performance.now() - startTime
          }
        });
        throw error;
      }
    };

    // Трекинг пользовательских действий
    document.addEventListener('click', (e) => {
      trackUserAction('click', {
        target: e.target.tagName,
        className: e.target.className,
        id: e.target.id
      });
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === 'Escape') {
        trackUserAction('keypress', { key: e.key });
      }
    });
  }

  // API для внешнего использования
  const AdvancedErrorTracker = {
    // Ручное логирование ошибок
    logError: (error, context = {}) => logAdvancedError(error, context),
    
    // Получение всех ошибок
    getAllErrors: () => ({ ...errorStorage }),
    
    // Получение ошибок по типу
    getErrorsByType: (type) => errorStorage[getStorageKey(type)] || [],
    
    // Получение критических ошибок
    getCriticalErrors: () => {
      return Object.values(errorStorage)
        .flat()
        .filter(err => err.severity === 'critical')
        .sort((a, b) => b.timestamp - a.timestamp);
    },
    
    // Очистка ошибок
    clearErrors: () => {
      errorStorage = {
        jsErrors: [],
        networkErrors: [],
        consoleErrors: [],
        userActions: [],
        performanceIssues: []
      };
      localStorage.removeItem('heys_error_reports');
    },
    
    // Экспорт ошибок для отправки
    exportErrors: () => {
      return {
        session: userContext,
        errors: errorStorage,
        config: CONFIG,
        timestamp: Date.now()
      };
    },
    
    // Статистика ошибок
    getErrorStats: () => {
      const all = Object.values(errorStorage).flat();
      const stats = {
        total: all.length,
        bySeverity: {},
        byType: {},
        recentCount: 0
      };

      // Подсчет по критичности
      all.forEach(err => {
        stats.bySeverity[err.severity] = (stats.bySeverity[err.severity] || 0) + 1;
        stats.byType[err.type] = (stats.byType[err.type] || 0) + 1;
        
        // Ошибки за последний час
        if (Date.now() - err.timestamp < 3600000) {
          stats.recentCount++;
        }
      });

      return stats;
    },
    
    // Конфигурация
    configure: (newConfig) => Object.assign(CONFIG, newConfig),
    
    // Трекинг пользовательских действий
    trackAction: trackUserAction
  };

  // Инициализация
  function initialize() {
    setupGlobalErrorHandlers();
    
    // Записываем время загрузки страницы
    window.addEventListener('load', () => {
      userContext.pageLoadTime = Date.now() - userContext.startTime;
    });

    console.log('🛡️ Продвинутая система отслеживания ошибок HEYS инициализирована');
    console.log('📊 ID сессии:', userContext.sessionId);
  }

  // Экспортируем в глобальное пространство
  global.HEYS.AdvancedErrorTracker = AdvancedErrorTracker;
  global.HEYS.logError = AdvancedErrorTracker.logError;
  
  // Алиас для совместимости с тестами
  global.HEYS.errorTracker = AdvancedErrorTracker;

  // Автоматическая инициализация
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }

})(window);
