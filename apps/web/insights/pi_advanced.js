// pi_advanced.js — Advanced Analytics Functions v3.0.0
// Extracted from heys_predictive_insights_v1.js (Phase 4)
// Продвинутая аналитика: Health Score, What-If, Weight Prediction, Weekly Wrap
(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  HEYS.InsightsPI = HEYS.InsightsPI || {};
  const DEV = global.DEV || {};
  const devLog = typeof DEV.log === 'function' ? DEV.log.bind(DEV) : function () { };

  // Зависимости
  const piStats = HEYS.InsightsPI?.stats || window.piStats || {};
  const piPatterns = HEYS.InsightsPI?.patterns || window.piPatterns || {};
  const SCIENCE_INFO = HEYS.InsightsPI?.constants?.SCIENCE_INFO || window.piConst?.SCIENCE_INFO || HEYS.InsightsPI?.science || window.piScience || {};
  const piConst = HEYS.InsightsPI?.constants || window.piConst || {};

  // Импорт констант (полный список включая v5.0)
  const PATTERNS = piConst.PATTERNS || {
    MEAL_TIMING: 'meal_timing',
    WAVE_OVERLAP: 'wave_overlap',
    LATE_EATING: 'late_eating',
    MEAL_QUALITY_TREND: 'meal_quality',
    SLEEP_WEIGHT: 'sleep_weight',
    SLEEP_HUNGER: 'sleep_hunger',
    TRAINING_KCAL: 'training_kcal',
    STEPS_WEIGHT: 'steps_weight',
    PROTEIN_SATIETY: 'protein_satiety',
    FIBER_REGULARITY: 'fiber_regularity',
    STRESS_EATING: 'stress_eating',
    MOOD_FOOD: 'mood_food',
    CIRCADIAN: 'circadian',
    NUTRIENT_TIMING: 'nutrient_timing',
    INSULIN_SENSITIVITY: 'insulin_sensitivity',
    GUT_HEALTH: 'gut_health',
    NUTRITION_QUALITY: 'nutrition_quality',
    NEAT_ACTIVITY: 'neat_activity',
    MOOD_TRAJECTORY: 'mood_trajectory',
    // v5.0 patterns (C7-C12)
    MICRONUTRIENT_RADAR: 'micronutrient_radar',
    OMEGA_BALANCER: 'omega_balancer',
    HEART_HEALTH: 'heart_health',
    NOVA_QUALITY: 'nova_quality',
    TRAINING_RECOVERY: 'training_recovery',
    HYPERTROPHY: 'hypertrophy',
    // v6.0 patterns (fallback for load order)
    VITAMIN_DEFENSE: 'vitamin_defense',
    B_COMPLEX_ANEMIA: 'b_complex_anemia',
    GLYCEMIC_LOAD: 'glycemic_load',
    PROTEIN_DISTRIBUTION: 'protein_distribution',
    ANTIOXIDANT_DEFENSE: 'antioxidant_defense',
    ADDED_SUGAR_DEPENDENCY: 'added_sugar_dependency',
    BONE_HEALTH: 'bone_health',
    TRAINING_TYPE_MATCH: 'training_type_match',
    ELECTROLYTE_HOMEOSTASIS: 'electrolyte_homeostasis',
    NUTRIENT_DENSITY: 'nutrient_density'
  };

  const CONFIG = piConst.CONFIG || {
    MIN_CORRELATION_DISPLAY: 0.35,
    MIN_DAYS_FOR_FULL_ANALYSIS: 7
  };

  // Импорт статистических функций из pi_stats.js (централизовано)
  const { average, calculateLinearRegression } = piStats;

  // === HEALTH SCORE (Goal-Aware v2.0) ===

  /**
   * Рассчитать Health Score (0-100)
   * Goal-aware: веса зависят от цели (похудение/набор/поддержание)
   * 
   * @param {Array} patterns - результаты анализа паттернов
   * @param {Object} profile - профиль с deficitPctTarget
   */
  function calculateHealthScore(patterns, profile) {
    const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

    /**
     * Надёжность паттерна для взвешивания в агрегированном score.
     * 1. Берём confidence (0..1, либо 0..100 -> нормализуем)
     * 2. Понижаем вклад preliminary паттернов
     * 3. Учитываем заполненность до requiredDataPoints, если есть
     */
    const getPatternReliability = (p) => {
      let baseConfidence = Number(p?.confidence);

      if (!Number.isFinite(baseConfidence)) {
        baseConfidence = 0.5;
      }

      if (baseConfidence > 1 && baseConfidence <= 100) {
        baseConfidence = baseConfidence / 100;
      }

      baseConfidence = clamp(baseConfidence, 0.15, 1);

      if (p?.isPreliminary) {
        baseConfidence = Math.min(baseConfidence, 0.55);
      }

      const dataPoints = Number(p?.dataPoints);
      const requiredDataPoints = Number(p?.requiredDataPoints);

      if (Number.isFinite(dataPoints) && Number.isFinite(requiredDataPoints) && requiredDataPoints > 0) {
        const completionRatio = clamp(dataPoints / requiredDataPoints, 0.25, 1);
        baseConfidence *= completionRatio;
      }

      return clamp(baseConfidence, 0.1, 1);
    };

    // Определяем цель (Number() для корректного сравнения строк из localStorage)
    const deficitPct = Number(profile?.deficitPctTarget) || 0;
    let goalMode = 'maintenance';
    if (deficitPct <= -10) goalMode = 'deficit';
    else if (deficitPct >= 10) goalMode = 'bulk';

    // Goal-aware веса
    const weightsByGoal = {
      deficit: {
        nutrition: 0.25,   // Меньше, т.к. дефицит = меньше еды (was 0.35, fixed sum to 1.0)
        timing: 0.30,      // Важнее, чтобы не переедать вечером
        activity: 0.20,    // Важно для сохранения мышц
        recovery: 0.15,    // Сон критичен
        metabolism: 0.10   // NEW: TEF, адаптивный термогенез
      },
      bulk: {
        nutrition: 0.40,   // Качество еды важно для чистого набора
        timing: 0.20,      // Менее критично
        activity: 0.25,    // Тренировки = главное
        recovery: 0.10,    // Важно, но меньше
        metabolism: 0.05
      },
      maintenance: {
        nutrition: 0.35,
        timing: 0.25,
        activity: 0.20,
        recovery: 0.15,
        metabolism: 0.05
      }
    };

    const weights = weightsByGoal[goalMode];

    const scores = {
      nutrition: [],
      timing: [],
      activity: [],
      recovery: [],
      metabolism: []
    };

    // Распределяем паттерны по категориям (включая новые v4.0 и v5.0)
    for (const p of patterns) {
      if (!p.available || p.score === undefined) continue;

      switch (p.pattern) {
        case PATTERNS.MEAL_QUALITY_TREND:
        case PATTERNS.NUTRITION_QUALITY:
        case PATTERNS.PROTEIN_SATIETY:
        case PATTERNS.FIBER_REGULARITY:
        case PATTERNS.GUT_HEALTH:
        case PATTERNS.HYDRATION: // v4.0 B3
        case PATTERNS.MICRONUTRIENT_RADAR: // v5.0 C7
        case PATTERNS.OMEGA_BALANCER: // v5.0 C8
        case PATTERNS.NOVA_QUALITY: // v5.0 C10
        case PATTERNS.VITAMIN_DEFENSE: // v6.0 C13 (Phase 3, 12.02.2026)
        case PATTERNS.PROTEIN_DISTRIBUTION: // v6.0 C15 (Phase 3, 12.02.2026)
        case PATTERNS.NUTRIENT_DENSITY: // v6.0 C21 (Phase 3, 12.02.2026)
          scores.nutrition.push({
            score: p.score,
            reliability: getPatternReliability(p),
            pattern: p.pattern
          });
          break;

        case PATTERNS.MEAL_TIMING:
        case PATTERNS.WAVE_OVERLAP:
        case PATTERNS.LATE_EATING:
        case PATTERNS.CIRCADIAN:
        case PATTERNS.NUTRIENT_TIMING:
        case PATTERNS.WEEKEND_EFFECT: // v4.0 B6
          scores.timing.push({
            score: p.score,
            reliability: getPatternReliability(p),
            pattern: p.pattern
          });
          break;

        case PATTERNS.TRAINING_KCAL:
        case PATTERNS.STEPS_WEIGHT:
        case PATTERNS.NEAT_ACTIVITY:
        case PATTERNS.TRAINING_RECOVERY: // v5.0 C11
        case PATTERNS.TRAINING_TYPE_MATCH: // v6.0 C19 (Phase 3, 12.02.2026)
          scores.activity.push({
            score: p.score,
            reliability: getPatternReliability(p),
            pattern: p.pattern
          });
          break;

        case PATTERNS.SLEEP_WEIGHT:
        case PATTERNS.SLEEP_HUNGER:
        case PATTERNS.STRESS_EATING:
        case PATTERNS.MOOD_FOOD:
        case PATTERNS.MOOD_TRAJECTORY:
        case PATTERNS.SLEEP_QUALITY: // v4.0 B1
        case PATTERNS.WELLBEING_CORRELATION: // v4.0 B2
        case PATTERNS.CYCLE_IMPACT: // v4.0 B5
        case PATTERNS.ANTIOXIDANT_DEFENSE: // v6.0 C16 (Phase 3, 12.02.2026)
        case PATTERNS.BONE_HEALTH: // v6.0 C17 (Phase 3, 12.02.2026)
        case PATTERNS.ELECTROLYTE_HOMEOSTASIS: // v6.0 C20 (Phase 3, 12.02.2026)
          scores.recovery.push({
            score: p.score,
            reliability: getPatternReliability(p),
            pattern: p.pattern
          });
          break;

        case PATTERNS.INSULIN_SENSITIVITY:
        case PATTERNS.BODY_COMPOSITION: // v4.0 B4
        case PATTERNS.HEART_HEALTH: // v5.0 C9
        case PATTERNS.HYPERTROPHY: // v5.0 C12
        case PATTERNS.B_COMPLEX_ANEMIA: // v6.0 C22 (Phase 3, 12.02.2026)
        case PATTERNS.GLYCEMIC_LOAD: // v6.0 C14 (Phase 3, 12.02.2026)
        case PATTERNS.ADDED_SUGAR_DEPENDENCY: // v6.0 C18 (Phase 3, 12.02.2026)
          scores.metabolism.push({
            score: p.score,
            reliability: getPatternReliability(p),
            pattern: p.pattern
          });
          break;
      }
    }

    // Считаем средние по категориям
    const categoryScores = {};
    let totalWeight = 0;
    let weightedSum = 0;

    for (const [cat, weight] of Object.entries(weights)) {
      if (scores[cat].length > 0) {
        const reliabilitySum = scores[cat].reduce((sum, item) => sum + (Number(item.reliability) || 0), 0);
        const weightedScoreSum = scores[cat].reduce(
          (sum, item) => sum + ((Number(item.score) || 0) * (Number(item.reliability) || 0)),
          0
        );

        const catScore = reliabilitySum > 0
          ? (weightedScoreSum / reliabilitySum)
          : average(scores[cat].map(item => Number(item.score) || 0));

        const categoryReliability = scores[cat].length > 0
          ? (reliabilitySum / scores[cat].length)
          : 0;

        // Даже при низкой уверенности категория остаётся видимой,
        // но её влияние на итоговый score уменьшается.
        const effectiveWeight = weight * (0.4 + 0.6 * categoryReliability);

        categoryScores[cat] = Math.round(catScore);
        weightedSum += catScore * effectiveWeight;
        totalWeight += effectiveWeight;
      } else {
        categoryScores[cat] = null;
      }
    }

    const totalScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;

    return {
      total: totalScore,
      goalMode,
      categories: categoryScores,
      breakdown: {
        nutrition: {
          score: categoryScores.nutrition,
          weight: weights.nutrition,
          reliability: scores.nutrition.length > 0 ? Math.round((scores.nutrition.reduce((s, i) => s + i.reliability, 0) / scores.nutrition.length) * 100) / 100 : null,
          label: 'Питание'
        },
        timing: {
          score: categoryScores.timing,
          weight: weights.timing,
          reliability: scores.timing.length > 0 ? Math.round((scores.timing.reduce((s, i) => s + i.reliability, 0) / scores.timing.length) * 100) / 100 : null,
          label: 'Тайминг'
        },
        activity: {
          score: categoryScores.activity,
          weight: weights.activity,
          reliability: scores.activity.length > 0 ? Math.round((scores.activity.reduce((s, i) => s + i.reliability, 0) / scores.activity.length) * 100) / 100 : null,
          label: 'Активность'
        },
        recovery: {
          score: categoryScores.recovery,
          weight: weights.recovery,
          reliability: scores.recovery.length > 0 ? Math.round((scores.recovery.reduce((s, i) => s + i.reliability, 0) / scores.recovery.length) * 100) / 100 : null,
          label: 'Восстановление'
        },
        metabolism: {
          score: categoryScores.metabolism,
          weight: weights.metabolism,
          reliability: scores.metabolism.length > 0 ? Math.round((scores.metabolism.reduce((s, i) => s + i.reliability, 0) / scores.metabolism.length) * 100) / 100 : null,
          label: 'Метаболизм'
        }
      },
      // DEBUG INFO
      formula: SCIENCE_INFO?.HEALTH_SCORE?.formula || 'Health score composite formula',
      debug: {
        goalMode,
        deficitPct,
        weights,
        confidenceWeighted: true,
        patternCount: patterns.filter(p => p.available).length
      }
    };
  }

  // === WHAT-IF ENGINE ===

  /**
   * Генерация What-If сценариев
   */
  function generateWhatIfScenarios(patterns, healthScore, days, profile) {
    const scenarios = [];

    // Сценарий 1: Идеальная неделя
    const idealImprovement = {};
    let idealBoost = 0;

    for (const p of patterns) {
      if (!p.available || p.score === undefined) continue;
      if (p.score < 80) {
        const improvement = 80 - p.score;
        idealImprovement[p.pattern] = improvement;
        idealBoost += improvement * 0.1; // ~10% от улучшения паттерна
      }
    }

    scenarios.push({
      id: 'ideal',
      name: 'Идеальная неделя',
      icon: '⭐',
      description: 'Все показатели в зелёной зоне',
      currentScore: healthScore.total,
      projectedScore: Math.min(100, healthScore.total + Math.round(idealBoost)),
      improvements: idealImprovement,
      actions: [
        'Соблюдать интервалы между приёмами',
        'Не есть после 21:00',
        'Белок в каждом приёме',
        'Спать 7-8 часов'
      ]
    });

    // Сценарий 2: Текущий курс
    const trendValues = patterns.filter(p => p.trend !== undefined).map(p => p.trend);
    const avgTrend = trendValues.length > 0 ? average(trendValues) : 0;
    const currentProjection = healthScore.total + Math.round((isNaN(avgTrend) ? 0 : avgTrend) * 7);

    scenarios.push({
      id: 'current',
      name: 'Текущий курс',
      icon: '📈',
      description: 'Если продолжить как сейчас',
      currentScore: healthScore.total,
      projectedScore: Math.max(0, Math.min(100, currentProjection)),
      trend: avgTrend > 0 ? 'up' : avgTrend < 0 ? 'down' : 'stable',
      actions: avgTrend >= 0
        ? ['Продолжай в том же духе!']
        : ['Обрати внимание на ухудшающиеся показатели']
    });

    // Сценарий 3: Срыв
    scenarios.push({
      id: 'crash',
      name: 'Если забить',
      icon: '📉',
      description: 'Сценарий без контроля',
      currentScore: healthScore.total,
      projectedScore: Math.max(0, healthScore.total - 25),
      actions: [
        'Вес может вырасти на 1-2 кг',
        'Энергия упадёт',
        'Сон ухудшится'
      ]
    });

    return scenarios;
  }

  // === WEIGHT PREDICTION ===

  /**
   * Прогноз веса на основе данных
   */
  function predictWeight(days, profile) {
    // Собираем данные веса
    const weightData = days
      .filter(d => d.weightMorning)
      .map(d => ({ date: d.date, weight: d.weightMorning, cycleDay: d.cycleDay }))
      .sort((a, b) => a.date.localeCompare(b.date));

    if (weightData.length < 3) {
      return {
        available: false,
        insight: 'Недостаточно данных веса для прогноза'
      };
    }

    // Вспомогательная функция для подготовки точек (x = дни от начала)
    const getPoints = (data) => {
      if (data.length < 2) return [];
      const startTime = new Date(data[0].date).getTime();
      return data.map(d => ({
        x: (new Date(d.date).getTime() - startTime) / (86400000), // дни
        y: d.weight
      }));
    };

    // Raw тренд
    const rawPoints = getPoints(weightData);
    const rawTrend = calculateLinearRegression(rawPoints);

    // Clean тренд (исключаем дни с задержкой воды из-за цикла)
    const cleanData = weightData.filter(d => {
      if (!d.cycleDay) return true;
      // Исключаем дни 1-7 (задержка воды)
      return d.cycleDay > 7 || d.cycleDay === null;
    });

    const cleanPoints = getPoints(cleanData); // Пересчитываем X от первой 'чистой' даты или глобально?
    // Лучше считать X относительно ОДНОЙ точки отсчета, если мы хотим сравнивать
    // Но slope инвариантен к сдвигу X.
    // Однако, если cleanData начинается позже, x[0] будет 0. Это нормально для slope.

    const cleanTrend = cleanPoints.length >= 3 ? calculateLinearRegression(cleanPoints) : rawTrend;

    const currentWeight = weightData[weightData.length - 1].weight; // Берем последний вес из отсортированного массива
    const goalWeight = profile?.weightGoal;

    // Прогноз на неделю
    const weeklyChange = cleanTrend * 7;
    const projectedWeight = currentWeight + weeklyChange;

    // Время до цели
    let weeksToGoal = null;
    let reachDate = null;
    if (goalWeight && cleanTrend !== 0) {
      const diff = goalWeight - currentWeight;
      if ((cleanTrend > 0 && diff > 0) || (cleanTrend < 0 && diff < 0)) {
        weeksToGoal = Math.abs(diff / weeklyChange);
        const reachDateObj = new Date();
        reachDateObj.setDate(reachDateObj.getDate() + Math.round(weeksToGoal * 7));
        reachDate = reachDateObj.toISOString().split('T')[0];
      }
    }

    return {
      available: true,
      currentWeight,
      goalWeight,
      rawTrend: Math.round(rawTrend * 1000) / 1000, // кг/день
      cleanTrend: Math.round(cleanTrend * 1000) / 1000,
      weeklyChange: Math.round(weeklyChange * 100) / 100,
      projectedWeight: Math.round(projectedWeight * 10) / 10,
      weeksToGoal: weeksToGoal ? Math.round(weeksToGoal) : null,
      reachDate,
      dataPoints: weightData.length,
      cleanDataPoints: cleanData.length,
      hasCycleAdjustment: cleanData.length !== weightData.length,
      insight: weeklyChange > 0.3
        ? `📈 Набор ~${Math.round(weeklyChange * 100) / 100} кг/неделю`
        : weeklyChange < -0.3
          ? `📉 Снижение ~${Math.abs(Math.round(weeklyChange * 100) / 100)} кг/неделю`
          : `→ Вес стабилен`
    };
  }

  // === WEEKLY WRAP ===

  /**
   * Генерация Weekly Wrap (сводка недели)
   */
  function generateWeeklyWrap(days, patterns, healthScore, weightPrediction, profile) {
    const safeProfile = profile || {};
    const allDaysHistory = Array.isArray(days) ? days : [];
    const daysWithMeals = days.filter(d => d.meals && d.meals.length > 0);

    // Находим лучший и худший дни
    let bestDay = null;
    let worstDay = null;

    for (const day of daysWithMeals) {
      // Простая оценка: streak = хорошо
      const ratioZones = HEYS.ratioZones;
      if (!ratioZones) continue;

      // Считаем калории
      let dayKcal = 0;
      if (day.meals) {
        for (const meal of day.meals) {
          if (meal.items) {
            for (const item of meal.items) {
              dayKcal += (item.kcal100 || 0) * (item.grams || 0) / 100;
            }
          }
        }
      }

      // Получаем optimum из TDEE или profile
      const optimum = HEYS.TDEE?.calculate?.(day, safeProfile)?.optimum || safeProfile?.normAbs?.kcal || 2000;
      const ratio = dayKcal / optimum;
      const isGood = ratioZones.isSuccess(ratio);

      if (isGood && (!bestDay || day.dayScore > bestDay.dayScore)) {
        bestDay = { ...day, kcal: dayKcal, ratio };
      }
      if (!isGood && (!worstDay || day.dayScore < worstDay.dayScore)) {
        worstDay = { ...day, kcal: dayKcal, ratio };
      }
    }

    // Топ инсайты (с confidence >= threshold)
    const topInsights = patterns
      .filter(p => p.available && p.confidence >= CONFIG.MIN_CORRELATION_DISPLAY)
      .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
      .slice(0, 5)
      .map(p => p.insight);

    // Скрытые победы
    const hiddenWins = [];

    for (const p of patterns) {
      if (!p.available) continue;

      if (p.pattern === PATTERNS.WAVE_OVERLAP && !p.hasOverlaps) {
        hiddenWins.push('🎯 Идеальный тайминг приёмов — волны не пересекались');
      }
      if (p.pattern === PATTERNS.LATE_EATING && p.lateCount === 0) {
        hiddenWins.push('🌙 Ни одного позднего приёма — отлично для сна');
      }
      if (p.pattern === PATTERNS.PROTEIN_SATIETY && p.avgProteinPct >= 25) {
        hiddenWins.push('💪 Белок на высоте — сытость обеспечена');
      }
      if (p.pattern === PATTERNS.FIBER_REGULARITY && p.avgFiberPer1000 >= 14) {
        hiddenWins.push('🥗 Клетчатка в норме — пищеварение скажет спасибо');
      }
      if (p.pattern === PATTERNS.STRESS_EATING && p.correlation < 0) {
        hiddenWins.push('🧘 Стресс не влияет на аппетит — крутой самоконтроль');
      }
    }

    // === SCIENTIFIC WEEK-OVER-WEEK ANALYSIS (v5.2.0) ===
    // Используем статистические тесты для определения значимости изменений
    let scoreChange = 0;
    let weekOverWeekStats = null;

    if (allDaysHistory && allDaysHistory.length >= 14) {
      const currentStart = new Date(days[0].date);
      const prevWeekStart = new Date(currentStart);
      prevWeekStart.setDate(prevWeekStart.getDate() - 7);

      const prevWeekDays = allDaysHistory.filter(d => {
        const date = new Date(d.date);
        return date >= prevWeekStart && date < currentStart;
      });

      if (prevWeekDays.length >= 5) {
        // Извлекаем dayScore для обеих недель
        const prevWeekScores = prevWeekDays
          .map(d => Number(d.dayScore))
          .filter(s => Number.isFinite(s) && s >= 0);

        const currentWeekScores = days
          .map(d => Number(d.dayScore))
          .filter(s => Number.isFinite(s) && s >= 0);

        if (prevWeekScores.length >= 3 && currentWeekScores.length >= 3) {
          // Базовое изменение
          const prevWeekAvg = average(prevWeekScores);
          const currentWeekAvg = average(currentWeekScores);
          scoreChange = Math.round(currentWeekAvg - prevWeekAvg);

          // Статистические тесты
          const tTest = piStats.twoSampleTTest(prevWeekScores, currentWeekScores, 0.05);
          const effectSize = piStats.cohenD(prevWeekScores, currentWeekScores);

          // Confidence intervals
          const prevWeekCI = piStats.calculateConfidenceInterval(prevWeekScores, 0.95);
          const currentWeekCI = piStats.calculateConfidenceInterval(currentWeekScores, 0.95);

          // Statistical power (для оценки надёжности)
          const power = piStats.statisticalPower(
            prevWeekScores.length + currentWeekScores.length,
            Math.abs(effectSize.d)
          );

          weekOverWeekStats = {
            // Средние значения
            prevWeekAvg: Math.round(prevWeekAvg),
            currentWeekAvg: Math.round(currentWeekAvg),
            change: scoreChange,
            changePercent: prevWeekAvg > 0 ? Math.round((scoreChange / prevWeekAvg) * 100) : 0,

            // Статистическая значимость
            isSignificant: tTest.isSignificant,
            pValue: tTest.pValue,
            tStat: Math.round(tTest.tStat * 100) / 100,
            direction: tTest.direction, // 'increase' | 'decrease' | 'no_change'

            // Размер эффекта
            effectSize: Math.round(effectSize.d * 100) / 100,
            effectSizeInterpretation: effectSize.interpretation, // 'small' | 'medium' | 'large'

            // Доверительные интервалы
            prevWeekCI: {
              mean: Math.round(prevWeekCI.mean),
              lower: Math.round(prevWeekCI.lower),
              upper: Math.round(prevWeekCI.upper),
              margin: Math.round(prevWeekCI.margin)
            },
            currentWeekCI: {
              mean: Math.round(currentWeekCI.mean),
              lower: Math.round(currentWeekCI.lower),
              upper: Math.round(currentWeekCI.upper),
              margin: Math.round(currentWeekCI.margin)
            },

            // Statistical power
            power: Math.round(power * 100) / 100,

            // Sample sizes
            prevWeekN: prevWeekScores.length,
            currentWeekN: currentWeekScores.length
          };
        }
      }
    }

    return {
      periodDays: days.length,
      daysWithData: daysWithMeals.length,
      healthScore: healthScore.total,
      scoreChange, // Week-over-week change (v5.1.0 — deprecated, use weekOverWeekStats)
      weekOverWeekStats, // Scientific week-over-week analysis (v5.2.0)
      bestDay: bestDay ? {
        date: bestDay.date,
        dayScore: bestDay.dayScore,
        kcal: Math.round(bestDay.kcal)
      } : null,
      worstDay: worstDay ? {
        date: worstDay.date,
        dayScore: worstDay.dayScore,
        kcal: Math.round(worstDay.kcal)
      } : null,
      topInsights,
      hiddenWins: hiddenWins.slice(0, 3),
      weightPrediction: weightPrediction.available ? {
        current: weightPrediction.currentWeight,
        projected: weightPrediction.projectedWeight,
        weeklyChange: weightPrediction.weeklyChange
      } : null
    };
  }


  // === ЭКСПОРТ ===
  HEYS.InsightsPI.advanced = {
    calculateHealthScore,
    generateWhatIfScenarios,
    predictWeight,
    generateWeeklyWrap
  };

  // Fallback для прямого доступа
  global.piAdvanced = HEYS.InsightsPI.advanced;

  devLog('[PI Advanced] v3.0.0 loaded — 4 advanced analytics functions');

})(typeof window !== 'undefined' ? window : global);
