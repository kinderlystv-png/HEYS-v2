/**
 * Mobile Performance Optimizer for HEYS Application
 * Implements mobile-specific performance optimizations including
 * touch handling, network efficiency, battery optimization, and adaptive loading
 *
 * @author HEYS Team
 * @version 1.4.0
 * @created 2025-01-31
 */

export interface MobileDeviceInfo {
  deviceType: 'phone' | 'tablet' | 'desktop';
  screenSize: { width: number; height: number; dpr: number };
  networkType?: 'slow-2g' | '2g' | '3g' | '4g' | '5g' | 'wifi' | 'unknown';
  batteryLevel?: number;
  isLowEndDevice: boolean;
  supportedFeatures: {
    webgl: boolean;
    serviceWorker: boolean;
    webAssembly: boolean;
    intersectionObserver: boolean;
    passiveEventListeners: boolean;
  };
  memoryInfo?: {
    totalJSHeapSize: number;
    usedJSHeapSize: number;
    jsHeapSizeLimit: number;
  };
  hardwareConcurrency?: number;
}

export interface MobileOptimizationConfig {
  touchOptimization: {
    enabled: boolean;
    debounceTime: number;
    fastClickThreshold: number;
    preventScrollBounce: boolean;
  };
  networkOptimization: {
    enabled: boolean;
    prefetchStrategy: 'aggressive' | 'conservative' | 'adaptive';
    compressionLevel: number;
    requestCoalescing: boolean;
    adaptiveImageQuality: boolean;
  };
  batteryOptimization: {
    enabled: boolean;
    reducedAnimations: boolean;
    suspendBackgroundTasks: boolean;
    throttleNonCriticalWork: boolean;
  };
  memoryOptimization: {
    enabled: boolean;
    lazyComponentUnmounting: boolean;
    imagePooling: boolean;
    gcHinting: boolean;
  };
  adaptiveLoading: {
    enabled: boolean;
    deviceBasedSplitting: boolean;
    networkBasedLoading: boolean;
    progressiveEnhancement: boolean;
  };
}

export interface CustomTouchEvent {
  type: 'tap' | 'doubletap' | 'longpress' | 'swipe' | 'pinch' | 'pan';
  coordinates: { x: number; y: number };
  target: HTMLElement;
  timestamp: number;
  velocity?: number;
  direction?: 'up' | 'down' | 'left' | 'right';
  scale?: number;
}

export interface DOMTouchEvent extends TouchEvent {
  preventDefault(): void;
  touches: TouchList;
}

export interface PerformanceBudget {
  firstContentfulPaint: number;
  largestContentfulPaint: number;
  firstInputDelay: number;
  cumulativeLayoutShift: number;
  timeToInteractive: number;
  totalBlockingTime: number;
}

/**
 * Mobile Performance Optimizer
 */
export class MobilePerformanceOptimizer {
  private config: MobileOptimizationConfig;
  private deviceInfo: MobileDeviceInfo;
  private performanceBudget: PerformanceBudget;
  private touchHandlers: Map<string, Function>;
  private networkMonitor: NetworkMonitor;
  private batteryMonitor: BatteryMonitor;
  private memoryMonitor: MemoryMonitor;
  private adaptiveLoader: AdaptiveLoader;
  private isInitialized: boolean = false;
  private performanceObserver?: PerformanceObserver;
  private handleTouchStart: (event: TouchEvent) => void;
  private handleTouchMove: (event: TouchEvent) => void;
  private handleTouchEnd: (event: TouchEvent) => void;

  constructor(config: MobileOptimizationConfig) {
    this.config = config;
    this.touchHandlers = new Map();
    this.deviceInfo = this.detectDeviceCapabilities();
    this.performanceBudget = this.getPerformanceBudgetForDevice();

    this.networkMonitor = new NetworkMonitor();
    this.batteryMonitor = new BatteryMonitor();
    this.memoryMonitor = new MemoryMonitor();
    this.adaptiveLoader = new AdaptiveLoader(this.deviceInfo);

    // Initialize touch handlers
    this.handleTouchStart = this.onTouchStart.bind(this);
    this.handleTouchMove = this.onTouchMove.bind(this);
    this.handleTouchEnd = this.onTouchEnd.bind(this);

    this.initialize();
  }

  private onTouchStart(_event: TouchEvent): void {
    // Touch start handling logic
  }

  private onTouchMove(_event: TouchEvent): void {
    // Touch move handling logic
  }

  private onTouchEnd(_event: TouchEvent): void {
    // Touch end handling logic
  }

  /**
   * Initialize mobile performance optimizations
   */
  private async initialize(): Promise<void> {
    try {
      if (this.config.touchOptimization.enabled) {
        await this.initializeTouchOptimization();
      }

      if (this.config.networkOptimization.enabled) {
        await this.initializeNetworkOptimization();
      }

      if (this.config.batteryOptimization.enabled) {
        await this.initializeBatteryOptimization();
      }

      if (this.config.memoryOptimization.enabled) {
        await this.initializeMemoryOptimization();
      }

      if (this.config.adaptiveLoading.enabled) {
        await this.initializeAdaptiveLoading();
      }

      this.startPerformanceMonitoring();
      this.isInitialized = true;

      console.log('Mobile Performance Optimizer initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Mobile Performance Optimizer:', error);
    }
  }

  /**
   * Public API Methods
   */

  getDeviceInfo(): MobileDeviceInfo {
    return this.deviceInfo;
  }

  getPerformanceBudget(): PerformanceBudget {
    return this.performanceBudget;
  }

  getPrefetchStrategy(): string {
    return this.config.networkOptimization.prefetchStrategy;
  }

  isRequestCoalescingEnabled(): boolean {
    return this.config.networkOptimization.requestCoalescing;
  }

  isAdaptiveImageQualityEnabled(): boolean {
    return this.config.networkOptimization.adaptiveImageQuality;
  }

  isReducedAnimationsEnabled(): boolean {
    return this.config.batteryOptimization.reducedAnimations;
  }

  isBackgroundTasksSuspended(): boolean {
    return this.config.batteryOptimization.suspendBackgroundTasks;
  }

  isNonCriticalWorkThrottled(): boolean {
    return this.config.batteryOptimization.throttleNonCriticalWork;
  }

  isLazyComponentUnmountingEnabled(): boolean {
    return this.config.memoryOptimization.lazyComponentUnmounting;
  }

  isImagePoolingEnabled(): boolean {
    return this.config.memoryOptimization.imagePooling;
  }

  isGCHintingEnabled(): boolean {
    return this.config.memoryOptimization.gcHinting;
  }

  isDeviceBasedSplittingEnabled(): boolean {
    return this.config.adaptiveLoading.deviceBasedSplitting;
  }

  isNetworkBasedLoadingEnabled(): boolean {
    return this.config.adaptiveLoading.networkBasedLoading;
  }

  isProgressiveEnhancementEnabled(): boolean {
    return this.config.adaptiveLoading.progressiveEnhancement;
  }

  async getCoreWebVitals(): Promise<Record<string, number>> {
    const paintEntries = performance.getEntriesByType('paint');

    const metrics: Record<string, number> = {};

    paintEntries.forEach((entry) => {
      if (entry.name === 'first-contentful-paint') {
        metrics.firstContentfulPaint = entry.startTime;
      }
    });

    return metrics;
  }

  getMemoryUsage(): { used: number; total: number } {
    const memory = (performance as any).memory;
    if (memory) {
      return {
        used: memory.usedJSHeapSize,
        total: memory.totalJSHeapSize,
      };
    }
    return { used: 0, total: 0 };
  }

  getNetworkMetrics(): Record<string, any> {
    const connection = (navigator as any).connection;
    if (connection) {
      return {
        effectiveType: connection.effectiveType,
        downlink: connection.downlink,
        rtt: connection.rtt,
      };
    }
    return {};
  }

  isOptimizationEnabled(type: 'touch' | 'network' | 'battery' | 'memory' | 'adaptive'): boolean {
    switch (type) {
      case 'touch':
        return this.config.touchOptimization.enabled;
      case 'network':
        return this.config.networkOptimization.enabled;
      case 'battery':
        return this.config.batteryOptimization.enabled;
      case 'memory':
        return this.config.memoryOptimization.enabled;
      case 'adaptive':
        return this.config.adaptiveLoading.enabled;
      default:
        return false;
    }
  }

  private validateConfig(newConfig: MobileOptimizationConfig): void {
    if (
      newConfig.networkOptimization.compressionLevel < 0 ||
      newConfig.networkOptimization.compressionLevel > 9
    ) {
      throw new Error('Compression level must be between 0 and 9');
    }
  }

  private cleanupTouchOptimization(): void {
    // Remove touch event listeners
    if (typeof document !== 'undefined') {
      document.removeEventListener('touchstart', this.handleTouchStart);
      document.removeEventListener('touchmove', this.handleTouchMove);
      document.removeEventListener('touchend', this.handleTouchEnd);
    }
  }

  private stopPerformanceMonitoring(): void {
    // Disconnect performance observers if they exist
    if (this.performanceObserver) {
      this.performanceObserver.disconnect();
    }
  }

  /**
   * Detect device capabilities and constraints
   */
  private detectDeviceCapabilities(): MobileDeviceInfo {
    const screen = window.screen;
    const navigator = window.navigator;

    // Detect device type based on screen size and touch capability
    const deviceType = this.getDeviceType();

    // Get network information
    const connection =
      typeof navigator !== 'undefined'
        ? (navigator as any).connection ||
          (navigator as any).mozConnection ||
          (navigator as any).webkitConnection
        : null;
    const networkType = connection?.effectiveType || 'unknown';

    // Check for low-end device indicators
    const isLowEndDevice = this.isLowEndDevice();

    // Get memory information if available
    const memoryInfo: MobileDeviceInfo['memoryInfo'] =
      typeof performance !== 'undefined' && (performance as any).memory
        ? {
            totalJSHeapSize: Number((performance as any).memory.totalJSHeapSize) || 0,
            usedJSHeapSize: Number((performance as any).memory.usedJSHeapSize) || 0,
            jsHeapSizeLimit: Number((performance as any).memory.jsHeapSizeLimit) || 0,
          }
        : undefined;

    const deviceInfo: MobileDeviceInfo = {
      deviceType,
      screenSize: {
        width: typeof screen !== 'undefined' ? screen.width : 1920,
        height: typeof screen !== 'undefined' ? screen.height : 1080,
        dpr: (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1,
      },
      isLowEndDevice,
      supportedFeatures: {
        webgl: this.supportsWebGL(),
        serviceWorker: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
        webAssembly: typeof WebAssembly !== 'undefined',
        intersectionObserver: typeof window !== 'undefined' && 'IntersectionObserver' in window,
        passiveEventListeners: this.supportsPassiveEventListeners(),
      },
    };

    if (networkType) {
      deviceInfo.networkType = networkType;
    }

    if (memoryInfo) {
      deviceInfo.memoryInfo = memoryInfo;
    }

    if (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) {
      deviceInfo.hardwareConcurrency = navigator.hardwareConcurrency;
    }

    return deviceInfo;
  }

  /**
   * Determine device type based on screen size and capabilities
   */
  private getDeviceType(): 'phone' | 'tablet' | 'desktop' {
    if (typeof window === 'undefined' || typeof screen === 'undefined') {
      return 'desktop';
    }

    const width = window.screen?.width ?? screen?.width ?? 1920;
    const height = window.screen?.height ?? screen?.height ?? 1080;
    const isTouchDevice = typeof window !== 'undefined' && 'ontouchstart' in window;

    if (!isTouchDevice) {
      return 'desktop';
    }

    const minDimension = Math.min(width, height);
    const maxDimension = Math.max(width, height);

    // Phone: smaller screen, typically portrait-oriented
    if (maxDimension < 768 || minDimension < 480) {
      return 'phone';
    }

    // Tablet: larger touch screen
    return 'tablet';
  }

  /**
   * Detect if device is low-end based on various indicators
   */
  private isLowEndDevice(): boolean {
    const indicators = [
      // Low memory
      (performance as any).memory?.jsHeapSizeLimit < 1000000000, // < 1GB
      // Slow network
      (navigator as any).connection?.effectiveType === 'slow-2g' ||
        (navigator as any).connection?.effectiveType === '2g',
      // Low-end device hints
      navigator.hardwareConcurrency <= 2,
      // Old browser (rough estimation)
      !window.fetch || !window.Promise,
    ];

    return indicators.filter(Boolean).length >= 2;
  }

  /**
   * Check WebGL support
   */
  private supportsWebGL(): boolean {
    try {
      const canvas = document.createElement('canvas');
      return !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
    } catch {
      return false;
    }
  }

  /**
   * Check passive event listeners support
   */
  private supportsPassiveEventListeners(): boolean {
    let supportsPassive = false;
    try {
      const opts = Object.defineProperty({}, 'passive', {
        get: () => {
          supportsPassive = true;
          return true;
        },
      });
      window.addEventListener('testPassive', null as any, opts);
      window.removeEventListener('testPassive', null as any, opts);
    } catch {
      // Ignore
    }
    return supportsPassive;
  }

  /**
   * Get performance budget based on device capabilities
   */
  private getPerformanceBudgetForDevice(): PerformanceBudget {
    if (this.deviceInfo.isLowEndDevice) {
      return {
        firstContentfulPaint: 2000, // 2s for low-end devices
        largestContentfulPaint: 3500,
        firstInputDelay: 100,
        cumulativeLayoutShift: 0.25,
        timeToInteractive: 5000,
        totalBlockingTime: 600,
      };
    }

    if (this.deviceInfo.deviceType === 'phone') {
      return {
        firstContentfulPaint: 1500,
        largestContentfulPaint: 2500,
        firstInputDelay: 50,
        cumulativeLayoutShift: 0.1,
        timeToInteractive: 3500,
        totalBlockingTime: 300,
      };
    }

    // Tablet and desktop budgets
    return {
      firstContentfulPaint: 1000,
      largestContentfulPaint: 2000,
      firstInputDelay: 25,
      cumulativeLayoutShift: 0.05,
      timeToInteractive: 2500,
      totalBlockingTime: 150,
    };
  }

  /**
   * Initialize touch optimization
   */
  private async initializeTouchOptimization(): Promise<void> {
    const touchHandler = new TouchHandler(this.config.touchOptimization);

    // Prevent scroll bounce on iOS
    if (this.config.touchOptimization.preventScrollBounce && document.body?.style) {
      document.body.style.overscrollBehavior = 'none';
    }

    // Add optimized touch event listeners
    const passiveSupported = this.deviceInfo.supportedFeatures.passiveEventListeners;
    const eventOptions = passiveSupported ? { passive: true } : false;

    document.addEventListener(
      'touchstart',
      touchHandler.handleTouchStart.bind(touchHandler),
      eventOptions,
    );
    document.addEventListener(
      'touchmove',
      touchHandler.handleTouchMove.bind(touchHandler),
      eventOptions,
    );
    document.addEventListener(
      'touchend',
      touchHandler.handleTouchEnd.bind(touchHandler),
      eventOptions,
    );

    console.log('Touch optimization initialized');
  }

  /**
   * Initialize network optimization
   */
  private async initializeNetworkOptimization(): Promise<void> {
    await this.networkMonitor.start();

    // Implement adaptive image quality based on network
    if (this.config.networkOptimization.adaptiveImageQuality) {
      this.implementAdaptiveImageQuality();
    }

    // Setup request coalescing
    if (this.config.networkOptimization.requestCoalescing) {
      this.setupRequestCoalescing();
    }

    console.log('Network optimization initialized');
  }

  /**
   * Initialize battery optimization
   */
  private async initializeBatteryOptimization(): Promise<void> {
    await this.batteryMonitor.start();

    this.batteryMonitor.onBatteryChange((batteryInfo) => {
      if (batteryInfo.level < 0.2 && this.config.batteryOptimization.enabled) {
        this.enablePowerSavingMode();
      } else {
        this.disablePowerSavingMode();
      }
    });

    console.log('Battery optimization initialized');
  }

  /**
   * Initialize memory optimization
   */
  private async initializeMemoryOptimization(): Promise<void> {
    await this.memoryMonitor.start();

    this.memoryMonitor.onMemoryPressure((pressure) => {
      if (pressure === 'critical') {
        this.handleCriticalMemoryPressure();
      } else if (pressure === 'moderate') {
        this.handleModerateMemoryPressure();
      }
    });

    // Setup garbage collection hints
    if (this.config.memoryOptimization.gcHinting && 'gc' in window) {
      this.setupGCHinting();
    }

    console.log('Memory optimization initialized');
  }

  /**
   * Initialize adaptive loading
   */
  private async initializeAdaptiveLoading(): Promise<void> {
    await this.adaptiveLoader.initialize();

    console.log('Adaptive loading initialized');
  }

  /**
   * Enable power saving mode
   */
  private enablePowerSavingMode(): void {
    if (this.config.batteryOptimization.reducedAnimations) {
      document.body.classList.add('reduced-motion');
    }

    if (this.config.batteryOptimization.suspendBackgroundTasks) {
      this.suspendBackgroundTasks();
    }

    if (this.config.batteryOptimization.throttleNonCriticalWork) {
      this.throttleNonCriticalWork();
    }

    console.log('Power saving mode enabled');
  }

  /**
   * Disable power saving mode
   */
  private disablePowerSavingMode(): void {
    document.body.classList.remove('reduced-motion');
    this.resumeBackgroundTasks();
    this.unthrottleNonCriticalWork();

    console.log('Power saving mode disabled');
  }

  /**
   * Handle critical memory pressure
   */
  private handleCriticalMemoryPressure(): void {
    // Force garbage collection if available
    if ('gc' in window) {
      (window as any).gc();
    }

    // Clear caches
    this.clearNonEssentialCaches();

    // Unmount non-visible components
    if (this.config.memoryOptimization.lazyComponentUnmounting) {
      this.unmountNonVisibleComponents();
    }

    console.warn('Critical memory pressure detected - emergency cleanup performed');
  }

  /**
   * Handle moderate memory pressure
   */
  private handleModerateMemoryPressure(): void {
    // Clear image pool
    if (this.config.memoryOptimization.imagePooling) {
      this.clearImagePool();
    }

    // Reduce cache sizes
    this.reduceCacheSizes();

    console.log('Moderate memory pressure - performing cleanup');
  }

  /**
   * Implement adaptive image quality based on network conditions
   */
  private implementAdaptiveImageQuality(): void {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const img = entry.target as HTMLImageElement;
          const networkType = this.networkMonitor.getCurrentNetworkType();

          const quality = this.getImageQualityForNetwork(networkType);
          this.loadAdaptiveImage(img, quality);
        }
      });
    });

    // Observe all images
    document.querySelectorAll('img[data-adaptive]').forEach((img) => {
      observer.observe(img);
    });
  }

  /**
   * Get image quality based on network type
   */
  private getImageQualityForNetwork(networkType: string): 'low' | 'medium' | 'high' {
    switch (networkType) {
      case 'slow-2g':
      case '2g':
        return 'low';
      case '3g':
        return 'medium';
      case '4g':
      case '5g':
      case 'wifi':
      default:
        return 'high';
    }
  }

  /**
   * Load adaptive image with appropriate quality
   */
  private loadAdaptiveImage(img: HTMLImageElement, quality: 'low' | 'medium' | 'high'): void {
    const baseSrc = img.dataset.src;
    if (!baseSrc) return;

    const qualityMap = {
      low: '_low',
      medium: '_medium',
      high: '_high',
    };

    const qualitySuffix = qualityMap[quality];
    const adaptiveSrc = baseSrc.replace(/(\.[^.]+)$/, `${qualitySuffix}$1`);

    img.src = adaptiveSrc;
    img.removeAttribute('data-adaptive');
  }

  /**
   * Setup request coalescing to batch network requests
   */
  private setupRequestCoalescing(): void {
    const requestQueue: Array<{
      url: string;
      options: RequestInit;
      resolve: Function;
      reject: Function;
    }> = [];
    let batchTimer: number | null = null;

    const originalFetch = window.fetch;

    window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === 'string' ? input : input.toString();

      // Only coalesce GET requests to API endpoints
      if (!init || init.method === 'GET' || !init.method) {
        if (url.includes('/api/')) {
          return new Promise((resolve, reject) => {
            requestQueue.push({ url, options: init || {}, resolve, reject });

            if (batchTimer) {
              clearTimeout(batchTimer);
            }

            batchTimer = window.setTimeout(() => {
              this.processBatchedRequests(requestQueue.splice(0), originalFetch);
              batchTimer = null;
            }, 50); // 50ms batch window
          });
        }
      }

      return originalFetch(input, init);
    };
  }

  /**
   * Process batched requests
   */
  private async processBatchedRequests(
    requests: Array<{ url: string; options: RequestInit; resolve: Function; reject: Function }>,
    originalFetch: typeof fetch,
  ): Promise<void> {
    // Group similar requests
    const grouped = new Map<string, typeof requests>();

    requests.forEach((req) => {
      const key = `${req.options.method || 'GET'}_${req.url}`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(req);
    });

    // Execute requests
    for (const [, requestGroup] of grouped) {
      if (requestGroup.length === 1) {
        // Single request
        const req = requestGroup[0];
        if (req) {
          try {
            const response = await originalFetch(req.url, req.options);
            req.resolve(response);
          } catch (error) {
            req.reject(error);
          }
        }
      } else {
        // Multiple identical requests - execute one and share result
        const firstReq = requestGroup[0];
        if (firstReq) {
          try {
            const response = await originalFetch(firstReq.url, firstReq.options);
            const clonedResponses = await Promise.all(
              requestGroup.map(async () => response.clone()),
            );

            requestGroup.forEach((req, index) => {
              if (req) {
                req.resolve(clonedResponses[index]);
              }
            });
          } catch (error) {
            requestGroup.forEach((req) => {
              if (req) {
                req.reject(error);
              }
            });
          }
        }
      }
    }
  }

  /**
   * Start performance monitoring
   */
  private startPerformanceMonitoring(): void {
    // Monitor Core Web Vitals
    this.monitorCoreWebVitals();

    // Monitor frame rate
    this.monitorFrameRate();

    // Monitor memory usage
    this.monitorMemoryUsage();
  }

  /**
   * Monitor Core Web Vitals
   */
  private monitorCoreWebVitals(): void {
    // First Contentful Paint
    if ('PerformanceObserver' in window) {
      try {
        const observer = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach((entry) => {
            if (entry.name === 'first-contentful-paint') {
              this.checkPerformanceBudget('firstContentfulPaint', entry.startTime);
            }
          });
        });
        observer.observe({ entryTypes: ['paint'] });
      } catch (error) {
        console.warn('Failed to observe paint metrics:', error);
      }
    }

    // Largest Contentful Paint
    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1];
        if (lastEntry) {
          this.checkPerformanceBudget('largestContentfulPaint', lastEntry.startTime);
        }
      });
      observer.observe({ entryTypes: ['largest-contentful-paint'] });
    } catch (error) {
      console.warn('Failed to observe LCP:', error);
    }

    // Cumulative Layout Shift
    try {
      const observer = new PerformanceObserver((list) => {
        let cumulativeScore = 0;
        list.getEntries().forEach((entry) => {
          if (!(entry as any).hadRecentInput) {
            cumulativeScore += (entry as any).value;
          }
        });
        this.checkPerformanceBudget('cumulativeLayoutShift', cumulativeScore);
      });
      observer.observe({ entryTypes: ['layout-shift'] });
    } catch (error) {
      console.warn('Failed to observe CLS:', error);
    }
  }

  /**
   * Monitor frame rate
   */
  private monitorFrameRate(): void {
    let frameCount = 0;
    let lastTime = performance.now();

    const checkFrameRate = () => {
      frameCount++;
      const currentTime = performance.now();

      if (currentTime - lastTime >= 1000) {
        const fps = frameCount;
        frameCount = 0;
        lastTime = currentTime;

        if (fps < 30) {
          console.warn(`Low frame rate detected: ${fps} FPS`);
          this.handleLowFrameRate();
        }
      }

      requestAnimationFrame(checkFrameRate);
    };

    requestAnimationFrame(checkFrameRate);
  }

  /**
   * Monitor memory usage
   */
  private monitorMemoryUsage(): void {
    if ((performance as any).memory) {
      setInterval(() => {
        const memInfo = (performance as any).memory;
        const usageRatio = memInfo.usedJSHeapSize / memInfo.jsHeapSizeLimit;

        if (usageRatio > 0.9) {
          this.handleHighMemoryUsage();
        }
      }, 5000);
    }
  }

  /**
   * Check performance budget compliance
   */
  private checkPerformanceBudget(metric: keyof PerformanceBudget, value: number): void {
    const budget = this.performanceBudget[metric];

    if (value > budget) {
      console.warn(`Performance budget exceeded for ${metric}: ${value}ms > ${budget}ms`);
      this.handlePerformanceBudgetViolation(metric, value);
    }
  }

  /**
   * Handle performance budget violations
   */
  private handlePerformanceBudgetViolation(metric: keyof PerformanceBudget, _value: number): void {
    // Implement adaptive performance strategies
    switch (metric) {
      case 'firstContentfulPaint':
      case 'largestContentfulPaint':
        this.optimizeResourceLoading();
        break;
      case 'firstInputDelay':
        this.reduceMainThreadWork();
        break;
      case 'cumulativeLayoutShift':
        this.stabilizeLayout();
        break;
    }
  }

  /**
   * Optimize resource loading
   */
  private optimizeResourceLoading(): void {
    // Defer non-critical resources
    document.querySelectorAll('link[rel="stylesheet"]:not([data-critical])').forEach((link) => {
      link.setAttribute('media', 'print');
      link.addEventListener('load', () => {
        link.setAttribute('media', 'all');
      });
    });
  }

  /**
   * Reduce main thread work
   */
  private reduceMainThreadWork(): void {
    // Use scheduler API if available
    if ('scheduler' in window && 'postTask' in (window as any).scheduler) {
      // Defer non-critical work
      this.deferNonCriticalWork();
    }
  }

  /**
   * Stabilize layout to reduce CLS
   */
  private stabilizeLayout(): void {
    // Add size hints to images without dimensions
    document.querySelectorAll('img:not([width]):not([height])').forEach((img) => {
      const htmlImg = img as HTMLImageElement;
      if (htmlImg.naturalWidth && htmlImg.naturalHeight) {
        const aspectRatio = htmlImg.naturalWidth / htmlImg.naturalHeight;
        htmlImg.style.aspectRatio = aspectRatio.toString();
      }
    });
  }

  /**
   * Handle low frame rate
   */
  private handleLowFrameRate(): void {
    // Reduce animation complexity
    document.body.classList.add('performance-mode');

    // Cancel non-essential animations
    this.cancelNonEssentialAnimations();
  }

  /**
   * Handle high memory usage
   */
  private handleHighMemoryUsage(): void {
    // Trigger immediate cleanup
    this.handleModerateMemoryPressure();
  }

  // Utility methods (stubs for implementation)
  private suspendBackgroundTasks(): void {
    // Implementation for suspending background tasks
  }

  private resumeBackgroundTasks(): void {
    // Implementation for resuming background tasks
  }

  private throttleNonCriticalWork(): void {
    // Implementation for throttling non-critical work
  }

  private unthrottleNonCriticalWork(): void {
    // Implementation for unthrottling non-critical work
  }

  private clearNonEssentialCaches(): void {
    // Implementation for clearing non-essential caches
  }

  private unmountNonVisibleComponents(): void {
    // Implementation for unmounting non-visible components
  }

  private clearImagePool(): void {
    // Implementation for clearing image pool
  }

  private reduceCacheSizes(): void {
    // Implementation for reducing cache sizes
  }

  private setupGCHinting(): void {
    // Implementation for GC hinting
  }

  private deferNonCriticalWork(): void {
    // Implementation for deferring non-critical work
  }

  private cancelNonEssentialAnimations(): void {
    // Implementation for canceling non-essential animations
  }

  /**
   * Get current performance metrics
   */
  getPerformanceMetrics(): {
    deviceInfo: MobileDeviceInfo;
    performanceBudget: PerformanceBudget;
    isOptimized: boolean;
  } {
    return {
      deviceInfo: this.deviceInfo,
      performanceBudget: this.performanceBudget,
      isOptimized: this.isInitialized,
    };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<MobileOptimizationConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Destroy the optimizer
   */
  async destroy(): Promise<void> {
    this.touchHandlers.clear();
    await this.networkMonitor.stop();
    await this.batteryMonitor.stop();
    await this.memoryMonitor.stop();
    await this.adaptiveLoader.destroy();

    this.isInitialized = false;
  }
}

/**
 * Touch Handler for optimized touch interactions
 */
class TouchHandler {
  private config: MobileOptimizationConfig['touchOptimization'];
  private lastTouchTime: number = 0;
  private touchStartTime: number = 0;

  constructor(config: MobileOptimizationConfig['touchOptimization']) {
    this.config = config;
  }

  handleTouchStart(event: TouchEvent): void {
    this.touchStartTime = Date.now();
    const touch = event.touches?.[0];
    if (touch) {
      // Store touch position for gesture detection if needed
      console.debug('Touch started at:', touch.clientX, touch.clientY);
    }
  }

  handleTouchMove(_event: TouchEvent): void {
    // Throttle touch move events
    const now = Date.now();
    if (now - this.lastTouchTime < 16) {
      // ~60fps
      return;
    }
    this.lastTouchTime = now;
  }

  handleTouchEnd(event: TouchEvent): void {
    const touchEndTime = Date.now();
    const touchDuration = touchEndTime - this.touchStartTime;

    // Fast click detection
    if (touchDuration < this.config.fastClickThreshold) {
      this.handleFastClick(event);
    }
  }

  private handleFastClick(event: TouchEvent): void {
    // Prevent 300ms delay on mobile
    event.preventDefault?.();

    const target = event.target as HTMLElement;
    if (target) {
      target.click();
    }
  }
}

/**
 * Network Monitor for tracking network conditions
 */
class NetworkMonitor {
  private networkChangeHandlers: Array<(networkType: string) => void> = [];
  private currentNetworkType: string = 'unknown';

  async start(): Promise<void> {
    const connection =
      (navigator as any).connection ||
      (navigator as any).mozConnection ||
      (navigator as any).webkitConnection;

    if (connection) {
      this.currentNetworkType = connection.effectiveType || 'unknown';

      connection.addEventListener('change', () => {
        const newNetworkType = connection.effectiveType || 'unknown';
        if (newNetworkType !== this.currentNetworkType) {
          this.currentNetworkType = newNetworkType;
          this.notifyNetworkChange(newNetworkType);
        }
      });
    }
  }

  getCurrentNetworkType(): string {
    return this.currentNetworkType;
  }

  onNetworkChange(handler: (networkType: string) => void): void {
    this.networkChangeHandlers.push(handler);
  }

  private notifyNetworkChange(networkType: string): void {
    this.networkChangeHandlers.forEach((handler) => handler(networkType));
  }

  async stop(): Promise<void> {
    this.networkChangeHandlers = [];
  }
}

/**
 * Battery Monitor for tracking battery status
 */
class BatteryMonitor {
  private batteryChangeHandlers: Array<
    (batteryInfo: { level: number; charging: boolean }) => void
  > = [];
  private battery: any = null;

  async start(): Promise<void> {
    try {
      if ('getBattery' in navigator) {
        this.battery = await (navigator as any).getBattery();

        const handleBatteryChange = () => {
          this.notifyBatteryChange({
            level: this.battery.level,
            charging: this.battery.charging,
          });
        };

        this.battery.addEventListener('levelchange', handleBatteryChange);
        this.battery.addEventListener('chargingchange', handleBatteryChange);
      }
    } catch (error) {
      console.warn('Battery API not available:', error);
    }
  }

  onBatteryChange(handler: (batteryInfo: { level: number; charging: boolean }) => void): void {
    this.batteryChangeHandlers.push(handler);
  }

  private notifyBatteryChange(batteryInfo: { level: number; charging: boolean }): void {
    this.batteryChangeHandlers.forEach((handler) => handler(batteryInfo));
  }

  async stop(): Promise<void> {
    this.batteryChangeHandlers = [];
  }
}

/**
 * Memory Monitor for tracking memory usage
 */
class MemoryMonitor {
  private memoryPressureHandlers: Array<(pressure: 'low' | 'moderate' | 'critical') => void> = [];
  private monitoringInterval: number | null = null;

  async start(): Promise<void> {
    if ((performance as any).memory) {
      this.monitoringInterval = window.setInterval(() => {
        this.checkMemoryPressure();
      }, 10000); // Check every 10 seconds
    }
  }

  onMemoryPressure(handler: (pressure: 'low' | 'moderate' | 'critical') => void): void {
    this.memoryPressureHandlers.push(handler);
  }

  private checkMemoryPressure(): void {
    if (!(performance as any).memory) return;

    const memInfo = (performance as any).memory;
    const usageRatio = memInfo.usedJSHeapSize / memInfo.jsHeapSizeLimit;

    let pressure: 'low' | 'moderate' | 'critical';
    if (usageRatio > 0.9) {
      pressure = 'critical';
    } else if (usageRatio > 0.7) {
      pressure = 'moderate';
    } else {
      pressure = 'low';
    }

    this.memoryPressureHandlers.forEach((handler) => handler(pressure));
  }

  async stop(): Promise<void> {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    this.memoryPressureHandlers = [];
  }
}

/**
 * Adaptive Loader for device-specific resource loading
 */
class AdaptiveLoader {
  private deviceInfo: MobileDeviceInfo;

  constructor(deviceInfo: MobileDeviceInfo) {
    this.deviceInfo = deviceInfo;
  }

  async initialize(): Promise<void> {
    // Setup adaptive loading strategies based on device capabilities
    this.setupResourceHints();
    this.setupLazyLoading();
  }

  private setupResourceHints(): void {
    if (this.deviceInfo.isLowEndDevice) {
      // Reduce preloading for low-end devices
      document.querySelectorAll('link[rel="preload"]').forEach((link) => {
        link.remove();
      });
    } else {
      // Add aggressive prefetching for high-end devices
      this.addResourceHints();
    }
  }

  private setupLazyLoading(): void {
    if (this.deviceInfo.supportedFeatures.intersectionObserver) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const element = entry.target as HTMLElement;
            this.loadResource(element);
            observer.unobserve(element);
          }
        });
      });

      document.querySelectorAll('[data-lazy]').forEach((element) => {
        observer.observe(element);
      });
    }
  }

  private addResourceHints(): void {
    // Add DNS prefetch for external domains
    const externalDomains = ['cdn.example.com', 'api.example.com'];
    externalDomains.forEach((domain) => {
      const link = document.createElement('link');
      link.rel = 'dns-prefetch';
      link.href = `//${domain}`;
      document.head.appendChild(link);
    });
  }

  private loadResource(element: HTMLElement): void {
    const src = element.dataset.src;
    if (src) {
      if (element.tagName === 'IMG') {
        (element as HTMLImageElement).src = src;
      } else if (element.tagName === 'VIDEO') {
        (element as HTMLVideoElement).src = src;
      }
      element.removeAttribute('data-lazy');
    }
  }

  async destroy(): Promise<void> {
    // Cleanup adaptive loader
  }
}

/**
 * Default mobile optimization configuration
 */
export const defaultMobileOptimizationConfig: MobileOptimizationConfig = {
  touchOptimization: {
    enabled: true,
    debounceTime: 16, // ~60fps
    fastClickThreshold: 300, // ms
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
