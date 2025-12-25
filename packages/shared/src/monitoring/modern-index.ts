/**
 * Monitoring Module Index - Updated
 * Exports all monitoring components including new Sentry and logging integration
 */

// Core monitoring services
export { default as StructuredLogger } from './logger';
export {
  CaptureMethodErrors,
  getGlobalMonitoring,
  globalMonitoringService,
  initializeGlobalMonitoring,
  default as MonitoringService,
  MonitorMethod,
} from './monitoring-service';
export { default as SentryMonitoring } from './sentry-monitoring';

// Re-export types
export type { LoggerConfig, LogLevel } from './logger';
export type { MonitoringConfig } from './monitoring-service';
export type { SentryConfig } from './sentry-monitoring';

// Convenience exports for Sentry
export {
  CaptureErrors,
  getGlobalMonitoring as getSentry,
  initializeGlobalMonitoring as initializeSentry,
  MonitorPerformance,
} from './sentry-monitoring';

// Convenience exports for Logging
export { getGlobalLogger, initializeGlobalLogger, LogErrors, LogPerformance } from './logger';

// Legacy performance monitoring (keeping for compatibility)
export {
  measure,
  measureAsync,
  monitor,
  PerformanceMonitor,
  recordError,
  recordMetric,
  type ErrorReport,
  type MonitoringConfig as LegacyMonitoringConfig,
  type PerformanceMetric,
} from './performance';

// Real-time monitoring (keeping for compatibility)
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
import type { MonitoringConfig as LegacyMonitoringConfig } from './performance';
import { measure, measureAsync, monitor, recordError, recordMetric } from './performance';

/**
 * Проверка production-окружения (Browser + Node.js)
 */
const isProductionEnvironment = (): boolean => {
  const metaEnv =
    typeof import.meta !== 'undefined' ? (import.meta as { env?: { MODE?: string } }).env : undefined;
  if (metaEnv?.MODE === 'production') {
    return true;
  }
  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'production') {
    return true;
  }
  return false;
};

// Monitoring utilities
export const createMonitoringConfig = (
  config: Partial<LegacyMonitoringConfig> = {},
): LegacyMonitoringConfig => ({
  enabled: isProductionEnvironment(),
  batchSize: 100,
  flushInterval: 30000,
  enableRealtime: false,
  ...config,
});

// Global monitoring setup with new services
export const setupMonitoring = (config?: Partial<LegacyMonitoringConfig>) => {
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
