/**
 * Structured Logging Service with Pino
 * Provides centralized, structured logging with multiple outputs
 */

import type { LogDescriptor } from 'pino';
import pino from 'pino';
import { z } from 'zod';

// Log level configuration
const LogLevelSchema = z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']);
export type LogLevel = z.infer<typeof LogLevelSchema>;

// Logger configuration schema
const LoggerConfigSchema = z.object({
  level: LogLevelSchema.default('info'),
  name: z.string().default('heys-app'),
  version: z.string().optional(),
  environment: z.enum(['development', 'staging', 'production']).default('development'),
  enableConsole: z.boolean().default(true),
  enableFile: z.boolean().default(false),
  enableRemote: z.boolean().default(false),
  fileOptions: z
    .object({
      filename: z.string(),
      maxFiles: z.number().default(5),
      maxSize: z.string().default('10MB'),
    })
    .optional(),
  remoteOptions: z
    .object({
      url: z.string().url(),
      headers: z.record(z.string()).optional(),
      interval: z.number().default(5000),
    })
    .optional(),
  redactPaths: z.array(z.string()).default(['password', 'token', 'secret', 'apiKey']),
  prettyPrint: z.boolean().default(false),
});

export type LoggerConfig = z.infer<typeof LoggerConfigSchema>;

// Log context interface
interface LogContext {
  userId?: string;
  sessionId?: string;
  traceId?: string;
  component?: string;
  operation?: string;
  duration?: number;
  metadata?: Record<string, unknown>;
  tags?: string[];
}

// Performance metrics interface
interface PerformanceLog {
  operation: string;
  duration: number;
  success: boolean;
  component?: string;
  metadata?: Record<string, unknown>;
}

// Error log interface
interface ErrorLog {
  error: Error;
  component?: string;
  operation?: string;
  userId?: string;
  context?: Record<string, unknown>;
}

export class StructuredLogger {
  private logger: pino.Logger;
  private config: LoggerConfig;
  private startTimes: Map<string, number> = new Map();
  private defaultContext: Partial<LogContext>;

  constructor(config: Partial<LoggerConfig> = {}, defaultContext: Partial<LogContext> = {}) {
    this.config = LoggerConfigSchema.parse(config);
    this.defaultContext = defaultContext;
    this.logger = this.createLogger();
  }

  private createLogger(): pino.Logger {
    const baseConfig: pino.LoggerOptions = {
      name: this.config.name,
      level: this.config.level,
      redact: {
        paths: this.config.redactPaths,
        censor: '[REDACTED]',
      },
      base: {
        pid: process.pid,
        hostname: typeof window !== 'undefined' && window.location?.hostname ? window.location.hostname : 'unknown',
        environment: this.config.environment,
        version: this.config.version,
      },
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: {
        level: (label) => {
          return { level: label };
        },
      },
    };

    // Browser environment
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const consoleApi = (globalThis as unknown as { console?: Record<string, (...args: unknown[]) => void> })
        .console;
      const levelToConsoleMethod: Record<string, string> = {
        trace: 'debug',
        debug: 'debug',
        info: 'info',
        warn: 'warn',
        error: 'error',
        fatal: 'error',
      };

      return pino({
        ...baseConfig,
        browser: {
          asObject: true,
          write: (log: LogDescriptor) => {
            if (!consoleApi) {
              return;
            }

            const levelValue = log.level as number | string | undefined;
            const levelLabel =
              typeof levelValue === 'string'
                ? levelValue
                : (pino.levels.labels[levelValue ?? 30] ?? 'info');

            const consoleMethodName = levelToConsoleMethod[levelLabel] ?? 'log';
            const consoleMethod = consoleApi?.[consoleMethodName];

            if (typeof consoleMethod === 'function') {
              consoleMethod.call(consoleApi, log);
            }
          },
        },
      });
    }

    // Node.js environment with pretty printing for development
    if (this.config.prettyPrint && this.config.environment === 'development') {
      const transport = pino.transport({
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      });
      return pino(baseConfig, transport);
    }

    return pino(baseConfig);
  }

  /**
   * Log with trace level
   */
  public trace(message: string, context?: LogContext): void {
    this.log('trace', message, context);
  }

  /**
   * Log with debug level
   */
  public debug(message: string, context?: LogContext): void {
    this.log('debug', message, context);
  }

  /**
   * Log with info level
   */
  public info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }

  /**
   * Log with warn level
   */
  public warn(message: string, context?: LogContext): void {
    this.log('warn', message, context);
  }

  /**
   * Log with error level
   */
  public error(message: string, context?: LogContext): void {
    this.log('error', message, context);
  }

  /**
   * Log with fatal level
   */
  public fatal(message: string, context?: LogContext): void {
    this.log('fatal', message, context);
  }

  /**
   * Core logging method
   */
  private log(level: LogLevel, message: string, context?: LogContext): void {
    const mergedContext = this.mergeContexts(this.defaultContext, context);

    const logData: Record<string, unknown> = {
      msg: message,
      timestamp: new Date().toISOString(),
    };

    if (mergedContext.userId) {
      logData.userId = mergedContext.userId;
    }

    if (mergedContext.sessionId) {
      logData.sessionId = mergedContext.sessionId;
    }

    if (mergedContext.traceId) {
      logData.traceId = mergedContext.traceId;
    }

    if (mergedContext.component) {
      logData.component = mergedContext.component;
    }

    if (mergedContext.operation) {
      logData.operation = mergedContext.operation;
    }

    if (typeof mergedContext.duration === 'number') {
      logData.duration = mergedContext.duration;
    }

    if (mergedContext.metadata && Object.keys(mergedContext.metadata).length > 0) {
      logData.metadata = mergedContext.metadata;
    }

    if (mergedContext.tags && mergedContext.tags.length > 0) {
      logData.tags = mergedContext.tags;
    }

    this.logger[level](logData);
  }

  /**
   * Log an error with full context
   */
  public logError(errorLog: ErrorLog): void {
    const metadata: Record<string, unknown> = {
      errorName: errorLog.error.name,
      errorMessage: errorLog.error.message,
      errorStack: errorLog.error.stack,
      ...(errorLog.context ?? {}),
    };

    const context: LogContext = {
      ...(errorLog.component ? { component: errorLog.component } : {}),
      ...(errorLog.operation ? { operation: errorLog.operation } : {}),
      ...(errorLog.userId ? { userId: errorLog.userId } : {}),
      metadata,
      tags: ['error'],
    };

    const componentLabel = errorLog.component ?? 'unknown';
    this.error(`Error in ${componentLabel}: ${errorLog.error.message}`, context);
  }

  /**
   * Log performance metrics
   */
  public logPerformance(perfLog: PerformanceLog): void {
    const metadata: Record<string, unknown> = {
      success: perfLog.success,
      ...(perfLog.metadata ?? {}),
    };

    const context: LogContext = {
      ...(perfLog.component ? { component: perfLog.component } : {}),
      operation: perfLog.operation,
      duration: perfLog.duration,
      metadata,
      tags: ['performance'],
    };

    const status = perfLog.success ? 'success' : 'failed';
    const message = `${perfLog.operation} completed in ${perfLog.duration}ms (${status})`;
    this.info(message, context);
  }

  /**
   * Start performance timing
   */
  public startTiming(operationId: string): void {
    this.startTimes.set(operationId, performance.now());
  }

  /**
   * End performance timing and log
   */
  public endTiming(
    operationId: string,
    operation: string,
    success: boolean = true,
    component?: string,
    metadata?: Record<string, unknown>,
  ): number {
    const startTime = this.startTimes.get(operationId);
    if (!startTime) {
      this.warn(`No start time found for operation: ${operationId}`);
      return 0;
    }

    const duration = performance.now() - startTime;
    this.startTimes.delete(operationId);

    this.logPerformance({
      operation,
      duration,
      success,
      ...(component ? { component } : {}),
      ...(metadata ? { metadata } : {}),
    });

    return duration;
  }

  /**
   * Log user action
   */
  public logUserAction(action: string, userId: string, metadata?: Record<string, unknown>): void {
    const context: LogContext = {
      userId,
      operation: action,
      ...(metadata ? { metadata } : {}),
      tags: ['user-action'],
    };

    this.info(`User action: ${action}`, context);
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
    metadata?: Record<string, unknown>,
  ): void {
    const context: LogContext = {
      ...(userId ? { userId } : {}),
      operation: `${method} ${url}`,
      ...(typeof duration === 'number' ? { duration } : {}),
      metadata: {
        method,
        url,
        ...(statusCode !== undefined ? { statusCode } : {}),
        ...(metadata ?? {}),
      },
      tags: ['api-request'],
    };

    const level = statusCode && statusCode >= 400 ? 'warn' : 'info';
    const message = `API ${method} ${url} - ${statusCode || 'pending'}`;

    this.log(level, message, context);
  }

  /**
   * Log security event
   */
  public logSecurityEvent(
    event: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    userId?: string,
    metadata?: Record<string, unknown>,
  ): void {
    const context: LogContext = {
      ...(userId ? { userId } : {}),
      operation: event,
      metadata: {
        severity,
        ...(metadata ?? {}),
      },
      tags: ['security', severity],
    };

    const level = severity === 'critical' || severity === 'high' ? 'error' : 'warn';
    this.log(level, `Security event: ${event}`, context);
  }

  /**
   * Create child logger with default context
   */
  public child(defaultContext: Partial<LogContext>): StructuredLogger {
    return new StructuredLogger(this.config, {
      ...this.defaultContext,
      ...defaultContext,
      metadata: {
        ...(this.defaultContext.metadata ?? {}),
        ...(defaultContext.metadata ?? {}),
      },
      tags: this.mergeTags(this.defaultContext.tags, defaultContext.tags),
    });
  }

  /**
   * Flush logs (useful for graceful shutdown)
   */
  public async flush(): Promise<void> {
    // In browser environment, this is a no-op
    if (typeof window !== 'undefined') {
      return Promise.resolve();
    }

    // For Node.js with streams
    return new Promise((resolve) => {
      const loggerCandidate = this.logger as unknown as { flush?: () => void };
      if (typeof loggerCandidate.flush === 'function') {
        loggerCandidate.flush();
      }
      resolve();
    });
  }

  /**
   * Get current log level
   */
  public getLevel(): LogLevel {
    return this.config.level;
  }

  /**
   * Set log level
   */
  public setLevel(level: LogLevel): void {
    this.config.level = level;
    this.logger.level = level;
  }

  /**
   * Check if level is enabled
   */
  public isLevelEnabled(level: LogLevel): boolean {
    return this.logger.isLevelEnabled(level);
  }
  private mergeContexts(base: Partial<LogContext>, context?: LogContext): LogContext {
    const combinedMetadata: Record<string, unknown> = {
      ...(base.metadata ?? {}),
      ...(context?.metadata ?? {}),
    };

    const combinedTags = this.mergeTags(base.tags, context?.tags);

    const result: LogContext = {
      ...(base.userId ? { userId: base.userId } : {}),
      ...(base.sessionId ? { sessionId: base.sessionId } : {}),
      ...(base.traceId ? { traceId: base.traceId } : {}),
      ...(base.component ? { component: base.component } : {}),
      ...(base.operation ? { operation: base.operation } : {}),
      ...(typeof base.duration === 'number' ? { duration: base.duration } : {}),
    };

    if (context) {
      if (context.userId) {
        result.userId = context.userId;
      }
      if (context.sessionId) {
        result.sessionId = context.sessionId;
      }
      if (context.traceId) {
        result.traceId = context.traceId;
      }
      if (context.component) {
        result.component = context.component;
      }
      if (context.operation) {
        result.operation = context.operation;
      }
      if (typeof context.duration === 'number') {
        result.duration = context.duration;
      }
    }

    if (Object.keys(combinedMetadata).length > 0) {
      result.metadata = combinedMetadata;
    }

    if (combinedTags.length > 0) {
      result.tags = combinedTags;
    }

    return result;
  }

  private mergeTags(baseTags?: string[], additionalTags?: string[]): string[] {
    const combined = [...(baseTags ?? []), ...(additionalTags ?? [])];
    return Array.from(new Set(combined));
  }
}

// Performance logging decorator
export function LogPerformance(operation?: string) {
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
      typeof target === 'function' ? target.name : (target.constructor?.name ?? 'Anonymous');
    const operationName = operation ?? `${targetName}.${String(propertyKey)}`;

    descriptor.value = async function (
      this: unknown,
      ...args: Parameters<T>
    ): Promise<Awaited<ReturnType<T>>> {
      const loggerInstance = globalLogger ?? new StructuredLogger();
      const operationId = `${operationName}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      loggerInstance.startTiming(operationId);

      try {
        const result = await Promise.resolve(originalMethod.apply(this, args));
        loggerInstance.endTiming(operationId, operationName, true, targetName);
        return result as Awaited<ReturnType<T>>;
      } catch (error) {
        const normalizedError = error instanceof Error ? error : new Error(String(error));
        loggerInstance.endTiming(operationId, operationName, false, targetName, {
          error: normalizedError.message,
        });
        throw error;
      }
    } as unknown as T;

    return descriptor;
  };
}

// Error logging decorator
export function LogErrors(component?: string) {
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
      typeof target === 'function' ? target.name : (target.constructor?.name ?? 'Anonymous');
    const componentName = component ?? targetName;

    descriptor.value = async function (
      this: unknown,
      ...args: Parameters<T>
    ): Promise<Awaited<ReturnType<T>>> {
      try {
        const result = await Promise.resolve(originalMethod.apply(this, args));
        return result as Awaited<ReturnType<T>>;
      } catch (error) {
        const loggerInstance = globalLogger ?? new StructuredLogger();
        const normalizedError = error instanceof Error ? error : new Error(String(error));

        loggerInstance.logError({
          error: normalizedError,
          component: componentName,
          operation: String(propertyKey),
        });

        throw error;
      }
    } as unknown as T;

    return descriptor;
  };
}

// Global logger instance
export let globalLogger: StructuredLogger | null = null;

/**
 * Initialize global logger instance
 */
export function initializeGlobalLogger(config: Partial<LoggerConfig>): StructuredLogger {
  globalLogger = new StructuredLogger(config);
  return globalLogger;
}

/**
 * Get global logger instance
 */
export function getGlobalLogger(): StructuredLogger {
  if (!globalLogger) {
    globalLogger = new StructuredLogger();
  }
  return globalLogger;
}

export default StructuredLogger;
