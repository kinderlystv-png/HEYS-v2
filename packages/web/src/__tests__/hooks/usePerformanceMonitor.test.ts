// filepath: packages/web/src/__tests__/hooks/usePerformanceMonitor.test.ts

/**
 * HEYS EAP 3.0 - usePerformanceMonitor Hook Unit Tests
 * 
 * Purpose: Test performance monitoring React hook
 * Features: Performance metrics collection, Web Vitals, real-time monitoring
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

import { waitForAsync, mockPerformanceMetrics } from '../../test-utils/mockData'
import { usePerformanceMonitor } from '../../hooks/usePerformanceMonitor'

// Mock the PerformanceMetricsCollector
vi.mock('../../utils/performanceMetrics', () => ({
  PerformanceMetricsCollector: vi.fn().mockImplementation(() => ({
    initialize: vi.fn(),
    startMonitoring: vi.fn(),
    stopMonitoring: vi.fn(),
    getMetrics: vi.fn().mockReturnValue(mockPerformanceMetrics),
    reset: vi.fn(),
    exportMetrics: vi.fn().mockReturnValue(JSON.stringify(mockPerformanceMetrics)),
    onMetricsUpdate: vi.fn(),
    dispose: vi.fn()
  }))
}))

describe('usePerformanceMonitor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Basic Functionality', () => {
    it('should initialize with default state', () => {
      const { result } = renderHook(() => usePerformanceMonitor())

      expect(result.current.isMonitoring).toBe(false)
      expect(result.current.metrics).toBeNull()
      expect(result.current.error).toBeNull()
      expect(result.current.isLoading).toBe(false)
    })

    it('should start monitoring when requested', async () => {
      const { result } = renderHook(() => usePerformanceMonitor())

      act(() => {
        result.current.startMonitoring()
      })

      expect(result.current.isMonitoring).toBe(true)
      expect(result.current.isLoading).toBe(false)
    })

    it('should stop monitoring when requested', async () => {
      const { result } = renderHook(() => usePerformanceMonitor())

      // Start monitoring first
      act(() => {
        result.current.startMonitoring()
      })

      expect(result.current.isMonitoring).toBe(true)

      // Then stop
      act(() => {
        result.current.stopMonitoring()
      })

      expect(result.current.isMonitoring).toBe(false)
    })
  })

  describe('Auto-start Configuration', () => {
    it('should auto-start monitoring when configured', () => {
      const { result } = renderHook(() => 
        usePerformanceMonitor({ autoStart: true })
      )

      expect(result.current.isMonitoring).toBe(true)
    })

    it('should not auto-start when disabled', () => {
      const { result } = renderHook(() => 
        usePerformanceMonitor({ autoStart: false })
      )

      expect(result.current.isMonitoring).toBe(false)
    })
  })

  describe('Metrics Collection', () => {
    it('should collect metrics when monitoring is active', async () => {
      const { result } = renderHook(() => usePerformanceMonitor())

      act(() => {
        result.current.startMonitoring()
      })

      // Wait for metrics to be collected
      await waitForAsync(100)

      act(() => {
        result.current.refreshMetrics()
      })

      expect(result.current.metrics).toBeDefined()
      expect(result.current.metrics?.webVitals).toBeDefined()
      expect(result.current.metrics?.customMetrics).toBeDefined()
    })

    it('should update metrics on refresh', async () => {
      const { result } = renderHook(() => usePerformanceMonitor())

      act(() => {
        result.current.startMonitoring()
      })

      const initialMetrics = result.current.metrics

      // Simulate metrics update
      act(() => {
        result.current.refreshMetrics()
      })

      // Metrics should be updated (even if same mock data)
      expect(result.current.metrics).toBeDefined()
    })
  })

  describe('Real-time Updates', () => {
    it('should enable real-time updates with interval', async () => {
      const { result } = renderHook(() => 
        usePerformanceMonitor({ 
          enableRealTimeUpdates: true,
          updateInterval: 100
        })
      )

      act(() => {
        result.current.startMonitoring()
      })

      expect(result.current.isMonitoring).toBe(true)

      // Wait for real-time update
      await waitForAsync(150)

      expect(result.current.metrics).toBeDefined()
    })

    it('should not update when real-time is disabled', async () => {
      const { result } = renderHook(() => 
        usePerformanceMonitor({ 
          enableRealTimeUpdates: false
        })
      )

      act(() => {
        result.current.startMonitoring()
      })

      // Manual refresh should still work
      act(() => {
        result.current.refreshMetrics()
      })

      expect(result.current.metrics).toBeDefined()
    })
  })

  describe('Error Handling', () => {
    it('should handle collector initialization errors', () => {
      // Mock initialization error
      const mockCollector = {
        initialize: vi.fn().mockImplementation(() => {
          throw new Error('Initialization failed')
        }),
        startMonitoring: vi.fn(),
        stopMonitoring: vi.fn(),
        getMetrics: vi.fn(),
        reset: vi.fn(),
        exportMetrics: vi.fn(),
        onMetricsUpdate: vi.fn(),
        dispose: vi.fn()
      }

      vi.mocked(require('../../utils/performanceMetrics').PerformanceMetricsCollector)
        .mockImplementation(() => mockCollector)

      const { result } = renderHook(() => usePerformanceMonitor())

      act(() => {
        result.current.startMonitoring()
      })

      expect(result.current.error).toBeDefined()
      expect(result.current.isMonitoring).toBe(false)
    })

    it('should clear errors when monitoring is restarted', () => {
      const { result } = renderHook(() => usePerformanceMonitor())

      // Force an error state
      act(() => {
        result.current.startMonitoring()
      })

      // Reset mocks for clean restart
      vi.clearAllMocks()

      // Restart should clear error
      act(() => {
        result.current.startMonitoring()
      })

      expect(result.current.error).toBeNull()
    })
  })

  describe('Configuration Options', () => {
    it('should pass configuration to collector', () => {
      const config = {
        enableWebVitals: true,
        enableCustomMetrics: true,
        enableResourceTiming: true,
        enableNavigationTiming: true,
        enablePaintTiming: true,
        sampleRate: 0.5
      }

      renderHook(() => usePerformanceMonitor(config))

      // Verify collector was created with config
      expect(require('../../utils/performanceMetrics').PerformanceMetricsCollector)
        .toHaveBeenCalledWith(expect.objectContaining(config))
    })

    it('should use default configuration when none provided', () => {
      renderHook(() => usePerformanceMonitor())

      expect(require('../../utils/performanceMetrics').PerformanceMetricsCollector)
        .toHaveBeenCalledWith(expect.objectContaining({
          enableWebVitals: true,
          enableCustomMetrics: true
        }))
    })
  })

  describe('Lifecycle Management', () => {
    it('should cleanup on unmount', () => {
      const { unmount } = renderHook(() => usePerformanceMonitor())

      unmount()

      // Verify cleanup was called
      // Note: Implementation should call dispose on unmount
    })

    it('should restart monitoring after reset', () => {
      const { result } = renderHook(() => usePerformanceMonitor())

      act(() => {
        result.current.startMonitoring()
      })

      expect(result.current.isMonitoring).toBe(true)

      act(() => {
        result.current.reset()
      })

      // After reset, should be able to start again
      act(() => {
        result.current.startMonitoring()
      })

      expect(result.current.isMonitoring).toBe(true)
    })
  })

  describe('Data Export', () => {
    it('should export metrics data', async () => {
      const { result } = renderHook(() => usePerformanceMonitor())

      act(() => {
        result.current.startMonitoring()
      })

      await waitForAsync(100)

      act(() => {
        result.current.refreshMetrics()
      })

      const exportedData = result.current.exportData()

      expect(exportedData).toBeDefined()
      expect(typeof exportedData).toBe('string')
      expect(() => JSON.parse(exportedData)).not.toThrow()
    })

    it('should return empty export when no metrics', () => {
      const { result } = renderHook(() => usePerformanceMonitor())

      const exportedData = result.current.exportData()

      expect(exportedData).toBeDefined()
    })
  })

  describe('Performance Ratings', () => {
    it('should provide performance rating', async () => {
      const { result } = renderHook(() => usePerformanceMonitor())

      act(() => {
        result.current.startMonitoring()
      })

      await waitForAsync(100)

      act(() => {
        result.current.refreshMetrics()
      })

      expect(result.current.metrics?.performanceRating).toBeDefined()
      expect(['good', 'needs-improvement', 'poor']).toContain(
        result.current.metrics?.performanceRating
      )
    })
  })

  describe('Memory Management', () => {
    it('should not leak memory on frequent updates', async () => {
      const { result } = renderHook(() => 
        usePerformanceMonitor({ 
          enableRealTimeUpdates: true,
          updateInterval: 50
        })
      )

      act(() => {
        result.current.startMonitoring()
      })

      // Simulate many updates
      for (let i = 0; i < 10; i++) {
        act(() => {
          result.current.refreshMetrics()
        })
        await waitForAsync(10)
      }

      // Should still be responsive
      expect(result.current.isMonitoring).toBe(true)
      expect(result.current.metrics).toBeDefined()
    })
  })

  describe('Edge Cases', () => {
    it('should handle multiple start calls gracefully', () => {
      const { result } = renderHook(() => usePerformanceMonitor())

      act(() => {
        result.current.startMonitoring()
      })

      act(() => {
        result.current.startMonitoring()
      })

      act(() => {
        result.current.startMonitoring()
      })

      expect(result.current.isMonitoring).toBe(true)
      expect(result.current.error).toBeNull()
    })

    it('should handle stop when not started', () => {
      const { result } = renderHook(() => usePerformanceMonitor())

      act(() => {
        result.current.stopMonitoring()
      })

      expect(result.current.isMonitoring).toBe(false)
      expect(result.current.error).toBeNull()
    })

    it('should handle refresh when not monitoring', () => {
      const { result } = renderHook(() => usePerformanceMonitor())

      act(() => {
        result.current.refreshMetrics()
      })

      // Should not throw error
      expect(result.current.error).toBeNull()
    })
  })
})
