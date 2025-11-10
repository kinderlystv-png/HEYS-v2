import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BundleAnalyzer } from './BundleAnalyzer';

describe('BundleAnalyzer - Упрощенные тесты', () => {
  let analyzer: BundleAnalyzer;

  beforeEach(() => {
    // Мокаем performance API
    Object.defineProperty(global, 'performance', {
      value: {
        now: vi.fn(() => 1000),
        getEntriesByType: vi.fn(() => []),
      },
      writable: true,
    });

    // Мокаем localStorage
    Object.defineProperty(global, 'localStorage', {
      value: {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
      writable: true,
    });

    analyzer = BundleAnalyzer.getInstance();
  });

  describe('Инициализация', () => {
    it('должен создавать экземпляр анализатора', () => {
      expect(analyzer).toBeDefined();
      expect(analyzer).toBeInstanceOf(BundleAnalyzer);
    });

    it('должен реализовывать паттерн синглтон', () => {
      const instance1 = BundleAnalyzer.getInstance();
      const instance2 = BundleAnalyzer.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('Основные методы', () => {
    it('должен иметь метод измерения метрик', () => {
      expect(typeof analyzer.measureCurrentMetrics).toBe('function');
    });

    it('должен иметь метод сохранения baseline', () => {
      expect(typeof analyzer.saveBaseline).toBe('function');
    });

    it('должен иметь метод сравнения с baseline', () => {
      expect(typeof analyzer.compareWithBaseline).toBe('function');
    });
  });

  describe('Baseline операции', () => {
    it('должен возвращать null при отсутствии baseline', () => {
      const comparison = analyzer.compareWithBaseline();
      expect(comparison).toBeNull();
    });

    it('должен бросать ошибку при попытке сохранить baseline без метрик', () => {
      expect(() => {
        analyzer.saveBaseline('v1.0.0', 85);
      }).toThrow();
    });
  });

  describe('Генерация отчетов', () => {
    it('должен иметь метод generateReport', () => {
      expect(typeof (analyzer as any).generateReport).toBe('function');
    });

    it('должен корректно работать с мокированными данными', async () => {
      // Тестируем основную функциональность без браузерного API
      expect(analyzer).toBeDefined();
      expect(analyzer.compareWithBaseline()).toBeNull();
    });
  });

  describe('Утилиты', () => {
    it('должен корректно инициализироваться', () => {
      expect(analyzer).toBeDefined();
      expect((analyzer as any).baselineHistory).toBeDefined();
      expect((analyzer as any).currentMetrics).toBe(null);
    });

    it('должен иметь приватные методы для анализа', () => {
      expect(typeof (analyzer as any).analyzeChunkSizes).toBe('function');
      expect(typeof (analyzer as any).calculateGzippedSize).toBe('function');
    });
  });
});
