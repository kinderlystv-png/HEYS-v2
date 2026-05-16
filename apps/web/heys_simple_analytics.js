/**
 * HEYS Simple Analytics v2.0
 * Session analytics with lightweight runtime performance audit.
 */

(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};

  // DEMO_MODE: no-op analytics. Skips global error listeners and counter machinery —
  // demo iframe должен быть тихим, без раздувания счётчиков на тестовых действиях.
  if (global.__HEYS_DEMO_MODE__ && global.__HEYS_DEMO_MODE__.enabled) {
    const noop = function () {};
    HEYS.analytics = {
      trackSearch: noop, trackApiCall: noop, trackDataOperation: noop,
      trackEvent: noop, trackError: noop, trackInteraction: noop,
      startMeasure: noop, endMeasure: noop,
      startPerformanceAudit: noop, stopPerformanceAudit: noop,
      getStats: function () { return {}; },
      exportMetrics: function () { return {}; },
      trackModuleLoad: noop, trackComponentRender: noop,
      trackUserInteraction: noop, startTracking: noop, stopTracking: noop,
    };
    return;
  }

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

  const PERF_THRESHOLDS = {
    SLOW_CLICK_TO_FRAME: 120,
    JANKY_SCROLL_FRAME: 24,
    SLOW_EVENT: 120,
    LONG_TASK: 50
  };

  const PERF_SAMPLING = {
    PROD_SAMPLE_RATE: 0.15,
    STORAGE_FLAG_KEY: 'heys_perf_audit'
  };

  // Счетчики для статистики
  const stats = {
    searches: { total: 0, slow: 0 },
    apiCalls: { total: 0, slow: 0, failed: 0 },
    events: { total: 0, tabSwitches: 0, slowInteractions: 0 },
    errors: { total: 0 },
    cacheHits: 0,
    cacheMisses: 0,
    sessionStart: Date.now()
  };

  const DEBUG_EVENTS_KEY = 'heys_debug_events';
  const DEBUG_EVENTS_LIMIT = 50;
  const DEBUG_EVENTS_FLUSH_MS = 10000;
  const debugEvents = [];
  let _debugFlushTimer = null;
  const perfMeasureStarts = new Map();

  const perfState = {
    initialized: false,
    enabled: false,
    sampleRate: 0,
    observers: [],
    cleanupFns: [],
    eventSamples: [],
    clickSamples: [],
    customMeasures: [],
    webVitals: {
      lcp: null,
      cls: 0,
      inp: null,
      inpEvent: null
    },
    longTasks: {
      count: 0,
      totalDuration: 0,
      maxDuration: 0
    },
    scroll: {
      sessions: 0,
      jankySessions: 0,
      totalDroppedFrames: 0,
      worstFrameDelta: 0,
      maxDroppedFramesInSession: 0
    },
    dataProfile: {
      daysCount: 0,
      daysBucket: 'unknown',
      avgItemsPerDay: 0,
      itemsBucket: 'unknown',
      storageMB: 0
    }
  };

  const readStoredValue = (key, fallback = null) => {
    if (HEYS.store?.readSafe) return HEYS.store.readSafe(key, fallback);
    try {
      const v = HEYS.utils?.lsGet?.(key, fallback);
      return v == null ? fallback : v;
    } catch (_) { return fallback; }
  };

  const writeStoredValue = (key, value) => {
    if (HEYS.store?.set) {
      return HEYS.store.set(key, value);
    }
    if (HEYS.utils?.lsSet) {
      return HEYS.utils.lsSet(key, value);
    }
    localStorage.setItem(key, JSON.stringify(value));
  };

  function recordDebugEvent(type, payload) {
    try {
      const entry = {
        t: Date.now(),
        type: type || 'unknown',
        payload: payload || null
      };
      debugEvents.push(entry);
      if (debugEvents.length > DEBUG_EVENTS_LIMIT) {
        debugEvents.splice(0, debugEvents.length - DEBUG_EVENTS_LIMIT);
      }
      if (!_debugFlushTimer) {
        _debugFlushTimer = setTimeout(() => {
          _debugFlushTimer = null;
          try { writeStoredValue(DEBUG_EVENTS_KEY, debugEvents); } catch (e) { }
        }, DEBUG_EVENTS_FLUSH_MS);
      }
    } catch (e) { }
  }

  function toNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function percentile(values, q) {
    if (!Array.isArray(values) || values.length === 0) return 0;
    const sorted = values.slice().sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((q / 100) * sorted.length) - 1));
    return sorted[idx];
  }

  function bucketDays(daysCount) {
    if (daysCount >= 180) return '180+';
    if (daysCount >= 90) return '90-179';
    if (daysCount >= 30) return '30-89';
    if (daysCount >= 1) return '1-29';
    return '0';
  }

  function bucketItems(avgItemsPerDay) {
    if (avgItemsPerDay >= 80) return '80+';
    if (avgItemsPerDay >= 40) return '40-79';
    if (avgItemsPerDay >= 20) return '20-39';
    if (avgItemsPerDay >= 1) return '1-19';
    return '0';
  }

  function shouldEnablePerfAudit() {
    const devEnabled = !!global.DEV?.isDev?.();
    let forceEnabled = false;
    try {
      const persistedFlag = readStoredValue(PERF_SAMPLING.STORAGE_FLAG_KEY, null);
      forceEnabled = persistedFlag === '1' || persistedFlag === 1 || persistedFlag === true || global.__HEYS_FORCE_PERF_AUDIT === true;
    } catch (e) {
      forceEnabled = global.__HEYS_FORCE_PERF_AUDIT === true;
    }

    const sampleRate = forceEnabled || devEnabled ? 1 : PERF_SAMPLING.PROD_SAMPLE_RATE;
    perfState.sampleRate = sampleRate;
    perfState.enabled = Math.random() <= sampleRate;
  }

  function computeDataProfile() {
    try {
      let dayKeys = [];
      let bytes = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        let value = '';
        try {
          value = localStorage.getItem(key) || '';
        } catch (e) {
          value = '';
        }
        bytes += key.length + value.length;
        if (key.startsWith('heys_dayv2_')) dayKeys.push(key);
      }

      dayKeys = dayKeys.sort();
      const sampleKeys = dayKeys.slice(-10);
      let sampledItems = 0;
      let sampledDays = 0;
      sampleKeys.forEach((key) => {
        try {
          const raw = localStorage.getItem(key);
          if (!raw) return;
          const parsed = JSON.parse(raw);
          const meals = Array.isArray(parsed?.meals) ? parsed.meals : [];
          const items = meals.reduce((sum, meal) => sum + (Array.isArray(meal?.items) ? meal.items.length : 0), 0);
          sampledItems += items;
          sampledDays += 1;
        } catch (e) { }
      });

      const avgItemsPerDay = sampledDays > 0 ? +(sampledItems / sampledDays).toFixed(1) : 0;
      const storageMB = +(bytes / (1024 * 1024)).toFixed(2);

      perfState.dataProfile = {
        daysCount: dayKeys.length,
        daysBucket: bucketDays(dayKeys.length),
        avgItemsPerDay,
        itemsBucket: bucketItems(avgItemsPerDay),
        storageMB
      };
    } catch (e) {
      perfState.dataProfile = {
        daysCount: 0,
        daysBucket: 'unknown',
        avgItemsPerDay: 0,
        itemsBucket: 'unknown',
        storageMB: 0
      };
    }
  }

  function createObserver(type, callback) {
    if (!global.PerformanceObserver) return null;
    if (typeof PerformanceObserver.supportedEntryTypes !== 'undefined') {
      const supported = PerformanceObserver.supportedEntryTypes || [];
      if (!supported.includes(type)) return null;
    }

    try {
      const observer = new PerformanceObserver((list) => callback(list.getEntries() || []));
      observer.observe({ type, buffered: true });
      perfState.observers.push(observer);
      return observer;
    } catch (e) {
      return null;
    }
  }

  function initPerfObservers() {
    createObserver('largest-contentful-paint', (entries) => {
      const latest = entries[entries.length - 1];
      if (!latest) return;
      perfState.webVitals.lcp = +toNumber(latest.startTime, 0).toFixed(1);
    });

    createObserver('layout-shift', (entries) => {
      entries.forEach((entry) => {
        if (entry.hadRecentInput) return;
        perfState.webVitals.cls = +(perfState.webVitals.cls + toNumber(entry.value, 0)).toFixed(4);
      });
    });

    createObserver('event', (entries) => {
      entries.forEach((entry) => {
        const duration = toNumber(entry.duration, 0);
        if (duration <= 0) return;
        perfState.eventSamples.push(duration);
        if (perfState.eventSamples.length > 200) perfState.eventSamples.shift();
        if (duration >= PERF_THRESHOLDS.SLOW_EVENT) {
          stats.events.slowInteractions += 1;
        }
        if (duration > toNumber(perfState.webVitals.inp, 0)) {
          perfState.webVitals.inp = +duration.toFixed(1);
          perfState.webVitals.inpEvent = entry.name || entry.interactionId || 'event';
        }
      });
    });

    createObserver('longtask', (entries) => {
      entries.forEach((entry) => {
        const duration = toNumber(entry.duration, 0);
        perfState.longTasks.count += 1;
        perfState.longTasks.totalDuration += duration;
        perfState.longTasks.maxDuration = Math.max(perfState.longTasks.maxDuration, duration);
      });
    });
  }

  function initClickTracking() {
    const clickHandler = () => {
      const start = performance.now();
      requestAnimationFrame(() => {
        const delta = performance.now() - start;
        perfState.clickSamples.push(delta);
        if (perfState.clickSamples.length > 200) perfState.clickSamples.shift();
        if (delta >= PERF_THRESHOLDS.SLOW_CLICK_TO_FRAME) {
          stats.events.slowInteractions += 1;
        }
      });
    };

    global.addEventListener('click', clickHandler, { capture: true, passive: true });
    perfState.cleanupFns.push(() => global.removeEventListener('click', clickHandler, { capture: true }));
  }

  function initScrollTracking() {
    let sessionActive = false;
    let rafId = null;
    let lastSampleTs = 0;
    let lastScrollTs = 0;
    let droppedFrames = 0;
    let worstDelta = 0;
    let skipCount = 0;

    const SCROLL_IDLE_MS = 200;
    const SAMPLE_EVERY_N = 3;

    const monitor = (ts) => {
      if (!sessionActive) return;

      if ((ts - lastScrollTs) > SCROLL_IDLE_MS) {
        perfState.scroll.sessions += 1;
        perfState.scroll.totalDroppedFrames += droppedFrames;
        perfState.scroll.worstFrameDelta = Math.max(perfState.scroll.worstFrameDelta, worstDelta);
        perfState.scroll.maxDroppedFramesInSession = Math.max(perfState.scroll.maxDroppedFramesInSession, droppedFrames);
        if (droppedFrames > 0 || worstDelta > PERF_THRESHOLDS.JANKY_SCROLL_FRAME) {
          perfState.scroll.jankySessions += 1;
        }
        sessionActive = false;
        rafId = null;
        return;
      }

      skipCount++;
      if (skipCount >= SAMPLE_EVERY_N) {
        skipCount = 0;
        if (lastSampleTs > 0) {
          const delta = ts - lastSampleTs;
          const avgFrame = delta / SAMPLE_EVERY_N;
          worstDelta = Math.max(worstDelta, avgFrame);
          if (avgFrame > PERF_THRESHOLDS.JANKY_SCROLL_FRAME) {
            droppedFrames += Math.max(1, Math.round(delta / 16.7) - SAMPLE_EVERY_N);
          }
        }
        lastSampleTs = ts;
      }

      rafId = requestAnimationFrame(monitor);
    };

    const onScroll = () => {
      lastScrollTs = performance.now();
      if (!sessionActive) {
        sessionActive = true;
        droppedFrames = 0;
        worstDelta = 0;
        lastSampleTs = 0;
        skipCount = 0;
        rafId = requestAnimationFrame(monitor);
      }
    };

    global.addEventListener('scroll', onScroll, { passive: true });
    perfState.cleanupFns.push(() => {
      global.removeEventListener('scroll', onScroll);
      if (rafId != null) cancelAnimationFrame(rafId);
    });
  }

  function startPerformanceAudit() {
    if (perfState.initialized) return;
    perfState.initialized = true;
    shouldEnablePerfAudit();
    if (!perfState.enabled) return;

    initPerfObservers();
    initClickTracking();
    initScrollTracking();

    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => computeDataProfile(), { timeout: 1000 });
    } else {
      setTimeout(() => computeDataProfile(), 250);
    }
  }

  function stopPerformanceAudit() {
    perfState.observers.forEach((observer) => {
      try { observer.disconnect(); } catch (e) { }
    });
    perfState.observers = [];
    perfState.cleanupFns.forEach((cleanup) => {
      try { cleanup(); } catch (e) { }
    });
    perfState.cleanupFns = [];
    perfState.initialized = false;
  }

  function getPerformanceStats() {
    const clickP95 = +percentile(perfState.clickSamples, 95).toFixed(1);
    const clickP50 = +percentile(perfState.clickSamples, 50).toFixed(1);
    const eventP95 = +percentile(perfState.eventSamples, 95).toFixed(1);

    const avgLongTask = perfState.longTasks.count > 0
      ? +(perfState.longTasks.totalDuration / perfState.longTasks.count).toFixed(1)
      : 0;

    const scrollJankRate = perfState.scroll.sessions > 0
      ? +((perfState.scroll.jankySessions / perfState.scroll.sessions) * 100).toFixed(1)
      : 0;

    return {
      enabled: perfState.enabled,
      sampleRate: perfState.sampleRate,
      webVitals: {
        lcp: perfState.webVitals.lcp,
        cls: +toNumber(perfState.webVitals.cls, 0).toFixed(4),
        inp: perfState.webVitals.inp,
        inpEvent: perfState.webVitals.inpEvent
      },
      clicks: {
        count: perfState.clickSamples.length,
        p50ClickToFrame: clickP50,
        p95ClickToFrame: clickP95,
        maxClickToFrame: perfState.clickSamples.length ? +Math.max(...perfState.clickSamples).toFixed(1) : 0
      },
      interactions: {
        p95EventDuration: eventP95,
        slowInteractions: stats.events.slowInteractions
      },
      longTasks: {
        count: perfState.longTasks.count,
        avgDuration: avgLongTask,
        maxDuration: +toNumber(perfState.longTasks.maxDuration, 0).toFixed(1)
      },
      scroll: {
        sessions: perfState.scroll.sessions,
        jankySessions: perfState.scroll.jankySessions,
        jankRate: scrollJankRate,
        totalDroppedFrames: perfState.scroll.totalDroppedFrames,
        maxDroppedFramesInSession: perfState.scroll.maxDroppedFramesInSession,
        worstFrameDelta: +toNumber(perfState.scroll.worstFrameDelta, 0).toFixed(1)
      },
      dataProfile: { ...perfState.dataProfile },
      customMeasures: perfState.customMeasures.slice(-25)
    };
  }

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
  * @param {Object} [meta] - Доп. данные (только для debug-событий)
   * 
   * @example
   * trackDataOperation('cache-hit'); // Найдено в кеше
   * trackDataOperation('cache-miss'); // Загрузка из источника
   * trackDataOperation('cache-hit', 50); // Batch операция
   */
  function trackDataOperation(operationType, count = 1, meta) {
    switch (operationType) {
      case 'cache-hit':
        stats.cacheHits += count;
        break;
      case 'cache-miss':
        stats.cacheMisses += count;
        break;
      default:
        recordDebugEvent(operationType, {
          count: typeof count === 'number' ? count : 1,
          meta: meta || null
        });
        break;
    }
  }

  function trackEvent(eventName, payload = null) {
    stats.events.total += 1;
    const normalized = String(eventName || '').toLowerCase();
    if (normalized.includes('tab')) {
      stats.events.tabSwitches += 1;
    }
    recordDebugEvent(`event:${normalized || 'unknown'}`, payload);
  }

  function startMeasure(name) {
    if (!name) return;
    perfMeasureStarts.set(name, performance.now());
  }

  function endMeasure(name, meta) {
    if (!name || !perfMeasureStarts.has(name)) return 0;
    const startedAt = perfMeasureStarts.get(name);
    perfMeasureStarts.delete(name);
    const duration = +(performance.now() - startedAt).toFixed(1);
    perfState.customMeasures.push({
      name,
      duration,
      ts: Date.now(),
      meta: meta || null
    });
    if (perfState.customMeasures.length > 120) {
      perfState.customMeasures.splice(0, perfState.customMeasures.length - 120);
    }
    if (duration >= PERF_THRESHOLDS.SLOW_EVENT) {
      stats.events.slowInteractions += 1;
    }
    return duration;
  }

  function trackInteraction(name, duration, meta) {
    const safeName = String(name || 'interaction');
    const safeDuration = +toNumber(duration, 0).toFixed(1);
    if (safeDuration <= 0) return;
    perfState.customMeasures.push({
      name: safeName,
      duration: safeDuration,
      ts: Date.now(),
      meta: meta || null
    });
    if (perfState.customMeasures.length > 120) {
      perfState.customMeasures.splice(0, perfState.customMeasures.length - 120);
    }
    if (safeDuration >= PERF_THRESHOLDS.SLOW_EVENT) {
      stats.events.slowInteractions += 1;
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
      events: {
        ...stats.events
      },
      errors: stats.errors,
      performance: getPerformanceStats()
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
  global.addEventListener('error', function (event) {
    trackError(event.error || new Error(event.message), 'window.onerror');
  });

  // Обработчик promise rejections
  global.addEventListener('unhandledrejection', function (event) {
    trackError(new Error(event.reason), 'unhandledRejection');
  });

  // Экспорт в HEYS namespace
  HEYS.analytics = {
    trackSearch,
    trackApiCall,
    trackDataOperation,
    trackEvent,
    trackError,
    trackInteraction,
    startMeasure,
    endMeasure,
    startPerformanceAudit,
    stopPerformanceAudit,
    getStats,
    exportMetrics,

    // Aliases для совместимости с legacy кодом
    trackModuleLoad: () => { }, // no-op
    trackComponentRender: () => { }, // no-op
    trackUserInteraction: trackInteraction,
    startTracking: startPerformanceAudit,
    stopTracking: stopPerformanceAudit,
    reset: () => {
      stats.searches = { total: 0, slow: 0 };
      stats.apiCalls = { total: 0, slow: 0, failed: 0 };
      stats.events = { total: 0, tabSwitches: 0, slowInteractions: 0 };
      stats.errors = { total: 0 };
      stats.cacheHits = 0;
      stats.cacheMisses = 0;
      stats.sessionStart = Date.now();
      perfMeasureStarts.clear();
      perfState.eventSamples = [];
      perfState.clickSamples = [];
      perfState.customMeasures = [];
      perfState.webVitals = { lcp: null, cls: 0, inp: null, inpEvent: null };
      perfState.longTasks = { count: 0, totalDuration: 0, maxDuration: 0 };
      perfState.scroll = { sessions: 0, jankySessions: 0, totalDroppedFrames: 0, worstFrameDelta: 0, maxDroppedFramesInSession: 0 };
      perfState.dataProfile = { daysCount: 0, daysBucket: 'unknown', avgItemsPerDay: 0, itemsBucket: 'unknown', storageMB: 0 };
      computeDataProfile();
    },
    getMetrics: getStats,
    flushPerformanceProfile: computeDataProfile
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

  // Лог инициализации отключен для чистой консоли

  // Debug: экспорт статистики в глобальный scope для отладки
  global.heysStats = getStats;
  startPerformanceAudit();

})(window);
