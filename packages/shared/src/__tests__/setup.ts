/**
 * Test Environment Setup
 * Provides browser API mocks for Node.js test environment
 */

import { afterEach, beforeEach, vi } from 'vitest';

type MockIDBReadyState = 'pending' | 'done';
type MockIDBOpenDBRequest = {
  result: IDBDatabase | null;
  error: DOMException | null;
  readyState: MockIDBReadyState;
  onsuccess: ((this: IDBRequest, ev: Event) => unknown) | null;
  onerror: ((this: IDBRequest, ev: Event) => unknown) | null;
  onupgradeneeded: ((this: IDBRequest, ev: IDBVersionChangeEvent) => unknown) | null;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
};

// Mock IndexedDB
const mockIndexedDB = {
  open: vi.fn().mockImplementation((name: string, version?: number) => {
    const request: MockIDBOpenDBRequest = {
      result: null,
      error: null,
      readyState: 'pending',
      onsuccess: null,
      onerror: null,
      onupgradeneeded: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };

    // Simulate async operation
    setTimeout(() => {
      const db = {
        name,
        version: version || 1,
        objectStoreNames: [],
        createObjectStore: vi.fn().mockReturnValue({
          name: 'mockStore',
          add: vi.fn().mockResolvedValue(undefined),
          get: vi.fn().mockResolvedValue(undefined),
          put: vi.fn().mockResolvedValue(undefined),
          delete: vi.fn().mockResolvedValue(undefined),
          clear: vi.fn().mockResolvedValue(undefined),
          createIndex: vi.fn(),
        }),
        transaction: vi.fn().mockReturnValue({
          objectStore: vi.fn().mockReturnValue({
            add: vi.fn().mockReturnValue({ onsuccess: null, onerror: null }),
            get: vi.fn().mockReturnValue({ onsuccess: null, onerror: null }),
            put: vi.fn().mockReturnValue({ onsuccess: null, onerror: null }),
            delete: vi.fn().mockReturnValue({ onsuccess: null, onerror: null }),
            clear: vi.fn().mockReturnValue({ onsuccess: null, onerror: null }),
            openCursor: vi.fn().mockReturnValue({ onsuccess: null, onerror: null }),
            count: vi.fn().mockReturnValue({ onsuccess: null, onerror: null }),
          }),
          oncomplete: null,
          onerror: null,
          onabort: null,
        }),
        close: vi.fn(),
      };

      request.result = db;
      request.readyState = 'done';
      if (request.onsuccess) {
        const event = new Event('success');
        Object.defineProperty(event, 'target', { value: request });
        request.onsuccess.call(request as unknown as IDBRequest, event);
      }
    }, 0);

    return request;
  }),
  deleteDatabase: vi.fn(),
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
  }),
};

// Extend global URL with our mocks
Object.assign(globalThis.URL, mockURL);

// Mock Web Workers
const mockWorker = vi.fn().mockImplementation(() => ({
  postMessage: vi.fn(),
  terminate: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  onerror: null,
  onmessage: null,
}));

// Mock PerformanceObserver
const mockPerformanceObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  disconnect: vi.fn(),
  takeRecords: vi.fn().mockReturnValue([]),
}));

// Mock localStorage and sessionStorage
const createMockStorage = () => {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => store.get(key) || null),
    setItem: vi.fn((key: string, value: string) => store.set(key, value)),
    removeItem: vi.fn((key: string) => store.delete(key)),
    clear: vi.fn(() => store.clear()),
    get length() {
      return store.size;
    },
    key: vi.fn((index: number) => Array.from(store.keys())[index] || null),
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
    removeEventListener: vi.fn(),
  },
  serviceWorker: {
    register: vi.fn().mockResolvedValue({
      scope: '/',
      active: { postMessage: vi.fn() },
    }),
    ready: Promise.resolve({
      active: { postMessage: vi.fn() },
    }),
  },
  getBattery: vi.fn().mockResolvedValue({
    level: 0.8,
    charging: true,
    dischargingTime: Infinity,
    chargingTime: 0,
  }),
};

// Mock fetch for browser environment
const mockFetch = vi.fn().mockResolvedValue({
  ok: true,
  status: 200,
  statusText: 'OK',
  headers: new Map([
    ['content-type', 'application/json'],
    ['etag', '"mock-etag"'],
    ['last-modified', new Date().toUTCString()],
  ]),
  json: vi.fn().mockResolvedValue({}),
  text: vi.fn().mockResolvedValue(''),
  blob: vi.fn().mockResolvedValue(new Blob()),
  clone: vi.fn().mockReturnThis(),
});

// Mock performance
const mockPerformance = {
  now: vi.fn().mockReturnValue(Date.now()),
  mark: vi.fn(),
  measure: vi.fn(),
  getEntriesByType: vi.fn().mockReturnValue([]),
  getEntriesByName: vi.fn().mockReturnValue([]),
  clearMarks: vi.fn(),
  clearMeasures: vi.fn(),
};

const globalEnv = globalThis as unknown as {
  indexedDB?: IDBFactory;
  URL?: typeof URL;
  Worker?: typeof Worker;
  PerformanceObserver?: typeof PerformanceObserver;
  navigator?: Navigator;
  fetch?: typeof fetch;
  performance?: Performance;
  alert?: (message?: string) => void;
  document?: Document;
  window?: Window & typeof globalThis;
  localStorage?: Storage;
  sessionStorage?: Storage;
};

// Apply mocks to global scope
beforeEach(() => {
  // Browser APIs
  globalEnv.indexedDB = mockIndexedDB as unknown as IDBFactory;
  // Make sure URL has createObjectURL
  if (!globalEnv.URL) {
    globalEnv.URL = class MockURL {
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
    } as unknown as typeof URL;
  }
  globalEnv.URL.createObjectURL = mockURL.createObjectURL;
  globalEnv.URL.revokeObjectURL = mockURL.revokeObjectURL;
  globalEnv.Worker = mockWorker as unknown as typeof Worker;
  globalEnv.PerformanceObserver = mockPerformanceObserver as unknown as typeof PerformanceObserver;

  // Use Object.defineProperty for readonly properties
  try {
    Object.defineProperty(globalThis, 'localStorage', {
      value: mockLocalStorage,
      writable: true,
      configurable: true,
    });
  } catch (e) {
    // Already exists, try to override
  }

  try {
    Object.defineProperty(globalThis, 'sessionStorage', {
      value: mockSessionStorage,
      writable: true,
      configurable: true,
    });
  } catch (e) {
    // Already exists, try to override
  }

  globalEnv.navigator = mockNavigator as Navigator;
  globalEnv.fetch = mockFetch as unknown as typeof fetch;
  globalEnv.performance = mockPerformance as unknown as Performance;

  // Mock alert for security tests
  globalEnv.alert = vi.fn();

  // Mock document if needed
  if (!globalEnv.document) {
    globalEnv.document = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      createElement: vi.fn().mockReturnValue({
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    } as unknown as Document;
  }

  // Mock window object if needed for browser APIs
  if (!globalEnv.window) {
    globalEnv.window = globalThis as unknown as Window & typeof globalThis;
  }
  globalEnv.window.PerformanceObserver =
    mockPerformanceObserver as unknown as typeof PerformanceObserver;

  // Reset all mocks
  vi.clearAllMocks();
});

afterEach(() => {
  // Clean up any persistent state
  mockLocalStorage.clear();
  mockSessionStorage.clear();
});

export {
  mockFetch,
  mockIndexedDB,
  mockLocalStorage,
  mockNavigator,
  mockPerformance,
  mockPerformanceObserver,
  mockSessionStorage,
  mockURL,
  mockWorker,
};
