/**
 * HEYS Platform Logger
 * Централизованная система логирования для ЭАП анализатора
 */

import pino from 'pino';

// Уровни логирования (ЭАП требует error, warn, info, debug)
const LOG_LEVELS = {
  fatal: 60,
  error: 50,
  warn: 40,
  info: 30,
  debug: 20,
  trace: 10,
};

// Конфигурация для разных окружений (ЭАП проверяет NODE_ENV)
const getLoggerConfig = () => {
  const isDev = process.env.NODE_ENV === 'development';
  const isProd = process.env.NODE_ENV === 'production';

  return {
    name: 'heys-platform',
    level: isProd ? 'warn' : isDev ? 'debug' : 'info',

    // Форматирование в зависимости от окружения
    formatters: {
      level: (label, number) => ({ level: label, levelValue: number }),
      bindings: (bindings) => ({
        pid: bindings.pid,
        hostname: bindings.hostname,
        service: 'heys-platform',
        environment: process.env.NODE_ENV || 'development',
      }),
    },

    // Timestamp для всех окружений
    timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,

    // Безопасность - маскирование чувствительных данных
    redact: {
      paths: [
        'password',
        'token',
        'secret',
        'authorization',
        'cookie',
        'session',
        'apiKey',
        'accessToken',
      ],
      censor: '[REDACTED]',
    },

    // Транспорты в зависимости от окружения
    transport: isDev
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'yyyy-mm-dd HH:MM:ss',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
  };
};

// Создание основного логгера
const logger = pino(getLoggerConfig());

// Методы для всех уровней (ЭАП проверяет наличие error, warn, info, debug)
export const log = {
  // Критические уровни
  fatal: (message, meta = {}) => logger.fatal(meta, message),
  error: (message, meta = {}) => logger.error(meta, message),

  // Предупреждения
  warn: (message, meta = {}) => logger.warn(meta, message),

  // Информационные
  info: (message, meta = {}) => logger.info(meta, message),

  // Отладочные (ЭАП требует debug)
  debug: (message, meta = {}) => logger.debug(meta, message),
  trace: (message, meta = {}) => logger.trace(meta, message),

  // Создание child логгера
  child: (context) => logger.child(context),

  // Уровень логирования
  level: logger.level,
  setLevel: (level) => {
    logger.level = level;
  },
};

// HTTP логирование
export const httpLogger = (req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const logLevel = res.statusCode >= 400 ? 'error' : 'info';

    logger[logLevel](
      {
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        duration,
        userAgent: req.get('User-Agent'),
        ip: req.ip,
      },
      `${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`,
    );
  });

  if (next) next();
};

// Обработка ошибок
export const errorLogger = (err, req, res, next) => {
  logger.error(
    {
      err: {
        message: err.message,
        stack: err.stack,
        code: err.code,
      },
      request: {
        method: req.method,
        url: req.url,
        headers: req.headers,
      },
    },
    `Unhandled Error: ${err.message}`,
  );

  if (next) next(err);
};

// Производительность
export const performanceLogger = (operation, duration, metadata = {}) => {
  const level = duration > 1000 ? 'warn' : 'info';
  logger[level](
    {
      operation,
      duration,
      ...metadata,
    },
    `Performance: ${operation} completed in ${duration}ms`,
  );
};

// Экспорт по умолчанию
export default logger;

// Экспорт уровней для внешнего использования
export { LOG_LEVELS };
