// utils/logger.ts - Простой logger для разработки

import { log, logError, logInfo, logWarning } from '../../../lib/browser-logger';

interface Logger {
  info: (message: string, data?: unknown) => void;
  error: (message: string, error?: unknown) => void;
  warn: (message: string, data?: unknown) => void;
}

const isDevelopment = process.env.NODE_ENV !== 'production';

export const logger: Logger = {
  info: (message: string, data?: unknown) => {
    if (!isDevelopment) {
      log.info(message, data);
      return;
    }

    logInfo(message, typeof data === 'object' ? (data as Record<string, unknown>) : { data });
  },
  error: (message: string, error?: unknown) => {
    if (!isDevelopment) {
      log.error(message, { error });
      return;
    }

    if (error instanceof Error) {
      logError(error, { message });
    } else {
      log.error(message, { error });
    }
    // В production здесь был бы отправлен лог в Sentry или другую систему
  },
  warn: (message: string, data?: unknown) => {
    if (!isDevelopment) {
      log.warn(message, { data });
      return;
    }

    logWarning(message, typeof data === 'object' ? (data as Record<string, unknown>) : { data });
  },
};
