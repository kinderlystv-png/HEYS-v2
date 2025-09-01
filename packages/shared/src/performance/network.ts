/**
 * HEYS Network Optimizer
 * Advanced network performance optimization and request management
 * 
 * @author HEYS Team
 * @version 1.4.0
 * @created 2025-01-31
 */

/**
 * Request priority levels
 */
export type RequestPriority = 'critical' | 'high' | 'normal' | 'low' | 'background';

/**
 * Request configuration
 */
export interface RequestConfig {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: any;
  priority?: RequestPriority;
  timeout?: number;
  retries?: number;
  cache?: boolean;
  preload?: boolean;
  offline?: boolean;
}

/**
 * Network request information
 */
export interface NetworkRequest {
  id: string;
  config: RequestConfig;
  startTime: number;
  endTime?: number;
  duration?: number;
  status?: number;
  size?: number;
  fromCache?: boolean;
  retryCount: number;
}

/**
 * Network statistics
 */
export interface NetworkStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  totalDataTransferred: number;
  cacheHitRate: number;
  networkEfficiency: number;
}

/**
 * Connection information
 */
export interface ConnectionInfo {
  type: string;
  effectiveType: string;
  downlink: number;
  rtt: number;
  saveData: boolean;
  isOnline: boolean;
  estimatedBandwidth: number;
}

/**
 * Request queue for priority-based execution
 */
class RequestQueue {
  private queues: Map<RequestPriority, NetworkRequest[]> = new Map();
  private processing = false;
  private maxConcurrent = 6;
  private activeRequests = 0;

  constructor() {
    // Initialize priority queues
    (['critical', 'high', 'normal', 'low', 'background'] as RequestPriority[]).forEach(priority => {
      this.queues.set(priority, []);
    });
  }

  enqueue(request: NetworkRequest): void {
    const queue = this.queues.get(request.config.priority || 'normal');
    queue?.push(request);
    this.processQueue();
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.activeRequests >= this.maxConcurrent) {
      return;
    }

    this.processing = true;

    while (this.activeRequests < this.maxConcurrent) {
      const request = this.getNextRequest();
      if (!request) break;

      this.activeRequests++;
      this.executeRequest(request).finally(() => {
        this.activeRequests--;
        this.processQueue();
      });
    }

    this.processing = false;
  }

  private getNextRequest(): NetworkRequest | null {
    // Process in priority order
    const priorities: RequestPriority[] = ['critical', 'high', 'normal', 'low', 'background'];
    
    for (const priority of priorities) {
      const queue = this.queues.get(priority);
      if (queue && queue.length > 0) {
        return queue.shift()!;
      }
    }
    
    return null;
  }

  private async executeRequest(request: NetworkRequest): Promise<void> {
    // This would be implemented by the NetworkOptimizer
    console.log(`Executing request ${request.id} with priority ${request.config.priority}`);
  }

  setMaxConcurrent(max: number): void {
    this.maxConcurrent = max;
  }

  getQueueSizes(): Record<RequestPriority, number> {
    const sizes: Record<string, number> = {};
    this.queues.forEach((queue, priority) => {
      sizes[priority] = queue.length;
    });
    return sizes as Record<RequestPriority, number>;
  }
}

/**
 * Network optimizer class
 */
export class NetworkOptimizer {
  private requestQueue: RequestQueue;
  private requestHistory: NetworkRequest[] = [];
  private connectionInfo: ConnectionInfo;
  private requestIdCounter = 0;
  private preloadedResources = new Set<string>();
  private requestCache = new Map<string, any>();

  constructor() {
    this.requestQueue = new RequestQueue();
    this.connectionInfo = this.detectConnectionInfo();
    this.setupNetworkMonitoring();
    this.optimizeForConnection();
  }

  /**
   * Detect connection information
   */
  private detectConnectionInfo(): ConnectionInfo {
    const info: ConnectionInfo = {
      type: 'unknown',
      effectiveType: 'unknown',
      downlink: 10,
      rtt: 100,
      saveData: false,
      isOnline: navigator.onLine,
      estimatedBandwidth: 10,
    };

    if ('connection' in navigator) {
      const connection = (navigator as any).connection;
      info.type = connection.type || 'unknown';
      info.effectiveType = connection.effectiveType || 'unknown';
      info.downlink = connection.downlink || 10;
      info.rtt = connection.rtt || 100;
      info.saveData = connection.saveData || false;
      info.estimatedBandwidth = connection.downlink || 10;
    }

    return info;
  }

  /**
   * Setup network monitoring
   */
  private setupNetworkMonitoring(): void {
    // Monitor online/offline status
    window.addEventListener('online', () => {
      this.connectionInfo.isOnline = true;
      this.onConnectionChange();
    });

    window.addEventListener('offline', () => {
      this.connectionInfo.isOnline = false;
      this.onConnectionChange();
    });

    // Monitor connection changes
    if ('connection' in navigator && (navigator as any).connection) {
      const connection = (navigator as any).connection;
      if (typeof connection.addEventListener === 'function') {
        connection.addEventListener('change', () => {
          this.connectionInfo = this.detectConnectionInfo();
          this.onConnectionChange();
        });
      }
    }
  }

  /**
   * Handle connection changes
   */
  private onConnectionChange(): void {
    this.optimizeForConnection();
    console.log('Network connection changed:', this.connectionInfo);
  }

  /**
   * Optimize settings for current connection
   */
  private optimizeForConnection(): void {
    const { effectiveType, saveData, downlink } = this.connectionInfo;

    let maxConcurrent = 6;

    if (saveData || effectiveType === 'slow-2g' || effectiveType === '2g') {
      maxConcurrent = 1;
    } else if (effectiveType === '3g' || downlink < 1.5) {
      maxConcurrent = 2;
    } else if (effectiveType === '4g' || downlink < 10) {
      maxConcurrent = 4;
    }

    this.requestQueue.setMaxConcurrent(maxConcurrent);
  }

  /**
   * Make an optimized network request
   */
  async request<T = any>(config: RequestConfig): Promise<T> {
    const requestId = this.generateRequestId();
    const request: NetworkRequest = {
      id: requestId,
      config: { ...config },
      startTime: performance.now(),
      retryCount: 0,
    };

    // Check cache first
    if (config.cache !== false) {
      const cacheKey = this.generateCacheKey(config);
      const cached = this.requestCache.get(cacheKey);
      if (cached) {
        request.fromCache = true;
        request.endTime = performance.now();
        request.duration = request.endTime - request.startTime;
        this.requestHistory.push(request);
        return cached;
      }
    }

    // Apply request optimizations
    const optimizedConfig = this.optimizeRequestConfig(config);
    request.config = optimizedConfig;

    try {
      const response = await this.executeRequest(request);
      
      // Cache successful response
      if (config.cache !== false && response) {
        const cacheKey = this.generateCacheKey(config);
        this.requestCache.set(cacheKey, response);
      }

      return response;
    } catch (error) {
      // Handle retries
      if (request.retryCount < (config.retries || 3)) {
        request.retryCount++;
        await this.delay(Math.pow(2, request.retryCount) * 1000); // Exponential backoff
        return this.request(config);
      }
      
      throw error;
    } finally {
      this.requestHistory.push(request);
    }
  }

  /**
   * Execute the actual network request
   */
  private async executeRequest(request: NetworkRequest): Promise<any> {
    const { config } = request;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeout || 30000);

    try {
      const fetchOptions: RequestInit = {
        method: config.method || 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          ...config.headers,
        },
        signal: controller.signal,
      };

      if (config.body) {
        fetchOptions.body = typeof config.body === 'string' ? config.body : JSON.stringify(config.body);
      }

      const response = await fetch(config.url, fetchOptions);

      request.status = response.status;
      request.size = this.getResponseSize(response);
      request.endTime = performance.now();
      request.duration = request.endTime - request.startTime;

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        return await response.json();
      } else if (contentType?.includes('text/')) {
        return await response.text();
      } else {
        return await response.blob();
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Optimize request configuration
   */
  private optimizeRequestConfig(config: RequestConfig): RequestConfig {
    const optimized = { ...config };
    const { saveData, effectiveType } = this.connectionInfo;

    // Add compression headers for slow connections
    if (saveData || effectiveType === 'slow-2g' || effectiveType === '2g') {
      optimized.headers = {
        ...optimized.headers,
        'Accept-Encoding': 'gzip, deflate, br',
      };
    }

    // Adjust timeout for connection speed
    if (!optimized.timeout) {
      if (effectiveType === 'slow-2g' || effectiveType === '2g') {
        optimized.timeout = 60000; // 60 seconds
      } else if (effectiveType === '3g') {
        optimized.timeout = 30000; // 30 seconds
      } else {
        optimized.timeout = 15000; // 15 seconds
      }
    }

    return optimized;
  }

  /**
   * Preload resources
   */
  async preloadResources(urls: string[], priority: RequestPriority = 'low'): Promise<void> {
    const preloadPromises = urls
      .filter(url => !this.preloadedResources.has(url))
      .map(async (url) => {
        try {
          await this.request({
            url,
            priority,
            cache: true,
            preload: true,
          });
          this.preloadedResources.add(url);
        } catch (error) {
          console.warn(`Failed to preload resource: ${url}`, error);
        }
      });

    await Promise.allSettled(preloadPromises);
  }

  /**
   * Implement resource hints
   */
  addResourceHints(hints: Array<{ url: string; type: 'dns-prefetch' | 'preconnect' | 'prefetch' | 'preload' }>): void {
    hints.forEach(({ url, type }) => {
      const link = document.createElement('link');
      link.rel = type;
      link.href = url;
      
      if (type === 'preload') {
        link.as = 'fetch';
        link.crossOrigin = 'anonymous';
      }
      
      document.head.appendChild(link);
    });
  }

  /**
   * Implement request batching
   */
  async batchRequests<T = any>(configs: RequestConfig[]): Promise<T[]> {
    // Check if we can batch these requests
    const batchableConfigs = configs.filter(config => 
      config.method === 'GET' || config.method === undefined
    );

    if (batchableConfigs.length > 1) {
      // Create a batch request URL
      const batchUrl = this.createBatchUrl(batchableConfigs);
      
      try {
        const batchResponse = await this.request({
          url: batchUrl,
          method: 'POST',
          body: { requests: batchableConfigs },
          priority: 'high',
        });
        
        return batchResponse.responses || [];
      } catch (error) {
        console.warn('Batch request failed, falling back to individual requests');
      }
    }

    // Fallback to individual requests
    return Promise.all(configs.map(config => this.request<T>(config)));
  }

  /**
   * Create batch URL
   */
  private createBatchUrl(_configs: RequestConfig[]): string {
    // This would be your batch endpoint
    return '/api/batch';
  }

  /**
   * Get network statistics
   */
  getNetworkStats(): NetworkStats {
    const requests = this.requestHistory;
    const successful = requests.filter(r => r.status && r.status < 400);
    const failed = requests.filter(r => !r.status || r.status >= 400);
    const cached = requests.filter(r => r.fromCache);

    const totalResponseTime = successful
      .filter(r => r.duration)
      .reduce((sum, r) => sum + (r.duration || 0), 0);

    const averageResponseTime = successful.length > 0 ? 
      totalResponseTime / successful.length : 0;

    const totalDataTransferred = requests
      .filter(r => r.size)
      .reduce((sum, r) => sum + (r.size || 0), 0);

    const cacheHitRate = requests.length > 0 ? 
      cached.length / requests.length : 0;

    const networkEfficiency = successful.length > 0 ? 
      successful.length / requests.length : 0;

    return {
      totalRequests: requests.length,
      successfulRequests: successful.length,
      failedRequests: failed.length,
      averageResponseTime,
      totalDataTransferred,
      cacheHitRate,
      networkEfficiency,
    };
  }

  /**
   * Clear request cache
   */
  clearCache(): void {
    this.requestCache.clear();
    this.preloadedResources.clear();
  }

  /**
   * Get connection information
   */
  getConnectionInfo(): ConnectionInfo {
    return { ...this.connectionInfo };
  }

  /**
   * Generate request ID
   */
  private generateRequestId(): string {
    return `req_${++this.requestIdCounter}_${Date.now()}`;
  }

  /**
   * Generate cache key
   */
  private generateCacheKey(config: RequestConfig): string {
    const key = {
      url: config.url,
      method: config.method || 'GET',
      body: config.body,
    };
    return btoa(JSON.stringify(key));
  }

  /**
   * Get response size estimate
   */
  private getResponseSize(response: Response): number {
    const contentLength = response.headers.get('content-length');
    return contentLength ? parseInt(contentLength, 10) : 0;
  }

  /**
   * Delay utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.clearCache();
    this.requestHistory = [];
  }
}

/**
 * Service Worker integration for offline support
 */
export class OfflineSupport {
  private networkOptimizer: NetworkOptimizer;
  private offlineQueue: RequestConfig[] = [];

  constructor(networkOptimizer: NetworkOptimizer) {
    this.networkOptimizer = networkOptimizer;
    this.setupOfflineSupport();
    this.loadOfflineQueue();
  }

  /**
   * Setup offline support
   */
  private setupOfflineSupport(): void {
    if ('serviceWorker' in navigator) {
      this.registerServiceWorker();
    }

    // Listen for online events to process queued requests
    window.addEventListener('online', () => {
      this.processOfflineQueue();
    });
  }

  /**
   * Register service worker
   */
  private async registerServiceWorker(): Promise<void> {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      console.log('Service Worker registered:', registration);
    } catch (error) {
      console.error('Service Worker registration failed:', error);
    }
  }

  /**
   * Queue request for when online
   */
  queueOfflineRequest(config: RequestConfig): void {
    this.offlineQueue.push(config);
    this.saveOfflineQueue();
  }

  /**
   * Process offline queue
   */
  private async processOfflineQueue(): Promise<void> {
    if (this.offlineQueue.length === 0) return;

    const queue = [...this.offlineQueue];
    this.offlineQueue = [];

    for (const config of queue) {
      try {
        await this.networkOptimizer.request(config);
      } catch (error) {
        console.error('Failed to process offline request:', error);
        // Re-queue failed requests
        this.offlineQueue.push(config);
      }
    }

    this.saveOfflineQueue();
  }

  /**
   * Save offline queue to localStorage
   */
  private saveOfflineQueue(): void {
    try {
      localStorage.setItem('heys-offline-queue', JSON.stringify(this.offlineQueue));
    } catch (error) {
      console.error('Failed to save offline queue:', error);
    }
  }

  /**
   * Load offline queue from localStorage
   */
  private loadOfflineQueue(): void {
    try {
      const saved = localStorage.getItem('heys-offline-queue');
      if (saved) {
        this.offlineQueue = JSON.parse(saved);
      }
    } catch (error) {
      console.error('Failed to load offline queue:', error);
    }
  }
}

/**
 * HTTP client with network optimization
 */
export class OptimizedHTTPClient {
  private networkOptimizer: NetworkOptimizer;
  private offlineSupport: OfflineSupport;

  constructor() {
    this.networkOptimizer = new NetworkOptimizer();
    this.offlineSupport = new OfflineSupport(this.networkOptimizer);
  }

  /**
   * GET request
   */
  async get<T = any>(url: string, options: Partial<RequestConfig> = {}): Promise<T> {
    return this.networkOptimizer.request<T>({
      ...options,
      url,
      method: 'GET',
    });
  }

  /**
   * POST request
   */
  async post<T = any>(url: string, data?: any, options: Partial<RequestConfig> = {}): Promise<T> {
    return this.networkOptimizer.request<T>({
      ...options,
      url,
      method: 'POST',
      body: data,
    });
  }

  /**
   * PUT request
   */
  async put<T = any>(url: string, data?: any, options: Partial<RequestConfig> = {}): Promise<T> {
    return this.networkOptimizer.request<T>({
      ...options,
      url,
      method: 'PUT',
      body: data,
    });
  }

  /**
   * DELETE request
   */
  async delete<T = any>(url: string, options: Partial<RequestConfig> = {}): Promise<T> {
    return this.networkOptimizer.request<T>({
      ...options,
      url,
      method: 'DELETE',
    });
  }

  /**
   * Queue request for offline processing
   */
  queueForOffline(config: RequestConfig): void {
    this.offlineSupport.queueOfflineRequest(config);
  }

  /**
   * Get network stats
   */
  getStats(): NetworkStats {
    return this.networkOptimizer.getNetworkStats();
  }

  /**
   * Get connection info
   */
  getConnectionInfo(): ConnectionInfo {
    return this.networkOptimizer.getConnectionInfo();
  }
}

/**
 * Default optimized HTTP client instance
 */
export const defaultHTTPClient = new OptimizedHTTPClient();
