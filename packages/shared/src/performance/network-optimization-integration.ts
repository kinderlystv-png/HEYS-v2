/**
 * HEYS Network Optimization Integration Layer v1.0
 * Integration point for all network optimization features
 * 
 * Features:
 * - Unified network optimization API
 * - Integration with existing HEYS systems
 * - Configuration management
 * - Performance monitoring
 * - Error handling and recovery
 */

import { NetworkOptimizer, NetworkOptimizationConfig } from './network-optimizer';
import { NetworkPerformanceDashboard, DashboardConfig } from './network-performance-dashboard';

export interface NetworkIntegrationConfig {
  optimizer: NetworkOptimizationConfig;
  dashboard: DashboardConfig;
  integration: {
    enabled: boolean;
    autoStart: boolean;
    storageKey: string;
    syncInterval: number;
    errorRecovery: {
      enabled: boolean;
      maxRetries: number;
      fallbackMode: boolean;
    };
  };
}

export interface NetworkIntegrationEvents {
  onOptimizationStart?: () => void;
  onOptimizationStop?: () => void;
  onConfigChange?: (config: NetworkIntegrationConfig) => void;
  onError?: (error: Error) => void;
  onMetricsUpdate?: (metrics: any) => void;
}

/**
 * Default network optimization configuration
 */
export const DEFAULT_NETWORK_CONFIG: NetworkIntegrationConfig = {
  optimizer: {
    prefetching: {
      enabled: true,
      maxConcurrentRequests: 4,
      priorityThreshold: 0.5,
      intelligentPrediction: true,
      adaptiveStrategy: 'balanced',
    },
    caching: {
      enabled: true,
      maxCacheSize: 100,
      ttl: 300000, // 5 minutes
      compression: true,
      strategy: 'lru',
    },
    connectionOptimization: {
      enabled: true,
      http2Push: true,
      http3Support: false, // Experimental
      multiplexing: true,
      keepAlive: true,
      pooling: true,
    },
    errorHandling: {
      enabled: true,
      maxRetries: 3,
      backoffStrategy: 'exponential',
      timeoutThreshold: 10000,
      circuitBreaker: true,
    },
    qualityAdaptation: {
      enabled: true,
      bandwidthThresholds: {
        low: 1,
        medium: 5,
        high: 10,
      },
      qualityLevels: ['low', 'medium', 'high', 'ultra'],
      adaptiveStreaming: true,
    },
    monitoring: {
      enabled: true,
      metricsInterval: 5000,
      alertThresholds: {
        latency: 500,
        packetLoss: 0.05,
        bandwidth: 1,
      },
      realTimeReporting: true,
    },
  },
  dashboard: {
    refreshInterval: 2000,
    alertThresholds: {
      latency: 500,
      bandwidth: 1,
      packetLoss: 0.05,
      jitter: 50,
    },
    charts: {
      enabled: true,
      maxDataPoints: 50,
      updateInterval: 2000,
    },
    notifications: {
      enabled: true,
      position: 'top-right',
      duration: 5000,
    },
    controls: {
      enabled: true,
      allowConfigChanges: true,
      position: 'sidebar',
    },
  },
  integration: {
    enabled: true,
    autoStart: true,
    storageKey: 'heys-network-config',
    syncInterval: 30000,
    errorRecovery: {
      enabled: true,
      maxRetries: 3,
      fallbackMode: true,
    },
  },
};

/**
 * Network Optimization Integration Layer
 */
export class NetworkOptimizationIntegration {
  private config: NetworkIntegrationConfig;
  private optimizer: NetworkOptimizer | null = null;
  private dashboard: NetworkPerformanceDashboard | null = null;
  private events: NetworkIntegrationEvents;
  private isInitialized: boolean = false;
  private isRunning: boolean = false;
  private syncIntervalId: number | null = null;

  constructor(config?: Partial<NetworkIntegrationConfig>, events?: NetworkIntegrationEvents) {
    this.config = this.mergeConfig(config);
    this.events = events || {};
  }

  /**
   * Initialize network optimization
   */
  async initialize(): Promise<void> {
    try {
      // Load saved configuration
      await this.loadConfiguration();

      // Initialize optimizer
      this.optimizer = new NetworkOptimizer(this.config.optimizer);

      // Initialize dashboard if enabled
      if (this.config.dashboard) {
        this.dashboard = new NetworkPerformanceDashboard(this.optimizer, this.config.dashboard);
      }

      // Setup error recovery
      if (this.config.integration.errorRecovery.enabled) {
        this.setupErrorRecovery();
      }

      // Setup configuration sync
      if (this.config.integration.syncInterval > 0) {
        this.setupConfigurationSync();
      }

      this.isInitialized = true;

      // Auto-start if enabled
      if (this.config.integration.autoStart) {
        await this.start();
      }

      console.log('Network Optimization Integration initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Network Optimization Integration:', error);
      this.events.onError?.(error as Error);
      throw error;
    }
  }

  /**
   * Start network optimization
   */
  async start(): Promise<void> {
    if (!this.isInitialized || this.isRunning) {
      return;
    }

    try {
      this.isRunning = true;
      
      // Start dashboard if available
      if (this.dashboard) {
        this.dashboard.start();
      }

      this.events.onOptimizationStart?.();
      console.log('Network optimization started');
    } catch (error) {
      this.isRunning = false;
      console.error('Failed to start network optimization:', error);
      this.events.onError?.(error as Error);
      throw error;
    }
  }

  /**
   * Stop network optimization
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      this.isRunning = false;

      // Stop dashboard
      if (this.dashboard) {
        this.dashboard.stop();
      }

      // Stop configuration sync
      if (this.syncIntervalId) {
        clearInterval(this.syncIntervalId);
        this.syncIntervalId = null;
      }

      this.events.onOptimizationStop?.();
      console.log('Network optimization stopped');
    } catch (error) {
      console.error('Failed to stop network optimization:', error);
      this.events.onError?.(error as Error);
    }
  }

  /**
   * Initialize dashboard in DOM container
   */
  async initializeDashboard(containerId: string): Promise<void> {
    if (!this.dashboard) {
      throw new Error('Dashboard not initialized');
    }

    await this.dashboard.initialize(containerId);
    console.log('Network dashboard initialized in container:', containerId);
  }

  /**
   * Update configuration
   */
  async updateConfiguration(newConfig: Partial<NetworkIntegrationConfig>): Promise<void> {
    try {
      this.config = this.mergeConfig(newConfig);
      
      // Update optimizer configuration
      if (this.optimizer && newConfig.optimizer) {
        this.optimizer.updateConfig(newConfig.optimizer);
      }

      // Save configuration
      await this.saveConfiguration();

      this.events.onConfigChange?.(this.config);
      console.log('Network optimization configuration updated');
    } catch (error) {
      console.error('Failed to update configuration:', error);
      this.events.onError?.(error as Error);
      throw error;
    }
  }

  /**
   * Get current configuration
   */
  getConfiguration(): NetworkIntegrationConfig {
    return { ...this.config };
  }

  /**
   * Get optimizer instance
   */
  getOptimizer(): NetworkOptimizer | null {
    return this.optimizer;
  }

  /**
   * Get dashboard instance
   */
  getDashboard(): NetworkPerformanceDashboard | null {
    return this.dashboard;
  }

  /**
   * Get current metrics
   */
  getCurrentMetrics(): any {
    if (!this.optimizer) {
      return null;
    }

    return {
      network: this.optimizer.getNetworkMetrics(),
      connection: this.optimizer.getConnectionInfo(),
      quality: this.optimizer.getCurrentQualityProfile(),
    };
  }

  /**
   * Optimize a network request
   */
  async optimizeRequest(request: Request): Promise<Response> {
    if (!this.optimizer) {
      throw new Error('Network optimizer not initialized');
    }

    return this.optimizer.optimizeRequest(request);
  }

  /**
   * Schedule prefetch for a resource
   */
  async prefetchResource(url: string, options?: any): Promise<void> {
    if (!this.optimizer) {
      throw new Error('Network optimizer not initialized');
    }

    return this.optimizer.prefetchResource(url, options);
  }

  /**
   * Adapt to current network conditions
   */
  adaptToNetworkConditions(): void {
    if (!this.optimizer) {
      return;
    }

    this.optimizer.adaptToNetworkConditions();
    console.log('Adapted to current network conditions');
  }

  /**
   * Reset optimization state
   */
  async reset(): Promise<void> {
    try {
      // Reset dashboard
      if (this.dashboard) {
        this.dashboard.destroy();
        this.dashboard = new NetworkPerformanceDashboard(this.optimizer!, this.config.dashboard);
      }

      console.log('Network optimization state reset');
    } catch (error) {
      console.error('Failed to reset optimization state:', error);
      this.events.onError?.(error as Error);
    }
  }

  /**
   * Get optimization statistics
   */
  getStatistics(): any {
    const metrics = this.getCurrentMetrics();
    
    return {
      isInitialized: this.isInitialized,
      isRunning: this.isRunning,
      metrics: metrics,
      configuration: {
        prefetchingEnabled: this.config.optimizer.prefetching.enabled,
        cachingEnabled: this.config.optimizer.caching.enabled,
        monitoringEnabled: this.config.optimizer.monitoring.enabled,
        dashboardEnabled: !!this.dashboard,
      },
    };
  }

  /**
   * Destroy integration
   */
  async destroy(): Promise<void> {
    try {
      await this.stop();

      // Destroy optimizer
      if (this.optimizer) {
        await this.optimizer.destroy();
        this.optimizer = null;
      }

      // Destroy dashboard
      if (this.dashboard) {
        this.dashboard.destroy();
        this.dashboard = null;
      }

      this.isInitialized = false;
      console.log('Network Optimization Integration destroyed');
    } catch (error) {
      console.error('Failed to destroy integration:', error);
      this.events.onError?.(error as Error);
    }
  }

  /**
   * Private helper methods
   */

  private mergeConfig(partialConfig?: Partial<NetworkIntegrationConfig>): NetworkIntegrationConfig {
    if (!partialConfig) {
      return { ...DEFAULT_NETWORK_CONFIG };
    }

    return {
      optimizer: { ...DEFAULT_NETWORK_CONFIG.optimizer, ...partialConfig.optimizer },
      dashboard: { ...DEFAULT_NETWORK_CONFIG.dashboard, ...partialConfig.dashboard },
      integration: { ...DEFAULT_NETWORK_CONFIG.integration, ...partialConfig.integration },
    };
  }

  private async loadConfiguration(): Promise<void> {
    try {
      if (typeof localStorage === 'undefined') {
        return;
      }

      const saved = localStorage.getItem(this.config.integration.storageKey);
      if (saved) {
        const savedConfig = JSON.parse(saved);
        this.config = this.mergeConfig(savedConfig);
      }
    } catch (error) {
      console.warn('Failed to load saved configuration:', error);
    }
  }

  private async saveConfiguration(): Promise<void> {
    try {
      if (typeof localStorage === 'undefined') {
        return;
      }

      localStorage.setItem(
        this.config.integration.storageKey,
        JSON.stringify(this.config)
      );
    } catch (error) {
      console.warn('Failed to save configuration:', error);
    }
  }

  private setupErrorRecovery(): void {
    // Setup global error handling for network optimization
    window.addEventListener('error', (event) => {
      if (event.error && this.config.integration.errorRecovery.fallbackMode) {
        console.warn('Network optimization error detected, entering fallback mode');
        this.events.onError?.(event.error);
      }
    });

    window.addEventListener('unhandledrejection', (event) => {
      if (this.config.integration.errorRecovery.fallbackMode) {
        console.warn('Unhandled promise rejection in network optimization');
        this.events.onError?.(new Error(event.reason));
      }
    });
  }

  private setupConfigurationSync(): void {
    this.syncIntervalId = window.setInterval(async () => {
      try {
        await this.saveConfiguration();
        
        // Emit metrics update event
        const metrics = this.getCurrentMetrics();
        if (metrics) {
          this.events.onMetricsUpdate?.(metrics);
        }
      } catch (error) {
        console.warn('Configuration sync failed:', error);
      }
    }, this.config.integration.syncInterval);
  }
}

/**
 * Global integration instance
 */
let globalNetworkIntegration: NetworkOptimizationIntegration | null = null;

/**
 * Create global network optimization integration
 */
export function createNetworkOptimization(
  config?: Partial<NetworkIntegrationConfig>,
  events?: NetworkIntegrationEvents
): NetworkOptimizationIntegration {
  if (globalNetworkIntegration) {
    console.warn('Network optimization already exists, destroying previous instance');
    globalNetworkIntegration.destroy();
  }

  globalNetworkIntegration = new NetworkOptimizationIntegration(config, events);
  return globalNetworkIntegration;
}

/**
 * Get global network optimization integration
 */
export function getNetworkOptimization(): NetworkOptimizationIntegration | null {
  return globalNetworkIntegration;
}

/**
 * Initialize and start network optimization
 */
export async function initializeNetworkOptimization(
  config?: Partial<NetworkIntegrationConfig>,
  events?: NetworkIntegrationEvents
): Promise<NetworkOptimizationIntegration> {
  const integration = createNetworkOptimization(config, events);
  await integration.initialize();
  return integration;
}

/**
 * Quick setup for common use cases
 */
export async function setupBasicNetworkOptimization(): Promise<NetworkOptimizationIntegration> {
  const config: Partial<NetworkIntegrationConfig> = {
    optimizer: {
      prefetching: { enabled: true, adaptiveStrategy: 'balanced' },
      caching: { enabled: true, strategy: 'lru' },
      connectionOptimization: { enabled: true },
      monitoring: { enabled: true },
    },
    dashboard: {
      charts: { enabled: true },
      notifications: { enabled: true },
    },
    integration: {
      autoStart: true,
      errorRecovery: { enabled: true, fallbackMode: true },
    },
  };

  return initializeNetworkOptimization(config);
}

/**
 * Setup for high-performance applications
 */
export async function setupHighPerformanceNetworkOptimization(): Promise<NetworkOptimizationIntegration> {
  const config: Partial<NetworkIntegrationConfig> = {
    optimizer: {
      prefetching: { 
        enabled: true, 
        adaptiveStrategy: 'aggressive',
        maxConcurrentRequests: 8,
        intelligentPrediction: true,
      },
      caching: { 
        enabled: true, 
        strategy: 'adaptive',
        maxCacheSize: 200,
        compression: true,
      },
      connectionOptimization: { 
        enabled: true,
        http2Push: true,
        http3Support: true,
        multiplexing: true,
      },
      qualityAdaptation: {
        enabled: true,
        adaptiveStreaming: true,
      },
      monitoring: { 
        enabled: true,
        realTimeReporting: true,
        metricsInterval: 1000,
      },
    },
    dashboard: {
      refreshInterval: 1000,
      charts: { enabled: true, maxDataPoints: 100 },
      notifications: { enabled: true },
      controls: { enabled: true, allowConfigChanges: true },
    },
  };

  return initializeNetworkOptimization(config);
}

/**
 * Setup for mobile applications
 */
export async function setupMobileNetworkOptimization(): Promise<NetworkOptimizationIntegration> {
  const config: Partial<NetworkIntegrationConfig> = {
    optimizer: {
      prefetching: { 
        enabled: true, 
        adaptiveStrategy: 'conservative',
        maxConcurrentRequests: 2,
      },
      caching: { 
        enabled: true, 
        strategy: 'lfu',
        maxCacheSize: 50,
        compression: true,
      },
      connectionOptimization: { 
        enabled: true,
        keepAlive: true,
      },
      qualityAdaptation: {
        enabled: true,
        adaptiveStreaming: true,
        bandwidthThresholds: {
          low: 0.5,
          medium: 2,
          high: 5,
        },
      },
      errorHandling: {
        enabled: true,
        maxRetries: 5,
        backoffStrategy: 'exponential',
      },
    },
    dashboard: {
      refreshInterval: 5000,
      charts: { enabled: true, maxDataPoints: 30 },
      notifications: { enabled: true, duration: 3000 },
    },
  };

  return initializeNetworkOptimization(config);
}
