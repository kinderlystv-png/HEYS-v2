/**
 * HEYS Mobile Performance Optimizer
 * Specialized optimizations for mobile devices and network conditions
 *
 * @author HEYS Team
 * @version 1.4.0
 * @created 2025-01-31
 */

import { perfLogger } from './logger';

const baseLogger = perfLogger;

type NavigatorConnection = {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
};

type BatteryManagerLike = { level: number };

type NavigatorWithConnection = Navigator & {
  connection?: NavigatorConnection;
  deviceMemory?: number;
  getBattery?: () => Promise<BatteryManagerLike>;
};

type LayoutShiftEntry = PerformanceEntry & { value: number };
type FirstInputEntry = PerformanceEntry & { processingStart: number };

const logger = baseLogger.child({ component: 'MobilePerformanceOptimizer' });

/**
 * Device capabilities and constraints
 */
export interface DeviceCapabilities {
  memory: number; // Device memory in GB
  cpu: number; // Relative CPU performance (1-10)
  network: 'slow-2g' | '2g' | '3g' | '4g' | '5g' | 'wifi';
  batteryLevel: number; // 0-1
  powerSaveMode: boolean;
  screenSize: 'small' | 'medium' | 'large';
  pixelRatio: number;
  isLowEndDevice: boolean;
}

/**
 * Performance settings based on device capabilities
 */
export interface PerformanceSettings {
  maxImageQuality: number; // 0-1
  enableAnimations: boolean;
  maxConcurrentRequests: number;
  cacheStrategy: 'aggressive' | 'normal' | 'minimal';
  bundleSize: 'full' | 'lite' | 'minimal';
  preloadStrategy: 'eager' | 'lazy' | 'none';
  renderStrategy: 'immediate' | 'throttled' | 'batched';
}

/**
 * Network condition information
 */
export interface NetworkCondition {
  type: 'slow-2g' | '2g' | '3g' | '4g' | '5g' | 'wifi' | 'unknown';
  effectiveType: string;
  downlink: number; // Mbps
  rtt: number; // Round trip time in ms
  saveData: boolean;
}

/**
 * Mobile performance optimizer
 */
export class MobilePerformanceOptimizer {
  private deviceCapabilities: DeviceCapabilities;
  private networkCondition: NetworkCondition;
  private performanceSettings: PerformanceSettings;
  private observers: Map<string, PerformanceObserver> = new Map();

  constructor() {
    this.deviceCapabilities = this.detectDeviceCapabilities();
    this.networkCondition = this.detectNetworkCondition();
    this.performanceSettings = this.calculateOptimalSettings();
    this.setupPerformanceMonitoring();
  }

  /**
   * Detect device capabilities
   */
  private detectDeviceCapabilities(): DeviceCapabilities {
    const capabilities: DeviceCapabilities = {
      memory: this.getDeviceMemory(),
      cpu: this.estimateCPUPerformance(),
      network: this.getNetworkType(),
      batteryLevel: this.getBatteryLevel(),
      powerSaveMode: this.isPowerSaveMode(),
      screenSize: this.getScreenSize(),
      pixelRatio: this.getPixelRatio(),
      isLowEndDevice: false,
    };

    // Determine if this is a low-end device
    capabilities.isLowEndDevice =
      capabilities.memory <= 2 ||
      capabilities.cpu <= 3 ||
      capabilities.network === 'slow-2g' ||
      capabilities.network === '2g';

    return capabilities;
  }

  /**
   * Get device memory
   */
  private getDeviceMemory(): number {
    if ('deviceMemory' in navigator) {
      return (navigator as NavigatorWithConnection).deviceMemory ?? 0;
    }

    // Fallback estimation based on user agent and hardware concurrency
    const cores = navigator.hardwareConcurrency || 4;
    if (cores <= 2) return 1;
    if (cores <= 4) return 2;
    if (cores <= 8) return 4;
    return 8;
  }

  /**
   * Estimate CPU performance
   */
  private estimateCPUPerformance(): number {
    const cores = navigator.hardwareConcurrency || 4;
    const platform = navigator.platform.toLowerCase();

    // Basic heuristics for CPU performance estimation
    if (platform.includes('arm') || platform.includes('mobile')) {
      return Math.min(cores * 1.2, 6); // Mobile processors
    }

    return Math.min(cores * 1.5, 10); // Desktop processors
  }

  /**
   * Get network type
   */
  private getNetworkType(): DeviceCapabilities['network'] {
    if ('connection' in navigator) {
      const connection = (navigator as NavigatorWithConnection).connection;
      if (connection && connection.effectiveType) {
        return connection.effectiveType as DeviceCapabilities['network'];
      }
    }

    // Fallback: assume 4g for modern browsers
    return '4g';
  }

  /**
   * Get battery level
   */
  private getBatteryLevel(): number {
    // Battery API is deprecated, but we can use it if available
    if ('getBattery' in navigator) {
      const nav = navigator as NavigatorWithConnection;
      if (nav.getBattery) {
        void nav.getBattery().then((battery) => battery.level);
      }
    }

    // Default to 50% battery
    return 0.5;
  }

  /**
   * Check if power save mode is enabled
   */
  private isPowerSaveMode(): boolean {
    // This would need to be detected through various heuristics
    // For now, assume power save mode if battery is low
    return this.getBatteryLevel() < 0.2;
  }

  /**
   * Get screen size category
   */
  private getScreenSize(): DeviceCapabilities['screenSize'] {
    const width = window.screen.width;
    if (width < 768) return 'small';
    if (width < 1024) return 'medium';
    return 'large';
  }

  /**
   * Get pixel ratio
   */
  private getPixelRatio(): number {
    return window.devicePixelRatio || 1;
  }

  /**
   * Detect network condition
   */
  private detectNetworkCondition(): NetworkCondition {
    const condition: NetworkCondition = {
      type: 'unknown',
      effectiveType: 'unknown',
      downlink: 10,
      rtt: 100,
      saveData: false,
    };

    if ('connection' in navigator) {
      const connection = (navigator as NavigatorWithConnection).connection;
      if (connection) {
        condition.type = (connection.effectiveType || 'unknown') as NetworkCondition['type'];
        condition.effectiveType = connection.effectiveType || 'unknown';
        condition.downlink = connection.downlink || 10;
        condition.rtt = connection.rtt || 100;
        condition.saveData = connection.saveData || false;
      }
    }

    return condition;
  }

  /**
   * Calculate optimal performance settings
   */
  private calculateOptimalSettings(): PerformanceSettings {
    const { isLowEndDevice, memory, cpu, network, powerSaveMode } = this.deviceCapabilities;
    const { saveData, downlink } = this.networkCondition;

    const settings: PerformanceSettings = {
      maxImageQuality: 1.0,
      enableAnimations: true,
      maxConcurrentRequests: 6,
      cacheStrategy: 'normal',
      bundleSize: 'full',
      preloadStrategy: 'eager',
      renderStrategy: 'immediate',
    };

    // Adjust for low-end devices
    if (isLowEndDevice || powerSaveMode) {
      settings.maxImageQuality = 0.7;
      settings.enableAnimations = false;
      settings.maxConcurrentRequests = 2;
      settings.cacheStrategy = 'minimal';
      settings.bundleSize = 'lite';
      settings.preloadStrategy = 'none';
      settings.renderStrategy = 'batched';
    }

    // Adjust for memory constraints
    if (memory <= 2) {
      settings.cacheStrategy = 'minimal';
      settings.maxConcurrentRequests = Math.min(settings.maxConcurrentRequests, 3);
    }

    // Adjust for slow networks
    if (network === 'slow-2g' || network === '2g' || saveData || downlink < 1) {
      settings.maxImageQuality = Math.min(settings.maxImageQuality, 0.5);
      settings.bundleSize = 'minimal';
      settings.preloadStrategy = 'none';
      settings.maxConcurrentRequests = 1;
    }

    // Adjust for CPU constraints
    if (cpu <= 3) {
      settings.enableAnimations = false;
      settings.renderStrategy = 'throttled';
    }

    return settings;
  }

  /**
   * Setup performance monitoring
   */
  private setupPerformanceMonitoring(): void {
    if (!('PerformanceObserver' in window)) return;

    // Monitor Long Tasks
    try {
      const longTaskObserver = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          if (entry.duration > 50) {
            this.handleLongTask(entry);
          }
        });
      });
      longTaskObserver.observe({ entryTypes: ['longtask'] });
      this.observers.set('longtask', longTaskObserver);
    } catch (e) {
      logger.warn({ error: e }, 'Long task monitoring not supported');
    }

    // Monitor Layout Shifts
    try {
      const clsObserver = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          this.handleLayoutShift(entry as LayoutShiftEntry);
        });
      });
      clsObserver.observe({ entryTypes: ['layout-shift'] });
      this.observers.set('layout-shift', clsObserver);
    } catch (e) {
      logger.warn({ error: e }, 'Layout shift monitoring not supported');
    }

    // Monitor First Input Delay
    try {
      const fidObserver = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          this.handleFirstInputDelay(entry as FirstInputEntry);
        });
      });
      fidObserver.observe({ entryTypes: ['first-input'] });
      this.observers.set('first-input', fidObserver);
    } catch (e) {
      logger.warn({ error: e }, 'First input delay monitoring not supported');
    }
  }

  /**
   * Handle long task detection
   */
  private handleLongTask(entry: PerformanceEntry): void {
    logger.warn(`Long task detected: ${entry.duration}ms`);

    // If we detect frequent long tasks, adjust settings
    if (entry.duration > 100) {
      this.performanceSettings.renderStrategy = 'batched';
      this.performanceSettings.enableAnimations = false;
    }
  }

  /**
   * Handle layout shift detection
   */
  private handleLayoutShift(entry: LayoutShiftEntry): void {
    if (entry.value > 0.1) {
      logger.warn(`Significant layout shift detected: ${entry.value}`);
    }
  }

  /**
   * Handle first input delay
   */
  private handleFirstInputDelay(entry: FirstInputEntry): void {
    if (entry.processingStart - entry.startTime > 100) {
      logger.warn(
        `High input delay detected: ${entry.processingStart - entry.startTime}ms`,
      );
      this.performanceSettings.renderStrategy = 'throttled';
    }
  }

  /**
   * Get optimized image URL
   */
  getOptimizedImageUrl(originalUrl: string, width?: number, height?: number): string {
    const { isLowEndDevice } = this.deviceCapabilities;
    const { maxImageQuality } = this.performanceSettings;
    const { saveData } = this.networkCondition;

    const quality = Math.floor(maxImageQuality * 100);
    const format = this.getSupportedImageFormat();

    // Apply device pixel ratio if not low-end device
    const pixelRatio = isLowEndDevice ? 1 : Math.min(this.deviceCapabilities.pixelRatio, 2);

    const optimizedWidth = width ? Math.floor(width * pixelRatio) : undefined;
    const optimizedHeight = height ? Math.floor(height * pixelRatio) : undefined;

    // Construct optimized URL (this would integrate with your image service)
    const params = new URLSearchParams();
    if (optimizedWidth) params.set('w', optimizedWidth.toString());
    if (optimizedHeight) params.set('h', optimizedHeight.toString());
    params.set('q', quality.toString());
    params.set('f', format);
    if (saveData) params.set('progressive', 'true');

    return `${originalUrl}?${params.toString()}`;
  }

  /**
   * Get supported image format
   */
  private getSupportedImageFormat(): string {
    // Check for WebP support
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;

    try {
      if (canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0) {
        return 'webp';
      }
    } catch (e) {
      // WebP not supported
    }

    return 'jpeg';
  }

  /**
   * Optimize bundle loading
   */
  async optimizeBundleLoading(): Promise<void> {
    const { bundleSize } = this.performanceSettings;

    if (bundleSize === 'minimal') {
      // Load only critical features
      await this.loadCriticalFeatures();
    } else if (bundleSize === 'lite') {
      // Load core features + some extras
      await this.loadCoreFeatures();
      this.scheduleNonCriticalFeatures();
    } else {
      // Load full bundle
      await this.loadFullFeatures();
    }
  }

  /**
   * Load critical features only
   */
  private async loadCriticalFeatures(): Promise<void> {
    // Load only essential functionality
    logger.info('Loading critical features for minimal bundle');
  }

  /**
   * Load core features
   */
  private async loadCoreFeatures(): Promise<void> {
    // Load core functionality
    logger.info('Loading core features for lite bundle');
  }

  /**
   * Load full features
   */
  private async loadFullFeatures(): Promise<void> {
    // Load all functionality
    logger.info('Loading full feature set');
  }

  /**
   * Schedule non-critical features for later loading
   */
  private scheduleNonCriticalFeatures(): void {
    // Load additional features when idle
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => {
        this.loadNonCriticalFeatures();
      });
    } else {
      setTimeout(() => {
        this.loadNonCriticalFeatures();
      }, 1000);
    }
  }

  /**
   * Load non-critical features
   */
  private loadNonCriticalFeatures(): void {
    logger.info('Loading non-critical features');
  }

  /**
   * Apply performance optimizations
   */
  applyOptimizations(): void {
    this.optimizeRendering();
    this.optimizeNetworking();
    this.optimizeMemory();
    this.optimizeAnimations();
  }

  /**
   * Optimize rendering performance
   */
  private optimizeRendering(): void {
    const { renderStrategy } = this.performanceSettings;

    if (renderStrategy === 'batched') {
      this.enableBatchedRendering();
    } else if (renderStrategy === 'throttled') {
      this.enableThrottledRendering();
    }
  }

  /**
   * Enable batched rendering
   */
  private enableBatchedRendering(): void {
    // Implement render batching
    logger.info('Enabling batched rendering');
  }

  /**
   * Enable throttled rendering
   */
  private enableThrottledRendering(): void {
    // Implement render throttling
    logger.info('Enabling throttled rendering');
  }

  /**
   * Optimize networking
   */
  private optimizeNetworking(): void {
    const { maxConcurrentRequests } = this.performanceSettings;

    // Limit concurrent requests
    this.setMaxConcurrentRequests(maxConcurrentRequests);

    // Enable compression if supported
    this.enableCompression();
  }

  /**
   * Set maximum concurrent requests
   */
  private setMaxConcurrentRequests(max: number): void {
    // This would integrate with your HTTP client
    logger.info(`Setting max concurrent requests to ${max}`);
  }

  /**
   * Enable compression
   */
  private enableCompression(): void {
    // Enable gzip/brotli compression
    logger.info('Enabling compression');
  }

  /**
   * Optimize memory usage
   */
  private optimizeMemory(): void {
    const { cacheStrategy } = this.performanceSettings;

    if (cacheStrategy === 'minimal') {
      this.enableMinimalCaching();
    } else if (cacheStrategy === 'aggressive') {
      this.enableAggressiveCaching();
    }
  }

  /**
   * Enable minimal caching
   */
  private enableMinimalCaching(): void {
    logger.info('Enabling minimal caching strategy');
  }

  /**
   * Enable aggressive caching
   */
  private enableAggressiveCaching(): void {
    logger.info('Enabling aggressive caching strategy');
  }

  /**
   * Optimize animations
   */
  private optimizeAnimations(): void {
    const { enableAnimations } = this.performanceSettings;

    if (!enableAnimations) {
      this.disableAnimations();
    } else {
      this.optimizeAnimationPerformance();
    }
  }

  /**
   * Disable animations
   */
  private disableAnimations(): void {
    // Add CSS to disable animations
    const style = document.createElement('style');
    style.textContent = `
      *, *::before, *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Optimize animation performance
   */
  private optimizeAnimationPerformance(): void {
    // Prefer transform and opacity changes
    // Use will-change property sparingly
    logger.info('Optimizing animation performance');
  }

  /**
   * Get current performance settings
   */
  getPerformanceSettings(): PerformanceSettings {
    return { ...this.performanceSettings };
  }

  /**
   * Get device capabilities
   */
  getDeviceCapabilities(): DeviceCapabilities {
    return { ...this.deviceCapabilities };
  }

  /**
   * Get network condition
   */
  getNetworkCondition(): NetworkCondition {
    return { ...this.networkCondition };
  }

  /**
   * Update settings based on changing conditions
   */
  updateSettings(): void {
    this.networkCondition = this.detectNetworkCondition();
    this.performanceSettings = this.calculateOptimalSettings();
    this.applyOptimizations();
  }

  /**
   * Clean up observers
   */
  destroy(): void {
    this.observers.forEach((observer) => observer.disconnect());
    this.observers.clear();
  }
}

/**
 * Mobile-specific utilities
 */
export class MobileUtils {
  /**
   * Check if device is mobile
   */
  static isMobile(): boolean {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent,
    );
  }

  /**
   * Check if device is tablet
   */
  static isTablet(): boolean {
    return /iPad|Android/i.test(navigator.userAgent) && window.innerWidth >= 768;
  }

  /**
   * Check if device supports touch
   */
  static isTouchDevice(): boolean {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }

  /**
   * Get viewport size
   */
  static getViewportSize(): { width: number; height: number } {
    return {
      width: Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0),
      height: Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0),
    };
  }

  /**
   * Optimize for mobile viewport
   */
  static optimizeViewport(): void {
    // Ensure viewport meta tag is present
    let viewportMeta = document.querySelector('meta[name="viewport"]') as HTMLMetaElement;

    if (!viewportMeta) {
      viewportMeta = document.createElement('meta');
      viewportMeta.name = 'viewport';
      document.head.appendChild(viewportMeta);
    }

    viewportMeta.content = 'width=device-width, initial-scale=1.0, user-scalable=no';
  }

  /**
   * Optimize touch interactions
   */
  static optimizeTouchInteractions(): void {
    // Add touch-action CSS for better touch handling
    const style = document.createElement('style');
    style.textContent = `
      .touch-optimized {
        touch-action: manipulation;
        user-select: none;
      }
      
      .scrollable {
        -webkit-overflow-scrolling: touch;
        overflow-scrolling: touch;
      }
    `;
    document.head.appendChild(style);
  }
}

/**
 * Default mobile performance optimizer instance
 */
export const defaultMobileOptimizer = new MobilePerformanceOptimizer();
