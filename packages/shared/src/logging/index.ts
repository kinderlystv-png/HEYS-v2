/**
 * Logging module exports
 * Provides unified logger interface and adapters for different logger implementations.
 */

export {
  createConsoleAdapter,
  createMockLogger,
  createPinoAdapter,
  createStructuredLoggerAdapter,
  noopLogger,
  normalizeLogArgs,
} from './AppLogger';

export type { AppLogger, LogMeta, LogMethod } from './AppLogger';
