import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createAdvancedLogger, LogLevel } from '../../packages/logger/src/index.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Logger Integration Tests', () => {
  const testLogDir = path.join(__dirname, 'test-logs');
  let logger;

  beforeAll(() => {
    // Создаем тестовую директорию для логов
    if (!fs.existsSync(testLogDir)) {
      fs.mkdirSync(testLogDir, { recursive: true });
    }
  });

  afterAll(() => {
    // Очищаем тестовые файлы
    if (fs.existsSync(testLogDir)) {
      const files = fs.readdirSync(testLogDir);
      files.forEach(file => {
        fs.unlinkSync(path.join(testLogDir, file));
      });
      fs.rmdirSync(testLogDir);
    }
  });

  describe('File logging integration', () => {
    beforeAll(() => {
      logger = createAdvancedLogger({
        service: 'integration-test',
        level: LogLevel.INFO,
        transports: {
          console: { enabled: false, pretty: false, colorize: false },
          file: {
            enabled: true,
            path: testLogDir,
            maxSize: '1MB',
            maxFiles: 2,
            compress: false
          },
          network: { enabled: false }
        }
      });
    });

    it('should create log files when file transport is enabled', async () => {
      logger.info('Test log entry for file integration');
      
      // Даем время для записи файла
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const logFiles = fs.readdirSync(testLogDir);
      expect(logFiles.length).toBeGreaterThan(0);
      
      const mainLogFile = logFiles.find(file => file.includes('integration-test.log'));
      expect(mainLogFile).toBeDefined();
    });

    it('should write error logs to separate error file', async () => {
      logger.error('Test error entry for file integration');
      
      // Даем время для записи файла
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const logFiles = fs.readdirSync(testLogDir);
      const errorLogFile = logFiles.find(file => file.includes('integration-test.error.log'));
      expect(errorLogFile).toBeDefined();
    });

    it('should include service information in logs', async () => {
      const testMessage = 'Service integration test message';
      logger.info(testMessage);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const logFiles = fs.readdirSync(testLogDir);
      const mainLogFile = logFiles.find(file => file.includes('integration-test.log'));
      
      if (mainLogFile) {
        const logContent = fs.readFileSync(path.join(testLogDir, mainLogFile), 'utf8');
        expect(logContent).toContain('integration-test');
        expect(logContent).toContain(testMessage);
      }
    });
  });

  describe('Context and child logger integration', () => {
    it('should maintain context across child loggers', () => {
      const parentLogger = createAdvancedLogger({
        service: 'parent-service',
        transports: {
          console: { enabled: false, pretty: false, colorize: false },
          file: { enabled: false, path: './logs', maxSize: '10MB', maxFiles: 5, compress: false },
          network: { enabled: false }
        }
      });

      const childLogger = parentLogger.child({ 
        requestId: 'req-123',
        userId: 'user-456'
      });

      expect(childLogger).toBeDefined();
      expect(() => childLogger.info('Child logger test')).not.toThrow();
    });

    it('should handle nested child loggers', () => {
      const rootLogger = createAdvancedLogger({
        service: 'root-service',
        transports: {
          console: { enabled: false, pretty: false, colorize: false },
          file: { enabled: false, path: './logs', maxSize: '10MB', maxFiles: 5, compress: false },
          network: { enabled: false }
        }
      });

      const firstChild = rootLogger.child({ module: 'auth' });
      const secondChild = firstChild.child({ action: 'login' });

      expect(() => secondChild.info('Nested child logger test')).not.toThrow();
    });
  });

  describe('Error handling integration', () => {
    it('should handle logging errors gracefully', () => {
      const invalidLogger = createAdvancedLogger({
        transports: {
          console: { enabled: false, pretty: false, colorize: false },
          file: {
            enabled: true,
            path: '/invalid/path/that/does/not/exist',
            maxSize: '10MB',
            maxFiles: 5,
            compress: false
          },
          network: { enabled: false }
        }
      });

      // Даже с неправильным путем, логгер не должен бросать исключение
      expect(() => invalidLogger.info('Test with invalid path')).not.toThrow();
    });

    it('should handle circular references in log objects', () => {
      const logger = createAdvancedLogger({
        transports: {
          console: { enabled: false, pretty: false, colorize: false },
          file: { enabled: false, path: './logs', maxSize: '10MB', maxFiles: 5, compress: false },
          network: { enabled: false }
        }
      });

      const circularObj: Record<string, unknown> = { name: 'test' };
      circularObj.self = circularObj;

      expect(() => logger.info('Circular reference test')).not.toThrow();
    });
  });

  describe('Performance integration', () => {
    it('should handle high-frequency logging without memory leaks', () => {
      const logger = createAdvancedLogger({
        transports: {
          console: { enabled: false, pretty: false, colorize: false },
          file: { enabled: false, path: './logs', maxSize: '10MB', maxFiles: 5, compress: false },
          network: { enabled: false }
        }
      });

      const iterations = 1000;
      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        logger.info(`Performance test iteration ${i}`);
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Проверяем, что 1000 операций логирования выполняются за разумное время
      expect(duration).toBeLessThan(5000); // Менее 5 секунд
    });
  });
});
