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
import { getGlobalLogger } from './logger';
import type { MonitoringConfig } from './performance';
import { measure, measureAsync, monitor, recordError, recordMetric } from './performance';

/**
 * Универсальная проверка production-окружения (Node.js + Browser)
 */
const isProductionEnvironment = (): boolean => {
  // Vite / современные фронтенд-сборщики
  const metaEnv =
    typeof import.meta !== 'undefined' ? (import.meta as { env?: { MODE?: string } }).env : undefined;
  if (metaEnv?.MODE === 'production') {
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
  const logger = getGlobalLogger();
  const monitoringConfig = createMonitoringConfig(config);

  // Setup error boundary for unhandled errors
  if (typeof window !== 'undefined') {
    window.addEventListener('error', (event) => {
      const errorValue = event.error instanceof Error ? event.error : event.message;
      monitor.recordError(errorValue, 'high', {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      });
    });

    window.addEventListener('unhandledrejection', (event) => {
      const reasonValue = event.reason instanceof Error ? event.reason : String(event.reason);
      monitor.recordError(reasonValue, 'high', {
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
          if ('processingStart' in entry) {
            const processingStart = (entry as PerformanceEntry & { processingStart: number })
              .processingStart;
            monitor.recordMetric('fid', processingStart - entry.startTime, 'ms', {
              type: 'core_web_vital',
            });
          }
        }
      });
      fidObserver.observe({ entryTypes: ['first-input'] });

      // Cumulative Layout Shift
      const clsObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if ('hadRecentInput' in entry && 'value' in entry) {
            const layoutShift = entry as PerformanceEntry & {
              hadRecentInput: boolean;
              value: number;
            };
            if (!layoutShift.hadRecentInput) {
              monitor.recordMetric('cls', layoutShift.value, 'score', {
                type: 'core_web_vital',
              });
            }
          }
        }
      });
      clsObserver.observe({ entryTypes: ['layout-shift'] });
    } catch (error) {
      logger.warn('Failed to setup Core Web Vitals monitoring', {
        metadata: { error },
      });
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
