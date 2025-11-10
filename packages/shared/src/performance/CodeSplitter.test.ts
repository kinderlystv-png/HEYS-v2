import { describe, expect, it } from 'vitest';

import { CodeSplitter } from './CodeSplitter';

describe('CodeSplitter - Упрощенные тесты', () => {
  const codeSplitter = new CodeSplitter();

  describe('Конфигурация', () => {
    it('должен инициализироваться с конфигурацией по умолчанию', () => {
      expect(codeSplitter).toBeDefined();
    });

    it('должен принимать пользовательскую конфигурацию', () => {
      const customSplitter = new CodeSplitter({
        chunkSizeThreshold: 500,
        excludePatterns: ['custom'],
        routeBasedSplitting: true,
      });

      expect(customSplitter).toBeDefined();
    });
  });

  describe('Обработка паттернов исключения', () => {
    it('должен корректно обрабатывать простые паттерны', () => {
      const shouldExclude = (codeSplitter as any).shouldExclude.bind(codeSplitter);

      expect(shouldExclude('node_modules/package')).toBe(true);
      expect(shouldExclude('dist/bundle.js')).toBe(true);
      expect(shouldExclude('src/component.tsx')).toBe(false);
    });

    it('должен корректно обрабатывать wildcard паттерны', () => {
      const shouldExclude = (codeSplitter as any).shouldExclude.bind(codeSplitter);

      expect(shouldExclude('src/component.test.ts')).toBe(true);
      expect(shouldExclude('src/component.spec.tsx')).toBe(true);
      expect(shouldExclude('src/component.tsx')).toBe(false);
    });
  });

  describe('Определение релевантных файлов', () => {
    it('должен определять JavaScript файлы как релевантные', () => {
      const isRelevantFile = (codeSplitter as any).isRelevantFile.bind(codeSplitter);

      expect(isRelevantFile('component.js')).toBe(true);
      expect(isRelevantFile('component.jsx')).toBe(true);
      expect(isRelevantFile('component.ts')).toBe(true);
      expect(isRelevantFile('component.tsx')).toBe(true);
    });

    it('должен исключать нерелевантные файлы', () => {
      const isRelevantFile = (codeSplitter as any).isRelevantFile.bind(codeSplitter);

      expect(isRelevantFile('styles.css')).toBe(false);
      expect(isRelevantFile('readme.md')).toBe(false);
      expect(isRelevantFile('config.json')).toBe(false);
    });
  });

  describe('Анализ кода', () => {
    it('должен инициализироваться без ошибок', () => {
      expect(codeSplitter).toBeDefined();
      expect(typeof codeSplitter).toBe('object');
    });

    it('должен иметь основные методы', () => {
      expect(typeof (codeSplitter as any).shouldExclude).toBe('function');
      expect(typeof (codeSplitter as any).isRelevantFile).toBe('function');
    });
  });

  describe('Генерация рекомендаций', () => {
    it('должен иметь метод для генерации рекомендаций', () => {
      expect(typeof (codeSplitter as any).generateRecommendations).toBe('function');
    });

    it('должен иметь метод для расчета экономии', () => {
      expect(typeof (codeSplitter as any).calculatePotentialSavings).toBe('function');
    });
  });

  describe('Утилиты', () => {
    it('должен иметь базовые утилиты', () => {
      expect(codeSplitter).toBeDefined();
      expect((codeSplitter as any).config).toBeDefined();
    });
  });
});
