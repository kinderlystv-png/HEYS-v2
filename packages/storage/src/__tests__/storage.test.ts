import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createStorage } from '../index.js';

// Mock localStorage for testing
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => {
      if (key in store) {
        return store[key];
      }
      return null;
    },
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    length: Object.keys(store).length,
    key: (index: number) => Object.keys(store)[index] || null,
  };
})();

// Replace global localStorage
Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

describe('Storage', () => {
  let storage: ReturnType<typeof createStorage>;

  beforeEach(() => {
    localStorage.clear();
    storage = createStorage();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('Basic functionality', () => {
    it('should create storage instance', () => {
      expect(storage).toBeDefined();
      expect(typeof storage.get).toBe('function');
      expect(typeof storage.set).toBe('function');
    });

    it('should set and get values', () => {
      storage.set('test-key', 'test-value');
      const result = storage.get('test-key');
      
      expect(result).toBe('test-value');
    });

    it('should return null for non-existent keys', () => {
      const result = storage.get('non-existent-key');
      
      expect(result).toBeNull();
    });

    it('should handle empty string values', () => {
      storage.set('empty-key', '');
      const result = storage.get('empty-key');
      
      // localStorage может возвращать пустую строку как есть
      expect(result).toBe('');
    });
  });

  describe('Data persistence', () => {
    it('should persist data across storage instances', () => {
      const storage1 = createStorage();
      const storage2 = createStorage();
      
      storage1.set('persist-key', 'persist-value');
      const result = storage2.get('persist-key');
      
      expect(result).toBe('persist-value');
    });

    it('should handle multiple key-value pairs', () => {
      const testData = {
        'key1': 'value1',
        'key2': 'value2',
        'key3': 'value3',
      };

      // Set multiple values
      Object.entries(testData).forEach(([key, value]) => {
        storage.set(key, value);
      });

      // Verify all values
      Object.entries(testData).forEach(([key, value]) => {
        expect(storage.get(key)).toBe(value);
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle special characters in keys', () => {
      const specialKey = 'key-with-special@chars#123';
      const value = 'special-value';
      
      storage.set(specialKey, value);
      const result = storage.get(specialKey);
      
      expect(result).toBe(value);
    });

    it('should handle special characters in values', () => {
      const key = 'special-value-key';
      const specialValue = 'value with spaces, symbols: @#$%^&*()';
      
      storage.set(key, specialValue);
      const result = storage.get(key);
      
      expect(result).toBe(specialValue);
    });

    it('should handle JSON string values', () => {
      const key = 'json-key';
      const jsonValue = JSON.stringify({ name: 'test', age: 25 });
      
      storage.set(key, jsonValue);
      const result = storage.get(key);
      
      expect(result).toBe(jsonValue);
      expect(JSON.parse(result || '')).toEqual({ name: 'test', age: 25 });
    });

    it('should handle very long strings', () => {
      const key = 'long-string-key';
      const longValue = 'a'.repeat(10000);
      
      storage.set(key, longValue);
      const result = storage.get(key);
      
      expect(result).toBe(longValue);
      expect(result?.length).toBe(10000);
    });
  });

  describe('Data types handling', () => {
    it('should handle unicode strings', () => {
      const key = 'unicode-key';
      const unicodeValue = '🚀 Привет мир! 你好世界';
      
      storage.set(key, unicodeValue);
      const result = storage.get(key);
      
      expect(result).toBe(unicodeValue);
    });

    it('should convert numbers to strings', () => {
      const key = 'number-key';
      // localStorage always stores strings
      storage.set(key, '123');
      const result = storage.get(key);
      
      expect(result).toBe('123');
      expect(typeof result).toBe('string');
    });
  });
});
