/**
 * @fileoverview Advanced Audit Logging System
 * Enterprise-grade audit logging with correlation IDs, structured logging,
 * and real-time analysis capabilities
 */

import { EventEmitter } from 'events';
import { performance } from 'perf_hooks';

// Audit Event Types
export enum AuditEventType {
  USER_ACTION = 'user_action',
  SYSTEM_EVENT = 'system_event', 
  SECURITY_EVENT = 'security_event',
  DATA_ACCESS = 'data_access',
  API_REQUEST = 'api_request',
  ERROR_EVENT = 'error_event',
  COMPLIANCE_EVENT = 'compliance_event'
}

// Audit Severity Levels
export enum AuditSeverity {
  LOW = 'low',
  MEDIUM = 'medium', 
  HIGH = 'high',
  CRITICAL = 'critical'
}

// Audit Log Entry Interface
export interface AuditLogEntry {
  id: string;
  timestamp: string;
  correlationId: string;
  userId?: string;
  sessionId?: string;
  eventType: AuditEventType;
  action: string;
  resource?: string;
  severity: AuditSeverity;
  source: string;
  ipAddress?: string;
  userAgent?: string;
  metadata: Record<string, unknown>;
  duration?: number;
  success: boolean;
  errorMessage?: string;
  stackTrace?: string;
  complianceFlags?: string[];
  gdprRelevant?: boolean;
  dataSubjectId?: string;
}

// Audit Logger Configuration
export interface AuditLoggerConfig {
  enableRealTimeAnalysis: boolean;
  bufferSize: number;
  flushIntervalMs: number;
  enableCompression: boolean;
  retentionDays: number;
  enableEncryption: boolean;
  encryptionKey?: string;
  storage: 'memory' | 'file' | 'database' | 'elasticsearch';
  elasticConfig?: {
    host: string;
    index: string;
    username?: string;
    password?: string;
  };
  fileConfig?: {
    path: string;
    maxFileSize: string;
    maxFiles: number;
  };
  alertConfig?: {
    enableAlerts: boolean;
    criticalThreshold: number;
    alertWebhook?: string;
    slackWebhook?: string;
  };
}

// Audit Query Interface
export interface AuditQuery {
  startTime?: Date;
  endTime?: Date;
  userId?: string;
  eventType?: AuditEventType;
  severity?: AuditSeverity;
  action?: string;
  resource?: string;
  success?: boolean;
  correlationId?: string;
  complianceFlags?: string[];
  gdprRelevant?: boolean;
  limit?: number;
  offset?: number;
  sortBy?: keyof AuditLogEntry;
  sortOrder?: 'asc' | 'desc';
}

// Audit Statistics Interface
export interface AuditStatistics {
  totalEvents: number;
  eventsByType: Record<AuditEventType, number>;
  eventsBySeverity: Record<AuditSeverity, number>;
  successRate: number;
  averageDuration: number;
  criticalEventsLast24h: number;
  topUsers: Array<{ userId: string; eventCount: number }>;
  topActions: Array<{ action: string; eventCount: number }>;
  complianceEvents: number;
  gdprEvents: number;
}

// Compliance Event Context
export interface ComplianceContext {
  regulation: 'GDPR' | 'CCPA' | 'HIPAA' | 'SOX' | 'PCI_DSS';
  dataCategory: 'personal' | 'financial' | 'health' | 'sensitive';
  lawfulBasis?: string;
  retentionPeriod?: number;
  dataSubjectRights?: string[];
}

/**
 * Advanced Audit Logger Class
 * Provides enterprise-grade audit logging capabilities
 */
export class AdvancedAuditLogger extends EventEmitter {
  private config: AuditLoggerConfig;
  private buffer: AuditLogEntry[] = [];
  private memoryStorage: AuditLogEntry[] = [];
  private correlationIdMap = new Map<string, string>();
  private statistics: AuditStatistics;
  private flushTimer?: NodeJS.Timeout;

  constructor(config: Partial<AuditLoggerConfig> = {}) {
    super();
    
    this.config = {
      enableRealTimeAnalysis: true,
      bufferSize: 1000,
      flushIntervalMs: 5000,
      enableCompression: false,
      retentionDays: 365,
      enableEncryption: false,
      storage: 'memory',
      alertConfig: {
        enableAlerts: true,
        criticalThreshold: 10
      },
      ...config
    };

    this.statistics = this.initializeStatistics();
    this.setupFlushTimer();
    this.setupEventHandlers();
  }

  /**
   * Log an audit event
   */
  async logEvent(
    eventType: AuditEventType,
    action: string,
    context: Partial<AuditLogEntry> = {},
    complianceContext?: ComplianceContext
  ): Promise<string> {
    const startTime = performance.now();
    
    try {
      const entry: AuditLogEntry = {
        id: this.generateId(),
        timestamp: new Date().toISOString(),
        correlationId: context.correlationId || this.generateCorrelationId(),
        eventType,
        action,
        severity: context.severity || AuditSeverity.MEDIUM,
        source: context.source || 'system',
        metadata: context.metadata || {},
        success: context.success !== false,
        complianceFlags: this.extractComplianceFlags(complianceContext),
        gdprRelevant: complianceContext?.regulation === 'GDPR',
        ...context
      };

      // Add duration if not provided
      if (entry.duration === undefined) {
        entry.duration = performance.now() - startTime;
      }

      // Real-time analysis
      if (this.config.enableRealTimeAnalysis) {
        await this.performRealTimeAnalysis(entry);
      }

      // Add to buffer and memory storage
      this.buffer.push(entry);
      
      // Also store in memory for immediate querying
      if (this.config.storage === 'memory') {
        this.memoryStorage.push(entry);
      }
      
      this.updateStatistics(entry);

      // Check for immediate flush conditions
      if (this.shouldFlushImmediately(entry)) {
        await this.flush();
      }

      // Emit event for subscribers
      this.emit('audit_event', entry);

      return entry.id;
    } catch (error) {
      this.emit('error', new Error(`Audit logging failed: ${error}`));
      throw error;
    }
  }

  /**
   * Log user action with automatic correlation
   */
  async logUserAction(
    userId: string,
    action: string,
    resource?: string,
    metadata: Record<string, unknown> = {},
    request?: any
  ): Promise<string> {
    return this.logEvent(AuditEventType.USER_ACTION, action, {
      userId,
      ...(resource && { resource }),
      severity: AuditSeverity.MEDIUM,
      source: 'user_interface',
      ipAddress: request?.ip,
      userAgent: request?.get?.('User-Agent'),
      sessionId: request?.sessionID,
      metadata: {
        ...metadata,
        httpMethod: request?.method,
        url: request?.originalUrl
      }
    });
  }

  /**
   * Log security event with high priority
   */
  async logSecurityEvent(
    action: string,
    severity: AuditSeverity,
    context: Partial<AuditLogEntry> = {}
  ): Promise<string> {
    return this.logEvent(AuditEventType.SECURITY_EVENT, action, {
      ...context,
      severity,
      source: 'security_system',
      complianceFlags: ['security_incident', ...(context.complianceFlags || [])]
    });
  }

  /**
   * Log GDPR-relevant data access
   */
  async logDataAccess(
    userId: string,
    dataSubjectId: string,
    action: string,
    dataCategory: string,
    lawfulBasis: string,
    metadata: Record<string, unknown> = {}
  ): Promise<string> {
    const complianceContext: ComplianceContext = {
      regulation: 'GDPR',
      dataCategory: dataCategory as any,
      lawfulBasis,
      dataSubjectRights: ['access', 'rectification', 'erasure']
    };

    return this.logEvent(AuditEventType.DATA_ACCESS, action, {
      userId,
      dataSubjectId,
      severity: AuditSeverity.HIGH,
      source: 'data_processor',
      metadata: {
        ...metadata,
        dataCategory,
        lawfulBasis
      }
    }, complianceContext);
  }

  /**
   * Query audit logs with filtering and pagination
   */
  async queryLogs(query: AuditQuery): Promise<{ logs: AuditLogEntry[]; total: number }> {
    try {
      // Use memoryStorage for memory-based storage, buffer for others
      let allLogs = this.config.storage === 'memory' 
        ? [...this.memoryStorage, ...this.buffer] 
        : this.buffer;

      // Apply filters
      if (query.startTime) {
        allLogs = allLogs.filter(log => 
          new Date(log.timestamp) >= query.startTime!
        );
      }

      if (query.endTime) {
        allLogs = allLogs.filter(log => 
          new Date(log.timestamp) <= query.endTime!
        );
      }

      if (query.userId) {
        allLogs = allLogs.filter(log => log.userId === query.userId);
      }

      if (query.eventType) {
        allLogs = allLogs.filter(log => log.eventType === query.eventType);
      }

      if (query.severity) {
        allLogs = allLogs.filter(log => log.severity === query.severity);
      }

      if (query.action) {
        allLogs = allLogs.filter(log => 
          log.action.toLowerCase().includes(query.action!.toLowerCase())
        );
      }

      if (query.success !== undefined) {
        allLogs = allLogs.filter(log => log.success === query.success);
      }

      if (query.correlationId) {
        allLogs = allLogs.filter(log => log.correlationId === query.correlationId);
      }

      if (query.gdprRelevant !== undefined) {
        allLogs = allLogs.filter(log => log.gdprRelevant === query.gdprRelevant);
      }

      // Sort
      if (query.sortBy) {
        allLogs.sort((a, b) => {
          const aVal = a[query.sortBy!];
          const bVal = b[query.sortBy!];
          
          if (aVal === undefined && bVal === undefined) return 0;
          if (aVal === undefined) return 1;
          if (bVal === undefined) return -1;
          
          const order = query.sortOrder === 'desc' ? -1 : 1;
          
          if (aVal < bVal) return -1 * order;
          if (aVal > bVal) return 1 * order;
          return 0;
        });
      }

      const total = allLogs.length;

      // Pagination
      const offset = query.offset || 0;
      const limit = query.limit || 100;
      const paginatedLogs = allLogs.slice(offset, offset + limit);

      return { logs: paginatedLogs, total };
    } catch (error) {
      this.emit('error', new Error(`Query failed: ${error}`));
      throw error;
    }
  }

  /**
   * Get audit statistics
   */
  getStatistics(): AuditStatistics {
    return { ...this.statistics };
  }

  /**
   * Generate compliance report
   */
  async generateComplianceReport(
    regulation: 'GDPR' | 'CCPA' | 'HIPAA' | 'SOX' | 'PCI_DSS',
    startDate: Date,
    endDate: Date
  ): Promise<any> {
    const query: AuditQuery = {
      startTime: startDate,
      endTime: endDate,
      complianceFlags: [regulation.toLowerCase()]
    };

    const { logs } = await this.queryLogs(query);

    return {
      regulation,
      period: { start: startDate, end: endDate },
      totalEvents: logs.length,
      dataSubjects: [...new Set(logs.map(log => log.dataSubjectId).filter(Boolean))].length,
      securityIncidents: logs.filter(log => log.eventType === AuditEventType.SECURITY_EVENT).length,
      dataAccesses: logs.filter(log => log.eventType === AuditEventType.DATA_ACCESS).length,
      failures: logs.filter(log => !log.success).length,
      criticalEvents: logs.filter(log => log.severity === AuditSeverity.CRITICAL).length,
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * Export audit logs
   */
  async exportLogs(
    query: AuditQuery,
    format: 'json' | 'csv' | 'xml' = 'json'
  ): Promise<string> {
    const { logs } = await this.queryLogs(query);

    switch (format) {
      case 'json':
        return JSON.stringify(logs, null, 2);
      case 'csv':
        return this.convertToCSV(logs);
      case 'xml':
        return this.convertToXML(logs);
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  /**
   * Flush buffer to storage
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    try {
      const logsToFlush = [...this.buffer];
      this.buffer = [];

      // Process based on storage type
      switch (this.config.storage) {
        case 'memory':
          // Keep in memory (for testing)
          break;
        case 'file':
          await this.writeToFile(logsToFlush);
          break;
        case 'database':
          await this.writeToDatabase(logsToFlush);
          break;
        case 'elasticsearch':
          await this.writeToElasticsearch(logsToFlush);
          break;
      }

      this.emit('logs_flushed', logsToFlush.length);
    } catch (error) {
      this.emit('error', new Error(`Flush failed: ${error}`));
      // Re-add logs to buffer for retry
      this.buffer.unshift(...this.buffer);
    }
  }

  /**
   * Set correlation ID for request tracking
   */
  setCorrelationId(key: string, correlationId: string): void {
    this.correlationIdMap.set(key, correlationId);
  }

  /**
   * Get correlation ID
   */
  getCorrelationId(key: string): string | undefined {
    return this.correlationIdMap.get(key);
  }

  /**
   * Cleanup old correlation IDs
   */
  cleanupCorrelationIds(): void {
    // Keep only recent correlation IDs (last 1 hour)
    const cutoff = Date.now() - (60 * 60 * 1000);
    for (const [key] of this.correlationIdMap) {
      if (parseInt(key) < cutoff) {
        this.correlationIdMap.delete(key);
      }
    }
  }

  /**
   * Destroy logger and cleanup resources
   */
  async destroy(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    await this.flush();
    this.removeAllListeners();
    this.correlationIdMap.clear();
    
    // Clear all stored data
    this.buffer = [];
    this.memoryStorage = [];
    this.statistics = this.initializeStatistics();
  }

  // Private methods
  private initializeStatistics(): AuditStatistics {
    return {
      totalEvents: 0,
      eventsByType: {
        [AuditEventType.USER_ACTION]: 0,
        [AuditEventType.SYSTEM_EVENT]: 0,
        [AuditEventType.SECURITY_EVENT]: 0,
        [AuditEventType.DATA_ACCESS]: 0,
        [AuditEventType.API_REQUEST]: 0,
        [AuditEventType.ERROR_EVENT]: 0,
        [AuditEventType.COMPLIANCE_EVENT]: 0
      },
      eventsBySeverity: {
        [AuditSeverity.LOW]: 0,
        [AuditSeverity.MEDIUM]: 0,
        [AuditSeverity.HIGH]: 0,
        [AuditSeverity.CRITICAL]: 0
      },
      successRate: 100,
      averageDuration: 0,
      criticalEventsLast24h: 0,
      topUsers: [],
      topActions: [],
      complianceEvents: 0,
      gdprEvents: 0
    };
  }

  private setupFlushTimer(): void {
    this.flushTimer = setInterval(async () => {
      await this.flush();
    }, this.config.flushIntervalMs);
  }

  private setupEventHandlers(): void {
    this.on('error', (error) => {
      console.error('Audit Logger Error:', error);
    });
  }

  private generateId(): string {
    return `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateCorrelationId(): string {
    return `corr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private extractComplianceFlags(context?: ComplianceContext): string[] {
    if (!context) return [];
    
    const flags = [context.regulation.toLowerCase()];
    if (context.dataCategory) flags.push(`data_${context.dataCategory}`);
    if (context.lawfulBasis) flags.push(`basis_${context.lawfulBasis}`);
    
    return flags;
  }

  private async performRealTimeAnalysis(entry: AuditLogEntry): Promise<void> {
    // Check for security anomalies
    if (entry.eventType === AuditEventType.SECURITY_EVENT && 
        entry.severity === AuditSeverity.CRITICAL) {
      this.emit('critical_security_event', entry);
      
      if (this.config.alertConfig?.enableAlerts) {
        await this.sendAlert(entry);
      }
    }

    // Check for GDPR violations
    if (entry.gdprRelevant && entry.severity === AuditSeverity.HIGH) {
      this.emit('gdpr_concern', entry);
    }

    // Check for repeated failures
    if (!entry.success) {
      const recentFailures = this.buffer.filter(log => 
        log.userId === entry.userId && 
        !log.success && 
        new Date(log.timestamp) > new Date(Date.now() - 5 * 60 * 1000) // Last 5 minutes
      ).length;

      if (recentFailures >= 5) {
        this.emit('repeated_failures', entry);
      }
    }
  }

  private shouldFlushImmediately(entry: AuditLogEntry): boolean {
    return (
      entry.severity === AuditSeverity.CRITICAL ||
      this.buffer.length >= this.config.bufferSize ||
      entry.eventType === AuditEventType.SECURITY_EVENT
    );
  }

  private updateStatistics(entry: AuditLogEntry): void {
    this.statistics.totalEvents++;
    this.statistics.eventsByType[entry.eventType]++;
    this.statistics.eventsBySeverity[entry.severity]++;

    if (entry.success) {
      this.statistics.successRate = 
        (this.statistics.successRate * (this.statistics.totalEvents - 1) + 100) / 
        this.statistics.totalEvents;
    } else {
      this.statistics.successRate = 
        (this.statistics.successRate * (this.statistics.totalEvents - 1)) / 
        this.statistics.totalEvents;
    }

    if (entry.duration) {
      this.statistics.averageDuration = 
        (this.statistics.averageDuration * (this.statistics.totalEvents - 1) + entry.duration) / 
        this.statistics.totalEvents;
    }

    if (entry.severity === AuditSeverity.CRITICAL) {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      if (new Date(entry.timestamp) > yesterday) {
        this.statistics.criticalEventsLast24h++;
      }
    }

    if (entry.complianceFlags?.length) {
      this.statistics.complianceEvents++;
    }

    if (entry.gdprRelevant) {
      this.statistics.gdprEvents++;
    }
  }

  private async sendAlert(entry: AuditLogEntry): Promise<void> {
    // Implement alert sending logic (webhook, Slack, email, etc.)
    console.warn('CRITICAL AUDIT EVENT:', entry);
  }

  private async writeToFile(logs: AuditLogEntry[]): Promise<void> {
    // File writing implementation
    console.log(`Would write ${logs.length} logs to file`);
  }

  private async writeToDatabase(logs: AuditLogEntry[]): Promise<void> {
    // Database writing implementation
    console.log(`Would write ${logs.length} logs to database`);
  }

  private async writeToElasticsearch(logs: AuditLogEntry[]): Promise<void> {
    // Elasticsearch writing implementation
    console.log(`Would write ${logs.length} logs to Elasticsearch`);
  }

  private convertToCSV(logs: AuditLogEntry[]): string {
    if (logs.length === 0) return '';

    const firstLog = logs[0];
    if (!firstLog) return '';

    const headers = Object.keys(firstLog).join(',');
    const rows = logs.map(log => 
      Object.values(log).map(val => 
        typeof val === 'object' ? JSON.stringify(val) : String(val)
      ).join(',')
    );

    return [headers, ...rows].join('\n');
  }

  private convertToXML(logs: AuditLogEntry[]): string {
    const xmlEntries = logs.map(log => {
      const entries = Object.entries(log).map(([key, value]) => 
        `<${key}>${typeof value === 'object' ? JSON.stringify(value) : value}</${key}>`
      ).join('');
      return `<entry>${entries}</entry>`;
    }).join('');

    return `<?xml version="1.0" encoding="UTF-8"?><audit_logs>${xmlEntries}</audit_logs>`;
  }
}

/**
 * Default audit logger instance
 */
export const defaultAuditLogger = new AdvancedAuditLogger();

/**
 * Audit Logger Middleware for Express.js
 */
export function createAuditMiddleware(
  logger: AdvancedAuditLogger = defaultAuditLogger,
  options: {
    logRequests?: boolean;
    logResponses?: boolean;
    excludePaths?: string[];
    sensitiveHeaders?: string[];
  } = {}
) {
  const {
    logRequests = true,
    logResponses = false,
    excludePaths = ['/health', '/metrics'],
    sensitiveHeaders = ['authorization', 'cookie', 'x-api-key']
  } = options;

  function sanitizeHeaders(headers: any, sensitiveHeaders: string[]): any {
    const sanitized = { ...headers };
    sensitiveHeaders.forEach(header => {
      if (sanitized[header]) {
        sanitized[header] = '[REDACTED]';
      }
    });
    return sanitized;
  }

  return (req: any, res: any, next: any) => {
    const startTime = performance.now();
    const correlationId = req.get('X-Correlation-ID') || `corr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Set correlation ID for request tracking
    logger.setCorrelationId(req.sessionID || req.ip, correlationId);
    req.correlationId = correlationId;

    // Skip excluded paths
    if (excludePaths.some(path => req.path.startsWith(path))) {
      return next();
    }

    if (logRequests) {
      logger.logEvent(AuditEventType.API_REQUEST, `${req.method} ${req.path}`, {
        correlationId,
        userId: req.user?.id,
        sessionId: req.sessionID,
        source: 'api_middleware',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        severity: AuditSeverity.LOW,
        metadata: {
          method: req.method,
          url: req.originalUrl,
          query: req.query,
          headers: sanitizeHeaders(req.headers, sensitiveHeaders)
        }
      });
    }

    if (logResponses) {
      const originalSend = res.send;
      res.send = function(data: any) {
        const duration = performance.now() - startTime;
        
        logger.logEvent(AuditEventType.API_REQUEST, `${req.method} ${req.path} - Response`, {
          correlationId,
          userId: req.user?.id,
          sessionId: req.sessionID,
          source: 'api_middleware',
          severity: res.statusCode >= 400 ? AuditSeverity.MEDIUM : AuditSeverity.LOW,
          success: res.statusCode < 400,
          duration,
          metadata: {
            statusCode: res.statusCode,
            contentLength: data?.length || 0
          }
        });

        return originalSend.call(this, data);
      };
    }

    next();
  };
}

/**
 * Audit Logger Utilities
 */
export class AuditLoggerUtils {
  /**
   * Create audit logger with predefined configurations
   */
  static createProductionLogger(): AdvancedAuditLogger {
    return new AdvancedAuditLogger({
      enableRealTimeAnalysis: true,
      bufferSize: 1000,
      flushIntervalMs: 5000,
      enableCompression: true,
      retentionDays: 2555, // 7 years for compliance
      enableEncryption: true,
      storage: 'elasticsearch',
      alertConfig: {
        enableAlerts: true,
        criticalThreshold: 5
      }
    });
  }

  /**
   * Create audit logger for development
   */
  static createDevelopmentLogger(): AdvancedAuditLogger {
    return new AdvancedAuditLogger({
      enableRealTimeAnalysis: false,
      bufferSize: 100,
      flushIntervalMs: 10000,
      enableCompression: false,
      retentionDays: 30,
      enableEncryption: false,
      storage: 'memory',
      alertConfig: {
        enableAlerts: false,
        criticalThreshold: 10
      }
    });
  }

  /**
   * Create GDPR-compliant audit logger
   */
  static createGDPRLogger(): AdvancedAuditLogger {
    return new AdvancedAuditLogger({
      enableRealTimeAnalysis: true,
      bufferSize: 500,
      flushIntervalMs: 3000,
      enableCompression: true,
      retentionDays: 2555,
      enableEncryption: true,
      storage: 'database',
      alertConfig: {
        enableAlerts: true,
        criticalThreshold: 1 // Very strict for GDPR
      }
    });
  }
}
