import { LogLevel } from './index.js';

/**
 * Конфигурация транспортов для логирования
 */
export interface TransportConfig {
  console: {
    enabled: boolean;
    pretty: boolean;
    colorize: boolean;
  };
  file: {
    enabled: boolean;
    path: string;
    maxSize: string;
    maxFiles: number;
    compress: boolean;
  };
  network: {
    enabled: boolean;
    url?: string;
    apiKey?: string;
  };
}

/**
 * Полная конфигурация системы логирования
 */
export interface AdvancedLoggerConfig {
  level: LogLevel;
  service: string;
  environment: string;
  transports: TransportConfig;
  redact: string[];
  sampling?: {
    enabled: boolean;
    rate: number;
  };
  performance?: {
    enabled: boolean;
    threshold: number;
  };
}

/**
 * Конфигурация по умолчанию
 */
export const defaultConfig: AdvancedLoggerConfig = {
  level: (process.env.LOG_LEVEL as LogLevel) || LogLevel.INFO,
  service: process.env.SERVICE_NAME || 'heys-app',
  environment: process.env.NODE_ENV || 'development',
  transports: {
    console: {
      enabled: process.env.LOG_CONSOLE !== 'false',
      pretty: process.env.NODE_ENV !== 'production',
      colorize: process.env.NODE_ENV !== 'production',
    },
    file: {
      enabled: process.env.LOG_FILE === 'true' || process.env.NODE_ENV === 'production',
      path: process.env.LOG_PATH || './logs',
      maxSize: process.env.LOG_MAX_SIZE || '10MB',
      maxFiles: parseInt(process.env.LOG_MAX_FILES || '5'),
      compress: process.env.LOG_COMPRESS === 'true',
    },
    network: {
      enabled: process.env.LOG_NETWORK === 'true',
      url: process.env.LOG_NETWORK_URL || undefined,
      apiKey: process.env.LOG_API_KEY || undefined,
    },
  },
  redact: [
    'password',
    'token',
    'secret',
    'authorization',
    'cookie',
    'session',
    'apiKey',
    'accessToken',
    'refreshToken',
  ],
  sampling: {
    enabled: process.env.LOG_SAMPLING === 'true',
    rate: parseFloat(process.env.LOG_SAMPLING_RATE || '0.1'),
  },
  performance: {
    enabled: process.env.LOG_PERFORMANCE === 'true',
    threshold: parseInt(process.env.LOG_PERFORMANCE_THRESHOLD || '1000'),
  },
};

/**
 * Валидация конфигурации
 */
export function validateConfig(config: Partial<AdvancedLoggerConfig>): AdvancedLoggerConfig {
  const mergedConfig = { ...defaultConfig, ...config };
  
  // Валидация уровня логирования
  if (!Object.values(LogLevel).includes(mergedConfig.level)) {
    mergedConfig.level = LogLevel.INFO;
  }
  
  // Валидация файлового транспорта
  if (mergedConfig.transports.file.enabled && !mergedConfig.transports.file.path) {
    mergedConfig.transports.file.path = './logs';
  }
  
  // Валидация сетевого транспорта
  if (mergedConfig.transports.network.enabled && !mergedConfig.transports.network.url) {
    mergedConfig.transports.network.enabled = false;
  }
  
  return mergedConfig;
}
