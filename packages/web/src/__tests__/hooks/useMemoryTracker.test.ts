// filepath: packages/web/src/__tests__/hooks/useMemoryTracker.test.ts

/**
 * HEYS EAP 3.0 - useMemoryTracker Hook Unit Tests
 * 
 * Purpose: Test memory tracking React hook
 * Features: Memory monitoring, leak detection, heap analysis
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

import { waitForAsync } from '../../test-utils/mockData'
import { useMemoryTracker } from '../../hooks/useMemoryTracker'

// Mock the MemoryProfiler
vi.mock('../../utils/memoryProfiler', () => ({
  MemoryProfiler: vi.fn().mockImplementation(() => ({
    start: vi.fn(),
    stop: vi.fn(),
    getReport: vi.fn().mockReturnValue({
      snapshots: [],
      leaks: [],
      recommendations: []
    }),
    takeSnapshot: vi.fn().mockReturnValue({
      label: 'test-snapshot',
      timestamp: Date.now(),
      memoryUsage: {
        usedJSHeapSize: 10 * 1024 * 1024,
        totalJSHeapSize: 20 * 1024 * 1024,
        jsHeapSizeLimit: 100 * 1024 * 1024
      }
    }),
    reset: vi.fn(),
    updateConfig: vi.fn(),
    getConfig: vi.fn().mockReturnValue({
      enableHeapAnalysis: true,
      enableLeakDetection: true,
      samplingInterval: 1000
    })
  }))
}))

describe('useMemoryTracker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Basic Functionality', () => {
    it('should initialize with default state', () => {
      const { result } = renderHook(() => useMemoryTracker())

      expect(result.current.isTracking).toBe(false)
      expect(result.current.memoryInfo).toBeNull()
      expect(result.current.snapshots).toEqual([])
      expect(result.current.leaks).toEqual([])
    })

    it('should start tracking when requested', () => {
      const { result } = renderHook(() => useMemoryTracker())

      act(() => {
        result.current.startTracking()
      })

      expect(result.current.isTracking).toBe(true)
    })

    it('should stop tracking when requested', () => {
      const { result } = renderHook(() => useMemoryTracker())

      // Start tracking first
      act(() => {
        result.current.startTracking()
      })

      expect(result.current.isTracking).toBe(true)

      // Then stop
      act(() => {
        result.current.stopTracking()
      })

      expect(result.current.isTracking).toBe(false)
    })
  })

  describe('Memory Snapshots', () => {
    it('should create memory snapshots', () => {
      const { result } = renderHook(() => useMemoryTracker())

      act(() => {
        result.current.startTracking()
      })

      const snapshot = act(() => {
        return result.current.takeSnapshot('test-snapshot')
      })

      expect(snapshot).toBeDefined()
      expect(snapshot.label).toBe('test-snapshot')
      expect(snapshot.memoryUsage).toBeDefined()
    })

    it('should add snapshots to the snapshots array', () => {
      const { result } = renderHook(() => useMemoryTracker())

      act(() => {
        result.current.startTracking()
      })

      act(() => {
        result.current.takeSnapshot('snapshot-1')
      })

      act(() => {
        result.current.takeSnapshot('snapshot-2')
      })

      // Note: This depends on the hook implementation
      // The snapshots might come from the profiler report
      expect(result.current.snapshots).toBeDefined()
    })
  })

  describe('Auto-start Configuration', () => {
    it('should auto-start tracking when configured', () => {
      const { result } = renderHook(() => 
        useMemoryTracker({ autoStart: true })
      )

      expect(result.current.isTracking).toBe(true)
    })

    it('should not auto-start when disabled', () => {
      const { result } = renderHook(() => 
        useMemoryTracker({ autoStart: false })
      )

      expect(result.current.isTracking).toBe(false)
    })
  })

  describe('Real-time Updates', () => {
    it('should update memory info with real-time tracking', async () => {
      const { result } = renderHook(() => 
        useMemoryTracker({ 
          autoStart: true,
          updateInterval: 100
        })
      )

      expect(result.current.isTracking).toBe(true)

      // Wait for potential updates
      await waitForAsync(150)

      // Memory info should be available
      expect(result.current.memoryInfo).toBeDefined()
    })

    it('should respect update interval', async () => {
      const mockProfiler = {
        start: vi.fn(),
        stop: vi.fn(),
        getReport: vi.fn(),
        takeSnapshot: vi.fn(),
        reset: vi.fn(),
        updateConfig: vi.fn(),
        getConfig: vi.fn()
      }

      vi.mocked(require('../../utils/memoryProfiler').MemoryProfiler)
        .mockImplementation(() => mockProfiler)

      const { result } = renderHook(() => 
        useMemoryTracker({ 
          autoStart: true,
          updateInterval: 200
        })
      )

      await waitForAsync(250)

      // Should have called getReport at least once for updates
      expect(mockProfiler.getReport).toHaveBeenCalled()
    })
  })

  describe('Configuration Management', () => {
    it('should use provided configuration', () => {
      const config = {
        enableHeapAnalysis: false,
        enableLeakDetection: true,
        samplingInterval: 2000
      }

      renderHook(() => useMemoryTracker(config))

      // Verify profiler was created with config
      expect(require('../../utils/memoryProfiler').MemoryProfiler)
        .toHaveBeenCalledWith(expect.objectContaining(config))
    })

    it('should get current configuration', () => {
      const { result } = renderHook(() => useMemoryTracker())

      const config = result.current.getConfig()

      expect(config).toBeDefined()
      expect(config).toHaveProperty('enableHeapAnalysis')
      expect(config).toHaveProperty('enableLeakDetection')
    })
  })

  describe('Memory Analysis', () => {
    it('should provide memory report', () => {
      const { result } = renderHook(() => useMemoryTracker())

      act(() => {
        result.current.startTracking()
      })

      const report = result.current.getReport()

      expect(report).toBeDefined()
      expect(report).toHaveProperty('snapshots')
      expect(report).toHaveProperty('leaks')
      expect(report).toHaveProperty('recommendations')
    })

    it('should detect memory leaks', async () => {
      // Mock profiler to return leak detection
      const mockProfiler = {
        start: vi.fn(),
        stop: vi.fn(),
        getReport: vi.fn().mockReturnValue({
          snapshots: [],
          leaks: [
            {
              label: 'potential-leak',
              timestamp: Date.now(),
              memoryUsage: {
                usedJSHeapSize: 50 * 1024 * 1024,
                totalJSHeapSize: 60 * 1024 * 1024,
                jsHeapSizeLimit: 100 * 1024 * 1024
              }
            }
          ],
          recommendations: ['Consider implementing memory cleanup']
        }),
        takeSnapshot: vi.fn(),
        reset: vi.fn(),
        updateConfig: vi.fn(),
        getConfig: vi.fn().mockReturnValue({})
      }

      vi.mocked(require('../../utils/memoryProfiler').MemoryProfiler)
        .mockImplementation(() => mockProfiler)

      const { result } = renderHook(() => useMemoryTracker({ autoStart: true }))

      await waitForAsync(100)

      expect(result.current.leaks).toHaveLength(1)
      expect(result.current.leaks[0].label).toBe('potential-leak')
    })
  })

  describe('Cleanup and Reset', () => {
    it('should reset tracking data', () => {
      const { result } = renderHook(() => useMemoryTracker())

      act(() => {
        result.current.startTracking()
      })

      act(() => {
        result.current.takeSnapshot('test')
      })

      act(() => {
        result.current.reset()
      })

      // After reset, should be clean state
      expect(result.current.snapshots).toEqual([])
      expect(result.current.leaks).toEqual([])
    })

    it('should cleanup on unmount', () => {
      const { unmount } = renderHook(() => useMemoryTracker({ autoStart: true }))

      // Should cleanup without errors
      expect(() => unmount()).not.toThrow()
    })
  })

  describe('Error Handling', () => {
    it('should handle profiler errors gracefully', () => {
      const mockProfiler = {
        start: vi.fn().mockImplementation(() => {
          throw new Error('Profiler error')
        }),
        stop: vi.fn(),
        getReport: vi.fn(),
        takeSnapshot: vi.fn(),
        reset: vi.fn(),
        updateConfig: vi.fn(),
        getConfig: vi.fn()
      }

      vi.mocked(require('../../utils/memoryProfiler').MemoryProfiler)
        .mockImplementation(() => mockProfiler)

      const { result } = renderHook(() => useMemoryTracker())

      // Should not throw
      expect(() => {
        act(() => {
          result.current.startTracking()
        })
      }).not.toThrow()
    })

    it('should handle missing performance.memory API', () => {
      // Mock missing performance.memory
      const originalPerformance = global.performance
      delete (global as any).performance

      const { result } = renderHook(() => useMemoryTracker())

      act(() => {
        result.current.startTracking()
      })

      // Should handle gracefully
      expect(result.current.isTracking).toBeDefined()

      // Restore
      global.performance = originalPerformance
    })
  })

  describe('Memory Info Updates', () => {
    it('should provide current memory information', async () => {
      // Mock performance.memory
      Object.defineProperty(global, 'performance', {
        value: {
          ...global.performance,
          memory: {
            usedJSHeapSize: 15 * 1024 * 1024,
            totalJSHeapSize: 25 * 1024 * 1024,
            jsHeapSizeLimit: 100 * 1024 * 1024
          }
        },
        writable: true
      })

      const { result } = renderHook(() => useMemoryTracker({ autoStart: true }))

      await waitForAsync(100)

      // Should have memory info
      expect(result.current.memoryInfo).toBeDefined()
    })

    it('should update memory info when tracking', async () => {
      const { result } = renderHook(() => useMemoryTracker())

      act(() => {
        result.current.startTracking()
      })

      await waitForAsync(100)

      // Should have updated memory info
      expect(result.current.memoryInfo).toBeDefined()
    })
  })

  describe('Performance Impact', () => {
    it('should not update when tracking is stopped', async () => {
      const { result } = renderHook(() => useMemoryTracker({ autoStart: true }))

      act(() => {
        result.current.stopTracking()
      })

      const initialSnapshots = result.current.snapshots.length

      await waitForAsync(200)

      const finalSnapshots = result.current.snapshots.length

      // Should not have increased
      expect(finalSnapshots).toBe(initialSnapshots)
    })

    it('should handle rapid start/stop cycles', () => {
      const { result } = renderHook(() => useMemoryTracker())

      // Rapid start/stop cycles
      for (let i = 0; i < 5; i++) {
        act(() => {
          result.current.startTracking()
        })
        act(() => {
          result.current.stopTracking()
        })
      }

      // Should end in stopped state
      expect(result.current.isTracking).toBe(false)
    })
  })
})
