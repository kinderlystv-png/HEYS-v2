/**
 * Environment-specific Logging Configuration
 * Специализированные настройки для разных окружений
 */

import { LEVEL_VALUES } from '../levels.config.js';

// Базовая конфигурация для всех окружений
const BASE_CONFIG = {
  appName: 'heys-platform',
  version: process.env.npm_package_version || '1.0.0',
  timezone: 'UTC',

  // Общие настройки безопасности
  security: {
    redactFields: [
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
      'privateKey',
    ],
    maskingPattern: '[REDACTED]',
    auditSensitiveOperations: true,
  },

  // Общие форматы
  formats: {
    timestamp: 'iso',
    messageKey: 'msg',
    levelKey: 'level',
    errorKey: 'err',
  },
};

// Development окружение
export const DEVELOPMENT_CONFIG = {
  ...BASE_CONFIG,

  level: 'debug',

  // Консольный вывод
  console: {
    enabled: true,
    level: 'debug',
    colorize: true,
    timestamp: true,
    prettyPrint: true,
    singleLine: false,
    hideObject: false,
    translateTime: 'yyyy-mm-dd HH:MM:ss',
    ignore: 'pid,hostname',
    messageFormat: '[{service}] {level}: {msg}',
    levelFirst: false,
    crlf: false,
  },

  // Файловые логи
  file: {
    enabled: true,
    level: 'info',
    path: './logs',
    filename: 'heys-dev-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    maxSize: '20m',
    maxFiles: '3d',
    format: 'json',
    auditFile: './logs/heys-dev-audit.json',
  },

  // HTTP логирование
  http: {
    enabled: true,
    level: 'http',
    autoLogging: true,
    customLogLevel: (req, res, _err) => {
      if (res.statusCode >= 400) return 'warn';
      if (res.statusCode >= 300) return 'info';
      return 'http';
    },
  },

  // Производительность
  performance: {
    enabled: true,
    logSlowOperations: true,
    slowThreshold: 100, // ms
    memoryUsage: true,
    cpuUsage: false,
  },

  // Отладка
  debug: {
    logStackTrace: true,
    logMethodCalls: true,
    logDatabaseQueries: true,
    logCacheOperations: true,
  },
};

// Test окружение
export const TEST_CONFIG = {
  ...BASE_CONFIG,

  level: 'error',

  console: {
    enabled: false,
    level: 'silent',
  },

  file: {
    enabled: true,
    level: 'error',
    path: './logs/test',
    filename: 'heys-test.log',
    maxSize: '10m',
    maxFiles: 1,
    format: 'json',
  },

  http: {
    enabled: false,
  },

  performance: {
    enabled: false,
    logSlowOperations: false,
  },

  debug: {
    logStackTrace: false,
    logMethodCalls: false,
    logDatabaseQueries: false,
    logCacheOperations: false,
  },

  // Тестовые специфичные настройки
  test: {
    silentMode: true,
    collectLogs: true,
    memoryLogger: true,
    assertionLogging: false,
  },
};

// Staging окружение
export const STAGING_CONFIG = {
  ...BASE_CONFIG,

  level: 'info',

  console: {
    enabled: true,
    level: 'warn',
    colorize: false,
    format: 'json',
    timestamp: true,
  },

  file: {
    enabled: true,
    level: 'info',
    path: './logs',
    filename: 'heys-staging-%DATE%.log',
    datePattern: 'YYYY-MM-DD-HH',
    maxSize: '50m',
    maxFiles: '7d',
    format: 'json',
    compress: 'gzip',
    auditFile: './logs/heys-staging-audit.json',
  },

  http: {
    enabled: true,
    level: 'info',
    autoLogging: true,
    customLogLevel: (req, res, err) => {
      if (err) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
  },

  performance: {
    enabled: true,
    logSlowOperations: true,
    slowThreshold: 500,
    memoryUsage: true,
    cpuUsage: true,
  },

  // Staging специфичные настройки
  staging: {
    enableMetrics: true,
    healthChecks: true,
    performanceMonitoring: true,
    errorReporting: true,
  },
};

// Production окружение
export const PRODUCTION_CONFIG = {
  ...BASE_CONFIG,

  level: 'warn',

  console: {
    enabled: true,
    level: 'error',
    colorize: false,
    format: 'json',
    timestamp: true,
  },

  file: {
    enabled: true,
    level: 'info',
    path: process.env.LOG_PATH || '/var/log/heys',
    filename: 'heys-prod-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    maxSize: '100m',
    maxFiles: '30d',
    format: 'json',
    compress: 'gzip',
    auditFile: '/var/log/heys/heys-audit.json',
    handleExceptions: true,
    handleRejections: true,
  },

  // Отдельный файл для ошибок
  errorFile: {
    enabled: true,
    level: 'error',
    path: process.env.LOG_PATH || '/var/log/heys',
    filename: 'heys-error-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    maxSize: '50m',
    maxFiles: '90d',
    format: 'json',
    compress: 'gzip',
  },

  http: {
    enabled: true,
    level: 'warn',
    autoLogging: true,
    customLogLevel: (req, res, err) => {
      if (err) return 'error';
      if (res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
  },

  performance: {
    enabled: true,
    logSlowOperations: true,
    slowThreshold: 1000,
    memoryUsage: true,
    cpuUsage: true,
    sampling: 0.1, // Логируем только 10% операций
  },

  // Безопасность для продакшена
  security: {
    ...BASE_CONFIG.security,
    sanitizeHeaders: true,
    maskPasswords: true,
    auditLevel: 'warn',
    logFailedLogins: true,
    logAdminOperations: true,
    ipLogging: true,
  },

  // Production специфичные настройки
  production: {
    enableMetrics: true,
    healthChecks: true,
    performanceMonitoring: true,
    errorReporting: true,
    alerting: true,
    centralized: true,
  },
};

// Функция получения конфигурации по окружению
export function getEnvironmentConfig(env = process.env.NODE_ENV) {
  const configs = {
    development: DEVELOPMENT_CONFIG,
    dev: DEVELOPMENT_CONFIG,
    test: TEST_CONFIG,
    testing: TEST_CONFIG,
    staging: STAGING_CONFIG,
    stage: STAGING_CONFIG,
    production: PRODUCTION_CONFIG,
    prod: PRODUCTION_CONFIG,
  };

  return configs[env] || DEVELOPMENT_CONFIG;
}

// Функция создания конфигурации для Pino
export function createPinoConfig(env = process.env.NODE_ENV) {
  const config = getEnvironmentConfig(env);

  return {
    name: config.appName,
    level: config.level,
    levels: LEVEL_VALUES,

    formatters: {
      level: (label, number) => ({ level: label, levelValue: number }),
      bindings: (bindings) => ({
        pid: bindings.pid,
        hostname: bindings.hostname,
        service: config.appName,
        version: config.version,
        environment: env,
      }),
    },

    timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,

    redact: {
      paths: config.security.redactFields,
      censor: config.security.maskingPattern,
    },

    serializers: {
      req: (req) => ({
        method: req.method,
        url: req.url,
        headers: req.headers,
        remoteAddress: req.remoteAddress,
        remotePort: req.remotePort,
      }),
      res: (res) => ({
        statusCode: res.statusCode,
        headers: res.getHeaders?.() || res.headers,
      }),
      err: (err) => ({
        type: err.constructor.name,
        message: err.message,
        stack: err.stack,
        code: err.code,
      }),
    },
  };
}

// Функция создания конфигурации для Winston
export function createWinstonConfig(env = process.env.NODE_ENV) {
  const config = getEnvironmentConfig(env);

  return {
    level: config.level,
    levels: LEVEL_VALUES,
    defaultMeta: {
      service: config.appName,
      version: config.version,
      environment: env,
    },
    exitOnError: false,
  };
}

// Экспорт по умолчанию
export default {
  DEVELOPMENT_CONFIG,
  TEST_CONFIG,
  STAGING_CONFIG,
  PRODUCTION_CONFIG,
  getEnvironmentConfig,
  createPinoConfig,
  createWinstonConfig,
};

// CommonJS совместимость
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DEVELOPMENT_CONFIG,
    TEST_CONFIG,
    STAGING_CONFIG,
    PRODUCTION_CONFIG,
    getEnvironmentConfig,
    createPinoConfig,
    createWinstonConfig,
    default: {
      DEVELOPMENT_CONFIG,
      TEST_CONFIG,
      STAGING_CONFIG,
      PRODUCTION_CONFIG,
      getEnvironmentConfig,
      createPinoConfig,
      createWinstonConfig,
    },
  };
}
