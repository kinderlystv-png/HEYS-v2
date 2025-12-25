/**
 * Performance module logger configuration.
 *
 * Single entry point for logging within performance module.
 * Uses AppLogger interface for testability and logger-agnostic code.
 *
 * DUAL FORMAT SUPPORT:
 *   - message-first: perfLogger.info('message', { key: 'value' })
 *   - object-first (pino-style): perfLogger.info({ key: 'value' }, 'message')
 *
 * This allows gradual migration from @heys/logger (pino) to AppLogger
 * without rewriting existing call sites.
 *
 * Usage:
 *   import { perfLogger, createPerfLogger } from './logger';
 *
 *   // Both styles work:
 *   perfLogger.info('Message', { metric: 'value' });       // message-first
 *   perfLogger.info({ metric: 'value' }, 'Message');       // object-first (pino-style)
 *
 *   // Create custom logger for testing
 *   const testLogger = createPerfLogger(createMockLogger());
 */

import pinoLogger from '@heys/logger';

import type { AppLogger, LogMeta, LogMethod } from '../logging';
import { createPinoAdapter, normalizeLogArgs } from '../logging';

/**
 * Create a performance logger from AppLogger instance.
 * Wraps with 'performance' component context.
 * Supports both message-first and object-first formats.
 */
export function createPerfLogger(logger: AppLogger): AppLogger {
  // If logger supports child, use it for component context
  if (logger.child) {
    return logger.child({ component: 'performance' });
  }

  // Otherwise wrap with prefix in messages
  const wrapMethod =
    (method: LogMethod): LogMethod =>
    (a: string | LogMeta, b?: string | LogMeta) => {
      const { msg, meta } = normalizeLogArgs(a, b);
      method(`[perf] ${msg}`, meta);
    };

  return {
    debug: wrapMethod(logger.debug),
    info: wrapMethod(logger.info),
    warn: wrapMethod(logger.warn),
    error: wrapMethod(logger.error),
  };
}

/**
 * Default performance logger using pino.
 * Can be overridden via PerformanceConfig.logger in PerformanceManager.
 */
export const perfLogger: AppLogger = createPerfLogger(
  createPinoAdapter(pinoLogger.child({ module: 'performance' })),
);

/**
 * Noop logger for silent operation.
 * Useful when logging should be completely disabled.
 */
export const noopPerfLogger: AppLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};
