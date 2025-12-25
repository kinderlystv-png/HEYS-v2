// filepath: packages/shared/src/performance/CodeSplitter.ts

import * as fs from 'fs';
import * as path from 'path';

import { logger as baseLogger } from '@heys/logger';

/**
 * Интерфейс для описания точки разделения кода
 */
export interface SplitPoint {
  file: string;
  reason: string;
  estimatedSize: number;
  priority: 'high' | 'medium' | 'low';
  type: 'route' | 'component' | 'vendor' | 'feature' | 'dynamic';
}

/**
 * Интерфейс для результатов анализа разделения
 */
export interface CodeSplittingAnalysis {
  totalFiles: number;
  totalSize: number;
  splitPoints: SplitPoint[];
  recommendations: string[];
  potentialSavings: {
    initialBundle: number;
    averageChunk: number;
    estimatedImprovement: string;
  };
}

/**
 * Интерфейс конфигурации анализатора разделения кода
 */
export interface CodeSplitterConfig {
  projectRoot: string;
  sourceDirectory: string;
  excludePatterns: string[];
  includePaths: string[];
  chunkSizeThreshold: number; // KB
  routeBasedSplitting: boolean;
  vendorSplitting: boolean;
  componentSplitting: boolean;
}

/**
 * Основной класс для анализа и оптимизации разделения кода
 * Анализирует проект и предлагает оптимальные точки разделения
 */
export class CodeSplitter {
  private config: CodeSplitterConfig;
  private fileCache: Map<string, string> = new Map();
  private readonly logger = baseLogger.child({ component: 'CodeSplitter' });

  constructor(config: Partial<CodeSplitterConfig> = {}) {
    this.config = {
      projectRoot: process.cwd(),
      sourceDirectory: 'src',
      excludePatterns: ['node_modules', '.git', 'dist', 'build', '*.test.*', '*.spec.*'],
      includePaths: ['src', 'apps', 'packages'],
      chunkSizeThreshold: 200, // 200KB
      routeBasedSplitting: true,
      vendorSplitting: true,
      componentSplitting: true,
      ...config,
    };
  }

  /**
   * Анализирует проект и находит оптимальные точки разделения кода
   */
  async analyzeProject(): Promise<CodeSplittingAnalysis> {
    this.logger.info('Начинаем анализ возможностей разделения кода');

    const allFiles = this.findAllFiles(this.config.projectRoot);
    const analysis: CodeSplittingAnalysis = {
      totalFiles: allFiles.length,
      totalSize: 0,
      splitPoints: [],
      recommendations: [],
      potentialSavings: {
        initialBundle: 0,
        averageChunk: 0,
        estimatedImprovement: '0%',
      },
    };

    // Анализируем файлы и находим точки разделения
    for (const file of allFiles) {
      try {
        const fileSize = this.getFileSize(file);
        analysis.totalSize += fileSize;

        // Анализируем возможности разделения
        const splitPoints = await this.analyzeFite(file, fileSize);
        analysis.splitPoints.push(...splitPoints);
      } catch (error) {
        this.logger.warn(`Не удалось проанализировать файл ${file}`, {
          metadata: { error },
        });
      }
    }

    // Генерируем рекомендации
    analysis.recommendations = this.generateRecommendations(analysis.splitPoints);
    analysis.potentialSavings = this.calculatePotentialSavings(analysis);

    this.logger.info(`Анализ завершен: найдено ${analysis.splitPoints.length} точек разделения`);
    return analysis;
  }

  /**
   * Анализирует отдельный файл на предмет возможностей разделения
   */
  private async analyzeFite(filePath: string, fileSize: number): Promise<SplitPoint[]> {
    const splitPoints: SplitPoint[] = [];
    const content = this.getFileContent(filePath);
    const relativePath = path.relative(this.config.projectRoot, filePath);

    // 1. Route-based splitting (маршруты)
    if (this.config.routeBasedSplitting && this.isRouteFile(content, filePath)) {
      splitPoints.push({
        file: relativePath,
        reason: 'Route-based splitting - файл маршрута',
        estimatedSize: fileSize,
        priority: 'high',
        type: 'route',
      });
    }

    // 2. Large component splitting (большие компоненты)
    if (this.config.componentSplitting && this.isLargeComponent(content, fileSize)) {
      splitPoints.push({
        file: relativePath,
        reason: `Большой компонент (${Math.round(fileSize / 1024)}KB)`,
        estimatedSize: fileSize,
        priority: fileSize > this.config.chunkSizeThreshold * 1024 ? 'high' : 'medium',
        type: 'component',
      });
    }

    // 3. Vendor/library splitting (внешние библиотеки)
    if (this.config.vendorSplitting && this.hasHeavyImports(content)) {
      const heavyImports = this.extractHeavyImports(content);
      splitPoints.push({
        file: relativePath,
        reason: `Содержит тяжелые импорты: ${heavyImports.join(', ')}`,
        estimatedSize: fileSize,
        priority: 'medium',
        type: 'vendor',
      });
    }

    // 4. Feature-based splitting (модули функций)
    if (this.isFeatureModule(content, filePath)) {
      splitPoints.push({
        file: relativePath,
        reason: 'Feature module - независимый модуль функций',
        estimatedSize: fileSize,
        priority: 'medium',
        type: 'feature',
      });
    }

    // 5. Dynamic import opportunities (возможности динамических импортов)
    const dynamicOpportunities = this.findDynamicImportOpportunities(content);
    if (dynamicOpportunities.length > 0) {
      splitPoints.push({
        file: relativePath,
        reason: `Возможности динамических импортов: ${dynamicOpportunities.join(', ')}`,
        estimatedSize: fileSize,
        priority: 'low',
        type: 'dynamic',
      });
    }

    return splitPoints;
  }

  /**
   * Проверяет, является ли файл файлом маршрута
   */
  private isRouteFile(content: string, filePath: string): boolean {
    const routePatterns = [
      /export\s+default\s+function\s+\w+Page/,
      /pages\/.*\.(tsx?|jsx?)$/,
      /routes\/.*\.(tsx?|jsx?)$/,
      /app\/.*\/page\.(tsx?|jsx?)$/,
      /<Route\s+/,
      /useRouter\(/,
      /router\.(push|replace)/,
    ];

    return routePatterns.some((pattern) => pattern.test(content) || pattern.test(filePath));
  }

  /**
   * Проверяет, является ли компонент большим
   */
  private isLargeComponent(content: string, fileSize: number): boolean {
    const isComponent =
      /(?:export\s+(?:default\s+)?(?:function|const)\s+[A-Z]\w*)|(?:class\s+[A-Z]\w*\s+extends\s+(?:React\.)?Component)/.test(
        content,
      );
    const isLarge = fileSize > this.config.chunkSizeThreshold * 1024 * 0.5; // 50% от threshold

    return isComponent && isLarge;
  }

  /**
   * Проверяет наличие тяжелых импортов
   */
  private hasHeavyImports(content: string): boolean {
    const heavyLibraries = [
      'lodash',
      'moment',
      'three',
      'chartjs',
      'monaco-editor',
      '@aws-sdk',
      'fabric',
      'pdf-lib',
      'mammoth',
      'xlsx',
    ];

    return heavyLibraries.some(
      (lib) =>
        content.includes(`from '${lib}'`) ||
        content.includes(`require('${lib}')`) ||
        content.includes(`import('${lib}')`),
    );
  }

  /**
   * Извлекает список тяжелых импортов
   */
  private extractHeavyImports(content: string): string[] {
    const heavyLibraries = ['lodash', 'moment', 'three', 'chartjs', 'monaco-editor'];
    return heavyLibraries.filter(
      (lib) => content.includes(`'${lib}'`) || content.includes(`"${lib}"`),
    );
  }

  /**
   * Проверяет, является ли файл модулем функций
   */
  private isFeatureModule(content: string, filePath: string): boolean {
    const featurePatterns = [
      /features\/\w+/,
      /modules\/\w+/,
      /pages\/\w+/,
      /components\/\w+\/index/,
    ];

    const hasFeatureStructure = featurePatterns.some((pattern) => pattern.test(filePath));
    const hasMultipleExports = (content.match(/export/g) || []).length > 3;

    return hasFeatureStructure && hasMultipleExports;
  }

  /**
   * Находит возможности для динамических импортов
   */
  private findDynamicImportOpportunities(content: string): string[] {
    const opportunities: string[] = [];

    // Условные импорты
    if (/if\s*\(.*\)\s*{[\s\S]*import/.test(content)) {
      opportunities.push('условные импорты');
    }

    // Модальные окна и попапы
    if (/Modal|Dialog|Popup/.test(content)) {
      opportunities.push('модальные компоненты');
    }

    // Вкладки и аккордеоны
    if (/Tab|Accordion|Collapse/.test(content)) {
      opportunities.push('вкладки/аккордеоны');
    }

    // Админ панели и настройки
    if (/Admin|Settings|Config/.test(content)) {
      opportunities.push('админ интерфейсы');
    }

    return opportunities;
  }

  /**
   * Генерирует рекомендации по оптимизации
   */
  private generateRecommendations(splitPoints: SplitPoint[]): string[] {
    const recommendations: string[] = [];

    const routePoints = splitPoints.filter((p) => p.type === 'route');
    const componentPoints = splitPoints.filter((p) => p.type === 'component');
    const vendorPoints = splitPoints.filter((p) => p.type === 'vendor');

    if (routePoints.length > 0) {
      recommendations.push(
        `🛣️ Реализуйте route-based splitting для ${routePoints.length} маршрутов`,
      );
    }

    if (componentPoints.length > 0) {
      recommendations.push(
        `🧩 Разделите ${componentPoints.length} больших компонентов с помощью React.lazy()`,
      );
    }

    if (vendorPoints.length > 0) {
      recommendations.push(
        `📦 Вынесите vendor библиотеки в отдельные chunks (${vendorPoints.length} файлов)`,
      );
    }

    const highPriorityPoints = splitPoints.filter((p) => p.priority === 'high');
    if (highPriorityPoints.length > 0) {
      recommendations.push(
        `⚡ Приоритет HIGH: начните с ${highPriorityPoints.length} критичных точек`,
      );
    }

    if (splitPoints.length === 0) {
      recommendations.push('✅ Код уже хорошо разделен или проект небольшой');
    }

    return recommendations;
  }

  /**
   * Рассчитывает потенциальную экономию
   */
  private calculatePotentialSavings(
    analysis: CodeSplittingAnalysis,
  ): CodeSplittingAnalysis['potentialSavings'] {
    const totalSize = analysis.totalSize;
    const splitPointsSize = analysis.splitPoints.reduce(
      (sum, point) => sum + point.estimatedSize,
      0,
    );

    const initialBundleReduction = Math.round((splitPointsSize / totalSize) * 100);
    const averageChunkSize =
      analysis.splitPoints.length > 0
        ? Math.round(splitPointsSize / analysis.splitPoints.length / 1024)
        : 0;

    return {
      initialBundle: Math.round(totalSize / 1024), // KB
      averageChunk: averageChunkSize, // KB
      estimatedImprovement: `${Math.min(initialBundleReduction, 70)}%`, // Максимум 70%
    };
  }

  /**
   * Находит все файлы в проекте
   */
  private findAllFiles(rootPath: string): string[] {
    const files: string[] = [];

    const traverse = (currentPath: string) => {
      try {
        const items = fs.readdirSync(currentPath);

        for (const item of items) {
          const fullPath = path.join(currentPath, item);
          const stat = fs.statSync(fullPath);

          if (stat.isDirectory()) {
            const relativePath = path.relative(rootPath, fullPath);
            if (!this.shouldExclude(relativePath)) {
              traverse(fullPath);
            }
          } else if (stat.isFile() && this.isRelevantFile(fullPath)) {
            files.push(fullPath);
          }
        }
      } catch (error) {
        // Пропускаем недоступные директории
      }
    };

    traverse(rootPath);
    return files;
  }

  /**
   * Проверяет, должен ли путь быть исключен
   */
  private shouldExclude(relativePath: string): boolean {
    return this.config.excludePatterns.some((pattern) => {
      // Если паттерн содержит wildcard, преобразуем в регулярку
      if (pattern.includes('*')) {
        const regexPattern = pattern
          .replace(/\./g, '\\.') // экранируем точки
          .replace(/\*/g, '.*'); // заменяем * на .*
        try {
          return new RegExp(regexPattern).test(relativePath);
        } catch {
          return false;
        }
      }
      // Обычная проверка на включение
      return relativePath.includes(pattern);
    });
  }

  /**
   * Проверяет, является ли файл релевантным для анализа
   */
  private isRelevantFile(filePath: string): boolean {
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '.vue', '.svelte'];
    return (
      extensions.some((ext) => filePath.endsWith(ext)) &&
      !filePath.includes('.test.') &&
      !filePath.includes('.spec.')
    );
  }

  /**
   * Получает размер файла в байтах
   */
  private getFileSize(filePath: string): number {
    try {
      return fs.statSync(filePath).size;
    } catch {
      return 0;
    }
  }

  /**
   * Получает содержимое файла с кешированием
   */
  private getFileContent(filePath: string): string {
    if (this.fileCache.has(filePath)) {
      const cached = this.fileCache.get(filePath);
      if (cached) {
        return cached;
      }
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      this.fileCache.set(filePath, content);
      return content;
    } catch {
      return '';
    }
  }

  /**
   * Генерирует конфигурацию Vite для code splitting
   */
  generateViteConfig(): string {
    return `
export default {
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunks
          vendor: ['react', 'react-dom'],
          router: ['react-router-dom'],
          ui: ['@mui/material', '@emotion/react'],
          
          // Feature chunks будут созданы автоматически
        },
        chunkFileNames: 'chunks/[name]-[hash].js',
        entryFileNames: 'entries/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    },
    chunkSizeWarningLimit: 500,
    sourcemap: true
  }
}`;
  }

  /**
   * Очищает кеш файлов
   */
  clearCache(): void {
    this.fileCache.clear();
  }
}

export default CodeSplitter;
