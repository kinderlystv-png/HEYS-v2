/**
 * HEYS Platform - Log Levels Configuration
 * Полная система управления уровнями логирования
 * Соответствует золотому стандарту SHINOMONTAGKA
 */

// Основные уровни логирования (RFC 5424 + расширения)
export const LOG_LEVELS = {
  // Критические уровни
  fatal: {
    value: 60,
    name: 'fatal',
    color: 'magenta',
    symbol: '💀',
    description: 'Критическая ошибка, приводящая к завершению приложения',
  },
  error: {
    value: 50,
    name: 'error',
    color: 'red',
    symbol: '❌',
    description: 'Ошибка, требующая немедленного внимания',
  },

  // Предупреждения
  warn: {
    value: 40,
    name: 'warn',
    color: 'yellow',
    symbol: '⚠️',
    description: 'Предупреждение о потенциальной проблеме',
  },

  // Информационные
  info: {
    value: 30,
    name: 'info',
    color: 'green',
    symbol: 'ℹ️',
    description: 'Общая информация о работе приложения',
  },
  http: {
    value: 29,
    name: 'http',
    color: 'cyan',
    symbol: '🌐',
    description: 'HTTP запросы и ответы',
  },

  // Отладочные
  debug: {
    value: 20,
    name: 'debug',
    color: 'blue',
    symbol: '🔍',
    description: 'Отладочная информация для разработки',
  },
  trace: {
    value: 10,
    name: 'trace',
    color: 'gray',
    symbol: '🔬',
    description: 'Детальная трассировка выполнения',
  },

  // Специальные
  silent: {
    value: Infinity,
    name: 'silent',
    color: 'white',
    symbol: '🔇',
    description: 'Отключение всех логов',
  },
};

// Алиасы для совместимости
export const LEVEL_ALIASES = {
  err: 'error',
  warning: 'warn',
  information: 'info',
  verbose: 'debug',
  silly: 'trace',
  off: 'silent',
};

// Цвета для консольного вывода
export const LEVEL_COLORS = Object.fromEntries(
  Object.entries(LOG_LEVELS).map(([key, level]) => [key, level.color]),
);

// Только значения уровней для Pino/Winston
export const LEVEL_VALUES = Object.fromEntries(
  Object.entries(LOG_LEVELS).map(([key, level]) => [key, level.value]),
);

// Маппинг уровней на методы
export const LEVEL_METHODS = Object.keys(LOG_LEVELS);

// Конфигурация для разных окружений
export const ENVIRONMENT_CONFIGS = {
  development: {
    defaultLevel: 'debug',
    console: {
      enabled: true,
      level: 'debug',
      colorize: true,
      timestamp: true,
      prettyPrint: true,
    },
    file: {
      enabled: true,
      level: 'info',
      rotation: false,
    },
    performance: {
      logSlowOperations: true,
      threshold: 100, // ms
    },
  },

  test: {
    defaultLevel: 'error',
    console: {
      enabled: false,
      level: 'silent',
    },
    file: {
      enabled: true,
      level: 'error',
      path: './logs/test',
    },
    performance: {
      logSlowOperations: false,
    },
  },

  staging: {
    defaultLevel: 'info',
    console: {
      enabled: true,
      level: 'warn',
      colorize: false,
      format: 'json',
    },
    file: {
      enabled: true,
      level: 'info',
      rotation: true,
      maxSize: '50m',
      maxFiles: '7d',
    },
    performance: {
      logSlowOperations: true,
      threshold: 500,
    },
  },

  production: {
    defaultLevel: 'warn',
    console: {
      enabled: true,
      level: 'error',
      colorize: false,
      format: 'json',
    },
    file: {
      enabled: true,
      level: 'info',
      rotation: true,
      maxSize: '100m',
      maxFiles: '30d',
      compress: true,
    },
    performance: {
      logSlowOperations: true,
      threshold: 1000,
    },
    security: {
      sanitizeHeaders: true,
      maskPasswords: true,
      auditLevel: 'warn',
    },
  },
};

// Форматтеры для разных уровней
export const LEVEL_FORMATTERS = {
  fatal: (message, meta) => `💀 FATAL: ${message} ${JSON.stringify(meta)}`,
  error: (message, meta) => `❌ ERROR: ${message} ${meta ? JSON.stringify(meta) : ''}`,
  warn: (message, meta) => `⚠️  WARN: ${message} ${meta ? JSON.stringify(meta) : ''}`,
  info: (message, _meta) => `ℹ️  INFO: ${message}`,
  http: (message, _meta) => `🌐 HTTP: ${message}`,
  debug: (message, meta) => `🔍 DEBUG: ${message} ${meta ? JSON.stringify(meta) : ''}`,
  trace: (message, meta) => `🔬 TRACE: ${message} ${meta ? JSON.stringify(meta) : ''}`,
};

// Предикаты для фильтрации
export const LEVEL_PREDICATES = {
  isError: (level) => ['fatal', 'error'].includes(level),
  isWarning: (level) => level === 'warn',
  isInfo: (level) => ['info', 'http'].includes(level),
  isDebug: (level) => ['debug', 'trace'].includes(level),
  isCritical: (level) => ['fatal', 'error', 'warn'].includes(level),
  isProduction: (level) => ['fatal', 'error', 'warn', 'info'].includes(level),
};

// Конфигурация ротации для каждого уровня
export const ROTATION_CONFIG = {
  fatal: { maxSize: '10m', maxFiles: '90d', compress: true },
  error: { maxSize: '50m', maxFiles: '30d', compress: true },
  warn: { maxSize: '100m', maxFiles: '14d', compress: true },
  info: { maxSize: '200m', maxFiles: '7d', compress: false },
  http: { maxSize: '500m', maxFiles: '3d', compress: false },
  debug: { maxSize: '100m', maxFiles: '1d', compress: false },
  trace: { maxSize: '50m', maxFiles: '6h', compress: false },
};

// Дефолтная конфигурация
export const DEFAULT_CONFIG = {
  level: 'info',
  levels: LEVEL_VALUES,
  colors: LEVEL_COLORS,
  environment: process.env.NODE_ENV || 'development',

  // Получить конфигурацию для текущего окружения
  getEnvironmentConfig() {
    return ENVIRONMENT_CONFIGS[this.environment] || ENVIRONMENT_CONFIGS.development;
  },

  // Проверить, включен ли уровень
  isLevelEnabled(level, currentLevel = this.level) {
    const levelValue = LOG_LEVELS[level]?.value || 0;
    const currentValue = LOG_LEVELS[currentLevel]?.value || 30;
    return levelValue >= currentValue;
  },

  // Получить форматтер для уровня
  getFormatter(level) {
    return LEVEL_FORMATTERS[level] || LEVEL_FORMATTERS.info;
  },

  // Нормализовать имя уровня
  normalizeLevel(level) {
    const normalized = level.toLowerCase();
    return LEVEL_ALIASES[normalized] || normalized;
  },
};

// CommonJS совместимость
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    LOG_LEVELS,
    LEVEL_ALIASES,
    LEVEL_COLORS,
    LEVEL_VALUES,
    LEVEL_METHODS,
    ENVIRONMENT_CONFIGS,
    LEVEL_FORMATTERS,
    LEVEL_PREDICATES,
    ROTATION_CONFIG,
    DEFAULT_CONFIG,
    default: DEFAULT_CONFIG,
  };
}
