// filepath: packages/shared/src/performance/webpack-analyzer.config.js

/**
 * Конфигурация для Webpack Bundle Analyzer
 * Автоматический анализ размера бандла и генерация отчетов
 */

const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');
const path = require('path');

/**
 * Создает конфигурацию для анализа бандла
 */
function createBundleAnalyzerConfig(options = {}) {
  const {
    analyzerMode = process.env.ANALYZE ? 'server' : 'json',
    outputDir = 'bundle-analysis',
    openAnalyzer = false,
    generateStatsFile = true,
  } = options;

  return {
    plugins: [
      new BundleAnalyzerPlugin({
        // Режим работы: 'server', 'static', 'json', 'disabled'
        analyzerMode,
        
        // Порт для server режима
        analyzerPort: 8888,
        
        // Автоматически открывать браузер
        openAnalyzer,
        
        // Путь для статических отчетов
        reportFilename: path.join(outputDir, 'bundle-report.html'),
        
        // Путь для JSON отчета
        statsFilename: path.join(outputDir, 'bundle-stats.json'),
        
        // Генерировать stats файл
        generateStatsFile,
        
        // Логирование
        logLevel: 'info',
        
        // Размер по умолчанию для отображения
        defaultSizes: 'gzip',
        
        // Исключить модули меньше указанного размера (в байтах)
        statsOptions: {
          source: false,
          modules: false,
          chunks: false,
          chunkModules: false,
          chunkOrigins: false,
          excludeAssets: /\.(map|txt|html|jpg|png|gif)$/,
        },
      }),
    ],
  };
}

/**
 * Создает конфигурацию для разных окружений
 */
function createEnvironmentConfigs() {
  return {
    // Для разработки - JSON отчет
    development: createBundleAnalyzerConfig({
      analyzerMode: 'json',
      outputDir: 'dist/bundle-analysis/dev',
      openAnalyzer: false,
    }),

    // Для production - статический HTML отчет
    production: createBundleAnalyzerConfig({
      analyzerMode: 'static',
      outputDir: 'dist/bundle-analysis/prod',
      openAnalyzer: false,
    }),

    // Для анализа - интерактивный сервер
    analyze: createBundleAnalyzerConfig({
      analyzerMode: 'server',
      outputDir: 'dist/bundle-analysis/analyze',
      openAnalyzer: true,
    }),
  };
}

/**
 * Скрипт для анализа существующих stats файлов
 */
function createStatsAnalysisScript() {
  return `
// filepath: scripts/analyze-bundle.js

const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');
const fs = require('fs');
const path = require('path');

/**
 * Анализирует существующий stats.json файл
 */
async function analyzeStats(statsPath, outputPath = 'bundle-analysis') {
  if (!fs.existsSync(statsPath)) {
    console.error('❌ Stats файл не найден:', statsPath);
    process.exit(1);
  }

  console.log('📊 Анализ bundle stats:', statsPath);

  const statsData = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
  
  // Создаем временный webpack config для анализа
  const analyzer = new BundleAnalyzerPlugin({
    analyzerMode: 'static',
    reportFilename: path.join(outputPath, 'bundle-report.html'),
    openAnalyzer: true,
    generateStatsFile: false,
  });

  // Генерируем отчет
  await analyzer.generateReport(statsData);
  
  console.log('✅ Отчет создан:', path.join(outputPath, 'bundle-report.html'));
}

// Использование: node scripts/analyze-bundle.js path/to/stats.json
if (require.main === module) {
  const statsPath = process.argv[2] || 'dist/stats.json';
  const outputPath = process.argv[3] || 'bundle-analysis';
  
  analyzeStats(statsPath, outputPath).catch(console.error);
}

module.exports = { analyzeStats };
  `;
}

/**
 * Интеграция с нашим BundleAnalyzer
 */
function createIntegrationScript() {
  return `
// filepath: scripts/performance-integration.js

const fs = require('fs');
const path = require('path');
const { bundleAnalyzer } = require('../packages/shared/src/performance/BundleAnalyzer');

/**
 * Обрабатывает данные из webpack bundle analyzer
 * и интегрирует их с нашей системой мониторинга
 */
async function integrateWebpackStats(statsPath) {
  if (!fs.existsSync(statsPath)) {
    console.error('❌ Stats файл не найден:', statsPath);
    return;
  }

  console.log('🔄 Интеграция webpack stats с BundleAnalyzer...');

  const statsData = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
  
  // Извлекаем данные о чанках
  const chunks = statsData.chunks || [];
  const assets = statsData.assets || [];
  
  // Вычисляем размеры
  const chunkSizes = {};
  let totalSize = 0;
  
  assets.forEach(asset => {
    if (asset.name.endsWith('.js') || asset.name.endsWith('.css')) {
      chunkSizes[asset.name] = asset.size;
      totalSize += asset.size;
    }
  });

  // Создаем фейковые метрики для интеграции
  const fakeMetrics = {
    totalSize,
    gzippedSize: Math.round(totalSize * 0.7),
    loadTime: 0,
    firstContentfulPaint: 0,
    largestContentfulPaint: 0,
    timeToInteractive: 0,
    chunkSizes,
    unusedCode: {},
  };

  // Устанавливаем метрики в analyzer
  bundleAnalyzer.currentMetrics = fakeMetrics;

  console.log('📊 Данные интегрированы:');
  console.log(\`- Общий размер: \${(totalSize / 1024 / 1024).toFixed(2)} MB\`);
  console.log(\`- Количество чанков: \${Object.keys(chunkSizes).length}\`);
  console.log(\`- Крупнейший чанк: \${Math.max(...Object.values(chunkSizes)) / 1024} KB\`);

  return fakeMetrics;
}

// Использование: node scripts/performance-integration.js path/to/stats.json
if (require.main === module) {
  const statsPath = process.argv[2] || 'dist/stats.json';
  integrateWebpackStats(statsPath).catch(console.error);
}

module.exports = { integrateWebpackStats };
  `;
}

module.exports = {
  createBundleAnalyzerConfig,
  createEnvironmentConfigs,
  createStatsAnalysisScript,
  createIntegrationScript,
};
