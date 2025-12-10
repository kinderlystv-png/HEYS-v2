// heys_sparkline_utils_v1.js — Утилиты для sparkline графиков
// Единый источник для калорий и веса: кривые, расчёты, конфигурация
(function(global) {
  const HEYS = global.HEYS = global.HEYS || {};
  
  // === КОНФИГУРАЦИЯ SPARKLINE ===
  const SPARKLINE_CONFIG = {
    // Период графика (дней)
    chartPeriod: 10,
    
    // Размеры SVG
    svgWidth: 360,
    svgHeight: 120,
    svgHeightKcal: 150, // Калории выше из-за полосы оценки дня
    
    // Отступы
    paddingTop: 16,
    paddingBottom: 16,
    paddingX: 8,
    
    // Lookback для поиска первого дня с данными
    maxLookbackDays: 60,
    
    // === Вес ===
    weight: {
      maxSlopePerDay: 0.3,      // Максимум ±0.3 кг/день
      decayRate: 0.15,          // 15% decay к цели за день (медленнее)
      confidenceKg: 0.3,        // ±300г для confidence interval
      trendThreshold: 0.05,     // Порог изменения для цвета точки
    },
    
    // === Калории ===
    kcal: {
      maxSlopePerDay: 500,      // Максимум ±500 ккал/день
      decayRate: 0.30,          // 30% decay к цели за день
      trendDays: 2,             // Дни по тренду перед regression
    },
    
    // === Анимация ===
    animation: {
      baseDelay: 3,             // Базовая задержка (секунды)
      delayPerPoint: 0.15,      // Задержка на точку
      lineDuration: 1.5,        // Длительность анимации линии
    },
    
    // === Цвета ===
    colors: {
      // Прогноз
      forecast: '#9ca3af',       // gray-400
      forecastOpacity: 0.6,
      
      // Тренд веса
      weightDown: '#22c55e',     // green-500 (хорошо)
      weightUp: '#ef4444',       // red-500 (плохо)
      weightStable: '#8b5cf6',   // violet-500
      
      // Цикл
      retention: '#ec4899',      // pink-500
      
      // Streak
      streakGold: '#f59e0b',     // amber-500
    }
  };

  // === УТИЛИТЫ ===
  
  /**
   * Построить плавную кривую через точки (Catmull-Rom → Bezier)
   * @param {Array<{x: number, y: number}>} pts - Массив точек
   * @param {number} tension - Напряжение кривой (0-1), default 0.25
   * @returns {string} SVG path d attribute
   */
  function smoothPath(pts, tension = 0.25) {
    if (!pts || pts.length < 2) return '';
    if (pts.length === 2) return `M${pts[0].x},${pts[0].y} L${pts[1].x},${pts[1].y}`;
    
    let d = `M${pts[0].x},${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(pts.length - 1, i + 2)];
      
      let cp1x = p1.x + (p2.x - p0.x) * tension;
      let cp1y = p1.y + (p2.y - p0.y) * tension;
      let cp2x = p2.x - (p3.x - p1.x) * tension;
      let cp2y = p2.y - (p3.y - p1.y) * tension;
      
      // Monotonic constraint — ограничиваем overshooting
      const minY = Math.min(p1.y, p2.y);
      const maxY = Math.max(p1.y, p2.y);
      const margin = (maxY - minY) * 0.15;
      cp1y = Math.max(minY - margin, Math.min(maxY + margin, cp1y));
      cp2y = Math.max(minY - margin, Math.min(maxY + margin, cp2y));
      
      d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
    }
    return d;
  }
  
  /**
   * Линейная регрессия для массива значений
   * @param {number[]} values - Массив значений
   * @returns {{slope: number, intercept: number, predict: (x: number) => number}}
   */
  function linearRegression(values) {
    const n = values.length;
    if (n < 2) return { slope: 0, intercept: values[0] || 0, predict: () => values[0] || 0 };
    
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += values[i];
      sumXY += i * values[i];
      sumX2 += i * i;
    }
    
    const denominator = n * sumX2 - sumX * sumX;
    const slope = denominator !== 0 ? (n * sumXY - sumX * sumY) / denominator : 0;
    const intercept = (sumY - slope * sumX) / n;
    
    return {
      slope,
      intercept,
      predict: (x) => intercept + slope * x
    };
  }
  
  /**
   * Regression to Mean — прогноз с возвратом к целевому значению
   * @param {number} lastValue - Последнее известное значение
   * @param {number} targetValue - Целевое значение
   * @param {number} slope - Текущий тренд (изменение за единицу)
   * @param {number} dayIndex - Номер дня прогноза (1, 2, 3...)
   * @param {number} trendDays - Сколько дней следовать тренду (default 2)
   * @param {number} decayRate - Скорость возврата к цели (0-1, default 0.3)
   * @returns {number} Прогнозное значение
   */
  function regressionToMean(lastValue, targetValue, slope, dayIndex, trendDays = 2, decayRate = 0.3) {
    if (dayIndex <= trendDays) {
      // Первые N дней — следуем тренду
      return lastValue + slope * dayIndex;
    } else {
      // После — возвращаемся к цели
      // Сначала вычисляем значение на конец тренд-периода
      let value = lastValue + slope * trendDays;
      // Затем применяем decay для каждого дня после тренда
      for (let d = trendDays + 1; d <= dayIndex; d++) {
        value = value + (targetValue - value) * decayRate;
      }
      return value;
    }
  }
  
  /**
   * Найти первый день с данными за период
   * @param {number} maxDays - Максимум дней назад
   * @param {function} hasDataFn - Функция проверки (dateStr) => boolean
   * @returns {string|null} Дата первого дня с данными или null
   */
  function findFirstDataDay(maxDays, hasDataFn) {
    const today = new Date();
    for (let i = maxDays; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = formatDate(d);
      if (hasDataFn(dateStr)) {
        return dateStr;
      }
    }
    return null;
  }
  
  /**
   * Форматировать дату как YYYY-MM-DD
   */
  function formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  
  /**
   * Получить число дня из даты (без ведущего нуля)
   */
  function getDayNum(dateStr) {
    return dateStr.slice(-2).replace(/^0/, '');
  }
  
  /**
   * Рассчитать координаты точек для SVG
   * @param {Array} data - Массив данных с полем value
   * @param {number} width - Ширина SVG
   * @param {number} height - Высота SVG
   * @param {Object} padding - { top, bottom, x }
   * @param {Object} range - { min, max } или null для авто
   * @returns {Array} Массив точек с x, y координатами
   */
  function calculateSvgPoints(data, width, height, padding, range = null) {
    if (!data || data.length === 0) return [];
    
    const values = data.map(d => d.value);
    const minVal = range?.min ?? Math.min(...values);
    const maxVal = range?.max ?? Math.max(...values);
    const rawRange = maxVal - minVal;
    const valueRange = Math.max(1, rawRange + rawRange * 0.1); // +10% padding
    const adjustedMin = minVal - rawRange * 0.05;
    
    const chartHeight = height - padding.top - padding.bottom;
    const chartWidth = width - padding.x * 2;
    
    return data.map((d, i) => {
      const x = padding.x + (data.length > 1 ? (i / (data.length - 1)) * chartWidth : chartWidth / 2);
      const y = padding.top + chartHeight - ((d.value - adjustedMin) / valueRange) * chartHeight;
      return { ...d, x, y };
    });
  }
  
  /**
   * Clamp значение в диапазон
   */
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
  
  /**
   * Получить цвет тренда веса
   */
  function getWeightTrendColor(change) {
    const threshold = SPARKLINE_CONFIG.weight.trendThreshold;
    if (change < -threshold) return SPARKLINE_CONFIG.colors.weightDown;
    if (change > threshold) return SPARKLINE_CONFIG.colors.weightUp;
    return SPARKLINE_CONFIG.colors.weightStable;
  }
  
  /**
   * Кэш для localStorage — избегаем повторных чтений
   */
  const localStorageCache = {
    _cache: new Map(),
    _lastClear: Date.now(),
    _maxAge: 5000, // 5 секунд
    
    get(key) {
      // Очищаем кэш каждые 5 секунд
      if (Date.now() - this._lastClear > this._maxAge) {
        this._cache.clear();
        this._lastClear = Date.now();
      }
      
      if (this._cache.has(key)) {
        return this._cache.get(key);
      }
      
      try {
        const raw = localStorage.getItem(key);
        if (!raw) {
          this._cache.set(key, null);
          return null;
        }
        const parsed = raw.startsWith('¤Z¤') ? JSON.parse(raw.substring(3)) : JSON.parse(raw);
        this._cache.set(key, parsed);
        return parsed;
      } catch (e) {
        this._cache.set(key, null);
        return null;
      }
    },
    
    clear() {
      this._cache.clear();
      this._lastClear = Date.now();
    },
    
    // Предзагрузка данных для диапазона дат
    preload(keys) {
      keys.forEach(key => this.get(key));
    }
  };
  
  /**
   * Получить данные дня из кэша
   * @param {string} dateStr - Дата YYYY-MM-DD
   * @param {string} clientId - ID клиента
   * @returns {Object|null} Данные дня
   */
  function getDayDataCached(dateStr, clientId) {
    const scopedKey = clientId 
      ? `heys_${clientId}_dayv2_${dateStr}` 
      : `heys_dayv2_${dateStr}`;
    return localStorageCache.get(scopedKey);
  }
  
  /**
   * Предзагрузить данные за период
   * @param {number} days - Количество дней
   * @param {string} clientId - ID клиента
   */
  function preloadDayData(days, clientId) {
    const today = new Date();
    const keys = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = formatDate(d);
      const scopedKey = clientId 
        ? `heys_${clientId}_dayv2_${dateStr}` 
        : `heys_dayv2_${dateStr}`;
      keys.push(scopedKey);
    }
    localStorageCache.preload(keys);
  }

  // === ЭКСПОРТ ===
  HEYS.SparklineUtils = {
    // Конфигурация
    CONFIG: SPARKLINE_CONFIG,
    
    // Функции построения кривых
    smoothPath,
    
    // Математика
    linearRegression,
    regressionToMean,
    clamp,
    
    // Даты
    formatDate,
    getDayNum,
    findFirstDataDay,
    
    // SVG
    calculateSvgPoints,
    
    // Цвета
    getWeightTrendColor,
    
    // Кэширование
    cache: localStorageCache,
    getDayDataCached,
    preloadDayData
  };

  // Для отладки
  if (typeof window !== 'undefined') {
    window.debugSparklineConfig = () => {
      console.table(SPARKLINE_CONFIG);
      console.log('Cache size:', localStorageCache._cache.size);
    };
  }

})(typeof window !== 'undefined' ? window : global);
