// filepath: scripts/tree-shaking-analysis.js

/**
 * CLI скрипт для анализа tree shaking
 * Автоматическое обнаружение неиспользуемого кода и генерация рекомендаций
 */

const fs = require('fs');
const path = require('path');

// Импорт TreeShaker (через require для Node.js совместимости)
async function importTreeShaker() {
  try {
    // Попытка импорта из TypeScript файла
    const tsNode = require('ts-node');
    tsNode.register({
      compilerOptions: {
        module: 'commonjs',
        target: 'es2020',
      }
    });
    
    const { TreeShaker } = require('../packages/shared/src/performance/TreeShaker.ts');
    return TreeShaker;
  } catch (error) {
    console.error('❌ Не удалось загрузить TreeShaker:', error.message);
    console.log('💡 Убедитесь, что ts-node установлен: npm install -g ts-node');
    process.exit(1);
  }
}

/**
 * Конфигурация по умолчанию
 */
const defaultConfig = {
  rootPath: process.cwd(),
  outputFile: 'tree-shaking-report.txt',
  format: 'text', // 'text' | 'json' | 'both'
  preset: 'safe', // 'aggressive' | 'safe' | 'library' | 'legacy'
  bundler: 'vite', // 'vite' | 'webpack' | 'rollup' | 'esbuild'
};

/**
 * Анализирует файловую систему на предмет tree shaking
 */
async function analyzeFileSystem(rootPath, config = {}) {
  console.log('🌲 Запуск анализа tree shaking...');
  console.log(`📁 Анализируемая директория: ${rootPath}`);
  
  const startTime = Date.now();
  
  try {
    const TreeShaker = await importTreeShaker();
    
    // Создаем экземпляр с конфигурацией
    const treeShaker = new TreeShaker({
      bundler: config.bundler || 'vite',
      aggressive: config.preset === 'aggressive',
      preserveTypes: config.preset !== 'aggressive',
      include: config.include || ['src/**/*.{ts,tsx,js,jsx}', 'packages/**/*.{ts,tsx,js,jsx}'],
      exclude: config.exclude || [
        '**/*.test.{ts,tsx,js,jsx}',
        '**/*.spec.{ts,tsx,js,jsx}',
        '**/*.stories.{ts,tsx,js,jsx}',
        '**/node_modules/**',
        '**/coverage/**',
        '**/dist/**',
        '**/build/**'
      ]
    });
    
    // Выполняем анализ
    const analysis = await treeShaker.analyzeProject(rootPath);
    
    const duration = Date.now() - startTime;
    console.log(`⚡ Анализ завершен за ${duration}ms`);
    
    return { treeShaker, analysis };
  } catch (error) {
    console.error('❌ Ошибка при анализе:', error);
    throw error;
  }
}

/**
 * Сохраняет отчет в файл
 */
function saveReport(treeShaker, analysis, outputPath, format = 'text') {
  try {
    let content = '';
    
    switch (format) {
      case 'text':
        content = treeShaker.generateReport();
        break;
      case 'json':
        content = treeShaker.exportToJson();
        break;
      case 'both':
        // Сохраняем оба формата
        const textContent = treeShaker.generateReport();
        const jsonContent = treeShaker.exportToJson();
        
        const baseName = path.basename(outputPath, path.extname(outputPath));
        const dir = path.dirname(outputPath);
        
        fs.writeFileSync(path.join(dir, `${baseName}.txt`), textContent, 'utf8');
        fs.writeFileSync(path.join(dir, `${baseName}.json`), jsonContent, 'utf8');
        
        console.log(`💾 Отчеты сохранены:`);
        console.log(`   📄 ${baseName}.txt`);
        console.log(`   📋 ${baseName}.json`);
        return;
    }
    
    fs.writeFileSync(outputPath, content, 'utf8');
    console.log(`💾 Отчет сохранен: ${outputPath}`);
  } catch (error) {
    console.error('❌ Ошибка при сохранении отчета:', error);
  }
}

/**
 * Выводит краткую статистику в консоль
 */
function printSummary(analysis) {
  console.log('\n📊 КРАТКАЯ СТАТИСТИКА:');
  console.log('========================');
  console.log(`📁 Проанализировано файлов: ${analysis.totalFiles}`);
  console.log(`🔍 Найдено неиспользуемых экспортов: ${analysis.unusedExports.length}`);
  
  if (analysis.potentialSavings > 0) {
    console.log(`💾 Потенциальная экономия: ${formatBytes(analysis.potentialSavings)}`);
  }
  
  // Топ файлов с неиспользуемыми экспортами
  if (analysis.unusedExports.length > 0) {
    const fileGroups = analysis.unusedExports.reduce((acc, exp) => {
      const fileName = path.basename(exp.file);
      if (!acc[fileName]) acc[fileName] = [];
      acc[fileName].push(exp);
      return acc;
    }, {});
    
    const topFiles = Object.entries(fileGroups)
      .sort(([,a], [,b]) => b.length - a.length)
      .slice(0, 5);
    
    if (topFiles.length > 0) {
      console.log('\n🔝 ТОП ФАЙЛОВ С НЕИСПОЛЬЗУЕМЫМИ ЭКСПОРТАМИ:');
      topFiles.forEach(([fileName, exports], index) => {
        const totalSize = exports.reduce((sum, exp) => sum + exp.size, 0);
        console.log(`   ${index + 1}. ${fileName}: ${exports.length} экспортов (${formatBytes(totalSize)})`);
      });
    }
  }
  
  // Рекомендации (первые 3)
  if (analysis.recommendations.length > 0) {
    console.log('\n💡 ГЛАВНЫЕ РЕКОМЕНДАЦИИ:');
    analysis.recommendations.slice(0, 3).forEach(rec => {
      console.log(`   ${rec}`);
    });
    
    if (analysis.recommendations.length > 3) {
      console.log(`   ... и еще ${analysis.recommendations.length - 3} рекомендаций`);
    }
  }
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
 * Парсит аргументы командной строки
 */
function parseArguments() {
  const args = process.argv.slice(2);
  const config = { ...defaultConfig };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--path':
      case '-p':
        config.rootPath = args[++i] || config.rootPath;
        break;
      case '--output':
      case '-o':
        config.outputFile = args[++i] || config.outputFile;
        break;
      case '--format':
      case '-f':
        config.format = args[++i] || config.format;
        break;
      case '--preset':
        config.preset = args[++i] || config.preset;
        break;
      case '--bundler':
      case '-b':
        config.bundler = args[++i] || config.bundler;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
      case '--verbose':
      case '-v':
        config.verbose = true;
        break;
      case '--aggressive':
        config.preset = 'aggressive';
        break;
      case '--safe':
        config.preset = 'safe';
        break;
      default:
        if (!arg.startsWith('-')) {
          config.rootPath = arg;
        }
        break;
    }
  }
  
  return config;
}

/**
 * Выводит справку по использованию
 */
function printHelp() {
  console.log(`
🌲 Tree Shaking Analysis Tool

ИСПОЛЬЗОВАНИЕ:
  node tree-shaking-analysis.js [опции] [путь]

ОПЦИИ:
  -p, --path <путь>       Путь к проекту для анализа (по умолчанию: текущая директория)
  -o, --output <файл>     Файл для сохранения отчета (по умолчанию: tree-shaking-report.txt)
  -f, --format <формат>   Формат отчета: text, json, both (по умолчанию: text)
  -b, --bundler <тип>     Тип bundler: vite, webpack, rollup, esbuild (по умолчанию: vite)
  --preset <тип>          Preset конфигурации: aggressive, safe, library, legacy (по умолчанию: safe)
  --aggressive            Включить агрессивную оптимизацию
  --safe                  Использовать безопасные настройки
  -v, --verbose           Подробный вывод
  -h, --help              Показать эту справку

ПРИМЕРЫ:
  # Анализ текущей директории
  node tree-shaking-analysis.js

  # Анализ конкретного проекта с сохранением в JSON
  node tree-shaking-analysis.js --path ./my-project --format json

  # Агрессивный анализ для Webpack
  node tree-shaking-analysis.js --aggressive --bundler webpack

  # Анализ библиотеки с Rollup
  node tree-shaking-analysis.js --preset library --bundler rollup
`);
}

/**
 * Основная функция
 */
async function main() {
  try {
    const config = parseArguments();
    
    if (config.verbose) {
      console.log('🔧 Конфигурация:', JSON.stringify(config, null, 2));
    }
    
    // Проверяем существование пути
    if (!fs.existsSync(config.rootPath)) {
      console.error(`❌ Путь не существует: ${config.rootPath}`);
      process.exit(1);
    }
    
    // Выполняем анализ
    const { treeShaker, analysis } = await analyzeFileSystem(config.rootPath, config);
    
    // Выводим краткую статистику
    printSummary(analysis);
    
    // Сохраняем отчет
    if (config.outputFile) {
      saveReport(treeShaker, analysis, config.outputFile, config.format);
    }
    
    // Выводим полный отчет в консоль если не сохраняем в файл
    if (!config.outputFile || config.verbose) {
      console.log('\n' + treeShaker.generateReport());
    }
    
    // Проверяем критические проблемы
    if (analysis.unusedExports.length > 100) {
      console.log('\n⚠️  ВНИМАНИЕ: Найдено много неиспользуемых экспортов!');
      console.log('   Рекомендуется провести рефакторинг для улучшения производительности.');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Критическая ошибка:', error);
    process.exit(1);
  }
}

// Запускаем если скрипт вызван напрямую
if (require.main === module) {
  main();
}

module.exports = {
  analyzeFileSystem,
  saveReport,
  printSummary,
  formatBytes,
};
