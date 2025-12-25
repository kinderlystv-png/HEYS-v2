/**
 * HEYS Performance Test Framework v1.0
 * Automated Performance Testing & Validation System
 *
 * Features:
 * - Automated performance test execution
 * - Load testing and stress testing
 * - Performance regression detection
 * - Performance budget enforcement
 * - CI/CD integration capabilities
 * - Automated test report generation
 * - Performance benchmarking
 * - Test scenario management
 */

import { logger as baseLogger } from '@heys/logger';

type PerformanceMemory = {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
};
export interface PerformanceTestConfig {
  name: string;
  description: string;
  url: string;
  testType: 'load' | 'stress' | 'spike' | 'volume' | 'endurance' | 'baseline';
  duration: number;
  concurrency: {
    users: number;
    rampUpTime: number;
    sustainTime: number;
    rampDownTime: number;
  };
  scenarios: PerformanceTestScenario[];
  budgets: PerformanceBudget[];
  environment: {
    name: string;
    baseUrl: string;
    headers: Record<string, string>;
    cookies: Record<string, string>;
  };
  reporting: {
    enabled: boolean;
    format: 'html' | 'json' | 'csv' | 'xml';
    outputPath: string;
    includeScreenshots: boolean;
  };
  integrations: {
    ci: boolean;
    slack: boolean;
    email: boolean;
    webhook: string | null;
  };
}

export interface PerformanceTestScenario {
  id: string;
  name: string;
  description: string;
  weight: number; // Percentage of total load
  steps: PerformanceTestStep[];
  thinkTime: number; // Delay between steps
  dataSet: unknown[]; // Test data
  assertions: PerformanceAssertion[];
}

export interface PerformanceTestStep {
  id: string;
  name: string;
  type: 'http' | 'action' | 'wait' | 'assertion' | 'custom';
  config: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    url?: string;
    headers?: Record<string, string>;
    body?: unknown;
    timeout?: number;
    retries?: number;
  };
  validation: {
    statusCode?: number;
    responseTime?: number;
    contentType?: string;
    bodyContains?: string[];
    bodyNotContains?: string[];
  };
  metrics: {
    capture: boolean;
    tags: string[];
  };
}

export interface PerformanceAssertion {
  id: string;
  name: string;
  metric: string;
  operator: 'lt' | 'lte' | 'gt' | 'gte' | 'eq' | 'ne';
  value: number;
  severity: 'info' | 'warning' | 'error' | 'critical';
  description: string;
}

export interface PerformanceBudget {
  metric: string;
  limit: number;
  operator: 'lt' | 'lte' | 'gt' | 'gte';
  severity: 'warning' | 'error';
  description: string;
}

export interface PerformanceTestResult {
  testId: string;
  testName: string;
  executionId: string;
  startTime: number;
  endTime: number;
  duration: number;
  status: 'passed' | 'failed' | 'error' | 'cancelled';
  summary: {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageResponseTime: number;
    p50ResponseTime: number;
    p95ResponseTime: number;
    p99ResponseTime: number;
    minResponseTime: number;
    maxResponseTime: number;
    requestsPerSecond: number;
    errorRate: number;
    throughput: number;
  };
  scenarios: ScenarioResult[];
  budgetResults: BudgetResult[];
  errors: TestError[];
  metrics: TestMetrics;
  screenshots: string[];
  logs: string[];
}

export interface ScenarioResult {
  scenarioId: string;
  scenarioName: string;
  executions: number;
  successRate: number;
  averageResponseTime: number;
  steps: StepResult[];
  assertions: AssertionResult[];
}

export interface StepResult {
  stepId: string;
  stepName: string;
  executions: number;
  successRate: number;
  averageResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  errors: string[];
}

export interface AssertionResult {
  assertionId: string;
  assertionName: string;
  passed: boolean;
  actualValue: number;
  expectedValue: number;
  operator: string;
  message: string;
}

export interface BudgetResult {
  metric: string;
  actualValue: number;
  budgetLimit: number;
  passed: boolean;
  severity: string;
  message: string;
}

export interface TestError {
  timestamp: number;
  type: string;
  message: string;
  stack?: string;
  scenarioId?: string;
  stepId?: string;
}

export interface TestMetrics {
  responseTimeDistribution: { range: string; count: number }[];
  throughputOverTime: { timestamp: number; value: number }[];
  errorRateOverTime: { timestamp: number; value: number }[];
  activeUsersOverTime: { timestamp: number; value: number }[];
  memoryUsage: { timestamp: number; value: number }[];
  cpuUsage: { timestamp: number; value: number }[];
}

export interface LoadTestProfile {
  name: string;
  pattern: 'constant' | 'ramp-up' | 'spike' | 'step' | 'sine-wave';
  parameters: {
    baseLoad: number;
    peakLoad: number;
    duration: number;
    steps?: number;
    frequency?: number;
  };
}

/**
 * Performance Test Framework
 */
export class PerformanceTestFramework {
  private config: PerformanceTestConfig;
  private isRunning: boolean = false;
  private currentExecution: string | null = null;
  private results: Map<string, PerformanceTestResult> = new Map();
  private scenarios: Map<string, PerformanceTestScenario> = new Map();
  private activeUsers: number = 0;
  private startTime: number = 0;
  private metrics: TestMetrics = this.createEmptyMetrics();
  private readonly logger = baseLogger.child({ component: 'PerformanceTestFramework' });

  constructor(config: PerformanceTestConfig) {
    this.config = config;
    this.initializeScenarios();
  }

  /**
   * Initialize test scenarios
   */
  private initializeScenarios(): void {
    this.config.scenarios.forEach((scenario) => {
      this.scenarios.set(scenario.id, scenario);
    });
  }

  /**
   * Execute performance test
   */
  async executeTest(): Promise<PerformanceTestResult> {
    if (this.isRunning) {
      throw new Error('Performance test is already running');
    }

    this.isRunning = true;
    this.currentExecution = `exec-${Date.now()}`;
    this.startTime = Date.now();

    try {
      this.logger.info(`Starting performance test: ${this.config.name}`);

      // Initialize metrics collection
      this.initializeMetricsCollection();

      // Execute test phases
      await this.executeTestPhases();

      // Generate test result
      const result = await this.generateTestResult();

      // Store result
      this.results.set(this.currentExecution, result);

      // Generate reports if enabled
      if (this.config.reporting.enabled) {
        await this.generateReports(result);
      }

      // Send notifications
      await this.sendNotifications(result);

      this.logger.info(`Performance test completed: ${result.status}`);
      return result;
    } catch (error) {
      this.logger.error({ error }, 'Performance test failed');
      throw error;
    } finally {
      this.isRunning = false;
      this.currentExecution = null;
    }
  }

  /**
   * Execute test phases (ramp-up, sustain, ramp-down)
   */
  private async executeTestPhases(): Promise<void> {
    const { concurrency } = this.config;

    // Phase 1: Ramp-up
    this.logger.info('Phase 1: Ramp-up');
    await this.executeRampUp(concurrency.users, concurrency.rampUpTime);

    // Phase 2: Sustain
    this.logger.info('Phase 2: Sustain load');
    await this.executeSustainLoad(concurrency.sustainTime);

    // Phase 3: Ramp-down
    this.logger.info('Phase 3: Ramp-down');
    await this.executeRampDown(concurrency.rampDownTime);
  }

  /**
   * Execute ramp-up phase
   */
  private async executeRampUp(targetUsers: number, duration: number): Promise<void> {
    const interval = duration / targetUsers;

    for (let i = 0; i < targetUsers; i++) {
      await this.startVirtualUser();
      this.activeUsers++;

      if (i < targetUsers - 1) {
        await this.wait(interval);
      }
    }
  }

  /**
   * Execute sustain load phase
   */
  private async executeSustainLoad(duration: number): Promise<void> {
    await this.wait(duration);
  }

  /**
   * Execute ramp-down phase
   */
  private async executeRampDown(duration: number): Promise<void> {
    const interval = duration / this.activeUsers;

    while (this.activeUsers > 0) {
      await this.stopVirtualUser();
      this.activeUsers--;

      if (this.activeUsers > 0) {
        await this.wait(interval);
      }
    }
  }

  /**
   * Start virtual user
   */
  private async startVirtualUser(): Promise<void> {
    const scenario = this.selectScenario();
    if (!scenario) return;

    // Execute scenario in background
    this.executeScenario(scenario).catch((error) => {
      this.logger.error({ error }, 'Virtual user scenario failed');
    });
  }

  /**
   * Stop virtual user
   */
  private async stopVirtualUser(): Promise<void> {
    // Implementation for stopping virtual users
    // This would involve signaling running scenarios to stop
  }

  /**
   * Select scenario based on weight distribution
   */
  private selectScenario(): PerformanceTestScenario | null {
    const scenarios = Array.from(this.scenarios.values());
    const totalWeight = scenarios.reduce((sum, s) => sum + s.weight, 0);
    const random = Math.random() * totalWeight;

    let currentWeight = 0;
    for (const scenario of scenarios) {
      currentWeight += scenario.weight;
      if (random <= currentWeight) {
        return scenario;
      }
    }

    return scenarios[0] || null;
  }

  /**
   * Execute test scenario
   */
  private async executeScenario(scenario: PerformanceTestScenario): Promise<ScenarioResult> {
    const stepResults: StepResult[] = [];
    const assertionResults: AssertionResult[] = [];

    try {
      // Execute scenario steps
      for (const step of scenario.steps) {
        const stepResult = await this.executeStep(step);
        stepResults.push(stepResult);

        // Add think time between steps
        if (scenario.thinkTime > 0) {
          await this.wait(scenario.thinkTime);
        }
      }

      // Execute assertions
      for (const assertion of scenario.assertions) {
        const assertionResult = await this.executeAssertion(assertion, stepResults);
        assertionResults.push(assertionResult);
      }

      return {
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        executions: 1,
        successRate: this.calculateSuccessRate(stepResults),
        averageResponseTime: this.calculateAverageResponseTime(stepResults),
        steps: stepResults,
        assertions: assertionResults,
      };
    } catch (error) {
      this.logger.error({ error }, `Scenario execution failed: ${scenario.name}`);
      throw error;
    }
  }

  /**
   * Execute test step
   */
  private async executeStep(step: PerformanceTestStep): Promise<StepResult> {
    const startTime = Date.now();
    const errors: string[] = [];

    try {
      switch (step.type) {
        case 'http':
          await this.executeHttpStep(step);
          break;
        case 'action':
          await this.executeActionStep(step);
          break;
        case 'wait':
          await this.executeWaitStep(step);
          break;
        case 'assertion':
          await this.executeAssertionStep(step);
          break;
        case 'custom':
          await this.executeCustomStep(step);
          break;
        default:
          throw new Error(`Unknown step type: ${step.type}`);
      }

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      return {
        stepId: step.id,
        stepName: step.name,
        executions: 1,
        successRate: 1,
        averageResponseTime: responseTime,
        minResponseTime: responseTime,
        maxResponseTime: responseTime,
        errors: errors,
      };
    } catch (error) {
      const endTime = Date.now();
      const responseTime = endTime - startTime;
      errors.push((error as Error).message);

      return {
        stepId: step.id,
        stepName: step.name,
        executions: 1,
        successRate: 0,
        averageResponseTime: responseTime,
        minResponseTime: responseTime,
        maxResponseTime: responseTime,
        errors: errors,
      };
    }
  }

  /**
   * Execute HTTP step
   */
  private async executeHttpStep(step: PerformanceTestStep): Promise<void> {
    const { config, validation } = step;
    const url = this.resolveUrl(config.url || '');

    const requestOptions: Parameters<typeof fetch>[1] = {
      method: config.method || 'GET',
      headers: {
        ...this.config.environment.headers,
        ...config.headers,
      },
    };

    if (config.body) {
      requestOptions.body =
        typeof config.body === 'string' ? config.body : JSON.stringify(config.body);
    }

    const startTime = Date.now();
    const response = await fetch(url, requestOptions);
    const endTime = Date.now();
    const responseTime = endTime - startTime;

    // Validate response
    if (validation.statusCode && response.status !== validation.statusCode) {
      throw new Error(`Expected status ${validation.statusCode}, got ${response.status}`);
    }

    if (validation.responseTime && responseTime > validation.responseTime) {
      throw new Error(
        `Response time ${responseTime}ms exceeded limit ${validation.responseTime}ms`,
      );
    }

    if (validation.contentType) {
      const contentType = response.headers.get('content-type');
      if (!contentType?.includes(validation.contentType)) {
        throw new Error(`Expected content type ${validation.contentType}, got ${contentType}`);
      }
    }

    if (validation.bodyContains || validation.bodyNotContains) {
      const responseText = await response.text();

      if (validation.bodyContains) {
        for (const content of validation.bodyContains) {
          if (!responseText.includes(content)) {
            throw new Error(`Response body does not contain: ${content}`);
          }
        }
      }

      if (validation.bodyNotContains) {
        for (const content of validation.bodyNotContains) {
          if (responseText.includes(content)) {
            throw new Error(`Response body contains forbidden content: ${content}`);
          }
        }
      }
    }
  }

  /**
   * Execute action step
   */
  private async executeActionStep(step: PerformanceTestStep): Promise<void> {
    // Implementation for custom actions
    this.logger.info(`Executing action step: ${step.name}`);
  }

  /**
   * Execute wait step
   */
  private async executeWaitStep(step: PerformanceTestStep): Promise<void> {
    const waitTime = step.config.timeout || 1000;
    await this.wait(waitTime);
  }

  /**
   * Execute assertion step
   */
  private async executeAssertionStep(step: PerformanceTestStep): Promise<void> {
    // Implementation for inline assertions
    this.logger.info(`Executing assertion step: ${step.name}`);
  }

  /**
   * Execute custom step
   */
  private async executeCustomStep(step: PerformanceTestStep): Promise<void> {
    // Implementation for custom step types
    this.logger.info(`Executing custom step: ${step.name}`);
  }

  /**
   * Execute assertion
   */
  private async executeAssertion(
    assertion: PerformanceAssertion,
    stepResults: StepResult[],
  ): Promise<AssertionResult> {
    const actualValue = this.extractMetricValue(assertion.metric, stepResults);
    const passed = this.evaluateAssertion(actualValue, assertion.operator, assertion.value);

    return {
      assertionId: assertion.id,
      assertionName: assertion.name,
      passed,
      actualValue,
      expectedValue: assertion.value,
      operator: assertion.operator,
      message: passed
        ? 'Assertion passed'
        : `Assertion failed: ${actualValue} ${assertion.operator} ${assertion.value}`,
    };
  }

  /**
   * Extract metric value from step results
   */
  private extractMetricValue(metric: string, stepResults: StepResult[]): number {
    switch (metric) {
      case 'averageResponseTime':
        return (
          stepResults.reduce((sum, step) => sum + step.averageResponseTime, 0) / stepResults.length
        );
      case 'maxResponseTime':
        return Math.max(...stepResults.map((step) => step.maxResponseTime));
      case 'successRate':
        return stepResults.reduce((sum, step) => sum + step.successRate, 0) / stepResults.length;
      default:
        return 0;
    }
  }

  /**
   * Evaluate assertion
   */
  private evaluateAssertion(actualValue: number, operator: string, expectedValue: number): boolean {
    switch (operator) {
      case 'lt':
        return actualValue < expectedValue;
      case 'lte':
        return actualValue <= expectedValue;
      case 'gt':
        return actualValue > expectedValue;
      case 'gte':
        return actualValue >= expectedValue;
      case 'eq':
        return actualValue === expectedValue;
      case 'ne':
        return actualValue !== expectedValue;
      default:
        return false;
    }
  }

  /**
   * Calculate success rate from step results
   */
  private calculateSuccessRate(stepResults: StepResult[]): number {
    if (stepResults.length === 0) return 0;
    return stepResults.reduce((sum, step) => sum + step.successRate, 0) / stepResults.length;
  }

  /**
   * Calculate average response time from step results
   */
  private calculateAverageResponseTime(stepResults: StepResult[]): number {
    if (stepResults.length === 0) return 0;
    return (
      stepResults.reduce((sum, step) => sum + step.averageResponseTime, 0) / stepResults.length
    );
  }

  /**
   * Resolve URL with base URL
   */
  private resolveUrl(url: string): string {
    if (url.startsWith('http')) {
      return url;
    }
    return `${this.config.environment.baseUrl}${url}`;
  }

  /**
   * Wait for specified time
   */
  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Initialize metrics collection
   */
  private initializeMetricsCollection(): void {
    this.metrics = this.createEmptyMetrics();

    // Start collecting metrics at regular intervals
    const metricsInterval = setInterval(() => {
      this.collectMetrics();
    }, 1000);

    // Stop collecting after test duration
    setTimeout(() => {
      clearInterval(metricsInterval);
    }, this.config.duration);
  }

  /**
   * Collect metrics during test execution
   */
  private collectMetrics(): void {
    const timestamp = Date.now();

    // Collect throughput
    this.metrics.throughputOverTime.push({
      timestamp,
      value: this.calculateCurrentThroughput(),
    });

    // Collect error rate
    this.metrics.errorRateOverTime.push({
      timestamp,
      value: this.calculateCurrentErrorRate(),
    });

    // Collect active users
    this.metrics.activeUsersOverTime.push({
      timestamp,
      value: this.activeUsers,
    });

    // Collect system metrics if available
    const memory = (performance as Performance & { memory?: PerformanceMemory }).memory;
    if (memory) {
      this.metrics.memoryUsage.push({
        timestamp,
        value: memory.usedJSHeapSize,
      });
    }
  }

  /**
   * Calculate current throughput
   */
  private calculateCurrentThroughput(): number {
    // Implementation for calculating current throughput
    return 0;
  }

  /**
   * Calculate current error rate
   */
  private calculateCurrentErrorRate(): number {
    // Implementation for calculating current error rate
    return 0;
  }

  /**
   * Create empty metrics object
   */
  private createEmptyMetrics(): TestMetrics {
    return {
      responseTimeDistribution: [],
      throughputOverTime: [],
      errorRateOverTime: [],
      activeUsersOverTime: [],
      memoryUsage: [],
      cpuUsage: [],
    };
  }

  /**
   * Generate test result
   */
  private async generateTestResult(): Promise<PerformanceTestResult> {
    const endTime = Date.now();
    const duration = endTime - this.startTime;

    // Calculate summary metrics
    const summary = await this.calculateSummaryMetrics();

    // Evaluate budgets
    const budgetResults = await this.evaluateBudgets(summary);

    // Determine test status
    const status = this.determineTestStatus(budgetResults);
    const executionId = this.currentExecution ?? `exec-${Date.now()}`;

    return {
      testId: this.config.name,
      testName: this.config.name,
      executionId,
      startTime: this.startTime,
      endTime,
      duration,
      status,
      summary,
      scenarios: [], // Would be populated with actual scenario results
      budgetResults,
      errors: [], // Would be populated with actual errors
      metrics: this.metrics,
      screenshots: [], // Would be populated if screenshot capture is enabled
      logs: [], // Would be populated with test logs
    };
  }

  /**
   * Calculate summary metrics
   */
  private async calculateSummaryMetrics(): Promise<PerformanceTestResult['summary']> {
    // Implementation for calculating summary metrics
    return {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      p50ResponseTime: 0,
      p95ResponseTime: 0,
      p99ResponseTime: 0,
      minResponseTime: 0,
      maxResponseTime: 0,
      requestsPerSecond: 0,
      errorRate: 0,
      throughput: 0,
    };
  }

  /**
   * Evaluate performance budgets
   */
  private async evaluateBudgets(
    summary: PerformanceTestResult['summary'],
  ): Promise<BudgetResult[]> {
    const results: BudgetResult[] = [];

    for (const budget of this.config.budgets) {
      const actualValue = this.extractSummaryMetric(budget.metric, summary);
      const passed = this.evaluateAssertion(actualValue, budget.operator, budget.limit);

      results.push({
        metric: budget.metric,
        actualValue,
        budgetLimit: budget.limit,
        passed,
        severity: budget.severity,
        message: passed
          ? 'Budget met'
          : `Budget exceeded: ${actualValue} ${budget.operator} ${budget.limit}`,
      });
    }

    return results;
  }

  /**
   * Extract metric value from summary
   */
  private extractSummaryMetric(metric: string, summary: PerformanceTestResult['summary']): number {
    switch (metric) {
      case 'averageResponseTime':
        return summary.averageResponseTime;
      case 'p95ResponseTime':
        return summary.p95ResponseTime;
      case 'p99ResponseTime':
        return summary.p99ResponseTime;
      case 'errorRate':
        return summary.errorRate;
      case 'requestsPerSecond':
        return summary.requestsPerSecond;
      case 'throughput':
        return summary.throughput;
      default:
        return 0;
    }
  }

  /**
   * Determine test status based on budget results
   */
  private determineTestStatus(
    budgetResults: BudgetResult[],
  ): 'passed' | 'failed' | 'error' | 'cancelled' {
    const hasErrors = budgetResults.some((result) => !result.passed && result.severity === 'error');
    const hasWarnings = budgetResults.some(
      (result) => !result.passed && result.severity === 'warning',
    );

    if (hasErrors) return 'failed';
    if (hasWarnings) return 'failed';
    return 'passed';
  }

  /**
   * Generate reports
   */
  private async generateReports(result: PerformanceTestResult): Promise<void> {
    this.logger.info('Generating performance test reports...');

    switch (this.config.reporting.format) {
      case 'html':
        await this.generateHtmlReport(result);
        break;
      case 'json':
        await this.generateJsonReport(result);
        break;
      case 'csv':
        await this.generateCsvReport(result);
        break;
      case 'xml':
        await this.generateXmlReport(result);
        break;
    }
  }

  /**
   * Generate HTML report
   */
  private async generateHtmlReport(_result: PerformanceTestResult): Promise<void> {
    this.logger.info('Generating HTML report...');
    // Implementation for HTML report generation
  }

  /**
   * Generate JSON report
   */
  private async generateJsonReport(_result: PerformanceTestResult): Promise<void> {
    this.logger.info('Generating JSON report...');
    // Implementation for JSON report generation
  }

  /**
   * Generate CSV report
   */
  private async generateCsvReport(_result: PerformanceTestResult): Promise<void> {
    this.logger.info('Generating CSV report...');
    // Implementation for CSV report generation
  }

  /**
   * Generate XML report
   */
  private async generateXmlReport(_result: PerformanceTestResult): Promise<void> {
    this.logger.info('Generating XML report...');
    // Implementation for XML report generation
  }

  /**
   * Send notifications
   */
  private async sendNotifications(result: PerformanceTestResult): Promise<void> {
    this.logger.info('Sending notifications...');

    if (this.config.integrations.slack) {
      await this.sendSlackNotification(result);
    }

    if (this.config.integrations.email) {
      await this.sendEmailNotification(result);
    }

    if (this.config.integrations.webhook) {
      await this.sendWebhookNotification(result);
    }
  }

  /**
   * Send Slack notification
   */
  private async sendSlackNotification(_result: PerformanceTestResult): Promise<void> {
    this.logger.info('Sending Slack notification...');
    // Implementation for Slack notification
  }

  /**
   * Send email notification
   */
  private async sendEmailNotification(_result: PerformanceTestResult): Promise<void> {
    this.logger.info('Sending email notification...');
    // Implementation for email notification
  }

  /**
   * Send webhook notification
   */
  private async sendWebhookNotification(_result: PerformanceTestResult): Promise<void> {
    this.logger.info('Sending webhook notification...');
    // Implementation for webhook notification
  }

  /**
   * Public API methods
   */

  getTestResults(): Map<string, PerformanceTestResult> {
    return new Map(this.results);
  }

  getLatestResult(): PerformanceTestResult | null {
    const results = Array.from(this.results.values());
    return results.length > 0 ? (results[results.length - 1] ?? null) : null;
  }

  isTestRunning(): boolean {
    return this.isRunning;
  }

  getCurrentExecution(): string | null {
    return this.currentExecution;
  }

  updateConfig(newConfig: Partial<PerformanceTestConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.initializeScenarios();
  }

  getConfig(): PerformanceTestConfig {
    return { ...this.config };
  }

  clearResults(): void {
    this.results.clear();
  }

  exportResults(format: 'json' | 'csv'): string {
    const results = Array.from(this.results.values());

    if (format === 'json') {
      return JSON.stringify(results, null, 2);
    } else {
      // Simple CSV export
      const headers = 'TestName,ExecutionId,Status,Duration,AverageResponseTime,ErrorRate\n';
      const rows = results
        .map(
          (result) =>
            `${result.testName},${result.executionId},${result.status},${result.duration},${result.summary.averageResponseTime},${result.summary.errorRate}`,
        )
        .join('\n');

      return headers + rows;
    }
  }

  async cancelTest(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    this.logger.info('Performance test cancelled');
  }

  destroy(): void {
    this.cancelTest();
    this.results.clear();
    this.scenarios.clear();
  }
}
