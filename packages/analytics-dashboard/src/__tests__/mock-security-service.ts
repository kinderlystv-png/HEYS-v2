// Test helper для создания mock SecurityAnalyticsService
import { vi } from 'vitest';

export const createMockSecurityAnalyticsService = () => {
  const mockThreatDetectionService = {
    initialize: vi.fn().mockResolvedValue(undefined),
    analyzeSecurityEvent: vi.fn().mockResolvedValue({
      anomalyScore: 0.2,
      incidentCreated: false,
      findings: [],
      iocMatches: []
    }),
    getStatistics: vi.fn().mockResolvedValue({
      totalEventsAnalyzed: 1000,
      anomalyScore: 0.23,
      threatsDetected: 15,
      incidentsCreated: 3
    })
  };

  const mockDatabase = {
    createSecurityEvent: vi.fn().mockImplementation(async (event) => ({
      ...event,
      id: 'event-123',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })),
    createSecurityIncident: vi.fn(),
    getThreatIntelligence: vi.fn().mockResolvedValue([]),
    getSecurityMetrics: vi.fn().mockResolvedValue({
      total_events: 1000,
      total_incidents: 5,
      avg_risk_score: 0.3
    }),
    getTopThreats: vi.fn().mockResolvedValue([{ name: 'test-threat' }]),
    getSecurityIncidents: vi.fn().mockResolvedValue([{ id: '1', severity: 'medium' }]),
    getSecurityEvents: vi.fn().mockResolvedValue([])
  };

  const mockService = {
    initialize: vi.fn().mockImplementation(async () => {
      await mockThreatDetectionService.initialize();
    }),
    
    processSecurityEvent: vi.fn().mockImplementation(async (event) => {
      // Создаем savedEvent с правильной структурой
      const savedEvent = await mockDatabase.createSecurityEvent(event);
      
      // Анализируем с правильной структурой metadata
      const analysisResult = await mockThreatDetectionService.analyzeSecurityEvent({
        id: savedEvent.id,
        timestamp: savedEvent.created_at,
        customAttributes: event.metadata || {}
      });
      
      return {
        ...savedEvent,
        anomaly_score: analysisResult.anomalyScore,
        threat_level: analysisResult.anomalyScore > 0.5 ? 'high' : 'low',
        automated_response: []
      };
    }),
    
    getSecurityAnalytics: vi.fn().mockImplementation(async () => {
      const mlStats = await mockThreatDetectionService.getStatistics();
      return {
        overview: await mockDatabase.getSecurityMetrics(),
        threats: { top_threats: await mockDatabase.getTopThreats() },
        incidents: await mockDatabase.getSecurityIncidents(),
        ml_stats: mlStats
      };
    }),
    
    batchProcessEvents: vi.fn().mockImplementation(async (events) => {
      const results = [];
      for (const event of events) {
        const result = await mockService.processSecurityEvent(event);
        results.push(result);
      }
      return results;
    }),
    
    subscribeToRealTimeEvents: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
    on: vi.fn(),
    emit: vi.fn(),
    
    // Expose internals for test verification
    threatDetection: mockThreatDetectionService,
    database: mockDatabase
  };

  return mockService;
};
