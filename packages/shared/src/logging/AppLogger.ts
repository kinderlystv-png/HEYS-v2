/**
 * Unified Logger Interface for HEYS
 *
 * This interface abstracts away the underlying logger implementation (pino, console, StructuredLogger)
 * allowing code to be logger-agnostic and easily testable via DI.
 *
 * DUAL FORMAT SUPPORT:
 *   - message-first: logger.info('message', { key: 'value' })
 *   - object-first (pino-style): logger.info({ key: 'value' }, 'message')
 *
 * This allows gradual migration from @heys/logger (pino) to AppLogger
 * without rewriting all existing call sites.
 *
 * Usage pattern:
 *   - Import AppLogger interface, not @heys/logger directly
 *   - Accept logger as constructor/function argument
 *   - Tests can pass mock logger without vi.mock
 */

export type LogMeta = Record<string, unknown>;

/**
 * Log method signature supporting both formats:
 *   - (msg: string, meta?: LogMeta) - message-first
 *   - (meta: LogMeta, msg: string) - object-first (pino-style)
 */
export interface LogMethod {
  (msg: string, meta?: LogMeta): void;
  (meta: LogMeta, msg: string): void;
}

/**
 * Minimal logger interface that both pino and StructuredLogger can satisfy.
 * Supports dual format: message-first and object-first (pino-style).
 */
export interface AppLogger {
  debug: LogMethod;
  info: LogMethod;
  warn: LogMethod;
  error: LogMethod;

  /**
   * Create a child logger with additional context.
   * Optional - not all loggers support this.
   */
  child?(context: LogMeta): AppLogger;
}

/**
 * Normalize log arguments to { msg, meta } regardless of order.
 * Handles both:
 *   - (msg: string, meta?: LogMeta)
 *   - (meta: LogMeta, msg: string)
 */
export function normalizeLogArgs(
  a: string | LogMeta,
  b?: string | LogMeta,
): { msg: string; meta?: LogMeta } {
  if (typeof a === 'string') {
    // message-first: (msg, meta?)
    return { msg: a, meta: b as LogMeta | undefined };
  }
  // object-first: (meta, msg)
  return { msg: (b as string) ?? '', meta: a };
}

/**
 * Adapter for pino logger (@heys/logger).
 * Pino signature: logger.info(obj?, msg) or logger.info(msg)
 * Accepts both message-first and object-first formats.
 */
export function createPinoAdapter(pinoLogger: {
  debug(obj: object | string, msg?: string): void;
  info(obj: object | string, msg?: string): void;
  warn(obj: object | string, msg?: string): void;
  error(obj: object | string, msg?: string): void;
  child?(context: object): unknown;
}): AppLogger {
  const adapt =
    (level: 'debug' | 'info' | 'warn' | 'error'): LogMethod =>
    (a: string | LogMeta, b?: string | LogMeta): void => {
      const { msg, meta } = normalizeLogArgs(a, b);
      if (meta && Object.keys(meta).length > 0) {
        pinoLogger[level](meta, msg);
      } else {
        pinoLogger[level](msg);
      }
    };

  const result: AppLogger = {
    debug: adapt('debug'),
    info: adapt('info'),
    warn: adapt('warn'),
    error: adapt('error'),
  };

  // Only add child method if source logger has it
  if (pinoLogger.child) {
    result.child = (context: LogMeta) =>
      createPinoAdapter(pinoLogger.child!(context) as typeof pinoLogger);
  }

  return result;
}

/**
 * Adapter for StructuredLogger.
 * StructuredLogger signature: logger.warn(message, context?) where context = { metadata?, ... }
 * Accepts both message-first and object-first formats.
 */
export function createStructuredLoggerAdapter(structuredLogger: {
  debug(message: string, context?: { metadata?: Record<string, unknown> }): void;
  info(message: string, context?: { metadata?: Record<string, unknown> }): void;
  warn(message: string, context?: { metadata?: Record<string, unknown> }): void;
  error(message: string, context?: { metadata?: Record<string, unknown> }): void;
}): AppLogger {
  const adapt =
    (level: 'debug' | 'info' | 'warn' | 'error'): LogMethod =>
    (a: string | LogMeta, b?: string | LogMeta): void => {
      const { msg, meta } = normalizeLogArgs(a, b);
      if (meta && Object.keys(meta).length > 0) {
        structuredLogger[level](msg, { metadata: meta });
      } else {
        structuredLogger[level](msg);
      }
    };

  return {
    debug: adapt('debug'),
    info: adapt('info'),
    warn: adapt('warn'),
    error: adapt('error'),
  };
}

/**
 * Console adapter for simple environments or tests.
 * Accepts both message-first and object-first formats.
 */
export function createConsoleAdapter(console: Console = globalThis.console): AppLogger {
  const adapt =
    (level: 'debug' | 'info' | 'warn' | 'error'): LogMethod =>
    (a: string | LogMeta, b?: string | LogMeta): void => {
      const { msg, meta } = normalizeLogArgs(a, b);
      if (meta && Object.keys(meta).length > 0) {
        console[level](msg, meta);
      } else {
        console[level](msg);
      }
    };

  return {
    debug: adapt('debug'),
    info: adapt('info'),
    warn: adapt('warn'),
    error: adapt('error'),
  };
}

/**
 * Noop logger for tests or when logging should be silenced.
 */
export const noopLogger: AppLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => noopLogger,
};

/**
 * Create a mock logger that captures all log calls for assertions.
 * Useful in tests. Accepts both message-first and object-first formats.
 */
export function createMockLogger(): AppLogger & {
  calls: { level: string; msg: string; meta: LogMeta | undefined }[];
  clear(): void;
} {
  const calls: { level: string; msg: string; meta: LogMeta | undefined }[] = [];

  const capture =
    (level: string): LogMethod =>
    (a: string | LogMeta, b?: string | LogMeta): void => {
      const { msg, meta } = normalizeLogArgs(a, b);
      calls.push({ level, msg, meta });
    };

  return {
    debug: capture('debug'),
    info: capture('info'),
    warn: capture('warn'),
    error: capture('error'),
    child: () => createMockLogger(),
    calls,
    clear: () => {
      calls.length = 0;
    },
  };
}
