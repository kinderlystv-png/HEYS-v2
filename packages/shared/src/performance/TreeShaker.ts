// filepath: packages/shared/src/performance/TreeShaker.ts

/**
 * TreeShaker - Система анализа и оптимизации tree shaking
 * Определяет неиспользуемый код и предлагает оптимизации
 */

import * as fs from 'fs';
import * as path from 'path';

import { perfLogger } from './logger';

const baseLogger = perfLogger;

export interface UnusedExport {
  file: string;
  exportName: string;
  line: number;
  size: number;
  type: 'function' | 'class' | 'variable' | 'constant' | 'type' | 'interface';
}

export interface TreeShakingAnalysis {
  totalFiles: number;
  analyzedFiles: number;
  unusedExports: UnusedExport[];
  potentialSavings: number;
  recommendations: string[];
  bundlerOptimizations: string[];
}

export interface TreeShakingConfig {
  include: string[];
  exclude: string[];
  bundler: 'vite' | 'webpack' | 'rollup' | 'esbuild';
  aggressive: boolean;
  preserveTypes: boolean;
}

export class TreeShaker {
  private config: TreeShakingConfig;
  private analysis: TreeShakingAnalysis | null = null;
  private readonly logger = baseLogger.child({ component: 'TreeShaker' });

  constructor(config: Partial<TreeShakingConfig> = {}) {
    this.config = {
      include: ['src/**/*.{ts,tsx,js,jsx}'],
      exclude: ['**/*.test.{ts,tsx,js,jsx}', '**/*.spec.{ts,tsx,js,jsx}', '**/node_modules/**'],
      bundler: 'vite',
      aggressive: false,
      preserveTypes: true,
      ...config,
    };
  }

  /**
   * Анализирует проект на предмет tree shaking возможностей
   */
  async analyzeProject(rootPath: string): Promise<TreeShakingAnalysis> {
    this.logger.info('Начинаем анализ tree shaking');

    const files = await this.findSourceFiles(rootPath);
    const unusedExports: UnusedExport[] = [];
    let potentialSavings = 0;

    this.logger.info(`Найдено ${files.length} файлов для анализа`);

    for (const file of files) {
      try {
        const unused = await this.analyzeFile(file, files);
        unusedExports.push(...unused);

        // Приблизительный расчет потенциальной экономии
        unused.forEach((exp) => {
          potentialSavings += exp.size;
        });
      } catch (error) {
        this.logger.warn({ err: error as Error }, `Не удалось проанализировать файл ${file}`);
      }
    }

    const recommendations = this.generateRecommendations(unusedExports);
    const bundlerOptimizations = this.getBundlerOptimizations();

    this.analysis = {
      totalFiles: files.length,
      analyzedFiles: files.length,
      unusedExports,
      potentialSavings,
      recommendations,
      bundlerOptimizations,
    };

    this.logger.info(`Анализ завершен: найдено ${unusedExports.length} неиспользуемых экспортов`);
    return this.analysis;
  }

  /**
   * Находит все исходные файлы для анализа
   */
  private async findSourceFiles(rootPath: string): Promise<string[]> {
    const files: string[] = [];

    const searchPaths = this.config.include.map((pattern) => {
      // Упрощенная обработка glob паттернов
      const basePath = pattern.replace(/\/\*\*\/\*\.\{.*\}$/, '');
      return path.join(rootPath, basePath);
    });

    for (const searchPath of searchPaths) {
      if (fs.existsSync(searchPath)) {
        await this.walkDirectory(searchPath, files);
      }
    }

    // Фильтруем исключения
    return files.filter((file) => {
      return !this.config.exclude.some((excludePattern) => {
        return file.includes(excludePattern.replace(/\*\*/g, ''));
      });
    });
  }

  /**
   * Рекурсивный обход директории
   */
  private async walkDirectory(dirPath: string, files: string[]): Promise<void> {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        await this.walkDirectory(fullPath, files);
      } else if (entry.isFile() && this.isSourceFile(entry.name)) {
        files.push(fullPath);
      }
    }
  }

  /**
   * Проверяет, является ли файл исходным кодом
   */
  private isSourceFile(fileName: string): boolean {
    const extensions = ['.ts', '.tsx', '.js', '.jsx'];
    return extensions.some((ext) => fileName.endsWith(ext));
  }

  /**
   * Анализирует отдельный файл на предмет неиспользуемых экспортов
   */
  private async analyzeFile(filePath: string, allFiles: string[]): Promise<UnusedExport[]> {
    const content = fs.readFileSync(filePath, 'utf8');
    const exports = this.extractExports(content, filePath);
    const unusedExports: UnusedExport[] = [];

    for (const exportItem of exports) {
      const isUsed = await this.isExportUsed(exportItem, filePath, allFiles);

      if (!isUsed) {
        unusedExports.push(exportItem);
      }
    }

    return unusedExports;
  }

  /**
   * Извлекает экспорты из файла
   */
  private extractExports(content: string, filePath: string): UnusedExport[] {
    const exports: UnusedExport[] = [];
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      // Ищем различные паттерны экспортов
      const patterns = [
        /export\s+(?:const|let|var)\s+(\w+)/g, // export const name
        /export\s+function\s+(\w+)/g, // export function name
        /export\s+class\s+(\w+)/g, // export class name
        /export\s+interface\s+(\w+)/g, // export interface name
        /export\s+type\s+(\w+)/g, // export type name
        /export\s+enum\s+(\w+)/g, // export enum name
        /export\s*{\s*([^}]+)\s*}/g, // export { name1, name2 }
      ];

      patterns.forEach((pattern) => {
        let match;
        while ((match = pattern.exec(line)) !== null) {
          const exportName = match[1];

          if (!exportName) continue; // Пропускаем если имя не найдено

          // Для export { } нужна дополнительная обработка
          if (pattern.source.includes('{')) {
            const namedExports = exportName.split(',').map((n) => n.trim());
            namedExports.forEach((name) => {
              if (name && !name.includes('as')) {
                // Пропускаем переименования
                exports.push({
                  file: filePath,
                  exportName: name,
                  line: index + 1,
                  size: this.estimateExportSize(line),
                  type: this.detectExportType(line, name),
                });
              }
            });
          } else {
            exports.push({
              file: filePath,
              exportName,
              line: index + 1,
              size: this.estimateExportSize(line),
              type: this.detectExportType(line, exportName),
            });
          }
        }
      });
    });

    return exports;
  }

  /**
   * Проверяет, используется ли экспорт в других файлах
   */
  private async isExportUsed(
    exportItem: UnusedExport,
    sourceFile: string,
    allFiles: string[],
  ): Promise<boolean> {
    // Исключаем сам файл из поиска
    const otherFiles = allFiles.filter((file) => file !== sourceFile);

    for (const file of otherFiles) {
      try {
        const content = fs.readFileSync(file, 'utf8');

        // Ищем импорты этого экспорта
        const importPatterns = [
          new RegExp(`import\\s+\\{[^}]*\\b${exportItem.exportName}\\b[^}]*\\}`, 'g'),
          new RegExp(`import\\s+${exportItem.exportName}\\b`, 'g'),
          new RegExp(
            `import\\s*\\*\\s+as\\s+\\w+\\s+from\\s+['"][^'"]*${path.basename(sourceFile, path.extname(sourceFile))}['"]`,
            'g',
          ),
        ];

        // Также ищем прямые использования (для динамических импортов)
        const usagePatterns = [new RegExp(`\\b${exportItem.exportName}\\b`, 'g')];

        const isImported = importPatterns.some((pattern) => pattern.test(content));
        const isUsed = usagePatterns.some((pattern) => {
          const matches = content.match(pattern);
          return matches && matches.length > 1; // Больше 1, так как один может быть объявлением
        });

        if (isImported || isUsed) {
          return true;
        }
      } catch (error) {
        // Игнорируем ошибки чтения файлов
        continue;
      }
    }

    return false;
  }

  /**
   * Приблизительная оценка размера экспорта
   */
  private estimateExportSize(line: string): number {
    // Простая эвристика на основе длины строки
    let size = line.length * 2; // Базовый размер

    // Дополнительные веса для различных конструкций
    if (line.includes('function')) size += 100;
    if (line.includes('class')) size += 200;
    if (line.includes('interface')) size += 50;
    if (line.includes('type')) size += 30;
    if (line.includes('const')) size += 20;

    return size;
  }

  /**
   * Определяет тип экспорта
   */
  private detectExportType(line: string, exportName: string): UnusedExport['type'] {
    if (line.includes('function')) return 'function';
    if (line.includes('class')) return 'class';
    if (line.includes('interface')) return 'interface';
    if (line.includes('type')) return 'type';
    if (line.includes('const') || line.includes('let') || line.includes('var')) {
      // Проверяем, является ли константа функцией
      if (line.includes('=>') || line.includes('function')) return 'function';
      return exportName.toUpperCase() === exportName ? 'constant' : 'variable';
    }
    return 'variable';
  }

  /**
   * Генерирует рекомендации по оптимизации
   */
  private generateRecommendations(unusedExports: UnusedExport[]): string[] {
    const recommendations: string[] = [];

    if (unusedExports.length === 0) {
      recommendations.push('🎉 Отлично! Неиспользуемых экспортов не найдено');
      return recommendations;
    }

    // Группируем по файлам
    const byFile = unusedExports.reduce(
      (acc, exp) => {
        const fileExports = acc[exp.file] ?? [];
        fileExports.push(exp);
        acc[exp.file] = fileExports;
        return acc;
      },
      {} as Record<string, UnusedExport[]>,
    );

    // Рекомендации по файлам
    Object.entries(byFile).forEach(([file, exports]) => {
      const fileName = path.basename(file);
      const totalSize = exports.reduce((sum, exp) => sum + exp.size, 0);

      if (exports.length > 5) {
        recommendations.push(
          `📁 ${fileName}: ${exports.length} неиспользуемых экспортов (${this.formatBytes(totalSize)})`,
        );
      } else {
        exports.forEach((exp) => {
          recommendations.push(
            `🔹 ${fileName}:${exp.line} - удалить '${exp.exportName}' (${exp.type})`,
          );
        });
      }
    });

    // Общие рекомендации
    const totalSize = unusedExports.reduce((sum, exp) => sum + exp.size, 0);
    recommendations.push(`💾 Потенциальная экономия: ${this.formatBytes(totalSize)}`);

    // Рекомендации по типам
    const typeGroups = unusedExports.reduce(
      (acc, exp) => {
        acc[exp.type] = (acc[exp.type] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    Object.entries(typeGroups).forEach(([type, count]) => {
      if (count > 3) {
        recommendations.push(`🔧 Много неиспользуемых ${type}: ${count} - рассмотрите рефакторинг`);
      }
    });

    return recommendations;
  }

  /**
   * Получает оптимизации для конкретного bundler
   */
  private getBundlerOptimizations(): string[] {
    const optimizations: string[] = [];

    switch (this.config.bundler) {
      case 'vite':
        optimizations.push('⚡ Vite: Включить build.rollupOptions.treeshake');
        optimizations.push('📦 Vite: Настроить build.rollupOptions.external для библиотек');
        optimizations.push('🔧 Vite: Использовать build.lib для library mode');
        break;

      case 'webpack':
        optimizations.push('⚡ Webpack: Включить optimization.usedExports');
        optimizations.push('📦 Webpack: Настроить optimization.sideEffects: false');
        optimizations.push('🔧 Webpack: Использовать webpack-bundle-analyzer');
        break;

      case 'rollup':
        optimizations.push('⚡ Rollup: Включить treeshake.unknownGlobalSideEffects: false');
        optimizations.push('📦 Rollup: Настроить external dependencies');
        optimizations.push('🔧 Rollup: Использовать @rollup/plugin-node-resolve');
        break;

      case 'esbuild':
        optimizations.push('⚡ ESBuild: Включить treeShaking: true');
        optimizations.push('📦 ESBuild: Настроить external для node_modules');
        optimizations.push('🔧 ESBuild: Использовать bundle: true для оптимизации');
        break;
    }

    return optimizations;
  }

  /**
   * Форматирует байты в человеко-читаемый формат
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Создает отчет об анализе
   */
  generateReport(): string {
    if (!this.analysis) {
      return 'Анализ не выполнен. Запустите analyzeProject() сначала.';
    }

    const { totalFiles, unusedExports, potentialSavings, recommendations, bundlerOptimizations } =
      this.analysis;

    let report = '🌲 ОТЧЕТ TREE SHAKING АНАЛИЗА\n';
    report += '================================\n\n';

    report += `📊 Статистика:\n`;
    report += `   Проанализировано файлов: ${totalFiles}\n`;
    report += `   Неиспользуемых экспортов: ${unusedExports.length}\n`;
    report += `   Потенциальная экономия: ${this.formatBytes(potentialSavings)}\n\n`;

    if (recommendations.length > 0) {
      report += `💡 Рекомендации:\n`;
      recommendations.forEach((rec) => {
        report += `   ${rec}\n`;
      });
      report += '\n';
    }

    if (bundlerOptimizations.length > 0) {
      report += `⚙️ Оптимизации bundler (${this.config.bundler}):\n`;
      bundlerOptimizations.forEach((opt) => {
        report += `   ${opt}\n`;
      });
      report += '\n';
    }

    // Детальный список неиспользуемых экспортов (первые 10)
    if (unusedExports.length > 0) {
      report += `📋 Неиспользуемые экспорты (показано первые 10):\n`;
      unusedExports.slice(0, 10).forEach((exp) => {
        const fileName = path.basename(exp.file);
        report += `   ${fileName}:${exp.line} - ${exp.exportName} (${exp.type}, ${this.formatBytes(exp.size)})\n`;
      });

      if (unusedExports.length > 10) {
        report += `   ... и еще ${unusedExports.length - 10} экспортов\n`;
      }
    }

    return report;
  }

  /**
   * Экспортирует результаты в JSON
   */
  exportToJson(): string {
    if (!this.analysis) {
      throw new Error('Анализ не выполнен');
    }
    return JSON.stringify(this.analysis, null, 2);
  }

  /**
   * Получает текущий анализ
   */
  getAnalysis(): TreeShakingAnalysis | null {
    return this.analysis;
  }
}

// Экспорт singleton instance
export const treeShaker = new TreeShaker();
