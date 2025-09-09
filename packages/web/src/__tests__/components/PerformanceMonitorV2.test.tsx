// filepath: packages/web/src/__tests__/components/PerformanceMonitorV2.test.tsx

/**
 * HEYS EAP 3.0 - PerformanceMonitorV2 Component Unit Tests
 * 
 * Purpose: Test performance monitoring dashboard component
 * Features: Real-time metrics, memory tracking, cache statistics
 */

import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { PerformanceMonitorV2 } from '../../components/performance/PerformanceMonitorV2'
import { waitForAsync, mockPerformanceMetrics } from '../../test-utils/mockData'

// Mock the hooks
vi.mock('../../hooks/usePerformanceMonitor', () => ({
  usePerformanceMonitor: vi.fn()
}))

vi.mock('../../hooks/useMemoryTracker', () => ({
  useMemoryTracker: vi.fn()
}))

vi.mock('../../utils/cacheManager', () => ({
  cacheManager: {
    getStats: vi.fn().mockReturnValue({
      hitRate: 0.85,
      memoryEntries: 42,
      memoryHits: 125,
      memoryMisses: 25,
      totalSize: 1024000
    })
  }
}))

describe('PerformanceMonitorV2', () => {
  const mockUsePerformanceMonitor = vi.mocked(require('../../hooks/usePerformanceMonitor').usePerformanceMonitor)
  const mockUseMemoryTracker = vi.mocked(require('../../hooks/useMemoryTracker').useMemoryTracker)

  beforeEach(() => {
    vi.clearAllMocks()
    
    // Default mock implementations
    mockUsePerformanceMonitor.mockReturnValue({
      isMonitoring: false,
      metrics: null,
      startMonitoring: vi.fn(),
      stopMonitoring: vi.fn(),
      refreshMetrics: vi.fn(),
      exportData: vi.fn().mockReturnValue('{}'),
      reset: vi.fn()
    })

    mockUseMemoryTracker.mockReturnValue({
      isTracking: false,
      memoryInfo: null,
      snapshots: [],
      leaks: [],
      startTracking: vi.fn(),
      stopTracking: vi.fn(),
      takeSnapshot: vi.fn(),
      reset: vi.fn(),
      getReport: vi.fn().mockReturnValue({
        snapshots: [],
        leaks: [],
        recommendations: []
      }),
      getConfig: vi.fn().mockReturnValue({})
    })
  })

  describe('Initial Render', () => {
    it('should render performance monitor dashboard', () => {
      render(<PerformanceMonitorV2 />)

      expect(screen.getByText(/performance monitor/i)).toBeInTheDocument()
    })

    it('should show monitoring controls', () => {
      render(<PerformanceMonitorV2 />)

      expect(screen.getByRole('button', { name: /start monitoring/i })).toBeInTheDocument()
    })

    it('should display initial metrics state', () => {
      render(<PerformanceMonitorV2 />)

      // Should show no metrics initially
      expect(screen.getByText(/no metrics available/i)).toBeInTheDocument()
    })
  })

  describe('Monitoring Controls', () => {
    it('should start monitoring when start button is clicked', async () => {
      const mockStartMonitoring = vi.fn()
      const mockStartTracking = vi.fn()
      
      mockUsePerformanceMonitor.mockReturnValue({
        isMonitoring: false,
        metrics: null,
        startMonitoring: mockStartMonitoring,
        stopMonitoring: vi.fn(),
        refreshMetrics: vi.fn(),
        exportData: vi.fn().mockReturnValue('{}'),
        reset: vi.fn()
      })

      mockUseMemoryTracker.mockReturnValue({
        isTracking: false,
        memoryInfo: null,
        snapshots: [],
        leaks: [],
        startTracking: mockStartTracking,
        stopTracking: vi.fn(),
        takeSnapshot: vi.fn(),
        reset: vi.fn(),
        getReport: vi.fn().mockReturnValue({
          snapshots: [],
          leaks: [],
          recommendations: []
        }),
        getConfig: vi.fn().mockReturnValue({})
      })

      render(<PerformanceMonitorV2 />)

      const startButton = screen.getByRole('button', { name: /start monitoring/i })
      fireEvent.click(startButton)

      expect(mockStartMonitoring).toHaveBeenCalled()
      expect(mockStartTracking).toHaveBeenCalled()
    })

    it('should stop monitoring when stop button is clicked', async () => {
      const mockStopMonitoring = vi.fn()
      const mockStopTracking = vi.fn()
      
      mockUsePerformanceMonitor.mockReturnValue({
        isMonitoring: true,
        metrics: mockPerformanceMetrics,
        startMonitoring: vi.fn(),
        stopMonitoring: mockStopMonitoring,
        refreshMetrics: vi.fn(),
        exportData: vi.fn().mockReturnValue('{}'),
        reset: vi.fn()
      })

      mockUseMemoryTracker.mockReturnValue({
        isTracking: true,
        memoryInfo: {
          usedJSHeapSize: 10000000,
          totalJSHeapSize: 20000000,
          jsHeapSizeLimit: 100000000
        },
        snapshots: [],
        leaks: [],
        startTracking: vi.fn(),
        stopTracking: mockStopTracking,
        takeSnapshot: vi.fn(),
        reset: vi.fn(),
        getReport: vi.fn().mockReturnValue({
          snapshots: [],
          leaks: [],
          recommendations: []
        }),
        getConfig: vi.fn().mockReturnValue({})
      })

      render(<PerformanceMonitorV2 />)

      const stopButton = screen.getByRole('button', { name: /stop monitoring/i })
      fireEvent.click(stopButton)

      expect(mockStopMonitoring).toHaveBeenCalled()
      expect(mockStopTracking).toHaveBeenCalled()
    })
  })

  describe('Metrics Display', () => {
    it('should display performance metrics when available', () => {
      mockUsePerformanceMonitor.mockReturnValue({
        isMonitoring: true,
        metrics: mockPerformanceMetrics,
        startMonitoring: vi.fn(),
        stopMonitoring: vi.fn(),
        refreshMetrics: vi.fn(),
        exportData: vi.fn().mockReturnValue('{}'),
        reset: vi.fn()
      })

      render(<PerformanceMonitorV2 showDetails={true} />)

      // Should display Web Vitals
      expect(screen.getByText(/first contentful paint/i)).toBeInTheDocument()
      expect(screen.getByText(/largest contentful paint/i)).toBeInTheDocument()
    })

    it('should display memory information when tracking', () => {
      mockUseMemoryTracker.mockReturnValue({
        isTracking: true,
        memoryInfo: {
          usedJSHeapSize: 15000000, // 15MB
          totalJSHeapSize: 25000000, // 25MB
          jsHeapSizeLimit: 100000000 // 100MB
        },
        snapshots: [],
        leaks: [],
        startTracking: vi.fn(),
        stopTracking: vi.fn(),
        takeSnapshot: vi.fn(),
        reset: vi.fn(),
        getReport: vi.fn().mockReturnValue({
          snapshots: [],
          leaks: [],
          recommendations: []
        }),
        getConfig: vi.fn().mockReturnValue({})
      })

      render(<PerformanceMonitorV2 showDetails={true} />)

      expect(screen.getByText(/memory usage/i)).toBeInTheDocument()
      expect(screen.getByText(/15.*mb/i)).toBeInTheDocument()
    })

    it('should display cache statistics', () => {
      render(<PerformanceMonitorV2 showDetails={true} />)

      expect(screen.getByText(/cache hit rate/i)).toBeInTheDocument()
      expect(screen.getByText(/85%/)).toBeInTheDocument()
    })
  })

  describe('Auto Refresh', () => {
    it('should auto refresh metrics when enabled', async () => {
      const mockRefreshMetrics = vi.fn()
      
      mockUsePerformanceMonitor.mockReturnValue({
        isMonitoring: true,
        metrics: mockPerformanceMetrics,
        startMonitoring: vi.fn(),
        stopMonitoring: vi.fn(),
        refreshMetrics: mockRefreshMetrics,
        exportData: vi.fn().mockReturnValue('{}'),
        reset: vi.fn()
      })

      render(<PerformanceMonitorV2 autoRefresh={true} refreshInterval={100} />)

      // Wait for auto refresh
      await waitFor(() => {
        expect(mockRefreshMetrics).toHaveBeenCalled()
      }, { timeout: 200 })
    })

    it('should not auto refresh when disabled', async () => {
      const mockRefreshMetrics = vi.fn()
      
      mockUsePerformanceMonitor.mockReturnValue({
        isMonitoring: true,
        metrics: mockPerformanceMetrics,
        startMonitoring: vi.fn(),
        stopMonitoring: vi.fn(),
        refreshMetrics: mockRefreshMetrics,
        exportData: vi.fn().mockReturnValue('{}'),
        reset: vi.fn()
      })

      render(<PerformanceMonitorV2 autoRefresh={false} />)

      await waitForAsync(200)

      expect(mockRefreshMetrics).not.toHaveBeenCalled()
    })
  })

  describe('Data Export', () => {
    it('should export performance data when button is clicked', () => {
      const mockExportData = vi.fn().mockReturnValue(JSON.stringify(mockPerformanceMetrics))
      
      mockUsePerformanceMonitor.mockReturnValue({
        isMonitoring: true,
        metrics: mockPerformanceMetrics,
        startMonitoring: vi.fn(),
        stopMonitoring: vi.fn(),
        refreshMetrics: vi.fn(),
        exportData: mockExportData,
        reset: vi.fn()
      })

      render(<PerformanceMonitorV2 showDetails={true} />)

      const exportButton = screen.getByRole('button', { name: /export/i })
      fireEvent.click(exportButton)

      expect(mockExportData).toHaveBeenCalled()
    })

    it('should handle export errors gracefully', () => {
      const mockExportData = vi.fn().mockImplementation(() => {
        throw new Error('Export failed')
      })
      
      mockUsePerformanceMonitor.mockReturnValue({
        isMonitoring: true,
        metrics: mockPerformanceMetrics,
        startMonitoring: vi.fn(),
        stopMonitoring: vi.fn(),
        refreshMetrics: vi.fn(),
        exportData: mockExportData,
        reset: vi.fn()
      })

      render(<PerformanceMonitorV2 showDetails={true} />)

      const exportButton = screen.getByRole('button', { name: /export/i })
      
      // Should not throw
      expect(() => fireEvent.click(exportButton)).not.toThrow()
    })
  })

  describe('Memory Snapshots', () => {
    it('should take memory snapshot when button is clicked', () => {
      const mockTakeSnapshot = vi.fn()
      
      mockUseMemoryTracker.mockReturnValue({
        isTracking: true,
        memoryInfo: {
          usedJSHeapSize: 15000000,
          totalJSHeapSize: 25000000,
          jsHeapSizeLimit: 100000000
        },
        snapshots: [],
        leaks: [],
        startTracking: vi.fn(),
        stopTracking: vi.fn(),
        takeSnapshot: mockTakeSnapshot,
        reset: vi.fn(),
        getReport: vi.fn().mockReturnValue({
          snapshots: [],
          leaks: [],
          recommendations: []
        }),
        getConfig: vi.fn().mockReturnValue({})
      })

      render(<PerformanceMonitorV2 showDetails={true} />)

      const snapshotButton = screen.getByRole('button', { name: /take snapshot/i })
      fireEvent.click(snapshotButton)

      expect(mockTakeSnapshot).toHaveBeenCalled()
    })

    it('should display memory snapshots', () => {
      mockUseMemoryTracker.mockReturnValue({
        isTracking: true,
        memoryInfo: null,
        snapshots: [
          {
            timestamp: Date.now(),
            memoryUsage: {
              usedJSHeapSize: 15000000,
              totalJSHeapSize: 25000000,
              jsHeapSizeLimit: 100000000
            }
          }
        ],
        leaks: [],
        startTracking: vi.fn(),
        stopTracking: vi.fn(),
        takeSnapshot: vi.fn(),
        reset: vi.fn(),
        getReport: vi.fn().mockReturnValue({
          snapshots: [],
          leaks: [],
          recommendations: []
        }),
        getConfig: vi.fn().mockReturnValue({})
      })

      render(<PerformanceMonitorV2 showDetails={true} />)

      expect(screen.getByText(/snapshots/i)).toBeInTheDocument()
    })
  })

  describe('Performance Rating', () => {
    it('should display good performance rating', () => {
      const metricsWithGoodRating = {
        ...mockPerformanceMetrics,
        performanceRating: 'good' as const
      }
      
      mockUsePerformanceMonitor.mockReturnValue({
        isMonitoring: true,
        metrics: metricsWithGoodRating,
        startMonitoring: vi.fn(),
        stopMonitoring: vi.fn(),
        refreshMetrics: vi.fn(),
        exportData: vi.fn().mockReturnValue('{}'),
        reset: vi.fn()
      })

      render(<PerformanceMonitorV2 showDetails={true} />)

      expect(screen.getByText(/good/i)).toBeInTheDocument()
    })

    it('should display warning for poor performance', () => {
      const metricsWithPoorRating = {
        ...mockPerformanceMetrics,
        performanceRating: 'poor' as const
      }
      
      mockUsePerformanceMonitor.mockReturnValue({
        isMonitoring: true,
        metrics: metricsWithPoorRating,
        startMonitoring: vi.fn(),
        stopMonitoring: vi.fn(),
        refreshMetrics: vi.fn(),
        exportData: vi.fn().mockReturnValue('{}'),
        reset: vi.fn()
      })

      render(<PerformanceMonitorV2 showDetails={true} />)

      expect(screen.getByText(/poor/i)).toBeInTheDocument()
    })
  })

  describe('Responsive Design', () => {
    it('should handle different screen sizes', () => {
      render(<PerformanceMonitorV2 className="custom-class" />)

      const container = screen.getByText(/performance monitor/i).closest('div')
      expect(container).toHaveClass('custom-class')
    })

    it('should show simplified view when showDetails is false', () => {
      render(<PerformanceMonitorV2 showDetails={false} />)

      // Should not show detailed metrics
      expect(screen.queryByText(/first contentful paint/i)).not.toBeInTheDocument()
    })
  })

  describe('Error Handling', () => {
    it('should handle monitoring errors', () => {
      mockUsePerformanceMonitor.mockReturnValue({
        isMonitoring: false,
        metrics: null,
        startMonitoring: vi.fn().mockImplementation(() => {
          throw new Error('Monitoring failed')
        }),
        stopMonitoring: vi.fn(),
        refreshMetrics: vi.fn(),
        exportData: vi.fn().mockReturnValue('{}'),
        reset: vi.fn()
      })

      render(<PerformanceMonitorV2 />)

      const startButton = screen.getByRole('button', { name: /start monitoring/i })
      
      // Should not crash the component
      expect(() => fireEvent.click(startButton)).not.toThrow()
    })

    it('should handle memory tracking errors', () => {
      mockUseMemoryTracker.mockReturnValue({
        isTracking: false,
        memoryInfo: null,
        snapshots: [],
        leaks: [],
        startTracking: vi.fn().mockImplementation(() => {
          throw new Error('Memory tracking failed')
        }),
        stopTracking: vi.fn(),
        takeSnapshot: vi.fn(),
        reset: vi.fn(),
        getReport: vi.fn().mockReturnValue({
          snapshots: [],
          leaks: [],
          recommendations: []
        }),
        getConfig: vi.fn().mockReturnValue({})
      })

      render(<PerformanceMonitorV2 />)

      // Should render without crashing
      expect(screen.getByText(/performance monitor/i)).toBeInTheDocument()
    })
  })

  describe('Component Lifecycle', () => {
    it('should cleanup on unmount', () => {
      const { unmount } = render(<PerformanceMonitorV2 autoRefresh={true} />)

      // Should unmount without errors
      expect(() => unmount()).not.toThrow()
    })

    it('should handle prop changes', () => {
      const { rerender } = render(<PerformanceMonitorV2 autoRefresh={false} />)

      rerender(<PerformanceMonitorV2 autoRefresh={true} refreshInterval={500} />)

      // Should handle prop changes gracefully
      expect(screen.getByText(/performance monitor/i)).toBeInTheDocument()
    })
  })
})
