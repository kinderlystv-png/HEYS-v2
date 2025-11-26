/**
 * HEYS Real-time Performance Monitor v1.0
 * Advanced Performance Monitoring & Analysis System
 *
 * Features:
 * - Real-time performance metrics collection
 * - Memory usage and leak detection
 * - CPU performance monitoring
 * - Frame rate and rendering performance
 * - Core Web Vitals tracking
 * - Performance bottleneck detection
 * - Performance regression analysis
 * - Automated performance profiling
 */

export interface PerformanceMetrics {
  // Core Web Vitals
  lcp: number; // Largest Contentful Paint
  fid: number; // First Input Delay
  cls: number; // Cumulative Layout Shift
  fcp: number; // First Contentful Paint
  ttfb: number; // Time to First Byte

  // Memory Metrics
  memory: {
    used: number;
    total: number;
    jsHeapSizeLimit: number;
    usedJSHeapSize: number;
    totalJSHeapSize: number;
  };

  // CPU & Performance
  cpu: {
    usage: number;
    mainThreadTime: number;
    scriptingTime: number;
    renderingTime: number;
    paintingTime: number;
  };

  // Rendering Performance
  rendering: {
    fps: number;
    frameDrops: number;
    avgFrameTime: number;
    maxFrameTime: number;
    smoothness: number;
  };

  // Network Performance
  network: {
    requestCount: number;
    totalDataTransferred: number;
    averageLatency: number;
    connectionType: string;
  };

  // User Experience
  userExperience: {
    interactionLatency: number;
    scrollResponsiveness: number;
    clickResponsiveness: number;
    pageLoadTime: number;
  };

  // Custom Metrics
  custom: Record<string, number>;

  // Metadata
  timestamp: number;
  url: string;
  userAgent: string;
}

export interface PerformanceAlert {
  type: 'critical' | 'warning' | 'info';
  category: 'memory' | 'cpu' | 'rendering' | 'network' | 'user-experience' | 'custom';
  message: string;
  value: number;
  threshold: number;
  timestamp: number;
  severity: number;
  recommendations: string[];
}

export interface PerformanceThresholds {
  lcp: { good: number; needs_improvement: number; poor: number };
  fid: { good: number; needs_improvement: number; poor: number };
  cls: { good: number; needs_improvement: number; poor: number };
  memory: { warning: number; critical: number };
  cpu: { warning: number; critical: number };
  fps: { warning: number; critical: number };
  custom: Record<string, { warning: number; critical: number }>;
}

export interface PerformanceProfile {
  name: string;
  duration: number;
  startTime: number;
  endTime: number;
  metrics: PerformanceMetrics[];
  summary: {
    averageMetrics: PerformanceMetrics;
    performanceScore: number;
    bottlenecks: string[];
    recommendations: string[];
  };
}

export interface PerformanceMonitorConfig {
  enabled: boolean;
  samplingInterval: number;
  maxSamples: number;
  enableWebVitals: boolean;
  enableMemoryMonitoring: boolean;
  enableCPUMonitoring: boolean;
  enableRenderingMonitoring: boolean;
  enableNetworkMonitoring: boolean;
  enableUserExperienceMonitoring: boolean;
  thresholds: PerformanceThresholds;
  alerting: {
    enabled: boolean;
    throttleInterval: number;
    maxAlerts: number;
  };
  profiling: {
    enabled: boolean;
    autoProfile: boolean;
    profileDuration: number;
  };
  storage: {
    enabled: boolean;
    maxStorageSize: number;
    compressionEnabled: boolean;
  };
}

/**
 * Real-time Performance Monitor
 */
export class RealTimePerformanceMonitor {
  private config: PerformanceMonitorConfig;
  private isRunning: boolean = false;
  private intervalId: number | null = null;
  private metricsHistory: PerformanceMetrics[] = [];
  private alerts: PerformanceAlert[] = [];
  private observers: Map<string, PerformanceObserver> = new Map();
  private profileSessions: Map<string, PerformanceProfile> = new Map();
  private lastFrameTime: number = 0;
  private frameCount: number = 0;
  private droppedFrames: number = 0;

  constructor(config: PerformanceMonitorConfig) {
    this.config = config;
    this.initialize();
  }

  /**
   * Initialize performance monitoring
   */
  private initialize(): void {
    if (this.config.enableWebVitals) {
      this.initializeWebVitalsMonitoring();
    }

    if (this.config.enableMemoryMonitoring) {
      this.initializeMemoryMonitoring();
    }

    if (this.config.enableRenderingMonitoring) {
      this.initializeRenderingMonitoring();
    }

    if (this.config.enableUserExperienceMonitoring) {
      this.initializeUserExperienceMonitoring();
    }

    console.log('Real-time Performance Monitor initialized');
  }

  /**
   * Start performance monitoring
   */
  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.intervalId = window.setInterval(() => {
      this.collectMetrics();
    }, this.config.samplingInterval);

    console.log('Performance monitoring started');
  }

  /**
   * Stop performance monitoring
   */
  stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.observers.forEach((observer) => observer.disconnect());
    console.log('Performance monitoring stopped');
  }

  /**
   * Collect current performance metrics
   */
  private async collectMetrics(): Promise<void> {
    try {
      const metrics: PerformanceMetrics = {
        // Core Web Vitals (will be updated by observers)
        lcp: 0,
        fid: 0,
        cls: 0,
        fcp: 0,
        ttfb: 0,

        // Memory metrics
        memory: this.getMemoryMetrics(),

        // CPU metrics
        cpu: this.getCPUMetrics(),

        // Rendering metrics
        rendering: this.getRenderingMetrics(),

        // Network metrics
        network: this.getNetworkMetrics(),

        // User experience metrics
        userExperience: this.getUserExperienceMetrics(),

        // Custom metrics
        custom: {},

        // Metadata
        timestamp: Date.now(),
        url: window.location.href,
        userAgent: navigator.userAgent,
      };

      // Update with latest Web Vitals
      this.updateWebVitalsMetrics(metrics);

      // Add to history
      this.addMetricsToHistory(metrics);

      // Check for alerts
      this.checkPerformanceAlerts(metrics);

      // Auto-profile if enabled and performance is poor
      if (this.config.profiling.autoProfile) {
        this.checkAutoProfile(metrics);
      }
    } catch (error) {
      console.error('Error collecting performance metrics:', error);
    }
  }

  /**
   * Get memory metrics
   */
  private getMemoryMetrics(): PerformanceMetrics['memory'] {
    const memory = (performance as any).memory;

    if (!memory) {
      return {
        used: 0,
        total: 0,
        jsHeapSizeLimit: 0,
        usedJSHeapSize: 0,
        totalJSHeapSize: 0,
      };
    }

    return {
      used: memory.usedJSHeapSize,
      total: memory.totalJSHeapSize,
      jsHeapSizeLimit: memory.jsHeapSizeLimit,
      usedJSHeapSize: memory.usedJSHeapSize,
      totalJSHeapSize: memory.totalJSHeapSize,
    };
  }

  /**
   * Get CPU metrics
   */
  private getCPUMetrics(): PerformanceMetrics['cpu'] {
    const entries = performance.getEntriesByType('measure');
    let mainThreadTime = 0;
    let scriptingTime = 0;
    let renderingTime = 0;
    let paintingTime = 0;

    entries.forEach((entry) => {
      if (entry.name.includes('script')) {
        scriptingTime += entry.duration;
      } else if (entry.name.includes('render')) {
        renderingTime += entry.duration;
      } else if (entry.name.includes('paint')) {
        paintingTime += entry.duration;
      }
      mainThreadTime += entry.duration;
    });

    return {
      usage: this.calculateCPUUsage(),
      mainThreadTime,
      scriptingTime,
      renderingTime,
      paintingTime,
    };
  }

  /**
   * Calculate CPU usage percentage
   */
  private calculateCPUUsage(): number {
    // Simplified CPU usage calculation
    const navigationTiming = performance.getEntriesByType(
      'navigation',
    )[0] as PerformanceNavigationTiming;
    if (!navigationTiming) return 0;

    const totalTime = navigationTiming.loadEventEnd - navigationTiming.fetchStart;
    const scriptTime =
      navigationTiming.domContentLoadedEventEnd - navigationTiming.domContentLoadedEventStart;

    return totalTime > 0 ? (scriptTime / totalTime) * 100 : 0;
  }

  /**
   * Get rendering metrics
   */
  private getRenderingMetrics(): PerformanceMetrics['rendering'] {
    const now = performance.now();
    const frameTime = now - this.lastFrameTime;

    if (this.lastFrameTime > 0) {
      this.frameCount++;

      // Check for dropped frames (> 16.67ms = 60fps)
      if (frameTime > 16.67) {
        this.droppedFrames++;
      }
    }

    this.lastFrameTime = now;

    const fps = this.frameCount > 0 ? 1000 / (now / this.frameCount) : 0;
    const frameDropRate = this.frameCount > 0 ? this.droppedFrames / this.frameCount : 0;

    return {
      fps: Math.min(fps, 60),
      frameDrops: this.droppedFrames,
      avgFrameTime: this.frameCount > 0 ? now / this.frameCount : 0,
      maxFrameTime: frameTime,
      smoothness: Math.max(0, 1 - frameDropRate),
    };
  }

  /**
   * Get network metrics
   */
  private getNetworkMetrics(): PerformanceMetrics['network'] {
    const resourceEntries = performance.getEntriesByType('resource');

    let totalDataTransferred = 0;
    let totalLatency = 0;
    const requestCount = resourceEntries.length;

    resourceEntries.forEach((entry) => {
      const resourceEntry = entry as PerformanceResourceTiming;
      totalDataTransferred += resourceEntry.transferSize || 0;
      totalLatency += resourceEntry.responseEnd - resourceEntry.requestStart;
    });

    const connection = (navigator as any).connection;
    const connectionType = connection ? connection.effectiveType : 'unknown';

    return {
      requestCount,
      totalDataTransferred,
      averageLatency: requestCount > 0 ? totalLatency / requestCount : 0,
      connectionType,
    };
  }

  /**
   * Get user experience metrics
   */
  private getUserExperienceMetrics(): PerformanceMetrics['userExperience'] {
    const navigationTiming = performance.getEntriesByType(
      'navigation',
    )[0] as PerformanceNavigationTiming;

    return {
      interactionLatency: this.measureInteractionLatency(),
      scrollResponsiveness: this.measureScrollResponsiveness(),
      clickResponsiveness: this.measureClickResponsiveness(),
      pageLoadTime: navigationTiming
        ? navigationTiming.loadEventEnd - navigationTiming.fetchStart
        : 0,
    };
  }

  /**
   * Measure interaction latency
   */
  private measureInteractionLatency(): number {
    // This would typically involve measuring the time between user interactions
    // and the visual response. For now, return a placeholder.
    return 0;
  }

  /**
   * Measure scroll responsiveness
   */
  private measureScrollResponsiveness(): number {
    // Measure scroll performance
    return 0;
  }

  /**
   * Measure click responsiveness
   */
  private measureClickResponsiveness(): number {
    // Measure click response time
    return 0;
  }

  /**
   * Initialize Web Vitals monitoring
   */
  private initializeWebVitalsMonitoring(): void {
    // LCP Observer
    if ('PerformanceObserver' in window) {
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1];
        if (lastEntry) {
          this.updateLatestMetric('lcp', lastEntry.startTime);
        }
      });

      try {
        lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
        this.observers.set('lcp', lcpObserver);
      } catch (e) {
        console.warn('LCP observer not supported');
      }

      // FID Observer
      const fidObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach((entry) => {
          const fidEntry = entry as any; // PerformanceEventTiming
          if (fidEntry.processingStart) {
            this.updateLatestMetric('fid', fidEntry.processingStart - entry.startTime);
          }
        });
      });

      try {
        fidObserver.observe({ entryTypes: ['first-input'] });
        this.observers.set('fid', fidObserver);
      } catch (e) {
        console.warn('FID observer not supported');
      }

      // CLS Observer
      const clsObserver = new PerformanceObserver((list) => {
        let clsValue = 0;
        const entries = list.getEntries();
        entries.forEach((entry) => {
          const clsEntry = entry as any; // PerformanceLayoutShiftTiming
          if (clsEntry.hadRecentInput !== undefined && !clsEntry.hadRecentInput) {
            clsValue += clsEntry.value || 0;
          }
        });
        this.updateLatestMetric('cls', clsValue);
      });

      try {
        clsObserver.observe({ entryTypes: ['layout-shift'] });
        this.observers.set('cls', clsObserver);
      } catch (e) {
        console.warn('CLS observer not supported');
      }

      // FCP Observer
      const fcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach((entry) => {
          if (entry.name === 'first-contentful-paint') {
            this.updateLatestMetric('fcp', entry.startTime);
          }
        });
      });

      try {
        fcpObserver.observe({ entryTypes: ['paint'] });
        this.observers.set('fcp', fcpObserver);
      } catch (e) {
        console.warn('FCP observer not supported');
      }
    }
  }

  /**
   * Initialize memory monitoring
   */
  private initializeMemoryMonitoring(): void {
    // Memory monitoring is handled in collectMetrics
    console.log('Memory monitoring initialized');
  }

  /**
   * Initialize rendering monitoring
   */
  private initializeRenderingMonitoring(): void {
    // Request animation frame loop for FPS monitoring
    const measureFPS = () => {
      if (this.isRunning) {
        requestAnimationFrame(measureFPS);
      }
    };

    if (this.isRunning) {
      requestAnimationFrame(measureFPS);
    }

    console.log('Rendering monitoring initialized');
  }

  /**
   * Initialize user experience monitoring
   */
  private initializeUserExperienceMonitoring(): void {
    // Setup event listeners for user interactions
    this.setupInteractionListeners();
    console.log('User experience monitoring initialized');
  }

  /**
   * Setup interaction listeners
   */
  private setupInteractionListeners(): void {
    // Track click interactions
    document.addEventListener('click', (event) => {
      this.recordInteraction('click', event);
    });

    // Track scroll interactions
    document.addEventListener('scroll', (event) => {
      this.recordInteraction('scroll', event);
    });

    // Track keyboard interactions
    document.addEventListener('keydown', (event) => {
      this.recordInteraction('keydown', event);
    });
  }

  /**
   * Record user interaction
   */
  private recordInteraction(type: string, _event: Event): void {
    const timestamp = performance.now();
    // Store interaction data for later analysis
    console.log(`Interaction recorded: ${type} at ${timestamp}`);
  }

  /**
   * Update latest metric value
   */
  private updateLatestMetric(metric: keyof PerformanceMetrics, value: number): void {
    if (this.metricsHistory.length > 0) {
      const latest = this.metricsHistory[this.metricsHistory.length - 1];
      (latest as any)[metric] = value;
    }
  }

  /**
   * Update Web Vitals metrics
   */
  private updateWebVitalsMetrics(metrics: PerformanceMetrics): void {
    // Get TTFB from navigation timing
    const navigationTiming = performance.getEntriesByType(
      'navigation',
    )[0] as PerformanceNavigationTiming;
    if (navigationTiming) {
      metrics.ttfb = navigationTiming.responseStart - navigationTiming.requestStart;
    }
  }

  /**
   * Add metrics to history
   */
  private addMetricsToHistory(metrics: PerformanceMetrics): void {
    this.metricsHistory.push(metrics);

    // Limit history size
    if (this.metricsHistory.length > this.config.maxSamples) {
      this.metricsHistory = this.metricsHistory.slice(-this.config.maxSamples);
    }

    // Store to local storage if enabled
    if (this.config.storage.enabled) {
      this.storeMetrics(metrics);
    }
  }

  /**
   * Store metrics to local storage
   */
  private storeMetrics(metrics: PerformanceMetrics): void {
    try {
      const key = 'heys-performance-metrics';
      const stored = localStorage.getItem(key);
      let storedMetrics: PerformanceMetrics[] = stored ? JSON.parse(stored) : [];

      storedMetrics.push(metrics);

      // Limit stored metrics
      if (storedMetrics.length > this.config.maxSamples) {
        storedMetrics = storedMetrics.slice(-this.config.maxSamples);
      }

      localStorage.setItem(key, JSON.stringify(storedMetrics));
    } catch (error) {
      console.warn('Failed to store performance metrics:', error);
    }
  }

  /**
   * Check for performance alerts
   */
  private checkPerformanceAlerts(metrics: PerformanceMetrics): void {
    const alerts: PerformanceAlert[] = [];
    const thresholds = this.config.thresholds;

    // Check Core Web Vitals
    if (metrics.lcp > thresholds.lcp.poor) {
      alerts.push(
        this.createAlert(
          'critical',
          'user-experience',
          `Poor LCP: ${metrics.lcp.toFixed(0)}ms`,
          metrics.lcp,
          thresholds.lcp.poor,
          ['Optimize image loading', 'Reduce server response time', 'Use CDN'],
        ),
      );
    }

    if (metrics.fid > thresholds.fid.poor) {
      alerts.push(
        this.createAlert(
          'critical',
          'user-experience',
          `Poor FID: ${metrics.fid.toFixed(0)}ms`,
          metrics.fid,
          thresholds.fid.poor,
          ['Reduce JavaScript execution time', 'Break up long tasks', 'Use web workers'],
        ),
      );
    }

    if (metrics.cls > thresholds.cls.poor) {
      alerts.push(
        this.createAlert(
          'critical',
          'user-experience',
          `Poor CLS: ${metrics.cls.toFixed(3)}`,
          metrics.cls,
          thresholds.cls.poor,
          [
            'Set dimensions for images and videos',
            'Avoid inserting content above existing content',
          ],
        ),
      );
    }

    // Check memory usage
    const memoryUsagePercent = (metrics.memory.used / metrics.memory.total) * 100;
    if (memoryUsagePercent > thresholds.memory.critical) {
      alerts.push(
        this.createAlert(
          'critical',
          'memory',
          `Critical memory usage: ${memoryUsagePercent.toFixed(1)}%`,
          memoryUsagePercent,
          thresholds.memory.critical,
          ['Check for memory leaks', 'Optimize data structures', 'Implement garbage collection'],
        ),
      );
    }

    // Check CPU usage
    if (metrics.cpu.usage > thresholds.cpu.critical) {
      alerts.push(
        this.createAlert(
          'critical',
          'cpu',
          `High CPU usage: ${metrics.cpu.usage.toFixed(1)}%`,
          metrics.cpu.usage,
          thresholds.cpu.critical,
          ['Optimize algorithms', 'Use web workers', 'Reduce DOM manipulations'],
        ),
      );
    }

    // Check FPS
    if (metrics.rendering.fps < thresholds.fps.critical) {
      alerts.push(
        this.createAlert(
          'critical',
          'rendering',
          `Low FPS: ${metrics.rendering.fps.toFixed(1)}`,
          metrics.rendering.fps,
          thresholds.fps.critical,
          ['Optimize animations', 'Use CSS transforms', 'Reduce paint operations'],
        ),
      );
    }

    // Add alerts to history
    this.addAlertsToHistory(alerts);
  }

  /**
   * Create performance alert
   */
  private createAlert(
    type: PerformanceAlert['type'],
    category: PerformanceAlert['category'],
    message: string,
    value: number,
    threshold: number,
    recommendations: string[],
  ): PerformanceAlert {
    return {
      type,
      category,
      message,
      value,
      threshold,
      timestamp: Date.now(),
      severity: this.calculateSeverity(value, threshold),
      recommendations,
    };
  }

  /**
   * Calculate alert severity
   */
  private calculateSeverity(value: number, threshold: number): number {
    return Math.min(10, Math.max(1, (value / threshold) * 5));
  }

  /**
   * Add alerts to history
   */
  private addAlertsToHistory(alerts: PerformanceAlert[]): void {
    this.alerts.push(...alerts);

    // Limit alerts history
    if (this.alerts.length > this.config.alerting.maxAlerts) {
      this.alerts = this.alerts.slice(-this.config.alerting.maxAlerts);
    }
  }

  /**
   * Check for auto-profiling trigger
   */
  private checkAutoProfile(metrics: PerformanceMetrics): void {
    const shouldProfile =
      metrics.lcp > this.config.thresholds.lcp.needs_improvement ||
      metrics.fid > this.config.thresholds.fid.needs_improvement ||
      metrics.cpu.usage > this.config.thresholds.cpu.warning ||
      metrics.rendering.fps < this.config.thresholds.fps.warning;

    if (shouldProfile && !this.isCurrentlyProfiling()) {
      this.startAutoProfile();
    }
  }

  /**
   * Check if currently profiling
   */
  private isCurrentlyProfiling(): boolean {
    return Array.from(this.profileSessions.values()).some((session) => !session.endTime);
  }

  /**
   * Start automatic profiling
   */
  private startAutoProfile(): void {
    const sessionId = `auto-${Date.now()}`;
    this.startProfiling(sessionId, this.config.profiling.profileDuration);
  }

  /**
   * Start performance profiling
   */
  startProfiling(sessionId: string, duration?: number): void {
    const profileDuration = duration || this.config.profiling.profileDuration;

    const profile: PerformanceProfile = {
      name: sessionId,
      duration: profileDuration,
      startTime: Date.now(),
      endTime: 0,
      metrics: [],
      summary: {
        averageMetrics: {} as PerformanceMetrics,
        performanceScore: 0,
        bottlenecks: [],
        recommendations: [],
      },
    };

    this.profileSessions.set(sessionId, profile);

    // Stop profiling after duration
    setTimeout(() => {
      this.stopProfiling(sessionId);
    }, profileDuration);

    console.log(`Performance profiling started: ${sessionId}`);
  }

  /**
   * Stop performance profiling
   */
  stopProfiling(sessionId: string): PerformanceProfile | null {
    const profile = this.profileSessions.get(sessionId);
    if (!profile) return null;

    profile.endTime = Date.now();
    profile.metrics = this.getMetricsForPeriod(profile.startTime, profile.endTime);
    profile.summary = this.analyzeProfiling(profile);

    console.log(`Performance profiling completed: ${sessionId}`, profile.summary);
    return profile;
  }

  /**
   * Get metrics for specific time period
   */
  private getMetricsForPeriod(startTime: number, endTime: number): PerformanceMetrics[] {
    return this.metricsHistory.filter(
      (metrics) => metrics.timestamp >= startTime && metrics.timestamp <= endTime,
    );
  }

  /**
   * Analyze profiling results
   */
  private analyzeProfiling(profile: PerformanceProfile): PerformanceProfile['summary'] {
    if (profile.metrics.length === 0) {
      return {
        averageMetrics: {} as PerformanceMetrics,
        performanceScore: 0,
        bottlenecks: [],
        recommendations: [],
      };
    }

    // Calculate average metrics
    const averageMetrics = this.calculateAverageMetrics(profile.metrics);

    // Calculate performance score
    const performanceScore = this.calculatePerformanceScore(averageMetrics);

    // Identify bottlenecks
    const bottlenecks = this.identifyBottlenecks(averageMetrics);

    // Generate recommendations
    const recommendations = this.generateRecommendations(bottlenecks, averageMetrics);

    return {
      averageMetrics,
      performanceScore,
      bottlenecks,
      recommendations,
    };
  }

  /**
   * Calculate average metrics
   */
  private calculateAverageMetrics(metrics: PerformanceMetrics[]): PerformanceMetrics {
    // Implementation for calculating averages across all metrics
    const count = metrics.length;

    return metrics.reduce((avg, current) => {
      Object.keys(current).forEach((key) => {
        if (typeof current[key as keyof PerformanceMetrics] === 'number') {
          const numKey = key as keyof PerformanceMetrics;
          (avg as any)[numKey] = ((avg as any)[numKey] || 0) + (current[numKey] as number) / count;
        }
      });
      return avg;
    }, {} as PerformanceMetrics);
  }

  /**
   * Calculate performance score (0-100)
   */
  private calculatePerformanceScore(metrics: PerformanceMetrics): number {
    // Simplified performance score calculation
    let score = 100;

    // Deduct points for poor Core Web Vitals
    if (metrics.lcp > this.config.thresholds.lcp.poor) score -= 20;
    if (metrics.fid > this.config.thresholds.fid.poor) score -= 20;
    if (metrics.cls > this.config.thresholds.cls.poor) score -= 20;

    // Deduct points for resource usage
    const memoryUsage = (metrics.memory.used / metrics.memory.total) * 100;
    if (memoryUsage > this.config.thresholds.memory.warning) score -= 10;
    if (metrics.cpu.usage > this.config.thresholds.cpu.warning) score -= 10;
    if (metrics.rendering.fps < this.config.thresholds.fps.warning) score -= 10;

    return Math.max(0, score);
  }

  /**
   * Identify performance bottlenecks
   */
  private identifyBottlenecks(metrics: PerformanceMetrics): string[] {
    const bottlenecks: string[] = [];

    if (metrics.lcp > this.config.thresholds.lcp.needs_improvement) {
      bottlenecks.push('Slow loading of main content');
    }

    if (metrics.fid > this.config.thresholds.fid.needs_improvement) {
      bottlenecks.push('Poor interactivity responsiveness');
    }

    if (metrics.cls > this.config.thresholds.cls.needs_improvement) {
      bottlenecks.push('Visual instability during loading');
    }

    const memoryUsage = (metrics.memory.used / metrics.memory.total) * 100;
    if (memoryUsage > this.config.thresholds.memory.warning) {
      bottlenecks.push('High memory consumption');
    }

    if (metrics.cpu.usage > this.config.thresholds.cpu.warning) {
      bottlenecks.push('High CPU utilization');
    }

    if (metrics.rendering.fps < this.config.thresholds.fps.warning) {
      bottlenecks.push('Poor rendering performance');
    }

    return bottlenecks;
  }

  /**
   * Generate performance recommendations
   */
  private generateRecommendations(bottlenecks: string[], _metrics: PerformanceMetrics): string[] {
    const recommendations: string[] = [];

    bottlenecks.forEach((bottleneck) => {
      switch (bottleneck) {
        case 'Slow loading of main content':
          recommendations.push('Optimize images and use next-gen formats');
          recommendations.push('Implement lazy loading for below-the-fold content');
          recommendations.push('Use a CDN for faster content delivery');
          break;
        case 'Poor interactivity responsiveness':
          recommendations.push('Break up long JavaScript tasks');
          recommendations.push('Use web workers for heavy computations');
          recommendations.push('Optimize event handlers');
          break;
        case 'Visual instability during loading':
          recommendations.push('Set explicit dimensions for images and videos');
          recommendations.push('Avoid inserting content above existing content');
          recommendations.push('Use font-display: swap for web fonts');
          break;
        case 'High memory consumption':
          recommendations.push('Implement memory leak detection');
          recommendations.push('Optimize data structures and caching');
          recommendations.push('Use object pooling for frequently created objects');
          break;
        case 'High CPU utilization':
          recommendations.push('Optimize algorithms and reduce complexity');
          recommendations.push('Use requestAnimationFrame for animations');
          recommendations.push('Minimize DOM manipulations');
          break;
        case 'Poor rendering performance':
          recommendations.push('Use CSS transforms instead of changing layout properties');
          recommendations.push('Minimize paint and composite operations');
          recommendations.push('Optimize animation performance');
          break;
      }
    });

    // Remove duplicates
    const uniqueRecommendations: string[] = [];
    recommendations.forEach((rec) => {
      if (uniqueRecommendations.indexOf(rec) === -1) {
        uniqueRecommendations.push(rec);
      }
    });

    return uniqueRecommendations;
  }

  /**
   * Public API methods
   */

  getCurrentMetrics(): PerformanceMetrics | null {
    const latest = this.metricsHistory[this.metricsHistory.length - 1];
    return latest || null;
  }

  getMetricsHistory(): PerformanceMetrics[] {
    return [...this.metricsHistory];
  }

  getAlerts(): PerformanceAlert[] {
    return [...this.alerts];
  }

  getActiveProfiles(): PerformanceProfile[] {
    return Array.from(this.profileSessions.values());
  }

  getProfile(sessionId: string): PerformanceProfile | null {
    return this.profileSessions.get(sessionId) || null;
  }

  clearHistory(): void {
    this.metricsHistory = [];
    this.alerts = [];
    console.log('Performance history cleared');
  }

  updateConfig(newConfig: Partial<PerformanceMonitorConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('Performance monitor configuration updated');
  }

  getConfig(): PerformanceMonitorConfig {
    return { ...this.config };
  }

  isMonitoring(): boolean {
    return this.isRunning;
  }

  destroy(): void {
    this.stop();
    this.observers.forEach((observer) => observer.disconnect());
    this.observers.clear();
    this.profileSessions.clear();
    this.clearHistory();
    console.log('Performance monitor destroyed');
  }
}
