/**
 * HEYS Service Worker for Advanced Caching
 * Implements comprehensive caching strategies for optimal performance
 *
 * @author HEYS Team
 * @version 1.4.0
 * @created 2025-01-31
 */

const CACHE_VERSION = 'heys-v1.4.0';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;
const API_CACHE = `${CACHE_VERSION}-api`;
const IMAGE_CACHE = `${CACHE_VERSION}-images`;

// Cache configuration
const CACHE_CONFIG = {
  staticTTL: 7 * 24 * 60 * 60 * 1000, // 7 days
  dynamicTTL: 24 * 60 * 60 * 1000, // 1 day
  apiTTL: 5 * 60 * 1000, // 5 minutes
  imageTTL: 30 * 24 * 60 * 60 * 1000, // 30 days
  maxEntries: {
    static: 100,
    dynamic: 50,
    api: 100,
    images: 200,
  },
};

// Static resources to precache
const STATIC_RESOURCES = [
  '/',
  '/manifest.webmanifest',
  '/offline.html',
  // Core JS/CSS will be added dynamically
];

// API endpoints for caching
const API_PATTERNS = [/^\/api\/users/, /^\/api\/meals/, /^\/api\/exercises/, /^\/api\/statistics/];

// Image patterns
const IMAGE_PATTERNS = [/\.(jpg|jpeg|png|gif|webp|svg)$/i];

/**
 * Cache strategies
 */
class CacheStrategy {
  /**
   * Network First strategy - try network, fallback to cache
   */
  static async networkFirst(request, cacheName, ttl = 0) {
    try {
      const networkResponse = await fetch(request);

      if (networkResponse.ok) {
        const cache = await caches.open(cacheName);
        const responseToCache = networkResponse.clone();

        // Add timestamp for TTL
        if (ttl > 0) {
          const headers = new Headers(responseToCache.headers);
          headers.set('sw-cache-timestamp', Date.now().toString());
          const modifiedResponse = new Response(responseToCache.body, {
            status: responseToCache.status,
            statusText: responseToCache.statusText,
            headers,
          });
          await cache.put(request, modifiedResponse);
        } else {
          await cache.put(request, responseToCache);
        }
      }

      return networkResponse;
    } catch (error) {
      const cache = await caches.open(cacheName);
      const cachedResponse = await cache.match(request);

      if (cachedResponse) {
        // Check TTL
        if (ttl > 0 && CacheStrategy.isExpired(cachedResponse, ttl)) {
          await cache.delete(request);
          throw new Error('Cache expired and network unavailable');
        }
        return cachedResponse;
      }

      throw error;
    }
  }

  /**
   * Cache First strategy - try cache, fallback to network
   */
  static async cacheFirst(request, cacheName, ttl = 0) {
    const cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(request);

    if (cachedResponse) {
      // Check TTL
      if (ttl > 0 && CacheStrategy.isExpired(cachedResponse, ttl)) {
        await cache.delete(request);
      } else {
        return cachedResponse;
      }
    }

    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      const responseToCache = networkResponse.clone();

      // Add timestamp for TTL
      if (ttl > 0) {
        const headers = new Headers(responseToCache.headers);
        headers.set('sw-cache-timestamp', Date.now().toString());
        const modifiedResponse = new Response(responseToCache.body, {
          status: responseToCache.status,
          statusText: responseToCache.statusText,
          headers,
        });
        await cache.put(request, modifiedResponse);
      } else {
        await cache.put(request, responseToCache);
      }
    }

    return networkResponse;
  }

  /**
   * Stale While Revalidate strategy
   */
  static async staleWhileRevalidate(request, cacheName, ttl = 0) {
    const cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(request);

    // Fetch in background
    const fetchPromise = fetch(request).then(async (networkResponse) => {
      if (networkResponse.ok) {
        const responseToCache = networkResponse.clone();

        // Add timestamp for TTL
        if (ttl > 0) {
          const headers = new Headers(responseToCache.headers);
          headers.set('sw-cache-timestamp', Date.now().toString());
          const modifiedResponse = new Response(responseToCache.body, {
            status: responseToCache.status,
            statusText: responseToCache.statusText,
            headers,
          });
          await cache.put(request, modifiedResponse);
        } else {
          await cache.put(request, responseToCache);
        }
      }
      return networkResponse;
    });

    // Return cached response immediately if available
    if (cachedResponse) {
      // Check if stale
      if (ttl > 0 && CacheStrategy.isExpired(cachedResponse, ttl)) {
        // Return network response if cache is stale
        return fetchPromise;
      }
      return cachedResponse;
    }

    // No cache, wait for network
    return fetchPromise;
  }

  /**
   * Check if cached response is expired
   */
  static isExpired(response, ttl) {
    const timestamp = response.headers.get('sw-cache-timestamp');
    if (!timestamp) return false;

    const cacheTime = parseInt(timestamp, 10);
    return Date.now() - cacheTime > ttl;
  }

  /**
   * Network Only strategy
   */
  static async networkOnly(request) {
    return fetch(request);
  }

  /**
   * Cache Only strategy
   */
  static async cacheOnly(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(request);

    if (!cachedResponse) {
      throw new Error('No cached response available');
    }

    return cachedResponse;
  }
}

/**
 * Cache management utilities
 */
class CacheManager {
  /**
   * Clean up old cache entries
   */
  static async cleanup() {
    const cacheNames = await caches.keys();

    for (const cacheName of cacheNames) {
      if (!cacheName.startsWith(CACHE_VERSION)) {
        await caches.delete(cacheName);
        continue;
      }

      const cache = await caches.open(cacheName);
      const requests = await cache.keys();

      // Get max entries for this cache type
      const cacheType = cacheName.split('-').pop();
      const maxEntries = CACHE_CONFIG.maxEntries[cacheType] || 50;

      if (requests.length > maxEntries) {
        // Sort by last accessed (if available) or remove oldest
        const sortedRequests = requests.slice(0, requests.length - maxEntries);

        for (const request of sortedRequests) {
          await cache.delete(request);
        }
      }
    }
  }

  /**
   * Preload critical resources
   */
  static async preloadCritical() {
    const cache = await caches.open(STATIC_CACHE);

    try {
      await cache.addAll(STATIC_RESOURCES);
    } catch (error) {
      console.warn('Failed to preload some critical resources:', error);
    }
  }

  /**
   * Get cache statistics
   */
  static async getStats() {
    const stats = {
      caches: {},
      totalSize: 0,
      totalEntries: 0,
    };

    const cacheNames = await caches.keys();

    for (const cacheName of cacheNames) {
      if (cacheName.startsWith(CACHE_VERSION)) {
        const cache = await caches.open(cacheName);
        const requests = await cache.keys();

        stats.caches[cacheName] = {
          entries: requests.length,
          // Size calculation would require reading all responses
          // For performance, we'll estimate based on entry count
          estimatedSize: requests.length * 10240, // ~10KB per entry estimate
        };

        stats.totalEntries += requests.length;
        stats.totalSize += stats.caches[cacheName].estimatedSize;
      }
    }

    return stats;
  }

  /**
   * Clear specific cache
   */
  static async clearCache(pattern) {
    const cacheNames = await caches.keys();

    for (const cacheName of cacheNames) {
      if (cacheName.includes(pattern)) {
        await caches.delete(cacheName);
      }
    }
  }
}

/**
 * Request routing
 */
function getRequestStrategy(request) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // Static resources (CSS, JS, fonts)
  if (pathname.match(/\.(css|js|woff2?|ttf|eot)$/)) {
    return {
      strategy: CacheStrategy.cacheFirst,
      cache: STATIC_CACHE,
      ttl: CACHE_CONFIG.staticTTL,
    };
  }

  // Images
  if (IMAGE_PATTERNS.some((pattern) => pattern.test(pathname))) {
    return {
      strategy: CacheStrategy.cacheFirst,
      cache: IMAGE_CACHE,
      ttl: CACHE_CONFIG.imageTTL,
    };
  }

  // API requests
  if (API_PATTERNS.some((pattern) => pattern.test(pathname))) {
    return {
      strategy: CacheStrategy.staleWhileRevalidate,
      cache: API_CACHE,
      ttl: CACHE_CONFIG.apiTTL,
    };
  }

  // HTML pages
  if (request.mode === 'navigate' || pathname.endsWith('.html') || pathname === '/') {
    return {
      strategy: CacheStrategy.networkFirst,
      cache: DYNAMIC_CACHE,
      ttl: CACHE_CONFIG.dynamicTTL,
    };
  }

  // Default: network first
  return {
    strategy: CacheStrategy.networkFirst,
    cache: DYNAMIC_CACHE,
    ttl: CACHE_CONFIG.dynamicTTL,
  };
}

/**
 * Background sync for offline actions
 */
class BackgroundSync {
  static queue = [];

  static async addToQueue(request) {
    const serialized = {
      url: request.url,
      method: request.method,
      headers: Array.from(request.headers.entries()),
      body: await request.text(),
      timestamp: Date.now(),
    };

    this.queue.push(serialized);
    await this.saveQueue();
  }

  static async processQueue() {
    const queue = await this.loadQueue();
    const processed = [];

    for (const item of queue) {
      try {
        const request = new Request(item.url, {
          method: item.method,
          headers: item.headers,
          body: item.body || undefined,
        });

        const response = await fetch(request);

        if (response.ok) {
          processed.push(item);
        }
      } catch (error) {
        // Keep in queue for next sync
        console.warn('Failed to sync request:', error);
      }
    }

    // Remove processed items
    this.queue = queue.filter((item) => !processed.includes(item));
    await this.saveQueue();

    return processed.length;
  }

  static async saveQueue() {
    // In a real implementation, you'd use IndexedDB
    // For now, we'll just keep in memory
  }

  static async loadQueue() {
    return this.queue;
  }
}

// Service Worker event handlers
self.addEventListener('install', (event) => {
  console.log('HEYS Service Worker installing...');

  event.waitUntil(
    CacheManager.preloadCritical().then(() => {
      return self.skipWaiting();
    }),
  );
});

self.addEventListener('activate', (event) => {
  console.log('HEYS Service Worker activating...');

  event.waitUntil(
    CacheManager.cleanup().then(() => {
      return self.clients.claim();
    }),
  );
});

self.addEventListener('fetch', (event) => {
  // Skip non-GET requests for caching (except for background sync)
  if (event.request.method !== 'GET') {
    // Handle POST/PUT/DELETE for background sync
    if (!navigator.onLine) {
      event.respondWith(
        BackgroundSync.addToQueue(event.request.clone()).then(() => {
          return new Response(
            JSON.stringify({
              queued: true,
              message: 'Request queued for sync when online',
            }),
            {
              headers: { 'Content-Type': 'application/json' },
              status: 202,
            },
          );
        }),
      );
      return;
    }

    // Let non-GET requests pass through
    return;
  }

  const requestStrategy = getRequestStrategy(event.request);

  event.respondWith(
    requestStrategy
      .strategy(event.request, requestStrategy.cache, requestStrategy.ttl)
      .catch(async (error) => {
        console.warn('Cache strategy failed:', error);

        // Fallback to offline page for navigation requests
        if (event.request.mode === 'navigate') {
          const cache = await caches.open(STATIC_CACHE);
          const offlinePage = await cache.match('/offline.html');
          if (offlinePage) {
            return offlinePage;
          }
        }

        // Return a generic offline response
        return new Response('Offline - Content not available', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'Content-Type': 'text/plain' },
        });
      }),
  );
});

// Background sync event
self.addEventListener('sync', (event) => {
  if (event.tag === 'heys-background-sync') {
    event.waitUntil(
      BackgroundSync.processQueue().then((processed) => {
        console.log(`Processed ${processed} queued requests`);
      }),
    );
  }
});

// Push notification event
self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json();

    event.waitUntil(
      self.registration.showNotification(data.title || 'HEYS', {
        body: data.body,
        icon: '/icons/icon-192.png',
        badge: '/icons/badge.png',
        data: data.data || {},
        actions: data.actions || [],
      }),
    );
  }
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'open') {
    event.waitUntil(self.clients.openWindow(event.notification.data.url || '/'));
  }
});

// Message event for communication with main thread
self.addEventListener('message', (event) => {
  if (event.data && event.data.type) {
    switch (event.data.type) {
      case 'GET_CACHE_STATS':
        CacheManager.getStats().then((stats) => {
          event.ports[0].postMessage({ type: 'CACHE_STATS', stats });
        });
        break;

      case 'CLEAR_CACHE':
        CacheManager.clearCache(event.data.pattern || '').then(() => {
          event.ports[0].postMessage({ type: 'CACHE_CLEARED' });
        });
        break;

      case 'FORCE_SYNC':
        BackgroundSync.processQueue().then((processed) => {
          event.ports[0].postMessage({
            type: 'SYNC_COMPLETE',
            processed,
          });
        });
        break;

      default:
        console.warn('Unknown message type:', event.data.type);
    }
  }
});

console.log('HEYS Service Worker loaded successfully');
