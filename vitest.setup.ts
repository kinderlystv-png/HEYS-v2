import { vi, beforeEach, afterEach } from 'vitest';

// Setup browser environment mocks
beforeEach(() => {
  // Enhanced security mocking for XSS protection
  (global as any).alert = vi.fn();
  (global as any).confirm = vi.fn(() => true);
  (global as any).prompt = vi.fn(() => 'test');
  
  // Enhanced console methods for clean test output
  (global.console as any).warn = vi.fn();
  (global.console as any).error = vi.fn();
  (global.console as any).log = vi.fn();
  
  // Security: Prevent any accidental script execution
  (global as any).eval = vi.fn(() => {
    throw new Error('eval() blocked for security in tests');
  });
  
  // Security: Mock dangerous DOM methods
  const mockCreateElement = vi.fn((tagName: string) => {
    const element: any = {
      tagName: tagName.toUpperCase(),
      innerHTML: '',
      textContent: '',
      setAttribute: vi.fn(),
      getAttribute: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      appendChild: vi.fn(),
      removeChild: vi.fn(),
      style: {},
      click: vi.fn(),
      focus: vi.fn(),
      blur: vi.fn(),
      src: '',
      href: '',
    };
    
    // Intercept dangerous assignments
    Object.defineProperty(element, 'innerHTML', {
      get: () => element._innerHTML || '',
      set: (value: string) => {
        // Security check - log but don't execute dangerous content
        if (value.includes('<script>') || value.includes('javascript:')) {
          console.warn('Security: Blocked potentially dangerous innerHTML assignment:', value.substring(0, 50));
        }
        element._innerHTML = value;
      },
    });
    
    return element;
  });
  
  // Mock document with security enhancements
  if (global.document) {
    (global.document as any).createElement = mockCreateElement;
  }
  
  // Enhanced URL mocking
  if (!(global.URL as any).createObjectURL) {
    (global.URL as any).createObjectURL = vi.fn((blob: any) => `blob:${Math.random()}`);
    (global.URL as any).revokeObjectURL = vi.fn();
  }
  
  // Mock Worker API for compression tests
  (global as any).Worker = vi.fn().mockImplementation((scriptURL: string) => {
    const worker = {
      postMessage: vi.fn(),
      terminate: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      onerror: null as any,
      onmessage: null as any,
      onmessageerror: null as any,
    };
    
    // Simulate successful worker initialization
    setTimeout(() => {
      if (worker.onmessage) {
        worker.onmessage({ data: { type: 'ready' } } as any);
      }
    }, 0);
    
    return worker;
  });
  
  // Enhanced PerformanceObserver mock
  (global as any).PerformanceObserver = vi.fn().mockImplementation((callback: any) => {
    return {
      observe: vi.fn(),
      disconnect: vi.fn(),
      takeRecords: vi.fn(() => []),
    };
  });
  
  // Mock supportedEntryTypes
  (global as any).PerformanceObserver.supportedEntryTypes = ['navigation', 'resource', 'measure'];
  
  // Mock performance.getEntriesByType
  if (!(global.performance as any).getEntriesByType) {
    (global.performance as any).getEntriesByType = vi.fn().mockReturnValue([]);
  }
  
  // Mock performance.now for consistent timing
  if (!(global.performance as any).now) {
    (global.performance as any).now = vi.fn(() => Date.now());
  }
  
  // Enhanced IndexedDB mocking
  (global as any).indexedDB = {
    open: vi.fn().mockImplementation((name: string, version?: number) => {
      const request = {
        readyState: 'pending',
        result: null as any,
        error: null,
        onsuccess: null as any,
        onerror: null as any,
        onupgradeneeded: null as any,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      };
      
      // Simulate successful database open
      setTimeout(() => {
        const db = {
          createObjectStore: vi.fn(),
          transaction: vi.fn().mockReturnValue({
            objectStore: vi.fn().mockReturnValue({
              add: vi.fn().mockReturnValue({
                onsuccess: null,
                onerror: null,
                addEventListener: vi.fn(),
              }),
              get: vi.fn().mockReturnValue({
                onsuccess: null,
                onerror: null,
                addEventListener: vi.fn(),
              }),
              delete: vi.fn().mockReturnValue({
                onsuccess: null,
                onerror: null,
                addEventListener: vi.fn(),
              }),
              clear: vi.fn().mockReturnValue({
                onsuccess: null,
                onerror: null,
                addEventListener: vi.fn(),
              }),
            }),
          }),
          close: vi.fn(),
        };
        
        request.result = db;
        request.readyState = 'done';
        
        if (request.onsuccess) {
          request.onsuccess({ target: request } as any);
        }
      }, 0);
      
      return request;
    }),
    deleteDatabase: vi.fn(),
    cmp: vi.fn(),
    databases: vi.fn().mockResolvedValue([]),
  };
  
  // Mock fetch for network tests
  (global as any).fetch = vi.fn().mockImplementation((url: string, options?: any) => {
    return Promise.resolve({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      url,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(''),
      blob: () => Promise.resolve(new Blob()),
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    });
  });
  
  // Mock navigator APIs
  Object.defineProperty(global.navigator, 'serviceWorker', {
    value: {
      register: vi.fn().mockResolvedValue({
        installing: null,
        waiting: null,
        active: null,
        scope: 'http://localhost:3000/',
        update: vi.fn(),
        unregister: vi.fn(),
      }),
    },
    configurable: true,
  });
  
  // Mock touch events
  Object.defineProperty(global.navigator, 'maxTouchPoints', {
    value: 0,
    configurable: true,
  });
  
  // Mock user agent for device detection
  Object.defineProperty(global.navigator, 'userAgent', {
    value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    configurable: true,
  });
  
  // Mock document for event listeners
  if (global.document) {
    const originalAddEventListener = global.document.addEventListener;
    const originalRemoveEventListener = global.document.removeEventListener;
    
    (global.document as any).addEventListener = vi.fn(originalAddEventListener);
    (global.document as any).removeEventListener = vi.fn(originalRemoveEventListener);
  }
});

// Cleanup after each test
afterEach(() => {
  vi.clearAllMocks();
});
