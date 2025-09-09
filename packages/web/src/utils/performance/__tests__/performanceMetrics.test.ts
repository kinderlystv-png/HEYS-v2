// filepath: packages/web/src/utils/performance/__tests__/performanceMetrics.test.ts

/**
 * HEYS EAP 3.0 - Performance Metrics Tests
 * 
 * Purpose: Test suite for performance monitoring utilities
 * Coverage: Metrics collection, Web Vitals tracking, custom measurements
 */

import { 
  PerformanceMetricsCollector,
  initializePerformanceMetrics,
  getPerformanceCollector,
  perf,
  WEB_VITALS_THRESHOLDS
} from '../performanceMetrics'

// Mock performance API
const mockPerformance = {
  now: jest.fn(() => 1000),
  mark: jest.fn(),
  measure: jest.fn(),
  getEntriesByName: jest.fn(() => [{ duration: 100 }]),
  clearMarks: jest.fn(),
  clearMeasures: jest.fn()
}

// Mock PerformanceObserver
const mockPerformanceObserver = jest.fn()
mockPerformanceObserver.prototype.observe = jest.fn()
mockPerformanceObserver.prototype.disconnect = jest.fn()

// Mock window and global objects
const mockWindow = {
  performance: mockPerformance,
  PerformanceObserver: mockPerformanceObserver,
  location: { href: 'https://test.com' },
  navigator: { userAgent: 'test-browser' }
}

describe('PerformanceMetricsCollector', () => {
  let collector: PerformanceMetricsCollector

  beforeEach(() => {
    jest.clearAllMocks()
    
    // Setup global mocks
    Object.defineProperty(global, 'window', {
      value: mockWindow,
      writable: true
    })
    
    Object.defineProperty(global, 'performance', {
      value: mockPerformance,
      writable: true
    })

    Object.defineProperty(global, 'PerformanceObserver', {
      value: mockPerformanceObserver,
      writable: true
    })

    collector = new PerformanceMetricsCollector('test-user')
  })

  afterEach(() => {
    collector.destroy()
  })

  describe('Initialization', () => {
    it('creates collector with user ID', () => {
      expect(collector).toBeInstanceOf(PerformanceMetricsCollector)
    })

    it('generates unique session ID', () => {
      const collector1 = new PerformanceMetricsCollector()
      const collector2 = new PerformanceMetricsCollector()
      
      const summary1 = collector1.getPerformanceSummary()
      const summary2 = collector2.getPerformanceSummary()
      
      expect(summary1.sessionId).not.toBe(summary2.sessionId)
      
      collector1.destroy()
      collector2.destroy()
    })

    it('initializes performance observers when available', () => {
      expect(mockPerformanceObserver).toHaveBeenCalled()
      expect(mockPerformanceObserver.prototype.observe).toHaveBeenCalled()
    })
  })

  describe('Metric Recording', () => {
    it('records basic performance metrics', () => {
      const metric = {
        name: 'test-metric',
        value: 100,
        timestamp: Date.now()
      }

      collector.recordMetric(metric)
      const metrics = collector.getMetrics()

      expect(metrics).toHaveLength(1)
      expect(metrics[0]).toMatchObject({
        ...metric,
        url: 'https://test.com',
        userId: 'test-user'
      })
    })

    it('records Web Vitals metrics with rating', () => {
      const webVital = {
        name: 'lcp',
        value: 2000,
        timestamp: Date.now(),
        rating: 'good' as const
      }

      collector.recordWebVital(webVital)
      const metrics = collector.getMetrics()

      expect(metrics).toHaveLength(1)
      expect(metrics[0]).toMatchObject({
        ...webVital,
        url: 'https://test.com',
        userId: 'test-user'
      })
    })

    it('records custom metrics with category', () => {
      const customMetric = {
        name: 'component-render',
        value: 50,
        category: 'render' as const,
        component: 'TestComponent'
      }

      collector.recordCustomMetric(customMetric)
      const metrics = collector.getMetrics()

      expect(metrics).toHaveLength(1)
      expect(metrics[0]).toMatchObject({
        ...customMetric,
        url: 'https://test.com',
        userId: 'test-user'
      })
    })

    it('measures component render time', () => {
      collector.measureComponentRender('TestComponent', 75)
      
      const metrics = collector.getMetrics()
      expect(metrics).toHaveLength(1)
      expect(metrics[0]).toMatchObject({
        name: 'component-render-time',
        value: 75,
        category: 'render',
        component: 'TestComponent'
      })
    })
  })

  describe('Function Measurement', () => {
    it('measures synchronous function execution', () => {
      const testFunction = jest.fn(() => 'result')
      
      const result = collector.measureFunction('test-sync', testFunction)
      
      expect(result).toBe('result')
      expect(testFunction).toHaveBeenCalled()
      
      const metrics = collector.getMetrics()
      expect(metrics).toHaveLength(1)
      expect(metrics[0].name).toBe('function-test-sync')
    })

    it('measures asynchronous function execution', async () => {
      const testAsyncFunction = jest.fn(async () => 'async-result')
      
      const result = await collector.measureFunction('test-async', testAsyncFunction)
      
      expect(result).toBe('async-result')
      expect(testAsyncFunction).toHaveBeenCalled()
      
      const metrics = collector.getMetrics()
      expect(metrics).toHaveLength(1)
      expect(metrics[0].name).toBe('function-test-async')
    })

    it('handles function execution errors', () => {
      const errorFunction = jest.fn(() => {
        throw new Error('Test error')
      })
      
      expect(() => {
        collector.measureFunction('test-error', errorFunction)
      }).toThrow('Test error')
      
      const metrics = collector.getMetrics()
      expect(metrics).toHaveLength(1)
      expect(metrics[0].name).toBe('function-test-error')
    })
  })

  describe('Web Vitals Rating', () => {
    it('correctly rates LCP values', () => {
      // Good LCP
      collector.recordWebVital({
        name: 'lcp',
        value: 2000,
        timestamp: Date.now(),
        rating: 'good'
      })

      // Poor LCP
      collector.recordWebVital({
        name: 'lcp',
        value: 5000,
        timestamp: Date.now(),
        rating: 'poor'
      })

      const metrics = collector.getMetrics()
      expect(metrics[0].rating).toBe('good')
      expect(metrics[1].rating).toBe('poor')
    })

    it('uses correct thresholds for different metrics', () => {
      expect(WEB_VITALS_THRESHOLDS.LCP.good).toBe(2500)
      expect(WEB_VITALS_THRESHOLDS.FID.good).toBe(100)
      expect(WEB_VITALS_THRESHOLDS.CLS.good).toBe(0.1)
      expect(WEB_VITALS_THRESHOLDS.FCP.good).toBe(1800)
      expect(WEB_VITALS_THRESHOLDS.TTFB.good).toBe(800)
    })
  })

  describe('Metrics Filtering and Analysis', () => {
    beforeEach(() => {
      // Add test metrics
      collector.recordCustomMetric({
        name: 'render-1',
        value: 25,
        category: 'render'
      })
      
      collector.recordCustomMetric({
        name: 'network-1',
        value: 150,
        category: 'network'
      })
      
      collector.recordCustomMetric({
        name: 'render-2',
        value: 35,
        category: 'render'
      })
    })

    it('filters metrics by category', () => {
      const renderMetrics = collector.getMetricsByCategory('render')
      expect(renderMetrics).toHaveLength(2)
      expect(renderMetrics.every(m => (m as any).category === 'render')).toBe(true)
      
      const networkMetrics = collector.getMetricsByCategory('network')
      expect(networkMetrics).toHaveLength(1)
      expect((networkMetrics[0] as any).category).toBe('network')
    })

    it('provides performance summary', () => {
      const summary = collector.getPerformanceSummary()
      
      expect(summary.totalMetrics).toBe(3)
      expect(summary.avgRenderTime).toBe(30) // (25 + 35) / 2
      expect(summary.sessionId).toBeDefined()
    })

    it('clears metrics', () => {
      expect(collector.getMetrics()).toHaveLength(3)
      
      collector.clearMetrics()
      
      expect(collector.getMetrics()).toHaveLength(0)
    })
  })

  describe('Enable/Disable Functionality', () => {
    it('respects enabled/disabled state', () => {
      collector.setEnabled(false)
      
      collector.recordMetric({
        name: 'disabled-metric',
        value: 100,
        timestamp: Date.now()
      })
      
      expect(collector.getMetrics()).toHaveLength(0)
      
      collector.setEnabled(true)
      
      collector.recordMetric({
        name: 'enabled-metric',
        value: 100,
        timestamp: Date.now()
      })
      
      expect(collector.getMetrics()).toHaveLength(1)
    })
  })

  describe('Cleanup', () => {
    it('disconnects observers on destroy', () => {
      collector.destroy()
      
      expect(mockPerformanceObserver.prototype.disconnect).toHaveBeenCalled()
    })

    it('clears metrics on destroy', () => {
      collector.recordMetric({
        name: 'test',
        value: 100,
        timestamp: Date.now()
      })
      
      expect(collector.getMetrics()).toHaveLength(1)
      
      collector.destroy()
      
      expect(collector.getMetrics()).toHaveLength(0)
    })
  })
})

describe('Global Performance Functions', () => {
  beforeEach(() => {
    Object.defineProperty(global, 'window', {
      value: mockWindow,
      writable: true
    })
  })

  it('initializes global performance metrics', () => {
    const collector = initializePerformanceMetrics('global-user')
    
    expect(collector).toBeInstanceOf(PerformanceMetricsCollector)
    expect(getPerformanceCollector()).toBe(collector)
  })

  it('throws error when initializing in non-browser environment', () => {
    delete (global as any).window
    
    expect(() => {
      initializePerformanceMetrics()
    }).toThrow('Performance metrics can only be initialized in browser environment')
  })
})

describe('Performance Utilities (perf)', () => {
  beforeEach(() => {
    Object.defineProperty(global, 'window', {
      value: mockWindow,
      writable: true
    })
    
    Object.defineProperty(global, 'performance', {
      value: mockPerformance,
      writable: true
    })
  })

  it('marks performance points', () => {
    perf.mark('test-operation')
    
    expect(mockPerformance.mark).toHaveBeenCalledWith('test-operation-start')
  })

  it('measures performance duration', () => {
    mockPerformance.getEntriesByName.mockReturnValue([{ duration: 150 }])
    
    const duration = perf.measure('test-operation')
    
    expect(mockPerformance.mark).toHaveBeenCalledWith('test-operation-end')
    expect(mockPerformance.measure).toHaveBeenCalledWith(
      'test-operation', 
      'test-operation-start', 
      'test-operation-end'
    )
    expect(duration).toBe(150)
  })

  it('times function execution', () => {
    const testFn = jest.fn(() => 'result')
    mockPerformance.getEntriesByName.mockReturnValue([{ duration: 75 }])
    
    const result = perf.time('test-function', testFn)
    
    expect(result).toBe('result')
    expect(testFn).toHaveBeenCalled()
    expect(mockPerformance.mark).toHaveBeenCalledWith('test-function-start')
  })

  it('handles performance API unavailability gracefully', () => {
    delete (global as any).window
    
    perf.mark('test')
    const duration = perf.measure('test')
    
    expect(duration).toBe(0)
  })

  it('handles performance measurement errors', () => {
    mockPerformance.measure.mockImplementation(() => {
      throw new Error('Performance API error')
    })
    
    const duration = perf.measure('error-operation')
    
    expect(duration).toBe(0)
  })
})
