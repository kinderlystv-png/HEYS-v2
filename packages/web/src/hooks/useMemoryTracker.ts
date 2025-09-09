// filepath: packages/web/src/hooks/useMemoryTracker.ts

/**
 * HEYS EAP 3.0 - Memory Tracking Hook
 * 
 * Purpose: Monitor memory usage and detect memory leaks
 * Features: Real-time memory tracking, leak detection, optimization suggestions
 */

import React from 'react'

// Types
interface MemoryMetrics {
  usedJSHeapSize: number
  totalJSHeapSize: number
  jsHeapSizeLimit: number
  timestamp: number
}

interface MemoryLeak {
  id: string
  component: string
  startTime: number
  currentSize: number
  growthRate: number
  severity: 'low' | 'medium' | 'high' | 'critical'
}

interface MemoryState {
  metrics: MemoryMetrics[]
  currentMemory: MemoryMetrics | null
  leaks: MemoryLeak[]
  isTracking: boolean
  warnings: string[]
  memoryPressure: 'low' | 'medium' | 'high' | 'critical'
}

interface MemoryTrackerOptions {
  interval?: number
  maxSamples?: number
  leakThreshold?: number
  warningThreshold?: number
  trackComponents?: boolean
  autoCleanup?: boolean
}

interface ComponentMemoryData {
  name: string
  mountTime: number
  lastMemorySize: number
  growthSamples: number[]
}

// Memory utilities
class MemoryTracker {
  private metrics: MemoryMetrics[] = []
  private componentData = new Map<string, ComponentMemoryData>()
  private intervalId: number | null = null
  private options: Required<MemoryTrackerOptions>

  constructor(options: MemoryTrackerOptions = {}) {
    this.options = {
      interval: options.interval || 1000,
      maxSamples: options.maxSamples || 100,
      leakThreshold: options.leakThreshold || 50 * 1024 * 1024, // 50MB
      warningThreshold: options.warningThreshold || 100 * 1024 * 1024, // 100MB
      trackComponents: options.trackComponents !== false,
      autoCleanup: options.autoCleanup !== false
    }
  }

  getCurrentMemory(): MemoryMetrics | null {
    if (!this.isMemoryAPIAvailable()) {
      return null
    }

    try {
      const memory = (performance as any).memory
      return {
        usedJSHeapSize: memory.usedJSHeapSize,
        totalJSHeapSize: memory.totalJSHeapSize,
        jsHeapSizeLimit: memory.jsHeapSizeLimit,
        timestamp: Date.now()
      }
    } catch (error) {
      console.warn('Failed to get memory metrics:', error)
      return null
    }
  }

  startTracking(onUpdate?: (state: MemoryState) => void): void {
    if (this.intervalId) {
      this.stopTracking()
    }

    this.intervalId = window.setInterval(() => {
      const currentMemory = this.getCurrentMemory()
      if (currentMemory) {
        this.addMetric(currentMemory)
        
        if (onUpdate) {
          onUpdate(this.getState())
        }
      }
    }, this.options.interval)

    // Initial measurement
    const initialMemory = this.getCurrentMemory()
    if (initialMemory) {
      this.addMetric(initialMemory)
      if (onUpdate) {
        onUpdate(this.getState())
      }
    }
  }

  stopTracking(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  addMetric(metric: MemoryMetrics): void {
    this.metrics.push(metric)
    
    // Keep only the last N samples
    if (this.metrics.length > this.options.maxSamples) {
      this.metrics = this.metrics.slice(-this.options.maxSamples)
    }
  }

  registerComponent(name: string): void {
    if (!this.options.trackComponents) return

    const currentMemory = this.getCurrentMemory()
    if (currentMemory) {
      this.componentData.set(name, {
        name,
        mountTime: Date.now(),
        lastMemorySize: currentMemory.usedJSHeapSize,
        growthSamples: []
      })
    }
  }

  unregisterComponent(name: string): void {
    if (!this.options.trackComponents) return

    const componentInfo = this.componentData.get(name)
    if (componentInfo) {
      const currentMemory = this.getCurrentMemory()
      if (currentMemory) {
        const memoryDiff = currentMemory.usedJSHeapSize - componentInfo.lastMemorySize
        
        // If memory didn't decrease after unmount, potential leak
        if (memoryDiff > 1024 * 1024) { // 1MB threshold
          console.warn(`Potential memory leak in component ${name}: ${memoryDiff} bytes not freed`)
        }
      }
      
      this.componentData.delete(name)
    }
  }

  updateComponent(name: string): void {
    if (!this.options.trackComponents) return

    const componentInfo = this.componentData.get(name)
    const currentMemory = this.getCurrentMemory()
    
    if (componentInfo && currentMemory) {
      const memoryGrowth = currentMemory.usedJSHeapSize - componentInfo.lastMemorySize
      componentInfo.growthSamples.push(memoryGrowth)
      componentInfo.lastMemorySize = currentMemory.usedJSHeapSize
      
      // Keep only last 10 samples per component
      if (componentInfo.growthSamples.length > 10) {
        componentInfo.growthSamples = componentInfo.growthSamples.slice(-10)
      }
    }
  }

  detectLeaks(): MemoryLeak[] {
    if (this.metrics.length < 10) {
      return []
    }

    const leaks: MemoryLeak[] = []
    const recentMetrics = this.metrics.slice(-10)
    
    // Analyze memory growth patterns
    for (const [componentName, componentData] of this.componentData) {
      const averageGrowth = componentData.growthSamples.length > 0
        ? componentData.growthSamples.reduce((a, b) => a + b, 0) / componentData.growthSamples.length
        : 0

      if (averageGrowth > 1024 * 1024) { // 1MB average growth
        const severity = this.calculateLeakSeverity(averageGrowth)
        
        leaks.push({
          id: `${componentName}-${Date.now()}`,
          component: componentName,
          startTime: componentData.mountTime,
          currentSize: componentData.lastMemorySize,
          growthRate: averageGrowth,
          severity
        })
      }
    }

    // Check overall memory trend
    const memoryTrend = this.calculateMemoryTrend(recentMetrics)
    if (memoryTrend > this.options.leakThreshold) {
      leaks.push({
        id: `global-leak-${Date.now()}`,
        component: 'Global',
        startTime: recentMetrics[0]?.timestamp || Date.now(),
        currentSize: recentMetrics[recentMetrics.length - 1]?.usedJSHeapSize || 0,
        growthRate: memoryTrend,
        severity: this.calculateLeakSeverity(memoryTrend)
      })
    }

    return leaks
  }

  getOptimizationSuggestions(): string[] {
    const suggestions: string[] = []
    const currentMemory = this.getCurrentMemory()
    
    if (!currentMemory) {
      return ['Memory API not available - consider using a memory profiler']
    }

    const memoryUsagePercent = (currentMemory.usedJSHeapSize / currentMemory.jsHeapSizeLimit) * 100

    if (memoryUsagePercent > 80) {
      suggestions.push('High memory usage detected - consider implementing lazy loading')
      suggestions.push('Review large objects and arrays for potential optimization')
    }

    if (memoryUsagePercent > 60) {
      suggestions.push('Consider implementing component memoization')
      suggestions.push('Review event listeners for proper cleanup')
    }

    if (this.componentData.size > 50) {
      suggestions.push('High number of tracked components - consider component cleanup')
    }

    const leaks = this.detectLeaks()
    if (leaks.length > 0) {
      suggestions.push('Memory leaks detected - review component lifecycle methods')
      suggestions.push('Check for unreleased references and event listeners')
    }

    if (suggestions.length === 0) {
      suggestions.push('Memory usage is optimal')
    }

    return suggestions
  }

  getMemoryPressure(): 'low' | 'medium' | 'high' | 'critical' {
    const currentMemory = this.getCurrentMemory()
    if (!currentMemory) return 'low'

    const usagePercent = (currentMemory.usedJSHeapSize / currentMemory.jsHeapSizeLimit) * 100

    if (usagePercent > 90) return 'critical'
    if (usagePercent > 75) return 'high'
    if (usagePercent > 50) return 'medium'
    return 'low'
  }

  getState(): MemoryState {
    return {
      metrics: [...this.metrics],
      currentMemory: this.getCurrentMemory(),
      leaks: this.detectLeaks(),
      isTracking: this.intervalId !== null,
      warnings: this.getOptimizationSuggestions(),
      memoryPressure: this.getMemoryPressure()
    }
  }

  forceGC(): void {
    if ((window as any).gc) {
      (window as any).gc()
    } else {
      console.warn('Garbage collection not available')
    }
  }

  private isMemoryAPIAvailable(): boolean {
    return !!(performance as any)?.memory
  }

  private calculateMemoryTrend(metrics: MemoryMetrics[]): number {
    if (metrics.length < 2) return 0

    const first = metrics[0]
    const last = metrics[metrics.length - 1]
    
    return last.usedJSHeapSize - first.usedJSHeapSize
  }

  private calculateLeakSeverity(growthRate: number): 'low' | 'medium' | 'high' | 'critical' {
    const mb = 1024 * 1024
    
    if (growthRate > 50 * mb) return 'critical'
    if (growthRate > 20 * mb) return 'high'
    if (growthRate > 5 * mb) return 'medium'
    return 'low'
  }
}

// React Hook
export function useMemoryTracker(options: MemoryTrackerOptions = {}) {
  const trackerRef = React.useRef<MemoryTracker>()
  const [state, setState] = React.useState<MemoryState>({
    metrics: [],
    currentMemory: null,
    leaks: [],
    isTracking: false,
    warnings: [],
    memoryPressure: 'low'
  })

  // Initialize tracker
  React.useEffect(() => {
    if (!trackerRef.current) {
      trackerRef.current = new MemoryTracker(options)
    }
  }, [])

  // Start tracking
  const startTracking = React.useCallback(() => {
    if (trackerRef.current) {
      trackerRef.current.startTracking((newState) => {
        setState(newState)
      })
    }
  }, [])

  // Stop tracking
  const stopTracking = React.useCallback(() => {
    if (trackerRef.current) {
      trackerRef.current.stopTracking()
      setState(prev => ({ ...prev, isTracking: false }))
    }
  }, [])

  // Force garbage collection
  const forceGC = React.useCallback(() => {
    if (trackerRef.current) {
      trackerRef.current.forceGC()
      // Update metrics after GC
      setTimeout(() => {
        if (trackerRef.current) {
          setState(trackerRef.current.getState())
        }
      }, 100)
    }
  }, [])

  // Get current snapshot
  const getSnapshot = React.useCallback(() => {
    return trackerRef.current?.getState() || state
  }, [state])

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      if (trackerRef.current) {
        trackerRef.current.stopTracking()
      }
    }
  }, [])

  return {
    ...state,
    startTracking,
    stopTracking,
    forceGC,
    getSnapshot,
    formatBytes: (bytes: number) => {
      const sizes = ['Bytes', 'KB', 'MB', 'GB']
      if (bytes === 0) return '0 Bytes'
      const i = Math.floor(Math.log(bytes) / Math.log(1024))
      return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i]
    }
  }
}

// Component tracking hook
export function useComponentMemoryTracking(componentName: string) {
  const trackerRef = React.useRef<MemoryTracker>()

  React.useEffect(() => {
    if (!trackerRef.current) {
      trackerRef.current = new MemoryTracker()
    }

    // Register component on mount
    trackerRef.current.registerComponent(componentName)

    return () => {
      // Unregister component on unmount
      if (trackerRef.current) {
        trackerRef.current.unregisterComponent(componentName)
      }
    }
  }, [componentName])

  React.useEffect(() => {
    // Update component memory data on re-render
    if (trackerRef.current) {
      trackerRef.current.updateComponent(componentName)
    }
  })

  return {
    trackUpdate: () => {
      if (trackerRef.current) {
        trackerRef.current.updateComponent(componentName)
      }
    }
  }
}

// Memory leak detector hook
export function useMemoryLeakDetector(options: { threshold?: number; checkInterval?: number } = {}) {
  const [leaks, setLeaks] = React.useState<MemoryLeak[]>([])
  const [isDetecting, setIsDetecting] = React.useState(false)
  const trackerRef = React.useRef<MemoryTracker>()

  React.useEffect(() => {
    if (!trackerRef.current) {
      trackerRef.current = new MemoryTracker({
        leakThreshold: options.threshold || 50 * 1024 * 1024,
        interval: options.checkInterval || 5000
      })
    }
  }, [options.threshold, options.checkInterval])

  const startDetection = React.useCallback(() => {
    if (trackerRef.current && !isDetecting) {
      setIsDetecting(true)
      trackerRef.current.startTracking((state) => {
        setLeaks(state.leaks)
      })
    }
  }, [isDetecting])

  const stopDetection = React.useCallback(() => {
    if (trackerRef.current) {
      trackerRef.current.stopTracking()
      setIsDetecting(false)
    }
  }, [])

  const checkForLeaks = React.useCallback(() => {
    if (trackerRef.current) {
      const currentLeaks = trackerRef.current.detectLeaks()
      setLeaks(currentLeaks)
      return currentLeaks
    }
    return []
  }, [])

  React.useEffect(() => {
    return () => {
      if (trackerRef.current) {
        trackerRef.current.stopTracking()
      }
    }
  }, [])

  return {
    leaks,
    isDetecting,
    startDetection,
    stopDetection,
    checkForLeaks
  }
}

export default useMemoryTracker
