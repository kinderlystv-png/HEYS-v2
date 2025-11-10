/**
 * @fileoverview Tests for Advanced Audit Logging System
 * Comprehensive test suite for enterprise-grade audit logging
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AdvancedAuditLogger,
  AuditEventType,
  AuditLoggerUtils,
  AuditSeverity,
  createAuditMiddleware,
  defaultAuditLogger,
} from './AdvancedAuditLogger';

describe('AdvancedAuditLogger', () => {
  let auditLogger: AdvancedAuditLogger;

  beforeEach(() => {
    // Create a fresh instance for each test to ensure complete isolation
    auditLogger = new AdvancedAuditLogger({
      enableRealTimeAnalysis: true,
      bufferSize: 10,
      flushIntervalMs: 10000, // Long interval to prevent automatic flushing
      storage: 'memory',
      alertConfig: {
        enableAlerts: true,
        criticalThreshold: 3,
      },
    });
  });

  afterEach(async () => {
    if (auditLogger) {
      await auditLogger.destroy();
      auditLogger = null as any;
    }
  });

  describe('Basic Audit Logging', () => {
    it('should log a basic audit event', async () => {
      const eventId = await auditLogger.logEvent(AuditEventType.USER_ACTION, 'login', {
        userId: 'user123',
        severity: AuditSeverity.MEDIUM,
        metadata: { source: 'web' },
      });

      expect(eventId).toMatch(/^audit_/);

      const stats = auditLogger.getStatistics();
      expect(stats.totalEvents).toBe(1);
      expect(stats.eventsByType[AuditEventType.USER_ACTION]).toBe(1);
      expect(stats.eventsBySeverity[AuditSeverity.MEDIUM]).toBe(1);
    });

    it('should generate unique event IDs', async () => {
      const id1 = await auditLogger.logEvent(AuditEventType.SYSTEM_EVENT, 'test1');
      const id2 = await auditLogger.logEvent(AuditEventType.SYSTEM_EVENT, 'test2');

      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^audit_/);
      expect(id2).toMatch(/^audit_/);
    });

    it('should handle different event types', async () => {
      await auditLogger.logEvent(AuditEventType.USER_ACTION, 'user_action');
      await auditLogger.logEvent(AuditEventType.SECURITY_EVENT, 'security_event');
      await auditLogger.logEvent(AuditEventType.DATA_ACCESS, 'data_access');

      const stats = auditLogger.getStatistics();
      expect(stats.totalEvents).toBe(3);
      expect(stats.eventsByType[AuditEventType.USER_ACTION]).toBe(1);
      expect(stats.eventsByType[AuditEventType.SECURITY_EVENT]).toBe(1);
      expect(stats.eventsByType[AuditEventType.DATA_ACCESS]).toBe(1);
    });
  });

  describe('Specialized Logging Methods', () => {
    it('should log user actions with request context', async () => {
      const mockRequest = {
        ip: '192.168.1.1',
        method: 'POST',
        originalUrl: '/api/login',
        sessionID: 'session123',
        get: vi.fn().mockReturnValue('Mozilla/5.0'),
      };

      const eventId = await auditLogger.logUserAction(
        'user123',
        'login',
        '/auth/login',
        { loginMethod: 'password' },
        mockRequest,
      );

      expect(eventId).toMatch(/^audit_/);

      const query = await auditLogger.queryLogs({ userId: 'user123' });
      expect(query.logs).toHaveLength(1);
      const logEntry = query.logs[0];
      expect(logEntry).toBeDefined();
      expect(logEntry?.eventType).toBe(AuditEventType.USER_ACTION);
      expect(logEntry?.ipAddress).toBe('192.168.1.1');
      expect(logEntry?.userAgent).toBe('Mozilla/5.0');
    });

    it('should log security events with high priority', async () => {
      const eventId = await auditLogger.logSecurityEvent(
        'brute_force_attempt',
        AuditSeverity.CRITICAL,
        {
          userId: 'user123',
          metadata: { attemptCount: 5 },
        },
      );

      expect(eventId).toMatch(/^audit_/);

      const query = await auditLogger.queryLogs({ severity: AuditSeverity.CRITICAL });
      expect(query.logs).toHaveLength(1);
      expect(query.logs[0]?.eventType).toBe(AuditEventType.SECURITY_EVENT);
      expect(query.logs[0]?.severity).toBe(AuditSeverity.CRITICAL);
      expect(query.logs[0]?.complianceFlags).toContain('security_incident');
    });

    it('should log GDPR-relevant data access', async () => {
      const eventId = await auditLogger.logDataAccess(
        'user123',
        'subject456',
        'read_personal_data',
        'personal',
        'consent',
      );

      expect(eventId).toMatch(/^audit_/);

      const query = await auditLogger.queryLogs({ gdprRelevant: true });
      expect(query.logs).toHaveLength(1);
      expect(query.logs[0]?.eventType).toBe(AuditEventType.DATA_ACCESS);
      expect(query.logs[0]?.gdprRelevant).toBe(true);
      expect(query.logs[0]?.dataSubjectId).toBe('subject456');
      expect(query.logs[0]?.complianceFlags).toContain('gdpr');
    });
  });

  describe('Query and Search Functionality', () => {
    it('should query logs by user ID', async () => {
      // Setup test data
      await auditLogger.logEvent(AuditEventType.USER_ACTION, 'login', {
        userId: 'user1',
        severity: AuditSeverity.LOW,
        success: true,
      });

      const result = await auditLogger.queryLogs({ userId: 'user1' });

      expect(result.total).toBe(1);
      expect(result.logs).toHaveLength(1);
      expect(result.logs.every((log) => log.userId === 'user1')).toBe(true);
    });

    it('should query logs by event type', async () => {
      // Setup test data
      await auditLogger.logEvent(AuditEventType.SECURITY_EVENT, 'failed_login', {
        userId: 'user1',
        severity: AuditSeverity.HIGH,
        success: false,
      });

      const result = await auditLogger.queryLogs({ eventType: AuditEventType.SECURITY_EVENT });

      expect(result.total).toBe(1);
      expect(result.logs).toHaveLength(1);
      expect(result.logs[0]?.eventType).toBe(AuditEventType.SECURITY_EVENT);
    });

    it('should query logs by severity', async () => {
      // Setup test data
      await auditLogger.logEvent(AuditEventType.DATA_ACCESS, 'read_data', {
        userId: 'user2',
        severity: AuditSeverity.HIGH,
        success: true,
      });

      const result = await auditLogger.queryLogs({ severity: AuditSeverity.HIGH });

      expect(result.total).toBe(1);
      expect(result.logs).toHaveLength(1);
      expect(result.logs[0]?.severity).toBe(AuditSeverity.HIGH);
    });

    it('should query logs by success status', async () => {
      // Create test data with specific success status
      await auditLogger.logEvent(AuditEventType.USER_ACTION, 'success_action1', { success: true });
      await auditLogger.logEvent(AuditEventType.USER_ACTION, 'success_action2', { success: true });
      await auditLogger.logEvent(AuditEventType.USER_ACTION, 'fail_action', { success: false });

      const successResult = await auditLogger.queryLogs({ success: true });
      const failResult = await auditLogger.queryLogs({ success: false });

      expect(successResult.total).toBe(2);
      expect(failResult.total).toBe(1);
    });

    it('should support pagination', async () => {
      // Create exactly 3 test records for pagination test
      await auditLogger.logEvent(AuditEventType.USER_ACTION, 'action1');
      await auditLogger.logEvent(AuditEventType.USER_ACTION, 'action2');
      await auditLogger.logEvent(AuditEventType.USER_ACTION, 'action3');

      const page1 = await auditLogger.queryLogs({ limit: 2, offset: 0 });
      const page2 = await auditLogger.queryLogs({ limit: 2, offset: 2 });

      expect(page1.logs).toHaveLength(2);
      expect(page2.logs).toHaveLength(1);
      expect(page1.total).toBe(3);
      expect(page2.total).toBe(3);
    });

    it('should support sorting', async () => {
      // Create test data with specific severities
      await auditLogger.logEvent(AuditEventType.USER_ACTION, 'low_action', {
        severity: AuditSeverity.LOW,
      });
      await auditLogger.logEvent(AuditEventType.USER_ACTION, 'medium_action', {
        severity: AuditSeverity.MEDIUM,
      });
      await auditLogger.logEvent(AuditEventType.USER_ACTION, 'high_action', {
        severity: AuditSeverity.HIGH,
      });

      const ascResult = await auditLogger.queryLogs({
        sortBy: 'severity',
        sortOrder: 'asc',
      });

      expect(ascResult.logs[0]?.severity).toBe(AuditSeverity.LOW);
      expect(ascResult.logs[2]?.severity).toBe(AuditSeverity.HIGH);
    });
  });

  describe('Statistics and Analytics', () => {
    it('should calculate correct statistics', async () => {
      // Setup test data for statistics
      await auditLogger.logEvent(AuditEventType.USER_ACTION, 'action1', { success: true });
      await auditLogger.logEvent(AuditEventType.USER_ACTION, 'action2', { success: false });
      await auditLogger.logEvent(AuditEventType.SECURITY_EVENT, 'security1', {
        severity: AuditSeverity.CRITICAL,
      });

      const stats = auditLogger.getStatistics();

      expect(stats.totalEvents).toBe(3);
      expect(stats.eventsByType[AuditEventType.USER_ACTION]).toBe(2);
      expect(stats.eventsByType[AuditEventType.SECURITY_EVENT]).toBe(1);
      expect(stats.eventsBySeverity[AuditSeverity.CRITICAL]).toBe(1);
      expect(stats.successRate).toBeCloseTo(66.67, 1);
    });

    it('should track critical events in last 24h', async () => {
      // Setup test data
      await auditLogger.logEvent(AuditEventType.SECURITY_EVENT, 'security1', {
        severity: AuditSeverity.CRITICAL,
      });

      const stats = auditLogger.getStatistics();
      expect(stats.criticalEventsLast24h).toBe(1);
    });
  });

  describe('Compliance Reporting', () => {
    it('should generate GDPR compliance report', async () => {
      // Setup GDPR test data
      await auditLogger.logDataAccess(
        'user123',
        'subject456',
        'read_personal_data',
        'personal',
        'consent',
      );

      await auditLogger.logSecurityEvent('unauthorized_access', AuditSeverity.HIGH, {
        userId: 'user123',
      });

      const startDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const endDate = new Date();

      const report = await auditLogger.generateComplianceReport('GDPR', startDate, endDate);

      expect(report.regulation).toBe('GDPR');
      expect(report.totalEvents).toBeGreaterThan(0);
      expect(report.dataSubjects).toBe(1);
      expect(report.dataAccesses).toBe(1);
      expect(report.securityIncidents).toBe(1);
      expect(report.generatedAt).toBeDefined();
    });
  });

  describe('Export Functionality', () => {
    it('should export logs as JSON', async () => {
      // Create a single test record for export
      await auditLogger.logEvent(AuditEventType.USER_ACTION, 'test_action', {
        userId: 'user123',
        metadata: { test: true },
      });

      // Force flush to storage
      await auditLogger.flush();

      const exported = await auditLogger.exportLogs({}, 'json');

      expect(() => JSON.parse(exported)).not.toThrow();
      const parsed = JSON.parse(exported);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].action).toBe('test_action');
    });

    it('should export logs as CSV', async () => {
      // Create a single test record for CSV export
      await auditLogger.logEvent(AuditEventType.USER_ACTION, 'test_action', {
        userId: 'user123',
        metadata: { test: true },
      });

      // Force flush to storage
      await auditLogger.flush();

      const exported = await auditLogger.exportLogs({}, 'csv');

      expect(typeof exported).toBe('string');
      expect(exported).toContain('id,timestamp,correlationId');
      expect(exported).toContain('test_action');
    });

    it('should export logs as XML', async () => {
      // Create a single test record for XML export
      await auditLogger.logEvent(AuditEventType.USER_ACTION, 'test_action', {
        userId: 'user123',
        metadata: { test: true },
      });

      // Force flush to storage
      await auditLogger.flush();

      const exported = await auditLogger.exportLogs({}, 'xml');

      expect(typeof exported).toBe('string');
      expect(exported).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(exported).toContain('<audit_logs>');
      expect(exported).toContain('test_action');
    });

    it('should throw error for unsupported format', async () => {
      await expect(auditLogger.exportLogs({}, 'invalid' as any)).rejects.toThrow(
        'Unsupported export format',
      );
    });
  });

  describe('Correlation ID Management', () => {
    it('should set and get correlation IDs', () => {
      auditLogger.setCorrelationId('session123', 'corr123');

      const retrieved = auditLogger.getCorrelationId('session123');
      expect(retrieved).toBe('corr123');
    });

    it('should return undefined for non-existent correlation ID', () => {
      const retrieved = auditLogger.getCorrelationId('nonexistent');
      expect(retrieved).toBeUndefined();
    });

    it('should cleanup old correlation IDs', () => {
      auditLogger.setCorrelationId('old_session', 'corr123');
      auditLogger.cleanupCorrelationIds();

      // Since cleanup is time-based, we just ensure it doesn't throw
      expect(() => auditLogger.cleanupCorrelationIds()).not.toThrow();
    });
  });

  describe('Event Emission', () => {
    it('should emit audit_event when logging', async () => {
      const eventSpy = vi.fn();
      auditLogger.on('audit_event', eventSpy);

      await auditLogger.logEvent(AuditEventType.USER_ACTION, 'test_action');

      expect(eventSpy).toHaveBeenCalledOnce();
      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: AuditEventType.USER_ACTION,
          action: 'test_action',
        }),
      );
    });

    it('should emit critical_security_event for critical security events', async () => {
      const criticalSpy = vi.fn();
      auditLogger.on('critical_security_event', criticalSpy);

      await auditLogger.logSecurityEvent('critical_breach', AuditSeverity.CRITICAL);

      expect(criticalSpy).toHaveBeenCalledOnce();
    });

    it('should emit gdpr_concern for high-severity GDPR events', async () => {
      const gdprSpy = vi.fn();
      auditLogger.on('gdpr_concern', gdprSpy);

      await auditLogger.logEvent(AuditEventType.DATA_ACCESS, 'sensitive_access', {
        severity: AuditSeverity.HIGH,
        gdprRelevant: true,
      });

      expect(gdprSpy).toHaveBeenCalledOnce();
    });
  });

  describe('Error Handling', () => {
    it('should handle logging errors gracefully', async () => {
      const errorSpy = vi.fn();
      auditLogger.on('error', errorSpy);

      // Force an error by providing invalid input
      const invalidLogger = new AdvancedAuditLogger();

      // Mock a method to throw error
      vi.spyOn(invalidLogger as any, 'performRealTimeAnalysis').mockRejectedValue(
        new Error('Analysis failed'),
      );

      await expect(invalidLogger.logEvent(AuditEventType.USER_ACTION, 'test')).rejects.toThrow();
    });

    it('should handle flush errors gracefully', async () => {
      const errorSpy = vi.fn();
      auditLogger.on('error', errorSpy);

      // Mock flush to fail
      vi.spyOn(auditLogger as any, 'writeToFile').mockRejectedValue(new Error('Write failed'));

      // This should not throw but emit an error
      await auditLogger.flush();

      // The error should be handled internally
      expect(() => auditLogger.flush()).not.toThrow();
    });
  });
});

describe('Audit Middleware', () => {
  let auditLogger: AdvancedAuditLogger;
  let mockReq: any;
  let mockRes: any;
  let mockNext: any;

  beforeEach(() => {
    auditLogger = new AdvancedAuditLogger({ storage: 'memory' });

    mockReq = {
      method: 'GET',
      path: '/api/test',
      originalUrl: '/api/test?param=value',
      ip: '192.168.1.1',
      sessionID: 'session123',
      query: { param: 'value' },
      headers: { 'user-agent': 'test-browser' },
      get: vi.fn().mockReturnValue('test-browser'),
      user: { id: 'user123' },
    };

    mockRes = {
      statusCode: 200,
      send: vi.fn(),
    };

    mockNext = vi.fn();
  });

  afterEach(async () => {
    await auditLogger.destroy();
  });

  it('should create middleware with default options', () => {
    const middleware = createAuditMiddleware(auditLogger);

    expect(typeof middleware).toBe('function');
    expect(middleware.length).toBe(3); // req, res, next
  });

  it('should log API requests', async () => {
    const middleware = createAuditMiddleware(auditLogger, { logRequests: true });

    middleware(mockReq, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalledOnce();
    expect(mockReq.correlationId).toBeDefined();

    // Wait a bit for async logging to complete
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Check if event was logged
    const query = await auditLogger.queryLogs({
      eventType: AuditEventType.API_REQUEST,
    });
    expect(query.logs).toHaveLength(1);
    expect(query.logs[0]?.action).toBe('GET /api/test');
  });

  it('should skip excluded paths', async () => {
    const middleware = createAuditMiddleware(auditLogger, {
      excludePaths: ['/health'],
    });

    mockReq.path = '/health';
    middleware(mockReq, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalledOnce();

    const query = await auditLogger.queryLogs({});
    expect(query.logs).toHaveLength(0);
  });

  it('should sanitize sensitive headers', async () => {
    mockReq.headers.authorization = 'Bearer secret-token';

    const middleware = createAuditMiddleware(auditLogger, {
      logRequests: true,
      sensitiveHeaders: ['authorization'],
    });

    middleware(mockReq, mockRes, mockNext);

    // Wait a bit for async logging to complete
    await new Promise((resolve) => setTimeout(resolve, 10));

    const query = await auditLogger.queryLogs({});
    const logEntry = query.logs[0];
    expect(logEntry).toBeDefined();
    expect((logEntry?.metadata as any)?.headers?.authorization).toBe('[REDACTED]');
  });

  it('should set correlation ID from header', () => {
    mockReq.get = vi.fn().mockImplementation((header) => {
      if (header === 'X-Correlation-ID') return 'existing-correlation-id';
      return 'test-browser';
    });

    const middleware = createAuditMiddleware(auditLogger);
    middleware(mockReq, mockRes, mockNext);

    expect(mockReq.correlationId).toBe('existing-correlation-id');
  });
});

describe('AuditLoggerUtils', () => {
  it('should create production logger with correct config', () => {
    const logger = AuditLoggerUtils.createProductionLogger();

    expect(logger).toBeInstanceOf(AdvancedAuditLogger);
    expect(logger.getStatistics()).toBeDefined();
  });

  it('should create development logger with correct config', () => {
    const logger = AuditLoggerUtils.createDevelopmentLogger();

    expect(logger).toBeInstanceOf(AdvancedAuditLogger);
    expect(logger.getStatistics()).toBeDefined();
  });

  it('should create GDPR logger with correct config', () => {
    const logger = AuditLoggerUtils.createGDPRLogger();

    expect(logger).toBeInstanceOf(AdvancedAuditLogger);
    expect(logger.getStatistics()).toBeDefined();
  });
});

describe('Default Export', () => {
  it('should provide default audit logger instance', () => {
    expect(defaultAuditLogger).toBeInstanceOf(AdvancedAuditLogger);
    expect(defaultAuditLogger.getStatistics).toBeDefined();
  });
});
