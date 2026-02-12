// pi_patterns.js — Pattern Analysis Functions v4.0.0
// Extracted from heys_predictive_insights_v1.js (Phase 3)
// 22 analyze* функций для анализа паттернов питания, сна, активности, цикла
(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  HEYS.InsightsPI = HEYS.InsightsPI || {};
  const DEV = global.DEV || {};
  const devLog = typeof DEV.log === 'function' ? DEV.log.bind(DEV) : function () { };

  // Зависимости
  const piStats = HEYS.InsightsPI?.stats || window.piStats || {};
  const SCIENCE_INFO = HEYS.InsightsPI?.science || window.piScience || {};
  const piConst = HEYS.InsightsPI?.constants || window.piConst || {};
  const piCalculations = HEYS.InsightsPI?.calculations || window.piCalculations || {};
  const patternModules = HEYS.InsightsPI?.patternModules || {};

  // Импорт конфигурации
  const CONFIG = piConst.CONFIG || {
    MIN_DAYS_FOR_FULL_ANALYSIS: 7,
    MIN_CORRELATION_DISPLAY: 0.35
  };

  // Импорт функций из pi_calculations.js
  const calculateItemKcal = piCalculations.calculateItemKcal || function (item, pIndex) {
    const prod = pIndex?.byId?.get?.(item?.product_id);
    if (!prod) return 0;
    return (prod.kcal100 || 0) * (item.grams || 0) / 100;
  };

  const calculateDayKcal = piCalculations.calculateDayKcal || function (day, pIndex) {
    if (!day?.meals?.length) return 0;
    let total = 0;
    for (const meal of day.meals) {
      for (const item of (meal.items || [])) {
        total += calculateItemKcal(item, pIndex);
      }
    }
    return total;
  };

  /**
   * Helper to resolve product from item wrapper
   * @param {Object} item - meal item wrapper
   * @param {Object} pIndex - products index
   * @returns {Object} product object or item itself
   */
  const getProductFromItem = function (item, pIndex) {
    if (!item) return null;
    if (item.product_id && pIndex && pIndex.byId) {
      const prod = pIndex.byId.get(item.product_id);
      if (prod) return prod;
    }
    return item;
  };

  // Импорт статистических функций из pi_stats.js
  const calculateTrend = piStats.calculateTrend || function (values) {
    if (!values || values.length < 2) return 0;
    const n = values.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += values[i];
      sumXY += i * values[i];
      sumX2 += i * i;
    }
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    return isNaN(slope) ? 0 : slope;
  };

  // Импорт констант (полный список из pi_constants.js)
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
    // v4.0 patterns (B1-B6)
    SLEEP_QUALITY: 'sleep_quality',
    WELLBEING_CORRELATION: 'wellbeing_correlation',
    HYDRATION: 'hydration',
    BODY_COMPOSITION: 'body_composition',
    CYCLE_IMPACT: 'cycle_impact',
    WEEKEND_EFFECT: 'weekend_effect',
    // v5.0 patterns (C7-C12)
    MICRONUTRIENT_RADAR: 'micronutrient_radar',
    OMEGA_BALANCER: 'omega_balancer',
    HEART_HEALTH: 'heart_health',
    NOVA_QUALITY: 'nova_quality',
    TRAINING_RECOVERY: 'training_recovery',
    HYPERTROPHY: 'hypertrophy',
    GLYCEMIC_LOAD: 'glycemic_load',
    PROTEIN_DISTRIBUTION: 'protein_distribution',
    ANTIOXIDANT_DEFENSE: 'antioxidant_defense',
    ADDED_SUGAR_DEPENDENCY: 'added_sugar_dependency',
    BONE_HEALTH: 'bone_health',
    TRAINING_TYPE_MATCH: 'training_type_match',
    ELECTROLYTE_HOMEOSTASIS: 'electrolyte_homeostasis',
    NUTRIENT_DENSITY: 'nutrient_density',
    VITAMIN_DEFENSE: 'vitamin_defense',
    B_COMPLEX_ANEMIA: 'b_complex_anemia'
  };

  // Импорт статистических функций из pi_stats.js (централизовано)
  const { average, stdDev, pearsonCorrelation } = piStats;

  // === АНАЛИЗ ПАТТЕРНОВ ===

  /**
   * Анализ тайминга приёмов пищи и инсулиновых волн
   */
  function analyzeMealTiming(days, profile) {
    const waveHours = profile?.insulinWaveHours || 3;
    const gaps = [];
    const waveOverlaps = [];

    for (const day of days) {
      if (!day.meals || day.meals.length < 2) continue;

      // Сортируем приёмы по времени
      const sortedMeals = [...day.meals]
        .filter(m => m.time)
        .sort((a, b) => a.time.localeCompare(b.time));

      for (let i = 1; i < sortedMeals.length; i++) {
        const prev = sortedMeals[i - 1];
        const curr = sortedMeals[i];

        // Парсим время
        const [prevH, prevM] = prev.time.split(':').map(Number);
        const [currH, currM] = curr.time.split(':').map(Number);

        const prevMinutes = prevH * 60 + prevM;
        const currMinutes = currH * 60 + currM;
        const gapMinutes = currMinutes - prevMinutes;

        if (gapMinutes > 0) {
          gaps.push(gapMinutes);

          // Проверяем перехлёст волн
          const waveMinutes = waveHours * 60;
          if (gapMinutes < waveMinutes) {
            waveOverlaps.push({
              date: day.date,
              gap: gapMinutes,
              overlap: waveMinutes - gapMinutes,
              overlapPct: ((waveMinutes - gapMinutes) / waveMinutes) * 100
            });
          }
        }
      }
    }

    const avgGap = average(gaps);
    const idealGap = waveHours * 60;
    const gapScore = Math.min(100, Math.max(0, (avgGap / idealGap) * 100));

    return {
      pattern: PATTERNS.MEAL_TIMING,
      available: gaps.length > 0,
      score: Math.round(gapScore),
      avgGapMinutes: Math.round(avgGap),
      idealGapMinutes: idealGap,
      gapScore: Math.round(gapScore),
      waveOverlaps,
      overlapCount: waveOverlaps.length,
      totalMeals: days.reduce((sum, d) => sum + (d.meals?.length || 0), 0),
      confidence: days.length >= CONFIG.MIN_DAYS_FOR_FULL_ANALYSIS ? 0.8 : 0.5,
      insight: avgGap < idealGap * 0.7
        ? `Часто ешь раньше чем через ${waveHours}ч — инсулин не успевает упасть`
        : avgGap > idealGap * 1.3
          ? `Большие перерывы между едой — риск переедания`
          : `Отличный тайминг! Среднее между приёмами: ${Math.round(avgGap / 60)}ч ${Math.round(avgGap % 60)}мин`
    };
  }

  /**
   * Анализ перехлёста инсулиновых волн
   */
  function analyzeWaveOverlap(days, profile) {
    const mealTiming = analyzeMealTiming(days, profile);
    const overlaps = mealTiming.waveOverlaps;

    if (overlaps.length === 0) {
      return {
        pattern: PATTERNS.WAVE_OVERLAP,
        available: true,
        hasOverlaps: false,
        overlapCount: 0,
        avgOverlapPct: 0,
        confidence: days.length >= CONFIG.MIN_DAYS_FOR_FULL_ANALYSIS ? 0.8 : 0.5,
        insight: '🎉 Нет перехлёста волн — отличный тайминг!',
        score: 100
      };
    }

    const avgOverlapPct = average(overlaps.map(o => o.overlapPct));
    const score = Math.max(0, 100 - avgOverlapPct);

    return {
      pattern: PATTERNS.WAVE_OVERLAP,
      available: true,
      hasOverlaps: true,
      overlapCount: overlaps.length,
      avgOverlapPct: Math.round(avgOverlapPct),
      worstOverlaps: overlaps.slice(0, 3),
      confidence: days.length >= CONFIG.MIN_DAYS_FOR_FULL_ANALYSIS ? 0.8 : 0.5,
      insight: `${overlaps.length} раз ел до окончания инсулиновой волны — липолиз не успевал начаться`,
      score: Math.round(score)
    };
  }

  /**
   * Анализ поздних приёмов пищи
   */
  function analyzeLateEating(days) {
    const lateMeals = [];
    const LATE_HOUR = 21;

    for (const day of days) {
      if (!day.meals) continue;

      for (const meal of day.meals) {
        if (!meal.time) continue;
        const hour = parseInt(meal.time.split(':')[0], 10);

        if (hour >= LATE_HOUR) {
          lateMeals.push({
            date: day.date,
            time: meal.time,
            hour
          });
        }
      }
    }

    const totalMeals = days.reduce((sum, d) => sum + (d.meals?.length || 0), 0);
    const latePct = totalMeals > 0 ? (lateMeals.length / totalMeals) * 100 : 0;
    const score = Math.max(0, 100 - latePct * 2);

    return {
      pattern: PATTERNS.LATE_EATING,
      available: true,
      lateCount: lateMeals.length,
      totalMeals,
      latePct: Math.round(latePct),
      score: Math.round(score),
      confidence: days.length >= CONFIG.MIN_DAYS_FOR_FULL_ANALYSIS ? 0.8 : 0.5,
      insight: lateMeals.length === 0
        ? '👍 Нет поздних приёмов — отлично для сна!'
        : `${lateMeals.length} поздних приёмов (после 21:00) — может влиять на сон и вес`
    };
  }

  /**
   * Анализ тренда качества приёмов (MealQualityScore)
   */
  function analyzeMealQualityTrend(days, pIndex, optimum) {
    const getMealQualityScore = HEYS.getMealQualityScore;
    if (!getMealQualityScore) {
      return {
        pattern: PATTERNS.MEAL_QUALITY_TREND,
        available: false,
        insight: 'Оценка качества приёмов недоступна'
      };
    }

    const dailyScores = [];

    for (const day of days) {
      if (!day.meals || day.meals.length === 0) continue;

      const scores = day.meals.map(meal => {
        try {
          const quality = getMealQualityScore(meal, meal.name || 'Приём', optimum, pIndex);
          return quality?.score || 0;
        } catch (e) {
          return 0;
        }
      }).filter(s => s > 0);

      if (scores.length > 0) {
        dailyScores.push({
          date: day.date,
          avgScore: average(scores),
          count: scores.length
        });
      }
    }

    if (dailyScores.length < 3) {
      return {
        pattern: PATTERNS.MEAL_QUALITY_TREND,
        available: false,
        confidence: 0.3,
        insight: 'Недостаточно данных для анализа качества'
      };
    }

    // Сортируем по дате (от старых к новым)
    dailyScores.sort((a, b) => a.date.localeCompare(b.date));
    const scores = dailyScores.map(d => d.avgScore);

    const trend = calculateTrend(scores);
    const avgScore = average(scores);
    const score = Math.round(avgScore);

    let insight;
    if (trend > 0.5) {
      insight = `📈 Качество питания улучшается! +${Math.round(trend * 7)} за неделю`;
    } else if (trend < -0.5) {
      insight = `📉 Качество питания снижается. Обрати внимание на состав`;
    } else {
      insight = `Стабильное качество питания: ${Math.round(avgScore)}/100`;
    }

    return {
      pattern: PATTERNS.MEAL_QUALITY_TREND,
      available: true,
      avgScore: Math.round(avgScore),
      trend: Math.round(trend * 100) / 100,
      trendDirection: trend > 0.5 ? 'up' : trend < -0.5 ? 'down' : 'stable',
      dailyScores,
      score,
      confidence: days.length >= CONFIG.MIN_DAYS_FOR_FULL_ANALYSIS ? 0.8 : 0.5,
      insight
    };
  }

  /**
   * C2: Nutrition Quality — качество питания (макро + клетчатка + категории)
   */
  function analyzeNutritionQuality(days, pIndex) {
    const dailyData = [];

    for (const day of days) {
      if (!day.meals || day.meals.length === 0) continue;

      let totalProtein = 0;
      let totalCarbs = 0;
      let totalSimple = 0;
      let totalFat = 0;
      let totalGoodFat = 0;
      let totalFiber = 0;
      let totalKcal = 0;

      const uniqueProducts = new Set();
      const uniqueCategories = new Set();

      for (const meal of day.meals) {
        if (!meal.items) continue;
        for (const item of meal.items) {
          const prod = pIndex?.byId?.get?.(String(item.product_id || item.id)?.toLowerCase());
          if (!prod || !item.grams) continue;

          const p = prod.protein100 || 0;
          const simple = prod.simple100 || 0;
          const complex = prod.complex100 || 0;
          const carbs = simple + complex;
          const goodFat = prod.goodFat100 || 0;
          const badFat = prod.badFat100 || 0;
          const trans = prod.trans100 || 0;
          const fat = goodFat + badFat + trans;
          const fiber = prod.fiber100 || 0;

          totalProtein += p * item.grams / 100;
          totalCarbs += carbs * item.grams / 100;
          totalSimple += simple * item.grams / 100;
          totalFat += fat * item.grams / 100;
          totalGoodFat += goodFat * item.grams / 100;
          totalFiber += fiber * item.grams / 100;
          // TEF-adjusted: protein 3 kcal/g
          totalKcal += (p * 3 + carbs * 4 + fat * 9) * item.grams / 100;

          uniqueProducts.add(prod.name || prod.id || item.product_id);
          const category = prod.category || prod.group || prod.foodGroup || prod.type;
          if (category) uniqueCategories.add(String(category).toLowerCase());
        }
      }

      if (totalKcal <= 0) continue;

      const proteinPct = (totalProtein * 3 / totalKcal) * 100;
      const fiberPer1000 = (totalFiber / totalKcal) * 1000;
      const simplePct = totalCarbs > 0 ? (totalSimple / totalCarbs) * 100 : 0;
      const goodFatPct = totalFat > 0 ? (totalGoodFat / totalFat) * 100 : 0;

      let score = 0;

      // Белок
      if (proteinPct >= 25) score += 20;
      else if (proteinPct >= 20) score += 15;
      else if (proteinPct >= 15) score += 8;

      // Клетчатка
      if (fiberPer1000 >= 14) score += 20;
      else if (fiberPer1000 >= 10) score += 12;
      else if (fiberPer1000 >= 7) score += 6;

      // Простые углеводы
      if (simplePct <= 30) score += 15;
      else if (simplePct <= 45) score += 8;

      // Качество жиров
      if (goodFatPct >= 60) score += 15;
      else if (goodFatPct >= 40) score += 8;

      // Разнообразие категорий (15 баллов)
      if (uniqueCategories.size >= 12) score += 15;
      else if (uniqueCategories.size >= 8) score += 10;
      else if (uniqueCategories.size >= 5) score += 5;

      // Старый diversity остаётся (10 баллов вместо 25)
      if (uniqueProducts.size >= 12) score += 10;
      else if (uniqueProducts.size >= 8) score += 6;
      else if (uniqueProducts.size >= 5) score += 3;

      dailyData.push({
        date: day.date,
        score: Math.min(100, score),
        proteinPct: Math.round(proteinPct),
        fiberPer1000: Math.round(fiberPer1000 * 10) / 10,
        simplePct: Math.round(simplePct),
        goodFatPct: Math.round(goodFatPct),
        categories: uniqueCategories.size,
        products: uniqueProducts.size
      });
    }

    if (dailyData.length < 3) {
      return {
        pattern: PATTERNS.NUTRITION_QUALITY,
        available: false,
        insight: 'Недостаточно данных для оценки качества питания'
      };
    }

    const avgScore = average(dailyData.map(d => d.score));
    const avgFiber = average(dailyData.map(d => d.fiberPer1000));
    const avgProtein = average(dailyData.map(d => d.proteinPct));

    let insight;
    if (avgScore >= 80) {
      insight = '🌿 Отличное качество питания: баланс и разнообразие на высоте';
    } else if (avgFiber < 10) {
      insight = `⚠️ Мало клетчатки (${Math.round(avgFiber)}г/1000ккал) — добавь овощи`;
    } else if (avgProtein < 20) {
      insight = `⚠️ Белка маловато (${Math.round(avgProtein)}%) — добавь источник белка`;
    } else {
      insight = 'Качество питания в норме, есть потенциал улучшения';
    }

    return {
      pattern: PATTERNS.NUTRITION_QUALITY,
      available: true,
      score: Math.round(avgScore),
      avgProteinPct: Math.round(avgProtein),
      avgFiberPer1000: Math.round(avgFiber * 10) / 10,
      dataPoints: dailyData.length,
      confidence: dailyData.length >= 7 ? 0.8 : 0.5,
      insight,
      debug: {
        dailyData: dailyData.slice(0, 3)
      }
    };
  }

  /**
   * Корреляция сна и веса
   */
  function analyzeSleepWeight(days) {
    const pairs = [];

    for (const day of days) {
      const sleep = day.sleepHours || (day.sleepStart && day.sleepEnd
        ? calculateSleepHours(day.sleepStart, day.sleepEnd)
        : null);
      const weight = day.weightMorning;

      if (sleep && weight) {
        pairs.push({ sleep, weight, date: day.date });
      }
    }

    if (pairs.length < 7) {
      return {
        pattern: PATTERNS.SLEEP_WEIGHT,
        available: false,
        confidence: 0.2,
        insight: 'Недостаточно данных сна и веса'
      };
    }

    // Низкая confidence при малой выборке (7-13 дней)
    const baseConfidence = pairs.length < 14 ? 0.25 : 0.5;

    const sleepArr = pairs.map(p => p.sleep);
    const weightArr = pairs.map(p => p.weight);
    const correlation = pearsonCorrelation(sleepArr, weightArr);

    // Обычно негативная корреляция: больше сна → меньше вес
    const score = Math.round(50 + correlation * -50); // Инвертируем
    const confidence = Math.abs(correlation) >= CONFIG.MIN_CORRELATION_DISPLAY ? baseConfidence * (1 + Math.abs(correlation)) : baseConfidence;

    let insight;
    if (Math.abs(correlation) < CONFIG.MIN_CORRELATION_DISPLAY) {
      insight = 'Связь сна и веса пока не выявлена';
    } else if (correlation < -0.3) {
      insight = `💤 Больше сна → меньше вес (r=${correlation.toFixed(2)})`;
    } else if (correlation > 0.3) {
      insight = `⚠️ Недосып коррелирует с набором веса (r=${correlation.toFixed(2)})`;
    } else {
      insight = `Умеренная связь сна и веса (r=${correlation.toFixed(2)})`;
    }

    return {
      pattern: PATTERNS.SLEEP_WEIGHT,
      available: true,
      correlation: Math.round(correlation * 100) / 100,
      dataPoints: pairs.length,
      avgSleep: Math.round(average(sleepArr) * 10) / 10,
      score,
      confidence: pairs.length >= 10 ? 0.8 : 0.5,
      insight
    };
  }

  /**
   * Вычислить часы сна из времён
   */
  function calculateSleepHours(start, end) {
    if (!start || !end) return null;

    const [startH, startM] = start.split(':').map(Number);
    const [endH, endM] = end.split(':').map(Number);

    let startMin = startH * 60 + startM;
    let endMin = endH * 60 + endM;

    // Если засыпание после полуночи
    if (startMin > endMin) {
      endMin += 24 * 60;
    }

    return (endMin - startMin) / 60;
  }

  /**
   * Корреляция недосыпа и переедания
   * FIX v2.0: Используем calculateDayKcal через pIndex
   */
  function analyzeSleepHunger(days, profile, pIndex) {
    const pairs = [];
    const sleepNorm = profile?.sleepHours || 8;

    for (const day of days) {
      const sleep = day.sleepHours || (day.sleepStart && day.sleepEnd
        ? calculateSleepHours(day.sleepStart, day.sleepEnd)
        : null);

      // FIX: Считаем калории через pIndex
      const dayKcal = calculateDayKcal(day, pIndex);

      if (sleep && dayKcal > 0) {
        const sleepDeficit = sleepNorm - sleep;
        pairs.push({ sleepDeficit, kcal: dayKcal, date: day.date });
      }
    }

    if (pairs.length < 7) {
      return {
        pattern: PATTERNS.SLEEP_HUNGER,
        available: false,
        confidence: 0.2,
        insight: 'Недостаточно данных для анализа связи сна и аппетита',
        formula: SCIENCE_INFO?.CORRELATION?.formula || 'r = pearson(x, y)'
      };
    }

    const baseConfidence = pairs.length < 14 ? 0.25 : 0.5;

    const deficitArr = pairs.map(p => p.sleepDeficit);
    const kcalArr = pairs.map(p => p.kcal);
    const correlation = pearsonCorrelation(deficitArr, kcalArr);

    // Позитивная корреляция: больше недосып → больше ккал
    const score = Math.round(50 - correlation * 50);
    const confidence = Math.abs(correlation) >= CONFIG.MIN_CORRELATION_DISPLAY ? baseConfidence * (1 + Math.abs(correlation)) : baseConfidence;

    let insight;
    if (Math.abs(correlation) < CONFIG.MIN_CORRELATION_DISPLAY) {
      insight = 'Связь недосыпа и аппетита пока не выявлена';
    } else if (correlation > 0.3) {
      insight = `😴 Недосып → +калории! При -1ч сна ≈ +${Math.round(correlation * 200)} ккал`;
    } else if (correlation < -0.3) {
      insight = `💪 Отлично контролируешь аппетит даже при недосыпе`;
    } else {
      insight = `Умеренная связь сна и аппетита`;
    }

    return {
      pattern: PATTERNS.SLEEP_HUNGER,
      available: true,
      correlation: Math.round(correlation * 100) / 100,
      dataPoints: pairs.length,
      score,
      confidence: pairs.length >= 10 ? 0.8 : 0.5,
      insight,
      // DEBUG INFO
      formula: `r = pearson(sleepDeficit[], kcal[])\nsleepDeficit = ${sleepNorm}ч (норма) - actualSleep`,
      debug: {
        avgSleepDeficit: Math.round(average(deficitArr) * 10) / 10,
        avgKcal: Math.round(average(kcalArr)),
        source: SCIENCE_INFO?.hormones?.source || 'Spiegel et al., 2004'
      }
    };
  }

  /**
   * Корреляция тренировок и калорий
   * FIX v2.0: Используем calculateDayKcal через pIndex
   */
  function analyzeTrainingKcal(days, pIndex) {
    const trainingDays = [];
    const restDays = [];

    for (const day of days) {
      // FIX: Считаем калории через pIndex
      const dayKcal = calculateDayKcal(day, pIndex);

      if (dayKcal === 0) continue;

      const hasTraining = day.trainings && day.trainings.length > 0;
      if (hasTraining) {
        trainingDays.push(dayKcal);
      } else {
        restDays.push(dayKcal);
      }
    }

    if (trainingDays.length < 3 || restDays.length < 3) {
      return {
        pattern: PATTERNS.TRAINING_KCAL,
        available: false,
        confidence: 0.2,
        insight: 'Недостаточно данных о тренировках'
      };
    }

    const avgTraining = average(trainingDays);
    const avgRest = average(restDays);
    const diff = avgTraining - avgRest;
    const diffPct = (diff / avgRest) * 100;

    // Небольшой перебор в дни тренировок — норма
    const score = diffPct > 15 ? 60 : diffPct > 5 ? 80 : 100;

    let insight;
    if (diff > 200) {
      insight = `🏋️ В дни тренировок ешь на ${Math.round(diff)} ккал больше — это нормально!`;
    } else if (diff < -200) {
      insight = `⚠️ В дни тренировок ешь меньше — добавь белок для восстановления`;
    } else {
      insight = `Калории стабильны независимо от тренировок`;
    }

    return {
      pattern: PATTERNS.TRAINING_KCAL,
      available: true,
      avgTrainingKcal: Math.round(avgTraining),
      avgRestKcal: Math.round(avgRest),
      diffKcal: Math.round(diff),
      diffPct: Math.round(diffPct),
      trainingDaysCount: trainingDays.length,
      restDaysCount: restDays.length,
      score,
      confidence: Math.min(trainingDays.length, restDays.length) >= 5 ? 0.8 : 0.5,
      insight
    };
  }

  /**
   * Корреляция шагов и веса
   */
  function analyzeStepsWeight(days) {
    const pairs = [];

    for (let i = 1; i < days.length; i++) {
      const prevDay = days[i];
      const currDay = days[i - 1]; // days отсортированы от новых к старым

      if (prevDay.steps > 0 && currDay.weightMorning && prevDay.weightMorning) {
        const weightDelta = currDay.weightMorning - prevDay.weightMorning;
        pairs.push({
          steps: prevDay.steps,
          weightDelta,
          date: prevDay.date
        });
      }
    }

    if (pairs.length < 7) {
      return {
        pattern: PATTERNS.STEPS_WEIGHT,
        available: false,
        confidence: 0.2,
        insight: 'Недостаточно данных шагов и веса'
      };
    }

    const baseConfidence = pairs.length < 14 ? 0.25 : 0.5;

    const stepsArr = pairs.map(p => p.steps);
    const deltaArr = pairs.map(p => p.weightDelta);
    const correlation = pearsonCorrelation(stepsArr, deltaArr);

    // Негативная корреляция: больше шагов → меньше прибавка
    const score = Math.round(50 + correlation * -50);
    const avgSteps = average(stepsArr);

    let insight;
    if (Math.abs(correlation) < CONFIG.MIN_CORRELATION_DISPLAY) {
      insight = 'Связь шагов и веса пока не выявлена';
    } else if (correlation < -0.3) {
      insight = `👟 Больше шагов → вес стабильнее! При ${Math.round(avgSteps)} шагов/день`;
    } else if (correlation > 0.3) {
      insight = `Интересно: больше ходишь, но вес растёт. Проверь калории`;
    } else {
      insight = `Умеренное влияние шагов на вес`;
    }

    return {
      pattern: PATTERNS.STEPS_WEIGHT,
      available: true,
      correlation: Math.round(correlation * 100) / 100,
      avgSteps: Math.round(avgSteps),
      dataPoints: pairs.length,
      score,
      confidence: pairs.length >= 10 ? 0.8 : 0.5,
      insight
    };
  }

  /**
   * C4: NEAT Trend — бытовая активность и тренд
   */
  function analyzeNEATTrend(days) {
    const neatData = [];

    for (const day of days) {
      const householdMin = Number(day.householdMin) || 0;
      const activities = Array.isArray(day.householdActivities) ? day.householdActivities : [];
      const activitiesMin = activities.reduce((sum, a) => sum + (Number(a.minutes) || 0), 0);
      const totalMin = householdMin > 0 ? householdMin : activitiesMin;

      if (totalMin > 0) {
        neatData.push({ date: day.date, minutes: totalMin });
      }
    }

    if (neatData.length < 3) {
      return {
        pattern: PATTERNS.NEAT_ACTIVITY,
        available: false,
        insight: 'Недостаточно данных о бытовой активности'
      };
    }

    neatData.sort((a, b) => a.date.localeCompare(b.date));
    const minutesArr = neatData.map(d => d.minutes);
    const avgMinutes = average(minutesArr);
    const trend = calculateTrend(minutesArr);

    let score = avgMinutes >= 60 ? 100 : avgMinutes >= 40 ? 80 : avgMinutes >= 20 ? 60 : 40;
    if (trend > 1) score += 5;
    if (trend < -1) score -= 5;
    score = Math.max(0, Math.min(100, Math.round(score)));

    let insight;
    if (avgMinutes >= 60) {
      insight = '🏡 Отличный NEAT: бытовая активность даёт ощутимый расход';
    } else if (avgMinutes < 20) {
      insight = '⚠️ Мало бытовой активности. Добавь 20-30 минут движения';
    } else if (trend > 1) {
      insight = '📈 NEAT растёт — хорошая динамика';
    } else if (trend < -1) {
      insight = '📉 NEAT снижается — попробуй чаще вставать и двигаться';
    } else {
      insight = 'NEAT стабилен, можно чуть усилить';
    }

    return {
      pattern: PATTERNS.NEAT_ACTIVITY,
      available: true,
      score,
      avgMinutes: Math.round(avgMinutes),
      trend: Math.round(trend * 100) / 100,
      dataPoints: neatData.length,
      confidence: neatData.length >= 7 ? 0.8 : 0.5,
      insight
    };
  }

  /**
   * Корреляция белка и сытости
   * FIX v2.0: Используем pIndex для расчёта макросов
   */
  function analyzeProteinSatiety(days, profile, pIndex) {
    const pairs = [];

    for (const day of days) {
      if (!day.meals || day.meals.length === 0) continue;

      let dayProtein = 0;
      let dayKcal = 0;

      for (const meal of day.meals) {
        if (meal.items) {
          for (const item of meal.items) {
            const prod = pIndex?.byId?.get?.(String(item.product_id || item.id)?.toLowerCase());
            if (prod && item.grams) {
              const p = prod.protein100 || 0;
              const c = (prod.simple100 || 0) + (prod.complex100 || 0);
              const f = (prod.badFat100 || 0) + (prod.goodFat100 || 0) + (prod.trans100 || 0);
              dayProtein += p * item.grams / 100;
              // TEF-adjusted: protein 3 kcal/g
              dayKcal += (p * 3 + c * 4 + f * 9) * item.grams / 100;
            }
          }
        }
      }

      if (dayKcal > 0) {
        // TEF-adjusted: protein 3 kcal/g in percentage calculation
        const proteinPct = (dayProtein * 3 / dayKcal) * 100;
        pairs.push({ proteinPct, protein: dayProtein, kcal: dayKcal, date: day.date });
      }
    }

    if (pairs.length < 7) {
      return {
        pattern: PATTERNS.PROTEIN_SATIETY,
        available: false,
        confidence: 0.2,
        insight: 'Недостаточно данных о белке'
      };
    }

    const baseConfidence = pairs.length < 14 ? 0.25 : 0.5;

    const proteinArr = pairs.map(p => p.proteinPct);
    const kcalArr = pairs.map(p => p.kcal);
    const correlation = pearsonCorrelation(proteinArr, kcalArr);

    const avgProteinPct = average(proteinArr);
    const avgProteinG = average(pairs.map(p => p.protein));
    // Негативная корреляция: больше белка → меньше общих ккал
    const score = avgProteinPct >= 25 ? 100 : avgProteinPct >= 20 ? 80 : 60;
    const confidence = Math.abs(correlation) >= CONFIG.MIN_CORRELATION_DISPLAY ? baseConfidence * (1 + Math.abs(correlation)) : baseConfidence;

    let insight;
    if (correlation < -0.3) {
      insight = `🥩 Больше белка → меньше общих калорий! Белок насыщает`;
    } else if (avgProteinPct >= 25) {
      insight = `💪 Отличный уровень белка: ${Math.round(avgProteinPct)}% калоража`;
    } else if (avgProteinPct < 20) {
      insight = `⚠️ Белок ${Math.round(avgProteinPct)}% — добавь для сытости`;
    } else {
      insight = `Белок в норме: ${Math.round(avgProteinPct)}%`;
    }

    return {
      pattern: PATTERNS.PROTEIN_SATIETY,
      available: true,
      avgProteinPct: Math.round(avgProteinPct),
      avgProteinG: Math.round(avgProteinG),
      correlation: Math.round(correlation * 100) / 100,
      dataPoints: pairs.length,
      score,
      confidence: pairs.length >= 10 ? 0.8 : 0.5,
      insight,
      // DEBUG INFO
      formula: `Белок% = (protein_g × 4 / total_kcal) × 100\nПорог сытости: ≥25% = отлично, 20-25% = норма`,
      debug: {
        avgKcal: Math.round(average(kcalArr)),
        source: 'Westerterp-Plantenga, 2003 (PMID: 12724520)'
      }
    };
  }

  /**
   * Анализ клетчатки
   * FIX v2.0: Используем pIndex для расчёта клетчатки
   */
  function analyzeFiberRegularity(days, pIndex) {
    const fiberData = [];

    for (const day of days) {
      if (!day.meals) continue;

      let dayFiber = 0;
      let dayKcal = 0;

      for (const meal of day.meals) {
        if (meal.items) {
          for (const item of meal.items) {
            const prod = pIndex?.byId?.get?.(String(item.product_id || item.id)?.toLowerCase());
            if (prod && item.grams) {
              const p = prod.protein100 || 0;
              const c = (prod.simple100 || 0) + (prod.complex100 || 0);
              const f = (prod.badFat100 || 0) + (prod.goodFat100 || 0) + (prod.trans100 || 0);
              dayFiber += (prod.fiber100 || 0) * item.grams / 100;
              // TEF-adjusted: protein 3 kcal/g
              dayKcal += (p * 3 + c * 4 + f * 9) * item.grams / 100;
            }
          }
        }
      }

      if (dayKcal > 0) {
        // Норма: 14г на 1000 ккал
        const fiberPer1000 = (dayFiber / dayKcal) * 1000;
        fiberData.push({ fiber: dayFiber, fiberPer1000, kcal: dayKcal, date: day.date });
      }
    }

    if (fiberData.length < 7) {
      return {
        pattern: PATTERNS.FIBER_REGULARITY,
        available: false,
        confidence: 0.2,
        insight: 'Недостаточно данных о клетчатке'
      };
    }

    const baseConfidence = fiberData.length < 14 ? 0.25 : 0.5;

    const avgFiber = average(fiberData.map(d => d.fiber));
    const avgFiberPer1000 = average(fiberData.map(d => d.fiberPer1000));
    const consistency = 100 - (stdDev(fiberData.map(d => d.fiber)) / avgFiber) * 100;

    const score = avgFiberPer1000 >= 14 ? 100 : avgFiberPer1000 >= 10 ? 70 : 40;
    const confidence = fiberData.length >= 14 ? baseConfidence * 1.5 : baseConfidence;

    let insight;
    if (avgFiberPer1000 >= 14) {
      insight = `🥗 Отличный уровень клетчатки: ${Math.round(avgFiber)}г/день`;
    } else if (avgFiberPer1000 >= 10) {
      insight = `Клетчатка в норме: ${Math.round(avgFiber)}г/день. Можно чуть больше`;
    } else {
      insight = `⚠️ Мало клетчатки: ${Math.round(avgFiber)}г/день. Добавь овощи`;
    }

    return {
      pattern: PATTERNS.FIBER_REGULARITY,
      available: true,
      avgFiber: Math.round(avgFiber),
      avgFiberPer1000: Math.round(avgFiberPer1000 * 10) / 10,
      consistency: Math.round(consistency),
      dataPoints: fiberData.length,
      score,
      confidence: fiberData.length >= 10 ? 0.8 : 0.5,
      insight,
      // DEBUG INFO
      formula: `Клетчатка/1000ккал = (fiber_g / total_kcal) × 1000\nНорма: ≥14г/1000ккал`,
      debug: {
        avgKcal: Math.round(average(fiberData.map(d => d.kcal))),
        source: SCIENCE_INFO?.gutHealth?.source || 'Sonnenburg & Sonnenburg, 2014'
      }
    };
  }

  /**
   * Корреляция стресса и переедания
   * FIX v2.0: Используем calculateDayKcal через pIndex
   */
  function analyzeStressEating(days, pIndex) {
    const pairs = [];

    for (const day of days) {
      const stress = day.stressAvg || (day.meals && average(day.meals.filter(m => m.stress).map(m => m.stress)));

      // FIX: Считаем калории через pIndex
      const dayKcal = calculateDayKcal(day, pIndex);

      if (stress && dayKcal > 0) {
        pairs.push({ stress, kcal: dayKcal, date: day.date });
      }
    }

    if (pairs.length < 7) {
      return {
        pattern: PATTERNS.STRESS_EATING,
        available: false,
        confidence: 0.2,
        insight: 'Недостаточно данных о стрессе'
      };
    }

    const baseConfidence = pairs.length < 14 ? 0.25 : 0.5;

    const stressArr = pairs.map(p => p.stress);
    const kcalArr = pairs.map(p => p.kcal);
    const correlation = pearsonCorrelation(stressArr, kcalArr);

    const avgStress = average(stressArr);
    // Позитивная корреляция: больше стресс → больше ккал
    const score = Math.round(50 - correlation * 50);
    const confidence = Math.abs(correlation) >= CONFIG.MIN_CORRELATION_DISPLAY ? baseConfidence * (1 + Math.abs(correlation)) : baseConfidence;

    let insight;
    if (Math.abs(correlation) < CONFIG.MIN_CORRELATION_DISPLAY) {
      insight = 'Связь стресса и еды пока не выявлена';
    } else if (correlation > 0.3) {
      insight = `😰 Стресс → переедание! При стрессе ≈ +${Math.round(correlation * 300)} ккал`;
    } else if (correlation < -0.3) {
      insight = `💪 Стресс не влияет на аппетит — отлично!`;
    } else {
      insight = `Умеренная связь стресса и аппетита`;
    }

    return {
      pattern: PATTERNS.STRESS_EATING,
      available: true,
      correlation: Math.round(correlation * 100) / 100,
      avgStress: Math.round(avgStress * 10) / 10,
      dataPoints: pairs.length,
      score,
      confidence,
      insight
    };
  }

  /**
   * Корреляция настроения и качества еды
   */
  function analyzeMoodFood(days, pIndex, optimum) {
    const getMealQualityScore = HEYS.getMealQualityScore;
    if (!getMealQualityScore) {
      return {
        pattern: PATTERNS.MOOD_FOOD,
        available: false,
        insight: 'Оценка качества приёмов недоступна'
      };
    }

    const pairs = [];

    for (const day of days) {
      const mood = day.moodAvg || (day.meals && average(day.meals.filter(m => m.mood).map(m => m.mood)));

      if (!mood || !day.meals || day.meals.length === 0) continue;

      const scores = day.meals.map(meal => {
        try {
          const quality = getMealQualityScore(meal, meal.name || 'Приём', optimum, pIndex);
          return quality?.score || 0;
        } catch (e) {
          return 0;
        }
      }).filter(s => s > 0);

      if (scores.length > 0) {
        pairs.push({ mood, quality: average(scores), date: day.date });
      }
    }

    if (pairs.length < 7) {
      return {
        pattern: PATTERNS.MOOD_FOOD,
        available: false,
        confidence: 0.2,
        insight: 'Недостаточно данных о настроении'
      };
    }

    const baseConfidence = pairs.length < 14 ? 0.25 : 0.5;

    const moodArr = pairs.map(p => p.mood);
    const qualityArr = pairs.map(p => p.quality);
    const correlation = pearsonCorrelation(moodArr, qualityArr);

    const avgMood = average(moodArr);
    const avgQuality = average(qualityArr);
    // Позитивная корреляция: лучше настроение → лучше качество еды
    const score = Math.round(avgQuality);

    let insight;
    if (Math.abs(correlation) < CONFIG.MIN_CORRELATION_DISPLAY) {
      insight = 'Связь настроения и качества еды пока не выявлена';
    } else if (correlation > 0.3) {
      insight = `😊 Хорошее настроение → качественнее еда! Береги себя`;
    } else if (correlation < -0.3) {
      insight = `🤔 При плохом настроении ешь лучше — это способ заботы?`;
    } else {
      insight = `Умеренная связь настроения и питания`;
    }

    const confidence = Math.abs(correlation) > CONFIG.MIN_CORRELATION_DISPLAY
      ? baseConfidence * (1 + Math.abs(correlation))
      : baseConfidence;

    return {
      pattern: PATTERNS.MOOD_FOOD,
      available: true,
      correlation: Math.round(correlation * 100) / 100,
      avgMood: Math.round(avgMood * 10) / 10,
      avgQuality: Math.round(avgQuality),
      dataPoints: pairs.length,
      score,
      confidence,
      insight
    };
  }

  /**
   * C6: Mood Trajectory — настроение vs состав каждого приёма
   */
  function analyzeMoodTrajectory(days, pIndex) {
    const moodArr = [];
    const simpleArr = [];
    const proteinArr = [];

    for (const day of days) {
      if (!day.meals) continue;

      for (const meal of day.meals) {
        if (meal.mood == null || !meal.items) continue;

        let mealProtein = 0;
        let mealCarbs = 0;
        let mealSimple = 0;
        let mealFat = 0;
        let mealKcal = 0;

        for (const item of meal.items) {
          const prod = pIndex?.byId?.get?.(String(item.product_id || item.id)?.toLowerCase());
          if (!prod || !item.grams) continue;

          const p = prod.protein100 || 0;
          const simple = prod.simple100 || 0;
          const complex = prod.complex100 || 0;
          const carbs = simple + complex;
          const fat = (prod.badFat100 || 0) + (prod.goodFat100 || 0) + (prod.trans100 || 0);

          mealProtein += p * item.grams / 100;
          mealCarbs += carbs * item.grams / 100;
          mealSimple += simple * item.grams / 100;
          mealFat += fat * item.grams / 100;
          // TEF-adjusted: protein 3 kcal/g
          mealKcal += (p * 3 + carbs * 4 + fat * 9) * item.grams / 100;
        }

        if (mealKcal <= 0) continue;

        const simplePct = mealCarbs > 0 ? (mealSimple / mealCarbs) * 100 : 0;
        const proteinPct = (mealProtein * 3 / mealKcal) * 100;

        moodArr.push(meal.mood);
        simpleArr.push(simplePct);
        proteinArr.push(proteinPct);
      }
    }

    if (moodArr.length < 7) {
      return {
        pattern: PATTERNS.MOOD_TRAJECTORY,
        available: false,
        insight: 'Недостаточно данных для анализа настроения по приёмам'
      };
    }

    const simpleCorr = pearsonCorrelation(simpleArr, moodArr);
    const proteinCorr = pearsonCorrelation(proteinArr, moodArr);

    let insight;
    let score = 60;

    if (simpleCorr < -CONFIG.MIN_CORRELATION_DISPLAY) {
      insight = '😕 Настроение падает после простых углеводов — попробуй снизить быстрые';
      score = 40;
    } else if (proteinCorr > CONFIG.MIN_CORRELATION_DISPLAY) {
      insight = '😊 Белок улучшает настроение — держи высокий белок в приёмах';
      score = 80;
    } else {
      insight = 'Настроение стабильнее при сбалансированных приёмах';
    }

    return {
      pattern: PATTERNS.MOOD_TRAJECTORY,
      available: true,
      score,
      dataPoints: moodArr.length,
      simpleCorr: Math.round(simpleCorr * 100) / 100,
      proteinCorr: Math.round(proteinCorr * 100) / 100,
      confidence: moodArr.length >= 14 ? 0.8 : 0.5,
      insight,
      debug: {
        formula: 'corr(mood, simple%) vs corr(mood, protein%)'
      }
    };
  }

  // === НОВЫЕ НАУЧНЫЕ АНАЛИЗАТОРЫ v2.0 ===

  /**
   * 🌅 Циркадный анализ — распределение калорий по времени суток
   * PMID: 23512957 (Garaulet), 24154571 (Jakubowicz)
   */
  function analyzeCircadianTiming(days, pIndex) {
    const timeWeights = {
      morning: { from: 6, to: 12, weight: 1.1, label: 'Утро (6-12)' },
      afternoon: { from: 12, to: 18, weight: 1.0, label: 'День (12-18)' },
      evening: { from: 18, to: 22, weight: 0.9, label: 'Вечер (18-22)' },
      night: { from: 22, to: 6, weight: 0.7, label: 'Ночь (22-6)' }
    };

    const dailyData = [];

    for (const day of days) {
      if (!day.meals || day.meals.length === 0) continue;

      const periods = { morning: 0, afternoon: 0, evening: 0, night: 0 };
      let totalKcal = 0;

      for (const meal of day.meals) {
        if (!meal.time || !meal.items) continue;
        const hour = parseInt(meal.time.split(':')[0], 10);

        let mealKcal = 0;
        for (const item of meal.items) {
          mealKcal += calculateItemKcal(item, pIndex);
        }

        totalKcal += mealKcal;

        // Определяем период
        if (hour >= 6 && hour < 12) periods.morning += mealKcal;
        else if (hour >= 12 && hour < 18) periods.afternoon += mealKcal;
        else if (hour >= 18 && hour < 22) periods.evening += mealKcal;
        else periods.night += mealKcal;
      }

      if (totalKcal > 0) {
        // Считаем взвешенный score
        let weightedSum = 0;
        for (const [period, kcal] of Object.entries(periods)) {
          weightedSum += (kcal / totalKcal) * timeWeights[period].weight;
        }
        const dayScore = weightedSum * 100;

        dailyData.push({
          date: day.date,
          periods,
          totalKcal,
          score: dayScore,
          morningPct: Math.round((periods.morning / totalKcal) * 100),
          eveningPct: Math.round(((periods.evening + periods.night) / totalKcal) * 100)
        });
      }
    }

    if (dailyData.length < 3) {
      return {
        pattern: PATTERNS.CIRCADIAN,
        available: false,
        insight: 'Недостаточно данных для циркадного анализа'
      };
    }

    const avgScore = average(dailyData.map(d => d.score));
    const avgMorningPct = average(dailyData.map(d => d.morningPct));
    const avgEveningPct = average(dailyData.map(d => d.eveningPct));

    let insight;
    if (avgScore >= 95) {
      insight = '🌅 Идеальное распределение! Основные калории до обеда';
    } else if (avgScore >= 85) {
      insight = `☀️ Хороший тайминг: ${Math.round(avgMorningPct)}% калорий утром`;
    } else if (avgEveningPct > 40) {
      insight = `🌙 ${Math.round(avgEveningPct)}% калорий вечером — перенеси часть на утро`;
    } else {
      insight = `Распределение калорий по дню умеренное`;
    }

    return {
      pattern: PATTERNS.CIRCADIAN,
      available: true,
      score: Math.round(avgScore),
      avgMorningPct: Math.round(avgMorningPct),
      avgEveningPct: Math.round(avgEveningPct),
      dataPoints: dailyData.length,
      confidence: dailyData.length >= 7 ? 0.8 : 0.5,
      insight,
      // DEBUG INFO
      formula: SCIENCE_INFO?.CIRCADIAN?.formula || 'circadian score',
      debug: {
        timeWeights,
        dailyData: dailyData.slice(0, 3),
        source: SCIENCE_INFO?.CIRCADIAN?.source || 'Panda, 2016'
      }
    };
  }

  /**
   * 🥩 Тайминг нутриентов — когда съедены белок/углеводы/жиры
   * PMID: 24477298 (Areta), 23360586 (Aragon & Schoenfeld)
   */
  function analyzeNutrientTiming(days, pIndex, profile) {
    const dailyData = [];

    for (const day of days) {
      if (!day.meals || day.meals.length === 0) continue;

      let morningProtein = 0, eveningProtein = 0;
      let postWorkoutCarbs = 0, totalCarbs = 0;
      let eveningFat = 0, totalFat = 0;

      // Найти время тренировки
      const trainingHour = day.trainings?.[0]?.time
        ? parseInt(day.trainings[0].time.split(':')[0], 10)
        : null;

      for (const meal of day.meals) {
        if (!meal.time || !meal.items) continue;
        const hour = parseInt(meal.time.split(':')[0], 10);

        let mealProtein = 0, mealCarbs = 0, mealFat = 0;
        for (const item of meal.items) {
          const prod = pIndex?.byId?.get?.(String(item.product_id || item.id)?.toLowerCase());
          if (prod && item.grams) {
            mealProtein += (prod.protein100 || 0) * item.grams / 100;
            mealCarbs += ((prod.simple100 || 0) + (prod.complex100 || 0)) * item.grams / 100;
            mealFat += ((prod.badFat100 || 0) + (prod.goodFat100 || 0)) * item.grams / 100;
          }
        }

        // Распределение по времени
        if (hour >= 6 && hour < 12) morningProtein += mealProtein;
        if (hour >= 18) eveningProtein += mealProtein;
        if (hour >= 18) eveningFat += mealFat;

        // Углеводы после тренировки (в окне 2ч)
        if (trainingHour && hour >= trainingHour && hour <= trainingHour + 2) {
          postWorkoutCarbs += mealCarbs;
        }

        totalCarbs += mealCarbs;
        totalFat += mealFat;
      }

      const totalProtein = morningProtein + eveningProtein;

      // Scoring
      let score = 50; // Base

      // Белок утром (+10 за каждые 20г)
      if (morningProtein >= 20) score += 10;
      if (morningProtein >= 30) score += 5;

      // Углеводы после тренировки (+15)
      if (trainingHour && postWorkoutCarbs >= 30) score += 15;

      // Не слишком много жиров вечером
      const eveningFatPct = totalFat > 0 ? (eveningFat / totalFat) * 100 : 0;
      if (eveningFatPct < 30) score += 10;

      // Белок равномерно
      const proteinBalance = totalProtein > 0
        ? Math.min(morningProtein, eveningProtein) / Math.max(morningProtein, eveningProtein, 1)
        : 0;
      if (proteinBalance > 0.6) score += 10;

      dailyData.push({
        date: day.date,
        morningProtein: Math.round(morningProtein),
        postWorkoutCarbs: Math.round(postWorkoutCarbs),
        eveningFatPct: Math.round(eveningFatPct),
        score: Math.min(100, score)
      });
    }

    if (dailyData.length < 3) {
      return {
        pattern: PATTERNS.NUTRIENT_TIMING,
        available: false,
        insight: 'Недостаточно данных для анализа тайминга нутриентов'
      };
    }

    const avgScore = average(dailyData.map(d => d.score));
    const avgMorningProtein = average(dailyData.map(d => d.morningProtein));

    let insight;
    if (avgScore >= 80) {
      insight = '🎯 Отличный тайминг нутриентов! Белок утром, углеводы после трени';
    } else if (avgMorningProtein < 20) {
      insight = `⚠️ Мало белка утром (${Math.round(avgMorningProtein)}г). Добавь яйца/творог`;
    } else {
      insight = `Тайминг нутриентов можно оптимизировать`;
    }

    return {
      pattern: PATTERNS.NUTRIENT_TIMING,
      available: true,
      score: Math.round(avgScore),
      avgMorningProtein: Math.round(avgMorningProtein),
      dataPoints: dailyData.length,
      confidence: dailyData.length >= 7 ? 0.8 : 0.5,
      insight,
      // DEBUG INFO
      formula: SCIENCE_INFO?.NUTRIENT_TIMING?.formula || 'nutrient timing score',
      debug: {
        dailyData: dailyData.slice(0, 3),
        source: SCIENCE_INFO?.NUTRIENT_TIMING?.source || 'Arble et al., 2009'
      }
    };
  }

  /**
   * 🩺 Прокси инсулиновой чувствительности
   * Косвенная оценка на основе GI, клетчатки, тайминга углеводов
   * PMID: 12936919 (Brand-Miller), 8198048 (Wolever)
   */
  function analyzeInsulinSensitivity(days, pIndex, profile) {
    const dailyData = [];

    for (const day of days) {
      if (!day.meals || day.meals.length === 0) continue;

      let totalCarbs = 0, weightedGI = 0, totalFiber = 0;
      let eveningCarbs = 0, totalKcal = 0;

      for (const meal of day.meals) {
        if (!meal.items) continue;
        const hour = meal.time ? parseInt(meal.time.split(':')[0], 10) : 12;

        for (const item of meal.items) {
          const prod = pIndex?.byId?.get?.(String(item.product_id || item.id)?.toLowerCase());
          if (prod && item.grams) {
            const carbs = ((prod.simple100 || 0) + (prod.complex100 || 0)) * item.grams / 100;
            const gi = prod.gi || prod.gi100 || prod.GI || 50;
            const fiber = (prod.fiber100 || 0) * item.grams / 100;
            const p = prod.protein100 || 0;
            const f = (prod.badFat100 || 0) + (prod.goodFat100 || 0);

            totalCarbs += carbs;
            weightedGI += carbs * gi;
            totalFiber += fiber;
            // TEF-adjusted: protein 3 kcal/g
            totalKcal += (p * 3 + carbs * 4 + f * 9) * item.grams / 100;

            if (hour >= 18) eveningCarbs += carbs;
          }
        }
      }

      if (totalCarbs === 0 || totalKcal === 0) continue;

      const avgGI = weightedGI / totalCarbs;
      const fiberPer1000 = (totalFiber / totalKcal) * 1000;
      const eveningCarbsPct = (eveningCarbs / totalCarbs) * 100;
      const hasTraining = day.trainings && day.trainings.length > 0;
      const sleepOk = (day.sleepHours || 7) >= 7;

      // Scoring
      let score = 0;

      // Низкий GI (+20)
      if (avgGI <= 55) score += 20;
      else if (avgGI <= 70) score += 10;

      // Клетчатка (+20)
      if (fiberPer1000 >= 14) score += 20;
      else if (fiberPer1000 >= 10) score += 10;

      // Мало углеводов вечером (+15)
      if (eveningCarbsPct <= 30) score += 15;
      else if (eveningCarbsPct <= 40) score += 8;

      // Тренировка (+15)
      if (hasTraining) score += 15;

      // Сон (+10)
      if (sleepOk) score += 10;

      // Базовые +20
      score += 20;

      dailyData.push({
        date: day.date,
        avgGI: Math.round(avgGI),
        fiberPer1000: Math.round(fiberPer1000 * 10) / 10,
        eveningCarbsPct: Math.round(eveningCarbsPct),
        hasTraining,
        sleepOk,
        score: Math.min(100, score)
      });
    }

    if (dailyData.length < 3) {
      return {
        pattern: PATTERNS.INSULIN_SENSITIVITY,
        available: false,
        insight: 'Недостаточно данных для оценки инсулиновой чувствительности'
      };
    }

    const avgScore = average(dailyData.map(d => d.score));
    const avgGI = average(dailyData.map(d => d.avgGI));
    const avgFiber = average(dailyData.map(d => d.fiberPer1000));

    let insight;
    if (avgScore >= 75) {
      insight = '🩺 Хорошие маркеры инсулиновой чувствительности!';
    } else if (avgGI > 65) {
      insight = `⚠️ Высокий средний GI (${Math.round(avgGI)}). Замени быстрые углеводы на медленные`;
    } else if (avgFiber < 10) {
      insight = `⚠️ Мало клетчатки (${Math.round(avgFiber)}г/1000ккал). Добавь овощи`;
    } else {
      insight = `Инсулиновая чувствительность в норме`;
    }

    return {
      pattern: PATTERNS.INSULIN_SENSITIVITY,
      available: true,
      score: Math.round(avgScore),
      avgGI: Math.round(avgGI),
      avgFiberPer1000: Math.round(avgFiber * 10) / 10,
      dataPoints: dailyData.length,
      confidence: dailyData.length >= 7 ? 0.8 : 0.5,
      insight,
      // DEBUG INFO
      formula: SCIENCE_INFO?.INSULIN_SENSITIVITY?.formula || 'insulin sensitivity score',
      debug: {
        dailyData: dailyData.slice(0, 3),
        source: SCIENCE_INFO?.INSULIN_SENSITIVITY?.source || 'Ludwig, 2002'
      }
    };
  }

  /**
   * 🦠 Здоровье кишечника / микробиом
   * PMID: 24336217 (Sonnenburg), 29902436 (Makki)
   */
  function analyzeGutHealth(days, pIndex) {
    const dailyData = [];

    // Список ферментированных продуктов (по названию)
    // v4.0: Убраны творог/сыр (не ферментированы в строгом смысле)
    const fermentedKeywords = ['кефир', 'йогурт', 'квашен', 'кимчи', 'мисо', 'темпе', 'комбуча'];

    for (const day of days) {
      if (!day.meals || day.meals.length === 0) continue;

      let totalFiber = 0, totalKcal = 0;
      const uniqueProducts = new Set();
      const uniqueCategories = new Set();
      let hasFermented = false;

      for (const meal of day.meals) {
        if (!meal.items) continue;

        for (const item of meal.items) {
          const prod = pIndex?.byId?.get?.(String(item.product_id || item.id)?.toLowerCase());
          if (prod && item.grams) {
            const p = prod.protein100 || 0;
            const c = (prod.simple100 || 0) + (prod.complex100 || 0);
            const f = (prod.badFat100 || 0) + (prod.goodFat100 || 0);

            totalFiber += (prod.fiber100 || 0) * item.grams / 100;
            // TEF-adjusted: protein 3 kcal/g
            totalKcal += (p * 3 + c * 4 + f * 9) * item.grams / 100;

            // Уникальные продукты
            uniqueProducts.add(prod.name || prod.id);

            // Категории
            const category = prod.category || prod.group || prod.foodGroup || prod.type;
            if (category) uniqueCategories.add(String(category).toLowerCase());

            // Ферментированные
            const prodName = (prod.name || '').toLowerCase();
            if (fermentedKeywords.some(kw => prodName.includes(kw))) {
              hasFermented = true;
            }
          }
        }
      }

      if (totalKcal === 0) continue;

      const fiberTotal = totalFiber;
      const diversity = uniqueProducts.size;

      // Scoring
      let score = 0;

      // Клетчатка (30)
      if (fiberTotal >= 30) score += 30;
      else if (fiberTotal >= 25) score += 25;
      else if (fiberTotal >= 20) score += 18;
      else if (fiberTotal >= 15) score += 10;

      // Разнообразие категорий (15)
      const categoryDiversity = uniqueCategories.size;
      if (categoryDiversity >= 12) score += 15;
      else if (categoryDiversity >= 8) score += 10;
      else if (categoryDiversity >= 5) score += 5;

      // Разнообразие продуктов (10)
      if (diversity >= 20) score += 10;
      else if (diversity >= 15) score += 8;
      else if (diversity >= 10) score += 6;
      else if (diversity >= 5) score += 3;

      // Ферментированные (15)
      if (hasFermented) score += 15;

      // Базовые +30
      score += 30;

      dailyData.push({
        date: day.date,
        fiberTotal: Math.round(fiberTotal),
        diversity,
        categoryDiversity,
        hasFermented,
        score: Math.min(100, score)
      });
    }

    if (dailyData.length < 3) {
      return {
        pattern: PATTERNS.GUT_HEALTH,
        available: false,
        insight: 'Недостаточно данных для оценки здоровья кишечника'
      };
    }

    const avgScore = average(dailyData.map(d => d.score));
    const avgFiber = average(dailyData.map(d => d.fiberTotal));
    const avgDiversity = average(dailyData.map(d => d.diversity));
    const avgCategoryDiversity = average(dailyData.map(d => d.categoryDiversity));
    const fermentedDays = dailyData.filter(d => d.hasFermented).length;

    let insight;
    if (avgScore >= 75) {
      insight = '🦠 Отлично для микробиома! Много клетчатки и разнообразие';
    } else if (avgFiber < 20) {
      insight = `⚠️ Мало клетчатки (${Math.round(avgFiber)}г). Добавь овощи, бобовые, цельнозерновые`;
    } else if (avgCategoryDiversity < 8) {
      insight = `⚠️ Мало разнообразия категорий (${Math.round(avgCategoryDiversity)}). Добавь новые группы продуктов`;
    } else if (avgDiversity < 10) {
      insight = `⚠️ Мало разнообразия (${Math.round(avgDiversity)} продуктов/день). Пробуй новое!`;
    } else if (fermentedDays < dailyData.length * 0.3) {
      insight = `Добавь ферментированные продукты: кефир, йогурт, квашеную капусту`;
    } else {
      insight = `Здоровье кишечника в норме`;
    }

    return {
      pattern: PATTERNS.GUT_HEALTH,
      available: true,
      score: Math.round(avgScore),
      avgFiber: Math.round(avgFiber),
      avgDiversity: Math.round(avgDiversity),
      avgCategoryDiversity: Math.round(avgCategoryDiversity),
      fermentedDaysPct: Math.round((fermentedDays / dailyData.length) * 100),
      dataPoints: dailyData.length,
      confidence: dailyData.length >= 7 ? 0.8 : 0.5,
      insight,
      // DEBUG INFO
      formula: SCIENCE_INFO?.GUT_HEALTH?.formula || 'gut health score',
      debug: {
        dailyData: dailyData.slice(0, 3),
        fermentedKeywords,
        source: SCIENCE_INFO?.GUT_HEALTH?.source || 'Sonnenburg & Sonnenburg, 2014'
      }
    };
  }

  // === NEW v4.0 PATTERNS (B1-B6) ===

  /**
   * B1: Sleep Quality → Next Day Metrics (time-lagged correlation)
   * Научный подход: качество сна влияет на метрики СЛЕДУЮЩЕГО дня
   */
  function analyzeSleepQuality(days, pIndex) {
    if (!days || days.length < 8) {
      return {
        pattern: PATTERNS.SLEEP_QUALITY,
        available: false,
        confidence: 0.2,
        insight: 'Недостаточно данных о качестве сна'
      };
    }

    const timeLaggedPairs = {
      weight: [],
      hunger: [],
      steps: [],
      kcal: []
    };

    // Time-lagged: день N → день N+1
    for (let i = 0; i < days.length - 1; i++) {
      const today = days[i];
      const tomorrow = days[i + 1];

      const sleepQuality = today.sleepQuality;
      if (!sleepQuality) continue;

      if (tomorrow.weightMorning) {
        timeLaggedPairs.weight.push({ quality: sleepQuality, value: tomorrow.weightMorning });
      }
      if (tomorrow.hungerAvg) {
        timeLaggedPairs.hunger.push({ quality: sleepQuality, value: tomorrow.hungerAvg });
      }
      if (tomorrow.steps) {
        timeLaggedPairs.steps.push({ quality: sleepQuality, value: tomorrow.steps });
      }
      const tomorrowKcal = calculateDayKcal(tomorrow, pIndex);
      if (tomorrowKcal > 0) {
        timeLaggedPairs.kcal.push({ quality: sleepQuality, value: tomorrowKcal });
      }
    }

    // Ищем сильнейшую корреляцию
    const correlations = {};
    let maxAbsCorr = 0;
    let keyMetric = null;

    for (const [metric, pairs] of Object.entries(timeLaggedPairs)) {
      if (pairs.length < 7) continue;

      const qualityArr = pairs.map(p => p.quality);
      const valueArr = pairs.map(p => p.value);
      const corr = pearsonCorrelation(qualityArr, valueArr);

      correlations[metric] = {
        correlation: corr,
        dataPoints: pairs.length,
        avgQuality: average(qualityArr),
        avgValue: average(valueArr)
      };

      if (Math.abs(corr) > maxAbsCorr && Math.abs(corr) >= CONFIG.MIN_CORRELATION_DISPLAY) {
        maxAbsCorr = Math.abs(corr);
        keyMetric = metric;
      }
    }

    if (!keyMetric) {
      return {
        pattern: PATTERNS.SLEEP_QUALITY,
        available: true,
        correlations,
        dataPoints: Object.values(correlations)[0]?.dataPoints || 0,
        score: 50,
        confidence: 0.3,
        insight: 'Связь качества сна с метриками следующего дня пока не выявлена'
      };
    }

    const keyData = correlations[keyMetric];
    const baseConfidence = keyData.dataPoints < 14 ? 0.25 : 0.5;
    const confidence = baseConfidence * (1 + maxAbsCorr);

    const score = maxAbsCorr >= 0.5 ? 90 : maxAbsCorr >= 0.4 ? 75 : 60;

    const metricNames = {
      weight: 'вес',
      hunger: 'голод',
      steps: 'шаги',
      kcal: 'калории'
    };

    let insight;
    if (keyData.correlation < -0.4) {
      insight = `💤 Хороший сон → ниже ${metricNames[keyMetric]} на след. день (r=${keyData.correlation.toFixed(2)})`;
    } else if (keyData.correlation > 0.4) {
      insight = `⚠️ Плохой сон → выше ${metricNames[keyMetric]} на след. день (r=${keyData.correlation.toFixed(2)})`;
    } else {
      insight = `Умеренная связь сна с ${metricNames[keyMetric]} (r=${keyData.correlation.toFixed(2)})`;
    }

    return {
      pattern: PATTERNS.SLEEP_QUALITY,
      available: true,
      keyMetric,
      correlations,
      dataPoints: keyData.dataPoints,
      score,
      confidence,
      insight
    };
  }

  /**
   * B2: Wellbeing Correlation — что влияет на самочувствие
   */
  function analyzeWellbeing(days, pIndex) {
    const correlations = {
      sleepQuality: { pairs: [] },
      sleepHours: { pairs: [] },
      steps: { pairs: [] },
      protein: { pairs: [] },
      kcal: { pairs: [] }
    };

    for (const day of days) {
      const wellbeing = day.wellbeingAvg;
      if (!wellbeing) continue;

      if (day.sleepQuality) {
        correlations.sleepQuality.pairs.push({ wellbeing, value: day.sleepQuality });
      }

      const sleepHours = day.sleepHours || (day.sleepStart && day.sleepEnd
        ? calculateSleepHours(day.sleepStart, day.sleepEnd)
        : null);
      if (sleepHours) {
        correlations.sleepHours.pairs.push({ wellbeing, value: sleepHours });
      }

      if (day.steps) {
        correlations.steps.pairs.push({ wellbeing, value: day.steps });
      }

      // Считаем protein и kcal
      if (day.meals && day.meals.length > 0) {
        let dayProtein = 0;
        const dayKcal = calculateDayKcal(day, pIndex);

        for (const meal of day.meals) {
          if (!meal.items) continue;
          for (const item of meal.items) {
            const prod = pIndex?.byId?.get?.(String(item.product_id || item.id)?.toLowerCase());
            if (prod && item.grams) {
              dayProtein += (prod.protein100 || 0) * item.grams / 100;
            }
          }
        }

        if (dayProtein > 0) {
          correlations.protein.pairs.push({ wellbeing, value: dayProtein });
        }
        if (dayKcal > 0) {
          correlations.kcal.pairs.push({ wellbeing, value: dayKcal });
        }
      }
    }

    // Вычисляем корреляции
    const results = {};
    let maxAbsCorr = 0;
    let keyFactor = null;

    for (const [factor, data] of Object.entries(correlations)) {
      if (data.pairs.length < 7) continue;

      const wellbeingArr = data.pairs.map(p => p.wellbeing);
      const valueArr = data.pairs.map(p => p.value);
      const corr = pearsonCorrelation(wellbeingArr, valueArr);

      results[factor] = {
        correlation: corr,
        dataPoints: data.pairs.length,
        avgWellbeing: average(wellbeingArr),
        avgValue: average(valueArr)
      };

      if (Math.abs(corr) > maxAbsCorr && Math.abs(corr) >= CONFIG.MIN_CORRELATION_DISPLAY) {
        maxAbsCorr = Math.abs(corr);
        keyFactor = factor;
      }
    }

    if (Object.keys(results).length === 0) {
      return {
        pattern: PATTERNS.WELLBEING_CORRELATION,
        available: false,
        confidence: 0.2,
        insight: 'Недостаточно данных о самочувствии'
      };
    }

    if (!keyFactor) {
      return {
        pattern: PATTERNS.WELLBEING_CORRELATION,
        available: true,
        correlations: results,
        dataPoints: Object.values(results)[0]?.dataPoints || 0,
        score: 50,
        confidence: 0.3,
        insight: 'Ключевые факторы самочувствия пока не выявлены'
      };
    }

    const keyData = results[keyFactor];
    const baseConfidence = keyData.dataPoints < 14 ? 0.25 : 0.5;
    const confidence = baseConfidence * (1 + maxAbsCorr);

    const score = maxAbsCorr >= 0.5 ? 90 : maxAbsCorr >= 0.4 ? 75 : 60;

    const factorNames = {
      sleepQuality: 'качество сна',
      sleepHours: 'длительность сна',
      steps: 'шаги',
      protein: 'белок',
      kcal: 'калории'
    };

    const insight = keyData.correlation > 0.4
      ? `😊 ${factorNames[keyFactor]} ↑ → самочувствие ↑ (r=${keyData.correlation.toFixed(2)})`
      : `🔍 ${factorNames[keyFactor]} влияет на самочувствие (r=${keyData.correlation.toFixed(2)})`;

    return {
      pattern: PATTERNS.WELLBEING_CORRELATION,
      available: true,
      keyFactor,
      correlations: results,
      dataPoints: keyData.dataPoints,
      score,
      confidence,
      insight
    };
  }

  /**
   * B3: Hydration — достаточность гидратации (30ml/kg ВОЗ)
   */
  function analyzeHydration(days) {
    const hydrationData = [];
    const exponentialMovingAverage = piStats.exponentialMovingAverage || function (arr) { return arr; };

    for (const day of days) {
      const weight = day.weightMorning || day.weightEvening;
      const waterMl = day.waterMl;

      if (weight && waterMl != null) {
        const goal = weight * 30; // ВОЗ: 30ml/kg
        const achievement = (waterMl / goal) * 100;
        hydrationData.push({
          date: day.date,
          waterMl,
          goal,
          achievement: Math.round(achievement)
        });
      }
    }

    if (hydrationData.length < 3) {
      return {
        pattern: PATTERNS.HYDRATION,
        available: false,
        confidence: 0.2,
        insight: 'Недостаточно данных о гидратации'
      };
    }

    const avgAchievement = average(hydrationData.map(d => d.achievement));
    const avgWater = average(hydrationData.map(d => d.waterMl));
    const avgGoal = average(hydrationData.map(d => d.goal));

    // EMA тренд (если достаточно данных)
    let trend = 'stable';
    if (hydrationData.length >= 7) {
      const waterValues = hydrationData.map(d => d.waterMl);
      const emaValues = exponentialMovingAverage(waterValues, 7);
      if (emaValues.length >= 2) {
        const firstEma = emaValues[0];
        const lastEma = emaValues[emaValues.length - 1];
        const slope = lastEma - firstEma;
        if (slope > avgGoal * 0.05) trend = 'up';
        else if (slope < -avgGoal * 0.05) trend = 'down';
      }
    }

    let score, insight;
    if (avgAchievement >= 90) {
      score = 100;
      insight = `💧 Отлично! ${Math.round(avgWater)}мл (${Math.round(avgAchievement)}% нормы)`;
    } else if (avgAchievement >= 70) {
      score = 75;
      insight = `✅ Норма. ${Math.round(avgWater)}мл (${Math.round(avgAchievement)}%). Можно чуть больше`;
    } else {
      score = 50;
      insight = `⚠️ Маловато. ${Math.round(avgWater)}мл (${Math.round(avgAchievement)}%). Цель: ${Math.round(avgGoal)}мл`;
    }

    const confidence = hydrationData.length >= 7 ? 0.8 : 0.5;

    return {
      pattern: PATTERNS.HYDRATION,
      available: true,
      avgWater: Math.round(avgWater),
      avgGoal: Math.round(avgGoal),
      achievement: Math.round(avgAchievement),
      trend,
      dataPoints: hydrationData.length,
      score,
      confidence,
      insight
    };
  }

  /**
   * B4: Body Composition — WHR (waist-hip ratio) с трендом
   */
  function analyzeBodyComposition(days, profile) {
    const measurements = [];

    for (const day of days) {
      if (day.measurements && day.measurements.waist && day.measurements.hip) {
        const whr = day.measurements.waist / day.measurements.hip;
        measurements.push({
          date: day.date,
          waist: day.measurements.waist,
          hip: day.measurements.hip,
          whr: Math.round(whr * 100) / 100
        });
      }
    }

    if (measurements.length < 10) {
      return {
        pattern: PATTERNS.BODY_COMPOSITION,
        available: false,
        confidence: 0.2,
        insight: 'Недостаточно замеров обхватов (нужно 10+)'
      };
    }

    const avgWHR = average(measurements.map(m => m.whr));

    // Тренд (linear regression)
    const whrArr = measurements.map(m => m.whr);
    const trend = calculateTrend(whrArr);

    // Норма WHR (WHO): <0.85 жен, <0.9 муж
    const gender = profile?.gender || 'female';
    const threshold = gender === 'male' ? 0.9 : 0.85;

    let score, insight;
    if (avgWHR < threshold) {
      score = 90;
      const trendText = trend < -0.001 ? ' 📉 Улучшается!' : trend > 0.001 ? ' ⚠️ Растёт' : ' Стабильно';
      insight = `✅ WHR ${avgWHR.toFixed(2)} < ${threshold} (норма).${trendText}`;
    } else {
      score = 60;
      const trendText = trend < -0.001 ? ' 📉 Снижается — продолжай!' : trend > 0.001 ? ' ⚠️ Растёт' : '';
      insight = `⚠️ WHR ${avgWHR.toFixed(2)} > ${threshold}. Висцеральный жир.${trendText}`;
    }

    const confidence = measurements.length >= 30 ? 0.9 : measurements.length >= 20 ? 0.7 : 0.5;

    return {
      pattern: PATTERNS.BODY_COMPOSITION,
      available: true,
      avgWHR: Math.round(avgWHR * 100) / 100,
      threshold,
      trend: trend > 0.001 ? 'up' : trend < -0.001 ? 'down' : 'stable',
      dataPoints: measurements.length,
      score,
      confidence,
      insight
    };
  }

  /**
   * B5: Cycle Impact — влияние менструального цикла (динамическая фазировка)
   */
  function analyzeCyclePatterns(days, pIndex, profile) {
    // Guard: только для женщин с трекингом цикла
    if (profile?.gender === 'male' || !profile?.cycleTrackingEnabled) {
      return {
        pattern: PATTERNS.CYCLE_IMPACT,
        available: false,
        confidence: 0,
        insight: 'Трекинг цикла не активирован'
      };
    }

    const cycleDays = days.filter(d => d.cycleDay != null);
    if (cycleDays.length < 14) {
      return {
        pattern: PATTERNS.CYCLE_IMPACT,
        available: false,
        confidence: 0.2,
        insight: 'Недостаточно данных о цикле (нужно 14+ дней)'
      };
    }

    // Динамический детект овуляции (обычно день 14, но может быть раньше/позже)
    const cycleDayNumbers = cycleDays.map(d => d.cycleDay);
    const maxCycleDay = Math.max(...cycleDayNumbers);
    const ovulationDay = maxCycleDay >= 28 ? 14 : Math.round(maxCycleDay / 2);

    // Разделяем фазы
    const follicular = [];
    const luteal = [];

    for (const day of cycleDays) {
      const phaseData = {
        date: day.date,
        cycleDay: day.cycleDay,
        kcal: calculateDayKcal(day, pIndex),
        weight: day.weightMorning,
        mood: day.moodAvg || (day.meals ? average(day.meals.filter(m => m.mood).map(m => m.mood)) : null),
        steps: day.steps
      };

      if (day.cycleDay <= ovulationDay) {
        follicular.push(phaseData);
      } else {
        luteal.push(phaseData);
      }
    }

    if (follicular.length < 5 || luteal.length < 5) {
      return {
        pattern: PATTERNS.CYCLE_IMPACT,
        available: false,
        confidence: 0.3,
        insight: 'Недостаточно данных для сравнения фаз'
      };
    }

    // Сравниваем метрики
    const follicularKcal = average(follicular.filter(d => d.kcal > 0).map(d => d.kcal));
    const lutealKcal = average(luteal.filter(d => d.kcal > 0).map(d => d.kcal));
    const kcalDiff = lutealKcal - follicularKcal;

    const follicularMood = average(follicular.filter(d => d.mood).map(d => d.mood));
    const lutealMood = average(luteal.filter(d => d.mood).map(d => d.mood));
    const moodDiff = lutealMood - follicularMood;

    let insight;
    if (kcalDiff > 150 && moodDiff < -0.3) {
      insight = `🌙 Лютеиновая фаза: +${Math.round(kcalDiff)}ккал, настроение хуже. Это норма (прогестерон↑)`;
    } else if (kcalDiff > 150) {
      insight = `🌙 Лютеиновая фаза: +${Math.round(kcalDiff)}ккал (прогестерон↑ BMR на 5-10%)`;
    } else if (moodDiff < -0.5) {
      insight = `😔 Настроение падает во 2-й фазе. ПМС? Цикл влияет`;
    } else {
      insight = `✅ Цикл влияет умеренно. Различия в норме`;
    }

    const score = Math.abs(kcalDiff) < 200 && Math.abs(moodDiff) < 0.5 ? 90 : 70;
    const confidence = cycleDays.length >= 21 ? 0.8 : 0.6;

    return {
      pattern: PATTERNS.CYCLE_IMPACT,
      available: true,
      ovulationDay,
      follicularDays: follicular.length,
      lutealDays: luteal.length,
      kcalDiff: Math.round(kcalDiff),
      moodDiff: Math.round(moodDiff * 10) / 10,
      dataPoints: cycleDays.length,
      score,
      confidence,
      insight
    };
  }

  /**
   * B6: Weekend Effect — паттерн пт-вс vs пн-чт
   */
  function analyzeWeekendEffect(days, pIndex) {
    const weekdays = []; // пн-чт
    const weekends = []; // пт-вс

    for (const day of days) {
      if (!day.date) continue;
      const date = new Date(day.date);
      const dayOfWeek = date.getDay(); // 0=вс, 1=пн, ..., 6=сб

      const dayData = {
        date: day.date,
        kcal: calculateDayKcal(day, pIndex),
        sleep: day.sleepHours || (day.sleepStart && day.sleepEnd ? calculateSleepHours(day.sleepStart, day.sleepEnd) : null),
        steps: day.steps
      };

      // Выходные: пт=5, сб=6, вс=0
      if (dayOfWeek === 5 || dayOfWeek === 6 || dayOfWeek === 0) {
        weekends.push(dayData);
      }
      // Будни: пн=1, вт=2, ср=3, чт=4
      else if (dayOfWeek >= 1 && dayOfWeek <= 4) {
        weekdays.push(dayData);
      }
    }

    if (weekdays.length < 4 || weekends.length < 3) {
      return {
        pattern: PATTERNS.WEEKEND_EFFECT,
        available: false,
        confidence: 0.2,
        insight: 'Недостаточно данных для сравнения будней и выходных'
      };
    }

    // Считаем средние
    const weekdayKcal = average(weekdays.filter(d => d.kcal > 0).map(d => d.kcal));
    const weekendKcal = average(weekends.filter(d => d.kcal > 0).map(d => d.kcal));
    const kcalDiffPct = ((weekendKcal - weekdayKcal) / weekdayKcal) * 100;

    const weekdaySleep = average(weekdays.filter(d => d.sleep).map(d => d.sleep));
    const weekendSleep = average(weekends.filter(d => d.sleep).map(d => d.sleep));
    const sleepDiff = weekendSleep - weekdaySleep;

    const weekdaySteps = average(weekdays.filter(d => d.steps).map(d => d.steps));
    const weekendSteps = average(weekends.filter(d => d.steps).map(d => d.steps));
    const stepsDiffPct = ((weekendSteps - weekdaySteps) / weekdaySteps) * 100;

    let score, insight;
    if (kcalDiffPct > 30) {
      score = 50;
      insight = `⚠️ В выходные +${Math.round(kcalDiffPct)}% калорий! Дефицит улетает`;
    } else if (kcalDiffPct > 10 && kcalDiffPct <= 30) {
      score = 70;
      insight = `🟡 Выходные +${Math.round(kcalDiffPct)}% ккал. Норма, но следи`;
    } else {
      score = 90;
      insight = `✅ Стабильный режим! Выходные ${kcalDiffPct > 0 ? '+' : ''}${Math.round(kcalDiffPct)}% ккал`;
    }

    const confidence = weekdays.length >= 8 && weekends.length >= 6 ? 0.8 : 0.6;

    return {
      pattern: PATTERNS.WEEKEND_EFFECT,
      available: true,
      weekdayKcal: Math.round(weekdayKcal),
      weekendKcal: Math.round(weekendKcal),
      kcalDiffPct: Math.round(kcalDiffPct),
      weekdaySleep: Math.round(weekdaySleep * 10) / 10,
      weekendSleep: Math.round(weekendSleep * 10) / 10,
      sleepDiff: Math.round(sleepDiff * 10) / 10,
      weekdaySteps: Math.round(weekdaySteps),
      weekendSteps: Math.round(weekendSteps),
      stepsDiffPct: Math.round(stepsDiffPct),
      dataPoints: weekdays.length + weekends.length,
      score,
      confidence,
      insight
    };
  }

  // === C10: NOVA QUALITY SCORE ===
  /**
   * Анализ качества питания по классификации NOVA
   * @returns {Object} - { pattern, available, novaDistribution, ultraProcessedPct, livingFoodsBonus, score, insight, confidence }
   */
  function analyzeNOVAQuality(days, pIndex) {
    if (!days || days.length < CONFIG.MIN_DAYS_FOR_FULL_ANALYSIS) {
      return { pattern: PATTERNS.NOVA_QUALITY, available: false };
    }

    const novaKcal = { 1: 0, 2: 0, 3: 0, 4: 0 }; // NOVA groups 1-4
    let totalKcal = 0;
    let fermentedKcal = 0;
    let rawKcal = 0;

    for (const day of days) {
      if (!day.meals?.length) continue;

      for (const meal of day.meals) {
        for (const item of (meal.items || [])) {
          const prod = pIndex?.byId?.get?.(item?.product_id);
          if (!prod) continue;

          const itemKcal = calculateItemKcal(item, pIndex);
          totalKcal += itemKcal;

          // NOVA group classification
          const novaGroup = prod.nova_group || prod.novaGroup || 3; // default = group 3
          novaKcal[novaGroup] = (novaKcal[novaGroup] || 0) + itemKcal;

          // Quality flags (snake_case in DB, camelCase in JS)
          if (prod.is_fermented || prod.isFermented) fermentedKcal += itemKcal;
          if (prod.is_raw || prod.isRaw) rawKcal += itemKcal;
        }
      }
    }

    if (totalKcal < 100) {
      return { pattern: PATTERNS.NOVA_QUALITY, available: false };
    }

    // Calculate percentages
    const novaDistribution = {
      1: Math.round((novaKcal[1] / totalKcal) * 1000) / 10,
      2: Math.round((novaKcal[2] / totalKcal) * 1000) / 10,
      3: Math.round((novaKcal[3] / totalKcal) * 1000) / 10,
      4: Math.round((novaKcal[4] / totalKcal) * 1000) / 10
    };

    const ultraProcessedPct = novaDistribution[4];
    const livingFoodsPct = Math.round(((fermentedKcal + rawKcal) / totalKcal) * 1000) / 10;

    // Scoring: base 100 - ultra-processed penalty + living foods bonus
    let score = 100 - (ultraProcessedPct * 0.8); // -0.8 за каждый % NOVA 4
    score += Math.min(livingFoodsPct * 0.5, 10); // +0.5 за каждый % ферментированных/сырых (max +10)
    score = Math.max(0, Math.min(100, Math.round(score)));

    // Insight
    let insight = '';
    if (ultraProcessedPct > 50) {
      insight = `🔴 ${ultraProcessedPct}% калорий из ультрапереработки (NOVA-4). Высокий риск!`;
    } else if (ultraProcessedPct > 25) {
      insight = `🟠 ${ultraProcessedPct}% ультрапереработки. Снижай колбасы/снеки/сладости`;
    } else if (ultraProcessedPct > 10) {
      insight = `🟡 ${ultraProcessedPct}% ультрапереработки. В пределах нормы`;
    } else {
      insight = `✅ ${ultraProcessedPct}% ультрапереработки. Отличное качество рациона!`;
    }

    if (livingFoodsPct > 5) {
      insight += ` +${livingFoodsPct}% живых продуктов 🌱`;
    }

    const confidence = days.length >= 14 ? 0.85 : 0.70;

    return {
      pattern: PATTERNS.NOVA_QUALITY,
      available: true,
      novaDistribution,
      ultraProcessedPct,
      livingFoodsPct,
      fermentedKcal: Math.round(fermentedKcal),
      rawKcal: Math.round(rawKcal),
      totalKcal: Math.round(totalKcal),
      dataPoints: days.length,
      score,
      confidence,
      insight
    };
  }

  // === C11: TRAINING INTENSITY & RECOVERY ===
  /**
   * Анализ интенсивности тренировок и качества восстановления
   * @returns {Object} - { pattern, available, highIntensityDays, avgRecovery, overtrainingRisk, score, insight, confidence }
   */
  function analyzeTrainingRecovery(days) {
    if (!days || days.length < 5) {
      return { pattern: PATTERNS.TRAINING_RECOVERY, available: false };
    }

    const daysWithZones = days.filter(d => d.trainings?.some(t => t.z?.length >= 4));
    if (daysWithZones.length < 3) {
      return { pattern: PATTERNS.TRAINING_RECOVERY, available: false };
    }

    let highIntensityDays = 0;
    let consecutiveHighIntensity = 0;
    let maxConsecutive = 0;
    const recoveryScores = [];

    for (let i = 0; i < days.length; i++) {
      const day = days[i];
      const trainings = day.trainings || [];

      // Calculate high intensity % (Zones 4-5)
      let totalMin = 0;
      let highMin = 0;
      for (const training of trainings) {
        if (!training.z || training.z.length < 4) continue;
        const [z1, z2, z3, z4] = training.z;
        totalMin += (z1 + z2 + z3 + z4);
        highMin += z4; // Zone 4 = high intensity
      }

      const highIntensityPct = totalMin > 0 ? (highMin / totalMin) * 100 : 0;
      const isHighIntensity = highIntensityPct >= 40;

      if (isHighIntensity) {
        highIntensityDays++;
        consecutiveHighIntensity++;
        maxConsecutive = Math.max(maxConsecutive, consecutiveHighIntensity);
      } else {
        consecutiveHighIntensity = 0;
      }

      // Recovery quality = sleep + mood next day
      if (i < days.length - 1) {
        const nextDay = days[i + 1];
        const sleepHours = nextDay.sleepHours || 0;
        const mood = nextDay.mood || 3;
        const recoveryScore = (sleepHours >= 7 ? 50 : sleepHours * 7) + (mood * 10);
        recoveryScores.push(recoveryScore);
      }
    }

    const avgRecovery = recoveryScores.length > 0 ? average(recoveryScores) : 0;
    const overtrainingRisk = maxConsecutive >= 3 && avgRecovery < 60;

    // Scoring
    let score = 100;
    if (overtrainingRisk) {
      score = 40;
    } else if (maxConsecutive >= 3) {
      score = 60;
    } else if (avgRecovery < 60) {
      score = 70;
    } else {
      score = 85;
    }

    // Insight
    let insight = '';
    if (overtrainingRisk) {
      insight = `⚠️ Риск перетренированности! ${maxConsecutive} дней подряд высокой интенсивности + плохое восстановление`;
    } else if (maxConsecutive >= 3) {
      insight = `🟡 ${maxConsecutive} дней подряд тяжёлых тренировок. Добавь день отдыха`;
    } else if (avgRecovery < 60) {
      insight = `🟠 Восстановление слабое (${Math.round(avgRecovery)}/100). Больше сна!`;
    } else {
      insight = `✅ Баланс нагрузки и восстановления оптимален (${Math.round(avgRecovery)}/100)`;
    }

    const confidence = daysWithZones.length >= 5 ? 0.80 : 0.65;

    return {
      pattern: PATTERNS.TRAINING_RECOVERY,
      available: true,
      highIntensityDays,
      maxConsecutive,
      avgRecovery: Math.round(avgRecovery),
      overtrainingRisk,
      dataPoints: daysWithZones.length,
      score,
      confidence,
      insight
    };
  }

  // === C12: HYPERTROPHY & BODY COMPOSITION ===
  /**
   * Анализ изменений композиции тела (мышечная масса vs жировая)
   * @returns {Object} - { pattern, available, bicepsTrend, thighTrend, weightChange, compositionQuality, score, insight, confidence }
   */
  function analyzeHypertrophy(days, profile) {
    if (!days || days.length < 14) {
      return { pattern: PATTERNS.HYPERTROPHY, available: false };
    }

    // Collect measurements (biceps, thigh) with at least 7-day interval
    const measurements = days
      .filter(d => d.measurements?.biceps || d.measurements?.thigh)
      .map(d => ({
        date: d.date,
        biceps: d.measurements?.biceps || 0,
        thigh: d.measurements?.thigh || 0,
        weight: d.weight || profile?.weight || 0
      }));

    if (measurements.length < 5) {
      return { pattern: PATTERNS.HYPERTROPHY, available: false };
    }

    // Calculate trends
    const bicepsValues = measurements.map(m => m.biceps).filter(v => v > 0);
    const thighValues = measurements.map(m => m.thigh).filter(v => v > 0);
    const weightValues = measurements.map(m => m.weight).filter(v => v > 0);

    if (bicepsValues.length < 3 && thighValues.length < 3) {
      return { pattern: PATTERNS.HYPERTROPHY, available: false };
    }

    const bicepsTrend = bicepsValues.length >= 3 ? calculateTrend(bicepsValues) : 0;
    const thighTrend = thighValues.length >= 3 ? calculateTrend(thighValues) : 0;
    const weightTrend = weightValues.length >= 3 ? calculateTrend(weightValues) : 0;

    // Protein adequacy (>= 1.6g/kg/day)
    const proteinDays = days.filter(d => {
      const proteinGrams = d.tot?.prot || 0;
      const weight = d.weight || profile?.weight || 70;
      return (proteinGrams / weight) >= 1.6;
    });
    const proteinAdequacy = (proteinDays.length / days.length) * 100;

    // Composition quality assessment
    let compositionQuality = 'unknown';
    if (weightTrend > 0.05 && (bicepsTrend > 0.01 || thighTrend > 0.02)) {
      compositionQuality = 'muscle_gain'; // Вес ↑ + обхваты ↑ = мышцы
    } else if (weightTrend > 0.05 && bicepsTrend <= 0 && thighTrend <= 0) {
      compositionQuality = 'fat_gain'; // Вес ↑ + обхваты → = жир
    } else if (weightTrend < -0.05 && (bicepsTrend > -0.01 || thighTrend > -0.02)) {
      compositionQuality = 'fat_loss'; // Вес ↓ + обхваты держатся = жир уходит
    } else {
      compositionQuality = 'maintenance'; // Стабильно
    }

    // Scoring
    let score = 70;
    if (compositionQuality === 'muscle_gain' && proteinAdequacy >= 70) {
      score = 95;
    } else if (compositionQuality === 'fat_loss' && proteinAdequacy >= 70) {
      score = 90;
    } else if (compositionQuality === 'fat_gain') {
      score = 50;
    } else if (proteinAdequacy < 50) {
      score = 60;
    }

    // Insight
    let insight = '';
    if (compositionQuality === 'muscle_gain') {
      insight = `💪 Мышечная масса растёт! Бицепс ${bicepsTrend > 0 ? '+' : ''}${(bicepsTrend * 100).toFixed(1)}см/мес, бедро ${thighTrend > 0 ? '+' : ''}${(thighTrend * 100).toFixed(1)}см/мес`;
    } else if (compositionQuality === 'fat_loss') {
      insight = `✅ Жир уходит, мышцы держатся! Белок ${Math.round(proteinAdequacy)}% дней >= 1.6г/кг`;
    } else if (compositionQuality === 'fat_gain') {
      insight = `⚠️ Вес растёт без роста мышц. Проверь белок (${Math.round(proteinAdequacy)}% дней) и силовые`;
    } else {
      insight = `📊 Композиция стабильна. Белок ${Math.round(proteinAdequacy)}% дней >= 1.6г/кг`;
    }

    const confidence = measurements.length >= 7 ? 0.80 : 0.65;

    return {
      pattern: PATTERNS.HYPERTROPHY,
      available: true,
      bicepsTrend: Math.round(bicepsTrend * 1000) / 1000,
      thighTrend: Math.round(thighTrend * 1000) / 1000,
      weightTrend: Math.round(weightTrend * 1000) / 1000,
      compositionQuality,
      proteinAdequacy: Math.round(proteinAdequacy),
      measurements: measurements.length,
      dataPoints: days.length,
      score,
      confidence,
      insight
    };
  }

  // === C7: MICRONUTRIENT RADAR ("Hidden Hunger") ===
  /**
   * Анализ достаточности микронутриентов (железо, магний, цинк, кальций)
   * @returns {Object} - { pattern, available, deficits, avgIntake, score, insight, confidence }
   */
  function analyzeMicronutrients(days, pIndex, profile) {
    if (!days || days.length < CONFIG.MIN_DAYS_FOR_FULL_ANALYSIS) {
      return { pattern: PATTERNS.MICRONUTRIENT_RADAR, available: false };
    }

    // DRI targets (Daily Reference Intake, % of DV)
    const DRI_TARGETS = {
      iron: 100,       // 18mg для женщин, 8mg для мужчин
      magnesium: 100,  // 400mg взрослые
      zinc: 100,       // 11mg мужчины, 8mg женщины
      calcium: 100     // 1000mg взрослые
    };

    const micronutrients = { iron: [], magnesium: [], zinc: [], calcium: [] };

    for (const day of days) {
      if (!day.meals?.length) continue;

      const dayNutrients = { iron: 0, magnesium: 0, zinc: 0, calcium: 0 };

      for (const meal of day.meals) {
        for (const item of (meal.items || [])) {
          const prod = pIndex?.byId?.get?.(item?.product_id);
          if (!prod) continue;

          const grams = item.grams || 0;
          const factor = grams / 100;

          // Aggregate micronutrients (mg per 100g in DB)
          if (prod.iron) dayNutrients.iron += prod.iron * factor;
          if (prod.magnesium) dayNutrients.magnesium += prod.magnesium * factor;
          if (prod.zinc) dayNutrients.zinc += prod.zinc * factor;
          if (prod.calcium) dayNutrients.calcium += prod.calcium * factor;
        }
      }

      // Convert to % DV (assuming iron 18mg, magnesium 400mg, zinc 11mg, calcium 1000mg)
      micronutrients.iron.push((dayNutrients.iron / 18) * 100);
      micronutrients.magnesium.push((dayNutrients.magnesium / 400) * 100);
      micronutrients.zinc.push((dayNutrients.zinc / 11) * 100);
      micronutrients.calcium.push((dayNutrients.calcium / 1000) * 100);
    }

    // Calculate 7-day averages
    const avgIntake = {
      iron: average(micronutrients.iron),
      magnesium: average(micronutrients.magnesium),
      zinc: average(micronutrients.zinc),
      calcium: average(micronutrients.calcium)
    };

    // Identify deficits (< 70% DRI)
    const deficits = [];
    for (const [nutrient, avgPct] of Object.entries(avgIntake)) {
      if (avgPct < 70) {
        deficits.push({ nutrient, avgPct: Math.round(avgPct), target: DRI_TARGETS[nutrient] });
      }
    }

    // Correlate with symptoms (if available)
    const lowEnergyDays = days.filter(d => d.energy && d.energy < 3).length;
    const poorSleepDays = days.filter(d => d.sleepQuality && d.sleepQuality < 3).length;

    // Scoring
    let score = 100;
    deficits.forEach(d => {
      score -= (100 - d.avgPct) * 0.5; // Штраф за каждый недостаток
    });
    score = Math.max(0, Math.round(score));

    // Insight
    let insight = '';
    if (deficits.length === 0) {
      insight = `✅ Все 4 микроэлемента в норме (Fe ${Math.round(avgIntake.iron)}%, Mg ${Math.round(avgIntake.magnesium)}%, Zn ${Math.round(avgIntake.zinc)}%, Ca ${Math.round(avgIntake.calcium)}%)`;
    } else {
      const deficitNames = deficits.map(d => {
        const names = { iron: 'Fe', magnesium: 'Mg', zinc: 'Zn', calcium: 'Ca' };
        return `${names[d.nutrient]} ${d.avgPct}%`;
      }).join(', ');
      insight = `⚠️ Дефициты: ${deficitNames}. `;

      // Correlations
      if (deficits.some(d => d.nutrient === 'iron') && lowEnergyDays > days.length * 0.4) {
        insight += `Низкое Fe → усталость (${lowEnergyDays} дней). `;
      }
      if (deficits.some(d => d.nutrient === 'magnesium') && poorSleepDays > days.length * 0.4) {
        insight += `Низкий Mg → плохой сон (${poorSleepDays} дней). `;
      }
    }

    const confidence = days.length >= 14 ? 0.75 : 0.60;

    return {
      pattern: PATTERNS.MICRONUTRIENT_RADAR,
      available: true,
      avgIntake: {
        iron: Math.round(avgIntake.iron),
        magnesium: Math.round(avgIntake.magnesium),
        zinc: Math.round(avgIntake.zinc),
        calcium: Math.round(avgIntake.calcium)
      },
      deficits,
      lowEnergyDays,
      poorSleepDays,
      dataPoints: days.length,
      score,
      confidence,
      insight
    };
  }

  // === C9: HEART & METABOLIC HEALTH ===
  /**
   * Анализ сердечно-сосудистых рисков (Na/K соотношение, холестерин)
   * @returns {Object} - { pattern, available, naKRatio, sodiumLoad, cholesterolAvg, score, insight, confidence }
   */
  function analyzeHeartHealth(days, pIndex) {
    if (!days || days.length < CONFIG.MIN_DAYS_FOR_FULL_ANALYSIS) {
      return { pattern: PATTERNS.HEART_HEALTH, available: false };
    }

    const sodiumValues = [];
    const potassiumValues = [];
    const cholesterolValues = [];

    for (const day of days) {
      if (!day.meals?.length) continue;

      let daySodium = 0;
      let dayPotassium = 0;
      let dayCholesterol = 0;

      for (const meal of day.meals) {
        for (const item of (meal.items || [])) {
          const prod = pIndex?.byId?.get?.(item?.product_id);
          if (!prod) continue;

          const grams = item.grams || 0;
          const factor = grams / 100;

          // sodium100 in mg/100g
          if (prod.sodium100) daySodium += prod.sodium100 * factor;
          if (prod.potassium) dayPotassium += prod.potassium * factor;
          if (prod.cholesterol100 || prod.cholesterol) {
            dayCholesterol += (prod.cholesterol100 || prod.cholesterol) * factor;
          }
        }
      }

      if (daySodium > 0) sodiumValues.push(daySodium);
      if (dayPotassium > 0) potassiumValues.push(dayPotassium);
      if (dayCholesterol > 0) cholesterolValues.push(dayCholesterol);
    }

    if (sodiumValues.length < 5 || potassiumValues.length < 5) {
      return { pattern: PATTERNS.HEART_HEALTH, available: false };
    }

    const avgSodium = average(sodiumValues);
    const avgPotassium = average(potassiumValues);
    const avgCholesterol = cholesterolValues.length > 0 ? average(cholesterolValues) : 0;

    // Na:K ratio (optimal < 1.0 per WHO 2012)
    const naKRatio = avgSodium / avgPotassium;

    // Scoring
    let score = 100;
    if (avgSodium > 2300) score -= 20; // Excess sodium (>2300mg WHO limit)
    if (avgSodium > 3000) score -= 20; // Very high sodium
    if (naKRatio > 1.5) score -= 25;   // Poor Na:K ratio
    else if (naKRatio > 1.0) score -= 10;
    if (avgCholesterol > 300) score -= 15; // High cholesterol intake

    score = Math.max(0, Math.round(score));

    // Insight
    let insight = '';
    if (naKRatio < 1.0 && avgSodium < 2000) {
      insight = `✅ Отличный Na:K баланс (${naKRatio.toFixed(2)}), натрий ${Math.round(avgSodium)}мг/день`;
    } else if (naKRatio > 1.5) {
      insight = `🔴 Na:K = ${naKRatio.toFixed(2)} (норма <1.0). Риск гипертензии! Меньше соли, больше овощей/фруктов`;
    } else if (avgSodium > 2300) {
      insight = `🟠 Натрий ${Math.round(avgSodium)}мг/день (норма <2000мг). Меньше колбас/сыров/солений`;
    } else {
      insight = `🟡 Na:K = ${naKRatio.toFixed(2)} (норма <1.0), натрий ${Math.round(avgSodium)}мг. Можно лучше`;
    }

    if (avgCholesterol > 300) {
      insight += `. Холестерин ${Math.round(avgCholesterol)}мг (много яиц/мяса)`;
    }

    const confidence = days.length >= 14 ? 0.80 : 0.65;

    return {
      pattern: PATTERNS.HEART_HEALTH,
      available: true,
      avgSodium: Math.round(avgSodium),
      avgPotassium: Math.round(avgPotassium),
      avgCholesterol: Math.round(avgCholesterol),
      naKRatio: Math.round(naKRatio * 100) / 100,
      dataPoints: days.length,
      score,
      confidence,
      insight
    };
  }

  // === C8: OMEGA BALANCE & INFLAMMATION ===
  /**
   * Анализ балансаомега-3/омега-6 и воспалительной нагрузки
   * @returns {Object} - { pattern, available, omega6to3Ratio, inflammatoryLoad, score, insight, confidence }
   */
  function analyzeOmegaBalance(days, pIndex) {
    if (!days || days.length < CONFIG.MIN_DAYS_FOR_FULL_ANALYSIS) {
      return { pattern: PATTERNS.OMEGA_BALANCER, available: false };
    }

    let totalOmega3 = 0;
    let totalOmega6 = 0;
    let inflammatoryLoad = 0; // (Sugar + Trans) vs (Omega3 + Fiber)

    for (const day of days) {
      if (!day.meals?.length) continue;

      for (const meal of day.meals) {
        for (const item of (meal.items || [])) {
          const prod = pIndex?.byId?.get?.(item?.product_id);
          if (!prod) continue;

          const grams = item.grams || 0;
          const factor = grams / 100;

          // Omega fatty acids (g/100g in DB)
          if (prod.omega3_100 || prod.omega3) totalOmega3 += (prod.omega3_100 || prod.omega3) * factor;
          if (prod.omega6_100 || prod.omega6) totalOmega6 += (prod.omega6_100 || prod.omega6) * factor;

          // Inflammatory load components
          const sugar = (prod.simple100 || 0) * factor;
          const trans = (prod.trans100 || 0) * factor;
          const fiber = (prod.fiber100 || 0) * factor;
          inflammatoryLoad += (sugar * 0.5 + trans * 2) - (fiber * 0.3 + (prod.omega3_100 || 0) * factor * 1.5);
        }
      }
    }

    if (totalOmega3 < 0.1 || totalOmega6 < 0.1) {
      return { pattern: PATTERNS.OMEGA_BALANCER, available: false };
    }

    const omega6to3Ratio = totalOmega6 / totalOmega3;

    // Scoring (optimal ratio < 4:1)
    let score = 100;
    if (omega6to3Ratio > 10) score = 40;
    else if (omega6to3Ratio > 6) score = 60;
    else if (omega6to3Ratio > 4) score = 75;
    else score = 95;

    if (inflammatoryLoad > 50) score -= 10;
    score = Math.max(0, Math.round(score));

    // Insight
    let insight = '';
    if (omega6to3Ratio < 4) {
      insight = `✅ Отличный баланс омега-6:3 = ${omega6to3Ratio.toFixed(1)} (оптимум <4:1)`;
    } else if (omega6to3Ratio < 6) {
      insight = `🟡 Омега-6:3 = ${omega6to3Ratio.toFixed(1)} (норма <4:1). Добавь рыбу/льняное масло`;
    } else {
      insight = `🔴 Омега-6:3 = ${omega6to3Ratio.toFixed(1)} (риск воспаления!). Меньше подсолнечного масла, больше рыбы`;
    }

    if (inflammatoryLoad > 50) {
      insight += `. Высокая воспалительная нагрузка (${Math.round(inflammatoryLoad)})`;
    }

    const confidence = days.length >= 14 ? 0.75 : 0.60;

    return {
      pattern: PATTERNS.OMEGA_BALANCER,
      available: true,
      totalOmega3: Math.round(totalOmega3 * 10) / 10,
      totalOmega6: Math.round(totalOmega6 * 10) / 10,
      omega6to3Ratio: Math.round(omega6to3Ratio * 10) / 10,
      inflammatoryLoad: Math.round(inflammatoryLoad),
      dataPoints: days.length,
      score,
      confidence,
      insight
    };
  }

  // === C13: VITAMIN DEFENSE RADAR (v6.0, Phase 1, 12.02.2026) ===
  // Полный радар 11 витаминов — детекция дефицитов, группировка по функциям
  // PMID: 24566440 (IOM DRI 2011), 26828517 (Kennedy 2016 — micronutrient impact on cognition)

  function analyzeVitaminDefense(days, profile) {
    const piStats = HEYS.InsightsPI?.stats || {};
    const piConst = HEYS.InsightsPI?.constants || {};
    const UNIT_REGISTRY = piConst.UNIT_REGISTRY || {};

    // Safety: minDays = 7, minProducts avg >= 3
    if (!piStats.checkMinN || !piStats.checkMinN(days, 7)) {
      return { pattern: 'vitamin_defense', available: false, reason: 'min-data', daysAnalyzed: days.length };
    }

    const validDays = days.filter(d => d && d.meals && d.meals.length > 0);
    const avgProductsPerDay = validDays.reduce((sum, d) => {
      const products = d.meals.reduce((pSum, m) => pSum + (m.items?.length || 0), 0);
      return sum + products;
    }, 0) / validDays.length;

    if (avgProductsPerDay < 3) {
      return { pattern: 'vitamin_defense', available: false, reason: 'min-products', avgProducts: Math.round(avgProductsPerDay * 10) / 10 };
    }

    // 11 vitamins with DRI values (gender-adjusted where needed)
    const gender = profile?.gender || 'male';
    const DRI = {
      vitamin_a: gender === 'female' ? 700 : 900,  // mcg RAE
      vitamin_c: gender === 'female' ? 75 : 90,    // mg
      vitamin_d: 15,                                // mcg (same for both)
      vitamin_e: 15,                                // mg
      vitamin_k: gender === 'female' ? 90 : 120,   // mcg
      vitamin_b1: 1.2,                              // mg
      vitamin_b2: 1.3,                              // mg
      vitamin_b3: 16,                               // mg NE
      vitamin_b6: 1.3,                              // mg
      vitamin_b9: 400,                              // mcg DFE (folate)
      vitamin_b12: 2.4                              // mcg
    };

    // Calculate daily intake for each vitamin
    const vitaminData = {};
    const vitaminKeys = Object.keys(DRI);

    vitaminKeys.forEach(vitKey => {
      let totalIntake = 0;
      let daysWithData = 0;

      validDays.forEach(day => {
        let dayIntake = 0;
        (day.meals || []).forEach(meal => {
          (meal.items || []).forEach(item => {
            const prod = getProductFromItem(item, day.pIndex);
            if (!prod) return;
            const vitValue = prod[vitKey];
            if (vitValue != null && vitValue > 0) {
              const grams = Number(item.grams) || 0;
              dayIntake += vitValue * grams / 100;
            }
          });
        });

        if (dayIntake > 0) {
          totalIntake += dayIntake;
          daysWithData++;
        }
      });

      const avgDailyIntake = daysWithData > 0 ? totalIntake / daysWithData : 0;
      const pctDV = (avgDailyIntake / DRI[vitKey]) * 100;
      const deficit = pctDV < 70;

      vitaminData[vitKey] = {
        intake: Math.round(avgDailyIntake * 10) / 10,
        dri: DRI[vitKey],
        pctDV: Math.round(pctDV),
        deficit: deficit,
        daysWithData: daysWithData,
        unit: UNIT_REGISTRY[vitKey]?.unit || 'mg'
      };
    });

    // Cluster analysis (4 functional groups)
    const clusters = {
      antioxidant: ['vitamin_a', 'vitamin_c', 'vitamin_e'],
      bone: ['vitamin_d', 'vitamin_k'],
      energy: ['vitamin_b1', 'vitamin_b2', 'vitamin_b3', 'vitamin_b6'],
      blood: ['vitamin_b9', 'vitamin_b12']
    };

    const clusterScores = {};
    Object.keys(clusters).forEach(clusterKey => {
      const vitKeys = clusters[clusterKey];
      const avgPct = vitKeys.reduce((sum, vk) => sum + vitaminData[vk].pctDV, 0) / vitKeys.length;
      const risk = avgPct < 70;
      clusterScores[clusterKey] = {
        avgPct: Math.round(avgPct),
        risk: risk,
        vitamins: vitKeys
      };
    });

    // Count deficits
    const deficitList = vitaminKeys.filter(vk => vitaminData[vk].deficit);
    const countDeficits = deficitList.length;

    // Score: 100 - (countDeficits × 8), clamp 0-100
    let score = 100 - (countDeficits * 8);
    score = Math.max(0, Math.min(100, score));

    // Confidence with small sample penalty
    let baseConfidence = validDays.length >= 14 ? 0.80 : 0.70;
    const confidence = piStats.applySmallSamplePenalty
      ? piStats.applySmallSamplePenalty(baseConfidence, validDays.length, 10)
      : baseConfidence;

    // Insight generation
    let insight = `Vitamin Defense Radar: ${countDeficits} из 11 витаминов ниже 70% DRI`;

    if (countDeficits === 0) {
      insight = '🌟 Отлично! Все 11 витаминов в норме (≥70% DRI)';
    } else if (countDeficits <= 2) {
      insight = `⚠️ Легкий дефицит: ${deficitList.join(', ')} < 70% DRI`;
    } else if (countDeficits >= 5) {
      insight = `🚨 Множественный дефицит: ${countDeficits} витаминов требуют внимания`;
    }

    // Add cluster risks
    const riskyСlusters = Object.keys(clusterScores).filter(c => clusterScores[c].risk);
    if (riskyСlusters.length > 0) {
      const clusterNames = {
        antioxidant: 'антиоксиданты',
        bone: 'костная система',
        energy: 'энергообмен',
        blood: 'кроветворение'
      };
      const riskText = riskyСlusters.map(c => clusterNames[c]).join(', ');
      insight += `. Риск: ${riskText}`;
    }

    return {
      pattern: 'vitamin_defense',
      available: true,
      vitaminData: vitaminData,
      clusterScores: clusterScores,
      deficitList: deficitList,
      countDeficits: countDeficits,
      daysAnalyzed: validDays.length,
      avgProductsPerDay: Math.round(avgProductsPerDay * 10) / 10,
      score: score,
      confidence: Math.round(confidence * 100) / 100,
      insight: insight
    };
  }

  /**
   * C22: B-Complex Energy & Anemia Risk
   * Анализирует 6 витаминов группы B (energy quartet + blood pair) + железо для оценки
   * энергетического метаболизма и риска анемии (iron-deficiency, pernicious, megaloblastic).
   * Кластеры: energyBscore (B1/B2/B3/B6) и bloodBscore (B9/B12).
   * Gender-adjusted: железо 18mg (female) vs 8mg (male).
   * @param {Array} days — массив дней с meals
   * @param {Object} profile — {gender}
   * @returns {Object} — {pattern, available, energyBscore, bloodBscore, anemiaRisk, score, confidence, insight}
   */
  function analyzeBComplexAnemia(days, profile) {
    const pattern = 'b_complex_anemia';
    const minDays = 7;

    // Safety gate: минимум 7 дней
    const nCheck = piStats.checkMinN(days, minDays);
    if (!nCheck.ok) {
      return {
        pattern,
        available: false,
        reason: 'min_days_required',
        minDaysRequired: minDays,
        daysProvided: days.length
      };
    }

    // Gender-adjusted DRI для железа (IOM 2011)
    const isFemale = profile?.gender === 'female' || profile?.gender === 'Женской';
    const ironDRI = isFemale ? 18 : 8;  // mg

    // DRI values для витаминов B (IOM 2011)
    const DRI = {
      vitamin_b1: 1.2,     // mg thiamine
      vitamin_b2: 1.3,     // mg riboflavin
      vitamin_b3: 16,      // mg niacin (NE)
      vitamin_b6: 1.3,     // mg pyridoxine
      vitamin_b9: 400,     // mcg folate (DFE)
      vitamin_b12: 2.4,    // mcg cobalamin
      iron: ironDRI        // mg (gender-adjusted)
    };

    // Nutrients для анализа
    const bVitamins = ['vitamin_b1', 'vitamin_b2', 'vitamin_b3', 'vitamin_b6', 'vitamin_b9', 'vitamin_b12'];

    // Расчёт среднего потребления за период
    const nutrientData = {};
    [...bVitamins, 'iron'].forEach(nutrient => {
      let totalIntake = 0;
      let daysWithData = 0;

      days.forEach(day => {
        const meals = day.meals || [];
        let dayIntake = 0;

        meals.forEach(item => {
          const product = getProductFromItem(item, productIndex);
          if (!product) return;

          // Пробуем найти значение нутриента
          const value = product[nutrient] || product[`${nutrient}_100`] || 0;
          const grams = item.grams || item.amount || 0;
          dayIntake += (value * grams) / 100;
        });

        if (dayIntake > 0) {
          totalIntake += dayIntake;
          daysWithData++;
        }
      });

      const avgIntake = daysWithData > 0 ? totalIntake / days.length : 0;
      const dri = DRI[nutrient];
      const pctDV = dri > 0 ? (avgIntake / dri) * 100 : 0;

      nutrientData[nutrient] = {
        intake: Math.round(avgIntake * 10) / 10,
        dri,
        pctDV: Math.round(pctDV),
        deficit: pctDV < 70
      };
    });

    // Кластеры: Energy quartet (B1, B2, B3, B6) и Blood pair (B9, B12)
    const energyQuartet = ['vitamin_b1', 'vitamin_b2', 'vitamin_b3', 'vitamin_b6'];
    const bloodPair = ['vitamin_b9', 'vitamin_b12'];

    const energyBscore = Math.round(
      energyQuartet.reduce((sum, v) => sum + (nutrientData[v]?.pctDV || 0), 0) / energyQuartet.length
    );

    const bloodBscore = Math.round(
      bloodPair.reduce((sum, v) => sum + (nutrientData[v]?.pctDV || 0), 0) / bloodPair.length
    );

    // Anemia Risk Assessment
    let anemiaRisk = 0;
    const ironDeficit = nutrientData.iron?.pctDV < 70;
    const b12Deficit = nutrientData.vitamin_b12?.pctDV < 70;
    const folateDeficit = nutrientData.vitamin_b9?.pctDV < 70;

    if (ironDeficit) anemiaRisk += 30;    // iron-deficiency anemia
    if (b12Deficit) anemiaRisk += 30;     // pernicious anemia
    if (folateDeficit) anemiaRisk += 25;  // megaloblastic anemia

    // Если все три дефицита одновременно — compound risk
    if (ironDeficit && b12Deficit && folateDeficit) {
      anemiaRisk = 100;
    }

    // Score calculation: energyBscore × 0.4 + bloodBscore × 0.3 + (100 - anemiaRisk) × 0.3
    const score = Math.round(
      energyBscore * 0.4 + bloodBscore * 0.3 + (100 - anemiaRisk) * 0.3
    );

    // Confidence с small sample penalty (Phase 0)
    const baseConfidence = score >= 70 ? 0.75 : 0.65;
    const confidence = piStats.applySmallSamplePenalty(baseConfidence, days.length, minDays);

    // Insight generation (3-tier escalation)
    let insight = '';
    const deficits = [];
    if (ironDeficit) deficits.push('железо');
    if (b12Deficit) deficits.push('B12');
    if (folateDeficit) deficits.push('фолат (B9)');

    bVitamins.filter(v => v !== 'vitamin_b9' && v !== 'vitamin_b12' && nutrientData[v].deficit)
      .forEach(v => {
        const vNames = {
          vitamin_b1: 'B1 (тиамин)',
          vitamin_b2: 'B2 (рибофлавин)',
          vitamin_b3: 'B3 (ниацин)',
          vitamin_b6: 'B6 (пиридоксин)'
        };
        deficits.push(vNames[v]);
      });

    if (anemiaRisk === 0 && energyBscore >= 80 && bloodBscore >= 80) {
      insight = '✅ Отлично! B-комплекс и железо в норме (≥70% DRI). Энергообмен и кроветворение оптимальны.';
    } else if (anemiaRisk >= 70) {
      insight = `❌ ВЫСОКИЙ РИСК АНЕМИИ (${anemiaRisk})! Дефициты: ${deficits.join(', ')}. Срочная коррекция рациона или консультация врача.`;
    } else if (anemiaRisk >= 30) {
      insight = `⚠️ Умеренный риск анемии (${anemiaRisk}). Дефициты: ${deficits.join(', ')}. Рекомендуется коррекция рациона.`;
    } else if (energyBscore < 60) {
      insight = `⚠️ Низкий энергетический B-комплекс (${energyBscore}%). Возможна связь с усталостью. Добавьте цельнозерновые, бобовые, мясо.`;
    } else {
      insight = `✅ B-комплекс удовлетворителен (энергия: ${energyBscore}%, кровь: ${bloodBscore}%). Риск анемии низкий.`;
    }

    // Дополнительный флаг для vegetarian B12 risk
    let vegetarianRisk = false;
    if (b12Deficit) {
      // Проверяем наличие источников B12 (животные продукты)
      let animalProductDays = 0;
      days.forEach(day => {
        const meals = day.meals || [];
        const hasB12Source = meals.some(item => {
          const product = getProductFromItem(item, productIndex);
          if (!product) return false;
          const b12 = product.vitamin_b12 || product.vitamin_b12_100 || 0;
          return b12 > 0;
        });
        if (hasB12Source) animalProductDays++;
      });

      const avgB12SourceDays = animalProductDays / days.length;
      if (avgB12SourceDays < 0.3) {  // <30% дней = low animal products
        vegetarianRisk = true;
        insight += ' 🌱 Растительный рацион? B12 критичен — рассмотрите добавки.';
      }
    }

    return {
      pattern,
      available: true,
      nutrientData,
      energyBscore,
      bloodBscore,
      anemiaRisk,
      deficits: deficits.length > 0 ? deficits : null,
      vegetarianRisk,
      daysAnalyzed: days.length,
      genderAdjusted: isFemale ? 'female (Fe DRI 18mg)' : 'male (Fe DRI 8mg)',
      score,
      confidence: Math.round(confidence * 100) / 100,
      insight
    };
  }

  /**
   * C14: Glycemic Load Optimizer
   * Отслеживает гликемическую нагрузку per meal и per day (GI × количество углеводов).
   * MinDays: 5, MinMeals: 3/day average
   * @param {Array} days
   * @param {Object} pIndex
   * @returns {Object}
   */
  function analyzeGlycemicLoad(days, pIndex) {
    const pattern = PATTERNS.GLYCEMIC_LOAD || 'glycemic_load';
    const minDays = 5;
    const minMealsPerDay = 3;

    if (!Array.isArray(days) || days.length < minDays) {
      return {
        pattern,
        available: false,
        reason: 'min_days_required',
        minDaysRequired: minDays,
        daysProvided: Array.isArray(days) ? days.length : 0
      };
    }

    const validDays = days.filter(d => Array.isArray(d?.meals) && d.meals.length > 0);
    if (validDays.length === 0) {
      return { pattern, available: false, reason: 'no_meals_data' };
    }

    const totalMeals = validDays.reduce((sum, d) => sum + d.meals.length, 0);
    const avgMealsPerDay = totalMeals / validDays.length;
    if (avgMealsPerDay < minMealsPerDay) {
      return {
        pattern,
        available: false,
        reason: 'min_meals_required',
        minMealsPerDay,
        avgMealsPerDay: Math.round(avgMealsPerDay * 10) / 10
      };
    }

    const dailyGLValues = [];
    const eveningRatios = [];
    let highMealGLCount = 0;
    let mediumMealGLCount = 0;
    let lowMealGLCount = 0;

    for (const day of validDays) {
      let dailyGL = 0;
      let eveningGL = 0;

      for (const meal of day.meals) {
        let mealGL = 0;

        for (const item of (meal.items || [])) {
          const prod = pIndex?.byId?.get?.(item?.product_id);
          if (!prod) continue;

          const gi = Number(prod.gi) || 0;
          const carbs = (Number(prod.simple100) || 0) + (Number(prod.complex100) || 0);
          const grams = Number(item.grams) || 0;

          if (gi <= 0 || carbs <= 0 || grams <= 0) continue;
          mealGL += (gi * carbs * grams) / 10000;
        }

        if (mealGL > 20) highMealGLCount++;
        else if (mealGL >= 10) mediumMealGLCount++;
        else lowMealGLCount++;

        dailyGL += mealGL;

        const hour = parseInt(String(meal.time || '00:00').split(':')[0], 10);
        if (!Number.isNaN(hour) && hour >= 18) {
          eveningGL += mealGL;
        }
      }

      if (dailyGL > 0) {
        dailyGLValues.push(dailyGL);
        eveningRatios.push(eveningGL / dailyGL);
      }
    }

    if (dailyGLValues.length === 0) {
      return { pattern, available: false, reason: 'insufficient_gl_data' };
    }

    const avgDailyGL = average(dailyGLValues);
    const avgEveningRatio = average(eveningRatios);

    const eveningPenalty = avgEveningRatio > 0.5 ? 15 : 0;
    const glPenalty = Math.max(0, avgDailyGL - 80) * 0.5;
    const score = Math.max(0, Math.min(100, Math.round(100 - glPenalty - eveningPenalty)));

    let dailyClass = 'low';
    if (avgDailyGL > 120) dailyClass = 'high';
    else if (avgDailyGL >= 80) dailyClass = 'medium';

    let insight = '';
    if (dailyClass === 'low') {
      insight = `✅ Низкая GL нагрузка: ${Math.round(avgDailyGL)} (цель <80).`;
    } else if (dailyClass === 'medium') {
      insight = `🟡 Умеренная GL нагрузка: ${Math.round(avgDailyGL)}. Контролируй порции быстрых углеводов.`;
    } else {
      insight = `🔴 Высокая GL нагрузка: ${Math.round(avgDailyGL)} (>120). Риск сахарных качелей.`;
    }

    if (avgEveningRatio > 0.5) {
      insight += ` Вечерний GL ${(avgEveningRatio * 100).toFixed(0)}% (штраф -15).`;
    }

    const baseConfidence = days.length >= 10 ? 0.8 : 0.7;
    const confidence = piStats.applySmallSamplePenalty
      ? piStats.applySmallSamplePenalty(baseConfidence, days.length, minDays)
      : baseConfidence;

    return {
      pattern,
      available: true,
      avgDailyGL: Math.round(avgDailyGL * 10) / 10,
      avgEveningRatio: Math.round(avgEveningRatio * 100) / 100,
      mealGLDistribution: {
        low: lowMealGLCount,
        medium: mediumMealGLCount,
        high: highMealGLCount
      },
      dailyClass,
      daysAnalyzed: validDays.length,
      avgMealsPerDay: Math.round(avgMealsPerDay * 10) / 10,
      score,
      confidence: Math.round(confidence * 100) / 100,
      insight
    };
  }

  /**
   * C15: Protein Distribution (Leucine Threshold)
   * Оценивает распределение белка по приёмам: цель 20-40г/приём.
   * MinDays: 7, MinMeals: 2/day average
   * @param {Array} days
   * @param {Object} profile
   * @param {Object} pIndex
   * @returns {Object}
   */
  function analyzeProteinDistribution(days, profile, pIndex) {
    const pattern = PATTERNS.PROTEIN_DISTRIBUTION || 'protein_distribution';
    const minDays = 7;
    const minMealsPerDay = 2;

    if (!Array.isArray(days) || days.length < minDays) {
      return {
        pattern,
        available: false,
        reason: 'min_days_required',
        minDaysRequired: minDays,
        daysProvided: Array.isArray(days) ? days.length : 0
      };
    }

    const validDays = days.filter(d => Array.isArray(d?.meals) && d.meals.length > 0);
    if (validDays.length === 0) {
      return { pattern, available: false, reason: 'no_meals_data' };
    }

    const totalMeals = validDays.reduce((sum, d) => sum + d.meals.length, 0);
    const avgMealsPerDay = totalMeals / validDays.length;
    if (avgMealsPerDay < minMealsPerDay) {
      return {
        pattern,
        available: false,
        reason: 'min_meals_required',
        minMealsPerDay,
        avgMealsPerDay: Math.round(avgMealsPerDay * 10) / 10
      };
    }

    const profileWeight = Number(profile?.weight) || 70;
    const targetProtein = profileWeight * 1.6;

    let optimalMeals = 0;
    let subthresholdMeals = 0;
    let belowOptimalMeals = 0;
    let excessMeals = 0;
    const dayTotals = [];
    const spreads = [];

    for (const day of validDays) {
      let dayProtein = 0;
      const mealProteins = [];

      for (const meal of day.meals) {
        let mealProtein = 0;

        for (const item of (meal.items || [])) {
          const prod = pIndex?.byId?.get?.(item?.product_id);
          if (!prod) continue;
          const grams = Number(item.grams) || 0;
          if (grams <= 0) continue;
          mealProtein += (Number(prod.protein100) || 0) * grams / 100;
        }

        mealProteins.push(mealProtein);
        dayProtein += mealProtein;

        if (mealProtein < 10) subthresholdMeals++;
        else if (mealProtein > 50) excessMeals++;
        else if (mealProtein < 20 || mealProtein > 40) belowOptimalMeals++;
        else optimalMeals++;
      }

      dayTotals.push(dayProtein);
      if (mealProteins.length >= 2) {
        spreads.push(Math.max(...mealProteins) - Math.min(...mealProteins));
      }
    }

    const distributionScore = totalMeals > 0 ? (optimalMeals / totalMeals) * 100 : 0;
    const avgSpread = spreads.length > 0 ? average(spreads) : 0;
    const evenBonus = avgSpread > 0 && avgSpread < 20 ? 10 : 0;
    const avgTotalProtein = dayTotals.length > 0 ? average(dayTotals) : 0;
    const targetProteinPct = Math.min(100, (avgTotalProtein / targetProtein) * 100);

    const score = Math.max(
      0,
      Math.min(
        100,
        Math.round(distributionScore * 0.7 + targetProteinPct * 0.3 + evenBonus)
      )
    );

    let insight = `Оптимальных белковых приёмов: ${optimalMeals}/${totalMeals}.`;
    if (distributionScore >= 60) {
      insight = `✅ Хорошее распределение белка: ${Math.round(distributionScore)}% приёмов в зоне 20-40г.`;
    } else if (distributionScore >= 35) {
      insight = `🟡 Частично оптимально: ${Math.round(distributionScore)}% приёмов попадают в 20-40г.`;
    } else {
      insight = `🔴 Слабое распределение белка: только ${Math.round(distributionScore)}% приёмов в целевой зоне.`;
    }

    if (evenBonus > 0) insight += ' Равномерное распределение по приёмам (+10).';
    if (targetProteinPct < 80) insight += ` Суточный белок ${Math.round(targetProteinPct)}% от цели (${Math.round(targetProtein)}г).`;

    const baseConfidence = days.length >= 14 ? 0.8 : 0.7;
    const confidence = piStats.applySmallSamplePenalty
      ? piStats.applySmallSamplePenalty(baseConfidence, days.length, minDays)
      : baseConfidence;

    return {
      pattern,
      available: true,
      optimalMeals,
      subthresholdMeals,
      belowOptimalMeals,
      excessMeals,
      totalMeals,
      distributionScore: Math.round(distributionScore),
      avgDailyProtein: Math.round(avgTotalProtein * 10) / 10,
      targetProtein: Math.round(targetProtein),
      targetProteinPct: Math.round(targetProteinPct),
      avgProteinSpread: Math.round(avgSpread * 10) / 10,
      evenBonus,
      daysAnalyzed: validDays.length,
      avgMealsPerDay: Math.round(avgMealsPerDay * 10) / 10,
      score,
      confidence: Math.round(confidence * 100) / 100,
      insight
    };
  }

  /**
   * C16: Antioxidant Defense Score
   * Индекс антиоксидантной защиты: A/C/E + Se + Zn с учётом тренировочной нагрузки.
   * @param {Array} days
   * @param {Object} pIndex
   * @returns {Object}
   */
  function analyzeAntioxidantDefense(days, pIndex) {
    const pattern = PATTERNS.ANTIOXIDANT_DEFENSE || 'antioxidant_defense';
    const minDays = 7;

    if (!Array.isArray(days) || days.length < minDays) {
      return {
        pattern,
        available: false,
        reason: 'min_days_required',
        minDaysRequired: minDays,
        daysProvided: Array.isArray(days) ? days.length : 0
      };
    }

    const dailyIndices = [];
    const trainingDemandPoints = [];
    let highDemandDays = 0;
    let moderateDemandDays = 0;

    for (const day of days) {
      let vitA = 0;
      let vitC = 0;
      let vitE = 0;
      let selenium = 0;
      let zinc = 0;
      let nova4Carbs = 0;

      for (const meal of (day.meals || [])) {
        for (const item of (meal.items || [])) {
          const prod = pIndex?.byId?.get?.(item?.product_id);
          if (!prod) continue;

          const grams = Number(item.grams) || 0;
          if (grams <= 0) continue;
          const factor = grams / 100;

          vitA += (Number(prod.vitamin_a) || 0) * factor;
          vitC += (Number(prod.vitamin_c) || 0) * factor;
          vitE += (Number(prod.vitamin_e) || 0) * factor;
          selenium += (Number(prod.selenium) || 0) * factor;
          zinc += (Number(prod.zinc) || 0) * factor;

          if (Number(prod.nova_group) === 4) {
            nova4Carbs += ((Number(prod.simple100) || 0) + (Number(prod.complex100) || 0)) * factor;
          }
        }
      }

      const aScore = Math.min(1, vitA / 900) * 20;
      const cScore = Math.min(1, vitC / 90) * 30;
      const eScore = Math.min(1, vitE / 15) * 20;
      const seScore = Math.min(1, selenium / 55) * 15;
      const znScore = Math.min(1, zinc / 11) * 15;
      const antioxidantIndex = aScore + cScore + eScore + seScore + znScore;

      const trainings = Array.isArray(day.trainings) ? day.trainings : [];
      const highIntensityMinutes = trainings.reduce((sum, t) => {
        const z = t?.z || [];
        const z4 = Number(z[3]) || 0;
        const z5 = Number(z[4]) || 0;
        return sum + z4 + z5;
      }, 0);

      let demand = 'low';
      if (highIntensityMinutes > 20) {
        demand = 'high';
        highDemandDays++;
      } else if (trainings.length > 0) {
        demand = 'moderate';
        moderateDemandDays++;
      }

      const demandMultiplier = demand === 'high' ? 1.3 : (demand === 'moderate' ? 1.15 : 1.0);

      dailyIndices.push({
        antioxidantIndex,
        demand,
        demandMultiplier,
        vitCPct: (vitC / (90 * demandMultiplier)) * 100,
        vitEPct: (vitE / (15 * demandMultiplier)) * 100,
        nova4High: nova4Carbs > 30
      });

      trainingDemandPoints.push(demandMultiplier);
    }

    if (dailyIndices.length === 0) {
      return { pattern, available: false, reason: 'insufficient_data' };
    }

    const avgAntioxidantIndex = average(dailyIndices.map(d => d.antioxidantIndex));
    const dominantDemand = highDemandDays > 0 ? 'high' : (moderateDemandDays > 0 ? 'moderate' : 'low');
    const adjustedScore = Math.round(
      avgAntioxidantIndex * (dominantDemand === 'high' ? 0.85 : 1.0)
    );

    const defenseGapDays = dailyIndices.filter(d => d.antioxidantIndex < 60).length;
    const vitCRiskDays = dailyIndices.filter(d => d.demand === 'high' && d.vitCPct < 50).length;
    const doubleStressDays = dailyIndices.filter(d => d.vitEPct < 50 && d.nova4High).length;

    let insight = '';
    if (adjustedScore >= 80) {
      insight = `✅ Хорошая антиоксидантная защита (${adjustedScore}/100).`;
    } else if (adjustedScore >= 60) {
      insight = `🟡 Умеренная антиоксидантная защита (${adjustedScore}/100).`;
    } else {
      insight = `🔴 Низкая антиоксидантная защита (${adjustedScore}/100), требуется коррекция рациона.`;
    }

    if (defenseGapDays > 0) insight += ` Defense gap: ${defenseGapDays} дн.`;
    if (vitCRiskDays > 0) insight += ` VitC risk при high-load: ${vitCRiskDays} дн.`;
    if (doubleStressDays > 0) insight += ` Double oxidative stress: ${doubleStressDays} дн.`;

    const baseConfidence = days.length >= 14 ? 0.8 : 0.7;
    const confidence = piStats.applySmallSamplePenalty
      ? piStats.applySmallSamplePenalty(baseConfidence, days.length, minDays)
      : baseConfidence;

    return {
      pattern,
      available: true,
      antioxidantIndex: Math.round(avgAntioxidantIndex),
      dominantDemand,
      highDemandDays,
      moderateDemandDays,
      defenseGapDays,
      vitCRiskDays,
      doubleStressDays,
      score: Math.max(0, Math.min(100, adjustedScore)),
      confidence: Math.round(confidence * 100) / 100,
      insight
    };
  }

  /**
   * C18: Added Sugar & Dependency Patterns
   * Tier-aware оценка добавленного сахара (A/B/C) + dependency flags.
   * @param {Array} days
   * @param {Object} pIndex
   * @returns {Object}
   */
  function analyzeAddedSugarDependency(days, pIndex) {
    const pattern = PATTERNS.ADDED_SUGAR_DEPENDENCY || 'added_sugar_dependency';
    const minDays = 7;

    if (!Array.isArray(days) || days.length < minDays) {
      return {
        pattern,
        available: false,
        reason: 'min_days_required',
        minDaysRequired: minDays,
        daysProvided: Array.isArray(days) ? days.length : 0
      };
    }

    const dailySugar = [];
    const dailyConfidence = [];
    const dailySugarPctOfCarbs = [];
    let sugarTrapDays = 0;

    for (const day of days) {
      let sugar = 0;
      let confWeighted = 0;
      let carbTotal = 0;
      let nova4Carbs = 0;

      for (const meal of (day.meals || [])) {
        for (const item of (meal.items || [])) {
          const prod = pIndex?.byId?.get?.(item?.product_id);
          if (!prod) continue;

          const grams = Number(item.grams) || 0;
          if (grams <= 0) continue;
          const factor = grams / 100;

          const simple = (Number(prod.simple100) || 0) * factor;
          const complex = (Number(prod.complex100) || 0) * factor;
          const carbs = simple + complex;
          carbTotal += carbs;

          let addedSugar = 0;
          let conf = 0;

          const sugar100 = Number(prod.sugar100);
          if (Number.isFinite(sugar100) && sugar100 > 0) {
            // Tier A
            addedSugar = sugar100 * factor;
            conf = 1.0;
          } else if (Number(prod.nova_group) === 4 && simple > 0) {
            // Tier B
            addedSugar = simple * 0.70;
            conf = 0.70;
          } else if (simple > 0) {
            // Tier C
            addedSugar = simple * 0.30;
            conf = 0.50;
          }

          sugar += addedSugar;
          confWeighted += addedSugar * conf;

          if (Number(prod.nova_group) === 4) {
            nova4Carbs += carbs;
          }
        }
      }

      const dayConf = sugar > 0 ? confWeighted / sugar : 0;
      const sugarPctOfCarbs = carbTotal > 0 ? (sugar / carbTotal) * 100 : 0;

      if (sugar > 25 && carbTotal > 0 && (nova4Carbs / carbTotal) > 0.3) {
        sugarTrapDays++;
      }

      dailySugar.push(sugar);
      dailyConfidence.push(dayConf);
      dailySugarPctOfCarbs.push(sugarPctOfCarbs);
    }

    const avgDailySugar = average(dailySugar);
    const avgConfidence = average(dailyConfidence);
    const avgSugarPctOfCarbs = average(dailySugarPctOfCarbs);

    let maxStreak = 0;
    let streak = 0;
    for (const s of dailySugar) {
      if (s > 25) {
        streak++;
        maxStreak = Math.max(maxStreak, streak);
      } else {
        streak = 0;
      }
    }

    const dependencyPenalty = maxStreak >= 5 ? 20 : (maxStreak >= 3 ? 10 : 0);
    const sugarPenalty = Math.max(0, avgDailySugar - 25) * 1.5;
    const sugarDominantPenalty = avgSugarPctOfCarbs > 40 ? 10 : 0;
    const moodSwingPenalty = 0;

    const rawScore = Math.max(0, 100 - sugarPenalty - dependencyPenalty - sugarDominantPenalty - moodSwingPenalty);
    const score = Math.round(rawScore * (avgConfidence > 0 ? avgConfidence : 0.5));

    let whoClass = 'safe';
    if (avgDailySugar > 50) whoClass = 'excess';
    else if (avgDailySugar >= 25) whoClass = 'attention';

    let insight = '';
    if (whoClass === 'safe') {
      insight = `✅ Добавленный сахар под контролем: ${avgDailySugar.toFixed(1)}г/день.`;
    } else if (whoClass === 'attention') {
      insight = `🟡 Сахар в зоне внимания: ${avgDailySugar.toFixed(1)}г/день (цель <25г).`;
    } else {
      insight = `🔴 Избыточный добавленный сахар: ${avgDailySugar.toFixed(1)}г/день (>50г).`;
    }

    if (maxStreak >= 5) insight += ` Streak >25г: ${maxStreak} дней (dependency risk).`;
    if (avgSugarPctOfCarbs > 40) insight += ` Sugar-dominant carbs: ${avgSugarPctOfCarbs.toFixed(0)}%.`;
    if (sugarTrapDays > 0) insight += ` Ultra-processed sugar trap: ${sugarTrapDays} дн.`;

    const baseConfidence = days.length >= 14 ? 0.75 : 0.65;
    const confidence = piStats.applySmallSamplePenalty
      ? piStats.applySmallSamplePenalty(baseConfidence, days.length, minDays)
      : baseConfidence;

    return {
      pattern,
      available: true,
      avgDailySugar: Math.round(avgDailySugar * 10) / 10,
      avgConfidence: Math.round(avgConfidence * 100) / 100,
      avgSugarPctOfCarbs: Math.round(avgSugarPctOfCarbs),
      whoClass,
      maxStreak,
      sugarTrapDays,
      dependencyRisk: maxStreak >= 5,
      score,
      confidence: Math.round(confidence * 100) / 100,
      insight
    };
  }

  /**
   * C17: Bone Health Index
   * Комплекс: Ca + D + K + P + Ca:P ratio + strength stimulus.
   * @param {Array} days
   * @param {Object} profile
   * @param {Object} pIndex
   * @returns {Object}
   */
  function analyzeBoneHealth(days, profile, pIndex) {
    const pattern = PATTERNS.BONE_HEALTH || 'bone_health';
    const minDays = 14;

    if (!Array.isArray(days) || days.length < minDays) {
      return {
        pattern,
        available: false,
        reason: 'min_days_required',
        minDaysRequired: minDays,
        daysProvided: Array.isArray(days) ? days.length : 0
      };
    }

    const isFemale = profile?.gender === 'female' || profile?.gender === 'Женской';
    const age = Number(profile?.age) || 0;
    const vitKTarget = isFemale ? 90 : 120;
    const riskPenalty = isFemale && age > 55 ? 12 : (isFemale && age > 45 ? 6 : 0);
    const targetMultiplier = riskPenalty > 0 ? 1.2 : 1.0;

    let caSum = 0;
    let dSum = 0;
    let kSum = 0;
    let pSum = 0;
    let strengthDays = 0;
    let validDays = 0;

    for (const day of days) {
      if (!Array.isArray(day?.meals)) continue;

      let dayCa = 0;
      let dayD = 0;
      let dayK = 0;
      let dayP = 0;

      for (const meal of day.meals) {
        for (const item of (meal.items || [])) {
          const prod = pIndex?.byId?.get?.(item?.product_id);
          if (!prod) continue;

          const grams = Number(item.grams) || 0;
          if (grams <= 0) continue;
          const factor = grams / 100;

          dayCa += (Number(prod.calcium) || 0) * factor;
          dayD += (Number(prod.vitamin_d) || 0) * factor;
          dayK += (Number(prod.vitamin_k) || 0) * factor;
          dayP += (Number(prod.phosphorus) || 0) * factor;
        }
      }

      if (dayCa + dayD + dayK + dayP > 0) {
        caSum += dayCa;
        dSum += dayD;
        kSum += dayK;
        pSum += dayP;
        validDays++;
      }

      const trainings = Array.isArray(day?.trainings) ? day.trainings : [];
      if (trainings.some(t => t?.type === 'strength')) strengthDays++;
    }

    if (validDays === 0) {
      return { pattern, available: false, reason: 'insufficient_data' };
    }

    const avgCa = caSum / validDays;
    const avgD = dSum / validDays;
    const avgK = kSum / validDays;
    const avgP = pSum / validDays;

    const caPct = Math.min(1, avgCa / (1000 * targetMultiplier)) * 35;
    const dPct = Math.min(1, avgD / (15 * targetMultiplier)) * 25;
    const kPct = Math.min(1, avgK / (vitKTarget * targetMultiplier)) * 15;
    const pPct = Math.min(1, avgP / (700 * targetMultiplier)) * 10;

    const caPRatio = avgP > 0 ? avgCa / avgP : 0;
    let ratioBonus = 0;
    if (caPRatio >= 1.0 && caPRatio <= 2.0) ratioBonus = 10;
    else if (caPRatio < 0.5) ratioBonus = -15;
    else if (caPRatio > 3.0) ratioBonus = -5;

    const exerciseBonus = strengthDays >= 6 ? 10 : (strengthDays >= 4 ? 5 : 0);

    const vitDAbsorptionFlag = (avgD / (15 * targetMultiplier)) < 0.5;
    const vitKUtilizationFlag = (avgK / (vitKTarget * targetMultiplier)) < 0.5;

    const score = Math.max(
      0,
      Math.min(100, Math.round(caPct + dPct + kPct + pPct + ratioBonus + exerciseBonus - riskPenalty))
    );

    let insight = '';
    if (score >= 80) insight = `✅ Костный профиль хороший (${score}/100).`;
    else if (score >= 60) insight = `🟡 Умеренный риск по костному профилю (${score}/100).`;
    else insight = `🔴 Высокий риск дефицита костной поддержки (${score}/100).`;

    if (vitDAbsorptionFlag) insight += ' VitD <50%: риск ухудшения абсорбции Ca.';
    if (vitKUtilizationFlag) insight += ' VitK <50%: риск ухудшения утилизации Ca.';
    if (ratioBonus < 0) insight += ` Ca:P=${caPRatio.toFixed(2)} (неоптимально).`;

    const baseConfidence = days.length >= 21 ? 0.8 : 0.7;
    const confidence = piStats.applySmallSamplePenalty
      ? piStats.applySmallSamplePenalty(baseConfidence, days.length, minDays)
      : baseConfidence;

    return {
      pattern,
      available: true,
      avgCa: Math.round(avgCa),
      avgVitD: Math.round(avgD * 10) / 10,
      avgVitK: Math.round(avgK),
      avgPhosphorus: Math.round(avgP),
      caPRatio: Math.round(caPRatio * 100) / 100,
      strengthDays,
      riskPenalty,
      vitDAbsorptionFlag,
      vitKUtilizationFlag,
      score,
      confidence: Math.round(confidence * 100) / 100,
      insight
    };
  }

  /**
   * C19: Training-Type Nutrition Match
   * Проверяет соответствие питания преобладающему типу нагрузки.
   * @param {Array} days
   * @param {Object} profile
   * @param {Object} pIndex
   * @returns {Object}
   */
  function analyzeTrainingTypeMatch(days, profile, pIndex) {
    const pattern = PATTERNS.TRAINING_TYPE_MATCH || 'training_type_match';
    const minDays = 5;
    const minTrainings = 3;

    if (!Array.isArray(days) || days.length < minDays) {
      return {
        pattern,
        available: false,
        reason: 'min_days_required',
        minDaysRequired: minDays,
        daysProvided: Array.isArray(days) ? days.length : 0
      };
    }

    let trainingCount = 0;
    let cardioCount = 0;
    let strengthCount = 0;
    let hobbyCount = 0;

    let totalProt = 0;
    let totalCarbs = 0;
    let totalMg = 0;
    let totalVitC = 0;

    for (const day of days) {
      const trainings = Array.isArray(day?.trainings) ? day.trainings : [];
      trainingCount += trainings.length;

      trainings.forEach(t => {
        const type = t?.type;
        if (type === 'strength') strengthCount++;
        else if (type === 'cardio') cardioCount++;
        else if (type === 'hobby') hobbyCount++;
      });

      totalProt += Number(day?.tot?.prot || day?.tot?.protein || 0);
      totalCarbs += Number(day?.tot?.carbs || 0);

      for (const meal of (day.meals || [])) {
        for (const item of (meal.items || [])) {
          const prod = pIndex?.byId?.get?.(item?.product_id);
          if (!prod) continue;
          const grams = Number(item.grams) || 0;
          if (grams <= 0) continue;
          const factor = grams / 100;
          totalMg += (Number(prod.magnesium) || 0) * factor;
          totalVitC += (Number(prod.vitamin_c) || 0) * factor;
        }
      }
    }

    if (trainingCount < minTrainings) {
      return {
        pattern,
        available: false,
        reason: 'min_trainings_required',
        minTrainingsRequired: minTrainings,
        trainingsProvided: trainingCount
      };
    }

    let dominantType = 'mixed';
    if (strengthCount >= cardioCount && strengthCount >= hobbyCount) dominantType = 'strength';
    else if (cardioCount >= strengthCount && cardioCount >= hobbyCount) dominantType = 'cardio';
    else if (hobbyCount > 0) dominantType = 'hobby';

    const weight = Number(profile?.weight) || 70;
    const avgProtPerKg = (totalProt / days.length) / weight;
    const avgCarbsPerKg = (totalCarbs / days.length) / weight;
    const avgMg = totalMg / days.length;
    const avgVitC = totalVitC / days.length;

    let protTargetMin = 1.0;
    let protTargetMax = 1.2;
    let carbsTargetMin = 3;
    let carbsTargetMax = 5;

    if (dominantType === 'cardio') {
      protTargetMin = 1.2; protTargetMax = 1.4;
      carbsTargetMin = 5; carbsTargetMax = 7;
    } else if (dominantType === 'strength') {
      protTargetMin = 1.6; protTargetMax = 2.2;
      carbsTargetMin = 3; carbsTargetMax = 5;
    }

    const protDeviation = avgProtPerKg < protTargetMin
      ? (protTargetMin - avgProtPerKg) / protTargetMin
      : (avgProtPerKg > protTargetMax ? (avgProtPerKg - protTargetMax) / protTargetMax : 0);

    const carbsDeviation = avgCarbsPerKg < carbsTargetMin
      ? (carbsTargetMin - avgCarbsPerKg) / carbsTargetMin
      : (avgCarbsPerKg > carbsTargetMax ? (avgCarbsPerKg - carbsTargetMax) / carbsTargetMax : 0);

    const macroMatchScore = Math.max(0, 100 - Math.round((protDeviation * 50 + carbsDeviation * 50) * 100));
    const postWorkoutScore = dominantType === 'strength'
      ? (avgProtPerKg >= 1.6 ? 90 : 60)
      : (dominantType === 'cardio' ? (avgCarbsPerKg >= 5 ? 90 : 60) : 75);
    const recoveryNutrientScore = Math.min(100, Math.round((Math.min(1, avgMg / 400) * 50) + (Math.min(1, avgVitC / 90) * 50)));

    const score = Math.max(
      0,
      Math.min(100, Math.round(macroMatchScore * 0.5 + postWorkoutScore * 0.3 + recoveryNutrientScore * 0.2))
    );

    let insight = `Тип нагрузки: ${dominantType}. Macro match: ${macroMatchScore}%.`;
    if (score >= 80) insight = `✅ Отличный match питания под ${dominantType} (${score}/100).`;
    else if (score >= 60) insight = `🟡 Частичный match под ${dominantType} (${score}/100).`;
    else insight = `🔴 Выраженный mismatch питания и нагрузки (${score}/100).`;

    if (dominantType === 'strength' && avgProtPerKg < 1.6) insight += ' Белок ниже целевого для силовых.';
    if (dominantType === 'cardio' && avgCarbsPerKg < 5) insight += ' Углеводы ниже целевого для cardio.';

    const baseConfidence = days.length >= 10 ? 0.8 : 0.7;
    const confidence = piStats.applySmallSamplePenalty
      ? piStats.applySmallSamplePenalty(baseConfidence, days.length, minDays)
      : baseConfidence;

    return {
      pattern,
      available: true,
      dominantType,
      trainingCount,
      macroMatchScore,
      postWorkoutScore,
      recoveryNutrientScore,
      avgProtPerKg: Math.round(avgProtPerKg * 100) / 100,
      avgCarbsPerKg: Math.round(avgCarbsPerKg * 100) / 100,
      avgMagnesium: Math.round(avgMg),
      avgVitC: Math.round(avgVitC),
      score,
      confidence: Math.round(confidence * 100) / 100,
      insight
    };
  }

  /**
   * C20: Electrolyte Homeostasis
   * Оценка электролитного баланса Na/K/Mg/Ca с учётом тренировочного потоотделения.
   * @param {Array} days
   * @param {Object} pIndex
   * @returns {Object}
   */
  function analyzeElectrolyteHomeostasis(days, pIndex) {
    const pattern = PATTERNS.ELECTROLYTE_HOMEOSTASIS || 'electrolyte_homeostasis';
    const minDays = 7;

    if (!Array.isArray(days) || days.length < minDays) {
      return {
        pattern,
        available: false,
        reason: 'min_days_required',
        minDaysRequired: minDays,
        daysProvided: Array.isArray(days) ? days.length : 0
      };
    }

    let sodiumSum = 0;
    let potassiumSum = 0;
    let magnesiumSum = 0;
    let calciumSum = 0;
    let validDays = 0;
    let highDemandDays = 0;

    for (const day of days) {
      let dayNa = 0;
      let dayK = 0;
      let dayMg = 0;
      let dayCa = 0;

      for (const meal of (day.meals || [])) {
        for (const item of (meal.items || [])) {
          const prod = pIndex?.byId?.get?.(item?.product_id);
          if (!prod) continue;
          const grams = Number(item.grams) || 0;
          if (grams <= 0) continue;
          const factor = grams / 100;

          dayNa += (Number(prod.sodium100) || Number(prod.sodium) || 0) * factor;
          dayK += (Number(prod.potassium) || 0) * factor;
          dayMg += (Number(prod.magnesium) || 0) * factor;
          dayCa += (Number(prod.calcium) || 0) * factor;
        }
      }

      const trainings = Array.isArray(day.trainings) ? day.trainings : [];
      const sweatRateMax = trainings.reduce((max, t) => {
        const direct = Number(t?.sweatRateMlHour || t?.sweat_ml_h || t?.sweatLossMlPerHour || 0);
        if (direct > 0) return Math.max(max, direct);
        const volume = Number(t?.sweatLossMl || t?.sweat_ml || 0);
        const durationMin = Number(t?.durationMin || t?.duration || 0);
        if (volume > 0 && durationMin > 0) {
          return Math.max(max, (volume / durationMin) * 60);
        }
        return max;
      }, 0);

      if (sweatRateMax > 800) highDemandDays++;

      if (dayNa + dayK + dayMg + dayCa > 0) {
        sodiumSum += dayNa;
        potassiumSum += dayK;
        magnesiumSum += dayMg;
        calciumSum += dayCa;
        validDays++;
      }
    }

    if (validDays === 0) {
      return { pattern, available: false, reason: 'insufficient_data' };
    }

    const avgNa = sodiumSum / validDays;
    const avgK = potassiumSum / validDays;
    const avgMg = magnesiumSum / validDays;
    const avgCa = calciumSum / validDays;
    const naKRatio = avgK > 0 ? avgNa / avgK : 0;

    const naKScore = naKRatio <= 1 ? 100 : (naKRatio <= 1.5 ? 85 : (naKRatio <= 2 ? 65 : (naKRatio <= 3 ? 40 : 20)));
    const mgScore = Math.min(100, (avgMg / 400) * 100);
    const caScore = Math.min(100, (avgCa / 1000) * 100);
    const kScore = Math.min(100, (avgK / 3500) * 100);

    const demandPenalty = highDemandDays >= 3 ? 12 : (highDemandDays > 0 ? 6 : 0);
    const adaptationBonus = (naKRatio <= 1 && mgScore >= 80) ? 5 : 0;
    const hyponatremiaFlag = highDemandDays > 0 && avgNa < 1500;
    const magnesiumLowFlag = avgMg < 300;

    const rawScore = naKScore * 0.5 + mgScore * 0.2 + caScore * 0.15 + kScore * 0.15;
    const score = Math.max(0, Math.min(100, Math.round(rawScore - demandPenalty + adaptationBonus)));

    let insight = '';
    if (score >= 80) insight = `✅ Электролитный профиль хороший (${score}/100).`;
    else if (score >= 60) insight = `🟡 Умеренный электролитный риск (${score}/100).`;
    else insight = `🔴 Выраженный электролитный дисбаланс (${score}/100).`;

    if (naKRatio > 1.5) insight += ` Na:K=${naKRatio.toFixed(2)} (цель <1.0).`;
    if (hyponatremiaFlag) insight += ' Признаки гипонатриемического паттерна при высокой нагрузке.';
    if (magnesiumLowFlag) insight += ' Магний ниже желательного уровня.';

    const baseConfidence = days.length >= 14 ? 0.8 : 0.7;
    const confidence = piStats.applySmallSamplePenalty
      ? piStats.applySmallSamplePenalty(baseConfidence, days.length, minDays)
      : baseConfidence;

    return {
      pattern,
      available: true,
      avgSodium: Math.round(avgNa),
      avgPotassium: Math.round(avgK),
      avgMagnesium: Math.round(avgMg),
      avgCalcium: Math.round(avgCa),
      naKRatio: Math.round(naKRatio * 100) / 100,
      highDemandDays,
      hyponatremiaFlag,
      magnesiumLowFlag,
      score,
      confidence: Math.round(confidence * 100) / 100,
      insight
    };
  }

  /**
   * C21: Nutrient Density Score
   * Оценка нутриентной плотности на 1000 ккал (NRF-подобная логика).
   * @param {Array} days
   * @param {Object} pIndex
   * @returns {Object}
   */
  function analyzeNutrientDensity(days, pIndex) {
    const pattern = PATTERNS.NUTRIENT_DENSITY || 'nutrient_density';
    const minDays = 7;

    if (!Array.isArray(days) || days.length < minDays) {
      return {
        pattern,
        available: false,
        reason: 'min_days_required',
        minDaysRequired: minDays,
        daysProvided: Array.isArray(days) ? days.length : 0
      };
    }

    let totalKcal = 0;
    let protein = 0;
    let fiber = 0;
    let vitC = 0;
    let iron = 0;
    let magnesium = 0;
    let potassium = 0;
    let calcium = 0;
    let addedSugar = 0;
    let sodium = 0;

    for (const day of days) {
      for (const meal of (day.meals || [])) {
        for (const item of (meal.items || [])) {
          const prod = pIndex?.byId?.get?.(item?.product_id);
          if (!prod) continue;

          const grams = Number(item.grams) || 0;
          if (grams <= 0) continue;
          const factor = grams / 100;

          totalKcal += calculateItemKcal(item, pIndex);
          protein += (Number(prod.protein100) || 0) * factor;
          fiber += (Number(prod.fiber100) || 0) * factor;
          vitC += (Number(prod.vitamin_c) || 0) * factor;
          iron += (Number(prod.iron) || 0) * factor;
          magnesium += (Number(prod.magnesium) || 0) * factor;
          potassium += (Number(prod.potassium) || 0) * factor;
          calcium += (Number(prod.calcium) || 0) * factor;
          sodium += (Number(prod.sodium100) || Number(prod.sodium) || 0) * factor;

          const simple = (Number(prod.simple100) || 0) * factor;
          const sugar100 = Number(prod.sugar100);
          if (Number.isFinite(sugar100) && sugar100 > 0) {
            addedSugar += sugar100 * factor;
          } else if (Number(prod.nova_group) === 4 && simple > 0) {
            addedSugar += simple * 0.7;
          } else if (simple > 0) {
            addedSugar += simple * 0.3;
          }
        }
      }
    }

    if (totalKcal < 500) {
      return { pattern, available: false, reason: 'insufficient_energy_data' };
    }

    const per1000 = (value) => (value / totalKcal) * 1000;

    const density = {
      protein: per1000(protein),
      fiber: per1000(fiber),
      vitamin_c: per1000(vitC),
      iron: per1000(iron),
      magnesium: per1000(magnesium),
      potassium: per1000(potassium),
      calcium: per1000(calcium),
      sugar: per1000(addedSugar),
      sodium: per1000(sodium)
    };

    const targets = {
      protein: 35,
      fiber: 14,
      vitamin_c: 45,
      iron: 6,
      magnesium: 200,
      potassium: 1750,
      calcium: 500
    };

    const positives =
      Math.min(1, density.protein / targets.protein) * 20 +
      Math.min(1, density.fiber / targets.fiber) * 20 +
      Math.min(1, density.vitamin_c / targets.vitamin_c) * 15 +
      Math.min(1, density.iron / targets.iron) * 10 +
      Math.min(1, density.magnesium / targets.magnesium) * 10 +
      Math.min(1, density.potassium / targets.potassium) * 15 +
      Math.min(1, density.calcium / targets.calcium) * 10;

    const sugarPenalty = density.sugar > 25 ? Math.min(15, (density.sugar - 25) * 0.4) : 0;
    const sodiumPenalty = density.sodium > 1000 ? Math.min(15, (density.sodium - 1000) * 0.01) : 0;

    const score = Math.max(0, Math.min(100, Math.round(positives - sugarPenalty - sodiumPenalty)));

    let insight = '';
    if (score >= 80) insight = `✅ Высокая нутриентная плотность (${score}/100).`;
    else if (score >= 60) insight = `🟡 Средняя нутриентная плотность (${score}/100).`;
    else insight = `🔴 Низкая нутриентная плотность (${score}/100): «пустые калории».`;

    if (density.fiber < targets.fiber) insight += ' Клетчатка на 1000 ккал ниже цели.';
    if (density.sugar > 25) insight += ` Добавленный сахар ${density.sugar.toFixed(1)}г/1000ккал.`;
    if (density.sodium > 1000) insight += ` Натрий ${Math.round(density.sodium)}мг/1000ккал.`;

    const baseConfidence = days.length >= 14 ? 0.8 : 0.7;
    const confidence = piStats.applySmallSamplePenalty
      ? piStats.applySmallSamplePenalty(baseConfidence, days.length, minDays)
      : baseConfidence;

    return {
      pattern,
      available: true,
      kcalAnalyzed: Math.round(totalKcal),
      density: {
        protein: Math.round(density.protein * 10) / 10,
        fiber: Math.round(density.fiber * 10) / 10,
        vitamin_c: Math.round(density.vitamin_c * 10) / 10,
        iron: Math.round(density.iron * 10) / 10,
        magnesium: Math.round(density.magnesium),
        potassium: Math.round(density.potassium),
        calcium: Math.round(density.calcium),
        sugar: Math.round(density.sugar * 10) / 10,
        sodium: Math.round(density.sodium)
      },
      score,
      confidence: Math.round(confidence * 100) / 100,
      insight
    };
  }


  // === ЭКСПОРТ ===
  HEYS.InsightsPI.patterns = {
    analyzeMealTiming,
    analyzeWaveOverlap,
    analyzeLateEating,
    analyzeMealQualityTrend,
    analyzeSleepWeight,
    analyzeSleepHunger,
    analyzeTrainingKcal,
    analyzeStepsWeight,
    analyzeProteinSatiety,
    analyzeFiberRegularity,
    analyzeNutritionQuality,
    analyzeStressEating,
    analyzeMoodFood,
    analyzeMoodTrajectory,
    analyzeCircadianTiming,
    analyzeNutrientTiming,
    analyzeInsulinSensitivity,
    analyzeGutHealth,
    analyzeNEATTrend,
    // v4.0 (B1-B6)
    analyzeSleepQuality,
    analyzeWellbeing,
    analyzeHydration,
    analyzeBodyComposition,
    analyzeCyclePatterns,
    analyzeWeekendEffect,
    // v5.0 (C7-C12)
    analyzeNOVAQuality,
    analyzeTrainingRecovery,
    analyzeHypertrophy,
    analyzeMicronutrients,
    analyzeHeartHealth: patternModules.analyzeHeartHealth || analyzeHeartHealth, // C9: Heart Health (v6.0, modular-ready)
    analyzeOmegaBalance: patternModules.analyzeOmegaBalance || analyzeOmegaBalance, // C8: Omega Balance (v6.0, modular-ready)
    analyzeVitaminDefense,   // C13: Vitamin Defense Radar (v6.0)
    analyzeBComplexAnemia,   // C22: B-Complex Energy & Anemia Risk (v6.0)
    analyzeGlycemicLoad: patternModules.analyzeGlycemicLoad || analyzeGlycemicLoad, // C14: Glycemic Load Optimizer (v6.0, modular-ready)
    analyzeProteinDistribution: patternModules.analyzeProteinDistribution || analyzeProteinDistribution, // C15: Protein Distribution (v6.0, modular-ready)
    analyzeAntioxidantDefense: patternModules.analyzeAntioxidantDefense || analyzeAntioxidantDefense, // C16: Antioxidant Defense (v6.0, modular-ready)
    analyzeAddedSugarDependency, // C18: Added Sugar & Dependency (v6.0)
    analyzeBoneHealth, // C17: Bone Health (v6.0)
    analyzeTrainingTypeMatch: patternModules.analyzeTrainingTypeMatch || analyzeTrainingTypeMatch, // C19: Training-Type Match (v6.0, modular-ready)
    analyzeElectrolyteHomeostasis: patternModules.analyzeElectrolyteHomeostasis || analyzeElectrolyteHomeostasis, // C20: Electrolyte Homeostasis (v6.0, modular-ready)
    analyzeNutrientDensity: patternModules.analyzeNutrientDensity || analyzeNutrientDensity // C21: Nutrient Density (v6.0, modular-ready)
  };

  // Fallback для прямого доступа
  global.piPatterns = HEYS.InsightsPI.patterns;

  devLog('[PI Patterns] v6.2.0 loaded — 40 pattern analyzers (modular-router for C8/C9/C14/C15/C16/C19/C20/C21)');

})(typeof window !== 'undefined' ? window : global);
