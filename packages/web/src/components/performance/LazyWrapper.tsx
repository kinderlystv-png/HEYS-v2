// filepath: packages/web/src/components/performance/LazyWrapper.tsx

/**
 * HEYS EAP 3.0 - Universal Lazy Wrapper Component
 * 
 * Purpose: Universal wrapper for lazy loading any content with fallbacks
 * Features: Component lazy loading, image lazy loading, skeleton placeholders
 */

'use client'

import React, { Suspense } from 'react'

import { useLazyLoad, useLazyImage, useLazyComponent } from '../../hooks/useLazyLoad'

interface LazyWrapperProps {
  children?: React.ReactNode
  placeholder?: React.ReactNode
  fallback?: React.ReactNode
  className?: string
  threshold?: number
  rootMargin?: string
  delay?: number
  onLoad?: () => void
  onError?: (error: Error) => void
  trackPerformance?: boolean
}

interface LazyImageWrapperProps {
  src: string
  alt?: string
  className?: string
  placeholder?: React.ReactNode
  fallback?: React.ReactNode
  threshold?: number
  rootMargin?: string
  sizes?: string
  srcSet?: string
  onLoad?: (event: Event) => void
  onError?: (event: Event) => void
}

interface LazyComponentWrapperProps<T = Record<string, unknown>> {
  importFunction: () => Promise<{ default: React.ComponentType<T> }>
  componentProps?: T
  placeholder?: React.ReactNode
  fallback?: React.ReactNode
  className?: string
  threshold?: number
  rootMargin?: string
  onLoad?: () => void
  onError?: (error: Error) => void
}

/**
 * Default skeleton placeholder component
 */
function SkeletonPlaceholder({ 
  className = '',
  lines = 3,
  height = 'auto'
}: {
  className?: string
  lines?: number
  height?: string
}): React.ReactElement {
  return (
    <div className={`animate-pulse ${className}`} style={{ height }}>
      <div className="space-y-3">
        {Array.from({ length: lines }, (_, index) => (
          <div
            key={index}
            className="h-4 bg-gray-200 rounded"
            style={{
              width: index === lines - 1 ? '75%' : '100%'
            }}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * Image skeleton placeholder
 */
function ImageSkeleton({ 
  className = '',
  aspectRatio = '16/9'
}: {
  className?: string
  aspectRatio?: string
}): React.ReactElement {
  return (
    <div 
      className={`animate-pulse bg-gray-200 rounded ${className}`}
      style={{ aspectRatio }}
    >
      <div className="flex items-center justify-center h-full">
        <svg 
          className="h-8 w-8 text-gray-300" 
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor"
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={2} 
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" 
          />
        </svg>
      </div>
    </div>
  )
}

/**
 * Error fallback component
 */
function ErrorFallback({ 
  error,
  retry,
  className = ''
}: {
  error?: Error
  retry?: () => void
  className?: string
}): React.ReactElement {
  return (
    <div className={`p-4 border border-red-200 rounded-lg bg-red-50 ${className}`}>
      <div className="flex items-center space-x-2 text-red-600 mb-2">
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={2} 
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" 
          />
        </svg>
        <span className="font-medium">Failed to load content</span>
      </div>
      {error && (
        <p className="text-sm text-red-500 mb-3">{error.message}</p>
      )}
      {retry && (
        <button
          onClick={retry}
          className="text-sm bg-red-100 hover:bg-red-200 text-red-700 px-3 py-1 rounded transition-colors duration-200"
          type="button"
        >
          Try Again
        </button>
      )}
    </div>
  )
}

/**
 * Universal lazy wrapper for any content
 */
export function LazyWrapper({
  children,
  placeholder,
  fallback,
  className = '',
  threshold = 0.1,
  rootMargin = '50px',
  delay = 0,
  onLoad,
  onError,
  trackPerformance = true
}: LazyWrapperProps): React.ReactElement {
  const { ref, state } = useLazyLoad({
    threshold,
    rootMargin,
    delay,
    onLoad,
    onError,
    trackPerformance
  })

  const renderContent = () => {
    if (state.hasError) {
      if (fallback) {
        return fallback
      }
      return <ErrorFallback error={state.error} className={className} />
    }

    if (state.isLoading) {
      if (placeholder) {
        return placeholder
      }
      return <SkeletonPlaceholder className={className} />
    }

    if (state.isLoaded) {
      return children
    }

    // Not visible yet, show placeholder
    if (placeholder) {
      return placeholder
    }
    return <SkeletonPlaceholder className={className} />
  }

  return (
    <div ref={ref} className={className}>
      {renderContent()}
    </div>
  )
}

/**
 * Lazy image wrapper with optimized loading
 */
export function LazyImageWrapper({
  src,
  alt = '',
  className = '',
  placeholder,
  fallback,
  threshold = 0.1,
  rootMargin = '50px',
  sizes,
  srcSet,
  onLoad,
  onError
}: LazyImageWrapperProps): React.ReactElement {
  const { ref, state, imgProps } = useLazyImage({
    src,
    alt,
    className,
    threshold,
    rootMargin,
    sizes,
    srcSet,
    onImageLoad: onLoad,
    onImageError: onError,
    trackPerformance: true
  })

  const renderContent = () => {
    if (state.hasError) {
      if (fallback) {
        return fallback
      }
      return (
        <ErrorFallback 
          error={state.error} 
          className={className}
        />
      )
    }

    if (state.isLoading) {
      if (placeholder) {
        return placeholder
      }
      return <ImageSkeleton className={className} />
    }

    if (state.isLoaded) {
      return <img ref={ref} {...imgProps} />
    }

    // Not visible yet, show placeholder
    if (placeholder) {
      return placeholder
    }
    return <ImageSkeleton className={className} />
  }

  return (
    <div className="lazy-image-wrapper">
      {renderContent()}
    </div>
  )
}

/**
 * Lazy component wrapper for dynamic imports
 */
export function LazyComponentWrapper<T = Record<string, unknown>>({
  importFunction,
  componentProps,
  placeholder,
  fallback,
  className = '',
  threshold = 0.1,
  rootMargin = '50px',
  onLoad,
  onError
}: LazyComponentWrapperProps<T>): React.ReactElement {
  const { ref, Component, state } = useLazyComponent(importFunction, {
    threshold,
    rootMargin,
    onLoad,
    onError,
    trackPerformance: true
  })

  const renderContent = () => {
    if (state.hasError) {
      if (fallback) {
        return fallback
      }
      return (
        <ErrorFallback 
          error={state.error}
          className={className}
        />
      )
    }

    if (state.isLoading) {
      if (placeholder) {
        return placeholder
      }
      return <SkeletonPlaceholder className={className} />
    }

    if (state.isLoaded && Component) {
      return <Component {...(componentProps || {} as T)} />
    }

    // Not visible yet, show placeholder
    if (placeholder) {
      return placeholder
    }
    return <SkeletonPlaceholder className={className} />
  }

  return (
    <div ref={ref} className={className}>
      <Suspense fallback={placeholder || <SkeletonPlaceholder />}>
        {renderContent()}
      </Suspense>
    </div>
  )
}

/**
 * Higher-order component for lazy loading
 */
export function withLazyLoading<P extends object>(
  Component: React.ComponentType<P>,
  options: Omit<LazyWrapperProps, 'children'> = {}
) {
  return function LazyLoadedComponent(props: P) {
    return (
      <LazyWrapper {...options}>
        <Component {...props} />
      </LazyWrapper>
    )
  }
}

/**
 * Batch lazy loading wrapper for lists
 */
interface BatchLazyWrapperProps<T> {
  items: T[]
  renderItem: (item: T, index: number) => React.ReactNode
  batchSize?: number
  delay?: number
  className?: string
  itemClassName?: string
  loadMoreText?: string
  showLoadMore?: boolean
  onLoadMore?: () => void
}

export function BatchLazyWrapper<T>({
  items,
  renderItem,
  batchSize = 10,
  delay = 100,
  className = '',
  itemClassName = '',
  loadMoreText = 'Load More',
  showLoadMore = true,
  onLoadMore
}: BatchLazyWrapperProps<T>): React.ReactElement {
  const [visibleCount, setVisibleCount] = React.useState(batchSize)
  const [isLoading, setIsLoading] = React.useState(false)

  const loadMore = React.useCallback(async () => {
    if (isLoading) return

    setIsLoading(true)
    
    // Simulate loading delay for better UX
    await new Promise(resolve => setTimeout(resolve, delay))
    
    setVisibleCount(prev => Math.min(prev + batchSize, items.length))
    setIsLoading(false)

    if (onLoadMore) {
      onLoadMore()
    }
  }, [isLoading, batchSize, items.length, delay, onLoadMore])

  const visibleItems = items.slice(0, visibleCount)
  const hasMore = visibleCount < items.length

  return (
    <div className={className}>
      {visibleItems.map((item, index) => (
        <div key={index} className={itemClassName}>
          {renderItem(item, index)}
        </div>
      ))}
      
      {hasMore && showLoadMore && (
        <div className="text-center mt-4">
          <button
            onClick={loadMore}
            disabled={isLoading}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
            type="button"
          >
            {isLoading ? 'Loading...' : loadMoreText}
          </button>
        </div>
      )}
      
      {isLoading && (
        <div className="flex justify-center mt-4">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
        </div>
      )}
    </div>
  )
}

/**
 * Intersection-based infinite scroll wrapper
 */
interface InfiniteScrollWrapperProps<T> {
  items: T[]
  renderItem: (item: T, index: number) => React.ReactNode
  onLoadMore: () => Promise<void>
  hasMore: boolean
  isLoading: boolean
  threshold?: number
  rootMargin?: string
  className?: string
  itemClassName?: string
  loadingComponent?: React.ReactNode
}

export function InfiniteScrollWrapper<T>({
  items,
  renderItem,
  onLoadMore,
  hasMore,
  isLoading,
  threshold = 0.1,
  rootMargin = '100px',
  className = '',
  itemClassName = '',
  loadingComponent
}: InfiniteScrollWrapperProps<T>): React.ReactElement {
  const { ref } = useLazyLoad({
    threshold,
    rootMargin,
    onLoad: onLoadMore,
    triggerOnce: false
  })

  return (
    <div className={className}>
      {items.map((item, index) => (
        <div key={index} className={itemClassName}>
          {renderItem(item, index)}
        </div>
      ))}
      
      {hasMore && (
        <div ref={ref} className="h-10 flex items-center justify-center">
          {isLoading && (
            loadingComponent || (
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            )
          )}
        </div>
      )}
    </div>
  )
}

export default LazyWrapper
