// filepath: packages/web/src/test-utils/mockData.ts

/**
 * HEYS EAP 3.0 - Test Mock Data
 * 
 * Purpose: Mock data for testing performance optimization system
 * Features: Performance metrics, memory data, cache entries
 */

export const mockPerformanceMetrics = {
  webVitals: {
    fcp: 1200,
    lcp: 2100,
    fid: 50,
    cls: 0.05,
    ttfb: 300
  },
  
  customMetrics: {
    domNodes: 245,
    eventListeners: 12,
    renderTime: 85,
    componentCount: 15
  },
  
  timestamp: Date.now()
}

export const mockMemoryInfo = {
  usedJSHeapSize: 1024 * 1024 * 15, // 15MB
  totalJSHeapSize: 1024 * 1024 * 40, // 40MB
  jsHeapSizeLimit: 1024 * 1024 * 100 // 100MB
}

export const mockCacheEntry = {
  key: 'test-key',
  data: { test: 'data' },
  timestamp: Date.now(),
  ttl: 60000, // 1 minute
  size: 1024,
  accessCount: 1,
  lastAccessed: Date.now()
}

export const mockCacheStats = {
  memoryHits: 45,
  memoryMisses: 12,
  storageHits: 23,
  storageMisses: 8,
  totalSize: 1024 * 50, // 50KB
  entryCount: 25,
  hitRate: 0.75
}

export const mockBundleInfo = {
  chunks: [
    {
      name: 'main.js',
      size: 1024 * 250, // 250KB
      loadTime: 850,
      type: 'initial'
    },
    {
      name: 'vendor.js',
      size: 1024 * 500, // 500KB
      loadTime: 1200,
      type: 'initial'
    },
    {
      name: 'async-component.js',
      size: 1024 * 80, // 80KB
      loadTime: 200,
      type: 'async'
    }
  ],
  totalSize: 1024 * 830, // 830KB
  recommendations: [
    {
      type: 'code-splitting',
      message: 'Consider splitting large chunks',
      impact: 'high'
    }
  ]
}

export const mockMemoryLeaks = [
  {
    id: 'leak-1',
    component: 'TestComponent',
    startTime: Date.now() - 60000,
    currentSize: 1024 * 10, // 10KB
    growthRate: 1024, // 1KB/sec
    severity: 'medium' as const
  }
]

export const mockLazyLoadState = {
  isLoading: false,
  isLoaded: true,
  hasError: false,
  error: null
}

export const mockIntersectionEntry = {
  isIntersecting: true,
  intersectionRatio: 1,
  boundingClientRect: {
    top: 100,
    left: 50,
    right: 250,
    bottom: 200,
    width: 200,
    height: 100,
    x: 50,
    y: 100,
    toJSON: () => ({})
  },
  rootBounds: {
    top: 0,
    left: 0,
    right: 1000,
    bottom: 800,
    width: 1000,
    height: 800,
    x: 0,
    y: 0,
    toJSON: () => ({})
  },
  intersectionRect: {
    top: 100,
    left: 50,
    right: 250,
    bottom: 200,
    width: 200,
    height: 100,
    x: 50,
    y: 100,
    toJSON: () => ({})
  },
  target: document.createElement('div'),
  time: Date.now()
}

export const mockPerformanceEntries = [
  {
    name: 'navigation',
    entryType: 'navigation',
    startTime: 0,
    duration: 1500,
    toJSON: () => ({})
  },
  {
    name: 'first-paint',
    entryType: 'paint',
    startTime: 800,
    duration: 0,
    toJSON: () => ({})
  },
  {
    name: 'first-contentful-paint',
    entryType: 'paint',
    startTime: 1200,
    duration: 0,
    toJSON: () => ({})
  }
]

export const mockComponent = {
  TestComponent: () => document.createElement('div')
}

export const createMockFile = (size: number = 1024): File => {
  const content = 'x'.repeat(size)
  return new File([content], 'test-file.txt', { type: 'text/plain' })
}

export const createMockImage = (width: number = 100, height: number = 100): HTMLImageElement => {
  const img = document.createElement('img')
  img.width = width
  img.height = height
  img.src = `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#ccc"/></svg>`)}`
  return img
}

export const waitForAsync = (ms: number = 0): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export const mockLocalStorage = () => {
  const store: Record<string, string> = {}
  
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      Object.keys(store).forEach(key => delete store[key])
    },
    length: Object.keys(store).length,
    key: (index: number) => Object.keys(store)[index] || null
  }
}

export default {
  mockPerformanceMetrics,
  mockMemoryInfo,
  mockCacheEntry,
  mockCacheStats,
  mockBundleInfo,
  mockMemoryLeaks,
  mockLazyLoadState,
  mockIntersectionEntry,
  mockPerformanceEntries,
  mockComponent,
  createMockFile,
  createMockImage,
  waitForAsync,
  mockLocalStorage
}
