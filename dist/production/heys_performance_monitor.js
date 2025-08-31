// heys_performance_monitor.js — расширенная аналитика и мониторинг производительности
(function(global) {
  const HEYS = global.HEYS = global.HEYS || {};
  
  // Центральная система метрик
  class PerformanceAnalytics {
    constructor() {
      this.sessionStart = Date.now();
      this.metrics = {
        // Производительность
        performance: {
          loadTime: 0,
          renderTime: 0,
          bundleSize: 0,
          memoryUsage: [],
          fpsHistory: [],
          networkRequests: [],
          errorCount: 0,
          warnings: []
        },
        // Взаимодействие пользователя
        userActivity: {
          clicks: 0,
          keystrokes: 0,
          scrolls: 0,
          tabSwitches: 0,
          activeTime: 0,
          idleTime: 0,
          lastActivity: Date.now(),
          clickEvents: [],
          scrollHistory: []
        },
        // Данные приложения
        dataMetrics: {
          productsLoaded: 0,
          mealsCreated: 0,
          daysViewed: 0,
          searchQueries: 0,
          cloudSyncs: 0,
          storageOps: 0,
          cacheHits: 0,
          cacheMisses: 0
        },
        // Ошибки и предупреждения
        errors: {
          jsErrors: [],
          networkErrors: [],
          validationErrors: [],
          consoleErrors: []
        },
        // Timing данные
        timing: {
          moduleLoadTimes: new Map(),
          componentRenderTimes: new Map(),
          apiCallTimes: new Map(),
          searchTimes: []
        },
        // Состояние системы
        system: {
          browser: this.getBrowserInfo(),
          screen: this.getScreenInfo(),
          connection: this.getConnectionInfo(),
          features: this.getFeatureSupport()
        }
      };
      
      this.observers = [];
      this.isTracking = true;
      this.idleTimer = null;
      this.fpsCounter = new FPSCounter();
      
      this.initializeTracking();
    }

    // Информация о браузере
    getBrowserInfo() {
      const nav = navigator;
      return {
        userAgent: nav.userAgent,
        language: nav.language,
        platform: nav.platform,
        cookieEnabled: nav.cookieEnabled,
        onLine: nav.onLine,
        hardwareConcurrency: nav.hardwareConcurrency || 'unknown',
        deviceMemory: nav.deviceMemory || 'unknown',
        maxTouchPoints: nav.maxTouchPoints || 0
      };
    }

    // Информация об экране
    getScreenInfo() {
      const screen = global.screen;
      return {
        width: screen.width,
        height: screen.height,
        availWidth: screen.availWidth,
        availHeight: screen.availHeight,
        colorDepth: screen.colorDepth,
        pixelDepth: screen.pixelDepth,
        devicePixelRatio: global.devicePixelRatio || 1,
        viewport: {
          width: global.innerWidth,
          height: global.innerHeight
        }
      };
    }

    // Информация о соединении
    getConnectionInfo() {
      const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      if (!conn) return { supported: false };
      
      return {
        supported: true,
        effectiveType: conn.effectiveType,
        downlink: conn.downlink,
        rtt: conn.rtt,
        saveData: conn.saveData
      };
    }

    // Поддержка функций
    getFeatureSupport() {
      return {
        serviceWorker: 'serviceWorker' in navigator,
        webWorker: typeof Worker !== 'undefined',
        indexedDB: 'indexedDB' in global,
        localStorage: 'localStorage' in global,
        sessionStorage: 'sessionStorage' in global,
        webGL: this.hasWebGL(),
        webGL2: this.hasWebGL2(),
        webAssembly: typeof WebAssembly !== 'undefined',
        intersectionObserver: 'IntersectionObserver' in global,
        mutationObserver: 'MutationObserver' in global,
        performanceObserver: 'PerformanceObserver' in global
      };
    }

    hasWebGL() {
      try {
        const canvas = document.createElement('canvas');
        return !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
      } catch (e) {
        return false;
      }
    }

    hasWebGL2() {
      try {
        const canvas = document.createElement('canvas');
        return !!canvas.getContext('webgl2');
      } catch (e) {
        return false;
      }
    }

    // Инициализация отслеживания
    initializeTracking() {
      this.trackLoadTime();
      this.trackUserActivity();
      this.trackMemoryUsage();
      this.trackErrors();
      this.trackPerformanceEntries();
      this.trackFPS();
      this.trackNetworkRequests();
      this.trackConsoleErrors();
      
      // Обновление метрик каждые 5 секунд
      setInterval(() => this.updateMetrics(), 5000);
    }

    // Отслеживание времени загрузки
    trackLoadTime() {
      if (performance.timing) {
        const timing = performance.timing;
        this.metrics.performance.loadTime = timing.loadEventEnd - timing.navigationStart;
      }
      
      // Для современных браузеров с PerformanceNavigationTiming
      if (performance.getEntriesByType) {
        const navEntries = performance.getEntriesByType('navigation');
        if (navEntries.length > 0) {
          const navTiming = navEntries[0];
          this.metrics.performance.loadTime = navTiming.loadEventEnd - navTiming.fetchStart;
        }
      }
    }

    // Отслеживание активности пользователя
    trackUserActivity() {
      const resetIdleTimer = () => {
        try {
          this.metrics.userActivity.lastActivity = Date.now();
          if (this.idleTimer) {
            clearTimeout(this.idleTimer);
          }
          this.idleTimer = setTimeout(() => {
            this.metrics.userActivity.idleTime += 30000; // 30 секунд бездействия
          }, 30000);
        } catch (err) {
          console.warn('Idle timer error:', err);
        }
      };

      document.addEventListener('click', (e) => {
        try {
          this.metrics.userActivity.clicks++;
          
          // Записываем детали клика (ограничено до 50 последних)
          if (!this.metrics.userActivity.clickEvents) {
            this.metrics.userActivity.clickEvents = [];
          }
          
          const clickData = {
            timestamp: Date.now(),
            target: e.target ? (e.target.tagName || 'unknown') : 'unknown',
            x: e.clientX || 0,
            y: e.clientY || 0
          };
          
          this.metrics.userActivity.clickEvents.push(clickData);
          
          if (this.metrics.userActivity.clickEvents.length > 50) {
            this.metrics.userActivity.clickEvents.shift();
          }
          
          resetIdleTimer();
        } catch (err) {
          console.warn('Click tracking error:', err);
        }
      });

      document.addEventListener('keydown', () => {
        try {
          this.metrics.userActivity.keystrokes++;
          resetIdleTimer();
        } catch (err) {
          console.warn('Keystroke tracking error:', err);
        }
      });

      document.addEventListener('scroll', () => {
        try {
          this.metrics.userActivity.scrolls++;
          resetIdleTimer();
        } catch (err) {
          console.warn('Scroll tracking error:', err);
        }
      });

      document.addEventListener('visibilitychange', () => {
        try {
          if (document.visibilityState === 'visible') {
            this.metrics.userActivity.tabSwitches++;
          }
          resetIdleTimer();
        } catch (err) {
          console.warn('Visibility tracking error:', err);
        }
      });
    }

    // Отслеживание памяти
    trackMemoryUsage() {
      if (performance.memory) {
        const recordMemory = () => {
          const memory = {
            used: Math.round(performance.memory.usedJSHeapSize / 1048576), // MB
            total: Math.round(performance.memory.totalJSHeapSize / 1048576), // MB
            limit: Math.round(performance.memory.jsHeapSizeLimit / 1048576), // MB
            timestamp: Date.now()
          };
          
          this.metrics.performance.memoryUsage.push(memory);
          
          // Ограничиваем историю до 100 записей
          if (this.metrics.performance.memoryUsage.length > 100) {
            this.metrics.performance.memoryUsage.shift();
          }
        };
        
        // Первая запись сразу
        recordMemory();
        
        // Затем каждые 10 секунд
        setInterval(recordMemory, 10000);
      }
    }

    // Отслеживание FPS
    trackFPS() {
      this.fpsCounter.start((fps) => {
        this.metrics.performance.fpsHistory.push({
          fps: fps,
          timestamp: Date.now()
        });
        
        // Ограничиваем историю до 50 записей
        if (this.metrics.performance.fpsHistory.length > 50) {
          this.metrics.performance.fpsHistory.shift();
        }
      });
    }

    // Отслеживание ошибок
    trackErrors() {
      global.addEventListener('error', (event) => {
        this.metrics.errors.jsErrors.push({
          message: event.message,
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          stack: event.error ? event.error.stack : null,
          timestamp: Date.now()
        });
        this.metrics.performance.errorCount++;
        
        // Ограничиваем количество сохраняемых ошибок
        if (this.metrics.errors.jsErrors.length > 50) {
          this.metrics.errors.jsErrors.shift();
        }
      });

      global.addEventListener('unhandledrejection', (event) => {
        this.metrics.errors.jsErrors.push({
          message: 'Unhandled Promise Rejection: ' + event.reason,
          filename: 'Promise',
          lineno: 0,
          colno: 0,
          stack: event.reason ? event.reason.stack : null,
          timestamp: Date.now()
        });
        this.metrics.performance.errorCount++;
        
        // Ограничиваем количество сохраняемых ошибок
        if (this.metrics.errors.jsErrors.length > 50) {
          this.metrics.errors.jsErrors.shift();
        }
      });
    }

    // Обновление навигационных метрик
    updateNavigationTiming(entry) {
      if (entry.entryType === 'navigation') {
        this.metrics.performance.loadTime = entry.loadEventEnd - entry.fetchStart;
        this.metrics.performance.renderTime = entry.loadEventEnd - entry.responseEnd;
        
        // Дополнительные метрики навигации
        this.metrics.timing.apiCallTimes.set('DNS', {
          duration: entry.domainLookupEnd - entry.domainLookupStart,
          success: true,
          timestamp: Date.now()
        });
        
        this.metrics.timing.apiCallTimes.set('TCP', {
          duration: entry.connectEnd - entry.connectStart,
          success: true,
          timestamp: Date.now()
        });
        
        this.metrics.timing.apiCallTimes.set('Request', {
          duration: entry.responseEnd - entry.requestStart,
          success: true,
          timestamp: Date.now()
        });
      }
    }

    // Отслеживание Performance API
    trackPerformanceEntries() {
      if ('PerformanceObserver' in global) {
        try {
          const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              if (entry.entryType === 'measure') {
                this.metrics.timing.componentRenderTimes.set(entry.name, entry.duration);
              } else if (entry.entryType === 'navigation') {
                this.updateNavigationTiming(entry);
              }
            }
          });
          
          observer.observe({ entryTypes: ['measure', 'navigation', 'resource'] });
          this.observers.push(observer);
        } catch (e) {
          console.warn('PerformanceObserver not supported:', e);
        }
      }
    }

    // Отслеживание сетевых запросов
    trackNetworkRequests() {
      const originalFetch = global.fetch;
      if (originalFetch) {
        global.fetch = async (...args) => {
          const start = Date.now();
          let url = 'unknown';
          let method = 'GET';
          
          try {
            // Безопасное извлечение URL
            if (typeof args[0] === 'string') {
              url = args[0];
            } else if (args[0] && args[0].url) {
              url = args[0].url;
            } else if (args[0] && typeof args[0].toString === 'function') {
              url = args[0].toString();
            }
            
            // Ограничиваем длину URL для экономии памяти
            if (url.length > 200) {
              url = url.substring(0, 197) + '...';
            }
            
            // Извлекаем метод
            if (args[1] && args[1].method) {
              method = args[1].method;
            }
          } catch (err) {
            console.warn('URL parsing error:', err);
          }
          
          try {
            const response = await originalFetch(...args);
            const duration = Date.now() - start;
            const contentLength = response.headers ? response.headers.get('content-length') : null;
            
            // Инициализируем массив если его нет
            if (!this.metrics.performance.networkRequests) {
              this.metrics.performance.networkRequests = [];
            }
            
            this.metrics.performance.networkRequests.push({
              url: url,
              method: method,
              status: response.status || 0,
              duration: duration,
              size: contentLength ? parseInt(contentLength) || 0 : 0,
              timestamp: start,
              success: response.ok || false
            });
            
            // Ограничиваем количество записей до 100
            if (this.metrics.performance.networkRequests.length > 100) {
              this.metrics.performance.networkRequests.shift();
            }
            
            return response;
          } catch (error) {
            const duration = Date.now() - start;
            
            // Инициализируем массив если его нет
            if (!this.metrics.errors.networkErrors) {
              this.metrics.errors.networkErrors = [];
            }
            
            this.metrics.errors.networkErrors.push({
              url: url,
              method: method,
              error: error.message || 'Unknown error',
              duration: duration,
              timestamp: start
            });
            
            // Ограничиваем количество записей до 50
            if (this.metrics.errors.networkErrors.length > 50) {
              this.metrics.errors.networkErrors.shift();
            }
            
            throw error;
          }
        };
      }
    }

    // Отслеживание ошибок консоли
    trackConsoleErrors() {
      const originalError = console.error;
      const originalWarn = console.warn;
      
      console.error = (...args) => {
        try {
          // Инициализируем массив если его нет
          if (!this.metrics.errors.consoleErrors) {
            this.metrics.errors.consoleErrors = [];
          }
          
          this.metrics.errors.consoleErrors.push({
            type: 'error',
            message: args.map(arg => typeof arg === 'string' ? arg : String(arg)).join(' '),
            timestamp: Date.now()
          });
          
          // Ограничиваем до 50 записей
          if (this.metrics.errors.consoleErrors.length > 50) {
            this.metrics.errors.consoleErrors.shift();
          }
        } catch (err) {
          // Тихая ошибка чтобы не создавать рекурсию
        }
        
        originalError.apply(console, args);
      };
      
      console.warn = (...args) => {
        try {
          // Инициализируем массив если его нет
          if (!this.metrics.performance.warnings) {
            this.metrics.performance.warnings = [];
          }
          
          this.metrics.performance.warnings.push({
            message: args.map(arg => typeof arg === 'string' ? arg : String(arg)).join(' '),
            timestamp: Date.now()
          });
          
          // Ограничиваем до 30 записей
          if (this.metrics.performance.warnings.length > 30) {
            this.metrics.performance.warnings.shift();
          }
        } catch (err) {
          // Тихая ошибка чтобы не создавать рекурсию
        }
        
        originalWarn.apply(console, args);
      };
    }

    // Обновление метрик
    updateMetrics() {
      if (!this.isTracking) return;
      
      // Обновляем активное время
      const now = Date.now();
      const timeSinceLastActivity = now - this.metrics.userActivity.lastActivity;
      
      if (timeSinceLastActivity < 30000) { // Если активность была менее 30 сек назад
        this.metrics.userActivity.activeTime += 5000; // Добавляем 5 сек активного времени
      }
      
      // Обновляем информацию о соединении
      this.metrics.system.connection = this.getConnectionInfo();
      
      // Проверяем онлайн статус
      this.metrics.system.browser.onLine = navigator.onLine;
    }

    // Методы для внешнего API
    trackModuleLoad(moduleName, duration) {
      this.metrics.timing.moduleLoadTimes.set(moduleName, duration);
    }

    trackComponentRender(componentName, duration) {
      this.metrics.timing.componentRenderTimes.set(componentName, duration);
    }

    trackApiCall(apiName, duration, success = true) {
      this.metrics.timing.apiCallTimes.set(apiName, {
        duration: duration,
        success: success,
        timestamp: Date.now()
      });
    }

    trackSearch(query, resultsCount, duration) {
      this.metrics.timing.searchTimes.push({
        query: query.length, // Сохраняем только длину для приватности
        resultsCount: resultsCount,
        duration: duration,
        timestamp: Date.now()
      });
      this.metrics.dataMetrics.searchQueries++;
    }

    trackDataOperation(type, count = 1) {
      switch(type) {
        case 'products-loaded':
          this.metrics.dataMetrics.productsLoaded += count;
          break;
        case 'meal-created':
          this.metrics.dataMetrics.mealsCreated += count;
          break;
        case 'day-viewed':
          this.metrics.dataMetrics.daysViewed += count;
          break;
        case 'cloud-sync':
          this.metrics.dataMetrics.cloudSyncs += count;
          break;
        case 'storage-op':
          this.metrics.dataMetrics.storageOps += count;
          break;
        case 'cache-hit':
          this.metrics.dataMetrics.cacheHits += count;
          break;
        case 'cache-miss':
          this.metrics.dataMetrics.cacheMisses += count;
          break;
      }
    }

    // Экспорт всех метрик
    exportMetrics() {
      const sessionDuration = Date.now() - this.sessionStart;
      const avgFPS = this.metrics.performance.fpsHistory.length > 0 ? 
        this.metrics.performance.fpsHistory.reduce((sum, entry) => sum + entry.fps, 0) / this.metrics.performance.fpsHistory.length : 0;
      
      const avgMemory = this.metrics.performance.memoryUsage.length > 0 ?
        this.metrics.performance.memoryUsage.reduce((sum, entry) => sum + entry.used, 0) / this.metrics.performance.memoryUsage.length : 0;

      return {
        sessionInfo: {
          duration: sessionDuration,
          started: new Date(this.sessionStart).toISOString(),
          exported: new Date().toISOString()
        },
        summary: {
          avgFPS: Math.round(avgFPS * 100) / 100,
          avgMemoryMB: Math.round(avgMemory * 100) / 100,
          totalErrors: this.metrics.performance.errorCount,
          totalWarnings: this.metrics.performance.warnings.length,
          userActivity: {
            totalClicks: this.metrics.userActivity.clicks,
            totalKeystrokes: this.metrics.userActivity.keystrokes,
            totalScrolls: this.metrics.userActivity.scrolls,
            activeTimeMinutes: Math.round(this.metrics.userActivity.activeTime / 60000),
            idleTimeMinutes: Math.round(this.metrics.userActivity.idleTime / 60000)
          },
          dataOperations: this.metrics.dataMetrics
        },
        detailedMetrics: this.metrics
      };
    }

    // Методы управления
    startTracking() {
      this.isTracking = true;
    }

    stopTracking() {
      this.isTracking = false;
      this.observers.forEach(observer => observer.disconnect());
      this.fpsCounter.stop();
    }

    reset() {
      this.stopTracking();
      this.metrics = {}; // Сброс метрик
      this.sessionStart = Date.now();
      this.initializeTracking();
    }
  }

  // FPS Counter
  class FPSCounter {
    constructor() {
      this.frameCount = 0;
      this.lastTime = performance.now();
      this.callback = null;
      this.animationId = null;
    }

    start(callback) {
      this.callback = callback;
      this.frameCount = 0;
      this.lastTime = performance.now();
      this.loop();
    }

    loop() {
      this.animationId = requestAnimationFrame(() => {
        this.frameCount++;
        const currentTime = performance.now();
        
        if (currentTime - this.lastTime >= 1000) {
          const fps = Math.round((this.frameCount * 1000) / (currentTime - this.lastTime));
          if (this.callback) this.callback(fps);
          
          this.frameCount = 0;
          this.lastTime = currentTime;
        }
        
        this.loop();
      });
    }

    stop() {
      if (this.animationId) {
        cancelAnimationFrame(this.animationId);
        this.animationId = null;
      }
    }
  }

  // Инициализация
  const analytics = new PerformanceAnalytics();
  
  // Экспорт в HEYS namespace
  HEYS.analytics = {
    trackModuleLoad: (name, duration) => analytics.trackModuleLoad(name, duration),
    trackComponentRender: (name, duration) => analytics.trackComponentRender(name, duration),
    trackApiCall: (name, duration, success) => analytics.trackApiCall(name, duration, success),
    trackSearch: (query, count, duration) => analytics.trackSearch(query, count, duration),
    trackDataOperation: (type, count) => analytics.trackDataOperation(type, count),
    exportMetrics: () => analytics.exportMetrics(),
    startTracking: () => analytics.startTracking(),
    stopTracking: () => analytics.stopTracking(),
    reset: () => analytics.reset(),
    getMetrics: () => analytics.metrics
  };

  // Автотрекинг загрузки модулей
  const originalScript = document.createElement;
  document.createElement = function(tagName) {
    const element = originalScript.call(this, tagName);
    if (tagName.toLowerCase() === 'script') {
      const originalOnLoad = element.onload;
      element.onload = function() {
        if (element.src && element.src.includes('heys_')) {
          const moduleName = element.src.split('/').pop().split('?')[0];
          analytics.trackModuleLoad(moduleName, Date.now() - element.loadStart || 0);
        }
        if (originalOnLoad) originalOnLoad.call(this);
      };
      element.loadStart = Date.now();
    }
    return element;
  };

})(window);
