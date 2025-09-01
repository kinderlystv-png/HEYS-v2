// Main exports for @heys/analytics-dashboard

// Components
export { AnalyticsDashboard } from './components/AnalyticsDashboard';

// Providers
export { WebSocketProvider, useWebSocket, useWebSocketEvent, useRealTimeAnalytics, useRealTimeAlerts, useMetricDefinitions } from './providers/WebSocketProvider';
export { MetricsProvider, useMetrics } from './providers/MetricsProvider';

// Core engines
export { MetricsEngine } from './core/MetricsEngine';
export { BusinessROICalculator } from './core/BusinessROICalculator';
export { UserExperienceScorer } from './core/UserExperienceScorer';
export { ErrorImpactAnalyzer } from './core/ErrorImpactAnalyzer';

// Types
export type {
  AnalyticsData,
  MetricDefinition,
  BusinessMetric,
  UserExperienceMetric,
  ErrorImpactData,
  ROICalculation,
  SystemStatusData,
  DashboardConfig,
  DashboardWidget,
  DashboardFilter,
  AlertDefinition,
  SystemStatus
} from './types';

// Utilities
export {
  formatMetricValue,
  calculatePercentageChange,
  aggregateMetrics,
  calculatePercentile,
  formatDuration,
  generateTimeRanges,
  debounce,
  throttle,
  deepMerge,
  generateChartColors,
  formatLargeNumber,
  calculateMovingAverage,
  detectAnomalies,
  groupByTimeInterval
} from './utils';

// Default export
export { AnalyticsDashboard as default } from './components/AnalyticsDashboard';
