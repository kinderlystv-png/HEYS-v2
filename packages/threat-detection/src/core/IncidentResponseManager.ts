import {
  AnomalyDetectionResult,
  ContainmentStatus,
  IOCMatch,
  IncidentImpact,
  IncidentResponse,
  IncidentStatus,
  SecurityEvent,
  SecurityIncident,
  SecuritySeverity,
} from '../types';

/**
 * Incident Response Manager
 * Автоматизация incident response и координация security team
 */
export class IncidentResponseManager {
  private incidents: Map<string, SecurityIncident> = new Map();
  private escalationRules: Map<SecuritySeverity, number> = new Map();
  private automatedActions: Map<string, Function> = new Map();
  private responseTeam: string[] = [];

  constructor(
    private config: {
      autoEscalationEnabled?: boolean;
      escalationTimeouts?: Record<SecuritySeverity, number>;
      enableAutomatedActions?: boolean;
      slackIntegration?: boolean;
    } = {},
  ) {
    this.initializeEscalationRules();
    this.initializeAutomatedActions();
    this.initializeResponseTeam();
  }

  /**
   * Инициализация escalation rules
   */
  private initializeEscalationRules(): void {
    // Время в минутах для эскалации по severity
    this.escalationRules.set('low', 240); // 4 часа
    this.escalationRules.set('medium', 120); // 2 часа
    this.escalationRules.set('high', 30); // 30 минут
    this.escalationRules.set('critical', 15); // 15 минут

    console.log('⏰ Escalation rules initialized');
  }

  /**
   * Инициализация automated actions
   */
  private initializeAutomatedActions(): void {
    this.automatedActions.set('block_ip', this.blockIPAddress.bind(this));
    this.automatedActions.set('disable_user', this.disableUser.bind(this));
    this.automatedActions.set('isolate_session', this.isolateSession.bind(this));
    this.automatedActions.set('quarantine_file', this.quarantineFile.bind(this));
    this.automatedActions.set('reset_password', this.resetPassword.bind(this));
    this.automatedActions.set('notify_team', this.notifySecurityTeam.bind(this));

    console.log('🤖 Automated actions initialized');
  }

  /**
   * Инициализация response team
   */
  private initializeResponseTeam(): void {
    this.responseTeam = [
      'security_analyst_1',
      'security_analyst_2',
      'incident_commander',
      'threat_hunter',
      'forensics_specialist',
    ];

    console.log(`👥 Response team initialized with ${this.responseTeam.length} members`);
  }

  /**
   * Создание нового инцидента
   */
  async createIncident(
    title: string,
    description: string,
    severity: SecuritySeverity,
    triggerEvent: SecurityEvent,
    anomalyResult?: AnomalyDetectionResult,
    iocMatches?: IOCMatch[],
  ): Promise<SecurityIncident> {
    const incidentId = `incident_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const incident: SecurityIncident = {
      id: incidentId,
      title,
      description,
      severity,
      status: 'new',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      assignedTo: this.getNextAvailableAnalyst(),
      events: [triggerEvent],
      timeline: [
        {
          timestamp: Date.now(),
          action: 'incident_created',
          description: `Incident created: ${title}`,
          actor: 'system',
          evidence: [],
        },
      ],
      impact: this.assessImpact(severity, triggerEvent),
      response: this.initializeResponse(severity),
      containment: [],
      lessons: [],
    };

    // Добавляем anomaly data если есть
    if (anomalyResult) {
      incident.timeline.push({
        timestamp: Date.now(),
        action: 'anomaly_detected',
        description: `Anomaly detected: ${anomalyResult.explanation}`,
        actor: 'ml_engine',
        evidence: [`anomaly_score: ${anomalyResult.anomalyScore}`],
      });
    }

    // Добавляем IOC matches если есть
    if (iocMatches && iocMatches.length > 0) {
      incident.timeline.push({
        timestamp: Date.now(),
        action: 'ioc_matches_found',
        description: `${iocMatches.length} IOC matches found`,
        actor: 'threat_intelligence',
        evidence: iocMatches.map((match) => `${match.iocType}:${match.matchedValue}`),
      });
    }

    this.incidents.set(incidentId, incident);

    // Automated initial response
    await this.triggerInitialResponse(incident);

    console.log(`🚨 New incident created: ${incidentId} (${severity})`);
    return incident;
  }

  /**
   * Обновление статуса инцидента
   */
  async updateIncidentStatus(
    incidentId: string,
    status: IncidentStatus,
    notes?: string,
    actor?: string,
  ): Promise<SecurityIncident> {
    const incident = this.incidents.get(incidentId);
    if (!incident) {
      throw new Error(`Incident ${incidentId} not found`);
    }

    const previousStatus = incident.status;
    incident.status = status;
    incident.updatedAt = Date.now();

    // Добавляем в timeline
    incident.timeline.push({
      timestamp: Date.now(),
      action: 'status_updated',
      description: `Status changed from ${previousStatus} to ${status}${notes ? ': ' + notes : ''}`,
      actor: actor || 'system',
      evidence: [],
    });

    // Trigger actions based on status change
    await this.handleStatusChange(incident, previousStatus, status);

    console.log(`📝 Incident ${incidentId} status updated: ${previousStatus} → ${status}`);
    return incident;
  }

  /**
   * Добавление события к инциденту
   */
  async addEventToIncident(incidentId: string, event: SecurityEvent): Promise<void> {
    const incident = this.incidents.get(incidentId);
    if (!incident) {
      throw new Error(`Incident ${incidentId} not found`);
    }

    incident.events.push(event);
    incident.updatedAt = Date.now();

    incident.timeline.push({
      timestamp: Date.now(),
      action: 'event_added',
      description: `Related event added: ${event.type} from ${event.source}`,
      actor: 'correlation_engine',
      evidence: [event.id],
    });

    // Re-assess severity if needed
    const newSeverity = this.recalculateSeverity(incident);
    if (newSeverity !== incident.severity) {
      await this.escalateIncident(incident, newSeverity);
    }

    console.log(`🔗 Event ${event.id} added to incident ${incidentId}`);
  }

  /**
   * Initial response triggers
   */
  private async triggerInitialResponse(incident: SecurityIncident): Promise<void> {
    const actions: string[] = [];

    // Determine actions based on severity and event type
    switch (incident.severity) {
      case 'critical':
        actions.push('notify_team', 'isolate_session');
        if (incident.events[0]?.type === 'brute_force') {
          actions.push('block_ip');
        }
        break;
      case 'high':
        actions.push('notify_team');
        if (incident.events[0]?.type === 'malicious_upload') {
          actions.push('quarantine_file');
        }
        break;
      case 'medium':
        if (incident.events[0]?.type === 'failed_authentication') {
          actions.push('reset_password');
        }
        break;
    }

    // Execute automated actions
    for (const actionName of actions) {
      try {
        const action = this.automatedActions.get(actionName);
        if (action) {
          await action(incident);

          incident.timeline.push({
            timestamp: Date.now(),
            action: 'automated_action',
            description: `Executed automated action: ${actionName}`,
            actor: 'automation',
            evidence: [],
          });
        }
      } catch (error) {
        console.error(`Failed to execute action ${actionName}:`, error);
      }
    }
  }

  /**
   * Automated Actions
   */
  private async blockIPAddress(incident: SecurityIncident): Promise<void> {
    const sourceIP = incident.events[0]?.sourceIP || incident.events[0]?.ipAddress;
    if (sourceIP) {
      console.log(`🛡️ Blocking IP address: ${sourceIP}`);

      incident.containment.push({
        id: `block_ip_${Date.now()}`,
        type: 'network_isolation',
        description: `Blocked IP address: ${sourceIP}`,
        timestamp: Date.now(),
        status: 'in_progress' as ContainmentStatus,
        actor: 'automation',
        target: sourceIP,
        duration: 24 * 60 * 60 * 1000, // 24 hours
      });
    }
  }

  private async disableUser(incident: SecurityIncident): Promise<void> {
    const userId = incident.events[0]?.userId;
    if (userId) {
      console.log(`👤 Disabling user account: ${userId}`);

      incident.containment.push({
        id: `disable_user_${Date.now()}`,
        type: 'account_disable',
        description: `Disabled user account: ${userId}`,
        timestamp: Date.now(),
        status: 'active',
        actor: 'automation',
        target: userId,
        duration: 4 * 60 * 60 * 1000, // 4 hours
      });
    }
  }

  private async isolateSession(incident: SecurityIncident): Promise<void> {
    const sessionId = incident.events[0]?.sessionId;
    if (sessionId) {
      console.log(`🔒 Isolating session: ${sessionId}`);

      incident.containment.push({
        id: `isolate_session_${Date.now()}`,
        type: 'session_isolation',
        description: `Isolated session: ${sessionId}`,
        timestamp: Date.now(),
        status: 'active',
        actor: 'automation',
        target: sessionId,
        duration: 2 * 60 * 60 * 1000, // 2 hours
      });
    }
  }

  private async quarantineFile(incident: SecurityIncident): Promise<void> {
    const fileHash = incident.events[0]?.metadata?.fileHash;
    if (fileHash) {
      console.log(`📁 Quarantining file: ${fileHash}`);

      incident.containment.push({
        id: `quarantine_file_${Date.now()}`,
        type: 'file_quarantine',
        description: `Quarantined file with hash: ${fileHash}`,
        timestamp: Date.now(),
        status: 'active',
        actor: 'automation',
        target: fileHash,
        duration: 7 * 24 * 60 * 60 * 1000, // 7 days
      });
    }
  }

  private async resetPassword(incident: SecurityIncident): Promise<void> {
    const userId = incident.events[0]?.userId;
    if (userId) {
      console.log(`🔑 Forcing password reset for user: ${userId}`);

      incident.containment.push({
        id: `reset_password_${Date.now()}`,
        type: 'credential_reset',
        description: `Forced password reset for user: ${userId}`,
        timestamp: Date.now(),
        status: 'active',
        actor: 'automation',
        target: userId,
        duration: 0, // Immediate, one-time action
      });
    }
  }

  private async notifySecurityTeam(incident: SecurityIncident): Promise<void> {
    console.log(`📢 Notifying security team about incident: ${incident.id}`);

    // В реальной системе здесь будет отправка уведомлений через Slack, email, etc.
    const notification = {
      channel: '#security-alerts',
      message:
        `🚨 *New ${incident.severity.toUpperCase()} Incident*\n` +
        `*ID:* ${incident.id}\n` +
        `*Title:* ${incident.title}\n` +
        `*Description:* ${incident.description}\n` +
        `*Assigned to:* ${incident.assignedTo}\n` +
        `*Created:* ${new Date(incident.createdAt).toISOString()}`,
    };

    incident.timeline.push({
      timestamp: Date.now(),
      action: 'team_notified',
      description: 'Security team notified via Slack',
      actor: 'notification_system',
      evidence: [JSON.stringify(notification)],
    });
  }

  /**
   * Assess initial impact
   */
  private assessImpact(severity: SecuritySeverity, event: SecurityEvent): IncidentImpact {
    return {
      scope:
        severity === 'critical'
          ? 'critical'
          : severity === 'high'
            ? 'extensive'
            : severity === 'medium'
              ? 'moderate'
              : 'limited',
      confidentiality: this.calculateImpactScore(severity, 'confidentiality'),
      integrity: this.calculateImpactScore(severity, 'integrity'),
      availability: this.calculateImpactScore(severity, 'availability'),
      affectedSystems: [event.source],
      affectedUsers: event.userId ? [event.userId] : [],
      businessImpact: this.assessBusinessImpact(severity),
      estimatedCost: this.estimateCost(severity),
      dataCompromised: false, // Default, will be updated during investigation
      reputationImpact:
        severity === 'critical'
          ? 'severe'
          : severity === 'high'
            ? 'significant'
            : severity === 'medium'
              ? 'moderate'
              : 'minimal',
    };
  }

  /**
   * Calculate impact score
   */
  private calculateImpactScore(severity: SecuritySeverity, _dimension: string): number {
    const baseScores = {
      low: 1,
      medium: 3,
      high: 7,
      critical: 10,
    };
    return baseScores[severity];
  }

  /**
   * Assess business impact
   */
  private assessBusinessImpact(severity: SecuritySeverity): string {
    const impacts = {
      low: 'Minimal business impact expected',
      medium: 'Limited business operations may be affected',
      high: 'Significant business impact likely',
      critical: 'Severe business disruption possible',
    };
    return impacts[severity];
  }

  /**
   * Estimate cost
   */
  private estimateCost(severity: SecuritySeverity): number {
    const costs = {
      low: 1000,
      medium: 5000,
      high: 25000,
      critical: 100000,
    };
    return costs[severity];
  }

  /**
   * Initialize response plan
   */
  private initializeResponse(severity: SecuritySeverity): IncidentResponse {
    return {
      plan: this.getResponsePlan(severity),
      actions: [],
      timeline: [],
      status: 'initiated',
      teamMembers: [this.getNextAvailableAnalyst()],
      communicationPlan: this.getCommunicationPlan(severity),
      escalationPath: this.getEscalationPath(severity),
      containmentActions: [],
      eradicationActions: [],
      recoveryActions: [],
      forensicsRequired: severity === 'critical' || severity === 'high',
      legalNotificationRequired: severity === 'critical',
    };
  }

  /**
   * Get response plan
   */
  private getResponsePlan(severity: SecuritySeverity): string {
    const plans = {
      low: 'Standard incident response procedure',
      medium: 'Enhanced monitoring and investigation',
      high: 'Immediate containment and forensic analysis',
      critical: 'Emergency response protocol with executive notification',
    };
    return plans[severity];
  }

  /**
   * Get communication plan
   */
  private getCommunicationPlan(_severity: SecuritySeverity): any[] {
    return []; // Simplified for now
  }

  /**
   * Get escalation path
   */
  private getEscalationPath(severity: SecuritySeverity): string[] {
    const paths = {
      low: ['security_analyst', 'security_lead'],
      medium: ['security_analyst', 'security_lead', 'security_manager'],
      high: ['security_analyst', 'security_lead', 'security_manager', 'ciso'],
      critical: ['security_analyst', 'security_lead', 'security_manager', 'ciso', 'ceo'],
    };
    return paths[severity];
  }

  /**
   * Get next available analyst
   */
  private getNextAvailableAnalyst(): string {
    return (
      this.responseTeam[Math.floor(Math.random() * this.responseTeam.length)] ||
      'security_analyst_1'
    );
  }

  /**
   * Handle status changes
   */
  private async handleStatusChange(
    incident: SecurityIncident,
    from: IncidentStatus,
    to: IncidentStatus,
  ): Promise<void> {
    switch (to) {
      case 'investigating':
        await this.startInvestigation(incident);
        break;
      case 'contained':
        await this.confirmContainment(incident);
        break;
      case 'eradicated':
        await this.confirmEradication(incident);
        break;
      case 'closed':
        await this.closeIncident(incident);
        break;
    }
  }

  /**
   * Start investigation
   */
  private async startInvestigation(incident: SecurityIncident): Promise<void> {
    console.log(`🔍 Starting investigation for incident ${incident.id}`);

    // Assign additional resources for high/critical incidents
    if (incident.severity === 'high' || incident.severity === 'critical') {
      incident.response.teamMembers.push('forensics_specialist', 'threat_hunter');
    }
  }

  /**
   * Confirm containment
   */
  private async confirmContainment(incident: SecurityIncident): Promise<void> {
    console.log(`🛡️ Confirming containment for incident ${incident.id}`);

    // Verify all containment actions are effective
    for (const action of incident.containment) {
      if (action.status === 'active') {
        console.log(`✅ Containment action ${action.type} is effective`);
      }
    }
  }

  /**
   * Confirm eradication
   */
  private async confirmEradication(incident: SecurityIncident): Promise<void> {
    console.log(`🧹 Confirming eradication for incident ${incident.id}`);

    // Begin recovery planning
    incident.response.actions.push('begin_recovery_planning');
  }

  /**
   * Close incident
   */
  private async closeIncident(incident: SecurityIncident): Promise<void> {
    console.log(`✅ Closing incident ${incident.id}`);

    // Generate lessons learned
    incident.lessons = this.generateLessonsLearned(incident);

    // Remove temporary containment actions
    for (const action of incident.containment) {
      if (action.type === 'session_isolation' || action.type === 'account_disable') {
        action.status = 'removed';
      }
    }
  }

  /**
   * Generate lessons learned
   */
  private generateLessonsLearned(incident: SecurityIncident): string[] {
    const lessons: string[] = [];

    lessons.push(`Detection method: ${incident.events[0]?.type} event triggered the incident`);
    lessons.push(`Response time: ${this.calculateResponseTime(incident)} minutes`);
    lessons.push(`Containment effectiveness: ${incident.containment.length} actions taken`);

    if (incident.severity === 'critical') {
      lessons.push('Consider implementing additional preventive controls');
    }

    return lessons;
  }

  /**
   * Calculate response time
   */
  private calculateResponseTime(incident: SecurityIncident): number {
    const created = incident.createdAt;
    const investigating = incident.timeline.find(
      (entry) => entry.action === 'status_updated' && entry.description.includes('investigating'),
    );

    if (investigating) {
      return Math.round((investigating.timestamp - created) / (1000 * 60)); // minutes
    }

    return 0;
  }

  /**
   * Recalculate severity based on new events
   */
  private recalculateSeverity(incident: SecurityIncident): SecuritySeverity {
    // Simplified severity calculation
    const criticalEvents = incident.events.filter((e) => e.severity === 'critical').length;
    const highEvents = incident.events.filter((e) => e.severity === 'high').length;

    if (criticalEvents > 0) return 'critical';
    if (highEvents > 2) return 'high';
    if (incident.events.length > 10) return 'high';

    return incident.severity; // Keep current if no escalation needed
  }

  /**
   * Escalate incident
   */
  private async escalateIncident(
    incident: SecurityIncident,
    newSeverity: SecuritySeverity,
  ): Promise<void> {
    const oldSeverity = incident.severity;
    incident.severity = newSeverity;
    incident.updatedAt = Date.now();

    incident.timeline.push({
      timestamp: Date.now(),
      action: 'severity_escalated',
      description: `Severity escalated from ${oldSeverity} to ${newSeverity}`,
      actor: 'correlation_engine',
      evidence: [`event_count: ${incident.events.length}`],
    });

    // Trigger additional response actions
    await this.triggerInitialResponse(incident);

    console.log(`⬆️ Incident ${incident.id} escalated: ${oldSeverity} → ${newSeverity}`);
  }

  /**
   * Get incident statistics
   */
  getIncidentStatistics(): {
    total: number;
    byStatus: Record<IncidentStatus, number>;
    bySeverity: Record<SecuritySeverity, number>;
    averageResponseTime: number;
    openIncidents: number;
  } {
    const incidents = Array.from(this.incidents.values());

    const stats = {
      total: incidents.length,
      byStatus: {} as Record<IncidentStatus, number>,
      bySeverity: {} as Record<SecuritySeverity, number>,
      averageResponseTime: 0,
      openIncidents: 0,
    };

    incidents.forEach((incident) => {
      // Count by status
      stats.byStatus[incident.status] = (stats.byStatus[incident.status] || 0) + 1;

      // Count by severity
      stats.bySeverity[incident.severity] = (stats.bySeverity[incident.severity] || 0) + 1;

      // Count open incidents
      if (['new', 'investigating', 'contained'].includes(incident.status)) {
        stats.openIncidents++;
      }
    });

    // Calculate average response time
    const responseTimes = incidents.map((incident) => this.calculateResponseTime(incident));
    stats.averageResponseTime =
      responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length || 0;

    return stats;
  }

  /**
   * Get all incidents
   */
  getAllIncidents(): SecurityIncident[] {
    return Array.from(this.incidents.values());
  }

  /**
   * Get incident by ID
   */
  getIncident(incidentId: string): SecurityIncident | undefined {
    return this.incidents.get(incidentId);
  }
}
