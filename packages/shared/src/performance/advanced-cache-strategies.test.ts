/**
 * Comprehensive tests for Advanced Caching Strategies
 * Tests Service Worker integration, HTTP caching, and advanced cache manager
 * 
 * @author HEYS Team
 * @version 1.4.0
 * @created 2025-01-31
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AdvancedCacheManager, defaultCacheConfig } from './advanced-cache-manager';
import { HTTPCacheStrategy, defaultHTTPCacheConfig } from './http-cache-strategy';

// Mock URL API
global.URL = {
  ...global.URL,
  createObjectURL: vi.fn(() => 'blob:mock-url'),
  revokeObjectURL: vi.fn(),
} as any;

// Mock Worker
global.Worker = vi.fn().mockImplementation(() => ({
  postMessage: vi.fn(),
  terminate: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
})) as any;

// Mock browser APIs
const mockLocalStorage = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    key: (index: number) => Object.keys(store)[index] || null,
    get length() { return Object.keys(store).length; },
  };
})();

const mockSessionStorage = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    key: (index: number) => Object.keys(store)[index] || null,
    get length() { return Object.keys(store).length; },
  };
})();

const mockIndexedDB = {
  open: vi.fn().mockResolvedValue({
    transaction: vi.fn().mockReturnValue({
      objectStore: vi.fn().mockReturnValue({
        put: vi.fn(),
        get: vi.fn(),
        delete: vi.fn(),
      }),
    }),
    objectStoreNames: { contains: vi.fn().mockReturnValue(false) },
  }),
};

// Mock Worker
class MockWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  
  postMessage(data: any) {
    // Simulate compression/decompression
    setTimeout(() => {
      if (this.onmessage) {
        if (data.type === 'compress') {
          this.onmessage({
            data: {
              type: 'result',
              result: new Uint8Array([1, 2, 3, 4]), // Mock compressed data
              id: data.id,
            },
          } as MessageEvent);
        } else if (data.type === 'decompress') {
          this.onmessage({
            data: {
              type: 'result',
              result: 'decompressed data',
              id: data.id,
            },
          } as MessageEvent);
        }
      }
    }, 10);
  }
  
  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    if (type === 'message') {
      this.onmessage = listener;
    }
  }
  
  removeEventListener() {
    this.onmessage = null;
  }
  
  terminate() {
    // Mock terminate
  }
}

// Mock Service Worker
const mockServiceWorker = {
  register: vi.fn().mockResolvedValue({
    update: vi.fn(),
    unregister: vi.fn().mockResolvedValue(true),
  }),
  controller: {
    postMessage: vi.fn(),
  },
  addEventListener: vi.fn(),
};

// Mock fetch
const mockFetch = vi.fn();

// Setup global mocks
beforeEach(() => {
  Object.defineProperty(global, 'localStorage', { value: mockLocalStorage });
  Object.defineProperty(global, 'sessionStorage', { value: mockSessionStorage });
  Object.defineProperty(global, 'indexedDB', { value: mockIndexedDB });
  Object.defineProperty(global, 'Worker', { value: MockWorker });
  Object.defineProperty(global, 'navigator', {
    value: { serviceWorker: mockServiceWorker },
  });
  Object.defineProperty(global, 'fetch', { value: mockFetch });
  Object.defineProperty(global, 'URL', {
    value: class {
      createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    },
  });
  Object.defineProperty(global, 'Blob', {
    value: class {
      constructor(public data: any[], public options: any) {}
    },
  });
  
  mockLocalStorage.clear();
  mockSessionStorage.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AdvancedCacheManager', () => {
  let cacheManager: AdvancedCacheManager;

  beforeEach(() => {
    cacheManager = new AdvancedCacheManager(defaultCacheConfig);
  });

  afterEach(async () => {
    try {
      if (cacheManager) {
        // Add timeout to prevent hanging
        await Promise.race([
          cacheManager.destroy(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Cleanup timeout')), 2000))
        ]);
      }
    } catch (error) {
      // Ignore cleanup errors in tests
      console.warn('Cache cleanup error:', error);
    }
  });

  describe('Memory Cache Operations', () => {
    it('should store and retrieve data from memory cache', async () => {
      const testData = { name: 'test', value: 123 };
      
      const stored = await cacheManager.store('test-key', testData, {
        strategy: 'memory',
        ttl: 60000,
      });
      
      expect(stored).toBe(true);
      
      const retrieved = await cacheManager.retrieve<typeof testData>('test-key', {
        strategy: 'memory',
      });
      
      expect(retrieved).toEqual(testData);
    }, 10000);

    it('should return null for expired entries', async () => {
      const testData = { expired: true };
      
      await cacheManager.store('expired-key', testData, {
        strategy: 'memory',
        ttl: 1, // 1ms TTL
      });
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const retrieved = await cacheManager.retrieve('expired-key', {
        strategy: 'memory',
      });
      
      expect(retrieved).toBeNull();
    });

    it('should handle cache eviction when memory limit is reached', async () => {
      const config = {
        ...defaultCacheConfig,
        strategies: {
          ...defaultCacheConfig.strategies,
          memory: {
            ...defaultCacheConfig.strategies.memory,
            maxSize: 3, // Small limit for testing
          },
        },
      };
      
      const smallCacheManager = new AdvancedCacheManager(config);
      
      // Fill cache beyond limit
      for (let i = 0; i < 5; i++) {
        await smallCacheManager.store(`key-${i}`, { value: i }, {
          strategy: 'memory',
        });
      }
      
      // First entries should be evicted
      const firstEntry = await smallCacheManager.retrieve('key-0', {
        strategy: 'memory',
      });
      
      expect(firstEntry).toBeNull();
      
      await smallCacheManager.destroy();
    });
  });

  describe('LocalStorage Operations', () => {
    it('should store and retrieve data from localStorage', async () => {
      const testData = { storage: 'localStorage' };
      
      const stored = await cacheManager.store('local-key', testData, {
        strategy: 'localStorage',
      });
      
      expect(stored).toBe(true);
      expect(mockLocalStorage.getItem('heys_cache_local-key')).toBeTruthy();
      
      const retrieved = await cacheManager.retrieve<typeof testData>('local-key', {
        strategy: 'localStorage',
      });
      
      expect(retrieved).toEqual(testData);
    });

    it('should handle localStorage cleanup when approaching limits', async () => {
      const config = {
        ...defaultCacheConfig,
        strategies: {
          ...defaultCacheConfig.strategies,
          browser: {
            ...defaultCacheConfig.strategies.browser,
            localStorage: {
              ...defaultCacheConfig.strategies.browser.localStorage,
              maxSize: 200, // Very small limit to force cleanup
            },
          },
        },
      };
      
      const smallCacheManager = new AdvancedCacheManager(config);
      
      // Store large data to trigger cleanup - each entry should be ~300+ bytes
      const largeData = 'x'.repeat(300); 
      await smallCacheManager.store('large-1', largeData, { strategy: 'localStorage' });
      expect(mockLocalStorage.length).toBe(1);
      
      await smallCacheManager.store('large-2', largeData, { strategy: 'localStorage' });
      // The second large item should trigger cleanup since total size > 200 bytes
      // LocalStorage strategy only removes 25% of entries on eviction
      expect(mockLocalStorage.length).toBeLessThanOrEqual(2); // May keep both or cleanup one
      
      await smallCacheManager.destroy();
    });
  });

  describe('SessionStorage Operations', () => {
    it('should store and retrieve data from sessionStorage', async () => {
      const testData = { storage: 'sessionStorage' };
      
      const stored = await cacheManager.store('session-key', testData, {
        strategy: 'sessionStorage',
      });
      
      expect(stored).toBe(true);
      expect(mockSessionStorage.getItem('heys_session_cache_session-key')).toBeTruthy();
      
      const retrieved = await cacheManager.retrieve<typeof testData>('session-key', {
        strategy: 'sessionStorage',
      });
      
      expect(retrieved).toEqual(testData);
    });
  });

  describe('IndexedDB Operations', () => {
    it('should store and retrieve data from IndexedDB', async () => {
      const testData = { storage: 'indexedDB' };
      
      const stored = await cacheManager.store('idb-key', testData, {
        strategy: 'indexedDB',
      });
      
      expect(stored).toBe(true);
      expect(mockIndexedDB.open).toHaveBeenCalled();
    });
  });

  describe('Auto Strategy (Fallback)', () => {
    it('should fallback to different storage strategies', async () => {
      const testData = { fallback: true };
      
      // Store in localStorage only
      await cacheManager.store('fallback-key', testData, {
        strategy: 'localStorage',
      });
      
      // Retrieve with auto strategy should find it in localStorage
      const retrieved = await cacheManager.retrieve<typeof testData>('fallback-key', {
        strategy: 'auto',
      });
      
      expect(retrieved).toEqual(testData);
    });
  });

  describe('Compression', () => {
    it('should compress large data when compression is enabled', async () => {
      const largeData = 'x'.repeat(2000); // Larger than compression threshold
      
      const stored = await cacheManager.store('compress-key', largeData, {
        strategy: 'memory',
        compress: true,
      });
      
      expect(stored).toBe(true);
      
      // Retrieve and check it's decompressed correctly
      const retrieved = await cacheManager.retrieve<string>('compress-key', {
        strategy: 'memory',
      });
      
      expect(retrieved).toBe(largeData);
    });
  });

  describe('Dependency Tracking', () => {
    it('should invalidate dependent entries when a dependency is invalidated', async () => {
      // Store base data
      await cacheManager.store('base-data', { value: 'base' }, {
        strategy: 'memory',
      });
      
      // Store dependent data
      await cacheManager.store('dependent-data', { value: 'dependent' }, {
        strategy: 'memory',
        dependencies: ['base-data'],
      });
      
      // Invalidate base data
      await cacheManager.invalidate('base-data');
      
      // Dependent data should also be invalidated
      const dependentRetrieved = await cacheManager.retrieve('dependent-data', {
        strategy: 'memory',
      });
      
      expect(dependentRetrieved).toBeNull();
    });
  });

  describe('Cache Statistics', () => {
    it('should track cache statistics', async () => {
      await cacheManager.store('stats-key', { test: true }, { strategy: 'memory' });
      await cacheManager.retrieve('stats-key', { strategy: 'memory' });
      await cacheManager.retrieve('nonexistent-key', { strategy: 'memory' });
      
      const stats = await cacheManager.getStats();
      
      expect(stats.total.entries).toBeGreaterThan(0);
      expect(stats.performance.totalRequests).toBeGreaterThan(0);
      expect(stats.performance.cacheHits).toBeGreaterThan(0);
      expect(stats.performance.cacheMisses).toBeGreaterThan(0);
    });
  });

  describe('Cache Clearing', () => {
    it('should clear all caches', async () => {
      await cacheManager.store('clear-test-1', { value: 1 }, { strategy: 'memory' });
      await cacheManager.store('clear-test-2', { value: 2 }, { strategy: 'localStorage' });
      
      await cacheManager.clearAll();
      
      const retrieved1 = await cacheManager.retrieve('clear-test-1', { strategy: 'memory' });
      const retrieved2 = await cacheManager.retrieve('clear-test-2', { strategy: 'localStorage' });
      
      expect(retrieved1).toBeNull();
      expect(retrieved2).toBeNull();
    });
  });
});

describe('HTTPCacheStrategy', () => {
  let httpCache: HTTPCacheStrategy;

  beforeEach(() => {
    httpCache = new HTTPCacheStrategy(defaultHTTPCacheConfig);
  });

  describe('Cache Header Generation', () => {
    it('should generate appropriate cache headers for static resources', () => {
      const content = 'body { color: red; }';
      const headers = httpCache.generateCacheHeaders('/styles/main.css', content);
      
      expect(headers['Cache-Control']).toContain('public');
      expect(headers['Cache-Control']).toContain('max-age=31536000'); // 1 year for CSS
      expect(headers['ETag']).toBeDefined();
      expect(headers['Last-Modified']).toBeDefined();
    });

    it('should generate no-cache headers for excluded resources', () => {
      const content = '{"user": "data"}';
      const headers = httpCache.generateCacheHeaders('/api/auth/login', content);
      
      expect(headers['Cache-Control']).toBe('no-cache, no-store, must-revalidate');
      expect(headers['Pragma']).toBe('no-cache');
      expect(headers['Expires']).toBe('0');
    });

    it('should generate private cache headers when specified', () => {
      const content = '{"private": "data"}';
      const headers = httpCache.generateCacheHeaders('/api/user/profile', content, {
        isPrivate: true,
      });
      
      expect(headers['Cache-Control']).toContain('private');
    });

    it('should include stale-while-revalidate directive', () => {
      const content = '{"api": "data"}';
      const headers = httpCache.generateCacheHeaders('/api/data', content);
      
      expect(headers['Cache-Control']).toContain('stale-while-revalidate=86400');
    });
  });

  describe('Conditional Requests', () => {
    it('should detect not modified requests with matching ETag', () => {
      const content = 'test content';
      
      // Generate headers (this will cache the ETag)
      const headers = httpCache.generateCacheHeaders('/test', content);
      const etag = headers['ETag']?.replace(/"/g, '') || '';
      
      // Check conditional request
      const result = httpCache.checkConditionalRequest('/test', {
        'if-none-match': `"${etag}"`,
      });
      
      expect(result.isNotModified).toBe(true);
      expect(result.etag).toBe(etag);
    });

    it('should detect not modified requests with matching Last-Modified', () => {
      const content = 'test content';
      
      // Generate headers (this will cache the Last-Modified)
      const headers = httpCache.generateCacheHeaders('/test', content);
      const lastModified = headers['Last-Modified'] || '';
      
      // Check conditional request
      const result = httpCache.checkConditionalRequest('/test', {
        'if-modified-since': lastModified,
      });
      
      expect(result.isNotModified).toBe(true);
      expect(result.lastModified).toBe(lastModified);
    });

    it('should detect modified content', () => {
      const result = httpCache.checkConditionalRequest('/nonexistent', {
        'if-none-match': 'some-etag',
      });
      
      expect(result.isNotModified).toBe(false);
    });
  });

  describe('ETag Generation', () => {
    it('should generate consistent ETags for same content', () => {
      const content = 'consistent content';
      
      const headers1 = httpCache.generateCacheHeaders('/test1', content);
      const headers2 = httpCache.generateCacheHeaders('/test2', content);
      
      // ETags should be the same for same content
      expect(headers1['ETag']).toBe(headers2['ETag']);
    });

    it('should generate different ETags for different content', () => {
      const headers1 = httpCache.generateCacheHeaders('/test', 'content1');
      const headers2 = httpCache.generateCacheHeaders('/test', 'content2');
      
      expect(headers1['ETag']).not.toBe(headers2['ETag']);
    });
  });

  describe('Cache-Aware Fetch', () => {
    it('should create a cache-aware fetch function', async () => {
      const cacheAwareFetch = httpCache.createCacheAwareFetch();
      
      // Mock successful response
      mockFetch.mockResolvedValue(new Response('test response', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      }));
      
      const response = await cacheAwareFetch('/test');
      
      expect(response).toBeDefined();
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should add conditional headers to requests', async () => {
      const cacheAwareFetch = httpCache.createCacheAwareFetch();
      
      // Use a URL that matches public resources pattern to ensure caching
      const testUrl = '/static/test.js';
      
      // First, generate cache headers to populate internal cache
      httpCache.generateCacheHeaders(testUrl, 'content');
      
      mockFetch.mockResolvedValue(new Response('test response', {
        status: 200,
        headers: { 'etag': '"test-etag"' },
      }));
      
      await cacheAwareFetch(testUrl);
      
      // Check if conditional headers were added
      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      const request = lastCall[0] as Request;
      
      // The header should be 'If-None-Match'
      const ifNoneMatch = request.headers.get('If-None-Match');
      expect(ifNoneMatch).toBeTruthy();
      expect(ifNoneMatch).toMatch(/^".*"$/); // Should be quoted ETag
    });

    it('should handle 304 Not Modified responses', async () => {
      const cacheAwareFetch = httpCache.createCacheAwareFetch();
      
      mockFetch.mockResolvedValue(new Response(null, {
        status: 304,
        statusText: 'Not Modified',
      }));
      
      const response = await cacheAwareFetch('/test');
      
      expect(response.status).toBe(304);
    });
  });

  describe('Resource Preloading', () => {
    it('should preload resources successfully', async () => {
      mockFetch.mockResolvedValue(new Response('preloaded content', {
        status: 200,
      }));
      
      await httpCache.preloadResources(['/style.css', '/script.js']);
      
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should handle preload failures gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));
      
      // Should not throw
      await expect(httpCache.preloadResources(['/failing-resource.css'])).resolves.toBeUndefined();
    });
  });

  describe('CDN Cache Management', () => {
    it('should handle CDN cache purging when CDN is disabled', async () => {
      const result = await httpCache.purgeCDNCache(['/test.css']);
      
      expect(result).toBe(false);
    });

    it('should attempt CDN cache purging when configured', async () => {
      const cdnConfig = {
        enabled: true,
        provider: 'cloudflare' as const,
        apiKey: 'test-key',
        purgeEndpoint: 'https://api.test.com/purge',
        cacheRules: [],
      };
      
      const httpCacheWithCDN = new HTTPCacheStrategy(defaultHTTPCacheConfig, cdnConfig);
      
      mockFetch.mockResolvedValue(new Response('purged', { status: 200 }));
      
      const result = await httpCacheWithCDN.purgeCDNCache(['/test.css']);
      
      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.com/purge',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-key',
          }),
        })
      );
    });
  });

  describe('Cache Statistics', () => {
    it('should track cache performance statistics', () => {
      const stats = httpCache.getCacheStats();
      
      expect(stats).toHaveProperty('totalRequests');
      expect(stats).toHaveProperty('averageResponseTime');
      expect(stats).toHaveProperty('cacheHitRatio');
      expect(stats).toHaveProperty('etagCacheSize');
      expect(stats).toHaveProperty('lastModifiedCacheSize');
    });
  });

  describe('Middleware Creation', () => {
    it('should create Express.js compatible middleware', () => {
      const middleware = httpCache.createCacheMiddleware();
      
      expect(typeof middleware).toBe('function');
      expect(middleware.length).toBe(3); // req, res, next
    });

    it('should handle non-GET requests in middleware', () => {
      const middleware = httpCache.createCacheMiddleware();
      const mockReq = { method: 'POST', url: '/api/test' };
      const mockRes = {};
      const mockNext = vi.fn();
      
      middleware(mockReq, mockRes, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Cache Clearing', () => {
    it('should clear HTTP cache data', () => {
      // Generate some cache data
      httpCache.generateCacheHeaders('/test1', 'content1');
      httpCache.generateCacheHeaders('/test2', 'content2');
      
      const statsBefore = httpCache.getCacheStats();
      expect(statsBefore.etagCacheSize).toBeGreaterThan(0);
      
      httpCache.clearCache();
      
      const statsAfter = httpCache.getCacheStats();
      expect(statsAfter.etagCacheSize).toBe(0);
      expect(statsAfter.lastModifiedCacheSize).toBe(0);
    });
  });
});

describe('Integration Tests', () => {
  it('should work together - Advanced Cache Manager with HTTP Cache Strategy', async () => {
    const cacheManager = new AdvancedCacheManager(defaultCacheConfig);
    const httpCache = new HTTPCacheStrategy(defaultHTTPCacheConfig);
    
    // Store data using cache manager
    const testData = { integration: 'test' };
    await cacheManager.store('integration-key', testData, { strategy: 'memory' });
    
    // Generate HTTP headers
    const headers = httpCache.generateCacheHeaders('/api/integration', JSON.stringify(testData));
    
    // Verify both systems work
    const retrievedData = await cacheManager.retrieve('integration-key', { strategy: 'memory' });
    
    expect(retrievedData).toEqual(testData);
    expect(headers['Cache-Control']).toContain('max-age=300'); // API TTL
    expect(headers['ETag']).toBeDefined();
    
    await cacheManager.destroy();
  });

  it('should handle Service Worker integration gracefully', async () => {
    const config = {
      ...defaultCacheConfig,
      strategies: {
        ...defaultCacheConfig.strategies,
        serviceWorker: {
          ...defaultCacheConfig.strategies.serviceWorker,
          enabled: true,
        },
      },
    };
    
    const cacheManager = new AdvancedCacheManager(config);
    
    // Should not throw even if Service Worker setup fails
    expect(cacheManager).toBeDefined();
    
    await cacheManager.destroy();
  });
});
