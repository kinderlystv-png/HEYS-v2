// Tests for Modern Storage Service
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { MemoryStorageAdapter, storage, StorageService } from '../index.js';

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
    await adapter.set('expire-key', 'expire-value', 0.001);

    // Wait for expiration
    await new Promise((resolve) => setTimeout(resolve, 5));

    const result = await adapter.get('expire-key');
    expect(result).toBeNull();
  });

  it('should update existing items', async () => {
    await adapter.set('update-key', 'original');
    const original = await adapter.get('update-key');

    // Add small delay to ensure different timestamps
    await new Promise((resolve) => setTimeout(resolve, 2));

    await adapter.set('update-key', 'updated');
    const updated = await adapter.get('update-key');

    expect(updated?.value).toBe('updated');
    expect(updated?.id).toBe(original?.id);
    expect(updated?.createdAt).toEqual(original?.createdAt);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(updated?.updatedAt.getTime()).toBeGreaterThanOrEqual(original!.updatedAt.getTime());
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

    expect(await service.get('test')).toBeNull();
    expect(await service.get('test', undefined, 'custom')).toBe('value');
  });

  it('should validate data with schema', async () => {
    const userSchema = z.object({
      id: z.string(),
      name: z.string(),
      age: z.number(),
    });

    const validUser = { id: '1', name: 'John', age: 30 };
    const invalidUser = { id: '2', name: 'Jane' };

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

  it('should throw error for unknown adapter', () => {
    expect(() => service.getAdapter('unknown')).toThrow('Adapter unknown not configured');
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
