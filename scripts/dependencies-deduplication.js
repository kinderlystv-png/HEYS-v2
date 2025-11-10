#!/usr/bin/env node
// filepath: scripts/dependencies-deduplication.js
/**
 * Dependencies Deduplication Script
 * Устраняет дублированные зависимости в workspace
 * Performance Sprint Day 2 - Component 1
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔄 Dependencies Deduplication Starting...\n');

const results = {
  timestamp: new Date().toISOString(),
  before: {},
  after: {},
  deduplicated: [],
  errors: [],
};

/**
 * Получение текущего состояния dependencies
 */
function getCurrentDependencies() {
  console.log('📊 Analyzing current dependency state...');

  const allDeps = new Map();
  const duplicates = new Set();

  // Сканируем все package.json файлы
  const packagePaths = [
    'package.json',
    'apps/web/package.json',
    'packages/core/package.json',
    'packages/ui/package.json',
    'packages/shared/package.json',
    'packages/analytics/package.json',
    'packages/search/package.json',
  ];

  packagePaths.forEach((pkgPath) => {
    if (!fs.existsSync(pkgPath)) return;

    try {
      const packageJson = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

      Object.keys(deps).forEach((dep) => {
        const version = deps[dep];
        const key = `${dep}@${version}`;

        if (allDeps.has(dep)) {
          const existing = allDeps.get(dep);
          if (existing.version !== version) {
            duplicates.add(dep);
            console.log(`  ⚠️  ${dep}: ${existing.version} vs ${version}`);
          }
        } else {
          allDeps.set(dep, { version, packages: [pkgPath] });
        }
      });
    } catch (error) {
      console.log(`❌ Error reading ${pkgPath}:`, error.message);
      results.errors.push(`Failed to read ${pkgPath}: ${error.message}`);
    }
  });

  results.before = {
    totalPackages: allDeps.size,
    duplicates: Array.from(duplicates),
    duplicateCount: duplicates.size,
  };

  console.log(`📦 Found ${allDeps.size} unique dependencies`);
  console.log(`🔴 ${duplicates.size} dependencies have version conflicts\n`);

  return { allDeps, duplicates };
}

/**
 * Выполнение pnpm dedupe
 */
function runPnpmDedupe() {
  console.log('🔧 Running pnpm dedupe...');

  try {
    // Запускаем dedupe для workspace
    execSync('pnpm dedupe', { stdio: 'inherit' });
    console.log('✅ pnpm dedupe completed successfully\n');
    return true;
  } catch (error) {
    console.log('❌ pnpm dedupe failed:', error.message);
    results.errors.push(`pnpm dedupe failed: ${error.message}`);
    return false;
  }
}

/**
 * Проверка результатов после dedupe
 */
function checkAfterDedupe() {
  console.log('📊 Checking results after deduplication...');

  const { allDeps, duplicates } = getCurrentDependencies();

  results.after = {
    totalPackages: allDeps.size,
    duplicates: Array.from(duplicates),
    duplicateCount: duplicates.size,
  };

  const improvement = results.before.duplicateCount - results.after.duplicateCount;
  results.deduplicated = results.before.duplicates.filter(
    (dep) => !results.after.duplicates.includes(dep),
  );

  console.log(`✅ Deduplication results:`);
  console.log(`  Before: ${results.before.duplicateCount} conflicts`);
  console.log(`  After: ${results.after.duplicateCount} conflicts`);
  console.log(`  Resolved: ${improvement} conflicts`);
  console.log(`  Deduplicated packages: ${results.deduplicated.join(', ')}\n`);
}

/**
 * Проверка размера node_modules
 */
function checkNodeModulesSize() {
  console.log('📁 Checking node_modules size...');

  try {
    const command =
      process.platform === 'win32'
        ? 'powershell "Get-ChildItem node_modules -Recurse | Measure-Object -Property Length -Sum | Select-Object -ExpandProperty Sum"'
        : 'du -sb node_modules | cut -f1';

    const sizeBytes = parseInt(execSync(command, { encoding: 'utf8' }).trim());
    const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(2);

    console.log(`📦 node_modules size: ${sizeMB}MB\n`);

    results.nodeModulesSize = {
      bytes: sizeBytes,
      mb: parseFloat(sizeMB),
    };
  } catch (error) {
    console.log('⚠️  Could not measure node_modules size:', error.message);
  }
}

/**
 * Обновление package.json с оптимизированными зависимостями
 */
function optimizePackageJson() {
  console.log('📝 Optimizing package.json files...');

  // Проверяем, какие зависимости можно переместить в root
  const commonDeps = ['react', 'react-dom', 'typescript', '@types/node', 'zod'];

  commonDeps.forEach((dep) => {
    console.log(`  📌 ${dep} should be in workspace root`);
  });

  console.log('✅ Package.json optimization recommendations logged\n');
}

/**
 * Главная функция
 */
async function main() {
  console.log('🎯 Performance Sprint Day 2 - Dependencies Deduplication\n');

  // 1. Анализ текущего состояния
  getCurrentDependencies();

  // 2. Проверка размера node_modules до
  checkNodeModulesSize();

  // 3. Выполнение deduplication
  const dedupeSuccess = runPnpmDedupe();

  if (dedupeSuccess) {
    // 4. Проверка результатов
    checkAfterDedupe();

    // 5. Проверка размера после
    checkNodeModulesSize();

    // 6. Оптимизация package.json
    optimizePackageJson();
  }

  // 7. Сохранение результатов
  fs.writeFileSync(
    'docs/dependencies-deduplication-results.json',
    JSON.stringify(results, null, 2),
  );

  console.log('📋 DEDUPLICATION SUMMARY:');
  console.log('═'.repeat(50));
  console.log(`🔴 Conflicts before: ${results.before.duplicateCount}`);
  console.log(`🟢 Conflicts after: ${results.after.duplicateCount}`);
  console.log(`✅ Resolved conflicts: ${results.deduplicated.length}`);
  console.log(`❌ Errors encountered: ${results.errors.length}`);

  if (results.deduplicated.length > 0) {
    console.log('\n🎉 Successfully deduplicated:');
    results.deduplicated.forEach((dep) => {
      console.log(`  - ${dep}`);
    });
  }

  if (results.errors.length > 0) {
    console.log('\n⚠️  Errors:');
    results.errors.forEach((error) => {
      console.log(`  - ${error}`);
    });
  }

  console.log(`\n💾 Results saved to: docs/dependencies-deduplication-results.json`);
  console.log('\n✅ Dependencies deduplication completed!');
}

// Запуск
main().catch((error) => {
  console.error('❌ Error during deduplication:', error);
  process.exit(1);
});
