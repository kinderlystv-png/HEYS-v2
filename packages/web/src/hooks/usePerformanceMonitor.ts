// filepath: packages/web/src/hooks/usePerformanceMonitor.ts

/**
 * HEYS EAP 3.0 - Performance Monitor Hook
 * 
 * Purpose: React hook for performance monitoring and metrics collection
 * Features: Component-level performance tracking, custom metrics, real-time monitoring
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { 
  PerformanceMetricsCollector, 
  initializePerformanceMetrics, 
  getPerformanceCollector,
  perf
} from '../utils/performance/performanceMetrics'
import { 
  BundleAnalyzer, 
  initializeBundleAnalyzer, 
  getBundleAnalyzer 
} from '../utils/performance/bundleAnalyzer'

interface PerformanceMonitorOptions {
  componentName?: string
  trackRenders?: boolean
  trackInteractions?: boolean
  autoInit?: boolean
  userId?: string
}

interface PerformanceMetrics {
  renderTime: number
  renderCount: number
  lastRenderTime: number
  averageRenderTime: number
  interactionCount: number
  bundleSize: number
  loadTime: number
}

interface PerformanceHookReturn {
  metrics: PerformanceMetrics
  isMonitoring: boolean
  startMonitoring: () => void
  stopMonitoring: () => void
  trackRender: () => void
  trackInteraction: (name: string) => void
  measureFunction: <T>(name: string, fn: () => T) => T
  getBundleAnalysis: () => ReturnType<BundleAnalyzer['getBundleAnalysis']> | null
  getPerformanceScore: () => number
}

/**
 * Hook for performance monitoring and metrics collection
 */
export function usePerformanceMonitor({
  componentName = 'UnknownComponent',
  trackRenders = true,
  trackInteractions = true,
  autoInit = true,
  userId
}: PerformanceMonitorOptions = {}): PerformanceHookReturn {
  
  // State for metrics
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    renderTime: 0,
    renderCount: 0,
    lastRenderTime: 0,
    averageRenderTime: 0,
    interactionCount: 0,
    bundleSize: 0,
    loadTime: 0
  })
  
  const [isMonitoring, setIsMonitoring] = useState(false)
  
  // Refs for tracking
  const renderStartTime = useRef<number>(0)
  const renderTimes = useRef<number[]>([])
  const collector = useRef<PerformanceMetricsCollector | null>(null)
  const bundleAnalyzer = useRef<BundleAnalyzer | null>(null)
  const mountTime = useRef<number>(Date.now())

  /**
   * Initialize performance monitoring
   */
  const initializeMonitoring = useCallback(() => {
    if (typeof window === 'undefined') return

    try {
      // Initialize performance collector
      if (!collector.current) {
        collector.current = getPerformanceCollector() || initializePerformanceMetrics(userId)
      }

      // Initialize bundle analyzer
      if (!bundleAnalyzer.current) {
        bundleAnalyzer.current = getBundleAnalyzer() || initializeBundleAnalyzer()
      }

      setIsMonitoring(true)
    } catch (error) {
      console.warn('Failed to initialize performance monitoring:', error)
    }
  }, [userId])

  /**
   * Start monitoring
   */
  const startMonitoring = useCallback(() => {
    if (!isMonitoring) {
      initializeMonitoring()
    }
  }, [initializeMonitoring, isMonitoring])

  /**
   * Stop monitoring
   */
  const stopMonitoring = useCallback(() => {
    setIsMonitoring(false)
  }, [])

  /**
   * Track component render performance
   */
  const trackRender = useCallback(() => {
    if (!trackRenders || !isMonitoring) return

    const renderTime = performance.now() - renderStartTime.current
    
    // Update render times array
    renderTimes.current.push(renderTime)
    
    // Keep only last 50 renders for average calculation
    if (renderTimes.current.length > 50) {
      renderTimes.current = renderTimes.current.slice(-50)
    }

    // Calculate average
    const averageRenderTime = renderTimes.current.reduce((sum, time) => sum + time, 0) / renderTimes.current.length

    // Update metrics
    setMetrics(prev => ({
      ...prev,
      renderTime: renderTime,
      renderCount: prev.renderCount + 1,
      lastRenderTime: renderTime,
      averageRenderTime
    }))

    // Record to collector
    if (collector.current) {
      collector.current.measureComponentRender(componentName, renderTime)
    }
  }, [trackRenders, isMonitoring, componentName])

  /**
   * Track user interactions
   */
  const trackInteraction = useCallback((name: string) => {
    if (!trackInteractions || !isMonitoring) return

    setMetrics(prev => ({
      ...prev,
      interactionCount: prev.interactionCount + 1
    }))

    // Record custom metric
    if (collector.current) {
      collector.current.recordCustomMetric({
        name: `interaction-${name}`,
        value: Date.now() - mountTime.current,
        category: 'user-interaction',
        component: componentName
      })
    }
  }, [trackInteractions, isMonitoring, componentName])

  /**
   * Measure function execution time
   */
  const measureFunction = useCallback(<T>(name: string, fn: () => T): T => {
    if (!isMonitoring || !collector.current) {
      return fn()
    }

    return collector.current.measureFunction(name, fn, 'user-interaction')
  }, [isMonitoring])

  /**
   * Get bundle analysis
   */
  const getBundleAnalysis = useCallback(() => {
    if (!bundleAnalyzer.current) return null
    return bundleAnalyzer.current.getBundleAnalysis()
  }, [])

  /**
   * Get performance score
   */
  const getPerformanceScore = useCallback((): number => {
    let score = 100

    // Component render performance
    if (metrics.averageRenderTime > 50) score -= 20
    if (metrics.averageRenderTime > 100) score -= 30

    // Bundle performance
    if (bundleAnalyzer.current) {
      const analysis = bundleAnalyzer.current.getBundleAnalysis()
      if (analysis.totalSize > 1024 * 1024) score -= 25
      if (analysis.recommendations.length > 0) score -= 10
    }

    // Render consistency
    if (renderTimes.current.length > 10) {
      const variance = calculateVariance(renderTimes.current)
      if (variance > 100) score -= 15 // High variance means inconsistent performance
    }

    return Math.max(0, score)
  }, [metrics.averageRenderTime])

  /**
   * Calculate variance for render time consistency
   */
  const calculateVariance = (times: number[]): number => {
    const mean = times.reduce((sum, time) => sum + time, 0) / times.length
    const variance = times.reduce((sum, time) => sum + Math.pow(time - mean, 2), 0) / times.length
    return variance
  }

  // Auto-initialize on mount
  useEffect(() => {
    if (autoInit) {
      initializeMonitoring()
    }
  }, [autoInit, initializeMonitoring])

  // Track render start time
  useEffect(() => {
    renderStartTime.current = performance.now()
  })

  // Track render completion
  useEffect(() => {
    if (trackRenders && isMonitoring) {
      trackRender()
    }
  }, [trackRender, trackRenders, isMonitoring])

  // Update bundle size metrics
  useEffect(() => {
    if (!isMonitoring || !bundleAnalyzer.current) return

    const analysis = bundleAnalyzer.current.getBundleAnalysis()
    setMetrics(prev => ({
      ...prev,
      bundleSize: analysis.totalSize
    }))
  }, [isMonitoring])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (collector.current && renderTimes.current.length > 0) {
        // Record final component metrics
        collector.current.recordCustomMetric({
          name: `component-lifecycle-${componentName}`,
          value: Date.now() - mountTime.current,
          category: 'render',
          component: componentName,
          metadata: {
            totalRenders: metrics.renderCount,
            averageRenderTime: metrics.averageRenderTime,
            totalInteractions: metrics.interactionCount
          }
        })
      }
    }
  }, [componentName, metrics])

  return {
    metrics,
    isMonitoring,
    startMonitoring,
    stopMonitoring,
    trackRender,
    trackInteraction,
    measureFunction,
    getBundleAnalysis,
    getPerformanceScore
  }
}

/**
 * Hook for tracking specific function performance
 */
export function useFunctionPerformance(functionName: string) {
  const { measureFunction, isMonitoring } = usePerformanceMonitor({ 
    autoInit: true,
    componentName: `Function-${functionName}`
  })

  const trackFunction = useCallback(<T>(fn: () => T): T => {
    return measureFunction(functionName, fn)
  }, [measureFunction, functionName])

  return {
    trackFunction,
    isMonitoring
  }
}

/**
 * Hook for component interaction tracking
 */
export function useInteractionTracking(componentName: string) {
  const { trackInteraction, metrics, isMonitoring } = usePerformanceMonitor({
    componentName,
    trackRenders: false,
    trackInteractions: true,
    autoInit: true
  })

  const trackClick = useCallback((elementName?: string) => {
    trackInteraction(`click-${elementName || 'unknown'}`)
  }, [trackInteraction])

  const trackHover = useCallback((elementName?: string) => {
    trackInteraction(`hover-${elementName || 'unknown'}`)
  }, [trackInteraction])

  const trackFocus = useCallback((elementName?: string) => {
    trackInteraction(`focus-${elementName || 'unknown'}`)
  }, [trackInteraction])

  const trackCustom = useCallback((interactionType: string, elementName?: string) => {
    trackInteraction(`${interactionType}-${elementName || 'unknown'}`)
  }, [trackInteraction])

  return {
    trackClick,
    trackHover,
    trackFocus,
    trackCustom,
    interactionCount: metrics.interactionCount,
    isMonitoring
  }
}

/**
 * Hook for real-time performance monitoring
 */
export function useRealTimePerformance(updateInterval: number = 5000) {
  const [performanceData, setPerformanceData] = useState({
    score: 100,
    bundleSize: 0,
    renderPerformance: 0,
    recommendations: [] as string[]
  })

  const { 
    metrics, 
    getBundleAnalysis, 
    getPerformanceScore,
    isMonitoring 
  } = usePerformanceMonitor({ autoInit: true })

  useEffect(() => {
    if (!isMonitoring) return

    const interval = setInterval(() => {
      const bundleAnalysis = getBundleAnalysis()
      const score = getPerformanceScore()

      setPerformanceData({
        score,
        bundleSize: bundleAnalysis?.totalSize || 0,
        renderPerformance: metrics.averageRenderTime,
        recommendations: bundleAnalysis?.recommendations || []
      })
    }, updateInterval)

    return () => clearInterval(interval)
  }, [isMonitoring, updateInterval, getBundleAnalysis, getPerformanceScore, metrics])

  return performanceData
}

export default usePerformanceMonitor
