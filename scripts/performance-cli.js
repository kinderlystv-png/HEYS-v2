// filepath: scripts/performance-cli.js

/**
 * CLI инструмент для анализа производительности HEYS
 * Команды: measure, baseline, compare, report, analyze
 */

// Временно закомментируем импорт до компиляции TS
// const { bundleAnalyzer } = require('../packages/shared/src/performance/BundleAnalyzer');
const fs = require('fs');
const path = require('path');

/**
 * Цвета для консоли
 */
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  reset: '\x1b[0m',
};

/**
 * Логирование с цветами
 */
function log(message, color = 'white') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * Отображает помощь
 */
function showHelp() {
  log('🚀 HEYS Performance CLI', 'cyan');
  log('');
  log('Доступные команды:', 'yellow');
  log('  measure                    - Измерить текущие метрики', 'white');
  log('  baseline <version> <score> - Сохранить baseline', 'white');
  log('  compare                    - Сравнить с последним baseline', 'white');
  log('  report                     - Создать полный отчет', 'white');
  log('  analyze [stats.json]       - Анализ webpack stats', 'white');
  log('  history                    - Показать историю baseline', 'white');
  log('');
  log('Примеры:', 'yellow');
  log('  node scripts/performance-cli.js measure', 'cyan');
  log('  node scripts/performance-cli.js baseline v1.2.3 85', 'cyan');
  log('  node scripts/performance-cli.js analyze dist/stats.json', 'cyan');
}

/**
 * Измеряет текущие метрики
 */
async function measureCommand() {
  try {
    log('📊 Измерение метрик производительности...', 'blue');

    // Измеряем метрики из файловой системы
    const metrics = await measureFromFileSystem();

    log('✅ Метрики измерены:', 'green');
    log(`📦 Общий размер: ${formatBytes(metrics.totalSize)}`, 'white');
    log(`🗜️  Gzip размер: ${formatBytes(metrics.gzippedSize)}`, 'white');
    log(`📁 Количество чанков: ${Object.keys(metrics.chunkSizes).length}`, 'white');

    // Показываем топ-5 самых больших чанков
    const sortedChunks = Object.entries(metrics.chunkSizes)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);

    if (sortedChunks.length > 0) {
      log('🔝 Крупнейшие чанки:', 'yellow');
      sortedChunks.forEach(([name, size]) => {
        log(`   ${name}: ${formatBytes(size)}`, 'white');
      });
    }
  } catch (error) {
    log(`❌ Ошибка при измерении: ${error.message}`, 'red');
    process.exit(1);
  }
}

/**
 * Сохраняет baseline
 */
async function baselineCommand(version, score) {
  if (!version || !score) {
    log('❌ Укажите версию и Lighthouse score', 'red');
    log('   Пример: baseline v1.2.3 85', 'yellow');
    process.exit(1);
  }

  const lighthouseScore = parseFloat(score);
  if (isNaN(lighthouseScore) || lighthouseScore < 0 || lighthouseScore > 100) {
    log('❌ Lighthouse score должен быть числом от 0 до 100', 'red');
    process.exit(1);
  }

  try {
    // Сначала измеряем метрики
    await measureFromFileSystem();

    // Сохраняем baseline
    bundleAnalyzer.saveBaseline(version, lighthouseScore);

    log(`✅ Baseline сохранен для версии ${version}`, 'green');
    log(`📊 Lighthouse Score: ${lighthouseScore}`, 'white');
  } catch (error) {
    log(`❌ Ошибка при сохранении baseline: ${error.message}`, 'red');
    process.exit(1);
  }
}

/**
 * Сравнивает с baseline
 */
async function compareCommand() {
  try {
    bundleAnalyzer.loadFromStorage();
    await measureFromFileSystem();

    const comparison = bundleAnalyzer.compareWithBaseline();

    if (!comparison) {
      log('⚠️  Нет baseline для сравнения', 'yellow');
      log('   Создайте baseline командой: baseline <version> <score>', 'cyan');
      return;
    }

    log('📈 Сравнение с baseline:', 'blue');
    log('');

    const improvement = comparison.improvement ? '✅ Улучшение' : '❌ Ухудшение';
    log(improvement, comparison.improvement ? 'green' : 'red');
    log('');

    // Показываем детали изменений
    Object.entries(comparison.changes).forEach(([metric, data]) => {
      const symbol = data.change < 0 ? '⬇️' : '⬆️';
      const color = data.change < 0 ? 'green' : 'red';
      const changeStr = `${data.change > 0 ? '+' : ''}${data.change.toFixed(1)}%`;

      log(`${symbol} ${metric}: ${changeStr}`, color);
    });
  } catch (error) {
    log(`❌ Ошибка при сравнении: ${error.message}`, 'red');
    process.exit(1);
  }
}

/**
 * Создает полный отчет
 */
async function reportCommand() {
  try {
    bundleAnalyzer.loadFromStorage();
    await measureFromFileSystem();

    const report = bundleAnalyzer.generateReport();

    log('📋 Отчет о производительности', 'cyan');
    log('==============================', 'cyan');
    log('');

    // Текущие метрики
    if (report.current) {
      log('📊 Текущие метрики:', 'blue');
      log(`   Bundle Size: ${formatBytes(report.current.totalSize)}`, 'white');
      log(`   Gzip Size: ${formatBytes(report.current.gzippedSize)}`, 'white');
      log(`   Chunks: ${Object.keys(report.current.chunkSizes).length}`, 'white');
      log('');
    }

    // Baseline
    if (report.baseline) {
      log('📌 Последний baseline:', 'blue');
      log(`   Version: ${report.baseline.version}`, 'white');
      log(`   Date: ${new Date(report.baseline.timestamp).toLocaleDateString()}`, 'white');
      log(`   Lighthouse: ${report.baseline.lighthouseScore}`, 'white');
      log(`   Grade: ${report.baseline.performanceGrade}`, 'white');
      log('');
    }

    // Сравнение
    if (report.comparison) {
      log('📈 Сравнение:', 'blue');
      const status = report.comparison.improvement ? '✅ Улучшение' : '❌ Ухудшение';
      log(`   Status: ${status}`, report.comparison.improvement ? 'green' : 'red');
      log('');
    }

    // Рекомендации
    if (report.recommendations.length > 0) {
      log('💡 Рекомендации:', 'yellow');
      report.recommendations.forEach((rec) => {
        log(`   ${rec}`, 'white');
      });
      log('');
    }

    // Сохраняем отчет в файл
    const reportPath = 'performance-report.json';
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    log(`💾 Отчет сохранен: ${reportPath}`, 'green');
  } catch (error) {
    log(`❌ Ошибка при создании отчета: ${error.message}`, 'red');
    process.exit(1);
  }
}

/**
 * Анализирует webpack stats
 */
async function analyzeCommand(statsPath = 'dist/stats.json') {
  if (!fs.existsSync(statsPath)) {
    log(`❌ Stats файл не найден: ${statsPath}`, 'red');
    log('   Создайте stats.json: webpack --json > stats.json', 'cyan');
    process.exit(1);
  }

  try {
    log('🔍 Анализ webpack stats...', 'blue');

    const statsData = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
    const analysis = analyzeWebpackStats(statsData);

    log('✅ Анализ завершен:', 'green');
    log('');
    log('📦 Статистика bundle:', 'yellow');
    log(`   Общий размер: ${formatBytes(analysis.totalSize)}`, 'white');
    log(`   Количество ресурсов: ${analysis.assetsCount}`, 'white');
    log(`   Количество чанков: ${analysis.chunksCount}`, 'white');
    log(`   Количество модулей: ${analysis.modulesCount}`, 'white');
    log('');

    // Топ чанки
    if (analysis.topChunks.length > 0) {
      log('🔝 Крупнейшие чанки:', 'yellow');
      analysis.topChunks.forEach((chunk) => {
        log(`   ${chunk.name}: ${formatBytes(chunk.size)}`, 'white');
      });
      log('');
    }

    // Рекомендации
    if (analysis.recommendations.length > 0) {
      log('💡 Рекомендации:', 'yellow');
      analysis.recommendations.forEach((rec) => {
        log(`   ${rec}`, 'white');
      });
    }
  } catch (error) {
    log(`❌ Ошибка при анализе: ${error.message}`, 'red');
    process.exit(1);
  }
}

/**
 * Показывает историю baseline
 */
function historyCommand() {
  try {
    bundleAnalyzer.loadFromStorage();
    const history = bundleAnalyzer.baselineHistory || [];

    if (history.length === 0) {
      log('📝 История baseline пуста', 'yellow');
      return;
    }

    log('📚 История baseline:', 'cyan');
    log('');

    history.forEach((baseline, index) => {
      const date = new Date(baseline.timestamp).toLocaleDateString();
      log(`${index + 1}. ${baseline.version} (${date})`, 'white');
      log(`   Score: ${baseline.lighthouseScore} | Grade: ${baseline.performanceGrade}`, 'white');
      log(`   Size: ${formatBytes(baseline.metrics.totalSize)}`, 'white');
      log('');
    });
  } catch (error) {
    log(`❌ Ошибка при загрузке истории: ${error.message}`, 'red');
    process.exit(1);
  }
}

/**
 * Измеряет метрики на основе файловой системы
 */
async function measureFromFileSystem() {
  const distPaths = ['dist', 'apps/web/dist', 'packages/*/dist'];
  const chunkSizes = {};
  let totalSize = 0;

  // Проверяем несколько возможных папок с build файлами
  for (const distPattern of distPaths) {
    if (distPattern.includes('*')) {
      // Обрабатываем паттерны с *
      const basePath = distPattern.split('*')[0];
      if (fs.existsSync(basePath)) {
        const dirs = fs
          .readdirSync(basePath, { withFileTypes: true })
          .filter((dirent) => dirent.isDirectory())
          .map((dirent) => path.join(basePath, dirent.name, 'dist'));

        for (const dir of dirs) {
          if (fs.existsSync(dir)) {
            const files = fs.readdirSync(dir);
            files.forEach((file) => {
              const filePath = path.join(dir, file);
              if (
                fs.statSync(filePath).isFile() &&
                (file.endsWith('.js') || file.endsWith('.css'))
              ) {
                const size = fs.statSync(filePath).size;
                chunkSizes[file] = size;
                totalSize += size;
              }
            });
          }
        }
      }
    } else {
      // Обычные пути
      if (fs.existsSync(distPattern)) {
        const files = fs.readdirSync(distPattern);
        files.forEach((file) => {
          const filePath = path.join(distPattern, file);
          if (fs.statSync(filePath).isFile() && (file.endsWith('.js') || file.endsWith('.css'))) {
            const size = fs.statSync(filePath).size;
            chunkSizes[file] = size;
            totalSize += size;
          }
        });
      }
    }
  }

  const metrics = {
    totalSize,
    gzippedSize: Math.round(totalSize * 0.7),
    loadTime: 0,
    firstContentfulPaint: 0,
    largestContentfulPaint: 0,
    timeToInteractive: 0,
    chunkSizes,
    unusedCode: {},
  };

  return metrics;
}

/**
 * Анализирует webpack stats
 */
function analyzeWebpackStats(statsData) {
  const assets = statsData.assets || [];
  const chunks = statsData.chunks || [];
  const modules = statsData.modules || [];

  let totalSize = 0;
  const topChunks = [];

  assets.forEach((asset) => {
    if (asset.name.endsWith('.js') || asset.name.endsWith('.css')) {
      totalSize += asset.size;
      topChunks.push({ name: asset.name, size: asset.size });
    }
  });

  // Сортируем по размеру
  topChunks.sort((a, b) => b.size - a.size);

  // Генерируем рекомендации
  const recommendations = [];

  if (totalSize > 500000) {
    recommendations.push('📦 Bundle размер превышает 500KB - рассмотрите code splitting');
  }

  if (topChunks.length > 0 && topChunks[0].size > 100000) {
    recommendations.push(
      `🔧 Крупный чанк найден: ${topChunks[0].name} (${formatBytes(topChunks[0].size)})`,
    );
  }

  return {
    totalSize,
    assetsCount: assets.length,
    chunksCount: chunks.length,
    modulesCount: modules.length,
    topChunks: topChunks.slice(0, 5),
    recommendations,
  };
}

/**
 * Форматирует байты
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Главная функция CLI
 */
function main() {
  const command = process.argv[2];
  const args = process.argv.slice(3);

  switch (command) {
    case 'measure':
      measureCommand();
      break;
    case 'baseline':
      baselineCommand(args[0], args[1]);
      break;
    case 'compare':
      compareCommand();
      break;
    case 'report':
      reportCommand();
      break;
    case 'analyze':
      analyzeCommand(args[0]);
      break;
    case 'history':
      historyCommand();
      break;
    case 'help':
    case '--help':
    case '-h':
    default:
      showHelp();
      break;
  }
}

// Запускаем CLI если файл запущен напрямую
if (require.main === module) {
  main();
}

module.exports = {
  measureFromFileSystem,
  analyzeWebpackStats,
  formatBytes,
};
