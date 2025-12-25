/**
 * Modern Performance Monitoring System
 *
 * Comprehensive performance tracking with metrics collection,
 * error reporting, and real-time monitoring capabilities.
 */

import { getGlobalLogger } from './logger';

export interface PerformanceMetric {
  name: string;
  value: number;
  unit: string;
  timestamp: number;
  tags?: Record<string, string>;
}

export interface ErrorReport {
  id: string;
  message: string;
  stack?: string;
  timestamp: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  context?: Record<string, unknown>;
  userId?: string;
  sessionId?: string;
}

export interface MonitoringConfig {
  enabled: boolean;
  endpoint?: string;
  apiKey?: string;
  batchSize?: number;
  flushInterval?: number;
  enableRealtime?: boolean;
}

export class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private errors: ErrorReport[] = [];
  private config: MonitoringConfig;
  private batchTimer?: ReturnType<typeof setInterval>;

  constructor(config: MonitoringConfig) {
    this.config = config;
    if (config.enabled && config.flushInterval) {
      this.startBatchReporting();
    }
  }

  /**
   * Record a performance metric
   */
  recordMetric(
    name: string,
    value: number,
    unit: string = 'ms',
    tags?: Record<string, string>,
  ): void {
    if (!this.config.enabled) return;

    const metric: PerformanceMetric = {
      name,
      value,
      unit,
      timestamp: Date.now(),
      ...(tags && { tags }),
    };

    this.metrics.push(metric);

    if (this.config.batchSize && this.metrics.length >= this.config.batchSize) {
      this.flush();
    }
  }

  /**
   * Record an error
   */
  recordError(
    error: Error | string,
    severity: ErrorReport['severity'] = 'medium',
    context?: Record<string, unknown>,
  ): void {
    if (!this.config.enabled) return;

    const errorReport: ErrorReport = {
      id: this.generateId(),
      message: typeof error === 'string' ? error : error.message,
      timestamp: Date.now(),
      severity,
      sessionId: this.getSessionId(),
      ...(typeof error === 'object' && error.stack && { stack: error.stack }),
      ...(context && { context }),
    };

    this.errors.push(errorReport);

    if (
      severity === 'critical' ||
      (this.config.batchSize && this.errors.length >= this.config.batchSize)
    ) {
      this.flush();
    }
  }

  /**
   * Measure execution time of a function
   */
  async measureAsync<T>(
    name: string,
    fn: () => Promise<T>,
    tags?: Record<string, string>,
  ): Promise<T> {
    const start = performance.now();
    try {
      const result = await fn();
      const duration = performance.now() - start;
      this.recordMetric(name, duration, 'ms', tags);
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      this.recordMetric(`${name}_error`, duration, 'ms', tags);
      this.recordError(error as Error, 'high', { operation: name, ...tags });
      throw error;
    }
  }

  /**
   * Measure execution time of a synchronous function
   */
  measure<T>(name: string, fn: () => T, tags?: Record<string, string>): T {
    const start = performance.now();
    try {
      const result = fn();
      const duration = performance.now() - start;
      this.recordMetric(name, duration, 'ms', tags);
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      this.recordMetric(`${name}_error`, duration, 'ms', tags);
      this.recordError(error as Error, 'high', { operation: name, ...tags });
      throw error;
    }
  }

  /**
   * Get current metrics
   */
  getMetrics(): PerformanceMetric[] {
    return [...this.metrics];
  }

  /**
   * Get current errors
   */
  getErrors(): ErrorReport[] {
    return [...this.errors];
  }

  /**
   * Flush metrics and errors to endpoint
   */
  async flush(): Promise<void> {
    if (!this.config.endpoint || (!this.metrics.length && !this.errors.length)) {
      return;
    }

    const payload = {
      metrics: this.metrics,
      errors: this.errors,
      timestamp: Date.now(),
    };

    try {
      await fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey && { Authorization: `Bearer ${this.config.apiKey}` }),
        },
        body: JSON.stringify(payload),
      });

      // Clear sent data
      this.metrics = [];
      this.errors = [];
    } catch (error) {
      const logger = getGlobalLogger();
      logger.warn('Failed to send monitoring data', { metadata: { error } });
    }
  }

  /**
   * Start automatic batch reporting
   */
  private startBatchReporting(): void {
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
    }

    this.batchTimer = setInterval(() => {
      this.flush();
    }, this.config.flushInterval);
  }

  /**
   * Stop monitoring and cleanup
   */
  stop(): void {
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
      delete this.batchTimer;
    }

    // Final flush
    this.flush();
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private getSessionId(): string {
    // Simple session ID generation - can be enhanced
    if (typeof window !== 'undefined' && window.sessionStorage) {
      let sessionId = window.sessionStorage.getItem('monitoring_session_id');
      if (!sessionId) {
        sessionId = this.generateId();
        window.sessionStorage.setItem('monitoring_session_id', sessionId);
      }
      return sessionId;
    }
    return 'server-session';
  }
}

/**
 * Проверка production-окружения
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

// Default instance
export const monitor = new PerformanceMonitor({
  enabled: isProductionEnvironment(),
  batchSize: 100,
  flushInterval: 30000, // 30 seconds
  enableRealtime: false,
});

// Convenient wrapper functions
export const recordMetric = (
  name: string,
  value: number,
  unit?: string,
  tags?: Record<string, string>,
) => monitor.recordMetric(name, value, unit, tags);

export const recordError = (
  error: Error | string,
  severity?: ErrorReport['severity'],
  context?: Record<string, unknown>,
) => monitor.recordError(error, severity, context);

export const measureAsync = <T>(
  name: string,
  fn: () => Promise<T>,
  tags?: Record<string, string>,
) => monitor.measureAsync(name, fn, tags);

export const measure = <T>(name: string, fn: () => T, tags?: Record<string, string>) =>
  monitor.measure(name, fn, tags);
