import { ROICalculation } from '../types';

/**
 * BusinessROICalculator - Calculate Return on Investment for various business initiatives
 * Provides comprehensive ROI analysis with multiple financial metrics
 */
export class BusinessROICalculator {
  private discountRate: number = 0.1; // 10% default discount rate

  /**
   * Calculate ROI for a business initiative
   */
  calculateROI(
    investment: number,
    annualRevenue: number,
    annualCostSavings: number,
    timeframeYears: number,
    breakdown?: { category: string; value: number }[],
  ): ROICalculation {
    const totalRevenue = annualRevenue * timeframeYears;
    const totalCostSavings = annualCostSavings * timeframeYears;
    const totalBenefits = totalRevenue + totalCostSavings;

    // Basic ROI calculation
    const roi = investment > 0 ? ((totalBenefits - investment) / investment) * 100 : 0;

    // Payback period calculation
    const annualBenefits = annualRevenue + annualCostSavings;
    const paybackPeriod = annualBenefits > 0 ? (investment / annualBenefits) * 12 : 0; // in months

    // Net Present Value calculation
    const npv = this.calculateNPV(investment, annualBenefits, timeframeYears);

    // Create breakdown by category
    const breakdownByCategory = breakdown
      ? this.calculateBreakdown(breakdown, totalBenefits)
      : [
          {
            category: 'Revenue',
            value: totalRevenue,
            percentage: (totalRevenue / totalBenefits) * 100,
          },
          {
            category: 'Cost Savings',
            value: totalCostSavings,
            percentage: (totalCostSavings / totalBenefits) * 100,
          },
        ];

    return {
      investment,
      revenue: totalRevenue,
      costSavings: totalCostSavings,
      timeframe: `${timeframeYears} year${timeframeYears > 1 ? 's' : ''}`,
      roi: Math.round(roi * 100) / 100,
      paybackPeriod: Math.round(paybackPeriod * 100) / 100,
      netPresentValue: Math.round(npv * 100) / 100,
      breakdownByCategory,
    };
  }

  /**
   * Calculate ROI for performance improvements
   */
  calculatePerformanceROI(performanceImprovementData: {
    pageLoadTimeReduction: number; // in seconds
    errorRateReduction: number; // percentage points
    userExperienceImprovement: number; // score increase
    implementationCost: number;
    monthlyActiveUsers: number;
  }): ROICalculation {
    const {
      pageLoadTimeReduction,
      errorRateReduction,
      userExperienceImprovement,
      implementationCost,
      monthlyActiveUsers,
    } = performanceImprovementData;

    // Calculate revenue impact based on performance improvements
    const conversionRateIncrease = this.estimateConversionImpact(
      pageLoadTimeReduction,
      userExperienceImprovement,
    );
    const churnReduction = this.estimateChurnReduction(
      errorRateReduction,
      userExperienceImprovement,
    );

    // Estimate revenue per user (this would typically come from actual business data)
    const averageRevenuePerUser = 50; // $50 per month (example)

    const monthlyRevenueIncrease =
      monthlyActiveUsers * conversionRateIncrease * averageRevenuePerUser +
      monthlyActiveUsers * churnReduction * averageRevenuePerUser * 0.5;

    const annualRevenueIncrease = monthlyRevenueIncrease * 12;

    // Calculate cost savings from reduced support tickets due to fewer errors
    const monthlyCostSavings = monthlyActiveUsers * (errorRateReduction / 100) * 2; // $2 per prevented error
    const annualCostSavings = monthlyCostSavings * 12;

    return this.calculateROI(
      implementationCost,
      annualRevenueIncrease,
      annualCostSavings,
      3, // 3-year timeframe
      [
        { category: 'Conversion Improvement', value: annualRevenueIncrease * 0.7 },
        { category: 'Churn Reduction', value: annualRevenueIncrease * 0.3 },
        { category: 'Support Cost Savings', value: annualCostSavings },
      ],
    );
  }

  /**
   * Calculate ROI for security improvements
   */
  calculateSecurityROI(securityInvestmentData: {
    implementationCost: number;
    annualMaintenanceCost: number;
    estimatedBreachPrevention: number; // probability of preventing a breach (0-1)
    averageBreachCost: number;
    complianceSavings: number;
    productivityImprovements: number;
  }): ROICalculation {
    const {
      implementationCost,
      annualMaintenanceCost,
      estimatedBreachPrevention,
      averageBreachCost,
      complianceSavings,
      productivityImprovements,
    } = securityInvestmentData;

    const totalInvestment = implementationCost + annualMaintenanceCost * 3; // 3-year maintenance

    const annualBreachPreventionSavings = (estimatedBreachPrevention * averageBreachCost) / 3; // Amortized over 3 years
    const totalCostSavings =
      (annualBreachPreventionSavings + complianceSavings + productivityImprovements) * 3;

    return this.calculateROI(
      totalInvestment,
      0, // Security typically doesn't generate direct revenue
      totalCostSavings,
      3,
      [
        { category: 'Breach Prevention', value: annualBreachPreventionSavings * 3 },
        { category: 'Compliance Savings', value: complianceSavings * 3 },
        { category: 'Productivity Improvements', value: productivityImprovements * 3 },
      ],
    );
  }

  /**
   * Calculate ROI for development tooling and process improvements
   */
  calculateDeveloperProductivityROI(toolingInvestmentData: {
    toolingCost: number;
    trainingCost: number;
    numberOfDevelopers: number;
    averageDeveloperSalary: number;
    productivityGainPercentage: number; // 5% = 0.05
    bugReductionPercentage: number;
    deploymentFrequencyIncrease: number; // multiplier (2x = 2)
  }): ROICalculation {
    const {
      toolingCost,
      trainingCost,
      numberOfDevelopers,
      averageDeveloperSalary,
      productivityGainPercentage,
      bugReductionPercentage,
      deploymentFrequencyIncrease,
    } = toolingInvestmentData;

    const totalInvestment = toolingCost + trainingCost;

    // Calculate productivity savings
    const annualProductivitySavings =
      numberOfDevelopers * averageDeveloperSalary * productivityGainPercentage;

    // Calculate bug reduction savings
    const averageBugFixCost = (averageDeveloperSalary / 2000) * 8; // 8 hours at hourly rate
    const bugsPerDeveloperPerYear = 50; // Average estimation
    const annualBugReductionSavings =
      numberOfDevelopers *
      bugsPerDeveloperPerYear *
      (bugReductionPercentage / 100) *
      averageBugFixCost;

    // Calculate deployment efficiency savings
    const averageDeploymentCost = (averageDeveloperSalary / 2000) * 4; // 4 hours
    const deploymentsPerYear = 52; // Weekly deployments
    const deploymentEfficiencySavings =
      deploymentsPerYear * averageDeploymentCost * (deploymentFrequencyIncrease - 1);

    const totalAnnualSavings =
      annualProductivitySavings + annualBugReductionSavings + deploymentEfficiencySavings;

    return this.calculateROI(
      totalInvestment,
      0, // No direct revenue
      totalAnnualSavings,
      3,
      [
        { category: 'Developer Productivity', value: annualProductivitySavings * 3 },
        { category: 'Bug Reduction', value: annualBugReductionSavings * 3 },
        { category: 'Deployment Efficiency', value: deploymentEfficiencySavings * 3 },
      ],
    );
  }

  /**
   * Set custom discount rate for NPV calculations
   */
  setDiscountRate(rate: number): void {
    this.discountRate = rate;
  }

  private calculateNPV(initialInvestment: number, annualCashFlow: number, years: number): number {
    let npv = -initialInvestment;

    for (let year = 1; year <= years; year++) {
      npv += annualCashFlow / Math.pow(1 + this.discountRate, year);
    }

    return npv;
  }

  private calculateBreakdown(breakdown: { category: string; value: number }[], total: number) {
    return breakdown.map((item) => ({
      ...item,
      percentage: total > 0 ? (item.value / total) * 100 : 0,
    }));
  }

  private estimateConversionImpact(pageLoadTimeReduction: number, uxImprovement: number): number {
    // Research shows 1 second delay = 7% conversion loss
    // So 1 second improvement = ~7% conversion gain, but with diminishing returns
    const pageLoadImpact = Math.min(pageLoadTimeReduction * 0.05, 0.2); // Max 20% improvement
    const uxImpact = Math.min((uxImprovement / 100) * 0.1, 0.1); // Max 10% improvement

    return pageLoadImpact + uxImpact;
  }

  private estimateChurnReduction(errorRateReduction: number, uxImprovement: number): number {
    // Estimate churn reduction based on error rate and UX improvements
    const errorImpact = Math.min((errorRateReduction / 100) * 0.3, 0.15); // Max 15% churn reduction
    const uxImpact = Math.min((uxImprovement / 100) * 0.05, 0.05); // Max 5% churn reduction

    return errorImpact + uxImpact;
  }
}
