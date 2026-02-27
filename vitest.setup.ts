import { afterEach, beforeEach, vi } from 'vitest';

const baselineWindow = global.window;
const baselineDocument = global.document;

// Уменьшаем шум логов в тестах.
// В проекте используется pino-логгер, который по умолчанию пишет INFO в stdout,
// что может перегружать вывод и провоцировать нестабильность Vitest (RPC timeouts).
if (typeof process !== 'undefined') {
  process.env.LOG_LEVEL ||= 'error';
}

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

  // Полифил console.group*, console.table — могут отсутствовать в happy-dom среде Vitest
  (global.console as any).group = vi.fn();
  (global.console as any).groupEnd = vi.fn();
  (global.console as any).groupCollapsed = vi.fn();
  (global.console as any).table = vi.fn();

  // Keep native eval behavior for legacy tests that intentionally execute script payloads.
  // Blocking eval globally causes unrelated suites to fail during module bootstrap.

  // ВАЖНО: не переопределяем document.createElement глобально.
  // Иначе ломается happy-dom/React render pipeline (appendChild/inclusive ancestor checks).

  // Enhanced URL mocking
  if (!(global.URL as any).createObjectURL) {
    (global.URL as any).createObjectURL = vi.fn((_blob: unknown) => `blob:${Math.random()}`);
    (global.URL as any).revokeObjectURL = vi.fn();
  }

  // Mock Worker API for compression tests
  (global as any).Worker = vi.fn().mockImplementation((_scriptURL: string) => {
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
  (global as any).PerformanceObserver = vi.fn().mockImplementation((_callback: unknown) => {
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

  // Ensure Web Crypto helpers exist for storage/security tests.
  if (!(global as any).crypto) {
    (global as any).crypto = {};
  }
  if (typeof (global as any).crypto.randomUUID !== 'function') {
    (global as any).crypto.randomUUID = vi.fn(() => {
      const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;

      const hex = bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
    });
  }

  // Enhanced IndexedDB mocking
  (global as any).indexedDB = {
    open: vi.fn().mockImplementation((_name: string, _version?: number) => {
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
  (global as any).fetch = vi.fn().mockImplementation((url: string, _options?: unknown) => {
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

  // Some performance heuristics read navigator.platform directly.
  Object.defineProperty(global.navigator, 'platform', {
    value: 'MacIntel',
    configurable: true,
  });

  // Avoid patching document event listener methods globally.
  // Some UI tests rely on native DOM method binding semantics.
});

// Cleanup after each test
afterEach(() => {
  // В ряде perf-тестов глобальный document/window временно переопределяются.
  // Восстанавливаем эталон happy-dom, чтобы следующий suite не получил «сломанный» DOM.
  if (baselineWindow && global.window !== baselineWindow) {
    Object.defineProperty(global, 'window', {
      value: baselineWindow,
      writable: true,
      configurable: true,
    });
  }

  if (baselineDocument && global.document !== baselineDocument) {
    Object.defineProperty(global, 'document', {
      value: baselineDocument,
      writable: true,
      configurable: true,
    });
  }

  vi.clearAllMocks();
});
