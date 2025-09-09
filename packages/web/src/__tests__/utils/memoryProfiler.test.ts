// filepath: packages/web/src/__tests__/utils/memoryProfiler.test.ts

/**
 * HEYS EAP 3.0 - Memory Profiler Unit Tests
 * 
 * Purpose: Test memory profiling and leak detection system
 * Features: Memory usage tracking, leak detection, heap analysis
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { waitForAsync } from '../../test-utils/mockData'
import { MemoryProfiler } from '../../utils/memoryProfiler'

describe('MemoryProfiler', () => {
  let memoryProfiler: MemoryProfiler
  let mockPerformance: Performance

  beforeEach(() => {
    // Mock performance.memory
    mockPerformance = {
      memory: {
        usedJSHeapSize: 10 * 1024 * 1024, // 10MB
        totalJSHeapSize: 20 * 1024 * 1024, // 20MB
        jsHeapSizeLimit: 100 * 1024 * 1024 // 100MB
      },
      now: vi.fn(() => Date.now()),
      mark: vi.fn(),
      measure: vi.fn(),
      clearMarks: vi.fn(),
      clearMeasures: vi.fn(),
      getEntries: vi.fn(),
      getEntriesByName: vi.fn(),
      getEntriesByType: vi.fn()
    } as any

    Object.defineProperty(global, 'performance', {
      value: mockPerformance,
      writable: true
    })

    memoryProfiler = new MemoryProfiler({
      enableHeapAnalysis: true,
      enableLeakDetection: true,
      samplingInterval: 100,
      maxSamples: 1000,
      leakThreshold: 0.8,
      heapDumpInterval: 5000
    })
  })

  afterEach(() => {
    memoryProfiler.stop()
    vi.clearAllMocks()
  })

  describe('Memory Sampling', () => {
    it('should collect memory samples', async () => {
      memoryProfiler.start()
      
      // Wait for a few samples
      await waitForAsync(250)
      
      const report = memoryProfiler.getReport()
      
      expect(report.samples.length).toBeGreaterThan(0)
      expect(report.currentUsage.usedJSHeapSize).toBe(10 * 1024 * 1024)
      expect(report.currentUsage.totalJSHeapSize).toBe(20 * 1024 * 1024)
    })

    it('should detect memory usage trends', async () => {
      memoryProfiler.start()
      
      // Simulate increasing memory usage
      let currentMemory = 10 * 1024 * 1024
      mockPerformance.memory.usedJSHeapSize = currentMemory
      
      await waitForAsync(150)
      
      // Increase memory
      currentMemory += 5 * 1024 * 1024
      mockPerformance.memory.usedJSHeapSize = currentMemory
      
      await waitForAsync(150)
      
      const report = memoryProfiler.getReport()
      const trend = report.trends.memoryTrend
      
      expect(trend).toBe('increasing')
    })

    it('should limit sample count to maxSamples', async () => {
      const profiler = new MemoryProfiler({
        samplingInterval: 10,
        maxSamples: 5
      })
      
      profiler.start()
      
      // Wait for more samples than the limit
      await waitForAsync(100)
      
      const report = profiler.getReport()
      
      expect(report.samples.length).toBeLessThanOrEqual(5)
      
      profiler.stop()
    })
  })

  describe('Leak Detection', () => {
    it('should detect potential memory leaks', async () => {
      memoryProfiler.start()
      
      // Simulate consistent memory growth
      let currentMemory = 10 * 1024 * 1024
      const memoryIncrement = 2 * 1024 * 1024 // 2MB increase each time
      
      for (let i = 0; i < 5; i++) {
        currentMemory += memoryIncrement
        mockPerformance.memory.usedJSHeapSize = currentMemory
        await waitForAsync(120)
      }
      
      const report = memoryProfiler.getReport()
      
      expect(report.leakDetection.hasPotentialLeak).toBe(true)
      expect(report.leakDetection.growthRate).toBeGreaterThan(0)
    })

    it('should not flag normal memory fluctuations as leaks', async () => {
      memoryProfiler.start()
      
      // Simulate normal memory usage with fluctuations
      const baseMemory = 10 * 1024 * 1024
      const memories = [
        baseMemory,
        baseMemory + 1024 * 1024,
        baseMemory - 512 * 1024,
        baseMemory + 2 * 1024 * 1024,
        baseMemory
      ]
      
      for (const memory of memories) {
        mockPerformance.memory.usedJSHeapSize = memory
        await waitForAsync(120)
      }
      
      const report = memoryProfiler.getReport()
      
      expect(report.leakDetection.hasPotentialLeak).toBe(false)
    })

    it('should detect memory pressure', async () => {
      // Set high memory usage relative to limit
      mockPerformance.memory.usedJSHeapSize = 85 * 1024 * 1024 // 85MB
      mockPerformance.memory.jsHeapSizeLimit = 100 * 1024 * 1024 // 100MB
      
      memoryProfiler.start()
      
      await waitForAsync(150)
      
      const report = memoryProfiler.getReport()
      
      expect(report.memoryPressure.isHighPressure).toBe(true)
      expect(report.memoryPressure.pressureLevel).toBeGreaterThan(0.8)
    })
  })

  describe('Heap Analysis', () => {
    it('should provide heap utilization metrics', async () => {
      memoryProfiler.start()
      
      await waitForAsync(150)
      
      const report = memoryProfiler.getReport()
      
      expect(report.heapUtilization.utilizationRatio).toBeDefined()
      expect(report.heapUtilization.fragmentationRatio).toBeDefined()
      expect(report.heapUtilization.utilizationRatio).toBe(0.5) // 10MB used / 20MB total
    })

    it('should track heap growth over time', async () => {
      memoryProfiler.start()
      
      // Initial measurement
      await waitForAsync(120)
      
      // Increase heap size
      mockPerformance.memory.totalJSHeapSize = 30 * 1024 * 1024 // 30MB
      
      await waitForAsync(120)
      
      const report = memoryProfiler.getReport()
      
      expect(report.trends.heapGrowthRate).toBeGreaterThan(0)
    })
  })

  describe('Manual Memory Snapshots', () => {
    it('should take manual memory snapshots', () => {
      const snapshot = memoryProfiler.takeSnapshot('manual-test')
      
      expect(snapshot.label).toBe('manual-test')
      expect(snapshot.timestamp).toBeDefined()
      expect(snapshot.memoryUsage).toEqual({
        usedJSHeapSize: 10 * 1024 * 1024,
        totalJSHeapSize: 20 * 1024 * 1024,
        jsHeapSizeLimit: 100 * 1024 * 1024
      })
    })

    it('should compare snapshots', () => {
      const snapshot1 = memoryProfiler.takeSnapshot('before')
      
      // Change memory usage
      mockPerformance.memory.usedJSHeapSize = 15 * 1024 * 1024
      
      const snapshot2 = memoryProfiler.takeSnapshot('after')
      
      const comparison = memoryProfiler.compareSnapshots(snapshot1, snapshot2)
      
      expect(comparison.usedJSHeapSizeDelta).toBe(5 * 1024 * 1024)
      expect(comparison.totalJSHeapSizeDelta).toBe(0)
    })
  })

  describe('Configuration', () => {
    it('should update configuration', () => {
      const newConfig = {
        samplingInterval: 200,
        maxSamples: 500,
        leakThreshold: 0.9
      }
      
      memoryProfiler.updateConfig(newConfig)
      const config = memoryProfiler.getConfig()
      
      expect(config.samplingInterval).toBe(200)
      expect(config.maxSamples).toBe(500)
      expect(config.leakThreshold).toBe(0.9)
    })

    it('should get current configuration', () => {
      const config = memoryProfiler.getConfig()
      
      expect(config).toHaveProperty('enableHeapAnalysis')
      expect(config).toHaveProperty('enableLeakDetection')
      expect(config).toHaveProperty('samplingInterval')
      expect(config).toHaveProperty('maxSamples')
    })
  })

  describe('Error Handling', () => {
    it('should handle missing performance.memory gracefully', () => {
      // Remove performance.memory
      delete (global.performance as any).memory
      
      const profiler = new MemoryProfiler()
      profiler.start()
      
      const report = profiler.getReport()
      
      expect(report.samples.length).toBe(0)
      expect(report.isSupported).toBe(false)
      
      profiler.stop()
    })

    it('should handle performance API errors', () => {
      mockPerformance.now = vi.fn(() => {
        throw new Error('Performance API error')
      })
      
      const profiler = new MemoryProfiler()
      
      // Should not throw
      expect(() => profiler.start()).not.toThrow()
      
      profiler.stop()
    })
  })

  describe('Performance Impact', () => {
    it('should not sample when stopped', async () => {
      memoryProfiler.start()
      memoryProfiler.stop()
      
      const initialSampleCount = memoryProfiler.getReport().samples.length
      
      await waitForAsync(200)
      
      const finalSampleCount = memoryProfiler.getReport().samples.length
      
      expect(finalSampleCount).toBe(initialSampleCount)
    })

    it('should clear samples on reset', () => {
      memoryProfiler.start()
      
      // Force a sample
      memoryProfiler.takeSnapshot('test')
      
      expect(memoryProfiler.getReport().samples.length).toBeGreaterThan(0)
      
      memoryProfiler.reset()
      
      expect(memoryProfiler.getReport().samples.length).toBe(0)
    })
  })

  describe('Memory Statistics', () => {
    it('should calculate memory statistics correctly', async () => {
      memoryProfiler.start()
      
      // Simulate various memory levels
      const memoryLevels = [10, 12, 8, 15, 11] // MB
      
      for (const level of memoryLevels) {
        mockPerformance.memory.usedJSHeapSize = level * 1024 * 1024
        await waitForAsync(120)
      }
      
      const report = memoryProfiler.getReport()
      
      expect(report.statistics.averageUsage).toBeDefined()
      expect(report.statistics.peakUsage).toBe(15 * 1024 * 1024)
      expect(report.statistics.minUsage).toBe(8 * 1024 * 1024)
    })

    it('should track garbage collection impact', async () => {
      memoryProfiler.start()
      
      // Simulate GC cycle (memory drops significantly)
      mockPerformance.memory.usedJSHeapSize = 20 * 1024 * 1024
      await waitForAsync(120)
      
      mockPerformance.memory.usedJSHeapSize = 5 * 1024 * 1024 // GC occurred
      await waitForAsync(120)
      
      mockPerformance.memory.usedJSHeapSize = 8 * 1024 * 1024
      await waitForAsync(120)
      
      const report = memoryProfiler.getReport()
      
      expect(report.gcEvents.length).toBeGreaterThan(0)
      expect(report.gcEvents[0].memoryReclaimed).toBeGreaterThan(0)
    })
  })
})
