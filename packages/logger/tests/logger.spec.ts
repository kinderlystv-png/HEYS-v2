import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createLogger, createAdvancedLogger, LogLevel, logError } from '../src/index.js';

describe('Logger System', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createLogger (legacy)', () => {
    it('should create logger with default config', () => {
      const logger = createLogger();
      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.error).toBe('function');
    });

    it('should create logger with custom service name', () => {
      const logger = createLogger({ service: 'test-service' });
      expect(logger).toBeDefined();
    });

    it('should respect log level configuration', () => {
      const logger = createLogger({ level: LogLevel.DEBUG });
      expect(logger).toBeDefined();
    });
  });

  describe('createAdvancedLogger', () => {
    it('should create advanced logger with default config', () => {
      const logger = createAdvancedLogger();
      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.child).toBe('function');
    });

    it('should create logger with custom configuration', () => {
      const config = {
        service: 'test-advanced',
        level: LogLevel.WARN,
        transports: {
          console: { enabled: true, pretty: false, colorize: false },
          file: { enabled: false, path: './logs', maxSize: '10MB', maxFiles: 5, compress: false },
          network: { enabled: false }
        },
        redact: ['password', 'secret']
      };

      const logger = createAdvancedLogger(config);
      expect(logger).toBeDefined();
    });

    it('should handle file transport configuration', () => {
      const config = {
        transports: {
          console: { enabled: false, pretty: false, colorize: false },
          file: { enabled: true, path: './test-logs', maxSize: '5MB', maxFiles: 3, compress: true },
          network: { enabled: false }
        }
      };

      const logger = createAdvancedLogger(config);
      expect(logger).toBeDefined();
    });
  });

  describe('LogLevel enum', () => {
    it('should contain all expected log levels', () => {
      expect(LogLevel.TRACE).toBe('trace');
      expect(LogLevel.DEBUG).toBe('debug');
      expect(LogLevel.INFO).toBe('info');
      expect(LogLevel.WARN).toBe('warn');
      expect(LogLevel.ERROR).toBe('error');
      expect(LogLevel.FATAL).toBe('fatal');
    });
  });

  describe('logError function', () => {
    it('should log error with stack trace', () => {
      const error = new Error('Test error');
      expect(() => logError(error)).not.toThrow();
    });

    it('should log error with additional context', () => {
      const error = new Error('Test error with context');
      const context = { userId: '123', action: 'test' };
      expect(() => logError(error, context)).not.toThrow();
    });
  });

  describe('Logger methods', () => {
    let logger;

    beforeEach(() => {
      logger = createAdvancedLogger({
        transports: {
          console: { enabled: false, pretty: false, colorize: false },
          file: { enabled: false, path: './logs', maxSize: '10MB', maxFiles: 5, compress: false },
          network: { enabled: false }
        }
      });
    });

    it('should have all required logging methods', () => {
      expect(typeof logger.trace).toBe('function');
      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.fatal).toBe('function');
    });

    it('should create child logger with context', () => {
      const child = logger.child({ requestId: 'test-123' });
      expect(child).toBeDefined();
      expect(typeof child.info).toBe('function');
    });

    it('should log messages without throwing errors', () => {
      expect(() => logger.info('Test info message')).not.toThrow();
      expect(() => logger.warn('Test warning message', { extra: 'data' })).not.toThrow();
      expect(() => logger.error('Test error message')).not.toThrow();
    });
  });

  describe('Configuration validation', () => {
    it('should handle invalid log levels gracefully', () => {
      // Тест проверяет, что система может обработать некорректные конфигурации
      expect(() => createAdvancedLogger({ level: 'invalid' as LogLevel })).not.toThrow();
    });

    it('should handle empty configuration', () => {
      expect(() => createAdvancedLogger({})).not.toThrow();
    });

    it('should handle undefined configuration', () => {
      expect(() => createAdvancedLogger()).not.toThrow();
    });
  });
});
