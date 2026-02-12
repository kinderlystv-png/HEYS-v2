import pino from 'pino';

import { AdvancedLoggerConfig } from './config';

// Проверка окружения: Node.js или браузер
const isNodeEnvironment = typeof process !== 'undefined' && typeof process.stdout !== 'undefined';

// Динамические импорты Node.js модулей (только в Node окружении)
let fs: any;
let path: any;

if (isNodeEnvironment) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    fs = require('node:fs');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    path = require('node:path');
  } catch {
    // Модули недоступны, файловые транспорты не будут работать
  }
}

const resolveStreamLevel = (level: AdvancedLoggerConfig['level']): pino.Level | null => {
  if (level === 'silent') {
    return null;
  }

  if (level === 'http') {
    return 'info';
  }

  return level as pino.Level;
};

/**
 * Создает транспорты для логирования на основе конфигурации
 * В браузере возвращает пустой массив (транспорты не поддерживаются)
 */
export function createTransports(config: AdvancedLoggerConfig): pino.StreamEntry[] {
  if (!isNodeEnvironment) {
    return [];
  }

  const streams: pino.StreamEntry[] = [];

  // Консольный транспорт
  if (config.transports.console.enabled) {
    const streamLevel = resolveStreamLevel(config.level);

    if (streamLevel !== null) {
      if (config.transports.console.pretty && typeof pino.transport === 'function') {
        streams.push({
          level: streamLevel,
          stream: pino.transport({
            target: 'pino-pretty',
            options: {
              colorize: config.transports.console.colorize,
              ignore: 'pid,hostname',
              translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
              messageFormat: `[${config.service}] {msg}`,
              sync: false,
            },
          }),
        });
      } else {
        streams.push({
          level: streamLevel,
          stream: process.stdout,
        });
      }
    }
  }

  // Файловый транспорт (только в Node.js)
  if (config.transports.file.enabled && path) {
    const canUseFileTransport = ensureLogDirectory(config.transports.file.path);
    if (!canUseFileTransport) {
      return streams;
    }

    // Основной лог файл
    const fileLevel = resolveStreamLevel(config.level);
    if (fileLevel !== null) {
      streams.push({
        level: fileLevel,
        stream: pino.destination({
          dest: path.join(config.transports.file.path, `${config.service}.log`),
          sync: false,
        }),
      });
    }

    // Отдельный файл для ошибок
    streams.push({
      level: 'error',
      stream: pino.destination({
        dest: path.join(config.transports.file.path, `${config.service}.error.log`),
        sync: false,
      }),
    });
  }

  // Сетевой транспорт (для centralized logging, только в Node.js)
  if (config.transports.network.enabled && config.transports.network.url && typeof pino.transport === 'function') {
    const networkLevel = resolveStreamLevel(config.level);

    if (networkLevel !== null) {
      streams.push({
        level: networkLevel,
        stream: pino.transport({
          target: '@axiomhq/pino', // Или другой сетевой транспорт
          options: {
            url: config.transports.network.url,
            apiKey: config.transports.network.apiKey,
            dataset: config.service,
          },
        }),
      });
    }
  }

  return streams;
}

/**
 * Создает ротирующийся файловый транспорт (только для Node.js)
 */
export function createRotatingFileTransport(config: AdvancedLoggerConfig) {
  if (!config.transports.file.enabled || !path || typeof pino.transport !== 'function') {
    return null;
  }

  const canUseFileTransport = ensureLogDirectory(config.transports.file.path);
  if (!canUseFileTransport) {
    return null;
  }

  return pino.transport({
    target: 'pino-roll',
    options: {
      file: path.join(config.transports.file.path, `${config.service}.log`),
      frequency: 'daily',
      size: config.transports.file.maxSize,
      mkdir: true,
    },
  });
}

/**
 * Обеспечивает существование директории для логов (только Node.js)
 */
function ensureLogDirectory(logPath: string): boolean {
  if (!fs || !isNodeEnvironment) {
    return false;
  }

  try {
    if (!fs.existsSync(logPath)) {
      fs.mkdirSync(logPath, { recursive: true });
    }
    return true;
  } catch {
    // Если не можем создать директорию, отключаем файловые транспорты.
    return false;
  }
}

/**
 * Создает кастомные форматировщики для различных транспортов
 */
export function createFormatters(config: AdvancedLoggerConfig) {
  return {
    level: (label: string) => ({ level: label }),
    bindings: (bindings: Record<string, unknown>) => ({
      service: config.service,
      environment: config.environment,
      version: (typeof process !== 'undefined' && process.env?.npm_package_version) || '1.0.0',
      ...bindings,
    }),
    log: (object: Record<string, unknown>) => {
      // Добавляем timestamp в UTC
      return {
        ...object,
        '@timestamp': new Date().toISOString(),
        '@version': '1',
      };
    },
  };
}

/**
 * Создает кастомные serializers для безопасности
 */
export function createSerializers(): Record<string, pino.SerializerFn> {
  return {
    ...pino.stdSerializers,
    // Используем стандартные serializers без кастомизации для упрощения
  };
}
