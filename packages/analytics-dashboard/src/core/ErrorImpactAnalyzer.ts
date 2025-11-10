import { ErrorImpactData } from '../types';

/**
 * ErrorImpactAnalyzer - Analyze error impact on business and user experience
 * Provides comprehensive error classification and business impact assessment
 */
export class ErrorImpactAnalyzer {
  private errorPatterns: Map<string, { count: number; lastSeen: number; classification: string }> =
    new Map();
  private businessMetrics = {
    averageRevenuePerUser: 50, // $50 per month
    averageSessionValue: 5, // $5 per session
    supportCostPerTicket: 25, // $25 per support ticket
    developerHourlyRate: 75, // $75 per hour
  };

  /**
   * Analyze error impact and classify by business severity
   */
  analyzeErrorImpact(error: Omit<ErrorImpactData, 'businessImpact'>): ErrorImpactData {
    const errorPattern = this.extractErrorPattern(error.message, error.stack);
    this.updateErrorPatterns(errorPattern, error.timestamp);

    const businessImpact = this.calculateBusinessImpact(error, errorPattern);
    const severity = this.determineSeverity(error, businessImpact);

    return {
      ...error,
      severity,
      businessImpact,
    };
  }

  /**
   * Get comprehensive error analytics for a time period
   */
  getErrorAnalytics(
    errors: ErrorImpactData[],
    timeRange: { start: number; end: number },
  ): {
    totalErrors: number;
    uniqueErrors: number;
    errorsByCategory: { category: string; count: number; impact: number }[];
    topErrorsByImpact: ErrorImpactData[];
    errorTrends: { timestamp: number; count: number; impact: number }[];
    resolutionMetrics: {
      averageResolutionTime: number;
      resolvedPercentage: number;
      escalatedPercentage: number;
    };
    businessImpactSummary: {
      totalRevenueImpact: number;
      totalOperationalCost: number;
      affectedUsersTotal: number;
      estimatedLostSessions: number;
    };
  } {
    const filteredErrors = errors.filter(
      (error) => error.timestamp >= timeRange.start && error.timestamp <= timeRange.end,
    );

    if (filteredErrors.length === 0) {
      return {
        totalErrors: 0,
        uniqueErrors: 0,
        errorsByCategory: [],
        topErrorsByImpact: [],
        errorTrends: [],
        resolutionMetrics: {
          averageResolutionTime: 0,
          resolvedPercentage: 0,
          escalatedPercentage: 0,
        },
        businessImpactSummary: {
          totalRevenueImpact: 0,
          totalOperationalCost: 0,
          affectedUsersTotal: 0,
          estimatedLostSessions: 0,
        },
      };
    }

    const totalErrors = filteredErrors.length;
    const uniqueErrors = new Set(filteredErrors.map((e) => e.errorId)).size;

    // Categorize errors
    const errorsByCategory = this.categorizeErrors(filteredErrors);

    // Top errors by business impact
    const topErrorsByImpact = [...filteredErrors]
      .sort((a, b) => this.calculateTotalImpact(b) - this.calculateTotalImpact(a))
      .slice(0, 10);

    // Error trends (hourly)
    const errorTrends = this.calculateErrorTrends(filteredErrors);

    // Resolution metrics
    const resolutionMetrics = this.calculateResolutionMetrics(filteredErrors);

    // Business impact summary
    const businessImpactSummary = this.calculateBusinessImpactSummary(filteredErrors);

    return {
      totalErrors,
      uniqueErrors,
      errorsByCategory,
      topErrorsByImpact,
      errorTrends,
      resolutionMetrics,
      businessImpactSummary,
    };
  }

  /**
   * Predict error impact and suggest prevention strategies
   */
  predictErrorImpact(
    errorMessage: string,
    frequency: number,
    affectedUsers: number,
  ): {
    predictedSeverity: 'low' | 'medium' | 'high' | 'critical';
    estimatedBusinessImpact: number;
    preventionStrategies: string[];
    recommendedActions: {
      immediate: string[];
      shortTerm: string[];
      longTerm: string[];
    };
  } {
    const errorType = this.classifyErrorType(errorMessage);
    const predictedSeverity = this.predictSeverity(frequency, affectedUsers, errorType);
    const estimatedBusinessImpact = this.estimateBusinessImpact(
      frequency,
      affectedUsers,
      errorType,
    );

    const preventionStrategies = this.generatePreventionStrategies(errorType);
    const recommendedActions = this.generateRecommendedActions(predictedSeverity, errorType);

    return {
      predictedSeverity,
      estimatedBusinessImpact,
      preventionStrategies,
      recommendedActions,
    };
  }

  /**
   * Generate error prevention recommendations
   */
  generateErrorPreventionPlan(errors: ErrorImpactData[]): {
    priority: 'high' | 'medium' | 'low';
    category: string;
    issue: string;
    solution: string;
    estimatedEffort: 'low' | 'medium' | 'high';
    potentialImpactReduction: number;
    implementationSteps: string[];
  }[] {
    const errorCategories = this.categorizeErrors(errors);
    const recommendations: {
      priority: 'high' | 'medium' | 'low';
      category: string;
      issue: string;
      solution: string;
      estimatedEffort: 'low' | 'medium' | 'high';
      potentialImpactReduction: number;
      implementationSteps: string[];
    }[] = [];

    errorCategories.forEach((category) => {
      const categoryErrors = errors.filter(
        (e) => this.classifyErrorType(e.message) === category.category,
      );
      const totalImpact = categoryErrors.reduce((sum, e) => sum + this.calculateTotalImpact(e), 0);

      if (totalImpact > 1000) {
        // High impact threshold
        const recommendation = this.generateCategoryRecommendation(category.category, totalImpact);
        recommendations.push(recommendation);
      }
    });

    return recommendations.sort((a, b) => {
      const priorityWeight = { high: 3, medium: 2, low: 1 };
      return priorityWeight[b.priority] - priorityWeight[a.priority];
    });
  }

  /**
   * Set custom business metrics for impact calculation
   */
  setBusinessMetrics(metrics: Partial<typeof this.businessMetrics>): void {
    this.businessMetrics = { ...this.businessMetrics, ...metrics };
  }

  private extractErrorPattern(message: string, stack?: string): string {
    // Extract key parts of error for pattern recognition
    const messagePattern = message.replace(/\d+/g, 'NUM').replace(/['"]/g, '');
    const stackPattern = stack ? stack.split('\n')[0]?.replace(/:\d+/g, ':LINE') || '' : '';
    return `${messagePattern}|${stackPattern}`;
  }

  private updateErrorPatterns(pattern: string, timestamp: number): void {
    const existing = this.errorPatterns.get(pattern);
    if (existing) {
      existing.count++;
      existing.lastSeen = timestamp;
    } else {
      this.errorPatterns.set(pattern, {
        count: 1,
        lastSeen: timestamp,
        classification: this.classifyErrorType(pattern),
      });
    }
  }

  private calculateBusinessImpact(
    error: Omit<ErrorImpactData, 'businessImpact'>,
    pattern: string,
  ): ErrorImpactData['businessImpact'] {
    const patternData = this.errorPatterns.get(pattern);
    const frequency = patternData?.count || 1;

    // Revenue impact calculation
    const sessionLossMultiplier = this.getSessionLossMultiplier(error.severity);
    const estimatedLostSessions = error.affectedUsers * sessionLossMultiplier;
    const revenueImpact = estimatedLostSessions * this.businessMetrics.averageSessionValue;

    // User experience impact (0-100 scale)
    const uxImpact = this.calculateUXImpact(error.severity, frequency, error.affectedUsers);

    // Operational cost (support + development)
    const supportTickets = Math.min(error.affectedUsers * 0.1, error.affectedUsers); // 10% of users create tickets
    const supportCost = supportTickets * this.businessMetrics.supportCostPerTicket;

    const developmentHours = this.estimateDevelopmentTime(error.severity, frequency);
    const developmentCost = developmentHours * this.businessMetrics.developerHourlyRate;

    const operationalCost = supportCost + developmentCost;

    return {
      revenueImpact: Math.round(revenueImpact * 100) / 100,
      userExperienceScore: uxImpact,
      operationalCost: Math.round(operationalCost * 100) / 100,
    };
  }

  private determineSeverity(
    error: Omit<ErrorImpactData, 'businessImpact'>,
    businessImpact: ErrorImpactData['businessImpact'],
  ): 'low' | 'medium' | 'high' | 'critical' {
    const totalImpact = businessImpact.revenueImpact + businessImpact.operationalCost;
    const uxScore = businessImpact.userExperienceScore;

    if (totalImpact > 5000 || uxScore < 20 || error.affectedUsers > 1000) {
      return 'critical';
    } else if (totalImpact > 1000 || uxScore < 50 || error.affectedUsers > 100) {
      return 'high';
    } else if (totalImpact > 100 || uxScore < 70 || error.affectedUsers > 10) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  private classifyErrorType(message: string): string {
    const lowerMessage = message.toLowerCase();

    if (
      lowerMessage.includes('network') ||
      lowerMessage.includes('fetch') ||
      lowerMessage.includes('cors')
    ) {
      return 'network';
    } else if (
      lowerMessage.includes('syntax') ||
      lowerMessage.includes('reference') ||
      lowerMessage.includes('type')
    ) {
      return 'javascript';
    } else if (
      lowerMessage.includes('401') ||
      lowerMessage.includes('403') ||
      lowerMessage.includes('auth')
    ) {
      return 'authentication';
    } else if (
      lowerMessage.includes('500') ||
      lowerMessage.includes('502') ||
      lowerMessage.includes('503')
    ) {
      return 'server';
    } else if (lowerMessage.includes('timeout') || lowerMessage.includes('slow')) {
      return 'performance';
    } else if (
      lowerMessage.includes('validation') ||
      lowerMessage.includes('required') ||
      lowerMessage.includes('invalid')
    ) {
      return 'validation';
    } else {
      return 'other';
    }
  }

  private getSessionLossMultiplier(severity: string): number {
    switch (severity) {
      case 'critical':
        return 0.8;
      case 'high':
        return 0.5;
      case 'medium':
        return 0.2;
      case 'low':
        return 0.05;
      default:
        return 0.1;
    }
  }

  private calculateUXImpact(severity: string, frequency: number, affectedUsers: number): number {
    const severityWeight = { critical: 0.9, high: 0.7, medium: 0.5, low: 0.2 };
    const frequencyImpact = Math.min(frequency / 100, 1); // Normalize frequency
    const userImpact = Math.min(affectedUsers / 1000, 1); // Normalize user count

    const baseScore = 100;
    const impact = severityWeight[severity as keyof typeof severityWeight] || 0.2;

    return Math.max(0, baseScore - impact * frequencyImpact * userImpact * 100);
  }

  private estimateDevelopmentTime(severity: string, frequency: number): number {
    const baseHours = { critical: 16, high: 8, medium: 4, low: 2 };
    const complexityMultiplier = Math.min(Math.log10(frequency + 1), 2); // Logarithmic complexity

    return (baseHours[severity as keyof typeof baseHours] || 2) * (1 + complexityMultiplier);
  }

  private categorizeErrors(
    errors: ErrorImpactData[],
  ): { category: string; count: number; impact: number }[] {
    const categories = new Map<string, { count: number; impact: number }>();

    errors.forEach((error) => {
      const category = this.classifyErrorType(error.message);
      const existing = categories.get(category) || { count: 0, impact: 0 };

      existing.count++;
      existing.impact += this.calculateTotalImpact(error);
      categories.set(category, existing);
    });

    return Array.from(categories.entries()).map(([category, data]) => ({
      category,
      count: data.count,
      impact: Math.round(data.impact * 100) / 100,
    }));
  }

  private calculateTotalImpact(error: ErrorImpactData): number {
    return error.businessImpact.revenueImpact + error.businessImpact.operationalCost;
  }

  private calculateErrorTrends(
    errors: ErrorImpactData[],
  ): { timestamp: number; count: number; impact: number }[] {
    const hourlyData = new Map<number, { count: number; impact: number }>();

    errors.forEach((error) => {
      const hour = Math.floor(error.timestamp / (1000 * 60 * 60)) * (1000 * 60 * 60);
      const existing = hourlyData.get(hour) || { count: 0, impact: 0 };

      existing.count++;
      existing.impact += this.calculateTotalImpact(error);
      hourlyData.set(hour, existing);
    });

    return Array.from(hourlyData.entries())
      .map(([timestamp, data]) => ({
        timestamp,
        count: data.count,
        impact: Math.round(data.impact * 100) / 100,
      }))
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  private calculateResolutionMetrics(errors: ErrorImpactData[]) {
    const resolvedErrors = errors.filter((e) => e.resolution?.status === 'resolved');
    const inProgressErrors = errors.filter((e) => e.resolution?.status === 'in-progress');

    const resolutionTimes = resolvedErrors
      .filter((e) => e.resolution?.estimatedResolutionTime)
      .map((e) => e.resolution!.estimatedResolutionTime!);

    const averageResolutionTime =
      resolutionTimes.length > 0
        ? resolutionTimes.reduce((sum, time) => sum + time, 0) / resolutionTimes.length
        : 0;

    return {
      averageResolutionTime: Math.round(averageResolutionTime * 100) / 100,
      resolvedPercentage: Math.round((resolvedErrors.length / errors.length) * 100 * 100) / 100,
      escalatedPercentage: Math.round((inProgressErrors.length / errors.length) * 100 * 100) / 100,
    };
  }

  private calculateBusinessImpactSummary(errors: ErrorImpactData[]) {
    return {
      totalRevenueImpact:
        Math.round(errors.reduce((sum, e) => sum + e.businessImpact.revenueImpact, 0) * 100) / 100,
      totalOperationalCost:
        Math.round(errors.reduce((sum, e) => sum + e.businessImpact.operationalCost, 0) * 100) /
        100,
      affectedUsersTotal: errors.reduce((sum, e) => sum + e.affectedUsers, 0),
      estimatedLostSessions: Math.round(
        errors.reduce(
          (sum, e) => sum + e.affectedUsers * this.getSessionLossMultiplier(e.severity),
          0,
        ),
      ),
    };
  }

  private predictSeverity(
    frequency: number,
    affectedUsers: number,
    errorType: string,
  ): 'low' | 'medium' | 'high' | 'critical' {
    const typeMultiplier = {
      server: 1.5,
      authentication: 1.3,
      network: 1.2,
      performance: 1.1,
      javascript: 1.0,
      validation: 0.8,
      other: 0.9,
    };

    const score =
      (frequency * 0.4 + affectedUsers * 0.6) *
      (typeMultiplier[errorType as keyof typeof typeMultiplier] || 1);

    if (score > 500) return 'critical';
    if (score > 100) return 'high';
    if (score > 20) return 'medium';
    return 'low';
  }

  private estimateBusinessImpact(
    frequency: number,
    affectedUsers: number,
    errorType: string,
  ): number {
    const baseImpact = frequency * 10 + affectedUsers * 50;
    const typeMultiplier = {
      server: 2.0,
      authentication: 1.8,
      network: 1.5,
      performance: 1.3,
      javascript: 1.0,
      validation: 0.7,
      other: 0.9,
    };

    return baseImpact * (typeMultiplier[errorType as keyof typeof typeMultiplier] || 1);
  }

  private generatePreventionStrategies(errorType: string): string[] {
    const strategies: Record<string, string[]> = {
      network: [
        'Implement retry logic with exponential backoff',
        'Add network connectivity detection',
        'Use service workers for offline functionality',
        'Implement request caching strategies',
      ],
      javascript: [
        'Add comprehensive TypeScript typing',
        'Implement better error boundaries',
        'Add runtime type checking',
        'Improve code review processes',
      ],
      authentication: [
        'Implement token refresh mechanisms',
        'Add proper session management',
        'Improve authentication error handling',
        'Add multi-factor authentication',
      ],
      server: [
        'Implement health checks and monitoring',
        'Add load balancing and redundancy',
        'Improve error handling and logging',
        'Add circuit breaker patterns',
      ],
      performance: [
        'Implement performance monitoring',
        'Add resource optimization',
        'Use lazy loading strategies',
        'Optimize database queries',
      ],
      validation: [
        'Add client-side validation',
        'Improve user feedback mechanisms',
        'Add input sanitization',
        'Implement progressive validation',
      ],
    };

    return (
      strategies[errorType] ||
      strategies['other'] || [
        'Implement comprehensive logging',
        'Add error monitoring and alerting',
        'Improve testing coverage',
        'Add user feedback mechanisms',
      ]
    );
  }

  private generateRecommendedActions(severity: string, _errorType: string) {
    const actions = {
      immediate: [] as string[],
      shortTerm: [] as string[],
      longTerm: [] as string[],
    };

    if (severity === 'critical') {
      actions.immediate = [
        'Create incident response team',
        'Implement immediate hotfix',
        'Notify affected users',
        'Escalate to senior team',
      ];
    }

    if (severity === 'high' || severity === 'critical') {
      actions.shortTerm = [
        'Conduct root cause analysis',
        'Implement monitoring for similar issues',
        'Update error handling procedures',
        'Review and test fix thoroughly',
      ];
    }

    actions.longTerm = [
      'Review and improve error prevention processes',
      'Update testing strategies',
      'Implement better monitoring',
      'Conduct team training on error prevention',
    ];

    return actions;
  }

  private generateCategoryRecommendation(category: string, totalImpact: number) {
    const recommendations: Record<string, any> = {
      network: {
        priority: 'high' as const,
        issue: 'Network connectivity and API reliability issues',
        solution: 'Implement robust network error handling and retry mechanisms',
        estimatedEffort: 'medium' as const,
        implementationSteps: [
          'Add retry logic with exponential backoff',
          'Implement network status detection',
          'Add offline mode support',
          'Create network error monitoring dashboard',
        ],
      },
      javascript: {
        priority: 'medium' as const,
        issue: 'JavaScript runtime errors and type issues',
        solution: 'Strengthen TypeScript usage and error boundaries',
        estimatedEffort: 'high' as const,
        implementationSteps: [
          'Add strict TypeScript configuration',
          'Implement React error boundaries',
          'Add runtime type validation',
          'Increase test coverage for edge cases',
        ],
      },
      server: {
        priority: 'high' as const,
        issue: 'Server errors and API failures',
        solution: 'Improve server monitoring and resilience',
        estimatedEffort: 'high' as const,
        implementationSteps: [
          'Add comprehensive health checks',
          'Implement circuit breaker patterns',
          'Add request/response logging',
          'Set up automated alerts for server issues',
        ],
      },
    };

    const defaultRecommendation = {
      priority: 'medium' as const,
      issue: `${category} related errors causing significant impact`,
      solution: 'Implement category-specific error prevention measures',
      estimatedEffort: 'medium' as const,
      implementationSteps: [
        'Analyze error patterns',
        'Implement specific error handling',
        'Add monitoring and alerting',
        'Create prevention strategies',
      ],
    };

    const recommendation = recommendations[category] || defaultRecommendation;

    return {
      ...recommendation,
      category,
      potentialImpactReduction: Math.min(totalImpact * 0.7, totalImpact), // Up to 70% reduction
    };
  }
}
