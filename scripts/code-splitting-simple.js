#!/usr/bin/env node

/**
 * Упрощенный CLI для анализа code splitting
 * Без внешних зависимостей, готов к использованию
 * 
 * Использование: node code-splitting-simple.js [путь]
 */

const fs = require('fs');
const path = require('path');

// Основные настройки
const CONFIG = {
  minChunkSize: 50 * 1024, // 50KB
  maxChunks: 20,
  excludePatterns: ['node_modules', '.git', 'dist', 'build', '.test.', '.spec.'],
  heavyLibraries: ['lodash', 'moment', 'three', 'chart', '@mui', 'antd', 'fabric'],
  fileExtensions: ['.ts', '.tsx', '.js', '.jsx', '.vue']
};

/**
 * Простой анализатор code splitting
 */
class SimpleCodeSplittingAnalyzer {
  constructor() {
    this.results = {
      totalFiles: 0,
      totalSize: 0,
      splitOpportunities: [],
      summary: {}
    };
  }

  /**
   * Анализ проекта
   */
  analyze(projectPath) {
    console.log('🔍 Анализируем возможности code splitting...');
    console.log(`📁 Путь: ${projectPath}\n`);

    const files = this.findFiles(projectPath);
    this.results.totalFiles = files.length;
    
    // Анализируем каждый файл
    files.forEach(file => {
      this.results.totalSize += file.size;
      this.analyzeFile(file);
    });

    this.generateSummary();
    return this.results;
  }

  /**
   * Поиск файлов
   */
  findFiles(rootPath) {
    const files = [];
    
    const traverse = (currentPath) => {
      try {
        const items = fs.readdirSync(currentPath);
        
        for (const item of items) {
          const fullPath = path.join(currentPath, item);
          const relativePath = path.relative(rootPath, fullPath);
          
          // Пропускаем исключения
          if (CONFIG.excludePatterns.some(pattern => relativePath.includes(pattern))) {
            continue;
          }
          
          const stat = fs.statSync(fullPath);
          
          if (stat.isDirectory()) {
            traverse(fullPath);
          } else if (this.isRelevantFile(fullPath)) {
            files.push({
              path: fullPath,
              relativePath,
              size: stat.size,
              name: path.basename(fullPath)
            });
          }
        }
      } catch (error) {
        // Игнорируем недоступные директории
      }
    };

    traverse(rootPath);
    return files;
  }

  /**
   * Анализ отдельного файла
   */
  analyzeFile(file) {
    try {
      const content = fs.readFileSync(file.path, 'utf-8');
      
      // Route файлы
      if (this.isRouteFile(file, content)) {
        this.addOpportunity(file, 'route', 'Route-based splitting', 'high');
      }
      
      // Большие компоненты
      if (this.isLargeComponent(file, content)) {
        this.addOpportunity(file, 'component', `Large component (${Math.round(file.size / 1024)}KB)`, 'medium');
      }
      
      // Vendor импорты
      const vendorImports = this.findVendorImports(content);
      if (vendorImports.length > 0) {
        this.addOpportunity(file, 'vendor', `Heavy imports: ${vendorImports.join(', ')}`, 'medium');
      }
      
      // Динамические возможности
      const dynamicOps = this.findDynamicOpportunities(content);
      if (dynamicOps.length > 0) {
        this.addOpportunity(file, 'dynamic', `Dynamic opportunities: ${dynamicOps.join(', ')}`, 'low');
      }
      
    } catch (error) {
      // Игнорируем ошибки чтения файлов
    }
  }

  /**
   * Добавление возможности разделения
   */
  addOpportunity(file, type, reason, priority) {
    this.results.splitOpportunities.push({
      file: file.relativePath,
      type,
      reason,
      priority,
      size: file.size,
      sizeKB: Math.round(file.size / 1024)
    });
  }

  /**
   * Проверка на route файл
   */
  isRouteFile(file, content) {
    const routePatterns = [
      /pages?\/|routes?\//,
      /useRouter|Router|Route/,
      /navigate|redirect/i
    ];
    
    return routePatterns.some(pattern => 
      pattern.test(file.relativePath) || pattern.test(content)
    );
  }

  /**
   * Проверка на большой компонент
   */
  isLargeComponent(file, content) {
    const isComponent = /\.(tsx?|jsx?)$/.test(file.path) && 
                       /export\s+(?:default\s+)?(?:function|const)\s+[A-Z]/.test(content);
    
    return isComponent && file.size > CONFIG.minChunkSize;
  }

  /**
   * Поиск vendor импортов
   */
  findVendorImports(content) {
    return CONFIG.heavyLibraries.filter(lib => 
      content.includes(`'${lib}'`) || 
      content.includes(`"${lib}"`) ||
      content.includes(`from '${lib}/`) ||
      content.includes(`from "${lib}/`)
    );
  }

  /**
   * Поиск динамических возможностей
   */
  findDynamicOpportunities(content) {
    const opportunities = [];
    
    if (/Modal|Dialog|Popup/i.test(content)) {
      opportunities.push('модальные');
    }
    
    if (/Admin|Management|Settings/i.test(content)) {
      opportunities.push('админ-панели');
    }
    
    if (/Tab|Accordion|Collapse/i.test(content)) {
      opportunities.push('вкладки');
    }
    
    if (/Chart|Graph|Plot/i.test(content)) {
      opportunities.push('графики');
    }
    
    return opportunities;
  }

  /**
   * Проверка релевантности файла
   */
  isRelevantFile(filePath) {
    return CONFIG.fileExtensions.some(ext => filePath.endsWith(ext));
  }

  /**
   * Генерация сводки
   */
  generateSummary() {
    const opportunities = this.results.splitOpportunities;
    
    // Группировка по типам
    const byType = opportunities.reduce((acc, op) => {
      acc[op.type] = (acc[op.type] || 0) + 1;
      return acc;
    }, {});
    
    // Группировка по приоритету
    const byPriority = opportunities.reduce((acc, op) => {
      acc[op.priority] = (acc[op.priority] || 0) + 1;
      return acc;
    }, {});
    
    // Потенциальная экономия
    const splitSize = opportunities.reduce((sum, op) => sum + op.size, 0);
    const savingsPercent = this.results.totalSize > 0 
      ? Math.round((splitSize / this.results.totalSize) * 100) 
      : 0;
    
    this.results.summary = {
      byType,
      byPriority,
      totalOpportunities: opportunities.length,
      potentialSavings: {
        bytes: splitSize,
        kb: Math.round(splitSize / 1024),
        percent: savingsPercent
      }
    };
  }
}

/**
 * Форматирование отчета
 */
function formatReport(results) {
  const { totalFiles, totalSize, splitOpportunities, summary } = results;
  
  let report = `
🚀 Code Splitting Analysis
==========================

📊 СТАТИСТИКА:
• Файлов проанализировано: ${totalFiles}
• Общий размер: ${Math.round(totalSize / 1024)} KB
• Возможностей разделения: ${summary.totalOpportunities}

`;

  // Статистика по типам
  if (Object.keys(summary.byType).length > 0) {
    report += `🎯 ПО ТИПАМ:\n`;
    Object.entries(summary.byType).forEach(([type, count]) => {
      const emoji = {
        route: '🛣️',
        component: '🧩', 
        vendor: '📦',
        dynamic: '⚡'
      }[type] || '📁';
      
      report += `${emoji} ${type}: ${count}\n`;
    });
    report += '\n';
  }

  // Потенциальная экономия
  if (summary.potentialSavings.percent > 0) {
    report += `💾 ПОТЕНЦИАЛЬНАЯ ЭКОНОМИЯ:
• Размер для разделения: ${summary.potentialSavings.kb} KB
• Процент от общего размера: ${summary.potentialSavings.percent}%

`;
  }

  // Топ файлов
  const topFiles = splitOpportunities
    .filter(op => op.priority === 'high')
    .slice(0, 5);
    
  if (topFiles.length > 0) {
    report += `🔝 ПРИОРИТЕТНЫЕ ФАЙЛЫ:\n`;
    topFiles.forEach(op => {
      report += `• ${op.file} (${op.sizeKB}KB) - ${op.reason}\n`;
    });
    report += '\n';
  }

  // Рекомендации
  report += `💡 РЕКОМЕНДАЦИИ:\n`;
  
  if (summary.byType.route > 0) {
    report += `1. 🛣️ Route-based splitting для ${summary.byType.route} маршрутов\n`;
    report += `   const LazyPage = React.lazy(() => import('./Page'));\n\n`;
  }
  
  if (summary.byType.component > 0) {
    report += `2. 🧩 Component splitting для ${summary.byType.component} компонентов\n`;
    report += `   const LazyComponent = React.lazy(() => import('./Component'));\n\n`;
  }
  
  if (summary.byType.vendor > 0) {
    report += `3. 📦 Vendor splitting для библиотек\n`;
    report += `   Настройте manualChunks в конфигурации бандлера\n\n`;
  }

  // Простая конфигурация Vite
  report += `⚙️ ПРИМЕР КОНФИГУРАЦИИ VITE:
// vite.config.ts
export default {
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          router: ['react-router-dom'],
        }
      }
    }
  }
}

`;

  return report;
}

/**
 * Основная функция
 */
function main() {
  const projectPath = process.argv[2] || process.cwd();
  
  try {
    console.log('🚀 HEYS Simple Code Splitting Analyzer');
    console.log('======================================');
    
    const analyzer = new SimpleCodeSplittingAnalyzer();
    const results = analyzer.analyze(projectPath);
    const report = formatReport(results);
    
    console.log(report);
    console.log('✅ Анализ завершен!');
    
  } catch (error) {
    console.error('❌ Ошибка:', error.message);
    process.exit(1);
  }
}

// Запуск
if (require.main === module) {
  main();
}

module.exports = { SimpleCodeSplittingAnalyzer };
