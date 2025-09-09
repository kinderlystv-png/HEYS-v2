// filepath: packages/web/src/utils/performance/bundleAnalyzer.ts

/**
 * HEYS EAP 3.0 - Bundle Size Analyzer
 * 
 * Purpose: Monitor and analyze JavaScript bundle sizes in production
 * Features: Chunk analysis, size tracking, performance impact assessment
 */

interface BundleChunk {
  name: string
  size: number
  gzipSize?: number
  loadTime?: number
  isEntry: boolean
  isAsync: boolean
  modules?: string[]
}

interface BundleAnalysis {
  totalSize: number
  totalGzipSize: number
  chunkCount: number
  entryChunks: BundleChunk[]
  asyncChunks: BundleChunk[]
  largestChunks: BundleChunk[]
  duplicateModules: string[]
  recommendations: string[]
}

interface LoadTimeMetric {
  chunkName: string
  downloadTime: number
  parseTime: number
  executeTime: number
  totalTime: number
  networkCondition: 'fast' | 'slow' | 'offline'
}

/**
 * Bundle analyzer class for runtime analysis
 */
export class BundleAnalyzer {
  private chunks: Map<string, BundleChunk> = new Map()
  private loadTimes: LoadTimeMetric[] = []
  private moduleMap: Map<string, string[]> = new Map()

  constructor() {
    this.initializeAnalysis()
  }

  /**
   * Initialize bundle analysis by observing script loads
   */
  private initializeAnalysis(): void {
    if (typeof window === 'undefined') return

    // Observer for script loading
    this.observeScriptLoads()
    
    // Analyze existing scripts
    this.analyzeExistingScripts()
    
    // Monitor resource timing
    this.monitorResourceTiming()
  }

  /**
   * Observe new script loads using PerformanceObserver
   */
  private observeScriptLoads(): void {
    if (!('PerformanceObserver' in window)) return

    try {
      const observer = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          if (entry.name.includes('.js') || entry.name.includes('.mjs')) {
            this.analyzeScriptEntry(entry as PerformanceResourceTiming)
          }
        })
      })

      observer.observe({ entryTypes: ['resource'] })
    } catch (error) {
      console.warn('Failed to observe script loads:', error)
    }
  }

  /**
   * Analyze existing scripts in the document
   */
  private analyzeExistingScripts(): void {
    const scripts = document.querySelectorAll('script[src]')
    
    scripts.forEach((script) => {
      const src = script.getAttribute('src')
      if (src) {
        const chunk = this.createChunkFromScript(script as HTMLScriptElement)
        this.chunks.set(chunk.name, chunk)
      }
    })
  }

  /**
   * Monitor resource timing for performance analysis
   */
  private monitorResourceTiming(): void {
    if (!('performance' in window)) return

    // Check for existing resource entries
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
    
    resources.forEach((resource) => {
      if (resource.name.includes('.js') || resource.name.includes('.mjs')) {
        this.analyzeScriptEntry(resource)
      }
    })
  }

  /**
   * Analyze a script performance entry
   */
  private analyzeScriptEntry(entry: PerformanceResourceTiming): void {
    const chunkName = this.extractChunkName(entry.name)
    const size = entry.transferSize || entry.encodedBodySize || 0
    const gzipSize = entry.transferSize || 0

    const chunk: BundleChunk = {
      name: chunkName,
      size,
      gzipSize,
      loadTime: entry.duration,
      isEntry: this.isEntryChunk(entry.name),
      isAsync: this.isAsyncChunk(entry.name)
    }

    this.chunks.set(chunkName, chunk)

    // Record load time metrics
    const loadTimeMetric: LoadTimeMetric = {
      chunkName,
      downloadTime: entry.responseEnd - entry.responseStart,
      parseTime: entry.domContentLoadedEventEnd || 0,
      executeTime: entry.loadEventEnd || 0,
      totalTime: entry.duration,
      networkCondition: this.detectNetworkCondition(entry.duration, size)
    }

    this.loadTimes.push(loadTimeMetric)
  }

  /**
   * Create chunk info from script element
   */
  private createChunkFromScript(script: HTMLScriptElement): BundleChunk {
    const src = script.src
    const name = this.extractChunkName(src)
    
    return {
      name,
      size: 0, // Will be updated from performance entries
      isEntry: script.hasAttribute('data-entry') || name.includes('main'),
      isAsync: script.async || script.defer
    }
  }

  /**
   * Extract chunk name from script URL
   */
  private extractChunkName(url: string): string {
    const parts = url.split('/')
    const filename = parts[parts.length - 1]
    return filename.replace(/\?.*$/, '').replace(/\.(js|mjs)$/, '')
  }

  /**
   * Determine if chunk is an entry point
   */
  private isEntryChunk(url: string): boolean {
    return url.includes('main') || 
           url.includes('index') || 
           url.includes('app') ||
           url.includes('entry')
  }

  /**
   * Determine if chunk is loaded asynchronously
   */
  private isAsyncChunk(url: string): boolean {
    return url.includes('chunk') || 
           url.includes('lazy') || 
           url.includes('async')
  }

  /**
   * Detect network condition based on load time and size
   */
  private detectNetworkCondition(
    loadTime: number, 
    size: number
  ): 'fast' | 'slow' | 'offline' {
    if (loadTime === 0) return 'offline'
    
    const throughput = size / loadTime // bytes per ms
    
    if (throughput > 1000) return 'fast'    // > 1MB/s
    if (throughput > 100) return 'slow'     // > 100KB/s
    return 'offline'
  }

  /**
   * Get comprehensive bundle analysis
   */
  public getBundleAnalysis(): BundleAnalysis {
    const chunks = Array.from(this.chunks.values())
    const totalSize = chunks.reduce((sum, chunk) => sum + chunk.size, 0)
    const totalGzipSize = chunks.reduce((sum, chunk) => sum + (chunk.gzipSize || 0), 0)
    
    const entryChunks = chunks.filter(chunk => chunk.isEntry)
    const asyncChunks = chunks.filter(chunk => chunk.isAsync)
    const largestChunks = chunks
      .sort((a, b) => b.size - a.size)
      .slice(0, 5)

    const recommendations = this.generateRecommendations(chunks)

    return {
      totalSize,
      totalGzipSize,
      chunkCount: chunks.length,
      entryChunks,
      asyncChunks,
      largestChunks,
      duplicateModules: [], // TODO: Implement duplicate detection
      recommendations
    }
  }

  /**
   * Generate optimization recommendations
   */
  private generateRecommendations(chunks: BundleChunk[]): string[] {
    const recommendations: string[] = []
    
    // Large bundle warning
    const totalSize = chunks.reduce((sum, chunk) => sum + chunk.size, 0)
    if (totalSize > 1024 * 1024) { // > 1MB
      recommendations.push('Consider code splitting - total bundle size exceeds 1MB')
    }

    // Large individual chunks
    chunks.forEach(chunk => {
      if (chunk.size > 512 * 1024) { // > 512KB
        recommendations.push(`Large chunk detected: ${chunk.name} (${Math.round(chunk.size / 1024)}KB)`)
      }
    })

    // Too many chunks
    if (chunks.length > 20) {
      recommendations.push('Consider consolidating chunks - too many small chunks can hurt performance')
    }

    // Slow loading chunks
    this.loadTimes.forEach(metric => {
      if (metric.totalTime > 3000) { // > 3 seconds
        recommendations.push(`Slow loading chunk: ${metric.chunkName} (${Math.round(metric.totalTime)}ms)`)
      }
    })

    // Gzip recommendations
    chunks.forEach(chunk => {
      if (chunk.gzipSize && chunk.size > 0) {
        const compressionRatio = chunk.gzipSize / chunk.size
        if (compressionRatio > 0.8) { // Poor compression
          recommendations.push(`Poor compression for ${chunk.name} - consider optimizing content`)
        }
      }
    })

    return recommendations
  }

  /**
   * Get load time analysis
   */
  public getLoadTimeAnalysis(): {
    averageLoadTime: number
    slowestChunks: LoadTimeMetric[]
    networkConditions: Record<string, number>
    totalLoadTime: number
  } {
    const averageLoadTime = this.loadTimes.reduce((sum, metric) => sum + metric.totalTime, 0) / this.loadTimes.length || 0
    
    const slowestChunks = this.loadTimes
      .sort((a, b) => b.totalTime - a.totalTime)
      .slice(0, 5)

    const networkConditions = this.loadTimes.reduce((acc, metric) => {
      acc[metric.networkCondition] = (acc[metric.networkCondition] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    const totalLoadTime = this.loadTimes.reduce((sum, metric) => sum + metric.totalTime, 0)

    return {
      averageLoadTime,
      slowestChunks,
      networkConditions,
      totalLoadTime
    }
  }

  /**
   * Get chunk details by name
   */
  public getChunkDetails(chunkName: string): BundleChunk | undefined {
    return this.chunks.get(chunkName)
  }

  /**
   * Get all chunks
   */
  public getAllChunks(): BundleChunk[] {
    return Array.from(this.chunks.values())
  }

  /**
   * Format bytes to human readable format
   */
  public static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  /**
   * Export analysis data for external tools
   */
  public exportAnalysis(): {
    timestamp: number
    url: string
    analysis: BundleAnalysis
    loadTimes: LoadTimeMetric[]
    userAgent: string
  } {
    return {
      timestamp: Date.now(),
      url: window.location.href,
      analysis: this.getBundleAnalysis(),
      loadTimes: this.loadTimes,
      userAgent: navigator.userAgent
    }
  }

  /**
   * Monitor bundle changes over time
   */
  public startMonitoring(interval: number = 30000): () => void {
    const intervalId = setInterval(() => {
      const analysis = this.getBundleAnalysis()
      
      // Send to analytics or log
      console.log('Bundle Analysis Update:', {
        totalSize: BundleAnalyzer.formatBytes(analysis.totalSize),
        chunkCount: analysis.chunkCount,
        recommendations: analysis.recommendations.length
      })
    }, interval)

    return () => clearInterval(intervalId)
  }

  /**
   * Reset analysis data
   */
  public reset(): void {
    this.chunks.clear()
    this.loadTimes = []
    this.moduleMap.clear()
  }
}

// Global bundle analyzer instance
let globalAnalyzer: BundleAnalyzer | null = null

/**
 * Initialize global bundle analyzer
 */
export function initializeBundleAnalyzer(): BundleAnalyzer {
  if (typeof window === 'undefined') {
    throw new Error('Bundle analyzer can only be initialized in browser environment')
  }

  if (!globalAnalyzer) {
    globalAnalyzer = new BundleAnalyzer()
  }

  return globalAnalyzer
}

/**
 * Get global bundle analyzer
 */
export function getBundleAnalyzer(): BundleAnalyzer | null {
  return globalAnalyzer
}

/**
 * Utility functions for bundle analysis
 */
export const bundleUtils = {
  /**
   * Check if current page has large bundles
   */
  hasLargeBundles(threshold: number = 1024 * 1024): boolean {
    const analyzer = getBundleAnalyzer()
    if (!analyzer) return false
    
    const analysis = analyzer.getBundleAnalysis()
    return analysis.totalSize > threshold
  },

  /**
   * Get performance impact score (0-100)
   */
  getPerformanceScore(): number {
    const analyzer = getBundleAnalyzer()
    if (!analyzer) return 100
    
    const analysis = analyzer.getBundleAnalysis()
    const loadAnalysis = analyzer.getLoadTimeAnalysis()
    
    let score = 100
    
    // Deduct for large bundles
    if (analysis.totalSize > 1024 * 1024) score -= 20
    if (analysis.totalSize > 2 * 1024 * 1024) score -= 30
    
    // Deduct for slow loading
    if (loadAnalysis.averageLoadTime > 3000) score -= 25
    if (loadAnalysis.averageLoadTime > 5000) score -= 35
    
    // Deduct for too many chunks
    if (analysis.chunkCount > 20) score -= 15
    
    return Math.max(0, score)
  },

  /**
   * Get optimization suggestions
   */
  getOptimizationSuggestions(): string[] {
    const analyzer = getBundleAnalyzer()
    if (!analyzer) return []
    
    const analysis = analyzer.getBundleAnalysis()
    return analysis.recommendations
  }
}

export default BundleAnalyzer
