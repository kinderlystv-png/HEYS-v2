/**
 * HEYS Simple Analytics v1.0
 * Минималистичная система мониторинга для приложения учета питания
 * 
 * Заменяет 11,500+ строк избыточного кода на ~100 строк функционального трекинга
 * 
 * Что отслеживается:
 * - Медленные поисковые запросы (>1s)
 * - Медленные API вызовы (>2s)
 * - Операции с данными (кеш, синхронизация)
 * - JavaScript ошибки
 * 
 * Что НЕ отслеживается (избыточно для nutrition app):
 * - FPS и рендеринг
 * - Детальная память
 * - Клики и скроллы
 * - Browser fingerprinting
 */

(function(global) {
  'use strict';
  
  const HEYS = global.HEYS = global.HEYS || {};
  
  // ==================== КОНСТАНТЫ ====================
  
  // Пороги для предупреждений о медленных операциях (в миллисекундах)
  const THRESHOLDS = {
    SLOW_SEARCH: 1000,      // 1 секунда
    SLOW_API: 2000,         // 2 секунды
    CRITICAL_API: 5000      // 5 секунд
  };
  
  // Конвертация единиц измерения
  const CONVERSION = {
    MS_TO_SECONDS: 1000     // миллисекунды → секунды
  };
  
  // Счетчики для статистики
  const stats = {
    searches: { total: 0, slow: 0 },
    apiCalls: { total: 0, slow: 0, failed: 0 },
    errors: { total: 0 },
    cacheHits: 0,
    cacheMisses: 0,
    sessionStart: Date.now()
  };
  
  // ==================== CORE ФУНКЦИИ ====================
  
  /**
   * Трекинг поисковых запросов
   * Логирует медленные поиски для оптимизации
   * 
   * @param {string} query - Поисковый запрос пользователя
   * @param {number} resultsCount - Количество найденных результатов
   * @param {number} duration - Время выполнения запроса в миллисекундах
   * 
   * @example
   * trackSearch('творог', 15, 450); // Быстрый поиск, не логируется
   * trackSearch('молоко', 120, 1500); // Медленный поиск, логируется предупреждение
   */
  function trackSearch(query, resultsCount, duration) {
    stats.searches.total++;
    
    if (duration > THRESHOLDS.SLOW_SEARCH) {
      stats.searches.slow++;
      DEV.warn('[HEYS Analytics] Медленный поиск:', {
        query: query,
        duration: `${duration.toFixed(0)}ms`,
        results: resultsCount,
        threshold: `${THRESHOLDS.SLOW_SEARCH}ms`
      });
    }
  }
  
  /**
   * Трекинг API вызовов (Supabase, парсинг и т.д.)
   * Помогает выявить проблемы с сетью или backend
   * 
   * @param {string} apiName - Название API метода (например, 'supabase.products.list')
   * @param {number} duration - Время выполнения запроса в миллисекундах
   * @param {boolean} [success=true] - Успешность выполнения запроса
   * 
   * @example
   * trackApiCall('supabase.signin', 800, true); // Быстрый успешный вызов
   * trackApiCall('fdc.search', 3000, true); // Медленный, но успешный
   * trackApiCall('fdc.search', 500, false); // Быстрая ошибка
   */
  function trackApiCall(apiName, duration, success = true) {
    stats.apiCalls.total++;
    
    if (!success) {
      stats.apiCalls.failed++;
      console.error('[HEYS Analytics] API ошибка:', {
        api: apiName,
        duration: `${duration.toFixed(0)}ms`
      });
      return;
    }
    
    if (duration > THRESHOLDS.CRITICAL_API) {
      stats.apiCalls.slow++;
      console.error('[HEYS Analytics] Критически медленный API:', {
        api: apiName,
        duration: `${duration.toFixed(0)}ms`,
        threshold: `${THRESHOLDS.CRITICAL_API}ms`
      });
    } else if (duration > THRESHOLDS.SLOW_API) {
      stats.apiCalls.slow++;
      DEV.warn('[HEYS Analytics] Медленный API:', {
        api: apiName,
        duration: `${duration.toFixed(0)}ms`,
        threshold: `${THRESHOLDS.SLOW_API}ms`
      });
    }
  }
  
  /**
   * Трекинг операций с данными
   * Помогает оценить эффективность кеширования
   * 
   * @param {string} operationType - Тип операции: 'cache-hit' | 'cache-miss'
   * @param {number} [count=1] - Количество операций (для batch операций)
   * 
   * @example
   * trackDataOperation('cache-hit'); // Найдено в кеше
   * trackDataOperation('cache-miss'); // Загрузка из источника
   * trackDataOperation('cache-hit', 50); // Batch операция
   */
  function trackDataOperation(operationType, count = 1) {
    switch(operationType) {
      case 'cache-hit':
        stats.cacheHits += count;
        break;
      case 'cache-miss':
        stats.cacheMisses += count;
        break;
      default:
        // Другие операции просто игнорируем
        break;
    }
  }
  
  /**
   * Базовый error tracking
   * Перехватывает необработанные JavaScript ошибки
   * 
   * @param {Error|string} error - Объект ошибки или строка с описанием
   * @param {string} [source='unknown'] - Источник ошибки (модуль, функция)
   * 
   * @example
   * trackError(new Error('Failed to fetch'), 'ProductsManager.search');
   * trackError('Invalid JSON format', 'localStorage.parse');
   */
  function trackError(error, source = 'unknown') {
    stats.errors.total++;
    console.error('[HEYS Analytics] Ошибка:', {
      message: error.message || String(error),
      source: source,
      stack: error.stack || 'N/A'
    });
  }
  
  /**
   * Получить текущую статистику сессии
   * Возвращает агрегированные метрики по поиску, API, кешу и ошибкам
   * 
   * @returns {Object} Статистика сессии с метриками производительности
   * 
   * @example
   * const stats = getStats();
   * console.log(stats.searches.slowRate); // "15.5%"
   * console.log(stats.cache.hitRate); // "87.3%"
   */
  function getStats() {
    const sessionDuration = Date.now() - stats.sessionStart;
    const cacheTotal = stats.cacheHits + stats.cacheMisses;
    const cacheHitRate = cacheTotal > 0 
      ? ((stats.cacheHits / cacheTotal) * 100).toFixed(1) 
      : 0;
    
    return {
      session: {
        duration: `${(sessionDuration / CONVERSION.MS_TO_SECONDS).toFixed(0)}s`,
        start: new Date(stats.sessionStart).toISOString()
      },
      searches: {
        ...stats.searches,
        slowRate: stats.searches.total > 0 
          ? `${((stats.searches.slow / stats.searches.total) * 100).toFixed(1)}%`
          : '0%'
      },
      apiCalls: {
        ...stats.apiCalls,
        slowRate: stats.apiCalls.total > 0
          ? `${((stats.apiCalls.slow / stats.apiCalls.total) * 100).toFixed(1)}%`
          : '0%',
        failRate: stats.apiCalls.total > 0
          ? `${((stats.apiCalls.failed / stats.apiCalls.total) * 100).toFixed(1)}%`
          : '0%'
      },
      cache: {
        hits: stats.cacheHits,
        misses: stats.cacheMisses,
        hitRate: `${cacheHitRate}%`
      },
      errors: stats.errors
    };
  }
  
  /**
   * Экспорт метрик для отладки в консоли браузера
   * Вызывается через heysStats() в DevTools
   * 
   * @returns {Object} Полная статистика сессии
   * 
   * @example
   * // В консоли браузера:
   * heysStats(); // Выведет полную статистику
   */
  function exportMetrics() {
    const metrics = getStats();
    DEV.log('[HEYS Analytics] Статистика сессии:', metrics);
    return metrics;
  }
  
  // Глобальный обработчик ошибок
  global.addEventListener('error', function(event) {
    trackError(event.error || new Error(event.message), 'window.onerror');
  });
  
  // Обработчик promise rejections
  global.addEventListener('unhandledrejection', function(event) {
    trackError(new Error(event.reason), 'unhandledRejection');
  });
  
  // Экспорт в HEYS namespace
  HEYS.analytics = {
    trackSearch,
    trackApiCall,
    trackDataOperation,
    trackError,
    getStats,
    exportMetrics,
    
    // Aliases для совместимости с legacy кодом
    trackModuleLoad: () => {}, // no-op
    trackComponentRender: () => {}, // no-op
    trackUserInteraction: () => {}, // no-op
    startTracking: () => {},
    stopTracking: () => {},
    reset: () => {
      stats.searches = { total: 0, slow: 0 };
      stats.apiCalls = { total: 0, slow: 0, failed: 0 };
      stats.errors = { total: 0 };
      stats.cacheHits = 0;
      stats.cacheMisses = 0;
      stats.sessionStart = Date.now();
    },
    getMetrics: getStats,
    trackEvent: () => {} // no-op alias
  };
  
  // Alias для совместимости с heys_reports_v12.js
  HEYS.performance = {
    // Методы из analytics
    ...HEYS.analytics,
    
    // Дополнительные методы для reports
    increment: (metric) => {
      // Используем trackDataOperation для совместимости
      trackDataOperation(metric, 1);
    },
    
    measure: (name, fn) => {
      // Простой wrapper без реального измерения времени
      // (для reports время не критично)
      return fn();
    }
  };
  
  DEV.log('[HEYS Simple Analytics] Инициализирован ✓');
  
  // Debug: экспорт статистики в глобальный scope для отладки
  global.heysStats = getStats;
  
})(window);
