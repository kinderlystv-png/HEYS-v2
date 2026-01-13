// pi_patterns.js — Pattern Analysis Functions v3.0.0
// Extracted from heys_predictive_insights_v1.js (Phase 3)
// 16 analyze* функций для анализа паттернов питания, сна, активности
(function(global) {
  'use strict';
  
  const HEYS = global.HEYS = global.HEYS || {};
  HEYS.InsightsPI = HEYS.InsightsPI || {};
  
  // Зависимости
  const piStats = HEYS.InsightsPI?.stats || window.piStats || {};
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
    
    if (pairs.length < 5) {
      return {
        pattern: PATTERNS.SLEEP_WEIGHT,
        available: false,
        confidence: 0.2,
        insight: 'Недостаточно данных сна и веса'
      };
    }
    
    const sleepArr = pairs.map(p => p.sleep);
    const weightArr = pairs.map(p => p.weight);
    const correlation = pearsonCorrelation(sleepArr, weightArr);
    
    // Обычно негативная корреляция: больше сна → меньше вес
    const score = Math.round(50 + correlation * -50); // Инвертируем
    
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
    
    if (pairs.length < 5) {
      return {
        pattern: PATTERNS.SLEEP_HUNGER,
        available: false,
        confidence: 0.2,
        insight: 'Недостаточно данных для анализа связи сна и аппетита',
        formula: SCIENCE_INFO.CORRELATION.formula
      };
    }
    
    const deficitArr = pairs.map(p => p.sleepDeficit);
    const kcalArr = pairs.map(p => p.kcal);
    const correlation = pearsonCorrelation(deficitArr, kcalArr);
    
    // Позитивная корреляция: больше недосып → больше ккал
    const score = Math.round(50 - correlation * 50);
    
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
        source: SCIENCE_INFO.hormones.source
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
    
    if (pairs.length < 5) {
      return {
        pattern: PATTERNS.STEPS_WEIGHT,
        available: false,
        confidence: 0.2,
        insight: 'Недостаточно данных шагов и веса'
      };
    }
    
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
              dayKcal += (p * 4 + c * 4 + f * 9) * item.grams / 100;
            }
          }
        }
      }
      
      if (dayKcal > 0) {
        const proteinPct = (dayProtein * 4 / dayKcal) * 100;
        pairs.push({ proteinPct, protein: dayProtein, kcal: dayKcal, date: day.date });
      }
    }
    
    if (pairs.length < 5) {
      return {
        pattern: PATTERNS.PROTEIN_SATIETY,
        available: false,
        confidence: 0.2,
        insight: 'Недостаточно данных о белке'
      };
    }
    
    const proteinArr = pairs.map(p => p.proteinPct);
    const kcalArr = pairs.map(p => p.kcal);
    const correlation = pearsonCorrelation(proteinArr, kcalArr);
    
    const avgProteinPct = average(proteinArr);
    const avgProteinG = average(pairs.map(p => p.protein));
    // Негативная корреляция: больше белка → меньше общих ккал
    const score = avgProteinPct >= 25 ? 100 : avgProteinPct >= 20 ? 80 : 60;
    
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
              dayKcal += (p * 4 + c * 4 + f * 9) * item.grams / 100;
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
    
    if (fiberData.length < 5) {
      return {
        pattern: PATTERNS.FIBER_REGULARITY,
        available: false,
        confidence: 0.2,
        insight: 'Недостаточно данных о клетчатке'
      };
    }
    
    const avgFiber = average(fiberData.map(d => d.fiber));
    const avgFiberPer1000 = average(fiberData.map(d => d.fiberPer1000));
    const consistency = 100 - (stdDev(fiberData.map(d => d.fiber)) / avgFiber) * 100;
    
    const score = avgFiberPer1000 >= 14 ? 100 : avgFiberPer1000 >= 10 ? 70 : 40;
    
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
        source: SCIENCE_INFO.gutHealth.source
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
    
    if (pairs.length < 5) {
      return {
        pattern: PATTERNS.STRESS_EATING,
        available: false,
        confidence: 0.2,
        insight: 'Недостаточно данных о стрессе'
      };
    }
    
    const stressArr = pairs.map(p => p.stress);
    const kcalArr = pairs.map(p => p.kcal);
    const correlation = pearsonCorrelation(stressArr, kcalArr);
    
    const avgStress = average(stressArr);
    // Позитивная корреляция: больше стресс → больше ккал
    const score = Math.round(50 - correlation * 50);
    
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
      confidence: pairs.length >= 10 ? 0.8 : 0.5,
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
    
    if (pairs.length < 5) {
      return {
        pattern: PATTERNS.MOOD_FOOD,
        available: false,
        confidence: 0.2,
        insight: 'Недостаточно данных о настроении'
      };
    }
    
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
    
    return {
      pattern: PATTERNS.MOOD_FOOD,
      available: true,
      correlation: Math.round(correlation * 100) / 100,
      avgMood: Math.round(avgMood * 10) / 10,
      avgQuality: Math.round(avgQuality),
      dataPoints: pairs.length,
      score,
      confidence: pairs.length >= 10 ? 0.8 : 0.5,
      insight
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
      formula: SCIENCE_INFO.CIRCADIAN.formula,
      debug: {
        timeWeights,
        dailyData: dailyData.slice(0, 3),
        source: SCIENCE_INFO.CIRCADIAN.source
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
      formula: SCIENCE_INFO.NUTRIENT_TIMING.formula,
      debug: {
        dailyData: dailyData.slice(0, 3),
        source: SCIENCE_INFO.NUTRIENT_TIMING.source
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
            totalKcal += (p * 4 + carbs * 4 + f * 9) * item.grams / 100;
            
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
      formula: SCIENCE_INFO.INSULIN_SENSITIVITY.formula,
      debug: {
        dailyData: dailyData.slice(0, 3),
        source: SCIENCE_INFO.INSULIN_SENSITIVITY.source
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
    const fermentedKeywords = ['кефир', 'йогурт', 'творог', 'сыр', 'квашен', 'кимчи', 'мисо', 'темпе', 'комбуча'];
    
    for (const day of days) {
      if (!day.meals || day.meals.length === 0) continue;
      
      let totalFiber = 0, totalKcal = 0;
      const uniqueProducts = new Set();
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
            totalKcal += (p * 4 + c * 4 + f * 9) * item.grams / 100;
            
            // Уникальные продукты
            uniqueProducts.add(prod.name || prod.id);
            
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
      
      // Разнообразие продуктов (25)
      if (diversity >= 20) score += 25;
      else if (diversity >= 15) score += 20;
      else if (diversity >= 10) score += 15;
      else if (diversity >= 5) score += 8;
      
      // Ферментированные (15)
      if (hasFermented) score += 15;
      
      // Базовые +30
      score += 30;
      
      dailyData.push({
        date: day.date,
        fiberTotal: Math.round(fiberTotal),
        diversity,
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
    const fermentedDays = dailyData.filter(d => d.hasFermented).length;
    
    let insight;
    if (avgScore >= 75) {
      insight = '🦠 Отлично для микробиома! Много клетчатки и разнообразие';
    } else if (avgFiber < 20) {
      insight = `⚠️ Мало клетчатки (${Math.round(avgFiber)}г). Добавь овощи, бобовые, цельнозерновые`;
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
      fermentedDaysPct: Math.round((fermentedDays / dailyData.length) * 100),
      dataPoints: dailyData.length,
      confidence: dailyData.length >= 7 ? 0.8 : 0.5,
      insight,
      // DEBUG INFO
      formula: SCIENCE_INFO.GUT_HEALTH.formula,
      debug: {
        dailyData: dailyData.slice(0, 3),
        fermentedKeywords,
        source: SCIENCE_INFO.GUT_HEALTH.source
      }
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
    analyzeStressEating,
    analyzeMoodFood,
    analyzeCircadianTiming,
    analyzeNutrientTiming,
    analyzeInsulinSensitivity,
    analyzeGutHealth
  };
  
  // Fallback для прямого доступа
  global.piPatterns = HEYS.InsightsPI.patterns;
  
  if (typeof console !== 'undefined' && console.log) {
    console.log('[PI Patterns] v3.0.0 loaded — 16 pattern analyzers');
  }
  
})(typeof window !== 'undefined' ? window : global);
