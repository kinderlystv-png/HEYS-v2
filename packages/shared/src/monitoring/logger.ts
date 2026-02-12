/**
 * Structured Logging Service
 * Provides centralized, structured logging with multiple outputs
 */

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

// Log entry interface
interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: LogContext;
  pid?: number;
  hostname?: string;
  environment?: string;
  version?: string;
}

export class StructuredLogger {
  private config: LoggerConfig;
  private startTimes: Map<string, number> = new Map();
  private logLevels = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = LoggerConfigSchema.parse(config);
  }

  /**
   * Check if a log level should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    const currentLevelIndex = this.logLevels.indexOf(this.config.level);
    const logLevelIndex = this.logLevels.indexOf(level);
    return logLevelIndex >= currentLevelIndex;
  }

  /**
   * Redact sensitive information from object
   */
  private redactSensitiveData<T>(obj: T): T {
    if (!obj || typeof obj !== 'object') return obj;

    const redacted = { ...(obj as Record<string, unknown>) };

    for (const path of this.config.redactPaths) {
      if (redacted[path] !== undefined) {
        redacted[path] = '[REDACTED]';
      }
    }

    // Recursively redact nested objects
    for (const key of Object.keys(redacted)) {
      const value = redacted[key];
      if (value && typeof value === 'object') {
        redacted[key] = this.redactSensitiveData(value);
      }
    }

    return redacted as T;
  }

  /**
   * Format log entry for output
   */
  private formatLogEntry(entry: LogEntry): string {
    if (this.config.prettyPrint && this.config.environment === 'development') {
      const time = new Date(entry.timestamp).toLocaleTimeString();
      const levelColor = this.getLevelColor(entry.level);
      const reset = '\x1b[0m';

      let formatted = `${levelColor}[${time}] ${entry.level.toUpperCase()}${reset}: ${entry.message}`;

      if (entry.context) {
        formatted += `\n  Context: ${JSON.stringify(entry.context, null, 2)}`;
      }

      return formatted;
    }

    return JSON.stringify(entry);
  }

  /**
   * Get ANSI color code for log level
   */
  private getLevelColor(level: LogLevel): string {
    const colors = {
      trace: '\x1b[37m', // white
      debug: '\x1b[36m', // cyan
      info: '\x1b[32m', // green
      warn: '\x1b[33m', // yellow
      error: '\x1b[31m', // red
      fatal: '\x1b[35m', // magenta
    };
    return colors[level] || '\x1b[0m';
  }

  /**
   * Output log entry
   */
  private output(entry: LogEntry): void {
    if (!this.shouldLog(entry.level)) return;

    const formattedEntry = this.formatLogEntry(entry);

    if (this.config.enableConsole) {
      if (typeof window !== 'undefined') {
        // Browser environment
        const consoleMethod = entry.level === 'fatal' ? 'error' : entry.level;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const consoleRef = (globalThis as unknown as { console?: Record<string, (...args: unknown[]) => void> })
          .console;
        const method = consoleRef?.[consoleMethod] ?? consoleRef?.log;

        if (method) {
          if (this.config.prettyPrint) {
            method(`[${entry.level.toUpperCase()}] ${entry.message}`, entry.context);
          } else {
            method(formattedEntry);
          }
        }
      } else if (typeof process !== 'undefined') {
        // Node.js environment
        const stream =
          entry.level === 'error' || entry.level === 'fatal' || entry.level === 'warn'
            ? process.stderr
            : process.stdout;
        stream.write(`${formattedEntry}\n`);
      }
    }

    // NOTE: File logging not implemented - browser-only for now
    if (this.config.enableFile && typeof window === 'undefined') {
      // File logging would go here
    }

    if (this.config.enableRemote) {
      // Remote logging would go here
      this.sendToRemote(entry);
    }
  }

  /**
   * Send log entry to remote service
   */
  private async sendToRemote(entry: LogEntry): Promise<void> {
    // This would implement remote logging to services like Logstash, etc.
    // For now, it's a placeholder
    void entry;
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
  private getHostname(): string {
    if (typeof window === 'undefined') return 'unknown';

    try {
      return window.location?.hostname || 'unknown';
    } catch {
      return 'unknown';
    }
  }

  private log(level: LogLevel, message: string, context?: LogContext): void {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      hostname: this.getHostname(),
      environment: this.config.environment,
    };

    // Add optional properties only if they exist
    if (typeof process !== 'undefined') {
      entry.pid = process.pid;
    }

    if (this.config.version) {
      entry.version = this.config.version;
    }

    if (context) {
      entry.context = this.redactSensitiveData(context);
    }

    this.output(entry);
  }

  /**
   * Log an error with full context
   */
  public logError(errorLog: ErrorLog): void {
    const context: LogContext = {
      ...(errorLog.component && { component: errorLog.component }),
      ...(errorLog.operation && { operation: errorLog.operation }),
      ...(errorLog.userId && { userId: errorLog.userId }),
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
      ...(perfLog.component && { component: perfLog.component }),
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
      ...(component && { component }),
      ...(metadata && { metadata }),
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
      ...(metadata && { metadata }),
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
      ...(userId && { userId }),
      operation: `${method} ${url}`,
      ...(duration !== undefined && { duration }),
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
    metadata?: Record<string, unknown>,
  ): void {
    const context: LogContext = {
      ...(userId && { userId }),
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
    // For now, this is a no-op since we're using synchronous console logging
    return Promise.resolve();
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
  }

  /**
   * Check if level is enabled
   */
  public isLevelEnabled(level: LogLevel): boolean {
    return this.shouldLog(level);
  }
}

// Performance logging decorator
export function LogPerformance(operation?: string) {
  return function (
    target: { constructor: { name: string } },
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value as (...args: unknown[]) => Promise<unknown>;
    const operationName = operation || `${target.constructor.name}.${propertyKey}`;

    descriptor.value = async function (...args: unknown[]) {
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
  return function (
    target: { constructor: { name: string } },
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value as (...args: unknown[]) => Promise<unknown>;
    const componentName = component || target.constructor.name;

    descriptor.value = async function (...args: unknown[]) {
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
