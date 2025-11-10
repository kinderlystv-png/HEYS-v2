import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MobileOptimizationConfig } from './mobile-performance-optimizer';
import { MobilePerformanceOptimizer } from './mobile-performance-optimizer';

// Mock DOM APIs
const mockNavigator = {
  hardwareConcurrency: 4,
  connection: {
    effectiveType: '4g',
    downlink: 10,
    rtt: 100,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  },
  userAgent: 'Mozilla/5.0 (Linux; Android 10; SM-G975F) AppleWebKit/537.36',
};

const mockScreen = {
  width: 412,
  height: 896,
};

// Mock PerformanceObserver
const mockPerformanceObserver = vi.fn().mockImplementation((_callback) => {
  const instance = {
    observe: vi.fn(),
    disconnect: vi.fn(),
    takeRecords: vi.fn().mockReturnValue([]),
  };
  return instance;
});

const mockWindow = {
  devicePixelRatio: 2,
  performance: {
    memory: {
      totalJSHeapSize: 50000000,
      usedJSHeapSize: 30000000,
      jsHeapSizeLimit: 100000000,
    },
    now: () => Date.now(),
    mark: vi.fn(),
    measure: vi.fn(),
    getEntriesByType: vi.fn<[string], any[]>(() => []),
  },
  requestIdleCallback: vi.fn((callback) => setTimeout(callback, 0)),
  cancelIdleCallback: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  setInterval: vi.fn((callback, delay) => setInterval(callback, delay)),
  clearInterval: vi.fn((id) => clearInterval(id)),
  setTimeout: vi.fn((callback, delay) => setTimeout(callback, delay)),
  clearTimeout: vi.fn((id) => clearTimeout(id)),
  screen: mockScreen,
  ontouchstart: true, // Add touch support for mobile detection
  PerformanceObserver: mockPerformanceObserver, // Add PerformanceObserver to window
};

const mockDocument = {
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  visibilityState: 'visible',
  hidden: false,
  querySelectorAll: vi.fn(() => []),
  createElement: vi.fn(() => ({
    style: {},
    setAttribute: vi.fn(),
    getAttribute: vi.fn(),
  })),
  body: {
    style: {
      overscrollBehavior: '',
    },
  },
};

// Mock getBattery API
const mockBattery = {
  level: 0.8,
  charging: true,
  dischargingTime: Infinity,
  chargingTime: 0,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
};

// Apply mocks to global
global.navigator = mockNavigator as any;
global.window = mockWindow as any;
global.document = mockDocument as any;
global.screen = mockScreen as any;
(global.navigator as any).getBattery = vi.fn().mockResolvedValue(mockBattery);

// Global mocks
Object.defineProperty(global, 'navigator', { value: mockNavigator, writable: true });
Object.defineProperty(global, 'screen', { value: mockScreen, writable: true });
Object.defineProperty(global, 'window', { value: mockWindow, writable: true });
Object.defineProperty(global, 'document', { value: mockDocument, writable: true });
Object.defineProperty(global, 'performance', { value: mockWindow.performance, writable: true });
Object.defineProperty(global, 'IntersectionObserver', { value: vi.fn(), writable: true });
Object.defineProperty(global, 'WebAssembly', { value: {}, writable: true });

// Mock PerformanceObserver
global.PerformanceObserver = mockPerformanceObserver as any;
(global.PerformanceObserver as any).supportedEntryTypes = [
  'navigation',
  'resource',
  'measure',
  'mark',
];

describe('MobilePerformanceOptimizer', () => {
  let optimizer: MobilePerformanceOptimizer;
  let config: MobileOptimizationConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    config = {
      touchOptimization: {
        enabled: true,
        debounceTime: 100,
        fastClickThreshold: 300,
        preventScrollBounce: true,
      },
      networkOptimization: {
        enabled: true,
        prefetchStrategy: 'adaptive',
        compressionLevel: 6,
        requestCoalescing: true,
        adaptiveImageQuality: true,
      },
      batteryOptimization: {
        enabled: true,
        reducedAnimations: true,
        suspendBackgroundTasks: true,
        throttleNonCriticalWork: true,
      },
      memoryOptimization: {
        enabled: true,
        lazyComponentUnmounting: true,
        imagePooling: true,
        gcHinting: true,
      },
      adaptiveLoading: {
        enabled: true,
        deviceBasedSplitting: true,
        networkBasedLoading: true,
        progressiveEnhancement: true,
      },
    };
  });

  afterEach(() => {
    if (optimizer) {
      optimizer.destroy();
    }
  });

  describe('Initialization', () => {
    it('should create instance with default configuration', () => {
      optimizer = new MobilePerformanceOptimizer(config);
      expect(optimizer).toBeInstanceOf(MobilePerformanceOptimizer);
    });

    it('should detect device capabilities', () => {
      optimizer = new MobilePerformanceOptimizer(config);
      const deviceInfo = optimizer.getDeviceInfo();

      expect(deviceInfo).toBeDefined();
      expect(deviceInfo.deviceType).toBe('phone');
      expect(deviceInfo.screenSize.width).toBe(412);
      expect(deviceInfo.screenSize.height).toBe(896);
      expect(deviceInfo.screenSize.dpr).toBe(2);
      expect(deviceInfo.isLowEndDevice).toBeDefined();
      expect(deviceInfo.supportedFeatures).toBeDefined();
    });

    it('should setup performance monitoring', async () => {
      optimizer = new MobilePerformanceOptimizer(config);

      // Wait for async initialization to complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Verify performance observers are set up
      expect(global.PerformanceObserver).toHaveBeenCalled();
    });
  });

  describe('Touch Optimization', () => {
    beforeEach(() => {
      optimizer = new MobilePerformanceOptimizer(config);
    });

    it('should register touch event listeners when enabled', () => {
      expect(mockDocument.addEventListener).toHaveBeenCalledWith(
        'touchstart',
        expect.any(Function),
        expect.anything(),
      );
      expect(mockDocument.addEventListener).toHaveBeenCalledWith(
        'touchmove',
        expect.any(Function),
        expect.anything(),
      );
      expect(mockDocument.addEventListener).toHaveBeenCalledWith(
        'touchend',
        expect.any(Function),
        expect.anything(),
      );
    });

    it('should not register touch listeners when disabled', () => {
      optimizer.destroy();
      vi.clearAllMocks();

      const disabledConfig = { ...config };
      disabledConfig.touchOptimization.enabled = false;

      optimizer = new MobilePerformanceOptimizer(disabledConfig);

      expect(mockDocument.addEventListener).not.toHaveBeenCalledWith(
        'touchstart',
        expect.any(Function),
        expect.any(Object),
      );
    });
  });

  describe('Network Optimization', () => {
    beforeEach(() => {
      optimizer = new MobilePerformanceOptimizer(config);
    });

    it('should implement adaptive prefetching strategy', () => {
      const strategy = optimizer.getPrefetchStrategy();
      expect(strategy).toBe('adaptive');
    });

    it('should enable request coalescing', () => {
      const isCoalescingEnabled = optimizer.isRequestCoalescingEnabled();
      expect(isCoalescingEnabled).toBe(true);
    });

    it('should adapt image quality based on network conditions', () => {
      const isAdaptiveQuality = optimizer.isAdaptiveImageQualityEnabled();
      expect(isAdaptiveQuality).toBe(true);
    });
  });

  describe('Battery Optimization', () => {
    beforeEach(() => {
      optimizer = new MobilePerformanceOptimizer(config);
    });

    it('should implement reduced animations for battery saving', () => {
      const isReducedAnimations = optimizer.isReducedAnimationsEnabled();
      expect(isReducedAnimations).toBe(true);
    });

    it('should suspend background tasks when enabled', () => {
      const isSuspended = optimizer.isBackgroundTasksSuspended();
      expect(isSuspended).toBe(true);
    });

    it('should throttle non-critical work', () => {
      const isThrottled = optimizer.isNonCriticalWorkThrottled();
      expect(isThrottled).toBe(true);
    });
  });

  describe('Memory Optimization', () => {
    beforeEach(() => {
      optimizer = new MobilePerformanceOptimizer(config);
    });

    it('should enable lazy component unmounting', () => {
      const isLazyUnmounting = optimizer.isLazyComponentUnmountingEnabled();
      expect(isLazyUnmounting).toBe(true);
    });

    it('should implement image pooling', () => {
      const isImagePooling = optimizer.isImagePoolingEnabled();
      expect(isImagePooling).toBe(true);
    });

    it('should provide garbage collection hints', () => {
      const isGCHinting = optimizer.isGCHintingEnabled();
      expect(isGCHinting).toBe(true);
    });
  });

  describe('Adaptive Loading', () => {
    beforeEach(() => {
      optimizer = new MobilePerformanceOptimizer(config);
    });

    it('should implement device-based code splitting', () => {
      const isDeviceBasedSplitting = optimizer.isDeviceBasedSplittingEnabled();
      expect(isDeviceBasedSplitting).toBe(true);
    });

    it('should adapt loading based on network conditions', () => {
      const isNetworkBasedLoading = optimizer.isNetworkBasedLoadingEnabled();
      expect(isNetworkBasedLoading).toBe(true);
    });

    it('should support progressive enhancement', () => {
      const isProgressiveEnhancement = optimizer.isProgressiveEnhancementEnabled();
      expect(isProgressiveEnhancement).toBe(true);
    });
  });

  describe('Performance Monitoring', () => {
    beforeEach(() => {
      optimizer = new MobilePerformanceOptimizer(config);
    });

    it('should track Core Web Vitals', async () => {
      // Simulate performance entries
      const mockEntries = [
        {
          name: 'first-contentful-paint',
          startTime: 1000,
          entryType: 'paint',
        },
        {
          name: 'largest-contentful-paint',
          startTime: 1500,
          entryType: 'largest-contentful-paint',
          size: 5000,
        },
      ];

      mockWindow.performance.getEntriesByType.mockReturnValue(mockEntries);

      const metrics = await optimizer.getCoreWebVitals();
      expect(metrics).toBeDefined();
    });

    it('should monitor memory usage', () => {
      const memoryUsage = optimizer.getMemoryUsage();
      expect(memoryUsage).toBeDefined();
      expect(memoryUsage.used).toBeTypeOf('number');
      expect(memoryUsage.total).toBeTypeOf('number');
    });

    it('should track network performance', () => {
      const networkMetrics = optimizer.getNetworkMetrics();
      expect(networkMetrics).toBeDefined();
    });
  });

  describe('Device Detection', () => {
    it('should detect phone device type', () => {
      // Mock phone screen size with touch support
      const phoneScreen = { width: 412, height: 896 };
      const phoneWindow = {
        ...mockWindow,
        screen: phoneScreen,
        ontouchstart: true,
      };

      Object.defineProperty(global, 'screen', { value: phoneScreen, writable: true });
      Object.defineProperty(global, 'window', { value: phoneWindow, writable: true });

      optimizer = new MobilePerformanceOptimizer(config);
      const deviceInfo = optimizer.getDeviceInfo();
      expect(deviceInfo.deviceType).toBe('phone');
    });

    it('should detect tablet device type for larger screens', () => {
      // Mock tablet screen size with touch support
      const tabletScreen = { width: 768, height: 1024 };
      const tabletWindow = {
        ...mockWindow,
        screen: tabletScreen,
        ontouchstart: true,
      };

      Object.defineProperty(global, 'screen', { value: tabletScreen, writable: true });
      Object.defineProperty(global, 'window', { value: tabletWindow, writable: true });

      optimizer = new MobilePerformanceOptimizer(config);
      const deviceInfo = optimizer.getDeviceInfo();
      expect(deviceInfo.deviceType).toBe('tablet');
    });

    it('should detect desktop when no touch support', () => {
      // Mock desktop environment without touch
      const desktopScreen = { width: 1920, height: 1080 };
      const desktopWindow = {
        ...mockWindow,
        screen: desktopScreen,
        ontouchstart: undefined,
      };

      Object.defineProperty(global, 'screen', { value: desktopScreen, writable: true });
      Object.defineProperty(global, 'window', { value: desktopWindow, writable: true });

      optimizer = new MobilePerformanceOptimizer(config);
      const deviceInfo = optimizer.getDeviceInfo();
      expect(deviceInfo.deviceType).toBe('desktop');
    });
  });

  describe('Configuration Updates', () => {
    beforeEach(() => {
      optimizer = new MobilePerformanceOptimizer(config);
    });

    it('should allow runtime configuration updates', () => {
      const newConfig = { ...config };
      newConfig.touchOptimization.enabled = false;

      optimizer.updateConfig(newConfig);

      expect(optimizer.isOptimizationEnabled('touch')).toBe(false);
    });

    it('should validate configuration parameters', () => {
      const invalidConfig = { ...config };
      invalidConfig.networkOptimization.compressionLevel = 15; // Invalid range

      expect(() => {
        optimizer.updateConfig(invalidConfig);
      }).toThrow();
    });
  });

  describe('Performance Budget', () => {
    beforeEach(() => {
      optimizer = new MobilePerformanceOptimizer(config);
    });

    it('should set appropriate performance budgets for mobile devices', () => {
      const budget = optimizer.getPerformanceBudget();

      expect(budget).toBeDefined();
      expect(budget.firstContentfulPaint).toBeTypeOf('number');
      expect(budget.largestContentfulPaint).toBeTypeOf('number');
      expect(budget.firstInputDelay).toBeTypeOf('number');
      expect(budget.cumulativeLayoutShift).toBeTypeOf('number');
      expect(budget.timeToInteractive).toBeTypeOf('number');
      expect(budget.totalBlockingTime).toBeTypeOf('number');
    });

    it('should adjust budgets for low-end devices', () => {
      // Mock low-end device
      mockNavigator.hardwareConcurrency = 2;
      mockWindow.performance.memory.totalJSHeapSize = 10000000;

      optimizer = new MobilePerformanceOptimizer(config);
      const budget = optimizer.getPerformanceBudget();

      // Budgets should be more relaxed for low-end devices
      expect(budget.firstContentfulPaint).toBeGreaterThan(1000);
    });
  });

  describe('Cleanup', () => {
    beforeEach(() => {
      optimizer = new MobilePerformanceOptimizer(config);
    });

    it('should clean up event listeners on destroy', () => {
      optimizer.destroy();

      // Check that removeEventListener was called for all three touch events
      expect(mockDocument.removeEventListener).toHaveBeenCalledTimes(3);

      // Check the call arguments - function references can be any function
      expect(mockDocument.removeEventListener).toHaveBeenCalledWith(
        'touchstart',
        expect.anything(),
      );
      expect(mockDocument.removeEventListener).toHaveBeenCalledWith('touchmove', expect.anything());
      expect(mockDocument.removeEventListener).toHaveBeenCalledWith('touchend', expect.anything());
    });

    it('should stop performance monitoring on destroy', async () => {
      optimizer = new MobilePerformanceOptimizer(config);

      // Wait for async initialization to complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      // The constructor should have created a PerformanceObserver
      expect(global.PerformanceObserver).toHaveBeenCalled();

      // Get the most recent mock instance that was created
      const mockInstances = (global.PerformanceObserver as any).mock.results;
      const mockInstance = mockInstances[mockInstances.length - 1].value;

      // Ensure disconnect method exists on the mock
      expect(mockInstance).toBeDefined();
      expect(mockInstance.disconnect).toBeDefined();

      optimizer.destroy();

      expect(mockInstance.disconnect).toHaveBeenCalled();
    });
  });
});
