/**
 * HEYS Performance Profiler
 * Advanced performance monitoring and optimization toolkit
 *
 * @author HEYS Team
 * @version 1.4.0
 * @created 2025-01-31
 */

import { getGlobalLogger } from '../monitoring/structured-logger';

type PerformanceMemory = {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
};

/**
 * Performance metric types
 */
export interface PerformanceMetric {
  name: string;
  value: number;
  unit: 'ms' | 'bytes' | 'count' | 'score' | '%';
  timestamp: number;
  category: 'loading' | 'scripting' | 'rendering' | 'painting' | 'memory' | 'network';
  target?: number; // Target/ideal value
  threshold?: number; // Warning threshold
}

/**
 * Bundle analysis result
 */
export interface BundleAnalysis {
  totalSize: number;
  gzippedSize: number;
  modules: ModuleInfo[];
  chunks: ChunkInfo[];
  dependencies: DependencyInfo[];
  duplicates: DuplicateInfo[];
  treeshaking: TreeshakingInfo;
}

export interface ModuleInfo {
  name: string;
  size: number;
  gzippedSize: number;
  path: string;
  reasons: string[];
  chunks: string[];
}

export interface ChunkInfo {
  name: string;
  size: number;
  modules: string[];
  entry: boolean;
  async: boolean;
}

export interface DependencyInfo {
  name: string;
  version: string;
  size: number;
  used: boolean;
  treeshakeable: boolean;
}

export interface DuplicateInfo {
  module: string;
  occurrences: number;
  totalSize: number;
  locations: string[];
}

export interface TreeshakingInfo {
  eliminatedModules: string[];
  eliminatedSize: number;
  efficiency: number; // percentage
}

/**
 * Runtime performance metrics
 */
export interface RuntimePerformance {
  memory: {
    used: number;
    total: number;
    heapUsed: number;
    heapTotal: number;
    external: number;
  };
  timing: {
    domLoading: number;
    domInteractive: number;
    domContentLoaded: number;
    loadComplete: number;
    firstPaint: number;
    firstContentfulPaint: number;
    largestContentfulPaint: number;
    firstInputDelay: number;
    cumulativeLayoutShift: number;
  };
  network: {
    totalRequests: number;
    totalBytes: number;
    averageResponseTime: number;
    slowRequests: number;
  };
  javascript: {
    executeTime: number;
    parseTime: number;
    compileTime: number;
    garbageCollectionTime: number;
  };
}

/**
 * Performance budget configuration
 */
export interface PerformanceBudget {
  maxBundleSize: number; // bytes
  maxChunkSize: number; // bytes
  maxLoadTime: number; // ms
  maxFirstPaint: number; // ms
  maxLargestContentfulPaint: number; // ms
  maxFirstInputDelay: number; // ms
  maxCumulativeLayoutShift: number; // score
  maxMemoryUsage: number; // bytes
}

/**
 * Main performance profiler class
 */
export class PerformanceProfiler {
  private metrics: PerformanceMetric[] = [];
  private observers: PerformanceObserver[] = [];
  private budget: PerformanceBudget;
  private readonly logger = getGlobalLogger().child({ component: 'PerformanceProfiler' });

  constructor(budget?: Partial<PerformanceBudget>) {
    this.budget = {
      maxBundleSize: 500 * 1024, // 500KB
      maxChunkSize: 100 * 1024, // 100KB
      maxLoadTime: 3000, // 3s
      maxFirstPaint: 1000, // 1s
      maxLargestContentfulPaint: 2500, // 2.5s
      maxFirstInputDelay: 100, // 100ms
      maxCumulativeLayoutShift: 0.1, // 0.1 score
      maxMemoryUsage: 50 * 1024 * 1024, // 50MB
      ...budget,
    };

    this.initializeObservers();
  }

  /**
   * Initialize performance observers
   */
  private initializeObservers(): void {
    if (typeof window === 'undefined' || !window.PerformanceObserver) {
      return;
    }

    // Navigation timing
    this.observeNavigationTiming();

    // Paint timing
    this.observePaintTiming();

    // Layout shift
    this.observeLayoutShift();

    // First input delay
    this.observeFirstInputDelay();

    // Long tasks
    this.observeLongTasks();

    // Resource timing
    this.observeResourceTiming();
  }

  /**
   * Observe navigation timing
   */
  private observeNavigationTiming(): void {
    if (!window.performance?.getEntriesByType) return;

    const navigationEntries = window.performance.getEntriesByType(
      'navigation',
    ) as PerformanceNavigationTiming[];

    navigationEntries.forEach((entry) => {
      this.addMetric({
        name: 'DOM Loading',
        value: entry.domContentLoadedEventStart - entry.fetchStart,
        unit: 'ms',
        timestamp: Date.now(),
        category: 'loading',
        target: 500,
        threshold: this.budget.maxLoadTime,
      });

      this.addMetric({
        name: 'DOM Interactive',
        value: entry.domInteractive - entry.fetchStart,
        unit: 'ms',
        timestamp: Date.now(),
        category: 'loading',
        target: 1000,
        threshold: this.budget.maxLoadTime,
      });

      this.addMetric({
        name: 'Load Complete',
        value: entry.loadEventEnd - entry.fetchStart,
        unit: 'ms',
        timestamp: Date.now(),
        category: 'loading',
        target: 2000,
        threshold: this.budget.maxLoadTime,
      });
    });
  }

  /**
   * Observe paint timing
   */
  private observePaintTiming(): void {
    const observer = new PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => {
        if (entry.name === 'first-paint') {
          this.addMetric({
            name: 'First Paint',
            value: entry.startTime,
            unit: 'ms',
            timestamp: Date.now(),
            category: 'painting',
            target: 500,
            threshold: this.budget.maxFirstPaint,
          });
        }

        if (entry.name === 'first-contentful-paint') {
          this.addMetric({
            name: 'First Contentful Paint',
            value: entry.startTime,
            unit: 'ms',
            timestamp: Date.now(),
            category: 'painting',
            target: 800,
            threshold: this.budget.maxFirstPaint,
          });
        }
      });
    });

    try {
      observer.observe({ entryTypes: ['paint'] });
      this.observers.push(observer);
    } catch (e) {
      this.logger.warn('Paint timing not supported');
    }
  }

  /**
   * Observe layout shift
   */
  private observeLayoutShift(): void {
    const observer = new PerformanceObserver((list) => {
      let totalShift = 0;

      list.getEntries().forEach((entry) => {
        if ('hadRecentInput' in entry && 'value' in entry) {
          const layoutShiftEntry = entry as PerformanceEntry & {
            hadRecentInput: boolean;
            value: number;
          };
          if (!layoutShiftEntry.hadRecentInput) {
            totalShift += layoutShiftEntry.value;
          }
        }
      });

      if (totalShift > 0) {
        this.addMetric({
          name: 'Cumulative Layout Shift',
          value: totalShift,
          unit: 'score',
          timestamp: Date.now(),
          category: 'rendering',
          target: 0.05,
          threshold: this.budget.maxCumulativeLayoutShift,
        });
      }
    });

    try {
      observer.observe({ entryTypes: ['layout-shift'] });
      this.observers.push(observer);
    } catch (e) {
      this.logger.warn('Layout shift observation not supported');
    }
  }

  /**
   * Observe first input delay
   */
  private observeFirstInputDelay(): void {
    const observer = new PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => {
        if ('processingStart' in entry) {
          const fidEntry = entry as PerformanceEntry & { processingStart: number };
          this.addMetric({
            name: 'First Input Delay',
            value: fidEntry.processingStart - fidEntry.startTime,
            unit: 'ms',
            timestamp: Date.now(),
            category: 'scripting',
            target: 50,
            threshold: this.budget.maxFirstInputDelay,
          });
        }
      });
    });

    try {
      observer.observe({ entryTypes: ['first-input'] });
      this.observers.push(observer);
    } catch (e) {
      this.logger.warn('First input delay observation not supported');
    }
  }

  /**
   * Observe long tasks
   */
  private observeLongTasks(): void {
    const observer = new PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => {
        this.addMetric({
          name: 'Long Task',
          value: entry.duration,
          unit: 'ms',
          timestamp: Date.now(),
          category: 'scripting',
          target: 0,
          threshold: 50,
        });
      });
    });

    try {
      observer.observe({ entryTypes: ['longtask'] });
      this.observers.push(observer);
    } catch (e) {
      this.logger.warn('Long task observation not supported');
    }
  }

  /**
   * Observe resource timing
   */
  private observeResourceTiming(): void {
    const observer = new PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => {
        const resourceEntry = entry as PerformanceResourceTiming;

        this.addMetric({
          name: `Resource Load: ${resourceEntry.name.split('/').pop()}`,
          value: resourceEntry.responseEnd - resourceEntry.requestStart,
          unit: 'ms',
          timestamp: Date.now(),
          category: 'network',
          target: 200,
          threshold: 1000,
        });

        // Track transfer size
        if (resourceEntry.transferSize) {
          this.addMetric({
            name: `Resource Size: ${resourceEntry.name.split('/').pop()}`,
            value: resourceEntry.transferSize,
            unit: 'bytes',
            timestamp: Date.now(),
            category: 'network',
            target: 10 * 1024, // 10KB
            threshold: 100 * 1024, // 100KB
          });
        }
      });
    });

    try {
      observer.observe({ entryTypes: ['resource'] });
      this.observers.push(observer);
    } catch (e) {
      this.logger.warn('Resource timing observation not supported');
    }
  }

  /**
   * Add a performance metric
   */
  addMetric(metric: PerformanceMetric): void {
    this.metrics.push(metric);

    // Check against thresholds
    if (metric.threshold && metric.value > metric.threshold) {
      this.logger.warn('Performance threshold exceeded', {
        metadata: {
          name: metric.name,
          value: metric.value,
          unit: metric.unit,
          threshold: metric.threshold,
        },
      });
    }
  }

  /**
   * Get current memory usage
   */
  getMemoryUsage(): PerformanceMetric[] {
    const memMetrics: PerformanceMetric[] = [];

    if (typeof window !== 'undefined') {
      const memory = (window.performance as Performance & { memory?: PerformanceMemory }).memory;
      if (!memory) {
        return memMetrics;
      }

      memMetrics.push({
        name: 'JS Heap Used',
        value: memory.usedJSHeapSize,
        unit: 'bytes',
        timestamp: Date.now(),
        category: 'memory',
        target: 10 * 1024 * 1024, // 10MB
        threshold: this.budget.maxMemoryUsage,
      });

      memMetrics.push({
        name: 'JS Heap Total',
        value: memory.totalJSHeapSize,
        unit: 'bytes',
        timestamp: Date.now(),
        category: 'memory',
        target: 20 * 1024 * 1024, // 20MB
        threshold: this.budget.maxMemoryUsage,
      });

      memMetrics.push({
        name: 'JS Heap Limit',
        value: memory.jsHeapSizeLimit,
        unit: 'bytes',
        timestamp: Date.now(),
        category: 'memory',
      });
    }

    return memMetrics;
  }

  /**
   * Measure function execution time
   */
  measureFunction<T>(name: string, fn: () => T): T {
    const start = performance.now();
    const result = fn();
    const end = performance.now();

    this.addMetric({
      name: `Function: ${name}`,
      value: end - start,
      unit: 'ms',
      timestamp: Date.now(),
      category: 'scripting',
      target: 1,
      threshold: 16.67, // 60fps frame budget
    });

    return result;
  }

  /**
   * Measure async function execution time
   */
  async measureAsyncFunction<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    const result = await fn();
    const end = performance.now();

    this.addMetric({
      name: `Async Function: ${name}`,
      value: end - start,
      unit: 'ms',
      timestamp: Date.now(),
      category: 'scripting',
      target: 10,
      threshold: 100,
    });

    return result;
  }

  /**
   * Get all metrics
   */
  getMetrics(): PerformanceMetric[] {
    return [...this.metrics, ...this.getMemoryUsage()];
  }

  /**
   * Get metrics by category
   */
  getMetricsByCategory(category: PerformanceMetric['category']): PerformanceMetric[] {
    return this.getMetrics().filter((metric) => metric.category === category);
  }

  /**
   * Get performance score
   */
  getPerformanceScore(): number {
    const metrics = this.getMetrics();
    let totalScore = 0;
    let weightedScore = 0;

    const weights = {
      loading: 0.3,
      scripting: 0.2,
      rendering: 0.2,
      painting: 0.15,
      memory: 0.1,
      network: 0.05,
    };

    Object.entries(weights).forEach(([category, weight]) => {
      const categoryMetrics = metrics.filter((m) => m.category === category);
      if (categoryMetrics.length === 0) return;

      const categoryScore =
        categoryMetrics.reduce((sum, metric) => {
          if (!metric.target) return sum + 100;

          const score = Math.max(0, Math.min(100, (metric.target / metric.value) * 100));
          return sum + score;
        }, 0) / categoryMetrics.length;

      weightedScore += categoryScore * weight;
      totalScore += weight;
    });

    return totalScore > 0 ? Math.round(weightedScore / totalScore) : 0;
  }

  /**
   * Generate performance report
   */
  generateReport(): {
    score: number;
    metrics: PerformanceMetric[];
    violations: PerformanceMetric[];
    recommendations: string[];
  } {
    const metrics = this.getMetrics();
    const violations = metrics.filter((m) => m.threshold && m.value > m.threshold);
    const score = this.getPerformanceScore();

    const recommendations: string[] = [];

    // Generate recommendations based on violations
    violations.forEach((violation) => {
      switch (violation.category) {
        case 'loading':
          recommendations.push('Consider code splitting and lazy loading');
          recommendations.push('Optimize bundle size and remove unused dependencies');
          break;
        case 'painting':
          recommendations.push('Optimize images and use WebP format');
          recommendations.push('Minimize render-blocking resources');
          break;
        case 'scripting':
          recommendations.push('Reduce JavaScript execution time');
          recommendations.push('Use Web Workers for heavy computations');
          break;
        case 'memory':
          recommendations.push('Optimize memory usage and fix memory leaks');
          recommendations.push('Use object pooling and cleanup event listeners');
          break;
        case 'network':
          recommendations.push('Enable compression and use CDN');
          recommendations.push('Implement resource caching strategies');
          break;
      }
    });

    // Remove duplicates
    const uniqueRecommendations = [...new Set(recommendations)];

    return {
      score,
      metrics,
      violations,
      recommendations: uniqueRecommendations,
    };
  }

  /**
   * Start continuous monitoring
   */
  startMonitoring(interval: number = 5000): ReturnType<typeof setInterval> {
    return setInterval(() => {
      const memoryMetrics = this.getMemoryUsage();
      memoryMetrics.forEach((metric) => this.addMetric(metric));
    }, interval);
  }

  /**
   * Stop monitoring and cleanup
   */
  stopMonitoring(): void {
    this.observers.forEach((observer) => observer.disconnect());
    this.observers = [];
  }

  /**
   * Clear all metrics
   */
  clearMetrics(): void {
    this.metrics = [];
  }
}

/**
 * Default performance profiler instance
 */
export const defaultProfiler = new PerformanceProfiler();

/**
 * Performance decorator for methods
 */
export function measurePerformance(name?: string) {
  return function (
    target: { constructor: { name: string } },
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value as (...args: unknown[]) => unknown;
    const methodName = name || `${target.constructor.name}.${propertyKey}`;

    descriptor.value = function (...args: unknown[]) {
      return defaultProfiler.measureFunction(methodName, () => {
        return originalMethod.apply(this, args);
      });
    };

    return descriptor;
  };
}

/**
 * Async performance decorator
 */
export function measureAsyncPerformance(name?: string) {
  return function (
    target: { constructor: { name: string } },
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value as (...args: unknown[]) => Promise<unknown>;
    const methodName = name || `${target.constructor.name}.${propertyKey}`;

    descriptor.value = async function (...args: unknown[]) {
      return await defaultProfiler.measureAsyncFunction(methodName, async () => {
        return await originalMethod.apply(this, args);
      });
    };

    return descriptor;
  };
}
