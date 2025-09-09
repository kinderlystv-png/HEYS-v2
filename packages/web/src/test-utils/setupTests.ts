// filepath: packages/web/src/test-utils/setupTests.ts

/**
 * HEYS EAP 3.0 - Test Setup Configuration
 * 
 * Purpose: Global test configuration and mocks
 * Features: jsdom setup, performance API mocks, global test utilities
 */

import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock IntersectionObserver
const mockIntersectionObserver = vi.fn()
mockIntersectionObserver.mockReturnValue({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
})
global.IntersectionObserver = mockIntersectionObserver

// Mock ResizeObserver
const mockResizeObserver = vi.fn()
mockResizeObserver.mockReturnValue({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
})
global.ResizeObserver = mockResizeObserver

// Mock Performance API
Object.defineProperty(global, 'performance', {
  writable: true,
  value: {
    now: vi.fn(() => Date.now()),
    mark: vi.fn(),
    measure: vi.fn(),
    getEntriesByType: vi.fn(() => []),
    getEntriesByName: vi.fn(() => []),
    clearMarks: vi.fn(),
    clearMeasures: vi.fn(),
    memory: {
      usedJSHeapSize: 1024 * 1024 * 10, // 10MB
      totalJSHeapSize: 1024 * 1024 * 50, // 50MB
      jsHeapSizeLimit: 1024 * 1024 * 100 // 100MB
    }
  }
})

// Mock Web Vitals
vi.mock('web-vitals', () => ({
  onCLS: vi.fn(),
  onFCP: vi.fn(),
  onFID: vi.fn(),
  onLCP: vi.fn(),
  onTTFB: vi.fn(),
}))

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(),
}
Object.defineProperty(global, 'localStorage', {
  writable: true,
  value: localStorageMock
})

// Mock sessionStorage
const sessionStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(),
}
Object.defineProperty(global, 'sessionStorage', {
  writable: true,
  value: sessionStorageMock
})

// Mock IndexedDB
const mockIDBRequest = {
  onsuccess: null,
  onerror: null,
  result: null,
  error: null,
}

const mockIDBDatabase = {
  transaction: vi.fn(() => ({
    objectStore: vi.fn(() => ({
      put: vi.fn(() => mockIDBRequest),
      get: vi.fn(() => mockIDBRequest),
      delete: vi.fn(() => mockIDBRequest),
      clear: vi.fn(() => mockIDBRequest),
      getAllKeys: vi.fn(() => mockIDBRequest),
    }))
  })),
  close: vi.fn(),
}

const mockIDBFactory = {
  open: vi.fn(() => ({
    ...mockIDBRequest,
    onupgradeneeded: null,
    result: mockIDBDatabase,
  })),
  deleteDatabase: vi.fn(() => mockIDBRequest),
}

Object.defineProperty(global, 'indexedDB', {
  writable: true,
  value: mockIDBFactory
})

// Mock requestAnimationFrame
global.requestAnimationFrame = vi.fn((cb) => {
  return setTimeout(cb, 16) // ~60fps
})

global.cancelAnimationFrame = vi.fn((id) => {
  clearTimeout(id)
})

// Mock logger
vi.mock('@heys/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }
}))

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Setup global test helpers
global.testUtils = {
  mockPerformanceEntry: (overrides = {}) => ({
    name: 'test-entry',
    entryType: 'measure',
    startTime: 0,
    duration: 100,
    ...overrides
  }),
  
  mockMemoryInfo: (overrides = {}) => ({
    usedJSHeapSize: 1024 * 1024 * 10,
    totalJSHeapSize: 1024 * 1024 * 50,
    jsHeapSizeLimit: 1024 * 1024 * 100,
    ...overrides
  }),
  
  mockIntersectionEntry: (overrides = {}) => ({
    isIntersecting: true,
    intersectionRatio: 1,
    boundingClientRect: {
      top: 0,
      left: 0,
      right: 100,
      bottom: 100,
      width: 100,
      height: 100,
    },
    rootBounds: {
      top: 0,
      left: 0,
      right: 1000,
      bottom: 1000,
      width: 1000,
      height: 1000,
    },
    target: document.createElement('div'),
    time: Date.now(),
    ...overrides
  }),
  
  flushPromises: () => new Promise(resolve => setTimeout(resolve, 0)),
  
  waitFor: async (condition: () => boolean, timeout = 1000) => {
    const start = Date.now()
    while (!condition() && Date.now() - start < timeout) {
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    if (!condition()) {
      throw new Error(`Condition not met within ${timeout}ms`)
    }
  }
}

// Cleanup after each test
afterEach(() => {
  vi.clearAllMocks()
  localStorageMock.clear()
  sessionStorageMock.clear()
})
