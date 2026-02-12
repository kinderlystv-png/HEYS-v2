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
    return numerator / denominator;
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
   * @returns {Object} { confidence: adjusted, warning: '⚠️ N=5 (min 7)' | null }
   */
  function confidenceWithWarning(confidence, n, threshold = 0.5) {
    const adjusted = applySmallSamplePenalty(confidence, n, 7);
    const warning = adjusted < threshold ? `⚠️ N=${n} (min 7)` : null;
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
  HEYS.InsightsPI.stats = {
    // Базовые статистические функции
    average,
    stdDev,
    variance,

    // Корреляции и регрессии
    pearsonCorrelation,
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

  devLog('[PI Stats] v3.2.0 loaded — 18 statistical functions (+ t-test, Cohen\'s d)');

})(typeof window !== 'undefined' ? window : global);
