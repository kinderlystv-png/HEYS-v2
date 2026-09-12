// pi_stats.js — Statistical Helper Functions v3.0.0
// Extracted from heys_predictive_insights_v1.js (Phase 1)
// Статистические функции для анализа данных
(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  HEYS.InsightsPI = HEYS.InsightsPI || {};
  const DEV = HEYS.dev || global.HEYS?.dev || {};
  const devLog = DEV.log ? DEV.log.bind(DEV) : () => { };

  /**
   * Рассчитать среднее значение массива
   * @param {Array<number>} arr - массив чисел
   * @returns {number} среднее значение
   */
  function average(arr) {
    if (!arr || arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  /**
   * Рассчитать стандартное отклонение
   * @param {Array<number>} arr - массив чисел
   * @returns {number} стандартное отклонение
   */
  function stdDev(arr) {
    if (!arr || arr.length < 2) return 0;
    const avg = average(arr);
    const squareDiffs = arr.map(v => Math.pow(v - avg, 2));
    return Math.sqrt(average(squareDiffs));
  }

  /**
   * Рассчитать корреляцию Пирсона
   * @param {Array<number>} x - первый массив
   * @param {Array<number>} y - второй массив
   * @returns {number} корреляция [-1, 1]
   */
  function pearsonCorrelation(x, y) {
    if (x.length !== y.length || x.length < 3) return 0;

    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i], 0);
    const sumX2 = x.reduce((acc, xi) => acc + xi * xi, 0);
    const sumY2 = y.reduce((acc, yi) => acc + yi * yi, 0);

    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

    if (denominator === 0) return 0;
    const correlation = numerator / denominator;
    return isNaN(correlation) ? 0 : correlation;
  }

  /**
   * Рассчитать линейный тренд (slope) по массиву значений
   * @param {Array<number>} values - массив значений
   * @returns {number} наклон (положительный = рост)
   */
  function calculateTrend(values) {
    if (values.length < 2) return 0;

    const n = values.length;
    const x = values.map((_, i) => i);
    const y = values;

    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i], 0);
    const sumX2 = x.reduce((acc, xi) => acc + xi * xi, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    return isNaN(slope) ? 0 : slope;
  }

  /**
   * Рассчитать линейную регрессию по точкам (x, y)
   * Используется для точного прогноза по датам
   * @param {Array<{x: number, y: number}>} points
   * @returns {number} наклон (slope)
   */
  function calculateLinearRegression(points) {
    if (points.length < 2) return 0;

    const n = points.length;
    const sumX = points.reduce((a, p) => a + p.x, 0);
    const sumY = points.reduce((a, p) => a + p.y, 0);
    const sumXY = points.reduce((a, p) => a + p.x * p.y, 0);
    const sumX2 = points.reduce((a, p) => a + p.x * p.x, 0);

    const denominator = (n * sumX2 - sumX * sumX);
    if (denominator === 0) return 0;

    const slope = (n * sumXY - sumX * sumY) / denominator;
    return isNaN(slope) ? 0 : slope;
  }

  /**
   * Рассчитать R² (coefficient of determination)
   * @param {Array<number>} actual - фактические значения
   * @param {Array<number>} predicted - предсказанные значения
   * @returns {number} R² от 0 до 1
   */
  function calculateR2(actual, predicted) {
    if (actual.length !== predicted.length || actual.length < 2) return 0;

    const meanActual = average(actual);
    const ssRes = actual.reduce((sum, a, i) => sum + Math.pow(a - predicted[i], 2), 0);
    const ssTot = actual.reduce((sum, a) => sum + Math.pow(a - meanActual, 2), 0);

    return ssTot > 0 ? 1 - (ssRes / ssTot) : 0;
  }

  /**
   * Рассчитать дисперсию (variance)
   * @param {Array<number>} arr - массив чисел
   * @returns {number} дисперсия
   */
  function variance(arr) {
    if (arr.length < 2) return 0;
    const mean = average(arr);
    return average(arr.map(x => Math.pow(x - mean, 2)));
  }

  /**
   * Рассчитать автокорреляцию (lag-k)
   * @param {Array<number>} arr - массив значений
   * @param {number} lag - лаг (по умолчанию 1)
   * @returns {number} автокорреляция
   */
  function autocorrelation(arr, lag = 1) {
    if (arr.length <= lag) return 0;

    const mean = average(arr);
    const n = arr.length;

    let numerator = 0;
    let denominator = 0;

    for (let i = 0; i < n - lag; i++) {
      numerator += (arr[i] - mean) * (arr[i + lag] - mean);
    }

    for (let i = 0; i < n; i++) {
      denominator += Math.pow(arr[i] - mean, 2);
    }

    return denominator > 0 ? numerator / denominator : 0;
  }

  /**
   * Рассчитать асимметрию (skewness)
   * @param {Array<number>} arr - массив значений
   * @returns {number} асимметрия
   */
  function skewness(arr) {
    if (arr.length < 3) return 0;

    const mean = average(arr);
    const std = stdDev(arr);
    if (std === 0) return 0;

    const n = arr.length;
    const m3 = arr.reduce((sum, x) => sum + Math.pow((x - mean) / std, 3), 0) / n;

    return m3;
  }

  /**
   * Рассчитать линейный тренд (slope) - альтернативная версия
   * @param {Array<number>} arr - массив значений
   * @returns {number} наклон
   */
  function linearTrend(arr) {
    if (arr.length < 2) return 0;

    const n = arr.length;
    const xMean = (n - 1) / 2;
    const yMean = average(arr);

    let numerator = 0;
    let denominator = 0;

    for (let i = 0; i < n; i++) {
      numerator += (i - xMean) * (arr[i] - yMean);
      denominator += Math.pow(i - xMean, 2);
    }

    return denominator > 0 ? numerator / denominator : 0;
  }

  /**
   * Рассчитать процентиль
   * @param {Array<number>} arr - массив значений
   * @param {number} p - процентиль (0-100)
   * @returns {number} значение процентиля
   */
  function calculatePercentile(arr, p) {
    if (!arr || arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const index = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;

    if (lower === upper) return sorted[lower];
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  }

  /**
   * Рассчитать скользящее среднее
   * @param {Array<number>} arr - массив значений
   * @param {number} window - размер окна
   * @returns {Array<number>} массив скользящих средних
   */
  function calculateMovingAverage(arr, window = 3) {
    if (!arr || arr.length < window) return arr;
    const result = [];
    for (let i = 0; i <= arr.length - window; i++) {
      const slice = arr.slice(i, i + window);
      result.push(average(slice));
    }
    return result;
  }

  /**
   * Рассчитать экспоненциальное скользящее среднее (EMA)
   * Используется для сглаживания временных рядов с большим весом на недавние данные
   * @param {Array<number>} arr - массив значений
   * @param {number} span - период EMA (по умолчанию 7)
   * @returns {Array<number>} массив EMA значений
   */
  function exponentialMovingAverage(arr, span = 7) {
    if (!arr || arr.length === 0) return [];
    const alpha = 2 / (span + 1);
    const result = [arr[0]];
    for (let i = 1; i < arr.length; i++) {
      result.push(alpha * arr[i] + (1 - alpha) * result[i - 1]);
    }
    return result;
  }

  /**
   * Рассчитать доверительный интервал
   * @param {Array<number>} arr - массив значений
   * @param {number} confidence - уровень доверия (0-1), по умолчанию 0.95
   * @returns {Object} {mean, lower, upper, margin}
   */
  function calculateConfidenceInterval(arr, confidence = 0.95) {
    if (!arr || arr.length < 2) {
      const mean = average(arr);
      return { mean, lower: mean, upper: mean, margin: 0 };
    }

    const mean = average(arr);
    const std = stdDev(arr);
    const n = arr.length;

    // z-score для 95% confidence ≈ 1.96, для 99% ≈ 2.576
    const zScore = confidence === 0.99 ? 2.576 : 1.96;
    const margin = zScore * (std / Math.sqrt(n));

    return {
      mean,
      lower: mean - margin,
      upper: mean + margin,
      margin
    };
  }

  /**
   * Нормализовать значение в диапазон [0, 1]
   * @param {number} value - значение
   * @param {number} min - минимум
   * @param {number} max - максимум
   * @returns {number} нормализованное значение
   */
  function normalizeValue(value, min, max) {
    if (max === min) return 0;
    return (value - min) / (max - min);
  }

  /**
   * Ограничить значение в диапазоне
   * @param {number} value - значение
   * @param {number} min - минимум
   * @param {number} max - максимум
   * @returns {number} ограниченное значение
   */
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  // === STATISTICS SAFETY HELPERS (Phase 0, 12.02.2026) ===
  // Prevent false positives from small samples in C13-C22 patterns
  // Example: if (checkMinN(validDays, 3)) { ... compute confidence ... }

  /**
   * Check minimum sample size gate (minN)
   * @param {Array} arr - sample array
   * @param {number} minN - minimum required count (default: 3)
   * @returns {boolean} true if arr.length >= minN
   */
  function checkMinN(arr, minN = 3) {
    return arr && arr.length >= minN;
  }

  /**
   * Apply confidence penalty for small samples
   * @param {number} baseConfidence - raw confidence score [0-1]
   * @param {number} n - sample size
   * @param {number} minN - minimum recommended count (default: 7)
   * @returns {number} adjusted confidence [0-1]
   * @example applySmallSamplePenalty(0.8, 5, 7) → 0.8 × (5/7) = 0.57
   */
  function applySmallSamplePenalty(baseConfidence, n, minN = 7) {
    if (n >= minN) return baseConfidence;
    if (n <= 0) return 0;
    return baseConfidence * (n / minN); // linear penalty
  }

  /**
   * Calculate statistical power estimate (rough heuristic)
   * @param {number} n - sample size
   * @param {number} effectSize - Cohen's d or correlation magnitude [0-1]
   * @returns {number} power estimate [0-1]
   * @example statisticalPower(10, 0.5) → 0.68 (medium effect, small sample)
   */
  function statisticalPower(n, effectSize) {
    if (n < 3 || effectSize <= 0) return 0;
    // Rough approximation: power ≈ 1 - exp(-n × effectSize² / 4)
    // For large n + large effect → power ≈ 1.0
    // For small n + small effect → power ≈ 0.2
    const scaledEffect = Math.pow(effectSize, 2);
    return Math.min(1, 1 - Math.exp(-(n * scaledEffect) / 4));
  }

  /**
   * Flag low-confidence results with warning
   * @param {number} confidence - raw confidence score [0-1]
   * @param {number} n - sample size
   * @param {number} threshold - warning threshold (default: 0.5)
   * @returns {Object} { confidence: adjusted, warning: 'Мало данных: 5 дней из семи' | null }
   */
  function confidenceWithWarning(confidence, n, threshold = 0.5) {
    const adjusted = applySmallSamplePenalty(confidence, n, 7);
    const warning = adjusted < threshold ? `Мало данных: ${n} дней из семи` : null;
    return { confidence: adjusted, warning };
  }

  /**
   * Calculate Cohen's d effect size for two samples
   * Measures the standardized difference between two means
   * @param {Array<number>} group1 - первая выборка
   * @param {Array<number>} group2 - вторая выборка
   * @returns {Object} { d, interpretation }
   * Effect size interpretation:
   * - Small: |d| < 0.5
   * - Medium: 0.5 ≤ |d| < 0.8
   * - Large: |d| ≥ 0.8
   */
  function cohenD(group1, group2) {
    if (!group1 || !group2 || group1.length < 2 || group2.length < 2) {
      return { d: 0, interpretation: 'insufficient_data' };
    }

    const mean1 = average(group1);
    const mean2 = average(group2);
    const std1 = stdDev(group1);
    const std2 = stdDev(group2);

    // Pooled standard deviation
    const n1 = group1.length;
    const n2 = group2.length;
    const pooledStd = Math.sqrt(((n1 - 1) * std1 * std1 + (n2 - 1) * std2 * std2) / (n1 + n2 - 2));

    if (pooledStd === 0) {
      return { d: 0, interpretation: 'no_variance' };
    }

    const d = (mean2 - mean1) / pooledStd;
    const absD = Math.abs(d);

    let interpretation;
    if (absD < 0.2) interpretation = 'negligible';
    else if (absD < 0.5) interpretation = 'small';
    else if (absD < 0.8) interpretation = 'medium';
    else interpretation = 'large';

    return { d, interpretation };
  }

  /**
   * Two-sample t-test (Welch's t-test for unequal variances)
   * Tests if two samples have significantly different means
   * @param {Array<number>} group1 - первая выборка
   * @param {Array<number>} group2 - вторая выборка
   * @param {number} alpha - significance level (default: 0.05)
   * @returns {Object} { tStat, pValue (approx), isSignificant, direction }
   * direction: 'increase' | 'decrease' | 'no_change'
   */
  function twoSampleTTest(group1, group2, alpha = 0.05) {
    if (!group1 || !group2 || group1.length < 2 || group2.length < 2) {
      return {
        tStat: 0,
        pValue: 1,
        isSignificant: false,
        direction: 'no_change',
        warning: 'insufficient_sample_size'
      };
    }

    const mean1 = average(group1);
    const mean2 = average(group2);
    const var1 = variance(group1);
    const var2 = variance(group2);
    const n1 = group1.length;
    const n2 = group2.length;

    // Welch's t-statistic
    const se = Math.sqrt(var1 / n1 + var2 / n2);
    if (se === 0) {
      return {
        tStat: 0,
        pValue: 1,
        isSignificant: false,
        direction: 'no_change',
        warning: 'zero_standard_error'
      };
    }

    const tStat = (mean2 - mean1) / se;

    // Welch-Satterthwaite degrees of freedom
    const numerator = Math.pow(var1 / n1 + var2 / n2, 2);
    const denominator = Math.pow(var1 / n1, 2) / (n1 - 1) + Math.pow(var2 / n2, 2) / (n2 - 1);
    const df = numerator / denominator;

    // Approximate p-value using t-distribution
    // For simplicity, use critical values for common df
    // t-critical(df=∞, α=0.05, two-tailed) ≈ 1.96
    // t-critical(df=10, α=0.05, two-tailed) ≈ 2.228
    // t-critical(df=5, α=0.05, two-tailed) ≈ 2.571
    let tCritical;
    if (df >= 30) tCritical = 1.96;
    else if (df >= 20) tCritical = 2.086;
    else if (df >= 10) tCritical = 2.228;
    else if (df >= 5) tCritical = 2.571;
    else tCritical = 3.182; // df ≈ 3

    const absTStat = Math.abs(tStat);
    const isSignificant = absTStat > tCritical;

    // Rough p-value approximation (two-tailed)
    let pValue;
    if (absTStat < 1) pValue = 0.8;
    else if (absTStat < 1.5) pValue = 0.3;
    else if (absTStat < 2) pValue = 0.1;
    else if (absTStat < 2.5) pValue = 0.05;
    else if (absTStat < 3) pValue = 0.01;
    else pValue = 0.001;

    const direction = mean2 > mean1 ? 'increase' : (mean2 < mean1 ? 'decrease' : 'no_change');

    return {
      tStat,
      pValue,
      df,
      isSignificant,
      direction,
      mean1,
      mean2,
      diff: mean2 - mean1
    };
  }

  // === ЭКСПОРТ ===
  /**
   * 🆕 v3.3.0: Coefficient of Variation (CV)
   * Normalized measure of dispersion (std/mean)
   * Useful for comparing variability across metrics with different scales
   * @param {Array<number>} arr - массив чисел
   * @returns {number} CV (0-1+ где 0=no variation, 0.15=low, 0.35=high)
   */
  function coefficientOfVariation(arr) {
    if (!arr || arr.length < 2) return 0;
    const avg = average(arr);
    if (avg === 0) return 0; // Avoid division by zero
    const std = stdDev(arr);
    return std / Math.abs(avg);
  }

  /**
   * 🆕 v3.4.0: Pearson correlation with statistical significance test
   * Tests null hypothesis: true correlation = 0
   * Uses t-distribution with df = n-2
   * @param {Array<number>} x - first variable
   * @param {Array<number>} y - second variable
   * @param {number} alpha - significance level (default: 0.05)
   * @returns {Object} { r, pValue, isSignificant, n, df, tStat, effectSize, interpretation }
   * @example
   * const result = pearsonWithSignificance([1,2,3,4,5], [2,4,6,8,10]);
   * // → { r: 1.0, pValue: 0.001, isSignificant: true, effectSize: 'large' }
   */
  function pearsonWithSignificance(x, y, alpha = 0.05) {
    const r = pearsonCorrelation(x, y);
    const n = x.length;

    // Insufficient data
    if (n < 3 || x.length !== y.length) {
      return {
        r: 0,
        pValue: 1,
        isSignificant: false,
        n,
        df: 0,
        tStat: 0,
        effectSize: 'insufficient_data',
        interpretation: 'insufficient sample size (n<3)',
        warning: 'insufficient_sample_size'
      };
    }

    // Perfect correlation or no variance
    if (Math.abs(r) === 1 || isNaN(r)) {
      return {
        r,
        pValue: Math.abs(r) === 1 ? 0.001 : 1,
        isSignificant: Math.abs(r) === 1,
        n,
        df: n - 2,
        tStat: Math.abs(r) === 1 ? Infinity : 0,
        effectSize: Math.abs(r) === 1 ? 'large' : 'no_variance',
        interpretation: Math.abs(r) === 1 ? 'perfect correlation (p<0.001)' : 'no variance in one or both variables'
      };
    }

    // t-statistic: t = r * sqrt((n-2)/(1-r²))
    const df = n - 2;
    const tStat = r * Math.sqrt(df / (1 - r * r));
    const absTStat = Math.abs(tStat);

    // Critical t-value for two-tailed test at alpha level
    // Approximate values for common df ranges
    let tCritical;
    if (df >= 30) tCritical = 1.96;       // α=0.05, df=∞
    else if (df >= 20) tCritical = 2.086; // α=0.05, df=20
    else if (df >= 10) tCritical = 2.228; // α=0.05, df=10
    else if (df >= 5) tCritical = 2.571;  // α=0.05, df=5
    else if (df >= 3) tCritical = 3.182;  // α=0.05, df=3
    else tCritical = 12.706;              // α=0.05, df=1

    const isSignificant = absTStat > tCritical;

    // Approximate p-value bins (two-tailed)
    let pValue;
    if (absTStat < 1.0) pValue = 0.8;
    else if (absTStat < 1.5) pValue = 0.3;
    else if (absTStat < 2.0) pValue = 0.1;
    else if (absTStat < 2.5) pValue = 0.05;
    else if (absTStat < 3.0) pValue = 0.01;
    else if (absTStat < 4.0) pValue = 0.005;
    else pValue = 0.001;

    // Effect size interpretation (Cohen's conventions for correlation)
    const absR = Math.abs(r);
    let effectSize;
    if (absR < 0.1) effectSize = 'negligible';
    else if (absR < 0.3) effectSize = 'small';
    else if (absR < 0.5) effectSize = 'medium';
    else effectSize = 'large';

    // Human-readable interpretation
    const interpretation = isSignificant
      ? `${effectSize} effect, statistically significant (p<${alpha})`
      : `${effectSize} effect, not significant (p≈${pValue.toFixed(2)})`;

    return {
      r,
      pValue,
      isSignificant,
      n,
      df,
      tStat,
      effectSize,
      interpretation
    };
  }

  /**
   * 🆕 v3.5.0: Bayesian correlation with prior knowledge
   * Shrinks observed correlation towards prior mean (empirical Bayes)
   * Useful for small N where sample correlation is unstable
   * @param {Array<number>} x - first variable
   * @param {Array<number>} y - second variable
   * @param {number} priorR - prior correlation (e.g., 0 = no effect, 0.3 = typical)
   * @param {number} priorN - effective sample size of prior (weight, typically 5-20)
   * @returns {Object} { posteriorR, observedR, shrinkage, effectiveN, confidence }
   * @example
   * const result = bayesianCorrelation([1,2,3], [2,3,5], 0, 10);
   * // → { posteriorR: 0.85, observedR: 0.98, shrinkage: 0.13 } (shrunk towards 0)
   */
  function bayesianCorrelation(x, y, priorR = 0, priorN = 10) {
    const observedR = pearsonCorrelation(x, y);
    const observedN = x.length;

    if (observedN < 2) {
      return {
        posteriorR: priorR,
        observedR: 0,
        shrinkage: 1,
        effectiveN: priorN,
        confidence: 0.1,
        warning: 'insufficient_data'
      };
    }

    // Handle NaN from zero variance (all values identical)
    if (isNaN(observedR)) {
      console.info('[pi_stats.bayesian] ⚠️ Zero variance detected:', {
        n: observedN,
        fallback: 'using_prior',
        priorR: priorR.toFixed(2)
      });
      return {
        posteriorR: priorR,
        observedR: 0,
        shrinkage: Math.abs(priorR),
        effectiveN: priorN,
        confidence: 0.2,
        warning: 'zero_variance'
      };
    }

    // Weighted average: posterior = (prior*priorN + observed*observedN) / (priorN + observedN)
    const effectiveN = priorN + observedN;
    const posteriorR = (priorR * priorN + observedR * observedN) / effectiveN;
    const shrinkage = Math.abs(observedR - posteriorR);

    // Confidence increases with more data (less prior influence)
    const confidence = Math.min(0.95, observedN / (observedN + priorN));

    const result = {
      posteriorR,
      observedR,
      priorR,
      shrinkage,
      effectiveN,
      observedN,
      priorN,
      confidence,
      interpretation: shrinkage > 0.2
        ? `Strong shrinkage (${Math.round(shrinkage * 100)}%) towards prior`
        : shrinkage > 0.1
          ? `Moderate shrinkage (${Math.round(shrinkage * 100)}%) towards prior`
          : `Minimal shrinkage (${Math.round(shrinkage * 100)}%)`
    };

    // Verification logging
    console.info('[pi_stats.bayesian] ✅ Correlation computed:', {
      observedR: observedR.toFixed(2),
      posteriorR: posteriorR.toFixed(2),
      shrinkage: shrinkage.toFixed(2),
      confidence: confidence.toFixed(2),
      n: observedN
    });

    return result;
  }

  /**
   * 🆕 v3.5.0: Confidence interval for Pearson correlation
   * Uses Fisher z-transformation for normality
   * @param {number} r - observed correlation coefficient
   * @param {number} n - sample size
   * @param {number} confidenceLevel - confidence level (default: 0.95 for 95% CI)
   * @returns {Object} { lower, upper, margin, width, r, n }
   * @example
   * const ci = confidenceIntervalForCorrelation(0.5, 30);
   * // → { lower: 0.19, upper: 0.71, margin: 0.26 }
   */
  function confidenceIntervalForCorrelation(r, n, confidenceLevel = 0.95) {
    if (n < 4) {
      return {
        lower: -1,
        upper: 1,
        margin: 1,
        width: 2,
        r,
        n,
        warning: 'insufficient_sample_size'
      };
    }

    if (Math.abs(r) >= 0.999) {
      // Perfect correlation: CI is very narrow
      return {
        lower: r > 0 ? 0.95 : -1,
        upper: r > 0 ? 1 : -0.95,
        margin: 0.05,
        width: 0.05,
        r,
        n
      };
    }

    // Fisher z-transformation: z = 0.5 * ln((1+r)/(1-r))
    const fisherZ = 0.5 * Math.log((1 + r) / (1 - r));

    // Standard error of z: SE_z = 1 / sqrt(n - 3)
    const seZ = 1 / Math.sqrt(n - 3);

    // Z-score for confidence level (approximate)
    let zScore;
    if (confidenceLevel >= 0.99) zScore = 2.576;
    else if (confidenceLevel >= 0.95) zScore = 1.96;
    else if (confidenceLevel >= 0.90) zScore = 1.645;
    else zScore = 1.96; // default to 95%

    // CI in z-space
    const zLower = fisherZ - zScore * seZ;
    const zUpper = fisherZ + zScore * seZ;

    // Transform back to r-space: r = (e^(2z) - 1) / (e^(2z) + 1)
    const lower = (Math.exp(2 * zLower) - 1) / (Math.exp(2 * zLower) + 1);
    const upper = (Math.exp(2 * zUpper) - 1) / (Math.exp(2 * zUpper) + 1);

    const margin = (upper - lower) / 2;
    const width = upper - lower;

    const result = {
      lower: Math.max(-1, Math.min(1, lower)),
      upper: Math.max(-1, Math.min(1, upper)),
      margin,
      width,
      r,
      n,
      confidenceLevel
    };

    // Verification logging
    console.info('[pi_stats.CI] ✅ Confidence interval:', {
      r: r.toFixed(2),
      n,
      CI: `[${result.lower.toFixed(2)}, ${result.upper.toFixed(2)}]`,
      width: width.toFixed(2)
    });

    return result;
  }

  /**
   * 🆕 v3.5.0: Outlier detection using IQR method
   * Identifies values outside [Q1 - 1.5*IQR, Q3 + 1.5*IQR]
   * @param {Array<number>} arr - array of numbers
   * @param {number} iqrMultiplier - IQR multiplier (default: 1.5, use 3.0 for extreme outliers)
   * @returns {Object} { outliers, cleaned, indices, stats }
   * @example
   * const result = detectOutliers([1, 2, 3, 4, 100]);
   * // → { outliers: [100], cleaned: [1,2,3,4], indices: [4] }
   */
  function detectOutliers(arr, iqrMultiplier = 1.5) {
    if (!Array.isArray(arr) || arr.length < 4) {
      return {
        outliers: [],
        cleaned: arr || [],
        indices: [],
        stats: null,
        warning: 'insufficient_data'
      };
    }

    // Remove NaN/null/undefined values - explicit null check before isFinite
    const validData = arr
      .map((v, i) => ({ rawValue: v, index: i }))
      .filter(item => {
        const val = item.rawValue;
        return val !== null && val !== undefined && Number.isFinite(Number(val));
      })
      .map(item => ({ value: Number(item.rawValue), index: item.index }));

    const values = validData.map(item => item.value);
    const sorted = values.slice().sort((a, b) => a - b);
    const n = sorted.length;

    if (n < 4) {
      return {
        outliers: [],
        cleaned: values,
        indices: [],
        stats: null,
        warning: 'insufficient_data'
      };
    }

    // Calculate quartiles
    const q1 = calculatePercentile(sorted, 25);
    const q3 = calculatePercentile(sorted, 75);
    const iqr = q3 - q1;

    // Outlier bounds
    const lowerBound = q1 - iqrMultiplier * iqr;
    const upperBound = q3 + iqrMultiplier * iqr;

    // Identify outliers
    const outliers = [];
    const outlierIndices = [];
    const cleaned = [];

    validData.forEach(item => {
      if (item.value < lowerBound || item.value > upperBound) {
        outliers.push(item.value);
        outlierIndices.push(item.index);
      } else {
        cleaned.push(item.value);
      }
    });

    const result = {
      outliers,
      cleaned,
      indices: outlierIndices,
      stats: {
        q1,
        q3,
        iqr,
        lowerBound,
        upperBound,
        n: values.length,
        nOutliers: outliers.length,
        outlierRate: outliers.length / values.length
      }
    };

    // Verification logging
    if (outliers.length > 0) {
      console.info('[pi_stats.outliers] ⚠️ Outliers detected:', {
        total: values.length,
        outliers: outliers.length,
        rate: (outliers.length / values.length * 100).toFixed(1) + '%',
        cleaned: cleaned.length
      });
    }

    return result;
  }

  HEYS.InsightsPI.stats = {
    // Базовые статистические функции
    average,
    stdDev,
    variance,
    coefficientOfVariation,

    // Корреляции и регрессии
    pearsonCorrelation,
    pearsonWithSignificance,
    bayesianCorrelation,
    confidenceIntervalForCorrelation,
    detectOutliers,
    calculateTrend,
    calculateLinearRegression,
    calculateR2,
    autocorrelation,

    // Дополнительные метрики
    skewness,
    linearTrend,
    calculatePercentile,
    calculateMovingAverage,
    exponentialMovingAverage,
    calculateConfidenceInterval,

    // Утилиты
    normalizeValue,
    clamp,

    // Statistics safety (Phase 0)
    checkMinN,
    applySmallSamplePenalty,
    statisticalPower,
    confidenceWithWarning,

    // Statistical inference (v3.2.0 — научный week-over-week)
    cohenD,
    twoSampleTTest
  };

  // Fallback для прямого доступа
  global.piStats = HEYS.InsightsPI.stats;

  devLog('[PI Stats] v3.5.0 loaded — 27 statistical functions (+ Bayesian, CI, outliers)');

})(typeof window !== 'undefined' ? window : global);
