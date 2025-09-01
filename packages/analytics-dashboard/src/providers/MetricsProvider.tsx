import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';

import { BusinessROICalculator } from '../core/BusinessROICalculator';
import { ErrorImpactAnalyzer } from '../core/ErrorImpactAnalyzer';
import { MetricsEngine } from '../core/MetricsEngine';
import { UserExperienceScorer } from '../core/UserExperienceScorer';
import { 
  AnalyticsData, 
  MetricDefinition, 
  BusinessMetric, 
  UserExperienceMetric, 
  ErrorImpactData,
  ROICalculation 
} from '../types';

interface MetricsContextType {
  // Engines
  metricsEngine: MetricsEngine;
  roiCalculator: BusinessROICalculator;
  uxScorer: UserExperienceScorer;
  errorAnalyzer: ErrorImpactAnalyzer;

  // State
  metrics: AnalyticsData[];
  businessMetrics: BusinessMetric[];
  uxMetrics: UserExperienceMetric[];
  errorImpacts: ErrorImpactData[];
  roiCalculations: ROICalculation[];

  // Loading states
  isLoading: boolean;
  isProcessing: boolean;

  // Actions
  addMetric: (metric: AnalyticsData) => void;
  registerMetricDefinition: (definition: MetricDefinition) => void;
  calculateROI: (initiativeName: string, config: any) => Promise<ROICalculation>;
  analyzeUserExperience: (metrics: UserExperienceMetric[]) => Promise<any>;
  analyzeErrorImpact: (errors: any[]) => Promise<ErrorImpactData>;
  getMetricsByTimeRange: (start: number, end: number) => AnalyticsData[];
  getBusinessInsights: () => any;
  
  // Subscriptions
  subscribe: (event: string, callback: (data: any) => void) => () => void;
  
  // Configuration
  updateConfiguration: (config: Partial<any>) => void;
}

const MetricsContext = createContext<MetricsContextType | null>(null);

interface MetricsProviderProps {
  children: React.ReactNode;
  configuration?: {
    retentionPeriod?: number;
    processingInterval?: number;
    batchSize?: number;
  };
}

export const MetricsProvider: React.FC<MetricsProviderProps> = ({
  children,
  configuration = {}
}) => {
  const {
    retentionPeriod = 7 * 24 * 60 * 60 * 1000, // 7 days
    processingInterval = 5000, // 5 seconds
    batchSize = 100
  } = configuration;

  // Initialize engines
  const metricsEngine = useRef(new MetricsEngine()).current;
  const roiCalculator = useRef(new BusinessROICalculator()).current;
  const uxScorer = useRef(new UserExperienceScorer()).current;
  const errorAnalyzer = useRef(new ErrorImpactAnalyzer()).current;

  // State
  const [metrics, setMetrics] = useState<AnalyticsData[]>([]);
  const [businessMetrics] = useState<BusinessMetric[]>([]);
  const [uxMetrics, setUxMetrics] = useState<UserExperienceMetric[]>([]);
  const [errorImpacts, setErrorImpacts] = useState<ErrorImpactData[]>([]);
  const [roiCalculations, setRoiCalculations] = useState<ROICalculation[]>([]);
  const [isLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Subscriptions
  const subscriptions = useRef<Map<string, Set<(data: any) => void>>>(new Map());
  const processingTimer = useRef<NodeJS.Timeout>();

  // Add metric to the system
  const addMetric = useCallback((metric: AnalyticsData) => {
    setMetrics(prev => {
      const updated = [...prev, metric].slice(-retentionPeriod);
      
      // Process with metrics engine
      if (metric.metric) {
        metricsEngine.addDataPoint(metric.metric, {
          value: metric.value,
          timestamp: metric.timestamp,
          source: metric.source,
          metadata: metric.metadata || {}
        });
      }
      
      // Emit event to subscribers
      const callbacks = subscriptions.current.get('metric:added');
      if (callbacks) {
        callbacks.forEach(callback => callback(metric));
      }
      
      return updated;
    });
  }, [metricsEngine, retentionPeriod]);

  // Register metric definition
  const registerMetricDefinition = useCallback((definition: MetricDefinition) => {
    metricsEngine.registerMetric(definition);
    
    const callbacks = subscriptions.current.get('metric:registered');
    if (callbacks) {
      callbacks.forEach(callback => callback(definition));
    }
  }, [metricsEngine]);

  // Calculate ROI for business initiatives
  const calculateROI = useCallback(async (initiativeName: string, config: any): Promise<ROICalculation> => {
    setIsProcessing(true);
    
    try {
      const calculation = roiCalculator.calculateROI(
        config.investment || 0,
        config.annualRevenue || 0,
        config.annualCostSavings || 0,
        config.timeframeYears || 1,
        config.breakdown
      );
      
      setRoiCalculations(prev => [...prev, calculation]);
      
      const callbacks = subscriptions.current.get('roi:calculated');
      if (callbacks) {
        callbacks.forEach(callback => callback({ ...calculation, initiativeName }));
      }
      
      return calculation;
    } finally {
      setIsProcessing(false);
    }
  }, [roiCalculator]);

  // Analyze user experience
  const analyzeUserExperience = useCallback(async (metrics: UserExperienceMetric[]) => {
    setIsProcessing(true);
    
    try {
      // Calculate score for first metric as example
      const analysis = metrics.length > 0 ? uxScorer.calculateScore(metrics[0]!) : null;
      
      setUxMetrics(prev => [...prev, ...metrics]);
      
      const callbacks = subscriptions.current.get('ux:analyzed');
      if (callbacks) {
        callbacks.forEach(callback => callback(analysis));
      }
      
      return analysis;
    } finally {
      setIsProcessing(false);
    }
  }, [uxScorer]);

  // Analyze error impact
  const analyzeErrorImpact = useCallback(async (errors: any[]): Promise<ErrorImpactData> => {
    setIsProcessing(true);
    
    try {
      // Create a sample error impact data from the errors
      const analysis: ErrorImpactData = {
        errorId: `analysis-${Date.now()}`,
        message: `Analysis of ${errors.length} errors`,
        timestamp: Date.now(),
        severity: 'medium',
        affectedUsers: errors.length * 10,
        frequency: errors.length,
        businessImpact: {
          revenueImpact: errors.length * 100,
          userExperienceScore: Math.max(0, 100 - errors.length * 5),
          operationalCost: errors.length * 50
        }
      };
      
      setErrorImpacts(prev => [...prev, analysis]);
      
      const callbacks = subscriptions.current.get('error:analyzed');
      if (callbacks) {
        callbacks.forEach(callback => callback(analysis));
      }
      
      return analysis;
    } finally {
      setIsProcessing(false);
    }
  }, [errorAnalyzer]);

  // Get metrics by time range
  const getMetricsByTimeRange = useCallback((start: number, end: number): AnalyticsData[] => {
    return metrics.filter(metric => 
      metric.timestamp >= start && metric.timestamp <= end
    );
  }, [metrics]);

  // Get business insights
  const getBusinessInsights = useCallback(() => {
    const recentMetrics = metrics.slice(-100); // Last 100 metrics
    
    // Calculate trends
    const trends = {
      performance: calculateTrend(recentMetrics, 'performance'),
      errors: calculateTrend(recentMetrics, 'errors'),
      users: calculateTrend(recentMetrics, 'users'),
      revenue: calculateTrend(recentMetrics, 'revenue')
    };
    
    // Get latest ROI calculations
    const latestROI = roiCalculations.slice(-5);
    
    // Get error impact summary
    const errorSummary = errorImpacts.reduce((acc, impact) => {
      acc.totalErrors += 1; // Each impact represents errors
      acc.estimatedRevenueLoss += impact.businessImpact.revenueImpact;
      acc.operationalCost += impact.businessImpact.operationalCost;
      return acc;
    }, { totalErrors: 0, estimatedRevenueLoss: 0, operationalCost: 0 });
    
    return {
      summary: {
        totalMetrics: metrics.length,
        businessMetrics: businessMetrics.length,
        activeROICalculations: roiCalculations.length,
        errorImpacts: errorImpacts.length
      },
      trends,
      latestROI,
      errorSummary,
      lastUpdated: Date.now()
    };
  }, [metrics, businessMetrics, roiCalculations, errorImpacts]);

  // Subscribe to events
  const subscribe = useCallback((event: string, callback: (data: any) => void) => {
    if (!subscriptions.current.has(event)) {
      subscriptions.current.set(event, new Set());
    }
    
    subscriptions.current.get(event)!.add(callback);
    
    return () => {
      const eventCallbacks = subscriptions.current.get(event);
      if (eventCallbacks) {
        eventCallbacks.delete(callback);
        if (eventCallbacks.size === 0) {
          subscriptions.current.delete(event);
        }
      }
    };
  }, []);

  // Update configuration
  const updateConfiguration = useCallback((config: Partial<any>) => {
    // Update engines configuration
    // This would need to be implemented based on specific engine APIs
    console.log('Updating configuration:', config);
    
    const callbacks = subscriptions.current.get('config:updated');
    if (callbacks) {
      callbacks.forEach(callback => callback(config));
    }
  }, []);

  // Process metrics periodically
  useEffect(() => {
    processingTimer.current = setInterval(() => {
      if (metrics.length > 0) {
        setIsProcessing(true);
        
        // Process business metrics
        // Skip business metrics processing for now - would need proper mapping
        
        setIsProcessing(false);
      }
    }, processingInterval);

    return () => {
      if (processingTimer.current) {
        clearInterval(processingTimer.current);
      }
    };
  }, [metrics, batchSize, processingInterval]);

  // Cleanup old metrics
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      const cutoff = Date.now() - retentionPeriod;
      
      setMetrics(prev => prev.filter(metric => metric.timestamp > cutoff));
      // Skip business metrics cleanup - would need proper timestamp field
      setUxMetrics(prev => prev.filter(metric => metric.timestamp > cutoff));
      setErrorImpacts(prev => prev.filter(impact => impact.timestamp > cutoff));
    }, 60000); // Check every minute

    return () => clearInterval(cleanupInterval);
  }, [retentionPeriod]);

  const contextValue: MetricsContextType = {
    metricsEngine,
    roiCalculator,
    uxScorer,
    errorAnalyzer,
    metrics,
    businessMetrics,
    uxMetrics,
    errorImpacts,
    roiCalculations,
    isLoading,
    isProcessing,
    addMetric,
    registerMetricDefinition,
    calculateROI,
    analyzeUserExperience,
    analyzeErrorImpact,
    getMetricsByTimeRange,
    getBusinessInsights,
    subscribe,
    updateConfiguration
  };

  return (
    <MetricsContext.Provider value={contextValue}>
      {children}
    </MetricsContext.Provider>
  );
};

export const useMetrics = (): MetricsContextType => {
  const context = useContext(MetricsContext);
  if (!context) {
    throw new Error('useMetrics must be used within a MetricsProvider');
  }
  return context;
};

// Helper function to calculate trends
function calculateTrend(metrics: AnalyticsData[], category: string): {
  current: number;
  previous: number;
  change: number;
  changePercent: number;
} {
  const now = Date.now();
  const hour = 60 * 60 * 1000;
  
  const currentHour = metrics.filter(m => 
    m.timestamp > now - hour && 
    m.value && 
    typeof m.value === 'object' && 
    category in m.value
  );
  
  const previousHour = metrics.filter(m => 
    m.timestamp > now - 2 * hour && 
    m.timestamp <= now - hour && 
    m.value && 
    typeof m.value === 'object' && 
    category in m.value
  );
  
  const currentValue = currentHour.reduce((sum, m) => {
    if (typeof m.value === 'object' && m.value[category]) {
      return sum + (m.value[category] as number);
    }
    return sum;
  }, 0);
  
  const previousValue = previousHour.reduce((sum, m) => {
    if (typeof m.value === 'object' && m.value[category]) {
      return sum + (m.value[category] as number);
    }
    return sum;
  }, 0);
  
  const change = currentValue - previousValue;
  const changePercent = previousValue > 0 ? (change / previousValue) * 100 : 0;
  
  return {
    current: currentValue,
    previous: previousValue,
    change,
    changePercent
  };
}
