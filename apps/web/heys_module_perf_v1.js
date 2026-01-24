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
    let value;
    if (HEYS.store?.get) {
      value = HEYS.store.get(key, fallback);
    } else if (HEYS.utils?.lsGet) {
      value = HEYS.utils.lsGet(key, fallback);
    } else {
      try {
        value = localStorage.getItem(key);
      } catch (e) {
        return fallback;
      }
    }

    if (value == null) return fallback;

    if (typeof value === 'string') {
      if (value.startsWith('¤Z¤') && HEYS.store?.decompress) {
        try {
          value = HEYS.store.decompress(value.slice(3));
        } catch (e) { }
      }
      try {
        return JSON.parse(value);
      } catch (e) {
        return value;
      }
    }

    return value;
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
    }
  };

  // Алиас для краткости
  HEYS.perf = HEYS.modulePerf;

  // Логирование инициализации
  if (window.DEV?.isDev?.()) {
    devLog('[ModulePerf] Initialized');
  }
})();
