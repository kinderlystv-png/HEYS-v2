/**
 * Cache Integration Layer for HEYS Application
 * Provides unified interface for all caching strategies
 * 
 * @author HEYS Team
 * @version 1.4.0
 * @created 2025-01-31
 */

import { AdvancedCacheManager, CacheConfig, defaultCacheConfig } from './advanced-cache-manager';
import { HTTPCacheStrategy, HTTPCacheConfig, defaultHTTPCacheConfig } from './http-cache-strategy';

export interface CacheIntegrationConfig {
  cache: CacheConfig;
  http: HTTPCacheConfig;
  serviceWorkerPath: string;
  enableOfflineMode: boolean;
  preloadResources: string[];
  cacheInvalidationRules: CacheInvalidationRule[];
}

export interface CacheInvalidationRule {
  pattern: string;
  triggers: ('time' | 'version' | 'dependency' | 'manual')[];
  ttl?: number;
}

export interface CachePerformanceMetrics {
  hitRate: number;
  averageResponseTime: number;
  totalRequests: number;
  cacheSize: number;
  invalidations: number;
  lastUpdated: Date;
}

/**
 * Unified cache integration layer
 */
export class CacheIntegrationLayer {
  private cacheManager: AdvancedCacheManager;
  private httpCache: HTTPCacheStrategy;
  private config: CacheIntegrationConfig;
  private performanceMetrics: CachePerformanceMetrics;
  private invalidationRules: Map<string, CacheInvalidationRule>;

  constructor(config?: Partial<CacheIntegrationConfig>) {
    this.config = {
      cache: defaultCacheConfig,
      http: defaultHTTPCacheConfig,
      serviceWorkerPath: '/packages/shared/src/performance/service-worker.js',
      enableOfflineMode: true,
      preloadResources: [],
      cacheInvalidationRules: [],
      ...config,
    };

    this.cacheManager = new AdvancedCacheManager(this.config.cache);
    this.httpCache = new HTTPCacheStrategy(this.config.http);
    this.invalidationRules = new Map();
    
    this.performanceMetrics = {
      hitRate: 0,
      averageResponseTime: 0,
      totalRequests: 0,
      cacheSize: 0,
      invalidations: 0,
      lastUpdated: new Date(),
    };

    this.initialize();
  }

  /**
   * Initialize the cache integration layer
   */
  private async initialize(): Promise<void> {
    try {
      // Setup invalidation rules
      this.config.cacheInvalidationRules.forEach(rule => {
        this.invalidationRules.set(rule.pattern, rule);
      });

      // Preload critical resources
      if (this.config.preloadResources.length > 0) {
        await this.httpCache.preloadResources(this.config.preloadResources);
      }

      // Setup performance monitoring
      this.startPerformanceMonitoring();

      console.log('Cache Integration Layer initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Cache Integration Layer:', error);
    }
  }

  /**
   * Store data with automatic strategy selection
   */
  async store<T>(
    key: string,
    value: T,
    options: {
      ttl?: number;
      tags?: string[];
      strategy?: 'auto' | 'memory' | 'localStorage' | 'sessionStorage' | 'indexedDB';
      compress?: boolean;
      version?: string;
    } = {}
  ): Promise<boolean> {
    const startTime = Date.now();

    try {
      const { strategy = 'auto', ...restOptions } = options;
      
      let finalStrategy = strategy;
      
      // Auto strategy selection based on data characteristics
      if (strategy === 'auto') {
        finalStrategy = this.selectOptimalStrategy(key, value, options);
      }

      const result = await this.cacheManager.store(key, value, {
        ...restOptions,
        strategy: finalStrategy as any,
      });

      this.updatePerformanceMetrics(Date.now() - startTime, result);
      
      return result;
    } catch (error) {
      console.error('Cache store failed:', error);
      this.updatePerformanceMetrics(Date.now() - startTime, false);
      return false;
    }
  }

  /**
   * Retrieve data with fallback strategies
   */
  async retrieve<T>(
    key: string,
    options: {
      strategy?: 'auto' | 'memory' | 'localStorage' | 'sessionStorage' | 'indexedDB';
      fallbackStrategies?: string[];
    } = {}
  ): Promise<T | null> {
    const startTime = Date.now();

    try {
      const result = await this.cacheManager.retrieve<T>(key, options);
      
      const isHit = result !== null;
      this.updatePerformanceMetrics(Date.now() - startTime, isHit);
      
      return result;
    } catch (error) {
      console.error('Cache retrieve failed:', error);
      this.updatePerformanceMetrics(Date.now() - startTime, false);
      return null;
    }
  }

  /**
   * Select optimal caching strategy based on data characteristics
   */
  private selectOptimalStrategy<T>(
    key: string,
    value: T,
    _options: any
  ): 'memory' | 'localStorage' | 'sessionStorage' | 'indexedDB' {
    const serialized = JSON.stringify(value);
    const size = serialized.length;

    // Large data (> 100KB) -> IndexedDB
    if (size > 100 * 1024) {
      return 'indexedDB';
    }

    // Session-specific data -> SessionStorage
    if (key.includes('session') || key.includes('temp')) {
      return 'sessionStorage';
    }

    // Frequently accessed small data -> Memory
    if (size < 10 * 1024) {
      return 'memory';
    }

    // Default to localStorage for persistent data
    return 'localStorage';
  }

  /**
   * Create cache-aware fetch with HTTP caching
   */
  createCacheAwareFetch() {
    const httpCacheAwareFetch = this.httpCache.createCacheAwareFetch();
    const cacheManager = this.cacheManager;

    return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const request = new Request(input, init);
      const cacheKey = this.generateCacheKey(request);

      // For GET requests, check application cache first
      if (request.method === 'GET') {
        const cached = await cacheManager.retrieve<{
          body: string;
          headers: Record<string, string>;
          status: number;
        }>(cacheKey, { strategy: 'auto' });

        if (cached) {
          return new Response(cached.body, {
            status: cached.status,
            headers: cached.headers,
          });
        }
      }

      // Use HTTP cache-aware fetch
      const response = await httpCacheAwareFetch(input, init);

      // Cache successful GET responses
      if (request.method === 'GET' && response.ok) {
        const clonedResponse = response.clone();
        const body = await clonedResponse.text();
        const headers: Record<string, string> = {};
        
        clonedResponse.headers.forEach((value, key) => {
          headers[key] = value;
        });

        await cacheManager.store(cacheKey, {
          body,
          headers,
          status: response.status,
        }, {
          strategy: this.selectOptimalStrategy(cacheKey, { body, headers }, {}),
          ttl: this.getTTLFromResponse(response),
        });
      }

      return response;
    };
  }

  /**
   * Generate cache key for requests
   */
  private generateCacheKey(request: Request): string {
    const url = new URL(request.url);
    return `http_${request.method}_${url.pathname}${url.search}`;
  }

  /**
   * Extract TTL from HTTP response headers
   */
  private getTTLFromResponse(response: Response): number {
    const cacheControl = response.headers.get('cache-control');
    
    if (cacheControl) {
      const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
      if (maxAgeMatch && maxAgeMatch[1]) {
        return parseInt(maxAgeMatch[1], 10) * 1000; // Convert to milliseconds
      }
    }

    const expires = response.headers.get('expires');
    if (expires) {
      const expiresDate = new Date(expires);
      return Math.max(0, expiresDate.getTime() - Date.now());
    }

    // Default TTL
    return 60 * 60 * 1000; // 1 hour
  }

  /**
   * Invalidate cache entries based on patterns
   */
  async invalidate(pattern: string, cascade: boolean = true): Promise<void> {
    try {
      // Check invalidation rules
      const rule = this.invalidationRules.get(pattern);
      
      if (rule) {
        console.log(`Applying invalidation rule for pattern: ${pattern}`);
        
        if (rule.triggers.includes('dependency') && cascade) {
          // Find and invalidate dependent entries
          await this.cascadeInvalidation(pattern);
        }
      }

      // Invalidate from cache manager
      await this.cacheManager.invalidate(pattern, cascade);
      
      this.performanceMetrics.invalidations++;
      this.performanceMetrics.lastUpdated = new Date();
      
    } catch (error) {
      console.error('Cache invalidation failed:', error);
    }
  }

  /**
   * Cascade invalidation for dependent cache entries
   */
  private async cascadeInvalidation(pattern: string): Promise<void> {
    // Implementation would depend on dependency tracking
    // For now, we'll just log the operation
    console.log(`Cascading invalidation for pattern: ${pattern}`);
  }

  /**
   * Get comprehensive cache statistics
   */
  async getStats(): Promise<CachePerformanceMetrics & {
    breakdown: {
      memory: any;
      http: any;
      advanced: any;
    };
  }> {
    const advancedStats = await this.cacheManager.getStats();
    const httpStats = this.httpCache.getCacheStats();

    return {
      ...this.performanceMetrics,
      breakdown: {
        memory: advancedStats,
        http: httpStats,
        advanced: {
          totalCacheSize: advancedStats.total.size,
          cacheTypes: Object.keys(advancedStats.byType),
          hitRateByType: advancedStats.byType,
        },
      },
    };
  }

  /**
   * Clear all caches
   */
  async clearAll(): Promise<void> {
    await Promise.all([
      this.cacheManager.clearAll(),
      this.httpCache.clearCache(),
    ]);

    this.performanceMetrics = {
      hitRate: 0,
      averageResponseTime: 0,
      totalRequests: 0,
      cacheSize: 0,
      invalidations: 0,
      lastUpdated: new Date(),
    };
  }

  /**
   * Update performance metrics
   */
  private updatePerformanceMetrics(responseTime: number, hit: boolean): void {
    this.performanceMetrics.totalRequests++;
    
    if (hit) {
      const currentHits = this.performanceMetrics.hitRate * (this.performanceMetrics.totalRequests - 1);
      this.performanceMetrics.hitRate = (currentHits + 1) / this.performanceMetrics.totalRequests;
    } else {
      const currentHits = this.performanceMetrics.hitRate * (this.performanceMetrics.totalRequests - 1);
      this.performanceMetrics.hitRate = currentHits / this.performanceMetrics.totalRequests;
    }

    // Update average response time
    const currentTotal = this.performanceMetrics.averageResponseTime * (this.performanceMetrics.totalRequests - 1);
    this.performanceMetrics.averageResponseTime = (currentTotal + responseTime) / this.performanceMetrics.totalRequests;
    
    this.performanceMetrics.lastUpdated = new Date();
  }

  /**
   * Start performance monitoring
   */
  private startPerformanceMonitoring(): void {
    // Update cache size every 30 seconds
    setInterval(async () => {
      try {
        const stats = await this.cacheManager.getStats();
        this.performanceMetrics.cacheSize = stats.total.size;
        this.performanceMetrics.lastUpdated = new Date();
      } catch (error) {
        console.warn('Performance monitoring update failed:', error);
      }
    }, 30000);
  }

  /**
   * Setup cache middleware for HTTP frameworks
   */
  createCacheMiddleware() {
    return this.httpCache.createCacheMiddleware();
  }

  /**
   * Preload critical resources
   */
  async preloadCriticalResources(resources: string[]): Promise<void> {
    await this.httpCache.preloadResources(resources);
  }

  /**
   * Export cache configuration for debugging
   */
  exportConfig(): CacheIntegrationConfig {
    return { ...this.config };
  }

  /**
   * Import cache configuration
   */
  async importConfig(config: Partial<CacheIntegrationConfig>): Promise<void> {
    this.config = { ...this.config, ...config };
    
    // Reinitialize with new config
    await this.initialize();
  }

  /**
   * Destroy the cache integration layer
   */
  async destroy(): Promise<void> {
    await this.cacheManager.destroy();
    await this.clearAll();
  }
}

/**
 * Default cache integration configuration
 */
export const defaultCacheIntegrationConfig: CacheIntegrationConfig = {
  cache: defaultCacheConfig,
  http: defaultHTTPCacheConfig,
  serviceWorkerPath: '/packages/shared/src/performance/service-worker.js',
  enableOfflineMode: true,
  preloadResources: [
    '/static/css/main.css',
    '/static/js/main.js',
    '/manifest.webmanifest',
  ],
  cacheInvalidationRules: [
    {
      pattern: 'api/user/*',
      triggers: ['time', 'manual'],
      ttl: 5 * 60 * 1000, // 5 minutes
    },
    {
      pattern: 'api/meals/*',
      triggers: ['time', 'dependency'],
      ttl: 10 * 60 * 1000, // 10 minutes
    },
    {
      pattern: 'static/*',
      triggers: ['version'],
      ttl: 24 * 60 * 60 * 1000, // 24 hours
    },
  ],
};

/**
 * Create a globally accessible cache instance
 */
let globalCacheInstance: CacheIntegrationLayer | null = null;

export function createGlobalCache(config?: Partial<CacheIntegrationConfig>): CacheIntegrationLayer {
  if (!globalCacheInstance) {
    globalCacheInstance = new CacheIntegrationLayer(config);
  }
  return globalCacheInstance;
}

export function getGlobalCache(): CacheIntegrationLayer | null {
  return globalCacheInstance;
}

export function destroyGlobalCache(): Promise<void> {
  if (globalCacheInstance) {
    const instance = globalCacheInstance;
    globalCacheInstance = null;
    return instance.destroy();
  }
  return Promise.resolve();
}
