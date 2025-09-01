import { describe, it, expect, beforeEach } from 'vitest';

import { ThreatDetectionService } from '../index';
import { SecurityEvent } from '../types';

describe('ThreatDetectionService', () => {
  let service: ThreatDetectionService;

  beforeEach(async () => {
    service = new ThreatDetectionService();
    await service.initialize();
  });

  it('should initialize successfully', () => {
    expect(service).toBeDefined();
  });

  it('should analyze security event without errors', async () => {
    const testEvent: SecurityEvent = {
      id: 'test_1',
      timestamp: Date.now(),
      type: 'login_attempt',
      severity: 'medium',
      source: 'test_server',
      ipAddress: '192.168.1.100',
      userAgent: 'Mozilla/5.0 Test',
      metadata: {
        requestCount: 1,
        sessionDuration: 1000
      },
      riskScore: 50,
      isBlocked: false,
      description: 'Test security event'
    };

    const result = await service.analyzeSecurityEvent(testEvent);
    
    expect(result).toBeDefined();
    expect(result).toHaveProperty('anomaly');
    expect(result).toHaveProperty('iocMatches');
    expect(result).toHaveProperty('incidentCreated');
  });

  it('should get statistics', () => {
    const stats = service.getStatistics();
    
    expect(stats).toBeDefined();
    expect(stats).toHaveProperty('threatIntel');
    expect(stats).toHaveProperty('incidents');
    expect(stats).toHaveProperty('models');
  });
});
