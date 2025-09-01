/**
 * Test Environment Setup
 * Provides browser API mocks for Node.js test environment
 */

import { vi, beforeEach, afterEach } from 'vitest';

// Mock IndexedDB
const mockIndexedDB = {
  open: vi.fn().mockImplementation((name: string, version?: number) => {
    const request = {
      result: null as any,
      error: null,
      readyState: 'pending',
      onsuccess: null as any,
      onerror: null as any,
      onupgradeneeded: null as any
    };

    // Simulate async operation
    setTimeout(() => {
      const db = {
        name,
        version: version || 1,
        objectStoreNames: [],
        createObjectStore: vi.fn().mockReturnValue({
          name: 'mockStore',
          add: vi.fn(),
          get: vi.fn(),
          put: vi.fn(),
          delete: vi.fn(),
          clear: vi.fn(),
          createIndex: vi.fn()
        }),
        transaction: vi.fn().mockReturnValue({
          objectStore: vi.fn().mockReturnValue({
            add: vi.fn(),
            get: vi.fn(),
            put: vi.fn(),
            delete: vi.fn(),
            clear: vi.fn(),
            openCursor: vi.fn(),
            count: vi.fn()
          }),
          oncomplete: null,
          onerror: null,
          onabort: null
        }),
        close: vi.fn()
      };

      request.result = db;
      request.readyState = 'done';
      if (request.onsuccess) {
        request.onsuccess({ target: request } as any);
      }
    }, 0);

    return request;
  }),
  deleteDatabase: vi.fn()
};

// Mock URL.createObjectURL and revokeObjectURL
const mockURL = {
  createObjectURL: vi.fn().mockReturnValue('blob:mock-url'),
  revokeObjectURL: vi.fn(),
  parse: vi.fn((url: string) => {
    try {
      return new URL(url);
    } catch {
      return null;
    }
  })
};

// Mock Web Workers
const mockWorker = vi.fn().mockImplementation(() => ({
  postMessage: vi.fn(),
  terminate: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  onerror: null,
  onmessage: null
}));

// Mock PerformanceObserver
const mockPerformanceObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  disconnect: vi.fn(),
  takeRecords: vi.fn().mockReturnValue([])
}));

// Mock localStorage and sessionStorage
const createMockStorage = () => {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => store.get(key) || null),
    setItem: vi.fn((key: string, value: string) => store.set(key, value)),
    removeItem: vi.fn((key: string) => store.delete(key)),
    clear: vi.fn(() => store.clear()),
    get length() { return store.size; },
    key: vi.fn((index: number) => Array.from(store.keys())[index] || null)
  };
};

const mockLocalStorage = createMockStorage();
const mockSessionStorage = createMockStorage();

// Mock navigator
const mockNavigator = {
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  platform: 'Win32',
  maxTouchPoints: 0,
  connection: {
    effectiveType: '4g',
    downlink: 10,
    rtt: 50,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  },
  serviceWorker: {
    register: vi.fn().mockResolvedValue({
      scope: '/',
      active: { postMessage: vi.fn() }
    }),
    ready: Promise.resolve({
      active: { postMessage: vi.fn() }
    })
  },
  getBattery: vi.fn().mockResolvedValue({
    level: 0.8,
    charging: true,
    dischargingTime: Infinity,
    chargingTime: 0
  })
};

// Mock fetch for browser environment
const mockFetch = vi.fn().mockResolvedValue({
  ok: true,
  status: 200,
  statusText: 'OK',
  headers: new Map([
    ['content-type', 'application/json'],
    ['etag', '"mock-etag"'],
    ['last-modified', new Date().toUTCString()]
  ]),
  json: vi.fn().mockResolvedValue({}),
  text: vi.fn().mockResolvedValue(''),
  blob: vi.fn().mockResolvedValue(new Blob()),
  clone: vi.fn().mockReturnThis()
});

// Mock performance
const mockPerformance = {
  now: vi.fn().mockReturnValue(Date.now()),
  mark: vi.fn(),
  measure: vi.fn(),
  getEntriesByType: vi.fn().mockReturnValue([]),
  getEntriesByName: vi.fn().mockReturnValue([]),
  clearMarks: vi.fn(),
  clearMeasures: vi.fn()
};

// Apply mocks to global scope
beforeEach(() => {
  // Browser APIs
  (global as any).indexedDB = mockIndexedDB;
  // Make sure URL has createObjectURL
  if (!(global as any).URL) {
    (global as any).URL = class MockURL {
      constructor(url: string, _base?: string) {
        this.href = url;
        this.protocol = 'http:';
        this.host = 'localhost';
        this.pathname = '/';
      }
      href: string;
      protocol: string;
      host: string;
      pathname: string;
    };
  }
  (global as any).URL.createObjectURL = mockURL.createObjectURL;
  (global as any).URL.revokeObjectURL = mockURL.revokeObjectURL;
  (global as any).Worker = mockWorker;
  (global as any).PerformanceObserver = mockPerformanceObserver;
  
  // Use Object.defineProperty for readonly properties
  try {
    Object.defineProperty(global, 'localStorage', {
      value: mockLocalStorage,
      writable: true,
      configurable: true
    });
  } catch (e) {
    // Already exists, try to override
  }
  
  try {
    Object.defineProperty(global, 'sessionStorage', {
      value: mockSessionStorage,
      writable: true,
      configurable: true
    });
  } catch (e) {
    // Already exists, try to override
  }
  
  (global as any).navigator = mockNavigator;
  (global as any).fetch = mockFetch;
  (global as any).performance = mockPerformance;

  // Mock alert for security tests
  (global as any).alert = vi.fn();

  // Mock document if needed
  if (!(global as any).document) {
    (global as any).document = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      createElement: vi.fn().mockReturnValue({
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      })
    };
  }

  // Mock window object if needed for browser APIs
  if (!(global as any).window) {
    (global as any).window = global;
  }
  (global as any).window.PerformanceObserver = mockPerformanceObserver;

  // Reset all mocks
  vi.clearAllMocks();
});

afterEach(() => {
  // Clean up any persistent state
  mockLocalStorage.clear();
  mockSessionStorage.clear();
});

export {
  mockIndexedDB,
  mockURL,
  mockWorker,
  mockPerformanceObserver,
  mockLocalStorage,
  mockSessionStorage,
  mockNavigator,
  mockFetch,
  mockPerformance
};
