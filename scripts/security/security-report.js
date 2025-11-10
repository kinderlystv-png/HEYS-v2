#!/usr/bin/env node
/**
 * Система консолидированной отчетности по безопасности
 * Объединяет результаты всех сканирований в единый отчет
 *
 * @created КТ4 - Автоматизация безопасности
 * @author HEYS Security Team
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Конфигурация отчетности
const REPORT_CONFIG = {
  projectRoot: path.resolve(__dirname, '../../'),
  reportsDir: path.resolve(__dirname, '../../security-reports'),
  outputDir: path.resolve(__dirname, '../../security-reports/consolidated'),

  // Источники отчетов
  reportSources: {
    sast: 'sast-report.json',
    dependencies: 'dependency-security-report.json',
    secrets: 'secrets-scan-results.json',
    docker: 'docker-security-report.json',
    api: 'api-security-report.json',
  },

  // Настройки оценки безопасности
  scoring: {
    critical: { weight: 10, impact: 'immediate' },
    high: { weight: 7, impact: 'urgent' },
    moderate: { weight: 4, impact: 'medium' },
    low: { weight: 1, impact: 'low' },
    info: { weight: 0, impact: 'informational' },
  },

  // Пороги безопасности
  thresholds: {
    securityScore: 85, // Минимальный балл безопасности
    criticalVulns: 0, // Максимум критических уязвимостей
    highVulns: 5, // Максимум высоких уязвимостей
    totalVulns: 50, // Максимум общих уязвимостей
  },
};

class SecurityReportConsolidator {
  constructor() {
    this.consolidatedReport = {
      metadata: {
        timestamp: new Date().toISOString(),
        reportVersion: '1.0.0',
        projectInfo: {},
        scanners: [],
        duration: 0,
      },

      summary: {
        securityScore: 0,
        riskLevel: 'unknown',
        totalIssues: 0,
        issuesBySeverity: {
          critical: 0,
          high: 0,
          moderate: 0,
          low: 0,
          info: 0,
        },
        coverage: {
          sastCoverage: false,
          dependencyCoverage: false,
          secretsCoverage: false,
          dockerCoverage: false,
          apiCoverage: false,
        },
      },

      scanResults: {
        sast: null,
        dependencies: null,
        secrets: null,
        docker: null,
        api: null,
      },

      vulnerabilities: [],
      recommendations: [],
      complianceStatus: {},
      trendAnalysis: {},
    };

    this.startTime = Date.now();
  }

  /**
   * Запуск консолидации отчетов
   */
  async consolidateReports() {
    console.log('📊 Starting Security Report Consolidation...\n');

    try {
      // Инициализация проекта
      await this.initializeProject();

      // Загрузка отчетов от различных сканеров
      await this.loadScanResults();

      // Консолидация уязвимостей
      await this.consolidateVulnerabilities();

      // Расчет безопасности
      await this.calculateSecurityScore();

      // Генерация рекомендаций
      await this.generateConsolidatedRecommendations();

      // Анализ соответствия стандартам
      await this.analyzeCompliance();

      // Анализ трендов
      await this.analyzeTrends();

      // Создание отчетов
      await this.generateConsolidatedReports();

      // Вывод результатов
      this.printConsolidatedResults();

      return this.getSecurityVerdict();
    } catch (error) {
      console.error('❌ Report consolidation failed:', error.message);
      return 1;
    } finally {
      this.consolidatedReport.metadata.duration = Date.now() - this.startTime;
    }
  }

  /**
   * Инициализация информации о проекте
   */
  async initializeProject() {
    console.log('📋 Initializing project information...');

    // Читаем package.json для информации о проекте
    const packageJsonPath = path.join(REPORT_CONFIG.projectRoot, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

      this.consolidatedReport.metadata.projectInfo = {
        name: packageJson.name || 'unknown',
        version: packageJson.version || '0.0.0',
        description: packageJson.description || '',
        repository: packageJson.repository || {},
        author: packageJson.author || '',
        license: packageJson.license || 'unlicensed',
      };
    }

    // Создаем директории для отчетов
    if (!fs.existsSync(REPORT_CONFIG.outputDir)) {
      fs.mkdirSync(REPORT_CONFIG.outputDir, { recursive: true });
    }

    console.log(`   📦 Project: ${this.consolidatedReport.metadata.projectInfo.name}`);
    console.log(`   🏷️ Version: ${this.consolidatedReport.metadata.projectInfo.version}`);
  }

  /**
   * Загрузка результатов всех сканирований
   */
  async loadScanResults() {
    console.log('\n🔍 Loading scan results...');

    for (const [scanType, filename] of Object.entries(REPORT_CONFIG.reportSources)) {
      const reportPath = path.join(REPORT_CONFIG.reportsDir, filename);

      if (fs.existsSync(reportPath)) {
        try {
          const reportData = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
          this.consolidatedReport.scanResults[scanType] = reportData;
          this.consolidatedReport.metadata.scanners.push(scanType);
          this.consolidatedReport.summary.coverage[`${scanType}Coverage`] = true;

          console.log(`   ✅ Loaded ${scanType} report (${filename})`);
        } catch (error) {
          console.log(`   ⚠️ Failed to load ${scanType} report: ${error.message}`);
          this.consolidatedReport.scanResults[scanType] = null;
        }
      } else {
        console.log(`   ❌ Missing ${scanType} report (${filename})`);
        this.consolidatedReport.scanResults[scanType] = null;
      }
    }

    console.log(
      `\n   📊 Loaded ${this.consolidatedReport.metadata.scanners.length} scanner reports`,
    );
  }

  /**
   * Консолидация уязвимостей из всех источников
   */
  async consolidateVulnerabilities() {
    console.log('\n🔄 Consolidating vulnerabilities...');

    const allVulnerabilities = [];

    // Обрабатываем SAST результаты
    if (this.consolidatedReport.scanResults.sast) {
      const sastVulns = this.consolidatedReport.scanResults.sast.vulnerabilities || [];
      sastVulns.forEach((vuln) => {
        allVulnerabilities.push({
          ...vuln,
          source: 'sast',
          category: 'code-analysis',
          uniqueId: `sast-${vuln.rule}-${vuln.file}-${vuln.line}`,
        });
      });
    }

    // Обрабатываем зависимости
    if (this.consolidatedReport.scanResults.dependencies) {
      const depVulns = this.consolidatedReport.scanResults.dependencies.vulnerabilities || [];
      depVulns.forEach((vuln) => {
        allVulnerabilities.push({
          ...vuln,
          source: 'dependencies',
          category: 'third-party',
          uniqueId: `dep-${vuln.id}-${vuln.package}`,
        });
      });
    }

    // Обрабатываем секреты
    if (this.consolidatedReport.scanResults.secrets) {
      const secretVulns = this.consolidatedReport.scanResults.secrets.findings || [];
      secretVulns.forEach((vuln) => {
        allVulnerabilities.push({
          ...vuln,
          source: 'secrets',
          category: 'credential-exposure',
          severity: 'critical', // Все найденные секреты критичны
          uniqueId: `secret-${vuln.type}-${vuln.file}-${vuln.line}`,
        });
      });
    }

    // Обрабатываем Docker безопасность
    if (this.consolidatedReport.scanResults.docker) {
      const dockerVulns = this.consolidatedReport.scanResults.docker.vulnerabilities || [];
      dockerVulns.forEach((vuln) => {
        allVulnerabilities.push({
          ...vuln,
          source: 'docker',
          category: 'infrastructure',
          uniqueId: `docker-${vuln.id || vuln.rule}`,
        });
      });
    }

    // Обрабатываем API безопасность
    if (this.consolidatedReport.scanResults.api) {
      const apiVulns = this.consolidatedReport.scanResults.api.vulnerabilities || [];
      apiVulns.forEach((vuln) => {
        allVulnerabilities.push({
          ...vuln,
          source: 'api',
          category: 'web-security',
          uniqueId: `api-${vuln.type || vuln.endpoint}`,
        });
      });
    }

    // Удаляем дубликаты
    const uniqueVulnerabilities = this.deduplicateVulnerabilities(allVulnerabilities);

    // Сортируем по критичности
    uniqueVulnerabilities.sort((a, b) => {
      const severityOrder = { critical: 4, high: 3, moderate: 2, low: 1, info: 0 };
      return (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0);
    });

    this.consolidatedReport.vulnerabilities = uniqueVulnerabilities;

    // Подсчет по типам
    uniqueVulnerabilities.forEach((vuln) => {
      const severity = vuln.severity || 'info';
      if (this.consolidatedReport.summary.issuesBySeverity[severity] !== undefined) {
        this.consolidatedReport.summary.issuesBySeverity[severity]++;
      }
    });

    this.consolidatedReport.summary.totalIssues = uniqueVulnerabilities.length;

    console.log(`   🔍 Consolidated ${uniqueVulnerabilities.length} unique vulnerabilities`);
    console.log(`   🔴 Critical: ${this.consolidatedReport.summary.issuesBySeverity.critical}`);
    console.log(`   🟠 High: ${this.consolidatedReport.summary.issuesBySeverity.high}`);
    console.log(`   🟡 Moderate: ${this.consolidatedReport.summary.issuesBySeverity.moderate}`);
  }

  /**
   * Удаление дубликатов уязвимостей
   */
  deduplicateVulnerabilities(vulnerabilities) {
    const seen = new Set();
    const unique = [];

    vulnerabilities.forEach((vuln) => {
      // Создаем уникальный отпечаток уязвимости
      const fingerprint = this.createVulnerabilityFingerprint(vuln);

      if (!seen.has(fingerprint)) {
        seen.add(fingerprint);
        unique.push(vuln);
      }
    });

    return unique;
  }

  /**
   * Создание отпечатка уязвимости для дедупликации
   */
  createVulnerabilityFingerprint(vuln) {
    // Используем различные поля в зависимости от источника
    const parts = [
      vuln.title || vuln.message || vuln.description || '',
      vuln.file || vuln.package || vuln.component || '',
      vuln.line || vuln.version || '',
      vuln.severity || 'unknown',
    ];

    return parts.join('|').toLowerCase();
  }

  /**
   * Расчет общего балла безопасности
   */
  async calculateSecurityScore() {
    console.log('\n📊 Calculating security score...');

    const { issuesBySeverity } = this.consolidatedReport.summary;
    const { scoring } = REPORT_CONFIG;

    // Базовый балл
    let baseScore = 100;

    // Вычитаем баллы за уязвимости
    let penaltyScore = 0;
    Object.entries(issuesBySeverity).forEach(([severity, count]) => {
      if (scoring[severity]) {
        penaltyScore += count * scoring[severity].weight;
      }
    });

    // Финальный балл
    const securityScore = Math.max(0, baseScore - penaltyScore);
    this.consolidatedReport.summary.securityScore = Math.round(securityScore);

    // Определение уровня риска
    let riskLevel;
    if (securityScore >= 90) riskLevel = 'low';
    else if (securityScore >= 70) riskLevel = 'medium';
    else if (securityScore >= 50) riskLevel = 'high';
    else riskLevel = 'critical';

    this.consolidatedReport.summary.riskLevel = riskLevel;

    console.log(`   🎯 Security Score: ${securityScore}/100`);
    console.log(`   ⚠️ Risk Level: ${riskLevel.toUpperCase()}`);
  }

  /**
   * Генерация консолидированных рекомендаций
   */
  async generateConsolidatedRecommendations() {
    console.log('\n💡 Generating consolidated recommendations...');

    const recommendations = [];
    const { issuesBySeverity } = this.consolidatedReport.summary;

    // Критические рекомендации
    if (issuesBySeverity.critical > 0) {
      recommendations.push({
        priority: 1,
        category: 'immediate',
        title: 'Immediate Security Action Required',
        description: `Found ${issuesBySeverity.critical} critical vulnerabilities that require immediate attention.`,
        actions: [
          'Stop deployment to production until critical issues are resolved',
          'Patch or mitigate critical vulnerabilities within 24 hours',
          'Review security incident response procedures',
        ],
        impact: 'System compromise, data breach risk',
        timeframe: 'Immediate (0-24 hours)',
      });
    }

    // Высокоприоритетные рекомендации
    if (issuesBySeverity.high > 0) {
      recommendations.push({
        priority: 2,
        category: 'urgent',
        title: 'High Priority Security Updates',
        description: `Found ${issuesBySeverity.high} high severity vulnerabilities.`,
        actions: [
          'Schedule security updates within 48-72 hours',
          'Implement temporary mitigations if patches unavailable',
          'Increase monitoring for affected components',
        ],
        impact: 'Potential security compromise',
        timeframe: 'Urgent (24-72 hours)',
      });
    }

    // Рекомендации по покрытию сканирования
    const missingCoverage = Object.entries(this.consolidatedReport.summary.coverage)
      .filter(([, covered]) => !covered)
      .map(([type]) => type.replace('Coverage', ''));

    if (missingCoverage.length > 0) {
      recommendations.push({
        priority: 3,
        category: 'improvement',
        title: 'Expand Security Scanning Coverage',
        description: `Missing security scans: ${missingCoverage.join(', ')}`,
        actions: missingCoverage.map((type) => `Implement ${type} security scanning`),
        impact: 'Reduced visibility into security posture',
        timeframe: 'Medium term (1-2 weeks)',
      });
    }

    // Рекомендации по улучшению процесса
    if (this.consolidatedReport.summary.totalIssues > REPORT_CONFIG.thresholds.totalVulns) {
      recommendations.push({
        priority: 4,
        category: 'process',
        title: 'Improve Security Development Lifecycle',
        description: 'High number of vulnerabilities indicates process improvements needed.',
        actions: [
          'Implement security training for development team',
          'Add security gates to CI/CD pipeline',
          'Establish regular security review processes',
          'Consider shift-left security practices',
        ],
        impact: 'Long-term security posture improvement',
        timeframe: 'Long term (1-3 months)',
      });
    }

    this.consolidatedReport.recommendations = recommendations;

    console.log(`   📝 Generated ${recommendations.length} consolidated recommendations`);
  }

  /**
   * Анализ соответствия стандартам безопасности
   */
  async analyzeCompliance() {
    console.log('\n📋 Analyzing compliance status...');

    const { issuesBySeverity, securityScore } = this.consolidatedReport.summary;
    const { thresholds } = REPORT_CONFIG;

    // OWASP Top 10 соответствие
    const owaspCompliance = {
      standard: 'OWASP Top 10 2021',
      score: securityScore >= 85 ? 'compliant' : 'non-compliant',
      issues: this.mapToOwaspCategories(),
      recommendations: [
        'Implement secure coding practices',
        'Regular security training',
        'Automated security testing',
      ],
    };

    // CIS Controls соответствие
    const cisCompliance = {
      standard: 'CIS Controls v8',
      score: this.calculateCisCompliance(),
      coverage: this.consolidatedReport.summary.coverage,
      recommendations: [
        'Complete security control implementation',
        'Regular vulnerability assessments',
        'Incident response procedures',
      ],
    };

    // SOC 2 соответствие
    const soc2Compliance = {
      standard: 'SOC 2 Type II',
      score:
        issuesBySeverity.critical === 0 && issuesBySeverity.high <= 3
          ? 'compliant'
          : 'non-compliant',
      controlsAssessed: ['security', 'availability', 'confidentiality'],
      recommendations: [
        'Document security controls',
        'Implement monitoring and logging',
        'Regular compliance assessments',
      ],
    };

    this.consolidatedReport.complianceStatus = {
      owasp: owaspCompliance,
      cis: cisCompliance,
      soc2: soc2Compliance,
      summary: {
        overallCompliance: securityScore >= thresholds.securityScore ? 'passing' : 'failing',
        criticalGaps: issuesBySeverity.critical + issuesBySeverity.high,
        nextReview: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      },
    };

    console.log(`   📊 OWASP Top 10: ${owaspCompliance.score}`);
    console.log(`   🔍 CIS Controls: ${cisCompliance.score}`);
    console.log(`   📋 SOC 2: ${soc2Compliance.score}`);
  }

  /**
   * Маппинг уязвимостей на категории OWASP
   */
  mapToOwaspCategories() {
    const owaspCategories = {
      'A01:2021 – Broken Access Control': 0,
      'A02:2021 – Cryptographic Failures': 0,
      'A03:2021 – Injection': 0,
      'A04:2021 – Insecure Design': 0,
      'A05:2021 – Security Misconfiguration': 0,
      'A06:2021 – Vulnerable and Outdated Components': 0,
      'A07:2021 – Identification and Authentication Failures': 0,
      'A08:2021 – Software and Data Integrity Failures': 0,
      'A09:2021 – Security Logging and Monitoring Failures': 0,
      'A10:2021 – Server-Side Request Forgery': 0,
    };

    // Простое маппинг на основе типов уязвимостей
    this.consolidatedReport.vulnerabilities.forEach((vuln) => {
      const title = (vuln.title || vuln.message || '').toLowerCase();

      if (title.includes('injection') || title.includes('sql') || title.includes('xss')) {
        owaspCategories['A03:2021 – Injection']++;
      } else if (title.includes('dependency') || title.includes('outdated')) {
        owaspCategories['A06:2021 – Vulnerable and Outdated Components']++;
      } else if (title.includes('crypto') || title.includes('encryption')) {
        owaspCategories['A02:2021 – Cryptographic Failures']++;
      } else if (title.includes('access') || title.includes('authorization')) {
        owaspCategories['A01:2021 – Broken Access Control']++;
      } else if (title.includes('config') || title.includes('misconfiguration')) {
        owaspCategories['A05:2021 – Security Misconfiguration']++;
      }
    });

    return owaspCategories;
  }

  /**
   * Расчет соответствия CIS Controls
   */
  calculateCisCompliance() {
    const coverage = this.consolidatedReport.summary.coverage;
    const coveredControls = Object.values(coverage).filter(Boolean).length;
    const totalControls = Object.keys(coverage).length;

    const compliancePercentage = (coveredControls / totalControls) * 100;

    if (compliancePercentage >= 90) return 'advanced';
    if (compliancePercentage >= 70) return 'intermediate';
    if (compliancePercentage >= 50) return 'basic';
    return 'minimal';
  }

  /**
   * Анализ трендов безопасности
   */
  async analyzeTrends() {
    console.log('\n📈 Analyzing security trends...');

    // Загружаем исторические данные если доступны
    const historicalReportsDir = path.join(REPORT_CONFIG.outputDir, 'historical');
    const trends = {
      vulnerabilityTrend: 'unknown',
      scoreTrend: 'unknown',
      riskTrend: 'unknown',
      recommendations: [],
    };

    if (fs.existsSync(historicalReportsDir)) {
      try {
        const historicalFiles = fs
          .readdirSync(historicalReportsDir)
          .filter((file) => file.endsWith('.json'))
          .sort()
          .slice(-5); // Последние 5 отчетов

        if (historicalFiles.length > 1) {
          const historicalData = historicalFiles.map((file) => {
            const data = JSON.parse(fs.readFileSync(path.join(historicalReportsDir, file), 'utf8'));
            return {
              date: data.metadata.timestamp,
              score: data.summary.securityScore,
              totalIssues: data.summary.totalIssues,
              critical: data.summary.issuesBySeverity.critical,
              high: data.summary.issuesBySeverity.high,
            };
          });

          trends.vulnerabilityTrend = this.calculateTrend(historicalData.map((d) => d.totalIssues));
          trends.scoreTrend = this.calculateTrend(historicalData.map((d) => d.score));
          trends.historicalData = historicalData;
        }
      } catch (error) {
        console.log('   ⚠️ Could not analyze historical trends:', error.message);
      }
    }

    this.consolidatedReport.trendAnalysis = trends;

    console.log(`   📊 Vulnerability trend: ${trends.vulnerabilityTrend}`);
    console.log(`   📈 Security score trend: ${trends.scoreTrend}`);
  }

  /**
   * Расчет тренда для массива значений
   */
  calculateTrend(values) {
    if (values.length < 2) return 'insufficient-data';

    const recent = values[values.length - 1];
    const previous = values[values.length - 2];

    const change = ((recent - previous) / previous) * 100;

    if (Math.abs(change) < 5) return 'stable';
    return change > 0 ? 'improving' : 'declining';
  }

  /**
   * Генерация консолидированных отчетов
   */
  async generateConsolidatedReports() {
    console.log('\n📊 Generating consolidated reports...');

    // JSON отчет
    const jsonReportPath = path.join(REPORT_CONFIG.outputDir, 'consolidated-security-report.json');
    fs.writeFileSync(jsonReportPath, JSON.stringify(this.consolidatedReport, null, 2));

    // Исполнительный отчет
    const executiveReportPath = path.join(
      REPORT_CONFIG.outputDir,
      'executive-security-summary.json',
    );
    const executiveSummary = this.generateExecutiveSummary();
    fs.writeFileSync(executiveReportPath, JSON.stringify(executiveSummary, null, 2));

    // HTML дашборд
    const htmlDashboardPath = path.join(REPORT_CONFIG.outputDir, 'security-dashboard.html');
    const htmlContent = this.generateSecurityDashboard();
    fs.writeFileSync(htmlDashboardPath, htmlContent);

    // Сохранение в историю
    const historicalDir = path.join(REPORT_CONFIG.outputDir, 'historical');
    if (!fs.existsSync(historicalDir)) {
      fs.mkdirSync(historicalDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().split('T')[0];
    const historicalPath = path.join(historicalDir, `security-report-${timestamp}.json`);
    fs.writeFileSync(historicalPath, JSON.stringify(this.consolidatedReport, null, 2));

    console.log(`   📄 Consolidated Report: ${jsonReportPath}`);
    console.log(`   👔 Executive Summary: ${executiveReportPath}`);
    console.log(`   🌐 Security Dashboard: ${htmlDashboardPath}`);
    console.log(`   📚 Historical Archive: ${historicalPath}`);
  }

  /**
   * Генерация исполнительного резюме
   */
  generateExecutiveSummary() {
    return {
      projectName: this.consolidatedReport.metadata.projectInfo.name,
      assessmentDate: this.consolidatedReport.metadata.timestamp,

      keyFindings: {
        securityScore: this.consolidatedReport.summary.securityScore,
        riskLevel: this.consolidatedReport.summary.riskLevel,
        criticalIssues: this.consolidatedReport.summary.issuesBySeverity.critical,
        highIssues: this.consolidatedReport.summary.issuesBySeverity.high,
        totalIssues: this.consolidatedReport.summary.totalIssues,
      },

      businessImpact: this.assessBusinessImpact(),

      immediateActions: this.consolidatedReport.recommendations
        .filter((rec) => rec.priority <= 2)
        .map((rec) => ({
          action: rec.title,
          timeframe: rec.timeframe,
          impact: rec.impact,
        })),

      complianceStatus: {
        owasp: this.consolidatedReport.complianceStatus?.owasp?.score || 'unknown',
        overall: this.consolidatedReport.complianceStatus?.summary?.overallCompliance || 'unknown',
      },

      trendAnalysis: this.consolidatedReport.trendAnalysis,

      nextSteps: [
        'Review and prioritize security recommendations',
        'Implement immediate fixes for critical vulnerabilities',
        'Schedule regular security assessments',
        'Update security policies and procedures',
      ],
    };
  }

  /**
   * Оценка влияния на бизнес
   */
  assessBusinessImpact() {
    const { critical, high } = this.consolidatedReport.summary.issuesBySeverity;

    if (critical > 0) {
      return {
        level: 'high',
        description:
          'Critical vulnerabilities pose immediate risk to business operations and data security.',
        financialRisk:
          'High potential for data breach costs, regulatory fines, and business disruption.',
        recommendations: [
          'Immediate security team mobilization',
          'Consider production deployment freeze',
          'Prepare incident response procedures',
        ],
      };
    }

    if (high > 5) {
      return {
        level: 'medium',
        description: 'Multiple high-severity vulnerabilities create elevated business risk.',
        financialRisk: 'Moderate risk of security incidents affecting operations.',
        recommendations: [
          'Accelerated security patching schedule',
          'Enhanced monitoring and detection',
          'Security team resource allocation',
        ],
      };
    }

    return {
      level: 'low',
      description: 'Security posture is acceptable with manageable risks.',
      financialRisk: 'Low likelihood of security incidents affecting business.',
      recommendations: [
        'Continue regular security maintenance',
        'Monitor for emerging threats',
        'Maintain security best practices',
      ],
    };
  }

  /**
   * Генерация HTML отчета (алиас для generateSecurityDashboard)
   */
  generateHtmlReport() {
    return this.generateSecurityDashboard();
  }

  /**
   * Генерация HTML дашборда
   */
  generateSecurityDashboard() {
    const riskColors = {
      low: '#10b981',
      medium: '#f59e0b',
      high: '#ef4444',
      critical: '#dc2626',
    };

    const severityColors = {
      critical: '#dc2626',
      high: '#ea580c',
      moderate: '#d97706',
      low: '#65a30d',
      info: '#3b82f6',
    };

    return `
<!DOCTYPE html>
<html>
<head>
    <title>Security Dashboard - ${this.consolidatedReport.metadata.projectInfo.name}</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: system-ui, -apple-system, sans-serif; background: #f8fafc; line-height: 1.5; }
        .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
        .header { background: white; padding: 20px; border-radius: 12px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .grid { display: grid; gap: 20px; }
        .grid-3 { grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); }
        .grid-4 { grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); }
        .card { background: white; border-radius: 12px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .score-card { text-align: center; padding: 30px; }
        .score-circle { width: 120px; height: 120px; border-radius: 50%; margin: 0 auto 15px; display: flex; align-items: center; justify-content: center; font-size: 32px; font-weight: bold; color: white; }
        .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 15px; text-align: center; }
        .stat-item h3 { font-size: 24px; margin-bottom: 5px; }
        .vulnerability-list { max-height: 400px; overflow-y: auto; }
        .vulnerability-item { padding: 10px; margin: 8px 0; border-radius: 6px; border-left: 4px solid; }
        .recommendation-item { background: #f1f5f9; padding: 15px; margin: 10px 0; border-radius: 8px; border-left: 4px solid #3b82f6; }
        .meta { color: #64748b; font-size: 14px; }
        .badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; color: white; }
        .trend { display: flex; align-items: center; gap: 5px; }
        .trend-up { color: #10b981; }
        .trend-down { color: #ef4444; }
        .trend-stable { color: #6b7280; }
    </style>
</head>
<body>
    <div class="container">
        <!-- Header -->
        <div class="header">
            <h1>🛡️ Security Dashboard</h1>
            <p class="meta">Project: ${this.consolidatedReport.metadata.projectInfo.name} | Generated: ${new Date(this.consolidatedReport.metadata.timestamp).toLocaleString()}</p>
        </div>
        
        <!-- Score and Risk Level -->
        <div class="grid grid-3" style="margin-bottom: 20px;">
            <div class="card score-card">
                <div class="score-circle" style="background: ${this.getScoreColor(this.consolidatedReport.summary.securityScore)};">
                    ${this.consolidatedReport.summary.securityScore}
                </div>
                <h2>Security Score</h2>
                <p class="meta">Out of 100 points</p>
            </div>
            
            <div class="card score-card">
                <div class="score-circle" style="background: ${riskColors[this.consolidatedReport.summary.riskLevel]};">
                    ${this.consolidatedReport.summary.riskLevel.toUpperCase()}
                </div>
                <h2>Risk Level</h2>
                <p class="meta">Overall security risk</p>
            </div>
            
            <div class="card">
                <h2>Coverage Status</h2>
                <div style="margin-top: 15px;">
                    ${Object.entries(this.consolidatedReport.summary.coverage)
                      .map(
                        ([type, covered]) => `
                        <div style="display: flex; justify-content: space-between; margin: 8px 0;">
                            <span>${type.replace('Coverage', '').toUpperCase()}</span>
                            <span class="badge" style="background: ${covered ? '#10b981' : '#ef4444'};">${covered ? 'COVERED' : 'MISSING'}</span>
                        </div>
                    `,
                      )
                      .join('')}
                </div>
            </div>
        </div>
        
        <!-- Vulnerability Statistics -->
        <div class="card" style="margin-bottom: 20px;">
            <h2>Vulnerability Overview</h2>
            <div class="stat-grid" style="margin-top: 15px;">
                ${Object.entries(this.consolidatedReport.summary.issuesBySeverity)
                  .map(
                    ([severity, count]) => `
                    <div class="stat-item">
                        <h3 style="color: ${severityColors[severity] || '#6b7280'};">${count}</h3>
                        <p>${severity.charAt(0).toUpperCase() + severity.slice(1)}</p>
                    </div>
                `,
                  )
                  .join('')}
            </div>
        </div>
        
        <!-- Top Vulnerabilities and Recommendations -->
        <div class="grid grid-3">
            <div class="card">
                <h2>Top Vulnerabilities</h2>
                <div class="vulnerability-list">
                    ${this.consolidatedReport.vulnerabilities
                      .slice(0, 10)
                      .map(
                        (vuln) => `
                        <div class="vulnerability-item ${vuln.severity}" style="border-left-color: ${severityColors[vuln.severity]};">
                            <h4>${vuln.title || vuln.message || 'Security Issue'}</h4>
                            <p class="meta">${vuln.source?.toUpperCase()} | ${vuln.severity?.toUpperCase()} | ${vuln.file || vuln.package || vuln.component || 'Unknown location'}</p>
                        </div>
                    `,
                      )
                      .join('')}
                </div>
            </div>
            
            <div class="card">
                <h2>Priority Recommendations</h2>
                <div>
                    ${this.consolidatedReport.recommendations
                      .slice(0, 5)
                      .map(
                        (rec) => `
                        <div class="recommendation-item">
                            <h4>${rec.title}</h4>
                            <p>${rec.description}</p>
                            <p class="meta">Priority: ${rec.priority} | ${rec.timeframe}</p>
                        </div>
                    `,
                      )
                      .join('')}
                </div>
            </div>
            
            <div class="card">
                <h2>Compliance Status</h2>
                <div style="margin-top: 15px;">
                    ${
                      this.consolidatedReport.complianceStatus
                        ? Object.entries(this.consolidatedReport.complianceStatus)
                            .slice(0, 3)
                            .map(
                              ([standard, status]) => `
                        <div style="margin: 10px 0; padding: 10px; background: #f8fafc; border-radius: 6px;">
                            <strong>${standard.toUpperCase()}</strong><br>
                            <span class="badge" style="background: ${status.score === 'compliant' ? '#10b981' : '#ef4444'}; margin-top: 5px;">
                                ${status.score || 'Unknown'}
                            </span>
                        </div>
                    `,
                            )
                            .join('')
                        : '<p class="meta">Compliance data not available</p>'
                    }
                </div>
            </div>
        </div>
        
        <!-- Trend Analysis -->
        ${
          this.consolidatedReport.trendAnalysis &&
          this.consolidatedReport.trendAnalysis.historicalData
            ? `
        <div class="card" style="margin-top: 20px;">
            <h2>Security Trends</h2>
            <div class="grid grid-3" style="margin-top: 15px;">
                <div>
                    <h3>Vulnerability Trend</h3>
                    <div class="trend trend-${this.consolidatedReport.trendAnalysis.vulnerabilityTrend === 'improving' ? 'up' : this.consolidatedReport.trendAnalysis.vulnerabilityTrend === 'declining' ? 'down' : 'stable'}">
                        ${this.getTrendIcon(this.consolidatedReport.trendAnalysis.vulnerabilityTrend)} ${this.consolidatedReport.trendAnalysis.vulnerabilityTrend}
                    </div>
                </div>
                <div>
                    <h3>Security Score Trend</h3>
                    <div class="trend trend-${this.consolidatedReport.trendAnalysis.scoreTrend === 'improving' ? 'up' : this.consolidatedReport.trendAnalysis.scoreTrend === 'declining' ? 'down' : 'stable'}">
                        ${this.getTrendIcon(this.consolidatedReport.trendAnalysis.scoreTrend)} ${this.consolidatedReport.trendAnalysis.scoreTrend}
                    </div>
                </div>
            </div>
        </div>
        `
            : ''
        }
    </div>
</body>
</html>`;
  }

  /**
   * Получение цвета для балла безопасности
   */
  getScoreColor(score) {
    if (score >= 90) return '#10b981';
    if (score >= 70) return '#f59e0b';
    if (score >= 50) return '#ef4444';
    return '#dc2626';
  }

  /**
   * Получение иконки тренда
   */
  getTrendIcon(trend) {
    switch (trend) {
      case 'improving':
        return '📈';
      case 'declining':
        return '📉';
      case 'stable':
        return '➡️';
      default:
        return '❓';
    }
  }

  /**
   * Вывод консолидированных результатов
   */
  printConsolidatedResults() {
    const colors = {
      reset: '\x1b[0m',
      bright: '\x1b[1m',
      red: '\x1b[31m',
      green: '\x1b[32m',
      yellow: '\x1b[33m',
      blue: '\x1b[34m',
      cyan: '\x1b[36m',
    };

    console.log('\n🛡️  CONSOLIDATED SECURITY REPORT');
    console.log('='.repeat(50));
    console.log(
      `${colors.bright}Project:${colors.reset} ${this.consolidatedReport.metadata.projectInfo.name}`,
    );
    console.log(
      `${colors.bright}Assessment Date:${colors.reset} ${new Date(this.consolidatedReport.metadata.timestamp).toLocaleDateString()}`,
    );
    console.log(
      `${colors.bright}Scanners Used:${colors.reset} ${this.consolidatedReport.metadata.scanners.join(', ')}`,
    );
    console.log(
      `${colors.bright}Report Duration:${colors.reset} ${(this.consolidatedReport.metadata.duration / 1000).toFixed(2)}s`,
    );

    console.log('\n📊 SECURITY METRICS');
    console.log('-'.repeat(30));
    const scoreColor =
      this.consolidatedReport.summary.securityScore >= 70
        ? colors.green
        : this.consolidatedReport.summary.securityScore >= 50
          ? colors.yellow
          : colors.red;
    console.log(
      `Security Score: ${scoreColor}${this.consolidatedReport.summary.securityScore}/100${colors.reset}`,
    );

    const riskColor =
      this.consolidatedReport.summary.riskLevel === 'low'
        ? colors.green
        : this.consolidatedReport.summary.riskLevel === 'medium'
          ? colors.yellow
          : colors.red;
    console.log(
      `Risk Level: ${riskColor}${this.consolidatedReport.summary.riskLevel.toUpperCase()}${colors.reset}`,
    );

    console.log('\n🔍 VULNERABILITY BREAKDOWN');
    console.log('-'.repeat(30));
    const { issuesBySeverity } = this.consolidatedReport.summary;
    console.log(`${colors.red}Critical: ${issuesBySeverity.critical}${colors.reset}`);
    console.log(`${colors.yellow}High: ${issuesBySeverity.high}${colors.reset}`);
    console.log(`${colors.cyan}Moderate: ${issuesBySeverity.moderate}${colors.reset}`);
    console.log(`${colors.blue}Low: ${issuesBySeverity.low}${colors.reset}`);
    console.log(`${colors.reset}Info: ${issuesBySeverity.info}${colors.reset}`);
    console.log(
      `${colors.bright}Total Issues: ${this.consolidatedReport.summary.totalIssues}${colors.reset}`,
    );

    console.log('\n💡 TOP RECOMMENDATIONS');
    console.log('-'.repeat(30));
    this.consolidatedReport.recommendations.slice(0, 3).forEach((rec, index) => {
      console.log(`${index + 1}. [${rec.category.toUpperCase()}] ${rec.title}`);
      console.log(`   ⏱️ ${rec.timeframe}`);
    });

    if (this.consolidatedReport.summary.totalIssues === 0) {
      console.log(`\n${colors.green}🎉 No security vulnerabilities found!${colors.reset}`);
    } else {
      const criticalHigh = issuesBySeverity.critical + issuesBySeverity.high;
      if (criticalHigh > 0) {
        console.log(
          `\n${colors.red}⚠️  IMMEDIATE ACTION REQUIRED: ${criticalHigh} high-priority vulnerabilities${colors.reset}`,
        );
      }
    }
  }

  /**
   * Определение вердикта безопасности
   */
  getSecurityVerdict() {
    const { critical, high } = this.consolidatedReport.summary.issuesBySeverity;
    const { securityScore } = this.consolidatedReport.summary;

    if (critical > 0) {
      console.log('\n🚨 SECURITY VERDICT: FAIL - Critical vulnerabilities detected');
      return 2;
    }

    if (high > REPORT_CONFIG.thresholds.highVulns) {
      console.log('\n⚠️ SECURITY VERDICT: WARNING - Too many high-severity vulnerabilities');
      return 1;
    }

    if (securityScore < REPORT_CONFIG.thresholds.securityScore) {
      console.log('\n⚠️ SECURITY VERDICT: WARNING - Security score below threshold');
      return 1;
    }

    console.log('\n✅ SECURITY VERDICT: PASS - Security posture acceptable');
    return 0;
  }
}

// Запуск если вызван напрямую
if (import.meta.url === `file://${process.argv[1]}`) {
  const consolidator = new SecurityReportConsolidator();
  consolidator
    .consolidateReports()
    .then((exitCode) => {
      process.exit(exitCode);
    })
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export default SecurityReportConsolidator;
