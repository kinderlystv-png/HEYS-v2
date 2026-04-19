#!/usr/bin/env node
/**
 * Скрипт автоматической проверки зависимостей на уязвимости
 * Анализирует npm/pnpm пакеты и выявляет известные уязвимости безопасности
 *
 * @created КТ4 - Автоматизация безопасности
 * @author HEYS Security Team
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Конфигурация проверки зависимостей
const DEPENDENCY_CONFIG = {
  projectRoot: path.resolve(__dirname, '../../'),
  outputDir: path.resolve(__dirname, '../../security-reports'),

  // Уровни критичности
  severityLevels: {
    critical: { threshold: 9.0, weight: 50 },
    high: { threshold: 7.0, weight: 20 },
    moderate: { threshold: 4.0, weight: 10 },
    low: { threshold: 0.1, weight: 5 },
  },

  // Пороги для принятия решений
  thresholds: {
    maxCritical: 0,
    maxHigh: 3,
    maxTotal: 15,
    allowedOutdated: 5,
  },

  // Уровни критичности уязвимостей
  severityLevels: {
    critical: { weight: 10, color: '\x1b[31m', threshold: 0 }, // Красный
    high: { weight: 7, color: '\x1b[33m', threshold: 0 }, // Желтый
    moderate: { weight: 4, color: '\x1b[36m', threshold: 5 }, // Голубой
    low: { weight: 1, color: '\x1b[32m', threshold: 10 }, // Зеленый
    info: { weight: 0, color: '\x1b[37m', threshold: 20 }, // Белый
  },

  // Исключения - пакеты которые можно игнорировать
  ignoredVulnerabilities: [
    // Добавить ID уязвимостей для игнорирования если необходимо
  ],

  // Критические пакеты, требующие особого внимания
  criticalPackages: [
    'express',
    'fastify',
    'koa', // Веб серверы
    'jsonwebtoken',
    'passport', // Аутентификация
    'bcrypt',
    'crypto-js', // Криптография
    'helmet',
    'cors', // Безопасность
    'pg',
    'mysql',
    'mongodb', // Базы данных
  ],
};

class DependencySecurityChecker {
  constructor() {
    this.config = { ...DEPENDENCY_CONFIG };

    this.results = {
      timestamp: new Date().toISOString(),
      scanType: 'dependency-security',
      projectInfo: {},
      packages: {
        total: 0,
        direct: 0,
        dev: 0,
        production: 0,
      },
      vulnerabilities: [],
      summary: {
        critical: 0,
        high: 0,
        moderate: 0,
        low: 0,
        info: 0,
        total: 0,
        score: 0,
      },
      recommendations: [],
    };
  }

  /**
   * Запуск полной проверки зависимостей
   */
  async runCheck() {
    console.log('📦 Starting Dependency Security Check...\n');

    try {
      // Анализируем проект
      await this.analyzeProject();

      // Выполняем аудит зависимостей
      await this.runDependencyAudit();

      // Проверяем критические пакеты
      await this.checkCriticalPackages();

      // Анализируем лицензии
      await this.analyzeLicenses();

      // Генерируем рекомендации
      await this.generateRecommendations();

      // Создаем отчеты
      await this.generateReports();

      // Выводим результаты
      this.printResults();

      return this.getExitCode();
    } catch (error) {
      console.error('❌ Dependency check failed:', error.message);
      return 1;
    }
  }

  /**
   * Анализ информации о проекте
   */
  async analyzeProject() {
    console.log('🔍 Analyzing project structure...');

    // Читаем package.json
    const projectRoot = this.config.projectRoot || DEPENDENCY_CONFIG.projectRoot;
    const packageJsonPath = path.join(projectRoot, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

      this.results.projectInfo = {
        name: packageJson.name || 'unknown',
        version: packageJson.version || '0.0.0',
        description: packageJson.description || '',
        dependencies: Object.keys(packageJson.dependencies || {}),
        devDependencies: Object.keys(packageJson.devDependencies || {}),
        engines: packageJson.engines || {},
      };

      this.results.packages.direct = this.results.projectInfo.dependencies.length;
      this.results.packages.dev = this.results.projectInfo.devDependencies.length;
      this.results.packages.production = this.results.packages.direct;
    }

    // Анализируем pnpm-lock.yaml для точного количества пакетов
    const lockfilePath = path.join(projectRoot, 'pnpm-lock.yaml');
    if (fs.existsSync(lockfilePath)) {
      try {
        const lockContent = fs.readFileSync(lockfilePath, 'utf8');
        // Примерное подсчет пакетов из lockfile
        const packageMatches = lockContent.match(/^\s{2}[a-zA-Z@]/gm);
        this.results.packages.total = packageMatches ? packageMatches.length : 0;
      } catch (error) {
        console.warn('⚠️ Could not parse lockfile for package count');
      }
    }

    console.log(`   📋 Project: ${this.results.projectInfo.name}`);
    console.log(`   📦 Direct dependencies: ${this.results.packages.direct}`);
    console.log(`   🔧 Dev dependencies: ${this.results.packages.dev}`);
    console.log(`   📊 Total packages: ${this.results.packages.total}`);
  }

  /**
   * Выполнение аудита зависимостей
   */
  async runDependencyAudit() {
    console.log('\n🔍 Running dependency audit...');

    try {
      // Запускаем pnpm audit для получения JSON отчета
      const auditOutput = execSync('pnpm audit --json', {
        cwd: this.config.projectRoot || DEPENDENCY_CONFIG.projectRoot,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Парсим результаты аудита
      const auditLines = auditOutput.trim().split('\n');
      for (const line of auditLines) {
        try {
          const auditData = JSON.parse(line);

          if (auditData.type === 'auditAdvisory') {
            const advisory = auditData.data.advisory;
            const vulnerability = {
              id: advisory.id,
              title: advisory.title,
              severity: advisory.severity,
              package: advisory.module_name,
              versions: advisory.vulnerable_versions,
              patched: advisory.patched_versions,
              recommendation: advisory.recommendation,
              overview: advisory.overview,
              references: advisory.references || [],
              cwe: advisory.cwe || [],
              cvss: advisory.cvss || {},
              found: auditData.data.resolution || {},
              timestamp: new Date().toISOString(),
            };

            // Проверяем, не игнорируется ли эта уязвимость
            if (!DEPENDENCY_CONFIG.ignoredVulnerabilities.includes(vulnerability.id)) {
              this.results.vulnerabilities.push(vulnerability);
              this.results.summary[vulnerability.severity]++;
              this.results.summary.total++;
            }
          }
        } catch (parseError) {
          // Игнорируем строки, которые не являются JSON
        }
      }
    } catch (error) {
      // pnpm audit может возвращать ненулевой код при наличии уязвимостей
      if (error.status !== 1) {
        console.warn('⚠️ Audit command failed:', error.message);
      }

      // Пытаемся парсить вывод даже при ошибке
      if (error.stdout) {
        try {
          const auditLines = error.stdout.trim().split('\n');
          for (const line of auditLines) {
            try {
              const auditData = JSON.parse(line);
              if (auditData.type === 'auditAdvisory') {
                // Аналогичная обработка как выше
                const advisory = auditData.data.advisory;
                const vulnerability = {
                  id: advisory.id,
                  title: advisory.title,
                  severity: advisory.severity,
                  package: advisory.module_name,
                  versions: advisory.vulnerable_versions,
                  patched: advisory.patched_versions,
                  recommendation: advisory.recommendation,
                  overview: advisory.overview,
                  references: advisory.references || [],
                  cwe: advisory.cwe || [],
                  cvss: advisory.cvss || {},
                  found: auditData.data.resolution || {},
                  timestamp: new Date().toISOString(),
                };

                if (!DEPENDENCY_CONFIG.ignoredVulnerabilities.includes(vulnerability.id)) {
                  this.results.vulnerabilities.push(vulnerability);
                  this.results.summary[vulnerability.severity]++;
                  this.results.summary.total++;
                }
              }
            } catch (parseError) {
              // Игнорируем
            }
          }
        } catch (parseError) {
          console.warn('⚠️ Could not parse audit output');
        }
      }
    }

    console.log(`   🔍 Found ${this.results.summary.total} vulnerabilities`);
  }

  /**
   * Проверка критических пакетов
   */
  async checkCriticalPackages() {
    console.log('\n🛡️ Checking critical packages...');

    const criticalVulns = this.results.vulnerabilities.filter((vuln) =>
      DEPENDENCY_CONFIG.criticalPackages.includes(vuln.package),
    );

    if (criticalVulns.length > 0) {
      console.log(`   ⚠️ Found ${criticalVulns.length} vulnerabilities in critical packages:`);
      criticalVulns.forEach((vuln) => {
        console.log(`      - ${vuln.package}: ${vuln.title} (${vuln.severity})`);
      });
    } else {
      console.log('   ✅ No vulnerabilities found in critical packages');
    }
  }

  /**
   * Анализ лицензий пакетов
   */
  async analyzeLicenses() {
    console.log('\n📄 Analyzing package licenses...');

    try {
      // Используем license-checker для анализа лицензий
      const licenseOutput = execSync(
        'npx license-checker --json --onlyAllow "MIT;Apache-2.0;BSD-2-Clause;BSD-3-Clause;ISC"',
        {
          cwd: this.config.projectRoot || DEPENDENCY_CONFIG.projectRoot,
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      );

      const licenses = JSON.parse(licenseOutput);
      const licenseStats = {};

      Object.values(licenses).forEach((pkg) => {
        const license = pkg.licenses || 'Unknown';
        licenseStats[license] = (licenseStats[license] || 0) + 1;
      });

      console.log('   📊 License distribution:');
      Object.entries(licenseStats)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .forEach(([license, count]) => {
          console.log(`      ${license}: ${count} packages`);
        });
    } catch (error) {
      console.log('   ⚠️ License analysis not available (install license-checker)');
    }
  }

  /**
   * Генерация рекомендаций по безопасности
   */
  async generateRecommendations() {
    console.log('\n💡 Generating security recommendations...');

    const recommendations = [];

    // Рекомендации по уязвимостям
    if (this.results.summary.critical > 0) {
      recommendations.push({
        type: 'critical',
        title: 'Immediate Action Required',
        description: `Found ${this.results.summary.critical} critical vulnerabilities. Update or replace affected packages immediately.`,
        priority: 1,
      });
    }

    if (this.results.summary.high > 0) {
      recommendations.push({
        type: 'high',
        title: 'High Priority Updates',
        description: `Found ${this.results.summary.high} high severity vulnerabilities. Schedule updates within 24-48 hours.`,
        priority: 2,
      });
    }

    // Рекомендации по устаревшим пакетам
    if (!this.config.skipOutdatedCheck) {
      try {
        const outdatedOutput = execSync('pnpm outdated --format=json', {
          cwd: this.config.projectRoot || DEPENDENCY_CONFIG.projectRoot,
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        const outdated = JSON.parse(outdatedOutput);
        if (Object.keys(outdated).length > 0) {
          recommendations.push({
            type: 'maintenance',
            title: 'Package Updates Available',
            description: `${Object.keys(outdated).length} packages have newer versions available. Regular updates improve security.`,
            priority: 3,
          });
        }
      } catch (error) {
        // Игнорируем ошибки проверки устаревших пакетов
      }
    }

    // Общие рекомендации
    if (this.results.packages.total > 500) {
      recommendations.push({
        type: 'optimization',
        title: 'Large Dependency Tree',
        description:
          'Consider reviewing and reducing the number of dependencies to minimize attack surface.',
        priority: 4,
      });
    }

    this.results.recommendations = recommendations;

    recommendations.forEach((rec, index) => {
      console.log(`   ${index + 1}. [${rec.type.toUpperCase()}] ${rec.title}`);
      console.log(`      ${rec.description}`);
    });
  }

  /**
   * Генерация отчетов
   */
  async generateReports() {
    console.log('\n📊 Generating dependency security reports...');

    // Создаем директорию если не существует
    const outputDir = this.config.outputDir || DEPENDENCY_CONFIG.outputDir;
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // JSON отчет
    const jsonReportPath = path.join(
      outputDir,
      'dependency-security-report.json',
    );
    fs.writeFileSync(jsonReportPath, JSON.stringify(this.results, null, 2));

    // HTML отчет
    const htmlReportPath = path.join(
      outputDir,
      'dependency-security-report.html',
    );
    const htmlContent = this.generateHtmlReport();
    fs.writeFileSync(htmlReportPath, htmlContent);

    // CSV отчет для анализа
    const csvReportPath = path.join(outputDir, 'dependency-vulnerabilities.csv');
    const csvContent = this.generateCsvReport();
    fs.writeFileSync(csvReportPath, csvContent);

    console.log(`   📄 JSON Report: ${jsonReportPath}`);
    console.log(`   🌐 HTML Report: ${htmlReportPath}`);
    console.log(`   📊 CSV Report: ${csvReportPath}`);
  }

  /**
   * Генерация HTML отчета
   */
  generateHtmlReport() {
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
    <title>Dependency Security Report - HEYS</title>
    <meta charset="UTF-8">
    <style>
        body { font-family: system-ui; margin: 0; padding: 20px; background: #f8fafc; }
        .container { max-width: 1200px; margin: 0 auto; }
        .header { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin: 20px 0; }
        .stat-card { background: white; padding: 15px; border-radius: 8px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .vulnerability { background: white; margin: 10px 0; border-radius: 8px; border-left: 4px solid; padding: 15px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .critical { border-left-color: ${severityColors.critical}; }
        .high { border-left-color: ${severityColors.high}; }
        .moderate { border-left-color: ${severityColors.moderate}; }
        .low { border-left-color: ${severityColors.low}; }
        .info { border-left-color: ${severityColors.info}; }
        .meta { color: #64748b; font-size: 14px; }
        .recommendation { background: #f1f5f9; padding: 10px; border-radius: 4px; margin: 10px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📦 Dependency Security Report</h1>
            <p class="meta">Project: ${this.results.projectInfo.name} v${this.results.projectInfo.version}</p>
            <p class="meta">Generated: ${this.results.timestamp}</p>
        </div>
        
        <div class="stats">
            <div class="stat-card">
                <h3>Total Packages</h3>
                <p style="font-size: 24px; margin: 5px 0; color: #3b82f6;">${this.results.packages.total}</p>
            </div>
            <div class="stat-card">
                <h3>Direct Dependencies</h3>
                <p style="font-size: 24px; margin: 5px 0; color: #059669;">${this.results.packages.direct}</p>
            </div>
            <div class="stat-card">
                <h3>Total Vulnerabilities</h3>
                <p style="font-size: 24px; margin: 5px 0; color: #dc2626;">${this.results.summary.total}</p>
            </div>
            <div class="stat-card">
                <h3>Critical</h3>
                <p style="font-size: 24px; margin: 5px 0; color: ${severityColors.critical};">${this.results.summary.critical}</p>
            </div>
            <div class="stat-card">
                <h3>High</h3>
                <p style="font-size: 24px; margin: 5px 0; color: ${severityColors.high};">${this.results.summary.high}</p>
            </div>
        </div>
        
        <h2>Vulnerabilities</h2>
        ${this.results.vulnerabilities
        .map(
          (vuln) => `
            <div class="vulnerability ${vuln.severity}">
                <h3>${vuln.title}</h3>
                <p class="meta">Package: ${vuln.package} | Severity: ${vuln.severity.toUpperCase()} | ID: ${vuln.id}</p>
                <p>${vuln.overview}</p>
                <div class="recommendation">
                    <strong>Recommendation:</strong> ${vuln.recommendation}
                </div>
                <p class="meta">Vulnerable versions: ${vuln.versions} | Patched: ${vuln.patched || 'Not available'}</p>
            </div>
        `,
        )
        .join('')}
        
        <h2>Security Recommendations</h2>
        ${this.results.recommendations
        .map(
          (rec) => `
            <div class="vulnerability info">
                <h3>[${rec.type.toUpperCase()}] ${rec.title}</h3>
                <p>${rec.description}</p>
            </div>
        `,
        )
        .join('')}
    </div>
</body>
</html>`;
  }

  /**
   * Генерация CSV отчета
   */
  generateCsvReport() {
    const headers = [
      'ID',
      'Package',
      'Title',
      'Severity',
      'Vulnerable Versions',
      'Patched Versions',
      'Overview',
    ];
    const rows = this.results.vulnerabilities.map((vuln) => [
      vuln.id,
      vuln.package,
      vuln.title.replace(/,/g, ';'),
      vuln.severity,
      vuln.versions,
      vuln.patched || 'N/A',
      vuln.overview.replace(/,/g, ';').substring(0, 200),
    ]);

    return [headers, ...rows].map((row) => row.join(',')).join('\n');
  }

  /**
   * Вывод результатов
   */
  printResults() {
    const colors = DEPENDENCY_CONFIG.severityLevels;
    const reset = '\x1b[0m';

    console.log('\n📦 Dependency Security Check Results');
    console.log('=====================================');
    console.log(`📋 Project: ${this.results.projectInfo.name}`);
    console.log(`📊 Total packages: ${this.results.packages.total}`);
    console.log(`🔍 Vulnerabilities found: ${this.results.summary.total}`);

    Object.entries(this.results.summary).forEach(([severity, count]) => {
      if (severity !== 'total' && severity !== 'score' && count > 0) {
        const config = colors[severity];
        if (config) {
          console.log(
            `${config.color}${severity.charAt(0).toUpperCase() + severity.slice(1)}: ${count}${reset}`,
          );
        }
      }
    });

    if (this.results.summary.total === 0) {
      console.log('\n🎉 No vulnerabilities found in dependencies!');
    } else {
      console.log(
        `\n⚠️ Action required for ${this.results.summary.critical + this.results.summary.high} high-priority vulnerabilities`,
      );
    }
  }

  /**
   * Определение кода выхода
   */
  getExitCode() {
    const { critical, high } = this.results.summary;

    if (critical > 0) return 2; // Критические уязвимости
    if (high > 0) return 1; // Высокие уязвимости
    return 0; // Нет критических/высоких уязвимостей
  }
}

// Запуск если вызван напрямую
if (import.meta.url === `file://${process.argv[1]}`) {
  const checker = new DependencySecurityChecker();
  checker
    .runCheck()
    .then((exitCode) => {
      process.exit(exitCode);
    })
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export default DependencySecurityChecker;
