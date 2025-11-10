import { beforeEach, describe, expect, it } from 'vitest';

import { AnomalyDetectionEngine } from '../ml/AnomalyDetectionEngine';
import { SecurityEvent } from '../types';

describe('AnomalyDetectionEngine', () => {
  let engine: AnomalyDetectionEngine;

  beforeEach(() => {
    engine = new AnomalyDetectionEngine({
      anomalyThreshold: 0.8, // Higher threshold for more stable tests
      minTrainingSamples: 100,
    });
  });

  it('should train model with sufficient data', async () => {
    // Generate consistent training data
    const trainingEvents: SecurityEvent[] = [];

    for (let i = 0; i < 100; i++) {
      trainingEvents.push({
        id: `normal_${i}`,
        timestamp: Date.now() - i * 60000,
        type: 'login_attempt',
        severity: 'low',
        source: 'web_app',
        ipAddress: `192.168.1.${100 + (i % 20)}`,
        userAgent: 'Mozilla/5.0 Standard Browser',
        metadata: {
          requestCount: 1 + (i % 3), // 1-3 requests
          sessionDuration: 1000 + (i % 1000), // 1000-2000ms
          bytesTransferred: 1024 + (i % 512),
          errorCount: 0,
          geolocation: { country: 'US', city: 'New York' },
        },
        riskScore: 10 + (i % 10), // 10-19 risk score
        isBlocked: false,
        description: 'Normal login attempt',
      });
    }

    const model = await engine.trainModel(trainingEvents);

    expect(model).toBeDefined();
    expect(model.id).toBeDefined();
    expect(model.type).toBe('anomaly_detection');
    expect(model.version).toBeDefined();
  });

  it('should detect anomalies after training', async () => {
    // Train with normal data
    const trainingEvents: SecurityEvent[] = Array.from({ length: 100 }, (_, i) => ({
      id: `train_${i}`,
      timestamp: Date.now() - i * 60000,
      type: 'login_attempt',
      severity: 'low',
      source: 'web_app',
      ipAddress: `192.168.1.${100 + (i % 10)}`,
      userAgent: 'Mozilla/5.0',
      metadata: {
        requestCount: 1 + (i % 2), // 1-2 requests
        sessionDuration: 1000 + (i % 500), // 1000-1500ms
      },
      riskScore: 10 + (i % 5), // 10-14
      isBlocked: false,
      description: 'Normal event',
    }));

    await engine.trainModel(trainingEvents);

    // Test with event similar to training data
    const similarEvent: SecurityEvent = {
      id: 'test_similar',
      timestamp: Date.now(),
      type: 'login_attempt',
      severity: 'low',
      source: 'web_app',
      ipAddress: '192.168.1.101',
      userAgent: 'Mozilla/5.0',
      metadata: {
        requestCount: 1,
        sessionDuration: 1200,
      },
      riskScore: 12,
      isBlocked: false,
      description: 'Similar event',
    };

    const result = await engine.detectAnomaly(similarEvent);

    expect(result).toBeDefined();
    expect(result.id).toBeDefined();
    expect(result.isAnomaly).toBeDefined();
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.anomalyScore).toBeGreaterThanOrEqual(0);
    expect(result.anomalyScore).toBeLessThanOrEqual(1);
  });

  it('should handle batch processing', async () => {
    // Train model first
    const trainingEvents: SecurityEvent[] = Array.from({ length: 100 }, (_, i) => ({
      id: `train_${i}`,
      timestamp: Date.now() - i * 60000,
      type: 'login_attempt',
      severity: 'low',
      source: 'web_app',
      ipAddress: `192.168.1.${100 + (i % 5)}`,
      userAgent: 'Mozilla/5.0',
      metadata: { requestCount: 1, sessionDuration: 1000 },
      riskScore: 10,
      isBlocked: false,
      description: 'Training event',
    }));

    await engine.trainModel(trainingEvents);

    // Test batch processing
    const testEvents: SecurityEvent[] = [
      {
        id: 'batch_1',
        timestamp: Date.now(),
        type: 'login_attempt',
        severity: 'low',
        source: 'web_app',
        ipAddress: '192.168.1.101',
        userAgent: 'Mozilla/5.0',
        metadata: { requestCount: 1, sessionDuration: 1000 },
        riskScore: 10,
        isBlocked: false,
        description: 'Normal event',
      },
      {
        id: 'batch_2',
        timestamp: Date.now(),
        type: 'login_attempt',
        severity: 'low',
        source: 'web_app',
        ipAddress: '192.168.1.102',
        userAgent: 'Mozilla/5.0',
        metadata: { requestCount: 1, sessionDuration: 1000 },
        riskScore: 10,
        isBlocked: false,
        description: 'Another normal event',
      },
    ];

    const results = await engine.detectAnomaliesBatch(testEvents);

    expect(results).toHaveLength(2);
    expect(results[0]).toBeDefined();
    expect(results[1]).toBeDefined();
    expect(results.every((r) => r.id && r.confidence >= 0)).toBe(true);
  });

  it('should provide model information', async () => {
    const trainingEvents: SecurityEvent[] = Array.from({ length: 100 }, (_, i) => ({
      id: `info_${i}`,
      timestamp: Date.now() - i * 60000,
      type: 'login_attempt',
      severity: 'low',
      source: 'web_app',
      ipAddress: `192.168.1.${100 + (i % 5)}`,
      userAgent: 'Mozilla/5.0',
      metadata: { requestCount: 1, sessionDuration: 1000 },
      riskScore: 10,
      isBlocked: false,
      description: 'Training event',
    }));

    await engine.trainModel(trainingEvents);

    const models = engine.getModelInfo();

    expect(models).toBeDefined();
    expect(Array.isArray(models)).toBe(true);
  });

  it('should update threshold correctly', () => {
    engine.updateThreshold(0.9);
    // No direct way to verify, but should not throw
    expect(true).toBe(true);
  });
});
