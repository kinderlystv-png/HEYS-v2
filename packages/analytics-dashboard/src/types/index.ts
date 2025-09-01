// Business Intelligence MVP - Type Definitions

// Core Analytics Data Types
export interface AnalyticsData {
  timestamp: number;
  value: number;
  metric: string;
  source: string;
  metadata?: Record<string, any>;
}

// Metric Definition
export interface MetricDefinition {
  id: string;
  name: string;
  description: string;
  unit: string;
  category: 'performance' | 'business' | 'user-experience' | 'security' | 'technical';
  aggregationType: 'sum' | 'avg' | 'max' | 'min' | 'count';
  refreshInterval: number; // seconds
  isRealTime: boolean;
}

// Business Metrics
export interface BusinessMetric {
  id: string;
  name: string;
  value: number;
  target?: number;
  trend: 'up' | 'down' | 'stable';
  percentageChange: number;
  timeRange: string;
  currency?: string;
  unit: string;
}

// User Experience Metrics
export interface UserExperienceMetric {
  sessionId: string;
  userId?: string;
  pageLoadTime: number;
  timeToInteractive: number;
  cumulativeLayoutShift: number;
  firstContentfulPaint: number;
  largestContentfulPaint: number;
  errorCount: number;
  clickDepth: number;
  sessionDuration: number;
  timestamp: number;
  userAgent: string;
  score: number; // 0-100
}

// Error Impact Analysis
export interface ErrorImpactData {
  errorId: string;
  message: string;
  stack?: string;
  timestamp: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  frequency: number;
  affectedUsers: number;
  businessImpact: {
    revenueImpact: number;
    userExperienceScore: number;
    operationalCost: number;
  };
  resolution?: {
    status: 'open' | 'in-progress' | 'resolved';
    assignee?: string;
    estimatedResolutionTime?: number;
  };
}

// ROI Calculation
export interface ROICalculation {
  investment: number;
  revenue: number;
  costSavings: number;
  timeframe: string;
  roi: number; // percentage
  paybackPeriod: number; // months
  netPresentValue: number;
  breakdownByCategory: {
    category: string;
    value: number;
    percentage: number;
  }[];
}

// Dashboard Configuration
export interface AlertDefinition {
  id: string;
  name: string;
  description: string;
  condition: string;
  threshold: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  isActive: boolean;
  triggeredAt?: number;
  resolvedAt?: number;
  metadata?: Record<string, any>;
}

export interface SystemStatus {
  status: 'healthy' | 'warning' | 'critical' | 'unknown';
  uptime: number;
  memoryUsage: number;
  cpuUsage: number;
  diskUsage: number;
  activeConnections: number;
  lastHealthCheck: number;
}

export interface DashboardConfig {
  id: string;
  name: string;
  description: string;
  layout: {
    grid: {
      columns: number;
      rows: number;
    };
    widgets: DashboardWidget[];
  };
  refreshInterval: number;
  filters: DashboardFilter[];
  permissions: {
    viewers: string[];
    editors: string[];
  };
}

export interface DashboardWidget {
  id: string;
  type: 'line-chart' | 'bar-chart' | 'pie-chart' | 'heat-map' | 'metric-card' | 'table';
  title: string;
  position: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  dataSource: string;
  configuration: Record<string, any>;
  refreshInterval?: number;
}

export interface DashboardFilter {
  id: string;
  name: string;
  type: 'date-range' | 'select' | 'multi-select' | 'text';
  options?: string[];
  defaultValue?: any;
}

// Real-time Data Event
export interface RealtimeDataEvent {
  type: 'metric-update' | 'alert' | 'system-status';
  data: AnalyticsData | AlertData | SystemStatusData;
  timestamp: number;
}

export interface AlertData {
  id: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  title: string;
  message: string;
  source: string;
  timestamp: number;
  acknowledged: boolean;
}

export interface SystemStatusData {
  component: string;
  status: 'operational' | 'degraded' | 'outage';
  message?: string;
  timestamp: number;
}
