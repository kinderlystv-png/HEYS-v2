/**
 * pi_math.js — Layer B: Pure Math/Statistics Functions
 * =====================================================
 * 
 * Чистые математические функции без внешних зависимостей.
 * Stateless, легко тестируемые.
 * 
 * @version 1.1.0
 * @created 2026-01-11
 * 
 * Экспортируется как:
 *   - HEYS.InsightsPI.math (SSOT)
 *   - window.piMath (fallback)
 * 
 * Используется:
 *   - pi_data.js
 *   - pi_core.js
 *   - heys_predictive_insights_v1.js (основной файл)
 */

(function() {
  'use strict';

  // ============================================
  // STATISTICAL FUNCTIONS
  // ============================================

  /**
   * Рассчитать корреляцию Пирсона
   * @param {Array<number>} x - первый массив
   * @param {Array<number>} y - второй массив
   * @returns {number} корреляция [-1, 1] или 0 при ошибке
   */
  function pearsonCorrelation(x, y) {
    if (!Array.isArray(x) || !Array.isArray(y)) return 0;
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
   * Рассчитать линейный тренд (slope) по индексам
   * @param {Array<number>} values - массив значений
   * @returns {number} наклон (положительный = рост)
   */
  function calculateTrend(values) {
    if (!Array.isArray(values) || values.length < 2) return 0;
    
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
   * Рассчитать линейный тренд по точкам (x, y)
   * Используется для точного прогноза по датам
   * @param {Array<{x: number, y: number}>} points
   * @returns {number} наклон (slope)
   */
  function calculateLinearRegression(points) {
    if (!Array.isArray(points) || points.length < 2) return 0;
    
    const n = points.length;
    const sumX = points.reduce((a, p) => a + (p?.x || 0), 0);
    const sumY = points.reduce((a, p) => a + (p?.y || 0), 0);
    const sumXY = points.reduce((a, p) => a + (p?.x || 0) * (p?.y || 0), 0);
    const sumX2 = points.reduce((a, p) => a + (p?.x || 0) * (p?.x || 0), 0);
    
    const denominator = (n * sumX2 - sumX * sumX);
    if (denominator === 0) return 0;

    const slope = (n * sumXY - sumX * sumY) / denominator;
    return isNaN(slope) ? 0 : slope;
  }

  /**
   * Рассчитать среднее арифметическое
   * @param {Array<number>} arr
   * @returns {number}
   */
  function average(arr) {
    if (!Array.isArray(arr) || arr.length === 0) return 0;
    return arr.reduce((a, b) => a + (b || 0), 0) / arr.length;
  }

  /**
   * Рассчитать стандартное отклонение (sample)
   * @param {Array<number>} arr
   * @returns {number}
   */
  function stdDev(arr) {
    if (!Array.isArray(arr) || arr.length < 2) return 0;
    const avg = average(arr);
    const squareDiffs = arr.map(v => Math.pow((v || 0) - avg, 2));
    return Math.sqrt(average(squareDiffs));
  }

  /**
   * Коэффициент детерминации R²
   * @param {number[]} actual
   * @param {number[]} predicted
   * @returns {number}
   */
  function calculateR2(actual, predicted) {
    if (!Array.isArray(actual) || !Array.isArray(predicted)) return 0;
    if (actual.length !== predicted.length || actual.length < 2) return 0;

    const meanActual = average(actual);
    const ssRes = actual.reduce((sum, a, i) => sum + Math.pow(a - (predicted?.[i] ?? 0), 2), 0);
    const ssTot = actual.reduce((sum, a) => sum + Math.pow(a - meanActual, 2), 0);

    return ssTot > 0 ? 1 - ssRes / ssTot : 0;
  }

  /**
   * Дисперсия (sample variance)
   * @param {number[]} arr
   * @returns {number}
   */
  function variance(arr) {
    if (!Array.isArray(arr) || arr.length < 2) return 0;
    const mean = average(arr);
    return average(arr.map(x => Math.pow((x ?? 0) - mean, 2)));
  }

  /**
   * Автокорреляция (lag-k)
   * @param {number[]} arr
   * @param {number} lag
   * @returns {number}
   */
  function autocorrelation(arr, lag = 1) {
    if (!Array.isArray(arr) || arr.length <= lag) return 0;

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
   * Асимметрия распределения
   * @param {number[]} arr
   * @returns {number}
   */
  function skewness(arr) {
    if (!Array.isArray(arr) || arr.length < 3) return 0;

    const mean = average(arr);
    const std = stdDev(arr);
    if (std === 0) return 0;

    const n = arr.length;
    const m3 = arr.reduce((sum, x) => sum + Math.pow(((x ?? 0) - mean) / std, 3), 0) / n;

    return m3;
  }

  /**
   * Линейный тренд по последовательности
   * @param {number[]} arr
   * @returns {number}
   */
  function linearTrend(arr) {
    if (!Array.isArray(arr) || arr.length < 2) return 0;

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

  // ============================================
  // ADDITIONAL MATH UTILITIES
  // ============================================

  /**
   * Clamp value between min and max
   * @param {number} value
   * @param {number} min
   * @param {number} max
   * @returns {number}
   */
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  /**
   * Round to specified decimal places
   * @param {number} value
   * @param {number} decimals
   * @returns {number}
   */
  function round(value, decimals = 2) {
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
  }

  /**
   * Calculate percentage
   * @param {number} value
   * @param {number} total
   * @returns {number}
   */
  function pct(value, total) {
    if (!total) return 0;
    return (value / total) * 100;
  }

  /**
   * Linear interpolation
   * @param {number} a - start value
   * @param {number} b - end value
   * @param {number} t - progress (0-1)
   * @returns {number}
   */
  function lerp(a, b, t) {
    return a + (b - a) * clamp(t, 0, 1);
  }

  // ============================================
  // EXPORT
  // ============================================

  const piMath = {
    // Core statistics
    pearsonCorrelation,
    calculateTrend,
    calculateLinearRegression,
    average,
    stdDev,
    calculateR2,
    variance,
    autocorrelation,
    skewness,
    linearTrend,
    
    // Utilities
    clamp,
    round,
    pct,
    lerp,
    
    // Meta
    _version: '1.1.0',
    _layer: 'B'
  };

  // 1. HEYS.InsightsPI.math (SSOT)
  window.HEYS = window.HEYS || {};
  window.HEYS.InsightsPI = window.HEYS.InsightsPI || {};
  window.HEYS.InsightsPI.math = piMath;

  // 2. window.piMath (fallback)
  window.piMath = piMath;

})();
