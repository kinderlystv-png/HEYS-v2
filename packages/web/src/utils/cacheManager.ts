// filepath: packages/web/src/utils/cacheManager.ts

/**
 * HEYS EAP 3.0 - Cache Manager
 * 
 * Purpose: Client-side caching system with performance optimization
 * Features: Memory cache, localStorage cache, IndexedDB cache, TTL support
 */

import { logger } from '@heys/logger'

// Types
interface CacheEntry<T = unknown> {
  key: string
  data: T
  timestamp: number
  ttl: number // Time to live in milliseconds
  size: number
  accessCount: number
  lastAccessed: number
}

interface CacheConfig {
  maxMemorySize: number // bytes
  maxMemoryEntries: number
  defaultTTL: number // milliseconds
  enablePersistence: boolean
  enableIndexedDB: boolean
  compressionEnabled: boolean
  evictionPolicy: 'lru' | 'lfu' | 'fifo'
}

interface CacheStats {
  memoryHits: number
  memoryMisses: number
  storageHits: number
  storageMisses: number
  totalSize: number
  entryCount: number
  hitRate: number
}

/**
 * Memory cache with LRU eviction
 */
class MemoryCache<T = unknown> {
  private cache = new Map<string, CacheEntry<T>>()
  private accessOrder = new Map<string, number>()
  private maxSize: number
  private maxEntries: number
  private currentSize = 0
  private accessCounter = 0

  constructor(maxSize: number, maxEntries: number) {
    this.maxSize = maxSize
    this.maxEntries = maxEntries
  }

  set(key: string, data: T, ttl: number): void {
    const size = this.estimateSize(data)
    const now = Date.now()

    // Remove existing entry if it exists
    if (this.cache.has(key)) {
      this.delete(key)
    }

    // Check if we need to evict entries
    this.evictIfNeeded(size)

    const entry: CacheEntry<T> = {
      key,
      data,
      timestamp: now,
      ttl,
      size,
      accessCount: 1,
      lastAccessed: now
    }

    this.cache.set(key, entry)
    this.accessOrder.set(key, this.accessCounter++)
    this.currentSize += size
  }

  get(key: string): T | null {
    const entry = this.cache.get(key)
    
    if (!entry) {
      return null
    }

    const now = Date.now()

    // Check if entry has expired
    if (now > entry.timestamp + entry.ttl) {
      this.delete(key)
      return null
    }

    // Update access statistics
    entry.accessCount++
    entry.lastAccessed = now
    this.accessOrder.set(key, this.accessCounter++)

    return entry.data
  }

  delete(key: string): boolean {
    const entry = this.cache.get(key)
    if (entry) {
      this.cache.delete(key)
      this.accessOrder.delete(key)
      this.currentSize -= entry.size
      return true
    }
    return false
  }

  clear(): void {
    this.cache.clear()
    this.accessOrder.clear()
    this.currentSize = 0
    this.accessCounter = 0
  }

  has(key: string): boolean {
    const entry = this.cache.get(key)
    if (!entry) return false

    const now = Date.now()
    if (now > entry.timestamp + entry.ttl) {
      this.delete(key)
      return false
    }

    return true
  }

  keys(): string[] {
    return Array.from(this.cache.keys())
  }

  size(): number {
    return this.cache.size
  }

  getStats(): { size: number; entries: number; memoryUsage: number } {
    return {
      size: this.currentSize,
      entries: this.cache.size,
      memoryUsage: this.currentSize
    }
  }

  private evictIfNeeded(newEntrySize: number): void {
    // Evict expired entries first
    this.evictExpired()

    // Check if we need more space
    while (
      (this.currentSize + newEntrySize > this.maxSize || 
       this.cache.size >= this.maxEntries) &&
      this.cache.size > 0
    ) {
      this.evictLRU()
    }
  }

  private evictExpired(): void {
    const now = Date.now()
    const expiredKeys: string[] = []

    this.cache.forEach((entry, key) => {
      if (now > entry.timestamp + entry.ttl) {
        expiredKeys.push(key)
      }
    })

    expiredKeys.forEach(key => this.delete(key))
  }

  private evictLRU(): void {
    let oldestKey = ''
    let oldestAccess = Infinity

    this.accessOrder.forEach((accessTime, key) => {
      if (accessTime < oldestAccess) {
        oldestAccess = accessTime
        oldestKey = key
      }
    })

    if (oldestKey) {
      this.delete(oldestKey)
    }
  }

  private estimateSize(data: T): number {
    try {
      return JSON.stringify(data).length * 2 // Rough estimate: 2 bytes per character
    } catch {
      return 1024 // Default size if serialization fails
    }
  }
}

/**
 * Storage cache using localStorage/sessionStorage
 */
class StorageCache {
  private storage: Storage
  private prefix: string

  constructor(storage: Storage = localStorage, prefix = 'heys_cache_') {
    this.storage = storage
    this.prefix = prefix
  }

  set<T>(key: string, data: T, ttl: number): void {
    try {
      const entry: CacheEntry<T> = {
        key,
        data,
        timestamp: Date.now(),
        ttl,
        size: 0,
        accessCount: 1,
        lastAccessed: Date.now()
      }

      this.storage.setItem(this.prefix + key, JSON.stringify(entry))
    } catch (error) {
      logger.warn('Failed to store in localStorage:', error)
    }
  }

  get<T>(key: string): T | null {
    try {
      const item = this.storage.getItem(this.prefix + key)
      if (!item) return null

      const entry: CacheEntry<T> = JSON.parse(item)
      const now = Date.now()

      // Check if expired
      if (now > entry.timestamp + entry.ttl) {
        this.delete(key)
        return null
      }

      // Update access count
      entry.accessCount++
      entry.lastAccessed = now
      this.storage.setItem(this.prefix + key, JSON.stringify(entry))

      return entry.data
    } catch (error) {
      logger.warn('Failed to read from localStorage:', error)
      return null
    }
  }

  delete(key: string): boolean {
    try {
      this.storage.removeItem(this.prefix + key)
      return true
    } catch (error) {
      logger.warn('Failed to delete from localStorage:', error)
      return false
    }
  }

  clear(): void {
    try {
      const keys = Object.keys(this.storage).filter(key => 
        key.startsWith(this.prefix)
      )
      keys.forEach(key => this.storage.removeItem(key))
    } catch (error) {
      logger.warn('Failed to clear localStorage cache:', error)
    }
  }

  has(key: string): boolean {
    return this.get(key) !== null
  }

  keys(): string[] {
    try {
      return Object.keys(this.storage)
        .filter(key => key.startsWith(this.prefix))
        .map(key => key.substring(this.prefix.length))
    } catch {
      return []
    }
  }
}

/**
 * IndexedDB cache for large data
 */
class IndexedDBCache {
  private dbName: string
  private version: number
  private db: IDBDatabase | null = null

  constructor(dbName = 'heys_cache', version = 1) {
    this.dbName = dbName
    this.version = version
  }

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        this.db = request.result
        resolve()
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        
        if (!db.objectStoreNames.contains('cache')) {
          const store = db.createObjectStore('cache', { keyPath: 'key' })
          store.createIndex('timestamp', 'timestamp')
          store.createIndex('lastAccessed', 'lastAccessed')
        }
      }
    })
  }

  async set<T>(key: string, data: T, ttl: number): Promise<void> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['cache'], 'readwrite')
      const store = transaction.objectStore('cache')

      const entry: CacheEntry<T> = {
        key,
        data,
        timestamp: Date.now(),
        ttl,
        size: 0,
        accessCount: 1,
        lastAccessed: Date.now()
      }

      const request = store.put(entry)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['cache'], 'readwrite')
      const store = transaction.objectStore('cache')

      const request = store.get(key)
      request.onsuccess = () => {
        const entry: CacheEntry<T> = request.result
        
        if (!entry) {
          resolve(null)
          return
        }

        const now = Date.now()
        if (now > entry.timestamp + entry.ttl) {
          // Expired, delete it
          store.delete(key)
          resolve(null)
          return
        }

        // Update access statistics
        entry.accessCount++
        entry.lastAccessed = now
        store.put(entry)

        resolve(entry.data)
      }
      request.onerror = () => reject(request.error)
    })
  }

  async delete(key: string): Promise<boolean> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['cache'], 'readwrite')
      const store = transaction.objectStore('cache')

      const request = store.delete(key)
      request.onsuccess = () => resolve(true)
      request.onerror = () => reject(request.error)
    })
  }

  async clear(): Promise<void> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['cache'], 'readwrite')
      const store = transaction.objectStore('cache')

      const request = store.clear()
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async has(key: string): Promise<boolean> {
    const data = await this.get(key)
    return data !== null
  }

  async keys(): Promise<string[]> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['cache'], 'readonly')
      const store = transaction.objectStore('cache')

      const request = store.getAllKeys()
      request.onsuccess = () => resolve(request.result as string[])
      request.onerror = () => reject(request.error)
    })
  }
}

/**
 * Multi-tier cache manager
 */
export class CacheManager {
  private memoryCache: MemoryCache
  private storageCache: StorageCache
  private indexedDBCache: IndexedDBCache
  private config: CacheConfig
  private stats: CacheStats

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      maxMemorySize: config.maxMemorySize || 50 * 1024 * 1024, // 50MB
      maxMemoryEntries: config.maxMemoryEntries || 1000,
      defaultTTL: config.defaultTTL || 60 * 60 * 1000, // 1 hour
      enablePersistence: config.enablePersistence !== false,
      enableIndexedDB: config.enableIndexedDB !== false,
      compressionEnabled: config.compressionEnabled || false,
      evictionPolicy: config.evictionPolicy || 'lru'
    }

    this.memoryCache = new MemoryCache(
      this.config.maxMemorySize,
      this.config.maxMemoryEntries
    )

    this.storageCache = new StorageCache()
    this.indexedDBCache = new IndexedDBCache()

    this.stats = {
      memoryHits: 0,
      memoryMisses: 0,
      storageHits: 0,
      storageMisses: 0,
      totalSize: 0,
      entryCount: 0,
      hitRate: 0
    }

    if (this.config.enableIndexedDB) {
      this.indexedDBCache.init().catch(error => {
        logger.warn('Failed to initialize IndexedDB cache:', error)
      })
    }
  }

  /**
   * Get data from cache (checks all tiers)
   */
  async get<T>(key: string): Promise<T | null> {
    // Try memory cache first
    const memoryData = this.memoryCache.get<T>(key)
    if (memoryData !== null) {
      this.stats.memoryHits++
      this.updateHitRate()
      return memoryData
    }
    this.stats.memoryMisses++

    // Try localStorage cache
    if (this.config.enablePersistence) {
      const storageData = this.storageCache.get<T>(key)
      if (storageData !== null) {
        this.stats.storageHits++
        // Promote to memory cache
        this.memoryCache.set(key, storageData, this.config.defaultTTL)
        this.updateHitRate()
        return storageData
      }
      this.stats.storageMisses++
    }

    // Try IndexedDB cache
    if (this.config.enableIndexedDB) {
      try {
        const indexedDBData = await this.indexedDBCache.get<T>(key)
        if (indexedDBData !== null) {
          this.stats.storageHits++
          // Promote to memory and localStorage
          this.memoryCache.set(key, indexedDBData, this.config.defaultTTL)
          if (this.config.enablePersistence) {
            this.storageCache.set(key, indexedDBData, this.config.defaultTTL)
          }
          this.updateHitRate()
          return indexedDBData
        }
      } catch (error) {
        logger.warn('IndexedDB cache read error:', error)
      }
    }

    this.updateHitRate()
    return null
  }

  /**
   * Set data in cache (stores in all applicable tiers)
   */
  async set<T>(key: string, data: T, ttl?: number): Promise<void> {
    const cacheTTL = ttl || this.config.defaultTTL

    // Store in memory cache
    this.memoryCache.set(key, data, cacheTTL)

    // Store in localStorage if enabled
    if (this.config.enablePersistence) {
      this.storageCache.set(key, data, cacheTTL)
    }

    // Store in IndexedDB if enabled and data is large
    if (this.config.enableIndexedDB) {
      try {
        const dataSize = JSON.stringify(data).length
        if (dataSize > 1024 * 1024) { // Store large data (>1MB) in IndexedDB
          await this.indexedDBCache.set(key, data, cacheTTL)
        }
      } catch (error) {
        logger.warn('IndexedDB cache write error:', error)
      }
    }

    this.updateStats()
  }

  /**
   * Delete data from all cache tiers
   */
  async delete(key: string): Promise<boolean> {
    let deleted = false

    deleted = this.memoryCache.delete(key) || deleted

    if (this.config.enablePersistence) {
      deleted = this.storageCache.delete(key) || deleted
    }

    if (this.config.enableIndexedDB) {
      try {
        deleted = (await this.indexedDBCache.delete(key)) || deleted
      } catch (error) {
        logger.warn('IndexedDB cache delete error:', error)
      }
    }

    this.updateStats()
    return deleted
  }

  /**
   * Clear all cache tiers
   */
  async clear(): Promise<void> {
    this.memoryCache.clear()

    if (this.config.enablePersistence) {
      this.storageCache.clear()
    }

    if (this.config.enableIndexedDB) {
      try {
        await this.indexedDBCache.clear()
      } catch (error) {
        logger.warn('IndexedDB cache clear error:', error)
      }
    }

    this.stats = {
      memoryHits: 0,
      memoryMisses: 0,
      storageHits: 0,
      storageMisses: 0,
      totalSize: 0,
      entryCount: 0,
      hitRate: 0
    }
  }

  /**
   * Check if key exists in any cache tier
   */
  async has(key: string): Promise<boolean> {
    if (this.memoryCache.has(key)) return true
    if (this.config.enablePersistence && this.storageCache.has(key)) return true
    if (this.config.enableIndexedDB) {
      try {
        return await this.indexedDBCache.has(key)
      } catch (error) {
        logger.warn('IndexedDB cache has error:', error)
      }
    }
    return false
  }

  /**
   * Get all keys from all cache tiers
   */
  async keys(): Promise<string[]> {
    const allKeys = new Set<string>()

    // Memory cache keys
    this.memoryCache.keys().forEach(key => allKeys.add(key))

    // Storage cache keys
    if (this.config.enablePersistence) {
      this.storageCache.keys().forEach(key => allKeys.add(key))
    }

    // IndexedDB cache keys
    if (this.config.enableIndexedDB) {
      try {
        const indexedDBKeys = await this.indexedDBCache.keys()
        indexedDBKeys.forEach(key => allKeys.add(key))
      } catch (error) {
        logger.warn('IndexedDB cache keys error:', error)
      }
    }

    return Array.from(allKeys)
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats }
  }

  /**
   * Get cache configuration
   */
  getConfig(): CacheConfig {
    return { ...this.config }
  }

  /**
   * Update cache configuration
   */
  updateConfig(newConfig: Partial<CacheConfig>): void {
    this.config = { ...this.config, ...newConfig }
  }

  /**
   * Clean up expired entries from all tiers
   */
  async cleanup(): Promise<void> {
    // Memory cache cleanup is handled automatically
    
    // Clean up localStorage
    if (this.config.enablePersistence) {
      const keys = this.storageCache.keys()
      for (const key of keys) {
        this.storageCache.get(key) // This will auto-delete expired entries
      }
    }

    // Clean up IndexedDB (would need a more complex implementation)
    if (this.config.enableIndexedDB) {
      try {
        const keys = await this.indexedDBCache.keys()
        for (const key of keys) {
          await this.indexedDBCache.get(key) // This will auto-delete expired entries
        }
      } catch (error) {
        logger.warn('IndexedDB cleanup error:', error)
      }
    }

    this.updateStats()
  }

  private updateStats(): void {
    const memoryStats = this.memoryCache.getStats()
    this.stats.totalSize = memoryStats.memoryUsage
    this.stats.entryCount = memoryStats.entries
  }

  private updateHitRate(): void {
    const totalRequests = this.stats.memoryHits + this.stats.memoryMisses + 
                         this.stats.storageHits + this.stats.storageMisses
    const totalHits = this.stats.memoryHits + this.stats.storageHits
    
    this.stats.hitRate = totalRequests > 0 ? totalHits / totalRequests : 0
  }
}

// Export utilities
export const cacheManager = new CacheManager()

export default {
  CacheManager,
  cacheManager
}
