// filepath: packages/web/src/__tests__/utils/cacheManager.test.ts

/**
 * HEYS EAP 3.0 - Cache Manager Unit Tests
 * 
 * Purpose: Test multi-tier cache management system
 * Features: Memory cache, storage cache, IndexedDB cache, TTL
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { CacheManager } from '../../utils/cacheManager'
import { mockCacheEntry, mockCacheStats, waitForAsync } from '../../test-utils/mockData'

describe('CacheManager', () => {
  let cacheManager: CacheManager
  let mockLocalStorage: Storage
  let mockIndexedDB: IDBFactory

  beforeEach(() => {
    // Mock localStorage
    mockLocalStorage = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      key: vi.fn(),
      length: 0
    }
    Object.defineProperty(global, 'localStorage', {
      value: mockLocalStorage,
      writable: true
    })

    cacheManager = new CacheManager({
      maxMemorySize: 1024 * 1024, // 1MB
      maxMemoryEntries: 100,
      defaultTTL: 60000, // 1 minute
      enablePersistence: true,
      enableIndexedDB: true
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Memory Cache', () => {
    it('should store and retrieve data from memory cache', async () => {
      const testData = { message: 'Hello World' }
      
      await cacheManager.set('test-key', testData)
      const result = await cacheManager.get('test-key')
      
      expect(result).toEqual(testData)
    })

    it('should return null for non-existent keys', async () => {
      const result = await cacheManager.get('non-existent-key')
      expect(result).toBeNull()
    })

    it('should respect TTL and expire entries', async () => {
      const testData = { message: 'Short lived' }
      
      await cacheManager.set('expire-key', testData, 100) // 100ms TTL
      
      // Should exist immediately
      let result = await cacheManager.get('expire-key')
      expect(result).toEqual(testData)
      
      // Wait for expiration
      await waitForAsync(150)
      
      // Should be expired now
      result = await cacheManager.get('expire-key')
      expect(result).toBeNull()
    })

    it('should delete entries', async () => {
      const testData = { message: 'To be deleted' }
      
      await cacheManager.set('delete-key', testData)
      expect(await cacheManager.get('delete-key')).toEqual(testData)
      
      const deleted = await cacheManager.delete('delete-key')
      expect(deleted).toBe(true)
      expect(await cacheManager.get('delete-key')).toBeNull()
    })

    it('should check if key exists', async () => {
      const testData = { message: 'Existence check' }
      
      expect(await cacheManager.has('exist-key')).toBe(false)
      
      await cacheManager.set('exist-key', testData)
      expect(await cacheManager.has('exist-key')).toBe(true)
    })
  })

  describe('Storage Cache Fallback', () => {
    it('should fallback to localStorage when memory cache misses', async () => {
      const testData = { message: 'From localStorage' }
      const serializedEntry = JSON.stringify({
        key: 'storage-key',
        data: testData,
        timestamp: Date.now(),
        ttl: 60000,
        size: 0,
        accessCount: 1,
        lastAccessed: Date.now()
      })

      // Mock localStorage to return our test data
      ;(mockLocalStorage.getItem as any).mockReturnValue(serializedEntry)

      const result = await cacheManager.get('storage-key')
      
      expect(result).toEqual(testData)
      expect(mockLocalStorage.getItem).toHaveBeenCalledWith('heys_cache_storage-key')
    })

    it('should promote storage cache hits to memory cache', async () => {
      const testData = { message: 'Promoted data' }
      const serializedEntry = JSON.stringify({
        key: 'promote-key',
        data: testData,
        timestamp: Date.now(),
        ttl: 60000,
        size: 0,
        accessCount: 1,
        lastAccessed: Date.now()
      })

      ;(mockLocalStorage.getItem as any).mockReturnValue(serializedEntry)

      // First get should read from localStorage
      const firstResult = await cacheManager.get('promote-key')
      expect(firstResult).toEqual(testData)

      // Reset localStorage mock to return null
      ;(mockLocalStorage.getItem as any).mockReturnValue(null)

      // Second get should read from memory cache (promoted)
      const secondResult = await cacheManager.get('promote-key')
      expect(secondResult).toEqual(testData)
    })

    it('should handle localStorage errors gracefully', async () => {
      ;(mockLocalStorage.getItem as any).mockImplementation(() => {
        throw new Error('localStorage error')
      })

      const result = await cacheManager.get('error-key')
      expect(result).toBeNull()
    })
  })

  describe('Cache Statistics', () => {
    it('should track cache hits and misses', async () => {
      const initialStats = cacheManager.getStats()
      
      // Miss
      await cacheManager.get('miss-key')
      
      // Hit
      await cacheManager.set('hit-key', { data: 'test' })
      await cacheManager.get('hit-key')
      
      const finalStats = cacheManager.getStats()
      
      expect(finalStats.memoryMisses).toBeGreaterThan(initialStats.memoryMisses)
      expect(finalStats.memoryHits).toBeGreaterThan(initialStats.memoryHits)
    })

    it('should calculate hit rate correctly', async () => {
      // Create a predictable cache scenario
      await cacheManager.set('key1', { data: 'test1' })
      await cacheManager.set('key2', { data: 'test2' })
      
      // 2 hits
      await cacheManager.get('key1')
      await cacheManager.get('key2')
      
      // 1 miss
      await cacheManager.get('key3')
      
      const stats = cacheManager.getStats()
      
      expect(stats.hitRate).toBeCloseTo(2 / 3, 2) // 2 hits out of 3 total requests
    })
  })

  describe('Cache Operations', () => {
    it('should clear all cache tiers', async () => {
      await cacheManager.set('clear-key1', { data: 'test1' })
      await cacheManager.set('clear-key2', { data: 'test2' })
      
      expect(await cacheManager.has('clear-key1')).toBe(true)
      expect(await cacheManager.has('clear-key2')).toBe(true)
      
      await cacheManager.clear()
      
      expect(await cacheManager.has('clear-key1')).toBe(false)
      expect(await cacheManager.has('clear-key2')).toBe(false)
      expect(mockLocalStorage.clear).toHaveBeenCalled()
    })

    it('should list all cache keys', async () => {
      await cacheManager.set('keys-test1', { data: 'test1' })
      await cacheManager.set('keys-test2', { data: 'test2' })
      
      const keys = await cacheManager.keys()
      
      expect(keys).toContain('keys-test1')
      expect(keys).toContain('keys-test2')
    })

    it('should cleanup expired entries', async () => {
      // Set an entry with short TTL
      await cacheManager.set('cleanup-key', { data: 'test' }, 50)
      
      expect(await cacheManager.has('cleanup-key')).toBe(true)
      
      // Wait for expiration
      await waitForAsync(100)
      
      // Cleanup should remove expired entries
      await cacheManager.cleanup()
      
      expect(await cacheManager.has('cleanup-key')).toBe(false)
    })
  })

  describe('Configuration', () => {
    it('should get current configuration', () => {
      const config = cacheManager.getConfig()
      
      expect(config).toHaveProperty('maxMemorySize')
      expect(config).toHaveProperty('maxMemoryEntries')
      expect(config).toHaveProperty('defaultTTL')
      expect(config).toHaveProperty('enablePersistence')
      expect(config).toHaveProperty('enableIndexedDB')
    })

    it('should update configuration', () => {
      const newConfig = {
        maxMemorySize: 2048 * 1024, // 2MB
        defaultTTL: 120000 // 2 minutes
      }
      
      cacheManager.updateConfig(newConfig)
      
      const updatedConfig = cacheManager.getConfig()
      expect(updatedConfig.maxMemorySize).toBe(newConfig.maxMemorySize)
      expect(updatedConfig.defaultTTL).toBe(newConfig.defaultTTL)
    })
  })

  describe('Memory Cache LRU Eviction', () => {
    it('should evict least recently used items when memory limit reached', async () => {
      // Create cache with small limits
      const smallCache = new CacheManager({
        maxMemorySize: 1024, // 1KB
        maxMemoryEntries: 3,
        enablePersistence: false,
        enableIndexedDB: false
      })

      // Fill cache to capacity
      await smallCache.set('key1', { data: 'x'.repeat(200) }) // ~400 bytes
      await smallCache.set('key2', { data: 'x'.repeat(200) }) // ~400 bytes
      await smallCache.set('key3', { data: 'x'.repeat(200) }) // ~400 bytes

      // Access key1 to make it more recently used
      await smallCache.get('key1')

      // Add another item - should evict key2 (least recently used)
      await smallCache.set('key4', { data: 'x'.repeat(200) })

      expect(await smallCache.has('key1')).toBe(true) // Recently accessed
      expect(await smallCache.has('key2')).toBe(false) // Should be evicted
      expect(await smallCache.has('key3')).toBe(true) // Still fits
      expect(await smallCache.has('key4')).toBe(true) // Newly added
    })

    it('should evict expired entries before LRU eviction', async () => {
      const smallCache = new CacheManager({
        maxMemorySize: 1024,
        maxMemoryEntries: 3,
        enablePersistence: false,
        enableIndexedDB: false
      })

      // Add entries with different TTLs
      await smallCache.set('expired', { data: 'test' }, 10) // Very short TTL
      await smallCache.set('valid1', { data: 'test' }, 60000)
      await smallCache.set('valid2', { data: 'test' }, 60000)

      // Wait for expiration
      await waitForAsync(50)

      // Add new entry - should evict expired entry first
      await smallCache.set('new', { data: 'test' })

      expect(await smallCache.has('expired')).toBe(false)
      expect(await smallCache.has('valid1')).toBe(true)
      expect(await smallCache.has('valid2')).toBe(true)
      expect(await smallCache.has('new')).toBe(true)
    })
  })

  describe('Error Handling', () => {
    it('should handle JSON parse errors in storage cache', async () => {
      ;(mockLocalStorage.getItem as any).mockReturnValue('invalid json')

      const result = await cacheManager.get('invalid-json-key')
      expect(result).toBeNull()
    })

    it('should handle storage quota exceeded errors', async () => {
      ;(mockLocalStorage.setItem as any).mockImplementation(() => {
        throw new DOMException('QuotaExceededError')
      })

      // Should not throw, just log warning
      await expect(cacheManager.set('quota-key', { data: 'test' })).resolves.not.toThrow()
    })
  })

  describe('Data Size Estimation', () => {
    it('should estimate data size correctly', async () => {
      const smallData = { message: 'hi' }
      const largeData = { message: 'x'.repeat(1000) }

      await cacheManager.set('small', smallData)
      await cacheManager.set('large', largeData)

      const stats = cacheManager.getStats()
      expect(stats.totalSize).toBeGreaterThan(0)
    })
  })
})
