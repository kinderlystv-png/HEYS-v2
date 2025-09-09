// filepath: packages/web/src/utils/memoryProfiler.ts

/**
 * HEYS EAP 3.0 - Memory Profiler Utilities
 * 
 * Purpose: Advanced memory leak detection and profiling utilities
 * Features: DOM leak detection, closure tracking, object reference analysis
 */

import { logger } from '@heys/logger'

// Types
interface DOMLeakInfo {
  nodeName: string
  className: string
  id: string
  count: number
  size: number
  timestamp: number
}

interface ObjectReference {
  type: string
  constructor: string
  size: number
  path: string[]
  isCircular: boolean
}

interface MemorySnapshot {
  id: string
  timestamp: number
  totalObjects: number
  domNodes: number
  jsObjects: number
  totalSize: number
  leaks: DOMLeakInfo[]
  references: ObjectReference[]
}

interface ProfilerConfig {
  trackDOM: boolean
  trackObjects: boolean
  maxSnapshots: number
  snapshotInterval: number
  leakThreshold: number
}

/**
 * Advanced memory profiler for leak detection
 */
export class MemoryProfiler {
  private snapshots: MemorySnapshot[] = []
  private config: ProfilerConfig
  private intervalId: number | null = null
  private domObserver: MutationObserver | null = null
  private objectRegistry = new WeakMap<object, string>()
  private objectCounter = 0

  constructor(config: Partial<ProfilerConfig> = {}) {
    this.config = {
      trackDOM: config.trackDOM !== false,
      trackObjects: config.trackObjects !== false,
      maxSnapshots: config.maxSnapshots || 50,
      snapshotInterval: config.snapshotInterval || 30000, // 30 seconds
      leakThreshold: config.leakThreshold || 100
    }

    this.initializeDOMTracking()
  }

  /**
   * Start memory profiling
   */
  start(): void {
    if (this.intervalId) {
      this.stop()
    }

    this.takeSnapshot()
    
    this.intervalId = window.setInterval(() => {
      this.takeSnapshot()
      this.analyzeLeaks()
    }, this.config.snapshotInterval)

    logger.info('Memory profiler started')
  }

  /**
   * Stop memory profiling
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }

    if (this.domObserver) {
      this.domObserver.disconnect()
    }

    logger.info('Memory profiler stopped')
  }

  /**
   * Take a memory snapshot
   */
  takeSnapshot(): MemorySnapshot {
    const timestamp = Date.now()
    const snapshot: MemorySnapshot = {
      id: `snapshot-${timestamp}`,
      timestamp,
      totalObjects: 0,
      domNodes: 0,
      jsObjects: 0,
      totalSize: 0,
      leaks: [],
      references: []
    }

    if (this.config.trackDOM) {
      snapshot.domNodes = this.countDOMNodes()
      snapshot.leaks = this.detectDOMLeaks()
    }

    if (this.config.trackObjects) {
      const objectStats = this.analyzeJSObjects()
      snapshot.jsObjects = objectStats.count
      snapshot.references = objectStats.references
    }

    snapshot.totalObjects = snapshot.domNodes + snapshot.jsObjects
    snapshot.totalSize = this.estimateMemorySize(snapshot)

    this.addSnapshot(snapshot)
    return snapshot
  }

  /**
   * Analyze memory leaks between snapshots
   */
  analyzeLeaks(): MemorySnapshot[] {
    if (this.snapshots.length < 2) {
      return []
    }

    const leakedSnapshots: MemorySnapshot[] = []
    const current = this.snapshots[this.snapshots.length - 1]
    const previous = this.snapshots[this.snapshots.length - 2]

    // Analyze DOM leaks
    const domGrowth = current.domNodes - previous.domNodes
    if (domGrowth > this.config.leakThreshold) {
      logger.warn(`DOM leak detected: ${domGrowth} new nodes created`)
      leakedSnapshots.push(current)
    }

    // Analyze object leaks
    const objectGrowth = current.jsObjects - previous.jsObjects
    if (objectGrowth > this.config.leakThreshold) {
      logger.warn(`Object leak detected: ${objectGrowth} new objects created`)
      leakedSnapshots.push(current)
    }

    // Analyze specific leak patterns
    this.analyzeLeakPatterns(current, previous)

    return leakedSnapshots
  }

  /**
   * Get profiling report
   */
  getReport(): {
    snapshots: MemorySnapshot[]
    leaks: MemorySnapshot[]
    recommendations: string[]
  } {
    const leaks = this.analyzeLeaks()
    const recommendations = this.generateRecommendations()

    return {
      snapshots: [...this.snapshots],
      leaks,
      recommendations
    }
  }

  /**
   * Force garbage collection (if available)
   */
  forceGC(): boolean {
    try {
      if ((window as any).gc) {
        (window as any).gc()
        logger.info('Garbage collection triggered')
        return true
      }
      logger.warn('Garbage collection not available')
      return false
    } catch (error) {
      logger.error('Failed to trigger garbage collection:', error)
      return false
    }
  }

  /**
   * Track object reference
   */
  trackObject(obj: object, name: string): void {
    if (!this.config.trackObjects) return

    this.objectRegistry.set(obj, name)
    this.objectCounter++
  }

  /**
   * Check for circular references
   */
  detectCircularReferences(obj: any, visited = new Set(), path: string[] = []): ObjectReference[] {
    const references: ObjectReference[] = []

    if (visited.has(obj)) {
      references.push({
        type: typeof obj,
        constructor: obj.constructor?.name || 'Unknown',
        size: this.estimateObjectSize(obj),
        path: [...path],
        isCircular: true
      })
      return references
    }

    visited.add(obj)

    if (obj && typeof obj === 'object') {
      for (const [key, value] of Object.entries(obj)) {
        if (value && typeof value === 'object') {
          const childRefs = this.detectCircularReferences(
            value, 
            new Set(visited), 
            [...path, key]
          )
          references.push(...childRefs)
        }
      }
    }

    return references
  }

  /**
   * Private methods
   */
  private initializeDOMTracking(): void {
    if (!this.config.trackDOM || typeof window === 'undefined') {
      return
    }

    this.domObserver = new MutationObserver((mutations) => {
      let addedNodes = 0
      let removedNodes = 0

      mutations.forEach((mutation) => {
        addedNodes += mutation.addedNodes.length
        removedNodes += mutation.removedNodes.length
      })

      // Log significant DOM changes
      if (addedNodes > 10 || removedNodes > 10) {
        logger.debug(`DOM change: +${addedNodes}, -${removedNodes} nodes`)
      }
    })

    this.domObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: false
    })
  }

  private countDOMNodes(): number {
    if (typeof document === 'undefined') return 0
    
    return document.querySelectorAll('*').length
  }

  private detectDOMLeaks(): DOMLeakInfo[] {
    if (typeof document === 'undefined') return []

    const leaks: DOMLeakInfo[] = []
    const elementCounts = new Map<string, DOMLeakInfo>()

    // Count elements by type
    document.querySelectorAll('*').forEach((element) => {
      const key = `${element.nodeName}-${element.className}-${element.id}`
      const existing = elementCounts.get(key)
      
      if (existing) {
        existing.count++
      } else {
        elementCounts.set(key, {
          nodeName: element.nodeName,
          className: element.className,
          id: element.id,
          count: 1,
          size: this.estimateElementSize(element),
          timestamp: Date.now()
        })
      }
    })

    // Find potential leaks (high counts of same element type)
    elementCounts.forEach((info) => {
      if (info.count > 50) { // Threshold for potential leak
        leaks.push(info)
      }
    })

    return leaks
  }

  private analyzeJSObjects(): { count: number; references: ObjectReference[] } {
    let count = 0
    const references: ObjectReference[] = []

    // This is limited in browsers, but we can track what we have
    if ((window as any).performance?.measureUserAgentSpecificMemory) {
      // Use newer memory API if available
      (window as any).performance.measureUserAgentSpecificMemory()
        .then((result: any) => {
          logger.debug('Memory measurement:', result)
        })
        .catch((error: any) => {
          logger.debug('Memory measurement failed:', error)
        })
    }

    // Count tracked objects
    count = this.objectCounter

    return { count, references }
  }

  private analyzeLeakPatterns(current: MemorySnapshot, previous: MemorySnapshot): void {
    // Check for memory growth patterns
    const memoryGrowth = current.totalSize - previous.totalSize
    const timeSpan = current.timestamp - previous.timestamp
    const growthRate = memoryGrowth / (timeSpan / 1000) // bytes per second

    if (growthRate > 1024 * 1024) { // 1MB per second
      logger.warn(`High memory growth rate: ${this.formatBytes(growthRate)}/sec`)
    }

    // Check for specific DOM leak patterns
    current.leaks.forEach((leak) => {
      const previousLeak = previous.leaks.find(
        (prev) => prev.nodeName === leak.nodeName && 
                  prev.className === leak.className
      )

      if (previousLeak && leak.count > previousLeak.count * 1.5) {
        logger.warn(
          `DOM leak pattern: ${leak.nodeName}.${leak.className} grew from ${previousLeak.count} to ${leak.count}`
        )
      }
    })
  }

  private generateRecommendations(): string[] {
    const recommendations: string[] = []

    if (this.snapshots.length === 0) {
      return ['No snapshots available for analysis']
    }

    const latest = this.snapshots[this.snapshots.length - 1]

    if (latest.domNodes > 5000) {
      recommendations.push('High DOM node count detected - consider virtual scrolling')
    }

    if (latest.leaks.length > 0) {
      recommendations.push('DOM leaks detected - review component cleanup')
      recommendations.push('Check for unreleased event listeners')
    }

    if (this.snapshots.length > 1) {
      const first = this.snapshots[0]
      const growth = latest.totalSize - first.totalSize
      
      if (growth > 50 * 1024 * 1024) { // 50MB growth
        recommendations.push('Significant memory growth detected')
        recommendations.push('Consider implementing object pooling')
      }
    }

    if (recommendations.length === 0) {
      recommendations.push('Memory usage appears stable')
    }

    return recommendations
  }

  private addSnapshot(snapshot: MemorySnapshot): void {
    this.snapshots.push(snapshot)

    if (this.snapshots.length > this.config.maxSnapshots) {
      this.snapshots = this.snapshots.slice(-this.config.maxSnapshots)
    }
  }

  private estimateMemorySize(snapshot: MemorySnapshot): number {
    // Rough estimation
    const domSize = snapshot.domNodes * 200 // ~200 bytes per DOM node
    const objectSize = snapshot.jsObjects * 100 // ~100 bytes per JS object
    
    return domSize + objectSize
  }

  private estimateElementSize(element: Element): number {
    // Rough estimation based on element type and content
    const baseSize = 100 // Base object size
    const contentSize = (element.textContent?.length || 0) * 2 // 2 bytes per char
    const attributeSize = element.attributes.length * 50 // ~50 bytes per attribute
    
    return baseSize + contentSize + attributeSize
  }

  private estimateObjectSize(obj: any): number {
    if (typeof obj !== 'object' || obj === null) {
      return 8 // Primitive types
    }

    let size = 24 // Base object size

    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        size += key.length * 2 // Key string size
        size += this.estimateObjectSize(obj[key]) // Recursive size
      }
    }

    return size
  }

  private formatBytes(bytes: number): string {
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    if (bytes === 0) return '0 Bytes'
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i]
  }
}

/**
 * Memory leak detector utility
 */
export class MemoryLeakDetector {
  private profiler: MemoryProfiler
  private callbacks: Array<(leaks: MemorySnapshot[]) => void> = []

  constructor(config?: Partial<ProfilerConfig>) {
    this.profiler = new MemoryProfiler(config)
  }

  start(): void {
    this.profiler.start()
  }

  stop(): void {
    this.profiler.stop()
  }

  onLeakDetected(callback: (leaks: MemorySnapshot[]) => void): void {
    this.callbacks.push(callback)
  }

  checkForLeaks(): MemorySnapshot[] {
    const leaks = this.profiler.analyzeLeaks()
    
    if (leaks.length > 0) {
      this.callbacks.forEach(callback => callback(leaks))
    }

    return leaks
  }

  getReport() {
    return this.profiler.getReport()
  }
}

/**
 * Object pool for memory optimization
 */
export class ObjectPool<T> {
  private pool: T[] = []
  private createFn: () => T
  private resetFn: (obj: T) => void
  private maxSize: number

  constructor(
    createFn: () => T,
    resetFn: (obj: T) => void,
    maxSize: number = 100
  ) {
    this.createFn = createFn
    this.resetFn = resetFn
    this.maxSize = maxSize
  }

  acquire(): T {
    if (this.pool.length > 0) {
      return this.pool.pop()!
    }
    return this.createFn()
  }

  release(obj: T): void {
    if (this.pool.length < this.maxSize) {
      this.resetFn(obj)
      this.pool.push(obj)
    }
  }

  clear(): void {
    this.pool.length = 0
  }

  get size(): number {
    return this.pool.length
  }
}

/**
 * Memory-optimized event manager
 */
export class MemoryOptimizedEventManager {
  private listeners = new Map<string, Set<Function>>()
  private weakListeners = new WeakMap<object, Map<string, Function>>()

  addEventListener(
    target: EventTarget | string,
    event: string,
    listener: Function,
    options: { weak?: boolean } = {}
  ): void {
    if (options.weak && typeof target === 'object') {
      // Use WeakMap for automatic cleanup
      if (!this.weakListeners.has(target)) {
        this.weakListeners.set(target, new Map())
      }
      this.weakListeners.get(target)!.set(event, listener)
    } else {
      // Regular event listeners
      const key = typeof target === 'string' ? target : target.toString()
      if (!this.listeners.has(key)) {
        this.listeners.set(key, new Set())
      }
      this.listeners.get(key)!.add(listener)
    }
  }

  removeEventListener(target: EventTarget | string, event: string, listener: Function): void {
    if (typeof target === 'object' && this.weakListeners.has(target)) {
      this.weakListeners.get(target)!.delete(event)
    } else {
      const key = typeof target === 'string' ? target : target.toString()
      this.listeners.get(key)?.delete(listener)
    }
  }

  removeAllListeners(target?: EventTarget | string): void {
    if (target) {
      if (typeof target === 'object' && this.weakListeners.has(target)) {
        this.weakListeners.delete(target)
      } else {
        const key = typeof target === 'string' ? target : target.toString()
        this.listeners.delete(key)
      }
    } else {
      this.listeners.clear()
      // WeakMap will be automatically cleaned up
    }
  }

  getListenerCount(): number {
    let count = 0
    this.listeners.forEach(set => count += set.size)
    return count
  }
}

// Export utilities
export const memoryProfiler = new MemoryProfiler()
export const memoryLeakDetector = new MemoryLeakDetector()

export default {
  MemoryProfiler,
  MemoryLeakDetector,
  ObjectPool,
  MemoryOptimizedEventManager,
  memoryProfiler,
  memoryLeakDetector
}
