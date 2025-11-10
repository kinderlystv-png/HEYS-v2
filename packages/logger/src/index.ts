import pino from 'pino';

import { LEVEL_METHODS, LEVEL_VALUES } from '../../../levels.config.js';

import { defaultConfig, validateConfig, type AdvancedLoggerConfig } from './config.js';
import { createFormatters, createSerializers, createTransports } from './transports.js';

/**
 * Уровни логирования для HEYS системы (обновленные)
 */
export enum LogLevel {
  TRACE = 'trace',
  DEBUG = 'debug',
  INFO = 'info',
  HTTP = 'http',
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal',
  SILENT = 'silent',
}

/**
 * Расширенные уровни с поддержкой новой конфигурации
 */
export const HEYS_LOG_LEVELS = LEVEL_VALUES;
export const HEYS_LEVEL_METHODS = LEVEL_METHODS;

/**
 * Контекст запроса для логирования
 */
export interface RequestContext {
  requestId?: string;
  userId?: string;
  clientId?: string;
  userAgent?: string;
  ip?: string;
  method?: string;
  url?: string;
}

/**
 * Настройки логгера (legacy для обратной совместимости)
 */
export interface LoggerConfig {
  level?: LogLevel;
  service?: string;
  environment?: string;
  enableConsole?: boolean;
  enableFile?: boolean;
  logDir?: string;
}

// Экспортируем новые типы
export { defaultConfig, validateConfig };
export type { AdvancedLoggerConfig };

/**
 * Создает настроенный логгер для HEYS системы (legacy версия)
 */
export function createLogger(config: LoggerConfig = {}) {
  const {
    level = LogLevel.INFO,
    service = 'heys-app',
    environment = process.env.NODE_ENV || 'development',
  } = config;

  const isProduction = environment === 'production';

  // Конфигурация для продакшена - JSON формат
  const productionConfig = {
    level,
    base: {
      service,
      environment,
      pid: process.pid,
      hostname: process.env.HOSTNAME || 'unknown',
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label: string) => {
        return { level: label };
      },
    },
  };

  // Конфигурация для разработки - красивый формат
  const developmentConfig = {
    level,
    base: {
      service,
      environment,
    },
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        ignore: 'pid,hostname',
        translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
        messageFormat: '[{service}] {msg}',
      },
    },
  };

  return pino(isProduction ? productionConfig : developmentConfig);
}

/**
 * Создает расширенный логгер с поддержкой мультистрим транспортов
 */
export function createAdvancedLogger(config: Partial<AdvancedLoggerConfig> = {}): pino.Logger {
  const validatedConfig = validateConfig(config);
  const streams = createTransports(validatedConfig);
  const formatters = createFormatters(validatedConfig);
  const serializers = createSerializers();

  const options: pino.LoggerOptions = {
    level: validatedConfig.level,
    base: {
      service: validatedConfig.service,
      environment: validatedConfig.environment,
      version: process.env.npm_package_version || '1.0.0',
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters,
    serializers,
    redact: {
      paths: validatedConfig.redact,
      censor: '[REDACTED]',
    },
  };

  // Если есть несколько стримов, используем multistream
  if (streams.length > 1) {
    return pino(options, pino.multistream(streams));
  }

  // Если только один стрим, используем его напрямую
  if (streams.length === 1 && streams[0]) {
    return pino(options, streams[0].stream);
  }

  // Fallback на стандартный вывод
  return pino(options);
}

/**
 * Базовый логгер для всей системы HEYS с расширенными возможностями
 */
export const logger = createAdvancedLogger({
  service: 'heys-system',
  level: (process.env.LOG_LEVEL as LogLevel) || LogLevel.INFO,
});

/**
 * Создает дочерний логгер с контекстом
 */
export function createContextLogger(context: RequestContext, service?: string) {
  const baseLogger = service ? createLogger({ service }) : logger;
  return baseLogger.child(context);
}

/**
 * Middleware функция для логирования HTTP запросов
 */
export function createHttpLogger(service?: string) {
  const httpLogger = service ? createLogger({ service }) : logger;

  return (
    req: {
      headers: Record<string, string>;
      method: string;
      url: string;
      ip?: string;
      connection?: { remoteAddress?: string };
      logger?: pino.Logger;
    },
    res: {
      statusCode: number;
      get: (header: string) => string | number;
      on: (event: string, callback: () => void) => void;
    },
    next: () => void,
  ) => {
    const start = Date.now();
    const requestId =
      req.headers['x-request-id'] || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const context: RequestContext = {
      requestId,
      method: req.method,
      url: req.url,
    };

    const userAgent = req.headers['user-agent'];
    if (userAgent) {
      context.userAgent = userAgent;
    }

    const ip = req.ip ?? req.connection?.remoteAddress;
    if (ip) {
      context.ip = ip;
    }

    req.logger = httpLogger.child(context);

    req.logger.info('Request started');

    res.on('finish', () => {
      const duration = Date.now() - start;
      req.logger?.info(
        {
          statusCode: res.statusCode,
          duration,
          responseSize: res.get('content-length') || 0,
        },
        'Request completed',
      );
    });

    next();
  };
}

/**
 * Вспомогательные функции для быстрого логирования
 */
export const log = {
  trace: (msg: string, obj?: Record<string, unknown>) => logger.trace(obj, msg),
  debug: (msg: string, obj?: Record<string, unknown>) => logger.debug(obj, msg),
  info: (msg: string, obj?: Record<string, unknown>) => logger.info(obj, msg),
  warn: (msg: string, obj?: Record<string, unknown>) => logger.warn(obj, msg),
  error: (msg: string, obj?: Record<string, unknown>) => logger.error(obj, msg),
  fatal: (msg: string, obj?: Record<string, unknown>) => logger.fatal(obj, msg),
};

/**
 * Функция для логирования ошибок с полным стеком
 */
export function logError(error: Error, context?: Record<string, unknown>) {
  logger.error(
    {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      ...context,
    },
    'Error occurred',
  );
}

export default logger;
