import { SecurityEvent } from './types';

import { ThreatDetectionService } from './index';

async function runDemo() {
  try {
    console.log('🚀 Starting Threat Detection Demo...');
    
    const service = new ThreatDetectionService();
    await service.initialize();
    
    console.log('✅ Service initialized successfully');
    
    // Test event
    const testEvent: SecurityEvent = {
      id: 'demo_test_1',
      timestamp: Date.now(),
      type: 'login_attempt',
      severity: 'medium',
      source: 'web_app',
      ipAddress: '192.168.1.100', // This should match IOC
      userAgent: 'Mozilla/5.0 Test',
      metadata: {
        requestCount: 5,
        sessionDuration: 1200
      },
      riskScore: 45,
      isBlocked: false,
      description: 'Demo login attempt'
    };
    
    console.log('🔍 Analyzing test event...');
    const result = await service.analyzeSecurityEvent(testEvent);
    
    console.log('📊 Analysis Results:');
    console.log('  - IOC Matches:', result.iocMatches?.length || 0);
    console.log('  - Incident Created:', result.incidentCreated || 'No');
    console.log('  - Anomaly Detected:', result.anomaly?.isAnomaly || 'No model trained');
    
    const stats = service.getStatistics();
    console.log('📈 Service Statistics:');
    console.log('  - IOCs in Database:', stats.threatIntel.iocCount);
    console.log('  - Active Incidents:', stats.incidents.active);
    console.log('  - Total Events Processed:', stats.incidents.totalEvents);
    
    console.log('✅ Demo completed successfully!');
    
  } catch (error) {
    console.error('❌ Demo failed:', error);
  }
}

runDemo();
