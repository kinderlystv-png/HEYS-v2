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
import type { MonitoringConfig as LegacyMonitoringConfig } from './performance';
import { measure, measureAsync, monitor, recordError, recordMetric } from './performance';

// Monitoring utilities
export const createMonitoringConfig = (
  config: Partial<LegacyMonitoringConfig> = {},
): LegacyMonitoringConfig => ({
  enabled: process.env.NODE_ENV === 'production',
  batchSize: 100,
  flushInterval: 30000,
  enableRealtime: false,
  ...config,
});

// Global monitoring setup with new services
export const setupMonitoring = (config?: Partial<LegacyMonitoringConfig>) => {
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
