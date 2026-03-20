/**
 * widget_data.js
 * Data Access Layer для виджетов
 * Version: 1.1.0
 * Created: 2025-12-15
 * Updated: 2025-01-05
 * 
 * Централизованный доступ к данным для всех виджетов.
 * Обёртка над существующими HEYS модулями (Day, User, InsulinWave, Cycle).
 * 
 * v1.1.0: Добавлен Demo Mode для WidgetsTour — показывает реалистичные
 *         демо-данные во время тура, возвращается к реальным после.
 */
(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  HEYS.Widgets = HEYS.Widgets || {};

  // === DEMO DATA для WidgetsTour ===
  // Реалистичные данные для демонстрации возможностей виджетов
  const DEMO_WIDGET_DATA = {
    calories: {
      eaten: 1650,
      target: 2100,
      remaining: 450,
      pct: 79
    },
    water: {
      drunk: 1400,
      target: 2000,
      pct: 70
    },
    sleep: {
      hours: 7.5,
      target: 8,
      quality: 4
    },
    streak: {
      current: 5,
      max: 12
    },
    weight: {
      current: 72.5,
      goal: 70,
      trend: -0.08,
      weekChange: -0.56,
      monthChange: -2.4,
      daysToGoal: 31,
      weeksToGoal: 4,
      progressPct: 62,
      bmi: 24.2,
      bmiCategory: { name: 'Норма', color: '#22c55e' },
      sparkline: [
        { date: '2025-01-01', weight: 74.2 },
        { date: '2025-01-02', weight: 74.0 },
        { date: '2025-01-03', weight: 73.8 },
        { date: '2025-01-04', weight: 73.5 },
        { date: '2025-01-05', weight: 72.5 }
      ],
      dataPoints: 5,
      excludedDays: 0,
      hasCleanTrend: false
    },
    steps: {
      steps: 7850,
      goal: 10000,
      pct: 79
    },
    macros: {
      protein: 95,
      fat: 52,
      carbs: 185,
      proteinTarget: 120,
      fatTarget: 70,
      carbsTarget: 260
    },
    insulin: {
      status: 'almost',
      remaining: 25,
      phase: 'decline',
      endTime: '14:30'
    },
    heatmap: {
      days: [
        { date: '2025-01-01', status: 'green', hasTraining: true, highStress: false },
        { date: '2025-01-02', status: 'green', hasTraining: false, highStress: false },
        { date: '2025-01-03', status: 'yellow', hasTraining: false, highStress: true },
        { date: '2025-01-04', status: 'green', hasTraining: true, highStress: false },
        { date: '2025-01-05', status: 'green', hasTraining: false, highStress: false },
        { date: '2025-01-06', status: 'yellow', hasTraining: false, highStress: false },
        { date: '2025-01-07', status: 'empty', hasTraining: false, highStress: false }
      ]
    },
    cycle: {
      day: 12,
      phase: { id: 'follicular', name: 'Фолликулярная', icon: '🌱' }
    },
    status: {
      score: 78,
      topIssues: ['Осталось 450 ккал', 'Добавь воды'],
      factors: {
        nutrition: 0.82,
        activity: 0.75,
        recovery: 0.80,
        hydration: 0.70
      }
    },
    crashRisk: {
      level: 'low',
      score: 25,
      factors: ['Хороший сон', 'Низкий стресс'],
      recommendation: 'Продолжай в том же духе!'
    }
  };

  const parseStoredValue = (raw, fallback) => {
    if (raw == null) return fallback;
    if (typeof raw === 'object') return raw;
    if (typeof raw !== 'string') return raw;
    try {
      if (raw.startsWith('¤Z¤') && HEYS.store?.decompress) {
        return HEYS.store.decompress(raw);
      }
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  };

  const readStoredValue = (key, fallback) => {
    try {
      if (HEYS.store?.get) return HEYS.store.get(key, fallback);
      if (HEYS.utils?.lsGet) return HEYS.utils.lsGet(key, fallback);
      const raw = localStorage.getItem(key);
      return parseStoredValue(raw, fallback);
    } catch (e) {
      return fallback;
    }
  };

  const RELAPSE_PROFILE_STORAGE_KEY = 'heys_relapse_risk_dev_profile';

  // === Data Access Layer ===
  const data = {
    _cache: new Map(),
    _lastUpdate: 0,
    _updateInterval: 1000, // 1 second cache

    /**
     * Проверка: активен ли демо-режим (WidgetsTour запущен)
     * @returns {boolean}
     */
    _isDemoMode() {
      return HEYS.WidgetsTour?.isActive?.() === true;
    },

    /**
     * Получить данные для конкретного виджета
     * @param {Object} widget - Widget instance
     * @returns {Object} Data object for widget
     */
    getDataForWidget(widget) {
      switch (widget.type) {
        case 'status':
          return this.getStatusData();
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
          return this.getHeatmapData(widget.settings?.period === 'month' ? 'week' : (widget.settings?.period || 'week'));
        case 'cycle':
          return this.getCycleData();
        case 'crashRisk':
          return this.getCrashRiskData(widget.settings);
        case 'relapseRisk':
          return this.getRelapseRiskData(widget);
        case 'dayScore':
          return this.getDayScoreData();
        default:
          return {};
      }
    },

    /**
     * Получить данные Day Score (единый дневной скоринг 0-100)
     */
    getDayScoreData() {
      if (!HEYS.DayScore?.calculateDayScore) {
        console.warn('[widget_data.getDayScoreData] DayScore engine not loaded');
        return { hasData: false, score: 0, level: 'none' };
      }
      try {
        const dayData = this._getDay() || {};
        const profile = this._getProfile() || {};
        const dayTot = this._getDayTotals() || {};
        const normAbs = this._getNormAbs() || {};
        const waterGoal = this._getWaterGoal() || 2000;

        const result = HEYS.DayScore.calculateDayScore({
          dayData, profile, dayTot, normAbs, waterGoal
        });

        if (!result || typeof result.score !== 'number') {
          return { hasData: false, score: 0, level: 'none' };
        }

        console.info('[widget_data.getDayScoreData] ✅', {
          score: result.score, level: result.level?.id || result.level
        });

        return {
          hasData: true,
          score: result.score,
          rawScore: result.rawScore,
          factorScore: result.factorScore,
          subjectiveScore: result.subjectiveScore,
          momentumScore: result.momentumScore,
          avgMealQuality: result.avgMealQuality,
          level: result.level?.id || result.level,
          levelLabel: result.level?.label || '',
          breakdown: result.breakdown || {},
          statusResult: result.statusResult || null,
          timestamp: result.timestamp
        };
      } catch (error) {
        console.error('[widget_data.getDayScoreData] ❌ Error:', error);
        return { hasData: false, score: 0, level: 'none' };
      }
    },

    /**
     * Получить данные Relapse Risk Score
     */
    getRelapseRiskData(widget, options = {}) {
      if (!HEYS.RelapseRisk?.getCurrentSnapshot) {
        console.warn('[widget_data.getRelapseRiskData] relapseRisk engine not loaded');
        return { hasData: false, score: 0, level: 'low', message: 'Engine не загружен' };
      }

      const normalizeRelapseRecommendation = (rec) => {
        if (!rec) return null;
        if (typeof rec === 'string') return rec;
        if (typeof rec?.text === 'string' && rec.text.trim()) return rec.text.trim();
        if (typeof rec?.action === 'string' && rec.action.trim()) return rec.action.trim();
        if (typeof rec?.label === 'string' && rec.label.trim()) return rec.label.trim();
        if (typeof rec?.title === 'string' && rec.title.trim()) return rec.title.trim();
        return null;
      };

      const normalizeRecommendationRecord = (rec) => {
        const text = normalizeRelapseRecommendation(rec);
        if (!text) return null;
        return typeof rec === 'object' && rec !== null
          ? { ...rec, text }
          : { text };
      };

      try {
        const selectedProfileKey = this._getRelapseRiskProfileKey(
          options?.weightProfileKey || options?.riskProfileKey || options?.tuningProfile
        );

        const snapshot = HEYS.RelapseRisk.getCurrentSnapshot({
          weightProfileKey: selectedProfileKey
        });
        if (!snapshot?.hasData) {
          return { hasData: false, score: 0, level: 'low', message: snapshot?.message || 'Нет данных расчёта' };
        }

        const result = snapshot?.raw || {};
        const score = Math.round(Number(snapshot?.score ?? result?.score) || 0);
        const confidence = Math.round(Number(snapshot?.confidence ?? result?.confidence) || 0);
        let windows = snapshot?.windows || result?.windows || {};
        let mergedDrivers = Array.isArray(snapshot?.primaryDrivers)
          ? snapshot.primaryDrivers.slice(0, 3)
          : (Array.isArray(result?.primaryDrivers) ? result.primaryDrivers.slice(0, 3) : []);
        let mergedRecommendations = (Array.isArray(snapshot?.recommendations) ? snapshot.recommendations : (Array.isArray(result?.recommendations) ? result.recommendations : []))
          .map(normalizeRecommendationRecord)
          .filter(Boolean);

        // Risk Radar aggregation: inject max(relapse, crash) + source attribution
        let radarSource = 'none';
        let radarCrashScore = 0;
        let radarDrivers = [];
        let radarActions = [];
        let radarScore = score;
        let radarLevelId = '';
        let blendWeights = null;
        if (HEYS.RiskRadar?.calculate) {
          try {
            const profile = this._getProfile() || {};
            const historyDays = HEYS.RelapseRisk?.getHistoryDays?.() || snapshot?.historyDays || [];
            const radar = HEYS.RiskRadar.calculate({ profile, historyDays });
            if (radar && typeof radar.score === 'number') {
              radarScore = radar.score;
              radarSource = radar.source || 'none';
              radarCrashScore = Math.round(Number(radar.crash?.score) || 0);
              radarLevelId = radar.level?.id || '';
              blendWeights = radar.blend?.weights || null;
              radarDrivers = (radar.drivers || []).map(d => d.label || d.factor || String(d));
              radarActions = (radar.actions || []).map(a => a.text || a.label || String(a));
              if (radar.windows && typeof radar.windows === 'object') {
                windows = radar.windows;
              }
              if (Array.isArray(radar.drivers) && radar.drivers.length > 0) {
                mergedDrivers = radar.drivers.slice(0, 3);
              }
              if (Array.isArray(radar.actions) && radar.actions.length > 0) {
                const deduped = [];
                const seen = new Set();
                [
                  ...radar.actions,
                  ...mergedRecommendations,
                ].forEach((item) => {
                  const normalized = normalizeRecommendationRecord(item);
                  const key = normalized?.text?.toLowerCase?.() || '';
                  if (key && !seen.has(key)) {
                    seen.add(key);
                    deduped.push(normalized);
                  }
                });
                mergedRecommendations = deduped.slice(0, 3);
              }
            }
          } catch (radarErr) {
            console.warn('[widget_data.getRelapseRiskData] RiskRadar enrichment failed:', radarErr?.message);
          }
        }

        const windowCandidates = [
          { key: 'tonight', label: 'сегодня вечером', score: Number(windows.tonight) || 0 },
          { key: 'next3h', label: 'в ближ. 3ч', score: Number(windows.next3h) || 0 },
          { key: 'next24h', label: 'в ближ. 24ч', score: Number(windows.next24h) || 0 }
        ].sort((a, b) => b.score - a.score);

        const topWindowLabel = windowCandidates[0]?.label || 'сейчас';
        const topWindowScore = Math.round(windowCandidates[0]?.score || 0);
        const primaryDriver = mergedDrivers[0] || null;
        const recommendation = mergedRecommendations[0]?.text || null;

        console.info('[widget_data.getRelapseRiskData] ✅ Calculated', {
          score, radarScore, radarSource, level: result?.level || snapshot?.level, confidence,
          historyDays: result?.debug?.inputs?.historyDaysCount || 0
        });

        return {
          hasData: true,
          profile: snapshot?.profile || result?.profile || null,
          selectedProfileKey: snapshot?.selectedProfileKey || selectedProfileKey,
          score: radarScore,
          relapseScore: score,
          crashScore: radarCrashScore,
          source: radarSource,
          blendWeights,
          radarDrivers,
          radarActions,
          target: 100,
          pct: radarScore,
          remaining: Math.max(0, 100 - radarScore),
          level: radarLevelId || snapshot?.level || result?.level || 'low',
          confidence,
          topWindowLabel,
          topWindowScore,
          primaryDriver,
          primaryDrivers: mergedDrivers,
          protectiveFactors: Array.isArray(snapshot?.protectiveFactors) ? snapshot.protectiveFactors : (Array.isArray(result?.protectiveFactors) ? result.protectiveFactors.slice(0, 2) : []),
          recommendation,
          recommendations: mergedRecommendations,
          windows,
          compare: snapshot?.compare || null,
          raw: result
        };
      } catch (error) {
        console.error('[widget_data.getRelapseRiskData] ❌ Error:', error);
        return { hasData: false, _error: error?.message, score: 0, level: 'low' };
      }
    },

    /**
     * Получить данные для статуса 0-100
     * @returns {Object} { status, dayData, profile, dayTot, normAbs, waterGoal }
     */
    getStatusData() {
      // 🎭 Demo mode: возвращаем демо-данные во время тура
      if (this._isDemoMode()) {
        return {
          status: { score: DEMO_WIDGET_DATA.status.score, level: 'good' },
          dayData: {},
          profile: {},
          dayTot: { kcal: DEMO_WIDGET_DATA.calories.eaten },
          normAbs: {},
          waterGoal: DEMO_WIDGET_DATA.water.target,
          topIssues: DEMO_WIDGET_DATA.status.topIssues,
          factors: DEMO_WIDGET_DATA.status.factors
        };
      }

      const dayData = this._getDay() || {};
      const profile = this._getProfile() || {};
      const dayTot = this._getDayTotals() || {};
      const normAbs = this._getNormAbs() || {};
      const waterGoal = this._getWaterGoal() || 2000;

      // Вычисляем статус если модуль доступен
      const status = HEYS.Status?.calculateStatus?.({
        dayData,
        profile,
        dayTot,
        normAbs,
        waterGoal
      }) || { score: 0, level: 'okay' };

      return {
        status,
        dayData,
        profile,
        dayTot,
        normAbs,
        waterGoal
      };
    },

    /**
     * Получить данные о калориях
     * @returns {Object} { eaten, target, remaining, pct }
     */
    getCaloriesData() {
      // 🎭 Demo mode
      if (this._isDemoMode()) {
        return { ...DEMO_WIDGET_DATA.calories };
      }

      const dayTot = this._getDayTotals();
      const optimum = this._getOptimum();

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
      // 🎭 Demo mode
      if (this._isDemoMode()) {
        return { ...DEMO_WIDGET_DATA.water };
      }

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
      // 🎭 Demo mode
      if (this._isDemoMode()) {
        return { ...DEMO_WIDGET_DATA.sleep };
      }

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
      // 🎭 Demo mode
      if (this._isDemoMode()) {
        return { ...DEMO_WIDGET_DATA.streak };
      }

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
      // 🎭 Demo mode
      if (this._isDemoMode()) {
        return { ...DEMO_WIDGET_DATA.weight };
      }

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
      // 🎭 Demo mode
      if (this._isDemoMode()) {
        return { ...DEMO_WIDGET_DATA.steps };
      }

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
      // 🎭 Demo mode
      if (this._isDemoMode()) {
        return { ...DEMO_WIDGET_DATA.macros };
      }

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
      // 🎭 Demo mode
      if (this._isDemoMode()) {
        return { ...DEMO_WIDGET_DATA.insulin };
      }

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
     * @returns {Object} { days: Array, currentStreak }
     * v3.22.0: добавлено hasTraining, highStress в каждый день
     */
    getHeatmapData(period = 'week') {
      // 🎭 Demo mode
      if (this._isDemoMode()) {
        return { ...DEMO_WIDGET_DATA.heatmap };
      }

      const days = [];
      const count = period === 'week' ? 7 : 30;
      const today = new Date();

      for (let i = count - 1; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = this._formatDate(date);

        const dayData = this._getDayByDate(dateStr);
        const dayTot = this._calculateDayTotals(dayData);
        const optimum = this._getOptimumForDay(dayData);

        let status = 'empty';
        if (dayTot && dayTot.kcal > 0 && optimum > 0) {
          const ratio = dayTot.kcal / optimum;
          status = HEYS.ratioZones?.getHeatmapStatus?.(ratio) || 'empty';
        }

        // 🆕 v3.22.0: Extended analytics — training & stress
        const hasTraining = dayData?.trainings?.length > 0;
        const highStress = (dayData?.stressAvg || 0) >= 6;

        days.push({
          date: dateStr,
          status,
          hasTraining,
          highStress
        });
      }

      return { days };
    },

    /**
     * Получить данные о менструальном цикле
     * @returns {Object}
     */
    getCycleData() {
      // 🎭 Demo mode
      if (this._isDemoMode()) {
        return { ...DEMO_WIDGET_DATA.cycle };
      }

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
      return day;
    },

    _getDayByDate(dateStr) {
      // Ключ дня: heys_dayv2_YYYY-MM-DD (namespace добавляется автоматически через store.get)
      const key = `heys_dayv2_${dateStr}`;
      try {
        const clientId = HEYS.currentClientId;

        // 1. Store-first (scoped через HEYS.store / HEYS.utils)
        const stored = readStoredValue(key, null);
        if (stored) return stored;

        // 2. Fallback: scoped key напрямую в localStorage
        if (clientId) {
          const scopedKey = `heys_${clientId}_dayv2_${dateStr}`;
          const scopedRaw = localStorage.getItem(scopedKey);
          const scopedParsed = parseStoredValue(scopedRaw, null);
          if (scopedParsed) return scopedParsed;
        }

        // 3. Последний fallback: unscoped key
        const raw = localStorage.getItem(key);
        return parseStoredValue(raw, null);
      } catch (e) {
        return null;
      }
    },

    _getProfile() {
      return readStoredValue('heys_profile', {});
    },

    _getRelapseRiskProfileKey(overrideKey) {
      if (typeof overrideKey === 'string' && overrideKey.trim()) {
        return overrideKey.trim();
      }

      const storedValue = readStoredValue(RELAPSE_PROFILE_STORAGE_KEY, '');
      if (typeof storedValue === 'string' && storedValue.trim()) {
        return storedValue.trim();
      }

      return HEYS.RelapseRisk?.CONFIG?.DEFAULT_PROFILE_KEY || 'v1_1';
    },

    _getNorms() {
      return readStoredValue('heys_norms', {});
    },

    _getDayTotals() {
      // Вычисляем из данных дня
      const day = this._getDay();
      const totals = this._calculateDayTotals(day);
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
      const day = this._getDay() || {};
      return this._getOptimumForDay(day);
    },

    _getOptimumForDay(dayData) {
      const dayUtils = HEYS.dayUtils || {};
      if (dayUtils.getOptimumForDay) {
        const result = dayUtils.getOptimumForDay(dayData, this._getProfile());
        return result?.optimum || 2000;
      }

      // 🔬 TDEE v1.1.0: Использование консолидированного модуля
      const day = dayData || {};
      const prof = this._getProfile() || {};

      // Если есть модуль TDEE — используем его
      if (HEYS.TDEE?.calculate) {
        const tdeeResult = HEYS.TDEE.calculate(day, prof, {});
        return tdeeResult?.optimum || 2000;
      }

      // Fallback: упрощённый расчёт если модуль недоступен
      if (!prof.weight || !prof.height || !prof.age) {
        return 2000;
      }

      const bmr = HEYS.TDEE?.calcBMR?.(prof) || (
        prof.gender === 'Мужской'
          ? 10 * prof.weight + 6.25 * prof.height - 5 * prof.age + 5
          : 10 * prof.weight + 6.25 * prof.height - 5 * prof.age - 161
      );

      const activityMultipliers = {
        sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9
      };
      const multiplier = activityMultipliers[prof.activityLevel] || 1.55;
      const deficitPct = prof.deficitPctTarget || 0;

      return Math.round(bmr * multiplier * (1 + deficitPct / 100));
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

    /**
     * Получить данные о риске срыва
     * @returns {Object} { risk, level, factors, recommendation, color }
     */
    getCrashRiskData(settings = {}) {
      // 🎭 Demo mode
      if (this._isDemoMode()) {
        return { ...DEMO_WIDGET_DATA.crashRisk };
      }

      try {
        // ✅ Используем специализированный data provider v2.0
        const provider = HEYS.Widgets.DataProviders?.crashRisk;

        if (!provider) {
          console.warn('[widget_data.getCrashRiskData] crashRisk provider not loaded');
          return {
            hasData: false,
            weeklyLossPercent: 0,
            isWarning: false,
            severity: 'none',
            message: 'Data provider не загружен',
            ewsCount: 0,
            ewsData: null
          };
        }

        // Получаем период из settings виджета (по умолчанию 7 дней)
        const days = settings?.periodDays || 7;

        // Запрашиваем данные у provider
        const result = provider.getData({ days });

        // Добавляем verification logging
        if (result?.hasData) {
          console.info('[widget_data.getCrashRiskData] ✅ Data loaded:', {
            weeklyLossPercent: result.weeklyLossPercent.toFixed(2) + '%',
            severity: result.severity,
            ewsCount: result.ewsCount,
            dataPoints: result.dataPoints
          });
        }

        return result;

      } catch (error) {
        console.error('[widget_data.getCrashRiskData] ❌ Error:', error);
        return {
          hasData: false,
          weeklyLossPercent: 0,
          isWarning: false,
          severity: 'none',
          message: 'Ошибка загрузки данных',
          ewsCount: 0,
          ewsData: null
        };
      }
    },

    /**
     * Дефолтная рекомендация по уровню риска
     */
    _getDefaultRecommendation(level) {
      switch (level) {
        case 'high':
          return 'Высокий риск срыва. Добавьте перекус или лёгкую физическую активность.';
        case 'medium':
          return 'Умеренный риск. Следите за режимом питания и отдыхом.';
        case 'low':
        default:
          return 'Всё под контролем! Продолжайте в том же духе.';
      }
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

})(typeof window !== 'undefined' ? window : global);
