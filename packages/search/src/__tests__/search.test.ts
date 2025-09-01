import { beforeEach, describe, expect, it } from 'vitest';

import { SearchConfig, SmartSearchEngine } from '../index.js';

describe('SmartSearchEngine', () => {
  let searchEngine: SmartSearchEngine;
  let testData: Array<{ id: number; name: string; category: string }>;

  beforeEach(() => {
    const config: SearchConfig = {
      maxTypoDistance: 2,
      minQueryLength: 1,
      maxSuggestions: 5,
      cacheEnabled: true,
      cacheTimeout: 60000,
      enablePhonetic: true,
      enableSynonyms: true,
      debugMode: false,
    };

    searchEngine = new SmartSearchEngine(config);

    testData = [
      { id: 1, name: 'хлеб белый', category: 'хлебобулочные' },
      { id: 2, name: 'молоко 3.2%', category: 'молочные' },
      { id: 3, name: 'яблоко красное', category: 'фрукты' },
      { id: 4, name: 'картофель молодой', category: 'овощи' },
      { id: 5, name: 'курица филе', category: 'мясо' },
    ];
  });

  describe('Basic search functionality', () => {
    it('should find exact matches', () => {
      const result = searchEngine.search(testData, 'хлеб', ['name']);

      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.name).toBe('хлеб белый');
      expect(result.total).toBe(1);
    });

    it('should find partial matches', () => {
      const result = searchEngine.search(testData, 'мол', ['name']);

      expect(result.items.length).toBeGreaterThan(0);
      expect(result.items.some((item) => item.name.includes('молоко'))).toBe(true);
    });

    it('should return empty result for no matches', () => {
      const result = searchEngine.search(testData, 'несуществующий', ['name']);

      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  describe('Typo tolerance', () => {
    it('should handle simple typos', () => {
      const result = searchEngine.search(testData, 'хлеп', ['name']); // п вместо б

      expect(result.items.length).toBeGreaterThan(0);
      expect(result.query).toBe('хлеп');
    });

    it('should provide suggestions for typos', () => {
      const result = searchEngine.search(testData, 'молкоо', ['name']); // лишняя о

      expect(result.suggestions.length).toBeGreaterThan(0);
    });
  });

  describe('Multiple field search', () => {
    it('should search across multiple fields', () => {
      const result = searchEngine.search(testData, 'фрукты', ['name', 'category']);

      expect(result.items.length).toBeGreaterThan(0);
      expect(result.items.some((item) => item.category === 'фрукты')).toBe(true);
    });
  });

  describe('Performance metrics', () => {
    it('should measure search time', () => {
      const result = searchEngine.search(testData, 'хлеб', ['name']);

      expect(result.searchTime).toBeGreaterThanOrEqual(0);
      expect(typeof result.searchTime).toBe('number');
    });

    it('should track metrics', () => {
      searchEngine.search(testData, 'хлеб', ['name']);
      const metrics = searchEngine.getMetrics();

      expect(metrics.totalSearches).toBe(1);
      expect(metrics.averageSearchTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Cache functionality', () => {
    it('should cache search results', () => {
      // Первый поиск
      const result1 = searchEngine.search(testData, 'хлеб', ['name']);

      // Второй такой же поиск
      const result2 = searchEngine.search(testData, 'хлеб', ['name']);

      expect(result1.items).toEqual(result2.items);
      // Кеш может быть быстрее или такой же
      expect(result2.searchTime).toBeLessThanOrEqual(result1.searchTime);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty query', () => {
      const result = searchEngine.search(testData, '', ['name']);

      // При пустом запросе возвращаются первые элементы (до maxSuggestions)
      expect(result.items.length).toBeLessThanOrEqual(5); // maxSuggestions = 5
      expect(result.total).toBe(testData.length);
    });

    it('should handle empty data array', () => {
      const result = searchEngine.search([], 'хлеб', ['name']);

      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should handle very long query', () => {
      const longQuery = 'очень'.repeat(100);
      const result = searchEngine.search(testData, longQuery, ['name']);

      expect(result.items).toHaveLength(0);
      expect(typeof result.searchTime).toBe('number');
    });
  });
});
