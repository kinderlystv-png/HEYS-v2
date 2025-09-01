/**
 * HEYS Performance Regression Testing & CI/CD Integration v1.0
 * Automated Performance Regression Detection and Continuous Integration
 *
 * Features:
 * - Performance regression detection
 * - Historical performance comparison
 * - CI/CD pipeline integration
 * - Performance budget enforcement
 * - Automated performance gates
 * - Performance trend analysis
 * - Baseline management
 * - Performance alerts and notifications
 */

export interface PerformanceBaseline {
  id: string;
  name: string;
  version: string;
  timestamp: number;
  environment: string;
  metrics: BaselineMetrics;
  metadata: {
    branch: string;
    commit: string;
    buildNumber: string;
    tags: string[];
  };
  tests: BaselineTest[];
}

export interface BaselineMetrics {
  loadTime: number;
  firstContentfulPaint: number;
  largestContentfulPaint: number;
  cumulativeLayoutShift: number;
  firstInputDelay: number;
  totalBlockingTime: number;
  timeToInteractive: number;
  bundleSize: number;
  memoryUsage: number;
  cpuUsage: number;
  networkRequests: number;
  cacheHitRatio: number;
}

export interface BaselineTest {
  testName: string;
  testType: 'load' | 'stress' | 'functional' | 'e2e' | 'unit';
  duration: number;
  success: boolean;
  metrics: TestMetrics;
  environment: TestEnvironment;
}

export interface TestMetrics {
  responseTime: MetricValue;
  throughput: MetricValue;
  errorRate: MetricValue;
  cpuUsage: MetricValue;
  memoryUsage: MetricValue;
  networkLatency: MetricValue;
  customMetrics: Record<string, MetricValue>;
}

export interface MetricValue {
  value: number;
  unit: string;
  percentiles?: {
    p50: number;
    p90: number;
    p95: number;
    p99: number;
  };
  trend?: 'stable' | 'improving' | 'degrading';
}

export interface TestEnvironment {
  name: string;
  version: string;
  platform: string;
  browser?: string;
  userAgent?: string;
  networkConditions?: {
    type: string;
    downlink: number;
    uplink: number;
    latency: number;
  };
}

export interface RegressionResult {
  id: string;
  testId: string;
  baseline: PerformanceBaseline;
  current: PerformanceBaseline;
  comparison: ComparisonResult;
  regressions: Regression[];
  improvements: Improvement[];
  status: 'pass' | 'fail' | 'warning';
  createdAt: number;
}

export interface ComparisonResult {
  summary: {
    totalMetrics: number;
    regressionCount: number;
    improvementCount: number;
    stableCount: number;
    overallChange: number;
  };
  detailedComparison: MetricComparison[];
}

export interface MetricComparison {
  metric: string;
  baseline: number;
  current: number;
  change: number;
  changePercent: number;
  status: 'regression' | 'improvement' | 'stable';
  severity: 'low' | 'medium' | 'high' | 'critical';
  threshold: number;
  message: string;
}

export interface Regression {
  metric: string;
  baselineValue: number;
  currentValue: number;
  change: number;
  changePercent: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  threshold: number;
  impact: string;
  recommendations: string[];
}

export interface Improvement {
  metric: string;
  baselineValue: number;
  currentValue: number;
  change: number;
  changePercent: number;
  impact: string;
}

export interface PerformanceBudget {
  metric: string;
  limit: number;
  operator: 'lt' | 'lte' | 'gt' | 'gte';
  severity: 'warning' | 'error';
  description: string;
  category: 'timing' | 'size' | 'resource' | 'custom';
}

export interface BudgetResult {
  metric: string;
  limit: number;
  actual: number;
  passed: boolean;
  severity: string;
  message: string;
  recommendation?: string;
}

export interface CicdConfiguration {
  enabled: boolean;
  pipeline: {
    provider: 'github-actions' | 'gitlab-ci' | 'jenkins' | 'azure-devops' | 'circleci';
    triggerOn: ('push' | 'pull-request' | 'release' | 'schedule')[];
    environments: string[];
    parallelExecution: boolean;
  };
  gates: {
    performanceBudgets: PerformanceBudget[];
    regressionThresholds: {
      maxRegressionPercent: number;
      maxCriticalRegressions: number;
      failOnAnyRegression: boolean;
    };
    requiredTests: string[];
    timeoutMinutes: number;
  };
  notifications: {
    channels: ('email' | 'slack' | 'teams' | 'webhook')[];
    recipients: string[];
    onSuccess: boolean;
    onFailure: boolean;
    onRegression: boolean;
  };
  reporting: {
    formats: ('html' | 'json' | 'junit' | 'markdown')[];
    outputPath: string;
    publishArtifacts: boolean;
    retentionDays: number;
  };
}

export interface TrendAnalysis {
  metric: string;
  period: {
    start: number;
    end: number;
    dataPoints: number;
  };
  trend: {
    direction: 'up' | 'down' | 'stable' | 'volatile';
    slope: number;
    confidence: number;
    seasonality: boolean;
  };
  statistics: {
    mean: number;
    median: number;
    standardDeviation: number;
    min: number;
    max: number;
    variance: number;
  };
  forecasting: {
    predicted: number[];
    confidence_interval: { lower: number; upper: number }[];
    model: string;
    accuracy: number;
  };
}

/**
 * Performance Regression Testing Engine
 */
export class PerformanceRegressionTester {
  private baselines: Map<string, PerformanceBaseline> = new Map();
  private regressionResults: Map<string, RegressionResult> = new Map();
  private performanceBudgets: PerformanceBudget[] = [];
  private cicdConfig: CicdConfiguration | null = null;
  private trendData: Map<string, TrendAnalysis> = new Map();

  constructor() {
    this.initializeDefaultBudgets();
  }

  /**
   * Initialize default performance budgets
   */
  private initializeDefaultBudgets(): void {
    this.performanceBudgets = [
      {
        metric: 'loadTime',
        limit: 3000,
        operator: 'lte',
        severity: 'error',
        description: 'Page load time should be under 3 seconds',
        category: 'timing',
      },
      {
        metric: 'firstContentfulPaint',
        limit: 1500,
        operator: 'lte',
        severity: 'warning',
        description: 'First Contentful Paint should be under 1.5 seconds',
        category: 'timing',
      },
      {
        metric: 'largestContentfulPaint',
        limit: 2500,
        operator: 'lte',
        severity: 'error',
        description: 'Largest Contentful Paint should be under 2.5 seconds',
        category: 'timing',
      },
      {
        metric: 'cumulativeLayoutShift',
        limit: 0.1,
        operator: 'lte',
        severity: 'warning',
        description: 'Cumulative Layout Shift should be under 0.1',
        category: 'timing',
      },
      {
        metric: 'firstInputDelay',
        limit: 100,
        operator: 'lte',
        severity: 'error',
        description: 'First Input Delay should be under 100ms',
        category: 'timing',
      },
      {
        metric: 'bundleSize',
        limit: 1048576, // 1MB
        operator: 'lte',
        severity: 'warning',
        description: 'Bundle size should be under 1MB',
        category: 'size',
      },
      {
        metric: 'memoryUsage',
        limit: 104857600, // 100MB
        operator: 'lte',
        severity: 'error',
        description: 'Memory usage should be under 100MB',
        category: 'resource',
      },
    ];
  }

  /**
   * Create performance baseline
   */
  async createBaseline(
    name: string,
    version: string,
    environment: string,
    metrics: BaselineMetrics,
    tests: BaselineTest[],
    metadata: PerformanceBaseline['metadata'],
  ): Promise<PerformanceBaseline> {
    const baseline: PerformanceBaseline = {
      id: `baseline-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name,
      version,
      timestamp: Date.now(),
      environment,
      metrics,
      metadata,
      tests,
    };

    this.baselines.set(baseline.id, baseline);

    console.log(`Created performance baseline: ${name} v${version} (${environment})`);
    return baseline;
  }

  /**
   * Compare current performance against baseline
   */
  async compareAgainstBaseline(
    baselineId: string,
    currentMetrics: BaselineMetrics,
    currentTests: BaselineTest[],
  ): Promise<RegressionResult> {
    const baseline = this.baselines.get(baselineId);
    if (!baseline) {
      throw new Error(`Baseline not found: ${baselineId}`);
    }

    const current: PerformanceBaseline = {
      id: `current-${Date.now()}`,
      name: baseline.name,
      version: 'current',
      timestamp: Date.now(),
      environment: baseline.environment,
      metrics: currentMetrics,
      metadata: {
        branch: 'current',
        commit: 'current',
        buildNumber: 'current',
        tags: ['current'],
      },
      tests: currentTests,
    };

    const comparison = this.performDetailedComparison(baseline, current);
    const regressions = this.identifyRegressions(comparison);
    const improvements = this.identifyImprovements(comparison);
    const status = this.determineStatus(regressions);

    const result: RegressionResult = {
      id: `regression-${Date.now()}`,
      testId: baselineId,
      baseline,
      current,
      comparison,
      regressions,
      improvements,
      status,
      createdAt: Date.now(),
    };

    this.regressionResults.set(result.id, result);

    console.log(`Regression analysis completed: ${status}`);
    return result;
  }

  /**
   * Perform detailed comparison between baselines
   */
  private performDetailedComparison(
    baseline: PerformanceBaseline,
    current: PerformanceBaseline,
  ): ComparisonResult {
    const comparisons: MetricComparison[] = [];
    const metricNames = Object.keys(baseline.metrics) as (keyof BaselineMetrics)[];

    for (const metricName of metricNames) {
      const baselineValue = baseline.metrics[metricName];
      const currentValue = current.metrics[metricName];
      const change = currentValue - baselineValue;
      const changePercent = baselineValue !== 0 ? (change / baselineValue) * 100 : 0;

      const threshold = this.getThresholdForMetric(metricName);
      const status = this.getComparisonStatus(changePercent, threshold);
      const severity = this.getSeverity(Math.abs(changePercent));

      comparisons.push({
        metric: metricName,
        baseline: baselineValue,
        current: currentValue,
        change,
        changePercent,
        status,
        severity,
        threshold,
        message: this.generateComparisonMessage(metricName, changePercent, status),
      });
    }

    const regressionCount = comparisons.filter((c) => c.status === 'regression').length;
    const improvementCount = comparisons.filter((c) => c.status === 'improvement').length;
    const stableCount = comparisons.filter((c) => c.status === 'stable').length;
    const overallChange =
      comparisons.reduce((sum, c) => sum + Math.abs(c.changePercent), 0) / comparisons.length;

    return {
      summary: {
        totalMetrics: comparisons.length,
        regressionCount,
        improvementCount,
        stableCount,
        overallChange,
      },
      detailedComparison: comparisons,
    };
  }

  /**
   * Get threshold for metric
   */
  private getThresholdForMetric(metric: string): number {
    // Define acceptable change thresholds for different metrics
    const thresholds: Record<string, number> = {
      loadTime: 10, // 10% increase is concerning
      firstContentfulPaint: 15,
      largestContentfulPaint: 10,
      cumulativeLayoutShift: 20,
      firstInputDelay: 15,
      totalBlockingTime: 10,
      timeToInteractive: 10,
      bundleSize: 5, // Bundle size increases should be minimal
      memoryUsage: 20,
      cpuUsage: 25,
      networkRequests: 15,
      cacheHitRatio: -5, // Cache hit ratio decrease is concerning
    };

    return thresholds[metric] || 15; // Default 15% threshold
  }

  /**
   * Get comparison status
   */
  private getComparisonStatus(
    changePercent: number,
    threshold: number,
  ): 'regression' | 'improvement' | 'stable' {
    if (Math.abs(changePercent) < 2) {
      // Less than 2% change is considered stable
      return 'stable';
    }

    if (changePercent > threshold) {
      return 'regression';
    }

    if (changePercent < -threshold) {
      return 'improvement';
    }

    return 'stable';
  }

  /**
   * Get severity level
   */
  private getSeverity(changePercent: number): 'low' | 'medium' | 'high' | 'critical' {
    if (changePercent < 5) return 'low';
    if (changePercent < 15) return 'medium';
    if (changePercent < 30) return 'high';
    return 'critical';
  }

  /**
   * Generate comparison message
   */
  private generateComparisonMessage(metric: string, changePercent: number, status: string): string {
    const direction = changePercent > 0 ? 'increased' : 'decreased';
    const absChange = Math.abs(changePercent).toFixed(2);

    switch (status) {
      case 'regression':
        return `${metric} ${direction} by ${absChange}% - Performance regression detected`;
      case 'improvement':
        return `${metric} ${direction} by ${absChange}% - Performance improvement detected`;
      default:
        return `${metric} ${direction} by ${absChange}% - Within acceptable range`;
    }
  }

  /**
   * Identify regressions from comparison
   */
  private identifyRegressions(comparison: ComparisonResult): Regression[] {
    return comparison.detailedComparison
      .filter((c) => c.status === 'regression')
      .map((c) => ({
        metric: c.metric,
        baselineValue: c.baseline,
        currentValue: c.current,
        change: c.change,
        changePercent: c.changePercent,
        severity: c.severity,
        threshold: c.threshold,
        impact: this.getImpactDescription(c.metric, c.severity),
        recommendations: this.getRecommendations(c.metric, c.severity),
      }));
  }

  /**
   * Identify improvements from comparison
   */
  private identifyImprovements(comparison: ComparisonResult): Improvement[] {
    return comparison.detailedComparison
      .filter((c) => c.status === 'improvement')
      .map((c) => ({
        metric: c.metric,
        baselineValue: c.baseline,
        currentValue: c.current,
        change: c.change,
        changePercent: c.changePercent,
        impact: this.getImpactDescription(c.metric, 'low'),
      }));
  }

  /**
   * Get impact description
   */
  private getImpactDescription(metric: string, severity: string): string {
    const impacts: Record<string, Record<string, string>> = {
      loadTime: {
        low: 'Minor impact on user experience',
        medium: 'Noticeable impact on page load speed',
        high: 'Significant delay in page loading',
        critical: 'Severe performance degradation affecting usability',
      },
      bundleSize: {
        low: 'Slight increase in download time',
        medium: 'Moderate impact on initial load performance',
        high: 'Significant increase in bundle size affecting mobile users',
        critical: 'Critical bundle size increase causing performance issues',
      },
      memoryUsage: {
        low: 'Minor increase in memory consumption',
        medium: 'Moderate memory usage increase',
        high: 'High memory usage may affect device performance',
        critical: 'Critical memory usage causing stability issues',
      },
    };

    return impacts[metric]?.[severity] || `${severity} impact on ${metric}`;
  }

  /**
   * Get recommendations
   */
  private getRecommendations(metric: string, _severity: string): string[] {
    const recommendations: Record<string, string[]> = {
      loadTime: [
        'Optimize critical rendering path',
        'Implement code splitting',
        'Optimize images and assets',
        'Use browser caching effectively',
      ],
      bundleSize: [
        'Implement tree shaking',
        'Use dynamic imports for code splitting',
        'Remove unused dependencies',
        'Optimize build configuration',
      ],
      memoryUsage: [
        'Identify memory leaks',
        'Optimize data structures',
        'Implement proper cleanup',
        'Use memory profiling tools',
      ],
      firstContentfulPaint: [
        'Optimize above-the-fold content',
        'Reduce render-blocking resources',
        'Implement resource prioritization',
      ],
    };

    return recommendations[metric] || ['Review performance optimization techniques'];
  }

  /**
   * Determine overall status
   */
  private determineStatus(regressions: Regression[]): 'pass' | 'fail' | 'warning' {
    const criticalRegressions = regressions.filter((r) => r.severity === 'critical');
    const highRegressions = regressions.filter((r) => r.severity === 'high');

    if (criticalRegressions.length > 0) return 'fail';
    if (highRegressions.length > 0) return 'warning';
    if (regressions.length > 0) return 'warning';
    return 'pass';
  }

  /**
   * Evaluate performance budgets
   */
  async evaluateBudgets(metrics: BaselineMetrics): Promise<BudgetResult[]> {
    const results: BudgetResult[] = [];

    for (const budget of this.performanceBudgets) {
      const actualValue = this.getMetricValue(metrics, budget.metric);
      const passed = this.evaluateBudgetCondition(actualValue, budget.operator, budget.limit);

      const result: BudgetResult = {
        metric: budget.metric,
        limit: budget.limit,
        actual: actualValue,
        passed,
        severity: budget.severity,
        message: passed
          ? `Budget met: ${budget.metric} = ${actualValue} ${budget.operator} ${budget.limit}`
          : `Budget exceeded: ${budget.metric} = ${actualValue} (limit: ${budget.limit})`,
      };

      if (!passed) {
        result.recommendation = this.getBudgetRecommendation(budget.metric);
      }

      results.push(result);
    }

    return results;
  }

  /**
   * Get metric value from baseline metrics
   */
  private getMetricValue(metrics: BaselineMetrics, metricName: string): number {
    return (metrics as any)[metricName] || 0;
  }

  /**
   * Evaluate budget condition
   */
  private evaluateBudgetCondition(value: number, operator: string, limit: number): boolean {
    switch (operator) {
      case 'lt':
        return value < limit;
      case 'lte':
        return value <= limit;
      case 'gt':
        return value > limit;
      case 'gte':
        return value >= limit;
      default:
        return false;
    }
  }

  /**
   * Get budget recommendation
   */
  private getBudgetRecommendation(metric: string): string {
    const recommendations: Record<string, string> = {
      loadTime: 'Optimize critical resources and implement lazy loading',
      bundleSize: 'Implement code splitting and remove unused dependencies',
      memoryUsage: 'Optimize memory usage and fix potential leaks',
      firstContentfulPaint: 'Optimize above-the-fold content delivery',
      largestContentfulPaint: 'Optimize largest content elements',
    };

    return recommendations[metric] || 'Review performance optimization strategies';
  }

  /**
   * Analyze performance trends
   */
  async analyzeTrends(metric: string, dataPoints: number[]): Promise<TrendAnalysis> {
    const period = {
      start: Date.now() - dataPoints.length * 24 * 60 * 60 * 1000, // Assuming daily data points
      end: Date.now(),
      dataPoints: dataPoints.length,
    };

    const trend = this.calculateTrend(dataPoints);
    const statistics = this.calculateStatistics(dataPoints);
    const forecasting = this.generateForecast(dataPoints);

    const analysis: TrendAnalysis = {
      metric,
      period,
      trend,
      statistics,
      forecasting,
    };

    this.trendData.set(metric, analysis);
    return analysis;
  }

  /**
   * Calculate trend direction and characteristics
   */
  private calculateTrend(dataPoints: number[]): TrendAnalysis['trend'] {
    if (dataPoints.length < 2) {
      return {
        direction: 'stable',
        slope: 0,
        confidence: 0,
        seasonality: false,
      };
    }

    // Simple linear regression to calculate slope
    const n = dataPoints.length;
    const x = dataPoints.map((_, i) => i);
    const y = dataPoints;

    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * (y[i] ?? 0), 0);
    const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);

    // Calculate R-squared for confidence
    const yMean = sumY / n;
    const ssRes = y.reduce((sum, yi, i) => {
      const predicted = slope * (x[i] ?? 0) + (sumY - slope * sumX) / n;
      return sum + Math.pow(yi - predicted, 2);
    }, 0);
    const ssTot = y.reduce((sum, yi) => sum + Math.pow(yi - yMean, 2), 0);
    const rSquared = 1 - ssRes / ssTot;

    // Determine direction
    let direction: 'up' | 'down' | 'stable' | 'volatile';
    const absSlope = Math.abs(slope);
    const volatility = this.calculateVolatility(dataPoints);

    if (volatility > 0.3) {
      direction = 'volatile';
    } else if (absSlope < 0.01) {
      direction = 'stable';
    } else if (slope > 0) {
      direction = 'up';
    } else {
      direction = 'down';
    }

    // Simple seasonality detection (very basic)
    const seasonality = this.detectSeasonality(dataPoints);

    return {
      direction,
      slope,
      confidence: rSquared,
      seasonality,
    };
  }

  /**
   * Calculate volatility
   */
  private calculateVolatility(dataPoints: number[]): number {
    if (dataPoints.length < 2) return 0;

    const mean = dataPoints.reduce((a, b) => a + b, 0) / dataPoints.length;
    const variance =
      dataPoints.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / dataPoints.length;
    const stdDev = Math.sqrt(variance);

    return stdDev / mean; // Coefficient of variation
  }

  /**
   * Detect seasonality (basic implementation)
   */
  private detectSeasonality(dataPoints: number[]): boolean {
    // Very simple seasonality detection
    // In a real implementation, this would use more sophisticated algorithms
    if (dataPoints.length < 7) return false;

    const weeklyPattern = dataPoints.length >= 14;
    return weeklyPattern && this.calculateVolatility(dataPoints) > 0.1;
  }

  /**
   * Calculate statistics
   */
  private calculateStatistics(dataPoints: number[]): TrendAnalysis['statistics'] {
    const sorted = [...dataPoints].sort((a, b) => a - b);
    const mean = dataPoints.reduce((a, b) => a + b, 0) / dataPoints.length;
    const median =
      sorted.length % 2 === 0
        ? ((sorted[sorted.length / 2 - 1] ?? 0) + (sorted[sorted.length / 2] ?? 0)) / 2
        : (sorted[Math.floor(sorted.length / 2)] ?? 0);

    const variance =
      dataPoints.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / dataPoints.length;
    const standardDeviation = Math.sqrt(variance);

    return {
      mean,
      median,
      standardDeviation,
      min: sorted[0] || 0,
      max: sorted[sorted.length - 1] || 0,
      variance,
    };
  }

  /**
   * Generate forecast
   */
  private generateForecast(dataPoints: number[]): TrendAnalysis['forecasting'] {
    // Simple linear extrapolation for forecasting
    const forecastPeriods = 5;
    const trend = this.calculateTrend(dataPoints);
    const lastValue = dataPoints[dataPoints.length - 1] || 0;

    const predicted: number[] = [];
    const confidence_interval: { lower: number; upper: number }[] = [];

    for (let i = 1; i <= forecastPeriods; i++) {
      const forecast = lastValue + trend.slope * i;
      const errorMargin = Math.abs(forecast * 0.1); // 10% error margin

      predicted.push(forecast);
      confidence_interval.push({
        lower: forecast - errorMargin,
        upper: forecast + errorMargin,
      });
    }

    return {
      predicted,
      confidence_interval,
      model: 'linear_regression',
      accuracy: trend.confidence,
    };
  }

  /**
   * Configure CI/CD integration
   */
  configureCicd(config: CicdConfiguration): void {
    this.cicdConfig = config;
    console.log(`CI/CD integration configured for ${config.pipeline.provider}`);
  }

  /**
   * Execute CI/CD performance gate
   */
  async executeCicdGate(
    baselineId: string,
    currentMetrics: BaselineMetrics,
    currentTests: BaselineTest[],
  ): Promise<{
    passed: boolean;
    results: {
      budgetResults: BudgetResult[];
      regressionResult: RegressionResult;
      summary: string;
    };
  }> {
    if (!this.cicdConfig?.enabled) {
      throw new Error('CI/CD integration is not configured');
    }

    console.log('Executing CI/CD performance gate...');

    // Evaluate performance budgets
    const budgetResults = await this.evaluateBudgets(currentMetrics);

    // Compare against baseline
    const regressionResult = await this.compareAgainstBaseline(
      baselineId,
      currentMetrics,
      currentTests,
    );

    // Determine if gate should pass
    const budgetFailures = budgetResults.filter((r) => !r.passed && r.severity === 'error');
    const criticalRegressions = regressionResult.regressions.filter(
      (r) => r.severity === 'critical',
    );
    const totalRegressions = regressionResult.regressions.length;

    const { gates } = this.cicdConfig;
    const passed =
      budgetFailures.length === 0 &&
      criticalRegressions.length <= gates.regressionThresholds.maxCriticalRegressions &&
      (totalRegressions === 0 || !gates.regressionThresholds.failOnAnyRegression) &&
      regressionResult.comparison.summary.overallChange <=
        gates.regressionThresholds.maxRegressionPercent;

    const summary = this.generateCicdSummary(passed, budgetResults, regressionResult);

    // Send notifications if configured
    if (this.cicdConfig.notifications.channels.length > 0) {
      await this.sendCicdNotifications(passed, summary);
    }

    return {
      passed,
      results: {
        budgetResults,
        regressionResult,
        summary,
      },
    };
  }

  /**
   * Generate CI/CD summary
   */
  private generateCicdSummary(
    passed: boolean,
    budgetResults: BudgetResult[],
    regressionResult: RegressionResult,
  ): string {
    const status = passed ? '✅ PASSED' : '❌ FAILED';
    const budgetStatus = budgetResults.filter((r) => !r.passed).length;
    const regressionCount = regressionResult.regressions.length;
    const improvementCount = regressionResult.improvements.length;

    return `
Performance Gate ${status}

📊 Budget Results:
- ${budgetResults.length - budgetStatus}/${budgetResults.length} budgets passed
${budgetStatus > 0 ? `- ${budgetStatus} budget violations detected` : ''}

🔍 Regression Analysis:
- ${regressionCount} regressions detected
- ${improvementCount} improvements detected
- Overall change: ${regressionResult.comparison.summary.overallChange.toFixed(2)}%

${
  regressionResult.regressions.length > 0
    ? `
⚠️ Regressions:
${regressionResult.regressions.map((r) => `- ${r.metric}: +${r.changePercent.toFixed(2)}% (${r.severity})`).join('\n')}
`
    : ''
}

${
  regressionResult.improvements.length > 0
    ? `
🚀 Improvements:
${regressionResult.improvements.map((i) => `- ${i.metric}: ${i.changePercent.toFixed(2)}%`).join('\n')}
`
    : ''
}
    `.trim();
  }

  /**
   * Send CI/CD notifications
   */
  private async sendCicdNotifications(passed: boolean, summary: string): Promise<void> {
    if (!this.cicdConfig) return;

    const { notifications } = this.cicdConfig;
    const shouldNotify =
      (passed && notifications.onSuccess) ||
      (!passed && notifications.onFailure) ||
      (!passed && notifications.onRegression);

    if (!shouldNotify) return;

    console.log('Sending CI/CD notifications...');

    for (const channel of notifications.channels) {
      switch (channel) {
        case 'email':
          await this.sendEmailNotification(summary, passed);
          break;
        case 'slack':
          await this.sendSlackNotification(summary, passed);
          break;
        case 'teams':
          await this.sendTeamsNotification(summary, passed);
          break;
        case 'webhook':
          await this.sendWebhookNotification(summary, passed);
          break;
      }
    }
  }

  /**
   * Send email notification
   */
  private async sendEmailNotification(_summary: string, _passed: boolean): Promise<void> {
    console.log('Sending email notification...');
    // Implementation would depend on email service
  }

  /**
   * Send Slack notification
   */
  private async sendSlackNotification(_summary: string, _passed: boolean): Promise<void> {
    console.log('Sending Slack notification...');
    // Implementation would depend on Slack webhook configuration
  }

  /**
   * Send Teams notification
   */
  private async sendTeamsNotification(_summary: string, _passed: boolean): Promise<void> {
    console.log('Sending Teams notification...');
    // Implementation would depend on Teams webhook configuration
  }

  /**
   * Send webhook notification
   */
  private async sendWebhookNotification(_summary: string, _passed: boolean): Promise<void> {
    console.log('Sending webhook notification...');
    // Implementation would depend on webhook configuration
  }

  /**
   * Public API methods
   */

  getBaselines(): PerformanceBaseline[] {
    return Array.from(this.baselines.values());
  }

  getBaseline(id: string): PerformanceBaseline | null {
    return this.baselines.get(id) || null;
  }

  getRegressionResults(): RegressionResult[] {
    return Array.from(this.regressionResults.values());
  }

  getRegressionResult(id: string): RegressionResult | null {
    return this.regressionResults.get(id) || null;
  }

  getPerformanceBudgets(): PerformanceBudget[] {
    return [...this.performanceBudgets];
  }

  updatePerformanceBudgets(budgets: PerformanceBudget[]): void {
    this.performanceBudgets = budgets;
  }

  getTrendAnalysis(metric: string): TrendAnalysis | null {
    return this.trendData.get(metric) || null;
  }

  getAllTrendAnalyses(): TrendAnalysis[] {
    return Array.from(this.trendData.values());
  }

  exportResults(format: 'json' | 'csv' | 'html'): string {
    const results = this.getRegressionResults();

    switch (format) {
      case 'json':
        return JSON.stringify(results, null, 2);
      case 'csv':
        return this.exportToCsv(results);
      case 'html':
        return this.exportToHtml(results);
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  /**
   * Export to CSV
   */
  private exportToCsv(results: RegressionResult[]): string {
    const headers = 'TestId,Status,RegressionCount,ImprovementCount,OverallChange,Timestamp\n';
    const rows = results
      .map(
        (result) =>
          `${result.testId},${result.status},${result.regressions.length},${result.improvements.length},${result.comparison.summary.overallChange},${result.createdAt}`,
      )
      .join('\n');

    return headers + rows;
  }

  /**
   * Export to HTML
   */
  private exportToHtml(results: RegressionResult[]): string {
    const tableRows = results
      .map(
        (result) => `
      <tr>
        <td>${result.testId}</td>
        <td><span class="status ${result.status}">${result.status.toUpperCase()}</span></td>
        <td>${result.regressions.length}</td>
        <td>${result.improvements.length}</td>
        <td>${result.comparison.summary.overallChange.toFixed(2)}%</td>
        <td>${new Date(result.createdAt).toLocaleString()}</td>
      </tr>
    `,
      )
      .join('');

    return `
<!DOCTYPE html>
<html>
<head>
  <title>Performance Regression Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f2f2f2; }
    .status.pass { color: green; font-weight: bold; }
    .status.fail { color: red; font-weight: bold; }
    .status.warning { color: orange; font-weight: bold; }
  </style>
</head>
<body>
  <h1>Performance Regression Report</h1>
  <table>
    <thead>
      <tr>
        <th>Test ID</th>
        <th>Status</th>
        <th>Regressions</th>
        <th>Improvements</th>
        <th>Overall Change</th>
        <th>Timestamp</th>
      </tr>
    </thead>
    <tbody>
      ${tableRows}
    </tbody>
  </table>
</body>
</html>
    `.trim();
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.baselines.clear();
    this.regressionResults.clear();
    this.trendData.clear();
  }

  /**
   * Get CI/CD configuration
   */
  getCicdConfiguration(): CicdConfiguration | null {
    return this.cicdConfig;
  }
}
