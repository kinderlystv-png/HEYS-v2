import {
  AttackPattern,
  IOCMatch,
  IOCType,
  SecurityEvent,
  ThreatActor,
  ThreatIntelligence,
} from '../types';

/**
 * Threat Intelligence Engine
 * Интеграция с threat intelligence feeds и IOC matching
 */
export class ThreatIntelligenceEngine {
  private iocDatabase: Map<string, ThreatIntelligence> = new Map();
  private threatActors: Map<string, ThreatActor> = new Map();
  private attackPatterns: Map<string, AttackPattern> = new Map();
  private isInitialized: boolean = false;
  private lastUpdateTime: number = 0;

  constructor(
    private config: {
      updateInterval?: number;
      maxIOCs?: number;
      confidenceThreshold?: number;
    } = {},
  ) {
    this.initializeDefaultIOCs();
    this.initializeDefaultThreatActors();
    this.initializeDefaultAttackPatterns();
  }

  /**
   * Инициализация базовых IOCs
   */
  private initializeDefaultIOCs(): void {
    const defaultIOCs: ThreatIntelligence[] = [
      {
        id: 'ioc_1',
        type: 'ip',
        value: '185.220.100.240',
        source: 'tor_exit_nodes',
        category: 'anonymization',
        confidence: 0.9,
        severity: 'medium',
        description: 'Known Tor exit node',
        tags: ['tor', 'anonymization', 'privacy'],
        firstSeen: Date.now() - 86400000,
        lastSeen: Date.now(),
        references: ['https://check.torproject.org/'],
        ttl: 7 * 24 * 60 * 60 * 1000, // 7 days
        indicator: '185.220.100.240',
        iocs: [],
      },
      {
        id: 'ioc_2',
        type: 'domain',
        value: 'malicious-phishing-site.com',
        source: 'phishing_db',
        category: 'phishing',
        confidence: 0.95,
        severity: 'high',
        description: 'Known phishing domain targeting financial institutions',
        tags: ['phishing', 'financial', 'credential_theft'],
        firstSeen: Date.now() - 172800000,
        lastSeen: Date.now() - 3600000,
        references: ['https://phishing.database.example.com/'],
        ttl: 30 * 24 * 60 * 60 * 1000, // 30 days
        indicator: 'malicious-phishing-site.com',
        iocs: [],
      },
      {
        id: 'ioc_3',
        type: 'hash',
        value: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        source: 'malware_db',
        category: 'malware',
        confidence: 0.85,
        severity: 'high',
        description: 'Known ransomware payload hash',
        tags: ['ransomware', 'encryption', 'extortion'],
        firstSeen: Date.now() - 259200000,
        lastSeen: Date.now() - 7200000,
        references: ['https://malware.analysis.example.com/'],
        ttl: 90 * 24 * 60 * 60 * 1000, // 90 days
        indicator: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        iocs: [],
      },
      {
        id: 'ioc_4',
        type: 'user_agent',
        value:
          'Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)',
        source: 'bot_detection',
        category: 'bot',
        confidence: 0.8,
        severity: 'low',
        description: 'Baidu search engine crawler',
        tags: ['bot', 'crawler', 'search_engine'],
        firstSeen: Date.now() - 86400000,
        lastSeen: Date.now(),
        references: ['https://help.baidu.com/robots/'],
        ttl: 365 * 24 * 60 * 60 * 1000, // 1 year
        indicator:
          'Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)',
        iocs: [],
      },
    ];

    defaultIOCs.forEach((ioc) => {
      this.iocDatabase.set(ioc.value, ioc);
    });

    console.log(`📊 Initialized ${defaultIOCs.length} default IOCs`);
  }

  /**
   * Инициализация известных threat actors
   */
  private initializeDefaultThreatActors(): void {
    const defaultActors: ThreatActor[] = [
      {
        id: 'apt_1',
        name: 'APT29 (Cozy Bear)',
        aliases: ['Cozy Bear', 'CozyDuke', 'The Dukes'],
        country: 'Russia',
        motivation: 'espionage',
        capabilities: ['advanced_persistent_threat', 'zero_day_exploits', 'social_engineering'],
        targets: ['government', 'defense', 'technology'],
        ttps: ['spear_phishing', 'credential_harvesting', 'lateral_movement'],
        confidence: 0.9,
        firstSeen: Date.now() - 365 * 24 * 60 * 60 * 1000,
        lastSeen: Date.now() - 86400000,
        references: ['https://attack.mitre.org/groups/G0016/'],
      },
      {
        id: 'ransomware_1',
        name: 'Conti Ransomware Group',
        aliases: ['Conti', 'TrickBot'],
        country: 'Russia',
        motivation: 'financial',
        capabilities: ['ransomware', 'data_exfiltration', 'double_extortion'],
        targets: ['healthcare', 'education', 'government'],
        ttps: ['phishing', 'exploitation', 'privilege_escalation'],
        confidence: 0.85,
        firstSeen: Date.now() - 730 * 24 * 60 * 60 * 1000,
        lastSeen: Date.now() - 172800000,
        references: ['https://www.cisa.gov/conti-ransomware'],
      },
    ];

    defaultActors.forEach((actor) => {
      this.threatActors.set(actor.id, actor);
    });

    console.log(`🎭 Initialized ${defaultActors.length} threat actors`);
  }

  /**
   * Инициализация attack patterns
   */
  private initializeDefaultAttackPatterns(): void {
    const defaultPatterns: AttackPattern[] = [
      {
        id: 'T1566.001',
        name: 'Spearphishing Attachment',
        technique: 'Initial Access',
        tactic: 'TA0001',
        description:
          'Adversaries may send spearphishing emails with a malicious attachment in an attempt to gain access to victim systems.',
        indicators: ['suspicious_attachments', 'phishing_emails', 'social_engineering'],
        mitigation: ['user_training', 'email_filtering', 'attachment_scanning'],
        confidence: 0.9,
        frequency: 'high',
        references: ['https://attack.mitre.org/techniques/T1566/001/'],
      },
      {
        id: 'T1190',
        name: 'Exploit Public-Facing Application',
        technique: 'Initial Access',
        tactic: 'TA0001',
        description:
          'Adversaries may attempt to take advantage of a weakness in an Internet-facing computer or program using software, data, or commands in order to cause unintended or unanticipated behavior.',
        indicators: ['vulnerability_scanning', 'exploitation_attempts', 'unusual_web_requests'],
        mitigation: ['patch_management', 'web_application_firewall', 'vulnerability_scanning'],
        confidence: 0.85,
        frequency: 'very_high',
        references: ['https://attack.mitre.org/techniques/T1190/'],
      },
    ];

    defaultPatterns.forEach((pattern) => {
      this.attackPatterns.set(pattern.id, pattern);
    });

    console.log(`🔄 Initialized ${defaultPatterns.length} attack patterns`);
    this.isInitialized = true;
  }

  /**
   * Поиск IOC matches в security event
   */
  async checkIOCs(event: SecurityEvent): Promise<IOCMatch[]> {
    const matches: IOCMatch[] = [];

    if (!this.isInitialized) {
      console.warn('⚠️ Threat Intelligence Engine not initialized');
      return matches;
    }

    // Проверяем IP адреса
    const ips = this.extractIPs(event);
    for (const ip of ips) {
      const ioc = this.iocDatabase.get(ip);
      if (ioc && ioc.type === 'ip') {
        matches.push(this.createIOCMatch(ioc, event, ip));
      }
    }

    // Проверяем домены
    const domains = this.extractDomains(event);
    for (const domain of domains) {
      const ioc = this.iocDatabase.get(domain);
      if (ioc && ioc.type === 'domain') {
        matches.push(this.createIOCMatch(ioc, event, domain));
      }
    }

    // Проверяем хэши
    const hashes = this.extractHashes(event);
    for (const hash of hashes) {
      const ioc = this.iocDatabase.get(hash);
      if (ioc && ioc.type === 'hash') {
        matches.push(this.createIOCMatch(ioc, event, hash));
      }
    }

    // Проверяем User-Agent
    const userAgent = event.metadata.userAgent;
    if (userAgent) {
      const ioc = this.iocDatabase.get(userAgent);
      if (ioc && ioc.type === 'user_agent') {
        matches.push(this.createIOCMatch(ioc, event, userAgent));
      }
    }

    if (matches.length > 0) {
      console.log(`🎯 Found ${matches.length} IOC matches for event ${event.id}`);
    }

    return matches;
  }

  /**
   * Создание IOC match object
   */
  private createIOCMatch(
    ioc: ThreatIntelligence,
    event: SecurityEvent,
    matchedValue: string,
  ): IOCMatch {
    return {
      id: `match_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      eventId: event.id,
      iocId: ioc.id,
      iocType: ioc.type as IOCType,
      matchedValue,
      confidence: ioc.confidence,
      severity: ioc.severity,
      category: ioc.category,
      source: ioc.source,
      description: ioc.description,
      tags: ioc.tags,
      context: {
        eventType: event.type,
        sourceIP: event.sourceIP || undefined,
        userAgent: event.metadata.userAgent || undefined,
        userId: event.userId || undefined,
      },
    };
  }

  /**
   * Извлечение IP адресов из event
   */
  private extractIPs(event: SecurityEvent): string[] {
    const ips: string[] = [];

    if (event.sourceIP) {
      ips.push(event.sourceIP);
    }

    if (event.metadata.forwardedFor) {
      ips.push(...event.metadata.forwardedFor.split(',').map((ip) => ip.trim()));
    }

    if (event.metadata.remoteAddr) {
      ips.push(event.metadata.remoteAddr);
    }

    // IP regex для поиска в других полях
    const ipRegex = /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g;
    const eventString = JSON.stringify(event);
    const matches = eventString.match(ipRegex);
    if (matches) {
      ips.push(...matches);
    }

    return [...new Set(ips)]; // Remove duplicates
  }

  /**
   * Извлечение доменов из event
   */
  private extractDomains(event: SecurityEvent): string[] {
    const domains: string[] = [];

    if (event.metadata.referrer) {
      try {
        const url = new URL(event.metadata.referrer);
        domains.push(url.hostname);
      } catch {
        // Ignore invalid URLs
      }
    }

    if (event.metadata.targetURL) {
      try {
        const url = new URL(event.metadata.targetURL);
        domains.push(url.hostname);
      } catch {
        // Ignore invalid URLs
      }
    }

    // Domain regex для поиска в других полях
    const domainRegex =
      /\b[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\b/g;
    const eventString = JSON.stringify(event);
    const matches = eventString.match(domainRegex);
    if (matches) {
      domains.push(
        ...matches.filter((domain) => domain.includes('.') && !domain.match(/^\d+(\.\d+)*$/)),
      );
    }

    return [...new Set(domains)]; // Remove duplicates
  }

  /**
   * Извлечение хэшей из event
   */
  private extractHashes(event: SecurityEvent): string[] {
    const hashes: string[] = [];

    if (event.metadata.fileHash) {
      hashes.push(event.metadata.fileHash);
    }

    // Hash regex (MD5, SHA1, SHA256)
    const hashRegex = /\b[a-fA-F0-9]{32}\b|\b[a-fA-F0-9]{40}\b|\b[a-fA-F0-9]{64}\b/g;
    const eventString = JSON.stringify(event);
    const matches = eventString.match(hashRegex);
    if (matches) {
      hashes.push(...matches);
    }

    return [...new Set(hashes)]; // Remove duplicates
  }

  /**
   * Добавление новых IOCs
   */
  async addIOC(ioc: ThreatIntelligence): Promise<void> {
    // Проверяем TTL
    if (ioc.ttl && Date.now() - ioc.firstSeen > ioc.ttl) {
      console.warn(`⚠️ IOC ${ioc.id} has expired, skipping`);
      return;
    }

    this.iocDatabase.set(ioc.value, ioc);
    console.log(`➕ Added IOC: ${ioc.type}:${ioc.value} from ${ioc.source}`);

    // Cleanup старых IOCs если превышен лимит
    const maxIOCs = this.config.maxIOCs || 10000;
    if (this.iocDatabase.size > maxIOCs) {
      await this.cleanupExpiredIOCs();
    }
  }

  /**
   * Batch добавление IOCs
   */
  async addIOCsBatch(iocs: ThreatIntelligence[]): Promise<void> {
    let added = 0;
    for (const ioc of iocs) {
      try {
        await this.addIOC(ioc);
        added++;
      } catch (error) {
        console.error(`Error adding IOC ${ioc.id}:`, error);
      }
    }
    console.log(`📦 Batch processed: ${added}/${iocs.length} IOCs added`);
  }

  /**
   * Cleanup expired IOCs
   */
  private async cleanupExpiredIOCs(): Promise<void> {
    const now = Date.now();
    let cleaned = 0;

    for (const [value, ioc] of this.iocDatabase.entries()) {
      if (ioc.ttl && now - ioc.firstSeen > ioc.ttl) {
        this.iocDatabase.delete(value);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`🧹 Cleaned up ${cleaned} expired IOCs`);
    }
  }

  /**
   * Поиск threat actor по IOC match
   */
  findThreatActor(matches: IOCMatch[]): ThreatActor | null {
    for (const match of matches) {
      // Simplified mapping - в реальной системе это будет более сложная логика
      if (match.category === 'malware' && match.severity === 'high') {
        return this.threatActors.get('ransomware_1') || null;
      }
      if (match.category === 'espionage') {
        return this.threatActors.get('apt_1') || null;
      }
    }
    return null;
  }

  /**
   * Поиск attack pattern по event
   */
  findAttackPattern(event: SecurityEvent): AttackPattern | null {
    // Simplified pattern matching
    if (
      event.type === 'authentication' &&
      event.metadata.failedAttempts &&
      event.metadata.failedAttempts > 3
    ) {
      return this.attackPatterns.get('T1110') || null; // Brute Force
    }

    if (event.type === 'web_request' && event.metadata.suspiciousPayload) {
      return this.attackPatterns.get('T1190') || null; // Exploit Public-Facing Application
    }

    if (event.type === 'email' && event.metadata.hasAttachment) {
      return this.attackPatterns.get('T1566.001') || null; // Spearphishing Attachment
    }

    return null;
  }

  /**
   * Получение статистики IOC database
   */
  getStatistics(): {
    totalIOCs: number;
    byType: Record<string, number>;
    bySource: Record<string, number>;
    bySeverity: Record<string, number>;
    lastUpdate: number;
  } {
    const stats = {
      totalIOCs: this.iocDatabase.size,
      byType: {} as Record<string, number>,
      bySource: {} as Record<string, number>,
      bySeverity: {} as Record<string, number>,
      lastUpdate: this.lastUpdateTime,
    };

    for (const ioc of this.iocDatabase.values()) {
      stats.byType[ioc.type] = (stats.byType[ioc.type] || 0) + 1;
      stats.bySource[ioc.source] = (stats.bySource[ioc.source] || 0) + 1;
      stats.bySeverity[ioc.severity] = (stats.bySeverity[ioc.severity] || 0) + 1;
    }

    return stats;
  }

  /**
   * Обновление threat intelligence feeds
   */
  async updateFeeds(): Promise<void> {
    console.log('🔄 Updating threat intelligence feeds...');

    // В реальной системе здесь будет интеграция с внешними feeds
    // Для демо добавляем несколько новых IOCs
    const newIOCs: ThreatIntelligence[] = [
      {
        id: `ioc_${Date.now()}_1`,
        type: 'ip',
        value: '192.168.1.100',
        source: 'internal_honeypot',
        category: 'scanning',
        confidence: 0.7,
        severity: 'medium',
        description: 'Suspicious scanning activity detected',
        tags: ['scanning', 'reconnaissance'],
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        references: [],
        ttl: 24 * 60 * 60 * 1000, // 24 hours
        indicator: '192.168.1.100',
        iocs: [],
      },
    ];

    await this.addIOCsBatch(newIOCs);
    this.lastUpdateTime = Date.now();

    console.log('✅ Threat intelligence feeds updated');
  }
}
