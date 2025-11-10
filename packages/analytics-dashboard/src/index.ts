// Main exports for @heys/analytics-dashboard

// Components
export { AnalyticsDashboard } from './components/AnalyticsDashboard';

// Providers
export { MetricsProvider, useMetrics } from './providers/MetricsProvider';
export {
  WebSocketProvider,
  useMetricDefinitions,
  useRealTimeAlerts,
  useRealTimeAnalytics,
  useWebSocket,
  useWebSocketEvent,
} from './providers/WebSocketProvider';

// Core engines
export { BusinessROICalculator } from './core/BusinessROICalculator';
export { ErrorImpactAnalyzer } from './core/ErrorImpactAnalyzer';
export { MetricsEngine } from './core/MetricsEngine';
export { UserExperienceScorer } from './core/UserExperienceScorer';

// Types
export type {
  AlertDefinition,
  AnalyticsData,
  BusinessMetric,
  DashboardConfig,
  DashboardFilter,
  DashboardWidget,
  ErrorImpactData,
  MetricDefinition,
  ROICalculation,
  SystemStatus,
  SystemStatusData,
  UserExperienceMetric,
} from './types';

// Utilities
export {
  aggregateMetrics,
  calculateMovingAverage,
  calculatePercentageChange,
  calculatePercentile,
  debounce,
  deepMerge,
  detectAnomalies,
  formatDuration,
  formatLargeNumber,
  formatMetricValue,
  generateChartColors,
  generateTimeRanges,
  groupByTimeInterval,
  throttle,
} from './utils';

// Default export
export { AnalyticsDashboard as default } from './components/AnalyticsDashboard';
