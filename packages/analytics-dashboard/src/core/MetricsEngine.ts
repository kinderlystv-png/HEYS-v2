import { AnalyticsData, MetricDefinition, BusinessMetric } from '../types';

/**
 * MetricsEngine - Core analytics data processing and aggregation
 * Handles real-time metric calculation, aggregation, and business logic
 */
export class MetricsEngine {
  private metrics: Map<string, MetricDefinition> = new Map();
  private dataPoints: Map<string, AnalyticsData[]> = new Map();
  private eventListeners: Map<string, ((data: AnalyticsData) => void)[]> = new Map();

  constructor() {
    this.initializeDefaultMetrics();
  }

  /**
   * Register a new metric definition
   */
  registerMetric(metric: MetricDefinition): void {
    this.metrics.set(metric.id, metric);
    this.dataPoints.set(metric.id, []);
    this.eventListeners.set(metric.id, []);
  }

  /**
   * Add a data point for a specific metric
   */
  addDataPoint(metricId: string, data: Omit<AnalyticsData, 'metric'>): void {
    const metric = this.metrics.get(metricId);
    if (!metric) {
      throw new Error(`Metric ${metricId} not found`);
    }

    const dataPoint: AnalyticsData = {
      ...data,
      metric: metricId,
      timestamp: data.timestamp || Date.now()
    };

    const points = this.dataPoints.get(metricId) || [];
    points.push(dataPoint);
    
    // Keep only last 1000 points for performance
    if (points.length > 1000) {
      points.shift();
    }

    this.dataPoints.set(metricId, points);
    this.notifyListeners(metricId, dataPoint);
  }

  /**
   * Get aggregated value for a metric
   */
  getAggregatedValue(metricId: string, timeRange?: { start: number; end: number }): number {
    const metric = this.metrics.get(metricId);
    const points = this.dataPoints.get(metricId) || [];

    if (!metric || points.length === 0) {
      return 0;
    }

    let filteredPoints = points;
    if (timeRange) {
      filteredPoints = points.filter(
        p => p.timestamp >= timeRange.start && p.timestamp <= timeRange.end
      );
    }

    if (filteredPoints.length === 0) {
      return 0;
    }

    switch (metric.aggregationType) {
      case 'sum':
        return filteredPoints.reduce((sum, point) => sum + point.value, 0);
      case 'avg':
        return filteredPoints.reduce((sum, point) => sum + point.value, 0) / filteredPoints.length;
      case 'max':
        return Math.max(...filteredPoints.map(p => p.value));
      case 'min':
        return Math.min(...filteredPoints.map(p => p.value));
      case 'count':
        return filteredPoints.length;
      default:
        return 0;
    }
  }

  /**
   * Get business metrics with trend analysis
   */
  getBusinessMetrics(timeRange: { start: number; end: number }): BusinessMetric[] {
    const businessMetrics: BusinessMetric[] = [];

    for (const [metricId, metric] of this.metrics) {
      if (metric.category === 'business') {
        const currentValue = this.getAggregatedValue(metricId, timeRange);
        
        // Calculate previous period for trend
        const periodDuration = timeRange.end - timeRange.start;
        const previousTimeRange = {
          start: timeRange.start - periodDuration,
          end: timeRange.start
        };
        const previousValue = this.getAggregatedValue(metricId, previousTimeRange);
        
        const percentageChange = previousValue > 0 
          ? ((currentValue - previousValue) / previousValue) * 100 
          : 0;

        const trend = percentageChange > 5 ? 'up' : 
                     percentageChange < -5 ? 'down' : 'stable';

        businessMetrics.push({
          id: metricId,
          name: metric.name,
          value: currentValue,
          trend,
          percentageChange,
          timeRange: `${new Date(timeRange.start).toISOString()} - ${new Date(timeRange.end).toISOString()}`,
          unit: metric.unit
        });
      }
    }

    return businessMetrics;
  }

  /**
   * Subscribe to real-time metric updates
   */
  subscribe(metricId: string, callback: (data: AnalyticsData) => void): () => void {
    const listeners = this.eventListeners.get(metricId) || [];
    listeners.push(callback);
    this.eventListeners.set(metricId, listeners);

    // Return unsubscribe function
    return () => {
      const updatedListeners = this.eventListeners.get(metricId) || [];
      const index = updatedListeners.indexOf(callback);
      if (index > -1) {
        updatedListeners.splice(index, 1);
        this.eventListeners.set(metricId, updatedListeners);
      }
    };
  }

  /**
   * Get raw data points for a metric
   */
  getDataPoints(metricId: string, limit?: number): AnalyticsData[] {
    const points = this.dataPoints.get(metricId) || [];
    return limit ? points.slice(-limit) : points;
  }

  /**
   * Get all registered metrics
   */
  getMetrics(): MetricDefinition[] {
    return Array.from(this.metrics.values());
  }

  /**
   * Clear data for a metric
   */
  clearMetricData(metricId: string): void {
    this.dataPoints.set(metricId, []);
  }

  /**
   * Get performance statistics for the metrics engine
   */
  getEngineStats() {
    return {
      metricsCount: this.metrics.size,
      totalDataPoints: Array.from(this.dataPoints.values()).reduce((total, points) => total + points.length, 0),
      subscribersCount: Array.from(this.eventListeners.values()).reduce((total, listeners) => total + listeners.length, 0)
    };
  }

  private initializeDefaultMetrics(): void {
    // Page Performance Metrics
    this.registerMetric({
      id: 'page-load-time',
      name: 'Page Load Time',
      description: 'Average page load time in milliseconds',
      unit: 'ms',
      category: 'performance',
      aggregationType: 'avg',
      refreshInterval: 30,
      isRealTime: true
    });

    this.registerMetric({
      id: 'error-rate',
      name: 'Error Rate',
      description: 'Number of errors per minute',
      unit: 'errors/min',
      category: 'technical',
      aggregationType: 'count',
      refreshInterval: 60,
      isRealTime: true
    });

    // Business Metrics
    this.registerMetric({
      id: 'active-users',
      name: 'Active Users',
      description: 'Number of currently active users',
      unit: 'users',
      category: 'business',
      aggregationType: 'max',
      refreshInterval: 60,
      isRealTime: true
    });

    this.registerMetric({
      id: 'conversion-rate',
      name: 'Conversion Rate',
      description: 'Percentage of users completing desired actions',
      unit: '%',
      category: 'business',
      aggregationType: 'avg',
      refreshInterval: 300,
      isRealTime: false
    });

    // User Experience Metrics
    this.registerMetric({
      id: 'user-satisfaction',
      name: 'User Satisfaction',
      description: 'Average user satisfaction score',
      unit: 'score',
      category: 'user-experience',
      aggregationType: 'avg',
      refreshInterval: 600,
      isRealTime: false
    });
  }

  private notifyListeners(metricId: string, data: AnalyticsData): void {
    const listeners = this.eventListeners.get(metricId) || [];
    listeners.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Error in metric listener for ${metricId}:`, error);
      }
    });
  }
}
