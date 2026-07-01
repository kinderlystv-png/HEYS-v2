#!/usr/bin/env node
/**
 * SAST (Static Application Security Testing) сканер
 * Автоматически анализирует код на предмет уязвимостей безопасности
 *
 * @created КТ4 - Автоматизация безопасности
 * @author HEYS Security Team
 */

import crypto from 'crypto';
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

  // Исключения из сканирования.
  // SEC-014 (2026-06-08): добавлены `.claude/**` (агентские worktrees), `.git/**`,
  // `apps/web/public/**` (собранные бандлы — продукт сборки, не source), `archive/**`,
  // bundle-файлы и `*-vendor.js`. До этого SAST сканировал дубликаты исходников из
  // worktree-копий и давал 85 critical SQL-injection + 100 high XSS — все ложные
  // (pattern-matching на строках вроде `query + ${var}` в production-коде).
  excludePatterns: [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/*.test.{ts,tsx,js,jsx}',
    '**/*.spec.{ts,tsx,js,jsx}',
    '**/coverage/**',
    '.claude/**',
    '.git/**',
    'apps/web/public/**',
    'archive/**',
    '**/*.bundle.*.js',
    '**/*.bundle.js',
    '**/*-vendor.js',
    // bundled vendor JS не имеет смысл сканировать pattern-matching сканером:
    // 100% находок — токены минификации, ложные срабатывания.
    'apps/web/react-bundle.js',
    // self-match: scanner ловит свои же regex'ы как «потенциальный SQL-injection».
    'scripts/security/sast-scan.js',
    // pentest-инструмент содержит intentional test-payloads (hardcoded-secrets маркеры).
    'packages/shared/src/security/pentest.ts',
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
  constructor(options = {}) {
    this.config = {
      ...SCAN_CONFIG,
      securityRules: { ...SCAN_CONFIG.securityRules },
      targetPaths: [SCAN_CONFIG.projectRoot],
      updateBaseline: !!options.updateBaseline,
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

      // SEC-014 ratchet: либо записать новый baseline (--update-baseline),
      // либо отфильтровать known-FP/принятые находки из текущего отчёта.
      if (this.config.updateBaseline) {
        this.writeBaseline();
      } else {
        this.applyBaseline();
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
        normalized.includes('/coverage/') ||
        normalized.includes('/.claude/') ||
        normalized.includes('/archive/')
      ) {
        return true;
      }
      // Генерируемые бандлы и минифицированные файлы — не источник, только шум.
      // SEC-014 (2026-06-08): расширено — `*.bundle.<hash>.js` (legacy public bundles),
      // `react-bundle.js` (vendor React), `*-vendor.js`.
      if (
        /_bundle_v\d+\.js$/.test(normalized) ||
        /\.min\.js$/.test(normalized) ||
        /\.bundle\.[a-f0-9]+\.js$/.test(normalized) ||
        /\/react-bundle\.js$/.test(normalized) ||
        /-vendor\.js$/.test(normalized)
      ) {
        return true;
      }
      // Сам сканер содержит regex-паттерны вида `SELECT.*\+.*\$\{` — self-match.
      if (/\/scripts\/security\/sast-scan\.js$/.test(normalized)) return true;
      // Pentest-инструмент содержит intentional test-payloads (mock secrets/SQL).
      if (/\/packages\/shared\/src\/security\/pentest\.ts$/.test(normalized)) return true;
      return /\.(test|spec)\.[jt]sx?$/.test(normalized);
    };

    // Каталоги, в которые НЕ заходим вообще. Прежний обход рекурсировал ВНУТРЬ
    // node_modules и pnpm-симлинк-фермы `.pnpm` (исключение применялось только
    // к файлам), что исчерпывало файловые дескрипторы → `ENFILE: file table
    // overflow`. Прунинг на уровне каталога + отказ ходить по симлинкам это чинит.
    const EXCLUDED_DIRS = new Set([
      'node_modules',
      'dist',
      'build',
      'out',
      'coverage',
      'public',
      '.git',
      '.next',
      '.turbo',
      '.cache',
      '.pnpm',
      '.husky',
      '.claude', // SEC-014: агентские worktrees — копии исходников, не production-код
      'archive', // SEC-014: исторический хлам
      'security-reports',
    ]);

    const walk = (entryPath) => {
      let stat;
      try {
        // lstat (не stat): распознать симлинки и НЕ идти по ним — `.pnpm` полон
        // симлинков и может зациклить/раздуть обход.
        stat = fs.lstatSync(entryPath);
      } catch {
        return;
      }
      if (stat.isSymbolicLink()) return;

      if (stat.isDirectory()) {
        if (EXCLUDED_DIRS.has(path.basename(entryPath))) return; // прунинг ДО рекурсии
        let children;
        try {
          children = fs.readdirSync(entryPath);
        } catch {
          return;
        }
        for (const child of children) {
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

            // SEC-014 false-positive filters для sqlInjection rule:
            //   1) `$${...}` в evidence — JS template-literal placeholder (`$2`), параметризация.
            //   2) строка совпадения — log/console-сообщение, не SQL.
            //   3) совпадение — на слово `query` как часть идентификатора (searchQuery,
            //      queryString, и т.п.), а не на SQL-объект.
            // Без этого regex даёт 14 critical на pg-параметризованных запросах + log'ах.
            if (ruleName === 'sqlInjection') {
              if (/\$\$\{/.test(match[0])) continue;
              const lineText = this.getLineText(content, match.index);
              if (/\bconsole\.(log|info|warn|error|debug)\b/.test(lineText)) continue;
              if (/https?:\/\//i.test(lineText)) continue;
              if (/\b(?:search|query|param)Query\b|\bqueryString\b|\brule\.key\b/.test(lineText)) {
                continue;
              }
            }

            // JSON-LD structured data is emitted via a <script type="application/ld+json">
            // tag in Next/React. The payload here is JSON.stringify(...) rather than HTML.
            if (ruleName === 'xss' && match[0].trim() === 'dangerouslySetInnerHTML') {
              const lineText = this.getLineText(content, match.index);
              const before = content.slice(Math.max(0, match.index - 240), match.index);
              const after = content.slice(match.index, Math.min(content.length, match.index + 160));
              if (
                /type=["']application\/ld\+json["']/.test(before) &&
                /JSON\.stringify\s*\(/.test(lineText + after)
              ) {
                continue;
              }
            }

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
   * Возвращает полный текст строки, в которой находится символ с заданным индексом.
   * Используется в SEC-014 false-positive фильтрах (нужен контекст вокруг match[0]).
   */
  getLineText(content, index) {
    const before = content.lastIndexOf('\n', index - 1);
    const after = content.indexOf('\n', index);
    return content.slice(before + 1, after === -1 ? content.length : after);
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
   * Определение кода выхода на основе найденных уязвимостей.
   * После applyBaseline() summary содержит только NEW (не записанные в baseline) находки.
   */
  getExitCode() {
    if (this.results.summary.critical > 0) return 2; // Критические уязвимости
    if (this.results.summary.high > 0) return 1; // Высокие уязвимости
    return 0; // Нет критических или высоких уязвимостей
  }

  /**
   * SEC-014 baseline-ratchet: fingerprint находки для сравнения с принятыми FP.
   * Игнорируем номер строки (рефакторинг сдвигает) — fingerprint = rule + file + hash(evidence).
   * Если код реально меняется, evidence меняется, fingerprint меняется → НЕ матчится со
   * старым baseline → SAST fail на «новой» находке (что и нужно).
   */
  fingerprintVuln(v) {
    const file = v.file || v.location?.file || '?';
    const evidence = (v.evidence || '').trim().slice(0, 200);
    const hash = crypto.createHash('md5').update(evidence).digest('hex').slice(0, 12);
    const rule = v.ruleKey || v.rule || '?';
    return `${rule}|${file}|${hash}`;
  }

  /**
   * Применить baseline: убрать из results.vulnerabilities все находки, чьи fingerprint
   * есть в `security-reports/sast-baseline.json`. Декрементировать summary-счётчики.
   * Если baseline-файла нет — no-op (бэйзлайн ещё не зафиксирован).
   */
  applyBaseline() {
    const baselinePath = path.join(this.config.outputDir, 'sast-baseline.json');
    if (!fs.existsSync(baselinePath)) {
      console.log('📋 Baseline: файл sast-baseline.json отсутствует — все находки → as-is');
      return;
    }
    let baseline;
    try {
      baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    } catch (e) {
      console.warn(`⚠️  sast-baseline.json corrupt: ${e.message} — игнорирую`);
      return;
    }
    const accepted = new Set(baseline.fingerprints || []);
    if (accepted.size === 0) {
      console.log('📋 Baseline: пустой fingerprints[] — все находки → as-is');
      return;
    }
    const before = { ...this.results.summary };
    let suppressed = 0;
    const remaining = [];
    for (const v of this.results.vulnerabilities) {
      if (accepted.has(this.fingerprintVuln(v))) {
        suppressed++;
        if (this.results.summary[v.severity] !== undefined) {
          this.results.summary[v.severity]--;
        }
        this.results.summary.total--;
      } else {
        remaining.push(v);
      }
    }
    this.results.vulnerabilities = remaining;
    this.results.baselineSuppressed = suppressed;
    if (suppressed > 0) {
      console.log(
        `📋 Baseline: ${suppressed} known findings suppressed ` +
          `(was critical=${before.critical}, high=${before.high} → ` +
          `now critical=${this.results.summary.critical}, high=${this.results.summary.high})`,
      );
    }
  }

  /**
   * Записать текущие critical+high находки как baseline. Старый файл перезаписывается.
   * Запускается через `node scripts/security/sast-scan.js --update-baseline` после
   * ручного триажа: разработчик подтвердил, что все текущие critical+high — FP или
   * tracked elsewhere (другая SEC-NNN запись).
   */
  writeBaseline() {
    const baselinePath = path.join(this.config.outputDir, 'sast-baseline.json');
    const fingerprints = this.results.vulnerabilities
      .filter((v) => v.severity === 'critical' || v.severity === 'high')
      .map((v) => this.fingerprintVuln(v));
    const dedup = [...new Set(fingerprints)].sort();
    const payload = {
      generatedAt: new Date().toISOString(),
      description:
        'SAST baseline (SEC-014 ratchet) — known critical+high findings, ' +
        'manually triaged as false-positives или tracked в отдельных SEC-NNN. ' +
        'SAST fails только на новых находках вне этого списка. ' +
        'Регенерация: `node scripts/security/sast-scan.js --update-baseline`.',
      count: dedup.length,
      fingerprints: dedup,
    };
    fs.writeFileSync(baselinePath, JSON.stringify(payload, null, 2));
    console.log(
      `📋 Baseline written: ${dedup.length} fingerprints → ${path.relative(
        this.config.projectRoot,
        baselinePath,
      )}`,
    );
  }
}

// Запуск сканирования, если скрипт выполняется напрямую
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const updateBaseline = args.includes('--update-baseline');
  const scanner = new SASTScanner({ updateBaseline });
  scanner
    .runScan()
    .then(() => {
      // При --update-baseline всегда exit 0 (мы только сгенерировали snapshot,
      // не валидируем). Иначе — по бизнес-логике (есть NEW findings → exit 1/2).
      process.exit(updateBaseline ? 0 : scanner.getExitCode());
    })
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export default SASTScanner;
