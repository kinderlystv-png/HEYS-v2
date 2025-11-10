import { vi } from 'vitest';

// Mock ThreatDetectionService instance
const mockThreatDetectionService = {
  initialize: vi.fn().mockResolvedValue(undefined),
  analyzeSecurityEvent: vi.fn().mockResolvedValue({
    anomalyScore: 0.8,
    incidentCreated: false,
    findings: [],
    iocMatches: [],
  }),
  trainAnomalyModel: vi.fn().mockResolvedValue(undefined),
  getStatistics: vi.fn().mockResolvedValue({
    totalEventsAnalyzed: 1000,
    anomalyScore: 0.23,
    threatsDetected: 15,
    incidentsCreated: 3,
  }),
};

// Mock SecurityAnalyticsService
export const SecurityAnalyticsService = vi.fn().mockImplementation((_config: any) => {
  const service = {
    initialize: vi.fn().mockImplementation(() => mockThreatDetectionService.initialize()),
    processSecurityEvent: vi.fn().mockImplementation(async (event: any) => {
      // Mock database save
      const savedEvent = {
        id: 'event-123',
        ...event,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Mock threat detection analysis
      const analysisResult = await mockThreatDetectionService.analyzeSecurityEvent({
        id: savedEvent.id,
        timestamp: savedEvent.created_at,
        customAttributes: event.metadata || {},
      });

      return {
        ...savedEvent,
        anomaly_score: analysisResult.anomalyScore,
        threat_level: analysisResult.anomalyScore > 0.5 ? 'high' : 'low',
        automated_response: [],
      };
    }),
    getSecurityAnalytics: vi.fn().mockImplementation(async () => {
      const mlStats = await mockThreatDetectionService.getStatistics();
      return {
        overview: {
          total_events: 1000,
          unique_ips: 50,
          error_rate: 0.05,
          avg_response_time: 120,
          failed_attempts: 15,
          event_types: ['login', 'api_call'],
          risk_score: 0.75,
        },
        threats: {
          top_threats: [
            {
              ioc_value: '192.168.1.100',
              ioc_type: 'ip',
              threat_actor: 'APT29',
              matches_count: 10,
              last_seen: '2025-09-01T10:00:00Z',
            },
          ],
        },
        incidents: [
          {
            id: '1',
            title: 'Suspicious Activity',
            severity: 'medium',
            status: 'open',
            created_at: '2025-09-01T09:00:00Z',
          },
        ],
        ml_stats: mlStats,
      };
    }),
    batchProcessEvents: vi.fn().mockImplementation(async (events: any[]) => {
      const results = [];
      for (const event of events) {
        const result = await service.processSecurityEvent(event);
        results.push(result);
      }
      return results;
    }),
    subscribeToRealTimeEvents: vi.fn().mockImplementation(() => ({ unsubscribe: vi.fn() })),
    on: vi.fn(),
    emit: vi.fn(),

    // Expose internals for testing
    threatDetection: mockThreatDetectionService,
  };

  return service;
});

// Export the mock instance for tests to access
export const __mockThreatDetectionService = mockThreatDetectionService;
