import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { LighthouseConfig, LighthouseResults, OptimizationPlan } from './LighthouseOptimizer';
import { LighthouseOptimizer } from './LighthouseOptimizer';

describe('LighthouseOptimizer', () => {
  let optimizer: LighthouseOptimizer;
  let mockConfig: LighthouseConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    mockConfig = {
      targetScore: 92,
      categoryTargets: {
        performance: 90,
        accessibility: 95,
        bestPractices: 90,
        seo: 95,
      },
      optimizations: {
        enableCriticalResourceOptimization: true,
        enableImageOptimization: true,
        enableScriptOptimization: true,
        enableCSSOptimization: true,
        enableCaching: true,
        enableCompression: true,
        enableServiceWorker: true,
      },
      performanceThresholds: {
        firstContentfulPaint: 1800,
        largestContentfulPaint: 2500,
        firstInputDelay: 100,
        cumulativeLayoutShift: 0.1,
        speedIndex: 3000,
        totalBlockingTime: 200,
      },
      analysis: {
        runCount: 3,
        device: 'both',
        throttling: 'simulated3G',
        enableSourceMaps: true,
      },
    };

    optimizer = new LighthouseOptimizer(mockConfig);
  });

  describe('Инициализация', () => {
    it('должен создавать экземпляр с корректной конфигурацией', () => {
      expect(optimizer).toBeInstanceOf(LighthouseOptimizer);
      expect(optimizer.getConfig()).toEqual(mockConfig);
    });
  });

  describe('URL валидация', () => {
    it('должен валидировать корректные URL', () => {
      expect(optimizer.validateUrl('https://example.com')).toBe(true);
      expect(optimizer.validateUrl('http://localhost:3000')).toBe(true);
      expect(optimizer.validateUrl('https://subdomain.example.com/path')).toBe(true);
    });

    it('должен отклонять некорректные URL', () => {
      expect(optimizer.validateUrl('invalid-url')).toBe(false);
      expect(optimizer.validateUrl('ftp://example.com')).toBe(false);
      expect(optimizer.validateUrl('')).toBe(false);
      expect(optimizer.validateUrl('javascript:alert(1)')).toBe(false);
    });
  });

  describe('Baseline управление', () => {
    it('должен обрабатывать недоступные URL при baseline', async () => {
      // Тестируем с некорректным URL
      await expect(optimizer.setBaseline('invalid-url')).rejects.toThrow();
    });

    it('должен получать baseline результаты', () => {
      expect(optimizer.getBaseline()).toBeUndefined();
    });
  });

  describe('Создание плана оптимизации', () => {
    let mockResults: LighthouseResults;

    beforeEach(() => {
      mockResults = {
        overallScore: 75,
        categories: {
          performance: 70,
          accessibility: 85,
          bestPractices: 80,
          seo: 90,
        },
        metrics: {
          firstContentfulPaint: 2500,
          largestContentfulPaint: 4000,
          firstInputDelay: 150,
          cumulativeLayoutShift: 0.15,
          speedIndex: 3500,
          totalBlockingTime: 300,
          timeToInteractive: 5000,
        },
        opportunities: [
          {
            id: 'unused-css-rules',
            title: 'Remove unused CSS',
            description: 'Remove dead rules from stylesheets',
            scoreDisplayMode: 'binary',
            numericValue: 500,
            displayValue: '500 ms',
          },
        ],
        diagnostics: [],
        meta: {
          timestamp: Date.now(),
          url: 'https://example.com',
          device: 'mobile',
          userAgent: 'Test Agent',
          lighthouseVersion: '10.0.0',
        },
      };
    });

    it('должен создавать план оптимизации из результатов', () => {
      const plan = optimizer.createOptimizationPlan(mockResults);

      expect(plan).toBeInstanceOf(Array);
      expect(plan.length).toBeGreaterThan(0);

      // Проверяем структуру плана
      plan.forEach((item) => {
        expect(item).toHaveProperty('step');
        expect(item).toHaveProperty('description');
        expect(item).toHaveProperty('impact');
        expect(item).toHaveProperty('category');
        expect(item).toHaveProperty('estimatedImprovement');
      });
    });

    it('должен выбрасывать ошибку при отсутствии результатов', () => {
      expect(() => optimizer.createOptimizationPlan()).toThrow(
        'Нет результатов для создания плана',
      );
    });

    it('должен включать оптимизации для медленного FCP', () => {
      const plan = optimizer.createOptimizationPlan(mockResults);

      // Проверяем что есть оптимизации
      expect(plan.length).toBeGreaterThan(0);

      // Проверяем наличие любой оптимизации связанной с загрузкой
      const hasLoadingOptimization = plan.some(
        (opt) => opt.category === 'loading' || opt.description.toLowerCase().includes('load'),
      );

      expect(hasLoadingOptimization).toBe(true);
    });
  });

  describe('Выполнение оптимизации', () => {
    let optimizationPlan: OptimizationPlan[];
    let mockResults: LighthouseResults;

    beforeEach(() => {
      mockResults = {
        overallScore: 75,
        categories: {
          performance: 70,
          accessibility: 85,
          bestPractices: 80,
          seo: 90,
        },
        metrics: {
          firstContentfulPaint: 2500,
          largestContentfulPaint: 4000,
          firstInputDelay: 150,
          cumulativeLayoutShift: 0.15,
          speedIndex: 3500,
          totalBlockingTime: 300,
          timeToInteractive: 5000,
        },
        opportunities: [],
        diagnostics: [],
        meta: {
          timestamp: Date.now(),
          url: 'https://example.com',
          device: 'mobile',
          userAgent: 'Test Agent',
          lighthouseVersion: '10.0.0',
        },
      };

      optimizationPlan = optimizer.createOptimizationPlan(mockResults);
    });

    it('должен выполнять план оптимизации', async () => {
      const progressCallback = vi.fn();

      // Устанавливаем baseline для корректной работы
      const mockBaseline: LighthouseResults = {
        overallScore: 75,
        categories: {
          performance: 70,
          accessibility: 85,
          bestPractices: 80,
          seo: 90,
        },
        metrics: {
          firstContentfulPaint: 2500,
          largestContentfulPaint: 4000,
          firstInputDelay: 150,
          cumulativeLayoutShift: 0.15,
          speedIndex: 3500,
          totalBlockingTime: 300,
          timeToInteractive: 5000,
        },
        opportunities: [],
        diagnostics: [],
        meta: {
          timestamp: Date.now(),
          url: 'https://example.com',
          device: 'mobile',
          userAgent: 'Test Agent',
          lighthouseVersion: '10.0.0',
        },
      };

      // Эмулируем установку baseline
      (optimizer as any).baseline = mockBaseline;

      const results = await optimizer.executeOptimization(optimizationPlan, progressCallback);

      expect(results).toBeDefined();
      expect(progressCallback).toHaveBeenCalled();
    });

    it('должен отслеживать прогресс оптимизации', async () => {
      const progressCallback = vi.fn();

      await optimizer.executeOptimization(optimizationPlan, progressCallback);

      // Проверяем что callback вызывался с правильными параметрами
      const calls = progressCallback.mock.calls;
      expect(calls.length).toBeGreaterThan(0);

      // Первый вызов должен содержать корректную структуру
      expect(calls[0][0]).toMatchObject({
        step: expect.any(Number),
        total: expect.any(Number),
        task: expect.any(String),
        progress: expect.any(Number),
      });
    });
  });

  describe('Генерация отчетов', () => {
    beforeEach(() => {
      // Устанавливаем baseline для генерации отчета
      const mockBaseline: LighthouseResults = {
        overallScore: 85,
        categories: {
          performance: 80,
          accessibility: 90,
          bestPractices: 85,
          seo: 95,
        },
        metrics: {
          firstContentfulPaint: 1500,
          largestContentfulPaint: 2500,
          firstInputDelay: 80,
          cumulativeLayoutShift: 0.08,
          speedIndex: 2000,
          totalBlockingTime: 150,
          timeToInteractive: 3000,
        },
        opportunities: [],
        diagnostics: [],
        meta: {
          timestamp: Date.now(),
          url: 'https://example.com',
          device: 'mobile',
          userAgent: 'Test Agent',
          lighthouseVersion: '10.0.0',
        },
      };

      (optimizer as any).baseline = mockBaseline;
    });

    it('должен генерировать отчет', () => {
      const report = optimizer.generateReport();

      expect(report).toBeDefined();
      expect(typeof report).toBe('string');
      expect(report).toContain('Отчет об оптимизации Lighthouse');
    });
  });

  describe('Расчет улучшений', () => {
    it('должен рассчитывать улучшения между результатами', () => {
      const improvements = optimizer.calculateImprovements();

      expect(improvements).toBeInstanceOf(Array);
      // Если нет baseline, возвращается пустой массив
      expect(improvements.length).toBe(0);
    });
  });

  describe('Получение прогресса', () => {
    it('должен возвращать текущий прогресс', () => {
      const progress = optimizer.getProgress();

      expect(progress).toBeDefined();
      expect(progress).toHaveProperty('currentStep');
      expect(progress).toHaveProperty('completedSteps');
      expect(progress).toHaveProperty('totalSteps');
    });
  });

  describe('Обработка ошибок', () => {
    it('должен корректно обрабатывать невалидные URL', () => {
      expect(optimizer.validateUrl('invalid')).toBe(false);
      expect(optimizer.validateUrl('')).toBe(false);
      expect(optimizer.validateUrl('javascript:void(0)')).toBe(false);
    });

    it('должен выбрасывать ошибку при отсутствии результатов для плана', () => {
      expect(() => optimizer.createOptimizationPlan()).toThrow(
        'Нет результатов для создания плана',
      );
    });
  });

  describe('Интеграционные тесты', () => {
    it('должен корректно работать с полным циклом создания плана', () => {
      const mockResults: LighthouseResults = {
        overallScore: 75,
        categories: {
          performance: 70,
          accessibility: 85,
          bestPractices: 80,
          seo: 90,
        },
        metrics: {
          firstContentfulPaint: 2500,
          largestContentfulPaint: 4000,
          firstInputDelay: 150,
          cumulativeLayoutShift: 0.15,
          speedIndex: 3500,
          totalBlockingTime: 300,
          timeToInteractive: 5000,
        },
        opportunities: [],
        diagnostics: [],
        meta: {
          timestamp: Date.now(),
          url: 'https://example.com',
          device: 'mobile',
          userAgent: 'Test Agent',
          lighthouseVersion: '10.0.0',
        },
      };

      // 1. Создание плана
      const plan = optimizer.createOptimizationPlan(mockResults);
      expect(plan.length).toBeGreaterThan(0);

      // 2. Проверка структуры плана
      plan.forEach((item) => {
        expect(item.step).toBeDefined();
        expect(item.description).toBeDefined();
        expect(['high', 'medium', 'low']).toContain(item.impact);
        expect(item.category).toBeDefined();
        expect(typeof item.estimatedImprovement).toBe('number');
      });
    });

    it('должен корректно управлять конфигурацией', () => {
      const config = optimizer.getConfig();
      expect(config).toEqual(mockConfig);
      expect(config.targetScore).toBe(92);
      expect(config.categoryTargets.performance).toBe(90);
    });
  });
});
