/**
 * HEYS Module Performance Tracker v1.0
 * =====================================
 * Система мониторинга производительности загрузки и работы модулей
 * 
 * Паттерн использования:
 *   HEYS.modulePerf.startLoad('module_name')
 *   HEYS.modulePerf.endLoad('module_name')
 *   HEYS.modulePerf.getReport() // получить отчёт
 * 
 * Научная основа: User-centric Performance Metrics (Google Web Vitals)
 */

(function () {
  'use strict';

  const HEYS = window.HEYS = window.HEYS || {};
  const devLog = (...args) => window.DEV?.log?.(...args);
  const devWarn = (...args) => window.DEV?.warn?.(...args);

  // Storage для метрик
  const PERF_KEY = 'heys_module_perf';
  const PERF_HISTORY_LIMIT = 10; // храним последние 10 загрузок

  // Текущие измерения (в памяти)
  const measurements = new Map();

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

  // История метрик (в localStorage)
  let perfHistory = loadHistory();

  /**
   * Загрузить историю из localStorage
   * @returns {Array} Массив с историей загрузок
   */
  function loadHistory() {
    try {
      return readStoredValue(PERF_KEY, []);
    } catch (e) {
      devWarn('[ModulePerf] Failed to load history:', e);
      return [];
    }
  }

  /**
   * Сохранить историю в localStorage
   */
  function saveHistory() {
    try {
      // Ограничиваем размер истории
      const limited = perfHistory.slice(-PERF_HISTORY_LIMIT);
      writeStoredValue(PERF_KEY, limited);
    } catch (e) {
      devWarn('[ModulePerf] Failed to save history:', e);
    }
  }

  /**
   * Module Performance API
   */
  HEYS.modulePerf = {
    /**
     * Начать измерение загрузки модуля
     * @param {string} moduleName - Имя модуля
     */
    startLoad(moduleName) {
      if (!performance || !performance.now) {
        devWarn('[ModulePerf] Performance API not available');
        return;
      }

      measurements.set(moduleName, {
        name: moduleName,
        startTime: performance.now(),
        startTimestamp: Date.now(),
        endTime: null,
        duration: null,
        success: null,
        error: null
      });

      if (HEYS.featureFlags?.isEnabled('dev_module_logging')) {
        devLog(`[ModulePerf] 📦 Loading: ${moduleName}`);
      }
    },

    /**
     * Завершить измерение загрузки модуля
     * @param {string} moduleName - Имя модуля
     * @param {boolean} success - Успешно ли загружен
     * @param {Error} error - Ошибка (если была)
     */
    endLoad(moduleName, success = true, error = null) {
      const measurement = measurements.get(moduleName);
      if (!measurement) {
        devWarn(`[ModulePerf] No start measurement for: ${moduleName}`);
        return;
      }

      const endTime = performance.now();
      measurement.endTime = endTime;
      measurement.duration = endTime - measurement.startTime;
      measurement.success = success;
      measurement.error = error ? error.message : null;

      // Добавляем в историю
      perfHistory.push({ ...measurement });
      saveHistory();

      // Логирование
      const emoji = success ? '✅' : '❌';
      const duration = measurement.duration.toFixed(2);

      if (HEYS.featureFlags?.isEnabled('dev_module_logging')) {
        devLog(`[ModulePerf] ${emoji} ${moduleName}: ${duration}ms`);
      }

      // Предупреждение о медленной загрузке (>500ms)
      if (success && measurement.duration > 500) {
        devWarn(`[ModulePerf] ⚠️ Slow load: ${moduleName} took ${duration}ms`);
      }

      // Удаляем из активных измерений
      measurements.delete(moduleName);
    },

    /**
     * Получить отчёт о производительности
     * @returns {Object} Объект с отчётом
     */
    getReport() {
      const history = [...perfHistory];

      // Группируем по модулям
      const byModule = {};
      history.forEach(m => {
        if (!byModule[m.name]) {
          byModule[m.name] = [];
        }
        byModule[m.name].push(m);
      });

      // Статистика по каждому модулю
      const stats = {};
      Object.keys(byModule).forEach(name => {
        const loads = byModule[name];
        const durations = loads.filter(l => l.success).map(l => l.duration);

        stats[name] = {
          totalLoads: loads.length,
          successfulLoads: loads.filter(l => l.success).length,
          failedLoads: loads.filter(l => !l.success).length,
          avgDuration: durations.length > 0
            ? (durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(2)
            : null,
          minDuration: durations.length > 0 ? Math.min(...durations).toFixed(2) : null,
          maxDuration: durations.length > 0 ? Math.max(...durations).toFixed(2) : null,
          lastLoad: loads[loads.length - 1]
        };
      });

      return {
        totalModules: Object.keys(stats).length,
        stats,
        rawHistory: history
      };
    },

    /**
     * Получить читаемый отчёт в консоль
     */
    printReport() {
      const report = this.getReport();
      devLog('[ModulePerf] Performance Report', report);
    },

    /**
     * Очистить историю
     */
    clearHistory() {
      perfHistory = [];
      saveHistory();
      devLog('[ModulePerf] History cleared');
    },

    /**
     * Получить список активных измерений
     * @returns {Array} Массив с активными измерениями
     */
    getActiveMeasurements() {
      return Array.from(measurements.values());
    },

    /**
     * Экспорт метрик для анализа
     * @returns {string} JSON строка с метриками
     */
    export() {
      const report = this.getReport();
      const data = {
        timestamp: Date.now(),
        userAgent: navigator.userAgent,
        ...report
      };
      return JSON.stringify(data, null, 2);
    },

    /**
     * Диагностика тяжёлых коммитов DayTab: то же «включение», что у react-probe
     * (localStorage heys_debug_react_profiler / ?reactProfiler=1) или heys_debug_commit_trace=1.
     */
    commitTraceEnabled() {
      try {
        if (HEYS.debug && HEYS.debug.reactProfiler === true) return true;
        const ls = window.localStorage && window.localStorage.getItem('heys_debug_react_profiler');
        if (ls != null && ls !== '') {
          const s = String(ls).trim().toLowerCase();
          if (s === 'true' || s === '1' || s === 'yes' || s === 'on') return true;
        }
        const ls2 = window.localStorage && window.localStorage.getItem('heys_debug_commit_trace');
        if (ls2 === '1' || String(ls2 || '').trim().toLowerCase() === 'true') return true;
        if (window.location && window.location.search) {
          const u = new URLSearchParams(window.location.search).get('reactProfiler');
          if (u === '1' || u === 'true' || u === 'yes') return true;
        }
      } catch (e) { /* noop */ }
      return false;
    },

    /** Последняя подсказка для HEYS.perf slow commit-probe (перезаписывается). */
    markCommitHint(tag, detail) {
      if (!this.commitTraceEnabled()) return;
      try {
        window.__HEYS_COMMIT_HINT__ = {
          tag: String(tag || ''),
          detail: detail == null ? null : detail,
          at: Date.now(),
          perfT: typeof performance !== 'undefined' && performance.now ? performance.now() : 0
        };
      } catch (e) { /* noop */ }
    },

    /**
     * Справка: DevTools пишет [Violation] 'message' handler на react-bundle.js — это типично React 18 Scheduler
     * (очередь через MessageChannel), а не отдельный обработчик приложения. Большие ms = долгий синхронный commit.
     */
    whyReactMessageViolations() {
      const msg = '«message» на react-bundle.js:1 — обычно React 18 Scheduler (MessageChannel), не SW/postMessage приложения. ' +
        'Длинные ms = тяжёлый синхронный рендер/коммит корня. Корреляция: heys_debug_commit_trace=1 или react_profiler, reload → ' +
        'логи «[HEYS.sync] perf hot-sync finished» и «[HEYS.sync] perf slow tab commit» (консоль HEYS фильтрует по группам; префикс [HEYS.sync] в дефолте). ' +
        'Порог slow: heys_debug_slow_commit_ms.';
      try {
        (global.console || console).info('[HEYS.sync] perf help: react message violations', msg);
      } catch (e) { /* noop */ }
      return msg;
    }
  };

  // Алиас для краткости
  HEYS.perf = HEYS.modulePerf;

  // Логирование инициализации
  if (window.DEV?.isDev?.()) {
    devLog('[ModulePerf] Initialized');
  }
})();
