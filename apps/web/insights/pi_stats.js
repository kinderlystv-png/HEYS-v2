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
    calculateConfidenceInterval,

    // Утилиты
    normalizeValue,
    clamp
  };

  // Fallback для прямого доступа
  global.piStats = HEYS.InsightsPI.stats;

  devLog('[PI Stats] v3.0.0 loaded — 15 statistical functions');

})(typeof window !== 'undefined' ? window : global);
