import { describe, it, expect, beforeEach } from 'vitest';

import { TreeShaker } from './TreeShaker';

describe('TreeShaker - Упрощенные тесты', () => {
  let treeShaker: TreeShaker;

  beforeEach(() => {
    treeShaker = new TreeShaker({
      include: ['src/**/*.ts'],
      exclude: ['**/*.test.*', '**/*.spec.*']
    });
  });

  describe('Инициализация', () => {
    it('должен создавать экземпляр TreeShaker', () => {
      expect(treeShaker).toBeDefined();
      expect(treeShaker).toBeInstanceOf(TreeShaker);
    });

    it('должен принимать конфигурацию', () => {
      const customTreeShaker = new TreeShaker({
        bundler: 'webpack',
        aggressive: true,
        preserveTypes: false
      });
      
      expect(customTreeShaker).toBeDefined();
    });
  });

  describe('Основные методы', () => {
    it('должен иметь метод анализа проекта', () => {
      expect(typeof treeShaker.analyzeProject).toBe('function');
    });

    it('должен иметь метод генерации отчета', () => {
      expect(typeof treeShaker.generateReport).toBe('function');
    });
  });

  describe('Конфигурация', () => {
    it('должен корректно инициализироваться с конфигурацией по умолчанию', () => {
      const defaultTreeShaker = new TreeShaker();
      expect(defaultTreeShaker).toBeDefined();
      expect((defaultTreeShaker as any).config.bundler).toBe('vite');
    });

    it('должен корректно обрабатывать конфигурацию', () => {
      expect((treeShaker as any).config).toBeDefined();
      expect((treeShaker as any).config.include).toBeDefined();
      expect((treeShaker as any).config.exclude).toBeDefined();
    });
  });

  describe('Анализ кода', () => {
    it('должен иметь метод analyzeProject', () => {
      expect(typeof treeShaker.analyzeProject).toBe('function');
    });

    it('должен возвращать promise из analyzeProject', () => {
      // Мокаем базовый случай
      expect(treeShaker.analyzeProject('/test')).toBeInstanceOf(Promise);
    });
  });

  describe('Генерация отчетов', () => {
    it('должен генерировать базовый отчет', () => {
      const report = treeShaker.generateReport();
      
      expect(report).toBeDefined();
      expect(typeof report).toBe('string');
    });

    it('должен содержать информацию в отчете', () => {
      const report = treeShaker.generateReport();
      
      expect(report).toBeDefined();
      expect(report.length).toBeGreaterThan(0);
    });
  });

  describe('Утилиты', () => {
    it('должен корректно инициализироваться с конфигурацией', () => {
      expect((treeShaker as any).config).toBeDefined();
      expect((treeShaker as any).analysis).toBe(null);
    });

    it('должен иметь базовую структуру', () => {
      expect((treeShaker as any).config).toBeDefined();
      expect((treeShaker as any).analysis).toBe(null);
    });
  });
});
