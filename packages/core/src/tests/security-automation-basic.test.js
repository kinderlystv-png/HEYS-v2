/**
 * Простая проверка работоспособности скриптов автоматизации безопасности
 * Тестирует основную функциональность SAST, проверки зависимостей и отчетности
 * 
 * @created КТ4 - Автоматизация безопасности
 * @author HEYS Security Team
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('КТ4 - Автоматизация безопасности - Базовая проверка', () => {
  const SCRIPTS_DIR = path.resolve(__dirname, '../../../../scripts/security');
  const TEST_OUTPUT_DIR = path.resolve(__dirname, '../temp/security-basic-test');

  beforeAll(async () => {
    if (!fs.existsSync(TEST_OUTPUT_DIR)) {
      fs.mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
    }
  });

  afterAll(async () => {
    if (fs.existsSync(TEST_OUTPUT_DIR)) {
      fs.rmSync(TEST_OUTPUT_DIR, { recursive: true, force: true });
    }
  });

  describe('Файлы скриптов безопасности', () => {
    it('SAST Scanner должен существовать', () => {
      const sastPath = path.join(SCRIPTS_DIR, 'sast-scan.js');
      expect(fs.existsSync(sastPath)).toBe(true);
      
      const content = fs.readFileSync(sastPath, 'utf8');
      expect(content).toContain('class SastSecurityScanner');
      expect(content).toContain('runScan');
    });

    it('Dependency Checker должен существовать', () => {
      const depPath = path.join(SCRIPTS_DIR, 'dependency-check.js');
      expect(fs.existsSync(depPath)).toBe(true);
      
      const content = fs.readFileSync(depPath, 'utf8');
      expect(content).toContain('class DependencySecurityChecker');
      expect(content).toContain('runCheck');
    });

    it('Security Report Consolidator должен существовать', () => {
      const reportPath = path.join(SCRIPTS_DIR, 'security-report.js');
      expect(fs.existsSync(reportPath)).toBe(true);
      
      const content = fs.readFileSync(reportPath, 'utf8');
      expect(content).toContain('class SecurityReportConsolidator');
      expect(content).toContain('consolidateReports');
    });
  });

  describe('GitHub Actions Workflow', () => {
    it('Workflow файл должен существовать', () => {
      const workflowPath = path.resolve(__dirname, '../../../../.github/workflows/security-scan.yml');
      expect(fs.existsSync(workflowPath)).toBe(true);
    });

    it('Workflow должен содержать security jobs', () => {
      const workflowPath = path.resolve(__dirname, '../../../../.github/workflows/security-scan.yml');
      const content = fs.readFileSync(workflowPath, 'utf8');
      
      expect(content).toContain('name: Security Scan');
      expect(content).toContain('sast-analysis');
      expect(content).toContain('dependency-security');
      expect(content).toContain('secrets-scan');
      expect(content).toContain('security-reporting');
    });
  });

  describe('Структура безопасности', () => {
    it('Директория scripts/security должна существовать', () => {
      expect(fs.existsSync(SCRIPTS_DIR)).toBe(true);
    });

    it('Все основные скрипты должны быть ES modules', () => {
      const scripts = ['sast-scan.js', 'dependency-check.js', 'security-report.js'];
      
      scripts.forEach(script => {
        const scriptPath = path.join(SCRIPTS_DIR, script);
        const content = fs.readFileSync(scriptPath, 'utf8');
        expect(content).toContain('import');
        expect(content).toContain('export default');
      });
    });

    it('Скрипты должны содержать правильные shebang для Node.js', () => {
      const scripts = ['sast-scan.js', 'dependency-check.js', 'security-report.js'];
      
      scripts.forEach(script => {
        const scriptPath = path.join(SCRIPTS_DIR, script);
        const content = fs.readFileSync(scriptPath, 'utf8');
        expect(content.startsWith('#!/usr/bin/env node')).toBe(true);
      });
    });
  });

  describe('Конфигурация безопасности', () => {
    it('SAST Scanner должен иметь правила безопасности', () => {
      const sastPath = path.join(SCRIPTS_DIR, 'sast-scan.js');
      const content = fs.readFileSync(sastPath, 'utf8');
      
      // Проверяем наличие основных правил безопасности
      expect(content).toContain('sql-injection');
      expect(content).toContain('xss-vulnerability');
      expect(content).toContain('hardcoded-secrets');
      expect(content).toContain('insecure-operations');
    });

    it('Dependency Checker должен проверять критические пакеты', () => {
      const depPath = path.join(SCRIPTS_DIR, 'dependency-check.js');
      const content = fs.readFileSync(depPath, 'utf8');
      
      expect(content).toContain('criticalPackages');
      expect(content).toContain('express');
      expect(content).toContain('jsonwebtoken');
      expect(content).toContain('bcrypt');
    });

    it('Security Report должен иметь систему оценки', () => {
      const reportPath = path.join(SCRIPTS_DIR, 'security-report.js');
      const content = fs.readFileSync(reportPath, 'utf8');
      
      expect(content).toContain('calculateSecurityScore');
      expect(content).toContain('severityLevels');
      expect(content).toContain('thresholds');
    });
  });

  describe('Система отчетности', () => {
    it('Скрипты должны поддерживать JSON отчеты', () => {
      const scripts = ['sast-scan.js', 'dependency-check.js', 'security-report.js'];
      
      scripts.forEach(script => {
        const scriptPath = path.join(SCRIPTS_DIR, script);
        const content = fs.readFileSync(scriptPath, 'utf8');
        expect(content).toContain('JSON.stringify');
      });
    });

    it('Должна быть поддержка HTML отчетов', () => {
      const reportPath = path.join(SCRIPTS_DIR, 'security-report.js');
      const content = fs.readFileSync(reportPath, 'utf8');
      
      expect(content).toContain('generateHtmlReport');
      expect(content).toContain('security-dashboard.html');
    });

    it('Должна быть поддержка SARIF формата', () => {
      const sastPath = path.join(SCRIPTS_DIR, 'sast-scan.js');
      const content = fs.readFileSync(sastPath, 'utf8');
      
      expect(content).toContain('SARIF');
      expect(content).toContain('version');
      expect(content).toContain('runs');
    });
  });

  describe('Интеграция CI/CD', () => {
    it('Workflow должен использовать наши скрипты', () => {
      const workflowPath = path.resolve(__dirname, '../../../../.github/workflows/security-scan.yml');
      const content = fs.readFileSync(workflowPath, 'utf8');
      
      expect(content).toContain('scripts/security/sast-scan.js');
      expect(content).toContain('scripts/security/dependency-check.js');
      expect(content).toContain('scripts/security/security-report.js');
    });

    it('Workflow должен поддерживать различные триггеры', () => {
      const workflowPath = path.resolve(__dirname, '../../../../.github/workflows/security-scan.yml');
      const content = fs.readFileSync(workflowPath, 'utf8');
      
      expect(content).toContain('on:');
      expect(content).toContain('push:');
      expect(content).toContain('pull_request:');
      expect(content).toContain('schedule:');
    });
  });

  describe('Функциональность детекции', () => {
    it('SAST Scanner должен детектировать различные типы уязвимостей', () => {
      const sastPath = path.join(SCRIPTS_DIR, 'sast-scan.js');
      const content = fs.readFileSync(sastPath, 'utf8');
      
      // Основные категории уязвимостей
      const categories = [
        'SQL injection',
        'XSS',
        'hardcoded secrets',
        'insecure operations',
        'insecure HTTP',
        'insecure CORS',
        'debug information'
      ];
      
      categories.forEach(category => {
        expect(content.toLowerCase()).toContain(category.toLowerCase().replace(' ', ''));
      });
    });

    it('Dependency Checker должен проверять уровни критичности', () => {
      const depPath = path.join(SCRIPTS_DIR, 'dependency-check.js');
      const content = fs.readFileSync(depPath, 'utf8');
      
      const severityLevels = ['critical', 'high', 'moderate', 'low', 'info'];
      severityLevels.forEach(level => {
        expect(content).toContain(level);
      });
    });
  });

  describe('Консолидация отчетов', () => {
    it('Report Consolidator должен поддерживать множественные источники', () => {
      const reportPath = path.join(SCRIPTS_DIR, 'security-report.js');
      const content = fs.readFileSync(reportPath, 'utf8');
      
      const sources = ['sast', 'dependencies', 'secrets', 'docker', 'api'];
      sources.forEach(source => {
        expect(content).toContain(source);
      });
    });

    it('Должна быть система дедупликации уязвимостей', () => {
      const reportPath = path.join(SCRIPTS_DIR, 'security-report.js');
      const content = fs.readFileSync(reportPath, 'utf8');
      
      expect(content).toContain('deduplicateVulnerabilities');
      expect(content).toContain('createVulnerabilityFingerprint');
    });

    it('Должны быть compliance проверки', () => {
      const reportPath = path.join(SCRIPTS_DIR, 'security-report.js');
      const content = fs.readFileSync(reportPath, 'utf8');
      
      expect(content).toContain('analyzeCompliance');
      expect(content).toContain('OWASP');
      expect(content).toContain('CIS');
      expect(content).toContain('SOC 2');
    });
  });
});

describe('КТ4 - Файловая структура проекта', () => {
  it('Основные директории должны существовать', () => {
    const dirs = [
      path.resolve(__dirname, '../../../../scripts'),
      path.resolve(__dirname, '../../../../scripts/security'),
      path.resolve(__dirname, '../../../../.github'),
      path.resolve(__dirname, '../../../../.github/workflows')
    ];
    
    dirs.forEach(dir => {
      expect(fs.existsSync(dir)).toBe(true);
    });
  });

  it('package.json должен содержать необходимые зависимости', () => {
    const packagePath = path.resolve(__dirname, '../../../../package.json');
    expect(fs.existsSync(packagePath)).toBe(true);
    
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    expect(packageJson).toHaveProperty('type', 'module');
  });
});
