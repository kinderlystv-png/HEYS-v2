import chalk from 'chalk';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';

interface BundleStats {
  name: string;
  size: number;
  gzipSize?: number;
  brotliSize?: number;
}

interface DetailedBundleAnalysis {
  totalSize: number;
  chunkSizes: Record<string, number>;
  dependencies: Record<string, number>;
  timestamp: string;
  recommendations: string[];
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getDirectorySize(dirPath: string): number {
  if (!existsSync(dirPath)) return 0;

  let totalSize = 0;

  function calculateSize(path: string) {
    try {
      const stats = statSync(path);
      if (stats.isDirectory()) {
        const files = readdirSync(path);
        files.forEach((file: string) => {
          calculateSize(join(path, file));
        });
      } else {
        totalSize += stats.size;
      }
    } catch (error) {
      // Ignore errors for inaccessible files
    }
  }

  calculateSize(dirPath);
  return totalSize;
}

/**
 * Детальный анализ bundle для Performance Optimization Sprint
 */
function performDetailedAnalysis(): DetailedBundleAnalysis {
  const analysis: DetailedBundleAnalysis = {
    totalSize: 0,
    chunkSizes: {},
    dependencies: {},
    timestamp: new Date().toISOString(),
    recommendations: [],
  };

  // Анализируем dist директорию в веб-приложении
  const distPath = join(process.cwd(), 'apps', 'web', 'dist');
  if (existsSync(distPath)) {
    analysis.totalSize = getDirectorySize(distPath);

    // Анализируем отдельные чанки
    const files = getJSFiles(distPath);
    files.forEach((file) => {
      const filePath = join(distPath, file);
      const size = statSync(filePath).size;
      analysis.chunkSizes[file] = size;
    });
  }

  // Анализируем зависимости
  const packageJsonPath = join(process.cwd(), 'package.json');
  if (existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    const deps = { ...(packageJson.dependencies || {}), ...(packageJson.devDependencies || {}) };

    Object.keys(deps).forEach((dep) => {
      const depPath = join(process.cwd(), 'node_modules', dep);
      if (existsSync(depPath)) {
        analysis.dependencies[dep] = getDirectorySize(depPath);
      }
    });
  }

  // Генерируем рекомендации
  analysis.recommendations = generateRecommendations(analysis);

  return analysis;
}

function getJSFiles(dirPath: string): string[] {
  if (!existsSync(dirPath)) return [];

  const files: string[] = [];

  function scanDir(currentPath: string, relativePath = '') {
    const items = readdirSync(currentPath);

    for (const item of items) {
      const fullPath = join(currentPath, item);
      const relativeFilePath = join(relativePath, item);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        scanDir(fullPath, relativeFilePath);
      } else if (item.endsWith('.js') || item.endsWith('.mjs') || item.endsWith('.css')) {
        files.push(relativeFilePath);
      }
    }
  }

  scanDir(dirPath);
  return files;
}

function generateRecommendations(analysis: DetailedBundleAnalysis): string[] {
  const recommendations: string[] = [];
  const totalSizeMB = analysis.totalSize / 1024 / 1024;

  // Анализ общего размера
  if (totalSizeMB > 2) {
    recommendations.push('🚨 Bundle слишком большой (>2MB) - критично нужен code splitting');
  } else if (totalSizeMB > 1) {
    recommendations.push('⚠️ Bundle большой (>1MB) - рекомендуется code splitting');
  }

  // Анализ чанков
  const largeChunks = Object.entries(analysis.chunkSizes).filter(([, size]) => size > 500 * 1024);
  if (largeChunks.length > 0) {
    recommendations.push(`📦 Найдено ${largeChunks.length} чанков >500KB - разделите их`);
  }

  // Анализ зависимостей
  const heavyDeps = Object.entries(analysis.dependencies)
    .filter(([, size]) => size > 10 * 1024 * 1024)
    .sort(([, a], [, b]) => b - a);

  if (heavyDeps.length > 0) {
    const topHeavy = heavyDeps
      .slice(0, 3)
      .map(([name]) => name)
      .join(', ');
    recommendations.push(`🔗 Тяжелые зависимости: ${topHeavy} - рассмотрите альтернативы`);
  }

  // Проверка на tree shaking возможности
  const totalDepsSize = Object.values(analysis.dependencies).reduce((a, b) => a + b, 0);
  if (totalDepsSize > analysis.totalSize * 10) {
    recommendations.push('🌳 Много неиспользуемого кода - настройте tree shaking');
  }

  return recommendations;
}

function saveAnalysisReport(analysis: DetailedBundleAnalysis) {
  // Создаем директорию для отчетов
  const reportDir = join(process.cwd(), 'bundle-analysis');
  if (!existsSync(reportDir)) {
    mkdirSync(reportDir, { recursive: true });
  }

  // Сохраняем JSON отчет
  const jsonPath = join(reportDir, 'analysis.json');
  writeFileSync(jsonPath, JSON.stringify(analysis, null, 2));

  // Создаем человекочитаемый отчет
  const report = generateHumanReadableReport(analysis);
  const reportPath = join(reportDir, 'report.md');
  writeFileSync(reportPath, report);

  console.log(chalk.green(`✅ Analysis saved to ${reportDir}/`));
}

function generateHumanReadableReport(analysis: DetailedBundleAnalysis): string {
  const totalSizeMB = (analysis.totalSize / 1024 / 1024).toFixed(2);
  const largestChunks = Object.entries(analysis.chunkSizes)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);

  const largestDeps = Object.entries(analysis.dependencies)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);

  return `# Bundle Analysis Report

**Date**: ${new Date(analysis.timestamp).toLocaleString()}
**Total Size**: ${totalSizeMB} MB

## 📦 Largest Chunks
${largestChunks.map(([name, size]) => `- **${name}**: ${formatBytes(size)}`).join('\n')}

## 🔗 Heaviest Dependencies  
${largestDeps.map(([name, size]) => `- **${name}**: ${formatBytes(size)}`).join('\n')}

## 💡 Recommendations
${analysis.recommendations.map((rec) => `- ${rec}`).join('\n')}

## 🎯 Next Steps for Performance Sprint
1. Implement tree shaking for unused code elimination
2. Set up code splitting for large chunks (>500KB)
3. Consider lazy loading for heavy dependencies
4. Optimize images and fonts
5. Set up bundle size monitoring in CI/CD
`;
}

/**
 * Главная функция анализа - обновленная для Performance Sprint
 */
function analyzeBundles() {
  console.log(chalk.blue.bold('\n� PERFORMANCE OPTIMIZATION SPRINT - Bundle Analysis\n'));

  // Build the project first
  console.log(chalk.yellow('Building project for analysis...'));
  try {
    execSync('pnpm run build', { stdio: 'inherit' });
    console.log(chalk.green('✅ Build completed successfully'));
  } catch (error) {
    console.log(chalk.red('❌ Build failed - analyzing existing artifacts'));
  }

  // Выполняем детальный анализ
  console.log(chalk.blue('\n� Performing detailed bundle analysis...'));
  const detailedAnalysis = performDetailedAnalysis();

  // Выводим результаты в консоль
  console.log(chalk.blue.bold('\n📦 CURRENT BUNDLE STATE:\n'));
  console.log(chalk.cyan(`📊 Total Size: ${formatBytes(detailedAnalysis.totalSize)}`));
  console.log(
    chalk.cyan(`📁 Number of chunks: ${Object.keys(detailedAnalysis.chunkSizes).length}`),
  );

  // Показываем самые большие чанки
  const largestChunks = Object.entries(detailedAnalysis.chunkSizes)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  console.log(chalk.blue.bold('\n📦 LARGEST CHUNKS:'));
  largestChunks.forEach(([name, size]) => {
    const barLength = Math.ceil(size / 10000);
    const bar = '█'.repeat(Math.min(barLength, 30));
    console.log(
      chalk.cyan(`   ${name.padEnd(30)}`),
      chalk.yellow(`${formatBytes(size).padStart(10)}`),
      chalk.gray(bar),
    );
  });

  // Показываем самые тяжелые зависимости
  const heaviestDeps = Object.entries(detailedAnalysis.dependencies)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  console.log(chalk.blue.bold('\n🔗 HEAVIEST DEPENDENCIES:'));
  heaviestDeps.forEach(([name, size]) => {
    const sizeMB = (size / 1024 / 1024).toFixed(2);
    console.log(chalk.cyan(`   ${name.padEnd(30)} ${sizeMB} MB`));
  });

  // Показываем рекомендации
  console.log(chalk.blue.bold('\n💡 OPTIMIZATION RECOMMENDATIONS:'));
  detailedAnalysis.recommendations.forEach((rec) => {
    console.log(chalk.yellow(`   ${rec}`));
  });

  // Performance budget check
  const totalSizeMB = detailedAnalysis.totalSize / 1024 / 1024;
  const BUDGET_LIMIT_MB = 2; // 2MB budget

  console.log(chalk.blue.bold('\n🎯 PERFORMANCE BUDGET CHECK:'));
  if (totalSizeMB > BUDGET_LIMIT_MB) {
    console.log(chalk.red(`❌ Over budget: ${totalSizeMB.toFixed(2)}MB > ${BUDGET_LIMIT_MB}MB`));
  } else {
    console.log(
      chalk.green(`✅ Within budget: ${totalSizeMB.toFixed(2)}MB ≤ ${BUDGET_LIMIT_MB}MB`),
    );
  }

  // Сохраняем детальный отчет
  saveAnalysisReport(detailedAnalysis);

  // Sprint planning вывод
  console.log(chalk.blue.bold('\n🚀 NEXT STEPS FOR PERFORMANCE SPRINT:'));
  console.log(chalk.gray('   1. 🌳 Configure tree shaking (remove unused code)'));
  console.log(chalk.gray('   2. ✂️  Implement code splitting (break large chunks)'));
  console.log(chalk.gray('   3. 🖼️  Optimize images and media assets'));
  console.log(chalk.gray('   4. 📝 Set up Core Web Vitals monitoring'));
  console.log(chalk.gray('   5. 🎨 Extract critical CSS for above-the-fold content'));

  console.log(
    chalk.green('\n✅ Baseline analysis complete! Check bundle-analysis/ for detailed reports.'),
  );

  return detailedAnalysis;
}

// Запускаем анализ
if (require.main === module) {
  analyzeBundles();
}
