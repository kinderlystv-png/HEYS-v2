/**
 * Monitoring Index
 *
 * Central export point for all monitoring functionality
 */

// Performance monitoring
export {
  measure,
  measureAsync,
  monitor,
  PerformanceMonitor,
  recordError,
  recordMetric,
  type ErrorReport,
  type MonitoringConfig,
  type PerformanceMetric,
} from './performance';

// Real-time monitoring
export {
  addAlert,
  getActiveAlerts,
  getLiveMetrics,
  RealtimeMonitor,
  realtimeMonitor,
  removeAlert,
  updateLiveMetric,
  type Alert,
  type AlertRule,
  type LiveMetric,
} from './realtime';

// Import for internal use
import type { MonitoringConfig } from './performance';
import { measure, measureAsync, monitor, recordError, recordMetric } from './performance';

/**
 * Универсальная проверка production-окружения (Node.js + Browser)
 */
const isProductionEnvironment = (): boolean => {
  // Vite / современные фронтенд-сборщики
  if (typeof import.meta !== 'undefined' && (import.meta as any).env?.MODE === 'production') {
    return true;
  }
  
  // Node.js / Webpack
  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'production') {
    return true;
  }
  
  return false;
};

// Monitoring utilities
export const createMonitoringConfig = (
  config: Partial<MonitoringConfig> = {},
): MonitoringConfig => ({
  enabled: isProductionEnvironment(),
  batchSize: 100,
  flushInterval: 30000,
  enableRealtime: false,
  ...config,
});

// Global monitoring setup
export const setupMonitoring = (config?: Partial<MonitoringConfig>) => {
  const monitoringConfig = createMonitoringConfig(config);

  // Setup error boundary for unhandled errors
  if (typeof window !== 'undefined') {
    window.addEventListener('error', (event) => {
      monitor.recordError(event.error || event.message, 'high', {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      });
    });

    window.addEventListener('unhandledrejection', (event) => {
      monitor.recordError(event.reason, 'high', {
        type: 'unhandled_promise_rejection',
      });
    });
  }

  // Setup performance observer for Core Web Vitals
  if (typeof window !== 'undefined' && 'PerformanceObserver' in window) {
    try {
      // Largest Contentful Paint
      const lcpObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          monitor.recordMetric('lcp', entry.startTime, 'ms', { type: 'core_web_vital' });
        }
      });
      lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });

      // First Input Delay
      const fidObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          monitor.recordMetric('fid', (entry as any).processingStart - entry.startTime, 'ms', {
            type: 'core_web_vital',
          });
        }
      });
      fidObserver.observe({ entryTypes: ['first-input'] });

      // Cumulative Layout Shift
      const clsObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!(entry as any).hadRecentInput) {
            monitor.recordMetric('cls', (entry as any).value, 'score', { type: 'core_web_vital' });
          }
        }
      });
      clsObserver.observe({ entryTypes: ['layout-shift'] });
    } catch (error) {
      console.warn('Failed to setup Core Web Vitals monitoring:', error);
    }
  }

  return {
    config: monitoringConfig,
    monitor,
    recordMetric,
    recordError,
    measureAsync,
    measure,
  };
};
