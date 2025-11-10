/**
 * HTTP Caching Strategies for HEYS Application
 * Implements intelligent HTTP caching, ETags, Cache-Control headers,
 * and CDN integration for optimal performance
 *
 * @author HEYS Team
 * @version 1.4.0
 * @created 2025-01-31
 */

export interface HTTPCacheConfig {
  defaultTTL: number;
  maxAge: number;
  staleWhileRevalidate: number;
  mustRevalidate: boolean;
  noCache: string[];
  privateResources: string[];
  publicResources: string[];
  compressionTypes: string[];
  varyHeaders: string[];
}

export interface CacheHeaders {
  'Cache-Control': string;
  ETag?: string;
  'Last-Modified'?: string;
  Vary?: string;
  Expires?: string;
  Pragma?: string;
}

export interface CacheableResource {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  timestamp: number;
  etag?: string;
  lastModified?: string;
  ttl: number;
}

export interface CDNConfig {
  enabled: boolean;
  provider: 'cloudflare' | 'aws' | 'azure' | 'custom';
  apiKey?: string;
  zoneId?: string;
  baseUrl?: string;
  purgeEndpoint?: string;
  cacheRules: CDNCacheRule[];
}

export interface CDNCacheRule {
  pattern: string;
  ttl: number;
  bypassCache: boolean;
  alwaysOnline: boolean;
}

/**
 * HTTP Cache Strategy Manager
 */
export class HTTPCacheStrategy {
  private config: HTTPCacheConfig;
  private cdnConfig: CDNConfig;
  private etagCache: Map<string, string>;
  private lastModifiedCache: Map<string, string>;
  private responseTimeCache: Map<string, number>;

  constructor(
    config: HTTPCacheConfig,
    cdnConfig: CDNConfig = { enabled: false, provider: 'custom', cacheRules: [] },
  ) {
    this.config = config;
    this.cdnConfig = cdnConfig;
    this.etagCache = new Map();
    this.lastModifiedCache = new Map();
    this.responseTimeCache = new Map();
  }

  /**
   * Generate cache headers for a response
   */
  generateCacheHeaders(
    url: string,
    content: string,
    options: {
      isPrivate?: boolean;
      ttl?: number;
      mustRevalidate?: boolean;
      customTTL?: number;
    } = {},
  ): CacheHeaders {
    const { isPrivate = false, mustRevalidate = false, customTTL } = options;

    const headers: Partial<CacheHeaders> & { 'Cache-Control': string } = {
      'Cache-Control': '',
    };

    // Determine if this should be cached
    const shouldNotCache = this.config.noCache.some((pattern) => new RegExp(pattern).test(url));

    if (shouldNotCache) {
      headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
      headers['Pragma'] = 'no-cache';
      headers['Expires'] = '0';
      return headers as CacheHeaders;
    }

    // Determine cache directive
    const ttl = customTTL || this.getTTLForResource(url);
    const maxAge = Math.min(ttl, this.config.maxAge);

    let cacheControl = isPrivate ? 'private' : 'public';
    cacheControl += `, max-age=${maxAge}`;

    if (this.config.staleWhileRevalidate > 0) {
      cacheControl += `, stale-while-revalidate=${this.config.staleWhileRevalidate}`;
    }

    if (mustRevalidate || this.config.mustRevalidate) {
      cacheControl += ', must-revalidate';
    }

    headers['Cache-Control'] = cacheControl;

    // Generate ETag
    const etag = this.generateETag(content);
    headers['ETag'] = `"${etag}"`;
    this.etagCache.set(url, etag);

    // Set Last-Modified
    const lastModified = new Date().toUTCString();
    headers['Last-Modified'] = lastModified;
    this.lastModifiedCache.set(url, lastModified);

    // Set Expires header as fallback
    const expiresDate = new Date(Date.now() + maxAge * 1000);
    headers['Expires'] = expiresDate.toUTCString();

    // Set Vary header
    if (this.config.varyHeaders.length > 0) {
      headers['Vary'] = this.config.varyHeaders.join(', ');
    }

    return headers;
  }

  /**
   * Check if a request has valid cache headers for conditional requests
   */
  checkConditionalRequest(
    url: string,
    requestHeaders: Record<string, string>,
  ): { isNotModified: boolean; lastModified?: string; etag?: string } {
    const ifNoneMatch = requestHeaders['if-none-match'];
    const ifModifiedSince = requestHeaders['if-modified-since'];

    const cachedETag = this.etagCache.get(url);
    const cachedLastModified = this.lastModifiedCache.get(url);

    // Check ETag first (stronger validator)
    if (ifNoneMatch && cachedETag) {
      const requestETags = ifNoneMatch.split(',').map((tag) => tag.trim().replace(/"/g, ''));
      if (requestETags.includes(cachedETag) || requestETags.includes('*')) {
        return { isNotModified: true, etag: cachedETag };
      }
    }

    // Check Last-Modified (weaker validator)
    if (ifModifiedSince && cachedLastModified) {
      const requestDate = new Date(ifModifiedSince);
      const cachedDate = new Date(cachedLastModified);

      if (requestDate >= cachedDate) {
        return { isNotModified: true, lastModified: cachedLastModified };
      }
    }

    const result: { isNotModified: boolean; lastModified?: string; etag?: string } = {
      isNotModified: false,
    };

    if (cachedETag) {
      result.etag = cachedETag;
    }

    if (cachedLastModified) {
      result.lastModified = cachedLastModified;
    }

    return result;
  }

  /**
   * Generate ETag for content
   */
  private generateETag(content: string): string {
    // Simple hash function for ETag generation
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36) + '-' + content.length.toString(36);
  }

  /**
   * Get TTL for specific resource based on patterns
   */
  private getTTLForResource(url: string): number {
    // Static assets - long cache
    if (/\.(css|js|woff2?|ttf|eot|ico)$/.test(url)) {
      return 31536000; // 1 year
    }

    // Images - medium cache
    if (/\.(jpg|jpeg|png|gif|webp|svg)$/.test(url)) {
      return 2592000; // 30 days
    }

    // API responses - short cache
    if (url.includes('/api/')) {
      return 300; // 5 minutes
    }

    // HTML pages - very short cache
    if (url.endsWith('.html') || url.endsWith('/')) {
      return 3600; // 1 hour
    }

    return this.config.defaultTTL;
  }

  /**
   * Create cache-optimized fetch wrapper
   */
  createCacheAwareFetch() {
    const originalFetch = globalThis.fetch;

    return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const request = new Request(input, init);
      const url = request.url;

      // Skip caching for non-GET requests
      if (request.method !== 'GET') {
        return originalFetch(request);
      }

      // Check if response should be cached
      const shouldCache = !this.config.noCache.some((pattern) => new RegExp(pattern).test(url));

      if (!shouldCache) {
        return originalFetch(request);
      }

      // Add conditional headers
      const headers = new Headers(request.headers);

      // Normalize URL to pathname for cache lookup
      let normalizedUrl = url;
      try {
        if (url && typeof url === 'string' && url.startsWith('http')) {
          // For absolute URLs, extract pathname manually
          const urlParts = url.split('/');
          if (urlParts.length >= 3) {
            normalizedUrl = '/' + urlParts.slice(3).join('/');
          }
        }
        // For relative URLs, use as-is
      } catch (error) {
        // If URL parsing fails, use the original URL
        console.warn('URL parsing failed:', error);
      }

      const cachedETag = this.etagCache.get(normalizedUrl);
      const cachedLastModified = this.lastModifiedCache.get(normalizedUrl);

      if (cachedETag) {
        headers.set('If-None-Match', `"${cachedETag}"`);
      }

      if (cachedLastModified) {
        headers.set('If-Modified-Since', cachedLastModified);
      }

      const enhancedRequest = new Request(request, { headers });

      const startTime = Date.now();
      const response = await originalFetch(enhancedRequest);
      const responseTime = Date.now() - startTime;

      this.responseTimeCache.set(url, responseTime);

      // If 304 Not Modified, we can use cached version
      if (response.status === 304) {
        console.log(`Cache hit (304): ${url}`);
        // Return a synthetic response indicating cache hit
        return new Response(null, {
          status: 304,
          statusText: 'Not Modified',
          headers: response.headers,
        });
      }

      // Update cache headers for successful responses
      if (response.ok) {
        const etag = response.headers.get('etag');
        const lastModified = response.headers.get('last-modified');

        if (etag) {
          this.etagCache.set(url, etag.replace(/"/g, ''));
        }

        if (lastModified) {
          this.lastModifiedCache.set(url, lastModified);
        }
      }

      return response;
    };
  }

  /**
   * Preload critical resources with cache optimization
   */
  async preloadResources(urls: string[]): Promise<void> {
    const preloadPromises = urls.map(async (url) => {
      try {
        const response = await fetch(url, {
          headers: {
            Purpose: 'prefetch',
            'Cache-Control': 'max-age=3600',
          },
        });

        if (response.ok) {
          console.log(`Preloaded: ${url}`);
        }
      } catch (error) {
        console.warn(`Failed to preload ${url}:`, error);
      }
    });

    await Promise.allSettled(preloadPromises);
  }

  /**
   * Implement resource hints for better caching
   */
  injectResourceHints(
    resources: Array<{ url: string; rel: 'preload' | 'prefetch' | 'dns-prefetch'; as?: string }>,
  ): void {
    const head = document.head;

    resources.forEach(({ url, rel, as }) => {
      const link = document.createElement('link');
      link.rel = rel;
      link.href = url;

      if (as) {
        link.as = as;
      }

      // Add crossorigin for external resources
      if (url.startsWith('http') && !url.includes(window.location.hostname)) {
        link.crossOrigin = 'anonymous';
      }

      head.appendChild(link);
    });
  }

  /**
   * CDN Cache Management
   */
  async purgeCDNCache(urls: string[] = []): Promise<boolean> {
    if (!this.cdnConfig.enabled || !this.cdnConfig.purgeEndpoint) {
      return false;
    }

    try {
      const response = await fetch(this.cdnConfig.purgeEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.cdnConfig.apiKey}`,
        },
        body: JSON.stringify({
          files: urls.length > 0 ? urls : ['/*'], // Purge all if no specific URLs
        }),
      });

      return response.ok;
    } catch (error) {
      console.error('CDN cache purge failed:', error);
      return false;
    }
  }

  /**
   * Get cache performance statistics
   */
  getCacheStats(): {
    totalRequests: number;
    averageResponseTime: number;
    cacheHitRatio: number;
    etagCacheSize: number;
    lastModifiedCacheSize: number;
  } {
    const totalRequests = this.responseTimeCache.size;
    const totalResponseTime = Array.from(this.responseTimeCache.values()).reduce(
      (sum, time) => sum + time,
      0,
    );

    return {
      totalRequests,
      averageResponseTime: totalRequests > 0 ? totalResponseTime / totalRequests : 0,
      cacheHitRatio: 0, // Would need more sophisticated tracking
      etagCacheSize: this.etagCache.size,
      lastModifiedCacheSize: this.lastModifiedCache.size,
    };
  }

  /**
   * Clear HTTP cache data
   */
  clearCache(): void {
    this.etagCache.clear();
    this.lastModifiedCache.clear();
    this.responseTimeCache.clear();
  }

  /**
   * Create a middleware for Express.js or similar frameworks
   */
  createCacheMiddleware() {
    const cacheStrategy = this;

    return (req: any, res: any, next: any) => {
      const url = req.url;
      const method = req.method;

      // Only handle GET requests
      if (method !== 'GET') {
        return next();
      }

      // Check conditional request headers
      const conditionalResult = cacheStrategy.checkConditionalRequest(url, req.headers);

      if (conditionalResult.isNotModified) {
        res.status(304);
        if (conditionalResult.etag) {
          res.set('ETag', `"${conditionalResult.etag}"`);
        }
        if (conditionalResult.lastModified) {
          res.set('Last-Modified', conditionalResult.lastModified);
        }
        return res.end();
      }

      // Override res.send to add cache headers
      const originalSend = res.send;
      res.send = function (body: any) {
        const content = typeof body === 'string' ? body : JSON.stringify(body);
        const cacheHeaders = cacheStrategy.generateCacheHeaders(url, content);

        Object.entries(cacheHeaders).forEach(([key, value]) => {
          if (value) {
            res.set(key, value);
          }
        });

        return originalSend.call(this, body);
      };

      next();
    };
  }
}

/**
 * Default HTTP cache configuration
 */
export const defaultHTTPCacheConfig: HTTPCacheConfig = {
  defaultTTL: 3600, // 1 hour
  maxAge: 31536000, // 1 year
  staleWhileRevalidate: 86400, // 1 day
  mustRevalidate: false,
  noCache: [
    '/api/auth/',
    '/api/user/current',
    '/admin/',
    '\\?.*', // Query parameters
  ],
  privateResources: ['/api/user/', '/profile/', '/settings/'],
  publicResources: ['/static/', '/assets/', '/images/', '/css/', '/js/'],
  compressionTypes: [
    'text/html',
    'text/css',
    'text/javascript',
    'application/javascript',
    'application/json',
    'text/xml',
    'application/xml',
  ],
  varyHeaders: ['Accept-Encoding', 'Accept-Language', 'User-Agent'],
};

/**
 * CDN configuration for popular providers
 */
export const cdnConfigs = {
  cloudflare: {
    enabled: true,
    provider: 'cloudflare' as const,
    purgeEndpoint: 'https://api.cloudflare.com/client/v4/zones/{zoneId}/purge_cache',
    cacheRules: [
      { pattern: '*.css', ttl: 31536000, bypassCache: false, alwaysOnline: true },
      { pattern: '*.js', ttl: 31536000, bypassCache: false, alwaysOnline: true },
      { pattern: '*.png', ttl: 2592000, bypassCache: false, alwaysOnline: true },
      { pattern: '*.jpg', ttl: 2592000, bypassCache: false, alwaysOnline: true },
      { pattern: '/api/*', ttl: 300, bypassCache: false, alwaysOnline: false },
    ],
  },

  aws: {
    enabled: true,
    provider: 'aws' as const,
    purgeEndpoint:
      'https://cloudfront.amazonaws.com/2020-05-31/distribution/{distributionId}/invalidation',
    cacheRules: [
      { pattern: '/static/*', ttl: 31536000, bypassCache: false, alwaysOnline: true },
      { pattern: '/api/*', ttl: 300, bypassCache: true, alwaysOnline: false },
    ],
  },
};
