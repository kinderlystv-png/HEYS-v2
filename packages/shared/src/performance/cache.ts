/**
 * HEYS Cache Strategy Manager
 * Intelligent caching system with performance optimization
 *
 * @author HEYS Team
 * @version 1.4.0
 * @created 2025-01-31
 */

/**
 * Cache configuration options
 */
export interface CacheConfig {
  maxSize?: number;
  ttl?: number; // Time to live in milliseconds
  compression?: boolean;
  encryption?: boolean;
  storage?: 'memory' | 'localStorage' | 'sessionStorage' | 'indexedDB';
  namespace?: string;
}

/**
 * Cache entry metadata
 */
export interface CacheEntry<T = any> {
  key: string;
  value: T;
  timestamp: number;
  ttl: number;
  size: number;
  accessCount: number;
  lastAccessed: number;
  compressed: boolean;
  encrypted: boolean;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  totalEntries: number;
  totalSize: number;
  hitRate: number;
  missRate: number;
  averageAccessTime: number;
  oldestEntry: number;
  newestEntry: number;
  compressionRatio: number;
}

/**
 * Cache eviction policies
 */
export type EvictionPolicy = 'lru' | 'lfu' | 'fifo' | 'ttl-based' | 'size-based';

/**
 * Cache strategy interface
 */
export interface CacheStrategy {
  name: string;
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, options?: Partial<CacheConfig>): Promise<void>;
  delete(key: string): Promise<boolean>;
  clear(): Promise<void>;
  has(key: string): Promise<boolean>;
  size(): Promise<number>;
  keys(): Promise<string[]>;
  getStats(): Promise<CacheStats>;
}

/**
 * Memory cache strategy implementation
 */
export class MemoryCacheStrategy implements CacheStrategy {
  public readonly name = 'memory';
  private cache = new Map<string, CacheEntry>();
  private config: Required<CacheConfig>;
  private stats = {
    hits: 0,
    misses: 0,
    totalAccessTime: 0,
  };

  constructor(config: CacheConfig = {}) {
    this.config = {
      maxSize: config.maxSize || 50 * 1024 * 1024, // 50MB
      ttl: config.ttl || 60 * 60 * 1000, // 1 hour
      compression: config.compression || false,
      encryption: config.encryption || false,
      storage: config.storage || 'memory',
      namespace: config.namespace || 'heys-cache',
    };
  }

  async get<T>(key: string): Promise<T | null> {
    const startTime = performance.now();
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      this.stats.totalAccessTime += performance.now() - startTime;
      return null;
    }

    // Check TTL
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.stats.misses++;
      this.stats.totalAccessTime += performance.now() - startTime;
      return null;
    }

    // Update access statistics
    entry.accessCount++;
    entry.lastAccessed = Date.now();

    this.stats.hits++;
    this.stats.totalAccessTime += performance.now() - startTime;

    // Decompress if needed
    let value = entry.value;
    if (entry.compressed) {
      value = await this.decompress(value);
    }

    // Decrypt if needed
    if (entry.encrypted) {
      value = await this.decrypt(value);
    }

    return value;
  }

  async set<T>(key: string, value: T, options: Partial<CacheConfig> = {}): Promise<void> {
    const config = { ...this.config, ...options };
    let processedValue = value;
    let compressed = false;
    let encrypted = false;

    // Encrypt if needed
    if (config.encryption) {
      processedValue = await this.encrypt(processedValue);
      encrypted = true;
    }

    // Compress if needed
    if (config.compression) {
      processedValue = await this.compress(processedValue);
      compressed = true;
    }

    const size = this.calculateSize(processedValue);
    const entry: CacheEntry<T> = {
      key,
      value: processedValue,
      timestamp: Date.now(),
      ttl: config.ttl,
      size,
      accessCount: 0,
      lastAccessed: Date.now(),
      compressed,
      encrypted,
    };

    // Check if we need to evict entries
    await this.evictIfNeeded(size);

    this.cache.set(key, entry);
  }

  async delete(key: string): Promise<boolean> {
    return this.cache.delete(key);
  }

  async clear(): Promise<void> {
    this.cache.clear();
    this.stats = { hits: 0, misses: 0, totalAccessTime: 0 };
  }

  async has(key: string): Promise<boolean> {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  async size(): Promise<number> {
    return this.cache.size;
  }

  async keys(): Promise<string[]> {
    return Array.from(this.cache.keys());
  }

  async getStats(): Promise<CacheStats> {
    const entries = Array.from(this.cache.values());
    const totalEntries = entries.length;
    const totalSize = entries.reduce((sum, entry) => sum + entry.size, 0);
    const totalAccesses = this.stats.hits + this.stats.misses;
    const hitRate = totalAccesses > 0 ? this.stats.hits / totalAccesses : 0;
    const missRate = totalAccesses > 0 ? this.stats.misses / totalAccesses : 0;
    const averageAccessTime = totalAccesses > 0 ? this.stats.totalAccessTime / totalAccesses : 0;

    const timestamps = entries.map((e) => e.timestamp);
    const oldestEntry = timestamps.length > 0 ? Math.min(...timestamps) : 0;
    const newestEntry = timestamps.length > 0 ? Math.max(...timestamps) : 0;

    const compressedEntries = entries.filter((e) => e.compressed);
    const compressionRatio =
      compressedEntries.length > 0
        ? compressedEntries.reduce((sum, e) => sum + e.size, 0) / totalSize
        : 0;

    return {
      totalEntries,
      totalSize,
      hitRate,
      missRate,
      averageAccessTime,
      oldestEntry,
      newestEntry,
      compressionRatio,
    };
  }

  private isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp > entry.ttl;
  }

  private async evictIfNeeded(newEntrySize: number): Promise<void> {
    const currentSize = Array.from(this.cache.values()).reduce((sum, entry) => sum + entry.size, 0);

    if (currentSize + newEntrySize > this.config.maxSize) {
      // Use LRU eviction policy
      const sortedEntries = Array.from(this.cache.entries()).sort(
        ([, a], [, b]) => a.lastAccessed - b.lastAccessed,
      );

      let freedSpace = 0;
      for (const [key, entry] of sortedEntries) {
        this.cache.delete(key);
        freedSpace += entry.size;
        if (freedSpace >= newEntrySize) break;
      }
    }
  }

  private calculateSize(value: any): number {
    return JSON.stringify(value).length * 2; // Rough estimate
  }

  private async compress(value: any): Promise<any> {
    // Simplified compression simulation
    // In real implementation, use CompressionStream API or pako
    return JSON.stringify(value);
  }

  private async decompress(value: any): Promise<any> {
    // Simplified decompression simulation
    return typeof value === 'string' ? JSON.parse(value) : value;
  }

  private async encrypt(value: any): Promise<any> {
    // Simplified encryption simulation
    // In real implementation, use Web Crypto API
    return btoa(JSON.stringify(value));
  }

  private async decrypt(value: any): Promise<any> {
    // Simplified decryption simulation
    return JSON.parse(atob(value));
  }
}

/**
 * LocalStorage cache strategy implementation
 */
export class LocalStorageCacheStrategy implements CacheStrategy {
  public readonly name = 'localStorage';
  private config: Required<CacheConfig>;
  private stats = {
    hits: 0,
    misses: 0,
    totalAccessTime: 0,
  };

  constructor(config: CacheConfig = {}) {
    this.config = {
      maxSize: config.maxSize || 5 * 1024 * 1024, // 5MB
      ttl: config.ttl || 60 * 60 * 1000, // 1 hour
      compression: config.compression || false,
      encryption: config.encryption || false,
      storage: 'localStorage',
      namespace: config.namespace || 'heys-cache',
    };

    // Test localStorage availability
    if (typeof localStorage === 'undefined') {
      throw new Error('localStorage not available');
    }
  }

  private getKey(key: string): string {
    return `${this.config.namespace}:${key}`;
  }

  async get<T>(key: string): Promise<T | null> {
    const startTime = performance.now();

    try {
      const item = localStorage.getItem(this.getKey(key));
      if (!item) {
        this.stats.misses++;
        return null;
      }

      const entry: CacheEntry<T> = JSON.parse(item);

      // Check TTL
      if (this.isExpired(entry)) {
        localStorage.removeItem(this.getKey(key));
        this.stats.misses++;
        return null;
      }

      // Update access statistics
      entry.accessCount++;
      entry.lastAccessed = Date.now();
      localStorage.setItem(this.getKey(key), JSON.stringify(entry));

      this.stats.hits++;
      this.stats.totalAccessTime += performance.now() - startTime;

      return entry.value;
    } catch (error) {
      this.stats.misses++;
      console.warn('LocalStorage get error:', error);
      return null;
    }
  }

  async set<T>(key: string, value: T, options: Partial<CacheConfig> = {}): Promise<void> {
    const config = { ...this.config, ...options };

    try {
      const entry: CacheEntry<T> = {
        key: this.getKey(key),
        value,
        timestamp: Date.now(),
        ttl: config.ttl!,
        size: (() => {
          try {
            return new Blob([JSON.stringify(value)]).size;
          } catch {
            // Fallback for test environments
            return JSON.stringify(value).length * 2;
          }
        })(),
        accessCount: 0,
        lastAccessed: Date.now(),
        compressed: false,
        encrypted: false,
      };

      // Check storage quota
      const totalSize = await this.getTotalSize();
      if (totalSize + entry.size > config.maxSize!) {
        await this.evictLRU();
      }

      localStorage.setItem(this.getKey(key), JSON.stringify(entry));
    } catch (error) {
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        await this.evictLRU();
        // Try again after eviction
        try {
          const entry: CacheEntry<T> = {
            key: this.getKey(key),
            value,
            timestamp: Date.now(),
            ttl: config.ttl!,
            size: (() => {
              try {
                return new Blob([JSON.stringify(value)]).size;
              } catch {
                // Fallback for test environments
                return JSON.stringify(value).length * 2;
              }
            })(),
            accessCount: 0,
            lastAccessed: Date.now(),
            compressed: false,
            encrypted: false,
          };
          localStorage.setItem(this.getKey(key), JSON.stringify(entry));
        } catch (retryError) {
          console.warn('LocalStorage set failed after eviction:', retryError);
        }
      } else {
        console.warn('LocalStorage set error:', error);
      }
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      const fullKey = this.getKey(key);
      const exists = localStorage.getItem(fullKey) !== null;
      localStorage.removeItem(fullKey);
      return exists;
    } catch (error) {
      console.warn('LocalStorage delete error:', error);
      return false;
    }
  }

  async clear(): Promise<void> {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(`${this.config.namespace}:`)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => localStorage.removeItem(key));
    } catch (error) {
      console.warn('LocalStorage clear error:', error);
    }
  }

  async has(key: string): Promise<boolean> {
    try {
      return localStorage.getItem(this.getKey(key)) !== null;
    } catch (error) {
      console.warn('LocalStorage has error:', error);
      return false;
    }
  }

  async size(): Promise<number> {
    try {
      let count = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(`${this.config.namespace}:`)) {
          count++;
        }
      }
      return count;
    } catch (error) {
      console.warn('LocalStorage size error:', error);
      return 0;
    }
  }

  async keys(): Promise<string[]> {
    try {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(`${this.config.namespace}:`)) {
          keys.push(key.replace(`${this.config.namespace}:`, ''));
        }
      }
      return keys;
    } catch (error) {
      console.warn('LocalStorage keys error:', error);
      return [];
    }
  }

  async getStats(): Promise<CacheStats> {
    const totalEntries = await this.size();
    const totalSize = await this.getTotalSize();

    return {
      totalEntries,
      totalSize,
      hitRate: (this.stats.hits / (this.stats.hits + this.stats.misses)) * 100 || 0,
      missRate: (this.stats.misses / (this.stats.hits + this.stats.misses)) * 100 || 0,
      averageAccessTime: this.stats.totalAccessTime / (this.stats.hits + this.stats.misses) || 0,
      oldestEntry: await this.getOldestEntryTime(),
      newestEntry: await this.getNewestEntryTime(),
      compressionRatio: 0, // localStorage strategy doesn't use compression
    };
  }

  private isExpired(entry: CacheEntry): boolean {
    return Date.now() > entry.timestamp + entry.ttl;
  }

  private async getTotalSize(): Promise<number> {
    try {
      let totalSize = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(`${this.config.namespace}:`)) {
          const value = localStorage.getItem(key);
          if (value) {
            // Use string length * 2 for UTF-16 encoding, fallback for test environments
            try {
              totalSize += new Blob([value]).size;
            } catch {
              // Fallback for test environments where Blob might not work
              totalSize += value.length * 2;
            }
          }
        }
      }
      return totalSize;
    } catch (error) {
      return 0;
    }
  }

  private async evictLRU(): Promise<void> {
    try {
      const entries: Array<{ key: string; entry: CacheEntry }> = [];

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(`${this.config.namespace}:`)) {
          const value = localStorage.getItem(key);
          if (value) {
            try {
              const entry = JSON.parse(value);
              entries.push({ key, entry });
            } catch (error) {
              // Remove invalid entries
              localStorage.removeItem(key);
            }
          }
        }
      }

      // Sort by last accessed time (oldest first)
      entries.sort((a, b) => a.entry.lastAccessed - b.entry.lastAccessed);

      // Remove oldest 25% of entries
      const toRemove = Math.ceil(entries.length * 0.25);
      for (let i = 0; i < toRemove && i < entries.length; i++) {
        const entry = entries[i];
        if (entry && entry.key) {
          localStorage.removeItem(entry.key);
        }
      }
    } catch (error) {
      console.warn('LocalStorage LRU eviction error:', error);
    }
  }

  private async getOldestEntryTime(): Promise<number> {
    let oldest = Date.now();
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(`${this.config.namespace}:`)) {
        const value = localStorage.getItem(key);
        if (value) {
          try {
            const entry = JSON.parse(value);
            oldest = Math.min(oldest, entry.timestamp);
          } catch (error) {
            // Ignore invalid entries
          }
        }
      }
    }
    return oldest;
  }

  private async getNewestEntryTime(): Promise<number> {
    let newest = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(`${this.config.namespace}:`)) {
        const value = localStorage.getItem(key);
        if (value) {
          try {
            const entry = JSON.parse(value);
            newest = Math.max(newest, entry.timestamp);
          } catch (error) {
            // Ignore invalid entries
          }
        }
      }
    }
    return newest;
  }
}

/**
 * IndexedDB cache strategy implementation
 */
export class IndexedDBCacheStrategy implements CacheStrategy {
  public readonly name = 'indexedDB';
  private db: IDBDatabase | null = null;
  private config: Required<CacheConfig>;
  private dbName: string;
  private storeName = 'cache-store';

  constructor(config: CacheConfig = {}) {
    this.config = {
      maxSize: config.maxSize || 100 * 1024 * 1024, // 100MB
      ttl: config.ttl || 24 * 60 * 60 * 1000, // 24 hours
      compression: config.compression || true,
      encryption: config.encryption || false,
      storage: config.storage || 'indexedDB',
      namespace: config.namespace || 'heys-cache',
    };
    this.dbName = `${this.config.namespace}-db`;
  }

  private async initDB(): Promise<IDBDatabase> {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'key' });
          store.createIndex('timestamp', 'timestamp');
          store.createIndex('lastAccessed', 'lastAccessed');
        }
      };
    });
  }

  async get<T>(key: string): Promise<T | null> {
    const db = await this.initDB();
    const transaction = db.transaction([this.storeName], 'readwrite');
    const store = transaction.objectStore(this.storeName);

    return new Promise((resolve, reject) => {
      const request = store.get(key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const entry: CacheEntry<T> | undefined = request.result;

        if (!entry) {
          resolve(null);
          return;
        }

        // Check TTL
        if (this.isExpired(entry)) {
          store.delete(key);
          resolve(null);
          return;
        }

        // Update access statistics
        entry.accessCount++;
        entry.lastAccessed = Date.now();
        store.put(entry);

        // Process value (decompress/decrypt)
        this.processValue(entry.value, entry.compressed, entry.encrypted)
          .then(resolve)
          .catch(reject);
      };
    });
  }

  async set<T>(key: string, value: T, options: Partial<CacheConfig> = {}): Promise<void> {
    const config = { ...this.config, ...options };
    const processedValue = await this.prepareValue(value, config.compression, config.encryption);

    const entry: CacheEntry<T> = {
      key,
      value: processedValue.value,
      timestamp: Date.now(),
      ttl: config.ttl,
      size: this.calculateSize(processedValue.value),
      accessCount: 0,
      lastAccessed: Date.now(),
      compressed: processedValue.compressed,
      encrypted: processedValue.encrypted,
    };

    const db = await this.initDB();
    const transaction = db.transaction([this.storeName], 'readwrite');
    const store = transaction.objectStore(this.storeName);

    // Check if we need to evict entries
    await this.evictIfNeeded(store, entry.size);

    return new Promise((resolve, reject) => {
      const request = store.put(entry);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async delete(key: string): Promise<boolean> {
    const db = await this.initDB();
    const transaction = db.transaction([this.storeName], 'readwrite');
    const store = transaction.objectStore(this.storeName);

    return new Promise((resolve, reject) => {
      const request = store.delete(key);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(true);
    });
  }

  async clear(): Promise<void> {
    const db = await this.initDB();
    const transaction = db.transaction([this.storeName], 'readwrite');
    const store = transaction.objectStore(this.storeName);

    return new Promise((resolve, reject) => {
      const request = store.clear();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async has(key: string): Promise<boolean> {
    const value = await this.get(key);
    return value !== null;
  }

  async size(): Promise<number> {
    const db = await this.initDB();
    const transaction = db.transaction([this.storeName], 'readonly');
    const store = transaction.objectStore(this.storeName);

    return new Promise((resolve, reject) => {
      const request = store.count();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async keys(): Promise<string[]> {
    const db = await this.initDB();
    const transaction = db.transaction([this.storeName], 'readonly');
    const store = transaction.objectStore(this.storeName);

    return new Promise((resolve, reject) => {
      const request = store.getAllKeys();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result as string[]);
    });
  }

  async getStats(): Promise<CacheStats> {
    const db = await this.initDB();
    const transaction = db.transaction([this.storeName], 'readonly');
    const store = transaction.objectStore(this.storeName);

    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const entries: CacheEntry[] = request.result;

        const totalEntries = entries.length;
        const totalSize = entries.reduce((sum, entry) => sum + entry.size, 0);

        // These would need to be tracked separately in a real implementation
        const hitRate = 0.75; // Placeholder
        const missRate = 0.25; // Placeholder
        const averageAccessTime = 5; // Placeholder

        const timestamps = entries.map((e) => e.timestamp);
        const oldestEntry = timestamps.length > 0 ? Math.min(...timestamps) : 0;
        const newestEntry = timestamps.length > 0 ? Math.max(...timestamps) : 0;

        const compressedEntries = entries.filter((e) => e.compressed);
        const compressionRatio =
          compressedEntries.length > 0
            ? compressedEntries.reduce((sum, e) => sum + e.size, 0) / totalSize
            : 0;

        resolve({
          totalEntries,
          totalSize,
          hitRate,
          missRate,
          averageAccessTime,
          oldestEntry,
          newestEntry,
          compressionRatio,
        });
      };
    });
  }

  private isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp > entry.ttl;
  }

  private async evictIfNeeded(store: IDBObjectStore, newEntrySize: number): Promise<void> {
    // Get all entries to check total size
    const getAllRequest = store.getAll();

    return new Promise((resolve, reject) => {
      getAllRequest.onsuccess = () => {
        const entries: CacheEntry[] = getAllRequest.result;
        const currentSize = entries.reduce((sum, entry) => sum + entry.size, 0);

        if (currentSize + newEntrySize > this.config.maxSize) {
          // Sort by last accessed (LRU)
          const sortedEntries = entries.sort((a, b) => a.lastAccessed - b.lastAccessed);

          let freedSpace = 0;
          const deletePromises: Promise<void>[] = [];

          for (const entry of sortedEntries) {
            deletePromises.push(
              new Promise<void>((resolve, reject) => {
                const deleteRequest = store.delete(entry.key);
                deleteRequest.onsuccess = () => resolve();
                deleteRequest.onerror = () => reject(deleteRequest.error);
              }),
            );

            freedSpace += entry.size;
            if (freedSpace >= newEntrySize) break;
          }

          Promise.all(deletePromises)
            .then(() => resolve())
            .catch(reject);
        } else {
          resolve();
        }
      };

      getAllRequest.onerror = () => reject(getAllRequest.error);
    });
  }

  private calculateSize(value: any): number {
    return JSON.stringify(value).length * 2;
  }

  private async prepareValue(
    value: any,
    compress: boolean,
    encrypt: boolean,
  ): Promise<{
    value: any;
    compressed: boolean;
    encrypted: boolean;
  }> {
    let processedValue = value;
    let compressed = false;
    let encrypted = false;

    if (encrypt) {
      processedValue = btoa(JSON.stringify(processedValue));
      encrypted = true;
    }

    if (compress) {
      processedValue = JSON.stringify(processedValue);
      compressed = true;
    }

    return { value: processedValue, compressed, encrypted };
  }

  private async processValue(value: any, compressed: boolean, encrypted: boolean): Promise<any> {
    let processedValue = value;

    if (compressed) {
      processedValue =
        typeof processedValue === 'string' ? JSON.parse(processedValue) : processedValue;
    }

    if (encrypted) {
      processedValue = JSON.parse(atob(processedValue));
    }

    return processedValue;
  }
}

/**
 * Smart cache strategy that automatically selects best storage
 */
export class SmartCacheStrategy implements CacheStrategy {
  public readonly name = 'smart';
  private memory: MemoryCacheStrategy;
  private localStorage?: LocalStorageCacheStrategy;
  private indexedDB?: IndexedDBCacheStrategy;

  constructor(config: CacheConfig = {}) {
    this.memory = new MemoryCacheStrategy(config);

    // Try to initialize localStorage
    if (typeof localStorage !== 'undefined') {
      try {
        this.localStorage = new LocalStorageCacheStrategy(config);
      } catch (error) {
        console.warn('localStorage not available:', error);
      }
    }

    // Try to initialize IndexedDB
    if (typeof indexedDB !== 'undefined') {
      try {
        this.indexedDB = new IndexedDBCacheStrategy(config);
      } catch (error) {
        console.warn('IndexedDB not available:', error);
      }
    }
  }

  private selectStrategy(_key: string, value?: any): CacheStrategy {
    // For large values (>1MB), prefer IndexedDB
    if (value && this.indexedDB) {
      const size = new Blob([JSON.stringify(value)]).size;
      if (size > 1024 * 1024) {
        return this.indexedDB;
      }
    }

    // For medium values, prefer localStorage
    if (this.localStorage) {
      return this.localStorage;
    }

    // Fallback to memory
    return this.memory;
  }

  async get<T>(key: string): Promise<T | null> {
    // Try strategies in order of preference
    const strategies = [this.indexedDB, this.localStorage, this.memory].filter(Boolean);

    for (const strategy of strategies) {
      try {
        const result = await strategy!.get<T>(key);
        if (result !== null) {
          return result;
        }
      } catch (error) {
        console.warn(`Strategy ${strategy!.name} failed for get:`, error);
      }
    }

    return null;
  }

  async set<T>(key: string, value: T, options?: Partial<CacheConfig>): Promise<void> {
    const strategy = this.selectStrategy(key, value);

    try {
      await strategy.set(key, value, options);
    } catch (error) {
      console.warn(`Primary strategy ${strategy.name} failed, falling back to memory:`, error);
      await this.memory.set(key, value, options);
    }
  }

  async delete(key: string): Promise<boolean> {
    const strategies = [this.indexedDB, this.localStorage, this.memory].filter(Boolean);
    let deleted = false;

    for (const strategy of strategies) {
      try {
        const result = await strategy!.delete(key);
        deleted = deleted || result;
      } catch (error) {
        console.warn(`Strategy ${strategy!.name} failed for delete:`, error);
      }
    }

    return deleted;
  }

  async clear(): Promise<void> {
    const strategies = [this.indexedDB, this.localStorage, this.memory].filter(Boolean);

    await Promise.all(
      strategies.map(async (strategy) => {
        try {
          await strategy!.clear();
        } catch (error) {
          console.warn(`Strategy ${strategy!.name} failed for clear:`, error);
        }
      }),
    );
  }

  async has(key: string): Promise<boolean> {
    const strategies = [this.indexedDB, this.localStorage, this.memory].filter(Boolean);

    for (const strategy of strategies) {
      try {
        const hasKey = await strategy!.has(key);
        if (hasKey) {
          return true;
        }
      } catch (error) {
        console.warn(`Strategy ${strategy!.name} failed for has:`, error);
      }
    }

    return false;
  }

  async size(): Promise<number> {
    // Return size from memory strategy as primary indicator
    return this.memory.size();
  }

  async keys(): Promise<string[]> {
    const allKeys = new Set<string>();
    const strategies = [this.indexedDB, this.localStorage, this.memory].filter(Boolean);

    for (const strategy of strategies) {
      try {
        const keys = await strategy!.keys();
        keys.forEach((key) => allKeys.add(key));
      } catch (error) {
        console.warn(`Strategy ${strategy!.name} failed for keys:`, error);
      }
    }

    return Array.from(allKeys);
  }

  async getStats(): Promise<CacheStats> {
    // Aggregate stats from all strategies
    const strategies = [this.indexedDB, this.localStorage, this.memory].filter(Boolean);
    const allStats = await Promise.all(
      strategies.map(async (strategy) => {
        try {
          return await strategy!.getStats();
        } catch (error) {
          console.warn(`Strategy ${strategy!.name} failed for getStats:`, error);
          return null;
        }
      }),
    );

    const validStats = allStats.filter(Boolean) as CacheStats[];

    if (validStats.length === 0) {
      return {
        totalEntries: 0,
        totalSize: 0,
        hitRate: 0,
        missRate: 100,
        averageAccessTime: 0,
        oldestEntry: 0,
        newestEntry: 0,
        compressionRatio: 0,
      };
    }

    // Aggregate the stats
    return {
      totalEntries: validStats.reduce((sum, stats) => sum + stats.totalEntries, 0),
      totalSize: validStats.reduce((sum, stats) => sum + stats.totalSize, 0),
      hitRate: validStats.reduce((sum, stats) => sum + stats.hitRate, 0) / validStats.length,
      missRate: validStats.reduce((sum, stats) => sum + stats.missRate, 0) / validStats.length,
      averageAccessTime:
        validStats.reduce((sum, stats) => sum + stats.averageAccessTime, 0) / validStats.length,
      oldestEntry: Math.min(...validStats.map((stats) => stats.oldestEntry)),
      newestEntry: Math.max(...validStats.map((stats) => stats.newestEntry)),
      compressionRatio:
        validStats.reduce((sum, stats) => sum + stats.compressionRatio, 0) / validStats.length,
    };
  }
}

/**
 * Smart cache manager with multiple strategies
 */
export class SmartCacheManager {
  private strategies = new Map<string, CacheStrategy>();
  private defaultStrategy: string;

  constructor(defaultStrategy = 'memory') {
    this.defaultStrategy = defaultStrategy;
    this.registerStrategy(new MemoryCacheStrategy());
    this.registerStrategy(new LocalStorageCacheStrategy());
    this.registerStrategy(new SmartCacheStrategy());

    // Only register IndexedDB if available
    if (typeof indexedDB !== 'undefined') {
      this.registerStrategy(new IndexedDBCacheStrategy());
    }
  }

  registerStrategy(strategy: CacheStrategy): void {
    this.strategies.set(strategy.name, strategy);
  }

  getStrategy(name?: string): CacheStrategy {
    const strategyName = name || this.defaultStrategy;
    const strategy = this.strategies.get(strategyName);
    if (!strategy) {
      throw new Error(`Cache strategy '${strategyName}' not found`);
    }
    return strategy;
  }

  async get<T>(key: string, strategy?: string): Promise<T | null> {
    return this.getStrategy(strategy).get<T>(key);
  }

  async set<T>(
    key: string,
    value: T,
    options?: Partial<CacheConfig>,
    strategy?: string,
  ): Promise<void> {
    return this.getStrategy(strategy).set(key, value, options);
  }

  async delete(key: string, strategy?: string): Promise<boolean> {
    return this.getStrategy(strategy).delete(key);
  }

  async clear(strategy?: string): Promise<void> {
    return this.getStrategy(strategy).clear();
  }

  async clearAll(): Promise<void> {
    const promises = Array.from(this.strategies.values()).map((strategy) =>
      strategy
        .clear()
        .catch((error) => console.warn(`Failed to clear strategy ${strategy.name}:`, error)),
    );
    await Promise.all(promises);
  }

  async has(key: string, strategy?: string): Promise<boolean> {
    return this.getStrategy(strategy).has(key);
  }

  async getStats(strategy?: string): Promise<CacheStats> {
    return this.getStrategy(strategy).getStats();
  }

  async getAllStats(): Promise<Record<string, CacheStats>> {
    const stats: Record<string, CacheStats> = {};

    for (const [name, strategy] of this.strategies) {
      try {
        stats[name] = await strategy.getStats();
      } catch (error) {
        console.warn(`Failed to get stats for strategy ${name}:`, error);
      }
    }

    return stats;
  }

  /**
   * Intelligent cache selection based on data characteristics
   */
  async smartSet<T>(key: string, value: T, options: Partial<CacheConfig> = {}): Promise<void> {
    const size = JSON.stringify(value).length * 2;
    const isLargeData = size > 1024 * 1024; // 1MB
    const isLongTerm = (options.ttl || 0) > 60 * 60 * 1000; // 1 hour

    let strategy: string;

    if (isLargeData && isLongTerm && this.strategies.has('indexedDB')) {
      strategy = 'indexedDB';
    } else {
      strategy = 'memory';
    }

    return this.set(key, value, options, strategy);
  }

  /**
   * Cache warming - preload important data
   */
  async warmCache(
    warmupData: Array<{ key: string; value: any; options?: Partial<CacheConfig> }>,
  ): Promise<void> {
    const promises = warmupData.map(({ key, value, options }) =>
      this.smartSet(key, value, options),
    );

    await Promise.all(promises);
  }
}

/**
 * Cache decorator for methods
 */
export function cached(options: Partial<CacheConfig> & { strategy?: string } = {}) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const cacheManager = new SmartCacheManager();

    descriptor.value = async function (...args: any[]) {
      const cacheKey = `${target.constructor.name}.${propertyKey}:${JSON.stringify(args)}`;

      // Try to get from cache
      const cached = await cacheManager.get(cacheKey, options.strategy);
      if (cached !== null) {
        return cached;
      }

      // Execute original method
      const result = await originalMethod.apply(this, args);

      // Cache the result
      await cacheManager.set(cacheKey, result, options, options.strategy);

      return result;
    };

    return descriptor;
  };
}

/**
 * Default cache manager instance
 */
export const defaultCacheManager = new SmartCacheManager();
