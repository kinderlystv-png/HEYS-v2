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
  
  // Пороги для предупреждений
  const THRESHOLDS = {
    SLOW_SEARCH: 1000,      // 1 секунда
    SLOW_API: 2000,         // 2 секунды
    CRITICAL_API: 5000      // 5 секунд
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
  
  /**
   * Трекинг поисковых запросов
   * Логирует медленные поиски для оптимизации
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
   */
  function getStats() {
    const sessionDuration = Date.now() - stats.sessionStart;
    const cacheTotal = stats.cacheHits + stats.cacheMisses;
    const cacheHitRate = cacheTotal > 0 
      ? ((stats.cacheHits / cacheTotal) * 100).toFixed(1) 
      : 0;
    
    return {
      session: {
        duration: `${(sessionDuration / 1000).toFixed(0)}s`,
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
   * Экспорт метрик (для debug в консоли)
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
