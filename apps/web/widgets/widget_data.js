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
      pct: 70,
      sleepEnd: '07:00',
      sleepStart: '23:00',
      profileSleepHours: 8,
      medianWakeMinutes: 420
    },
    sleep: {
      hours: 7.5,
      target: 8,
      quality: 4,
      sleepStart: '23:30',
      sleepEnd: '07:15'
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
      windowDeltaKg: -0.56,
      windowLabel: 'неделю',
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
    cascade: {
      hasData: true,
      crs: 0.88,
      pct: 88,
      trend: 'down',
      state: 'GOOD',
      chainLength: 8,
      events: [
        { type: 'breakfast', label: 'Завтрак', weight: 1.3, positive: true },
        { type: 'lunch', label: 'Обед', weight: 1.0, positive: true },
        { type: 'snack', label: 'Перекус', weight: 1.0, positive: true },
        { type: 'steps', label: 'Шаги', weight: 1.1, positive: true },
        { type: 'training', label: 'Тренировка', weight: 1.5, positive: true },
        { type: 'wave_overlap', label: 'Наложение волн', weight: -0.9, positive: false },
        { type: 'late_meal', label: 'Поздний приём', weight: 0.8, positive: true },
        { type: 'supplements', label: 'Добавки', weight: 0.5, positive: true }
      ]
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
        case 'cascade':
          return this.getCascadeData();
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
        // Шесть виджетов пакета 22 августа.
        case 'fiber':
          return this.getFiberWidgetData();
        case 'protein':
          return this.getProteinWidgetData();
        case 'sleepWindow':
          return this.getSleepWindowData();
        case 'foodQuality':
          return this.getFoodQualityData();
        case 'mealRhythm':
          return this.getMealRhythmData();
        case 'sleepReady':
          return this.getSleepReadyData();
        case 'macros':
          return this.getMacrosData();
        case 'insulin':
          return this.getInsulinData();
        case 'heatmap':
          const heatPeriod = widget.settings?.displayVariant === 'month_grid'
            || widget.settings?.period === 'month'
            ? 'month'
            : (widget.settings?.period || 'week');
          return this.getHeatmapData(heatPeriod);
        case 'cycle':
          return this.getCycleData();
        case 'crashRisk':
          return this.getCrashRiskData(widget.settings);
        case 'relapseRisk':
          return this.getRelapseRiskData(widget);
        case 'dayScore':
          return this.getDayScoreData();
        case 'insulinWave':
          return this.getInsulinWaveData();
        case 'healthTrend':
          return this.getHealthTrendData(widget.settings);
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
          factorBars: this._buildDayScoreFactorBars(result.statusResult),
          weekScores: this._getDayScoreWeekHistory(),
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
        const relapseRawScore = Math.round(Number(snapshot?.relapseScore ?? snapshot?.rawScore ?? result?.score) || 0);
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
        let radarScore = relapseRawScore;
        let radarLevelId = '';
        let blendWeights = null;
        let scoreModel = 'relapse_raw';
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
              scoreModel = 'risk_radar_blended';
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
          relapseRawScore, radarScore, radarSource, level: result?.level || snapshot?.level, confidence,
          historyDays: result?.debug?.inputs?.historyDaysCount || 0
        });

        return {
          hasData: true,
          profile: snapshot?.profile || result?.profile || null,
          selectedProfileKey: snapshot?.selectedProfileKey || selectedProfileKey,
          score: radarScore,
          rawScore: relapseRawScore,
          relapseScore: relapseRawScore,
          crashScore: radarCrashScore,
          scoreModel,
          scoreBreakdown: {
            radar: radarScore,
            relapseRaw: relapseRawScore,
            crashRaw: radarCrashScore,
            source: radarSource,
            blendWeights,
          },
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
      const day = this._getDay();
      if (day?.date && HEYS.dayNorm?.ensurePastDays) {
        try { HEYS.dayNorm.ensurePastDays(day.date); } catch (_) { /* prefetch, не await */ }
      }
      const optimum = this._getOptimum();
      const prof = this._getProfile();
      const target = optimum || 2000;
      let activityKcal = 0;
      try {
        if (HEYS.TDEE?.calculate) {
          const tdee = HEYS.TDEE.calculate(day, prof, {});
          activityKcal = Math.round(Number(tdee?.activityKcal ?? tdee?.trainingKcal) || 0);
        }
      } catch (_) { /* optional */ }
      if (!activityKcal && dayTot?.trainKcal) {
        activityKcal = Math.round(Number(dayTot.trainKcal) || 0);
      }

      return {
        eaten: dayTot?.kcal || 0,
        target,
        remaining: Math.max(0, target - (dayTot?.kcal || 0)),
        pct: target > 0 ? Math.round(((dayTot?.kcal || 0) / target) * 100) : 0,
        burned: activityKcal,
        activityKcal,
        dinnerBudgetKcal: Math.round(target * 0.28),
        isClosedDay: this._isClosedDay()
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
      const prof = this._getProfile();
      const waterGoal = this._getWaterGoal();

      const drunk = day?.waterMl || 0;
      const target = waterGoal || 2000;
      let hoursSinceWater = null;
      if (day?.lastWaterTime) {
        const ms = Date.now() - Number(day.lastWaterTime);
        if (Number.isFinite(ms) && ms >= 0) {
          hoursSinceWater = Math.floor(ms / (1000 * 60 * 60));
        }
      }

      const sleepEnd = day?.sleepEnd || null;
      const sleepStart = day?.sleepStart || null;
      const profileSleepHours = prof?.sleepHours || 8;
      const medianWakeMinutes = this._getMedianSleepEndMinutes(14);
      const wakeMinutes = this._parseHmToMinutes(sleepEnd) ?? medianWakeMinutes;
      const bedMinutes = this._parseHmToMinutes(sleepStart);
      const awakeSpan = bedMinutes != null && wakeMinutes != null
        ? this._minutesSpan(wakeMinutes, bedMinutes)
        : Math.round((24 - profileSleepHours) * 60);
      const isClosedDay = this._isClosedDay();
      const nowMinutes = this._deviceNowMinutes();
      const waterSchedule = isClosedDay
        ? { expectedMl: target, expectedPct: 100, checkLabel: null }
        : this._waterScheduleAtMinutes(target, wakeMinutes, awakeSpan, nowMinutes);

      return {
        drunk,
        target,
        pct: target > 0 ? Math.round((drunk / target) * 100) : 0,
        sleepEnd,
        sleepStart,
        profileSleepHours,
        medianWakeMinutes,
        lastWaterTime: day?.lastWaterTime || null,
        hoursSinceWater,
        expectedMlNow: waterSchedule.expectedMl,
        expectedPctNow: waterSchedule.expectedPct,
        deficitMlNow: isClosedDay ? 0 : drunk - waterSchedule.expectedMl,
        checkHourLabel: isClosedDay ? null : waterSchedule.checkLabel,
        rhythmBins: this._buildWaterRhythmBins({
          drunk,
          wakeMinutes,
          awakeSpan,
          nowMinutes,
          hoursSinceWater
        }),
        isClosedDay
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

      const targetHours = prof?.sleepHours || 8;
      const hours = day?.sleepHours || 0;
      let weekDebtHours = 0;
      const sleepWeekBars = [];
      const today = new Date();
      for (let i = 6; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = this._formatDate(date);
        const dayData = this._getDayByDate(dateStr);
        const h = Number(dayData?.sleepHours) || 0;
        const debt = targetHours - h;
        weekDebtHours += debt > 0 ? debt : 0;
        sleepWeekBars.push({ date: dateStr, hours: h, debt });
      }

      const sleepStart = day?.sleepStart || null;
      const sleepEnd = day?.sleepEnd || null;
      const targetSleepStart = prof?.sleepTarget || '23:30';
      const bedMin = this._parseHmToMinutes(targetSleepStart);
      let targetWakeMin = null;
      if (bedMin != null) {
        targetWakeMin = bedMin + Math.round(targetHours * 60);
        if (targetWakeMin >= 1440) targetWakeMin -= 1440;
      }
      const targetSleepEnd = targetWakeMin != null ? this._minutesToHm(targetWakeMin) : null;

      return {
        hours,
        target: targetHours,
        toNormDelta: hours - targetHours,
        weekDebtHours,
        sleepWeekBars,
        quality: day?.sleepQuality || null,
        sleepStart,
        sleepEnd,
        targetSleepStart,
        targetSleepEnd,
        isClosedDay: this._isClosedDay()
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

      // Единая точка входа: тот же калькулятор, что у DayTab и бейджа в шапке
      // (heys_day_calendar_metrics.js, boot-day, синхронный).
      const current = HEYS.dayCalendarMetrics?.getCurrentStreak?.() || 0;

      // Рекорд живёт в геймификации как stats.bestStreak
      // (heys_gamification_v1.js:1961, обновление :5682). Он пишется только
      // при смонтированном DayTab, поэтому может отставать от current.
      const best = HEYS.game?.getStats?.()?.stats?.bestStreak || 0;

      return {
        current,
        max: Math.max(best, current)
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

      // Строка контракта «вес»: направление берётся из окна спарклайна
      // (растущее: с 7 дней, затем 2, 3, 4 недели, дальше месяц), а не из
      // разницы с прошлым взвешиванием и не из weekChange = trend × 7 —
      // недельный прогноз это другая величина и на коротких историях он
      // разворачивается быстрее самого веса. Окно уже считает «Динамика
      // веса»; второго расчёта у «Веса» быть не должно.
      const dynamicsV4 = HEYS.Widgets?.WeightDynamicsV4?.compute?.({ profile: prof }) || null;
      const windowDeltaKg = Number.isFinite(dynamicsV4?.deltaKg) ? dynamicsV4.deltaKg : null;
      const windowLabel = dynamicsV4?.window?.shortLabel || null;

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
        windowDeltaKg,            // изменение за окно спарклайна — им и красим
        windowLabel,              // «неделю» / «2 недели» / «месяц»
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

      // Шагомер мог не отдать данные — это не «прошёл ноль» (контракт
      // home-widgets, «шаги · нет данных»): на месте числа прочерк, полосы нет.
      const raw = Number(day?.steps);
      const hasData = Number.isFinite(raw) && raw > 0;

      // Оба вида — тренды (строка «шаги», решение 22 августа): числа «сейчас» у
      // шагов не существует, они вносятся вечером в чек-ине. Поэтому день без
      // записи в ряд не попадает вовсе, а не рисуется нулём.
      const buildSeries = (days) => {
        const series = [];
        const today = new Date();
        for (let i = days - 1; i >= 0; i -= 1) {
          const date = new Date(today);
          date.setDate(date.getDate() - i);
          const iso = this._formatDate(date);
          const dayData = i === 0 ? day : this._getDayByDate(iso);
          const value = Number(dayData?.steps);
          const dayHas = Number.isFinite(value) && value > 0;
          series.push({ iso, value: dayHas ? value : null, hasData: dayHas, isToday: i === 0 });
        }
        return series;
      };

      const week = buildSeries(7);
      const month = buildSeries(30);
      const filled = month.filter((item) => item.hasData);
      const avgAll = filled.length
        ? Math.round(filled.reduce((acc, item) => acc + item.value, 0) / filled.length)
        : null;
      const weekFilled = week.filter((item) => item.hasData);
      const avgWeek = weekFilled.length
        ? Math.round(weekFilled.reduce((acc, item) => acc + item.value, 0) / weekFilled.length)
        : null;

      return {
        hasData,
        steps: hasData ? raw : null,
        goal: goal,
        pct: hasData && goal > 0 ? Math.round((raw / goal) * 100) : 0,
        week,
        month,
        avgWeek,
        avgMonth: avgAll,
        // Дней с записями меньше двух — вместо столбиков подпись «нужно N дней».
        daysWithData: filled.length
      };
    },

    // ─── Шесть виджетов пакета канваса 22 августа ─────────────────────────
    // Общее правило контракта: второго алгоритма нигде не заводим. Клетчатка и
    // белок берут числа из тех же дневных итогов, что кольцо БЖУ; качество еды —
    // из той же вредности, что карточка «Качество еды» на «Питании»; окно до
    // сна и готовность ко сну — из отбоя чек-ина и правил своих виджетов.

    // Клетчатка: 14 г на 1000 ккал бюджета дня (строка «клетчатка · норма»).
    _fiberNorm(budgetKcal) {
      const budget = Number(budgetKcal) || 0;
      if (budget <= 0) return 0;
      return Math.round((budget / 1000) * 14);
    },

    // День считается «с данными», когда в нём есть приём с продуктами. Ноль
    // клетчатки при съеденном обеде — это ноль, а не «нет данных».
    _dayHasItems(day) {
      const meals = Array.isArray(day?.meals) ? day.meals : [];
      return meals.some((meal) => Array.isArray(meal?.items) && meal.items.length > 0);
    },

    /** Клетчатка: виды 37 «Как сейчас», 38 «Добрать», 39 «Неделя». */
    getFiberWidgetData() {
      const day = this._getDay();
      const totals = this._getDayTotals();
      const norm = this._fiberNorm(this._getOptimum());
      const hasData = this._dayHasItems(day);
      const fiber = hasData ? Math.round(Number(totals?.fiber) || 0) : null;

      // Подсказка — тот же словарь «чем добрать», что на «Питании»; граммовки
      // виджет не показывает (строка «клетчатка · подсказка»).
      let sources = [];
      try {
        sources = (HEYS.dayDiarySection?.getFiberSources?.() || [])
          .map((item) => item?.title)
          .filter(Boolean)
          .slice(0, 3);
      } catch (_) { sources = []; }

      const week = [];
      const today = new Date();
      for (let i = 6; i >= 0; i -= 1) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const iso = this._formatDate(date);
        const dayData = i === 0 ? day : this._getDayByDate(iso);
        const dayHas = this._dayHasItems(dayData);
        const value = dayHas ? Math.round(Number(this._getDayTotalsFor(dayData)?.fiber) || 0) : 0;
        week.push({ iso, value, hasData: dayHas, isToday: i === 0 });
      }

      return {
        hasData,
        fiber,
        norm,
        pct: hasData && norm > 0 ? Math.round((fiber / norm) * 100) : 0,
        remaining: hasData && norm > 0 ? Math.max(0, norm - fiber) : 0,
        sources,
        week
      };
    },

    /** Белок: виды 40 «Как сейчас», 41 «Добрать», 42 «По приёмам». */
    getProteinWidgetData() {
      const day = this._getDay();
      const totals = this._getDayTotals();
      // Норма — та же, что считает кольцо БЖУ (строка «белок · норма»).
      const macros = this.getMacrosData();
      const target = Math.round(Number(macros?.proteinTarget) || 0);
      const hasData = this._dayHasItems(day);
      const protein = hasData ? Math.round(Number(totals?.prot) || 0) : null;


      const byMeal = [];
      const meals = Array.isArray(day?.meals) ? day.meals : [];
      meals.forEach((meal) => {
        const items = Array.isArray(meal?.items) ? meal.items : [];
        if (!items.length) return;
        let grams = 0;
        items.forEach((item) => {
          grams += (Number(item?.protein100) || 0) * ((Number(item?.grams) || 0) / 100);
        });
        byMeal.push({ time: meal?.time || '', grams: Math.round(grams) });
      });

      return {
        hasData,
        protein,
        target,
        pct: hasData && target > 0 ? Math.round((protein / target) * 100) : 0,
        remaining: hasData && target > 0 ? Math.max(0, target - protein) : 0,
        byMeal
      };
    },

    /** Окно до сна: виды 43 «Как сейчас», 44 «Вечер». */
    getSleepWindowData() {
      const day = this._getDay();
      const meals = Array.isArray(day?.meals) ? day.meals : [];
      const times = meals
        .filter((meal) => Array.isArray(meal?.items) && meal.items.length > 0)
        .map((meal) => this._parseHmToMinutes(meal?.time))
        .filter((value) => Number.isFinite(value));

      // Отбой — из чек-ина; без него считаем от 23:00 и говорим об этом.
      const bedRaw = this._parseHmToMinutes(day?.sleepStart);
      const bedtimeKnown = Number.isFinite(bedRaw);
      const bedtime = bedtimeKnown ? bedRaw : 23 * 60;

      if (!times.length) {
        return {
          hasData: false, minutes: null, bedtime, bedtimeKnown,
          lastMeal: null, state: 'neutral', word: 'не ел'
        };
      }

      const lastMeal = Math.max(...times);
      // После отбоя показываем итог вечера, а не отрицательное время.
      const minutes = Math.max(0, bedtime - lastMeal);

      // Красным — только когда ел меньше чем за час до отбоя.
      let state = 'neutral';
      let word = 'до отбоя';
      if (minutes < 60) { state = 'bad'; word = 'ел перед сном'; }
      else if (minutes >= 180) { state = 'good'; word = 'чисто'; }

      return { hasData: true, minutes, bedtime, bedtimeKnown, lastMeal, state, word };
    },

    /** Качество еды: виды 45 «Как сейчас», 46 «Что снизило», 47 «Неделя». */
    getFoodQualityData() {
      const day = this._getDay();
      const hasData = this._dayHasItems(day);
      const scoreOf = (dayData) => {
        if (!this._dayHasItems(dayData)) return null;
        const harm = Number(this._getDayTotalsFor(dayData)?.harm);
        if (!Number.isFinite(harm)) return null;
        // Индекс — та же вредность, повёрнутая шкалой «больше = лучше»:
        // второго расчёта контракт не разрешает.
        return Math.round(Math.max(0, Math.min(10, 10 - harm)) * 10) / 10;
      };

      const score = hasData ? scoreOf(day) : null;
      const week = [];
      const today = new Date();
      let sum = 0;
      let count = 0;
      for (let i = 6; i >= 0; i -= 1) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const iso = this._formatDate(date);
        const value = scoreOf(i === 0 ? day : this._getDayByDate(iso));
        if (value != null) { sum += value; count += 1; }
        week.push({ iso, value, hasData: value != null, isToday: i === 0 });
      }

      // «Что снизило»: самый вредный продукт дня — им и объясняем дельту.
      let worst = null;
      (Array.isArray(day?.meals) ? day.meals : []).forEach((meal) => {
        (Array.isArray(meal?.items) ? meal.items : []).forEach((item) => {
          const harm = Number(item?.harm ?? item?.harmScore ?? item?.harm100);
          const grams = Number(item?.grams) || 0;
          if (!Number.isFinite(harm) || grams <= 0) return;
          const weight = harm * grams;
          if (!worst || weight > worst.weight) {
            worst = { name: item?.name || '', weight, harm };
          }
        });
      });

      return {
        hasData,
        score,
        // Дельта — насколько индекс ниже потолка: «−2» при 8 из 10.
        delta: score == null ? null : Math.round((10 - score) * 10) / 10,
        reason: worst && worst.name ? worst.name : null,
        week,
        avgWeek: count ? Math.round((sum / count) * 10) / 10 : null
      };
    },

    /** Ритм приёмов: виды 48 «Лента дня», 49 «Интервалы». */
    getMealRhythmData() {
      const day = this._getDay();
      const times = (Array.isArray(day?.meals) ? day.meals : [])
        .filter((meal) => Array.isArray(meal?.items) && meal.items.length > 0)
        .map((meal) => ({ time: meal?.time || '', minutes: this._parseHmToMinutes(meal?.time) }))
        .filter((item) => Number.isFinite(item.minutes))
        .sort((a, b) => a.minutes - b.minutes);

      const intervals = [];
      for (let i = 1; i < times.length; i += 1) {
        intervals.push({
          from: times[i - 1].time,
          to: times[i].time,
          minutes: times[i].minutes - times[i - 1].minutes
        });
      }
      const avg = intervals.length
        ? Math.round(intervals.reduce((acc, item) => acc + item.minutes, 0) / intervals.length)
        : null;

      const now = new Date();
      return {
        hasData: times.length > 0,
        meals: times,
        count: times.length,
        intervals,
        avgMinutes: avg,
        nowMinutes: now.getHours() * 60 + now.getMinutes()
      };
    },

    /** Готовность ко сну: виды 50 «Чек-лист», 51 «Разбор». */
    getSleepReadyData() {
      const day = this._getDay();
      const prof = this._getProfile();

      // Каждый порог берётся из правила своего виджета, второго алгоритма нет.
      const waterMl = Number(day?.waterMl);
      const waterGoal = Number(prof?.waterGoalMl) || Number(prof?.waterGoal) || 0;
      const water = waterGoal > 0 && Number.isFinite(waterMl)
        ? { hasData: true, done: waterMl / waterGoal >= 0.9, value: waterMl, goal: waterGoal }
        : { hasData: false, done: false, value: null, goal: waterGoal || null };

      const sleepWindow = this.getSleepWindowData();
      const food = sleepWindow.hasData
        ? { hasData: true, done: sleepWindow.minutes >= 180, value: sleepWindow.minutes, goal: 180 }
        : { hasData: false, done: false, value: null, goal: 180 };

      const stepsData = this.getStepsData();
      const stepsGoal = Number(stepsData?.goal) || 0;
      const steps = stepsData?.hasData && stepsGoal > 0
        ? { hasData: true, done: stepsData.steps / stepsGoal >= 1, value: stepsData.steps, goal: stepsGoal }
        : { hasData: false, done: false, value: stepsData?.steps ?? null, goal: stepsGoal || null };

      const items = [
        Object.assign({ key: 'water', label: 'Вода' }, water),
        Object.assign({ key: 'food', label: 'Еда до сна' }, food),
        Object.assign({ key: 'steps', label: 'Шаги' }, steps)
      ];
      // Пункт без данных выпадает из счётчика: «1 из 2», а не ноль в счёт.
      const counted = items.filter((item) => item.hasData);

      return {
        hasData: counted.length > 0,
        items,
        done: counted.filter((item) => item.done).length,
        total: counted.length,
        sleepWindow
      };
    },

    /**
     * Получить данные о макросах (БЖУ)
     * @returns {Object}
     */
    getMacrosData() {
      // 🎭 Demo mode
      if (this._isDemoMode()) {
        return {
          ...DEMO_WIDGET_DATA.macros,
          cascade: { ...(DEMO_WIDGET_DATA.cascade || {}) }
        };
      }

      // Унифицированный расчёт через HEYS.MacroRings — даёт тот же optimum/target/цвета
      // что DayTab и Weekly (с учётом рефида и savedDisplayOptimum). Это устраняет
      // главное расхождение виджета с другими вкладками.
      const core = (typeof HEYS !== 'undefined') ? HEYS.MacroRings : null;
      if (core && core.computeDayRingData) {
        try {
          const day = this._getDay() || {};
          const profile = this._getProfile() || {};
          const products = HEYS.products?.getAll?.() || [];
          const pIndex = HEYS.dayUtils?.buildProductIndex ? HEYS.dayUtils.buildProductIndex(products) : null;
          const normPerc = this._getNorms();
          const r = core.computeDayRingData(day, profile, pIndex, { normPerc });
          return {
            protein: r.protein.value,
            fat: r.fat.value,
            carbs: r.carbs.value,
            proteinTarget: r.protein.target,
            fatTarget: r.fat.target,
            carbsTarget: r.carbs.target,
            cascade: this.getCascadeData(),
            _rings: r, // дополнительное поле — для использования в MacrosWidgetContent (color, gradientStops, overflowColor)
          };
        } catch (_) { /* fall through to legacy path */ }
      }

      // Fallback: старый расчёт (используется если core не загружен)
      const dayTot = this._getDayTotals();
      const normAbs = this._getNormAbs();

      return {
        protein: dayTot?.prot || 0,
        fat: dayTot?.fat || 0,
        carbs: dayTot?.carbs || 0,
        proteinTarget: normAbs?.prot || 100,
        fatTarget: normAbs?.fat || 70,
        carbsTarget: normAbs?.carbs || 250,
        cascade: this.getCascadeData()
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

      // Берём тот же канонический расчёт, что и виджет insulinWave:
      // HEYS.InsulinWave.calculate (heys_insulin_wave_v1.js:111) — отдельного
      // getWaveData в модуле нет и не было.
      const wave = this.getInsulinWaveData() || {};
      if (!wave.hasData) {
        return { status: 'unknown', remaining: 0, totalWave: 0, phase: null, lastMealTime: null, endTime: null };
      }

      const totalWave = Math.round(wave.duration > 0 ? wave.duration : 180);
      // scheduled (приём ещё впереди) даёт remaining > duration — кольцо ушло бы
      // в минус, поэтому подрезаем по длине окна.
      const remaining = Math.min(totalWave, Math.max(0, Math.round(wave.remaining || 0)));

      // Канонический словарь — scheduled/settling/complete, UI-виджет знает
      // active/soon/almost/lipolysis (heys_widgets_ui_v1.js:3551-3555).
      // Пороги подобраны под демо-данные виджета (remaining 25 → 'almost').
      let status;
      if (wave.status === 'complete' || remaining <= 0) status = 'lipolysis';
      else if (remaining <= 30) status = 'almost';
      else if (remaining <= 60) status = 'soon';
      else status = 'active';

      return {
        status,
        remaining,
        totalWave,
        // currentPhase === status (heys_insulin_wave_v1.js:197) — как фаза бесполезен
        phase: wave.waveShapeDesc || wave.statusLabel || null,
        lastMealTime: wave.lastMealTimeDisplay || wave.lastMealTime || null,
        endTime: wave.endTimeDisplay || wave.endTime || null
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
      const count = period === 'week' ? 7 : 28;
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

      // Строгая серия: любой пропуск или не-норма обнуляет (канвас #20).
      let streak = 0;
      for (let i = days.length - 1; i >= 0; i--) {
        const s = days[i]?.status;
        if (s === 'green' || s === 'good' || s === 'ok') streak += 1;
        else break;
      }

      const monthDays28 = count >= 28 ? days.slice(-28) : days;
      const monthFilledCount = monthDays28.filter((d) =>
        d?.status === 'green' || d?.status === 'good' || d?.status === 'ok'
      ).length;

      return { days, currentStreak: streak, monthFilledCount };
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

    _getDayScoreWeekHistory() {
      if (!HEYS.DayScore?.calculateDayScore) return [];
      const scores = [];
      const today = new Date();
      const profile = this._getProfile() || {};
      const normAbs = this._getNormAbs() || {};
      const waterGoal = this._getWaterGoal() || 2000;
      for (let i = 6; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = this._formatDate(date);
        const dayData = this._getDayByDate(dateStr);
        try {
          const dayTot = this._calculateDayTotals(dayData);
          const result = HEYS.DayScore.calculateDayScore({
            dayData, profile, dayTot, normAbs, waterGoal
          });
          scores.push({
            date: dateStr,
            score: Math.round(Number(result?.score) || 0)
          });
        } catch {
          scores.push({ date: dateStr, score: 0 });
        }
      }
      return scores;
    },

    _buildDayScoreFactorBars(statusResult) {
      const cats = statusResult?.categoryScores || {};
      const items = [
        { key: 'food', label: 'еда' },
        { key: 'water', label: 'вода' },
        { key: 'sleep', label: 'сон' },
        { key: 'activity', label: 'актив' },
        { key: 'relapse', label: 'срыв' }
      ];
      return items.map(({ key, label }) => {
        const score = Math.round(Number(cats[key]) || 0);
        let tone = 'good';
        if (score < 40) tone = 'bad';
        else if (score < 65) tone = 'warn';
        // Недобор воды без провала — янтарь, не красный (канвас #17).
        if (key === 'water' && score >= 40 && score < 65) tone = 'warn';
        if (key === 'sleep' && score < 50) tone = 'bad';
        return { key, label, score, tone };
      });
    },

    _parseHmToMinutes(hm) {
      if (!hm || typeof hm !== 'string') return null;
      const parts = hm.trim().split(':');
      const h = Number(parts[0]);
      const m = Number(parts[1]);
      if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
      return ((h % 24) * 60) + m;
    },

    _minutesToHm(totalMinutes) {
      if (!Number.isFinite(totalMinutes)) return null;
      const m = ((totalMinutes % 1440) + 1440) % 1440;
      const h = Math.floor(m / 60);
      const min = m % 60;
      return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    },

    _minutesSpan(startMin, endMin) {
      if (!Number.isFinite(startMin) || !Number.isFinite(endMin)) return 0;
      let span = endMin - startMin;
      if (span <= 0) span += 1440;
      return span;
    },

      // Время берётся с устройства. Строка «часовой пояс · правило продукта»:
      // «дата и время берутся с устройства: день закрывается по местному времени
      // человека, а не по серверному». Прежде здесь стоял Intl с жёстким
      // Europe/Moscow, и человек в другом поясе видел график воды не по своим
      // часам. Запасная ветка была верной с самого начала — она и осталась одна.
      _deviceNowMinutes() {
        const d = new Date();
        return d.getHours() * 60 + d.getMinutes();
      },
    _waterScheduleAtMinutes(target, wakeMinutes, awakeSpan, atMinutes) {
      if (!target || !wakeMinutes || !awakeSpan) {
        return { expectedMl: 0, expectedPct: 0, checkLabel: null };
      }
      let elapsed = atMinutes - wakeMinutes;
      if (elapsed < 0) elapsed += 1440;
      elapsed = Math.max(0, Math.min(awakeSpan, elapsed));
      const share = Math.min(1, elapsed / awakeSpan);
      const checkLabel = this._minutesToHm(atMinutes);
      return {
        expectedMl: target * share,
        expectedPct: Math.round(share * 100),
        checkLabel: checkLabel ? `к ${checkLabel}` : null
      };
    },

    _buildWaterRhythmBins({ drunk, wakeMinutes, awakeSpan, nowMinutes, hoursSinceWater }) {
      const BIN_COUNT = 7;
      if (!wakeMinutes || !awakeSpan) {
        return Array(BIN_COUNT).fill(0);
      }
      const binMinutes = awakeSpan / BIN_COUNT;
      let elapsed = nowMinutes - wakeMinutes;
      if (elapsed < 0) elapsed += 1440;
      const elapsedBins = Math.min(BIN_COUNT, Math.max(1, Math.ceil(elapsed / binMinutes)));
      const dryBins = Number.isFinite(hoursSinceWater) && hoursSinceWater > 0
        ? Math.min(elapsedBins, Math.ceil(hoursSinceWater / (binMinutes / 60)))
        : 0;
      const activeBins = Math.max(0, elapsedBins - dryBins);
      const bins = Array(BIN_COUNT).fill(0);
      if (activeBins > 0 && drunk > 0) {
        const perBin = drunk / activeBins;
        for (let i = 0; i < activeBins; i++) bins[i] = perBin;
      }
      return bins;
    },

    _getDay() {
      // Используем selectedDate из WidgetsTab, или текущую дату как fallback
      const dateStr = this._selectedDate || this._formatDate(new Date());
      const day = this._getDayByDate(dateStr);
      return day;
    },

    _getDayByDate(dateStr) {
      // Ключ дня: heys_dayv2_YYYY-MM-DD (namespace добавляется автоматически через store.get)
      const key = `heys_dayv2_${dateStr}`;
      const normalizeDay = (value) => {
        if (!value) return null;
        if (HEYS.models?.ensureDay) {
          try {
            return HEYS.models.ensureDay(value, this._getProfile());
          } catch (_) { }
        }
        return value;
      };
      try {
        const clientId = HEYS.currentClientId;

        // 1. Store-first (scoped через HEYS.store / HEYS.utils)
        const stored = readStoredValue(key, null);
        if (stored) return normalizeDay(stored);

        // 2. Fallback: scoped key напрямую в localStorage
        if (clientId) {
          const scopedKey = `heys_${clientId}_dayv2_${dateStr}`;
          const scopedRaw = localStorage.getItem(scopedKey);
          const scopedParsed = parseStoredValue(scopedRaw, null);
          if (scopedParsed) return normalizeDay(scopedParsed);
        }

        // 3. Последний fallback: unscoped key
        const raw = localStorage.getItem(key);
        return normalizeDay(parseStoredValue(raw, null));
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

    // Итоги произвольного дня — тем же расчётом, что и текущего: harm и gi
    // считает только dayCalculations, локальный fallback их не знает.
    _getDayTotalsFor(day) {
      const products = HEYS.products?.getAll?.() || [];
      const pIndex = HEYS.dayUtils?.buildProductIndex
        ? HEYS.dayUtils.buildProductIndex(products)
        : null;
      if (HEYS.dayCalculations?.calculateDayTotals && day) {
        try {
          return HEYS.dayCalculations.calculateDayTotals(day, pIndex);
        } catch (_) { }
      }
      return this._calculateDayTotals(day);
    },

    _getDayTotals() {
      const day = this._getDay();
      const products = HEYS.products?.getAll?.() || [];
      const pIndex = HEYS.dayUtils?.buildProductIndex
        ? HEYS.dayUtils.buildProductIndex(products)
        : null;
      if (HEYS.dayCalculations?.calculateDayTotals && day) {
        try {
          return HEYS.dayCalculations.calculateDayTotals(day, pIndex);
        } catch (_) { }
      }
      return this._calculateDayTotals(day);
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
      const day = dayData || {};
      const prof = this._getProfile() || {};
      if (HEYS.dayNorm && typeof HEYS.dayNorm.resolve === 'function') {
        const resolved = HEYS.dayNorm.resolve(day, prof, {});
        if (resolved && resolved.kcal > 0) return resolved.kcal;
      }

      const dayUtils = HEYS.dayUtils || {};
      if (dayUtils.getOptimumForDay) {
        const result = dayUtils.getOptimumForDay(day, prof);
        return result?.optimum || 2000;
      }

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
      const day = this._getDay() || {};
      const prof = this._getProfile() || {};
      const optimum = this._getOptimum();
      const norms = this._getNorms();
      let tdeeResult = {};
      if (HEYS.TDEE?.calculate) {
        try {
          tdeeResult = HEYS.TDEE.calculate(day, prof, {
            lsGet: HEYS.utils?.lsGet,
            anchorDate: day.date,
          }) || {};
        } catch (_) { }
      }

      if (HEYS.dayCalculations?.computeDisplayNorms) {
        try {
          return HEYS.dayCalculations.computeDisplayNorms({
            displayOptimum: optimum,
            normPerc: norms,
            profile: prof,
            day,
            tdeeResult,
            lsGet: HEYS.utils?.lsGet,
          }).normAbs;
        } catch (_) { }
      }

      if (HEYS.dayCalculations?.computeDailyNorms) {
        try {
          return HEYS.dayCalculations.computeDailyNorms(optimum, norms, {
            profile: prof,
            day,
            tdeeResult,
            lsGet: HEYS.utils?.lsGet,
          });
        } catch (_) { }
      }

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
      // Единый расчёт нормы — heys_day_water_state.js. Плитка и карточка «День»
      // читают один computeWaterGoalBreakdown; калории тренировок — из TDEE.
      const prof = this._getProfile() || {};
      const day = this._getDay() || {};
      const params = HEYS.dayWaterState?.buildWaterGoalParams?.({ day, profile: prof })
        || { day, profile: prof };
      const goal = HEYS.dayWaterState?.computeWaterGoal?.(params);
      if (goal) return goal;

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

        if (dayData?.weightMorning && dayData.weightMorningEstimated !== true) {
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
          weight: (dayData?.weightMorning && dayData.weightMorningEstimated !== true)
            ? dayData.weightMorning
            : null,
          estimated: dayData?.weightMorningEstimated === true,
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

      if (bmi < 18.5) return { id: 'underweight', label: 'Недостаток', color: 'var(--v4-water, #3b82f6)' };
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

    _getTodayStr() {
      const d = new Date();
      if (d.getHours() < 3) {
        d.setDate(d.getDate() - 1);
      }
      return this._formatDate(d);
    },

    _isClosedDay() {
      const selected = this._selectedDate || this._getTodayStr();
      return selected < this._getTodayStr();
    },

    _parseSleepEndMinutes(hm) {
      if (!hm || typeof hm !== 'string') return null;
      const parts = hm.trim().split(':');
      const h = Number(parts[0]);
      const min = Number(parts[1]);
      if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
      return ((h % 24) * 60) + min;
    },

    /**
     * Медиана времени подъёма (sleepEnd) за N дней — фолбэк для виджета воды.
     */
    _getMedianSleepEndMinutes(days = 14) {
      const mins = [];
      const today = new Date();
      for (let i = 0; i < days; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dayData = this._getDayByDate(this._formatDate(date));
        const parsed = this._parseSleepEndMinutes(dayData?.sleepEnd);
        if (parsed != null) mins.push(parsed);
      }
      if (mins.length === 0) return null;
      mins.sort((a, b) => a - b);
      const mid = Math.floor(mins.length / 2);
      return mins.length % 2 === 1
        ? mins[mid]
        : Math.round((mins[mid - 1] + mins[mid]) / 2);
    },

    /**
     * Получить данные Health Trend (Тренд здоровья из инсайтов)
     */
    getInsulinWaveData() {
      if (this._isDemoMode()) {
        return { hasData: true, status: 'decline', progress: 72, remaining: 28, endTime: '14:30', color: '#10b981', lastMealTime: '11:45', isLipolysis: false, isNightTime: false };
      }
      try {
        const todayStr = this._formatDate(new Date());
        const selectedDate = this._selectedDate || todayStr;
        const isPastDay = selectedDate < todayStr;

        const dayData = this._getDay() || {};
        const meals = dayData.meals || [];
        const mealsWithTime = meals.filter(m => m.time);

        // Если сегодня нет приёмов пищи — продолжаем вчерашнюю каноническую
        // оценку. Только на сегодняшней дате: на прошлом дне плитка показывает
        // приёмы самого этого дня, цепочка на два дня назад не строится
        // (строка «волна · ночная оценка на прошлом дне»). Будущая дата — тоже
        // не сегодня, поэтому сравниваем на равенство, а не «не прошлое».
        if (selectedDate === todayStr && mealsWithTime.length === 0) {
          return this._getOvernightLipolysisData(todayStr);
        }
        if (mealsWithTime.length === 0) return { hasData: false, status: 'noData', progress: 0, remaining: 0, isLipolysis: false };

        const profile = this._getProfile() || {};
        // Единственный источник — каноническая модель; для прошлого дня берём 23:59.
        if (HEYS.InsulinWave?.calculate) {
          try {
            const pIndex = HEYS.products?.buildIndex?.() || null;
            const getProductFromItem = (item) => {
              if (!pIndex?.byId?.get) return item;
              return pIndex.byId.get(item.product_id) || item;
            };
            const result = HEYS.InsulinWave.calculate({
              meals,
              pIndex,
              getProductFromItem,
              trainings: dayData.trainings || [],
              dayData: {
                sleepHours: dayData.sleepHours || null,
                sleepQuality: dayData.sleepQuality || null,
                stressAvg: dayData.stressAvg || 0,
                waterMl: dayData.waterMl || 0,
                householdMin: dayData.householdMin || 0,
                steps: dayData.steps || 0,
                date: dayData.date,
                lsGet: (key, fallback) => readStoredValue(key, fallback),
                profile: { age: profile?.age || 0, weight: profile?.weight || 0, height: profile?.height || 0, gender: profile?.gender || '' }
              },
              nowMinutes: isPastDay ? 1439 : undefined
            });
            if (result) {
              console.info('[widget_data.getInsulinWaveData] ✅', { status: result.status, progress: result.progress, remaining: result.remaining });
              const nowMin = isPastDay
                ? 1439
                : (new Date().getHours() * 60 + new Date().getMinutes());
              const v4 = HEYS.Widgets.InsulinWaveV4?.buildV4FromWave?.(result, nowMin) || null;
              return {
                ...result,
                ...(v4 || {}),
                v4,
                hasData: true,
                isPastDay,
                waveCount: mealsWithTime.length,
                isLipolysis: result.status === 'complete',
                color: result.status === 'complete' ? '#16a34a' : '#c67139'
              };
            }
          } catch (e) {
            console.warn('[widget_data.getInsulinWaveData] canonical estimate failed', e);
            return { hasData: false, status: 'error', progress: 0, remaining: 0 };
          }
        }

        return { hasData: false, status: 'loading', progress: 0, remaining: 0 };
      } catch (e) {
        console.error('[widget_data.getInsulinWaveData] ❌', e);
        return { hasData: false, status: 'error', progress: 0, remaining: 0, isLipolysis: false };
      }
    },

    /**
     * Overnight estimate: today has no meals, so continue yesterday's canonical
     * response clock without inferring substrate use or calories.
     */
    _getOvernightLipolysisData(todayStr) {
      try {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = this._formatDate(yesterday);
        const yData = this._getDayByDate(yesterdayStr);
        const yMeals = (yData?.meals || []).filter(m => m.time);
        if (yMeals.length === 0) {
          return { hasData: false, status: 'noData', progress: 0, remaining: 0, isLipolysis: false };
        }

        if (!HEYS.InsulinWave?.calculate) return { hasData: false, status: 'loading', progress: 0, remaining: 0 };
        const pIndex = HEYS.products?.buildIndex?.() || null;
        const getProductFromItem = (item) => !pIndex?.byId?.get ? item : (pIndex.byId.get(item.product_id || item.productId) || item);
        const currentDateTime = new Date();
        const canonicalResult = HEYS.InsulinWave.calculate({
          meals: yData.meals || [],
          pIndex,
          getProductFromItem,
          trainings: yData.trainings || [],
          nowMinutes: 1440 + currentDateTime.getHours() * 60 + currentDateTime.getMinutes()
        });
        return canonicalResult ? (() => {
          const nowMin = 1440 + currentDateTime.getHours() * 60 + currentDateTime.getMinutes();
          const v4 = HEYS.Widgets.InsulinWaveV4?.buildV4FromWave?.(canonicalResult, nowMin, { overnight: true }) || null;
          return {
            ...canonicalResult,
            ...(v4 || {}),
            v4,
            hasData: true,
            isOvernightEstimate: true,
            // Дата источника — как во втором расчёте волны на «Питании»
            // (heys_day_insulin_wave_data_v1.js): признак и его день ходят парой.
            sourceDate: yesterdayStr,
            isLipolysis: canonicalResult.status === 'complete',
            color: canonicalResult.status === 'complete' ? '#16a34a' : '#c67139'
          };
        })() : { hasData: false, status: 'noData', progress: 0, remaining: 0 };
      } catch (e) {
        console.error('[widget_data] overnight response estimate ❌', e);
        return { hasData: false, status: 'noData', progress: 0, remaining: 0, isLipolysis: false };
      }
    },

    getHealthTrendData(settings = {}) {
      try {
        const days = settings?.periodDays || 14;
        const analyze = HEYS.PredictiveInsights?.analyze;
        if (!analyze) {
          console.warn('[widget_data.getHealthTrendData] PredictiveInsights not loaded');
          return { hasData: false, score: 0, periodDays: days };
        }

        const result = analyze({ daysBack: days });
        if (!result?.available || !result?.healthScore) {
          return { hasData: false, score: 0, periodDays: days };
        }

        const hs = result.healthScore;
        const total = hs.total || 0;
        const hasData = total > 0 || result.daysWithData >= 3;

        // Категории: nutrition, timing, activity, recovery, metabolism
        const categories = [
          { key: 'nutrition', label: 'Питание', icon: '🥗' },
          { key: 'timing', label: 'Тайминг', icon: '⏱' },
          { key: 'activity', label: 'Активность', icon: '🏃' },
          { key: 'recovery', label: 'Восстановл.', icon: '😴' },
          { key: 'metabolism', label: 'Метаболизм', icon: '⚡' },
        ].map(cat => ({
          ...cat,
          score: hs.categories?.[cat.key] ?? null,
          breakdown: hs.breakdown?.[cat.key] || null
        })).filter(cat => cat.score !== null);

        console.info('[widget_data.getHealthTrendData] ✅', {
          total, periodDays: days, daysWithData: result.daysWithData, categories: categories.length
        });

        let delta = null;
        try {
          const rawLsGet = (typeof HEYS.utils?.lsGet === 'function')
            ? (key, fallback) => HEYS.utils.lsGet(key, fallback)
            : (key, fallback) => {
              try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; }
            };
          const shiftedLsGet = (key, fallback) => {
            const match = /^heys_dayv2_(\d{4}-\d{2}-\d{2})$/.exec(key);
            if (!match) return rawLsGet(key, fallback);
            const shifted = new Date(`${match[1]}T12:00:00`);
            shifted.setDate(shifted.getDate() - days);
            const yyyy = shifted.getFullYear();
            const mm = String(shifted.getMonth() + 1).padStart(2, '0');
            const dd = String(shifted.getDate()).padStart(2, '0');
            return rawLsGet(`heys_dayv2_${yyyy}-${mm}-${dd}`, fallback);
          };
          const previous = analyze({ daysBack: days, lsGet: shiftedLsGet });
          const prevTotal = previous?.healthScore?.total;
          if (previous?.available && Number.isFinite(prevTotal)) {
            delta = total - prevTotal;
          }
        } catch (e) {
          delta = null;
        }

        return {
          hasData,
          score: total,
          delta,
          goalMode: hs.goalMode || 'unknown',
          categories,
          daysWithData: result.daysWithData,
          periodDays: days
        };
      } catch (e) {
        console.error('[widget_data.getHealthTrendData] ❌', e);
        return { hasData: false, score: 0, periodDays: settings?.periodDays || 14 };
      }
    },

    getCascadeData() {
      try {
        const todayStr = this._formatDate(new Date());
        const selectedDate = this._selectedDate || todayStr;
        const liveCascade = selectedDate === todayStr ? HEYS._lastCrs : null;
        const cascadeApi = HEYS.CascadeCard || {};

        // Helper: read per-date CEB cache (from full cascade) for accurate override
        const _readPerDateCeb = (dateStr) => {
          const cid = (HEYS.utils && HEYS.utils.getCurrentClientId) ? HEYS.utils.getCurrentClientId() : '';
          if (!cid || !dateStr) return null;
          return cascadeApi.getPerDateCEB?.(dateStr, cid) || null;
        };

        if (liveCascade && Array.isArray(liveCascade.events)) {
          const events = liveCascade.events;
          const crs = Number(liveCascade.crs) || 0;
          const cascadeResult = {
            hasData: events.length > 0,
            crs,
            pct: Math.max(0, Math.min(100, Math.round(crs * 100))),
            trend: liveCascade.crsTrend || 'flat',
            state: liveCascade.state || 'EMPTY',
            chainLength: Number(liveCascade.chainLength) || 0,
            events
          };
          const pdToday = _readPerDateCeb(selectedDate);
          if (pdToday) {
            cascadeResult.cebCached = pdToday.score;
            cascadeResult.cebCachedConf = pdToday.confidence;
          }
          return cascadeResult;
        }

        const dayData = this._getDay() || {};
        const profile = this._getProfile() || {};

        if (typeof cascadeApi?.computeExactCascadeSnapshot !== 'function') {
          return {
            hasData: false,
            crs: 0,
            pct: 0,
            trend: 'flat',
            state: 'EMPTY',
            chainLength: 0,
            events: []
          };
        }

        const snapshot = cascadeApi.computeExactCascadeSnapshot(dayData, profile, { silent: true }) || {};
        const result = snapshot?.result || {};
        const events = Array.isArray(result?.events) ? result.events : [];
        const crs = Number(result?.crs) || 0;
        const cascadeResult = {
          hasData: events.length > 0,
          crs,
          pct: Math.max(0, Math.min(100, Math.round(crs * 100))),
          trend: result?.crsTrend || 'flat',
          state: result?.state || 'EMPTY',
          chainLength: Number(result?.chainLength) || 0,
          events
        };
        const pdHist = _readPerDateCeb(selectedDate);
        if (pdHist) {
          cascadeResult.cebCached = pdHist.score;
          cascadeResult.cebCachedConf = pdHist.confidence;
        }
        return cascadeResult;
      } catch (error) {
        console.error('[widget_data.getCascadeData] ❌', error);
        return {
          hasData: false,
          crs: 0,
          pct: 0,
          trend: 'flat',
          state: 'EMPTY',
          chainLength: 0,
          events: []
        };
      }
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
