// Advanced Threat Detection Types
// ML-based security monitoring and anomaly detection

/**
 * Security Event - базовая структура для всех security events
 */
export interface SecurityEvent {
  id: string;
  timestamp: number;
  type: SecurityEventType;
  severity: SecuritySeverity;
  source: string;
  sourceIP?: string; // Добавлено для совместимости
  userId?: string;
  sessionId?: string;
  ipAddress: string;
  userAgent: string;
  metadata: {
    userAgent?: string;
    referrer?: string;
    targetURL?: string;
    requestCount?: number;
    sessionDuration?: number;
    errorRate?: number;
    responseTime?: number;
    dataSize?: number;
    geoDistance?: number;
    deviceChanged?: boolean;
    privilegeLevel?: string;
    failedAttempts?: number;
    forwardedFor?: string;
    remoteAddr?: string;
    fileHash?: string;
    suspiciousPayload?: boolean;
    hasAttachment?: boolean;
    [key: string]: any;
  };
  riskScore: number; // 0-100, где 100 - максимальный риск
  isBlocked: boolean;
  description: string;
}

/**
 * Типы security events
 */
export type SecurityEventType =
  | 'login_attempt'
  | 'failed_authentication'
  | 'brute_force'
  | 'sql_injection'
  | 'xss_attempt'
  | 'csrf_attack'
  | 'rate_limit_exceeded'
  | 'suspicious_request'
  | 'data_exfiltration'
  | 'privilege_escalation'
  | 'anomalous_behavior'
  | 'malicious_upload'
  | 'bot_detection'
  | 'geo_anomaly'
  | 'session_hijacking'
  | 'authentication'
  | 'web_request'
  | 'email';

/**
 * IOC Types для threat intelligence
 */
export type IOCType = 'ip' | 'domain' | 'hash' | 'url' | 'email' | 'user_agent' | 'file_path';

/**
 * Уровни серьёзности угроз
 */
export type SecuritySeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * ML-based Anomaly Detection Result
 */
export interface AnomalyDetectionResult {
  id: string;
  timestamp: number;
  inputData: number[];
  anomalyScore: number; // 0-1, где 1 - максимальная аномалия
  isAnomaly: boolean;
  confidence: number; // 0-1, уверенность модели
  features: AnomalyFeature[];
  modelVersion: string;
  detectionMethod: 'isolation_forest' | 'autoencoder' | 'statistical' | 'ensemble';
  explanation: string;
  recommendations: string[];
}

/**
 * Feature для anomaly detection
 */
export interface AnomalyFeature {
  name: string;
  value: number;
  importance: number; // 0-1, важность для detection
  normalRange: [number, number];
  isOutlier: boolean;
}

/**
 * Threat Intelligence Data
 */
export interface ThreatIntelligence {
  id: string;
  type: ThreatType;
  indicator: string; // IP, domain, hash, etc.
  severity: SecuritySeverity;
  confidence: number; // 0-1
  source: string;
  lastSeen: number;
  firstSeen: number;
  description: string;
  tags: string[];
  iocs: IndicatorOfCompromise[];
  attribution?: ThreatActor;
}

/**
 * Типы угроз - расширяем для IOC
 */
export type ThreatType =
  | 'malicious_ip'
  | 'malware_hash'
  | 'phishing_domain'
  | 'botnet_c2'
  | 'ransomware'
  | 'apt_activity'
  | 'data_breach'
  | 'vulnerability_exploit'
  | 'ip'
  | 'domain'
  | 'hash'
  | 'url'
  | 'email'
  | 'user_agent'
  | 'file_path';

// Расширяем ContainmentAction status
export type ContainmentStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'active'
  | 'removed';

/**
 * Indicator of Compromise
 */
export interface IndicatorOfCompromise {
  type: 'ip' | 'domain' | 'url' | 'hash' | 'email' | 'filename';
  value: string;
  confidence: number;
  context: string;
}

/**
 * Threat Actor информация
 */
export interface ThreatActor {
  id: string;
  name: string;
  aliases: string[];
  country?: string;
  motivation: 'financial' | 'espionage' | 'hacktivism' | 'unknown';
  capabilities: string[];
  targets: string[];
  ttps: string[]; // Tactics, Techniques, and Procedures
  confidence: number;
  firstSeen: number;
  lastSeen: number;
  references: string[];
}

/**
 * Incident Response данные
 */
export interface SecurityIncident {
  id: string;
  title: string;
  description: string;
  severity: SecuritySeverity;
  status: IncidentStatus;
  createdAt: number;
  updatedAt: number;
  assignedTo?: string;
  events: SecurityEvent[];
  timeline: IncidentTimelineEntry[];
  impact: IncidentImpact;
  response: IncidentResponse;
  containment: ContainmentAction[];
  lessons: string[];
}

/**
 * Статусы инцидентов
 */
export type IncidentStatus =
  | 'new'
  | 'investigating'
  | 'contained'
  | 'eradicated'
  | 'recovery'
  | 'lessons_learned'
  | 'closed';

/**
 * Timeline entry для incident
 */
export interface IncidentTimelineEntry {
  timestamp: number;
  action: string;
  description: string;
  actor: string;
  evidence?: string[];
}

/**
 * Impact анализ инцидента
 */
export interface IncidentImpact {
  scope: 'limited' | 'moderate' | 'extensive' | 'critical';
  affectedSystems: string[];
  affectedUsers: string[]; // изменено с number на string[]
  dataCompromised: boolean;
  estimatedCost: number;
  reputationImpact: 'minimal' | 'moderate' | 'significant' | 'severe';
  confidentiality: number; // 1-10 добавлено
  integrity: number; // 1-10 добавлено
  availability: number; // 1-10 добавлено
  businessImpact: string; // добавлено
}

/**
 * Incident Response actions
 */
export interface IncidentResponse {
  plan: string;
  status: string;
  teamMembers: string[];
  actions: string[];
  timeline: any[];
  containmentActions: ContainmentAction[];
  eradicationActions: string[];
  recoveryActions: string[];
  communicationPlan: CommunicationAction[];
  escalationPath: string[];
  forensicsRequired: boolean;
  legalNotificationRequired: boolean;
}

/**
 * Containment action
 */
export interface ContainmentAction {
  id: string;
  type: string;
  description: string;
  timestamp: number;
  status: ContainmentStatus;
  actor: string;
  target: string;
  duration: number; // в миллисекундах
}

/**
 * Communication action
 */
export interface CommunicationAction {
  type: 'internal' | 'external' | 'customer' | 'media' | 'regulatory';
  message: string;
  audience: string[];
  timestamp: number;
  status: 'draft' | 'sent' | 'acknowledged';
}

/**
 * ML Model для threat detection
 */
export interface ThreatDetectionModel {
  id: string;
  name: string;
  version: string;
  type: 'classification' | 'regression' | 'clustering' | 'anomaly_detection';
  algorithm: 'random_forest' | 'neural_network' | 'svm' | 'isolation_forest' | 'autoencoder';
  features: string[];
  trainingData: {
    samples: number;
    startDate: number;
    endDate: number;
  };
  performance: ModelPerformance;
  isActive: boolean;
  createdAt: number;
  lastTrainedAt: number;
}

/**
 * Performance метрики модели
 */
export interface ModelPerformance {
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  auc: number;
  falsePositiveRate: number;
  falseNegativeRate: number;
  confusionMatrix: number[][];
}

/**
 * Real-time monitoring dashboard data
 */
export interface ThreatDashboardData {
  summary: {
    totalEvents: number;
    activeThreats: number;
    blockedAttacks: number;
    riskScore: number;
  };
  recentEvents: SecurityEvent[];
  anomalies: AnomalyDetectionResult[];
  incidents: SecurityIncident[];
  threatIntelligence: ThreatIntelligence[];
  modelStatus: ThreatDetectionModel[];
  alertRules: AlertRule[];
  systemHealth: {
    detectionEngineStatus: 'healthy' | 'degraded' | 'down';
    mlModelsStatus: 'healthy' | 'degraded' | 'down';
    threatFeedsStatus: 'healthy' | 'degraded' | 'down';
    lastUpdate: number;
  };
}

/**
 * Alert rules для automated response
 */
export interface AlertRule {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  conditions: AlertCondition[];
  actions: AlertAction[];
  cooldownPeriod: number; // minutes
  severity: SecuritySeverity;
  lastTriggered?: number;
  triggerCount: number;
}

/**
 * Alert condition
 */
export interface AlertCondition {
  field: string;
  operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'contains' | 'regex';
  value: any;
  timeWindow: number; // minutes
}

/**
 * Alert action
 */
export interface AlertAction {
  type: 'block_ip' | 'quarantine_user' | 'notify_admin' | 'create_incident' | 'update_firewall';
  parameters: Record<string, any>;
  isEnabled: boolean;
}

/**
 * Behavioral Analysis данные
 */
export interface BehavioralProfile {
  userId: string;
  sessionId: string;
  baseline: BehavioralBaseline;
  currentBehavior: BehavioralMetrics;
  anomalyScore: number;
  riskFactors: RiskFactor[];
  lastUpdated: number;
}

/**
 * Baseline поведения пользователя
 */
export interface BehavioralBaseline {
  avgSessionDuration: number;
  avgRequestsPerSession: number;
  commonLocations: string[];
  commonDevices: string[];
  commonTimezones: string[];
  typicalAccessPatterns: string[];
}

/**
 * Текущие behavioral метрики
 */
export interface BehavioralMetrics {
  sessionDuration: number;
  requestsPerMinute: number;
  currentLocation: string;
  deviceFingerprint: string;
  timezone: string;
  accessPattern: string[];
  suspiciousActions: string[];
}

/**
 * Threat Intelligence данные - обновляем тип
 */
export interface ThreatIntelligence {
  id: string;
  type: ThreatType;
  value: string;
  source: string;
  category: string;
  confidence: number; // 0-1
  severity: SecuritySeverity;
  description: string;
  tags: string[];
  firstSeen: number;
  lastSeen: number;
  references: string[];
  ttl?: number; // Time to live в миллисекундах
  // Добавляем недостающие поля для совместимости
  indicator: string;
  iocs: IndicatorOfCompromise[];
}

/**
 * IOC Match результат
 */
export interface IOCMatch {
  id: string;
  timestamp: number;
  eventId: string;
  iocId: string;
  iocType: IOCType;
  matchedValue: string;
  confidence: number;
  severity: SecuritySeverity;
  category: string;
  source: string;
  description: string;
  tags: string[];
  context: {
    eventType: SecurityEventType;
    sourceIP?: string;
    userAgent?: string;
    userId?: string;
  };
}

/**
 * Attack Pattern (MITRE ATT&CK)
 */
export interface AttackPattern {
  id: string; // MITRE technique ID
  name: string;
  technique: string;
  tactic: string;
  description: string;
  indicators: string[];
  mitigation: string[];
  confidence: number;
  frequency: 'low' | 'medium' | 'high' | 'very_high';
  references: string[];
}

/**
 * Risk factor
 */
export interface RiskFactor {
  type: string;
  description: string;
  score: number; // 0-10
  evidence: string[];
}

/**
 * Configuration для threat detection system
 */
export interface ThreatDetectionConfig {
  models: {
    retrainInterval: number; // hours
    minTrainingSamples: number;
    anomalyThreshold: number; // 0-1
    confidenceThreshold: number; // 0-1
  };
  monitoring: {
    eventRetentionDays: number;
    batchSize: number;
    processingInterval: number; // milliseconds
  };
  alerting: {
    enableRealTime: boolean;
    maxAlertsPerHour: number;
    escalationThresholds: Record<SecuritySeverity, number>;
  };
  threatIntelligence: {
    feedUrls: string[];
    updateInterval: number; // hours
    enableIocBlocking: boolean;
  };
  response: {
    autoBlock: boolean;
    quarantineTimeout: number; // minutes
    notificationChannels: string[];
  };
}
