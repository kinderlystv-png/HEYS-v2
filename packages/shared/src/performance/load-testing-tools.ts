/**
 * HEYS Load Testing & Stress Testing Tools v1.0
 * Automated Load Testing, Stress Testing, and Performance Validation
 *
 * Features:
 * - Load testing with various patterns
 * - Stress testing with breaking point detection
 * - Spike testing and volume testing
 * - Endurance testing for sustained load
 * - Real-time monitoring during tests
 * - Performance metrics collection
 * - Automated threshold validation
 * - Resource utilization tracking
 */

export interface LoadTestConfiguration {
  name: string;
  description: string;
  type: 'load' | 'stress' | 'spike' | 'volume' | 'endurance';
  target: {
    url: string;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    headers: Record<string, string>;
    body?: any;
    timeout: number;
  };
  loadProfile: LoadProfile;
  thresholds: PerformanceThreshold[];
  monitoring: MonitoringConfig;
  reporting: ReportingConfig;
}

export interface LoadProfile {
  pattern: 'constant' | 'ramp-up' | 'step' | 'spike' | 'sine-wave' | 'random';
  duration: number; // Test duration in seconds
  virtualUsers: VirtualUserConfig;
  requests: RequestConfig;
  think_time: {
    min: number;
    max: number;
    distribution: 'uniform' | 'normal' | 'exponential';
  };
}

export interface VirtualUserConfig {
  initial: number;
  target: number;
  ramp_duration: number;
  sustain_duration: number;
  ramp_down_duration: number;
  max_concurrent: number;
}

export interface RequestConfig {
  rate: number; // Requests per second
  burst: number; // Max burst size
  distribution: 'uniform' | 'poisson' | 'normal';
}

export interface PerformanceThreshold {
  metric: 'response_time' | 'throughput' | 'error_rate' | 'cpu_usage' | 'memory_usage';
  operator: 'lt' | 'lte' | 'gt' | 'gte' | 'eq';
  value: number;
  severity: 'info' | 'warning' | 'error' | 'critical';
  description: string;
}

export interface MonitoringConfig {
  enabled: boolean;
  interval: number; // Monitoring interval in seconds
  metrics: string[];
  alerts: AlertConfig[];
  dashboards: DashboardConfig[];
}

export interface AlertConfig {
  name: string;
  condition: string;
  threshold: number;
  action: 'log' | 'email' | 'webhook' | 'stop_test';
  recipients?: string[];
}

export interface DashboardConfig {
  name: string;
  widgets: WidgetConfig[];
  refresh_interval: number;
}

export interface WidgetConfig {
  type: 'chart' | 'gauge' | 'table' | 'text';
  title: string;
  metric: string;
  config: any;
}

export interface ReportingConfig {
  enabled: boolean;
  format: 'html' | 'json' | 'csv' | 'pdf';
  output_path: string;
  include_raw_data: boolean;
  include_charts: boolean;
  auto_upload: boolean;
  upload_destination?: string;
}

export interface LoadTestResult {
  test_id: string;
  test_name: string;
  execution_id: string;
  start_time: number;
  end_time: number;
  duration: number;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  summary: LoadTestSummary;
  metrics: LoadTestMetrics;
  thresholds: ThresholdResult[];
  errors: LoadTestError[];
  system_metrics: SystemMetrics;
  raw_data?: RawTestData;
}

export interface LoadTestSummary {
  total_requests: number;
  successful_requests: number;
  failed_requests: number;
  requests_per_second: number;
  average_response_time: number;
  min_response_time: number;
  max_response_time: number;
  p50_response_time: number;
  p90_response_time: number;
  p95_response_time: number;
  p99_response_time: number;
  error_rate: number;
  throughput: number;
  data_transferred: number;
  concurrent_users: number;
}

export interface LoadTestMetrics {
  response_times: TimeSeries[];
  throughput: TimeSeries[];
  error_rates: TimeSeries[];
  active_users: TimeSeries[];
  response_time_distribution: ResponseTimeDistribution[];
  status_codes: StatusCodeDistribution[];
  error_types: ErrorTypeDistribution[];
}

export interface TimeSeries {
  timestamp: number;
  value: number;
  tags?: Record<string, string>;
}

export interface ResponseTimeDistribution {
  range: string;
  count: number;
  percentage: number;
}

export interface StatusCodeDistribution {
  status_code: number;
  count: number;
  percentage: number;
}

export interface ErrorTypeDistribution {
  error_type: string;
  count: number;
  percentage: number;
  examples: string[];
}

export interface ThresholdResult {
  metric: string;
  threshold_value: number;
  actual_value: number;
  passed: boolean;
  severity: string;
  message: string;
}

export interface LoadTestError {
  timestamp: number;
  type: string;
  message: string;
  details: any;
  request_info?: {
    url: string;
    method: string;
    headers: Record<string, string>;
    status_code?: number;
  };
}

export interface SystemMetrics {
  cpu_usage: TimeSeries[];
  memory_usage: TimeSeries[];
  disk_io: TimeSeries[];
  network_io: TimeSeries[];
  load_average: TimeSeries[];
  open_connections: TimeSeries[];
}

export interface RawTestData {
  requests: RequestData[];
  responses: ResponseData[];
  system_samples: SystemSample[];
}

export interface RequestData {
  timestamp: number;
  user_id: string;
  request_id: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body_size: number;
}

export interface ResponseData {
  timestamp: number;
  request_id: string;
  status_code: number;
  response_time: number;
  body_size: number;
  headers: Record<string, string>;
  error?: string;
}

export interface SystemSample {
  timestamp: number;
  cpu_usage: number;
  memory_usage: number;
  disk_read: number;
  disk_write: number;
  network_in: number;
  network_out: number;
}

/**
 * Load Testing Engine
 */
export class LoadTestingEngine {
  private config: LoadTestConfiguration;
  private isRunning: boolean = false;
  private startTime: number = 0;
  private virtualUsers: Map<string, VirtualUser> = new Map();
  private metrics: LoadTestMetrics = this.createEmptyMetrics();
  private systemMetrics: SystemMetrics = this.createEmptySystemMetrics();
  private errors: LoadTestError[] = [];
  private results: LoadTestResult | null = null;
  private monitoringInterval: NodeJS.Timeout | null = null;

  constructor(config: LoadTestConfiguration) {
    this.config = config;
  }

  /**
   * Start load test execution
   */
  async startTest(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Load test is already running');
    }

    console.log(`Starting ${this.config.type} test: ${this.config.name}`);

    this.isRunning = true;
    this.startTime = Date.now();
    this.virtualUsers.clear();
    this.metrics = this.createEmptyMetrics();
    this.errors = [];

    try {
      // Initialize monitoring
      if (this.config.monitoring.enabled) {
        this.startMonitoring();
      }

      // Execute load test based on profile
      await this.executeLoadProfile();

      // Generate final results
      this.results = await this.generateResults();

      console.log(`Load test completed: ${this.results.status}`);
    } catch (error) {
      console.error('Load test failed:', error);
      this.recordError('test_execution', (error as Error).message, { error });
      throw error;
    } finally {
      this.isRunning = false;
      this.stopMonitoring();
      this.cleanupVirtualUsers();
    }
  }

  /**
   * Execute load profile based on pattern
   */
  private async executeLoadProfile(): Promise<void> {
    const { pattern, duration, virtualUsers } = this.config.loadProfile;

    switch (pattern) {
      case 'constant':
        await this.executeConstantLoad(virtualUsers, duration);
        break;
      case 'ramp-up':
        await this.executeRampUpLoad(virtualUsers, duration);
        break;
      case 'step':
        await this.executeStepLoad(virtualUsers, duration);
        break;
      case 'spike':
        await this.executeSpikeLoad(virtualUsers, duration);
        break;
      case 'sine-wave':
        await this.executeSineWaveLoad(virtualUsers, duration);
        break;
      case 'random':
        await this.executeRandomLoad(virtualUsers, duration);
        break;
      default:
        throw new Error(`Unknown load pattern: ${pattern}`);
    }
  }

  /**
   * Execute constant load pattern
   */
  private async executeConstantLoad(
    userConfig: VirtualUserConfig,
    duration: number,
  ): Promise<void> {
    console.log(`Executing constant load: ${userConfig.target} users for ${duration}s`);

    // Ramp up to target users
    await this.rampUpUsers(userConfig.target, userConfig.ramp_duration);

    // Sustain load
    await this.sustainLoad(duration - userConfig.ramp_duration - userConfig.ramp_down_duration);

    // Ramp down
    await this.rampDownUsers(userConfig.ramp_down_duration);
  }

  /**
   * Execute ramp-up load pattern
   */
  private async executeRampUpLoad(userConfig: VirtualUserConfig, duration: number): Promise<void> {
    console.log(
      `Executing ramp-up load: ${userConfig.initial} to ${userConfig.target} users over ${duration}s`,
    );

    const steps = 10;
    const stepDuration = duration / steps;
    const userIncrement = (userConfig.target - userConfig.initial) / steps;

    let currentUsers = userConfig.initial;

    for (let step = 0; step < steps; step++) {
      const targetUsers = Math.round(currentUsers + userIncrement);
      await this.adjustUserCount(targetUsers);
      await this.wait(stepDuration * 1000);
      currentUsers = targetUsers;
    }
  }

  /**
   * Execute step load pattern
   */
  private async executeStepLoad(userConfig: VirtualUserConfig, duration: number): Promise<void> {
    console.log(`Executing step load: increasing by steps over ${duration}s`);

    const steps = 5;
    const stepDuration = duration / steps;
    const userIncrement = userConfig.target / steps;

    let currentUsers = 0;

    for (let step = 0; step < steps; step++) {
      currentUsers += userIncrement;
      await this.adjustUserCount(Math.round(currentUsers));
      await this.wait(stepDuration * 1000);
    }
  }

  /**
   * Execute spike load pattern
   */
  private async executeSpikeLoad(userConfig: VirtualUserConfig, duration: number): Promise<void> {
    console.log(`Executing spike load: spike to ${userConfig.target} users`);

    const steadyDuration = duration * 0.3;
    const spikeDuration = duration * 0.4;
    const recoveryDuration = duration * 0.3;

    // Steady state
    await this.adjustUserCount(userConfig.initial);
    await this.wait(steadyDuration * 1000);

    // Spike
    await this.adjustUserCount(userConfig.target);
    await this.wait(spikeDuration * 1000);

    // Recovery
    await this.adjustUserCount(userConfig.initial);
    await this.wait(recoveryDuration * 1000);
  }

  /**
   * Execute sine-wave load pattern
   */
  private async executeSineWaveLoad(
    userConfig: VirtualUserConfig,
    duration: number,
  ): Promise<void> {
    console.log(`Executing sine-wave load over ${duration}s`);

    const interval = 5; // 5 second intervals
    const steps = duration / interval;
    const amplitude = (userConfig.target - userConfig.initial) / 2;
    const baseline = userConfig.initial + amplitude;

    for (let step = 0; step < steps; step++) {
      const angle = (step / steps) * 2 * Math.PI;
      const targetUsers = Math.round(baseline + amplitude * Math.sin(angle));

      await this.adjustUserCount(targetUsers);
      await this.wait(interval * 1000);
    }
  }

  /**
   * Execute random load pattern
   */
  private async executeRandomLoad(userConfig: VirtualUserConfig, duration: number): Promise<void> {
    console.log(`Executing random load over ${duration}s`);

    const interval = 10; // 10 second intervals
    const steps = duration / interval;

    for (let step = 0; step < steps; step++) {
      const randomUsers = Math.round(
        userConfig.initial + Math.random() * (userConfig.target - userConfig.initial),
      );

      await this.adjustUserCount(randomUsers);
      await this.wait(interval * 1000);
    }
  }

  /**
   * Ramp up virtual users
   */
  private async rampUpUsers(targetUsers: number, rampDuration: number): Promise<void> {
    const currentUserCount = this.virtualUsers.size;
    const usersToAdd = targetUsers - currentUserCount;

    if (usersToAdd <= 0) return;

    const interval = (rampDuration * 1000) / usersToAdd;

    for (let i = 0; i < usersToAdd; i++) {
      await this.addVirtualUser();
      if (i < usersToAdd - 1) {
        await this.wait(interval);
      }
    }
  }

  /**
   * Ramp down virtual users
   */
  private async rampDownUsers(rampDuration: number): Promise<void> {
    const userCount = this.virtualUsers.size;
    if (userCount === 0) return;

    const interval = (rampDuration * 1000) / userCount;
    const userIds = Array.from(this.virtualUsers.keys());

    for (const userId of userIds) {
      await this.removeVirtualUser(userId);
      await this.wait(interval);
    }
  }

  /**
   * Sustain load for specified duration
   */
  private async sustainLoad(duration: number): Promise<void> {
    console.log(`Sustaining load with ${this.virtualUsers.size} users for ${duration}s`);
    await this.wait(duration * 1000);
  }

  /**
   * Adjust user count to target
   */
  private async adjustUserCount(targetUsers: number): Promise<void> {
    const currentUsers = this.virtualUsers.size;

    if (targetUsers > currentUsers) {
      // Add users
      const usersToAdd = targetUsers - currentUsers;
      for (let i = 0; i < usersToAdd; i++) {
        await this.addVirtualUser();
      }
    } else if (targetUsers < currentUsers) {
      // Remove users
      const usersToRemove = currentUsers - targetUsers;
      const userIds = Array.from(this.virtualUsers.keys()).slice(0, usersToRemove);

      for (const userId of userIds) {
        await this.removeVirtualUser(userId);
      }
    }

    console.log(`Adjusted user count to ${this.virtualUsers.size} users`);
  }

  /**
   * Add virtual user
   */
  private async addVirtualUser(): Promise<void> {
    const userId = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const virtualUser = new VirtualUser(userId, this.config, this);

    this.virtualUsers.set(userId, virtualUser);
    virtualUser.start();
  }

  /**
   * Remove virtual user
   */
  private async removeVirtualUser(userId: string): Promise<void> {
    const virtualUser = this.virtualUsers.get(userId);
    if (virtualUser) {
      virtualUser.stop();
      this.virtualUsers.delete(userId);
    }
  }

  /**
   * Record request metrics
   */
  recordRequest(
    responseTime: number,
    success: boolean,
    statusCode: number,
    bodySize: number,
  ): void {
    const timestamp = Date.now();

    // Record response time
    this.metrics.response_times.push({
      timestamp,
      value: responseTime,
      tags: { success: success.toString(), status_code: statusCode.toString() },
    });

    // Record throughput
    this.metrics.throughput.push({
      timestamp,
      value: bodySize,
    });

    // Record error rate
    this.metrics.error_rates.push({
      timestamp,
      value: success ? 0 : 1,
    });

    // Record active users
    this.metrics.active_users.push({
      timestamp,
      value: this.virtualUsers.size,
    });
  }

  /**
   * Record error
   */
  recordError(type: string, message: string, details: any): void {
    this.errors.push({
      timestamp: Date.now(),
      type,
      message,
      details,
    });
  }

  /**
   * Start monitoring
   */
  private startMonitoring(): void {
    console.log('Starting performance monitoring...');

    this.monitoringInterval = setInterval(() => {
      this.collectSystemMetrics();
      this.checkThresholds();
    }, this.config.monitoring.interval * 1000);
  }

  /**
   * Stop monitoring
   */
  private stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  /**
   * Collect system metrics
   */
  private collectSystemMetrics(): void {
    const timestamp = Date.now();

    // Collect metrics if available
    if (typeof performance !== 'undefined' && (performance as any).memory) {
      const memory = (performance as any).memory;
      this.systemMetrics.memory_usage.push({
        timestamp,
        value: memory.usedJSHeapSize,
      });
    }

    // Note: CPU and other system metrics would require Node.js APIs
    // This is a simplified implementation for browser compatibility
  }

  /**
   * Check performance thresholds
   */
  private checkThresholds(): void {
    for (const threshold of this.config.thresholds) {
      const currentValue = this.getCurrentMetricValue(threshold.metric);
      const passed = this.evaluateThreshold(currentValue, threshold.operator, threshold.value);

      if (!passed && threshold.severity === 'critical') {
        console.warn(`Critical threshold exceeded: ${threshold.metric} = ${currentValue}`);
        // Could stop test or trigger alerts here
      }
    }
  }

  /**
   * Get current metric value
   */
  private getCurrentMetricValue(metric: string): number {
    switch (metric) {
      case 'response_time':
        return this.calculateAverageResponseTime();
      case 'throughput':
        return this.calculateCurrentThroughput();
      case 'error_rate':
        return this.calculateCurrentErrorRate();
      default:
        return 0;
    }
  }

  /**
   * Evaluate threshold
   */
  private evaluateThreshold(value: number, operator: string, threshold: number): boolean {
    switch (operator) {
      case 'lt':
        return value < threshold;
      case 'lte':
        return value <= threshold;
      case 'gt':
        return value > threshold;
      case 'gte':
        return value >= threshold;
      case 'eq':
        return value === threshold;
      default:
        return false;
    }
  }

  /**
   * Calculate average response time
   */
  private calculateAverageResponseTime(): number {
    const responseTimes = this.metrics.response_times;
    if (responseTimes.length === 0) return 0;

    const sum = responseTimes.reduce((acc, rt) => acc + rt.value, 0);
    return sum / responseTimes.length;
  }

  /**
   * Calculate current throughput
   */
  private calculateCurrentThroughput(): number {
    const now = Date.now();
    const oneSecondAgo = now - 1000;

    const recentRequests = this.metrics.throughput.filter((t) => t.timestamp >= oneSecondAgo);
    return recentRequests.reduce((acc, t) => acc + t.value, 0);
  }

  /**
   * Calculate current error rate
   */
  private calculateCurrentErrorRate(): number {
    const recentErrors = this.metrics.error_rates.slice(-100); // Last 100 requests
    if (recentErrors.length === 0) return 0;

    const errorCount = recentErrors.reduce((acc, e) => acc + e.value, 0);
    return (errorCount / recentErrors.length) * 100;
  }

  /**
   * Generate final test results
   */
  private async generateResults(): Promise<LoadTestResult> {
    const endTime = Date.now();
    const duration = endTime - this.startTime;

    const summary = this.calculateSummary();
    const thresholdResults = this.evaluateThresholds();

    return {
      test_id: this.config.name,
      test_name: this.config.name,
      execution_id: `exec-${this.startTime}`,
      start_time: this.startTime,
      end_time: endTime,
      duration,
      status: 'completed',
      summary,
      metrics: this.metrics,
      thresholds: thresholdResults,
      errors: this.errors,
      system_metrics: this.systemMetrics,
    };
  }

  /**
   * Calculate test summary
   */
  private calculateSummary(): LoadTestSummary {
    const responseTimes = this.metrics.response_times.map((rt) => rt.value);
    const totalRequests = responseTimes.length;
    const successfulRequests = this.metrics.error_rates.filter((e) => e.value === 0).length;
    const failedRequests = totalRequests - successfulRequests;

    responseTimes.sort((a, b) => a - b);

    return {
      total_requests: totalRequests,
      successful_requests: successfulRequests,
      failed_requests: failedRequests,
      requests_per_second: (totalRequests / (this.results?.duration || 1)) * 1000,
      average_response_time:
        responseTimes.length > 0
          ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
          : 0,
      min_response_time: responseTimes.length > 0 ? (responseTimes[0] ?? 0) : 0,
      max_response_time:
        responseTimes.length > 0 ? (responseTimes[responseTimes.length - 1] ?? 0) : 0,
      p50_response_time: this.percentile(responseTimes, 50),
      p90_response_time: this.percentile(responseTimes, 90),
      p95_response_time: this.percentile(responseTimes, 95),
      p99_response_time: this.percentile(responseTimes, 99),
      error_rate: totalRequests > 0 ? (failedRequests / totalRequests) * 100 : 0,
      throughput: this.calculateTotalThroughput(),
      data_transferred: this.calculateDataTransferred(),
      concurrent_users: this.virtualUsers.size,
    };
  }

  /**
   * Calculate percentile
   */
  private percentile(sortedArray: number[], percentile: number): number {
    if (sortedArray.length === 0) return 0;

    const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
    return sortedArray[Math.max(0, Math.min(index, sortedArray.length - 1))] ?? 0;
  }

  /**
   * Calculate total throughput
   */
  private calculateTotalThroughput(): number {
    return this.metrics.throughput.reduce((acc, t) => acc + t.value, 0);
  }

  /**
   * Calculate data transferred
   */
  private calculateDataTransferred(): number {
    return this.calculateTotalThroughput();
  }

  /**
   * Evaluate all thresholds
   */
  private evaluateThresholds(): ThresholdResult[] {
    const results: ThresholdResult[] = [];

    for (const threshold of this.config.thresholds) {
      const actualValue = this.getCurrentMetricValue(threshold.metric);
      const passed = this.evaluateThreshold(actualValue, threshold.operator, threshold.value);

      results.push({
        metric: threshold.metric,
        threshold_value: threshold.value,
        actual_value: actualValue,
        passed,
        severity: threshold.severity,
        message: passed
          ? 'Threshold met'
          : `Threshold exceeded: ${actualValue} ${threshold.operator} ${threshold.value}`,
      });
    }

    return results;
  }

  /**
   * Cleanup virtual users
   */
  private cleanupVirtualUsers(): void {
    for (const virtualUser of this.virtualUsers.values()) {
      virtualUser.stop();
    }
    this.virtualUsers.clear();
  }

  /**
   * Create empty metrics object
   */
  private createEmptyMetrics(): LoadTestMetrics {
    return {
      response_times: [],
      throughput: [],
      error_rates: [],
      active_users: [],
      response_time_distribution: [],
      status_codes: [],
      error_types: [],
    };
  }

  /**
   * Create empty system metrics object
   */
  private createEmptySystemMetrics(): SystemMetrics {
    return {
      cpu_usage: [],
      memory_usage: [],
      disk_io: [],
      network_io: [],
      load_average: [],
      open_connections: [],
    };
  }

  /**
   * Wait for specified time
   */
  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Public API methods
   */

  getResults(): LoadTestResult | null {
    return this.results;
  }

  isTestRunning(): boolean {
    return this.isRunning;
  }

  getCurrentMetrics(): LoadTestMetrics {
    return { ...this.metrics };
  }

  getActiveUserCount(): number {
    return this.virtualUsers.size;
  }

  async stopTest(): Promise<void> {
    if (!this.isRunning) return;

    console.log('Stopping load test...');
    this.isRunning = false;
  }

  updateConfig(newConfig: Partial<LoadTestConfiguration>): void {
    this.config = { ...this.config, ...newConfig };
  }

  exportResults(format: 'json' | 'csv'): string {
    if (!this.results) {
      throw new Error('No test results available');
    }

    if (format === 'json') {
      return JSON.stringify(this.results, null, 2);
    } else {
      // Simple CSV export
      const headers = 'Timestamp,ResponseTime,Success,StatusCode,ActiveUsers\n';
      const rows = this.metrics.response_times
        .map((rt, index) => {
          const error = this.metrics.error_rates[index] || { value: 0 };
          const users = this.metrics.active_users[index] || { value: 0 };
          return `${rt.timestamp},${rt.value},${error.value === 0},${rt.tags?.status_code || 'unknown'},${users.value}`;
        })
        .join('\n');

      return headers + rows;
    }
  }
}

/**
 * Virtual User class for simulating user behavior
 */
class VirtualUser {
  private id: string;
  private config: LoadTestConfiguration;
  private engine: LoadTestingEngine;
  private isActive: boolean = false;
  private executionInterval: NodeJS.Timeout | null = null;

  constructor(id: string, config: LoadTestConfiguration, engine: LoadTestingEngine) {
    this.id = id;
    this.config = config;
    this.engine = engine;
  }

  start(): void {
    if (this.isActive) return;

    this.isActive = true;
    this.scheduleNextRequest();
  }

  stop(): void {
    this.isActive = false;
    if (this.executionInterval) {
      clearTimeout(this.executionInterval);
      this.executionInterval = null;
    }
  }

  private scheduleNextRequest(): void {
    if (!this.isActive) return;

    const thinkTime = this.calculateThinkTime();

    this.executionInterval = setTimeout(async () => {
      try {
        await this.executeRequest();
      } catch (error) {
        this.engine.recordError('request_execution', (error as Error).message, { userId: this.id });
      } finally {
        this.scheduleNextRequest();
      }
    }, thinkTime);
  }

  private calculateThinkTime(): number {
    const { think_time } = this.config.loadProfile;
    const { min, max, distribution } = think_time;

    switch (distribution) {
      case 'uniform':
        return min + Math.random() * (max - min);
      case 'normal':
        // Simple normal distribution approximation
        const u1 = Math.random();
        const u2 = Math.random();
        const normal = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        const mean = (min + max) / 2;
        const stdDev = (max - min) / 6;
        return Math.max(min, Math.min(max, mean + normal * stdDev));
      case 'exponential':
        const lambda = 1 / ((min + max) / 2);
        return -Math.log(Math.random()) / lambda;
      default:
        return min + Math.random() * (max - min);
    }
  }

  private async executeRequest(): Promise<void> {
    const startTime = Date.now();
    let success = false;
    let statusCode = 0;
    let bodySize = 0;

    try {
      const { target } = this.config;
      const requestInit: RequestInit = {
        method: target.method,
        headers: target.headers,
        signal: AbortSignal.timeout(target.timeout),
      };

      if (target.body) {
        requestInit.body = JSON.stringify(target.body);
      }

      const response = await fetch(target.url, requestInit);

      statusCode = response.status;
      success = response.ok;

      const responseText = await response.text();
      bodySize = new Blob([responseText]).size;
    } catch (error) {
      success = false;
      statusCode = 0;
      this.engine.recordError('http_request', (error as Error).message, {
        userId: this.id,
        url: this.config.target.url,
      });
    }

    const endTime = Date.now();
    const responseTime = endTime - startTime;

    this.engine.recordRequest(responseTime, success, statusCode, bodySize);
  }
}
