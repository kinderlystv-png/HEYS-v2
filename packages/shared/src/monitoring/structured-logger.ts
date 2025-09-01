/**
 * Structured Logging Service with Pino
 * Provides centralized, structured logging with multiple outputs
 */

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
  metadata?: Record<string, any>;
  tags?: string[];
}

// Performance metrics interface
interface PerformanceLog {
  operation: string;
  duration: number;
  success: boolean;
  component?: string;
  metadata?: Record<string, any>;
}

// Error log interface
interface ErrorLog {
  error: Error;
  component?: string;
  operation?: string;
  userId?: string;
  context?: Record<string, any>;
}

export class StructuredLogger {
  private logger: pino.Logger;
  private config: LoggerConfig;
  private startTimes: Map<string, number> = new Map();

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = LoggerConfigSchema.parse(config);
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
        hostname: typeof window !== 'undefined' ? window.location.hostname : 'unknown',
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
      return pino({
        ...baseConfig,
        browser: {
          asObject: true,
          write: {
            trace: console.trace,
            debug: console.debug,
            info: console.info,
            warn: console.warn,
            error: console.error,
            fatal: console.error,
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
    const logData: any = {
      msg: message,
      timestamp: new Date().toISOString(),
    };

    if (context) {
      if (context.userId) logData.userId = context.userId;
      if (context.sessionId) logData.sessionId = context.sessionId;
      if (context.traceId) logData.traceId = context.traceId;
      if (context.component) logData.component = context.component;
      if (context.operation) logData.operation = context.operation;
      if (context.duration !== undefined) logData.duration = context.duration;
      if (context.metadata) logData.metadata = context.metadata;
      if (context.tags) logData.tags = context.tags;
    }

    this.logger[level](logData);
  }

  /**
   * Log an error with full context
   */
  public logError(errorLog: ErrorLog): void {
    const context: LogContext = {
      component: errorLog.component,
      operation: errorLog.operation,
      userId: errorLog.userId,
      metadata: {
        errorName: errorLog.error.name,
        errorMessage: errorLog.error.message,
        errorStack: errorLog.error.stack,
        ...errorLog.context,
      },
    };

    this.error(`Error in ${errorLog.component || 'unknown'}: ${errorLog.error.message}`, context);
  }

  /**
   * Log performance metrics
   */
  public logPerformance(perfLog: PerformanceLog): void {
    const context: LogContext = {
      component: perfLog.component,
      operation: perfLog.operation,
      duration: perfLog.duration,
      metadata: {
        success: perfLog.success,
        ...perfLog.metadata,
      },
      tags: ['performance'],
    };

    const message = `${perfLog.operation} completed in ${perfLog.duration}ms (${perfLog.success ? 'success' : 'failed'})`;
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
    metadata?: Record<string, any>,
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
      component,
      metadata,
    });

    return duration;
  }

  /**
   * Log user action
   */
  public logUserAction(action: string, userId: string, metadata?: Record<string, any>): void {
    const context: LogContext = {
      userId,
      operation: action,
      metadata,
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
    metadata?: Record<string, any>,
  ): void {
    const context: LogContext = {
      userId,
      operation: `${method} ${url}`,
      duration,
      metadata: {
        method,
        url,
        statusCode,
        ...metadata,
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
    metadata?: Record<string, any>,
  ): void {
    const context: LogContext = {
      userId,
      operation: event,
      metadata: {
        severity,
        ...metadata,
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
    const childLogger = new StructuredLogger(this.config);

    // Override log method to include default context
    const originalLog = childLogger.log.bind(childLogger);
    childLogger.log = (level: LogLevel, message: string, context?: LogContext) => {
      const mergedContext = { ...defaultContext, ...context };
      originalLog(level, message, mergedContext);
    };

    return childLogger;
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
      if ('flush' in this.logger) {
        (this.logger as any).flush();
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
}

// Performance logging decorator
export function LogPerformance(operation?: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const operationName = operation || `${target.constructor.name}.${propertyKey}`;

    descriptor.value = async function (...args: any[]) {
      const logger = globalLogger || new StructuredLogger();
      const operationId = `${operationName}-${Date.now()}-${Math.random()}`;

      logger.startTiming(operationId);

      try {
        const result = await originalMethod.apply(this, args);
        logger.endTiming(operationId, operationName, true, target.constructor.name);
        return result;
      } catch (error) {
        logger.endTiming(operationId, operationName, false, target.constructor.name, {
          error: (error as Error).message,
        });
        throw error;
      }
    };

    return descriptor;
  };
}

// Error logging decorator
export function LogErrors(component?: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const componentName = component || target.constructor.name;

    descriptor.value = async function (...args: any[]) {
      try {
        return await originalMethod.apply(this, args);
      } catch (error) {
        const logger = globalLogger || new StructuredLogger();

        logger.logError({
          error: error as Error,
          component: componentName,
          operation: propertyKey,
        });

        throw error;
      }
    };

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
