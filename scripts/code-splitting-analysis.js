#!/usr/bin/env node

/**
 * CLI для анализа возможностей code splitting
 * Полнофункциональная версия с TypeScript поддержкой
 *
 * Использование:
 * node scripts/code-splitting-analysis.js [путь] [опции]
 *
 * Опции:
 * --preset <тип>     - Пресет конфигурации (aggressive|balanced|conservative|mobile)
 * --bundler <тип>    - Целевой бандлер (vite|webpack|rollup)
 * --min-size <kb>    - Минимальный размер для выделения в chunk (в KB)
 * --max-chunks <n>   - Максимальное количество chunks
 * --output <файл>    - Файл для сохранения отчета
 * --json             - Вывод в JSON формате
 * --verbose          - Подробный вывод
 * --help             - Показать справку
 */

const fs = require('fs');
const path = require('path');

// Аргументы командной строки
const args = process.argv.slice(2);
const projectPath = args[0] || process.cwd();

// Опции
let options = {
  preset: 'balanced',
  bundler: 'vite',
  minSize: 50, // KB
  maxChunks: 20,
  output: null,
  json: false,
  verbose: false,
  help: false,
};

// Парсинг аргументов
for (let i = 1; i < args.length; i++) {
  const arg = args[i];
  const nextArg = args[i + 1];

  switch (arg) {
    case '--preset':
      options.preset = nextArg;
      i++;
      break;
    case '--bundler':
      options.bundler = nextArg;
      i++;
      break;
    case '--min-size':
      options.minSize = parseInt(nextArg);
      i++;
      break;
    case '--max-chunks':
      options.maxChunks = parseInt(nextArg);
      i++;
      break;
    case '--output':
      options.output = nextArg;
      i++;
      break;
    case '--json':
      options.json = true;
      break;
    case '--verbose':
      options.verbose = true;
      break;
    case '--help':
      options.help = true;
      break;
  }
}

// Справка
if (options.help) {
  console.log(`
🔧 HEYS Code Splitting Analysis Tool

ИСПОЛЬЗОВАНИЕ:
  node code-splitting-analysis.js [путь] [опции]

ОПЦИИ:
  --preset <тип>      Пресет конфигурации
                      • aggressive - максимальное разделение
                      • balanced   - сбалансированное (по умолчанию)
                      • conservative - минимальное разделение
                      • mobile     - оптимизация для мобильных

  --bundler <тип>     Целевой бандлер (vite|webpack|rollup)
  --min-size <kb>     Минимальный размер chunk в KB (по умолчанию: 50)
  --max-chunks <n>    Максимальное количество chunks (по умолчанию: 20)
  --output <файл>     Сохранить отчет в файл
  --json              Вывод в JSON формате
  --verbose           Подробный вывод
  --help              Показать эту справку

ПРИМЕРЫ:
  node code-splitting-analysis.js src/
  node code-splitting-analysis.js --preset aggressive --bundler webpack
  node code-splitting-analysis.js --json --output analysis.json
  `);
  process.exit(0);
}

/**
 * Упрощенный анализатор code splitting без внешних зависимостей
 */
class SimpleCodeSplitter {
  constructor(config = {}) {
    this.config = {
      projectRoot: process.cwd(),
      excludePatterns: ['node_modules', '.git', 'dist', 'build', '*.test.*', '*.spec.*'],
      chunkSizeThreshold: (config.minSize || 50) * 1024, // В байтах
      maxChunks: config.maxChunks || 20,
      preset: config.preset || 'balanced',
      bundler: config.bundler || 'vite',
      verbose: config.verbose || false,
      ...config,
    };
  }

  /**
   * Основной метод анализа
   */
  async analyze(projectPath) {
    if (this.config.verbose) {
      console.log('🔍 Анализируем возможности code splitting...');
      console.log(`📁 Путь: ${projectPath}`);
      console.log(`⚙️ Пресет: ${this.config.preset}`);
      console.log(`🛠️ Бандлер: ${this.config.bundler}`);
    }

    const files = this.findRelevantFiles(projectPath);
    const analysis = this.analyzeFiles(files);

    return {
      ...analysis,
      config: this.config,
      recommendations: this.generateRecommendations(analysis),
    };
  }

  /**
   * Поиск релевантных файлов
   */
  findRelevantFiles(rootPath) {
    const files = [];

    const traverse = (currentPath) => {
      try {
        const items = fs.readdirSync(currentPath);

        for (const item of items) {
          const fullPath = path.join(currentPath, item);
          const relativePath = path.relative(rootPath, fullPath);

          // Проверяем исключения
          if (this.shouldExclude(relativePath)) continue;

          const stat = fs.statSync(fullPath);

          if (stat.isDirectory()) {
            traverse(fullPath);
          } else if (this.isRelevantFile(fullPath)) {
            files.push({
              path: fullPath,
              relativePath,
              size: stat.size,
            });
          }
        }
      } catch (error) {
        if (this.config.verbose) {
          console.warn(`⚠️ Не удалось прочитать директорию ${currentPath}:`, error.message);
        }
      }
    };

    traverse(rootPath);
    return files;
  }

  /**
   * Анализ файлов на предмет разделения
   */
  analyzeFiles(files) {
    const analysis = {
      totalFiles: files.length,
      totalSize: 0,
      splitPoints: [],
      filesByType: {},
      largeFiles: [],
      routeFiles: [],
      componentFiles: [],
      vendorImports: new Set(),
      potentialChunks: {},
    };

    // Анализируем каждый файл
    for (const file of files) {
      analysis.totalSize += file.size;

      try {
        const content = fs.readFileSync(file.path, 'utf-8');
        const fileAnalysis = this.analyzeFile(file, content);

        // Собираем статистику
        analysis.splitPoints.push(...fileAnalysis.splitPoints);

        if (fileAnalysis.isRoute) {
          analysis.routeFiles.push(file);
        }

        if (fileAnalysis.isComponent && file.size > this.config.chunkSizeThreshold) {
          analysis.largeFiles.push(file);
        }

        // Vendor импорты
        fileAnalysis.vendorImports.forEach((imp) => analysis.vendorImports.add(imp));
      } catch (error) {
        if (this.config.verbose) {
          console.warn(`⚠️ Ошибка анализа файла ${file.relativePath}:`, error.message);
        }
      }
    }

    return analysis;
  }

  /**
   * Анализ отдельного файла
   */
  analyzeFile(file, content) {
    const splitPoints = [];
    const vendorImports = [];

    // Паттерны для определения типов файлов
    const isRoute =
      /(?:pages?|routes?)\//.test(file.relativePath) || /(?:useRouter|Router|Route)/.test(content);

    const isComponent =
      /\.(?:tsx?|jsx?)$/.test(file.path) &&
      /(?:export\s+(?:default\s+)?(?:function|const)\s+[A-Z]|class\s+[A-Z])/.test(content);

    // Route-based splitting
    if (isRoute) {
      splitPoints.push({
        file: file.relativePath,
        type: 'route',
        reason: 'Route-based splitting opportunity',
        size: file.size,
        priority: 'high',
      });
    }

    // Large component splitting
    if (isComponent && file.size > this.config.chunkSizeThreshold) {
      splitPoints.push({
        file: file.relativePath,
        type: 'component',
        reason: `Large component (${Math.round(file.size / 1024)}KB)`,
        size: file.size,
        priority: file.size > this.config.chunkSizeThreshold * 2 ? 'high' : 'medium',
      });
    }

    // Vendor imports
    const heavyLibraries = ['lodash', 'moment', 'three', 'chart', '@mui', '@material-ui', 'antd'];
    heavyLibraries.forEach((lib) => {
      if (content.includes(`'${lib}'`) || content.includes(`"${lib}"`)) {
        vendorImports.push(lib);
        splitPoints.push({
          file: file.relativePath,
          type: 'vendor',
          reason: `Heavy library import: ${lib}`,
          size: file.size,
          priority: 'medium',
        });
      }
    });

    // Dynamic import opportunities
    const dynamicOpportunities = this.findDynamicOpportunities(content);
    dynamicOpportunities.forEach((opportunity) => {
      splitPoints.push({
        file: file.relativePath,
        type: 'dynamic',
        reason: `Dynamic import opportunity: ${opportunity}`,
        size: file.size,
        priority: 'low',
      });
    });

    return {
      isRoute,
      isComponent,
      splitPoints,
      vendorImports,
    };
  }

  /**
   * Поиск возможностей для динамических импортов
   */
  findDynamicOpportunities(content) {
    const opportunities = [];

    // Модальные окна
    if (/Modal|Dialog|Popup/.test(content)) {
      opportunities.push('modal components');
    }

    // Административные панели
    if (/Admin|Management|Settings/.test(content)) {
      opportunities.push('admin interfaces');
    }

    // Вкладки и аккордеоны
    if (/Tab|Accordion|Collapse/.test(content)) {
      opportunities.push('tab/accordion content');
    }

    // Условные рендеры
    if (/\{\s*\w+\s*&&/.test(content)) {
      opportunities.push('conditional rendering');
    }

    return opportunities;
  }

  /**
   * Генерация рекомендаций
   */
  generateRecommendations(analysis) {
    const recommendations = [];

    // Route splitting
    if (analysis.routeFiles.length > 0) {
      recommendations.push({
        type: 'route-splitting',
        priority: 'high',
        impact: 'high',
        description: `Implement route-based code splitting for ${analysis.routeFiles.length} route files`,
        implementation: 'Use React.lazy() and dynamic imports for route components',
      });
    }

    // Component splitting
    if (analysis.largeFiles.length > 0) {
      recommendations.push({
        type: 'component-splitting',
        priority: 'medium',
        impact: 'medium',
        description: `Split ${analysis.largeFiles.length} large components into separate chunks`,
        implementation: 'Use React.lazy() for heavy components',
      });
    }

    // Vendor splitting
    if (analysis.vendorImports.size > 0) {
      recommendations.push({
        type: 'vendor-splitting',
        priority: 'medium',
        impact: 'high',
        description: `Separate vendor libraries: ${Array.from(analysis.vendorImports).join(', ')}`,
        implementation: 'Configure manual chunks in bundler for vendor dependencies',
      });
    }

    return recommendations;
  }

  /**
   * Проверка исключений
   */
  shouldExclude(relativePath) {
    return this.config.excludePatterns.some(
      (pattern) => relativePath.includes(pattern) || new RegExp(pattern).test(relativePath),
    );
  }

  /**
   * Проверка релевантности файла
   */
  isRelevantFile(filePath) {
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '.vue'];
    return (
      extensions.some((ext) => filePath.endsWith(ext)) &&
      !filePath.includes('.test.') &&
      !filePath.includes('.spec.')
    );
  }
}

/**
 * Форматирование отчета
 */
function formatReport(analysis, options) {
  if (options.json) {
    return JSON.stringify(analysis, null, 2);
  }

  const { splitPoints, totalFiles, totalSize, recommendations } = analysis;

  let report = `
🚀 HEYS Code Splitting Analysis Report
=====================================

📊 СТАТИСТИКА ПРОЕКТА:
• Всего файлов: ${totalFiles}
• Общий размер: ${Math.round(totalSize / 1024)} KB
• Точек разделения: ${splitPoints.length}

🎯 ВОЗМОЖНОСТИ ОПТИМИЗАЦИИ:
`;

  // Группируем по типам
  const byType = splitPoints.reduce((acc, point) => {
    acc[point.type] = (acc[point.type] || 0) + 1;
    return acc;
  }, {});

  Object.entries(byType).forEach(([type, count]) => {
    const emoji =
      {
        route: '🛣️',
        component: '🧩',
        vendor: '📦',
        dynamic: '⚡',
      }[type] || '📁';

    report += `${emoji} ${type}: ${count} файлов\n`;
  });

  // Топ файлов для разделения
  const topFiles = splitPoints.filter((p) => p.priority === 'high').slice(0, 5);

  if (topFiles.length > 0) {
    report += `\n🔝 ТОП ПРИОРИТЕТНЫХ ФАЙЛОВ:\n`;
    topFiles.forEach((point) => {
      report += `• ${point.file} (${point.reason})\n`;
    });
  }

  // Рекомендации
  if (recommendations.length > 0) {
    report += `\n💡 РЕКОМЕНДАЦИИ:\n`;
    recommendations.forEach((rec, index) => {
      report += `${index + 1}. ${rec.description}\n`;
      report += `   ⚙️ Реализация: ${rec.implementation}\n\n`;
    });
  }

  // Конфигурация для бандлера
  report += `\n⚙️ КОНФИГУРАЦИЯ ДЛЯ ${analysis.config.bundler.toUpperCase()}:\n`;
  report += generateBundlerConfig(analysis.config.bundler, splitPoints);

  return report;
}

/**
 * Генерация конфигурации для бандлера
 */
function generateBundlerConfig(bundler, splitPoints) {
  const vendorLibs = [
    ...new Set(
      splitPoints
        .filter((p) => p.type === 'vendor')
        .map((p) => p.reason.match(/: (\w+)/)?.[1])
        .filter(Boolean),
    ),
  ];

  switch (bundler) {
    case 'vite':
      return `
// vite.config.ts
export default {
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          ${vendorLibs.length > 0 ? `libs: ['${vendorLibs.join("', '")}'],` : ''}
        }
      }
    }
  }
}`;

    case 'webpack':
      return `
// webpack.config.js
module.exports = {
  optimization: {
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          chunks: 'all',
        }
      }
    }
  }
}`;

    default:
      return 'Конфигурация для данного бандлера не поддерживается';
  }
}

/**
 * Основная функция
 */
async function main() {
  try {
    console.log('🚀 HEYS Code Splitting Analysis');
    console.log('================================\n');

    const splitter = new SimpleCodeSplitter(options);
    const analysis = await splitter.analyze(projectPath);
    const report = formatReport(analysis, options);

    // Вывод результата
    if (options.output) {
      fs.writeFileSync(options.output, report);
      console.log(`📄 Отчет сохранен в: ${options.output}`);
    } else {
      console.log(report);
    }

    console.log('\n✅ Анализ завершен успешно!');
  } catch (error) {
    console.error('❌ Ошибка анализа:', error.message);
    if (options.verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Запуск
if (require.main === module) {
  main();
}

module.exports = { SimpleCodeSplitter, formatReport };
