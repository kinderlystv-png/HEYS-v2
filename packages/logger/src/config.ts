import { LogLevel } from './log-level';

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
    // optional properties may appear explicitly with undefined, so include it per exactOptionalPropertyTypes
    url?: string | undefined;
    apiKey?: string | undefined;
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
const getEnv = (key: string, fallback: string = ''): string => {
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key] || fallback;
  }
  return fallback;
};

export const defaultConfig: AdvancedLoggerConfig = {
  level: (getEnv('LOG_LEVEL') as LogLevel) || LogLevel.INFO,
  service: getEnv('SERVICE_NAME', 'heys-app'),
  environment: getEnv('NODE_ENV', 'development'),
  transports: {
    console: {
      enabled: getEnv('LOG_CONSOLE') !== 'false',
      pretty: getEnv('NODE_ENV') !== 'production',
      colorize: getEnv('NODE_ENV') !== 'production',
    },
    file: {
      enabled: getEnv('LOG_FILE') === 'true' || getEnv('NODE_ENV') === 'production',
      path: getEnv('LOG_PATH', './logs'),
      maxSize: getEnv('LOG_MAX_SIZE', '10MB'),
      maxFiles: parseInt(getEnv('LOG_MAX_FILES', '5')),
      compress: getEnv('LOG_COMPRESS') === 'true',
    },
    network: {
      enabled: getEnv('LOG_NETWORK') === 'true',
      // Avoid assigning explicit undefined to satisfy exactOptionalPropertyTypes
      url: getEnv('LOG_NETWORK_URL') ? getEnv('LOG_NETWORK_URL') : undefined,
      apiKey: getEnv('LOG_API_KEY') ? getEnv('LOG_API_KEY') : undefined,
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
    enabled: getEnv('LOG_SAMPLING') === 'true',
    rate: parseFloat(getEnv('LOG_SAMPLING_RATE', '0.1')),
  },
  performance: {
    enabled: getEnv('LOG_PERFORMANCE') === 'true',
    threshold: parseInt(getEnv('LOG_PERFORMANCE_THRESHOLD', '1000')),
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
