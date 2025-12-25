/**
 * HEYS Performance Optimization Suite
 * Comprehensive performance monitoring and optimization toolkit
 *
 * @author HEYS Team
 * @version 1.5.0
 * @created 2025-01-31
 *
 * NOTE: This module uses AppLogger interface for logger-agnostic code.
 * Pass custom logger via PerformanceConfig.logger for testing/DI.
 * See ../logging/AppLogger.ts for the unified interface.
 * See ./logger.ts for module-specific logger utilities.
 */

import type { AppLogger } from '../logging';
import { perfLogger } from './logger';

// Core performance profiling
export { defaultProfiler, measurePerformance, PerformanceProfiler } from './profiler';

export type { BundleAnalysis, PerformanceMetric, RuntimePerformance } from './profiler';

// Bundle analysis (новая система)
export { BundleAnalyzer, bundleAnalyzer } from './BundleAnalyzer';
export type { BaselineMetrics, BundleMetrics } from './BundleAnalyzer';

// Tree Shaking - удаление неиспользуемого кода
export { TreeShaker, treeShaker } from './TreeShaker';
export type { TreeShakingAnalysis, TreeShakingConfig, UnusedExport } from './TreeShaker';

// Code Splitting - разделение кода на chunks
export { CodeSplitter } from './CodeSplitter';
export type { CodeSplittingAnalysis, SplitPoint } from './CodeSplitter';

// Lazy Loading - ленивая загрузка ресурсов (НОВОЕ)
export { LazyLoader, LazyLoadingStrategy, ResourceType } from './LazyLoader';
export type { LazyLoadingConfig, LazyLoadingMetrics } from './LazyLoader';

// Lazy Loading конфигурации и утилиты
export {
  aggressiveLazyConfig,
  balancedLazyConfig,
  conservativeLazyConfig,
  createLazyConfig,
  deviceSpecificConfigs,
  LazyConfigDetector,
  lazyLoadingConfigs,
  LazyLoadingHelpers,
  lazyLoadingStrategies,
  mobileLazyConfig,
  premiumLazyConfig,
  slowNetworkLazyConfig,
} from './lazy-loading-config';

// Lazy Loading компоненты
export {
  globalLazyComponent,
  LazyComponent,
  LazyComponentFactory,
} from './components/LazyComponent';

// Tree Shaking Configurations
export {
  createTreeShakingConfig,
  esbuildTreeShakingConfig,
  getBundlerConfig,
  getTreeShakingPreset,
  rollupTreeShakingConfig,
  treeShakingPresets,
  viteTreeShakingConfig,
  webpackTreeShakingConfig,
} from './tree-shaking-config';

// Code Splitting Configurations
export {
  codeSplittingPresets,
  createCodeSplittingConfig,
  reactSplittingHelpers,
  rollupCodeSplittingConfig,
  viteCodeSplittingConfig,
  webpackCodeSplittingConfig,
} from './code-splitting-config';

// Bundle analysis (legacy)
export { defaultBundleAnalyzer, BundleAnalyzer as LegacyBundleAnalyzer } from './bundle-analyzer';

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
 * Profiling summary built from actual PerformanceMetric[] data.
 * Maps to real metrics collected by profiler.ts:
 * - Navigation: 'DOM Loading', 'DOM Interactive', 'Load Complete'
 * - Paint: 'First Paint', 'First Contentful Paint'
 * - Web Vitals: 'Cumulative Layout Shift', 'First Input Delay'
 * - Tasks: 'Long Task' (accumulated count/duration)
 * - Memory: 'JS Heap Used', 'JS Heap Total', 'JS Heap Limit'
 */
type ProfilingSummary = {
  navigation?: {
    domLoadingMs?: number;
    domInteractiveMs?: number;
    loadCompleteMs?: number;
  };
  paint?: {
    firstPaintMs?: number;
    firstContentfulPaintMs?: number;
  };
  webVitals?: {
    cumulativeLayoutShift?: number;
    firstInputDelayMs?: number;
  };
  tasks?: {
    longTaskCount?: number;
    longTaskTotalMs?: number;
    longTaskMaxMs?: number;
  };
  memory?: {
    heapUsedBytes?: number;
    heapTotalBytes?: number;
    heapLimitBytes?: number;
  };
};

type CacheStrategyStats = { hitRate?: number };
type CacheStatsSummary = Record<string, CacheStrategyStats>;
type NetworkStatsSummary = { averageResponseTime: number };
type Recommendation = {
  type: 'performance' | 'caching' | 'network';
  severity: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  actions: string[];
};
type PerformanceReport = {
  profiling: ProfilingSummary;
  caching: CacheStatsSummary;
  network: NetworkStatsSummary;
  mobile: {
    capabilities: unknown;
    settings: unknown;
    networkCondition: unknown;
  };
  recommendations: Recommendation[];
};

type ProfilerWithCleanup = PerformanceProfiler & { cleanup?: () => void };

// Import PerformanceMetric type for buildProfilingSummary
import type { PerformanceMetric } from './profiler';

/**
 * Build ProfilingSummary from actual metrics array.
 * Maps profiler metric names to structured summary.
 * Handles missing metrics gracefully (undefined fields).
 */
function buildProfilingSummary(metrics: PerformanceMetric[]): ProfilingSummary {
  const byName = new Map(metrics.map((m) => [m.name, m]));
  const get = (name: string): number | undefined => byName.get(name)?.value;

  // Aggregate Long Tasks (they appear multiple times with same name)
  const longTasks = metrics.filter((m) => m.name === 'Long Task');
  const longTaskCount = longTasks.length > 0 ? longTasks.length : undefined;
  const longTaskTotalMs =
    longTasks.length > 0 ? longTasks.reduce((sum, m) => sum + m.value, 0) : undefined;
  const longTaskMaxMs =
    longTasks.length > 0 ? Math.max(...longTasks.map((m) => m.value)) : undefined;

  return {
    navigation: {
      domLoadingMs: get('DOM Loading'),
      domInteractiveMs: get('DOM Interactive'),
      loadCompleteMs: get('Load Complete'),
    },
    paint: {
      firstPaintMs: get('First Paint'),
      firstContentfulPaintMs: get('First Contentful Paint'),
    },
    webVitals: {
      cumulativeLayoutShift: get('Cumulative Layout Shift'),
      firstInputDelayMs: get('First Input Delay'),
    },
    tasks: {
      longTaskCount,
      longTaskTotalMs,
      longTaskMaxMs,
    },
    memory: {
      heapUsedBytes: get('JS Heap Used'),
      heapTotalBytes: get('JS Heap Total'),
      heapLimitBytes: get('JS Heap Limit'),
    },
  };
}

/**
 * Performance optimization configuration
 */
export interface PerformanceConfig {
  /**
   * Optional logger instance. If not provided, uses default pino logger.
   * Pass noopLogger from ../logging for silent operation.
   * Pass createMockLogger() in tests for assertion support.
   */
  logger?: AppLogger;
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
  private config: Required<Omit<PerformanceConfig, 'logger'>>;
  private logger: AppLogger;

  constructor(config: PerformanceConfig = {}) {
    this.logger = config.logger ?? perfLogger;
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
  private mergeConfig(config: PerformanceConfig): Required<Omit<PerformanceConfig, 'logger'>> {
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
      this.logger.info('Performance profiling enabled');
    }

    if (this.config.mobile.enabled && this.config.mobile.autoOptimize) {
      this.mobileOptimizer.applyOptimizations();
    }
  }

  /**
   * Get comprehensive performance report
   */
  async getPerformanceReport(): Promise<PerformanceReport> {
    const [profilingData, cacheStats, networkStats] = await Promise.all([
      this.profiler.getMetrics(),
      this.cacheManager.getAllStats(),
      this.httpClient.getStats(),
    ]);

    // Build summary from actual metrics (no phantom metrics!)
    const profilingSummary = buildProfilingSummary(profilingData);

    const recommendations = this.generateRecommendations(profilingSummary, cacheStats, networkStats);

    return {
      profiling: profilingSummary,
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
  private generateRecommendations(
    profilingData: ProfilingSummary,
    cacheStats: CacheStatsSummary,
    networkStats: NetworkStatsSummary,
  ): Recommendation[] {
    const recommendations: Recommendation[] = [];

    // Analyze Long Tasks (>50ms tasks that block main thread)
    const longTaskCount = profilingData.tasks?.longTaskCount ?? 0;
    const longTaskTotalMs = profilingData.tasks?.longTaskTotalMs ?? 0;
    const longTaskMaxMs = profilingData.tasks?.longTaskMaxMs ?? 0;
    if (longTaskCount > 5 || longTaskTotalMs > 500 || longTaskMaxMs > 150) {
      recommendations.push({
        type: 'performance',
        severity: longTaskCount > 10 || longTaskTotalMs > 1000 || longTaskMaxMs > 300 ? 'high' : 'medium',
        title: 'Long Tasks Detected',
        description: `${longTaskCount} long tasks totaling ${longTaskTotalMs.toFixed(0)}ms (max: ${longTaskMaxMs.toFixed(0)}ms)`,
        actions: [
          'Break up long-running JavaScript',
          'Use Web Workers for heavy computation',
          'Defer non-critical work with requestIdleCallback',
        ],
      });
    }

    // Analyze First Contentful Paint (FCP)
    const fcp = profilingData.paint?.firstContentfulPaintMs;
    if (fcp !== undefined && fcp > 2500) {
      recommendations.push({
        type: 'performance',
        severity: fcp > 4000 ? 'high' : 'medium',
        title: 'Slow First Contentful Paint',
        description: `FCP is ${fcp.toFixed(0)}ms (should be < 2500ms)`,
        actions: [
          'Optimize critical rendering path',
          'Reduce render-blocking resources',
          'Use preload for critical assets',
        ],
      });
    }

    // Analyze Cumulative Layout Shift (CLS)
    const cls = profilingData.webVitals?.cumulativeLayoutShift;
    if (cls !== undefined && cls > 0.1) {
      recommendations.push({
        type: 'performance',
        severity: cls > 0.25 ? 'high' : 'medium',
        title: 'Layout Shift Issues',
        description: `CLS is ${cls.toFixed(3)} (should be < 0.1)`,
        actions: [
          'Set explicit dimensions for images/iframes',
          'Reserve space for dynamic content',
          'Avoid inserting content above existing content',
        ],
      });
    }

    // Analyze First Input Delay (FID)
    const fid = profilingData.webVitals?.firstInputDelayMs;
    if (fid !== undefined && fid > 100) {
      recommendations.push({
        type: 'performance',
        severity: fid > 300 ? 'high' : 'medium',
        title: 'Slow Input Response',
        description: `FID is ${fid.toFixed(0)}ms (should be < 100ms)`,
        actions: [
          'Reduce main thread work during page load',
          'Split long tasks into smaller chunks',
          'Use passive event listeners where possible',
        ],
      });
    }

    // Analyze memory usage (if available)
    const heapUsed = profilingData.memory?.heapUsedBytes;
    const heapLimit = profilingData.memory?.heapLimitBytes;
    if (heapUsed !== undefined && heapLimit !== undefined) {
      const heapUsagePercent = (heapUsed / heapLimit) * 100;
      if (heapUsagePercent > 70) {
        recommendations.push({
          type: 'performance',
          severity: heapUsagePercent > 85 ? 'high' : 'medium',
          title: 'High Memory Usage',
          description: `Heap usage is ${heapUsagePercent.toFixed(1)}% (${(heapUsed / 1024 / 1024).toFixed(1)}MB)`,
          actions: [
            'Check for memory leaks',
            'Clean up unused references',
            'Implement object pooling for frequent allocations',
          ],
        });
      }
    }

    // Analyze cache performance
    Object.entries(cacheStats).forEach(([strategy, stats]) => {
      if (typeof stats.hitRate === 'number' && stats.hitRate < 0.5) {
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
  async analyzePerformance(duration = 30000): Promise<PerformanceReport> {
    this.logger.info('Starting performance analysis...');

    // Wait for analysis duration
    await new Promise((resolve) => setTimeout(resolve, duration));

    // Get results
    const report = await this.getPerformanceReport();

    this.logger.info('Performance Analysis Complete', { report });

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
  async request<T = unknown>(config: RequestConfig): Promise<T> {
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
    const profiler = this.profiler as ProfilerWithCleanup;
    if (typeof profiler.cleanup === 'function') {
      profiler.cleanup();
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

  perfLogger.info('HEYS Performance Optimization initialized');
  return manager;
}
