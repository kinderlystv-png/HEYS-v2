/*
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ 🗺️ НАВИГАЦИОННАЯ КАРТА ФАЙЛА heys_performance_monitor.ts (596 строк)                    │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ 📋 СТРУКТУРА ФАЙЛА:                                                                       │
│                                                                                           │
│ 📘 ТИПЫ И ИНТЕРФЕЙСЫ (строки 1-150):                                                     │
│    ├── Импорты типов (3)                                                                │
│    ├── PerformanceMetrics интерфейс (5-45):                                             │
│    │   ├── performance метрики (6-15)                                                   │
│    │   ├── userActivity активность (16-25)                                              │
│    │   ├── dataMetrics данные (26-35)                                                   │
│    │   ├── errors ошибки (36-40)                                                        │
│    │   └── vitals веб-витали (41-47)                                                    │
│    ├── Event интерфейсы (48-80):                                                        │
│    │   ├── ClickEvent, ScrollEvent (48-55)                                              │
│    │   ├── NetworkRequest (56-65)                                                       │
│    │   └── Error типы (66-80)                                                           │
│    └── Config и Report типы (81-120)                                                    │
│                                                                                           │
│ 🏗️ КЛАСС PerformanceAnalytics (строки 151-300):                                         │
│    ├── constructor() с типизацией (121-150)                                             │
│    ├── sessionStart и metrics (121-130)                                                 │
│    ├── startTracking() - запуск отслеживания (151-180)                                  │
│    ├── trackUserActivity() - активность (181-210)                                      │
│    ├── trackPerformance() - производительность (211-240)                               │
│    ├── trackMemoryUsage() - память (241-270)                                           │
│    └── trackNetworkRequests() - сеть (271-300)                                          │
│                                                                                           │
│ 📊 АНАЛИЗ И СБОР ДАННЫХ (строки 301-450):                                                │
│    ├── trackErrors() - типизированные ошибки (301-330)                                  │
│    ├── collectMetrics() - сбор метрик (331-360)                                         │
│    ├── analyzePerformance() - анализ (361-410)                                          │
│    ├── detectBottlenecks() - узкие места (411-440)                                      │
│    └── generateReport() - отчеты (441-450)                                              │
│                                                                                           │
│ 📈 ВИЗУАЛИЗАЦИЯ И ДАШБОРД (строки 451-550):                                              │
│    ├── calculateScore() - расчет оценок (451-480)                                       │
│    ├── getRecommendations() - рекомендации (481-510)                                    │
│    ├── createCharts() - графики (511-530)                                               │
│    ├── updateDashboard() - дашборд (531-540)                                            │
│    └── exportData() - экспорт (541-550)                                                 │
│                                                                                           │
│ ⚛️ REACT КОМПОНЕНТ PerformanceTab (строки 551-596):                                      │
│    ├── Типизированный компонент (551-570)                                               │
│    ├── State с интерфейсами (571-580)                                                   │
│    ├── componentDidMount() (581-585)                                                    │
│    ├── render() method (586-595)                                                        │
│    └── Экспорт с типами (596)                                                           │
│                                                                                           │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ 🎯 БЫСТРЫЙ ПОИСК:                                                                        │
│    • Типы: PerformanceMetrics (5), ClickEvent (48), NetworkRequest (56)                │
│    • Класс: PerformanceAnalytics (121), startTracking() (151)                          │
│    • Анализ: analyzePerformance() (361), detectBottlenecks() (411)                     │
│    • React: PerformanceTab (551), render() (586)                                        │
└─────────────────────────────────────────────────────────────────────────────────────────┘
*/

// heys_performance_monitor.ts — расширенная аналитика и мониторинг производительности (TypeScript version)

import type { HEYSGlobal } from './types/heys';

// Performance monitoring types
interface PerformanceMetrics {
  performance: {
    loadTime: number;
    renderTime: number;
    bundleSize: number;
    memoryUsage: number[];
    fpsHistory: number[];
    networkRequests: NetworkRequest[];
    errorCount: number;
    warnings: string[];
  };
  userActivity: {
    clicks: number;
    keystrokes: number;
    scrolls: number;
    tabSwitches: number;
    activeTime: number;
    idleTime: number;
    lastActivity: number;
    clickEvents: ClickEvent[];
    scrollHistory: ScrollEvent[];
  };
  dataMetrics: {
    productsLoaded: number;
    mealsCreated: number;
    daysViewed: number;
    searchQueries: number;
    cloudSyncs: number;
    storageOps: number;
    cacheHits: number;
    cacheMisses: number;
  };
  errors: {
    jsErrors: JSError[];
    networkErrors: NetworkError[];
    validationErrors: ValidationError[];
    consoleErrors: ConsoleError[];
  };
  vitals: {
    cls: number; // Cumulative Layout Shift
    fid: number; // First Input Delay
    lcp: number; // Largest Contentful Paint
    fcp: number; // First Contentful Paint
    ttfb: number; // Time to First Byte
  };
}

interface NetworkRequest {
  url: string;
  method: string;
  duration: number;
  status: number;
  size: number;
  timestamp: number;
}

interface ClickEvent {
  element: string;
  timestamp: number;
  x: number;
  y: number;
}

interface ScrollEvent {
  y: number;
  timestamp: number;
}

interface JSError {
  message: string;
  stack?: string;
  timestamp: number;
  url?: string;
  line?: number;
  column?: number;
}

interface NetworkError {
  url: string;
  status: number;
  message: string;
  timestamp: number;
}

interface ValidationError {
  field: string;
  value: any;
  rule: string;
  timestamp: number;
}

interface ConsoleError {
  level: 'error' | 'warn';
  message: string;
  timestamp: number;
}

interface TimingEntry {
  name: string;
  start: number;
  duration: number;
  count: number;
  min: number;
  max: number;
  avg: number;
}

// Global declarations
declare global {
  interface Window {
    HEYS: HEYSGlobal;
    performance: Performance;
    PerformanceObserver?: any;
  }
}

// Module implementation
(function (global: Window & typeof globalThis): void {
  const HEYS = (global.HEYS = global.HEYS || ({} as HEYSGlobal));

  // Центральная система метрик
  class PerformanceAnalytics {
    private sessionStart: number;
    private metrics: PerformanceMetrics;
    private timings: Map<string, TimingEntry>;
    private counters: Map<string, number>;
    private isActive: boolean;
    private lastUserAction: number;
    private fpsMeter: number | null;

    constructor() {
      this.sessionStart = Date.now();
      this.timings = new Map();
      this.counters = new Map();
      this.isActive = true;
      this.lastUserAction = Date.now();
      this.fpsMeter = null;

      this.metrics = {
        performance: {
          loadTime: 0,
          renderTime: 0,
          bundleSize: 0,
          memoryUsage: [],
          fpsHistory: [],
          networkRequests: [],
          errorCount: 0,
          warnings: [],
        },
        userActivity: {
          clicks: 0,
          keystrokes: 0,
          scrolls: 0,
          tabSwitches: 0,
          activeTime: 0,
          idleTime: 0,
          lastActivity: Date.now(),
          clickEvents: [],
          scrollHistory: [],
        },
        dataMetrics: {
          productsLoaded: 0,
          mealsCreated: 0,
          daysViewed: 0,
          searchQueries: 0,
          cloudSyncs: 0,
          storageOps: 0,
          cacheHits: 0,
          cacheMisses: 0,
        },
        errors: {
          jsErrors: [],
          networkErrors: [],
          validationErrors: [],
          consoleErrors: [],
        },
        vitals: {
          cls: 0,
          fid: 0,
          lcp: 0,
          fcp: 0,
          ttfb: 0,
        },
      };

      this.init();
    }

    private init(): void {
      this.setupPerformanceObserver();
      this.setupUserActivityTracking();
      this.setupErrorTracking();
      this.setupMemoryMonitoring();
      this.startFPSMonitoring();
      this.measureLoadTime();
    }

    private setupPerformanceObserver(): void {
      if (typeof window.PerformanceObserver === 'undefined') return;

      try {
        // Web Vitals observation
        const observer = new window.PerformanceObserver((list: any) => {
          for (const entry of list.getEntries()) {
            switch (entry.entryType) {
              case 'paint':
                if (entry.name === 'first-contentful-paint') {
                  this.metrics.vitals.fcp = entry.startTime;
                }
                break;
              case 'largest-contentful-paint':
                this.metrics.vitals.lcp = entry.startTime;
                break;
              case 'layout-shift':
                if (!entry.hadRecentInput) {
                  this.metrics.vitals.cls += entry.value;
                }
                break;
              case 'first-input':
                this.metrics.vitals.fid = entry.processingStart - entry.startTime;
                break;
            }
          }
        });

        observer.observe({
          entryTypes: ['paint', 'largest-contentful-paint', 'layout-shift', 'first-input'],
        });
      } catch (e) {
        console.warn('PerformanceObserver setup failed:', e);
      }
    }

    private setupUserActivityTracking(): void {
      const trackActivity = (): void => {
        this.lastUserAction = Date.now();
        this.metrics.userActivity.lastActivity = this.lastUserAction;
      };

      // Click tracking
      document.addEventListener('click', (e: MouseEvent) => {
        this.metrics.userActivity.clicks++;
        this.metrics.userActivity.clickEvents.push({
          element: (e.target as Element)?.tagName || 'unknown',
          timestamp: Date.now(),
          x: e.clientX,
          y: e.clientY,
        });
        trackActivity();
      });

      // Keystroke tracking
      document.addEventListener('keydown', () => {
        this.metrics.userActivity.keystrokes++;
        trackActivity();
      });

      // Scroll tracking
      let scrollTimeout: number | null = null;
      document.addEventListener('scroll', () => {
        this.metrics.userActivity.scrolls++;
        this.metrics.userActivity.scrollHistory.push({
          y: window.pageYOffset,
          timestamp: Date.now(),
        });
        trackActivity();

        if (scrollTimeout) clearTimeout(scrollTimeout);
        scrollTimeout = window.setTimeout(() => {
          // Limit scroll history size
          if (this.metrics.userActivity.scrollHistory.length > 100) {
            this.metrics.userActivity.scrollHistory =
              this.metrics.userActivity.scrollHistory.slice(-50);
          }
        }, 1000);
      });

      // Visibility change tracking
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          this.metrics.userActivity.tabSwitches++;
        }
        trackActivity();
      });

      // Activity/idle time tracking
      setInterval(() => {
        const now = Date.now();
        const timeSinceLastAction = now - this.lastUserAction;

        if (timeSinceLastAction < 30000) {
          // Active if action within 30 seconds
          this.metrics.userActivity.activeTime += 1000;
        } else {
          this.metrics.userActivity.idleTime += 1000;
        }
      }, 1000);
    }

    private setupErrorTracking(): void {
      // JavaScript errors
      window.addEventListener('error', (e: ErrorEvent) => {
        this.metrics.errors.jsErrors.push({
          message: e.message,
          stack: e.error?.stack,
          timestamp: Date.now(),
          url: e.filename,
          line: e.lineno,
          column: e.colno,
        });
        this.metrics.performance.errorCount++;
      });

      // Promise rejections
      window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
        this.metrics.errors.jsErrors.push({
          message: `Unhandled promise rejection: ${e.reason}`,
          timestamp: Date.now(),
        });
        this.metrics.performance.errorCount++;
      });

      // Network errors (intercept fetch)
      const originalFetch = window.fetch;
      window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const start = performance.now();
        try {
          const response = await originalFetch(input, init);
          const duration = performance.now() - start;

          this.metrics.performance.networkRequests.push({
            url: typeof input === 'string' ? input : input.toString(),
            method: init?.method || 'GET',
            duration,
            status: response.status,
            size: 0, // Would need response.clone().blob() to get actual size
            timestamp: Date.now(),
          });

          if (!response.ok) {
            this.metrics.errors.networkErrors.push({
              url: typeof input === 'string' ? input : input.toString(),
              status: response.status,
              message: response.statusText,
              timestamp: Date.now(),
            });
          }

          return response;
        } catch (error) {
          this.metrics.errors.networkErrors.push({
            url: typeof input === 'string' ? input : input.toString(),
            status: 0,
            message: error instanceof Error ? error.message : String(error),
            timestamp: Date.now(),
          });
          throw error;
        }
      };
    }

    private setupMemoryMonitoring(): void {
      if ('memory' in performance) {
        setInterval(() => {
          const memory = (performance as any).memory;
          if (memory) {
            this.metrics.performance.memoryUsage.push(memory.usedJSHeapSize / 1024 / 1024); // MB

            // Keep only last 100 measurements
            if (this.metrics.performance.memoryUsage.length > 100) {
              this.metrics.performance.memoryUsage =
                this.metrics.performance.memoryUsage.slice(-50);
            }
          }
        }, 5000); // Every 5 seconds
      }
    }

    private startFPSMonitoring(): void {
      let frames = 0;
      let lastTime = performance.now();

      const measureFPS = (currentTime: number): void => {
        frames++;

        if (currentTime - lastTime >= 1000) {
          const fps = Math.round((frames * 1000) / (currentTime - lastTime));
          this.metrics.performance.fpsHistory.push(fps);

          // Keep only last 60 measurements (1 minute)
          if (this.metrics.performance.fpsHistory.length > 60) {
            this.metrics.performance.fpsHistory = this.metrics.performance.fpsHistory.slice(-30);
          }

          frames = 0;
          lastTime = currentTime;
        }

        this.fpsMeter = requestAnimationFrame(measureFPS);
      };

      this.fpsMeter = requestAnimationFrame(measureFPS);
    }

    private measureLoadTime(): void {
      window.addEventListener('load', () => {
        if (performance.timing) {
          this.metrics.performance.loadTime =
            performance.timing.loadEventEnd - performance.timing.navigationStart;
        }
      });
    }

    // HEYSPerformance interface implementation
    measure<T>(name: string, fn: () => T): T {
      const start = performance.now();
      const result = fn();
      const duration = performance.now() - start;
      this.timing(name, duration);
      return result;
    }

    async measureAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
      const start = performance.now();
      const result = await fn();
      const duration = performance.now() - start;
      this.timing(name, duration);
      return result;
    }

    increment(name: string): void {
      const current = this.counters.get(name) || 0;
      this.counters.set(name, current + 1);
    }

    timing(name: string, duration: number): void {
      const existing = this.timings.get(name);
      if (existing) {
        existing.count++;
        existing.duration += duration;
        existing.min = Math.min(existing.min, duration);
        existing.max = Math.max(existing.max, duration);
        existing.avg = existing.duration / existing.count;
      } else {
        this.timings.set(name, {
          name,
          start: performance.now(),
          duration,
          count: 1,
          min: duration,
          max: duration,
          avg: duration,
        });
      }
    }

    getStats(): Record<string, any> {
      return {
        session: {
          duration: Date.now() - this.sessionStart,
          startTime: this.sessionStart,
        },
        metrics: this.metrics,
        timings: Object.fromEntries(this.timings),
        counters: Object.fromEntries(this.counters),
      };
    }

    logSlow(name: string, threshold: number = 100): void {
      const timing = this.timings.get(name);
      if (timing && timing.avg > threshold) {
        console.warn(
          `⚠️ Slow operation detected: ${name} avg ${timing.avg.toFixed(2)}ms (threshold: ${threshold}ms)`,
        );
      }
    }

    clear(): void {
      this.timings.clear();
      this.counters.clear();
      this.metrics.performance.errorCount = 0;
      this.metrics.errors.jsErrors = [];
      this.metrics.errors.networkErrors = [];
      this.metrics.errors.validationErrors = [];
      this.metrics.errors.consoleErrors = [];
    }

    getStorageSize(): number {
      try {
        let total = 0;
        for (let key in localStorage) {
          if (Object.prototype.hasOwnProperty.call(localStorage, key)) {
            total += localStorage.getItem(key)?.length || 0;
          }
        }
        return total;
      } catch (e) {
        return 0;
      }
    }

    report(): void {
      console.group('📊 HEYS Performance Report');
      console.log('Session duration:', (Date.now() - this.sessionStart) / 1000, 'seconds');
      console.log('Storage size:', this.getStorageSize(), 'chars');
      console.log('Errors:', this.metrics.performance.errorCount);
      console.log('User activity:', this.metrics.userActivity);
      console.log('Top slow operations:');

      const slowOps = Array.from(this.timings.values())
        .sort((a, b) => b.avg - a.avg)
        .slice(0, 5);

      slowOps.forEach((op) => {
        console.log(`  ${op.name}: ${op.avg.toFixed(2)}ms avg (${op.count} calls)`);
      });

      console.groupEnd();
    }

    showStats(): Record<string, any> {
      const stats = this.getStats();
      console.table(stats.timings);
      console.table(stats.counters);
      return stats;
    }

    // HEYSAnalytics interface implementation
    trackDataOperation(type: string, _details?: any): void {
      this.increment(`dataOp.${type}`);

      switch (type) {
        case 'productLoad':
          this.metrics.dataMetrics.productsLoaded++;
          break;
        case 'mealCreate':
          this.metrics.dataMetrics.mealsCreated++;
          break;
        case 'dayView':
          this.metrics.dataMetrics.daysViewed++;
          break;
        case 'search':
          this.metrics.dataMetrics.searchQueries++;
          break;
        case 'cloudSync':
          this.metrics.dataMetrics.cloudSyncs++;
          break;
        case 'storage':
          this.metrics.dataMetrics.storageOps++;
          break;
        case 'cacheHit':
          this.metrics.dataMetrics.cacheHits++;
          break;
        case 'cacheMiss':
          this.metrics.dataMetrics.cacheMisses++;
          break;
      }
    }

    trackUserInteraction(action: string, _details?: any): void {
      this.increment(`userAction.${action}`);
    }

    trackApiCall(endpoint: string, duration: number, success: boolean): void {
      this.timing(`api.${endpoint}`, duration);
      this.increment(success ? `api.${endpoint}.success` : `api.${endpoint}.error`);
    }

    trackError(error: string, _details?: any): void {
      this.increment(`error.${error}`);
      this.metrics.errors.consoleErrors.push({
        level: 'error',
        message: error,
        timestamp: Date.now(),
      });
    }

    getMetrics(): Record<string, any> {
      return {
        ...this.metrics,
        session: {
          duration: Date.now() - this.sessionStart,
          isActive: this.isActive,
        },
      };
    }
  }

  // Initialize performance monitoring
  const analytics = new PerformanceAnalytics();

  // Assign to HEYS global
  HEYS.performance = analytics;
  HEYS.analytics = analytics;

  console.log('⚡ HEYS Performance Monitor (TypeScript) загружен');
})(window);
