/**
 * HEYS Module Loader v1.0
 * =======================
 * Система загрузки модулей с поддержкой feature flags и rollback
 * 
 * Паттерн использования:
 *   await HEYS.moduleLoader.load('module_name', 'path/to/module.js')
 *   HEYS.moduleLoader.getStatus('module_name')
 *   await HEYS.moduleLoader.loadAll(moduleList)
 * 
 * Научная основа: Progressive Enhancement (Aaron Gustafson 2008)
 */

(function() {
  'use strict';

  const HEYS = window.HEYS = window.HEYS || {};
  
  // Статус модулей
  const MODULE_STATUS = {
    PENDING: 'pending',
    LOADING: 'loading',
    LOADED: 'loaded',
    ERROR: 'error',
    SKIPPED: 'skipped'
  };
  
  // Реестр загруженных модулей
  const loadedModules = new Map();
  
  /**
   * Module Loader API
   */
  HEYS.moduleLoader = {
    /**
     * Загрузить модуль
     * @param {string} moduleName - Имя модуля
     * @param {string} modulePath - Путь к модулю
     * @param {Object} options - Опции загрузки
     * @returns {Promise<boolean>} true если успешно загружен
     */
    async load(moduleName, modulePath, options = {}) {
      const {
        required = false,      // Обязательный модуль?
        retry = 2,            // Количество попыток при ошибке
        timeout = 10000,      // Таймаут загрузки (мс)
        flagName = null       // Feature flag для проверки
      } = options;
      
      // Проверяем feature flag если указан
      if (flagName && !HEYS.featureFlags?.isEnabled(flagName)) {
        loadedModules.set(moduleName, {
          name: moduleName,
          status: MODULE_STATUS.SKIPPED,
          reason: `Feature flag '${flagName}' is disabled`
        });
        
        if (HEYS.featureFlags?.isEnabled('dev_module_logging')) {
          console.log(`[ModuleLoader] ⏭️ Skipped: ${moduleName} (flag disabled)`);
        }
        
        return false;
      }
      
      // Модуль уже загружен?
      if (loadedModules.has(moduleName) && 
          loadedModules.get(moduleName).status === MODULE_STATUS.LOADED) {
        if (HEYS.featureFlags?.isEnabled('dev_module_logging')) {
          console.log(`[ModuleLoader] ♻️ Already loaded: ${moduleName}`);
        }
        return true;
      }
      
      // Начинаем загрузку
      loadedModules.set(moduleName, {
        name: moduleName,
        status: MODULE_STATUS.LOADING,
        startTime: Date.now()
      });
      
      // Трекинг производительности
      HEYS.modulePerf?.startLoad(moduleName);
      
      // Попытки загрузки с retry
      let lastError = null;
      for (let attempt = 1; attempt <= retry; attempt++) {
        try {
          // Загружаем скрипт
          await loadScript(modulePath, timeout);
          
          // Успешно загружен
          loadedModules.set(moduleName, {
            name: moduleName,
            status: MODULE_STATUS.LOADED,
            startTime: loadedModules.get(moduleName).startTime,
            endTime: Date.now(),
            duration: Date.now() - loadedModules.get(moduleName).startTime,
            path: modulePath
          });
          
          HEYS.modulePerf?.endLoad(moduleName, true);
          
          if (HEYS.featureFlags?.isEnabled('dev_module_logging')) {
            console.log(`[ModuleLoader] ✅ Loaded: ${moduleName}`);
          }
          
          return true;
          
        } catch (error) {
          lastError = error;
          
          if (attempt < retry) {
            // Ждём перед повторной попыткой (exponential backoff)
            const delay = Math.pow(2, attempt) * 100;
            await new Promise(resolve => setTimeout(resolve, delay));
            
            if (HEYS.featureFlags?.isEnabled('dev_module_logging')) {
              console.log(`[ModuleLoader] 🔄 Retry ${attempt}/${retry}: ${moduleName}`);
            }
          }
        }
      }
      
      // Все попытки неудачны
      loadedModules.set(moduleName, {
        name: moduleName,
        status: MODULE_STATUS.ERROR,
        error: lastError?.message || 'Unknown error',
        path: modulePath
      });
      
      HEYS.modulePerf?.endLoad(moduleName, false, lastError);
      
      const errorMsg = `Failed to load ${moduleName}: ${lastError?.message}`;
      
      if (required) {
        // Обязательный модуль — бросаем ошибку
        console.error(`[ModuleLoader] ❌ ${errorMsg}`);
        throw new Error(errorMsg);
      } else {
        // Необязательный модуль — предупреждение
        console.warn(`[ModuleLoader] ⚠️ ${errorMsg}`);
        return false;
      }
    },
    
    /**
     * Загрузить несколько модулей параллельно
     * @param {Array} modules - Массив модулей [{name, path, options}]
     * @returns {Promise<Object>} Объект с результатами
     */
    async loadAll(modules) {
      const results = await Promise.allSettled(
        modules.map(m => this.load(m.name, m.path, m.options || {}))
      );
      
      const summary = {
        total: modules.length,
        loaded: 0,
        failed: 0,
        skipped: 0
      };
      
      results.forEach((result, index) => {
        const module = modules[index];
        const status = loadedModules.get(module.name)?.status;
        
        if (status === MODULE_STATUS.LOADED) summary.loaded++;
        else if (status === MODULE_STATUS.ERROR) summary.failed++;
        else if (status === MODULE_STATUS.SKIPPED) summary.skipped++;
      });
      
      if (HEYS.featureFlags?.isEnabled('dev_module_logging')) {
        console.log('[ModuleLoader] Batch load complete:', summary);
      }
      
      return summary;
    },
    
    /**
     * Получить статус модуля
     * @param {string} moduleName - Имя модуля
     * @returns {Object|null} Объект со статусом или null
     */
    getStatus(moduleName) {
      return loadedModules.get(moduleName) || null;
    },
    
    /**
     * Получить все загруженные модули
     * @returns {Array} Массив с модулями
     */
    getAllModules() {
      return Array.from(loadedModules.values());
    },
    
    /**
     * Проверить, загружен ли модуль
     * @param {string} moduleName - Имя модуля
     * @returns {boolean} true если модуль загружен
     */
    isLoaded(moduleName) {
      const status = loadedModules.get(moduleName)?.status;
      return status === MODULE_STATUS.LOADED;
    },
    
    /**
     * Получить отчёт о загрузке
     */
    getReport() {
      const modules = this.getAllModules();
      
      return {
        total: modules.length,
        loaded: modules.filter(m => m.status === MODULE_STATUS.LOADED).length,
        failed: modules.filter(m => m.status === MODULE_STATUS.ERROR).length,
        skipped: modules.filter(m => m.status === MODULE_STATUS.SKIPPED).length,
        modules
      };
    },
    
    /**
     * Вывести отчёт в консоль
     */
    printReport() {
      const report = this.getReport();
      
      console.group('[ModuleLoader] Load Report');
      console.log('Total:', report.total);
      console.log('Loaded:', report.loaded);
      console.log('Failed:', report.failed);
      console.log('Skipped:', report.skipped);
      console.log('');
      console.table(report.modules);
      console.groupEnd();
    }
  };
  
  /**
   * Загрузить скрипт с таймаутом
   * @param {string} src - Путь к скрипту
   * @param {number} timeout - Таймаут (мс)
   * @returns {Promise<void>}
   */
  function loadScript(src, timeout) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.defer = true;
      
      // Таймаут
      const timeoutId = setTimeout(() => {
        script.remove();
        reject(new Error(`Timeout loading ${src}`));
      }, timeout);
      
      script.onload = () => {
        clearTimeout(timeoutId);
        resolve();
      };
      
      script.onerror = () => {
        clearTimeout(timeoutId);
        script.remove();
        reject(new Error(`Failed to load ${src}`));
      };
      
      document.head.appendChild(script);
    });
  }
  
  // Логирование инициализации
  if (window.DEV?.isDev?.()) {
    console.log('[ModuleLoader] Initialized');
  }
})();
