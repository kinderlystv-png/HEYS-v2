#!/usr/bin/env node
/**
 * Bundle Analysis Script
 * Анализирует размер bundle и dependencies для оптимизации
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔍 Bundle Analysis Starting...\n');

const results = {
  timestamp: new Date().toISOString(),
  packages: {},
  totalSize: 0,
  recommendations: []
};

// Список пакетов для анализа
const packages = [
  'packages/core',
  'packages/ui',
  'packages/shared',
  'apps/web',
  'packages/analytics',
  'packages/search'
];

/**
 * Анализ размера node_modules
 */
function analyzeNodeModules(packagePath) {
  const nodeModulesPath = path.join(packagePath, 'node_modules');
  
  if (!fs.existsSync(nodeModulesPath)) {
    return { size: 0, count: 0 };
  }

  try {
    const stats = execSync(`du -sh "${nodeModulesPath}" 2>/dev/null || echo "0M"`, { encoding: 'utf8' });
    const sizeMatch = stats.match(/(\d+(?:\.\d+)?)[MG]/);
    const size = sizeMatch ? parseFloat(sizeMatch[1]) * (sizeMatch[0].includes('G') ? 1000 : 1) : 0;
    
    const dirs = fs.readdirSync(nodeModulesPath);
    return { size, count: dirs.length };
  } catch {
    return { size: 0, count: 0 };
  }
}

/**
 * Анализ package.json dependencies
 */
function analyzeDependencies(packagePath) {
  const packageJsonPath = path.join(packagePath, 'package.json');
  
  if (!fs.existsSync(packageJsonPath)) {
    return { deps: 0, devDeps: 0, dependencies: [] };
  }

  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const deps = packageJson.dependencies || {};
    const devDeps = packageJson.devDependencies || {};
    
    return {
      deps: Object.keys(deps).length,
      devDeps: Object.keys(devDeps).length,
      dependencies: Object.keys(deps)
    };
  } catch {
    return { deps: 0, devDeps: 0, dependencies: [] };
  }
}

/**
 * Проверка дублированных dependencies
 */
function findDuplicateDependencies() {
  const allDeps = new Map();
  const duplicates = new Set();

  packages.forEach(pkg => {
    const { dependencies } = analyzeDependencies(pkg);
    dependencies.forEach(dep => {
      if (allDeps.has(dep)) {
        duplicates.add(dep);
      } else {
        allDeps.set(dep, pkg);
      }
    });
  });

  return Array.from(duplicates);
}

// Выполнение анализа для каждого пакета
console.log('📦 Analyzing packages...\n');

packages.forEach(pkg => {
  if (!fs.existsSync(pkg)) {
    console.log(`⚠️  Package not found: ${pkg}`);
    return;
  }

  console.log(`🔍 Analyzing: ${pkg}`);
  
  const nodeModules = analyzeNodeModules(pkg);
  const deps = analyzeDependencies(pkg);
  
  results.packages[pkg] = {
    nodeModulesSize: nodeModules.size,
    nodeModulesCount: nodeModules.count,
    dependencies: deps.deps,
    devDependencies: deps.devDeps,
    dependencyList: deps.dependencies
  };
  
  results.totalSize += nodeModules.size;
  
  console.log(`  📁 Node modules: ${nodeModules.size}MB (${nodeModules.count} packages)`);
  console.log(`  📋 Dependencies: ${deps.deps} prod, ${deps.devDeps} dev\n`);
});

// Поиск дублированных dependencies
console.log('🔍 Checking for duplicate dependencies...\n');
const duplicates = findDuplicateDependencies();

if (duplicates.length > 0) {
  console.log('⚠️  Found duplicate dependencies:');
  duplicates.forEach(dep => {
    console.log(`  - ${dep}`);
    results.recommendations.push(`Remove duplicate dependency: ${dep}`);
  });
  console.log();
}

// Анализ больших dependencies
console.log('📊 Large dependencies analysis...\n');
const heavyDependencies = [
  'react', 'react-dom', 'lodash', 'moment', 'date-fns',
  'axios', 'webpack', 'typescript', '@types/node'
];

Object.values(results.packages).forEach(pkg => {
  pkg.dependencyList.forEach(dep => {
    if (heavyDependencies.includes(dep.split('/')[0])) {
      results.recommendations.push(`Review large dependency: ${dep}`);
    }
  });
});

// Генерация рекомендаций
console.log('💡 Generating recommendations...\n');

if (results.totalSize > 500) {
  results.recommendations.push('Total node_modules size is large (>500MB), consider cleanup');
}

if (duplicates.length > 3) {
  results.recommendations.push('Many duplicate dependencies found, use workspace deduplication');
}

// Вывод итогов
console.log('📋 BUNDLE ANALYSIS RESULTS:');
console.log('═'.repeat(50));
console.log(`📦 Total packages analyzed: ${packages.length}`);
console.log(`💾 Total node_modules size: ${results.totalSize.toFixed(1)}MB`);
console.log(`⚠️  Duplicate dependencies: ${duplicates.length}`);
console.log(`💡 Recommendations: ${results.recommendations.length}`);
console.log();

if (results.recommendations.length > 0) {
  console.log('🎯 RECOMMENDATIONS:');
  results.recommendations.forEach((rec, i) => {
    console.log(`${i + 1}. ${rec}`);
  });
  console.log();
}

// Сохранение результатов
const outputFile = 'docs/bundle-analysis-results.json';
fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
console.log(`💾 Results saved to: ${outputFile}`);

console.log('\n✅ Bundle analysis completed!');
