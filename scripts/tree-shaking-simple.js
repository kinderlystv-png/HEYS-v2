// filepath: scripts/tree-shaking-simple.js

/**
 * Упрощенный CLI скрипт для анализа tree shaking без ts-node
 * Работает с JavaScript файлами и простыми паттернами
 */

const fs = require('fs');
const path = require('path');

/**
 * Простая версия TreeShaker для демонстрации
 */
class SimpleTreeShaker {
  constructor(config = {}) {
    this.config = {
      include: ['**/*.{js,ts,jsx,tsx}'],
      exclude: ['**/*.test.{js,ts,jsx,tsx}', '**/node_modules/**'],
      ...config,
    };
  }

  /**
   * Анализирует проект на предмет неиспользуемых экспортов
   */
  async analyzeProject(rootPath) {
    console.log('🌲 Начинаем упрощенный анализ tree shaking...');
    console.log(`📁 Анализируемая директория: ${rootPath}`);

    const files = this.findSourceFiles(rootPath);
    console.log(`📁 Найдено ${files.length} файлов для анализа`);

    const unusedExports = [];
    let totalExports = 0;

    for (const file of files) {
      try {
        const content = fs.readFileSync(file, 'utf8');
        const exports = this.extractExports(content, file);
        totalExports += exports.length;

        // Простая проверка использования
        for (const exp of exports) {
          const isUsed = this.isExportUsed(exp, files);
          if (!isUsed) {
            unusedExports.push(exp);
          }
        }
      } catch (error) {
        console.warn(`⚠️ Не удалось проанализировать файл ${file}:`, error.message);
      }
    }

    console.log(
      `✅ Анализ завершен: найдено ${unusedExports.length} неиспользуемых экспортов из ${totalExports}`,
    );

    return {
      totalFiles: files.length,
      totalExports,
      unusedExports,
      recommendations: this.generateRecommendations(unusedExports),
    };
  }

  /**
   * Находит все исходные файлы
   */
  findSourceFiles(rootPath) {
    const files = [];

    const walkDir = (dir) => {
      if (!fs.existsSync(dir)) return;

      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          if (!this.shouldExclude(fullPath)) {
            walkDir(fullPath);
          }
        } else if (entry.isFile() && this.isSourceFile(entry.name)) {
          if (!this.shouldExclude(fullPath)) {
            files.push(fullPath);
          }
        }
      }
    };

    walkDir(rootPath);
    return files;
  }

  /**
   * Проверяет, следует ли исключить путь
   */
  shouldExclude(filePath) {
    return this.config.exclude.some((pattern) => {
      const simplePattern = pattern.replace(/\*\*/g, '').replace(/\*/g, '');
      return filePath.includes(simplePattern);
    });
  }

  /**
   * Проверяет, является ли файл исходным кодом
   */
  isSourceFile(fileName) {
    const extensions = ['.js', '.ts', '.jsx', '.tsx'];
    return extensions.some((ext) => fileName.endsWith(ext));
  }

  /**
   * Извлекает экспорты из файла
   */
  extractExports(content, filePath) {
    const exports = [];
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      // Простые паттерны для поиска экспортов
      const patterns = [
        /export\s+(?:const|let|var)\s+(\w+)/g,
        /export\s+function\s+(\w+)/g,
        /export\s+class\s+(\w+)/g,
        /export\s+interface\s+(\w+)/g,
        /export\s+type\s+(\w+)/g,
        /export\s*{\s*([^}]+)\s*}/g,
      ];

      patterns.forEach((pattern) => {
        let match;
        while ((match = pattern.exec(line)) !== null) {
          const exportName = match[1];

          if (exportName) {
            if (pattern.source.includes('{')) {
              // Named exports
              const namedExports = exportName.split(',').map((n) => n.trim());
              namedExports.forEach((name) => {
                if (name && !name.includes('as')) {
                  exports.push({
                    name,
                    file: filePath,
                    line: index + 1,
                    type: 'named',
                  });
                }
              });
            } else {
              exports.push({
                name: exportName,
                file: filePath,
                line: index + 1,
                type: this.detectType(line),
              });
            }
          }
        }
      });
    });

    return exports;
  }

  /**
   * Определяет тип экспорта
   */
  detectType(line) {
    if (line.includes('function')) return 'function';
    if (line.includes('class')) return 'class';
    if (line.includes('interface')) return 'interface';
    if (line.includes('type')) return 'type';
    return 'variable';
  }

  /**
   * Проверяет, используется ли экспорт
   */
  isExportUsed(exportItem, allFiles) {
    const otherFiles = allFiles.filter((file) => file !== exportItem.file);

    for (const file of otherFiles) {
      try {
        const content = fs.readFileSync(file, 'utf8');

        // Простые паттерны поиска импортов
        const importPatterns = [
          new RegExp(`import\\s+\\{[^}]*\\b${exportItem.name}\\b[^}]*\\}`, 'g'),
          new RegExp(`import\\s+${exportItem.name}\\b`, 'g'),
          new RegExp(`\\b${exportItem.name}\\b`, 'g'),
        ];

        for (const pattern of importPatterns) {
          if (pattern.test(content)) {
            // Дополнительная проверка - не является ли это объявлением
            const matches = content.match(pattern) || [];
            if (matches.length > 1) {
              // Если больше одного совпадения, вероятно используется
              return true;
            }
          }
        }
      } catch (error) {
        // Игнорируем ошибки чтения
      }
    }

    return false;
  }

  /**
   * Генерирует рекомендации
   */
  generateRecommendations(unusedExports) {
    const recommendations = [];

    if (unusedExports.length === 0) {
      recommendations.push('🎉 Отлично! Неиспользуемых экспортов не найдено');
      return recommendations;
    }

    // Группируем по файлам
    const byFile = unusedExports.reduce((acc, exp) => {
      if (!acc[exp.file]) acc[exp.file] = [];
      acc[exp.file].push(exp);
      return acc;
    }, {});

    Object.entries(byFile).forEach(([file, exports]) => {
      const fileName = path.basename(file);
      if (exports.length > 3) {
        recommendations.push(`📁 ${fileName}: ${exports.length} неиспользуемых экспортов`);
      } else {
        exports.forEach((exp) => {
          recommendations.push(`🔹 ${fileName}:${exp.line} - удалить '${exp.name}' (${exp.type})`);
        });
      }
    });

    const potentialSavings = unusedExports.length * 50; // Примерная оценка
    recommendations.push(`💾 Потенциальная экономия: ~${potentialSavings} строк кода`);

    return recommendations;
  }

  /**
   * Генерирует отчет
   */
  generateReport(analysis) {
    let report = '🌲 ОТЧЕТ TREE SHAKING АНАЛИЗА\n';
    report += '================================\n\n';

    report += `📊 Статистика:\n`;
    report += `   Проанализировано файлов: ${analysis.totalFiles}\n`;
    report += `   Всего экспортов: ${analysis.totalExports}\n`;
    report += `   Неиспользуемых экспортов: ${analysis.unusedExports.length}\n`;

    if (analysis.unusedExports.length > 0) {
      const percentage = ((analysis.unusedExports.length / analysis.totalExports) * 100).toFixed(1);
      report += `   Процент неиспользуемых: ${percentage}%\n`;
    }

    report += '\n';

    if (analysis.recommendations.length > 0) {
      report += `💡 Рекомендации:\n`;
      analysis.recommendations.forEach((rec) => {
        report += `   ${rec}\n`;
      });
      report += '\n';
    }

    // Детальный список (первые 10)
    if (analysis.unusedExports.length > 0) {
      report += `📋 Неиспользуемые экспорты (показано первые 10):\n`;
      analysis.unusedExports.slice(0, 10).forEach((exp) => {
        const fileName = path.basename(exp.file);
        report += `   ${fileName}:${exp.line} - ${exp.name} (${exp.type})\n`;
      });

      if (analysis.unusedExports.length > 10) {
        report += `   ... и еще ${analysis.unusedExports.length - 10} экспортов\n`;
      }
    }

    return report;
  }
}

/**
 * Основная функция
 */
async function main() {
  const args = process.argv.slice(2);
  const rootPath = args[0] || process.cwd();

  console.log('🔧 Конфигурация: Упрощенный анализ tree shaking');

  try {
    if (!fs.existsSync(rootPath)) {
      console.error(`❌ Путь не существует: ${rootPath}`);
      process.exit(1);
    }

    const treeShaker = new SimpleTreeShaker();
    const analysis = await treeShaker.analyzeProject(rootPath);

    // Краткая статистика
    console.log('\n📊 КРАТКАЯ СТАТИСТИКА:');
    console.log('========================');
    console.log(`📁 Проанализировано файлов: ${analysis.totalFiles}`);
    console.log(`🔍 Всего экспортов: ${analysis.totalExports}`);
    console.log(`🔍 Неиспользуемых экспортов: ${analysis.unusedExports.length}`);

    if (analysis.unusedExports.length > 0) {
      const percentage = ((analysis.unusedExports.length / analysis.totalExports) * 100).toFixed(1);
      console.log(`📊 Процент неиспользуемых: ${percentage}%`);
    }

    // Топ файлов с проблемами
    if (analysis.unusedExports.length > 0) {
      const fileGroups = analysis.unusedExports.reduce((acc, exp) => {
        const fileName = path.basename(exp.file);
        if (!acc[fileName]) acc[fileName] = [];
        acc[fileName].push(exp);
        return acc;
      }, {});

      const topFiles = Object.entries(fileGroups)
        .sort(([, a], [, b]) => b.length - a.length)
        .slice(0, 5);

      if (topFiles.length > 0) {
        console.log('\n🔝 ТОП ФАЙЛОВ С НЕИСПОЛЬЗУЕМЫМИ ЭКСПОРТАМИ:');
        topFiles.forEach(([fileName, exports], index) => {
          console.log(`   ${index + 1}. ${fileName}: ${exports.length} экспортов`);
        });
      }
    }

    // Рекомендации
    if (analysis.recommendations.length > 0) {
      console.log('\n💡 ГЛАВНЫЕ РЕКОМЕНДАЦИИ:');
      analysis.recommendations.slice(0, 5).forEach((rec) => {
        console.log(`   ${rec}`);
      });
    }

    // Полный отчет
    console.log('\n' + treeShaker.generateReport(analysis));

    if (analysis.unusedExports.length > 50) {
      console.log('\n⚠️  ВНИМАНИЕ: Найдено много неиспользуемых экспортов!');
      console.log('   Рекомендуется провести рефакторинг для улучшения производительности.');
    }
  } catch (error) {
    console.error('❌ Ошибка:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { SimpleTreeShaker };
