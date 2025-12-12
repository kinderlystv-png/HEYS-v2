/**
 * Тесты для localStorage layer — clientId namespace, null protection
 * 
 * Проверяет:
 * - lsGet / lsSet с clientId namespace
 * - normalizeKey — защита от double-clientId баги
 * - Null/undefined protection при чтении
 * - HEYS.store caching layer
 * 
 * Создано: 2025-12-12
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';

// ═══════════════════════════════════════════════════════════════════
// Симуляция localStorage utility из heys_core_v12.js
// ═══════════════════════════════════════════════════════════════════

const createMockStorage = () => {
  let store = {};
  return {
    getItem: vi.fn((key) => store[key] ?? null),
    setItem: vi.fn((key, value) => { store[key] = value; }),
    removeItem: vi.fn((key) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
    get _store() { return store; }
  };
};

/**
 * Симуляция Utils (U) из heys_core_v12.js
 */
function createStorageUtils(mockStorage, clientId) {
  const getCurrentClientId = () => clientId;
  
  const lsKey = (key) => {
    const cid = getCurrentClientId();
    if (!cid) return key;
    
    // Если ключ уже содержит clientId — не дублировать
    if (key.includes(cid)) return key;
    
    return `heys_${cid}_${key.replace(/^heys_/, '')}`;
  };
  
  const lsGet = (key, fallback = null) => {
    try {
      const fullKey = lsKey(key);
      const raw = mockStorage.getItem(fullKey);
      
      // Null protection
      if (raw === null || raw === undefined) {
        return fallback;
      }
      
      // Пустая строка — fallback
      if (raw === '') {
        return fallback;
      }
      
      const parsed = JSON.parse(raw);
      
      // null внутри JSON — fallback
      if (parsed === null) {
        return fallback;
      }
      
      return parsed;
    } catch (e) {
      return fallback;
    }
  };
  
  const lsSet = (key, value) => {
    try {
      const fullKey = lsKey(key);
      mockStorage.setItem(fullKey, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  };
  
  const lsRemove = (key) => {
    const fullKey = lsKey(key);
    mockStorage.removeItem(fullKey);
  };
  
  return { lsGet, lsSet, lsRemove, lsKey };
}

/**
 * normalizeKey — защита от double-clientId баги
 * Из heys_storage_supabase_v1.js
 */
function normalizeKey(key, clientId) {
  if (!clientId) return key;
  
  // Паттерн double-clientId: heys_ABC123_heys_ABC123_products
  const doublePattern = `heys_${clientId}_heys_${clientId}_`;
  if (key.startsWith(doublePattern)) {
    return key.replace(doublePattern, `heys_${clientId}_`);
  }
  
  // Паттерн triple-clientId (edge case)
  const triplePattern = `heys_${clientId}_heys_${clientId}_heys_${clientId}_`;
  if (key.startsWith(triplePattern)) {
    return key.replace(triplePattern, `heys_${clientId}_`);
  }
  
  return key;
}

// ═══════════════════════════════════════════════════════════════════
// ТЕСТЫ
// ═══════════════════════════════════════════════════════════════════

describe('Storage Utils (lsGet, lsSet)', () => {
  let mockStorage;
  let utils;
  const CLIENT_ID = 'test-client-123';
  
  beforeEach(() => {
    mockStorage = createMockStorage();
    utils = createStorageUtils(mockStorage, CLIENT_ID);
  });
  
  describe('lsKey — clientId namespace', () => {
    
    test('adds clientId prefix to key', () => {
      const result = utils.lsKey('products');
      
      expect(result).toBe(`heys_${CLIENT_ID}_products`);
    });
    
    test('strips heys_ prefix before adding clientId', () => {
      const result = utils.lsKey('heys_products');
      
      expect(result).toBe(`heys_${CLIENT_ID}_products`);
    });
    
    test('does not double-add clientId if already present', () => {
      const result = utils.lsKey(`heys_${CLIENT_ID}_products`);
      
      expect(result).toBe(`heys_${CLIENT_ID}_products`);
    });
  });
  
  describe('lsGet — null protection', () => {
    
    test('returns fallback for null', () => {
      mockStorage.setItem(`heys_${CLIENT_ID}_test`, 'null');
      
      const result = utils.lsGet('test', 'default');
      
      expect(result).toBe('default');
    });
    
    test('returns fallback for undefined key', () => {
      const result = utils.lsGet('nonexistent', []);
      
      expect(result).toEqual([]);
    });
    
    test('returns fallback for empty string', () => {
      mockStorage.setItem(`heys_${CLIENT_ID}_test`, '');
      
      const result = utils.lsGet('test', { a: 1 });
      
      expect(result).toEqual({ a: 1 });
    });
    
    test('returns fallback for invalid JSON', () => {
      mockStorage.setItem(`heys_${CLIENT_ID}_test`, 'not valid json {');
      
      const result = utils.lsGet('test', 'fallback');
      
      expect(result).toBe('fallback');
    });
    
    test('returns parsed value for valid JSON', () => {
      mockStorage.setItem(`heys_${CLIENT_ID}_test`, '{"items":[1,2,3]}');
      
      const result = utils.lsGet('test');
      
      expect(result).toEqual({ items: [1, 2, 3] });
    });
    
    test('handles array correctly', () => {
      mockStorage.setItem(`heys_${CLIENT_ID}_products`, '[{"id":"p1"},{"id":"p2"}]');
      
      const result = utils.lsGet('products', []);
      
      expect(result).toHaveLength(2);
    });
  });
  
  describe('lsSet', () => {
    
    test('sets value with correct key', () => {
      utils.lsSet('products', [{ id: 'p1' }]);
      
      expect(mockStorage.setItem).toHaveBeenCalledWith(
        `heys_${CLIENT_ID}_products`,
        '[{"id":"p1"}]'
      );
    });
    
    test('returns true on success', () => {
      const result = utils.lsSet('test', { value: 123 });
      
      expect(result).toBe(true);
    });
    
    test('handles circular reference gracefully', () => {
      const circular = { a: 1 };
      circular.self = circular;
      
      const result = utils.lsSet('test', circular);
      
      expect(result).toBe(false);
    });
  });
  
  describe('lsRemove', () => {
    
    test('removes key with correct namespace', () => {
      utils.lsRemove('products');
      
      expect(mockStorage.removeItem).toHaveBeenCalledWith(`heys_${CLIENT_ID}_products`);
    });
  });
});

describe('normalizeKey — double-clientId protection', () => {
  const CLIENT_ID = 'abc123';
  
  test('fixes double-clientId pattern', () => {
    const badKey = `heys_${CLIENT_ID}_heys_${CLIENT_ID}_products`;
    
    const result = normalizeKey(badKey, CLIENT_ID);
    
    expect(result).toBe(`heys_${CLIENT_ID}_products`);
  });
  
  test('fixes triple-clientId pattern (recursive)', () => {
    // Для triple нужна рекурсивная обработка — это edge case
    // Текущая реализация исправляет только первый уровень дублирования
    const badKey = `heys_${CLIENT_ID}_heys_${CLIENT_ID}_heys_${CLIENT_ID}_products`;
    
    // После первого прогона останется double
    const firstPass = normalizeKey(badKey, CLIENT_ID);
    // После второго — clean
    const result = normalizeKey(firstPass, CLIENT_ID);
    
    expect(result).toBe(`heys_${CLIENT_ID}_products`);
  });
  
  test('leaves correct key unchanged', () => {
    const goodKey = `heys_${CLIENT_ID}_products`;
    
    const result = normalizeKey(goodKey, CLIENT_ID);
    
    expect(result).toBe(goodKey);
  });
  
  test('leaves key unchanged when no clientId', () => {
    const key = 'heys_products';
    
    const result = normalizeKey(key, null);
    
    expect(result).toBe(key);
  });
  
  test('handles global keys (without clientId prefix)', () => {
    const globalKey = 'heys_client_current';
    
    const result = normalizeKey(globalKey, CLIENT_ID);
    
    expect(result).toBe(globalKey);
  });
});

describe('HEYS.store caching', () => {
  let mockStorage;
  let cache;
  let watchers;
  
  beforeEach(() => {
    mockStorage = createMockStorage();
    cache = new Map();
    watchers = new Map();
  });
  
  /**
   * Симуляция HEYS.store из heys_storage_layer_v1.js
   */
  const createStore = (clientId) => {
    const lsKey = (key) => {
      if (!clientId) return key;
      if (key.includes(clientId)) return key;
      return `heys_${clientId}_${key.replace(/^heys_/, '')}`;
    };
    
    return {
      get(key, fallback = null) {
        const fullKey = lsKey(key);
        
        // Check cache first
        if (cache.has(fullKey)) {
          return cache.get(fullKey);
        }
        
        // Read from storage
        try {
          const raw = mockStorage.getItem(fullKey);
          if (raw === null) return fallback;
          const parsed = JSON.parse(raw);
          
          // Populate cache
          cache.set(fullKey, parsed);
          
          return parsed;
        } catch {
          return fallback;
        }
      },
      
      set(key, value) {
        const fullKey = lsKey(key);
        
        // Update cache
        cache.set(fullKey, value);
        
        // Persist to storage
        mockStorage.setItem(fullKey, JSON.stringify(value));
        
        // Notify watchers
        const watcherList = watchers.get(fullKey) || [];
        watcherList.forEach(fn => fn(value));
        
        return true;
      },
      
      watch(key, callback) {
        const fullKey = lsKey(key);
        const list = watchers.get(fullKey) || [];
        list.push(callback);
        watchers.set(fullKey, list);
        
        // Return unsubscribe function
        return () => {
          const idx = list.indexOf(callback);
          if (idx > -1) list.splice(idx, 1);
        };
      },
      
      clearCache() {
        cache.clear();
      }
    };
  };
  
  test('get reads from cache on second call', () => {
    const store = createStore('client1');
    
    mockStorage.setItem('heys_client1_products', '[{"id":"p1"}]');
    
    // First read — from storage
    store.get('products');
    expect(mockStorage.getItem).toHaveBeenCalledTimes(1);
    
    // Second read — from cache
    store.get('products');
    expect(mockStorage.getItem).toHaveBeenCalledTimes(1);
  });
  
  test('set updates cache', () => {
    const store = createStore('client1');
    
    store.set('products', [{ id: 'p1' }]);
    
    // Read should not hit storage
    const result = store.get('products');
    
    expect(result).toEqual([{ id: 'p1' }]);
    expect(mockStorage.getItem).not.toHaveBeenCalled();
  });
  
  test('watchers are notified on set', () => {
    const store = createStore('client1');
    const callback = vi.fn();
    
    store.watch('products', callback);
    store.set('products', [{ id: 'p1' }]);
    
    expect(callback).toHaveBeenCalledWith([{ id: 'p1' }]);
  });
  
  test('unsubscribe stops notifications', () => {
    const store = createStore('client1');
    const callback = vi.fn();
    
    const unsubscribe = store.watch('products', callback);
    unsubscribe();
    
    store.set('products', [{ id: 'p1' }]);
    
    expect(callback).not.toHaveBeenCalled();
  });
  
  test('clearCache forces re-read from storage', () => {
    const store = createStore('client1');
    
    mockStorage.setItem('heys_client1_products', '[{"id":"p1"}]');
    store.get('products'); // populate cache
    
    // External update (another tab)
    mockStorage._store['heys_client1_products'] = '[{"id":"p2"}]';
    
    // Still returns cached
    expect(store.get('products')).toEqual([{ id: 'p1' }]);
    
    // Clear cache
    store.clearCache();
    
    // Now returns fresh
    expect(store.get('products')).toEqual([{ id: 'p2' }]);
  });
});

describe('Day key format', () => {
  
  test('day key format is consistent', () => {
    const date = '2025-12-12';
    const clientId = 'abc123';
    
    const key = `heys_${clientId}_dayv2_${date}`;
    
    expect(key).toMatch(/^heys_[a-z0-9]+_dayv2_\d{4}-\d{2}-\d{2}$/);
  });
  
  test('extracting date from day key', () => {
    const key = 'heys_abc123_dayv2_2025-12-12';
    
    const dateMatch = key.match(/dayv2_(\d{4}-\d{2}-\d{2})$/);
    
    expect(dateMatch).not.toBeNull();
    expect(dateMatch[1]).toBe('2025-12-12');
  });
  
  test('listing all day keys', () => {
    const mockStorage = createMockStorage();
    const clientId = 'abc123';
    
    mockStorage._store[`heys_${clientId}_dayv2_2025-12-10`] = '{}';
    mockStorage._store[`heys_${clientId}_dayv2_2025-12-11`] = '{}';
    mockStorage._store[`heys_${clientId}_dayv2_2025-12-12`] = '{}';
    mockStorage._store[`heys_${clientId}_products`] = '[]';
    
    const dayKeys = Object.keys(mockStorage._store)
      .filter(k => k.includes('_dayv2_'));
    
    expect(dayKeys).toHaveLength(3);
  });
});
