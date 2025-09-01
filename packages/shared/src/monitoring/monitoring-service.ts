/**
 * Monitoring Service
 * Centralized monitoring with Sentry integration and structured logging
 */

import SentryMonitoring from './sentry-monitoring';
import StructuredLogger from './logger';
import { z } from 'zod';

// Monitoring configuration schema
const MonitoringConfigSchema = z.object({
  enabled: z.boolean().default(true),
  sentry: z.object({
    enabled: z.boolean().default(true),
    config: z.any().optional(),
  }).optional(),
  logging: z.object({
    enabled: z.boolean().default(true),
    config: z.any().optional(),
  }).optional(),
  performance: z.object({
    enabled: z.boolean().default(true),
    thresholds: z.object({
      slow: z.number().default(1000), // ms
      critical: z.number().default(5000), // ms
    }).default({}),
  }).default({}),
  errorSampling: z.number().min(0).max(1).default(1),
  performanceSampling: z.number().min(0).max(1).default(0.1),
});

export type MonitoringConfig = z.infer<typeof MonitoringConfigSchema>;

// Monitoring metrics interface
interface MonitoringMetrics {
  errors: {
    total: number;
    byLevel: Record<string, number>;
    recent: Array<{ timestamp: Date; message: string; level: string }>;
  };
  performance: {
    measurements: number;
    averageTime: number;
    slowOperations: Array<{ operation: string; duration: number; timestamp: Date }>;
  };
  health: {
    sentryConnected: boolean;
    loggingActive: boolean;
    lastHeartbeat: Date;
  };
}

export class MonitoringService {
  private config: MonitoringConfig;
  private sentry?: SentryMonitoring;
  private logger?: StructuredLogger;
  private metrics: MonitoringMetrics;
  private initialized = false;

  constructor(config: Partial<MonitoringConfig> = {}) {
    this.config = MonitoringConfigSchema.parse(config);
    this.metrics = this.initializeMetrics();
  }

  /**
   * Initialize monitoring service
   */
  public async initialize(): Promise<void> {
    if (!this.config.enabled) {
      console.log('Monitoring disabled');
      return;
    }

    try {
      // Initialize Sentry monitoring
      if (this.config.sentry?.enabled) {
        this.sentry = new SentryMonitoring(this.config.sentry.config);
        this.sentry.initialize();
        this.metrics.health.sentryConnected = this.sentry.isHealthy();
      }

      // Initialize structured logging
      if (this.config.logging?.enabled) {
        this.logger = new StructuredLogger(this.config.logging.config);
        this.metrics.health.loggingActive = true;
      }

      this.initialized = true;
      this.metrics.health.lastHeartbeat = new Date();

      this.log('info', 'Monitoring service initialized successfully', {
        sentry: !!this.sentry,
        logging: !!this.logger,
      });

      // Setup error handlers
      this.setupGlobalErrorHandlers();

    } catch (error) {
      console.error('Failed to initialize monitoring service:', error);
      throw error;
    }
  }

  /**
   * Initialize metrics structure
   */
  private initializeMetrics(): MonitoringMetrics {
    return {
      errors: {
        total: 0,
        byLevel: {},
        recent: [],
      },
      performance: {
        measurements: 0,
        averageTime: 0,
        slowOperations: [],
      },
      health: {
        sentryConnected: false,
        loggingActive: false,
        lastHeartbeat: new Date(),
      },
    };
  }

  /**
   * Setup global error handlers
   */
  private setupGlobalErrorHandlers(): void {
    // This is handled by individual services
    // Just update metrics here
    if (typeof window !== 'undefined') {
      const originalConsoleError = console.error;
      console.error = (...args) => {
        this.updateErrorMetrics('error', args.join(' '));
        originalConsoleError.apply(console, args);
      };
    }
  }

  /**
   * Log message with structured logging and Sentry
   */
  public log(
    level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal',
    message: string,
    context?: Record<string, any>
  ): void {
    if (!this.initialized) return;

    // Update metrics
    if (level === 'error' || level === 'fatal') {
      this.updateErrorMetrics(level, message);
    }

    // Log with structured logger
    if (this.logger) {
      this.logger[level](message, context);
    }

    // Send to Sentry for error levels
    if (this.sentry && (level === 'error' || level === 'fatal')) {
      this.sentry.captureMessage(message, level, context);
    }
  }

  /**
   * Capture error with full context
   */
  public captureError(
    error: Error,
    context?: {
      userId?: string;
      component?: string;
      operation?: string;
      metadata?: Record<string, any>;
    }
  ): string | null {
    if (!this.initialized) return null;

    // Note: updateErrorMetrics will be called by logger.logError → error → log
    // No need to call it here directly to avoid duplication

    let eventId: string | null = null;

    // Log error
    if (this.logger) {
      this.logger.logError({
        error,
        ...(context?.component && { component: context.component }),
        ...(context?.operation && { operation: context.operation }),
        ...(context?.userId && { userId: context.userId }),
        ...(context?.metadata && { context: context.metadata }),
      });
    }

    // Send to Sentry
    if (this.sentry) {
      eventId = this.sentry.captureError(error, {
        ...(context?.userId && { userId: context.userId }),
        ...(context?.component && { component: context.component }),
        ...(context?.operation && { action: context.operation }),
        ...(context?.metadata && { metadata: context.metadata }),
      });
    }

    return eventId;
  }

  /**
   * Measure performance of an operation
   */
  public async measurePerformance<T>(
    operation: string,
    fn: () => Promise<T> | T,
    context?: {
      component?: string;
      userId?: string;
      metadata?: Record<string, any>;
    }
  ): Promise<T> {
    if (!this.initialized) {
      return await fn();
    }

    const startTime = performance.now();
    
    try {
      const result = await fn();
      const duration = performance.now() - startTime;
      
      this.recordPerformance(operation, duration, true, context);
      
      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      
      this.recordPerformance(operation, duration, false, context);
      this.captureError(error as Error, {
        ...(context?.component && { component: context.component }),
        operation,
        ...(context?.userId && { userId: context.userId }),
        ...(context?.metadata && { metadata: context.metadata }),
      });
      
      throw error;
    }
  }

  /**
   * Record performance metrics
   */
  private recordPerformance(
    operation: string,
    duration: number,
    success: boolean,
    context?: {
      component?: string;
      userId?: string;
      metadata?: Record<string, any>;
    }
  ): void {
    // Update metrics
    this.metrics.performance.measurements++;
    this.metrics.performance.averageTime = 
      (this.metrics.performance.averageTime * (this.metrics.performance.measurements - 1) + duration) / 
      this.metrics.performance.measurements;

    // Track slow operations
    if (duration > this.config.performance.thresholds.slow) {
      this.metrics.performance.slowOperations.push({
        operation,
        duration,
        timestamp: new Date(),
      });

      // Keep only last 50 slow operations
      if (this.metrics.performance.slowOperations.length > 50) {
        this.metrics.performance.slowOperations.shift();
      }
    }

    // Log performance
    if (this.logger) {
      this.logger.logPerformance({
        operation,
        duration,
        success,
        ...(context?.component && { component: context.component }),
        ...(context?.metadata && { metadata: context.metadata }),
      });
    }

    // Send to Sentry for performance monitoring
    if (this.sentry && Math.random() < this.config.performanceSampling) {
      this.sentry.recordMetric({
        name: operation,
        duration,
        tags: {
          success: success.toString(),
          component: context?.component || 'unknown',
        },
        ...(context?.metadata && { data: context.metadata }),
      });
    }

    // Alert on critical performance
    if (duration > this.config.performance.thresholds.critical) {
      this.log('warn', `Critical performance detected: ${operation} took ${duration}ms`, {
        operation,
        duration,
        component: context?.component,
        threshold: this.config.performance.thresholds.critical,
      });
    }
  }

  /**
   * Update error metrics
   */
  private updateErrorMetrics(level: string, message: string): void {
    this.metrics.errors.total++;
    this.metrics.errors.byLevel[level] = (this.metrics.errors.byLevel[level] || 0) + 1;
    
    this.metrics.errors.recent.push({
      timestamp: new Date(),
      message,
      level,
    });

    // Keep only last 100 recent errors
    if (this.metrics.errors.recent.length > 100) {
      this.metrics.errors.recent.shift();
    }
  }

  /**
   * Log user action
   */
  public logUserAction(
    action: string,
    userId: string,
    metadata?: Record<string, any>
  ): void {
    if (!this.initialized) return;

    if (this.logger) {
      this.logger.logUserAction(action, userId, metadata);
    }

    if (this.sentry) {
      this.sentry.addBreadcrumb(
        `User action: ${action}`,
        'user',
        'info',
        { userId, ...metadata }
      );
    }
  }

  /**
   * Log API request
   */
  public logApiRequest(
    method: string,
    url: string,
    statusCode?: number,
    duration?: number,
    userId?: string,
    metadata?: Record<string, any>
  ): void {
    if (!this.initialized) return;

    if (this.logger) {
      this.logger.logApiRequest(method, url, statusCode, duration, userId, metadata);
    }

    if (this.sentry && statusCode && statusCode >= 400) {
      this.sentry.addBreadcrumb(
        `API Error: ${method} ${url} - ${statusCode}`,
        'http',
        'error',
        { method, url, statusCode, duration, userId, ...metadata }
      );
    }
  }

  /**
   * Log security event
   */
  public logSecurityEvent(
    event: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    userId?: string,
    metadata?: Record<string, any>
  ): void {
    if (!this.initialized) return;

    if (this.logger) {
      this.logger.logSecurityEvent(event, severity, userId, metadata);
    }

    if (this.sentry) {
      const level = severity === 'critical' || severity === 'high' ? 'error' : 'warning';
      this.sentry.captureMessage(`Security event: ${event}`, level, {
        ...(userId && { userId }),
        metadata: { severity, ...metadata },
      });
    }
  }

  /**
   * Set user context for monitoring
   */
  public setUser(user: {
    id: string;
    email?: string;
    username?: string;
    [key: string]: any;
  }): void {
    if (!this.initialized) return;

    if (this.sentry) {
      this.sentry.setUser(user);
    }
  }

  /**
   * Add monitoring context
   */
  public setContext(key: string, context: Record<string, any>): void {
    if (!this.initialized) return;

    if (this.sentry) {
      this.sentry.setContext(key, context);
    }
  }

  /**
   * Get monitoring metrics
   */
  public getMetrics(): MonitoringMetrics {
    this.metrics.health.lastHeartbeat = new Date();
    this.metrics.health.sentryConnected = this.sentry?.isHealthy() || false;
    this.metrics.health.loggingActive = !!this.logger;
    
    return { ...this.metrics };
  }

  /**
   * Reset metrics (useful for testing)
   */
  public resetMetrics(): void {
    this.metrics = {
      errors: {
        total: 0,
        byLevel: {},
        recent: [],
      },
      performance: {
        measurements: 0,
        averageTime: 0,
        slowOperations: [],
      },
      health: {
        sentryConnected: false,
        loggingActive: false,
        lastHeartbeat: new Date(),
      },
    };
  }

  /**
   * Health check
   */
  public async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    details: Record<string, any>;
  }> {
    const details: Record<string, any> = {
      initialized: this.initialized,
      sentry: this.sentry?.isHealthy() || false,
      logging: !!this.logger,
      lastHeartbeat: this.metrics.health.lastHeartbeat,
    };

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    if (!this.initialized) {
      status = 'unhealthy';
    } else if (!details.sentry && this.config.sentry?.enabled) {
      status = 'degraded';
    }

    return { status, details };
  }

  /**
   * Flush all monitoring data
   */
  public async flush(): Promise<void> {
    const promises: Promise<any>[] = [];

    if (this.sentry) {
      promises.push(this.sentry.flush());
    }

    if (this.logger) {
      promises.push(this.logger.flush());
    }

    await Promise.all(promises);
  }

  /**
   * Shutdown monitoring service
   */
  public async shutdown(): Promise<void> {
    this.log('info', 'Shutting down monitoring service');
    await this.flush();
    this.initialized = false;
  }
}

// Performance monitoring decorator for methods
export function MonitorMethod(operation?: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const operationName = operation || `${target.constructor.name}.${propertyKey}`;

    descriptor.value = async function (...args: any[]) {
      const monitoring = globalMonitoringService;
      
      if (!monitoring) {
        return originalMethod.apply(this, args);
      }

      return monitoring.measurePerformance(
        operationName,
        () => originalMethod.apply(this, args),
        {
          component: target.constructor.name,
        }
      );
    };

    return descriptor;
  };
}

// Error capture decorator for methods
export function CaptureMethodErrors() {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      try {
        return await originalMethod.apply(this, args);
      } catch (error) {
        const monitoring = globalMonitoringService;
        
        if (monitoring) {
          monitoring.captureError(error as Error, {
            component: target.constructor.name,
            operation: propertyKey,
          });
        }
        
        throw error;
      }
    };

    return descriptor;
  };
}

// Global monitoring service instance
export let globalMonitoringService: MonitoringService | null = null;

/**
 * Initialize global monitoring service
 */
export async function initializeGlobalMonitoring(config: Partial<MonitoringConfig>): Promise<MonitoringService> {
  globalMonitoringService = new MonitoringService(config);
  await globalMonitoringService.initialize();
  return globalMonitoringService;
}

/**
 * Get global monitoring service
 */
export function getGlobalMonitoring(): MonitoringService {
  if (!globalMonitoringService) {
    throw new Error('Global monitoring not initialized. Call initializeGlobalMonitoring first.');
  }
  return globalMonitoringService;
}

export default MonitoringService;
