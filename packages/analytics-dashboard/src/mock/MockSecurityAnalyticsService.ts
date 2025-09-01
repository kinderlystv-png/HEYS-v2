// Mock версия SecurityAnalyticsService для browser demo
export class MockSecurityAnalyticsService {
  private updateInterval?: NodeJS.Timeout;
  private subscribers: Function[] = [];

  async initialize() {
    console.log('🚀 Mock SecurityAnalyticsService initialized');
    return true;
  }

  async getSecurityAnalytics() {
    // Симуляция загрузки данных
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return {
      overview: {
        total_events: 15847,
        unique_ips: 324,
        error_rate: 2.3,
        avg_response_time: 145,
        failed_attempts: 89,
        event_types: ['authentication_failure', 'suspicious_request', 'data_access', 'sql_injection', 'xss_attempt'],
        risk_score: 0.73,
        active_incidents: 7,
        total_incidents: 23
      },
      threats: {
        top_threats: [
          { 
            ioc_value: '192.168.1.100', 
            ioc_type: 'ip', 
            threat_actor: 'APT29', 
            matches_count: 156,
            severity: 'critical',
            last_seen: new Date().toISOString()
          },
          { 
            ioc_value: 'malware.exe', 
            ioc_type: 'filename', 
            threat_actor: 'Lazarus', 
            matches_count: 89,
            severity: 'high',
            last_seen: new Date(Date.now() - 3600000).toISOString()
          },
          { 
            ioc_value: 'evil.domain.com', 
            ioc_type: 'domain', 
            threat_actor: 'APT1', 
            matches_count: 45,
            severity: 'medium',
            last_seen: new Date(Date.now() - 7200000).toISOString()
          }
        ]
      },
      incidents: [
        {
          id: 'inc-001',
          title: 'Suspicious Login Pattern Detected',
          severity: 'high' as const,
          status: 'investigating' as const,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          description: 'Multiple failed login attempts from suspicious IP addresses'
        },
        {
          id: 'inc-002', 
          title: 'Unusual Data Access Pattern',
          severity: 'medium' as const,
          status: 'resolved' as const,
          created_at: new Date(Date.now() - 3600000).toISOString(),
          updated_at: new Date(Date.now() - 1800000).toISOString(),
          description: 'Unusual data access patterns detected in user activity'
        },
        {
          id: 'inc-003',
          title: 'SQL Injection Attempt Blocked',
          severity: 'critical' as const,
          status: 'open' as const,
          created_at: new Date(Date.now() - 1800000).toISOString(),
          updated_at: new Date(Date.now() - 900000).toISOString(),
          description: 'Automated SQL injection attempts blocked by WAF'
        }
      ],
      events: [
        {
          id: 'event-001',
          event_type: 'authentication_failure',
          timestamp: new Date().toISOString(),
          user_id: 'user-123',
          source_ip: '192.168.1.100',
          severity: 'high' as const,
          metadata: { attempt_count: 5, user_agent: 'Suspicious Bot' }
        },
        {
          id: 'event-002',
          event_type: 'suspicious_request',
          timestamp: new Date(Date.now() - 300000).toISOString(),
          user_id: 'user-456',
          source_ip: '10.0.0.15',
          severity: 'medium' as const,
          metadata: { endpoint: '/admin/users', method: 'POST' }
        }
      ],
      ml_stats: {
        totalEventsAnalyzed: 15847,
        anomaliesDetected: 234,
        modelAccuracy: 0.94,
        lastTraining: new Date().toISOString(),
        processingTime: 145,
        threatLevel: 'medium' as const
      }
    };
  }

  async subscribeToEvents(callback: Function) {
    console.log('🔔 Subscribing to real-time security events');
    
    this.subscribers.push(callback);

    // Симулируем real-time события
    const eventTypes = ['authentication_failure', 'suspicious_request', 'data_access', 'sql_injection', 'xss_attempt'];
    const severities = ['low', 'medium', 'high', 'critical'];
    
    this.updateInterval = setInterval(() => {
      const event = {
        id: `event-${Date.now()}`,
        event_type: eventTypes[Math.floor(Math.random() * eventTypes.length)],
        timestamp: new Date().toISOString(),
        user_id: `user-${Math.floor(Math.random() * 1000)}`,
        source_ip: `192.168.1.${Math.floor(Math.random() * 255)}`,
        severity: severities[Math.floor(Math.random() * severities.length)],
        metadata: { 
          simulated: true,
          demo_mode: true,
          random_data: Math.random() 
        }
      };
      
      // Уведомляем всех подписчиков
      this.subscribers.forEach(subscriber => {
        try {
          subscriber(event);
        } catch (error) {
          console.warn('Error in event subscriber:', error);
        }
      });
    }, 3000); // Новое событие каждые 3 секунды

    // Возвращаем функцию отписки
    return () => {
      console.log('🔕 Unsubscribing from security events');
      if (this.updateInterval) {
        clearInterval(this.updateInterval);
      }
      const index = this.subscribers.indexOf(callback);
      if (index > -1) {
        this.subscribers.splice(index, 1);
      }
    };
  }

  async processSecurityEvent(event: any) {
    console.log('🔍 Processing security event:', event.event_type);
    
    // Симуляция обработки
    await new Promise(resolve => setTimeout(resolve, 200));
    
    return {
      ...event,
      anomaly_score: Math.random() * 0.5 + 0.5, // 0.5-1.0
      threat_level: Math.random() > 0.7 ? 'high' : 'medium',
      automated_response: ['logged', 'alerted'],
      processed_at: new Date().toISOString()
    };
  }

  destroy() {
    console.log('🛑 Destroying MockSecurityAnalyticsService');
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    this.subscribers = [];
  }
}

export default MockSecurityAnalyticsService;
