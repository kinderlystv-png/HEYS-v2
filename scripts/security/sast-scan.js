#!/usr/bin/env node
/**
 * SAST (Static Application Security Testing) сканер
 * Автоматически анализирует код на предмет уязвимостей безопасности
 *
 * @created КТ4 - Автоматизация безопасности
 * @author HEYS Security Team
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Конфигурация сканирования
const SCAN_CONFIG = {
  projectRoot: path.resolve(__dirname, '../../'),
  outputDir: path.resolve(__dirname, '../../security-reports'),

  // Паттерны файлов для сканирования
  scanPatterns: [
    'apps/**/*.{ts,tsx,js,jsx}',
    'packages/**/*.{ts,tsx,js,jsx}',
    'src/**/*.{ts,tsx,js,jsx}',
  ],

  // Исключения из сканирования
  excludePatterns: [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/*.test.{ts,tsx,js,jsx}',
    '**/*.spec.{ts,tsx,js,jsx}',
    '**/coverage/**',
  ],

  // Правила безопасности
  securityRules: {
    // SQL Injection
    sqlInjection: {
      patterns: [
        /\$\{[^}]*\}.*query/gi,
        /query.*\+.*\$\{/gi,
        /sql.*\+.*\$\{/gi,
        /SELECT.*\+.*\$\{/gi,
        /query\s*=\s*['"`].*\+\s*[a-zA-Z_][a-zA-Z0-9_]*/gi,
        /SELECT\s+.*\s+FROM\s+.*\+\s*[a-zA-Z_][a-zA-Z0-9_]*/gi,
        /INSERT.*\+.*\$\{/gi,
        /UPDATE.*\+.*\$\{/gi,
        /DELETE.*\+.*\$\{/gi,
      ],
      severity: 'critical',
      description: 'Potential SQL Injection vulnerability',
    },

    // XSS (Cross-Site Scripting)
    xss: {
      patterns: [
        /dangerouslySetInnerHTML/gi,
        /innerHTML\s*=\s*[^'"]*\$\{/gi,
        /document\.write\(/gi,
        /eval\s*\(/gi,
        /new\s+Function\s*\(/gi,
      ],
      severity: 'high',
      description: 'Potential XSS vulnerability',
    },

    // Небезопасные операции
    insecureOperations: {
      patterns: [
        /Math\.random\(\)/gi,
        /Date\.now\(\)/gi,
        /new\s+Date\(\)\.getTime\(\)/gi,
        /crypto\.pseudoRandomBytes/gi,
      ],
      severity: 'medium',
      description: 'Use of cryptographically insecure random number generation',
    },

    // Жестко заданные секреты
    hardcodedSecrets: {
      patterns: [
        /password\s*=\s*['"][^'"]+['"]/gi,
        /api[_-]?key\s*=\s*['"][^'"]+['"]/gi,
        /secret\s*=\s*['"][^'"]+['"]/gi,
        /token\s*=\s*['"][^'"]+['"]/gi,
        /AKIA[0-9A-Z]{16}/gi, // AWS Access Key
        /sk_live_[0-9a-zA-Z]{24}/gi, // Stripe Secret Key
        /ghp_[0-9a-zA-Z]{36}/gi, // GitHub Personal Access Token
      ],
      severity: 'critical',
      description: 'Potential hardcoded secret or API key',
    },

    // Небезопасные HTTP запросы
    insecureHttp: {
      patterns: [
        /http:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0)/gi,
        /fetch\s*\(\s*['"]http:/gi,
        /axios\.[get|post|put|delete]\s*\(\s*['"]http:/gi,
      ],
      severity: 'medium',
      description: 'Use of insecure HTTP instead of HTTPS',
    },

    // Небезопасные разрешения CORS
    insecureCors: {
      patterns: [
        /Access-Control-Allow-Origin\s*:\s*\*/gi,
        /cors\s*\(\s*\{\s*origin\s*:\s*true/gi,
        /cors\s*\(\s*\{\s*origin\s*:\s*['"]?\*/gi,
      ],
      severity: 'medium',
      description: 'Insecure CORS configuration',
    },

    // Отладочная информация
    debugInformation: {
      patterns: [
        /console\.log\s*\(.*password/gi,
        /console\.log\s*\(.*token/gi,
        /console\.log\s*\(.*secret/gi,
        /console\.log\s*\(.*key/gi,
        /alert\s*\(.*password/gi,
      ],
      severity: 'low',
      description: 'Potential information disclosure through debug output',
    },
  },
};

class SASTScanner {
  constructor() {
    this.config = {
      ...SCAN_CONFIG,
      securityRules: { ...SCAN_CONFIG.securityRules },
      targetPaths: [SCAN_CONFIG.projectRoot],
    };

    this.results = {
      timestamp: new Date().toISOString(),
      scannedFiles: 0,
      vulnerabilities: [],
      summary: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        total: 0,
      },
    };
  }

  /**
   * Запуск полного SAST сканирования
   */
  async runScan() {
    console.log('🛡️ Starting SAST Security Scan...\n');

    this.results = {
      timestamp: new Date().toISOString(),
      scannedFiles: 0,
      vulnerabilities: [],
      summary: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        total: 0,
      },
    };

    try {
      // Создаем директорию для отчетов
      this.ensureOutputDirectory();

      // Получаем файлы для сканирования
      const filesToScan = await this.getFilesToScan();
      console.log(`📁 Found ${filesToScan.length} files to scan`);

      // Сканируем каждый файл
      for (const filePath of filesToScan) {
        await this.scanFile(filePath);
      }

      // Генерируем отчет
      await this.generateReport();

      // Выводим результаты
      this.printResults();

      return this.results;
    } catch (error) {
      console.error('❌ SAST scan failed:', error.message);
      this.results.error = error.message;
      return this.results;
    }
  }

  /**
   * Получение списка файлов для сканирования
   */
  async getFilesToScan() {
    const files = new Set();
    const extensions = new Set(['.ts', '.tsx', '.js', '.jsx']);
    const targetPaths =
      Array.isArray(this.config.targetPaths) && this.config.targetPaths.length > 0
        ? this.config.targetPaths
        : [this.config.projectRoot];

    const shouldExclude = (filePath) => {
      const normalized = filePath.replace(/\\/g, '/');
      if (
        normalized.includes('/node_modules/') ||
        normalized.includes('/dist/') ||
        normalized.includes('/build/') ||
        normalized.includes('/coverage/')
      ) {
        return true;
      }
      return /\.(test|spec)\.[jt]sx?$/.test(normalized);
    };

    const walk = (entryPath) => {
      if (!fs.existsSync(entryPath)) return;

      const stat = fs.statSync(entryPath);
      if (stat.isDirectory()) {
        for (const child of fs.readdirSync(entryPath)) {
          walk(path.join(entryPath, child));
        }
        return;
      }

      if (!extensions.has(path.extname(entryPath))) return;
      if (shouldExclude(entryPath)) return;
      files.add(entryPath);
    };

    for (const targetPath of targetPaths) {
      walk(path.resolve(targetPath));
    }

    return [...files];
  }

  /**
   * Сканирование отдельного файла
   */
  async scanFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const relativePath = path.relative(this.config.projectRoot, filePath);

      this.results.scannedFiles++;

      // Применяем все правила безопасности
      for (const [ruleName, rule] of Object.entries(this.config.securityRules)) {
        for (const pattern of rule.patterns) {
          const matches = [...content.matchAll(new RegExp(pattern, 'gi'))];

          for (const match of matches) {
            const lineNumber = this.getLineNumber(content, match.index);

            const normalizedRule = this.normalizeRuleName(ruleName);
            const vulnerability = {
              id: `${ruleName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              file: relativePath,
              line: lineNumber,
              rule: normalizedRule,
              ruleKey: ruleName,
              severity: rule.severity,
              description: rule.description,
              message: rule.description,
              evidence: match[0].trim(),
              recommendation: this.getRecommendation(ruleName),
              timestamp: new Date().toISOString(),
            };

            this.results.vulnerabilities.push(vulnerability);
            this.results.summary[rule.severity]++;
            this.results.summary.total++;
          }
        }
      }
    } catch (error) {
      console.warn(`⚠️ Failed to scan ${filePath}: ${error.message}`);
    }
  }

  normalizeRuleName(ruleName) {
    const aliases = {
      sqlInjection: 'sql-injection',
      xss: 'xss-vulnerability',
      hardcodedSecrets: 'hardcoded-secrets',
      insecureOperations: 'insecure-operations',
      insecureHttp: 'insecure-http',
      insecureCors: 'insecure-cors',
      debugInformation: 'debug-information',
    };

    return aliases[ruleName] || ruleName;
  }

  /**
   * Получение номера строки по индексу символа
   */
  getLineNumber(content, index) {
    const lines = content.substring(0, index).split('\n');
    return lines.length;
  }

  /**
   * Получение рекомендации по исправлению уязвимости
   */
  getRecommendation(ruleName) {
    const recommendations = {
      sqlInjection: 'Use parameterized queries or ORM methods instead of string concatenation',
      xss: 'Sanitize user input and use safe DOM manipulation methods',
      insecureOperations: 'Use cryptographically secure random number generators',
      hardcodedSecrets: 'Move secrets to environment variables or secure key management',
      insecureHttp: 'Use HTTPS for all external communications',
      insecureCors: 'Configure CORS with specific allowed origins',
      debugInformation: 'Remove debug statements that expose sensitive information',
    };

    return recommendations[ruleName] || 'Review and fix the identified security issue';
  }

  /**
   * Создание директории для отчетов
   */
  ensureOutputDirectory() {
    if (!fs.existsSync(this.config.outputDir)) {
      fs.mkdirSync(this.config.outputDir, { recursive: true });
    }
  }

  /**
   * Генерация отчета о сканировании
   */
  async generateReport() {
    const reportData = {
      ...this.results,
      scanConfig: {
        patterns: this.config.scanPatterns,
        excludes: this.config.excludePatterns,
        rules: Object.keys(this.config.securityRules),
      },
    };

    // JSON отчет
    const jsonReportPath = path.join(this.config.outputDir, 'sast-report.json');
    fs.writeFileSync(jsonReportPath, JSON.stringify(reportData, null, 2));

    // HTML отчет
    const htmlReportPath = path.join(this.config.outputDir, 'sast-report.html');
    const htmlContent = this.generateHtmlReport(reportData);
    fs.writeFileSync(htmlReportPath, htmlContent);

    // SARIF отчет для GitHub
    const sarifReportPath = path.join(this.config.outputDir, 'sast-report.sarif');
    const sarifContent = this.generateSarifReport(reportData);
    fs.writeFileSync(sarifReportPath, JSON.stringify(sarifContent, null, 2));

    console.log(`📊 Reports generated:`);
    console.log(`   📄 JSON: ${jsonReportPath}`);
    console.log(`   🌐 HTML: ${htmlReportPath}`);
    console.log(`   📋 SARIF: ${sarifReportPath}`);
  }

  /**
   * Генерация HTML отчета
   */
  generateHtmlReport(data) {
    const severityColors = {
      critical: '#dc2626',
      high: '#ea580c',
      medium: '#d97706',
      low: '#65a30d',
    };

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SAST Security Report - HEYS</title>
    <style>
        body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 20px; background: #f8fafc; }
        .container { max-width: 1200px; margin: 0 auto; }
        .header { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px; }
        .summary-card { background: white; padding: 20px; border-radius: 8px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .vulnerability { background: white; margin-bottom: 15px; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .vuln-header { padding: 15px; border-left: 4px solid; }
        .vuln-body { padding: 0 15px 15px; }
        .severity-critical { border-left-color: ${severityColors.critical}; }
        .severity-high { border-left-color: ${severityColors.high}; }
        .severity-medium { border-left-color: ${severityColors.medium}; }
        .severity-low { border-left-color: ${severityColors.low}; }
        .code { background: #f1f5f9; padding: 10px; border-radius: 4px; font-family: monospace; margin: 10px 0; }
        .meta { color: #64748b; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🛡️ SAST Security Report</h1>
            <p class="meta">Generated: ${data.timestamp} | Files Scanned: ${data.scannedFiles}</p>
        </div>
        
        <div class="summary">
            <div class="summary-card">
                <h3 style="color: ${severityColors.critical}; margin: 0;">Critical</h3>
                <p style="font-size: 24px; margin: 10px 0;">${data.summary.critical}</p>
            </div>
            <div class="summary-card">
                <h3 style="color: ${severityColors.high}; margin: 0;">High</h3>
                <p style="font-size: 24px; margin: 10px 0;">${data.summary.high}</p>
            </div>
            <div class="summary-card">
                <h3 style="color: ${severityColors.medium}; margin: 0;">Medium</h3>
                <p style="font-size: 24px; margin: 10px 0;">${data.summary.medium}</p>
            </div>
            <div class="summary-card">
                <h3 style="color: ${severityColors.low}; margin: 0;">Low</h3>
                <p style="font-size: 24px; margin: 10px 0;">${data.summary.low}</p>
            </div>
        </div>
        
        <h2>Vulnerabilities</h2>
        ${data.vulnerabilities
        .map(
          (vuln) => `
            <div class="vulnerability">
                <div class="vuln-header severity-${vuln.severity}">
                    <h3 style="margin: 0;">${vuln.description}</h3>
                    <p class="meta">${vuln.file}:${vuln.line} | Rule: ${vuln.rule} | Severity: ${vuln.severity.toUpperCase()}</p>
                </div>
                <div class="vuln-body">
                    <div class="code">${vuln.evidence}</div>
                    <p><strong>Recommendation:</strong> ${vuln.recommendation}</p>
                </div>
            </div>
        `,
        )
        .join('')}
    </div>
</body>
</html>`;
  }

  /**
   * Генерация SARIF отчета для GitHub
   */
  generateSarifReport(data) {
    return {
      version: '2.1.0',
      $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
      runs: [
        {
          tool: {
            driver: {
              name: 'HEYS SAST Scanner',
              version: '1.0.0',
              informationUri: 'https://github.com/kinderlystv-png/HEYS-v2',
            },
          },
          results: data.vulnerabilities.map((vuln) => ({
            ruleId: vuln.rule,
            level:
              vuln.severity === 'critical'
                ? 'error'
                : vuln.severity === 'high'
                  ? 'error'
                  : vuln.severity === 'medium'
                    ? 'warning'
                    : 'note',
            message: {
              text: vuln.description,
            },
            locations: [
              {
                physicalLocation: {
                  artifactLocation: {
                    uri: vuln.file,
                  },
                  region: {
                    startLine: vuln.line,
                    snippet: {
                      text: vuln.evidence,
                    },
                  },
                },
              },
            ],
          })),
        },
      ],
    };
  }

  /**
   * Вывод результатов сканирования
   */
  printResults() {
    console.log('\n🛡️ SAST Security Scan Results');
    console.log('================================');
    console.log(`📁 Files scanned: ${this.results.scannedFiles}`);
    console.log(`🔍 Total vulnerabilities: ${this.results.summary.total}`);
    console.log(`🚨 Critical: ${this.results.summary.critical}`);
    console.log(`⚠️  High: ${this.results.summary.high}`);
    console.log(`📋 Medium: ${this.results.summary.medium}`);
    console.log(`ℹ️  Low: ${this.results.summary.low}`);

    if (this.results.summary.total === 0) {
      console.log('\n🎉 No security vulnerabilities found!');
    } else {
      console.log('\n📊 Top vulnerabilities by type:');
      const ruleStats = {};
      this.results.vulnerabilities.forEach((v) => {
        ruleStats[v.rule] = (ruleStats[v.rule] || 0) + 1;
      });

      Object.entries(ruleStats)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .forEach(([rule, count]) => {
          console.log(`   ${rule}: ${count} issues`);
        });
    }
  }

  /**
   * Определение кода выхода на основе найденных уязвимостей
   */
  getExitCode() {
    if (this.results.summary.critical > 0) return 2; // Критические уязвимости
    if (this.results.summary.high > 0) return 1; // Высокие уязвимости
    return 0; // Нет критических или высоких уязвимостей
  }
}

// Запуск сканирования, если скрипт выполняется напрямую
if (import.meta.url === `file://${process.argv[1]}`) {
  const scanner = new SASTScanner();
  scanner
    .runScan()
    .then(() => {
      process.exit(scanner.getExitCode());
    })
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export default SASTScanner;
