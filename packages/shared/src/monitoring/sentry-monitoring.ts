/**
 * Sentry Integration Service
 * Provides error tracking, performance monitoring, and user feedback
 */

import * as Sentry from '@sentry/browser';
import { z } from 'zod';

// Configuration schema
const SentryConfigSchema = z.object({
  dsn: z.string().url(),
  environment: z.enum(['development', 'staging', 'production', 'test']).default('development'),
  sampleRate: z.number().min(0).max(1).default(1),
  tracesSampleRate: z.number().min(0).max(1).default(0.1),
  enableUserFeedback: z.boolean().default(true),
  enablePerformanceMonitoring: z.boolean().default(true),
  enableSessionReplay: z.boolean().default(false),
  release: z.string().optional(),
  debug: z.boolean().default(false),
});

export type SentryConfig = z.infer<typeof SentryConfigSchema>;

interface ErrorContext {
  userId?: string;
  userEmail?: string;
  sessionId?: string;
  route?: string;
  component?: string;
  action?: string;
  metadata?: Record<string, any>;
}

interface PerformanceMetrics {
  name: string;
  duration: number;
  tags?: Record<string, string>;
  data?: Record<string, any>;
}

export class SentryMonitoring {
  private initialized = false;
  private config: SentryConfig;

  constructor(config: Partial<SentryConfig> = {}) {
    this.config = SentryConfigSchema.parse(config);
  }

  /**
   * Initialize Sentry monitoring
   */
  public initialize(): void {
    if (this.initialized) {
      console.warn('Sentry already initialized');
      return;
    }

    try {
      const initConfig: any = {
        dsn: this.config.dsn,
        environment: this.config.environment,
        sampleRate: this.config.sampleRate,
        tracesSampleRate: this.config.tracesSampleRate,
        debug: this.config.debug,

        integrations: [
          Sentry.browserTracingIntegration(),
          ...(this.config.enableSessionReplay ? [Sentry.replayIntegration()] : []),
        ],

        beforeSend: (event: any, _hint: any) => {
          console.log('Sending event to Sentry:', event.event_id);
          return event;
        },

        beforeSendTransaction: (transaction: any, _hint: any) => {
          return transaction;
        },
      };

      // Only add release if it's defined
      if (this.config.release) {
        initConfig.release = this.config.release;
      }

      Sentry.init(initConfig);

      this.initialized = true;
      console.log('Sentry monitoring initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Sentry:', error);
      throw new Error('Sentry initialization failed');
    }
  }

  /**
   * Set user context for error tracking
   */
  public setUser(user: {
    id?: string;
    email?: string;
    username?: string;
    [key: string]: any;
  }): void {
    Sentry.setUser(user);
  }

  /**
   * Set additional context for error tracking
   */
  public setContext(key: string, context: Record<string, any>): void {
    Sentry.setContext(key, context);
  }

  /**
   * Set tags for categorizing errors
   */
  public setTags(tags: Record<string, string>): void {
    Sentry.setTags(tags);
  }

  /**
   * Set extra data for error reports
   */
  public setExtra(key: string, extra: any): void {
    Sentry.setExtra(key, extra);
  }

  /**
   * Capture error with context
   */
  public captureError(error: Error, context?: ErrorContext): string {
    return Sentry.withScope((scope) => {
      if (context) {
        if (context.userId) {
          const userObj: { id: string; email?: string } = { id: context.userId };
          if (context.userEmail) userObj.email = context.userEmail;
          scope.setUser(userObj);
        }
        if (context.sessionId) scope.setTag('sessionId', context.sessionId);
        if (context.route) scope.setTag('route', context.route);
        if (context.component) scope.setTag('component', context.component);
        if (context.action) scope.setTag('action', context.action);
        if (context.metadata) scope.setContext('metadata', context.metadata);
      }

      return Sentry.captureException(error);
    });
  }

  /**
   * Capture custom message
   */
  public captureMessage(
    message: string,
    level: 'debug' | 'info' | 'warning' | 'error' | 'fatal' = 'info',
    context?: ErrorContext,
  ): string {
    return Sentry.withScope((scope) => {
      if (context) {
        if (context.userId) {
          const userObj: { id: string; email?: string } = { id: context.userId };
          if (context.userEmail) userObj.email = context.userEmail;
          scope.setUser(userObj);
        }
        if (context.sessionId) scope.setTag('sessionId', context.sessionId);
        if (context.route) scope.setTag('route', context.route);
        if (context.component) scope.setTag('component', context.component);
        if (context.action) scope.setTag('action', context.action);
        if (context.metadata) scope.setContext('metadata', context.metadata);
      }

      scope.setLevel(level);
      return Sentry.captureMessage(message);
    });
  }

  /**
   * Measure performance of a function
   */
  public async measurePerformance<T>(
    name: string,
    fn: () => Promise<T> | T,
    tags?: Record<string, string>,
  ): Promise<T> {
    return Sentry.startSpan(
      {
        name,
        op: 'function',
      },
      async (span) => {
        if (tags && span) {
          Object.entries(tags).forEach(([key, value]) => {
            span.setAttributes({ [key]: value });
          });
        }

        const startTime = performance.now();

        try {
          const result = await fn();
          const duration = performance.now() - startTime;

          if (span) {
            span.setAttributes({
              duration,
              status: 'ok',
            });
          }

          return result;
        } catch (error) {
          const duration = performance.now() - startTime;

          if (span) {
            span.setAttributes({
              duration,
              status: 'error',
            });
          }

          this.captureError(error as Error, {
            action: 'performance_measurement',
            metadata: { function: name, duration: performance.now() - startTime },
          });

          throw error;
        }
      },
    );
  }

  /**
   * Record custom performance metrics
   */
  public recordMetric(metric: PerformanceMetrics): void {
    Sentry.startSpan(
      {
        name: metric.name,
        op: 'custom',
      },
      (span) => {
        if (span) {
          const attributes: Record<string, any> = {
            duration: metric.duration,
          };

          if (metric.tags) {
            Object.assign(attributes, metric.tags);
          }

          if (metric.data) {
            Object.assign(attributes, metric.data);
          }

          span.setAttributes(attributes);
        }
      },
    );
  }

  /**
   * Add breadcrumb for debugging
   */
  public addBreadcrumb(
    message: string,
    category: string = 'default',
    level: 'debug' | 'info' | 'warning' | 'error' | 'fatal' = 'info',
    data?: Record<string, any>,
  ): void {
    const breadcrumb: any = {
      message,
      category,
      level,
      timestamp: Date.now() / 1000,
    };

    if (data) {
      breadcrumb.data = data;
    }

    Sentry.addBreadcrumb(breadcrumb);
  }

  /**
   * Show user feedback dialog
   */
  public showUserFeedback(): void {
    if (!this.config.enableUserFeedback) return;

    const eventId = Sentry.lastEventId();
    if (eventId) {
      Sentry.showReportDialog({ eventId });
    }
  }

  /**
   * Flush pending events (useful for SPA navigation)
   */
  public async flush(timeout: number = 2000): Promise<boolean> {
    return Sentry.flush(timeout);
  }

  /**
   * Check if Sentry is initialized and healthy
   */
  public isHealthy(): boolean {
    return this.initialized && !!Sentry.getCurrentScope();
  }

  /**
   * Get current DSN (useful for debugging)
   */
  public getDsn(): string | undefined {
    return this.config.dsn;
  }

  /**
   * Configure Sentry scope with common application context
   */
  public configureScope(configure: (scope: Sentry.Scope) => void): void {
    Sentry.withScope(configure);
  }

  /**
   * Create a child monitoring instance with additional context
   */
  public withContext(context: ErrorContext): SentryMonitoring {
    const child = new SentryMonitoring(this.config);
    child.initialized = this.initialized;

    // Apply context immediately if initialized
    if (this.initialized) {
      if (context.userId) {
        const userObj: { id: string; email?: string } = { id: context.userId };
        if (context.userEmail) userObj.email = context.userEmail;
        child.setUser(userObj);
      }
      if (context.sessionId) child.setTags({ sessionId: context.sessionId });
      if (context.route) child.setTags({ route: context.route });
      if (context.component) child.setTags({ component: context.component });
      if (context.metadata) child.setContext('metadata', context.metadata);
    }

    return child;
  }
}

// Performance monitoring decorator
export function MonitorPerformance(operationName?: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const name = operationName || `${target.constructor.name}.${propertyKey}`;

    descriptor.value = async function (...args: any[]) {
      const monitoring = globalMonitoring || new SentryMonitoring();

      return monitoring.measurePerformance(name, () => originalMethod.apply(this, args), {
        class: target.constructor.name,
        method: propertyKey,
      });
    };

    return descriptor;
  };
}

// Error boundary decorator
export function CaptureErrors(context?: Partial<ErrorContext>) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      try {
        return await originalMethod.apply(this, args);
      } catch (error) {
        const monitoring = globalMonitoring || new SentryMonitoring();

        monitoring.captureError(error as Error, {
          component: target.constructor.name,
          action: propertyKey,
          ...context,
        });

        throw error;
      }
    };

    return descriptor;
  };
}

// Global monitoring instance
export let globalMonitoring: SentryMonitoring | null = null;

/**
 * Initialize global monitoring instance
 */
export function initializeGlobalMonitoring(config: Partial<SentryConfig>): SentryMonitoring {
  globalMonitoring = new SentryMonitoring(config);
  globalMonitoring.initialize();
  return globalMonitoring;
}

/**
 * Get global monitoring instance
 */
export function getGlobalMonitoring(): SentryMonitoring {
  if (!globalMonitoring) {
    throw new Error('Global monitoring not initialized. Call initializeGlobalMonitoring first.');
  }
  return globalMonitoring;
}

// Browser error handler
if (typeof window !== 'undefined') {
  // Global error handler
  window.addEventListener('error', (event) => {
    if (globalMonitoring) {
      globalMonitoring.captureError(new Error(event.message), {
        metadata: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        },
      });
    }
  });

  // Unhandled promise rejection handler
  window.addEventListener('unhandledrejection', (event) => {
    if (globalMonitoring) {
      globalMonitoring.captureError(
        event.reason instanceof Error ? event.reason : new Error(event.reason),
        { action: 'unhandled_promise_rejection' },
      );
    }
  });
}

export default SentryMonitoring;
