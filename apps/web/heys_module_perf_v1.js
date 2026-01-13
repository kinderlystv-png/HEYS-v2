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

(function() {
  'use strict';

  const HEYS = window.HEYS = window.HEYS || {};
  
  // Storage для метрик
  const PERF_KEY = 'heys_module_perf';
  const PERF_HISTORY_LIMIT = 10; // храним последние 10 загрузок
  
  // Текущие измерения (в памяти)
  const measurements = new Map();
  
  // История метрик (в localStorage)
  let perfHistory = loadHistory();
  
  /**
   * Загрузить историю из localStorage
   * @returns {Array} Массив с историей загрузок
   */
  function loadHistory() {
    try {
      const stored = localStorage.getItem(PERF_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      console.warn('[ModulePerf] Failed to load history:', e);
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
      localStorage.setItem(PERF_KEY, JSON.stringify(limited));
    } catch (e) {
      console.warn('[ModulePerf] Failed to save history:', e);
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
        console.warn('[ModulePerf] Performance API not available');
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
        console.log(`[ModulePerf] 📦 Loading: ${moduleName}`);
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
        console.warn(`[ModulePerf] No start measurement for: ${moduleName}`);
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
        console.log(`[ModulePerf] ${emoji} ${moduleName}: ${duration}ms`);
      }
      
      // Предупреждение о медленной загрузке (>500ms)
      if (success && measurement.duration > 500) {
        console.warn(`[ModulePerf] ⚠️ Slow load: ${moduleName} took ${duration}ms`);
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
      
      console.group('[ModulePerf] Performance Report');
      console.log('Total modules:', report.totalModules);
      console.log('');
      
      Object.keys(report.stats).forEach(name => {
        const s = report.stats[name];
        console.group(name);
        console.log('Loads:', `${s.successfulLoads}/${s.totalLoads} successful`);
        console.log('Duration:', `avg ${s.avgDuration}ms, min ${s.minDuration}ms, max ${s.maxDuration}ms`);
        if (s.failedLoads > 0) {
          console.warn('Failed loads:', s.failedLoads);
        }
        console.groupEnd();
      });
      
      console.groupEnd();
    },
    
    /**
     * Очистить историю
     */
    clearHistory() {
      perfHistory = [];
      saveHistory();
      console.log('[ModulePerf] History cleared');
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
    console.log('[ModulePerf] Initialized');
  }
})();
