/**
 * @fileoverview Lighthouse Score Optimizer - Система оптимизации производительности
 * Комплексная система для анализа и улучшения Lighthouse Score
 *
 * @author AI Assistant
 * @version 1.0.0
 * @since 2024
 */

import { performance } from 'perf_hooks';

/**
 * Конфигурация для Lighthouse оптимизации
 */
export interface LighthouseConfig {
  /**
   * Целевой общий Lighthouse Score (0-100)
   */
  targetScore: number;

  /**
   * Детальные цели по категориям
   */
  categoryTargets: {
    performance: number;
    accessibility: number;
    bestPractices: number;
    seo: number;
    pwa?: number;
  };

  /**
   * Настройки оптимизации
   */
  optimizations: {
    enableCriticalResourceOptimization: boolean;
    enableImageOptimization: boolean;
    enableScriptOptimization: boolean;
    enableCSSOptimization: boolean;
    enableCaching: boolean;
    enableCompression: boolean;
    enableServiceWorker: boolean;
  };

  /**
   * Пороговые значения для метрик
   */
  performanceThresholds: {
    firstContentfulPaint: number; // ms
    largestContentfulPaint: number; // ms
    firstInputDelay: number; // ms
    cumulativeLayoutShift: number; // score
    speedIndex: number; // ms
    totalBlockingTime: number; // ms
  };

  /**
   * Настройки для анализа
   */
  analysis: {
    runCount: number;
    device: 'mobile' | 'desktop' | 'both';
    throttling: 'simulated3G' | 'simulated4G' | 'none';
    enableSourceMaps: boolean;
  };
}

/**
 * Результаты Lighthouse анализа
 */
export interface LighthouseResults {
  /**
   * Общий скор (0-100)
   */
  overallScore: number;

  /**
   * Скоры по категориям
   */
  categories: {
    performance: number;
    accessibility: number;
    bestPractices: number;
    seo: number;
    pwa?: number;
  };

  /**
   * Метрики производительности
   */
  metrics: {
    firstContentfulPaint: number;
    largestContentfulPaint: number;
    firstInputDelay: number;
    cumulativeLayoutShift: number;
    speedIndex: number;
    totalBlockingTime: number;
    timeToInteractive: number;
  };

  /**
   * Возможности для улучшения
   */
  opportunities: Array<{
    id: string;
    title: string;
    description: string;
    scoreDisplayMode: string;
    numericValue: number;
    displayValue: string;
    details?: any;
  }>;

  /**
   * Диагностические данные
   */
  diagnostics: Array<{
    id: string;
    title: string;
    description: string;
    scoreDisplayMode: string;
    displayValue: string;
    details?: any;
  }>;

  /**
   * Мета-информация
   */
  meta: {
    timestamp: number;
    url: string;
    device: string;
    userAgent: string;
    lighthouseVersion: string;
  };
}

/**
 * План оптимизации
 */
export interface OptimizationPlan {
  step: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  category: string;
  estimatedImprovement: number;
}

/**
 * Результаты выполнения оптимизации
 */
export interface OptimizationResults {
  success: boolean;
  finalResults?: LighthouseResults;
  improvements?: Array<{ metric: string; improvement: number }>;
  error?: string;
  executionTime?: number;
}

/**
 * Интерфейс прогресса выполнения
 */
export interface ProgressCallback {
  step: number;
  total: number;
  task: string;
  progress: number;
}

/**
 * Прогресс оптимизации
 */
export interface OptimizationProgress {
  currentStep: string;
  completedSteps: string[];
  totalSteps: number;
  estimatedTimeRemaining: number;
  currentScore: number;
  targetScore: number;
  improvementsSinceStart: Array<{
    metric: string;
    beforeValue: number;
    afterValue: number;
    improvement: number;
  }>;
}

/**
 * Главный класс для оптимизации Lighthouse Score
 */
export class LighthouseOptimizer {
  private config: LighthouseConfig;
  private baseline?: LighthouseResults;
  private currentResults?: LighthouseResults;
  private optimizationHistory: LighthouseResults[] = [];

  constructor(config: LighthouseConfig) {
    this.config = config;
  }

  /**
   * Получение конфигурации
   */
  getConfig(): LighthouseConfig {
    return this.config;
  }

  /**
   * Установка baseline результатов
   */
  async setBaseline(url: string): Promise<void> {
    this.validateUrlStrict(url);
    this.baseline = await this.runLighthouseAudit(url);
  }

  /**
   * Получение baseline результатов
   */
  getBaseline(): LighthouseResults | undefined {
    return this.baseline;
  }

  /**
   * Создание плана оптимизации (публичный метод)
   */
  createOptimizationPlan(results?: LighthouseResults): OptimizationPlan[] {
    const baseResults = results || this.baseline;
    if (!baseResults) {
      throw new Error('Нет результатов для создания плана. Сначала выполните setBaseline()');
    }
    return this.createOptimizationPlanInternal(baseResults);
  }

  /**
   * Выполнение оптимизации по плану
   */
  async executeOptimization(
    plan: OptimizationPlan[],
    progressCallback?: (progress: ProgressCallback) => void,
  ): Promise<OptimizationResults> {
    const startTime = performance.now();

    try {
      // Симуляция выполнения оптимизации
      for (let i = 0; i < plan.length; i++) {
        const task = plan[i];

        if (progressCallback && task) {
          progressCallback({
            step: i + 1,
            total: plan.length,
            task: task.description,
            progress: ((i + 1) / plan.length) * 100,
          });
        }

        // Симуляция времени выполнения задачи
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // Запуск повторного аудита для получения результатов
      if (this.baseline) {
        const finalResults = await this.runLighthouseAudit(this.baseline.meta.url);
        this.currentResults = finalResults;

        const improvements = this.calculateImprovements();
        const executionTime = performance.now() - startTime;

        return {
          success: true,
          finalResults,
          improvements,
          executionTime,
        };
      }

      throw new Error('Нет baseline для сравнения результатов');
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Неизвестная ошибка',
        executionTime: performance.now() - startTime,
      };
    }
  }

  /**
   * Запуск Lighthouse аудита
   */
  async runLighthouseAudit(url: string): Promise<LighthouseResults> {
    this.validateUrl(url);

    console.log(`🔍 Запуск Lighthouse аудита для ${url}...`);

    try {
      // Симуляция запуска Lighthouse
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Мок результатов (в реальной реализации здесь будет вызов Lighthouse API)
      const mockResults: LighthouseResults = {
        overallScore: Math.floor(Math.random() * 40) + 50, // 50-89
        categories: {
          performance: Math.floor(Math.random() * 30) + 60,
          accessibility: Math.floor(Math.random() * 20) + 75,
          bestPractices: Math.floor(Math.random() * 25) + 70,
          seo: Math.floor(Math.random() * 20) + 80,
          pwa: Math.floor(Math.random() * 30) + 50,
        },
        metrics: {
          firstContentfulPaint: Math.floor(Math.random() * 1000) + 1500,
          largestContentfulPaint: Math.floor(Math.random() * 2000) + 2500,
          firstInputDelay: Math.floor(Math.random() * 100) + 100,
          cumulativeLayoutShift: Math.random() * 0.2 + 0.1,
          speedIndex: Math.floor(Math.random() * 1500) + 3000,
          totalBlockingTime: Math.floor(Math.random() * 300) + 200,
          timeToInteractive: Math.floor(Math.random() * 2000) + 4000,
        },
        opportunities: [
          {
            id: 'unused-css-rules',
            title: 'Remove unused CSS',
            description: 'Удалите неиспользуемые CSS правила',
            scoreDisplayMode: 'numeric',
            numericValue: Math.floor(Math.random() * 500) + 200,
            displayValue: '500ms',
            details: { items: [] },
          },
          {
            id: 'unused-javascript',
            title: 'Remove unused JavaScript',
            description: 'Удалите неиспользуемый JavaScript',
            scoreDisplayMode: 'numeric',
            numericValue: Math.floor(Math.random() * 800) + 300,
            displayValue: '800ms',
            details: { items: [] },
          },
        ],
        diagnostics: [
          {
            id: 'uses-optimized-images',
            title: 'Serve images in next-gen formats',
            description: 'Используйте современные форматы изображений',
            scoreDisplayMode: 'binary',
            displayValue: '1.2s',
            details: { items: [] },
          },
        ],
        meta: {
          timestamp: Date.now(),
          url,
          device: this.config.analysis.device === 'both' ? 'desktop' : this.config.analysis.device,
          userAgent: 'Chrome/120.0.0.0',
          lighthouseVersion: '11.0.0',
        },
      };

      console.log(`✅ Аудит завершен. Скор: ${mockResults.overallScore}`);
      return mockResults;
    } catch (error) {
      console.error('❌ Ошибка запуска Lighthouse:', error);
      throw new Error(
        `Ошибка Lighthouse аудита: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`,
      );
    }
  }

  /**
   * Создание плана оптимизации на основе результатов аудита
   */
  private createOptimizationPlanInternal(results: LighthouseResults): OptimizationPlan[] {
    const plan: OptimizationPlan[] = [];

    // Анализируем opportunities для создания плана
    for (const opportunity of results.opportunities) {
      let impact: 'high' | 'medium' | 'low' = 'low';
      let estimatedImprovement = 0;

      // Определяем приоритет на основе потенциального улучшения
      if (opportunity.numericValue > 500) {
        impact = 'high';
        estimatedImprovement = 15;
      } else if (opportunity.numericValue > 200) {
        impact = 'medium';
        estimatedImprovement = 8;
      } else {
        impact = 'low';
        estimatedImprovement = 3;
      }

      // Создаем задачу оптимизации на основе ID opportunity
      const task = this.createOptimizationTask(opportunity.id, impact, estimatedImprovement);
      if (task) {
        plan.push(task);
      }
    }

    // Добавляем базовые оптимизации в зависимости от настроек
    if (this.config.optimizations.enableImageOptimization) {
      plan.push({
        step: 'optimize-images',
        description: 'Оптимизация изображений (WebP, сжатие, lazy loading)',
        impact: 'high',
        category: 'performance',
        estimatedImprovement: 12,
      });
    }

    if (this.config.optimizations.enableCriticalResourceOptimization) {
      plan.push({
        step: 'critical-resources',
        description: 'Оптимизация критических ресурсов',
        impact: 'high',
        category: 'performance',
        estimatedImprovement: 10,
      });
    }

    if (this.config.optimizations.enableScriptOptimization) {
      plan.push({
        step: 'optimize-scripts',
        description: 'Минификация и сжатие JavaScript',
        impact: 'medium',
        category: 'performance',
        estimatedImprovement: 8,
      });
    }

    if (this.config.optimizations.enableCSSOptimization) {
      plan.push({
        step: 'optimize-css',
        description: 'Минификация и очистка CSS',
        impact: 'medium',
        category: 'performance',
        estimatedImprovement: 6,
      });
    }

    if (this.config.optimizations.enableServiceWorker) {
      plan.push({
        step: 'service-worker',
        description: 'Настройка Service Worker для кэширования',
        impact: 'medium',
        category: 'pwa',
        estimatedImprovement: 5,
      });
    }

    // Сортируем по приоритету
    return plan.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.impact] - priorityOrder[a.impact];
    });
  }

  /**
   * Создание задачи оптимизации на основе Lighthouse opportunity
   */
  private createOptimizationTask(
    opportunityId: string,
    impact: 'high' | 'medium' | 'low',
    estimatedImprovement: number,
  ): OptimizationPlan | null {
    const taskMap: Record<string, { step: string; description: string; category: string }> = {
      'unused-css-rules': {
        step: 'remove-unused-css',
        description: 'Удаление неиспользуемых CSS правил',
        category: 'performance',
      },
      'unused-javascript': {
        step: 'remove-unused-js',
        description: 'Удаление неиспользуемого JavaScript',
        category: 'performance',
      },
      'uses-optimized-images': {
        step: 'optimize-images',
        description: 'Конвертация изображений в современные форматы',
        category: 'performance',
      },
      'render-blocking-resources': {
        step: 'eliminate-render-blocking',
        description: 'Устранение блокирующих рендеринг ресурсов',
        category: 'performance',
      },
      'unminified-css': {
        step: 'minify-css',
        description: 'Минификация CSS файлов',
        category: 'performance',
      },
      'unminified-javascript': {
        step: 'minify-js',
        description: 'Минификация JavaScript файлов',
        category: 'performance',
      },
      'uses-text-compression': {
        step: 'enable-compression',
        description: 'Включение сжатия текстовых ресурсов',
        category: 'performance',
      },
    };

    const taskTemplate = taskMap[opportunityId];
    if (!taskTemplate) {
      return null;
    }

    return {
      ...taskTemplate,
      impact,
      estimatedImprovement,
    };
  }

  /**
   * Генерация отчета о результатах оптимизации
   */
  generateReport(): string {
    if (!this.baseline) {
      return 'Отчет недоступен: нет базовых результатов';
    }

    const improvements = this.calculateImprovements();
    const currentScore = this.currentResults?.overallScore || this.baseline.overallScore;

    let report = '# 📊 Отчет об оптимизации Lighthouse Score\n\n';

    // Общая информация
    report += '## 📈 Общие результаты\n\n';
    report += `- **Исходный скор:** ${this.baseline.overallScore}\n`;
    report += `- **Текущий скор:** ${currentScore}\n`;
    report += `- **Целевой скор:** ${this.config.targetScore}\n`;
    report += `- **Улучшение:** ${currentScore - this.baseline.overallScore} баллов\n\n`;

    // Детали по категориям
    report += '## 🎯 Результаты по категориям\n\n';
    report += '| Категория | Исходно | Текущий | Цель | Статус |\n';
    report += '|-----------|---------|---------|------|--------|\n';

    const categories = [
      { key: 'performance', name: 'Performance', target: this.config.categoryTargets.performance },
      {
        key: 'accessibility',
        name: 'Accessibility',
        target: this.config.categoryTargets.accessibility,
      },
      {
        key: 'bestPractices',
        name: 'Best Practices',
        target: this.config.categoryTargets.bestPractices,
      },
      { key: 'seo', name: 'SEO', target: this.config.categoryTargets.seo },
    ];

    for (const category of categories) {
      const baselineScore =
        this.baseline.categories[category.key as keyof typeof this.baseline.categories];
      const currentScoreForCategory =
        this.currentResults?.categories[
          category.key as keyof typeof this.currentResults.categories
        ] ?? baselineScore;
      const status = (currentScoreForCategory ?? 0) >= category.target ? '✅' : '⚠️';

      report += `| ${category.name} | ${baselineScore} | ${currentScoreForCategory} | ${category.target} | ${status} |\n`;
    }

    // Улучшения метрик
    if (improvements.length > 0) {
      report += '\n## 🚀 Улучшения метрик\n\n';
      for (const improvement of improvements) {
        const sign = improvement.improvement >= 0 ? '+' : '';
        report += `- **${improvement.metric}:** ${sign}${improvement.improvement.toFixed(1)}%\n`;
      }
    }

    // Рекомендации
    report += '\n## 💡 Рекомендации для дальнейшего улучшения\n\n';

    if (currentScore < this.config.targetScore) {
      const gap = this.config.targetScore - currentScore;
      report += `Для достижения целевого скора необходимо улучшить результат на ${gap} баллов.\n\n`;

      // Специфичные рекомендации
      if (this.baseline.categories.performance < this.config.categoryTargets.performance) {
        report +=
          '- 🔧 **Performance:** Рассмотрите дополнительную оптимизацию изображений и JavaScript\n';
      }
      if (this.baseline.categories.accessibility < this.config.categoryTargets.accessibility) {
        report += '- ♿ **Accessibility:** Улучшите доступность интерфейса\n';
      }
      if (this.baseline.categories.bestPractices < this.config.categoryTargets.bestPractices) {
        report += '- ✅ **Best Practices:** Следуйте современным веб-стандартам\n';
      }
      if (this.baseline.categories.seo < this.config.categoryTargets.seo) {
        report += '- 🔍 **SEO:** Оптимизируйте мета-теги и структуру страницы\n';
      }
    } else {
      report += '🎉 Поздравляем! Целевой скор достигнут!\n';
    }

    return report;
  }

  /**
   * Расчет улучшений метрик
   */
  calculateImprovements(): Array<{ metric: string; improvement: number }> {
    if (!this.baseline || !this.currentResults) {
      return [];
    }

    const improvements: Array<{ metric: string; improvement: number }> = [];

    // Сравниваем основные метрики
    const metrics = [
      { key: 'firstContentfulPaint', name: 'First Contentful Paint', invert: true },
      { key: 'largestContentfulPaint', name: 'Largest Contentful Paint', invert: true },
      { key: 'firstInputDelay', name: 'First Input Delay', invert: true },
      { key: 'cumulativeLayoutShift', name: 'Cumulative Layout Shift', invert: true },
      { key: 'speedIndex', name: 'Speed Index', invert: true },
      { key: 'totalBlockingTime', name: 'Total Blocking Time', invert: true },
    ];

    for (const metric of metrics) {
      const baseValue = this.baseline.metrics[metric.key as keyof typeof this.baseline.metrics];
      const currentValue =
        this.currentResults.metrics[metric.key as keyof typeof this.currentResults.metrics];

      if (baseValue && currentValue) {
        let improvement = ((baseValue - currentValue) / baseValue) * 100;
        if (!metric.invert) {
          improvement = -improvement;
        }

        improvements.push({
          metric: metric.name,
          improvement,
        });
      }
    }

    return improvements;
  }

  /**
   * Получение текущего прогресса
   */
  getProgress(): OptimizationProgress {
    const currentScore = this.currentResults?.overallScore || this.baseline?.overallScore || 0;
    const improvements = this.calculateImprovements().map((imp) => ({
      metric: imp.metric,
      beforeValue: this.baseline?.overallScore || 0,
      afterValue: this.currentResults?.overallScore || 0,
      improvement: imp.improvement,
    }));

    return {
      currentStep: 'Анализ результатов',
      completedSteps: ['Baseline создан', 'План оптимизации готов'],
      totalSteps: 5,
      estimatedTimeRemaining: 120, // секунды
      currentScore,
      targetScore: this.config.targetScore,
      improvementsSinceStart: improvements,
    };
  }

  /**
   * Получение истории оптимизации
   */
  getOptimizationHistory(): LighthouseResults[] {
    return [...this.optimizationHistory];
  }

  /**
   * Валидация URL
   */
  validateUrl(url: string): boolean {
    if (!url || typeof url !== 'string') {
      return false;
    }

    try {
      new URL(url);
    } catch {
      return false;
    }

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return false;
    }

    return true;
  }

  /**
   * Приватный метод для валидации URL с выбросом ошибок
   */
  private validateUrlStrict(url: string): void {
    if (!url || typeof url !== 'string') {
      throw new Error('URL не может быть пустым');
    }

    try {
      new URL(url);
    } catch {
      throw new Error('Некорректный формат URL');
    }

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      throw new Error('URL должен начинаться с http:// или https://');
    }
  }
}

/**
 * Экспорт по умолчанию
 */
export default LighthouseOptimizer;
