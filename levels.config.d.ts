export type LogLevelName = 'fatal' | 'error' | 'warn' | 'info' | 'http' | 'debug' | 'trace' | 'silent';

export interface LogLevelConfig {
  value: number;
  name: string;
  color: string;
  symbol: string;
  description: string;
}

export interface EnvironmentLoggingConfig {
  level?: LogLevelName;
  defaultLevel?: LogLevelName;
  console?: {
    enabled?: boolean;
    level?: LogLevelName;
    colorize?: boolean;
    timestamp?: boolean;
    prettyPrint?: boolean;
    format?: string;
    [key: string]: unknown;
  };
  file?: {
    enabled?: boolean;
    level?: LogLevelName;
    path?: string;
    rotation?: boolean | string;
    maxSize?: string | number;
    maxFiles?: string | number;
    compress?: boolean;
    [key: string]: unknown;
  };
  performance?: {
    logSlowOperations?: boolean;
    threshold?: number;
    [key: string]: unknown;
  };
  security?: {
    auditLevel?: LogLevelName;
    [key: string]: unknown;
  } & Record<string, unknown>;
  [key: string]: unknown;
}

export const LOG_LEVELS: Record<LogLevelName, LogLevelConfig>;
export const LEVEL_ALIASES: Record<string, LogLevelName>;
export const LEVEL_COLORS: Record<LogLevelName, string>;
export const LEVEL_VALUES: Record<LogLevelName, number>;
export const LEVEL_METHODS: LogLevelName[];
export const ENVIRONMENT_CONFIGS: Record<string, EnvironmentLoggingConfig>;
export const LEVEL_FORMATTERS: Record<LogLevelName, (message: string, meta?: unknown) => string>;
export const LEVEL_PREDICATES: Record<string, (level: LogLevelName) => boolean>;
export const ROTATION_CONFIG: Record<LogLevelName, { maxSize?: string; maxFiles?: string; compress?: boolean }>;
export const DEFAULT_CONFIG: {
  level: LogLevelName;
  levels: Record<LogLevelName, number>;
  colors: Record<LogLevelName, string>;
  environment: string;
  getEnvironmentConfig: () => EnvironmentLoggingConfig;
  isLevelEnabled: (level: LogLevelName, currentLevel?: LogLevelName) => boolean;
  getFormatter: (level: LogLevelName) => (message: string, meta?: unknown) => string;
  normalizeLevel: (level: string) => LogLevelName;
};

export default DEFAULT_CONFIG;
