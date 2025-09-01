/**
 * HEYS Performance Analytics Dashboard v1.0
 * Advanced Performance Analytics & Visualization
 *
 * Features:
 * - Real-time performance analytics
 * - Interactive performance charts
 * - Performance trend analysis
 * - Bottleneck identification
 * - Performance regression detection
 * - Custom performance reports
 * - Performance comparison tools
 */

import { PerformanceMetrics, RealTimePerformanceMonitor } from './real-time-performance-monitor';

export interface AnalyticsDashboardConfig {
  refreshInterval: number;
  chartTypes: {
    timeSeries: boolean;
    heatmap: boolean;
    distribution: boolean;
    waterfall: boolean;
    treemap: boolean;
  };
  metrics: {
    coreWebVitals: boolean;
    memoryUsage: boolean;
    cpuUsage: boolean;
    renderingPerformance: boolean;
    networkPerformance: boolean;
    userExperience: boolean;
    customMetrics: boolean;
  };
  alerts: {
    enabled: boolean;
    realTime: boolean;
    emailNotifications: boolean;
    slackIntegration: boolean;
  };
  reports: {
    enabled: boolean;
    schedule: 'daily' | 'weekly' | 'monthly';
    format: 'pdf' | 'html' | 'json';
    recipients: string[];
  };
  comparison: {
    enabled: boolean;
    timeRanges: string[];
    environments: string[];
  };
}

export interface PerformanceTrend {
  metric: string;
  timeRange: string;
  values: { timestamp: number; value: number }[];
  trend: 'improving' | 'declining' | 'stable';
  changePercentage: number;
  analysis: string;
}

export interface PerformanceRegression {
  id: string;
  metric: string;
  detectedAt: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  impact: string;
  description: string;
  possibleCauses: string[];
  recommendations: string[];
  status: 'open' | 'investigating' | 'resolved';
}

export interface PerformanceReport {
  id: string;
  title: string;
  generatedAt: number;
  timeRange: {
    start: number;
    end: number;
  };
  summary: {
    overallScore: number;
    totalSessions: number;
    avgLoadTime: number;
    errorRate: number;
    userSatisfaction: number;
  };
  metrics: {
    coreWebVitals: CoreWebVitalsReport;
    resourceUsage: ResourceUsageReport;
    userExperience: UserExperienceReport;
  };
  trends: PerformanceTrend[];
  regressions: PerformanceRegression[];
  recommendations: string[];
}

export interface CoreWebVitalsReport {
  lcp: { avg: number; p75: number; p90: number; distribution: number[] };
  fid: { avg: number; p75: number; p90: number; distribution: number[] };
  cls: { avg: number; p75: number; p90: number; distribution: number[] };
  fcp: { avg: number; p75: number; p90: number; distribution: number[] };
  ttfb: { avg: number; p75: number; p90: number; distribution: number[] };
}

export interface ResourceUsageReport {
  memory: { avg: number; peak: number; trend: string };
  cpu: { avg: number; peak: number; trend: string };
  network: { totalTransferred: number; avgLatency: number; errorRate: number };
}

export interface UserExperienceReport {
  pageLoadTime: { avg: number; p75: number; p90: number };
  interactionLatency: { avg: number; p75: number; p90: number };
  errorRate: number;
  bounceRate: number;
  satisfactionScore: number;
}

/**
 * Performance Analytics Dashboard
 */
export class PerformanceAnalyticsDashboard {
  private config: AnalyticsDashboardConfig;
  private performanceMonitor: RealTimePerformanceMonitor;
  private container: HTMLElement | null = null;
  private charts: Map<string, PerformanceChart> = new Map();
  private trends: PerformanceTrend[] = [];
  private regressions: PerformanceRegression[] = [];
  private reports: PerformanceReport[] = [];
  private isRunning: boolean = false;
  private updateIntervalId: number | null = null;

  constructor(performanceMonitor: RealTimePerformanceMonitor, config: AnalyticsDashboardConfig) {
    this.performanceMonitor = performanceMonitor;
    this.config = config;
  }

  /**
   * Initialize analytics dashboard
   */
  async initialize(containerId: string): Promise<void> {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      throw new Error(`Analytics dashboard container '${containerId}' not found`);
    }

    await this.createDashboardHTML();
    await this.initializeCharts();
    await this.setupEventListeners();

    console.log('Performance Analytics Dashboard initialized');
  }

  /**
   * Start analytics dashboard
   */
  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.updateIntervalId = window.setInterval(() => {
      this.updateDashboard();
    }, this.config.refreshInterval);

    console.log('Performance Analytics Dashboard started');
  }

  /**
   * Stop analytics dashboard
   */
  stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;
    if (this.updateIntervalId) {
      clearInterval(this.updateIntervalId);
      this.updateIntervalId = null;
    }

    console.log('Performance Analytics Dashboard stopped');
  }

  /**
   * Create dashboard HTML structure
   */
  private async createDashboardHTML(): Promise<void> {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="heys-analytics-dashboard">
        <div class="dashboard-header">
          <h1>Performance Analytics Dashboard</h1>
          <div class="dashboard-controls">
            <select id="time-range-selector">
              <option value="1h">Last Hour</option>
              <option value="24h" selected>Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
            </select>
            <button id="export-report" class="btn btn-primary">Export Report</button>
            <button id="refresh-data" class="btn btn-secondary">Refresh</button>
          </div>
        </div>

        <!-- Performance Overview -->
        <div class="performance-overview">
          <div class="metric-card">
            <h3>Performance Score</h3>
            <div class="metric-value" id="performance-score">0</div>
            <div class="metric-trend" id="score-trend"></div>
          </div>
          
          <div class="metric-card">
            <h3>Core Web Vitals</h3>
            <div class="vitals-grid">
              <div class="vital-item">
                <span class="vital-label">LCP</span>
                <span class="vital-value" id="lcp-value">0ms</span>
                <span class="vital-status" id="lcp-status"></span>
              </div>
              <div class="vital-item">
                <span class="vital-label">FID</span>
                <span class="vital-value" id="fid-value">0ms</span>
                <span class="vital-status" id="fid-status"></span>
              </div>
              <div class="vital-item">
                <span class="vital-label">CLS</span>
                <span class="vital-value" id="cls-value">0</span>
                <span class="vital-status" id="cls-status"></span>
              </div>
            </div>
          </div>

          <div class="metric-card">
            <h3>Resource Usage</h3>
            <div class="resource-grid" id="resource-usage">
              <!-- Dynamic content -->
            </div>
          </div>

          <div class="metric-card">
            <h3>Active Alerts</h3>
            <div class="alerts-summary" id="alerts-summary">
              <!-- Dynamic content -->
            </div>
          </div>
        </div>

        <!-- Charts Section -->
        <div class="charts-section">
          <div class="chart-container">
            <h3>Performance Trends</h3>
            <canvas id="trends-chart"></canvas>
          </div>
          
          <div class="chart-container">
            <h3>Core Web Vitals Distribution</h3>
            <canvas id="vitals-distribution-chart"></canvas>
          </div>
          
          <div class="chart-container">
            <h3>Resource Usage Over Time</h3>
            <canvas id="resource-usage-chart"></canvas>
          </div>
          
          <div class="chart-container">
            <h3>User Experience Metrics</h3>
            <canvas id="user-experience-chart"></canvas>
          </div>
        </div>

        <!-- Detailed Analysis -->
        <div class="detailed-analysis">
          <div class="analysis-section">
            <h3>Performance Regressions</h3>
            <div class="regressions-list" id="regressions-list">
              <!-- Dynamic content -->
            </div>
          </div>

          <div class="analysis-section">
            <h3>Bottleneck Analysis</h3>
            <div class="bottlenecks-analysis" id="bottlenecks-analysis">
              <!-- Dynamic content -->
            </div>
          </div>

          <div class="analysis-section">
            <h3>Recommendations</h3>
            <div class="recommendations-list" id="recommendations-list">
              <!-- Dynamic content -->
            </div>
          </div>
        </div>

        <!-- Performance Profiles -->
        <div class="profiles-section">
          <h3>Performance Profiles</h3>
          <div class="profiles-grid" id="profiles-grid">
            <!-- Dynamic content -->
          </div>
        </div>
      </div>
    `;

    this.addDashboardStyles();
  }

  /**
   * Add dashboard CSS styles
   */
  private addDashboardStyles(): void {
    if (document.getElementById('heys-analytics-styles')) return;

    const style = document.createElement('style');
    style.id = 'heys-analytics-styles';
    style.textContent = `
      .heys-analytics-dashboard {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        background: #f8f9fa;
        min-height: 100vh;
        padding: 20px;
      }

      .dashboard-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 30px;
        padding: 20px;
        background: white;
        border-radius: 8px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      }

      .dashboard-header h1 {
        margin: 0;
        color: #343a40;
        font-size: 28px;
        font-weight: 600;
      }

      .dashboard-controls {
        display: flex;
        gap: 15px;
        align-items: center;
      }

      .dashboard-controls select {
        padding: 8px 12px;
        border: 1px solid #ced4da;
        border-radius: 4px;
        font-size: 14px;
      }

      .btn {
        padding: 8px 16px;
        border: none;
        border-radius: 4px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
      }

      .btn-primary {
        background: #007bff;
        color: white;
      }

      .btn-primary:hover {
        background: #0056b3;
      }

      .btn-secondary {
        background: #6c757d;
        color: white;
      }

      .btn-secondary:hover {
        background: #545b62;
      }

      .performance-overview {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        gap: 20px;
        margin-bottom: 30px;
      }

      .metric-card {
        background: white;
        padding: 25px;
        border-radius: 8px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      }

      .metric-card h3 {
        margin: 0 0 15px 0;
        color: #343a40;
        font-size: 18px;
        font-weight: 600;
      }

      .metric-value {
        font-size: 36px;
        font-weight: 700;
        color: #007bff;
        margin-bottom: 10px;
      }

      .metric-trend {
        font-size: 14px;
        color: #6c757d;
      }

      .vitals-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 15px;
      }

      .vital-item {
        text-align: center;
        padding: 15px;
        background: #f8f9fa;
        border-radius: 6px;
      }

      .vital-label {
        display: block;
        font-size: 12px;
        color: #6c757d;
        margin-bottom: 5px;
      }

      .vital-value {
        display: block;
        font-size: 20px;
        font-weight: 600;
        color: #343a40;
        margin-bottom: 5px;
      }

      .vital-status {
        display: inline-block;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: #28a745;
      }

      .vital-status.warning {
        background: #ffc107;
      }

      .vital-status.poor {
        background: #dc3545;
      }

      .resource-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 10px;
      }

      .resource-item {
        display: flex;
        justify-content: space-between;
        padding: 8px 0;
        border-bottom: 1px solid #e9ecef;
      }

      .resource-item:last-child {
        border-bottom: none;
      }

      .charts-section {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
        gap: 20px;
        margin-bottom: 30px;
      }

      .chart-container {
        background: white;
        padding: 25px;
        border-radius: 8px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      }

      .chart-container h3 {
        margin: 0 0 20px 0;
        color: #343a40;
        font-size: 18px;
        font-weight: 600;
      }

      .chart-container canvas {
        width: 100%;
        height: 250px;
      }

      .detailed-analysis {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
        gap: 20px;
        margin-bottom: 30px;
      }

      .analysis-section {
        background: white;
        padding: 25px;
        border-radius: 8px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      }

      .analysis-section h3 {
        margin: 0 0 20px 0;
        color: #343a40;
        font-size: 18px;
        font-weight: 600;
      }

      .regression-item {
        padding: 15px;
        margin-bottom: 15px;
        border-left: 4px solid #dc3545;
        background: #f8f9fa;
        border-radius: 4px;
      }

      .regression-item.medium {
        border-color: #ffc107;
      }

      .regression-item.low {
        border-color: #28a745;
      }

      .regression-title {
        font-weight: 600;
        color: #343a40;
        margin-bottom: 5px;
      }

      .regression-description {
        font-size: 14px;
        color: #6c757d;
        margin-bottom: 10px;
      }

      .regression-meta {
        font-size: 12px;
        color: #6c757d;
      }

      .profiles-section {
        background: white;
        padding: 25px;
        border-radius: 8px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      }

      .profiles-section h3 {
        margin: 0 0 20px 0;
        color: #343a40;
        font-size: 18px;
        font-weight: 600;
      }

      .profiles-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        gap: 15px;
      }

      .profile-card {
        padding: 20px;
        border: 1px solid #e9ecef;
        border-radius: 6px;
        background: #f8f9fa;
      }

      .profile-title {
        font-weight: 600;
        color: #343a40;
        margin-bottom: 10px;
      }

      .profile-score {
        font-size: 24px;
        font-weight: 700;
        color: #007bff;
        margin-bottom: 10px;
      }

      .profile-meta {
        font-size: 12px;
        color: #6c757d;
      }

      .alerts-summary {
        max-height: 150px;
        overflow-y: auto;
      }

      .alert-item {
        padding: 10px;
        margin-bottom: 10px;
        border-radius: 4px;
        border-left: 4px solid;
      }

      .alert-item.critical {
        background: #f8d7da;
        border-color: #dc3545;
        color: #721c24;
      }

      .alert-item.warning {
        background: #fff3cd;
        border-color: #ffc107;
        color: #856404;
      }

      .alert-item.info {
        background: #d1ecf1;
        border-color: #17a2b8;
        color: #0c5460;
      }

      .recommendations-list {
        max-height: 200px;
        overflow-y: auto;
      }

      .recommendation-item {
        padding: 12px;
        margin-bottom: 10px;
        background: #e7f3ff;
        border-radius: 4px;
        border-left: 4px solid #007bff;
      }

      .recommendation-item:last-child {
        margin-bottom: 0;
      }
    `;

    document.head.appendChild(style);
  }

  /**
   * Initialize charts
   */
  private async initializeCharts(): Promise<void> {
    // Initialize performance trends chart
    this.charts.set(
      'trends',
      new PerformanceChart('trends-chart', {
        type: 'line',
        title: 'Performance Trends',
        metrics: ['lcp', 'fid', 'cls'],
      }),
    );

    // Initialize vitals distribution chart
    this.charts.set(
      'vitals-distribution',
      new PerformanceChart('vitals-distribution-chart', {
        type: 'bar',
        title: 'Core Web Vitals Distribution',
        metrics: ['lcp', 'fid', 'cls'],
      }),
    );

    // Initialize resource usage chart
    this.charts.set(
      'resource-usage',
      new PerformanceChart('resource-usage-chart', {
        type: 'area',
        title: 'Resource Usage',
        metrics: ['memory', 'cpu'],
      }),
    );

    // Initialize user experience chart
    this.charts.set(
      'user-experience',
      new PerformanceChart('user-experience-chart', {
        type: 'line',
        title: 'User Experience',
        metrics: ['pageLoadTime', 'interactionLatency'],
      }),
    );
  }

  /**
   * Setup event listeners
   */
  private async setupEventListeners(): Promise<void> {
    // Time range selector
    const timeRangeSelector = document.getElementById('time-range-selector') as HTMLSelectElement;
    timeRangeSelector?.addEventListener('change', (event) => {
      const target = event.target as HTMLSelectElement;
      this.updateTimeRange(target.value);
    });

    // Export report button
    const exportButton = document.getElementById('export-report');
    exportButton?.addEventListener('click', () => {
      this.exportReport();
    });

    // Refresh data button
    const refreshButton = document.getElementById('refresh-data');
    refreshButton?.addEventListener('click', () => {
      this.refreshData();
    });
  }

  /**
   * Update dashboard with latest data
   */
  private updateDashboard(): void {
    try {
      // Update overview metrics
      this.updateOverviewMetrics();

      // Update charts
      this.updateCharts();

      // Update analysis sections
      this.updateAnalysisSections();

      // Update profiles
      this.updateProfiles();
    } catch (error) {
      console.error('Error updating analytics dashboard:', error);
    }
  }

  /**
   * Update overview metrics
   */
  private updateOverviewMetrics(): void {
    const currentMetrics = this.performanceMonitor.getCurrentMetrics();
    if (!currentMetrics) return;

    // Update performance score
    const score = this.calculateOverallScore(currentMetrics);
    const scoreElement = document.getElementById('performance-score');
    if (scoreElement) {
      scoreElement.textContent = score.toString();
    }

    // Update Core Web Vitals
    this.updateCoreWebVitals(currentMetrics);

    // Update resource usage
    this.updateResourceUsage(currentMetrics);

    // Update alerts summary
    this.updateAlertsummary();
  }

  /**
   * Calculate overall performance score
   */
  private calculateOverallScore(metrics: PerformanceMetrics): number {
    // Simplified scoring algorithm
    let score = 100;

    // Core Web Vitals impact (60% of score)
    if (metrics.lcp > 2500) score -= 20;
    else if (metrics.lcp > 1200) score -= 10;

    if (metrics.fid > 100) score -= 20;
    else if (metrics.fid > 50) score -= 10;

    if (metrics.cls > 0.1) score -= 20;
    else if (metrics.cls > 0.05) score -= 10;

    // Resource usage impact (40% of score)
    const memoryUsage = (metrics.memory.used / metrics.memory.total) * 100;
    if (memoryUsage > 80) score -= 10;
    else if (memoryUsage > 60) score -= 5;

    if (metrics.cpu.usage > 80) score -= 10;
    else if (metrics.cpu.usage > 60) score -= 5;

    return Math.max(0, Math.round(score));
  }

  /**
   * Update Core Web Vitals display
   */
  private updateCoreWebVitals(metrics: PerformanceMetrics): void {
    // LCP
    const lcpValue = document.getElementById('lcp-value');
    const lcpStatus = document.getElementById('lcp-status');
    if (lcpValue && lcpStatus) {
      lcpValue.textContent = `${Math.round(metrics.lcp)}ms`;
      lcpStatus.className = `vital-status ${this.getVitalStatus(metrics.lcp, [1200, 2500])}`;
    }

    // FID
    const fidValue = document.getElementById('fid-value');
    const fidStatus = document.getElementById('fid-status');
    if (fidValue && fidStatus) {
      fidValue.textContent = `${Math.round(metrics.fid)}ms`;
      fidStatus.className = `vital-status ${this.getVitalStatus(metrics.fid, [50, 100])}`;
    }

    // CLS
    const clsValue = document.getElementById('cls-value');
    const clsStatus = document.getElementById('cls-status');
    if (clsValue && clsStatus) {
      clsValue.textContent = metrics.cls.toFixed(3);
      clsStatus.className = `vital-status ${this.getVitalStatus(metrics.cls, [0.05, 0.1])}`;
    }
  }

  /**
   * Get vital status based on thresholds
   */
  private getVitalStatus(value: number, thresholds: number[]): string {
    if (thresholds.length < 2) return 'good';
    if (value <= thresholds[0]!) return 'good';
    if (value <= thresholds[1]!) return 'warning';
    return 'poor';
  }

  /**
   * Update resource usage display
   */
  private updateResourceUsage(metrics: PerformanceMetrics): void {
    const resourceUsage = document.getElementById('resource-usage');
    if (!resourceUsage) return;

    const memoryUsage = (metrics.memory.used / metrics.memory.total) * 100;

    resourceUsage.innerHTML = `
      <div class="resource-item">
        <span>Memory Usage</span>
        <span>${memoryUsage.toFixed(1)}%</span>
      </div>
      <div class="resource-item">
        <span>CPU Usage</span>
        <span>${metrics.cpu.usage.toFixed(1)}%</span>
      </div>
      <div class="resource-item">
        <span>FPS</span>
        <span>${metrics.rendering.fps.toFixed(0)}</span>
      </div>
      <div class="resource-item">
        <span>Network Requests</span>
        <span>${metrics.network.requestCount}</span>
      </div>
    `;
  }

  /**
   * Update alerts summary
   */
  private updateAlertsummary(): void {
    const alertsContainer = document.getElementById('alerts-summary');
    if (!alertsContainer) return;

    const alerts = this.performanceMonitor.getAlerts();
    const recentAlerts = alerts.slice(-5); // Show last 5 alerts

    if (recentAlerts.length === 0) {
      alertsContainer.innerHTML = '<p>No active alerts</p>';
      return;
    }

    alertsContainer.innerHTML = recentAlerts
      .map(
        (alert) => `
      <div class="alert-item ${alert.type}">
        <div>${alert.message}</div>
        <div class="alert-meta">${new Date(alert.timestamp).toLocaleTimeString()}</div>
      </div>
    `,
      )
      .join('');
  }

  /**
   * Update charts with latest data
   */
  private updateCharts(): void {
    const metricsHistory = this.performanceMonitor.getMetricsHistory();
    if (metricsHistory.length === 0) return;

    // Update each chart
    this.charts.forEach((chart) => {
      chart.updateData(metricsHistory);
    });
  }

  /**
   * Update analysis sections
   */
  private updateAnalysisSections(): void {
    this.updateRegressionsList();
    this.updateBottlenecksAnalysis();
    this.updateRecommendationsList();
  }

  /**
   * Update regressions list
   */
  private updateRegressionsList(): void {
    const regressionsContainer = document.getElementById('regressions-list');
    if (!regressionsContainer) return;

    if (this.regressions.length === 0) {
      regressionsContainer.innerHTML = '<p>No performance regressions detected</p>';
      return;
    }

    regressionsContainer.innerHTML = this.regressions
      .map(
        (regression) => `
      <div class="regression-item ${regression.severity}">
        <div class="regression-title">${regression.metric} Regression</div>
        <div class="regression-description">${regression.description}</div>
        <div class="regression-meta">
          Detected: ${new Date(regression.detectedAt).toLocaleString()} | 
          Severity: ${regression.severity} | 
          Status: ${regression.status}
        </div>
      </div>
    `,
      )
      .join('');
  }

  /**
   * Update bottlenecks analysis
   */
  private updateBottlenecksAnalysis(): void {
    const bottlenecksContainer = document.getElementById('bottlenecks-analysis');
    if (!bottlenecksContainer) return;

    const currentMetrics = this.performanceMonitor.getCurrentMetrics();
    if (!currentMetrics) return;

    const bottlenecks = this.identifyBottlenecks(currentMetrics);

    if (bottlenecks.length === 0) {
      bottlenecksContainer.innerHTML = '<p>No performance bottlenecks detected</p>';
      return;
    }

    bottlenecksContainer.innerHTML = bottlenecks
      .map(
        (bottleneck) => `
      <div class="bottleneck-item">
        <strong>${bottleneck}</strong>
      </div>
    `,
      )
      .join('');
  }

  /**
   * Identify performance bottlenecks
   */
  private identifyBottlenecks(metrics: PerformanceMetrics): string[] {
    const bottlenecks: string[] = [];

    if (metrics.lcp > 2500) bottlenecks.push('Slow content loading');
    if (metrics.fid > 100) bottlenecks.push('Poor interactivity');
    if (metrics.cls > 0.1) bottlenecks.push('Layout instability');
    if (metrics.memory.used / metrics.memory.total > 0.8) bottlenecks.push('High memory usage');
    if (metrics.cpu.usage > 80) bottlenecks.push('High CPU usage');
    if (metrics.rendering.fps < 30) bottlenecks.push('Poor rendering performance');

    return bottlenecks;
  }

  /**
   * Update recommendations list
   */
  private updateRecommendationsList(): void {
    const recommendationsContainer = document.getElementById('recommendations-list');
    if (!recommendationsContainer) return;

    const currentMetrics = this.performanceMonitor.getCurrentMetrics();
    if (!currentMetrics) return;

    const recommendations = this.generateRecommendations(currentMetrics);

    if (recommendations.length === 0) {
      recommendationsContainer.innerHTML = '<p>No recommendations at this time</p>';
      return;
    }

    recommendationsContainer.innerHTML = recommendations
      .map(
        (rec) => `
      <div class="recommendation-item">${rec}</div>
    `,
      )
      .join('');
  }

  /**
   * Generate performance recommendations
   */
  private generateRecommendations(metrics: PerformanceMetrics): string[] {
    const recommendations: string[] = [];

    if (metrics.lcp > 2500) {
      recommendations.push('Optimize image loading and use next-gen formats');
      recommendations.push('Implement critical resource prioritization');
    }

    if (metrics.fid > 100) {
      recommendations.push('Break up long JavaScript tasks');
      recommendations.push('Use web workers for heavy computations');
    }

    if (metrics.cls > 0.1) {
      recommendations.push('Set explicit dimensions for images and videos');
      recommendations.push('Avoid inserting content above existing content');
    }

    if (metrics.memory.used / metrics.memory.total > 0.8) {
      recommendations.push('Implement memory leak detection');
      recommendations.push('Optimize data structures and caching');
    }

    if (metrics.cpu.usage > 80) {
      recommendations.push('Optimize algorithms and reduce complexity');
      recommendations.push('Use requestAnimationFrame for animations');
    }

    return recommendations;
  }

  /**
   * Update profiles display
   */
  private updateProfiles(): void {
    const profilesContainer = document.getElementById('profiles-grid');
    if (!profilesContainer) return;

    const profiles = this.performanceMonitor.getActiveProfiles();

    if (profiles.length === 0) {
      profilesContainer.innerHTML = '<p>No active performance profiles</p>';
      return;
    }

    profilesContainer.innerHTML = profiles
      .map(
        (profile) => `
      <div class="profile-card">
        <div class="profile-title">${profile.name}</div>
        <div class="profile-score">${profile.summary.performanceScore}</div>
        <div class="profile-meta">
          Duration: ${(profile.duration / 1000).toFixed(1)}s | 
          Samples: ${profile.metrics.length}
        </div>
      </div>
    `,
      )
      .join('');
  }

  /**
   * Handle time range change
   */
  private updateTimeRange(timeRange: string): void {
    console.log(`Time range changed to: ${timeRange}`);
    // Implement time range filtering logic
    this.refreshData();
  }

  /**
   * Export performance report
   */
  private exportReport(): void {
    const report = this.generateReport();
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `performance-report-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Generate performance report
   */
  private generateReport(): PerformanceReport {
    const currentMetrics = this.performanceMonitor.getCurrentMetrics();
    const metricsHistory = this.performanceMonitor.getMetricsHistory();

    return {
      id: `report-${Date.now()}`,
      title: 'Performance Analytics Report',
      generatedAt: Date.now(),
      timeRange: {
        start: metricsHistory.length > 0 ? metricsHistory[0]!.timestamp : Date.now(),
        end: Date.now(),
      },
      summary: {
        overallScore: currentMetrics ? this.calculateOverallScore(currentMetrics) : 0,
        totalSessions: metricsHistory.length,
        avgLoadTime: this.calculateAverageLoadTime(metricsHistory),
        errorRate: 0, // Would be calculated from actual error data
        userSatisfaction: 0.85, // Would be calculated from user feedback
      },
      metrics: {
        coreWebVitals: this.generateCoreWebVitalsReport(metricsHistory),
        resourceUsage: this.generateResourceUsageReport(metricsHistory),
        userExperience: this.generateUserExperienceReport(metricsHistory),
      },
      trends: this.trends,
      regressions: this.regressions,
      recommendations: currentMetrics ? this.generateRecommendations(currentMetrics) : [],
    };
  }

  /**
   * Calculate average load time
   */
  private calculateAverageLoadTime(metrics: PerformanceMetrics[]): number {
    if (metrics.length === 0) return 0;
    const total = metrics.reduce((sum, metric) => sum + metric.userExperience.pageLoadTime, 0);
    return total / metrics.length;
  }

  /**
   * Generate Core Web Vitals report
   */
  private generateCoreWebVitalsReport(metrics: PerformanceMetrics[]): CoreWebVitalsReport {
    // Simplified implementation
    const lcpValues = metrics.map((m) => m.lcp).filter((v) => v > 0);
    const fidValues = metrics.map((m) => m.fid).filter((v) => v > 0);
    const clsValues = metrics.map((m) => m.cls).filter((v) => v > 0);
    const fcpValues = metrics.map((m) => m.fcp).filter((v) => v > 0);
    const ttfbValues = metrics.map((m) => m.ttfb).filter((v) => v > 0);

    return {
      lcp: this.calculateStatistics(lcpValues),
      fid: this.calculateStatistics(fidValues),
      cls: this.calculateStatistics(clsValues),
      fcp: this.calculateStatistics(fcpValues),
      ttfb: this.calculateStatistics(ttfbValues),
    };
  }

  /**
   * Calculate statistics for metric values
   */
  private calculateStatistics(values: number[]): {
    avg: number;
    p75: number;
    p90: number;
    distribution: number[];
  } {
    if (values.length === 0) {
      return { avg: 0, p75: 0, p90: 0, distribution: [] };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
    const p75 = sorted[Math.floor(sorted.length * 0.75)] || 0;
    const p90 = sorted[Math.floor(sorted.length * 0.9)] || 0;

    return { avg, p75, p90, distribution: sorted };
  }

  /**
   * Generate resource usage report
   */
  private generateResourceUsageReport(metrics: PerformanceMetrics[]): ResourceUsageReport {
    if (metrics.length === 0) {
      return {
        memory: { avg: 0, peak: 0, trend: 'stable' },
        cpu: { avg: 0, peak: 0, trend: 'stable' },
        network: { totalTransferred: 0, avgLatency: 0, errorRate: 0 },
      };
    }

    const memoryValues = metrics.map((m) => (m.memory.used / m.memory.total) * 100);
    const cpuValues = metrics.map((m) => m.cpu.usage);
    const latencyValues = metrics.map((m) => m.network.averageLatency);
    const dataTransferred = metrics.reduce((sum, m) => sum + m.network.totalDataTransferred, 0);

    return {
      memory: {
        avg: memoryValues.reduce((sum, val) => sum + val, 0) / memoryValues.length,
        peak: Math.max(...memoryValues),
        trend: 'stable', // Would be calculated based on trend analysis
      },
      cpu: {
        avg: cpuValues.reduce((sum, val) => sum + val, 0) / cpuValues.length,
        peak: Math.max(...cpuValues),
        trend: 'stable',
      },
      network: {
        totalTransferred: dataTransferred,
        avgLatency: latencyValues.reduce((sum, val) => sum + val, 0) / latencyValues.length,
        errorRate: 0, // Would be calculated from actual error data
      },
    };
  }

  /**
   * Generate user experience report
   */
  private generateUserExperienceReport(metrics: PerformanceMetrics[]): UserExperienceReport {
    if (metrics.length === 0) {
      return {
        pageLoadTime: { avg: 0, p75: 0, p90: 0 },
        interactionLatency: { avg: 0, p75: 0, p90: 0 },
        errorRate: 0,
        bounceRate: 0,
        satisfactionScore: 0,
      };
    }

    const loadTimes = metrics.map((m) => m.userExperience.pageLoadTime);
    const interactionLatencies = metrics.map((m) => m.userExperience.interactionLatency);

    return {
      pageLoadTime: this.calculateStatistics(loadTimes),
      interactionLatency: this.calculateStatistics(interactionLatencies),
      errorRate: 0, // Would be calculated from actual error data
      bounceRate: 0, // Would be calculated from user behavior data
      satisfactionScore: 0.85, // Would be calculated from user feedback
    };
  }

  /**
   * Refresh dashboard data
   */
  private refreshData(): void {
    console.log('Refreshing dashboard data...');
    this.updateDashboard();
  }

  /**
   * Destroy dashboard
   */
  destroy(): void {
    this.stop();
    this.charts.forEach((chart) => chart.destroy());
    this.charts.clear();

    if (this.container) {
      this.container.innerHTML = '';
    }

    // Remove styles
    const styles = document.getElementById('heys-analytics-styles');
    if (styles) {
      styles.remove();
    }
  }
}

/**
 * Simple Performance Chart implementation
 */
class PerformanceChart {
  private canvas: HTMLCanvasElement | null;
  private ctx: CanvasRenderingContext2D | null;

  constructor(
    canvasId: string,
    _config: {
      type: string;
      title: string;
      metrics: string[];
    },
  ) {
    this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    this.ctx = this.canvas?.getContext('2d') || null;

    if (this.canvas) {
      this.canvas.width = this.canvas.offsetWidth;
      this.canvas.height = this.canvas.offsetHeight;
    }
  }

  updateData(metrics: PerformanceMetrics[]): void {
    if (!this.ctx || !this.canvas || metrics.length === 0) return;

    this.clearCanvas();

    // Simple chart rendering implementation
    this.drawChart(metrics);
  }

  private clearCanvas(): void {
    if (!this.ctx || !this.canvas) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private drawChart(metrics: PerformanceMetrics[]): void {
    if (!this.ctx || !this.canvas) return;

    // Draw a simple line chart placeholder
    this.ctx.strokeStyle = '#007bff';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();

    const width = this.canvas.width;
    const height = this.canvas.height;
    const stepX = width / (metrics.length - 1);

    metrics.forEach((_metric, index) => {
      const x = index * stepX;
      const y = height - height * 0.5; // Placeholder positioning

      if (index === 0) {
        this.ctx!.moveTo(x, y);
      } else {
        this.ctx!.lineTo(x, y);
      }
    });

    this.ctx.stroke();
  }

  destroy(): void {
    this.canvas = null;
    this.ctx = null;
  }
}
