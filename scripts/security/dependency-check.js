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
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Конфигурация проверки зависимостей
const DEPENDENCY_CONFIG = {
  projectRoot: path.resolve(__dirname, '../../'),
  outputDir: path.resolve(__dirname, '../../security-reports'),

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

  // Принятые уязвимости: те, что нельзя починить сейчас, и мы это решили вслух.
  //
  // Прежний список был массивом голых номеров и вычищал только ПОДРОБНОСТИ:
  // счётчики и код выхода берутся из metadata.vulnerabilities, поэтому запись
  // сюда гейт не гасила и создавала видимость решения. Теперь принятая запись
  // действительно вычитается из счёта — и за это платит тремя вещами.
  //
  // 1. Причина обязательна. «Игнорируем» — не причина; нужно, почему риск
  //    приемлем именно здесь (только сборка, не в проде, нет вектора).
  // 2. `reviewBy` обязателен. Когда дата прошла, гейт падает НА САМОМ
  //    исключении: непочинимое сегодня почти всегда чинится через месяц, а
  //    вечное исключение неотличимо от забытого.
  // 3. Исключение, которому больше нечего гасить, тоже роняет гейт — иначе
  //    список копит записи про уязвимости, которых давно нет, и читать его
  //    перестают.
  //
  // Принятое печатается в отчёте отдельным блоком, а не исчезает: молчащая
  // проверка хуже отсутствующей.
  acceptedVulnerabilities: [
    {
      package: 'extract-zip',
      severity: 'high',
      reason:
        'Транзитивный внутри Playwright, только разработка: в прод не попадает, ' +
        'распаковку архивов делает CI над своим же скачанным браузером. Починки ' +
        'НЕ СУЩЕСТВУЕТ — в обеих записях patched_versions равен <0.0.0, то есть ' +
        'исправленной версии нет вовсе, и поднять нечего.',
      reviewBy: '2026-10-09',
    },
  ],

  // CI security gate проверяет именно vulnerabilities. `pnpm outdated` может
  // зависнуть на registry и не должен превращать security gate в сетевой таймер.
  skipOutdatedCheck: process.env.HEYS_SKIP_OUTDATED_CHECK === '1',

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

      // Вычитание принятого — строго после аудита: он может разобрать
      // отчёт не один раз, и вычитание внутри него затиралось следующим
      // пересчётом счётчиков.
      this.applyAcceptedVulnerabilities();

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
   * Выполнение аудита зависимостей.
   *
   * ВАЖНО: раньше парсер искал NDJSON-строки вида `{type:'auditAdvisory'}` —
   * это формат npm v6, который `pnpm audit --json` НЕ выдаёт. В результате
   * скрипт ВСЕГДА рапортовал 0 уязвимостей (ложный «зелёный» гейт), пока
   * `pnpm audit` показывал реальные сотни. Теперь парсим фактический формат:
   * единый JSON-объект с `metadata.vulnerabilities` (authoritative-счётчики) и
   * детализацией в `advisories` (pnpm/npm v6) либо `vulnerabilities` (npm v7+),
   * с NDJSON-fallback для совсем старого формата.
   */
  async runDependencyAudit() {
    console.log('\n🔍 Running dependency audit...');

    let raw = '';
    try {
      raw = execSync('pnpm audit --json', {
        cwd: this.config.projectRoot || DEPENDENCY_CONFIG.projectRoot,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        maxBuffer: 64 * 1024 * 1024,
      });
    } catch (error) {
      // pnpm audit возвращает ненулевой код, когда найдены уязвимости —
      // сам отчёт при этом лежит в stdout.
      raw = (error.stdout || '').toString();
      if (!raw.trim() && error.message) {
        console.warn('⚠️ Audit command failed:', error.message);
      }
    }

    this.ingestAuditReport(raw);
    console.log(`   🔍 Found ${this.results.summary.total} vulnerabilities`);
  }

  /**
   * Добавить запись об уязвимости.
   *
   * Раньше здесь молча выбрасывались записи из allowlist — и в отчёт они не
   * попадали вовсе, при том что счётчики их всё равно считали. Теперь сюда
   * попадает ВСЁ, а принятое помечается ниже: вычесть из счёта и спрятать из
   * отчёта — разные вещи, и вторая нам не нужна.
   */
  pushVuln(v) {
    if (!v) return;
    v.timestamp = new Date().toISOString();
    this.results.vulnerabilities.push(v);
  }

  /**
   * Вычесть принятые уязвимости из счёта — и проверить сами исключения.
   *
   * Счётчики приходят из metadata.vulnerabilities, а сопоставляем мы по
   * подробностям. Если подробностей нет, а счёт не нулевой, вычитать нельзя:
   * мы не знаем, что именно там, и молчаливое вычитание превратило бы гейт в
   * зелёный на неизвестном. В таком случае оставляем счёт как есть.
   */
  applyAcceptedVulnerabilities() {
    // Через this.config, а не через модульную константу: иначе метод
    // непроверяем — подставить другой список в тесте невозможно, и
    // единственным способом проверить гейт остаётся правка исходника.
    const accepted = this.config.acceptedVulnerabilities || [];
    this.results.accepted = [];
    this.results.exceptionProblems = [];
    if (!accepted.length) return;

    const today = new Date().toISOString().slice(0, 10);
    const details = this.results.vulnerabilities;

    for (const rule of accepted) {
      if (!rule.reason || !rule.reviewBy) {
        this.results.exceptionProblems.push(
          `исключение для ${rule.package || rule.id}: нужны и reason, и reviewBy`,
        );
        continue;
      }
      const hits = details.filter(
        (v) =>
          !v.accepted &&
          (rule.id ? v.id === rule.id : true) &&
          (rule.package ? v.package === rule.package : true) &&
          (rule.match ? String(v.title || '').includes(rule.match) : true),
      );
      if (!hits.length) {
        this.results.exceptionProblems.push(
          `исключение для ${rule.package || rule.id} больше нечего гасить — уязвимости нет, уберите запись`,
        );
        continue;
      }
      if (rule.reviewBy < today) {
        this.results.exceptionProblems.push(
          `исключение для ${rule.package || rule.id} просрочено (${rule.reviewBy}) — пересмотрите или продлите с новой причиной`,
        );
      }
      for (const hit of hits) {
        hit.accepted = rule;
        this.results.accepted.push(hit);
      }
    }
  }

  /**
   * Счёт за вычетом принятого.
   *
   * Вычитаем ПРИ ЧТЕНИИ, а не мутацией общего счётчика: аудит пересобирает
   * summary не в одном месте, и вычитание, сделанное раньше пересборки, тихо
   * терялось — счёт показывал прежние числа, а блок принятого при этом
   * печатался. Ровно тот случай, когда отчёт спорит сам с собой.
   */
  effectiveSummary() {
    const details = this.results.vulnerabilities || [];
    // Без подробностей вычитать не из чего: metadata остаётся как есть, и гейт
    // судит по ней. Это фейл-клоузд — лучше лишний красный, чем зелёный на
    // неизвестном.
    if (!details.length) return { ...this.results.summary };

    // Считаем по УНИКАЛЬНЫМ записям, а не по metadata.
    //
    // metadata.vulnerabilities считает ПУТИ зависимостей: одна и та же
    // уязвимость, пришедшая двумя путями, даёт там двойку. extract-zip именно
    // такой — в metadata его четыре при двух записях. Вычитание принятого по
    // записям из счёта по путям недосчитывает ровно на это удвоение, и гейт
    // оставался красным на уже принятом.
    const out = { critical: 0, high: 0, moderate: 0, low: 0, info: 0, total: 0, score: this.results.summary.score };
    for (const v of details) {
      if (v.accepted) continue;
      if (out[v.severity] === undefined) continue;
      out[v.severity] += 1;
      out.total += 1;
    }
    return out;
  }

  /**
   * Разобрать вывод `pnpm audit --json` в любом из поддерживаемых форматов.
   * Счётчики severity берём из `metadata.vulnerabilities` как источник истины;
   * детали — best-effort. Пустой вывод трактуем как UNKNOWN (а не «чисто»),
   * чтобы сломанный/недоступный аудит не давал ложный зелёный.
   */
  ingestAuditReport(raw) {
    const SEVS = ['critical', 'high', 'moderate', 'low', 'info'];

    if (!raw || !raw.trim()) {
      console.warn(
        '⚠️ Empty audit output — registry unreachable or audit failed. Marking status=unknown (NOT clean).',
      );
      this.results.auditStatus = 'unknown';
      return;
    }

    let report = null;
    try {
      report = JSON.parse(raw);
    } catch (_) {
      /* возможно NDJSON — обработаем ниже */
    }

    if (report && typeof report === 'object' && !Array.isArray(report)) {
      this.results.auditStatus = 'ok';

      // 1) Authoritative-счётчики из summary, если он есть.
      const metaV = report.metadata && report.metadata.vulnerabilities;
      const haveMeta = metaV && typeof metaV === 'object';
      if (haveMeta) {
        for (const sev of SEVS) {
          const n = Number(metaV[sev] || 0);
          this.results.summary[sev] = n;
          this.results.summary.total += n;
        }
      }

      // 2) Детали: pnpm / npm v6 → advisories{}, npm v7+ → vulnerabilities{}.
      if (report.advisories && typeof report.advisories === 'object') {
        for (const adv of Object.values(report.advisories)) {
          this.pushVuln({
            id: adv.id,
            title: adv.title,
            severity: adv.severity,
            package: adv.module_name,
            versions: adv.vulnerable_versions,
            patched: adv.patched_versions,
            recommendation: adv.recommendation,
            overview: adv.overview,
            references: adv.references || [],
            cwe: adv.cwe || [],
            cvss: adv.cvss || {},
            found: adv.findings || {},
          });
        }
      } else if (report.vulnerabilities && typeof report.vulnerabilities === 'object') {
        for (const v of Object.values(report.vulnerabilities)) {
          const via = Array.isArray(v.via)
            ? v.via.find((x) => x && typeof x === 'object')
            : null;
          this.pushVuln({
            id: (via && via.source) || v.name,
            title: (via && via.title) || `${v.name}: vulnerable dependency`,
            severity: v.severity,
            package: v.name,
            versions: v.range,
            patched:
              v.fixAvailable === true
                ? 'fix available (pnpm update/override)'
                : v.fixAvailable && v.fixAvailable.version
                  ? `${v.fixAvailable.name}@${v.fixAvailable.version}`
                  : 'N/A',
            recommendation: v.fixAvailable
              ? 'Run pnpm update or add an override'
              : 'No fix available — pin/replace or document exception',
            overview: (via && via.url) || '',
            references: via && via.url ? [via.url] : [],
            cwe: (via && via.cwe) || [],
            cvss: (via && via.cvss) || {},
            found: {},
          });
        }
      }

      // 3) Счётчики: из metadata, а без неё — пересчёт по подробностям.
      // Вычитание принятого делает applyAcceptedVulnerabilities уже после
      // разбора: раньше оно пряталось здесь, и принятое исчезало не только из
      // счёта, но и из отчёта — прочитать, что именно мы согласились терпеть,
      // было негде.
      if (!haveMeta) {
        for (const sev of SEVS) this.results.summary[sev] = 0;
        this.results.summary.total = 0;
        for (const v of this.results.vulnerabilities) {
          if (this.results.summary[v.severity] !== undefined) {
            this.results.summary[v.severity]++;
            this.results.summary.total++;
          }
        }
      }
      return;
    }

    // 4) Legacy NDJSON ({type:'auditAdvisory'}) — на случай старого формата.
    this.results.auditStatus = 'ok';
    for (const line of raw.trim().split('\n')) {
      let obj;
      try {
        obj = JSON.parse(line);
      } catch (_) {
        continue;
      }
      if (obj && obj.type === 'auditAdvisory' && obj.data && obj.data.advisory) {
        const adv = obj.data.advisory;
        this.pushVuln({
          id: adv.id,
          title: adv.title,
          severity: adv.severity,
          package: adv.module_name,
          versions: adv.vulnerable_versions,
          patched: adv.patched_versions,
          recommendation: adv.recommendation,
          overview: adv.overview,
          references: adv.references || [],
          cwe: adv.cwe || [],
          cvss: adv.cvss || {},
          found: obj.data.resolution || {},
        });
        if (this.results.summary[adv.severity] !== undefined) {
          this.results.summary[adv.severity]++;
          this.results.summary.total++;
        }
      }
    }
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
    const effective = this.effectiveSummary();
    console.log(`🔍 Vulnerabilities found: ${effective.total}`);

    Object.entries(effective).forEach(([severity, count]) => {
      if (severity !== 'total' && severity !== 'score' && count > 0) {
        const config = colors[severity];
        if (config) {
          console.log(
            `${config.color}${severity.charAt(0).toUpperCase() + severity.slice(1)}: ${count}${reset}`,
          );
        }
      }
    });

    // Принятое печатается всегда: вычесть из счёта — не то же самое, что
    // спрятать. Читающий отчёт обязан видеть, что именно мы согласились терпеть.
    const accepted = this.results.accepted || [];
    if (accepted.length) {
      console.log(`\n🟡 Принято осознанно (вне счёта): ${accepted.length}`);
      for (const v of accepted) {
        console.log(`   - ${v.package}: ${v.title} (${v.severity})`);
        console.log(`     причина: ${v.accepted.reason}`);
        console.log(`     пересмотреть до: ${v.accepted.reviewBy}`);
      }
    }
    for (const problem of this.results.exceptionProblems || []) {
      console.log(`\n❌ ${problem}`);
    }

    if (effective.total === 0) {
      console.log('\n🎉 No vulnerabilities found in dependencies!');
    } else if (effective.critical + effective.high > 0) {
      console.log(
        `\n⚠️ Action required for ${effective.critical + effective.high} high-priority vulnerabilities`,
      );
    } else {
      console.log(
        `\n✅ Критических и высоких нет; ниже порога осталось записей: ${effective.total}`,
      );
    }
  }

  /**
   * Определение кода выхода
   */
  getExitCode() {
    const { critical, high } = this.effectiveSummary();

    // Сломанный/недоступный аудит — НЕ «зелёный». Иначе вернётся старый баг
    // ложного прохода гейта.
    if (this.results.auditStatus === 'unknown') return 1;
    // Просроченное или опустевшее исключение роняет гейт так же, как сама
    // уязвимость: список принятого, который никто не пересматривает, через
    // месяц гасит уже не то, что решали гасить.
    if ((this.results.exceptionProblems || []).length) return 1;
    if (critical > 0) return 2; // Критические уязвимости
    if (high > 0) return 1; // Высокие уязвимости
    return 0; // Нет критических/высоких уязвимостей
  }
}

// Запуск если вызван напрямую.
// Сравнивать со строкой `file://${argv[1]}` нельзя: на Windows argv[1] — это
// `C:\...`, а import.meta.url — `file:///C:/...`, они не совпадают никогда, и
// проверка молча ничего не делала, выходя нулём. Ровно тот случай, когда
// зелёный код возврата означает «не смотрели», а не «сошлось».
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
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
