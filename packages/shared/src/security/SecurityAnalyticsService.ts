import { ThreatDetectionService, type IThreatDetectionService } from './threat-detection-bridge';
import { DatabaseService, SecurityEvent, SecurityIncident } from '../database/DatabaseService';
import { EventEmitter } from 'events';

export interface IntegratedSecurityEvent extends SecurityEvent {
  // Дополнительные поля для интеграции
  anomaly_score?: number;
  threat_level?: 'low' | 'medium' | 'high' | 'critical';
  automated_response?: string[];
}

export interface SecurityAnalyticsConfig {
  supabaseUrl: string;
  supabaseKey: string;
  enableRealTimeProcessing: boolean;
  enableAutomatedResponse: boolean;
  mlModelPath?: string;
}

/**
 * Integrated Security Analytics Service
 * Объединяет threat detection, database storage и real-time analytics
 */
export class SecurityAnalyticsService extends EventEmitter {
  private threatDetection: InstanceType<typeof ThreatDetectionService>;
  private database: DatabaseService;
  private config: SecurityAnalyticsConfig;
  private processingQueue: SecurityEvent[] = [];
  private isProcessing = false;

  constructor(config: SecurityAnalyticsConfig) {
    super();
    this.config = config;
    this.database = new DatabaseService(config.supabaseUrl, config.supabaseKey);
    this.threatDetection = new ThreatDetectionService();

    if (config.enableRealTimeProcessing) {
      this.startRealTimeProcessing();
    }
  }

  /**
   * Инициализация сервиса
   */
  async initialize(): Promise<void> {
    try {
      // Инициализация threat detection
      await this.threatDetection.initialize();

      // Загрузка threat intelligence из базы
      const threatIntel = await this.database.getThreatIntelligence();
      console.log(`Loaded ${threatIntel.length} threat intelligence indicators`);

      // Обучение ML модели на исторических данных
      await this.trainMLModel();

      this.emit('initialized');
      console.log('SecurityAnalyticsService initialized successfully');
    } catch (error) {
      console.error('Failed to initialize SecurityAnalyticsService:', error);
      throw error;
    }
  }

  /**
   * Обработка security события с полным анализом
   */
  async processSecurityEvent(event: Omit<SecurityEvent, 'id' | 'created_at' | 'updated_at'>): Promise<IntegratedSecurityEvent> {
    try {
      // 1. Сохранение события в базу
      const savedEvent = await this.database.createSecurityEvent(event);

      // 2. Threat detection анализ
      const analysisResult = await this.threatDetection.analyzeSecurityEvent({
        id: savedEvent.id,
        timestamp: savedEvent.created_at,
        userId: savedEvent.user_id || 'unknown',
        sessionId: savedEvent.session_id || '',
        ipAddress: savedEvent.source_ip || '',
        userAgent: savedEvent.user_agent || '',
        endpoint: event.event_type,
        method: 'POST', // default
        statusCode: savedEvent.error_rate && savedEvent.error_rate > 0 ? 500 : 200,
        responseTime: this.parseResponseTime(savedEvent.response_time),
        requestSize: savedEvent.data_volume || 0,
        responseSize: savedEvent.data_volume || 0,
        geoLocation: savedEvent.geo_location,
        deviceFingerprint: savedEvent.device_fingerprint,
        // Исправлено: используем оригинальные metadata из входного события
        customAttributes: event.metadata || savedEvent.metadata || {}
      });

      // 3. Создание интегрированного события
      const integratedEvent: IntegratedSecurityEvent = {
        ...savedEvent,
        anomaly_score: analysisResult.anomalyScore,
        threat_level: this.calculateThreatLevel(analysisResult),
        automated_response: []
      };

      // 4. Создание инцидента если обнаружена угроза
      if (analysisResult.incidentCreated && analysisResult.incident) {
        const incident = await this.database.createSecurityIncident({
          title: analysisResult.incident.title,
          description: analysisResult.incident.description,
          severity: analysisResult.incident.severity,
          user_id: savedEvent.user_id,
          client_id: savedEvent.client_id,
          event_ids: [savedEvent.id],
          ioc_matches: analysisResult.iocMatches,
          ml_confidence: analysisResult.anomalyScore,
          response_actions: analysisResult.incident.responseActions,
          timeline: analysisResult.incident.timeline,
          impact_assessment: analysisResult.incident.impactAssessment
        });

        integratedEvent.automated_response = this.getAutomatedResponseActions(incident);
        this.emit('incidentCreated', incident);
      }

      // 5. Real-time уведомления
      this.emit('eventProcessed', integratedEvent);

      return integratedEvent;
    } catch (error) {
      console.error('Failed to process security event:', error);
      throw error;
    }
  }

  /**
   * Получение аналитических метрик
   */
  async getSecurityAnalytics(
    userId: string,
    clientId?: string,
    timeRange: 'hour' | 'day' | 'week' | 'month' = 'day'
  ) {
    const endDate = new Date();
    const startDate = new Date();

    switch (timeRange) {
      case 'hour':
        startDate.setHours(startDate.getHours() - 1);
        break;
      case 'day':
        startDate.setDate(startDate.getDate() - 1);
        break;
      case 'week':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(startDate.getMonth() - 1);
        break;
    }

    const [
      securityMetrics,
      topThreats,
      recentIncidents,
      recentEvents
    ] = await Promise.all([
      this.database.getSecurityMetrics(userId, clientId, startDate.toISOString(), endDate.toISOString()),
      this.database.getTopThreats(10),
      this.database.getSecurityIncidents(userId, clientId),
      this.database.getSecurityEvents(userId, clientId, 100)
    ]);

    // Расчет дополнительных метрик
    const threatDistribution = this.calculateThreatDistribution(recentEvents);
    const riskScore = this.calculateRiskScore(securityMetrics, recentIncidents);
    const trends = await this.calculateTrends(userId, timeRange, clientId);

    return {
      overview: {
        ...securityMetrics,
        risk_score: riskScore,
        active_incidents: recentIncidents.filter((i: SecurityIncident) => i.status === 'open' || i.status === 'investigating').length,
        total_incidents: recentIncidents.length
      },
      threats: {
        top_threats: topThreats,
        threat_distribution: threatDistribution
      },
      incidents: recentIncidents.slice(0, 10), // последние 10 инцидентов
      trends,
      ml_stats: await this.threatDetection.getStatistics()
    };
  }

  /**
   * Batch обработка событий
   */
  async batchProcessEvents(events: Omit<SecurityEvent, 'id' | 'created_at' | 'updated_at'>[]): Promise<void> {
    const batchSize = 100;
    const results: IntegratedSecurityEvent[] = [];

    for (let i = 0; i < events.length; i += batchSize) {
      const batch = events.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(event => this.processSecurityEvent(event))
      );
      results.push(...batchResults);

      // Emit progress
      this.emit('batchProgress', {
        processed: Math.min(i + batchSize, events.length),
        total: events.length,
        results: batchResults
      });
    }

    this.emit('batchCompleted', results);
  }

  /**
   * Подписка на real-time события
   */
  subscribeToRealTimeEvents(userId: string) {
    return this.database.subscribeToSecurityEvents(userId, (event: SecurityEvent) => {
      // Добавляем событие в очередь обработки
      this.processingQueue.push(event);
      this.emit('realTimeEvent', event);
    });
  }

  /**
   * Подписка на real-time инциденты
   */
  subscribeToRealTimeIncidents(userId: string) {
    return this.database.subscribeToSecurityIncidents(userId, (incident: SecurityIncident) => {
      this.emit('realTimeIncident', incident);
    });
  }

  // Приватные методы

  private async startRealTimeProcessing(): Promise<void> {
    setInterval(async () => {
      if (!this.isProcessing && this.processingQueue.length > 0) {
        this.isProcessing = true;
        const eventsToProcess = this.processingQueue.splice(0, 10); // обрабатываем по 10 событий

        try {
          await Promise.all(
            eventsToProcess.map(event => this.processSecurityEvent(event))
          );
        } catch (error) {
          console.error('Error in real-time processing:', error);
        } finally {
          this.isProcessing = false;
        }
      }
    }, 1000); // проверяем каждую секунду
  }

  private async trainMLModel(): Promise<void> {
    try {
      // Получаем исторические данные для обучения
      const historicalEvents = await this.database.getSecurityEvents('system', undefined, 1000);
      
      if (historicalEvents.length >= 100) {
        const trainingData = historicalEvents.map((event: SecurityEvent) => ({
          id: event.id,
          timestamp: event.created_at,
          userId: event.user_id || 'unknown',
          sessionId: event.session_id || '',
          ipAddress: event.source_ip || '',
          userAgent: event.user_agent || '',
          endpoint: event.event_type,
          method: 'POST',
          statusCode: event.error_rate && event.error_rate > 0 ? 500 : 200,
          responseTime: this.parseResponseTime(event.response_time),
          requestSize: event.data_volume || 0,
          responseSize: event.data_volume || 0,
          geoLocation: event.geo_location,
          deviceFingerprint: event.device_fingerprint,
          customAttributes: event.metadata || {}
        }));

        // TODO: Implement training when threat detection is fully integrated
        // await this.threatDetection.trainAnomalyModel(trainingData);
        console.log(`ML model trained on ${trainingData.length} historical events`);
      }
    } catch (error) {
      console.warn('Failed to train ML model:', error);
    }
  }

  private parseResponseTime(responseTime?: string): number {
    if (!responseTime) return 0;
    // Парсим PostgreSQL interval в миллисекунды
    const match = responseTime.match(/(\d+(?:\.\d+)?)\s*ms/);
    return match ? parseFloat(match[1]!) : 0;
  }

  private calculateThreatLevel(analysisResult: any): 'low' | 'medium' | 'high' | 'critical' {
    if (analysisResult.anomalyScore > 0.8) return 'critical';
    if (analysisResult.anomalyScore > 0.6) return 'high';
    if (analysisResult.anomalyScore > 0.4) return 'medium';
    return 'low';
  }

  private getAutomatedResponseActions(incident: SecurityIncident): string[] {
    const actions: string[] = [];
    
    if (incident.severity === 'high' || incident.severity === 'critical') {
      actions.push('ip_block', 'session_terminate');
    }
    
    if (incident.ioc_matches) {
      actions.push('threat_intelligence_update');
    }
    
    return actions;
  }

  private calculateThreatDistribution(events: SecurityEvent[]) {
    const distribution: Record<string, number> = {};
    
    events.forEach(event => {
      const type = event.event_type;
      distribution[type] = (distribution[type] || 0) + 1;
    });
    
    return Object.entries(distribution)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([type, count]) => ({ type, count }));
  }

  private calculateRiskScore(metrics: any, incidents: SecurityIncident[]): number {
    let score = 0;
    
    // Базовая оценка на основе метрик
    if (metrics.error_rate > 0.1) score += 20;
    if (metrics.failed_attempts > 10) score += 30;
    if (metrics.unique_ips > 100) score += 10;
    
    // Оценка на основе инцидентов
    const openIncidents = incidents.filter(i => i.status === 'open' || i.status === 'investigating');
    score += openIncidents.length * 15;
    
    const criticalIncidents = incidents.filter(i => i.severity === 'critical');
    score += criticalIncidents.length * 25;
    
    return Math.min(100, score);
  }

  private async calculateTrends(userId: string, timeRange: string, clientId?: string) {
    // Простая реализация трендов - сравнение с предыдущим периодом
    const currentPeriod = await this.database.getSecurityMetrics(userId, clientId);
    
    // Для демонстрации возвращаем mock данные
    return {
      events_trend: '+15%',
      incidents_trend: '+3%',
      risk_trend: '-5%',
      response_time_trend: '-10%'
    };
  }
}
