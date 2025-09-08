/**
 * HEYS Logging System Configuration
 * Централизованная конфигурация системы логирования
 */

// Экспорт для ЭАП анализатора
export default {
  // Основные настройки
  appName: "HEYS Platform",
  enabled: true,
  defaultLevel: process.env.LOG_LEVEL || "info",
  environment: process.env.NODE_ENV || "development",

  // Уровни логирования
  levels: {
    fatal: 60,
    error: 50,
    warn: 40,
    info: 30,
    debug: 20,
    trace: 10,
  },

  // Цвета для консольного вывода
  colors: {
    fatal: "magenta",
    error: "red",
    warn: "yellow", 
    info: "green",
    debug: "blue",
    trace: "gray",
  },

  // Конфигурация транспортов
  transports: {
    // Консольный транспорт
    console: {
      enabled: process.env.LOG_CONSOLE !== "false",
      level: process.env.NODE_ENV === "production" ? "warn" : "debug",
      format: process.env.NODE_ENV === "production" ? "json" : "pretty",
      colorize: process.env.NODE_ENV !== "production",
    },

    // Файловый транспорт
    file: {
      enabled: process.env.LOG_FILE === "true" || process.env.NODE_ENV === "production",
      level: "info",
      path: process.env.LOG_PATH || "./logs",
      filename: process.env.LOG_FILENAME || "heys-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      maxSize: process.env.LOG_MAX_SIZE || "10m",
      maxFiles: process.env.LOG_MAX_FILES || "14d",
      compress: process.env.LOG_COMPRESS === "true",
    },

    // Файл ошибок
    error: {
      enabled: true,
      level: "error",
      path: process.env.LOG_PATH || "./logs",
      filename: process.env.LOG_ERROR_FILENAME || "heys-error-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      maxSize: "10m",
      maxFiles: "30d",
      handleExceptions: true,
      handleRejections: true,
    },

    // HTTP транспорт (для централизованного логирования)
    http: {
      enabled: process.env.LOG_HTTP === "true",
      level: "warn",
      endpoint: process.env.LOG_HTTP_ENDPOINT,
      timeout: parseInt(process.env.LOG_HTTP_TIMEOUT || "5000"),
      headers: {
        "Content-Type": "application/json",
        Authorization: process.env.LOG_HTTP_AUTH,
      },
    },
  },

  // Форматирование
  formatting: {
    timestamp: "iso",
    timezone: "UTC",
    messageFormat: "[{service}] {level}: {message}",
    includeStackTrace: true,
    maxMessageLength: 1000,
  },

  // Безопасность
  security: {
    redactFields: [
      "password",
      "token", 
      "secret",
      "authorization",
      "cookie",
      "session",
      "apiKey",
      "accessToken",
      "refreshToken",
      "creditCard",
      "ssn",
      "personalData",
    ],
    maskingPattern: "[REDACTED]",
  },

  // Производительность
  performance: {
    sampling: {
      enabled: process.env.LOG_SAMPLING === "true",
      rate: parseFloat(process.env.LOG_SAMPLING_RATE || "0.1"),
      levels: ["debug", "trace"],
    },
    buffering: {
      enabled: process.env.NODE_ENV === "production",
      size: 100,
      flushInterval: 1000,
    },
    metrics: {
      enabled: process.env.LOG_METRICS === "true",
      slowRequestThreshold: parseInt(process.env.LOG_SLOW_THRESHOLD || "1000"),
    },
  },

  // Контексты логирования
  contexts: {
    http: {
      includeHeaders: process.env.LOG_HTTP_HEADERS === "true",
      includeBody: process.env.LOG_HTTP_BODY === "true",
      includeQuery: true,
      maxBodySize: 1024,
      redactHeaders: ["authorization", "cookie"],
    },
    error: {
      includeStackTrace: true,
      maxStackFrames: 50,
      includeSource: true,
      includeContext: true,
    },
    request: {
      includeUserAgent: true,
      includeIP: true,
      includeMethod: true,
      includeURL: true,
      includeDuration: true,
    },
  },

  // Мониторинг
  monitoring: {
    healthCheck: {
      enabled: true,
      interval: 30000,
      endpoint: "/health/logging",
    },
    alerts: {
      enabled: process.env.LOG_ALERTS === "true",
      errorThreshold: 10,
      timeWindow: 300000, // 5 минут
    },
  },
};

// Экспорт конкретных функций для прямого использования
export const createLogger = (serviceName = "heys-app") => {
  return {
    service: serviceName,
    level: process.env.LOG_LEVEL || "info",
    environment: process.env.NODE_ENV || "development",
  };
};

export const getTransportConfig = (transportName) => {
  const config = loggingConfig.transports[transportName];
  return config?.enabled ? config : null;
};

// Дефолтный экспорт для обратной совместимости
const loggingConfig = {
  appName: "HEYS Platform",
  enabled: true,
  defaultLevel: "info",
  // ... (все остальные настройки выше)
};

// CommonJS совместимость для анализатора
if (typeof module !== "undefined" && module.exports) {
  module.exports = loggingConfig;
  module.exports.default = loggingConfig;
  module.exports.createLogger = createLogger;
  module.exports.getTransportConfig = getTransportConfig;
}
