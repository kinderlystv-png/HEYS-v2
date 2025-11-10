/**
 * Winston Logging Configuration for HEYS Platform
 * Совместимость с ЭАП анализатором
 */

const path = require('path');

const winston = require('winston');

// Создаем директорию логов если её нет
const logDir = path.join(process.cwd(), 'logs');
require('fs').mkdirSync(logDir, { recursive: true });

// Кастомные уровни логирования
const customLevels = {
  levels: {
    fatal: 0,
    error: 1,
    warn: 2,
    info: 3,
    debug: 4,
    trace: 5,
  },
  colors: {
    fatal: 'red',
    error: 'red',
    warn: 'yellow',
    info: 'green',
    debug: 'blue',
    trace: 'gray',
  },
};

// Добавляем цвета в winston
winston.addColors(customLevels.colors);

// Форматтеры
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
    const metaString = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
    return `${timestamp} [${service || 'HEYS'}] ${level}: ${message} ${metaString}`;
  }),
);

const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, service, stack, ...meta }) => {
    const logEntry = {
      timestamp,
      level,
      service: service || 'heys-platform',
      message,
      ...meta,
    };

    if (stack) {
      logEntry.stack = stack;
    }

    return JSON.stringify(logEntry);
  }),
);

// Конфигурация транспортов
const transports = [
  // Console transport
  new winston.transports.Console({
    level: process.env.NODE_ENV === 'production' ? 'warn' : 'debug',
    format: process.env.NODE_ENV === 'production' ? fileFormat : consoleFormat,
    handleExceptions: true,
    handleRejections: true,
  }),

  // Combined log file
  new winston.transports.File({
    filename: path.join(logDir, 'heys-combined.log'),
    level: 'info',
    format: fileFormat,
    maxsize: 10485760, // 10MB
    maxFiles: 5,
    tailable: true,
  }),

  // Error log file
  new winston.transports.File({
    filename: path.join(logDir, 'heys-error.log'),
    level: 'error',
    format: fileFormat,
    maxsize: 5242880, // 5MB
    maxFiles: 3,
    handleExceptions: true,
    handleRejections: true,
  }),

  // Debug log file (только для development)
  ...(process.env.NODE_ENV !== 'production'
    ? [
        new winston.transports.File({
          filename: path.join(logDir, 'heys-debug.log'),
          level: 'debug',
          format: fileFormat,
          maxsize: 10485760,
          maxFiles: 2,
        }),
      ]
    : []),
];

// Основная конфигурация Winston
const winstonConfig = {
  levels: customLevels.levels,
  level: process.env.LOG_LEVEL || 'info',
  transports,
  defaultMeta: {
    service: 'heys-platform',
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
  },
  exitOnError: false,

  // Exception handling
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logDir, 'heys-exceptions.log'),
      format: fileFormat,
    }),
  ],

  // Rejection handling
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logDir, 'heys-rejections.log'),
      format: fileFormat,
    }),
  ],
};

// Создаем основной логгер
const logger = winston.createLogger(winstonConfig);

// Добавляем методы для совместимости с ЭАП
logger.trace = (message, meta) => logger.log('trace', message, meta);
logger.fatal = (message, meta) => logger.log('fatal', message, meta);

// HTTP request logger middleware
logger.httpLogger = (req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const logLevel = res.statusCode >= 400 ? 'error' : 'info';

    logger.log(logLevel, 'HTTP Request', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration,
      userAgent: req.get('User-Agent'),
      ip: req.ip || req.connection.remoteAddress,
    });
  });

  if (next) next();
};

// Error handling middleware
logger.errorHandler = (err, req, res, next) => {
  logger.error('Unhandled Error', {
    error: {
      message: err.message,
      stack: err.stack,
      code: err.code,
    },
    request: {
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: req.body,
    },
  });

  if (next) next(err);
};

// Performance logger
logger.performance = (operation, duration, metadata = {}) => {
  const level = duration > 1000 ? 'warn' : 'info';
  logger.log(level, `Performance: ${operation}`, {
    operation,
    duration,
    ...metadata,
  });
};

// Security logger
logger.security = (event, details = {}) => {
  logger.warn('Security Event', {
    event,
    timestamp: new Date().toISOString(),
    ...details,
  });
};

// Audit logger
logger.audit = (action, user, resource, details = {}) => {
  logger.info('Audit Event', {
    action,
    user,
    resource,
    timestamp: new Date().toISOString(),
    ...details,
  });
};

// Health check
logger.healthCheck = () => {
  try {
    logger.info('Logger Health Check', {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      transports: logger.transports.length,
      level: logger.level,
    });
    return true;
  } catch (error) {
    console.error('Logger health check failed:', error);
    return false;
  }
};

// Экспорт конфигурации и логгера
module.exports = {
  logger,
  config: winstonConfig,
  levels: customLevels.levels,
  colors: customLevels.colors,
  transports,

  // Функции создания логгеров
  createLogger: (service) => {
    return winston.createLogger({
      ...winstonConfig,
      defaultMeta: {
        ...winstonConfig.defaultMeta,
        service,
      },
    });
  },

  // Получение конфигурации по окружению
  getConfig: (env = process.env.NODE_ENV) => {
    const configs = {
      development: {
        level: 'debug',
        console: true,
        file: true,
        colorize: true,
      },
      test: {
        level: 'error',
        console: false,
        file: true,
        colorize: false,
      },
      production: {
        level: 'warn',
        console: true,
        file: true,
        colorize: false,
        json: true,
      },
    };

    return configs[env] || configs.development;
  },
};

// Default export для ES6 модулей
module.exports.default = logger;
