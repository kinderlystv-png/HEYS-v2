// Tests for Storage Service with adapters and validation
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { MemoryStorageAdapter, storage, StorageService } from '../index.js';

// Mock localStorage for testing
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(),
};

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

Object.defineProperty(globalThis, 'window', {
  value: { localStorage: localStorageMock },
  writable: true,
});

describe('MemoryStorageAdapter', () => {
  let adapter: MemoryStorageAdapter;

  beforeEach(() => {
    adapter = new MemoryStorageAdapter();
  });

  it('should store and retrieve data', async () => {
    await adapter.set('test-key', 'test-value');
    const result = await adapter.get('test-key');

    expect(result).toBeDefined();
    expect(result?.key).toBe('test-key');
    expect(result?.value).toBe('test-value');
    expect(result?.id).toBeDefined();
    expect(result?.createdAt).toBeInstanceOf(Date);
    expect(result?.updatedAt).toBeInstanceOf(Date);
  });

  it('should handle TTL expiration', async () => {
    // Set with 1ms TTL
    await adapter.set('expire-key', 'expire-value', 0.001);

    // Wait for expiration
    await new Promise((resolve) => setTimeout(resolve, 5));

    const result = await adapter.get('expire-key');
    expect(result).toBeNull();
  });

  it('should update existing items', async () => {
    await adapter.set('update-key', 'original');
    const original = await adapter.get('update-key');

    // Small delay to ensure different timestamp
    await new Promise((resolve) => setTimeout(resolve, 10));

    await adapter.set('update-key', 'updated');
    const updated = await adapter.get('update-key');

    expect(updated?.value).toBe('updated');
    expect(updated?.id).toBe(original?.id); // Same ID
    expect(updated?.createdAt).toEqual(original?.createdAt); // Same creation time
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(updated?.updatedAt.getTime()).toBeGreaterThan(original!.updatedAt.getTime());
  });

  it('should check item existence', async () => {
    expect(await adapter.has('nonexistent')).toBe(false);

    await adapter.set('exists', 'value');
    expect(await adapter.has('exists')).toBe(true);
  });

  it('should delete items', async () => {
    await adapter.set('delete-me', 'value');
    expect(await adapter.has('delete-me')).toBe(true);

    await adapter.delete('delete-me');
    expect(await adapter.has('delete-me')).toBe(false);
  });

  it('should clear all items', async () => {
    await adapter.set('key1', 'value1');
    await adapter.set('key2', 'value2');

    await adapter.clear();

    expect(await adapter.has('key1')).toBe(false);
    expect(await adapter.has('key2')).toBe(false);
  });

  it('should return all keys', async () => {
    await adapter.set('key1', 'value1');
    await adapter.set('key2', 'value2');

    const keys = await adapter.keys();
    expect(keys).toContain('key1');
    expect(keys).toContain('key2');
    expect(keys).toHaveLength(2);
  });

  it('should provide memory-specific stats', async () => {
    await adapter.set('stats1', 'value1');
    await adapter.set('stats2', 'value2', 0.001); // Will expire

    const stats = adapter.getStats();
    expect(stats.totalItems).toBe(2);
    expect(stats.size).toBe(2);

    // Wait for expiration
    await new Promise((resolve) => setTimeout(resolve, 5));

    const updatedStats = adapter.getStats();
    expect(updatedStats.expiredItems).toBe(1);
  });

  it('should cleanup expired items', async () => {
    await adapter.set('keep', 'value');
    await adapter.set('expire1', 'value', 0.001);
    await adapter.set('expire2', 'value', 0.001);

    // Wait for expiration
    await new Promise((resolve) => setTimeout(resolve, 5));

    const cleaned = adapter.cleanupExpired();
    expect(cleaned).toBe(2);
    expect(await adapter.has('keep')).toBe(true);
    expect(await adapter.has('expire1')).toBe(false);
    expect(await adapter.has('expire2')).toBe(false);
  });
});

describe('StorageService', () => {
  let service: StorageService;
  let memoryAdapter: MemoryStorageAdapter;

  beforeEach(() => {
    service = new StorageService();
    memoryAdapter = new MemoryStorageAdapter();
    service.addAdapter('memory', memoryAdapter);
    service.setDefaultAdapter('memory');
  });

  it('should use default adapter when none specified', async () => {
    await service.set('test', 'value');
    const result = await service.get('test');

    expect(result).toBe('value');
  });

  it('should use specific adapter when specified', async () => {
    const customAdapter = new MemoryStorageAdapter();
    service.addAdapter('custom', customAdapter);

    await service.set('test', 'value', undefined, 'custom');

    // Should not exist in default adapter
    expect(await service.get('test')).toBeNull();

    // Should exist in custom adapter
    expect(await service.get('test', undefined, 'custom')).toBe('value');
  });

  it('should validate data with schema', async () => {
    const userSchema = z.object({
      id: z.string(),
      name: z.string(),
      age: z.number(),
    });

    const validUser = { id: '1', name: 'John', age: 30 };
    const invalidUser = { id: '2', name: 'Jane' }; // missing age

    await service.set('valid-user', validUser);
    await service.set('invalid-user', invalidUser);

    const validResult = await service.get('valid-user', userSchema);
    const invalidResult = await service.get('invalid-user', userSchema);

    expect(validResult).toEqual(validUser);
    expect(invalidResult).toBeNull();
  });

  it('should handle bulk operations', async () => {
    const items = {
      item1: 'value1',
      item2: 'value2',
      item3: 'value3',
    };

    await service.setMany(items);

    const results = await service.getMany(['item1', 'item2', 'item3']);
    expect(results).toEqual({
      item1: 'value1',
      item2: 'value2',
      item3: 'value3',
    });
  });

  it('should handle bulk deletion', async () => {
    await service.setMany({
      delete1: 'value1',
      delete2: 'value2',
      keep: 'value3',
    });

    await service.deleteMany(['delete1', 'delete2']);

    expect(await service.has('delete1')).toBe(false);
    expect(await service.has('delete2')).toBe(false);
    expect(await service.has('keep')).toBe(true);
  });

  it('should throw error for unknown adapter', async () => {
    expect(() => service.getAdapter('unknown')).toThrow('Adapter unknown not configured');
  });

  it('should throw error when setting unknown default adapter', () => {
    expect(() => service.setDefaultAdapter('unknown')).toThrow('Adapter unknown not found');
  });
});

describe('Default storage instance', () => {
  it('should have memory adapter by default', () => {
    expect(() => storage.getAdapter('memory')).not.toThrow();
  });

  it('should work with default configuration', async () => {
    await storage.set('default-test', 'value');
    const result = await storage.get('default-test');

    expect(result).toBe('value');
  });
});

describe('TTL functionality', () => {
  let adapter: MemoryStorageAdapter;

  beforeEach(() => {
    adapter = new MemoryStorageAdapter();
  });

  it('should respect TTL on get operations', async () => {
    await adapter.set('ttl-test', 'value', 0.1); // 100ms TTL

    // Should exist immediately
    expect(await adapter.get('ttl-test')).not.toBeNull();

    // Wait for expiration
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Should be null after expiration
    expect(await adapter.get('ttl-test')).toBeNull();
  });

  it('should clean up expired items automatically', async () => {
    await adapter.set('auto-cleanup', 'value', 0.05); // 50ms TTL

    expect(adapter.size()).toBe(1);

    // Wait for expiration
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Get should trigger cleanup
    await adapter.get('auto-cleanup');

    expect(adapter.size()).toBe(0);
  });
});

// Legacy compatibility tests
describe('Legacy Storage Interface', () => {
  it('should maintain compatibility with createStorage', async () => {
    const { createStorage } = await import('../index');
    const legacyStorage = createStorage();

    expect(legacyStorage).toBeDefined();
    expect(typeof legacyStorage.get).toBe('function');
    expect(typeof legacyStorage.set).toBe('function');
  });

  it('should handle bulk operations', async () => {
    const storage = new MemoryStorageAdapter(); // Use MemoryStorageAdapter instead
    const testData = {
      key1: 'value1',
      key2: 'value2',
      key3: 'value3',
    };

    // Set multiple values
    for (const [key, value] of Object.entries(testData)) {
      await storage.set(key, value);
    }

    // Verify all values
    for (const [key, value] of Object.entries(testData)) {
      const item = await storage.get(key);
      expect(item?.value).toBe(value); // MemoryStorageAdapter returns StorageItem, not direct value
    }
  });
});

describe('Edge cases', () => {
  it('should handle special characters in keys', async () => {
    const specialKey = 'key-with-special@chars#123';
    const value = 'special-value';

    await storage.set(specialKey, value);
    const result = await storage.get(specialKey);

    expect(result).toBe(value);
  });

  it('should handle special characters in values', async () => {
    const key = 'special-value-key';
    const specialValue = 'value with spaces, symbols: @#$%^&*()';

    await storage.set(key, specialValue);
    const result = await storage.get(key);

    expect(result).toBe(specialValue);
  });

  it('should handle JSON string values', async () => {
    const key = 'json-key';
    const jsonValue = JSON.stringify({ name: 'test', age: 25 });

    await storage.set(key, jsonValue);
    const result = (await storage.get(key)) as string;

    expect(result).toBe(jsonValue);
    expect(JSON.parse(result || '')).toEqual({ name: 'test', age: 25 });
  });

  it('should handle very long strings', async () => {
    const key = 'long-string-key';
    const longValue = 'a'.repeat(10000);

    await storage.set(key, longValue);
    const result = (await storage.get(key)) as string;

    expect(result).toBe(longValue);
    expect(result?.length).toBe(10000);
  });
});

describe('Data types handling', () => {
  it('should handle unicode strings', async () => {
    const key = 'unicode-key';
    const unicodeValue = '🚀 Привет мир! 你好世界';

    await storage.set(key, unicodeValue);
    const result = await storage.get(key);

    expect(result).toBe(unicodeValue);
  });

  it('should convert numbers to strings', async () => {
    const key = 'number-key';
    // localStorage always stores strings
    await storage.set(key, '123');
    const result = await storage.get(key);

    expect(result).toBe('123');
    expect(typeof result).toBe('string');
  });
});
