// Basic test for Analytics Dashboard core functionality
import { describe, it, expect } from 'vitest';
import { MetricsEngine } from '../src/core/MetricsEngine';
import { BusinessROICalculator } from '../src/core/BusinessROICalculator';
import { UserExperienceScorer } from '../src/core/UserExperienceScorer';
import { ErrorImpactAnalyzer } from '../src/core/ErrorImpactAnalyzer';
import { formatMetricValue, calculatePercentageChange } from '../src/utils';

describe('Analytics Dashboard Core', () => {
  it('should create MetricsEngine instance', () => {
    const engine = new MetricsEngine();
    expect(engine).toBeDefined();
  });

  it('should create BusinessROICalculator instance', () => {
    const calculator = new BusinessROICalculator();
    expect(calculator).toBeDefined();
  });

  it('should create UserExperienceScorer instance', () => {
    const scorer = new UserExperienceScorer();
    expect(scorer).toBeDefined();
  });

  it('should create ErrorImpactAnalyzer instance', () => {
    const analyzer = new ErrorImpactAnalyzer();
    expect(analyzer).toBeDefined();
  });

  it('should format metric values correctly', () => {
    expect(formatMetricValue(1500, 'ms')).toBe('1.50s');
    expect(formatMetricValue(85.5, '%')).toBe('85.50%');
    expect(formatMetricValue(1024, 'bytes')).toBe('1.00 KB');
    expect(formatMetricValue(1000000, '')).toBe('1.00M ');
  });

  it('should calculate percentage change correctly', () => {
    expect(calculatePercentageChange(110, 100)).toBe(10);
    expect(calculatePercentageChange(90, 100)).toBe(-10);
    expect(calculatePercentageChange(100, 0)).toBe(100);
  });

  it('should calculate ROI correctly', () => {
    const calculator = new BusinessROICalculator();
    const roi = calculator.calculateROI(10000, 5000, 3000, 2);
    
    expect(roi.roi).toBeGreaterThan(0);
    expect(roi.investment).toBe(10000);
    expect(roi.paybackPeriod).toBeGreaterThan(0);
    expect(roi.netPresentValue).toBeDefined();
  });

  it('should register and process metrics', () => {
    const engine = new MetricsEngine();
    
    engine.registerMetric({
      id: 'test-metric',
      name: 'Test Metric',
      description: 'A test metric',
      category: 'performance',
      aggregationType: 'avg',
      unit: 'ms',
      refreshInterval: 5000,
      isRealTime: true
    });

    engine.addDataPoint('test-metric', {
      value: 150,
      timestamp: Date.now(),
      source: 'test'
    });

    const value = engine.getAggregatedValue('test-metric');
    expect(value).toBe(150);
  });

  it('should score user experience metrics', () => {
    const scorer = new UserExperienceScorer();
    
    const uxMetric = {
      sessionId: 'test-session',
      pageLoadTime: 2000,
      timeToInteractive: 3000,
      cumulativeLayoutShift: 0.1,
      firstContentfulPaint: 1500,
      largestContentfulPaint: 2500,
      bounceRate: 25,
      pageViews: 5,
      errorCount: 1,
      timestamp: Date.now(),
      conversionRate: 2.5,
      userSatisfactionScore: 4.2,
      clickDepth: 3,
      sessionDuration: 180000,
      userAgent: 'test-agent',
      score: 0
    };

    const score = scorer.calculateScore(uxMetric);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('should analyze error impact', () => {
    const analyzer = new ErrorImpactAnalyzer();
    
    const errorData = {
      errorId: 'test-error',
      message: 'Test error message',
      timestamp: Date.now(),
      severity: 'medium' as const,
      affectedUsers: 10,
      frequency: 5
    };

    const impact = analyzer.analyzeErrorImpact(errorData);
    expect(impact.businessImpact).toBeDefined();
    expect(impact.businessImpact.revenueImpact).toBeGreaterThanOrEqual(0);
    expect(impact.businessImpact.operationalCost).toBeGreaterThanOrEqual(0);
    expect(impact.businessImpact.userExperienceScore).toBeGreaterThanOrEqual(0);
  });
});
