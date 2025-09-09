// filepath: packages/web/src/utils/performance/performanceMetrics.ts

/**
 * HEYS EAP 3.0 - Performance Metrics Utilities
 * 
 * Purpose: Core performance monitoring and metrics collection
 * Features: Web Vitals, Custom metrics, Performance API integration
 */

import { logger } from '@heys/logger'

// Performance metric types
export interface PerformanceMetric {
  name: string
  value: number
  timestamp: number
  url?: string
  userId?: string
  metadata?: Record<string, any>
}

export interface WebVitalsMetric extends PerformanceMetric {
  rating: 'good' | 'needs-improvement' | 'poor'
  delta?: number
}

export interface CustomMetric extends PerformanceMetric {
  category: 'render' | 'network' | 'user-interaction' | 'memory' | 'bundle'
  component?: string
}

// Web Vitals thresholds (Core Web Vitals standards)
export const WEB_VITALS_THRESHOLDS = {
  // Largest Contentful Paint (LCP)
  LCP: {
    good: 2500,
    needsImprovement: 4000
  },
  // First Input Delay (FID)
  FID: {
    good: 100,
    needsImprovement: 300
  },
  // Cumulative Layout Shift (CLS)
  CLS: {
    good: 0.1,
    needsImprovement: 0.25
  },
  // First Contentful Paint (FCP)
  FCP: {
    good: 1800,
    needsImprovement: 3000
  },
  // Time to First Byte (TTFB)
  TTFB: {
    good: 800,
    needsImprovement: 1800
  }
} as const

/**
 * Performance metrics collector class
 */
export class PerformanceMetricsCollector {
  private metrics: PerformanceMetric[] = []
  private observers: PerformanceObserver[] = []
  private userId?: string
  private sessionId: string
  private isEnabled: boolean = true

  constructor(userId?: string) {
    this.userId = userId
    this.sessionId = this.generateSessionId()
    this.initializeObservers()
  }

  /**
   * Generate unique session ID for performance tracking
   */
  private generateSessionId(): string {
    return `perf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Initialize performance observers
   */
  private initializeObservers(): void {
    if (typeof window === 'undefined' || !('PerformanceObserver' in window)) {
      logger.warn('PerformanceObserver not available')
      return
    }

    try {
      // Navigation timing observer
      this.createObserver('navigation', this.handleNavigationEntry.bind(this))
      
      // Paint timing observer
      this.createObserver('paint', this.handlePaintEntry.bind(this))
      
      // Layout shift observer
      this.createObserver('layout-shift', this.handleLayoutShiftEntry.bind(this))
      
      // Largest contentful paint observer
      this.createObserver('largest-contentful-paint', this.handleLCPEntry.bind(this))
      
      // First input delay observer
      this.createObserver('first-input', this.handleFIDEntry.bind(this))

    } catch (error) {
      logger.error('Failed to initialize performance observers:', error)
    }
  }

  /**
   * Create and start a performance observer
   */
  private createObserver(
    entryType: string, 
    callback: (entries: PerformanceEntryList) => void
  ): void {
    try {
      const observer = new PerformanceObserver(callback)
      observer.observe({ entryTypes: [entryType] })
      this.observers.push(observer)
    } catch (error) {
      logger.warn(`Failed to create observer for ${entryType}:`, error)
    }
  }

  /**
   * Handle navigation performance entries
   */
  private handleNavigationEntry(entries: PerformanceEntryList): void {
    entries.forEach((entry) => {
      if (entry.entryType === 'navigation') {
        const navEntry = entry as PerformanceNavigationTiming
        
        // DNS lookup time
        this.recordMetric({
          name: 'dns-lookup-time',
          value: navEntry.domainLookupEnd - navEntry.domainLookupStart,
          timestamp: Date.now(),
          metadata: { type: 'navigation' }
        })

        // TCP connection time
        this.recordMetric({
          name: 'tcp-connection-time',
          value: navEntry.connectEnd - navEntry.connectStart,
          timestamp: Date.now(),
          metadata: { type: 'navigation' }
        })

        // Time to First Byte
        this.recordMetric({
          name: 'ttfb',
          value: navEntry.responseStart - navEntry.requestStart,
          timestamp: Date.now(),
          metadata: { type: 'navigation' }
        })

        // DOM Content Loaded
        this.recordMetric({
          name: 'dom-content-loaded',
          value: navEntry.domContentLoadedEventEnd - navEntry.navigationStart,
          timestamp: Date.now(),
          metadata: { type: 'navigation' }
        })

        // Full page load
        this.recordMetric({
          name: 'page-load-time',
          value: navEntry.loadEventEnd - navEntry.navigationStart,
          timestamp: Date.now(),
          metadata: { type: 'navigation' }
        })
      }
    })
  }

  /**
   * Handle paint performance entries
   */
  private handlePaintEntry(entries: PerformanceEntryList): void {
    entries.forEach((entry) => {
      if (entry.name === 'first-contentful-paint') {
        const rating = this.getRating('FCP', entry.startTime)
        this.recordWebVital({
          name: 'fcp',
          value: entry.startTime,
          timestamp: Date.now(),
          rating,
          metadata: { type: 'paint' }
        })
      }
    })
  }

  /**
   * Handle layout shift entries
   */
  private handleLayoutShiftEntry(entries: PerformanceEntryList): void {
    let clsValue = 0

    entries.forEach((entry) => {
      if (!(entry as any).hadRecentInput) {
        clsValue += (entry as any).value
      }
    })

    if (clsValue > 0) {
      const rating = this.getRating('CLS', clsValue)
      this.recordWebVital({
        name: 'cls',
        value: clsValue,
        timestamp: Date.now(),
        rating,
        metadata: { type: 'layout-shift' }
      })
    }
  }

  /**
   * Handle Largest Contentful Paint entries
   */
  private handleLCPEntry(entries: PerformanceEntryList): void {
    const lastEntry = entries[entries.length - 1]
    if (lastEntry) {
      const rating = this.getRating('LCP', lastEntry.startTime)
      this.recordWebVital({
        name: 'lcp',
        value: lastEntry.startTime,
        timestamp: Date.now(),
        rating,
        metadata: { type: 'largest-contentful-paint' }
      })
    }
  }

  /**
   * Handle First Input Delay entries
   */
  private handleFIDEntry(entries: PerformanceEntryList): void {
    entries.forEach((entry) => {
      const fid = (entry as any).processingStart - entry.startTime
      const rating = this.getRating('FID', fid)
      this.recordWebVital({
        name: 'fid',
        value: fid,
        timestamp: Date.now(),
        rating,
        metadata: { type: 'first-input' }
      })
    })
  }

  /**
   * Get performance rating based on Web Vitals thresholds
   */
  private getRating(metric: keyof typeof WEB_VITALS_THRESHOLDS, value: number): 'good' | 'needs-improvement' | 'poor' {
    const thresholds = WEB_VITALS_THRESHOLDS[metric]
    
    if (value <= thresholds.good) {
      return 'good'
    } else if (value <= thresholds.needsImprovement) {
      return 'needs-improvement'
    } else {
      return 'poor'
    }
  }

  /**
   * Record a general performance metric
   */
  public recordMetric(metric: Omit<PerformanceMetric, 'url' | 'userId'>): void {
    if (!this.isEnabled) return

    const fullMetric: PerformanceMetric = {
      ...metric,
      url: window.location.href,
      userId: this.userId
    }

    this.metrics.push(fullMetric)
    this.sendMetricToAnalytics(fullMetric)
  }

  /**
   * Record a Web Vital metric
   */
  public recordWebVital(metric: Omit<WebVitalsMetric, 'url' | 'userId'>): void {
    if (!this.isEnabled) return

    const fullMetric: WebVitalsMetric = {
      ...metric,
      url: window.location.href,
      userId: this.userId
    }

    this.metrics.push(fullMetric)
    this.sendMetricToAnalytics(fullMetric)

    // Log poor performance
    if (fullMetric.rating === 'poor') {
      logger.warn(`Poor ${fullMetric.name.toUpperCase()} performance:`, {
        value: fullMetric.value,
        threshold: WEB_VITALS_THRESHOLDS[fullMetric.name.toUpperCase() as keyof typeof WEB_VITALS_THRESHOLDS]
      })
    }
  }

  /**
   * Record a custom metric
   */
  public recordCustomMetric(metric: Omit<CustomMetric, 'url' | 'userId' | 'timestamp'>): void {
    if (!this.isEnabled) return

    const fullMetric: CustomMetric = {
      ...metric,
      timestamp: Date.now(),
      url: window.location.href,
      userId: this.userId
    }

    this.metrics.push(fullMetric)
    this.sendMetricToAnalytics(fullMetric)
  }

  /**
   * Measure function execution time
   */
  public measureFunction<T>(
    name: string,
    fn: () => T | Promise<T>,
    category: CustomMetric['category'] = 'user-interaction'
  ): T | Promise<T> {
    const startTime = performance.now()
    
    const finish = (result: T) => {
      const duration = performance.now() - startTime
      this.recordCustomMetric({
        name: `function-${name}`,
        value: duration,
        category,
        metadata: { functionName: name }
      })
      return result
    }

    try {
      const result = fn()
      
      if (result instanceof Promise) {
        return result.then(finish).catch((error) => {
          finish(error)
          throw error
        })
      } else {
        return finish(result)
      }
    } catch (error) {
      finish(error as T)
      throw error
    }
  }

  /**
   * Measure component render time
   */
  public measureComponentRender(componentName: string, renderTime: number): void {
    this.recordCustomMetric({
      name: 'component-render-time',
      value: renderTime,
      category: 'render',
      component: componentName,
      metadata: { type: 'component-render' }
    })
  }

  /**
   * Send metric to analytics service
   */
  private sendMetricToAnalytics(metric: PerformanceMetric): void {
    // In production, send to analytics service
    if (process.env.NODE_ENV === 'development') {
      logger.debug('Performance metric:', metric)
    }

    // TODO: Integrate with actual analytics service
    // analytics.track('performance_metric', metric)
  }

  /**
   * Get all collected metrics
   */
  public getMetrics(): PerformanceMetric[] {
    return [...this.metrics]
  }

  /**
   * Get metrics by category
   */
  public getMetricsByCategory(category: string): PerformanceMetric[] {
    return this.metrics.filter(metric => 
      (metric as CustomMetric).category === category ||
      metric.metadata?.type === category
    )
  }

  /**
   * Get performance summary
   */
  public getPerformanceSummary(): {
    totalMetrics: number
    webVitals: Record<string, WebVitalsMetric | undefined>
    avgRenderTime: number
    sessionId: string
  } {
    const webVitals = {
      lcp: this.metrics.find(m => m.name === 'lcp') as WebVitalsMetric,
      fid: this.metrics.find(m => m.name === 'fid') as WebVitalsMetric,
      cls: this.metrics.find(m => m.name === 'cls') as WebVitalsMetric,
      fcp: this.metrics.find(m => m.name === 'fcp') as WebVitalsMetric
    }

    const renderMetrics = this.getMetricsByCategory('render')
    const avgRenderTime = renderMetrics.length > 0
      ? renderMetrics.reduce((sum, metric) => sum + metric.value, 0) / renderMetrics.length
      : 0

    return {
      totalMetrics: this.metrics.length,
      webVitals,
      avgRenderTime,
      sessionId: this.sessionId
    }
  }

  /**
   * Clear all metrics
   */
  public clearMetrics(): void {
    this.metrics = []
  }

  /**
   * Enable/disable metrics collection
   */
  public setEnabled(enabled: boolean): void {
    this.isEnabled = enabled
  }

  /**
   * Cleanup observers
   */
  public destroy(): void {
    this.observers.forEach(observer => observer.disconnect())
    this.observers = []
    this.clearMetrics()
  }
}

// Global performance collector instance
let globalCollector: PerformanceMetricsCollector | null = null

/**
 * Initialize global performance collector
 */
export function initializePerformanceMetrics(userId?: string): PerformanceMetricsCollector {
  if (typeof window === 'undefined') {
    throw new Error('Performance metrics can only be initialized in browser environment')
  }

  if (globalCollector) {
    globalCollector.destroy()
  }

  globalCollector = new PerformanceMetricsCollector(userId)
  return globalCollector
}

/**
 * Get global performance collector
 */
export function getPerformanceCollector(): PerformanceMetricsCollector | null {
  return globalCollector
}

/**
 * Quick performance measurement utilities
 */
export const perf = {
  /**
   * Mark start of performance measurement
   */
  mark(name: string): void {
    if (typeof window !== 'undefined' && 'performance' in window) {
      performance.mark(`${name}-start`)
    }
  },

  /**
   * Measure performance from marked start
   */
  measure(name: string, category: CustomMetric['category'] = 'user-interaction'): number {
    if (typeof window === 'undefined' || !('performance' in window)) {
      return 0
    }

    try {
      performance.mark(`${name}-end`)
      performance.measure(name, `${name}-start`, `${name}-end`)
      
      const measure = performance.getEntriesByName(name, 'measure')[0]
      const duration = measure ? measure.duration : 0

      // Record to collector if available
      if (globalCollector) {
        globalCollector.recordCustomMetric({
          name,
          value: duration,
          category,
          metadata: { type: 'manual-measurement' }
        })
      }

      // Cleanup marks
      performance.clearMarks(`${name}-start`)
      performance.clearMarks(`${name}-end`)
      performance.clearMeasures(name)

      return duration
    } catch (error) {
      logger.warn(`Failed to measure ${name}:`, error)
      return 0
    }
  },

  /**
   * Time a function execution
   */
  time<T>(name: string, fn: () => T): T {
    this.mark(name)
    try {
      const result = fn()
      this.measure(name, 'user-interaction')
      return result
    } catch (error) {
      this.measure(name, 'user-interaction')
      throw error
    }
  }
}

export default PerformanceMetricsCollector
