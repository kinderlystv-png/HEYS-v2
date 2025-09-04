/**
 * HEYS Performance Optimization Suite
 * Comprehensive performance monitoring and optimization toolkit
 *
 * @author HEYS Team
 * @version 1.4.0
 * @created 2025-01-31
 */

// Core performance profiling
export { defaultProfiler, measurePerformance, PerformanceProfiler } from './profiler';

export type { BundleAnalysis, PerformanceMetric, RuntimePerformance } from './profiler';

// Bundle analysis (новая система)
export { BundleAnalyzer, bundleAnalyzer } from './BundleAnalyzer';
export type { BundleMetrics, BaselineMetrics } from './BundleAnalyzer';

// Tree Shaking - удаление неиспользуемого кода
export { TreeShaker, treeShaker } from './TreeShaker';
export type {
  UnusedExport,
  TreeShakingAnalysis,
  TreeShakingConfig
} from './TreeShaker';

// Code Splitting - разделение кода на chunks
export { CodeSplitter } from './CodeSplitter';
export type {
  SplitPoint,
  CodeSplittingAnalysis
} from './CodeSplitter';

// Lazy Loading - ленивая загрузка ресурсов (НОВОЕ)
export { LazyLoader, LazyLoadingStrategy, ResourceType } from './LazyLoader';
export type { LazyLoadingConfig, LazyLoadingMetrics } from './LazyLoader';

// Lazy Loading конфигурации и утилиты
export {
  aggressiveLazyConfig,
  balancedLazyConfig,
  conservativeLazyConfig,
  mobileLazyConfig,
  slowNetworkLazyConfig,
  premiumLazyConfig,
  lazyLoadingStrategies,
  deviceSpecificConfigs,
  lazyLoadingConfigs,
  LazyConfigDetector,
  LazyLoadingHelpers,
  createLazyConfig
} from './lazy-loading-config';

// Lazy Loading компоненты
export { 
  LazyComponent, 
  LazyComponentFactory, 
  globalLazyComponent 
} from './components/LazyComponent';

// Tree Shaking Configurations
export {
  viteTreeShakingConfig,
  webpackTreeShakingConfig,
  rollupTreeShakingConfig,
  esbuildTreeShakingConfig,
  treeShakingPresets,
  getBundlerConfig,
  getTreeShakingPreset,
  createTreeShakingConfig
} from './tree-shaking-config';

// Code Splitting Configurations
export {
  viteCodeSplittingConfig,
  webpackCodeSplittingConfig,
  rollupCodeSplittingConfig,
  codeSplittingPresets,
  createCodeSplittingConfig,
  reactSplittingHelpers
} from './code-splitting-config';

// Bundle analysis (legacy)
export { BundleAnalyzer as LegacyBundleAnalyzer, defaultBundleAnalyzer } from './bundle-analyzer';

export type { OptimizationRecommendation } from './bundle-analyzer';

// Cache management
export {
  cached,
  defaultCacheManager,
  IndexedDBCacheStrategy,
  MemoryCacheStrategy,
  SmartCacheManager,
} from './cache';

export type { CacheConfig, CacheEntry, CacheStats, CacheStrategy } from './cache';

// Mobile optimization
export { defaultMobileOptimizer, MobilePerformanceOptimizer, MobileUtils } from './mobile';

export type { DeviceCapabilities, NetworkCondition, PerformanceSettings } from './mobile';

// Network optimization
export {
  defaultHTTPClient,
  NetworkOptimizer,
  OfflineSupport,
  OptimizedHTTPClient,
} from './network';

export type {
  ConnectionInfo,
  NetworkRequest,
  NetworkStats,
  RequestConfig,
  RequestPriority,
} from './network';

// Import classes for internal use
import { SmartCacheManager } from './cache';
import { MobilePerformanceOptimizer } from './mobile';
import { OptimizedHTTPClient, type RequestConfig } from './network';
import { PerformanceProfiler } from './profiler';

/**
 * Performance optimization configuration
 */
export interface PerformanceConfig {
  profiling?: {
    enabled: boolean;
    sampleRate?: number;
    includeUserTiming?: boolean;
    includeLongTasks?: boolean;
  };
  caching?: {
    strategy?: 'memory' | 'indexedDB' | 'smart';
    maxSize?: number;
    ttl?: number;
    compression?: boolean;
  };
  mobile?: {
    enabled: boolean;
    autoOptimize?: boolean;
    imageOptimization?: boolean;
  };
  network?: {
    maxConcurrentRequests?: number;
    enableBatching?: boolean;
    enableOfflineSupport?: boolean;
    preloadCriticalResources?: boolean;
  };
}

/**
 * Comprehensive performance manager
 */
export class PerformanceManager {
  private profiler: PerformanceProfiler;
  private cacheManager: SmartCacheManager;
  private mobileOptimizer: MobilePerformanceOptimizer;
  private httpClient: OptimizedHTTPClient;
  private config: Required<PerformanceConfig>;

  constructor(config: PerformanceConfig = {}) {
    this.config = this.mergeConfig(config);

    // Initialize components based on configuration
    this.profiler = new PerformanceProfiler();
    this.cacheManager = new SmartCacheManager(this.config.caching.strategy);
    this.mobileOptimizer = new MobilePerformanceOptimizer();
    this.httpClient = new OptimizedHTTPClient();

    this.initialize();
  }

  /**
   * Merge configuration with defaults
   */
  private mergeConfig(config: PerformanceConfig): Required<PerformanceConfig> {
    return {
      profiling: {
        enabled: config.profiling?.enabled ?? true,
        sampleRate: config.profiling?.sampleRate ?? 0.1,
        includeUserTiming: config.profiling?.includeUserTiming ?? true,
        includeLongTasks: config.profiling?.includeLongTasks ?? true,
      },
      caching: {
        strategy: config.caching?.strategy ?? 'smart',
        maxSize: config.caching?.maxSize ?? 50 * 1024 * 1024, // 50MB
        ttl: config.caching?.ttl ?? 60 * 60 * 1000, // 1 hour
        compression: config.caching?.compression ?? true,
      },
      mobile: {
        enabled: config.mobile?.enabled ?? true,
        autoOptimize: config.mobile?.autoOptimize ?? true,
        imageOptimization: config.mobile?.imageOptimization ?? true,
      },
      network: {
        maxConcurrentRequests: config.network?.maxConcurrentRequests ?? 6,
        enableBatching: config.network?.enableBatching ?? true,
        enableOfflineSupport: config.network?.enableOfflineSupport ?? true,
        preloadCriticalResources: config.network?.preloadCriticalResources ?? true,
      },
    };
  }

  /**
   * Initialize performance optimizations
   */
  private initialize(): void {
    if (this.config.profiling.enabled) {
      // Profiler is already initialized and will collect metrics automatically
      console.log('Performance profiling enabled');
    }

    if (this.config.mobile.enabled && this.config.mobile.autoOptimize) {
      this.mobileOptimizer.applyOptimizations();
    }
  }

  /**
   * Get comprehensive performance report
   */
  async getPerformanceReport(): Promise<{
    profiling: any;
    caching: any;
    network: any;
    mobile: any;
    recommendations: any[];
  }> {
    const [profilingData, cacheStats, networkStats] = await Promise.all([
      this.profiler.getMetrics(),
      this.cacheManager.getAllStats(),
      this.httpClient.getStats(),
    ]);

    const recommendations = this.generateRecommendations(profilingData, cacheStats, networkStats);

    return {
      profiling: profilingData,
      caching: cacheStats,
      network: networkStats,
      mobile: {
        capabilities: this.mobileOptimizer.getDeviceCapabilities(),
        settings: this.mobileOptimizer.getPerformanceSettings(),
        networkCondition: this.mobileOptimizer.getNetworkCondition(),
      },
      recommendations,
    };
  }

  /**
   * Generate performance recommendations
   */
  private generateRecommendations(profilingData: any, cacheStats: any, networkStats: any): any[] {
    const recommendations: any[] = [];

    // Analyze profiling data
    if (profilingData.runtime?.averageFrameTime > 16.67) {
      recommendations.push({
        type: 'performance',
        severity: 'high',
        title: 'Frame Rate Issues',
        description: 'Average frame time exceeds 16.67ms (60fps threshold)',
        actions: [
          'Optimize rendering loops',
          'Reduce DOM manipulations',
          'Use requestAnimationFrame',
        ],
      });
    }

    // Analyze cache performance
    Object.entries(cacheStats).forEach(([strategy, stats]: [string, any]) => {
      if (stats.hitRate < 0.5) {
        recommendations.push({
          type: 'caching',
          severity: 'medium',
          title: `Low Cache Hit Rate (${strategy})`,
          description: `Cache hit rate is ${(stats.hitRate * 100).toFixed(1)}%`,
          actions: ['Review cache strategy', 'Increase cache size', 'Adjust TTL values'],
        });
      }
    });

    // Analyze network performance
    if (networkStats.averageResponseTime > 1000) {
      recommendations.push({
        type: 'network',
        severity: 'high',
        title: 'Slow Network Responses',
        description: `Average response time is ${networkStats.averageResponseTime.toFixed(0)}ms`,
        actions: ['Implement request batching', 'Use CDN', 'Optimize API endpoints'],
      });
    }

    return recommendations;
  }

  /**
   * Run performance analysis
   */
  async analyzePerformance(duration = 30000): Promise<{
    profiling: any;
    caching: any;
    network: any;
    mobile: any;
    recommendations: any[];
  }> {
    console.log('Starting performance analysis...');

    // Wait for analysis duration
    await new Promise((resolve) => setTimeout(resolve, duration));

    // Get results
    const report = await this.getPerformanceReport();

    console.log('Performance Analysis Complete:', report);

    return report;
  }

  /**
   * Optimize images for current device
   */
  optimizeImage(url: string, width?: number, height?: number): string {
    if (this.config.mobile.enabled && this.config.mobile.imageOptimization) {
      return this.mobileOptimizer.getOptimizedImageUrl(url, width, height);
    }
    return url;
  }

  /**
   * Make optimized HTTP request
   */
  async request<T = any>(config: RequestConfig): Promise<T> {
    return this.httpClient.get<T>(config.url, config);
  }

  /**
   * Get cache manager
   */
  getCache(): SmartCacheManager {
    return this.cacheManager;
  }

  /**
   * Get profiler
   */
  getProfiler(): PerformanceProfiler {
    return this.profiler;
  }

  /**
   * Get mobile optimizer
   */
  getMobileOptimizer(): MobilePerformanceOptimizer {
    return this.mobileOptimizer;
  }

  /**
   * Get HTTP client
   */
  getHTTPClient(): OptimizedHTTPClient {
    return this.httpClient;
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<PerformanceConfig>): void {
    this.config = this.mergeConfig({ ...this.config, ...newConfig });

    // Re-initialize if needed
    if (newConfig.mobile?.autoOptimize && this.config.mobile.enabled) {
      this.mobileOptimizer.applyOptimizations();
    }
  }

  /**
   * Cleanup and destroy
   */
  destroy(): void {
    // Clean up profiler if it has cleanup methods
    if (typeof (this.profiler as any).cleanup === 'function') {
      (this.profiler as any).cleanup();
    }
    this.mobileOptimizer.destroy();
    this.cacheManager.clear();
  }
}

/**
 * Default performance manager instance
 */
export const defaultPerformanceManager = new PerformanceManager();

/**
 * Quick start function for basic performance optimization
 */
export function initializePerformanceOptimization(config?: PerformanceConfig): PerformanceManager {
  const manager = new PerformanceManager(config);

  // Apply immediate optimizations
  if (config?.mobile?.autoOptimize !== false) {
    manager.getMobileOptimizer().applyOptimizations();
  }

  console.log('HEYS Performance Optimization initialized');
  return manager;
}
