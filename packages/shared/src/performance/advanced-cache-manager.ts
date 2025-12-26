/**
 * Advanced Caching Manager for HEYS Application
 * Implements comprehensive caching strategies including HTTP caching,
 * browser storage, and Service Worker integration
 *
 * @author HEYS Team
 * @version 1.4.0
 * @created 2025-01-31
 */

import { perfLogger } from './logger';

const baseLogger = perfLogger;

export interface CacheConfig {
  enabled: boolean;
  strategies: {
    http: HttpCacheConfig;
    browser: BrowserCacheConfig;
    serviceWorker: ServiceWorkerConfig;
    memory: MemoryCacheConfig;
  };
  invalidation: InvalidationConfig;
  compression: CompressionConfig;
}

export interface HttpCacheConfig {
  enabled: boolean;
  headers: {
    cacheControl: string;
    expires: number;
    etag: boolean;
    lastModified: boolean;
  };
  cdnSettings: {
    enabled: boolean;
    ttl: number;
    purgeOnUpdate: boolean;
  };
}

export interface BrowserCacheConfig {
  localStorage: {
    enabled: boolean;
    maxSize: number;
    ttl: number;
  };
  sessionStorage: {
    enabled: boolean;
    maxSize: number;
  };
  indexedDB: {
    enabled: boolean;
    dbName: string;
    version: number;
    stores: string[];
  };
}

export interface ServiceWorkerConfig {
  enabled: boolean;
  scriptPath: string;
  scope: string;
  updateInterval: number;
  strategies: {
    static: string;
    dynamic: string;
    api: string;
    images: string;
  };
}

export interface MemoryCacheConfig {
  enabled: boolean;
  maxSize: number;
  maxAge: number;
  algorithm: 'LRU' | 'LFU' | 'FIFO';
}

export interface InvalidationConfig {
  strategies: ('time' | 'version' | 'manual' | 'dependency')[];
  timeBasedTTL: number;
  versionTracking: boolean;
  dependencyTracking: boolean;
}

export interface CompressionConfig {
  enabled: boolean;
  algorithm: 'gzip' | 'brotli' | 'deflate';
  level: number;
  threshold: number;
}

export interface CacheEntry<T = unknown> {
  key: string;
  value: T;
  timestamp: number;
  ttl: number;
  version: string;
  dependencies?: string[];
  metadata: {
    size: number;
    compressed: boolean;
    hits: number;
    lastAccessed: number;
  };
}

export interface CacheStats {
  total: {
    entries: number;
    size: number;
    hitRate: number;
  };
  byType: {
    [key: string]: {
      entries: number;
      size: number;
      hitRate: number;
    };
  };
  performance: {
    averageResponseTime: number;
    totalRequests: number;
    cacheHits: number;
    cacheMisses: number;
  };
}

/**
 * Advanced caching manager with multiple storage strategies
 */
export class AdvancedCacheManager {
  private config: CacheConfig;
  private memoryCache: Map<string, CacheEntry>;
  private performanceMetrics: {
    hits: number;
    misses: number;
    totalRequests: number;
    totalResponseTime: number;
  };
  private serviceWorkerRegistration: ServiceWorkerRegistration | null = null;
  private compressionWorker: Worker | null = null;
  private readonly logger = baseLogger.child({ component: 'AdvancedCacheManager' });

  constructor(config: CacheConfig) {
    this.config = config;
    this.memoryCache = new Map();
    this.performanceMetrics = {
      hits: 0,
      misses: 0,
      totalRequests: 0,
      totalResponseTime: 0,
    };

    this.initialize();
  }

  /**
   * Initialize the cache manager
   */
  private async initialize(): Promise<void> {
    try {
      if (this.config.strategies.serviceWorker.enabled) {
        await this.initializeServiceWorker();
      }

      if (this.config.compression.enabled) {
        await this.initializeCompressionWorker();
      }

      // Start cleanup intervals
      this.startCleanupIntervals();

      this.logger.info('AdvancedCacheManager initialized successfully');
    } catch (error) {
      this.logger.error({ error }, 'Failed to initialize AdvancedCacheManager');
    }
  }

  /**
   * Initialize Service Worker
   */
  private async initializeServiceWorker(): Promise<void> {
    if (!('serviceWorker' in navigator)) {
      this.logger.warn('Service Worker not supported');
      return;
    }

    try {
      this.serviceWorkerRegistration = await navigator.serviceWorker.register(
        this.config.strategies.serviceWorker.scriptPath,
        { scope: this.config.strategies.serviceWorker.scope },
      );

      this.logger.info('Service Worker registered successfully');

      // Listen for messages from Service Worker
      navigator.serviceWorker.addEventListener('message', (event) => {
        this.handleServiceWorkerMessage(event);
      });

      // Update Service Worker periodically
      setInterval(() => {
        this.serviceWorkerRegistration?.update();
      }, this.config.strategies.serviceWorker.updateInterval);
    } catch (error) {
      this.logger.error({ error }, 'Service Worker registration failed');
    }
  }

  /**
   * Initialize compression worker
   */
  private async initializeCompressionWorker(): Promise<void> {
    try {
      const workerCode = `
        importScripts('https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js');
        
        self.onmessage = function(e) {
          const { type, data, id } = e.data;
          
          try {
            let result;
            
            if (type === 'compress') {
              result = pako.deflate(data, { level: 6 });
            } else if (type === 'decompress') {
              result = pako.inflate(data, { to: 'string' });
            }
            
            self.postMessage({ type: 'result', result, id });
          } catch (error) {
            self.postMessage({ type: 'error', error: error.message, id });
          }
        };
      `;

      const blob = new Blob([workerCode], { type: 'application/javascript' });
      this.compressionWorker = new Worker(URL.createObjectURL(blob));
    } catch (error) {
      this.logger.warn({ error }, 'Compression worker initialization failed');
    }
  }

  /**
   * Store item in cache with advanced features
   */
  async store<T>(
    key: string,
    value: T,
    options: {
      ttl?: number;
      strategy?: 'memory' | 'localStorage' | 'sessionStorage' | 'indexedDB';
      compress?: boolean;
      dependencies?: string[];
      version?: string;
    } = {},
  ): Promise<boolean> {
    const startTime = Date.now();

    try {
      const {
        ttl = this.config.strategies.memory.maxAge,
        strategy = 'memory',
        compress = false,
        dependencies = [],
        version = '1.0.0',
      } = options;

      // Serialize value
      const serialized = JSON.stringify(value);
      let finalValue = serialized;

      // Compress if requested and enabled
      if (
        compress &&
        this.config.compression.enabled &&
        serialized.length > this.config.compression.threshold
      ) {
        finalValue = await this.compressData(serialized);
      }

      const entry: CacheEntry<string> = {
        key,
        value: finalValue,
        timestamp: Date.now(),
        ttl,
        version,
        dependencies,
        metadata: {
          size: finalValue.length,
          compressed: compress,
          hits: 0,
          lastAccessed: Date.now(),
        },
      };

      // Store based on strategy
      switch (strategy) {
        case 'memory':
          await this.storeInMemory(key, entry);
          break;
        case 'localStorage':
          await this.storeInLocalStorage(key, entry);
          break;
        case 'sessionStorage':
          await this.storeInSessionStorage(key, entry);
          break;
        case 'indexedDB':
          await this.storeInIndexedDB(key, entry);
          break;
        default:
          throw new Error(`Unknown storage strategy: ${strategy}`);
      }

      this.updatePerformanceMetrics(Date.now() - startTime, true);
      return true;
    } catch (error) {
      this.logger.error({ error }, 'Cache store failed');
      this.updatePerformanceMetrics(Date.now() - startTime, false);
      return false;
    }
  }

  /**
   * Retrieve item from cache with fallback strategies
   */
  async retrieve<T>(
    key: string,
    options: {
      strategy?: 'memory' | 'localStorage' | 'sessionStorage' | 'indexedDB' | 'auto';
      fallbackStrategies?: string[];
    } = {},
  ): Promise<T | null> {
    const startTime = Date.now();

    try {
      const { strategy = 'auto', fallbackStrategies = ['memory', 'localStorage', 'indexedDB'] } =
        options;

      let entry: CacheEntry<string> | null = null;

      if (strategy === 'auto') {
        // Try fallback strategies in order
        for (const fallbackStrategy of fallbackStrategies) {
          entry = await this.retrieveFromStrategy(key, fallbackStrategy);
          if (entry) break;
        }
      } else {
        entry = await this.retrieveFromStrategy(key, strategy);
      }

      if (!entry) {
        this.performanceMetrics.misses++;
        this.updatePerformanceMetrics(Date.now() - startTime, false);
        return null;
      }

      // Check if expired
      if (this.isExpired(entry)) {
        await this.invalidate(key);
        this.performanceMetrics.misses++;
        this.updatePerformanceMetrics(Date.now() - startTime, false);
        return null;
      }

      // Update hit count
      entry.metadata.hits++;
      entry.metadata.lastAccessed = Date.now();

      // Decompress if needed
      let value = entry.value;
      if (entry.metadata.compressed) {
        value = await this.decompressData(value);
      }

      const result = JSON.parse(value) as T;

      this.performanceMetrics.hits++;
      this.updatePerformanceMetrics(Date.now() - startTime, true);

      return result;
    } catch (error) {
      this.logger.error({ error }, 'Cache retrieve failed');
      this.performanceMetrics.misses++;
      this.updatePerformanceMetrics(Date.now() - startTime, false);
      return null;
    }
  }

  /**
   * Store in memory with LRU eviction
   */
  private async storeInMemory(key: string, entry: CacheEntry<string>): Promise<void> {
    if (!this.config.strategies.memory.enabled) return;

    // Check memory limit
    if (this.memoryCache.size >= this.config.strategies.memory.maxSize) {
      await this.evictFromMemory();
    }

    this.memoryCache.set(key, entry);
  }

  /**
   * Store in localStorage with size management
   */
  private async storeInLocalStorage(key: string, entry: CacheEntry<string>): Promise<void> {
    if (!this.config.strategies.browser.localStorage.enabled) return;

    try {
      const storageKey = `heys_cache_${key}`;
      const serializedEntry = JSON.stringify(entry);

      // Check size limit
      const currentSize = this.getLocalStorageSize();
      if (
        currentSize + serializedEntry.length >
        this.config.strategies.browser.localStorage.maxSize
      ) {
        await this.cleanupLocalStorage();
      }

      localStorage.setItem(storageKey, serializedEntry);
    } catch (error) {
      this.logger.warn({ error }, 'localStorage store failed');
    }
  }

  /**
   * Store in sessionStorage
   */
  private async storeInSessionStorage(key: string, entry: CacheEntry<string>): Promise<void> {
    if (!this.config.strategies.browser.sessionStorage.enabled) return;

    try {
      const storageKey = `heys_session_cache_${key}`;
      sessionStorage.setItem(storageKey, JSON.stringify(entry));
    } catch (error) {
      this.logger.warn({ error }, 'sessionStorage store failed');
    }
  }

  /**
   * Store in IndexedDB
   */
  private async storeInIndexedDB(key: string, entry: CacheEntry<string>): Promise<void> {
    if (!this.config.strategies.browser.indexedDB.enabled) return;

    try {
      const db = await this.openIndexedDB();
      const transaction = db.transaction(['cache'], 'readwrite');
      const store = transaction.objectStore('cache');

      await new Promise((resolve, reject) => {
        const request = store.put({ ...entry, id: key });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      this.logger.warn({ error }, 'IndexedDB store failed');
    }
  }

  /**
   * Retrieve from specific storage strategy
   */
  private async retrieveFromStrategy(
    key: string,
    strategy: string,
  ): Promise<CacheEntry<string> | null> {
    switch (strategy) {
      case 'memory':
        return (this.memoryCache.get(key) as CacheEntry<string> | undefined) || null;

      case 'localStorage':
        try {
          const storageKey = `heys_cache_${key}`;
          const stored = localStorage.getItem(storageKey);
          return stored ? JSON.parse(stored) : null;
        } catch {
          return null;
        }

      case 'sessionStorage':
        try {
          const storageKey = `heys_session_cache_${key}`;
          const stored = sessionStorage.getItem(storageKey);
          return stored ? JSON.parse(stored) : null;
        } catch {
          return null;
        }

      case 'indexedDB':
        try {
          const db = await this.openIndexedDB();
          const transaction = db.transaction(['cache'], 'readonly');
          const store = transaction.objectStore('cache');

          return await new Promise((resolve, reject) => {
            const request = store.get(key);
            request.onsuccess = () => {
              const result = request.result;
              resolve(result ? { ...result, key: result.id } : null);
            };
            request.onerror = () => reject(request.error);
          });
        } catch {
          return null;
        }

      default:
        return null;
    }
  }

  /**
   * Invalidate cache entry
   */
  async invalidate(key: string, cascade: boolean = true): Promise<void> {
    // Remove from all storage strategies
    this.memoryCache.delete(key);

    try {
      localStorage.removeItem(`heys_cache_${key}`);
      sessionStorage.removeItem(`heys_session_cache_${key}`);

      if (this.config.strategies.browser.indexedDB.enabled) {
        const db = await this.openIndexedDB();
        const transaction = db.transaction(['cache'], 'readwrite');
        const store = transaction.objectStore('cache');
        store.delete(key);
      }
    } catch (error) {
      this.logger.warn({ error }, 'Cache invalidation partially failed');
    }

    // Cascade invalidation for dependent entries
    if (cascade) {
      await this.cascadeInvalidation(key);
    }
  }

  /**
   * Cascade invalidation for dependent entries
   */
  private async cascadeInvalidation(invalidatedKey: string): Promise<void> {
    const dependentKeys: string[] = [];

    // Check memory cache for dependencies
    for (const [key, entry] of this.memoryCache.entries()) {
      if (entry.dependencies?.includes(invalidatedKey)) {
        dependentKeys.push(key);
      }
    }

    // Invalidate dependent entries
    for (const key of dependentKeys) {
      await this.invalidate(key, false); // Prevent infinite recursion
    }
  }

  /**
   * Check if cache entry is expired
   */
  private isExpired(entry: CacheEntry<string>): boolean {
    return Date.now() - entry.timestamp > entry.ttl;
  }

  /**
   * Compress data using worker
   */
  private async compressData(data: string): Promise<string> {
    if (!this.compressionWorker) return data;

    return new Promise((resolve, reject) => {
      const id = Math.random().toString(36).substr(2, 9);

      const handleMessage = (event: MessageEvent) => {
        if (event.data.id === id) {
          this.compressionWorker?.removeEventListener('message', handleMessage);

          if (event.data.type === 'result') {
            resolve(btoa(String.fromCharCode(...event.data.result)));
          } else {
            reject(new Error(event.data.error));
          }
        }
      };

      this.compressionWorker?.addEventListener('message', handleMessage);
      this.compressionWorker?.postMessage({
        type: 'compress',
        data: new TextEncoder().encode(data),
        id,
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        this.compressionWorker?.removeEventListener('message', handleMessage);
        reject(new Error('Compression timeout'));
      }, 5000);
    });
  }

  /**
   * Decompress data using worker
   */
  private async decompressData(data: string): Promise<string> {
    if (!this.compressionWorker) return data;

    return new Promise((resolve, reject) => {
      const id = Math.random().toString(36).substr(2, 9);

      const handleMessage = (event: MessageEvent) => {
        if (event.data.id === id) {
          this.compressionWorker?.removeEventListener('message', handleMessage);

          if (event.data.type === 'result') {
            resolve(event.data.result);
          } else {
            reject(new Error(event.data.error));
          }
        }
      };

      this.compressionWorker?.addEventListener('message', handleMessage);

      try {
        const binaryData = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
        this.compressionWorker?.postMessage({
          type: 'decompress',
          data: binaryData,
          id,
        });
      } catch (error) {
        reject(error);
      }

      // Timeout after 5 seconds
      setTimeout(() => {
        this.compressionWorker?.removeEventListener('message', handleMessage);
        reject(new Error('Decompression timeout'));
      }, 5000);
    });
  }

  /**
   * Evict entries from memory cache using LRU
   */
  private async evictFromMemory(): Promise<void> {
    if (this.memoryCache.size === 0) return;

    const entries = Array.from(this.memoryCache.entries());

    // Sort by last accessed time (LRU)
    entries.sort((a, b) => a[1].metadata.lastAccessed - b[1].metadata.lastAccessed);

    // Remove oldest 25% of entries
    const toRemove = Math.ceil(entries.length * 0.25);
    for (let i = 0; i < toRemove && i < entries.length; i++) {
      const entryKey = entries[i]?.[0];
      if (entryKey) {
        this.memoryCache.delete(entryKey);
      }
    }
  }

  /**
   * Get localStorage usage size
   */
  private getLocalStorageSize(): number {
    let total = 0;
    for (const key in localStorage) {
      if (key.startsWith('heys_cache_')) {
        total += localStorage[key].length;
      }
    }
    return total;
  }

  /**
   * Cleanup localStorage when approaching limits
   */
  private async cleanupLocalStorage(): Promise<void> {
    const entries: Array<[string, CacheEntry<string>]> = [];

    for (const key in localStorage) {
      if (key.startsWith('heys_cache_')) {
        try {
          const entry = JSON.parse(localStorage[key]);
          entries.push([key, entry]);
        } catch {
          localStorage.removeItem(key);
        }
      }
    }

    // Sort by last accessed time
    entries.sort((a, b) => a[1].metadata.lastAccessed - b[1].metadata.lastAccessed);

    // Remove oldest 50% of entries
    const toRemove = Math.ceil(entries.length * 0.5);
    for (let i = 0; i < toRemove && i < entries.length; i++) {
      const entryKey = entries[i]?.[0];
      if (entryKey) {
        localStorage.removeItem(entryKey);
      }
    }
  }

  /**
   * Open IndexedDB connection
   */
  private async openIndexedDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(
        this.config.strategies.browser.indexedDB.dbName,
        this.config.strategies.browser.indexedDB.version,
      );

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains('cache')) {
          const store = db.createObjectStore('cache', { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp');
          store.createIndex('version', 'version');
        }
      };
    });
  }

  /**
   * Start cleanup intervals
   */
  private startCleanupIntervals(): void {
    // Cleanup expired entries every 5 minutes
    setInterval(
      () => {
        this.cleanupExpiredEntries();
      },
      5 * 60 * 1000,
    );

    // Memory pressure cleanup every minute
    setInterval(() => {
      if (this.memoryCache.size > this.config.strategies.memory.maxSize * 0.8) {
        this.evictFromMemory();
      }
    }, 60 * 1000);
  }

  /**
   * Cleanup expired entries from all storage
   */
  private async cleanupExpiredEntries(): Promise<void> {
    // Cleanup memory cache
    for (const [key, entry] of this.memoryCache.entries()) {
      if (this.isExpired(entry as CacheEntry<string>)) {
        this.memoryCache.delete(key);
      }
    }

    // Cleanup localStorage
    for (const key in localStorage) {
      if (key.startsWith('heys_cache_')) {
        try {
          const entry = JSON.parse(localStorage[key]);
          if (this.isExpired(entry)) {
            localStorage.removeItem(key);
          }
        } catch {
          localStorage.removeItem(key);
        }
      }
    }
  }

  /**
   * Handle Service Worker messages
   */
  private handleServiceWorkerMessage(event: MessageEvent): void {
    if (event.data?.type) {
      switch (event.data.type) {
        case 'CACHE_STATS':
          this.logger.info({ stats: event.data.stats }, 'Service Worker Cache Stats');
          break;
        case 'CACHE_CLEARED':
          this.logger.info('Service Worker cache cleared');
          break;
        case 'SYNC_COMPLETE':
          this.logger.info({ processed: event.data.processed }, 'Background sync completed');
          break;
      }
    }
  }

  /**
   * Update performance metrics
   */
  private updatePerformanceMetrics(responseTime: number, hit: boolean): void {
    this.performanceMetrics.totalRequests++;
    this.performanceMetrics.totalResponseTime += responseTime;

    if (hit) {
      this.performanceMetrics.hits++;
    } else {
      this.performanceMetrics.misses++;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    const memoryEntries = this.memoryCache.size;
    const memorySize = Array.from(this.memoryCache.values()).reduce(
      (total, entry) => total + entry.metadata.size,
      0,
    );

    const stats: CacheStats = {
      total: {
        entries: memoryEntries,
        size: memorySize,
        hitRate:
          this.performanceMetrics.totalRequests > 0
            ? this.performanceMetrics.hits / this.performanceMetrics.totalRequests
            : 0,
      },
      byType: {
        memory: {
          entries: memoryEntries,
          size: memorySize,
          hitRate:
            this.performanceMetrics.totalRequests > 0
              ? this.performanceMetrics.hits / this.performanceMetrics.totalRequests
              : 0,
        },
      },
      performance: {
        averageResponseTime:
          this.performanceMetrics.totalRequests > 0
            ? this.performanceMetrics.totalResponseTime / this.performanceMetrics.totalRequests
            : 0,
        totalRequests: this.performanceMetrics.totalRequests,
        cacheHits: this.performanceMetrics.hits,
        cacheMisses: this.performanceMetrics.misses,
      },
    };

    return stats;
  }

  /**
   * Clear all caches
   */
  async clearAll(): Promise<void> {
    // Clear memory cache
    this.memoryCache.clear();

    // Clear localStorage
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('heys_cache_') || key.startsWith('heys-cache:'))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => localStorage.removeItem(key));
    } catch (error) {
      this.logger.warn({ error }, 'localStorage clear failed');
    }

    // Clear sessionStorage
    for (const key in sessionStorage) {
      if (key.startsWith('heys_session_cache_')) {
        sessionStorage.removeItem(key);
      }
    }

    // Clear IndexedDB
    try {
      if (this.config.strategies.browser.indexedDB.enabled) {
        const db = await this.openIndexedDB();
        const transaction = db.transaction(['cache'], 'readwrite');
        const store = transaction.objectStore('cache');
        store.clear();
      }
    } catch (error) {
      this.logger.warn({ error }, 'IndexedDB clear failed');
    }

    // Clear Service Worker cache
    if (this.serviceWorkerRegistration) {
      const messageChannel = new MessageChannel();
      messageChannel.port1.onmessage = (event) => {
        this.logger.info({ data: event.data }, 'Service Worker cache cleared');
      };

      navigator.serviceWorker.controller?.postMessage({ type: 'CLEAR_CACHE' }, [
        messageChannel.port2,
      ]);
    }

    // Reset performance metrics
    this.performanceMetrics = {
      hits: 0,
      misses: 0,
      totalRequests: 0,
      totalResponseTime: 0,
    };
  }

  /**
   * Destroy the cache manager
   */
  async destroy(): Promise<void> {
    await this.clearAll();

    if (this.compressionWorker) {
      this.compressionWorker.terminate();
      this.compressionWorker = null;
    }

    if (this.serviceWorkerRegistration) {
      await this.serviceWorkerRegistration.unregister();
      this.serviceWorkerRegistration = null;
    }
  }
}

/**
 * Default cache configuration
 */
export const defaultCacheConfig: CacheConfig = {
  enabled: true,
  strategies: {
    http: {
      enabled: true,
      headers: {
        cacheControl: 'public, max-age=3600',
        expires: 3600,
        etag: true,
        lastModified: true,
      },
      cdnSettings: {
        enabled: false,
        ttl: 86400,
        purgeOnUpdate: true,
      },
    },
    browser: {
      localStorage: {
        enabled: true,
        maxSize: 5 * 1024 * 1024, // 5MB
        ttl: 24 * 60 * 60 * 1000, // 24 hours
      },
      sessionStorage: {
        enabled: true,
        maxSize: 1 * 1024 * 1024, // 1MB
      },
      indexedDB: {
        enabled: true,
        dbName: 'HeysCacheDB',
        version: 1,
        stores: ['cache'],
      },
    },
    serviceWorker: {
      enabled: true,
      scriptPath: '/service-worker.js',
      scope: '/',
      updateInterval: 60 * 60 * 1000, // 1 hour
      strategies: {
        static: 'cacheFirst',
        dynamic: 'networkFirst',
        api: 'staleWhileRevalidate',
        images: 'cacheFirst',
      },
    },
    memory: {
      enabled: true,
      maxSize: 1000,
      maxAge: 30 * 60 * 1000, // 30 minutes
      algorithm: 'LRU',
    },
  },
  invalidation: {
    strategies: ['time', 'version', 'manual'],
    timeBasedTTL: 60 * 60 * 1000, // 1 hour
    versionTracking: true,
    dependencyTracking: true,
  },
  compression: {
    enabled: true,
    algorithm: 'gzip',
    level: 6,
    threshold: 1024, // 1KB
  },
};
