/**
 * Mock ThreatDetectionService - заменяет удалённый @heys/threat-detection
 * HEYS = nutrition tracking app, security ML не используется
 */

export interface IThreatDetectionService {
  initialize(): Promise<void>;
  analyzeSecurityEvent(event: unknown): Promise<{ anomalyScore: number }>;
  getStatistics(): Promise<Record<string, unknown>>;
}

export class ThreatDetectionService implements IThreatDetectionService {
  async initialize(): Promise<void> {
    // Mock - no-op
  }

  async analyzeSecurityEvent(_event: unknown): Promise<{ anomalyScore: number }> {
    // Mock - always returns low score (no threats)
    return { anomalyScore: 0 };
  }

  async getStatistics(): Promise<Record<string, unknown>> {
    return { enabled: false, note: 'Security ML disabled - not needed for nutrition app' };
  }
}
