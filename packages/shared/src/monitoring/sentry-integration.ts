/**
 * Sentry Integration Service
 * Provides error tracking, performance monitoring, and user feedback
 */

import * as Sentry from '@sentry/browser';
import { z } from 'zod';

import { getGlobalLogger } from './structured-logger';

const sentryLoggerInstance = getGlobalLogger().child({ component: 'SentryMonitoring' });

// Configuration schema
const SentryConfigSchema = z.object({
  dsn: z.string().url(),
  environment: z.enum(['development', 'staging', 'production']).default('development'),
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
  metadata?: Record<string, unknown>;
}

interface PerformanceMetrics {
  name: string;
  duration: number;
  tags?: Record<string, string>;
  data?: Record<string, unknown>;
}

type SentryUserContext = {
  id?: string;
  email?: string;
  username?: string;
} & Record<string, unknown>;

type SpanLike = {
  setTag?: (key: string, value: string) => void;
  setAttribute?: (key: string, value: unknown) => void;
  setData?: (key: string, value: unknown) => void;
  setStatus?: (status: unknown) => void;
};

export class SentryMonitoring {
  private initialized = false;
  private config: SentryConfig;
  private static readonly baseLogger = sentryLoggerInstance;
  private readonly logger = SentryMonitoring.baseLogger;

  constructor(config: Partial<SentryConfig> = {}) {
    this.config = SentryConfigSchema.parse(config);
  }

  /**
   * Initialize Sentry monitoring
   */
  public initialize(): void {
    if (this.initialized) {
      this.logger.warn('Sentry already initialized');
      return;
    }

    try {
      const options: Parameters<typeof Sentry.init>[0] = {
        dsn: this.config.dsn,
        environment: this.config.environment,
        sampleRate: this.config.sampleRate,
        tracesSampleRate: this.config.tracesSampleRate,
        debug: this.config.debug,
        integrations: [
          Sentry.browserTracingIntegration(),
          ...(this.config.enableSessionReplay ? [Sentry.replayIntegration()] : []),
        ],
        beforeSend: (event) => {
          // Custom processing before sending to Sentry
          this.logger.debug('Sending event to Sentry', {
            metadata: { eventId: event.event_id },
          });
          return event;
        },
        beforeSendTransaction: (transaction) => {
          // Custom processing for performance transactions
          return transaction;
        },
      };

      if (this.config.release) {
        options.release = this.config.release;
      }

      Sentry.init(options);

      this.initialized = true;
      this.logger.info('Sentry monitoring initialized successfully');
    } catch (error) {
      const normalizedError = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Failed to initialize Sentry', {
        metadata: { error: normalizedError },
      });
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Sentry initialization failed');
    }
  }

  /**
   * Set user context for error tracking
   */
  public setUser(user: SentryUserContext): void {
    Sentry.setUser(user);
  }

  /**
   * Set additional context for error tracking
   */
  public setContext(key: string, context: Record<string, unknown>): void {
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
  public setExtra(key: string, extra: unknown): void {
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
   * Start performance transaction (using modern Sentry API)
   */
  public startTransaction(name: string, operation: string = 'navigation') {
    return Sentry.startSpan(
      {
        name,
        op: operation,
      },
      (span) => span,
    );
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
        const spanLike = (span as unknown as SpanLike | undefined) ?? undefined;

        if (spanLike && tags) {
          for (const [key, value] of Object.entries(tags)) {
            spanLike.setTag?.(key, value);
            spanLike.setAttribute?.(key, value);
          }
        }

        const startTime = performance.now();

        try {
          const result = await fn();
          const duration = performance.now() - startTime;

          spanLike?.setData?.('duration', duration);
          spanLike?.setAttribute?.('duration', duration);

          return result;
        } catch (error) {
          const duration = performance.now() - startTime;

          spanLike?.setData?.('duration', duration);
          spanLike?.setAttribute?.('duration', duration);
          spanLike?.setStatus?.({ code: 'error', message: 'performance_measurement_failed' });

          const normalizedError = error instanceof Error ? error : new Error(String(error));
          this.captureError(normalizedError, {
            action: 'performance_measurement',
            metadata: { function: name, duration },
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
        const spanLike = (span as unknown as SpanLike | undefined) ?? undefined;

        if (spanLike && metric.tags) {
          for (const [key, value] of Object.entries(metric.tags)) {
            spanLike.setTag?.(key, value);
            spanLike.setAttribute?.(key, value);
          }
        }

        if (spanLike && metric.data) {
          for (const [key, value] of Object.entries(metric.data)) {
            spanLike.setData?.(key, value);
            spanLike.setAttribute?.(key, value);
          }
        }

        spanLike?.setData?.('duration', metric.duration);
        spanLike?.setAttribute?.('duration', metric.duration);
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
    data?: Record<string, unknown>,
  ): void {
    const breadcrumb: Sentry.Breadcrumb = {
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
  return function <T extends (...args: unknown[]) => unknown>(
    target: object,
    propertyKey: string | symbol,
    descriptor: TypedPropertyDescriptor<T>,
  ): TypedPropertyDescriptor<T> {
    const originalMethod = descriptor.value;
    if (!originalMethod) {
      return descriptor;
    }

    const targetName =
      typeof target === 'function' ? target.name : target.constructor?.name ?? 'Anonymous';
    const resolvedName = operationName ?? `${targetName}.${String(propertyKey)}`;

    descriptor.value = (async function (
      this: unknown,
      ...args: Parameters<T>
    ): Promise<Awaited<ReturnType<T>>> {
      const monitoring = globalMonitoring;

      if (!monitoring) {
        sentryLoggerInstance.warn('Performance monitoring skipped: Sentry not initialized', {
            metadata: { operation: resolvedName },
          });
        const result = await Promise.resolve(originalMethod.apply(this, args));
        return result as Awaited<ReturnType<T>>;
      }

      return monitoring.measurePerformance<Awaited<ReturnType<T>>>(
        resolvedName,
        () =>
          Promise.resolve(originalMethod.apply(this, args)) as Promise<Awaited<ReturnType<T>>>,
        {
          class: targetName,
          method: String(propertyKey),
        },
      );
    }) as unknown as T;

    return descriptor;
  };
}

// Error boundary decorator
export function CaptureErrors(context?: Partial<ErrorContext>) {
  return function <T extends (...args: unknown[]) => unknown>(
    target: object,
    propertyKey: string | symbol,
    descriptor: TypedPropertyDescriptor<T>,
  ): TypedPropertyDescriptor<T> {
    const originalMethod = descriptor.value;
    if (!originalMethod) {
      return descriptor;
    }

    const targetName =
      typeof target === 'function' ? target.name : target.constructor?.name ?? 'Anonymous';
    const actionName = String(propertyKey);

    descriptor.value = (async function (
      this: unknown,
      ...args: Parameters<T>
    ): Promise<Awaited<ReturnType<T>>> {
      try {
        const result = await Promise.resolve(originalMethod.apply(this, args));
        return result as Awaited<ReturnType<T>>;
      } catch (error) {
        const monitoring = globalMonitoring;
        const normalizedError = error instanceof Error ? error : new Error(String(error));

        if (monitoring) {
          monitoring.captureError(normalizedError, {
            component: targetName,
            action: actionName,
            ...context,
          });
        } else {
          sentryLoggerInstance.error('Error captured but Sentry is not initialized', {
            metadata: {
              action: actionName,
              component: targetName,
              error: normalizedError,
            },
          });
        }

        throw error;
      }
    }) as unknown as T;

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
