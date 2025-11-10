import { SecurityEvent, SecurityEventType, SecuritySeverity } from './types';

import { ThreatDetectionService } from './index';

/**
 * Demo для демонстрации Advanced Threat Detection
 */

// Создаём demo security events
const demoEvents: SecurityEvent[] = [
  {
    id: 'evt_1',
    timestamp: Date.now(),
    type: 'brute_force',
    severity: 'high',
    source: 'web_server',
    sourceIP: '185.220.100.240', // Tor exit node - есть в IOC базе
    userId: 'user_123',
    sessionId: 'sess_456',
    ipAddress: '185.220.100.240',
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
    metadata: {
      failedAttempts: 15,
      responseTime: 200,
      geoDistance: 5000,
      deviceChanged: true,
      privilegeLevel: 'admin',
    },
    riskScore: 85,
    isBlocked: false,
    description: 'Multiple failed login attempts from suspicious IP',
  },
  {
    id: 'evt_2',
    timestamp: Date.now() + 1000,
    type: 'anomalous_behavior',
    severity: 'medium',
    source: 'api_server',
    sourceIP: '192.168.1.50',
    userId: 'user_789',
    sessionId: 'sess_789',
    ipAddress: '192.168.1.50',
    userAgent:
      'Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)',
    metadata: {
      requestCount: 500,
      sessionDuration: 3600000,
      errorRate: 0.1,
      dataSize: 5000000,
      unusual_hours: 1,
    },
    riskScore: 65,
    isBlocked: false,
    description: 'Unusual API access pattern detected',
  },
];

/**
 * Демо функция для запуска threat detection
 */
export async function runThreatDetectionDemo(): Promise<void> {
  console.log('🚀 Starting Advanced Threat Detection Demo...\n');

  try {
    // Инициализируем сервис
    const threatDetection = new ThreatDetectionService();
    await threatDetection.initialize();

    console.log('✅ Threat Detection Service initialized\n');

    // Тренируем ML модель на demo данных
    console.log('🤖 Training ML anomaly detection model...');
    const trainingData = generateTrainingData(100);
    await threatDetection.trainAnomalyModel(trainingData);
    console.log('✅ ML model trained successfully\n');

    // Анализируем каждый demo event
    for (const event of demoEvents) {
      console.log(`🔍 Analyzing event: ${event.id} (${event.type})`);
      console.log(`   Source: ${event.source}, IP: ${event.sourceIP}`);
      console.log(`   Severity: ${event.severity}, Risk Score: ${event.riskScore}`);

      const result = await threatDetection.analyzeSecurityEvent(event);

      // Выводим результаты анализа
      console.log('\n📊 Analysis Results:');

      if (result.anomaly) {
        console.log(`   🎯 Anomaly detected: ${result.anomaly.explanation}`);
        console.log(`   📈 Anomaly score: ${result.anomaly.anomalyScore.toFixed(3)}`);
        console.log(`   🎛️ Confidence: ${result.anomaly.confidence.toFixed(3)}`);
      } else {
        console.log('   ✅ No anomaly detected');
      }

      if (result.iocMatches.length > 0) {
        console.log(`   🎯 IOC matches found: ${result.iocMatches.length}`);
        result.iocMatches.forEach((match) => {
          console.log(`      - ${match.iocType}: ${match.matchedValue} (${match.category})`);
        });
      } else {
        console.log('   ✅ No IOC matches');
      }

      if (result.incidentCreated) {
        console.log(`   🚨 INCIDENT CREATED: ${result.incidentCreated.id}`);
        console.log(`      Title: ${result.incidentCreated.title}`);
        console.log(`      Severity: ${result.incidentCreated.severity}`);
        console.log(`      Status: ${result.incidentCreated.status}`);
        console.log(`      Assigned to: ${result.incidentCreated.assignedTo}`);
      } else {
        console.log('   ℹ️ No incident created');
      }

      console.log('\n' + '─'.repeat(80) + '\n');
    }

    // Показываем статистику
    const stats = threatDetection.getStatistics();
    console.log('📈 Final Statistics:');
    console.log(`   Threat Intelligence IOCs: ${stats.threatIntel.totalIOCs}`);
    console.log(`   Active Incidents: ${stats.incidents.openIncidents}`);
    console.log(`   ML Models: ${stats.models.length}`);

    console.log('\n🎉 Demo completed successfully!');
  } catch (error) {
    console.error('❌ Demo failed:', error);
  }
}

/**
 * Генерирует training data для ML модели
 */
function generateTrainingData(count: number): SecurityEvent[] {
  const events: SecurityEvent[] = [];

  for (let i = 0; i < count; i++) {
    events.push({
      id: `training_${i}`,
      timestamp: Date.now() - Math.random() * 86400000 * 30, // last 30 days
      type: getRandomEventType(),
      severity: getRandomSeverity(),
      source: getRandomSource(),
      ipAddress: generateRandomIP(),
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      metadata: {
        requestCount: Math.floor(Math.random() * 100) + 1,
        sessionDuration: Math.floor(Math.random() * 3600000),
        errorRate: Math.random() * 0.1,
        responseTime: Math.floor(Math.random() * 1000) + 100,
        dataSize: Math.floor(Math.random() * 1000000),
        geoDistance: Math.floor(Math.random() * 1000),
        deviceChanged: Math.random() > 0.8,
        privilegeLevel: Math.random() > 0.7 ? 'admin' : 'user',
        failedAttempts: Math.floor(Math.random() * 5),
      },
      riskScore: Math.floor(Math.random() * 60) + 20, // 20-80 for normal events
      isBlocked: false,
      description: `Training event ${i}`,
    });
  }

  return events;
}

function getRandomEventType(): SecurityEventType {
  const types: SecurityEventType[] = [
    'login_attempt',
    'suspicious_request',
    'data_exfiltration',
    'anomalous_behavior',
  ];
  return types[Math.floor(Math.random() * types.length)] || 'login_attempt';
}

function getRandomSeverity(): SecuritySeverity {
  const severities: SecuritySeverity[] = ['low', 'medium', 'high'];
  return severities[Math.floor(Math.random() * severities.length)] || 'medium';
}

function getRandomSource(): string {
  const sources = ['web_server', 'api_server', 'database', 'file_server', 'email_server'];
  return sources[Math.floor(Math.random() * sources.length)] || 'web_server';
}

function generateRandomIP(): string {
  return `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
}

// Экспортируем для использования в других местах
export { demoEvents };
