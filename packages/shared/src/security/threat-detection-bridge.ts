// Temporary export bridge for threat detection service
// This resolves import issues between packages

// Define interface for consistent typing
interface IThreatDetectionService {
  initialize(): Promise<void>;
  analyzeSecurityEvent(event: any): Promise<any>;
  getStatistics(): Promise<any>;
}

// Import using try-catch to handle missing package gracefully
let ThreatDetectionService: new() => IThreatDetectionService;

try {
  const threatDetection = require('@heys/threat-detection');
  ThreatDetectionService = threatDetection.ThreatDetectionService;
} catch (error) {
  // Fallback mock for development
  ThreatDetectionService = class MockThreatDetectionService implements IThreatDetectionService {
    async initialize() {
      console.warn('Using mock ThreatDetectionService - install @heys/threat-detection for full functionality');
    }
    
    async analyzeSecurityEvent(_event: any) {
      return { threat_level: 'low', matches: [] };
    }
    
    async getStatistics() {
      return { totalEvents: 0, threats: 0, incidents: 0 };
    }
  };
}

export { ThreatDetectionService };
export type { IThreatDetectionService };
