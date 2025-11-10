import { UserExperienceMetric } from '../types';

/**
 * UserExperienceScorer - Calculate and analyze user experience scores
 * Based on Core Web Vitals and custom UX metrics
 */
export class UserExperienceScorer {
  private weights = {
    pageLoadTime: 0.2,
    timeToInteractive: 0.2,
    cumulativeLayoutShift: 0.15,
    firstContentfulPaint: 0.15,
    largestContentfulPaint: 0.15,
    errorRate: 0.1,
    sessionDepth: 0.05,
  };

  /**
   * Calculate overall UX score for a user session
   */
  calculateScore(metric: UserExperienceMetric): number {
    const scores = {
      pageLoadTime: this.scorePageLoadTime(metric.pageLoadTime),
      timeToInteractive: this.scoreTimeToInteractive(metric.timeToInteractive),
      cumulativeLayoutShift: this.scoreCLS(metric.cumulativeLayoutShift),
      firstContentfulPaint: this.scoreFCP(metric.firstContentfulPaint),
      largestContentfulPaint: this.scoreLCP(metric.largestContentfulPaint),
      errorRate: this.scoreErrorRate(metric.errorCount, metric.sessionDuration),
      sessionDepth: this.scoreSessionDepth(metric.clickDepth, metric.sessionDuration),
    };

    let totalScore = 0;
    for (const [metric, weight] of Object.entries(this.weights)) {
      totalScore += scores[metric as keyof typeof scores] * weight;
    }

    return Math.round(totalScore * 100) / 100;
  }

  /**
   * Calculate aggregated UX score for multiple sessions
   */
  calculateAggregatedScore(metrics: UserExperienceMetric[]): {
    averageScore: number;
    distribution: { range: string; count: number; percentage: number }[];
    trendAnalysis: { timePoint: number; score: number }[];
    insights: string[];
  } {
    if (metrics.length === 0) {
      return {
        averageScore: 0,
        distribution: [],
        trendAnalysis: [],
        insights: ['No data available for analysis'],
      };
    }

    const scores = metrics.map((m) => this.calculateScore(m));
    const averageScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;

    // Score distribution
    const distribution = this.calculateScoreDistribution(scores);

    // Trend analysis (group by hour)
    const trendAnalysis = this.calculateTrendAnalysis(metrics);

    // Generate insights
    const insights = this.generateInsights(metrics, averageScore);

    return {
      averageScore: Math.round(averageScore * 100) / 100,
      distribution,
      trendAnalysis,
      insights,
    };
  }

  /**
   * Identify problematic areas in user experience
   */
  identifyProblematicAreas(metrics: UserExperienceMetric[]): {
    area: string;
    impact: 'high' | 'medium' | 'low';
    averageValue: number;
    recommendedThreshold: number;
    affectedSessions: number;
    suggestions: string[];
  }[] {
    const problems: {
      area: string;
      impact: 'high' | 'medium' | 'low';
      averageValue: number;
      recommendedThreshold: number;
      affectedSessions: number;
      suggestions: string[];
    }[] = [];

    if (metrics.length === 0) return problems;

    // Analyze page load time
    const avgPageLoadTime = metrics.reduce((sum, m) => sum + m.pageLoadTime, 0) / metrics.length;
    const slowPageLoads = metrics.filter((m) => m.pageLoadTime > 3000).length;
    if (avgPageLoadTime > 2000) {
      problems.push({
        area: 'Page Load Time',
        impact: avgPageLoadTime > 4000 ? 'high' : 'medium',
        averageValue: avgPageLoadTime,
        recommendedThreshold: 2000,
        affectedSessions: slowPageLoads,
        suggestions: [
          'Optimize image sizes and formats',
          'Implement code splitting and lazy loading',
          'Enable compression and caching',
          'Optimize database queries',
        ],
      });
    }

    // Analyze Largest Contentful Paint
    const avgLCP = metrics.reduce((sum, m) => sum + m.largestContentfulPaint, 0) / metrics.length;
    const slowLCP = metrics.filter((m) => m.largestContentfulPaint > 2500).length;
    if (avgLCP > 2500) {
      problems.push({
        area: 'Largest Contentful Paint',
        impact: avgLCP > 4000 ? 'high' : 'medium',
        averageValue: avgLCP,
        recommendedThreshold: 2500,
        affectedSessions: slowLCP,
        suggestions: [
          'Optimize largest image or text block',
          'Improve server response times',
          'Remove blocking resources',
          'Use faster hosting',
        ],
      });
    }

    // Analyze Cumulative Layout Shift
    const avgCLS = metrics.reduce((sum, m) => sum + m.cumulativeLayoutShift, 0) / metrics.length;
    const highCLS = metrics.filter((m) => m.cumulativeLayoutShift > 0.1).length;
    if (avgCLS > 0.1) {
      problems.push({
        area: 'Cumulative Layout Shift',
        impact: avgCLS > 0.25 ? 'high' : 'medium',
        averageValue: avgCLS,
        recommendedThreshold: 0.1,
        affectedSessions: highCLS,
        suggestions: [
          'Add size attributes to images and videos',
          'Reserve space for dynamic content',
          'Avoid inserting content above existing content',
          'Use transform animations instead of changing layout properties',
        ],
      });
    }

    // Analyze error rate
    const avgErrorRate =
      metrics.reduce((sum, m) => sum + m.errorCount / (m.sessionDuration / 60000), 0) /
      metrics.length;
    const highErrorSessions = metrics.filter((m) => m.errorCount > 2).length;
    if (avgErrorRate > 0.5) {
      problems.push({
        area: 'Error Rate',
        impact: avgErrorRate > 2 ? 'high' : 'medium',
        averageValue: avgErrorRate,
        recommendedThreshold: 0.5,
        affectedSessions: highErrorSessions,
        suggestions: [
          'Implement comprehensive error handling',
          'Add input validation',
          'Improve API error responses',
          'Add user-friendly error messages',
        ],
      });
    }

    return problems.sort((a, b) => {
      const impactWeight = { high: 3, medium: 2, low: 1 };
      return impactWeight[b.impact] - impactWeight[a.impact];
    });
  }

  /**
   * Generate UX improvement recommendations
   */
  generateRecommendations(metrics: UserExperienceMetric[]): {
    priority: 'high' | 'medium' | 'low';
    category: string;
    title: string;
    description: string;
    estimatedImpact: string;
    effort: 'low' | 'medium' | 'high';
  }[] {
    const problems = this.identifyProblematicAreas(metrics);
    const recommendations: {
      priority: 'high' | 'medium' | 'low';
      category: string;
      title: string;
      description: string;
      estimatedImpact: string;
      effort: 'low' | 'medium' | 'high';
    }[] = [];

    problems.forEach((problem) => {
      problem.suggestions.forEach((suggestion, index) => {
        recommendations.push({
          priority: index === 0 ? problem.impact : 'medium',
          category: problem.area,
          title: suggestion,
          description: `Addressing ${problem.area.toLowerCase()} issues affecting ${problem.affectedSessions} sessions`,
          estimatedImpact: problem.impact === 'high' ? '+15-25 UX score' : '+5-15 UX score',
          effort: index === 0 ? 'medium' : 'high',
        });
      });
    });

    return recommendations.slice(0, 10); // Return top 10 recommendations
  }

  /**
   * Set custom weights for UX scoring
   */
  setWeights(weights: Partial<typeof this.weights>): void {
    this.weights = { ...this.weights, ...weights };
  }

  private scorePageLoadTime(loadTime: number): number {
    // Excellent: <1s = 100, Good: <2s = 80, Needs improvement: <4s = 60, Poor: >4s = 0
    if (loadTime < 1000) return 100;
    if (loadTime < 2000) return 80 + ((1000 - (loadTime - 1000)) / 1000) * 20;
    if (loadTime < 4000) return 60 + ((2000 - (loadTime - 2000)) / 2000) * 20;
    return Math.max(0, 60 - ((loadTime - 4000) / 2000) * 60);
  }

  private scoreTimeToInteractive(tti: number): number {
    if (tti < 2000) return 100;
    if (tti < 4000) return 80 + ((2000 - (tti - 2000)) / 2000) * 20;
    if (tti < 6000) return 60 + ((4000 - (tti - 4000)) / 2000) * 20;
    return Math.max(0, 60 - ((tti - 6000) / 3000) * 60);
  }

  private scoreCLS(cls: number): number {
    // Good: <0.1 = 100, Needs improvement: <0.25 = 60, Poor: >0.25 = 0
    if (cls < 0.1) return 100;
    if (cls < 0.25) return 60 + ((0.1 - (cls - 0.1)) / 0.15) * 40;
    return Math.max(0, 60 - ((cls - 0.25) / 0.25) * 60);
  }

  private scoreFCP(fcp: number): number {
    if (fcp < 1800) return 100;
    if (fcp < 3000) return 80 + ((1800 - (fcp - 1800)) / 1200) * 20;
    return Math.max(0, 80 - ((fcp - 3000) / 2000) * 80);
  }

  private scoreLCP(lcp: number): number {
    if (lcp < 2500) return 100;
    if (lcp < 4000) return 80 + ((2500 - (lcp - 2500)) / 1500) * 20;
    return Math.max(0, 80 - ((lcp - 4000) / 2000) * 80);
  }

  private scoreErrorRate(errorCount: number, sessionDuration: number): number {
    const errorsPerMinute = errorCount / (sessionDuration / 60000);
    if (errorsPerMinute === 0) return 100;
    if (errorsPerMinute < 0.5) return 80;
    if (errorsPerMinute < 1) return 60;
    return Math.max(0, 60 - (errorsPerMinute - 1) * 20);
  }

  private scoreSessionDepth(clickDepth: number, sessionDuration: number): number {
    const clicksPerMinute = clickDepth / (sessionDuration / 60000);
    // Optimal engagement: 1-3 clicks per minute
    if (clicksPerMinute >= 1 && clicksPerMinute <= 3) return 100;
    if (clicksPerMinute < 1) return clicksPerMinute * 100;
    return Math.max(0, 100 - (clicksPerMinute - 3) * 20);
  }

  private calculateScoreDistribution(
    scores: number[],
  ): { range: string; count: number; percentage: number }[] {
    const ranges = [
      { range: '90-100', min: 90, max: 100 },
      { range: '80-89', min: 80, max: 89 },
      { range: '70-79', min: 70, max: 79 },
      { range: '60-69', min: 60, max: 69 },
      { range: '0-59', min: 0, max: 59 },
    ];

    return ranges.map((range) => {
      const count = scores.filter((score) => score >= range.min && score <= range.max).length;
      return {
        range: range.range,
        count,
        percentage: Math.round((count / scores.length) * 100 * 100) / 100,
      };
    });
  }

  private calculateTrendAnalysis(
    metrics: UserExperienceMetric[],
  ): { timePoint: number; score: number }[] {
    // Group by hour
    const hourlyData = new Map<number, UserExperienceMetric[]>();

    metrics.forEach((metric) => {
      const hour = Math.floor(metric.timestamp / (1000 * 60 * 60));
      if (!hourlyData.has(hour)) {
        hourlyData.set(hour, []);
      }
      hourlyData.get(hour)!.push(metric);
    });

    const trendPoints: { timePoint: number; score: number }[] = [];

    for (const [hour, hourMetrics] of hourlyData) {
      const averageScore =
        hourMetrics.reduce((sum, m) => sum + this.calculateScore(m), 0) / hourMetrics.length;
      trendPoints.push({
        timePoint: hour * 1000 * 60 * 60, // Convert back to timestamp
        score: Math.round(averageScore * 100) / 100,
      });
    }

    return trendPoints.sort((a, b) => a.timePoint - b.timePoint);
  }

  private generateInsights(metrics: UserExperienceMetric[], averageScore: number): string[] {
    const insights: string[] = [];

    if (averageScore >= 90) {
      insights.push('Excellent user experience! Your application is performing at the top tier.');
    } else if (averageScore >= 80) {
      insights.push('Good user experience with room for optimization.');
    } else if (averageScore >= 70) {
      insights.push('Average user experience. Consider prioritizing performance improvements.');
    } else {
      insights.push('Poor user experience detected. Immediate optimization required.');
    }

    // Mobile vs Desktop analysis
    const mobileMetrics = metrics.filter((m) => /Mobile|Android|iPhone/.test(m.userAgent));
    if (mobileMetrics.length > 0) {
      const mobileScore =
        mobileMetrics.reduce((sum, m) => sum + this.calculateScore(m), 0) / mobileMetrics.length;
      const desktopScore =
        metrics
          .filter((m) => !/Mobile|Android|iPhone/.test(m.userAgent))
          .reduce((sum, m) => sum + this.calculateScore(m), 0) /
        (metrics.length - mobileMetrics.length);

      if (mobileScore < desktopScore - 10) {
        insights.push(
          'Mobile experience is significantly worse than desktop. Focus on mobile optimization.',
        );
      }
    }

    // Time-based insights
    const peakHours = this.identifyPeakPerformanceIssues(metrics);
    if (peakHours.length > 0) {
      insights.push(`Performance issues are more common during ${peakHours.join(', ')} hours.`);
    }

    return insights;
  }

  private identifyPeakPerformanceIssues(metrics: UserExperienceMetric[]): string[] {
    const hourlyProblems = new Map<number, number>();

    metrics.forEach((metric) => {
      const hour = new Date(metric.timestamp).getHours();
      const score = this.calculateScore(metric);

      if (score < 70) {
        // Consider scores below 70 as problematic
        hourlyProblems.set(hour, (hourlyProblems.get(hour) || 0) + 1);
      }
    });

    const totalProblems = Array.from(hourlyProblems.values()).reduce(
      (sum, count) => sum + count,
      0,
    );
    const problemHours: string[] = [];

    for (const [hour, count] of hourlyProblems) {
      if (count / totalProblems > 0.15) {
        // If more than 15% of problems occur in this hour
        problemHours.push(`${hour}:00-${hour + 1}:00`);
      }
    }

    return problemHours;
  }
}
