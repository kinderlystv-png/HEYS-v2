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
  const SCIENCE_INFO = HEYS.InsightsPI?.science || window.piScience || {};
  const piConst = HEYS.InsightsPI?.constants || window.piConst || {};

  // Импорт констант
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
    GUT_HEALTH: 'gut_health'
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
    // Определяем цель (Number() для корректного сравнения строк из localStorage)
    const deficitPct = Number(profile?.deficitPctTarget) || 0;
    let goalMode = 'maintenance';
    if (deficitPct <= -10) goalMode = 'deficit';
    else if (deficitPct >= 10) goalMode = 'bulk';

    // Goal-aware веса
    const weightsByGoal = {
      deficit: {
        nutrition: 0.35,   // Меньше, т.к. дефицит = меньше еды
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

    // Распределяем паттерны по категориям (включая новые)
    for (const p of patterns) {
      if (!p.available || p.score === undefined) continue;

      switch (p.pattern) {
        case PATTERNS.MEAL_QUALITY_TREND:
        case PATTERNS.PROTEIN_SATIETY:
        case PATTERNS.FIBER_REGULARITY:
        case PATTERNS.GUT_HEALTH:
          scores.nutrition.push(p.score);
          break;

        case PATTERNS.MEAL_TIMING:
        case PATTERNS.WAVE_OVERLAP:
        case PATTERNS.LATE_EATING:
        case PATTERNS.CIRCADIAN:
        case PATTERNS.NUTRIENT_TIMING:
          scores.timing.push(p.score);
          break;

        case PATTERNS.TRAINING_KCAL:
        case PATTERNS.STEPS_WEIGHT:
          scores.activity.push(p.score);
          break;

        case PATTERNS.SLEEP_WEIGHT:
        case PATTERNS.SLEEP_HUNGER:
        case PATTERNS.STRESS_EATING:
        case PATTERNS.MOOD_FOOD:
          scores.recovery.push(p.score);
          break;

        case PATTERNS.INSULIN_SENSITIVITY:
          scores.metabolism.push(p.score);
          break;
      }
    }

    // Считаем средние по категориям
    const categoryScores = {};
    let totalWeight = 0;
    let weightedSum = 0;

    for (const [cat, weight] of Object.entries(weights)) {
      if (scores[cat].length > 0) {
        const catScore = average(scores[cat]);
        categoryScores[cat] = Math.round(catScore);
        weightedSum += catScore * weight;
        totalWeight += weight;
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
        nutrition: { score: categoryScores.nutrition, weight: weights.nutrition, label: 'Питание' },
        timing: { score: categoryScores.timing, weight: weights.timing, label: 'Тайминг' },
        activity: { score: categoryScores.activity, weight: weights.activity, label: 'Активность' },
        recovery: { score: categoryScores.recovery, weight: weights.recovery, label: 'Восстановление' },
        metabolism: { score: categoryScores.metabolism, weight: weights.metabolism, label: 'Метаболизм' }
      },
      // DEBUG INFO
      formula: SCIENCE_INFO.HEALTH_SCORE.formula,
      debug: {
        goalMode,
        deficitPct,
        weights,
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
    const avgTrend = average(patterns.filter(p => p.trend !== undefined).map(p => p.trend));
    const currentProjection = healthScore.total + Math.round(avgTrend * 7);

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
  function generateWeeklyWrap(days, patterns, healthScore, weightPrediction) {
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

      // Получаем optimum из profile или дефолт
      const optimum = 2000; // fallback
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

    return {
      periodDays: days.length,
      daysWithData: daysWithMeals.length,
      healthScore: healthScore.total,
      scoreChange: 0, // TODO: сравнить с прошлой неделей
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
