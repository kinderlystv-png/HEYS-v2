#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const projectRoot = process.cwd();

console.log('🔒 Инициализация обновления безопасности ЭАП 3.0...\n');

// Создадим backup package.json
function createBackup() {
  const packageJsonPath = path.join(projectRoot, 'package.json');
  const backupPath = path.join(projectRoot, 'package.json.backup');
  
  if (fs.existsSync(packageJsonPath)) {
    fs.copyFileSync(packageJsonPath, backupPath);
    console.log('✅ Создан backup package.json');
  }
}

// Обновление отдельных пакетов
function updateCriticalPackages() {
  const criticalUpdates = [
    // TypeScript ESLint обновления
    '@typescript-eslint/eslint-plugin@^8.43.0',
    '@typescript-eslint/parser@^8.43.0',
    
    // Jest обновления  
    'jest@^29.7.0',
    '@types/jest@^29.5.0',
    
    // Babel обновления
    '@babel/core@^7.25.0',
    '@babel/preset-env@^7.25.0'
  ];

  console.log('🔄 Обновление критических пакетов...');
  
  for (const pkg of criticalUpdates) {
    try {
      console.log(`  📦 Обновление ${pkg}...`);
      execSync(`pnpm add -D ${pkg}`, { stdio: 'pipe' });
      console.log(`  ✅ ${pkg} обновлен`);
    } catch (error) {
      console.log(`  ⚠️ Ошибка при обновлении ${pkg}:`, error.message);
    }
  }
}

// Проверка безопасности после обновления
function checkSecurity() {
  console.log('\n🔍 Проверка безопасности после обновления...');
  
  try {
    const auditResult = execSync('npm audit --audit-level=high', { 
      encoding: 'utf8',
      stdio: 'pipe'
    });
    console.log('✅ Аудит безопасности пройден');
    return true;
  } catch (error) {
    console.log('⚠️ Остались проблемы безопасности:');
    console.log(error.stdout);
    return false;
  }
}

// Создание отчета
function createSecurityReport(securityPassed) {
  const report = {
    timestamp: new Date().toISOString(),
    status: securityPassed ? 'IMPROVED' : 'NEEDS_ATTENTION',
    updatedPackages: [
      '@typescript-eslint/eslint-plugin',
      '@typescript-eslint/parser',
      'jest',
      '@babel/core'
    ],
    nextSteps: securityPassed ? [
      'Тестирование обновленных компонентов',
      'Проверка ESLint конфигурации',
      'Обновление CI/CD пайплайна'
    ] : [
      'Ручное разрешение конфликтов зависимостей',
      'Обновление workspace конфигурации',
      'Консультация с командой'
    ]
  };

  const reportPath = path.join(projectRoot, 'security-update-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  
  console.log(`\n📄 Отчет сохранен: ${reportPath}`);
  return report;
}

// Основная функция
async function main() {
  try {
    createBackup();
    updateCriticalPackages();
    const securityPassed = checkSecurity();
    const report = createSecurityReport(securityPassed);
    
    console.log('\n🎯 Резюме обновления безопасности:');
    console.log(`   Статус: ${report.status}`);
    console.log(`   Обновлено пакетов: ${report.updatedPackages.length}`);
    console.log(`   Следующие шаги: ${report.nextSteps.length}`);
    
    if (report.status === 'IMPROVED') {
      console.log('\n✅ Безопасность улучшена! Переходите к тестированию.');
    } else {
      console.log('\n⚠️ Требуется дополнительная работа по безопасности.');
    }
    
  } catch (error) {
    console.error('❌ Ошибка при обновлении безопасности:', error.message);
    
    // Восстановление из backup при критической ошибке
    const backupPath = path.join(projectRoot, 'package.json.backup');
    if (fs.existsSync(backupPath)) {
      fs.copyFileSync(backupPath, path.join(projectRoot, 'package.json'));
      console.log('🔄 Восстановлен оригинальный package.json из backup');
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
