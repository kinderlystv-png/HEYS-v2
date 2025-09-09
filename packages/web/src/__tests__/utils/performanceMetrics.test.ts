// filepath: packages/web/src/__tests__/utils/performanceMetrics.test.ts

/**
 * HEYS EAP 3.0 - Performance Metrics Unit Tests
 * 
 * Purpose: Test performance metrics collection and analysis
 * Features: Web Vitals testing, custom metrics, performance observers
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PerformanceMetricsCollector } from '../../utils/performanceMetrics'
import { mockPerformanceMetrics, mockPerformanceEntries } from '../../test-utils/mockData'

describe('PerformanceMetricsCollector', () => {
  let collector: PerformanceMetricsCollector
  let mockPerformanceObserver: any

  beforeEach(() => {
    // Mock PerformanceObserver
    mockPerformanceObserver = vi.fn().mockImplementation((callback) => ({
      observe: vi.fn(),
      disconnect: vi.fn(),
      entryTypes: [],
      callback
    }))
    
    global.PerformanceObserver = mockPerformanceObserver
    global.PerformanceObserver.supportedEntryTypes = [
      'navigation',
      'paint',
      'measure',
      'mark'
    ]

    collector = new PerformanceMetricsCollector({
      enableWebVitals: true,
      enableCustomMetrics: true,
      sampleRate: 1
    })
  })

  afterEach(() => {
    collector.destroy()
    vi.clearAllMocks()
  })

  describe('Initialization', () => {
    it('should initialize with default options', () => {
      const defaultCollector = new PerformanceMetricsCollector()
      expect(defaultCollector).toBeDefined()
    })

    it('should setup performance observers when initialized', () => {
      expect(mockPerformanceObserver).toHaveBeenCalled()
    })

    it('should handle missing PerformanceObserver gracefully', () => {
      // @ts-ignore
      global.PerformanceObserver = undefined
      
      expect(() => {
        new PerformanceMetricsCollector()
      }).not.toThrow()
    })
  })

  describe('Web Vitals Collection', () => {
    it('should collect FCP (First Contentful Paint)', async () => {
      const onMetric = vi.fn()
      collector.onMetric(onMetric)

      // Simulate FCP entry
      const fcpEntry = {
        name: 'first-contentful-paint',
        entryType: 'paint',
        startTime: 1200,
        duration: 0
      }

      // Trigger the observer callback
      const observerInstance = mockPerformanceObserver.mock.results[0].value
      observerInstance.callback([fcpEntry])

      expect(onMetric).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'FCP',
          value: 1200,
          rating: expect.any(String)
        })
      )
    })

    it('should collect LCP (Largest Contentful Paint)', async () => {
      const onMetric = vi.fn()
      collector.onMetric(onMetric)

      const lcpEntry = {
        name: 'largest-contentful-paint',
        entryType: 'largest-contentful-paint',
        startTime: 2100,
        duration: 0,
        size: 1024
      }

      const observerInstance = mockPerformanceObserver.mock.results[0].value
      observerInstance.callback([lcpEntry])

      expect(onMetric).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'LCP',
          value: 2100,
          rating: expect.any(String)
        })
      )
    })

    it('should collect TTFB (Time to First Byte)', async () => {
      const onMetric = vi.fn()
      collector.onMetric(onMetric)

      const navigationEntry = {
        name: 'https://example.com',
        entryType: 'navigation',
        responseStart: 300,
        fetchStart: 0
      }

      const observerInstance = mockPerformanceObserver.mock.results[0].value
      observerInstance.callback([navigationEntry])

      expect(onMetric).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'TTFB',
          value: 300,
          rating: expect.any(String)
        })
      )
    })
  })

  describe('Custom Metrics Collection', () => {
    it('should collect DOM nodes count', () => {
      // Mock DOM with some elements
      const mockElements = Array.from({ length: 50 }, () => document.createElement('div'))
      document.querySelectorAll = vi.fn().mockReturnValue(mockElements)

      const customMetrics = collector.getCustomMetrics()
      
      expect(customMetrics.domNodes).toBe(50)
    })

    it('should collect event listeners count', () => {
      // Mock getEventListeners (Chrome DevTools API)
      ;(global as any).getEventListeners = vi.fn().mockReturnValue({
        click: [{ listener: () => {} }],
        scroll: [{ listener: () => {} }, { listener: () => {} }]
      })

      const customMetrics = collector.getCustomMetrics()
      
      expect(customMetrics.eventListeners).toBeGreaterThan(0)
    })

    it('should measure function performance', async () => {
      const testFunction = vi.fn().mockImplementation(() => {
        // Simulate some work
        let sum = 0
        for (let i = 0; i < 1000; i++) {
          sum += i
        }
        return sum
      })

      const result = await collector.measureFunction('testFunction', testFunction)
      
      expect(result.duration).toBeGreaterThan(0)
      expect(result.name).toBe('testFunction')
      expect(testFunction).toHaveBeenCalled()
    })

    it('should handle function performance measurement errors', async () => {
      const errorFunction = vi.fn().mockImplementation(() => {
        throw new Error('Test error')
      })

      await expect(
        collector.measureFunction('errorFunction', errorFunction)
      ).rejects.toThrow('Test error')
    })
  })

  describe('Performance Rating', () => {
    it('should rate FCP correctly', () => {
      expect(collector.getPerformanceRating('FCP', 1000)).toBe('good')
      expect(collector.getPerformanceRating('FCP', 2500)).toBe('needs-improvement')
      expect(collector.getPerformanceRating('FCP', 4000)).toBe('poor')
    })

    it('should rate LCP correctly', () => {
      expect(collector.getPerformanceRating('LCP', 2000)).toBe('good')
      expect(collector.getPerformanceRating('LCP', 3500)).toBe('needs-improvement')
      expect(collector.getPerformanceRating('LCP', 5000)).toBe('poor')
    })

    it('should rate CLS correctly', () => {
      expect(collector.getPerformanceRating('CLS', 0.05)).toBe('good')
      expect(collector.getPerformanceRating('CLS', 0.15)).toBe('needs-improvement')
      expect(collector.getPerformanceRating('CLS', 0.3)).toBe('poor')
    })

    it('should handle unknown metrics', () => {
      expect(collector.getPerformanceRating('UNKNOWN', 100)).toBe('good')
    })
  })

  describe('Metrics Storage and Retrieval', () => {
    it('should store metrics when collected', () => {
      const initialCount = collector.getMetrics().length
      
      collector.recordMetric({
        name: 'test-metric',
        value: 100,
        timestamp: Date.now(),
        rating: 'good'
      })

      expect(collector.getMetrics().length).toBe(initialCount + 1)
    })

    it('should limit stored metrics to max count', () => {
      const smallCollector = new PerformanceMetricsCollector({
        maxMetrics: 3
      })

      for (let i = 0; i < 5; i++) {
        smallCollector.recordMetric({
          name: `metric-${i}`,
          value: i * 100,
          timestamp: Date.now() + i,
          rating: 'good'
        })
      }

      expect(smallCollector.getMetrics().length).toBe(3)
      
      smallCollector.destroy()
    })

    it('should clear metrics when requested', () => {
      collector.recordMetric({
        name: 'test-metric',
        value: 100,
        timestamp: Date.now(),
        rating: 'good'
      })

      expect(collector.getMetrics().length).toBeGreaterThan(0)
      
      collector.clearMetrics()
      
      expect(collector.getMetrics().length).toBe(0)
    })
  })

  describe('Performance Analysis', () => {
    beforeEach(() => {
      // Add some test metrics
      const testMetrics = [
        { name: 'FCP', value: 1200, timestamp: Date.now() - 5000, rating: 'good' },
        { name: 'LCP', value: 2100, timestamp: Date.now() - 4000, rating: 'good' },
        { name: 'FID', value: 50, timestamp: Date.now() - 3000, rating: 'good' },
        { name: 'CLS', value: 0.05, timestamp: Date.now() - 2000, rating: 'good' },
        { name: 'TTFB', value: 300, timestamp: Date.now() - 1000, rating: 'good' }
      ]

      testMetrics.forEach(metric => collector.recordMetric(metric))
    })

    it('should calculate performance score', () => {
      const score = collector.getPerformanceScore()
      
      expect(score).toBeGreaterThan(0)
      expect(score).toBeLessThanOrEqual(100)
    })

    it('should generate performance summary', () => {
      const summary = collector.getPerformanceSummary()
      
      expect(summary).toHaveProperty('totalMetrics')
      expect(summary).toHaveProperty('averageScore')
      expect(summary).toHaveProperty('ratingDistribution')
      expect(summary.ratingDistribution.good).toBeGreaterThan(0)
    })

    it('should detect performance trends', () => {
      // Add metrics with declining performance
      const decliningMetrics = [
        { name: 'FCP', value: 1000, timestamp: Date.now() - 10000, rating: 'good' },
        { name: 'FCP', value: 2000, timestamp: Date.now() - 5000, rating: 'needs-improvement' },
        { name: 'FCP', value: 4000, timestamp: Date.now(), rating: 'poor' }
      ]

      decliningMetrics.forEach(metric => collector.recordMetric(metric))
      
      const trends = collector.getPerformanceTrends()
      
      expect(trends).toHaveProperty('FCP')
      expect(trends.FCP.trend).toBe('declining')
    })
  })

  describe('Error Handling', () => {
    it('should handle observer errors gracefully', () => {
      const errorCollector = new PerformanceMetricsCollector()
      
      // Simulate observer error
      const observerInstance = mockPerformanceObserver.mock.results[0].value
      
      expect(() => {
        observerInstance.callback(null) // Invalid entries
      }).not.toThrow()
      
      errorCollector.destroy()
    })

    it('should handle missing performance API', () => {
      const originalPerformance = global.performance
      // @ts-ignore
      global.performance = undefined

      expect(() => {
        new PerformanceMetricsCollector()
      }).not.toThrow()

      global.performance = originalPerformance
    })
  })

  describe('Cleanup', () => {
    it('should disconnect observers on destroy', () => {
      const observerInstance = mockPerformanceObserver.mock.results[0].value
      const disconnectSpy = vi.spyOn(observerInstance, 'disconnect')
      
      collector.destroy()
      
      expect(disconnectSpy).toHaveBeenCalled()
    })

    it('should clear all metrics on destroy', () => {
      collector.recordMetric({
        name: 'test-metric',
        value: 100,
        timestamp: Date.now(),
        rating: 'good'
      })

      collector.destroy()
      
      expect(collector.getMetrics().length).toBe(0)
    })
  })
})
