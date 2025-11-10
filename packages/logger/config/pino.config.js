/**
 * Pino Logging Configuration for HEYS Platform
 * Оптимизированная конфигурация для высокой производительности
 */

const path = require('path');

// Уровни логирования Pino
const levels = {
  fatal: 60,
  error: 50,
  warn: 40,
  info: 30,
  debug: 20,
  trace: 10,
};

// Базовая конфигурация Pino
const baseConfig = {
  name: 'heys-platform',
  level: process.env.LOG_LEVEL || 'info',

  // Форматтеры
  formatters: {
    level: (label, _number) => ({ level: label }),
    bindings: (bindings) => ({
      pid: bindings.pid,
      hostname: bindings.hostname,
      service: 'heys-platform',
      version: process.env.npm_package_version || '1.0.0',
    }),
  },

  // Timestamp
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
      'refreshToken',
      'creditCard',
      'ssn',
      'personalData',
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
    ],
    censor: '[REDACTED]',
  },

  // Сериализаторы для объектов
  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url,
      headers: {
        'user-agent': req.headers['user-agent'],
        'content-type': req.headers['content-type'],
        accept: req.headers.accept,
      },
      hostname: req.hostname,
      remoteAddress: req.remoteAddress,
      remotePort: req.remotePort,
    }),

    res: (res) => ({
      statusCode: res.statusCode,
      headers: res.getHeaders ? res.getHeaders() : res.headers,
      responseTime: res.responseTime,
    }),

    err: (err) => ({
      type: err.constructor.name,
      message: err.message,
      stack: err.stack,
      code: err.code,
      errno: err.errno,
      syscall: err.syscall,
      path: err.path,
    }),

    user: (user) => ({
      id: user.id,
      username: user.username,
      email: user.email?.replace(/(.{2}).*@/, '$1***@'), // Частичное маскирование email
      role: user.role,
    }),
  },
};

// Конфигурация транспортов для разных окружений
const getTransports = () => {
  const transports = [];
  const logDir = path.join(process.cwd(), 'logs');

  // Создаем директорию логов
  require('fs').mkdirSync(logDir, { recursive: true });

  // Development - красивый вывод в консоль
  if (process.env.NODE_ENV !== 'production') {
    transports.push({
      target: 'pino-pretty',
      level: 'debug',
      options: {
        colorize: true,
        translateTime: 'yyyy-mm-dd HH:MM:ss',
        ignore: 'pid,hostname',
        messageFormat: '[{service}] {msg}',
        singleLine: false,
      },
    });
  }

  // Production - JSON в консоль
  if (process.env.NODE_ENV === 'production') {
    transports.push({
      target: 'pino/file',
      level: 'warn',
      options: {
        destination: 1, // stdout
      },
    });
  }

  // Файловые транспорты
  transports.push(
    // Основной лог файл
    {
      target: 'pino/file',
      level: 'info',
      options: {
        destination: path.join(logDir, 'heys-app.log'),
        mkdir: true,
      },
    },

    // Лог файл ошибок
    {
      target: 'pino/file',
      level: 'error',
      options: {
        destination: path.join(logDir, 'heys-error.log'),
        mkdir: true,
      },
    },

    // Debug лог (только для development)
    ...(process.env.NODE_ENV !== 'production'
      ? [
          {
            target: 'pino/file',
            level: 'debug',
            options: {
              destination: path.join(logDir, 'heys-debug.log'),
              mkdir: true,
            },
          },
        ]
      : []),
  );

  return transports;
};

// Основная конфигурация
const pinoConfig = {
  ...baseConfig,
  transport: {
    targets: getTransports(),
  },
};

// Конфигурация для HTTP логирования
const httpConfig = {
  logger: true,
  genReqId: (req) => req.headers['x-request-id'] || require('crypto').randomUUID(),
  serializers: {
    req: baseConfig.serializers.req,
    res: baseConfig.serializers.res,
  },
  customLogLevel: (req, res, err) => {
    if (res.statusCode >= 400 && res.statusCode < 500) return 'warn';
    if (res.statusCode >= 500 || err) return 'error';
    if (res.statusCode >= 300 && res.statusCode < 400) return 'info';
    return 'info';
  },
  customSuccessMessage: (req, res) => {
    return `${req.method} ${req.url} - ${res.statusCode} (${res.responseTime}ms)`;
  },
  customErrorMessage: (req, res, err) => {
    return `${req.method} ${req.url} - ${res.statusCode} Error: ${err.message}`;
  },
};

// Конфигурации для разных окружений
const environments = {
  development: {
    ...pinoConfig,
    level: 'debug',
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'yyyy-mm-dd HH:MM:ss',
        ignore: 'pid,hostname',
        messageFormat: '[{service}] {msg}',
      },
    },
  },

  test: {
    ...pinoConfig,
    level: 'silent', // Отключаем логи в тестах
    transport: undefined,
  },

  production: {
    ...pinoConfig,
    level: 'warn',
    transport: {
      targets: getTransports().filter((t) => t.target !== 'pino-pretty'),
    },
  },
};

// Дополнительные утилиты
const utils = {
  // Создание child логгера
  createChild: (parentLogger, context) => {
    return parentLogger.child(context);
  },

  // Измерение производительности
  timeLogger: (logger, operation) => {
    const start = Date.now();
    return {
      end: (metadata = {}) => {
        const duration = Date.now() - start;
        const level = duration > 1000 ? 'warn' : 'info';
        logger[level](
          {
            operation,
            duration,
            ...metadata,
          },
          `Operation "${operation}" completed in ${duration}ms`,
        );
        return duration;
      },
    };
  },

  // Логирование ошибок с контекстом
  logError: (logger, error, context = {}) => {
    logger.error(
      {
        err: error,
        context,
        timestamp: new Date().toISOString(),
      },
      error.message,
    );
  },

  // Безопасное логирование объектов
  safeLog: (logger, level, obj, message) => {
    try {
      logger[level](obj, message);
    } catch (err) {
      logger.error({ serialization_error: err.message }, 'Failed to serialize log object');
      logger[level](message);
    }
  },
};

module.exports = {
  baseConfig,
  pinoConfig,
  httpConfig,
  environments,
  levels,
  utils,

  // Получение конфигурации по окружению
  getConfig: (env = process.env.NODE_ENV || 'development') => {
    return environments[env] || environments.development;
  },

  // Создание транспортов
  createTransports: getTransports,

  // Валидация конфигурации
  validateConfig: (config) => {
    const required = ['name', 'level'];
    const missing = required.filter((key) => !config[key]);

    if (missing.length > 0) {
      throw new Error(`Missing required config keys: ${missing.join(', ')}`);
    }

    if (!Object.keys(levels).includes(config.level)) {
      throw new Error(`Invalid log level: ${config.level}`);
    }

    return true;
  },
};

// Default export для ES6 совместимости
module.exports.default = pinoConfig;
