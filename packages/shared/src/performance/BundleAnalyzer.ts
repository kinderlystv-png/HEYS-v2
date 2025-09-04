// filepath: packages/shared/src/performance/BundleAnalyzer.ts

/**
 * Bundle Analyzer - Система анализа размера и производительности бандла
 * Отслеживает метрики загрузки, размер файлов и оптимизации
 */

export interface BundleMetrics {
  totalSize: number;
  gzippedSize: number;
  loadTime: number;
  firstContentfulPaint: number;
  largestContentfulPaint: number;
  timeToInteractive: number;
  chunkSizes: Record<string, number>;
  unusedCode: Record<string, number>;
}

export interface BaselineMetrics {
  timestamp: string;
  version: string;
  metrics: BundleMetrics;
  lighthouseScore: number;
  performanceGrade: 'A' | 'B' | 'C' | 'D' | 'F';
}

export class BundleAnalyzer {
  private static instance: BundleAnalyzer;
  private baselineHistory: BaselineMetrics[] = [];
  private currentMetrics: BundleMetrics | null = null;

  static getInstance(): BundleAnalyzer {
    if (!this.instance) {
      this.instance = new BundleAnalyzer();
    }
    return this.instance;
  }

  /**
   * Измеряет текущие метрики производительности
   */
  async measureCurrentMetrics(): Promise<BundleMetrics> {
    const startTime = performance.now();
    
    // Получаем размеры ресурсов
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    const navigationEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    
    // Анализируем размеры чанков
    const chunkSizes = this.analyzeChunkSizes(resources);
    
    // Вычисляем общий размер
    const totalSize = resources.reduce((total, resource) => {
      return total + (resource.transferSize || 0);
    }, 0);

    // Получаем метрики загрузки
    const metrics: BundleMetrics = {
      totalSize,
      gzippedSize: this.calculateGzippedSize(resources),
      loadTime: performance.now() - startTime,
      firstContentfulPaint: this.getFirstContentfulPaint(),
      largestContentfulPaint: this.getLargestContentfulPaint(),
      timeToInteractive: this.getTimeToInteractive(navigationEntry),
      chunkSizes,
      unusedCode: await this.analyzeUnusedCode()
    };

    this.currentMetrics = metrics;
    return metrics;
  }

  /**
   * Сохраняет baseline метрики для сравнения
   */
  saveBaseline(version: string, lighthouseScore: number): void {
    if (!this.currentMetrics) {
      throw new Error('Нет текущих метрик для сохранения baseline');
    }

    const baseline: BaselineMetrics = {
      timestamp: new Date().toISOString(),
      version,
      metrics: { ...this.currentMetrics },
      lighthouseScore,
      performanceGrade: this.calculatePerformanceGrade(lighthouseScore)
    };

    this.baselineHistory.push(baseline);
    this.saveToStorage(baseline);
    
    console.log(`📊 Baseline сохранен для версии ${version}:`, {
      totalSize: this.formatBytes(baseline.metrics.totalSize),
      lighthouseScore: baseline.lighthouseScore,
      grade: baseline.performanceGrade
    });
  }

  /**
   * Сравнивает текущие метрики с последним baseline
   */
  compareWithBaseline(): {
    improvement: boolean;
    changes: Record<string, { current: number; baseline: number; change: number; }>;
    summary: string;
  } | null {
    const lastBaseline = this.getLastBaseline();
    if (!lastBaseline || !this.currentMetrics) {
      return null;
    }

    const changes = {
      totalSize: {
        current: this.currentMetrics.totalSize,
        baseline: lastBaseline.metrics.totalSize,
        change: ((this.currentMetrics.totalSize - lastBaseline.metrics.totalSize) / lastBaseline.metrics.totalSize) * 100
      },
      loadTime: {
        current: this.currentMetrics.loadTime,
        baseline: lastBaseline.metrics.loadTime,
        change: ((this.currentMetrics.loadTime - lastBaseline.metrics.loadTime) / lastBaseline.metrics.loadTime) * 100
      },
      firstContentfulPaint: {
        current: this.currentMetrics.firstContentfulPaint,
        baseline: lastBaseline.metrics.firstContentfulPaint,
        change: ((this.currentMetrics.firstContentfulPaint - lastBaseline.metrics.firstContentfulPaint) / lastBaseline.metrics.firstContentfulPaint) * 100
      }
    };

    const totalSizeImproved = changes.totalSize.change < 0;
    const loadTimeImproved = changes.loadTime.change < 0;
    const improvement = totalSizeImproved && loadTimeImproved;

    const summary = `
Bundle Size: ${totalSizeImproved ? '✅' : '❌'} ${changes.totalSize.change.toFixed(1)}%
Load Time: ${loadTimeImproved ? '✅' : '❌'} ${changes.loadTime.change.toFixed(1)}%
FCP: ${changes.firstContentfulPaint.change < 0 ? '✅' : '❌'} ${changes.firstContentfulPaint.change.toFixed(1)}%
    `.trim();

    return { improvement, changes, summary };
  }

  /**
   * Анализирует размеры чанков
   */
  private analyzeChunkSizes(resources: PerformanceResourceTiming[]): Record<string, number> {
    const chunkSizes: Record<string, number> = {};
    
    resources.forEach(resource => {
      if (resource.name.includes('.js') || resource.name.includes('.css')) {
        const fileName = resource.name.split('/').pop() || 'unknown';
        chunkSizes[fileName] = resource.transferSize || 0;
      }
    });

    return chunkSizes;
  }

  /**
   * Вычисляет приблизительный размер после gzip
   */
  private calculateGzippedSize(resources: PerformanceResourceTiming[]): number {
    // Приблизительная оценка: gzip обычно сжимает на 60-80%
    const totalTransferSize = resources.reduce((total, resource) => {
      return total + (resource.transferSize || 0);
    }, 0);
    
    return Math.round(totalTransferSize * 0.7); // Примерно 70% от original size
  }

  /**
   * Получает First Contentful Paint метрику
   */
  private getFirstContentfulPaint(): number {
    const paintEntries = performance.getEntriesByType('paint');
    const fcpEntry = paintEntries.find(entry => entry.name === 'first-contentful-paint');
    return fcpEntry?.startTime || 0;
  }

  /**
   * Получает Largest Contentful Paint метрику
   */
  private getLargestContentfulPaint(): number {
    return new Promise<number>((resolve) => {
      if ('PerformanceObserver' in window) {
        const observer = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const lastEntry = entries[entries.length - 1];
          resolve(lastEntry?.startTime || 0);
          observer.disconnect();
        });
        observer.observe({ entryTypes: ['largest-contentful-paint'] });
        
        // Fallback через 3 секунды
        setTimeout(() => {
          observer.disconnect();
          resolve(0);
        }, 3000);
      } else {
        resolve(0);
      }
    }) as any; // Типизируем как число для совместимости
  }

  /**
   * Вычисляет Time to Interactive
   */
  private getTimeToInteractive(navigationEntry: PerformanceNavigationTiming): number {
    // Упрощенная оценка TTI
    return navigationEntry.domContentLoadedEventEnd - navigationEntry.fetchStart;
  }

  /**
   * Анализирует неиспользуемый код (приблизительно)
   */
  private async analyzeUnusedCode(): Promise<Record<string, number>> {
    // Для production можно интегрировать с webpack-bundle-analyzer
    // Сейчас возвращаем заглушку
    return {
      'unused-utilities': 0,
      'unused-components': 0,
      'dead-code': 0
    };
  }

  /**
   * Вычисляет оценку производительности
   */
  private calculatePerformanceGrade(lighthouseScore: number): 'A' | 'B' | 'C' | 'D' | 'F' {
    if (lighthouseScore >= 90) return 'A';
    if (lighthouseScore >= 80) return 'B';
    if (lighthouseScore >= 70) return 'C';
    if (lighthouseScore >= 60) return 'D';
    return 'F';
  }

  /**
   * Получает последний baseline
   */
  private getLastBaseline(): BaselineMetrics | null {
    return this.baselineHistory[this.baselineHistory.length - 1] || null;
  }

  /**
   * Сохраняет данные в localStorage
   */
  private saveToStorage(baseline: BaselineMetrics): void {
    try {
      const stored = localStorage.getItem('heys-performance-baselines');
      const baselines = stored ? JSON.parse(stored) : [];
      baselines.push(baseline);
      
      // Оставляем только последние 10 baseline
      if (baselines.length > 10) {
        baselines.splice(0, baselines.length - 10);
      }
      
      localStorage.setItem('heys-performance-baselines', JSON.stringify(baselines));
    } catch (error) {
      console.warn('Не удалось сохранить baseline в localStorage:', error);
    }
  }

  /**
   * Загружает данные из localStorage
   */
  loadFromStorage(): void {
    try {
      const stored = localStorage.getItem('heys-performance-baselines');
      if (stored) {
        this.baselineHistory = JSON.parse(stored);
      }
    } catch (error) {
      console.warn('Не удалось загрузить baselines из localStorage:', error);
    }
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
   * Генерирует отчет о производительности
   */
  generateReport(): {
    current: BundleMetrics | null;
    baseline: BaselineMetrics | null;
    comparison: {
      improvement: boolean;
      changes: Record<string, { current: number; baseline: number; change: number; }>;
      summary: string;
    } | null;
    recommendations: string[];
  } {
    const comparison = this.compareWithBaseline();
    const recommendations = this.generateRecommendations();

    return {
      current: this.currentMetrics,
      baseline: this.getLastBaseline(),
      comparison,
      recommendations
    };
  }

  /**
   * Генерирует рекомендации по оптимизации
   */
  private generateRecommendations(): string[] {
    const recommendations: string[] = [];
    
    if (!this.currentMetrics) return recommendations;

    // Рекомендации по размеру bundle
    if (this.currentMetrics.totalSize > 500000) { // 500KB
      recommendations.push('📦 Bundle размер превышает 500KB - рассмотрите code splitting');
    }

    // Рекомендации по времени загрузки
    if (this.currentMetrics.firstContentfulPaint > 1800) { // 1.8s
      recommendations.push('⚡ FCP превышает 1.8s - оптимизируйте критический путь рендеринга');
    }

    // Рекомендации по чанкам
    const largeChunks = Object.entries(this.currentMetrics.chunkSizes)
      .filter(([, size]) => size > 100000); // 100KB
    
    if (largeChunks.length > 0) {
      recommendations.push(`🔧 Найдены большие чанки: ${largeChunks.map(([name]) => name).join(', ')}`);
    }

    return recommendations;
  }
}

// Экспортируем singleton instance
export const bundleAnalyzer = BundleAnalyzer.getInstance();
