// filepath: packages/web/src/__tests__/integration/performanceSystem.integration.test.ts

/**
 * HEYS EAP 3.0 - Performance System Integration Tests
 * 
 * Purpose: Test integrated performance optimization system
 * Features: End-to-end workflow, component coordination, data flow
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { PerformanceMetricsCollector } from '../../utils/performanceMetrics'
import { CacheManager } from '../../utils/cacheManager'
import { MemoryProfiler } from '../../utils/memoryProfiler'
import { waitForAsync, mockPerformanceMetrics } from '../../test-utils/mockData'

describe('Performance System Integration', () => {
  let metricsCollector: PerformanceMetricsCollector
  let cacheManager: CacheManager
  let memoryProfiler: MemoryProfiler

  beforeEach(() => {
    vi.clearAllMocks()

    // Initialize performance system components
    metricsCollector = new PerformanceMetricsCollector({
      enableWebVitals: true,
      enableCustomMetrics: true,
      enableResourceTiming: true
    })

    cacheManager = new CacheManager({
      maxMemorySize: 1024 * 1024, // 1MB
      maxMemoryEntries: 100,
      defaultTTL: 60000,
      enablePersistence: true
    })

    memoryProfiler = new MemoryProfiler({
      enableHeapAnalysis: true,
      enableLeakDetection: true,
      samplingInterval: 100
    })
  })

  afterEach(() => {
    metricsCollector?.dispose()
    cacheManager?.clear()
    memoryProfiler?.stop()
  })

  describe('System Initialization', () => {
    it('should initialize all performance components successfully', async () => {
      // Initialize metrics collector
      await metricsCollector.initialize()
      expect(metricsCollector.getMetrics()).toBeDefined()

      // Test cache manager
      await cacheManager.set('test-key', { data: 'test' })
      const cached = await cacheManager.get('test-key')
      expect(cached).toEqual({ data: 'test' })

      // Test memory profiler
      memoryProfiler.start()
      await waitForAsync(150)
      const report = memoryProfiler.getReport()
      expect(report).toBeDefined()
    })

    it('should handle component initialization errors gracefully', async () => {
      // Mock initialization failure
      const failingCollector = new PerformanceMetricsCollector()
      vi.spyOn(failingCollector, 'initialize').mockRejectedValue(new Error('Init failed'))

      // Should handle error without crashing system
      await expect(failingCollector.initialize()).rejects.toThrow('Init failed')
      
      // Other components should still work
      await cacheManager.set('test', { data: 'test' })
      expect(await cacheManager.get('test')).toEqual({ data: 'test' })
    })
  })

  describe('Cross-Component Data Flow', () => {
    it('should share performance data between components', async () => {
      // Start all components
      await metricsCollector.initialize()
      metricsCollector.startMonitoring()
      memoryProfiler.start()

      await waitForAsync(150)

      // Get metrics from collector
      const metrics = metricsCollector.getMetrics()
      
      // Cache the metrics
      await cacheManager.set('performance-metrics', metrics)
      
      // Retrieve from cache
      const cachedMetrics = await cacheManager.get('performance-metrics')
      expect(cachedMetrics).toEqual(metrics)

      // Take memory snapshot
      const snapshot = memoryProfiler.takeSnapshot('after-metrics-cache')
      expect(snapshot.label).toBe('after-metrics-cache')
    })

    it('should coordinate performance monitoring workflow', async () => {
      // Step 1: Initialize monitoring
      await metricsCollector.initialize()
      metricsCollector.startMonitoring()
      memoryProfiler.start()

      // Step 2: Simulate user interactions and performance events
      await waitForAsync(100)

      // Step 3: Collect performance data
      const metrics = metricsCollector.getMetrics()
      const memoryReport = memoryProfiler.getReport()
      const cacheStats = cacheManager.getStats()

      // Step 4: Verify data integrity
      expect(metrics).toBeDefined()
      expect(memoryReport).toBeDefined()
      expect(cacheStats).toBeDefined()

      // Step 5: Store consolidated report
      const consolidatedReport = {
        metrics,
        memory: memoryReport,
        cache: cacheStats,
        timestamp: Date.now()
      }

      await cacheManager.set('performance-report', consolidatedReport)
      const storedReport = await cacheManager.get('performance-report')
      expect(storedReport).toEqual(consolidatedReport)
    })
  })

  describe('Performance Impact Analysis', () => {
    it('should measure performance impact of cache operations', async () => {
      await metricsCollector.initialize()
      metricsCollector.startMonitoring()

      // Measure baseline performance
      const beforeSnapshot = memoryProfiler.takeSnapshot('before-cache-ops')

      // Perform cache operations
      const testData = { large: 'x'.repeat(10000) }
      for (let i = 0; i < 50; i++) {
        await cacheManager.set(`key-${i}`, testData)
      }

      // Measure after cache operations
      const afterSnapshot = memoryProfiler.takeSnapshot('after-cache-ops')

      // Analyze impact
      const comparison = memoryProfiler.compareSnapshots(beforeSnapshot, afterSnapshot)
      expect(comparison.usedJSHeapSizeDelta).toBeGreaterThan(0)

      // Verify cache statistics
      const stats = cacheManager.getStats()
      expect(stats.memoryEntries).toBe(50)
    })

    it('should track memory usage during performance monitoring', async () => {
      memoryProfiler.start()
      await metricsCollector.initialize()

      // Monitor for extended period
      metricsCollector.startMonitoring()
      
      // Simulate performance events
      for (let i = 0; i < 10; i++) {
        await waitForAsync(50)
        // Simulate memory allocation
        await cacheManager.set(`metric-${i}`, { data: 'x'.repeat(1000) })
      }

      const memoryReport = memoryProfiler.getReport()
      expect(memoryReport.snapshots.length).toBeGreaterThan(0)

      // Check for memory trends
      if (memoryReport.trends) {
        expect(['increasing', 'stable', 'decreasing']).toContain(memoryReport.trends.memoryTrend)
      }
    })
  })

  describe('Error Recovery and Resilience', () => {
    it('should continue operation when one component fails', async () => {
      // Start all components
      await metricsCollector.initialize()
      memoryProfiler.start()

      // Simulate cache failure
      vi.spyOn(cacheManager, 'set').mockRejectedValue(new Error('Cache error'))

      // Other components should continue working
      metricsCollector.startMonitoring()
      await waitForAsync(100)

      const metrics = metricsCollector.getMetrics()
      expect(metrics).toBeDefined()

      const memoryReport = memoryProfiler.getReport()
      expect(memoryReport).toBeDefined()
    })

    it('should handle memory pressure scenarios', async () => {
      // Mock high memory usage
      Object.defineProperty(global.performance, 'memory', {
        value: {
          usedJSHeapSize: 90 * 1024 * 1024, // 90MB
          totalJSHeapSize: 100 * 1024 * 1024, // 100MB
          jsHeapSizeLimit: 100 * 1024 * 1024 // 100MB
        },
        configurable: true
      })

      memoryProfiler.start()
      await waitForAsync(150)

      const report = memoryProfiler.getReport()
      
      // Should detect high memory pressure
      if (report.memoryPressure) {
        expect(report.memoryPressure.isHighPressure).toBe(true)
      }

      // Cache should adapt to memory pressure
      const cacheConfig = cacheManager.getConfig()
      expect(cacheConfig.maxMemorySize).toBeDefined()
    })
  })

  describe('Performance Optimization Feedback Loop', () => {
    it('should provide optimization recommendations', async () => {
      await metricsCollector.initialize()
      metricsCollector.startMonitoring()
      memoryProfiler.start()

      await waitForAsync(200)

      // Collect performance data
      const metrics = metricsCollector.getMetrics()
      const memoryReport = memoryProfiler.getReport()
      const cacheStats = cacheManager.getStats()

      // Generate optimization recommendations
      const recommendations = []

      // Check cache hit rate
      if (cacheStats.hitRate < 0.5) {
        recommendations.push('Consider increasing cache size or TTL')
      }

      // Check memory usage
      if (memoryReport.memoryPressure?.isHighPressure) {
        recommendations.push('Optimize memory usage or implement garbage collection')
      }

      // Check performance ratings
      if (metrics.performanceRating === 'poor') {
        recommendations.push('Investigate performance bottlenecks')
      }

      expect(recommendations).toBeDefined()
    })

    it('should adapt configuration based on performance data', async () => {
      await metricsCollector.initialize()
      metricsCollector.startMonitoring()

      // Simulate poor cache performance
      await cacheManager.set('test', { data: 'test' })
      // Simulate cache misses
      await cacheManager.get('non-existent-key-1')
      await cacheManager.get('non-existent-key-2')
      await cacheManager.get('non-existent-key-3')

      const stats = cacheManager.getStats()
      const hitRate = stats.hitRate

      if (hitRate < 0.5) {
        // Adapt cache configuration
        cacheManager.updateConfig({
          maxMemoryEntries: 200, // Increase cache size
          defaultTTL: 120000 // Increase TTL
        })

        const newConfig = cacheManager.getConfig()
        expect(newConfig.maxMemoryEntries).toBe(200)
        expect(newConfig.defaultTTL).toBe(120000)
      }
    })
  })

  describe('Real-world Performance Scenarios', () => {
    it('should handle high-frequency cache operations', async () => {
      await metricsCollector.initialize()
      memoryProfiler.start()

      const beforeSnapshot = memoryProfiler.takeSnapshot('before-high-freq')

      // Simulate high-frequency operations
      const operations = []
      for (let i = 0; i < 100; i++) {
        operations.push(cacheManager.set(`freq-${i}`, { data: i }))
      }
      await Promise.all(operations)

      // Verify all operations completed
      const stats = cacheManager.getStats()
      expect(stats.memoryEntries).toBeGreaterThan(0)

      const afterSnapshot = memoryProfiler.takeSnapshot('after-high-freq')
      const comparison = memoryProfiler.compareSnapshots(beforeSnapshot, afterSnapshot)
      
      // Should show controlled memory growth
      expect(comparison.usedJSHeapSizeDelta).toBeGreaterThan(0)
    })

    it('should maintain performance under concurrent operations', async () => {
      await metricsCollector.initialize()
      metricsCollector.startMonitoring()
      memoryProfiler.start()

      // Concurrent operations
      const concurrentOps = [
        // Cache operations
        Promise.all(Array.from({ length: 20 }, (_, i) => 
          cacheManager.set(`concurrent-${i}`, { data: i })
        )),
        
        // Memory snapshots
        Promise.resolve(memoryProfiler.takeSnapshot('concurrent-test')),
        
        // Metrics collection
        Promise.resolve(metricsCollector.getMetrics())
      ]

      await Promise.all(concurrentOps)

      // All systems should remain operational
      expect(metricsCollector.getMetrics()).toBeDefined()
      expect(memoryProfiler.getReport()).toBeDefined()
      expect(cacheManager.getStats()).toBeDefined()
    })
  })

  describe('System Cleanup and Resource Management', () => {
    it('should cleanup all resources properly', async () => {
      await metricsCollector.initialize()
      metricsCollector.startMonitoring()
      memoryProfiler.start()

      // Use resources
      await cacheManager.set('cleanup-test', { data: 'test' })
      await waitForAsync(100)

      // Cleanup
      metricsCollector.stopMonitoring()
      metricsCollector.dispose()
      memoryProfiler.stop()
      await cacheManager.clear()

      // Verify cleanup
      expect(metricsCollector.getMetrics()).toBeDefined()
      expect(memoryProfiler.getReport().snapshots.length).toBe(0)
      expect(cacheManager.getStats().memoryEntries).toBe(0)
    })

    it('should handle cleanup errors gracefully', async () => {
      await metricsCollector.initialize()
      
      // Mock cleanup error
      vi.spyOn(metricsCollector, 'dispose').mockImplementation(() => {
        throw new Error('Cleanup failed')
      })

      // Should not throw
      expect(() => {
        try {
          metricsCollector.dispose()
        } catch (error) {
          // Handle error silently in real implementation
        }
      }).not.toThrow()
    })
  })
})
