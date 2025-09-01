// Core Threat Detection Components
export { AnomalyDetectionEngine } from './ml/AnomalyDetectionEngine';
export { ThreatIntelligenceEngine } from './ml/ThreatIntelligenceEngine';
export { IncidentResponseManager } from './core/IncidentResponseManager';

// Type exports
export * from './types';

// Imports for internal use
import { IncidentResponseManager } from './core/IncidentResponseManager';
import { AnomalyDetectionEngine } from './ml/AnomalyDetectionEngine';
import { ThreatIntelligenceEngine } from './ml/ThreatIntelligenceEngine';
import { 
  SecurityEvent, 
  AnomalyDetectionResult, 
  IOCMatch, 
  SecurityIncident, 
  SecuritySeverity,
  ThreatDetectionModel,
  IncidentStatus
} from './types';

// Main Threat Detection Service
export class ThreatDetectionService {
  private anomalyEngine: AnomalyDetectionEngine;
  private threatIntelligence: ThreatIntelligenceEngine;
  private incidentManager: IncidentResponseManager;
  private isInitialized: boolean = false;

  constructor(config?: {
    anomaly?: any;
    threatIntel?: any;
    incident?: any;
  }) {
    this.anomalyEngine = new AnomalyDetectionEngine(config?.anomaly);
    this.threatIntelligence = new ThreatIntelligenceEngine(config?.threatIntel);
    this.incidentManager = new IncidentResponseManager(config?.incident);
  }

  /**
   * Инициализация всех компонентов
   */
  async initialize(): Promise<void> {
    console.log('🚀 Initializing Threat Detection Service...');

    try {
      // Initialize threat intelligence feeds
      await this.threatIntelligence.updateFeeds();

      this.isInitialized = true;
      console.log('✅ Threat Detection Service initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Threat Detection Service:', error);
      throw error;
    }
  }

  /**
   * Главный метод для анализа security event
   */
  async analyzeSecurityEvent(event: SecurityEvent): Promise<{
    anomaly: AnomalyDetectionResult | null;
    iocMatches: IOCMatch[];
    incidentCreated: SecurityIncident | null;
  }> {
    if (!this.isInitialized) {
      throw new Error('Threat Detection Service not initialized');
    }

    console.log(`🔍 Analyzing security event: ${event.id}`);

    try {
      // 1. Check for IOC matches
      const iocMatches = await this.threatIntelligence.checkIOCs(event);

      // 2. Run anomaly detection
      let anomaly: AnomalyDetectionResult | null = null;
      try {
        anomaly = await this.anomalyEngine.detectAnomaly(event);
      } catch (error) {
        console.warn('Anomaly detection failed, continuing without anomaly data:', error);
      }

      // 3. Determine if incident should be created
      let incidentCreated: SecurityIncident | null = null;
      const shouldCreateIncident = this.shouldCreateIncident(event, anomaly, iocMatches);

      if (shouldCreateIncident) {
        const { title, description, severity } = this.generateIncidentDetails(event, anomaly, iocMatches);
        
        incidentCreated = await this.incidentManager.createIncident(
          title,
          description,
          severity,
          event,
          anomaly || undefined,
          iocMatches.length > 0 ? iocMatches : undefined
        );
      }

      return {
        anomaly,
        iocMatches,
        incidentCreated
      };

    } catch (error) {
      console.error(`Error analyzing security event ${event.id}:`, error);
      throw error;
    }
  }

  /**
   * Определяет нужно ли создавать инцидент
   */
  private shouldCreateIncident(
    event: SecurityEvent,
    anomaly: AnomalyDetectionResult | null,
    iocMatches: IOCMatch[]
  ): boolean {
    // High/Critical severity events always create incidents
    if (event.severity === 'high' || event.severity === 'critical') {
      return true;
    }

    // IOC matches create incidents
    if (iocMatches.length > 0) {
      return true;
    }

    // High anomaly scores create incidents
    if (anomaly && anomaly.isAnomaly && anomaly.anomalyScore > 0.8) {
      return true;
    }

    // Multiple failed attempts
    if (event.metadata.failedAttempts && event.metadata.failedAttempts > 5) {
      return true;
    }

    return false;
  }

  /**
   * Генерирует детали инцидента
   */
  private generateIncidentDetails(
    event: SecurityEvent,
    anomaly: AnomalyDetectionResult | null,
    iocMatches: IOCMatch[]
  ): { title: string; description: string; severity: SecuritySeverity } {
    let title = `Security Event: ${event.type}`;
    let description = event.description;
    let severity = event.severity;

    // Enhance based on IOC matches
    if (iocMatches.length > 0) {
      const firstMatch = iocMatches[0];
      if (firstMatch) {
        title = `Threat Intelligence Match: ${firstMatch.category}`;
        description = `IOC matches detected: ${iocMatches.map(m => `${m.iocType}:${m.matchedValue}`).join(', ')}. ${description}`;
        
        // Escalate severity if IOC match is high confidence
        const highConfidenceMatch = iocMatches.find(m => m.confidence > 0.8);
        if (highConfidenceMatch && highConfidenceMatch.severity === 'high') {
          severity = 'high';
        }
      }
    }

    // Enhance based on anomaly
    if (anomaly && anomaly.isAnomaly) {
      title = `Anomaly Detected: ${event.type}`;
      description = `${anomaly.explanation}. ${description}`;
      
      // Escalate severity for high anomaly scores
      if (anomaly.anomalyScore > 0.9 && severity !== 'critical') {
        severity = severity === 'low' ? 'medium' : severity === 'medium' ? 'high' : severity;
      }
    }

    return { title, description, severity };
  }

  /**
   * Обучение ML модели
   */
  async trainAnomalyModel(trainingEvents: SecurityEvent[]): Promise<ThreatDetectionModel> {
    return await this.anomalyEngine.trainModel(trainingEvents);
  }

  /**
   * Batch анализ событий
   */
  async analyzeEventsBatch(events: SecurityEvent[]): Promise<{
    anomalies: AnomalyDetectionResult[];
    incidents: SecurityIncident[];
    iocMatches: IOCMatch[];
  }> {
    console.log(`📊 Batch analyzing ${events.length} events`);

    const anomalies: AnomalyDetectionResult[] = [];
    const incidents: SecurityIncident[] = [];
    const allIOCMatches: IOCMatch[] = [];

    for (const event of events) {
      try {
        const result = await this.analyzeSecurityEvent(event);
        
        if (result.anomaly) {
          anomalies.push(result.anomaly);
        }
        
        if (result.incidentCreated) {
          incidents.push(result.incidentCreated);
        }
        
        allIOCMatches.push(...result.iocMatches);
        
      } catch (error) {
        console.error(`Error processing event ${event.id}:`, error);
      }
    }

    console.log(`✅ Batch analysis complete: ${anomalies.length} anomalies, ${incidents.length} incidents, ${allIOCMatches.length} IOC matches`);

    return {
      anomalies,
      incidents,
      iocMatches: allIOCMatches
    };
  }

  /**
   * Получение статистики
   */
  getStatistics(): {
    threatIntel: any;
    incidents: any;
    models: ThreatDetectionModel[];
  } {
    return {
      threatIntel: this.threatIntelligence.getStatistics(),
      incidents: this.incidentManager.getIncidentStatistics(),
      models: this.anomalyEngine.getModelInfo()
    };
  }

  /**
   * Обновление threat intelligence feeds
   */
  async updateThreatIntelligence(): Promise<void> {
    await this.threatIntelligence.updateFeeds();
  }

  /**
   * Получение всех инцидентов
   */
  getAllIncidents(): SecurityIncident[] {
    return this.incidentManager.getAllIncidents();
  }

  /**
   * Получение инцидента по ID
   */
  getIncident(incidentId: string): SecurityIncident | undefined {
    return this.incidentManager.getIncident(incidentId);
  }

  /**
   * Обновление статуса инцидента
   */
  async updateIncidentStatus(
    incidentId: string,
    status: IncidentStatus,
    notes?: string
  ): Promise<SecurityIncident> {
    return await this.incidentManager.updateIncidentStatus(incidentId, status, notes);
  }
}
