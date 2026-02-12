/**
 * Тесты для скриптов автоматизации безопасности
 * Проверяют функциональность SAST, проверки зависимостей и отчетности
 * 
 * @created КТ4 - Автоматизация безопасности
 * @author HEYS Security Team
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Пути к тестируемым скриптам
const SCRIPTS_DIR = path.resolve(__dirname, '../scripts/security');
const TEST_OUTPUT_DIR = path.resolve(__dirname, '../temp/security-test-output');
const SAMPLE_FILES_DIR = path.resolve(__dirname, '../temp/security-test-samples');

describe('КТ4 - Автоматизация безопасности', () => {
  beforeAll(async () => {
    // Создаем директории для тестов
    if (!fs.existsSync(TEST_OUTPUT_DIR)) {
      fs.mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
    }
    if (!fs.existsSync(SAMPLE_FILES_DIR)) {
      fs.mkdirSync(SAMPLE_FILES_DIR, { recursive: true });
    }

    // Создаем тестовые файлы с уязвимостями
    await createTestVulnerableFiles();
  });

  afterAll(async () => {
    // Очищаем тестовые файлы
    if (fs.existsSync(TEST_OUTPUT_DIR)) {
      fs.rmSync(TEST_OUTPUT_DIR, { recursive: true, force: true });
    }
    if (fs.existsSync(SAMPLE_FILES_DIR)) {
      fs.rmSync(SAMPLE_FILES_DIR, { recursive: true, force: true });
    }
  });

  describe('SAST Scanner (sast-scan.js)', () => {
    it('должен существовать и быть исполняемым', () => {
      const sastScriptPath = path.join(SCRIPTS_DIR, 'sast-scan.js');
      expect(fs.existsSync(sastScriptPath)).toBe(true);

      // Проверяем, что файл содержит основные классы
      const content = fs.readFileSync(sastScriptPath, 'utf8');
      expect(content).toContain('class SASTScanner');
      expect(content).toContain('runScan');
      expect(content).toContain('scanFile');
    });

    it('должен обнаруживать SQL injection уязвимости', async () => {
      // Создаем файл с SQL injection
      const vulnerableFile = path.join(SAMPLE_FILES_DIR, 'sql-injection.js');
      const vulnerableCode = `
        const query = "SELECT * FROM users WHERE id = " + userId;
        const result = await db.query(query);
        return result;
      `;
      fs.writeFileSync(vulnerableFile, vulnerableCode);

      // Импортируем и тестируем SAST scanner
      const { default: SastScanner } = await import(`${SCRIPTS_DIR}/sast-scan.js`);
      const scanner = new SastScanner();

      // Настраиваем вывод в тестовую директорию
      scanner.config = {
        ...scanner.config,
        outputDir: TEST_OUTPUT_DIR,
        targetPaths: [SAMPLE_FILES_DIR]
      };

      const results = await scanner.runScan();

      expect(results).toHaveProperty('vulnerabilities');
      expect(Array.isArray(results.vulnerabilities)).toBe(true);

      // Проверяем, что найдена SQL injection уязвимость
      const sqlInjectionVuln = results.vulnerabilities.find(v =>
        v.rule === 'sql-injection' || v.message.toLowerCase().includes('sql')
      );
      expect(sqlInjectionVuln).toBeDefined();
      expect(sqlInjectionVuln.severity).toBe('critical');
    });

    it('должен обнаруживать XSS уязвимости', async () => {
      const vulnerableFile = path.join(SAMPLE_FILES_DIR, 'xss-vulnerability.js');
      const vulnerableCode = `
        function renderUserContent(userInput) {
          document.getElementById('content').innerHTML = userInput;
          return '<div>' + userInput + '</div>';
        }
      `;
      fs.writeFileSync(vulnerableFile, vulnerableCode);

      const { default: SastScanner } = await import(`${SCRIPTS_DIR}/sast-scan.js`);
      const scanner = new SastScanner();
      scanner.config = {
        ...scanner.config,
        outputDir: TEST_OUTPUT_DIR,
        targetPaths: [SAMPLE_FILES_DIR]
      };

      const results = await scanner.runScan();

      const xssVuln = results.vulnerabilities.find(v =>
        v.rule === 'xss-vulnerability' || v.message.toLowerCase().includes('xss')
      );
      expect(xssVuln).toBeDefined();
      expect(['critical', 'high'].includes(xssVuln.severity)).toBe(true);
    });

    it('должен обнаруживать жестко закодированные секреты', async () => {
      const vulnerableFile = path.join(SAMPLE_FILES_DIR, 'hardcoded-secrets.js');
      const vulnerableCode = `
        const API_KEY = 'sk-1234567890abcdef';
        const PASSWORD = 'secretpassword123';
        const JWT_SECRET = 'my-super-secret-jwt-key';
      `;
      fs.writeFileSync(vulnerableFile, vulnerableCode);

      const { default: SastScanner } = await import(`${SCRIPTS_DIR}/sast-scan.js`);
      const scanner = new SastScanner();
      scanner.config = {
        ...scanner.config,
        outputDir: TEST_OUTPUT_DIR,
        targetPaths: [SAMPLE_FILES_DIR]
      };

      const results = await scanner.runScan();

      const secretVuln = results.vulnerabilities.find(v =>
        v.rule === 'hardcoded-secrets' || v.message.toLowerCase().includes('secret')
      );
      expect(secretVuln).toBeDefined();
      expect(secretVuln.severity).toBe('critical');
    });

    it('должен генерировать отчеты в различных форматах', async () => {
      const { default: SastScanner } = await import(`${SCRIPTS_DIR}/sast-scan.js`);
      const scanner = new SastScanner();
      scanner.config = {
        ...scanner.config,
        outputDir: TEST_OUTPUT_DIR,
        targetPaths: [SAMPLE_FILES_DIR]
      };

      await scanner.runScan();

      // Проверяем, что созданы файлы отчетов
      const jsonReport = path.join(TEST_OUTPUT_DIR, 'sast-report.json');
      const htmlReport = path.join(TEST_OUTPUT_DIR, 'sast-report.html');
      const sarifReport = path.join(TEST_OUTPUT_DIR, 'sast-report.sarif');

      expect(fs.existsSync(jsonReport)).toBe(true);
      expect(fs.existsSync(htmlReport)).toBe(true);
      expect(fs.existsSync(sarifReport)).toBe(true);

      // Проверяем содержимое JSON отчета
      const jsonContent = JSON.parse(fs.readFileSync(jsonReport, 'utf8'));
      expect(jsonContent).toHaveProperty('vulnerabilities');
      expect(jsonContent).toHaveProperty('summary');
      expect(jsonContent).toHaveProperty('timestamp');

      // Проверяем SARIF формат
      const sarifContent = JSON.parse(fs.readFileSync(sarifReport, 'utf8'));
      expect(sarifContent).toHaveProperty('version');
      expect(sarifContent).toHaveProperty('runs');
      expect(sarifContent.version).toBe('2.1.0');
    });
  });

  describe('Dependency Security Checker (dependency-check.js)', () => {
    it('должен существовать и быть исполняемым', () => {
      const depScriptPath = path.join(SCRIPTS_DIR, 'dependency-check.js');
      expect(fs.existsSync(depScriptPath)).toBe(true);

      const content = fs.readFileSync(depScriptPath, 'utf8');
      expect(content).toContain('class DependencySecurityChecker');
      expect(content).toContain('runCheck');
      expect(content).toContain('runDependencyAudit');
    });

    it('должен анализировать информацию о проекте', async () => {
      const { default: DependencyChecker } = await import(`${SCRIPTS_DIR}/dependency-check.js`);
      const checker = new DependencyChecker();

      // Настраиваем для тестирования
      checker.results = {
        timestamp: new Date().toISOString(),
        scanType: 'dependency-security',
        projectInfo: {},
        packages: { total: 0, direct: 0, dev: 0, production: 0 },
        vulnerabilities: [],
        summary: { critical: 0, high: 0, moderate: 0, low: 0, info: 0, total: 0, score: 0 },
        recommendations: []
      };

      await checker.analyzeProject();

      expect(checker.results.projectInfo).toHaveProperty('name');
      expect(checker.results.projectInfo).toHaveProperty('version');
      expect(checker.results.packages.direct).toBeGreaterThanOrEqual(0);
      expect(checker.results.packages.dev).toBeGreaterThanOrEqual(0);
    });

    it('должен генерировать рекомендации по безопасности', async () => {
      const { default: DependencyChecker } = await import(`${SCRIPTS_DIR}/dependency-check.js`);
      const checker = new DependencyChecker();

      // Симулируем наличие уязвимостей
      checker.results = {
        packages: { total: 100, direct: 20, dev: 15, production: 20 },
        summary: { critical: 2, high: 5, moderate: 3, low: 1, info: 0, total: 11 },
        recommendations: []
      };

      await checker.generateRecommendations();

      expect(Array.isArray(checker.results.recommendations)).toBe(true);
      expect(checker.results.recommendations.length).toBeGreaterThan(0);

      // Проверяем, что есть рекомендации для критических уязвимостей
      const criticalRec = checker.results.recommendations.find(r =>
        r.type === 'critical' || r.title.toLowerCase().includes('critical')
      );
      expect(criticalRec).toBeDefined();
      expect(criticalRec.priority).toBe(1);
    });

    it('должен создавать отчеты в различных форматах', async () => {
      const { default: DependencyChecker } = await import(`${SCRIPTS_DIR}/dependency-check.js`);
      const checker = new DependencyChecker();

      // Настраиваем путь вывода
      const originalConfig = checker.config || {};
      checker.config = { ...originalConfig, outputDir: TEST_OUTPUT_DIR };

      // Симулируем данные для отчета
      checker.results = {
        timestamp: new Date().toISOString(),
        scanType: 'dependency-security',
        projectInfo: { name: 'test-project', version: '1.0.0' },
        packages: { total: 50, direct: 10, dev: 8, production: 10 },
        vulnerabilities: [
          {
            id: 'TEST-001',
            title: 'Test Vulnerability',
            severity: 'high',
            package: 'test-package',
            versions: '>= 1.0.0',
            patched: '1.2.0',
            recommendation: 'Update to latest version',
            overview: 'Test vulnerability for testing purposes'
          }
        ],
        summary: { critical: 0, high: 1, moderate: 0, low: 0, info: 0, total: 1 },
        recommendations: [
          {
            type: 'high',
            title: 'High Priority Updates',
            description: 'Update vulnerable packages',
            priority: 2
          }
        ]
      };

      await checker.generateReports();

      // Проверяем созданные файлы
      const jsonReport = path.join(TEST_OUTPUT_DIR, 'dependency-security-report.json');
      const htmlReport = path.join(TEST_OUTPUT_DIR, 'dependency-security-report.html');
      const csvReport = path.join(TEST_OUTPUT_DIR, 'dependency-vulnerabilities.csv');

      expect(fs.existsSync(jsonReport)).toBe(true);
      expect(fs.existsSync(htmlReport)).toBe(true);
      expect(fs.existsSync(csvReport)).toBe(true);

      // Проверяем содержимое JSON отчета
      const jsonContent = JSON.parse(fs.readFileSync(jsonReport, 'utf8'));
      expect(jsonContent).toHaveProperty('vulnerabilities');
      expect(jsonContent.vulnerabilities).toHaveLength(1);
      expect(jsonContent.vulnerabilities[0].id).toBe('TEST-001');
    });
  });

  describe('Security Report Consolidator (security-report.js)', () => {
    beforeEach(async () => {
      // Создаем тестовые отчеты для консолидации
      await createMockSecurityReports();
    });

    it('должен существовать и быть исполняемым', () => {
      const reportScriptPath = path.join(SCRIPTS_DIR, 'security-report.js');
      expect(fs.existsSync(reportScriptPath)).toBe(true);

      const content = fs.readFileSync(reportScriptPath, 'utf8');
      expect(content).toContain('class SecurityReportConsolidator');
      expect(content).toContain('consolidateReports');
      expect(content).toContain('calculateSecurityScore');
    });

    it('должен загружать и консолидировать отчеты от различных сканеров', async () => {
      const { default: ReportConsolidator } = await import(`${SCRIPTS_DIR}/security-report.js`);
      const consolidator = new ReportConsolidator();

      // Настраиваем пути для тестирования
      consolidator.config = {
        reportsDir: TEST_OUTPUT_DIR,
        outputDir: path.join(TEST_OUTPUT_DIR, 'consolidated'),
        reportSources: {
          sast: 'mock-sast-report.json',
          dependencies: 'mock-dependency-report.json'
        }
      };

      await consolidator.initializeProject();
      await consolidator.loadScanResults();

      expect(consolidator.consolidatedReport.scanResults.sast).toBeDefined();
      expect(consolidator.consolidatedReport.scanResults.dependencies).toBeDefined();
      expect(consolidator.consolidatedReport.metadata.scanners).toContain('sast');
      expect(consolidator.consolidatedReport.metadata.scanners).toContain('dependencies');
    });

    it('должен рассчитывать балл безопасности', async () => {
      const { default: ReportConsolidator } = await import(`${SCRIPTS_DIR}/security-report.js`);
      const consolidator = new ReportConsolidator();

      // Симулируем уязвимости
      consolidator.consolidatedReport.summary.issuesBySeverity = {
        critical: 1,
        high: 2,
        moderate: 3,
        low: 5,
        info: 2
      };

      await consolidator.calculateSecurityScore();

      expect(consolidator.consolidatedReport.summary.securityScore).toBeGreaterThanOrEqual(0);
      expect(consolidator.consolidatedReport.summary.securityScore).toBeLessThanOrEqual(100);
      expect(consolidator.consolidatedReport.summary.riskLevel).toMatch(/^(low|medium|high|critical)$/);
    });

    it('должен генерировать консолидированные рекомендации', async () => {
      const { default: ReportConsolidator } = await import(`${SCRIPTS_DIR}/security-report.js`);
      const consolidator = new ReportConsolidator();

      // Симулируем различные уязвимости
      consolidator.consolidatedReport.summary.issuesBySeverity = {
        critical: 2,
        high: 1,
        moderate: 0,
        low: 0,
        info: 0
      };
      consolidator.consolidatedReport.summary.coverage = {
        sastCoverage: true,
        dependencyCoverage: false,
        secretsCoverage: true,
        dockerCoverage: false,
        apiCoverage: true
      };

      await consolidator.generateConsolidatedRecommendations();

      expect(Array.isArray(consolidator.consolidatedReport.recommendations)).toBe(true);
      expect(consolidator.consolidatedReport.recommendations.length).toBeGreaterThan(0);

      // Проверяем приоритизацию рекомендаций
      const immediateRec = consolidator.consolidatedReport.recommendations.find(r =>
        r.priority === 1 && r.category === 'immediate'
      );
      expect(immediateRec).toBeDefined();
    });

    it('должен создавать консолидированные отчеты', async () => {
      const { default: ReportConsolidator } = await import(`${SCRIPTS_DIR}/security-report.js`);
      const consolidator = new ReportConsolidator();

      const outputDir = path.join(TEST_OUTPUT_DIR, 'consolidated-test');
      consolidator.config = { outputDir };

      // Симулируем полные данные
      consolidator.consolidatedReport = {
        metadata: {
          timestamp: new Date().toISOString(),
          projectInfo: { name: 'test-project', version: '1.0.0' },
          scanners: ['sast', 'dependencies'],
          duration: 5000
        },
        summary: {
          securityScore: 75,
          riskLevel: 'medium',
          totalIssues: 5,
          issuesBySeverity: { critical: 0, high: 2, moderate: 2, low: 1, info: 0 },
          coverage: { sastCoverage: true, dependencyCoverage: true }
        },
        vulnerabilities: [
          {
            title: 'Test Vulnerability',
            severity: 'high',
            source: 'sast',
            file: 'test.js'
          }
        ],
        recommendations: [
          {
            priority: 2,
            title: 'Test Recommendation',
            description: 'Test description',
            timeframe: '24-48 hours'
          }
        ],
        complianceStatus: {
          summary: { overallCompliance: 'passing' }
        },
        trendAnalysis: {}
      };

      await consolidator.generateConsolidatedReports();

      // Проверяем созданные файлы
      const jsonReport = path.join(outputDir, 'consolidated-security-report.json');
      const executiveReport = path.join(outputDir, 'executive-security-summary.json');
      const htmlDashboard = path.join(outputDir, 'security-dashboard.html');

      expect(fs.existsSync(jsonReport)).toBe(true);
      expect(fs.existsSync(executiveReport)).toBe(true);
      expect(fs.existsSync(htmlDashboard)).toBe(true);

      // Проверяем содержимое
      const jsonContent = JSON.parse(fs.readFileSync(jsonReport, 'utf8'));
      expect(jsonContent.summary.securityScore).toBe(75);
      expect(jsonContent.vulnerabilities).toHaveLength(1);
    });
  });

  describe('GitHub Actions Workflow Integration', () => {
    it('должен существовать workflow файл', () => {
      const workflowPath = path.resolve(__dirname, '../.github/workflows/security-scan.yml');
      expect(fs.existsSync(workflowPath)).toBe(true);

      const content = fs.readFileSync(workflowPath, 'utf8');
      expect(content).toContain('Security Scan');
      expect(content).toContain('sast-analysis');
      expect(content).toContain('dependency-security');
    });

    it('должен содержать все необходимые job для безопасности', () => {
      const workflowPath = path.resolve(__dirname, '../.github/workflows/security-scan.yml');
      const content = fs.readFileSync(workflowPath, 'utf8');

      // Проверяем наличие основных jobs
      expect(content).toContain('sast-analysis:');
      expect(content).toContain('dependency-security:');
      expect(content).toContain('security-report:');

      // Проверяем использование наших скриптов
      expect(content).toContain('scripts/security/sast-scan.js');
      expect(content).toContain('scripts/security/dependency-check.js');
      expect(content).toContain('scripts/security/security-report.js');
    });
  });

  describe('Интеграционные тесты', () => {
    it('должен выполнять полный цикл сканирования безопасности', async () => {
      // Создаем тестовые файлы с различными уязвимостями
      const testFiles = {
        'sql-injection.js': `
          const query = "SELECT * FROM users WHERE id = " + req.params.id;
          database.query(query);
        `,
        'xss-vuln.js': `
          document.innerHTML = userInput;
        `,
        'secrets.js': `
          const apiKey = 'sk-1234567890abcdef';
        `
      };

      for (const [filename, content] of Object.entries(testFiles)) {
        fs.writeFileSync(path.join(SAMPLE_FILES_DIR, filename), content);
      }

      // Запускаем SAST сканирование
      const { default: SastScanner } = await import(`${SCRIPTS_DIR}/sast-scan.js`);
      const sastScanner = new SastScanner();
      sastScanner.config = {
        ...sastScanner.config,
        outputDir: TEST_OUTPUT_DIR,
        targetPaths: [SAMPLE_FILES_DIR]
      };

      const sastResults = await sastScanner.runScan();
      expect(sastResults.vulnerabilities.length).toBeGreaterThan(0);

      // Проверяем создание консолидированного отчета
      const { default: ReportConsolidator } = await import(`${SCRIPTS_DIR}/security-report.js`);
      const consolidator = new ReportConsolidator();
      consolidator.config = {
        reportsDir: TEST_OUTPUT_DIR,
        outputDir: path.join(TEST_OUTPUT_DIR, 'final-consolidated'),
        reportSources: {
          sast: 'sast-report.json'
        }
      };

      await consolidator.initializeProject();
      await consolidator.loadScanResults();
      await consolidator.consolidateVulnerabilities();
      await consolidator.calculateSecurityScore();

      expect(consolidator.consolidatedReport.summary.totalIssues).toBeGreaterThan(0);
      expect(consolidator.consolidatedReport.summary.securityScore).toBeGreaterThanOrEqual(0);
      expect(consolidator.consolidatedReport.summary.securityScore).toBeLessThanOrEqual(100);
    });
  });
});

/**
 * Создание тестовых файлов с уязвимостями для проверки детекции
 */
async function createTestVulnerableFiles() {
  const vulnerableFiles = {
    'sql-injection-test.js': `
      // SQL Injection vulnerability
      function getUserById(id) {
        const query = "SELECT * FROM users WHERE id = " + id;
        return database.query(query);
      }
      
      // Another SQL injection
      app.get('/users/:id', (req, res) => {
        const sql = \`SELECT * FROM users WHERE email = '\${req.params.email}'\`;
        db.query(sql, (err, results) => {
          res.json(results);
        });
      });
    `,

    'xss-test.js': `
      // XSS vulnerability
      function displayUserComment(comment) {
        document.getElementById('comments').innerHTML = comment;
        return '<div>' + comment + '</div>';
      }
      
      // DOM XSS
      function updatePage() {
        const userInput = window.location.hash.substring(1);
        document.body.innerHTML = userInput;
      }
    `,

    'secrets-test.js': `
      // Hardcoded secrets
      const API_KEY = 'sk-1234567890abcdef';
      const DATABASE_PASSWORD = 'super-secret-password';
      const JWT_SECRET = 'my-jwt-secret-key-123';
      const STRIPE_KEY = 'sk_test_DUMMY1234567890ABCDEF1234';
    `,

    'insecure-operations.js': `
      // Insecure operations
      const crypto = require('crypto');
      const hash = crypto.createHash('md5'); // Weak hash
      
      // Insecure random
      const randomValue = Math.random();
      
      // Eval usage
      function processUserCode(code) {
        return eval(code);
      }
    `,

    'insecure-http.js': `
      // Insecure HTTP
      const http = require('http');
      http.get('http://api.example.com/data', (res) => {
        console.log(res);
      });
      
      // No HTTPS enforcement
      app.listen(3000, () => {
        console.log('Server running on http://localhost:3000');
      });
    `
  };

  for (const [filename, content] of Object.entries(vulnerableFiles)) {
    fs.writeFileSync(path.join(SAMPLE_FILES_DIR, filename), content);
  }
}

/**
 * Создание mock отчетов для тестирования консолидации
 */
async function createMockSecurityReports() {
  const mockSastReport = {
    timestamp: new Date().toISOString(),
    scanType: 'sast',
    projectInfo: { name: 'test-project', version: '1.0.0' },
    vulnerabilities: [
      {
        rule: 'sql-injection',
        severity: 'critical',
        message: 'SQL injection vulnerability detected',
        file: 'test.js',
        line: 10
      },
      {
        rule: 'xss-vulnerability',
        severity: 'high',
        message: 'XSS vulnerability found',
        file: 'ui.js',
        line: 25
      }
    ],
    summary: {
      total: 2,
      critical: 1,
      high: 1,
      moderate: 0,
      low: 0,
      info: 0
    }
  };

  const mockDependencyReport = {
    timestamp: new Date().toISOString(),
    scanType: 'dependency-security',
    projectInfo: { name: 'test-project', version: '1.0.0' },
    vulnerabilities: [
      {
        id: 'GHSA-1234',
        title: 'Vulnerable dependency',
        severity: 'high',
        package: 'vulnerable-package',
        versions: '>= 1.0.0 < 1.5.0',
        patched: '1.5.0'
      }
    ],
    summary: {
      total: 1,
      critical: 0,
      high: 1,
      moderate: 0,
      low: 0,
      info: 0
    }
  };

  fs.writeFileSync(
    path.join(TEST_OUTPUT_DIR, 'mock-sast-report.json'),
    JSON.stringify(mockSastReport, null, 2)
  );

  fs.writeFileSync(
    path.join(TEST_OUTPUT_DIR, 'mock-dependency-report.json'),
    JSON.stringify(mockDependencyReport, null, 2)
  );
}
