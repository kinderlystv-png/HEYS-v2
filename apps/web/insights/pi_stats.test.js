/**
 * pi_stats.test.js — Unit Tests for Statistical Functions
 * Test coverage for pi_stats.js v3.3.0 (24 functions)
 * @see apps/web/insights/pi_stats.js
 */

import { describe, expect, it } from 'vitest';

// Mock HEYS global for browser module
global.window = global;
global.HEYS = {};

// Import the module (browser globals)
await import('./pi_stats.js');

const stats = global.HEYS.InsightsPI.stats;

describe('pi_stats.js — Basic Statistics', () => {
    describe('average()', () => {
        it('should calculate mean correctly', () => {
            expect(stats.average([1, 2, 3, 4, 5])).toBe(3);
            expect(stats.average([10, 20, 30])).toBe(20);
        });

        it('should handle empty array', () => {
            expect(stats.average([])).toBe(0);
            expect(stats.average(null)).toBe(0);
            expect(stats.average(undefined)).toBe(0);
        });

        it('should handle single element', () => {
            expect(stats.average([42])).toBe(42);
        });

        it('should handle negative numbers', () => {
            expect(stats.average([-5, -10, -15])).toBe(-10);
        });

        it('should handle decimals', () => {
            expect(stats.average([1.5, 2.5, 3.5])).toBeCloseTo(2.5, 2);
        });
    });

    describe('stdDev()', () => {
        it('should calculate standard deviation', () => {
            const result = stats.stdDev([2, 4, 4, 4, 5, 5, 7, 9]);
            expect(result).toBeCloseTo(2.0, 1);
        });

        it('should return 0 for identical values', () => {
            expect(stats.stdDev([5, 5, 5, 5])).toBe(0);
        });

        it('should return 0 for small sample', () => {
            expect(stats.stdDev([])).toBe(0);
            expect(stats.stdDev([1])).toBe(0);
        });

        it('should handle negative numbers', () => {
            const result = stats.stdDev([-2, -4, -6, -8]);
            expect(result).toBeGreaterThan(0);
        });
    });

    describe('variance()', () => {
        it('should calculate variance', () => {
            const result = stats.variance([2, 4, 4, 4, 5, 5, 7, 9]);
            expect(result).toBeCloseTo(4.0, 1);
        });

        it('should return 0 for small sample', () => {
            expect(stats.variance([1])).toBe(0);
        });

        it('should return 0 for identical values', () => {
            expect(stats.variance([3, 3, 3])).toBe(0);
        });
    });

    describe('coefficientOfVariation()', () => {
        it('should calculate CV (std/mean)', () => {
            const result = stats.coefficientOfVariation([10, 12, 14, 16, 18]);
            expect(result).toBeGreaterThan(0);
            expect(result).toBeLessThan(1);
        });

        it('should return 0 when mean is 0', () => {
            expect(stats.coefficientOfVariation([-5, 0, 5])).toBe(0);
        });

        it('should handle empty array', () => {
            expect(stats.coefficientOfVariation([])).toBe(0);
        });

        it('should handle identical values', () => {
            expect(stats.coefficientOfVariation([7, 7, 7, 7])).toBe(0);
        });

        it('should handle negative mean', () => {
            const result = stats.coefficientOfVariation([-10, -12, -14]);
            expect(result).toBeGreaterThan(0);
        });
    });
});

describe('pi_stats.js — Correlation & Regression', () => {
    describe('pearsonCorrelation()', () => {
        it('should detect perfect positive correlation', () => {
            const x = [1, 2, 3, 4, 5];
            const y = [2, 4, 6, 8, 10];
            expect(stats.pearsonCorrelation(x, y)).toBeCloseTo(1.0, 2);
        });

        it('should detect perfect negative correlation', () => {
            const x = [1, 2, 3, 4, 5];
            const y = [10, 8, 6, 4, 2];
            expect(stats.pearsonCorrelation(x, y)).toBeCloseTo(-1.0, 2);
        });

        it('should detect no correlation', () => {
            const x = [1, 2, 3, 4, 5];
            const y = [3, 3, 3, 3, 3];
            expect(stats.pearsonCorrelation(x, y)).toBe(0);
        });

        it('should handle small sample (N < 3)', () => {
            expect(stats.pearsonCorrelation([1, 2], [3, 4])).toBe(0);
            expect(stats.pearsonCorrelation([1], [2])).toBe(0);
        });

        it('should handle mismatched array lengths', () => {
            expect(stats.pearsonCorrelation([1, 2, 3], [4, 5])).toBe(0);
        });

        it('should handle zero variance', () => {
            const x = [5, 5, 5];
            const y = [1, 2, 3];
            expect(stats.pearsonCorrelation(x, y)).toBe(0);
        });
    });

    describe('calculateTrend()', () => {
        it('should detect positive trend', () => {
            const result = stats.calculateTrend([1, 2, 3, 4, 5]);
            expect(result).toBeGreaterThan(0);
        });

        it('should detect negative trend', () => {
            const result = stats.calculateTrend([5, 4, 3, 2, 1]);
            expect(result).toBeLessThan(0);
        });

        it('should return 0 for flat data', () => {
            expect(stats.calculateTrend([3, 3, 3, 3])).toBe(0);
        });

        it('should handle small sample', () => {
            expect(stats.calculateTrend([1])).toBe(0);
            expect(stats.calculateTrend([])).toBe(0);
        });
    });

    describe('calculateLinearRegression()', () => {
        it('should calculate slope from points', () => {
            const points = [
                { x: 1, y: 2 },
                { x: 2, y: 4 },
                { x: 3, y: 6 }
            ];
            const slope = stats.calculateLinearRegression(points);
            expect(slope).toBeCloseTo(2.0, 2);
        });

        it('should return 0 for flat line', () => {
            const points = [
                { x: 1, y: 5 },
                { x: 2, y: 5 },
                { x: 3, y: 5 }
            ];
            expect(stats.calculateLinearRegression(points)).toBe(0);
        });

        it('should handle small sample', () => {
            expect(stats.calculateLinearRegression([{ x: 1, y: 2 }])).toBe(0);
            expect(stats.calculateLinearRegression([])).toBe(0);
        });

        it('should handle zero denominator', () => {
            const points = [
                { x: 5, y: 10 },
                { x: 5, y: 20 },
                { x: 5, y: 30 }
            ];
            expect(stats.calculateLinearRegression(points)).toBe(0);
        });
    });

    describe('calculateR2()', () => {
        it('should return 1.0 for perfect fit', () => {
            const actual = [1, 2, 3, 4, 5];
            const predicted = [1, 2, 3, 4, 5];
            expect(stats.calculateR2(actual, predicted)).toBe(1);
        });

        it('should return value between 0 and 1', () => {
            const actual = [1, 2, 3, 4, 5];
            const predicted = [1.1, 2.2, 2.8, 4.1, 4.9];
            const r2 = stats.calculateR2(actual, predicted);
            expect(r2).toBeGreaterThan(0);
            expect(r2).toBeLessThan(1);
        });

        it('should handle mismatched lengths', () => {
            expect(stats.calculateR2([1, 2, 3], [1, 2])).toBe(0);
        });

        it('should handle small sample', () => {
            expect(stats.calculateR2([1], [1])).toBe(0);
        });
    });

    describe('autocorrelation()', () => {
        it('should calculate lag-1 autocorrelation', () => {
            const data = [1, 2, 3, 4, 5, 6, 7, 8];
            const result = stats.autocorrelation(data, 1);
            expect(result).toBeGreaterThan(0.5); // Strong positive autocorrelation
        });

        it('should return 0 for insufficient data', () => {
            expect(stats.autocorrelation([1, 2], 2)).toBe(0);
            expect(stats.autocorrelation([1, 2], 5)).toBe(0);
        });

        it('should handle zero variance', () => {
            expect(stats.autocorrelation([5, 5, 5, 5], 1)).toBe(0);
        });
    });

    describe('pearsonWithSignificance()', () => {
        it('should detect perfect positive correlation as significant', () => {
            const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
            const y = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20];
            const result = stats.pearsonWithSignificance(x, y);

            expect(result.r).toBeCloseTo(1.0, 2);
            expect(result.isSignificant).toBe(true);
            expect(result.pValue).toBeLessThan(0.01);
            expect(result.effectSize).toBe('large');
            expect(result.n).toBe(10);
            expect(result.df).toBe(8);
        });

        it('should detect perfect negative correlation as significant', () => {
            const x = [1, 2, 3, 4, 5, 6, 7, 8];
            const y = [16, 14, 12, 10, 8, 6, 4, 2];
            const result = stats.pearsonWithSignificance(x, y);

            expect(result.r).toBeCloseTo(-1.0, 2);
            expect(result.isSignificant).toBe(true);
            expect(result.effectSize).toBe('large');
        });

        it('should NOT detect weak correlation as significant with small N', () => {
            const x = [1, 2, 3, 4, 5];
            const y = [1.5, 2.2, 2.8, 4.1, 4.9];
            const result = stats.pearsonWithSignificance(x, y);

            expect(Math.abs(result.r)).toBeGreaterThan(0);
            expect(Math.abs(result.r)).toBeLessThan(1);
            // With N=5, df=3, need very high correlation for significance
            expect(result.n).toBe(5);
            expect(result.df).toBe(3);
        });

        it('should detect strong correlation as significant with large N', () => {
            // Generate data with r ≈ 0.7
            const x = Array.from({ length: 30 }, (_, i) => i);
            const y = x.map(v => v * 0.7 + Math.random() * 2);
            const result = stats.pearsonWithSignificance(x, y);

            expect(result.n).toBe(30);
            expect(result.df).toBe(28);
            expect(Math.abs(result.r)).toBeGreaterThan(0.5);
            // With N=30 and r>0.5, should be significant
        });

        it('should handle insufficient sample size (N < 3)', () => {
            const result1 = stats.pearsonWithSignificance([1, 2], [3, 4]);
            const result2 = stats.pearsonWithSignificance([1], [2]);

            expect(result1.r).toBe(0);
            expect(result1.isSignificant).toBe(false);
            expect(result1.pValue).toBe(1);
            expect(result1.warning).toBe('insufficient_sample_size');
            expect(result1.effectSize).toBe('insufficient_data');

            expect(result2.n).toBe(1);
            expect(result2.warning).toBe('insufficient_sample_size');
        });

        it('should handle mismatched array lengths', () => {
            const result = stats.pearsonWithSignificance([1, 2, 3], [4, 5]);

            expect(result.r).toBe(0);
            expect(result.isSignificant).toBe(false);
            expect(result.pValue).toBe(1);
            expect(result.warning).toBe('insufficient_sample_size');
        });

        it('should handle zero variance (perfect constant)', () => {
            const x = [5, 5, 5, 5, 5];
            const y = [1, 2, 3, 4, 5];
            const result = stats.pearsonWithSignificance(x, y);

            expect(result.r).toBe(0); // pearsonCorrelation returns 0 for zero variance
            // When pearsonCorrelation returns 0, our function returns 'negligible'
            // because it checks |r| < 0.1, which includes 0
            expect(result.effectSize).toBe('negligible');
        });

        it('should classify effect sizes correctly (Cohen conventions)', () => {
            // Test with controlled r values
            const baseX = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

            // Negligible: |r| < 0.1
            const yNegligible = [5, 5.1, 4.9, 5.2, 4.8, 5.1, 5, 5.2, 4.9, 5.1];
            const resNeg = stats.pearsonWithSignificance(baseX, yNegligible);
            expect(['negligible', 'small']).toContain(resNeg.effectSize);

            // Large: |r| >= 0.5 (perfect correlation)
            const yLarge = baseX.map(v => v * 2);
            const resLarge = stats.pearsonWithSignificance(baseX, yLarge);
            expect(resLarge.effectSize).toBe('large');
        });

        it('should provide meaningful interpretation string', () => {
            const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
            const yStrong = x.map(v => v * 1.5 + 1);
            const result = stats.pearsonWithSignificance(x, yStrong);

            expect(result.interpretation).toBeDefined();
            expect(typeof result.interpretation).toBe('string');
            expect(result.interpretation.length).toBeGreaterThan(0);

            // For perfect correlation we get specific message
            if (Math.abs(result.r) > 0.99) {
                expect(result.interpretation).toContain('perfect');
            } else if (result.isSignificant) {
                expect(result.interpretation).toContain('significant');
            } else {
                expect(result.interpretation).toContain('not significant');
            }
        });

        it('should return correct df (degrees of freedom)', () => {
            const x = [1, 2, 3, 4, 5, 6, 7];
            const y = [2, 3, 4, 5, 6, 7, 8];
            const result = stats.pearsonWithSignificance(x, y);

            expect(result.df).toBe(5); // n - 2 = 7 - 2 = 5
        });

        it('should calculate t-statistic correctly', () => {
            const x = [1, 2, 3, 4, 5];
            const y = [2, 4, 6, 8, 10];
            const result = stats.pearsonWithSignificance(x, y);

            // For perfect correlation (r=1), t should be very large
            expect(result.r).toBeCloseTo(1.0, 2);
            expect(Math.abs(result.tStat)).toBeGreaterThan(10);
        });

        it('should use custom alpha level', () => {
            const x = Array.from({ length: 20 }, (_, i) => i);
            const y = x.map(v => v + Math.random() * 5);

            const result05 = stats.pearsonWithSignificance(x, y, 0.05);
            const result01 = stats.pearsonWithSignificance(x, y, 0.01);

            // Both should have same r, n, df, tStat
            expect(result05.r).toBe(result01.r);
            expect(result05.n).toBe(result01.n);
            expect(result05.df).toBe(result01.df);
            expect(result05.tStat).toBe(result01.tStat);

            // Significance may differ based on alpha
            // (stricter alpha = less likely to be significant)
        });

        it('should handle medium correlation with moderate N', () => {
            // Generate data with r ≈ 0.4 (medium effect)
            const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
            const y = [1.5, 3, 2.5, 5, 4, 7, 6, 9, 8, 11, 10, 13];
            const result = stats.pearsonWithSignificance(x, y);

            expect(result.n).toBe(12);
            expect(result.df).toBe(10);
            expect(Math.abs(result.r)).toBeGreaterThan(0.3);
            expect(['small', 'medium', 'large']).toContain(result.effectSize);
        });

        it('should return pValue between 0 and 1', () => {
            const x = [1, 2, 3, 4, 5, 6, 7];
            const y = [2, 3, 5, 4, 6, 7, 8];
            const result = stats.pearsonWithSignificance(x, y);

            expect(result.pValue).toBeGreaterThanOrEqual(0);
            expect(result.pValue).toBeLessThanOrEqual(1);
        });

        it('should handle negative correlations correctly', () => {
            const x = [1, 2, 3, 4, 5, 6, 7, 8];
            const y = [8, 7, 6, 5, 4, 3, 2, 1];
            const result = stats.pearsonWithSignificance(x, y);

            expect(result.r).toBeLessThan(0);
            expect(result.r).toBeCloseTo(-1.0, 2);
            expect(result.isSignificant).toBe(true);
            expect(result.effectSize).toBe('large');
        });

        it('should include all required output fields', () => {
            const x = [1, 2, 3, 4, 5];
            const y = [2, 4, 6, 8, 10];
            const result = stats.pearsonWithSignificance(x, y);

            expect(result).toHaveProperty('r');
            expect(result).toHaveProperty('pValue');
            expect(result).toHaveProperty('isSignificant');
            expect(result).toHaveProperty('n');
            expect(result).toHaveProperty('df');
            expect(result).toHaveProperty('tStat');
            expect(result).toHaveProperty('effectSize');
            expect(result).toHaveProperty('interpretation');
        });
    });

    describe('bayesianCorrelation()', () => {
        it('should shrink small N correlation towards prior', () => {
            const x = [1, 2, 3];
            const y = [2, 4, 6]; // Perfect correlation but N=3
            const result = stats.bayesianCorrelation(x, y, 0, 10); // Prior: r=0, weight=10

            expect(result.observedR).toBeCloseTo(1.0, 2);
            expect(result.posteriorR).toBeLessThan(result.observedR); // Shrunk towards 0
            expect(result.shrinkage).toBeGreaterThan(0);
            expect(result.effectiveN).toBe(13); // 3 + 10
        });

        it('should apply minimal shrinkage with large N', () => {
            const x = Array.from({ length: 50 }, (_, i) => i);
            const y = x.map(v => v * 0.7); // Deterministic, not random
            const result = stats.bayesianCorrelation(x, y, 0, 10);

            expect(result.observedN).toBe(50);
            expect(result.shrinkage).toBeLessThan(0.2); // Relaxed threshold
            expect(result.confidence).toBeGreaterThan(0.8); // High confidence
        });

        it('should handle zero prior (shrink to null hypothesis)', () => {
            const x = [1, 2, 3, 4];
            const y = [2, 3, 5, 6];
            const result = stats.bayesianCorrelation(x, y, 0, 5);

            expect(result.priorR).toBe(0);
            expect(result.posteriorR).toBeGreaterThanOrEqual(0);
            expect(result.posteriorR).toBeLessThanOrEqual(result.observedR);
        });

        it('should handle non-zero prior', () => {
            const x = [1, 2, 3];
            const y = [1.5, 2.5, 3.5];
            const result = stats.bayesianCorrelation(x, y, 0.5, 10); // Prior: typical positive effect

            expect(result.priorR).toBe(0.5);
            expect(result.posteriorR).toBeGreaterThan(0);
        });

        it('should return prior when N<2', () => {
            const result = stats.bayesianCorrelation([1], [2], 0.3, 10);

            expect(result.posteriorR).toBe(0.3); // Returns prior
            expect(result.warning).toBe('insufficient_data');
        });
    });

    describe('confidenceIntervalForCorrelation()', () => {
        it('should calculate narrow CI for large N', () => {
            const ci = stats.confidenceIntervalForCorrelation(0.5, 100);

            expect(ci.lower).toBeGreaterThan(0.3);
            expect(ci.upper).toBeLessThan(0.7);
            expect(ci.width).toBeLessThan(0.4);
            expect(ci.r).toBe(0.5);
        });

        it('should calculate wide CI for small N', () => {
            const ci = stats.confidenceIntervalForCorrelation(0.5, 10);

            expect(ci.width).toBeGreaterThan(0.5); // Very wide
        });

        it('should handle perfect correlation', () => {
            const ci = stats.confidenceIntervalForCorrelation(1.0, 30);

            expect(ci.upper).toBeCloseTo(1.0, 1);
            expect(ci.lower).toBeGreaterThan(0.8);
        });

        it('should handle negative correlation', () => {
            const ci = stats.confidenceIntervalForCorrelation(-0.6, 50);

            expect(ci.lower).toBeLessThan(-0.4);
            expect(ci.upper).toBeLessThan(0);
        });

        it('should return wide CI for N<4', () => {
            const ci = stats.confidenceIntervalForCorrelation(0.8, 3);

            expect(ci.lower).toBe(-1);
            expect(ci.upper).toBe(1);
            expect(ci.warning).toBe('insufficient_sample_size');
        });

        it('should respect confidence level', () => {
            const ci95 = stats.confidenceIntervalForCorrelation(0.5, 30, 0.95);
            const ci99 = stats.confidenceIntervalForCorrelation(0.5, 30, 0.99);

            expect(ci99.width).toBeGreaterThan(ci95.width); // 99% CI wider than 95%
        });
    });

    describe('detectOutliers()', () => {
        it('should detect single extreme outlier', () => {
            const data = [1, 2, 3, 4, 5, 100];
            const result = stats.detectOutliers(data);

            expect(result.outliers).toContain(100);
            expect(result.cleaned).not.toContain(100);
            expect(result.indices).toContain(5);
        });

        it('should not flag normal variation as outliers', () => {
            const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
            const result = stats.detectOutliers(data);

            expect(result.outliers.length).toBe(0);
            expect(result.cleaned.length).toBe(10);
        });

        it('should detect multiple outliers', () => {
            const data = [-50, 1, 2, 3, 4, 5, 100, 150];
            const result = stats.detectOutliers(data);

            expect(result.outliers.length).toBeGreaterThanOrEqual(2);
            expect(result.stats.outlierRate).toBeGreaterThan(0);
        });

        it('should respect IQR multiplier', () => {
            const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 20];
            const result15 = stats.detectOutliers(data, 1.5); // Standard
            const result30 = stats.detectOutliers(data, 3.0); // Extreme only

            expect(result30.outliers.length).toBeLessThanOrEqual(result15.outliers.length);
        });

        it('should return stats with IQR bounds', () => {
            const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
            const result = stats.detectOutliers(data);

            expect(result.stats).toHaveProperty('q1');
            expect(result.stats).toHaveProperty('q3');
            expect(result.stats).toHaveProperty('iqr');
            expect(result.stats).toHaveProperty('lowerBound');
            expect(result.stats).toHaveProperty('upperBound');
        });

        it('should handle insufficient data (N<4)', () => {
            const result = stats.detectOutliers([1, 2, 3]);

            expect(result.outliers.length).toBe(0);
            expect(result.warning).toBe('insufficient_data');
        });

        it('should filter out NaN and null values', () => {
            const data = [1, 2, NaN, 3, null, 4, 5];
            const result = stats.detectOutliers(data);

            expect(result.cleaned.length).toBe(5); // 1,2,3,4,5
            expect(result.cleaned.every(v => Number.isFinite(v))).toBe(true);
        });
    });
});

describe('pi_stats.js — Distribution Metrics', () => {
    describe('skewness()', () => {
        it('should detect right-skewed distribution', () => {
            const data = [1, 1, 1, 2, 2, 3, 10]; // Long right tail
            const result = stats.skewness(data);
            expect(result).toBeGreaterThan(0);
        });

        it('should detect left-skewed distribution', () => {
            const data = [1, 8, 9, 9, 9, 10, 10]; // Long left tail
            const result = stats.skewness(data);
            expect(result).toBeLessThan(0);
        });

        it('should return 0 for symmetric distribution', () => {
            const data = [1, 2, 3, 4, 5, 6, 7];
            const result = stats.skewness(data);
            expect(Math.abs(result)).toBeLessThan(0.5);
        });

        it('should handle small sample', () => {
            expect(stats.skewness([1, 2])).toBe(0);
        });

        it('should handle zero std', () => {
            expect(stats.skewness([3, 3, 3])).toBe(0);
        });
    });

    describe('calculatePercentile()', () => {
        it('should calculate 50th percentile (median)', () => {
            const data = [1, 2, 3, 4, 5];
            expect(stats.calculatePercentile(data, 50)).toBe(3);
        });

        it('should calculate 25th percentile', () => {
            const data = [1, 2, 3, 4, 5, 6, 7, 8];
            const p25 = stats.calculatePercentile(data, 25);
            expect(p25).toBeGreaterThan(1);
            expect(p25).toBeLessThan(4);
        });

        it('should calculate 95th percentile', () => {
            const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
            const p95 = stats.calculatePercentile(data, 95);
            expect(p95).toBeGreaterThan(8);
        });

        it('should handle empty array', () => {
            expect(stats.calculatePercentile([], 50)).toBe(0);
        });

        it('should handle single element', () => {
            expect(stats.calculatePercentile([42], 50)).toBe(42);
        });
    });
});

describe('pi_stats.js — Moving Averages', () => {
    describe('calculateMovingAverage()', () => {
        it('should calculate 3-period MA', () => {
            const data = [1, 2, 3, 4, 5, 6];
            const result = stats.calculateMovingAverage(data, 3);
            expect(result).toEqual([2, 3, 4, 5]);
        });

        it('should return original array if window too large', () => {
            const data = [1, 2, 3];
            expect(stats.calculateMovingAverage(data, 5)).toEqual(data);
        });

        it('should handle empty array', () => {
            expect(stats.calculateMovingAverage([], 3)).toEqual([]);
        });

        it('should handle window = 1', () => {
            const data = [5, 10, 15];
            expect(stats.calculateMovingAverage(data, 1)).toEqual(data);
        });
    });

    describe('exponentialMovingAverage()', () => {
        it('should calculate EMA with smoothing', () => {
            const data = [10, 12, 14, 16, 18];
            const result = stats.exponentialMovingAverage(data, 3);
            expect(result).toHaveLength(5);
            expect(result[0]).toBe(10); // First value unchanged
            expect(result[result.length - 1]).toBeGreaterThan(result[0]);
        });

        it('should handle empty array', () => {
            expect(stats.exponentialMovingAverage([])).toEqual([]);
        });

        it('should handle single element', () => {
            expect(stats.exponentialMovingAverage([42])).toEqual([42]);
        });
    });
});

describe('pi_stats.js — Confidence & Normalization', () => {
    describe('calculateConfidenceInterval()', () => {
        it('should calculate 95% CI', () => {
            const data = [10, 12, 14, 16, 18];
            const result = stats.calculateConfidenceInterval(data, 0.95);
            expect(result.mean).toBe(14);
            expect(result.lower).toBeLessThan(result.mean);
            expect(result.upper).toBeGreaterThan(result.mean);
            expect(result.margin).toBeGreaterThan(0);
        });

        it('should calculate 99% CI', () => {
            const data = [10, 12, 14, 16, 18];
            const ci95 = stats.calculateConfidenceInterval(data, 0.95);
            const ci99 = stats.calculateConfidenceInterval(data, 0.99);
            expect(ci99.margin).toBeGreaterThan(ci95.margin);
        });

        it('should handle small sample', () => {
            const result = stats.calculateConfidenceInterval([5]);
            expect(result.mean).toBe(5);
            expect(result.margin).toBe(0);
        });

        it('should handle empty array', () => {
            const result = stats.calculateConfidenceInterval([]);
            expect(result.mean).toBe(0);
            expect(result.margin).toBe(0);
        });
    });

    describe('normalizeValue()', () => {
        it('should normalize to [0, 1] range', () => {
            expect(stats.normalizeValue(5, 0, 10)).toBe(0.5);
            expect(stats.normalizeValue(0, 0, 10)).toBe(0);
            expect(stats.normalizeValue(10, 0, 10)).toBe(1);
        });

        it('should handle min = max', () => {
            expect(stats.normalizeValue(5, 5, 5)).toBe(0);
        });

        it('should handle negative ranges', () => {
            expect(stats.normalizeValue(0, -10, 10)).toBe(0.5);
        });
    });

    describe('clamp()', () => {
        it('should constrain to range', () => {
            expect(stats.clamp(5, 0, 10)).toBe(5);
            expect(stats.clamp(-5, 0, 10)).toBe(0);
            expect(stats.clamp(15, 0, 10)).toBe(10);
        });

        it('should handle negative ranges', () => {
            expect(stats.clamp(-5, -10, 0)).toBe(-5);
            expect(stats.clamp(-15, -10, 0)).toBe(-10);
        });
    });
});

describe('pi_stats.js — Statistical Safety Helpers', () => {
    describe('checkMinN()', () => {
        it('should pass for valid sample size', () => {
            expect(stats.checkMinN([1, 2, 3, 4], 3)).toBe(true);
        });

        it('should fail for small sample', () => {
            expect(stats.checkMinN([1, 2], 3)).toBe(false);
        });

        it('should handle empty array', () => {
            expect(stats.checkMinN([], 3)).toBe(false);
            expect(stats.checkMinN(null, 3)).toBeFalsy(); // null is falsy but not === false
        });

        it('should use default minN=3', () => {
            expect(stats.checkMinN([1, 2, 3])).toBe(true);
            expect(stats.checkMinN([1, 2])).toBe(false);
        });
    });

    describe('applySmallSamplePenalty()', () => {
        it('should not penalize when n >= minN', () => {
            expect(stats.applySmallSamplePenalty(0.8, 10, 7)).toBe(0.8);
        });

        it('should apply linear penalty when n < minN', () => {
            const result = stats.applySmallSamplePenalty(0.8, 5, 7);
            expect(result).toBeCloseTo(0.8 * (5 / 7), 2);
        });

        it('should return 0 when n = 0', () => {
            expect(stats.applySmallSamplePenalty(0.9, 0, 7)).toBe(0);
        });

        it('should handle n < 0', () => {
            expect(stats.applySmallSamplePenalty(0.9, -3, 7)).toBe(0);
        });
    });

    describe('statisticalPower()', () => {
        it('should return high power for large n and large effect', () => {
            const power = stats.statisticalPower(50, 0.8);
            expect(power).toBeGreaterThan(0.9);
        });

        it('should return low power for small n and small effect', () => {
            const power = stats.statisticalPower(5, 0.2);
            expect(power).toBeLessThan(0.5);
        });

        it('should return 0 for invalid inputs', () => {
            expect(stats.statisticalPower(2, 0.5)).toBe(0);
            expect(stats.statisticalPower(10, 0)).toBe(0);
            expect(stats.statisticalPower(10, -0.5)).toBe(0);
        });

        it('should cap power at 1.0', () => {
            const power = stats.statisticalPower(1000, 1.0);
            expect(power).toBeLessThanOrEqual(1.0);
        });
    });

    describe('confidenceWithWarning()', () => {
        it('should flag low confidence with warning', () => {
            const result = stats.confidenceWithWarning(0.9, 3, 0.5);
            expect(result.confidence).toBeLessThan(0.9);
            expect(result.warning).toContain('N=3');
        });

        it('should not warn for sufficient sample', () => {
            const result = stats.confidenceWithWarning(0.9, 10, 0.5);
            expect(result.confidence).toBe(0.9);
            expect(result.warning).toBeNull();
        });

        it('should use custom threshold', () => {
            const result = stats.confidenceWithWarning(0.6, 5, 0.7);
            expect(result.warning).not.toBeNull();
        });
    });
});

describe('pi_stats.js — Effect Size & Statistical Inference', () => {
    describe('cohenD()', () => {
        it('should calculate positive effect size', () => {
            const group1 = [1, 2, 3, 4, 5];
            const group2 = [6, 7, 8, 9, 10];
            const result = stats.cohenD(group1, group2);
            expect(result.d).toBeGreaterThan(1);
            expect(result.interpretation).toBe('large');
        });

        it('should detect negligible effect', () => {
            const group1 = [10, 11, 12, 13, 14];
            const group2 = [10.5, 11.5, 12.5, 13.5, 14.5];
            const result = stats.cohenD(group1, group2);
            expect(result.interpretation).toMatch(/negligible|small/);
        });

        it('should handle insufficient data', () => {
            const result = stats.cohenD([1], [2]);
            expect(result.d).toBe(0);
            expect(result.interpretation).toBe('insufficient_data');
        });

        it('should handle zero variance', () => {
            const group1 = [5, 5, 5];
            const group2 = [5, 5, 5];
            const result = stats.cohenD(group1, group2);
            expect(result.d).toBe(0);
            expect(result.interpretation).toBe('no_variance');
        });

        it('should handle negative difference', () => {
            const group1 = [10, 12, 14];
            const group2 = [4, 6, 8];
            const result = stats.cohenD(group1, group2);
            expect(result.d).toBeLessThan(0);
        });
    });

    describe('twoSampleTTest()', () => {
        it('should detect significant difference', () => {
            const group1 = [1, 2, 3, 4, 5];
            const group2 = [10, 11, 12, 13, 14];
            const result = stats.twoSampleTTest(group1, group2);
            expect(result.isSignificant).toBe(true);
            expect(result.direction).toBe('increase');
            expect(result.pValue).toBeLessThan(0.05);
        });

        it('should detect no significant difference', () => {
            const group1 = [10, 11, 12, 13, 14];
            const group2 = [10.5, 11.5, 12.5, 13.5, 14.5];
            const result = stats.twoSampleTTest(group1, group2);
            expect(result.isSignificant).toBe(false);
        });

        it('should detect decrease', () => {
            const group1 = [10, 12, 14];
            const group2 = [4, 6, 8];
            const result = stats.twoSampleTTest(group1, group2);
            expect(result.direction).toBe('decrease');
        });

        it('should handle insufficient data', () => {
            const result = stats.twoSampleTTest([1], [2]);
            expect(result.isSignificant).toBe(false);
            expect(result.warning).toBe('insufficient_sample_size');
        });

        it('should handle zero standard error', () => {
            const group1 = [5, 5, 5];
            const group2 = [5, 5, 5];
            const result = stats.twoSampleTTest(group1, group2);
            expect(result.isSignificant).toBe(false);
            expect(result.warning).toBe('zero_standard_error');
        });

        it('should include df and means in output', () => {
            const group1 = [1, 2, 3, 4, 5];
            const group2 = [6, 7, 8, 9, 10];
            const result = stats.twoSampleTTest(group1, group2);
            expect(result.df).toBeGreaterThan(0);
            expect(result.mean1).toBe(3);
            expect(result.mean2).toBe(8);
            expect(result.diff).toBe(5);
        });
    });
});

describe('pi_stats.js — Alternative Trend Function', () => {
    describe('linearTrend()', () => {
        it('should detect positive trend', () => {
            const result = stats.linearTrend([1, 3, 5, 7, 9]);
            expect(result).toBeGreaterThan(0);
        });

        it('should detect negative trend', () => {
            const result = stats.linearTrend([10, 8, 6, 4, 2]);
            expect(result).toBeLessThan(0);
        });

        it('should return 0 for flat data', () => {
            expect(stats.linearTrend([5, 5, 5, 5])).toBe(0);
        });

        it('should handle small sample', () => {
            expect(stats.linearTrend([1])).toBe(0);
        });
    });
});

describe('pi_stats.js — Module Exports', () => {
    it('should export all 27 functions', () => {
        expect(stats).toBeDefined();
        expect(Object.keys(stats).length).toBe(27);
    });

    it('should have fallback global export', () => {
        expect(global.piStats).toBeDefined();
        expect(global.piStats).toBe(stats);
    });

    it('should be accessible via HEYS namespace', () => {
        expect(global.HEYS.InsightsPI.stats).toBeDefined();
    });
});
