// Storage service with multiple adapters and validation
import { z } from 'zod';

export interface StorageItem {
  id: string;
  key: string;
  value: unknown;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
}

export interface StorageAdapter {
  get(key: string): Promise<StorageItem | null>;
  set(key: string, value: unknown, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  has(key: string): Promise<boolean>;
  clear(): Promise<void>;
  keys(): Promise<string[]>;
}

export class StorageService {
  private adapters: Map<string, StorageAdapter> = new Map();
  private defaultAdapter: string = 'memory';

  addAdapter(name: string, adapter: StorageAdapter): void {
    this.adapters.set(name, adapter);
  }

  setDefaultAdapter(name: string): void {
    if (!this.adapters.has(name)) {
      throw new Error(`Adapter ${name} not found`);
    }
    this.defaultAdapter = name;
  }

  getAdapter(name?: string): StorageAdapter {
    const adapterName = name || this.defaultAdapter;
    const adapter = this.adapters.get(adapterName);
    if (!adapter) {
      throw new Error(`Adapter ${adapterName} not configured`);
    }
    return adapter;
  }

  async get<T>(key: string, schema?: z.ZodSchema<T>, adapterName?: string): Promise<T | null> {
    const adapter = this.getAdapter(adapterName);

    const item = await adapter.get(key);
    if (!item) return null;

    // Check expiration
    if (item.expiresAt && item.expiresAt < new Date()) {
      await adapter.delete(key);
      return null;
    }

    // Validate with schema if provided
    if (schema) {
      try {
        return schema.parse(item.value);
      } catch (error) {
        console.warn(`Storage validation failed for key ${key}:`, error);
        return null;
      }
    }

    return item.value as T;
  }

  async set<T>(key: string, value: T, ttl?: number, adapterName?: string): Promise<void> {
    const adapter = this.getAdapter(adapterName);
    await adapter.set(key, value, ttl);
  }

  async delete(key: string, adapterName?: string): Promise<void> {
    const adapter = this.getAdapter(adapterName);
    await adapter.delete(key);
  }

  async has(key: string, adapterName?: string): Promise<boolean> {
    const adapter = this.getAdapter(adapterName);
    return adapter.has(key);
  }

  async clear(adapterName?: string): Promise<void> {
    const adapter = this.getAdapter(adapterName);
    await adapter.clear();
  }

  async keys(adapterName?: string): Promise<string[]> {
    const adapter = this.getAdapter(adapterName);
    return adapter.keys();
  }

  // Bulk operations
  async setMany(items: Record<string, unknown>, ttl?: number, adapterName?: string): Promise<void> {
    const promises = Object.entries(items).map(([key, value]) =>
      this.set(key, value, ttl, adapterName),
    );
    await Promise.all(promises);
  }

  async getMany<T>(
    keys: string[],
    schema?: z.ZodSchema<T>,
    adapterName?: string,
  ): Promise<Record<string, T | null>> {
    const promises = keys.map(async (key) => ({
      key,
      value: await this.get<T>(key, schema, adapterName),
    }));

    const results = await Promise.all(promises);
    return results.reduce(
      (acc, { key, value }) => {
        acc[key] = value;
        return acc;
      },
      {} as Record<string, T | null>,
    );
  }

  async deleteMany(keys: string[], adapterName?: string): Promise<void> {
    const promises = keys.map((key) => this.delete(key, adapterName));
    await Promise.all(promises);
  }
}

// Memory adapter implementation
export class MemoryStorageAdapter implements StorageAdapter {
  private storage = new Map<string, StorageItem>();

  async get(key: string): Promise<StorageItem | null> {
    const item = this.storage.get(key);
    if (!item) return null;

    // Check expiration
    if (item.expiresAt && item.expiresAt < new Date()) {
      this.storage.delete(key);
      return null;
    }

    return item;
  }

  async set(key: string, value: unknown, ttl?: number): Promise<void> {
    const now = new Date();
    const existing = this.storage.get(key);

    this.storage.set(key, {
      id: existing?.id || crypto.randomUUID(),
      key,
      value,
      ...(existing?.metadata && { metadata: existing.metadata }),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      ...(ttl && { expiresAt: new Date(now.getTime() + ttl * 1000) }),
    });
  }

  async delete(key: string): Promise<void> {
    this.storage.delete(key);
  }

  async has(key: string): Promise<boolean> {
    const item = await this.get(key);
    return item !== null;
  }

  async clear(): Promise<void> {
    this.storage.clear();
  }

  async keys(): Promise<string[]> {
    const allKeys = Array.from(this.storage.keys());
    const validKeys: string[] = [];

    for (const key of allKeys) {
      if (await this.has(key)) {
        validKeys.push(key);
      }
    }

    return validKeys;
  }

  // Memory-specific methods
  size(): number {
    return this.storage.size;
  }

  getStats(): { size: number; totalItems: number; expiredItems: number } {
    const totalItems = this.storage.size;
    let expiredItems = 0;

    for (const item of this.storage.values()) {
      if (item.expiresAt && item.expiresAt < new Date()) {
        expiredItems++;
      }
    }

    return {
      size: totalItems,
      totalItems,
      expiredItems,
    };
  }

  cleanupExpired(): number {
    let cleaned = 0;
    const now = new Date();

    for (const [key, item] of this.storage.entries()) {
      if (item.expiresAt && item.expiresAt < now) {
        this.storage.delete(key);
        cleaned++;
      }
    }

    return cleaned;
  }
}

// LocalStorage adapter for browser environments
export class LocalStorageAdapter implements StorageAdapter {
  private prefix: string;

  constructor(prefix: string = 'heys_') {
    this.prefix = prefix;
    if (typeof window === 'undefined' || !window.localStorage) {
      throw new Error('LocalStorage is not available');
    }
  }

  private getKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  async get(key: string): Promise<StorageItem | null> {
    try {
      const data = localStorage.getItem(this.getKey(key));
      if (!data) return null;

      const item: StorageItem = JSON.parse(data);

      // Convert date strings back to Date objects
      item.createdAt = new Date(item.createdAt);
      item.updatedAt = new Date(item.updatedAt);
      if (item.expiresAt) {
        item.expiresAt = new Date(item.expiresAt);
      }

      // Check expiration
      if (item.expiresAt && item.expiresAt < new Date()) {
        await this.delete(key);
        return null;
      }

      return item;
    } catch (error) {
      console.error('LocalStorage get error:', error);
      return null;
    }
  }

  async set(key: string, value: unknown, ttl?: number): Promise<void> {
    try {
      const now = new Date();
      const existing = await this.get(key);

      const item: StorageItem = {
        id: existing?.id || crypto.randomUUID(),
        key,
        value,
        ...(existing?.metadata && { metadata: existing.metadata }),
        createdAt: existing?.createdAt || now,
        updatedAt: now,
        ...(ttl && { expiresAt: new Date(now.getTime() + ttl * 1000) }),
      };

      localStorage.setItem(this.getKey(key), JSON.stringify(item));
    } catch (error) {
      console.error('LocalStorage set error:', error);
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    localStorage.removeItem(this.getKey(key));
  }

  async has(key: string): Promise<boolean> {
    const item = await this.get(key);
    return item !== null;
  }

  async clear(): Promise<void> {
    const keys = await this.keys();
    for (const key of keys) {
      await this.delete(key);
    }
  }

  async keys(): Promise<string[]> {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(this.prefix)) {
        const unprefixedKey = key.slice(this.prefix.length);
        if (await this.has(unprefixedKey)) {
          keys.push(unprefixedKey);
        }
      }
    }
    return keys;
  }
}

// Create default storage instance
export const storage = new StorageService();

// Add default memory adapter
storage.addAdapter('memory', new MemoryStorageAdapter());

// Add localStorage adapter if available
if (typeof window !== 'undefined' && window.localStorage) {
  try {
    storage.addAdapter('localStorage', new LocalStorageAdapter());
  } catch (error) {
    console.warn('Failed to initialize LocalStorage adapter:', error);
  }
}

export default storage;

// Legacy compatibility
export const createStorage = () => ({
  get: (key: string) => localStorage.getItem(key),
  set: (key: string, value: string) => localStorage.setItem(key, value),
});
