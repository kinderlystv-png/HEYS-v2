// Utility functions for analytics dashboard

/**
 * Format metric values for display
 */
export function formatMetricValue(value: number, unit: string, precision: number = 2): string {
  if (unit === '%') {
    return `${value.toFixed(precision)}%`;
  }
  
  if (unit === 'ms') {
    if (value >= 1000) {
      return `${(value / 1000).toFixed(precision)}s`;
    }
    return `${value.toFixed(precision)}ms`;
  }
  
  if (unit === 'bytes') {
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(value) / Math.log(1024));
    return `${(value / Math.pow(1024, i)).toFixed(precision)} ${sizes[i]}`;
  }
  
  if (unit.startsWith('$')) {
    return `$${value.toLocaleString(undefined, { minimumFractionDigits: precision, maximumFractionDigits: precision })}`;
  }
  
  // Default formatting with locale-aware number formatting
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(precision)}M ${unit}`;
  } else if (value >= 1000) {
    return `${(value / 1000).toFixed(precision)}K ${unit}`;
  }
  
  return `${value.toFixed(precision)} ${unit}`;
}

/**
 * Calculate percentage change between two values
 */
export function calculatePercentageChange(current: number, previous: number): number {
  if (previous === 0) {
    return current > 0 ? 100 : 0;
  }
  return ((current - previous) / previous) * 100;
}

/**
 * Aggregate metrics using different aggregation types
 */
export function aggregateMetrics(
  values: number[],
  aggregationType: 'sum' | 'avg' | 'max' | 'min' | 'count' | 'median' | 'percentile'
): number {
  if (values.length === 0) return 0;

  switch (aggregationType) {
    case 'sum':
      return values.reduce((sum, value) => sum + value, 0);
    
    case 'avg':
      return values.reduce((sum, value) => sum + value, 0) / values.length;
    
    case 'max':
      return Math.max(...values);
    
    case 'min':
      return Math.min(...values);
    
    case 'count':
      return values.length;
    
    case 'median': {
      const sorted = [...values].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 0
        ? (sorted[mid - 1]! + sorted[mid]!) / 2
        : sorted[mid]!;
    }
    
    case 'percentile':
      // Default to 95th percentile
      return calculatePercentile(values, 95);
    
    default:
      return 0;
  }
}

/**
 * Calculate specific percentile of values
 */
export function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  
  const sorted = [...values].sort((a, b) => a - b);
  const index = (percentile / 100) * (sorted.length - 1);
  
  if (Number.isInteger(index)) {
    return sorted[index]!;
  }
  
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  
  return sorted[lower]! * (1 - weight) + sorted[upper]! * weight;
}

/**
 * Format time duration in human readable format
 */
export function formatDuration(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else if (seconds > 0) {
    return `${seconds}s`;
  } else {
    return `${milliseconds}ms`;
  }
}

/**
 * Generate time range options for analytics
 */
export function generateTimeRanges(): { label: string; value: string; start: number; end: number }[] {
  const now = Date.now();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;

  return [
    {
      label: 'Last 15 minutes',
      value: '15m',
      start: now - 15 * minute,
      end: now
    },
    {
      label: 'Last hour',
      value: '1h',
      start: now - hour,
      end: now
    },
    {
      label: 'Last 24 hours',
      value: '24h',
      start: now - day,
      end: now
    },
    {
      label: 'Last 7 days',
      value: '7d',
      start: now - week,
      end: now
    },
    {
      label: 'Last 30 days',
      value: '30d',
      start: now - month,
      end: now
    },
    {
      label: 'Last 90 days',
      value: '90d',
      start: now - 3 * month,
      end: now
    }
  ];
}

/**
 * Debounce function for performance optimization
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * Throttle function for performance optimization
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * Deep merge objects
 */
export function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
  const result = { ...target };
  
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {} as T[Extract<keyof T, string>], source[key]!);
    } else {
      result[key] = source[key] as T[Extract<keyof T, string>];
    }
  }
  
  return result;
}

/**
 * Generate random color for charts
 */
export function generateChartColors(count: number): string[] {
  const colors = [
    '#4F46E5', '#06B6D4', '#10B981', '#F59E0B',
    '#EF4444', '#8B5CF6', '#F97316', '#84CC16',
    '#EC4899', '#6366F1', '#14B8A6', '#F472B6'
  ];
  
  const result: string[] = [];
  for (let i = 0; i < count; i++) {
    const color = colors[i % colors.length];
    if (color) {
      result.push(color);
    }
  }
  
  return result;
}

/**
 * Format large numbers with appropriate suffixes
 */
export function formatLargeNumber(num: number): string {
  if (num >= 1e12) {
    return (num / 1e12).toFixed(1) + 'T';
  } else if (num >= 1e9) {
    return (num / 1e9).toFixed(1) + 'B';
  } else if (num >= 1e6) {
    return (num / 1e6).toFixed(1) + 'M';
  } else if (num >= 1e3) {
    return (num / 1e3).toFixed(1) + 'K';
  }
  return num.toString();
}

/**
 * Calculate moving average
 */
export function calculateMovingAverage(data: number[], windowSize: number): number[] {
  const result: number[] = [];
  
  for (let i = 0; i < data.length; i++) {
    const start = Math.max(0, i - windowSize + 1);
    const window = data.slice(start, i + 1);
    const average = window.reduce((sum, value) => sum + value, 0) / window.length;
    result.push(average);
  }
  
  return result;
}

/**
 * Detect anomalies in time series data
 */
export function detectAnomalies(
  data: { timestamp: number; value: number }[],
  threshold: number = 2
): { timestamp: number; value: number; isAnomaly: boolean }[] {
  if (data.length < 3) {
    return data.map(d => ({ ...d, isAnomaly: false }));
  }

  const values = data.map(d => d.value);
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);

  return data.map(d => ({
    ...d,
    isAnomaly: Math.abs(d.value - mean) > threshold * stdDev
  }));
}

/**
 * Group data by time intervals
 */
export function groupByTimeInterval(
  data: { timestamp: number; value: number }[],
  intervalMs: number
): { timestamp: number; values: number[]; average: number; count: number }[] {
  const groups = new Map<number, number[]>();

  data.forEach(item => {
    const intervalStart = Math.floor(item.timestamp / intervalMs) * intervalMs;
    if (!groups.has(intervalStart)) {
      groups.set(intervalStart, []);
    }
    groups.get(intervalStart)!.push(item.value);
  });

  return Array.from(groups.entries())
    .map(([timestamp, values]) => ({
      timestamp,
      values,
      average: values.reduce((sum, val) => sum + val, 0) / values.length,
      count: values.length
    }))
    .sort((a, b) => a.timestamp - b.timestamp);
}
