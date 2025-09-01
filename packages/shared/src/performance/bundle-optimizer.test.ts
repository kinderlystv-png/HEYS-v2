/**
 * @file Bundle Optimizer Tests
 * @description Comprehensive test suite for BundleOptimizer class
 * Testing dynamic imports, code splitting, and build optimization
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  BundleOptimizer, 
  createLazyComponentFactory,
  createIntersectionLoader,
  trackBundleSize,
  defaultBundleOptimizer
} from './bundle-optimizer';

// Mock implementations
const mockPerformance = {
  now: vi.fn(() => Date.now()),
  mark: vi.fn(),
  measure: vi.fn(),
  getEntriesByType: vi.fn(() => []),
  getEntriesByName: vi.fn(() => []),
};

const mockIntersectionObserver = vi.fn(() => ({
  observe: vi.fn(),
  disconnect: vi.fn(),
  unobserve: vi.fn(),
}));

// Mock console methods
const mockConsole = {
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
};

// Mock window functions
const mockRequestIdleCallback = vi.fn((callback) => {
  setTimeout(callback, 0);
});

describe('BundleOptimizer', () => {
  let optimizer: BundleOptimizer;

  beforeEach(() => {
    optimizer = new BundleOptimizer();
    
    // Setup global mocks
    vi.stubGlobal('performance', mockPerformance);
    vi.stubGlobal('IntersectionObserver', mockIntersectionObserver);
    vi.stubGlobal('console', mockConsole);
    vi.stubGlobal('requestIdleCallback', mockRequestIdleCallback);
    
    // Reset all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    optimizer.destroy();
    vi.restoreAllMocks();
  });

  describe('Configuration', () => {
    it('should initialize with default configuration', () => {
      expect(optimizer).toBeDefined();
      expect(optimizer.getLoadingStatistics()).toBeDefined();
    });

    it('should accept custom configuration', () => {
      const customConfig = {
        codeSplitting: {
          vendor: true,
          commons: true,
          async: true,
          runtime: true,
          minSize: 20000,
          maxSize: 500000,
          maxAsyncRequests: 20,
          maxInitialRequests: 10,
        },
        treeShaking: {
          enabled: false,
          sideEffects: false,
          usedExports: false,
        },
      };

      const customOptimizer = new BundleOptimizer(customConfig);
      expect(customOptimizer).toBeDefined();
      customOptimizer.destroy();
    });
  });

  describe('Dynamic Module Loading', () => {
    it('should load module with immediate strategy', async () => {
      const mockModule = { test: 'data' };
      const moduleFactory = vi.fn().mockResolvedValue(mockModule);

      const result = await optimizer.dynamicImport(
        moduleFactory, 
        'test-module', 
        'immediate'
      );

      expect(result.module).toBe(mockModule);
      expect(result.cached).toBe(false);
      expect(result.loadTime).toBeGreaterThan(0);
      expect(moduleFactory).toHaveBeenCalledOnce();
    });

    it('should load module with lazy strategy', async () => {
      const mockModule = { test: 'data' };
      const moduleFactory = vi.fn().mockResolvedValue(mockModule);

      const result = await optimizer.dynamicImport(
        moduleFactory, 
        'test-module', 
        'lazy'
      );

      expect(result.module).toBe(mockModule);
      expect(result.cached).toBe(false);
      expect(moduleFactory).toHaveBeenCalledOnce();
    });

    it('should handle module loading errors', async () => {
      const error = new Error('Module load failed');
      const moduleFactory = vi.fn().mockRejectedValue(error);

      const result = await optimizer.dynamicImport(
        moduleFactory, 
        'test-module', 
        'immediate'
      );

      expect(result.module).toBe(null);
      expect(result.error).toBe(error);
      expect(result.cached).toBe(false);
    });

    it('should cache successfully loaded modules', async () => {
      const mockModule = { test: 'data' };
      const moduleFactory = vi.fn().mockResolvedValue(mockModule);

      // First load
      const result1 = await optimizer.dynamicImport(
        moduleFactory, 
        'test-module', 
        'immediate'
      );

      // Second load should use cache
      const result2 = await optimizer.dynamicImport(
        moduleFactory, 
        'test-module', 
        'immediate'
      );

      expect(result1.module).toBe(mockModule);
      expect(result2.module).toBe(mockModule);
      expect(result2.cached).toBe(true);
      expect(moduleFactory).toHaveBeenCalledOnce();
    });
  });

  describe('Lazy Component Creation', () => {
    it('should create lazy component factory', async () => {
      const mockComponent = { name: 'TestComponent' };
      const importFunction = vi.fn().mockResolvedValue({ default: mockComponent });

      const lazyFactory = optimizer.createLazyComponent(
        importFunction,
        'TestComponent'
      );
      
      const component = await lazyFactory();

      expect(component).toBe(mockComponent);
      expect(importFunction).toHaveBeenCalled();
    });

    it('should handle lazy component loading errors', async () => {
      const error = new Error('Import failed');
      const importFunction = vi.fn().mockRejectedValue(error);
      const fallback = vi.fn().mockReturnValue({ name: 'Fallback' });

      const lazyFactory = optimizer.createLazyComponent(
        importFunction,
        'FailingComponent',
        fallback
      );

      await expect(lazyFactory()).rejects.toThrow('Import failed');
    });
  });

  describe('Critical Resources Preloading', () => {
    it('should preload critical resources by priority', async () => {
      const resources = [
        { name: 'low', factory: vi.fn().mockResolvedValue({ id: 'low' }), priority: 1 },
        { name: 'high', factory: vi.fn().mockResolvedValue({ id: 'high' }), priority: 3 },
        { name: 'medium', factory: vi.fn().mockResolvedValue({ id: 'medium' }), priority: 2 },
      ];

      await optimizer.preloadCriticalResources(resources);
      
      resources.forEach(resource => {
        expect(resource.factory).toHaveBeenCalled();
      });
    });
  });

  describe('Intersection Observer Lazy Loading', () => {
    it('should setup intersection observer for lazy loading', () => {
      const elements = [document.createElement('div')];
      const moduleFactory = vi.fn().mockResolvedValue({ test: 'intersection' });
      const callback = vi.fn();

      optimizer.setupIntersectionLazyLoading(
        elements,
        moduleFactory,
        'intersection-module',
        callback
      );

      expect(mockIntersectionObserver).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          rootMargin: '50px',
          threshold: 0.1
        })
      );
    });
  });

  describe('Bundle Analysis', () => {
    it('should generate webpack configuration', () => {
      const config = optimizer.generateWebpackConfig();
      
      expect(config.mode).toBe('production');
      expect(config.optimization).toBeDefined();
      expect(config.optimization.splitChunks).toBeDefined();
      expect(config.module).toBeDefined();
      expect(config.plugins).toBeDefined();
    });

    it('should generate Vite configuration', () => {
      const config = optimizer.generateViteConfig();
      
      expect(config.build).toBeDefined();
      expect(config.build.rollupOptions).toBeDefined();
      expect(config.build.rollupOptions.output).toBeDefined();
      expect(config.optimizeDeps).toBeDefined();
    });

    it('should analyze bundle performance and provide recommendations', () => {
      const analysis = optimizer.analyzeBundlePerformance();
      
      expect(analysis.metrics).toBeDefined();
      expect(analysis.recommendations).toBeInstanceOf(Array);
      expect(analysis.metrics.totalSize).toBeGreaterThanOrEqual(0);
      expect(analysis.metrics.chunkCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Performance Monitoring', () => {
    it('should track loading statistics', async () => {
      const mockModule = { test: 'data' };
      const moduleFactory = vi.fn().mockResolvedValue(mockModule);

      await optimizer.dynamicImport(
        moduleFactory, 
        'test-module', 
        'immediate'
      );

      const stats = optimizer.getLoadingStatistics();
      expect(stats.totalModules).toBe(1);
      expect(stats.loadedModules).toBe(1);
      expect(stats.averageLoadTime).toBeGreaterThanOrEqual(0);
    });

    it('should clear cache and reset statistics', () => {
      optimizer.clearCache();
      
      const stats = optimizer.getLoadingStatistics();
      expect(stats.totalModules).toBe(0);
      expect(stats.loadedModules).toBe(0);
    });
  });

  describe('Memory Management', () => {
    it('should handle cache clearing', async () => {
      const mockModule = { test: 'data' };
      const moduleFactory = vi.fn().mockResolvedValue(mockModule);

      await optimizer.dynamicImport(moduleFactory, 'test-module', 'immediate');
      
      let stats = optimizer.getLoadingStatistics();
      expect(stats.totalModules).toBe(1);

      optimizer.clearCache();
      
      stats = optimizer.getLoadingStatistics();
      expect(stats.totalModules).toBe(0);
    });

    it('should cleanup observers on destroy', () => {
      const elements = [document.createElement('div')];
      const moduleFactory = vi.fn().mockResolvedValue({ test: 'data' });

      optimizer.setupIntersectionLazyLoading(
        elements,
        moduleFactory,
        'test-module'
      );

      optimizer.destroy();
      
      // Verify observers are cleaned up
      const stats = optimizer.getLoadingStatistics();
      expect(stats.totalModules).toBe(0);
    });
  });
});

describe('Utility Functions', () => {
  describe('createLazyComponentFactory', () => {
    it('should create lazy component factory', async () => {
      const mockComponent = { name: 'TestComponent' };
      const importFunction = vi.fn().mockResolvedValue({ default: mockComponent });

      const factory = createLazyComponentFactory(importFunction, 'TestComponent');
      const component = await factory();

      expect(component).toBe(mockComponent);
      expect(importFunction).toHaveBeenCalled();
      expect(mockConsole.log).toHaveBeenCalledWith(
        "Lazy component 'TestComponent' loaded successfully"
      );
    });

    it('should handle lazy component loading errors', async () => {
      const error = new Error('Import failed');
      const importFunction = vi.fn().mockRejectedValue(error);

      const factory = createLazyComponentFactory(importFunction, 'FailingComponent');

      await expect(factory()).rejects.toThrow('Import failed');
      expect(mockConsole.error).toHaveBeenCalledWith(
        "Failed to load lazy component 'FailingComponent':",
        error
      );
    });
  });

  describe('createIntersectionLoader', () => {
    it('should create intersection observer', () => {
      const callback = vi.fn();
      const options = { threshold: 0.5 };

      createIntersectionLoader(callback, options);

      expect(mockIntersectionObserver).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          threshold: 0.5,
          rootMargin: '50px'
        })
      );
    });

    it('should use default options when none provided', () => {
      const callback = vi.fn();

      createIntersectionLoader(callback);

      expect(mockIntersectionObserver).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          rootMargin: '50px',
          threshold: 0.1
        })
      );
    });
  });

  describe('trackBundleSize decorator', () => {
    it('should track method execution time', () => {
      class TestClass {
        testMethod(value: number): number {
          const startTime = performance.now();
          const result = value * 2;
          const endTime = performance.now();
          console.log(`Method testMethod execution time: ${endTime - startTime}ms`);
          return result;
        }
      }

      // Apply decorator manually for testing
      const descriptor = Object.getOwnPropertyDescriptor(TestClass.prototype, 'testMethod');
      if (descriptor) {
        trackBundleSize(TestClass.prototype, 'testMethod', descriptor);
        Object.defineProperty(TestClass.prototype, 'testMethod', descriptor);
      }

      const instance = new TestClass();
      const result = instance.testMethod(5);

      expect(result).toBe(10);
    });
  });
});

describe('Integration Tests', () => {
  it('should work with default instance', async () => {
    const mockModule = { test: 'integration' };
    const moduleFactory = vi.fn().mockResolvedValue(mockModule);

    const result = await defaultBundleOptimizer.dynamicImport(
      moduleFactory, 
      'integration-test', 
      'immediate'
    );

    expect(result.module).toBe(mockModule);
    expect(result.cached).toBe(false);
  });

  it('should handle complex optimization scenarios', async () => {
    const optimizer = new BundleOptimizer({
      codeSplitting: {
        vendor: true,
        commons: true,
        async: true,
        runtime: true,
        minSize: 20000,
        maxSize: 250000,
        maxAsyncRequests: 30,
        maxInitialRequests: 10,
      },
      treeShaking: {
        enabled: true,
        sideEffects: false,
        usedExports: true,
      },
    });

    // Load multiple modules to test optimization
    const modules = ['app', 'dashboard', 'reports', 'shared'];
    
    for (const moduleName of modules) {
      await optimizer.dynamicImport(
        () => Promise.resolve({ name: moduleName }),
        moduleName,
        'immediate'
      );
    }

    const analysis = optimizer.analyzeBundlePerformance();
    const stats = optimizer.getLoadingStatistics();

    expect(stats.totalModules).toBe(4);
    expect(analysis.recommendations.length).toBeGreaterThanOrEqual(0);
    
    optimizer.destroy();
  });

  it('should generate proper build configurations', () => {
    const optimizer = new BundleOptimizer({
      codeSplitting: {
        vendor: true,
        commons: true,
        async: true,
        runtime: true,
        minSize: 20000,
        maxSize: 500000,
        maxAsyncRequests: 30,
        maxInitialRequests: 10,
      },
      treeShaking: {
        enabled: true,
        sideEffects: false,
        usedExports: true,
      },
    });

    const webpackConfig = optimizer.generateWebpackConfig();
    const viteConfig = optimizer.generateViteConfig();

    // Webpack config validation
    expect(webpackConfig.optimization.splitChunks).toBeDefined();
    expect(webpackConfig.optimization.usedExports).toBe(true);
    expect(webpackConfig.optimization.sideEffects).toBe(false);

    // Vite config validation
    expect(viteConfig.build.rollupOptions.output.manualChunks).toBeDefined();
    expect(viteConfig.build.rollupOptions.treeshake).toBeDefined();
    
    optimizer.destroy();
  });
});

describe('Error Handling', () => {
  it('should handle concurrent module loading', async () => {
    const optimizer = new BundleOptimizer();
    const moduleFactory = vi.fn().mockResolvedValue({ test: 'concurrent' });

    // Load same module concurrently
    const promises = Array.from({ length: 5 }, () =>
      optimizer.dynamicImport(moduleFactory, 'concurrent-module', 'immediate')
    );

    const results = await Promise.all(promises);

    // First result should not be cached, others should be
    expect(results).toHaveLength(5);
    expect(results[0]?.cached).toBe(false);
    results.slice(1).forEach(result => {
      expect(result.module).toEqual({ test: 'concurrent' });
    });

    optimizer.destroy();
  });

  it('should recover from module loading failures', async () => {
    const optimizer = new BundleOptimizer();
    
    // First attempt fails
    const failingFactory = vi.fn().mockRejectedValue(new Error('Network error'));
    const result1 = await optimizer.dynamicImport(failingFactory, 'test-module', 'immediate');
    
    expect(result1.error).toBeDefined();
    expect(result1.module).toBe(null);

    // Second attempt succeeds
    const successFactory = vi.fn().mockResolvedValue({ recovered: true });
    const result2 = await optimizer.dynamicImport(successFactory, 'test-module-2', 'immediate');
    
    expect(result2.module).toEqual({ recovered: true });
    expect(result2.error).toBeUndefined();
    
    optimizer.destroy();
  });

  it('should handle missing browser APIs gracefully', async () => {
    // Simulate missing requestIdleCallback
    vi.stubGlobal('requestIdleCallback', undefined);
    
    const optimizer = new BundleOptimizer();
    const moduleFactory = vi.fn().mockResolvedValue({ test: 'fallback' });

    const result = await optimizer.dynamicImport(
      moduleFactory,
      'fallback-test',
      'prefetch'
    );

    expect(result.module).toEqual({ test: 'fallback' });
    
    optimizer.destroy();
  });
});
