import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SecurityAnalyticsService } from '@heys/shared';

// Mock Supabase client
const mockSupabaseClient = {
  from: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  range: vi.fn().mockReturnThis(),
  single: vi.fn(),
  rpc: vi.fn(),
  channel: vi.fn().mockReturnThis(),
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn()
};

// Mock ThreatDetectionService
const mockThreatDetectionService = {
  initialize: vi.fn(),
  analyzeSecurityEvent: vi.fn(),
  trainAnomalyModel: vi.fn(),
  getStatistics: vi.fn()
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabaseClient)
}));

vi.mock('@heys/threat-detection', () => ({
  ThreatDetectionService: vi.fn(() => mockThreatDetectionService)
}));

describe('Security Analytics Integration Tests', () => {
  let securityService: SecurityAnalyticsService;
  
  const mockConfig = {
    supabaseUrl: 'https://test.supabase.co',
    supabaseKey: 'test-key',
    enableRealTimeProcessing: true,
    enableAutomatedResponse: true
  };

  beforeEach(() => {
    vi.clearAllMocks();
    securityService = new SecurityAnalyticsService(mockConfig);
  });

  describe('Initialization', () => {
    it('should initialize threat detection and database services', async () => {
      // Mock successful initialization
      mockThreatDetectionService.initialize.mockResolvedValue(undefined);
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: [
                {
                  id: '1',
                  ioc_type: 'ip',
                  ioc_value: '192.168.1.100',
                  threat_actor: 'APT29',
                  is_active: true
                }
              ],
              error: null
            })
          })
        })
      });

      await securityService.initialize();

      expect(mockThreatDetectionService.initialize).toHaveBeenCalled();
    });

    it('should handle initialization errors gracefully', async () => {
      mockThreatDetectionService.initialize.mockRejectedValue(new Error('Init failed'));

      await expect(securityService.initialize()).rejects.toThrow('Init failed');
    });
  });

  describe('Security Event Processing', () => {
    beforeEach(async () => {
      // Setup successful initialization
      mockThreatDetectionService.initialize.mockResolvedValue(undefined);
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null })
          })
        })
      });
      await securityService.initialize();
    });

    it('should process security event through full pipeline', async () => {
      const mockEvent = {
        user_id: 'user-123',
        event_type: 'login',
        source_ip: '192.168.1.100',
        user_agent: 'Mozilla/5.0',
        session_id: 'session-456'
      };

      const mockSavedEvent = {
        ...mockEvent,
        id: 'event-789',
        created_at: '2025-09-01T10:00:00Z',
        updated_at: '2025-09-01T10:00:00Z'
      };

      const mockAnalysisResult = {
        anomalyScore: 0.8,
        incidentCreated: true,
        incident: {
          title: 'High Risk Login',
          description: 'Anomalous login detected',
          severity: 'high' as const,
          responseActions: { block_ip: true },
          timeline: [{ action: 'detected', timestamp: '2025-09-01T10:00:00Z' }],
          impactAssessment: { risk_level: 'high' }
        },
        iocMatches: [{ type: 'ip', value: '192.168.1.100' }]
      };

      // Mock database operations
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'security_events') {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: mockSavedEvent,
                  error: null
                })
              })
            })
          };
        }
        if (table === 'security_incidents') {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: 'incident-123', ...mockAnalysisResult.incident },
                  error: null
                })
              })
            })
          };
        }
        return mockSupabaseClient;
      });

      // Mock threat detection analysis
      mockThreatDetectionService.analyzeSecurityEvent.mockResolvedValue(mockAnalysisResult);

      const result = await securityService.processSecurityEvent(mockEvent);

      expect(result.anomaly_score).toBe(0.8);
      expect(result.threat_level).toBe('high'); // Исправлено: threat_level возвращает 'high'
      expect(mockThreatDetectionService.analyzeSecurityEvent).toHaveBeenCalledWith({
        id: 'event-789',
        timestamp: '2025-09-01T10:00:00Z',
        userId: 'user-123',
        sessionId: 'session-456',
        ipAddress: '192.168.1.100',
        userAgent: 'Mozilla/5.0',
        endpoint: 'login',
        method: 'POST',
        statusCode: 200,
        responseTime: 0,
        requestSize: 0,
        responseSize: 0,
        geoLocation: undefined,
        deviceFingerprint: undefined,
        customAttributes: {}
      });
    });

    it('should handle events without incidents', async () => {
      const mockEvent = {
        user_id: 'user-123',
        event_type: 'api_call',
        source_ip: '10.0.0.1'
      };

      const mockSavedEvent = {
        ...mockEvent,
        id: 'event-789',
        created_at: '2025-09-01T10:00:00Z',
        updated_at: '2025-09-01T10:00:00Z'
      };

      const mockAnalysisResult = {
        anomalyScore: 0.2,
        incidentCreated: false,
        incident: null,
        iocMatches: []
      };

      mockSupabaseClient.from.mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: mockSavedEvent,
              error: null
            })
          })
        })
      });

      mockThreatDetectionService.analyzeSecurityEvent.mockResolvedValue(mockAnalysisResult);

      const result = await securityService.processSecurityEvent(mockEvent);

      expect(result.anomaly_score).toBe(0.2);
      expect(result.threat_level).toBe('low');
      expect(result.automated_response).toEqual([]);
    });
  });

  describe('Analytics Data Retrieval', () => {
    beforeEach(async () => {
      mockThreatDetectionService.initialize.mockResolvedValue(undefined);
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null })
          })
        })
      });
      await securityService.initialize();
    });

    it('should retrieve comprehensive security analytics', async () => {
      const mockMetrics = {
        total_events: 1000,
        unique_ips: 50,
        error_rate: 0.05,
        avg_response_time: 120,
        failed_attempts: 15,
        event_types: ['login', 'api_call']
      };

      const mockThreats = [
        {
          ioc_value: '192.168.1.100',
          ioc_type: 'ip',
          threat_actor: 'APT29',
          matches_count: 10,
          last_seen: '2025-09-01T10:00:00Z'
        }
      ];

      const mockIncidents = [
        {
          id: '1',
          title: 'Suspicious Activity',
          severity: 'medium',
          status: 'open',
          created_at: '2025-09-01T09:00:00Z'
        }
      ];

      const mockEvents = [
        {
          id: '1',
          event_type: 'login',
          source_ip: '192.168.1.100',
          created_at: '2025-09-01T10:00:00Z'
        }
      ];

      const mockMLStats = {
        totalEventsAnalyzed: 1000,
        anomaliesDetected: 25,
        modelAccuracy: 0.92
      };

      // Mock database calls
      mockSupabaseClient.rpc.mockImplementation((func: string) => {
        if (func === 'get_security_metrics') {
          return Promise.resolve({ data: mockMetrics, error: null });
        }
        if (func === 'get_top_threats') {
          return Promise.resolve({ data: mockThreats, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      });

      mockSupabaseClient.from.mockImplementation((table: string) => {
        const mockChain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          range: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          // Добавляем поддержку Promise
          then: vi.fn()
        };

        if (table === 'security_incidents') {
          // Поддерживаем цепочку и финальный результат
          const chainWithResult = {
            ...mockChain,
            order: vi.fn().mockReturnValue({
              ...mockChain,
              then: vi.fn((resolve) => resolve({ data: mockIncidents, error: null }))
            })
          };
          // Также поддерживаем прямое разрешение
          chainWithResult.then = vi.fn((resolve) => resolve({ data: mockIncidents, error: null }));
          return chainWithResult;
        }
        if (table === 'security_events') {
          // Поддерживаем цепочку для events тоже
          const eventsChain = {
            ...mockChain,
            range: vi.fn().mockReturnValue({
              ...mockChain,
              then: vi.fn((resolve) => resolve({ data: mockEvents, error: null }))
            })
          };
          // Поддерживаем прямое разрешение
          eventsChain.then = vi.fn((resolve) => resolve({ data: mockEvents, error: null }));
          return eventsChain;
        }
        return mockChain;
      });

      mockThreatDetectionService.getStatistics.mockResolvedValue(mockMLStats);

      const analytics = await securityService.getSecurityAnalytics('user-123', undefined, 'day');

      expect(analytics.overview.total_events).toBe(1000);
      expect(analytics.overview.risk_score).toBeGreaterThan(0);
      expect(analytics.threats.top_threats).toHaveLength(1);
      expect(analytics.incidents).toHaveLength(1);
      expect(analytics.ml_stats.totalEventsAnalyzed).toBe(1000);
    });
  });

  describe('Real-time Processing', () => {
    it('should handle real-time event subscriptions', async () => {
      const mockSubscription = {
        unsubscribe: vi.fn()
      };

      mockSupabaseClient.channel.mockReturnValue({
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn().mockResolvedValue(mockSubscription)
      });

      const subscription = securityService.subscribeToRealTimeEvents('user-123');

      expect(mockSupabaseClient.channel).toHaveBeenCalledWith('security_events');
      expect(subscription).toBeDefined();
    });

    it('should process batch events efficiently', async () => {
      const mockEvents = Array.from({ length: 250 }, (_, i) => ({
        user_id: 'user-123',
        event_type: 'api_call',
        source_ip: `192.168.1.${i % 255}`
      }));

      let batchResults: any[] = [];
      securityService.on('batchProgress', (progress) => {
        batchResults.push(progress);
      });

      // Mock successful processing for each event
      mockSupabaseClient.from.mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockImplementation(async () => ({
              data: {
                id: `event-${Math.random()}`,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              },
              error: null
            }))
          })
        })
      });

      mockThreatDetectionService.analyzeSecurityEvent.mockResolvedValue({
        anomalyScore: 0.1,
        incidentCreated: false,
        incident: null,
        iocMatches: []
      });

      await securityService.batchProcessEvents(mockEvents);

      // Should process in batches of 100
      expect(batchResults.length).toBeGreaterThan(0);
      expect(batchResults[batchResults.length - 1].total).toBe(250);
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection errors', async () => {
      mockSupabaseClient.from.mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'Connection failed' }
            })
          })
        })
      });

      const mockEvent = {
        user_id: 'user-123',
        event_type: 'login'
      };

      await expect(securityService.processSecurityEvent(mockEvent))
        .rejects.toThrow('Failed to create security event: Connection failed');
    });

    it('should handle threat detection errors', async () => {
      const mockEvent = {
        user_id: 'user-123',
        event_type: 'login'
      };

      mockSupabaseClient.from.mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'event-123', created_at: new Date().toISOString() },
              error: null
            })
          })
        })
      });

      mockThreatDetectionService.analyzeSecurityEvent.mockRejectedValue(
        new Error('ML model error')
      );

      await expect(securityService.processSecurityEvent(mockEvent))
        .rejects.toThrow('ML model error');
    });
  });
});
