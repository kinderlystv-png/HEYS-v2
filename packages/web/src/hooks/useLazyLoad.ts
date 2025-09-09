// filepath: packages/web/src/hooks/useLazyLoad.ts

/**
 * HEYS EAP 3.0 - Lazy Loading Hook
 * 
 * Purpose: Intelligent lazy loading with Intersection Observer and performance tracking
 * Features: Component lazy loading, image lazy loading, prefetching, performance metrics
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { getPerformanceCollector } from '../utils/performance/performanceMetrics'

interface LazyLoadOptions {
  threshold?: number
  rootMargin?: string
  triggerOnce?: boolean
  placeholder?: React.ReactNode
  fallback?: React.ReactNode
  onLoad?: () => void
  onError?: (error: Error) => void
  prefetch?: boolean
  delay?: number
  trackPerformance?: boolean
}

interface LazyLoadState {
  isVisible: boolean
  isLoaded: boolean
  isLoading: boolean
  hasError: boolean
  error?: Error
  loadTime?: number
}

interface LazyImageOptions extends LazyLoadOptions {
  src: string
  alt?: string
  className?: string
  onImageLoad?: (event: Event) => void
  onImageError?: (event: Event) => void
  sizes?: string
  srcSet?: string
}

/**
 * Core lazy loading hook using Intersection Observer
 */
export function useLazyLoad(options: LazyLoadOptions = {}): {
  ref: React.RefObject<HTMLElement>
  state: LazyLoadState
  load: () => Promise<void>
  reset: () => void
} {
  const {
    threshold = 0.1,
    rootMargin = '50px',
    triggerOnce = true,
    onLoad,
    onError,
    prefetch = false,
    delay = 0,
    trackPerformance = true
  } = options

  const ref = useRef<HTMLElement>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)
  const loadStartTime = useRef<number>(0)
  
  const [state, setState] = useState<LazyLoadState>({
    isVisible: false,
    isLoaded: false,
    isLoading: false,
    hasError: false
  })

  /**
   * Load content with performance tracking
   */
  const load = useCallback(async (): Promise<void> => {
    if (state.isLoading || state.isLoaded) return

    setState(prev => ({ ...prev, isLoading: true, hasError: false }))
    loadStartTime.current = performance.now()

    try {
      // Apply delay if specified
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay))
      }

      // Trigger load callback
      if (onLoad) {
        await Promise.resolve(onLoad())
      }

      const loadTime = performance.now() - loadStartTime.current

      setState(prev => ({
        ...prev,
        isLoaded: true,
        isLoading: false,
        loadTime
      }))

      // Track performance metrics
      if (trackPerformance) {
        const collector = getPerformanceCollector()
        if (collector) {
          collector.recordCustomMetric({
            name: 'lazy-load-success',
            value: loadTime,
            category: 'user-interaction',
            metadata: {
              type: 'lazy-load',
              triggerOnce,
              threshold,
              delay
            }
          })
        }
      }

    } catch (error) {
      const loadTime = performance.now() - loadStartTime.current
      const err = error instanceof Error ? error : new Error('Unknown loading error')

      setState(prev => ({
        ...prev,
        isLoading: false,
        hasError: true,
        error: err,
        loadTime
      }))

      // Track error metrics
      if (trackPerformance) {
        const collector = getPerformanceCollector()
        if (collector) {
          collector.recordCustomMetric({
            name: 'lazy-load-error',
            value: loadTime,
            category: 'user-interaction',
            metadata: {
              type: 'lazy-load-error',
              error: err.message
            }
          })
        }
      }

      if (onError) {
        onError(err)
      }
    }
  }, [state.isLoading, state.isLoaded, delay, onLoad, onError, trackPerformance, triggerOnce, threshold])

  /**
   * Reset lazy loading state
   */
  const reset = useCallback(() => {
    setState({
      isVisible: false,
      isLoaded: false,
      isLoading: false,
      hasError: false
    })
  }, [])

  /**
   * Handle intersection observer callback
   */
  const handleIntersection = useCallback((entries: IntersectionObserverEntry[]) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        setState(prev => ({ ...prev, isVisible: true }))
        
        // Auto-load when visible
        load()

        // Disconnect observer if triggerOnce is true
        if (triggerOnce && observerRef.current) {
          observerRef.current.disconnect()
        }
      } else if (!triggerOnce) {
        setState(prev => ({ ...prev, isVisible: false }))
      }
    })
  }, [load, triggerOnce])

  /**
   * Setup Intersection Observer
   */
  useEffect(() => {
    const element = ref.current
    if (!element || typeof window === 'undefined' || !('IntersectionObserver' in window)) {
      return
    }

    observerRef.current = new IntersectionObserver(handleIntersection, {
      threshold,
      rootMargin
    })

    observerRef.current.observe(element)

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect()
      }
    }
  }, [handleIntersection, threshold, rootMargin])

  /**
   * Prefetch content when enabled
   */
  useEffect(() => {
    if (prefetch && !state.isLoaded && !state.isLoading) {
      // Prefetch with small delay to avoid blocking initial render
      const timer = setTimeout(load, 100)
      return () => clearTimeout(timer)
    }
  }, [prefetch, state.isLoaded, state.isLoading, load])

  return {
    ref,
    state,
    load,
    reset
  }
}

/**
 * Specialized hook for lazy loading images
 */
export function useLazyImage(options: LazyImageOptions): {
  ref: React.RefObject<HTMLImageElement>
  state: LazyLoadState
  imgProps: {
    src?: string
    alt?: string
    className?: string
    onLoad?: (event: React.SyntheticEvent<HTMLImageElement>) => void
    onError?: (event: React.SyntheticEvent<HTMLImageElement>) => void
    sizes?: string
    srcSet?: string
  }
  load: () => Promise<void>
  reset: () => void
} {
  const {
    src,
    alt = '',
    className = '',
    onImageLoad,
    onImageError,
    sizes,
    srcSet,
    ...lazyOptions
  } = options

  const imgRef = useRef<HTMLImageElement>(null)
  const imageLoadPromise = useRef<Promise<void> | null>(null)

  /**
   * Create image loading promise
   */
  const createImageLoadPromise = useCallback((): Promise<void> => {
    return new Promise((resolve, reject) => {
      const img = new Image()
      
      img.onload = (event) => {
        if (onImageLoad) {
          onImageLoad(event)
        }
        resolve()
      }
      
      img.onerror = (event) => {
        if (onImageError) {
          onImageError(event)
        }
        reject(new Error(`Failed to load image: ${src}`))
      }

      // Set image properties
      if (sizes) img.sizes = sizes
      if (srcSet) img.srcset = srcSet
      img.src = src
    })
  }, [src, onImageLoad, onImageError, sizes, srcSet])

  /**
   * Custom load function for images
   */
  const loadImage = useCallback(async () => {
    if (!imageLoadPromise.current) {
      imageLoadPromise.current = createImageLoadPromise()
    }
    return imageLoadPromise.current
  }, [createImageLoadPromise])

  const { ref, state, load, reset } = useLazyLoad({
    ...lazyOptions,
    onLoad: loadImage
  })

  // Combine refs
  const combinedRef = useCallback((node: HTMLImageElement | null) => {
    imgRef.current = node
    if (ref.current !== node) {
      (ref as React.MutableRefObject<HTMLImageElement | null>).current = node
    }
  }, [ref])

  /**
   * Image props for the img element
   */
  const imgProps = {
    ...(state.isLoaded && { src }),
    alt,
    className,
    sizes,
    srcSet: state.isLoaded ? srcSet : undefined,
    onLoad: onImageLoad as ((event: React.SyntheticEvent<HTMLImageElement>) => void) | undefined,
    onError: onImageError as ((event: React.SyntheticEvent<HTMLImageElement>) => void) | undefined
  }

  return {
    ref: combinedRef as React.RefObject<HTMLImageElement>,
    state,
    imgProps,
    load,
    reset
  }
}

/**
 * Hook for lazy loading React components
 */
export function useLazyComponent<T = any>(
  importFunction: () => Promise<{ default: React.ComponentType<T> }>,
  options: LazyLoadOptions = {}
): {
  ref: React.RefObject<HTMLElement>
  Component: React.ComponentType<T> | null
  state: LazyLoadState
  load: () => Promise<void>
  reset: () => void
} {
  const [Component, setComponent] = useState<React.ComponentType<T> | null>(null)
  const componentLoadPromise = useRef<Promise<void> | null>(null)

  /**
   * Load component dynamically
   */
  const loadComponent = useCallback(async () => {
    if (!componentLoadPromise.current) {
      componentLoadPromise.current = importFunction()
        .then((module) => {
          setComponent(() => module.default)
        })
        .catch((error) => {
          setComponent(null)
          throw error
        })
    }
    return componentLoadPromise.current
  }, [importFunction])

  const { ref, state, load, reset: basReset } = useLazyLoad({
    ...options,
    onLoad: loadComponent
  })

  /**
   * Reset component state
   */
  const reset = useCallback(() => {
    setComponent(null)
    componentLoadPromise.current = null
    basReset()
  }, [basReset])

  return {
    ref,
    Component,
    state,
    load,
    reset
  }
}

/**
 * Hook for batch lazy loading multiple items
 */
export function useBatchLazyLoad<T>(
  items: T[],
  batchSize: number = 5,
  delay: number = 100
): {
  loadedItems: T[]
  isLoading: boolean
  loadNextBatch: () => void
  loadAll: () => Promise<void>
  reset: () => void
} {
  const [loadedItems, setLoadedItems] = useState<T[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const currentBatch = useRef(0)

  /**
   * Load next batch of items
   */
  const loadNextBatch = useCallback(() => {
    if (isLoading) return

    const startIndex = currentBatch.current * batchSize
    const endIndex = Math.min(startIndex + batchSize, items.length)
    
    if (startIndex >= items.length) return

    setIsLoading(true)

    setTimeout(() => {
      const newItems = items.slice(startIndex, endIndex)
      setLoadedItems(prev => [...prev, ...newItems])
      currentBatch.current += 1
      setIsLoading(false)

      // Track batch loading performance
      const collector = getPerformanceCollector()
      if (collector) {
        collector.recordCustomMetric({
          name: 'batch-lazy-load',
          value: newItems.length,
          category: 'user-interaction',
          metadata: {
            batchSize,
            batchNumber: currentBatch.current,
            totalItems: items.length
          }
        })
      }
    }, delay)
  }, [items, batchSize, delay, isLoading])

  /**
   * Load all remaining items
   */
  const loadAll = useCallback(async () => {
    while (currentBatch.current * batchSize < items.length) {
      loadNextBatch()
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }, [items.length, batchSize, delay, loadNextBatch])

  /**
   * Reset batch loading
   */
  const reset = useCallback(() => {
    setLoadedItems([])
    setIsLoading(false)
    currentBatch.current = 0
  }, [])

  return {
    loadedItems,
    isLoading,
    loadNextBatch,
    loadAll,
    reset
  }
}

/**
 * Utility functions for lazy loading
 */
export const lazyUtils = {
  /**
   * Check if Intersection Observer is supported
   */
  isSupported(): boolean {
    return typeof window !== 'undefined' && 'IntersectionObserver' in window
  },

  /**
   * Preload image
   */
  preloadImage(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve()
      img.onerror = () => reject(new Error(`Failed to preload image: ${src}`))
      img.src = src
    })
  },

  /**
   * Preload multiple images
   */
  async preloadImages(sources: string[]): Promise<void[]> {
    return Promise.all(sources.map(src => this.preloadImage(src)))
  },

  /**
   * Get optimal batch size based on device capabilities
   */
  getOptimalBatchSize(): number {
    if (typeof navigator === 'undefined') return 5

    // Use connection information if available
    const connection = (navigator as any).connection
    if (connection) {
      if (connection.effectiveType === '4g') return 10
      if (connection.effectiveType === '3g') return 5
      if (connection.effectiveType === '2g') return 3
    }

    // Fallback based on device memory
    const deviceMemory = (navigator as any).deviceMemory
    if (deviceMemory) {
      if (deviceMemory >= 8) return 10
      if (deviceMemory >= 4) return 7
      if (deviceMemory >= 2) return 5
    }

    return 5 // Default batch size
  }
}

export default useLazyLoad
