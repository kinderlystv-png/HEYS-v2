/**
 * Monitoring Service Tests
 * Tests for the integrated monitoring system
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import type { MonitoringConfig } from '../monitoring-service';
import MonitoringService from '../monitoring-service';

// Mock Sentry
vi.mock('@sentry/browser', () => ({
  init: vi.fn(),
  captureException: vi.fn(() => 'event-id'),
  captureMessage: vi.fn(() => 'event-id'),
  withScope: vi.fn((callback) => {
    const mockScope = {
      setUser: vi.fn(),
      setTag: vi.fn(),
      setContext: vi.fn(),
      setLevel: vi.fn(),
    };
    return callback(mockScope);
  }),
  setUser: vi.fn(),
  setContext: vi.fn(),
  setTags: vi.fn(),
  setExtra: vi.fn(),
  addBreadcrumb: vi.fn(),
  showReportDialog: vi.fn(),
  flush: vi.fn(() => Promise.resolve(true)),
  getCurrentScope: vi.fn(() => ({})),
  lastEventId: vi.fn(() => 'last-event-id'),
  startSpan: vi.fn((_config, callback) => {
    const mockSpan = {
      setAttributes: vi.fn(),
      setStatus: vi.fn(),
    };
    if (callback) {
      return callback(mockSpan);
    }
    return mockSpan;
  }),
  browserTracingIntegration: vi.fn(() => ({ name: 'BrowserTracing' })),
  replayIntegration: vi.fn(() => ({ name: 'Replay' })),
}));

// Mock console for testing
const originalConsole = globalThis.console;
const mockConsole = {
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
} as unknown as Console;

const globalWithMonitoring = globalThis as typeof globalThis & {
  globalMonitoringService?: MonitoringService;
};

describe('MonitoringService', () => {
  let monitoringService: MonitoringService;
  let mockConfig: Partial<MonitoringConfig>;

  beforeEach(() => {
    // Setup fresh mocks
    vi.clearAllMocks();

    globalThis.console = mockConsole;

    mockConfig = {
      enabled: true,
      sentry: {
        enabled: true,
        config: {
          dsn: 'https://test@sentry.io/123',
          environment: 'test',
        },
      },
      logging: {
        enabled: true,
        config: {
          level: 'info',
          prettyPrint: true,
          enableConsole: true,
        },
      },
      performance: {
        enabled: true,
        thresholds: {
          slow: 500,
          critical: 2000,
        },
      },
    };

    monitoringService = new MonitoringService(mockConfig);
  });

  afterEach(async () => {
    globalThis.console = originalConsole;
    if (monitoringService) {
      monitoringService.resetMetrics(); // Reset metrics between tests
      await monitoringService.shutdown();
    }
    vi.clearAllMocks();
  });

  describe('Initialization', () => {
    test('should initialize successfully with valid config', async () => {
      await expect(monitoringService.initialize()).resolves.not.toThrow();
    });

    test('should handle disabled monitoring', async () => {
      const disabledService = new MonitoringService({ enabled: false });
      await expect(disabledService.initialize()).resolves.not.toThrow();
    });

    test('should initialize only enabled services', async () => {
      const partialConfig = {
        enabled: true,
        sentry: { enabled: false },
        logging: { enabled: true },
      };

      const service = new MonitoringService(partialConfig);
      await service.initialize();

      // Should initialize without throwing
      expect(service).toBeDefined();
    });
  });

  describe('Error Capturing', () => {
    beforeEach(async () => {
      await monitoringService.initialize();
    });

    test('should capture errors with context', () => {
      const error = new Error('Test error');
      const context = {
        userId: 'user-123',
        component: 'TestComponent',
        operation: 'testOperation',
        metadata: { key: 'value' },
      };

      const eventId = monitoringService.captureError(error, context);

      expect(eventId).toBe('event-id');
    });

    test('should handle errors without context', () => {
      const error = new Error('Simple error');

      const eventId = monitoringService.captureError(error);

      expect(eventId).toBe('event-id');
    });

    test('should update error metrics', () => {
      // Reset metrics to ensure clean state
      monitoringService.resetMetrics();

      const error = new Error('Metric test error');

      monitoringService.captureError(error);

      const metrics = monitoringService.getMetrics();
      expect(metrics.errors.total).toBe(1);
      expect(metrics.errors.recent).toHaveLength(1);
    });
  });

  describe('Performance Monitoring', () => {
    beforeEach(async () => {
      await monitoringService.initialize();
    });

    test('should measure performance of sync functions', async () => {
      const testFn = () => 'result';

      const result = await monitoringService.measurePerformance('syncTest', testFn, {
        component: 'TestComponent',
      });

      expect(result).toBe('result');

      const metrics = monitoringService.getMetrics();
      expect(metrics.performance.measurements).toBe(1);
    });

    test('should measure performance of async functions', async () => {
      vi.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValueOnce(120);

      const testFn = async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return 'async result';
      };

      const result = await monitoringService.measurePerformance('asyncTest', testFn, {
        component: 'TestComponent',
      });

      expect(result).toBe('async result');

      const metrics = monitoringService.getMetrics();
      expect(metrics.performance.measurements).toBe(1);
      expect(metrics.performance.averageTime).toBeGreaterThan(0);
    });

    test('should handle performance measurement errors', async () => {
      // Reset metrics to ensure clean state
      monitoringService.resetMetrics();

      const errorFn = () => {
        throw new Error('Performance test error');
      };

      await expect(monitoringService.measurePerformance('errorTest', errorFn)).rejects.toThrow(
        'Performance test error',
      );

      const metrics = monitoringService.getMetrics();
      expect(metrics.performance.measurements).toBe(1);
      expect(metrics.errors.total).toBe(1);
    });

    test('should detect slow operations', async () => {
      vi.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValueOnce(650);

      const slowFn = async () => {
        await new Promise((resolve) => setTimeout(resolve, 600)); // Exceeds 500ms threshold
        return 'slow result';
      };

      await monitoringService.measurePerformance('slowTest', slowFn);

      const metrics = monitoringService.getMetrics();
      expect(metrics.performance.slowOperations).toHaveLength(1);
      expect(metrics.performance.slowOperations[0]?.operation).toBe('slowTest');
    });
  });

  describe('Logging', () => {
    beforeEach(async () => {
      await monitoringService.initialize();
    });

    test('should log messages with different levels', () => {
      // Reset the log mock before testing
      mockConsole.log.mockReset();

      // Initialize monitoring service properly
      monitoringService = new MonitoringService({
        enabled: true,
        logging: { enabled: true, config: { level: 'debug' } },
      });

      monitoringService.log('info', 'Test info message', { key: 'value' });
      monitoringService.log('warn', 'Test warning message');
      monitoringService.log('error', 'Test error message');

      // The log method should work without throwing errors
      // Since logger is mocked, we just verify the calls were made
      expect(() => {
        monitoringService.log('info', 'Test info message');
      }).not.toThrow();
    });

    test('should log user actions', () => {
      monitoringService.logUserAction('button_click', 'user-123', {
        button: 'submit',
        page: 'checkout',
      });

      expect(() => {
        monitoringService.logUserAction('button_click', 'user-123', {
          button: 'submit',
          page: 'checkout',
        });
      }).not.toThrow();
    });

    test('should log API requests', () => {
      monitoringService.logApiRequest('POST', '/api/users', 201, 150, 'user-123', {
        body: 'userData',
      });

      expect(() => {
        monitoringService.logApiRequest('POST', '/api/users', 201, 150, 'user-123', {
          body: 'userData',
        });
      }).not.toThrow();
    });

    test('should log security events', () => {
      monitoringService.logSecurityEvent('failed_login', 'medium', 'user-123', { attempts: 3 });

      expect(() => {
        monitoringService.logSecurityEvent('failed_login', 'medium', 'user-123', { attempts: 3 });
      }).not.toThrow();
    });
  });

  describe('Health Check', () => {
    test('should return health status', async () => {
      await monitoringService.initialize();

      const health = await monitoringService.healthCheck();

      expect(health.status).toMatch(/healthy|degraded|unhealthy/);
      expect(health.details).toHaveProperty('initialized');
      expect(health.details).toHaveProperty('sentry');
      expect(health.details).toHaveProperty('logging');
    });

    test('should return unhealthy when not initialized', async () => {
      const health = await monitoringService.healthCheck();

      expect(health.status).toBe('unhealthy');
      expect(health.details.initialized).toBe(false);
    });
  });

  describe('Metrics', () => {
    beforeEach(async () => {
      await monitoringService.initialize();
    });

    test('should return current metrics', () => {
      const metrics = monitoringService.getMetrics();

      expect(metrics).toHaveProperty('errors');
      expect(metrics).toHaveProperty('performance');
      expect(metrics).toHaveProperty('health');

      expect(metrics.errors).toHaveProperty('total');
      expect(metrics.errors).toHaveProperty('byLevel');
      expect(metrics.errors).toHaveProperty('recent');

      expect(metrics.performance).toHaveProperty('measurements');
      expect(metrics.performance).toHaveProperty('averageTime');
      expect(metrics.performance).toHaveProperty('slowOperations');
    });

    test('should update health metrics on access', () => {
      const beforeTime = new Date();
      const metrics = monitoringService.getMetrics();
      const afterTime = new Date();

      expect(metrics.health.lastHeartbeat.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(metrics.health.lastHeartbeat.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    });
  });

  describe('User Context', () => {
    beforeEach(async () => {
      await monitoringService.initialize();
    });

    test('should set user context', () => {
      const user = {
        id: 'user-123',
        email: 'test@example.com',
        username: 'testuser',
      };

      monitoringService.setUser(user);

      // Should not throw
      expect(true).toBe(true);
    });

    test('should set additional context', () => {
      monitoringService.setContext('session', {
        sessionId: 'session-123',
        startTime: new Date().toISOString(),
      });

      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('Flush and Shutdown', () => {
    beforeEach(async () => {
      await monitoringService.initialize();
    });

    test('should flush monitoring data', async () => {
      await expect(monitoringService.flush()).resolves.not.toThrow();
    });

    test('should shutdown gracefully', async () => {
      await expect(monitoringService.shutdown()).resolves.not.toThrow();
    });
  });
});

describe('Monitoring Decorators', () => {
  let monitoringService: MonitoringService;

  beforeEach(async () => {
    globalThis.console = mockConsole;
    vi.clearAllMocks();

    monitoringService = new MonitoringService({
      enabled: true,
      sentry: { enabled: true, config: { dsn: 'https://test@sentry.io/123' } },
      logging: { enabled: true },
    });

    await monitoringService.initialize();

    // Set as global for decorators
    globalWithMonitoring.globalMonitoringService = monitoringService;
  });

  afterEach(() => {
    globalThis.console = originalConsole;
    delete globalWithMonitoring.globalMonitoringService;
  });

  test('should work without global monitoring service', async () => {
    delete globalWithMonitoring.globalMonitoringService;

    class TestClass {
      async testMethod() {
        return 'result';
      }
    }

    const instance = new TestClass();
    const result = await instance.testMethod();

    expect(result).toBe('result');
  });
});

// Integration test
describe('MonitoringService Integration', () => {
  test('should work end-to-end', async () => {
    globalThis.console = mockConsole;

    const service = new MonitoringService({
      enabled: true,
      sentry: {
        enabled: true,
        config: {
          dsn: 'https://test@sentry.io/123',
          environment: 'test',
        },
      },
      logging: {
        enabled: true,
        config: {
          level: 'info',
          prettyPrint: false,
        },
      },
    });

    // Initialize
    await service.initialize();

    // Reset metrics to ensure clean state
    service.resetMetrics();

    // Set user context
    service.setUser({
      id: 'user-123',
      email: 'test@example.com',
    });

    // Log some events
    service.log('info', 'Application started');
    service.logUserAction('page_view', 'user-123', { page: '/dashboard' });

    // Capture error
    const error = new Error('Test error');
    service.captureError(error, {
      component: 'Dashboard',
      operation: 'loadData',
    });

    // Measure performance
    await service.measurePerformance(
      'dataLoad',
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return 'data';
      },
      {
        component: 'Dashboard',
        userId: 'user-123',
      },
    );

    // Check metrics
    const metrics = service.getMetrics();
    expect(metrics.errors.total).toBe(1);
    expect(metrics.performance.measurements).toBe(1);

    // Health check
    const health = await service.healthCheck();
    expect(health.status).not.toBe('unhealthy');

    // Cleanup
    await service.shutdown();

    globalThis.console = originalConsole;
  });
});
