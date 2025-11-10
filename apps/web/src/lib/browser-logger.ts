/**
 * Browser-friendly logger for @heys/logger
 */

export interface Logger {
  trace: (message: string, ...args: unknown[]) => void;
  debug: (message: string, ...args: unknown[]) => void;
  info: (message: string, ...args: unknown[]) => void;
  warn: (message: string, ...args: unknown[]) => void;
  error: (message: string, ...args: unknown[]) => void;
  fatal: (message: string, ...args: unknown[]) => void;
}

const createBrowserLogger = (): Logger => {
  const noop = () => {};

  if (typeof window === 'undefined') {
    return {
      trace: noop,
      debug: noop,
      info: noop,
      warn: noop,
      error: noop,
      fatal: noop,
    };
  }

  return {
    trace: (message: string, ...args: unknown[]) => {
      // eslint-disable-next-line no-console
      console.debug(`[TRACE] ${message}`, ...args);
    },
    debug: (message: string, ...args: unknown[]) => {
      // eslint-disable-next-line no-console
      console.debug(`[DEBUG] ${message}`, ...args);
    },
    info: (message: string, ...args: unknown[]) => {
      // eslint-disable-next-line no-console
      console.info(`[INFO] ${message}`, ...args);
    },
    warn: (message: string, ...args: unknown[]) => {
      // eslint-disable-next-line no-console
      console.warn(`[WARN] ${message}`, ...args);
    },
    error: (message: string, ...args: unknown[]) => {
      // eslint-disable-next-line no-console
      console.error(`[ERROR] ${message}`, ...args);
    },
    fatal: (message: string, ...args: unknown[]) => {
      // eslint-disable-next-line no-console
      console.error(`[FATAL] ${message}`, ...args);
    },
  };
};

export const log = createBrowserLogger();

export const logError = (error: Error, context?: Record<string, unknown>) => {
  // eslint-disable-next-line no-console
  console.error('[ERROR]', error.message, context || {}, error);
};

export const logWarning = (message: string, context?: Record<string, unknown>) => {
  // eslint-disable-next-line no-console
  console.warn('[WARN]', message, context || {});
};

export const logInfo = (message: string, context?: Record<string, unknown>) => {
  // eslint-disable-next-line no-console
  console.info('[INFO]', message, context || {});
};
