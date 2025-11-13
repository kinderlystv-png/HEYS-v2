import fs from 'node:fs';
import path from 'node:path';

import pino from 'pino';

import { AdvancedLoggerConfig } from './config';

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
 */
export function createTransports(config: AdvancedLoggerConfig): pino.StreamEntry[] {
  const streams: pino.StreamEntry[] = [];

  // Консольный транспорт
  if (config.transports.console.enabled) {
    const streamLevel = resolveStreamLevel(config.level);

    if (streamLevel !== null) {
      if (config.transports.console.pretty) {
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

  // Файловый транспорт
  if (config.transports.file.enabled) {
    ensureLogDirectory(config.transports.file.path);

    // Основной лог файл
    const fileLevel = resolveStreamLevel(config.level);
    if (fileLevel !== null) {
      streams.push({
        level: fileLevel,
        stream: pino.destination({
          dest: path.join(config.transports.file.path, `${config.service}.log`),
          sync: false,
          mkdir: true,
        }),
      });
    }

    // Отдельный файл для ошибок
    streams.push({
      level: 'error',
      stream: pino.destination({
        dest: path.join(config.transports.file.path, `${config.service}.error.log`),
        sync: false,
        mkdir: true,
      }),
    });
  }

  // Сетевой транспорт (для centralized logging)
  if (config.transports.network.enabled && config.transports.network.url) {
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
 * Создает ротирующийся файловый транспорт
 */
export function createRotatingFileTransport(config: AdvancedLoggerConfig) {
  if (!config.transports.file.enabled) {
    return null;
  }

  ensureLogDirectory(config.transports.file.path);

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
 * Обеспечивает существование директории для логов
 */
function ensureLogDirectory(logPath: string): void {
  try {
    if (!fs.existsSync(logPath)) {
      fs.mkdirSync(logPath, { recursive: true });
    }
  } catch (error) {
    // Если не можем создать директорию, используем текущую
    // Избегаем console.error из-за линтера
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
      version: process.env.npm_package_version || '1.0.0',
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
