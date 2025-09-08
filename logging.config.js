/**
 * HEYS Logging Configuration
 * Дополнительная конфигурация для системы логирования
 */

const path = require("path");

module.exports = {
  // Основные настройки для Winston-совместимости
  winston: {
    level: process.env.LOG_LEVEL || "info",
    format: "combined",
    defaultMeta: {
      service: "heys-platform",
      version: process.env.npm_package_version || "1.0.0",
    },
    
    transports: [
      // Console transport
      {
        type: "console",
        level: process.env.NODE_ENV === "production" ? "warn" : "debug",
        format: process.env.NODE_ENV === "production" ? "json" : "simple",
        colorize: process.env.NODE_ENV !== "production",
        timestamp: true,
      },

      // File transport
      {
        type: "file",
        filename: path.join(process.cwd(), "logs", "heys-combined.log"),
        level: "info",
        maxsize: 10485760, // 10MB
        maxFiles: 5,
        format: "json",
        timestamp: true,
      },

      // Error file transport
      {
        type: "file",
        filename: path.join(process.cwd(), "logs", "heys-error.log"),
        level: "error",
        maxsize: 5242880, // 5MB
        maxFiles: 3,
        format: "json",
        timestamp: true,
        handleExceptions: true,
        handleRejections: true,
      },
    ],

    // Exception handling
    exceptionHandlers: [
      {
        type: "file",
        filename: path.join(process.cwd(), "logs", "heys-exceptions.log"),
        format: "json",
        timestamp: true,
      },
    ],

    // Rejection handling
    rejectionHandlers: [
      {
        type: "file", 
        filename: path.join(process.cwd(), "logs", "heys-rejections.log"),
        format: "json",
        timestamp: true,
      },
    ],
  },

  // Pino настройки
  pino: {
    level: process.env.LOG_LEVEL || "info",
    formatters: {
      level: (label) => ({ level: label }),
      bindings: (bindings) => ({
        pid: bindings.pid,
        hostname: bindings.hostname,
        service: "heys-platform",
      }),
    },
    
    timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
    
    redact: {
      paths: [
        "password",
        "token",
        "secret",
        "authorization",
        "cookie",
        "session",
        "apiKey",
        "accessToken",
        "refreshToken",
      ],
      censor: "[REDACTED]",
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

    streams: [
      // Development stream
      ...(process.env.NODE_ENV !== "production" ? [{
        level: "debug",
        stream: process.stdout,
      }] : []),

      // Production streams
      ...(process.env.NODE_ENV === "production" ? [
        {
          level: "warn",
          stream: process.stdout,
        },
        {
          level: "info",
          stream: require("fs").createWriteStream(
            path.join(process.cwd(), "logs", "heys-app.log"),
            { flags: "a" }
          ),
        },
        {
          level: "error",
          stream: require("fs").createWriteStream(
            path.join(process.cwd(), "logs", "heys-error.log"),
            { flags: "a" }
          ),
        },
      ] : []),
    ],
  },

  // Levels mapping
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    verbose: 4,
    debug: 5,
    silly: 6,
  },

  // Colors для консольного вывода
  colors: {
    error: "red",
    warn: "yellow",
    info: "green",
    http: "magenta",
    verbose: "cyan",
    debug: "blue",
    silly: "grey",
  },

  // Окружения
  environments: {
    development: {
      level: "debug",
      console: true,
      file: false,
      colorize: true,
      timestamp: true,
    },
    
    test: {
      level: "error",
      console: false,
      file: true,
      colorize: false,
      timestamp: true,
    },
    
    production: {
      level: "warn",
      console: true,
      file: true,
      colorize: false,
      timestamp: true,
      json: true,
      rotation: true,
    },
  },

  // Конфигурация ротации логов
  rotation: {
    enabled: process.env.NODE_ENV === "production",
    datePattern: "YYYY-MM-DD",
    maxSize: "20m",
    maxFiles: "14d",
    compress: "gzip",
    frequency: "daily",
  },

  // HTTP логирование
  http: {
    enabled: process.env.LOG_HTTP_REQUESTS === "true",
    level: "info",
    format: ":method :url :status :res[content-length] - :response-time ms",
    skip: (req, res) => res.statusCode < 400,
    includeHeaders: process.env.LOG_INCLUDE_HEADERS === "true",
    includeBody: process.env.LOG_INCLUDE_BODY === "true",
    maxBodyLength: 1000,
  },

  // Метрики производительности
  performance: {
    enabled: process.env.LOG_PERFORMANCE === "true",
    slowQueryThreshold: 1000,
    memoryUsageInterval: 60000,
    cpuUsageInterval: 30000,
  },

  // Настройки безопасности
  security: {
    enabled: true,
    maskSensitiveData: true,
    allowedOrigins: process.env.CORS_ORIGINS?.split(",") || ["http://localhost:3001"],
    rateLimiting: {
      windowMs: 15 * 60 * 1000, // 15 минут
      max: 100, // лимит запросов
    },
  },
};
