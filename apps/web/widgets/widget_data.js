/**
 * widget_data.js
 * Data Access Layer для виджетов
 * Version: 1.0.0
 * Created: 2025-12-15
 * 
 * Централизованный доступ к данным для всех виджетов.
 * Обёртка над существующими HEYS модулями (Day, User, InsulinWave, Cycle).
 */
(function(global) {
  'use strict';
  
  const HEYS = global.HEYS = global.HEYS || {};
  HEYS.Widgets = HEYS.Widgets || {};
  
  // === Data Access Layer ===
  const data = {
    _cache: new Map(),
    _lastUpdate: 0,
    _updateInterval: 1000, // 1 second cache
    
    /**
     * Получить данные для конкретного виджета
     * @param {Object} widget - Widget instance
     * @returns {Object} Data object for widget
     */
    getDataForWidget(widget) {
      switch (widget.type) {
        case 'calories':
          return this.getCaloriesData();
        case 'water':
          return this.getWaterData();
        case 'sleep':
          return this.getSleepData();
        case 'streak':
          return this.getStreakData();
        case 'weight':
          return this.getWeightData();
        case 'steps':
          return this.getStepsData();
        case 'macros':
          return this.getMacrosData();
        case 'insulin':
          return this.getInsulinData();
        case 'heatmap':
          return this.getHeatmapData(widget.settings?.period || 'week');
        case 'cycle':
          return this.getCycleData();
        default:
          return {};
      }
    },
    
    /**
     * Получить данные о калориях
     * @returns {Object} { eaten, target, remaining, pct }
     */
    getCaloriesData() {
      const dayTot = this._getDayTotals();
      const optimum = this._getOptimum();
      
      console.log('[WidgetData] getCaloriesData:', { dayTot, optimum, clientId: HEYS.currentClientId });
      
      return {
        eaten: dayTot?.kcal || 0,
        target: optimum || 2000,
        remaining: Math.max(0, (optimum || 2000) - (dayTot?.kcal || 0)),
        pct: optimum > 0 ? Math.round(((dayTot?.kcal || 0) / optimum) * 100) : 0
      };
    },
    
    /**
     * Получить данные о воде
     * @returns {Object} { drunk, target, pct }
     */
    getWaterData() {
      const day = this._getDay();
      const waterGoal = this._getWaterGoal();
      
      return {
        drunk: day?.waterMl || 0,
        target: waterGoal || 2000,
        pct: waterGoal > 0 ? Math.round(((day?.waterMl || 0) / waterGoal) * 100) : 0
      };
    },
    
    /**
     * Получить данные о сне
     * @returns {Object} { hours, target, quality }
     */
    getSleepData() {
      const day = this._getDay();
      const prof = this._getProfile();
      
      return {
        hours: day?.sleepHours || 0,
        target: prof?.sleepHours || 8,
        quality: day?.sleepQuality || null
      };
    },
    
    /**
     * Получить данные о streak
     * @returns {Object} { current, max }
     */
    getStreakData() {
      // Получаем streak из HEYS.Day если доступен
      const currentStreak = HEYS.Day?.getCurrentStreak?.() || 0;
      const maxStreak = HEYS.Day?.getMaxStreak?.() || currentStreak;
      
      return {
        current: currentStreak,
        max: maxStreak
      };
    },
    
    /**
     * Получить данные о весе (расширенные для адаптивных виджетов)
     * @returns {Object} { current, goal, trend, weekChange, monthChange, daysToGoal, bmi, sparkline, ... }
     */
    getWeightData() {
      const day = this._getDay();
      const prof = this._getProfile();
      
      const current = day?.weightMorning || prof?.weight || null;
      const goal = prof?.weightGoal || null;
      
      // Расчёт тренда и спарклайна
      const trendData = this._calculateWeightTrendExtended();
      const trend = trendData?.trend || null;
      const sparkline = trendData?.sparkline || [];
      
      // BMI
      const bmi = prof?.weight && prof?.height 
        ? parseFloat((prof.weight / Math.pow(prof.height / 100, 2)).toFixed(1))
        : null;
      
      // Прогноз изменения
      const weekChange = trend ? parseFloat((trend * 7).toFixed(2)) : null;
      const monthChange = trend ? parseFloat((trend * 30).toFixed(1)) : null;
      
      // Дней до цели (если тренд в нужном направлении)
      let daysToGoal = null;
      let weeksToGoal = null;
      if (current && goal && trend) {
        const diff = current - goal;
        // Движение к цели: снижаем вес (diff>0, trend<0) или набираем (diff<0, trend>0)
        if ((diff > 0 && trend < -0.01) || (diff < 0 && trend > 0.01)) {
          daysToGoal = Math.round(Math.abs(diff / trend));
          weeksToGoal = Math.round(daysToGoal / 7);
        }
      }
      
      // Прогресс к цели (0-100%)
      let progressPct = null;
      if (current && goal && prof?.weight) {
        const startWeight = prof.weight; // начальный вес из профиля
        const totalDiff = startWeight - goal;
        const currentDiff = current - goal;
        if (Math.abs(totalDiff) > 0.1) {
          progressPct = Math.max(0, Math.min(100, Math.round((1 - currentDiff / totalDiff) * 100)));
        }
      }
      
      // Исключённые дни (цикл/refeed)
      const excludedDays = sparkline?.filter(d => d.excluded)?.length || 0;
      
      return {
        current,
        goal,
        trend,                    // кг/день
        weekChange,               // −0.5 кг/неделю
        monthChange,              // −2.1 кг/месяц
        daysToGoal,               // 98 (дней)
        weeksToGoal,              // 14 (недель)
        progressPct,              // 45%
        bmi,                      // 26.4
        bmiCategory: this._getBMICategory(bmi),
        sparkline,                // массив точек для графика
        dataPoints: sparkline?.length || 0,
        excludedDays,
        hasCleanTrend: excludedDays > 0
      };
    },
    
    /**
     * Получить данные о шагах
     * @returns {Object} { steps, goal, pct }
     */
    getStepsData() {
      const day = this._getDay();
      const prof = this._getProfile();
      const goal = prof?.stepsGoal || 10000;
      
      return {
        steps: day?.steps || 0,
        goal: goal,
        pct: goal > 0 ? Math.round(((day?.steps || 0) / goal) * 100) : 0
      };
    },
    
    /**
     * Получить данные о макросах (БЖУ)
     * @returns {Object}
     */
    getMacrosData() {
      const dayTot = this._getDayTotals();
      const normAbs = this._getNormAbs();
      
      return {
        protein: dayTot?.prot || 0,
        fat: dayTot?.fat || 0,
        carbs: dayTot?.carbs || 0,
        proteinTarget: normAbs?.prot || 100,
        fatTarget: normAbs?.fat || 70,
        carbsTarget: normAbs?.carbs || 250
      };
    },
    
    /**
     * Получить данные об инсулиновой волне
     * @returns {Object}
     */
    getInsulinData() {
      // Получаем данные инсулиновой волны если модуль доступен
      const waveData = HEYS.InsulinWave?.getWaveData?.() || {};
      
      return {
        status: waveData.status || 'unknown',
        remaining: waveData.remaining || 0,
        phase: waveData.currentPhase || null,
        endTime: waveData.endTime || null
      };
    },
    
    /**
     * Получить данные для heatmap
     * @param {string} period - 'week' или 'month'
     * @returns {Object} { days: Array }
     */
    getHeatmapData(period = 'week') {
      const days = [];
      const count = period === 'week' ? 7 : 30;
      const today = new Date();
      
      for (let i = count - 1; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = this._formatDate(date);
        
        const dayData = this._getDayByDate(dateStr);
        const dayTot = this._calculateDayTotals(dayData);
        const optimum = this._getOptimum();
        
        let status = 'empty';
        if (dayTot && dayTot.kcal > 0 && optimum > 0) {
          const ratio = dayTot.kcal / optimum;
          status = HEYS.ratioZones?.getHeatmapStatus?.(ratio) || 'empty';
        }
        
        days.push({
          date: dateStr,
          status
        });
      }
      
      return { days };
    },
    
    /**
     * Получить данные о менструальном цикле
     * @returns {Object}
     */
    getCycleData() {
      const day = this._getDay();
      const cycleDay = day?.cycleDay;
      
      if (!cycleDay) {
        return { day: null, phase: null };
      }
      
      const phase = HEYS.Cycle?.getCyclePhase?.(cycleDay);
      
      return {
        day: cycleDay,
        phase: phase
      };
    },
    
    // === Private Helper Methods ===
    
    // Выбранная дата (устанавливается из WidgetsTab)
    _selectedDate: null,
    
    _getDay() {
      // Используем selectedDate из WidgetsTab, или текущую дату как fallback
      const dateStr = this._selectedDate || this._formatDate(new Date());
      const day = this._getDayByDate(dateStr);
      console.log('[WidgetData] _getDay:', dateStr, '->', day ? 'found' : 'null', 'clientId:', HEYS.currentClientId);
      return day;
    },
    
    _getDayByDate(dateStr) {
      // Ключ дня: heys_dayv2_YYYY-MM-DD (namespace добавляется автоматически через store.get)
      const key = `heys_dayv2_${dateStr}`;
      try {
        let result = null;
        const clientId = HEYS.currentClientId;
        
        // 1. Используем HEYS.store.get (добавляет clientId namespace)
        if (HEYS.store?.get) {
          result = HEYS.store.get(key, null);
          if (result) {
            console.log('[WidgetData] _getDayByDate via store.get:', key);
            return result;
          }
        }
        
        // 2. Пробуем HEYS.utils.lsGet
        if (HEYS.utils?.lsGet) {
          result = HEYS.utils.lsGet(key, null);
          if (result) {
            console.log('[WidgetData] _getDayByDate via lsGet:', key);
            return result;
          }
        }
        
        // 3. Fallback: пробуем scoped key напрямую в localStorage
        if (clientId) {
          const scopedKey = `heys_${clientId}_dayv2_${dateStr}`;
          const stored = localStorage.getItem(scopedKey);
          if (stored) {
            try {
              result = JSON.parse(stored);
              console.log('[WidgetData] _getDayByDate via direct scopedKey:', scopedKey);
              return result;
            } catch (e) {}
          }
        }
        
        // 4. Последний fallback: unscoped key
        const stored = localStorage.getItem(key);
        if (stored) {
          console.log('[WidgetData] _getDayByDate via unscoped key:', key);
          return JSON.parse(stored);
        }
        
        console.log('[WidgetData] _getDayByDate: no data for', key, 'clientId:', clientId);
        return null;
      } catch (e) {
        console.error('[WidgetData] _getDayByDate error:', e);
        return null;
      }
    },
    
    _getProfile() {
      // Используем HEYS.store.get или HEYS.utils.lsGet (с clientId namespace)
      if (HEYS.store?.get) {
        return HEYS.store.get('heys_profile', {});
      }
      if (HEYS.utils?.lsGet) {
        return HEYS.utils.lsGet('heys_profile', {});
      }
      try {
        const stored = localStorage.getItem('heys_profile');
        return stored ? JSON.parse(stored) : {};
      } catch (e) {
        return {};
      }
    },
    
    _getNorms() {
      // Используем HEYS.store.get или HEYS.utils.lsGet (с clientId namespace)
      if (HEYS.store?.get) {
        return HEYS.store.get('heys_norms', {});
      }
      if (HEYS.utils?.lsGet) {
        return HEYS.utils.lsGet('heys_norms', {});
      }
      try {
        const stored = localStorage.getItem('heys_norms');
        return stored ? JSON.parse(stored) : {};
      } catch (e) {
        return {};
      }
    },
    
    _getDayTotals() {
      // Вычисляем из данных дня
      const day = this._getDay();
      const totals = this._calculateDayTotals(day);
      console.log('[WidgetData] _getDayTotals:', totals);
      return totals;
    },
    
    _calculateDayTotals(day) {
      if (!day || !day.meals) {
        return { kcal: 0, prot: 0, fat: 0, carbs: 0, fiber: 0 };
      }
      
      const totals = { kcal: 0, prot: 0, fat: 0, carbs: 0, fiber: 0 };
      
      day.meals.forEach(meal => {
        if (meal.items) {
          meal.items.forEach(item => {
            // Используем сохранённые в item данные или получаем из продукта
            const g = (item.grams || 0) / 100;
            totals.kcal += (item.kcal100 || 0) * g;
            totals.prot += (item.protein100 || 0) * g;
            totals.fat += (item.fat100 || 0) * g;
            totals.carbs += (item.carbs100 || 0) * g;
            totals.fiber += (item.fiber100 || 0) * g;
          });
        }
      });
      
      return totals;
    },
    
    _getOptimum() {
      // Базовый расчёт калорийной нормы
      const prof = this._getProfile();
      console.log('[WidgetData] _getOptimum profile:', prof);
      if (!prof.weight || !prof.height || !prof.age) {
        return 2000; // Дефолт
      }
      
      // BMR по Mifflin-St Jeor
      let bmr;
      if (prof.gender === 'Мужской') {
        bmr = 10 * prof.weight + 6.25 * prof.height - 5 * prof.age + 5;
      } else {
        bmr = 10 * prof.weight + 6.25 * prof.height - 5 * prof.age - 161;
      }
      
      // Activity multiplier (default moderate)
      const activityMultipliers = {
        sedentary: 1.2,
        light: 1.375,
        moderate: 1.55,
        active: 1.725,
        very_active: 1.9
      };
      
      const multiplier = activityMultipliers[prof.activityLevel] || 1.55;
      const tdee = Math.round(bmr * multiplier);
      
      // Apply deficit/surplus
      const deficitPct = prof.deficitPctTarget || 0;
      return Math.round(tdee * (1 + deficitPct / 100));
    },
    
    _getNormAbs() {
      const optimum = this._getOptimum();
      const norms = this._getNorms();
      
      const carbsPct = norms.carbsPct || 50;
      const proteinPct = norms.proteinPct || 25;
      const fatPct = 100 - carbsPct - proteinPct;
      
      return {
        kcal: optimum,
        carbs: Math.round(optimum * carbsPct / 100 / 4),
        prot: Math.round(optimum * proteinPct / 100 / 4),
        fat: Math.round(optimum * fatPct / 100 / 9)
      };
    },
    
    _getWaterGoal() {
      // Если есть HEYS.Day, используем его метод
      if (HEYS.Day?.getWaterGoal) {
        return HEYS.Day.getWaterGoal();
      }
      
      // Fallback: базовый расчёт (30мл на кг веса)
      const prof = this._getProfile();
      return Math.round((prof.weight || 70) * 30);
    },
    
    _calculateWeightTrend() {
      // Получаем веса за последние 7 дней
      const weights = [];
      const today = new Date();
      
      for (let i = 0; i < 7; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = this._formatDate(date);
        const dayData = this._getDayByDate(dateStr);
        
        if (dayData?.weightMorning) {
          weights.push({
            date: dateStr,
            weight: dayData.weightMorning,
            daysAgo: i
          });
        }
      }
      
      if (weights.length < 2) return null;
      
      // Простой тренд: разница между первым и последним
      const latest = weights[0];
      const oldest = weights[weights.length - 1];
      
      return (latest.weight - oldest.weight) / oldest.daysAgo;
    },
    
    /**
     * Расширенный расчёт тренда веса + спарклайн
     * @param {number} days - количество дней для анализа
     * @returns {Object} { trend, sparkline }
     */
    _calculateWeightTrendExtended(days = 14) {
      const weights = [];
      const today = new Date();
      
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = this._formatDate(date);
        const dayData = this._getDayByDate(dateStr);
        
        // Проверка на исключённые дни (цикл/refeed)
        const cycleDay = dayData?.cycleDay;
        const isRefeed = dayData?.isRefeedDay;
        const hasRetention = HEYS.Cycle?.getWaterRetentionInfo?.(cycleDay)?.hasRetention || false;
        const excluded = hasRetention || isRefeed;
        
        weights.push({
          date: dateStr,
          dayNum: date.getDate(),
          weight: dayData?.weightMorning || null,
          daysAgo: i,
          isToday: i === 0,
          excluded,
          cycleDay,
          hasWaterRetention: hasRetention
        });
      }
      
      // Фильтруем для расчёта тренда (только с весом, без исключённых)
      const validWeights = weights.filter(w => w.weight !== null && !w.excluded);
      
      let trend = null;
      if (validWeights.length >= 2) {
        // Линейная регрессия
        const n = validWeights.length;
        const sumX = validWeights.reduce((s, w, i) => s + i, 0);
        const sumY = validWeights.reduce((s, w) => s + w.weight, 0);
        const sumXY = validWeights.reduce((s, w, i) => s + i * w.weight, 0);
        const sumX2 = validWeights.reduce((s, w, i) => s + i * i, 0);
        
        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        trend = isNaN(slope) ? null : slope;
      }
      
      return {
        trend,
        sparkline: weights,
        dataPoints: validWeights.length,
        excludedCount: weights.filter(w => w.excluded).length
      };
    },
    
    /**
     * Определить категорию BMI
     * @param {number} bmi
     * @returns {Object} { id, label, color }
     */
    _getBMICategory(bmi) {
      if (!bmi) return null;
      
      if (bmi < 18.5) return { id: 'underweight', label: 'Недостаток', color: '#3b82f6' };
      if (bmi < 25) return { id: 'normal', label: 'Норма', color: '#22c55e' };
      if (bmi < 30) return { id: 'overweight', label: 'Избыток', color: '#eab308' };
      return { id: 'obese', label: 'Ожирение', color: '#ef4444' };
    },
    
    _formatDate(date) {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    },
    
    /**
     * Подписаться на обновления данных
     * @param {Function} callback
     * @returns {Function} unsubscribe
     */
    subscribe(callback) {
      // Подписываемся на события HEYS, которые могут изменить данные
      const events = [
        'day:updated',
        'meal:added',
        'meal:updated',
        'product:added',
        'water:added',
        'training:added',
        'profile:updated'
      ];
      
      const handler = () => {
        callback();
        HEYS.Widgets.emit('data:updated', {});
      };
      
      // Подписываемся на все события
      events.forEach(event => {
        if (HEYS.events?.on) {
          HEYS.events.on(event, handler);
        }
      });
      
      // Возвращаем функцию отписки
      return () => {
        events.forEach(event => {
          if (HEYS.events?.off) {
            HEYS.events.off(event, handler);
          }
        });
      };
    },
    
    /**
     * Принудительно обновить данные
     */
    refresh() {
      this._cache.clear();
      this._lastUpdate = Date.now();
      HEYS.Widgets.emit('data:updated', {});
    }
  };
  
  // === Export ===
  HEYS.Widgets.data = data;
  
  console.log('[HEYS] Widgets Data Layer v1.0.0 loaded');
  
})(typeof window !== 'undefined' ? window : global);
