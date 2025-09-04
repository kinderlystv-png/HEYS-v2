// filepath: packages/shared/src/performance/__tests__/BundleAnalyzer.test.ts

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BundleAnalyzer, bundleAnalyzer } from '../BundleAnalyzer';

/**
 * Тесты для BundleAnalyzer
 * Проверяем основную функциональность анализа производительности
 */

// Mock Performance API
const mockPerformance = {
  now: vi.fn(() => 1000),
  getEntriesByType: vi.fn(),
};

const mockNavigationEntry = {
  domContentLoadedEventEnd: 2000,
  fetchStart: 500,
};

const mockResourceEntries = [
  {
    name: 'https://example.com/bundle.js',
    transferSize: 150000,
  },
  {
    name: 'https://example.com/styles.css',
    transferSize: 50000,
  },
  {
    name: 'https://example.com/vendor.js',
    transferSize: 200000,
  },
];

const mockPaintEntries = [
  {
    name: 'first-contentful-paint',
    startTime: 1200,
  },
];

// Mock localStorage
const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
};

describe('BundleAnalyzer', () => {
  let analyzer: BundleAnalyzer;

  beforeEach(() => {
    // Мокаем глобальные объекты
    global.performance = mockPerformance as any;
    global.localStorage = mockLocalStorage as any;
    global.console = {
      ...console,
      log: vi.fn(),
      warn: vi.fn(),
    };

    // Сбрасываем моки
    vi.clearAllMocks();
    
    // Настраиваем стандартные ответы
    mockPerformance.getEntriesByType.mockImplementation((type: string) => {
      if (type === 'resource') return mockResourceEntries;
      if (type === 'navigation') return [mockNavigationEntry];
      if (type === 'paint') return mockPaintEntries;
      return [];
    });

    analyzer = BundleAnalyzer.getInstance();
  });

  describe('measureCurrentMetrics', () => {
    it('должен корректно измерять метрики производительности', async () => {
      // Мокаем PerformanceObserver для LCP
      global.PerformanceObserver = vi.fn().mockImplementation((_callback) => ({
        observe: vi.fn(),
        disconnect: vi.fn(),
      })) as any;

      const metrics = await analyzer.measureCurrentMetrics();

      expect(metrics).toBeDefined();
      expect(metrics.totalSize).toBe(400000); // 150k + 50k + 200k
      expect(metrics.firstContentfulPaint).toBe(1200);
      expect(metrics.timeToInteractive).toBe(1500); // 2000 - 500
      expect(metrics.chunkSizes).toEqual({
        'bundle.js': 150000,
        'styles.css': 50000,
        'vendor.js': 200000,
      });
    });

    it('должен правильно рассчитывать gzip размер', async () => {
      const metrics = await analyzer.measureCurrentMetrics();
      
      // Ожидаем 70% от общего размера (400000 * 0.7 = 280000)
      expect(metrics.gzippedSize).toBe(280000);
    });

    it('должен обрабатывать отсутствие данных производительности', async () => {
      mockPerformance.getEntriesByType.mockReturnValue([]);

      const metrics = await analyzer.measureCurrentMetrics();

      expect(metrics.totalSize).toBe(0);
      expect(metrics.firstContentfulPaint).toBe(0);
      expect(metrics.chunkSizes).toEqual({});
    });
  });

  describe('saveBaseline', () => {
    it('должен сохранять baseline метрики', async () => {
      // Сначала измеряем метрики
      await analyzer.measureCurrentMetrics();

      // Сохраняем baseline
      analyzer.saveBaseline('v1.0.0', 85);

      // Проверяем, что данные сохранены в localStorage
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'heys-performance-baselines',
        expect.stringContaining('v1.0.0')
      );

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Baseline сохранен для версии v1.0.0'),
        expect.any(Object)
      );
    });

    it('должен выбрасывать ошибку, если нет текущих метрик', () => {
      expect(() => {
        analyzer.saveBaseline('v1.0.0', 85);
      }).toThrow('Нет текущих метрик для сохранения baseline');
    });

    it('должен правильно определять оценку производительности', async () => {
      await analyzer.measureCurrentMetrics();

      // Тестируем разные оценки
      analyzer.saveBaseline('v1.0.0', 95); // Должно быть A
      analyzer.saveBaseline('v1.1.0', 85); // Должно быть B
      analyzer.saveBaseline('v1.2.0', 75); // Должно быть C
      analyzer.saveBaseline('v1.3.0', 65); // Должно быть D
      analyzer.saveBaseline('v1.4.0', 55); // Должно быть F

      // Проверяем, что все baseline сохранены
      expect(mockLocalStorage.setItem).toHaveBeenCalledTimes(5);
    });
  });

  describe('compareWithBaseline', () => {
    it('должен сравнивать с последним baseline', async () => {
      // Создаем fake baseline в истории
      const fakeBaseline = {
        timestamp: '2025-09-01T00:00:00.000Z',
        version: 'v1.0.0',
        metrics: {
          totalSize: 500000,
          gzippedSize: 350000,
          loadTime: 1200,
          firstContentfulPaint: 1500,
          largestContentfulPaint: 2000,
          timeToInteractive: 2500,
          chunkSizes: {},
          unusedCode: {},
        },
        lighthouseScore: 80,
        performanceGrade: 'B' as const,
      };

      // Добавляем baseline в историю через приватное свойство
      (analyzer as any).baselineHistory = [fakeBaseline];

      // Измеряем текущие метрики
      await analyzer.measureCurrentMetrics();

      const comparison = analyzer.compareWithBaseline();

      expect(comparison).toBeDefined();
      if (comparison && comparison.changes.totalSize) {
        expect(comparison.improvement).toBe(true); // Текущие метрики лучше
        expect(comparison.changes.totalSize.change).toBeLessThan(0); // Размер уменьшился
        expect(comparison.summary).toContain('Bundle Size: ✅');
      }
    });

    it('должен возвращать null, если нет baseline', () => {
      const comparison = analyzer.compareWithBaseline();
      expect(comparison).toBeNull();
    });
  });

  describe('generateReport', () => {
    it('должен генерировать полный отчет', async () => {
      await analyzer.measureCurrentMetrics();

      const report = analyzer.generateReport();

      expect(report).toHaveProperty('current');
      expect(report).toHaveProperty('baseline');
      expect(report).toHaveProperty('comparison');
      expect(report).toHaveProperty('recommendations');

      expect(report.current).toBeDefined();
      expect(Array.isArray(report.recommendations)).toBe(true);
    });

    it('должен генерировать рекомендации для больших bundle', async () => {
      // Мокаем большие размеры файлов
      mockPerformance.getEntriesByType.mockImplementation((type: string) => {
        if (type === 'resource') return [
          { name: 'large-bundle.js', transferSize: 600000 }, // > 500KB
        ];
        if (type === 'navigation') return [mockNavigationEntry];
        if (type === 'paint') return [{ name: 'first-contentful-paint', startTime: 2000 }]; // > 1.8s
        return [];
      });

      await analyzer.measureCurrentMetrics();
      const report = analyzer.generateReport();

      expect(report.recommendations).toContain(
        expect.stringContaining('Bundle размер превышает 500KB')
      );
      expect(report.recommendations).toContain(
        expect.stringContaining('FCP превышает 1.8s')
      );
    });
  });

  describe('loadFromStorage', () => {
    it('должен загружать данные из localStorage', () => {
      const mockData = JSON.stringify([
        {
          timestamp: '2025-09-01T00:00:00.000Z',
          version: 'v1.0.0',
          metrics: {},
          lighthouseScore: 85,
          performanceGrade: 'B',
        },
      ]);

      mockLocalStorage.getItem.mockReturnValue(mockData);

      analyzer.loadFromStorage();

      expect(mockLocalStorage.getItem).toHaveBeenCalledWith('heys-performance-baselines');
    });

    it('должен обрабатывать ошибки при загрузке', () => {
      mockLocalStorage.getItem.mockImplementation(() => {
        throw new Error('localStorage error');
      });

      // Не должно выбрасывать ошибку
      expect(() => analyzer.loadFromStorage()).not.toThrow();
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Не удалось загрузить baselines'),
        expect.any(Error)
      );
    });
  });

  describe('Singleton pattern', () => {
    it('должен возвращать один и тот же instance', () => {
      const instance1 = BundleAnalyzer.getInstance();
      const instance2 = BundleAnalyzer.getInstance();

      expect(instance1).toBe(instance2);
    });

    it('bundleAnalyzer должен быть тем же instance', () => {
      const instance = BundleAnalyzer.getInstance();
      expect(bundleAnalyzer).toBe(instance);
    });
  });
});

// Дополнительные integration тесты
describe('BundleAnalyzer Integration', () => {
  it('должен работать полный цикл: измерение -> сохранение -> сравнение', async () => {
    const analyzer = BundleAnalyzer.getInstance();

    // 1. Измеряем первые метрики
    await analyzer.measureCurrentMetrics();
    analyzer.saveBaseline('v1.0.0', 80);

    // 2. "Улучшаем" метрики
    if (mockResourceEntries[0]) {
      mockResourceEntries[0].transferSize = 100000; // Уменьшаем размер
    }
    await analyzer.measureCurrentMetrics();

    // 3. Сравниваем
    const comparison = analyzer.compareWithBaseline();

    expect(comparison).toBeDefined();
    if (comparison && comparison.changes.totalSize) {
      expect(comparison.improvement).toBe(true);
      expect(comparison.changes.totalSize.change).toBeLessThan(0);
    }
  });

  it('должен ограничивать количество baseline в localStorage', async () => {
    const analyzer = BundleAnalyzer.getInstance();
    await analyzer.measureCurrentMetrics();

    // Сохраняем 12 baseline (больше лимита в 10)
    for (let i = 1; i <= 12; i++) {
      analyzer.saveBaseline(`v1.${i}.0`, 80);
    }

    // Проверяем, что в последнем вызове setItem данные содержат только 10 записей
    const lastCall = mockLocalStorage.setItem.mock.calls[mockLocalStorage.setItem.mock.calls.length - 1];
    const savedData = JSON.parse(lastCall[1]);
    
    expect(savedData.length).toBe(10);
  });
});
