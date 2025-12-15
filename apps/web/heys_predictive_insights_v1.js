// heys_predictive_insights_v1.js — Predictive Insights Module v2.0.0
// Анализ данных за 7-30 дней, корреляции, паттерны, прогнозы
// Зависимости: HEYS.InsulinWave, HEYS.Cycle, HEYS.ratioZones, HEYS.models, U.lsGet
(function(global) {
  'use strict';
  
  const HEYS = global.HEYS = global.HEYS || {};
  const U = HEYS.utils || {};
  
  // === КОНСТАНТЫ ===
  const CONFIG = {
    DEFAULT_DAYS: 14,
    MIN_DAYS_FOR_INSIGHTS: 3,
    MIN_DAYS_FOR_FULL_ANALYSIS: 7,
    MIN_CORRELATION_DISPLAY: 0.35,
    CACHE_TTL_MS: 5 * 60 * 1000,
    VERSION: '2.0.0'
  };

  // === НАУЧНЫЕ СПРАВКИ ДЛЯ UI ===
  // Ключи в UPPERCASE для совместимости с infoKey в компонентах
  const SCIENCE_INFO = {
    // TEF
    TEF: {
      name: 'Термический эффект пищи (TEF)',
      formula: 'TEF = (Белок × 4 × 0.25) + (Углеводы × 4 × 0.08) + (Жиры × 9 × 0.03)',
      source: 'Westerterp, 2004',
      pmid: '15507147',
      interpretation: '8-12% от калоража — норма. >12% — отлично (много белка). <8% — мало белка в рационе.'
    },
    // EPOC
    EPOC: {
      name: 'Дожиг после тренировки (EPOC)',
      formula: 'EPOC = Калории_тренировки × (0.06 + intensity × 0.09)\nIntensity = % времени в зонах 3-4',
      source: 'LaForgia et al., 2006',
      pmid: '16825252',
      interpretation: '+6-15% к затратам тренировки. При HIIT эффект сильнее и дольше (до 24ч).'
    },
    // Гормоны
    HORMONES: {
      name: 'Гормональный баланс (Грелин/Лептин)',
      formula: 'sleepDebt = sleepNorm - actualSleep\nЕсли sleepDebt ≥ 2ч:\n  ghrelinIncrease = 15 + (sleepDebt - 2) × 6.5\n  leptinDecrease = 10 + (sleepDebt - 2) × 4',
      source: 'Spiegel et al., 2004',
      pmid: '15531540',
      interpretation: 'Недосып 2ч+ → голод повышен на 15-28%. Это физиология, не сила воли!'
    },
    // Adaptive Thermogenesis
    ADAPTIVE: {
      name: 'Адаптивный термогенез',
      formula: 'За 7 дней считаем дни с eaten < BMR × 0.70:\n  2-3 дня: метаболизм -4%\n  3-5 дней: метаболизм -8%\n  5+ дней: метаболизм -12%',
      source: 'Rosenbaum & Leibel, 2010',
      pmid: '20107198',
      interpretation: 'При жёстком дефиците метаболизм замедляется на 10-15%. Refeed day помогает!'
    },
    // Circadian
    CIRCADIAN: {
      name: 'Циркадный Score',
      formula: 'Веса по времени:\n  Утро (6-12): ×1.1\n  День (12-18): ×1.0\n  Вечер (18-22): ×0.9\n  Ночь (22-6): ×0.7\nScore = Σ(kcal × timeWeight) / totalKcal × 100',
      source: 'Garaulet et al., 2013; Jakubowicz et al., 2013',
      pmid: '23512957',
      interpretation: '>85 — отлично (калории в первой половине дня). <70 — много вечерней еды.'
    },
    // Nutrient Timing
    NUTRIENT_TIMING: {
      name: 'Тайминг нутриентов',
      formula: 'Бонусы:\n  Белок утром (до 12:00): +10\n  Углеводы после тренировки (±2ч): +15\n  Жиры вечером: нейтрально\nScore = базовый 50 + сумма бонусов',
      source: 'Areta et al., 2013; Aragon & Schoenfeld, 2013',
      pmid: '24477298',
      interpretation: '>80 — оптимальный тайминг. <60 — есть что улучшить.'
    },
    // Insulin Sensitivity
    INSULIN_SENSITIVITY: {
      name: 'Прокси инсулиновой чувствительности',
      formula: 'Факторы:\n  Средний GI <55: +20\n  Клетчатка >14г/1000ккал: +20\n  Вечерние углеводы <30%: +15\n  Тренировки: +15\n  Сон ≥7ч: +10\nScore = сумма факторов',
      source: 'Brand-Miller, 2003; Wolever, 1994',
      pmid: '12936919',
      interpretation: '>75 — хорошая чувствительность. <50 — риск инсулинорезистентности.'
    },
    // Gut Health
    GUT_HEALTH: {
      name: 'Здоровье кишечника',
      formula: 'Факторы:\n  Клетчатка >25г: +30\n  Разнообразие >15 продуктов: +25\n  Ферментированные продукты: +15\n  Без ультрапереработанных: +15',
      source: 'Sonnenburg & Sonnenburg, 2014; Makki et al., 2018',
      pmid: '24336217',
      interpretation: '>75 — здоровый микробиом. <50 — добавь клетчатку и разнообразие.'
    },
    // Health Score
    HEALTH_SCORE: {
      name: 'Health Score (общая оценка)',
      formula: 'Категории (веса зависят от цели):\n  Питание: 40% (качество еды, белок, клетчатка)\n  Тайминг: 25% (интервалы, волны, поздняя еда)\n  Активность: 20% (тренировки, шаги)\n  Восстановление: 15% (сон, стресс)',
      source: 'Композитный показатель из 12+ научных паттернов',
      interpretation: '>80 — отлично! 60-80 — хорошо. <60 — есть над чем работать.'
    },
    // Correlation
    CORRELATION: {
      name: 'Корреляция Пирсона',
      formula: 'r = Σ(x-x̄)(y-ȳ) / √(Σ(x-x̄)² × Σ(y-ȳ)²)\nДиапазон: от -1 до +1',
      source: 'Статистика',
      interpretation: '|r| > 0.7 — сильная связь. 0.4-0.7 — умеренная. <0.4 — слабая.'
    },
    // Weight Prediction
    WEIGHT_PREDICTION: {
      name: 'Прогноз веса',
      formula: 'Линейная регрессия:\n  slope = Σ((day - avgDay)(weight - avgWeight)) / Σ(day - avgDay)²\n  forecast = currentWeight + slope × daysAhead',
      source: 'Статистический анализ временных рядов',
      interpretation: 'Точность зависит от количества данных. ≥7 дней — уверенный прогноз.'
    },
    
    // === КАТЕГОРИИ HEALTH SCORE ===
    CATEGORY_NUTRITION: {
      name: 'Питание (40%)',
      formula: 'Компоненты (веса для дефицита):\n  Калории: 30% (попадание в 85-110% нормы)\n  Белок: 25% (≥0.8г на кг массы тела)\n  Клетчатка: 15% (≥14г/1000 ккал)\n  Качество жиров: 15% (полезные ≥60%)\n  ГИ: 15% (средний GI <55)',
      interpretation: '>80 — отличное питание. 60-80 — хорошо. <60 — нужны улучшения.'
    },
    CATEGORY_TIMING: {
      name: 'Тайминг (25%)',
      formula: 'Компоненты:\n  Интервалы: 30% (3-5ч между приёмами)\n  Инсулиновые волны: 30% (не перекрываются)\n  Поздняя еда: 25% (после 21:00 <300 ккал)\n  Циркадный ритм: 15% (>60% калорий до 15:00)',
      interpretation: '>80 — оптимальный тайминг. <60 — много вечерней еды или частые перекусы.'
    },
    CATEGORY_ACTIVITY: {
      name: 'Активность (20%)',
      formula: 'Компоненты:\n  Тренировки: 50% (3-5 в неделю)\n  Шаги: 30% (8000-10000 в день)\n  NEAT: 20% (бытовая активность)',
      interpretation: '>80 — активный образ жизни. <60 — добавь движения.'
    },
    CATEGORY_RECOVERY: {
      name: 'Восстановление (15%)',
      formula: 'Компоненты:\n  Сон: 50% (7-9 часов)\n  Качество сна: 25% (≥4 из 5)\n  Стресс: 25% (≤4 из 10)',
      interpretation: '>80 — отличное восстановление. <60 — недосып или высокий стресс.'
    },
    
    // === WHAT-IF СЦЕНАРИИ ===
    WHATIF: {
      name: 'Что если... (What-If анализ)',
      formula: 'Сценарии моделируют изменения:\n  1. Берём текущие показатели\n  2. Применяем изменение (+белок, +шаги, и т.д.)\n  3. Пересчитываем Health Score\n  4. Показываем дельту: было → стало',
      interpretation: 'Показывает потенциальный рост Score при изменении одного фактора.'
    },
    
    // === WEEKLY WRAP ===
    WEEKLY_WRAP: {
      name: 'Итоги недели',
      formula: 'Анализируемые метрики:\n  • Лучший/худший день по calories ratio\n  • Средний Health Score за неделю\n  • Streak (дни подряд в норме)\n  • Hidden Wins (достижения, которые легко пропустить)',
      interpretation: 'Еженедельная рефлексия помогает видеть прогресс и корректировать курс.'
    },
    
    // === CONFIDENCE (уверенность) ===
    CONFIDENCE: {
      name: 'Уверенность в анализе',
      formula: 'confidence = (daysWithData / targetDays) × dataQuality\n\ndataQuality зависит от:\n  • Полнота данных (вес, сон, еда, тренировки)\n  • Регулярность заполнения\n  • Отсутствие пропусков',
      interpretation: '>80% — надёжные выводы. 50-80% — тренды видны. <50% — нужно больше данных.'
    }
  };

  // === ПАТТЕРНЫ (12 штук) ===
  const PATTERNS = {
    // Еда + волны (приоритет)
    MEAL_TIMING: 'meal_timing',
    WAVE_OVERLAP: 'wave_overlap',
    LATE_EATING: 'late_eating',
    MEAL_QUALITY_TREND: 'meal_quality',
    
    // Сон + вес
    SLEEP_WEIGHT: 'sleep_weight',
    SLEEP_HUNGER: 'sleep_hunger',
    
    // Активность
    TRAINING_KCAL: 'training_kcal',
    STEPS_WEIGHT: 'steps_weight',
    
    // Макросы
    PROTEIN_SATIETY: 'protein_satiety',
    FIBER_REGULARITY: 'fiber_regularity',
    
    // Эмоции
    STRESS_EATING: 'stress_eating',
    MOOD_FOOD: 'mood_food',
    
    // NEW v2.0
    CIRCADIAN: 'circadian',
    NUTRIENT_TIMING: 'nutrient_timing',
    INSULIN_SENSITIVITY: 'insulin_sensitivity',
    GUT_HEALTH: 'gut_health'
  };

  // === КЭШ ===
  let _cache = {
    data: null,
    timestamp: 0,
    clientId: null
  };

  // === УТИЛИТЫ ===
  
  /**
   * Рассчитать калории из MealItem через pIndex
   */
  function calculateItemKcal(item, pIndex) {
    if (!item || !item.grams) return 0;
    const prod = pIndex?.byId?.get?.(String(item.product_id || item.id)?.toLowerCase());
    if (!prod) return 0;
    const p = prod.protein100 || 0;
    const c = (prod.simple100 || 0) + (prod.complex100 || 0);
    const f = (prod.badFat100 || 0) + (prod.goodFat100 || 0) + (prod.trans100 || 0);
    return (p * 4 + c * 4 + f * 9) * item.grams / 100;
  }
  
  /**
   * Рассчитать калории за день
   */
  function calculateDayKcal(day, pIndex) {
    let total = 0;
    if (!day.meals) return 0;
    for (const meal of day.meals) {
      if (!meal.items) continue;
      for (const item of meal.items) {
        total += calculateItemKcal(item, pIndex);
      }
    }
    return total;
  }
  
  /**
   * Рассчитать BMR (Mifflin-St Jeor)
   */
  function calculateBMR(profile) {
    const weight = profile?.weight || 70;
    const height = profile?.height || 170;
    const age = profile?.age || 30;
    const isMale = profile?.gender !== 'Женский';
    
    if (isMale) {
      return 10 * weight + 6.25 * height - 5 * age + 5;
    } else {
      return 10 * weight + 6.25 * height - 5 * age - 161;
    }
  }

  /**
   * Получить данные дней из localStorage
   * @param {number} daysBack - сколько дней назад
   * @param {Function} lsGet - функция U.lsGet
   * @returns {Array} массив дней [{date, ...dayData}]
   */
  function getDaysData(daysBack, lsGet) {
    const days = [];
    const today = new Date();
    
    for (let i = 0; i < daysBack; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const dayData = lsGet(`heys_dayv2_${dateStr}`, null);
      
      if (dayData && dayData.meals && dayData.meals.length > 0) {
        days.push({
          date: dateStr,
          daysAgo: i,
          ...dayData
        });
      }
    }
    
    return days;
  }

  /**
   * Рассчитать корреляцию Пирсона
   * @param {Array} x - первый массив
   * @param {Array} y - второй массив
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
   * Рассчитать линейный тренд (slope)
   * @param {Array} values - массив значений
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
   * Рассчитать среднее
   */
  function average(arr) {
    if (!arr || arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  /**
   * Рассчитать стандартное отклонение
   */
  function stdDev(arr) {
    if (!arr || arr.length < 2) return 0;
    const avg = average(arr);
    const squareDiffs = arr.map(v => Math.pow(v - avg, 2));
    return Math.sqrt(average(squareDiffs));
  }

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

  // === HEALTH SCORE (Goal-Aware v2.0) ===

  /**
   * Рассчитать Health Score (0-100)
   * Goal-aware: веса зависят от цели (похудение/набор/поддержание)
   * 
   * @param {Array} patterns - результаты анализа паттернов
   * @param {Object} profile - профиль с deficitPctTarget
   */
  function calculateHealthScore(patterns, profile) {
    // Определяем цель
    const deficitPct = profile?.deficitPctTarget || 0;
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
    
    // Raw тренд
    const rawWeights = weightData.map(d => d.weight);
    const rawTrend = calculateTrend(rawWeights);
    
    // Clean тренд (исключаем дни с задержкой воды из-за цикла)
    const cleanData = weightData.filter(d => {
      if (!d.cycleDay) return true;
      // Исключаем дни 1-7 (задержка воды)
      return d.cycleDay > 7 || d.cycleDay === null;
    });
    
    const cleanWeights = cleanData.map(d => d.weight);
    const cleanTrend = cleanWeights.length >= 3 ? calculateTrend(cleanWeights) : rawTrend;
    
    const currentWeight = rawWeights[rawWeights.length - 1];
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

  // === ГЛАВНАЯ ФУНКЦИЯ АНАЛИЗА ===

  /**
   * Запустить полный анализ
   * @param {Object} options - опции
   * @param {number} options.daysBack - сколько дней анализировать (по умолчанию 14)
   * @param {Function} options.lsGet - функция U.lsGet
   * @param {Object} options.profile - профиль пользователя
   * @param {Object} options.pIndex - индекс продуктов
   * @param {number} options.optimum - целевой калораж
   * @returns {Object} результат анализа
   */
  function analyze(options = {}) {
    const {
      daysBack = CONFIG.DEFAULT_DAYS,
      lsGet = U.lsGet || ((k, d) => {
        try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; }
      }),
      profile = lsGet('heys_profile', {}),
      pIndex = null,
      optimum = 2000
    } = options;
    
    // Проверяем кэш
    const clientId = lsGet('heys_client_current', 'default');
    const now = Date.now();
    
    if (_cache.data && 
        _cache.clientId === clientId && 
        (now - _cache.timestamp) < CONFIG.CACHE_TTL_MS) {
      return _cache.data;
    }
    
    // Получаем данные
    const days = getDaysData(daysBack, lsGet);
    
    if (days.length < CONFIG.MIN_DAYS_FOR_INSIGHTS) {
      return {
        available: false,
        daysAnalyzed: days.length,
        daysWithData: days.length,
        confidence: Math.round((days.length / CONFIG.MIN_DAYS_FOR_INSIGHTS) * 50),
        minDaysRequired: CONFIG.MIN_DAYS_FOR_INSIGHTS,
        message: `Нужно минимум ${CONFIG.MIN_DAYS_FOR_INSIGHTS} дня данных. Сейчас: ${days.length}`,
        patterns: [],
        healthScore: { total: 0, categories: {} },
        whatIf: [],
        weightPrediction: { available: false },
        weeklyWrap: null
      };
    }
    
    // Анализируем паттерны — v2.0: добавлены pIndex и новые анализаторы
    const patterns = [
      // === Тайминг и волны ===
      analyzeMealTiming(days, profile),
      analyzeWaveOverlap(days, profile),
      analyzeLateEating(days),
      
      // === Качество питания ===
      analyzeMealQualityTrend(days, pIndex, optimum),
      analyzeProteinSatiety(days, profile, pIndex),     // v2.0: добавлен pIndex
      analyzeFiberRegularity(days, pIndex),              // v2.0: добавлен pIndex
      analyzeMoodFood(days, pIndex, optimum),
      
      // === Сон и корреляции ===
      analyzeSleepWeight(days),
      analyzeSleepHunger(days, profile, pIndex),         // v2.0: добавлен pIndex
      
      // === Активность ===
      analyzeTrainingKcal(days, pIndex),                 // v2.0: добавлен pIndex
      analyzeStepsWeight(days),
      analyzeStressEating(days, pIndex),                 // v2.0: добавлен pIndex
      
      // === NEW v2.0: Научные анализаторы ===
      analyzeCircadianTiming(days, pIndex),              // Циркадные ритмы
      analyzeNutrientTiming(days, pIndex, profile),      // Тайминг нутриентов
      analyzeInsulinSensitivity(days, pIndex, profile),  // Чувствительность к инсулину
      analyzeGutHealth(days, pIndex)                     // Здоровье ЖКТ
    ];
    
    // Считаем Health Score — v2.0: goal-aware
    const healthScore = calculateHealthScore(patterns, profile);
    
    // Генерируем What-If
    const whatIf = generateWhatIfScenarios(patterns, healthScore, days, profile);
    
    // Прогноз веса
    const weightPrediction = predictWeight(days, profile);
    
    // Weekly Wrap
    const weeklyWrap = generateWeeklyWrap(days, patterns, healthScore, weightPrediction);
    
    const result = {
      available: true,
      daysAnalyzed: days.length,
      daysWithData: days.length,
      confidence: Math.round((days.length / CONFIG.MIN_DAYS_FOR_FULL_ANALYSIS) * 100),
      isFullAnalysis: days.length >= CONFIG.MIN_DAYS_FOR_FULL_ANALYSIS,
      patterns,
      healthScore,
      whatIf,
      weightPrediction,
      weeklyWrap,
      generatedAt: new Date().toISOString(),
      version: CONFIG.VERSION
    };
    
    // Кэшируем
    _cache = {
      data: result,
      timestamp: now,
      clientId
    };
    
    return result;
  }

  /**
   * Очистить кэш (вызывать при добавлении продукта)
   */
  function clearCache() {
    _cache = { data: null, timestamp: 0, clientId: null };
  }

  // === ЭКСПОРТ ===
  HEYS.PredictiveInsights = {
    VERSION: CONFIG.VERSION,
    CONFIG,
    PATTERNS,
    
    // Главные функции
    analyze,
    clearCache,
    
    // Утилиты (для тестирования)
    getDaysData,
    pearsonCorrelation,
    calculateTrend,
    average,
    stdDev,
    
    // Отдельные анализаторы
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
    
    // Композитные функции
    calculateHealthScore,
    generateWhatIfScenarios,
    predictWeight,
    generateWeeklyWrap,
    
    // Для интеграции с будущими модулями
    getTopCorrelations: (options) => {
      const result = analyze(options);
      return result.patterns
        .filter(p => p.available && Math.abs(p.correlation || 0) >= CONFIG.MIN_CORRELATION_DISPLAY)
        .sort((a, b) => Math.abs(b.correlation || 0) - Math.abs(a.correlation || 0));
    },
    
    getUserPatterns: (options) => {
      const result = analyze(options);
      return result.patterns.filter(p => p.available);
    },
    
    getRiskFactors: (options) => {
      const result = analyze(options);
      return result.patterns
        .filter(p => p.available && p.score < 50)
        .map(p => ({ pattern: p.pattern, score: p.score, insight: p.insight }));
    },
    
    /**
     * Анализ метаболизма (TEF, EPOC, гормоны) — для InsightsTab
     * @param {Object} options - { lsGet, profile, pIndex, selectedDate }
     * @returns {Object} метаболические данные
     */
    analyzeMetabolism: function(options = {}) {
      const lsGet = options.lsGet || U.lsGet;
      const profile = options.profile || lsGet('heys_profile', {});
      const pIndex = options.pIndex || HEYS.products?.buildIndex?.();
      const dateStr = options.selectedDate || new Date().toISOString().split('T')[0];
      const day = lsGet(`heys_dayv2_${dateStr}`, {});
      const hrZones = lsGet('heys_hr_zones', [
        { MET: 3 }, { MET: 5 }, { MET: 7 }, { MET: 10 }
      ]);
      
      // === TEF (Thermic Effect of Food) ===
      // Westerterp, 2004: белок 25%, углеводы 8%, жиры 3%
      const meals = day.meals || [];
      let totalProtein = 0, totalCarbs = 0, totalFat = 0, totalKcal = 0;
      
      meals.forEach(meal => {
        (meal.items || []).forEach(item => {
          const g = item.grams || 0;
          const prod = pIndex?.byId?.get?.(String(item.product_id || item.id)?.toLowerCase());
          if (prod && g > 0) {
            totalProtein += (prod.protein100 || 0) * g / 100;
            totalCarbs += ((prod.simple100 || 0) + (prod.complex100 || 0)) * g / 100;
            totalFat += ((prod.badFat100 || 0) + (prod.goodFat100 || 0) + (prod.trans100 || 0)) * g / 100;
          }
        });
      });
      
      totalKcal = totalProtein * 4 + totalCarbs * 4 + totalFat * 9;
      const tefProtein = totalProtein * 4 * 0.25;
      const tefCarbs = totalCarbs * 4 * 0.08;
      const tefFat = totalFat * 9 * 0.03;
      const totalTEF = Math.round(tefProtein + tefCarbs + tefFat);
      const tefPct = totalKcal > 0 ? Math.round(totalTEF / totalKcal * 100) : 0;
      
      const tefAnalysis = {
        total: totalTEF,
        percent: tefPct,
        breakdown: { protein: Math.round(tefProtein), carbs: Math.round(tefCarbs), fat: Math.round(tefFat) },
        quality: tefPct >= 12 ? 'excellent' : tefPct >= 10 ? 'good' : tefPct >= 8 ? 'normal' : 'low',
        insight: tefPct >= 12 
          ? `Отличный TEF! Белок сжигает калории на переваривание`
          : tefPct < 8
            ? `Низкий TEF. Добавь белка для ускорения метаболизма`
            : `Стандартный термический эффект`,
        pmid: '15507147'
      };
      
      // === EPOC (Excess Post-exercise Oxygen Consumption) ===
      // LaForgia et al., 2006: +6-15% к затратам тренировки
      const trainings = day.trainings || [];
      let epocKcal = 0;
      let trainingKcal = 0;
      
      trainings.forEach(tr => {
        const zones = tr.z || [0, 0, 0, 0];
        const totalMin = zones.reduce((s, v) => s + v, 0);
        const highIntensityMin = (zones[2] || 0) + (zones[3] || 0);
        const intensity = totalMin > 0 ? highIntensityMin / totalMin : 0;
        
        const epocRate = 0.06 + intensity * 0.09;
        const trKcal = zones.reduce((sum, mins, idx) => {
          const met = hrZones[idx]?.MET || (idx + 1) * 2;
          return sum + (mins * met * (profile?.weight || 70) / 60);
        }, 0);
        trainingKcal += trKcal;
        epocKcal += trKcal * epocRate;
      });
      
      epocKcal = Math.round(epocKcal);
      const epocAnalysis = {
        kcal: epocKcal,
        trainingKcal: Math.round(trainingKcal),
        hasTraining: trainings.length > 0,
        insight: epocKcal > 50 
          ? `+${epocKcal} ккал дожиг после тренировки`
          : epocKcal > 20
            ? `+${epocKcal} ккал от EPOC эффекта`
            : trainings.length > 0 ? 'Небольшой EPOC эффект' : 'Нет тренировки',
        pmid: '16825252'
      };
      
      // === Гормональный баланс (Leptin/Ghrelin) ===
      // Spiegel et al., 2004: Недосып повышает грелин +28%, снижает лептин -18%
      const sleepHours = day.sleepHours || 0;
      const sleepNorm = profile?.sleepHours || 8;
      const sleepDebt = Math.max(0, sleepNorm - sleepHours);
      
      let ghrelinIncrease = 0, leptinDecrease = 0;
      if (sleepDebt >= 3) {
        ghrelinIncrease = 28;
        leptinDecrease = 18;
      } else if (sleepDebt >= 2) {
        ghrelinIncrease = 15;
        leptinDecrease = 10;
      } else if (sleepDebt >= 1) {
        ghrelinIncrease = 8;
        leptinDecrease = 5;
      }
      
      const hormonalBalance = {
        sleepDebt,
        ghrelinIncrease,
        leptinDecrease,
        isDisrupted: ghrelinIncrease > 0,
        insight: ghrelinIncrease > 15
          ? `Недосып: голод повышен на ${ghrelinIncrease}%`
          : ghrelinIncrease > 0
            ? `Лёгкое повышение голода от недосыпа`
            : 'Гормоны в норме',
        pmid: '15531540'
      };
      
      // === Adaptive Thermogenesis ===
      // Rosenbaum & Leibel, 2010: хронический дефицит снижает метаболизм на 10-15%
      // v2.0: используем % от BMR вместо хардкода 1500 ккал
      const bmr = calculateBMR(profile);
      const deficitThreshold = bmr * 0.70; // 70% от BMR = слишком низко
      
      const days = getDaysData(7, lsGet);
      const chronicDeficit = days.filter(d => {
        const eaten = calculateDayKcal(d, pIndex);
        return eaten > 0 && eaten < deficitThreshold;
      }).length;
      
      const adaptiveReduction = chronicDeficit >= 5 ? 0.12 : chronicDeficit >= 3 ? 0.08 : chronicDeficit >= 2 ? 0.04 : 0;
      
      const adaptiveThermogenesis = {
        chronicDeficitDays: chronicDeficit,
        metabolicReduction: adaptiveReduction,
        isAdapted: adaptiveReduction > 0,
        insight: adaptiveReduction >= 0.10
          ? `Метаболизм снижен на ~${Math.round(adaptiveReduction * 100)}%`
          : adaptiveReduction >= 0.05
            ? `Лёгкая адаптация метаболизма`
            : 'Метаболизм в норме',
        pmid: '20107198'
      };
      
      return {
        tefAnalysis,
        epocAnalysis,
        hormonalBalance,
        adaptiveThermogenesis,
        hasData: totalKcal > 0 || trainings.length > 0 || sleepHours > 0
      };
    }
  };

  // === REACT COMPONENTS ===
  const { createElement: h, useState, useEffect, useMemo } = window.React || {};
  const ReactDOM = window.ReactDOM || {};

  /**
   * Health Ring — кольцевой индикатор прогресса (v2.0: с InfoButton)
   */
  function HealthRing({ score, category, label, color, size = 80, onClick, infoKey, debugData }) {
    const radius = (size - 16) / 2;
    const circumference = 2 * Math.PI * radius;
    const progress = Math.min(100, Math.max(0, score || 0));
    const offset = circumference - (progress / 100) * circumference;
    
    const [showTooltip, setShowTooltip] = useState(false);
    const [isPressed, setIsPressed] = useState(false);
    
    const handleClick = () => {
      // Haptic feedback
      if (navigator.vibrate) navigator.vibrate(10);
      setShowTooltip(!showTooltip);
      if (onClick) onClick(category);
    };
    
    return h('div', {
      className: `insights-ring insights-ring--${category} ${showTooltip ? 'insights-ring--active' : ''} ${isPressed ? 'insights-ring--pressed' : ''}`,
      onClick: handleClick,
      onTouchStart: () => setIsPressed(true),
      onTouchEnd: () => setIsPressed(false),
      onMouseDown: () => setIsPressed(true),
      onMouseUp: () => setIsPressed(false)
    },
      h('svg', {
        className: 'insights-ring__svg',
        width: size,
        height: size
      },
        h('circle', {
          className: 'insights-ring__track',
          cx: size / 2,
          cy: size / 2,
          r: radius
        }),
        h('circle', {
          className: 'insights-ring__fill',
          cx: size / 2,
          cy: size / 2,
          r: radius,
          style: {
            strokeDasharray: circumference,
            strokeDashoffset: offset,
            stroke: color
          }
        })
      ),
      h('div', { className: 'insights-ring__center' },
        h('span', { className: 'insights-ring__score' }, score || '—'),
        h('span', { className: 'insights-ring__label' },
          label,
          infoKey && h(InfoButton, { infoKey, debugData, size: 'small' })
        )
      ),
      showTooltip && h('div', { className: 'insights-ring__tooltip' },
        `${label}: ${score}/100`
      )
    );
  }

  /**
   * Total Health Score — большое центральное кольцо (v2.0: с InfoButton)
   */
  function TotalHealthRing({ score, label = 'Health Score', size = 120, strokeWidth = 20, debugData }) {
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const progress = Math.min(100, Math.max(0, score || 0));
    const offset = circumference - (progress / 100) * circumference;
    
    return h('div', { className: 'insights-total' },
      h('div', { className: 'insights-total__ring' },
        h('svg', {
          className: 'insights-total__svg',
          width: size,
          height: size
        },
          h('defs', null,
            h('linearGradient', { id: 'totalGradient', x1: '0%', y1: '0%', x2: '100%', y2: '100%' },
              h('stop', { offset: '0%', stopColor: '#10b981' }),
              h('stop', { offset: '100%', stopColor: '#3b82f6' })
            )
          ),
          h('circle', {
            className: 'insights-total__track',
            cx: size / 2,
            cy: size / 2,
            r: radius,
            strokeWidth: strokeWidth
          }),
          h('circle', {
            className: 'insights-total__fill',
            cx: size / 2,
            cy: size / 2,
            r: radius,
            strokeWidth: strokeWidth,
            style: {
              strokeDasharray: circumference,
              strokeDashoffset: offset
            }
          })
        ),
        h('div', { className: 'insights-total__center' },
          h('span', { className: 'insights-total__score' }, score || '—'),
          h('span', { className: 'insights-total__label' },
            label,
            h(InfoButton, { infoKey: 'HEALTH_SCORE', debugData })
          )
        )
      )
    );
  }

  /**
   * Health Rings Grid — 4 кольца в ряд
   */
  /**
   * CollapsibleSection — сворачиваемая секция
   */
  function CollapsibleSection({ title, icon, badge, children, defaultOpen = false, compact = false }) {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    
    return h('div', { className: `insights-collapsible ${isOpen ? 'insights-collapsible--open' : ''} ${compact ? 'insights-collapsible--compact' : ''}` },
      h('div', { 
        className: 'insights-collapsible__header',
        onClick: () => setIsOpen(!isOpen)
      },
        h('div', { className: 'insights-collapsible__title' },
          icon && h('span', { className: 'insights-collapsible__icon' }, icon),
          h('span', { className: 'insights-collapsible__text' }, title)
        ),
        badge && h('span', { className: 'insights-collapsible__badge' }, badge),
        h('span', { className: 'insights-collapsible__chevron' }, '›')
      ),
      h('div', { className: 'insights-collapsible__content' }, children)
    );
  }

  /**
   * MetabolismCard — карточка одного метаболического показателя (v2.0: с InfoButton)
   */
  function MetabolismCard({ title, icon, value, unit, quality, insight, pmid, details, infoKey, debugData }) {
    const [showDetails, setShowDetails] = useState(false);
    
    const qualityColors = {
      excellent: '#22c55e',
      good: '#10b981',
      normal: '#3b82f6',
      low: '#f59e0b',
      warning: '#ef4444'
    };
    const color = qualityColors[quality] || qualityColors.normal;
    
    return h('div', { 
      className: `insights-metabolism-card insights-metabolism-card--${quality} ${showDetails ? 'insights-metabolism-card--expanded' : ''}`,
      onClick: () => setShowDetails(!showDetails)
    },
      h('div', { className: 'insights-metabolism-card__header' },
        h('div', { className: 'insights-metabolism-card__icon', style: { color } }, icon),
        h('div', { className: 'insights-metabolism-card__info' },
          h('div', { className: 'insights-metabolism-card__title' },
            title,
            // v2.0: InfoButton рядом с заголовком
            infoKey && h(InfoButton, { infoKey, debugData })
          ),
          h('div', { className: 'insights-metabolism-card__value' },
            h('span', { style: { color, fontWeight: 700 } }, value),
            unit && h('span', { className: 'insights-metabolism-card__unit' }, ' ', unit)
          )
        ),
        pmid && h('a', {
          className: 'insights-metabolism-card__pmid',
          href: `https://pubmed.ncbi.nlm.nih.gov/${pmid}`,
          target: '_blank',
          rel: 'noopener',
          onClick: e => e.stopPropagation()
        }, '📚')
      ),
      showDetails && h('div', { className: 'insights-metabolism-card__details' },
        h('div', { className: 'insights-metabolism-card__insight' }, insight),
        details && h('div', { className: 'insights-metabolism-card__breakdown' }, details)
      )
    );
  }

  /**
   * MetabolismSection — секция научной аналитики (v2.0: с InfoButtons)
   */
  function MetabolismSection({ lsGet, profile, pIndex, selectedDate }) {
    const metabolism = useMemo(() => {
      return HEYS.PredictiveInsights.analyzeMetabolism({
        lsGet: lsGet || window.HEYS?.utils?.lsGet,
        profile: profile || window.HEYS?.utils?.lsGet?.('heys_profile', {}),
        pIndex: pIndex || window.HEYS?.products?.buildIndex?.(),
        selectedDate
      });
    }, [lsGet, profile, pIndex, selectedDate]);
    
    if (!metabolism || !metabolism.hasData) {
      return h('div', { className: 'insights-metabolism-empty' },
        h('div', { className: 'insights-metabolism-empty__icon' }, '📊'),
        'Добавь данные для анализа метаболизма'
      );
    }
    
    const { tefAnalysis, epocAnalysis, hormonalBalance, adaptiveThermogenesis } = metabolism;
    
    // Компактная сводка для заголовка
    const summaryParts = [];
    if (tefAnalysis.percent > 0) summaryParts.push(`TEF ${tefAnalysis.percent}%`);
    if (epocAnalysis.kcal > 0) summaryParts.push(`EPOC +${epocAnalysis.kcal}`);
    if (hormonalBalance.isDisrupted) summaryParts.push('⚠️ Гормоны');
    else summaryParts.push('✓ Гормоны');
    
    return h(CollapsibleSection, {
      title: 'Метаболизм',
      icon: '🔬',
      badge: summaryParts.join(' • '),
      defaultOpen: false
    },
      h('div', { className: 'insights-metabolism' },
        // TEF — v2.0: добавлен infoKey и debugData
        h(MetabolismCard, {
          title: 'Термический эффект (TEF)',
          icon: '🔥',
          value: tefAnalysis.total,
          unit: 'ккал',
          quality: tefAnalysis.quality,
          insight: tefAnalysis.insight,
          pmid: tefAnalysis.pmid,
          details: `Белок: ${tefAnalysis.breakdown.protein} | Углеводы: ${tefAnalysis.breakdown.carbs} | Жиры: ${tefAnalysis.breakdown.fat}`,
          infoKey: 'TEF',
          debugData: {
            breakdown: tefAnalysis.breakdown,
            percent: tefAnalysis.percent,
            quality: tefAnalysis.quality
          }
        }),
        
        // EPOC — v2.0: добавлен infoKey и debugData
        epocAnalysis.hasTraining && h(MetabolismCard, {
          title: 'Дожиг после тренировки (EPOC)',
          icon: '⚡',
          value: epocAnalysis.kcal > 0 ? `+${epocAnalysis.kcal}` : '—',
          unit: 'ккал',
          quality: epocAnalysis.kcal > 50 ? 'excellent' : epocAnalysis.kcal > 20 ? 'good' : 'normal',
          insight: epocAnalysis.insight,
          pmid: epocAnalysis.pmid,
          details: `Тренировка: ${epocAnalysis.trainingKcal} ккал`,
          infoKey: 'EPOC',
          debugData: {
            epocKcal: epocAnalysis.kcal,
            trainingKcal: epocAnalysis.trainingKcal,
            hasTraining: epocAnalysis.hasTraining
          }
        }),
        
        // Гормоны — v2.0: добавлен infoKey и debugData
        h(MetabolismCard, {
          title: 'Гормональный баланс',
          icon: '😴',
          value: hormonalBalance.isDisrupted ? `+${hormonalBalance.ghrelinIncrease}%` : '✓',
          unit: hormonalBalance.isDisrupted ? 'голод' : 'норма',
          quality: hormonalBalance.ghrelinIncrease > 15 ? 'warning' : hormonalBalance.ghrelinIncrease > 0 ? 'low' : 'good',
          insight: hormonalBalance.insight,
          pmid: hormonalBalance.pmid,
          details: hormonalBalance.sleepDebt > 0 ? `Недосып: ${hormonalBalance.sleepDebt} ч` : 'Сон в норме',
          infoKey: 'HORMONES',
          debugData: {
            sleepDebt: hormonalBalance.sleepDebt,
            ghrelinIncrease: hormonalBalance.ghrelinIncrease,
            leptinDecrease: hormonalBalance.leptinDecrease
          }
        }),
        
        // Адаптивный термогенез — v2.0: добавлен infoKey и debugData
        adaptiveThermogenesis.isAdapted && h(MetabolismCard, {
          title: 'Адаптация метаболизма',
          icon: '📉',
          value: `-${Math.round(adaptiveThermogenesis.metabolicReduction * 100)}%`,
          unit: 'замедление',
          quality: 'warning',
          insight: adaptiveThermogenesis.insight,
          pmid: adaptiveThermogenesis.pmid,
          details: `Дней в жёстком дефиците: ${adaptiveThermogenesis.chronicDeficitDays}`,
          infoKey: 'ADAPTIVE',
          debugData: {
            chronicDeficitDays: adaptiveThermogenesis.chronicDeficitDays,
            metabolicReduction: adaptiveThermogenesis.metabolicReduction
          }
        })
      )
    );
  }

  function HealthRingsGrid({ healthScore, onCategoryClick }) {
    if (!healthScore || !healthScore.breakdown) return null;
    
    const categories = [
      { key: 'nutrition', label: 'Питание', color: '#22c55e', infoKey: 'CATEGORY_NUTRITION' },
      { key: 'timing', label: 'Тайминг', color: '#3b82f6', infoKey: 'CATEGORY_TIMING' },
      { key: 'activity', label: 'Актив.', color: '#f59e0b', infoKey: 'CATEGORY_ACTIVITY' },
      { key: 'recovery', label: 'Восстан.', color: '#8b5cf6', infoKey: 'CATEGORY_RECOVERY' }
    ];
    
    return h('div', { className: 'insights-rings' },
      categories.map(cat =>
        h(HealthRing, {
          key: cat.key,
          score: healthScore.breakdown[cat.key]?.score,
          category: cat.key,
          label: cat.label,
          color: cat.color,
          onClick: onCategoryClick,
          infoKey: cat.infoKey,
          debugData: healthScore.breakdown[cat.key]
        })
      )
    );
  }

  /**
   * Pattern Card — карточка одного паттерна (v2.0: с InfoButton)
   */
  function PatternCard({ pattern }) {
    if (!pattern || !pattern.available) return null;
    
    const iconClass = pattern.score >= 70 ? 'good' : pattern.score >= 40 ? 'warn' : 'bad';
    const icon = pattern.score >= 70 ? '✓' : pattern.score >= 40 ? '!' : '✗';
    
    const patternLabels = {
      meal_timing: '⏱️ Тайминг еды',
      wave_overlap: '🌊 Перехлёст волн',
      late_eating: '🌙 Поздняя еда',
      meal_quality: '🍽️ Качество еды',
      sleep_weight: '💤 Сон → Вес',
      sleep_hunger: '😴 Сон → Голод',
      training_kcal: '🏋️ Тренировки',
      steps_weight: '👟 Шаги → Вес',
      protein_satiety: '🥩 Белок',
      fiber_regularity: '🥗 Клетчатка',
      stress_eating: '😰 Стресс → Еда',
      mood_food: '😊 Настроение',
      // v2.0: новые паттерны
      circadian_timing: '🌅 Циркадные ритмы',
      nutrient_timing: '⏰ Тайминг нутриентов',
      insulin_sensitivity: '📉 Инсулин. чувств.',
      gut_health: '🦠 Здоровье ЖКТ'
    };
    
    // v2.0: Маппинг pattern → SCIENCE_INFO ключ
    const patternToInfoKey = {
      circadian_timing: 'CIRCADIAN',
      nutrient_timing: 'NUTRIENT_TIMING',
      insulin_sensitivity: 'INSULIN_SENSITIVITY',
      gut_health: 'GUT_HEALTH'
    };
    
    const infoKey = patternToInfoKey[pattern.pattern];
    
    return h('div', { className: 'insights-pattern' },
      h('div', { className: `insights-pattern__icon insights-pattern__icon--${iconClass}` }, icon),
      h('div', { className: 'insights-pattern__content' },
        h('div', { className: 'insights-pattern__title' },
          patternLabels[pattern.pattern] || pattern.pattern,
          // v2.0: InfoButton для новых паттернов с формулами
          (infoKey || pattern.formula) && h(InfoButton, {
            infoKey: infoKey,
            debugData: pattern.debug || {
              formula: pattern.formula,
              score: pattern.score,
              confidence: pattern.confidence
            }
          })
        ),
        h('div', { className: 'insights-pattern__insight' }, pattern.insight),
        pattern.confidence && h('div', { className: 'insights-pattern__confidence' },
          `Уверенность: ${Math.round(pattern.confidence * 100)}%`
        )
      )
    );
  }

  /**
   * Patterns List — список всех паттернов
   */
  function PatternsList({ patterns }) {
    if (!patterns || patterns.length === 0) return null;
    
    const availablePatterns = patterns.filter(p => p.available);
    
    return h('div', { className: 'insights-patterns' },
      availablePatterns.map((p, i) =>
        h(PatternCard, { key: p.pattern || i, pattern: p })
      )
    );
  }

  /**
   * What-If Scenario Card
   */
  function ScenarioCard({ scenario }) {
    if (!scenario) return null;
    
    const diff = scenario.projectedScore - scenario.currentScore;
    const arrowClass = diff > 0 ? 'up' : diff < 0 ? 'down' : 'stable';
    const arrow = diff > 0 ? '↑' : diff < 0 ? '↓' : '→';
    
    return h('div', { className: `insights-scenario insights-scenario--${scenario.id}` },
      h('div', { className: 'insights-scenario__icon' }, scenario.icon),
      h('div', { className: 'insights-scenario__content' },
        h('div', { className: 'insights-scenario__name' }, scenario.name),
        h('div', { className: 'insights-scenario__desc' }, scenario.description)
      ),
      h('div', { className: `insights-scenario__arrow insights-scenario__arrow--${arrowClass}` },
        scenario.currentScore, ' ', arrow, ' ', scenario.projectedScore
      )
    );
  }

  /**
   * What-If Section (v2.0: с InfoButton)
   */
  function WhatIfSection({ scenarios }) {
    if (!scenarios || scenarios.length === 0) return null;
    
    return h('div', { className: 'insights-whatif' },
      h('div', { className: 'insights-whatif__header' },
        h('span', { className: 'insights-whatif__title' }, '🎯 Сценарии'),
        h(InfoButton, {
          infoKey: 'WHATIF',
          debugData: { scenariosCount: scenarios.length }
        })
      ),
      h('div', { className: 'insights-whatif__list' },
        scenarios.map((s, i) =>
          h(ScenarioCard, { key: s.id || i, scenario: s })
        )
      )
    );
  }

  /**
   * Weight Prediction Card (v2.0: с InfoButton)
   */
  function WeightPrediction({ prediction }) {
    if (!prediction || !prediction.available) return null;
    
    const changeClass = prediction.weeklyChange < -0.1 ? 'down' 
      : prediction.weeklyChange > 0.1 ? 'up' 
      : 'stable';
    const changeSign = prediction.weeklyChange > 0 ? '+' : '';
    
    return h('div', { className: 'insights-weight' },
      h('div', { className: 'insights-weight__header' },
        h('span', null, '⚖️ Прогноз веса'),
        h(InfoButton, {
          infoKey: 'WEIGHT_PREDICTION',
          debugData: {
            currentWeight: prediction.currentWeight,
            projectedWeight: prediction.projectedWeight,
            weeklyChange: prediction.weeklyChange,
            slope: prediction.slope,
            dataPoints: prediction.dataPoints
          }
        })
      ),
      h('div', { className: 'insights-weight__body' },
        h('div', { className: 'insights-weight__current' },
          h('div', { className: 'insights-weight__label' }, 'Сейчас'),
          h('div', { className: 'insights-weight__value' }, prediction.currentWeight, ' кг')
        ),
        h('div', { className: 'insights-weight__arrow' },
          '→',
          h('div', { className: `insights-weight__change insights-weight__change--${changeClass}` },
            changeSign, Math.round(prediction.weeklyChange * 10) / 10, ' кг/нед'
          )
        ),
        h('div', { className: 'insights-weight__projected' },
          h('div', { className: 'insights-weight__label' }, 'Через неделю'),
          h('div', { className: 'insights-weight__value' }, prediction.projectedWeight, ' кг')
        )
      )
    );
  }

  /**
   * Weekly Wrap — итоги недели (v2.0: с InfoButton)
   */
  function WeeklyWrap({ wrap }) {
    if (!wrap) return null;
    
    return h('div', { className: 'insights-wrap' },
      h('div', { className: 'insights-wrap__header' },
        h('span', { className: 'insights-wrap__title' }, '📋 Итоги'),
        h(InfoButton, {
          infoKey: 'WEEKLY_WRAP',
          debugData: {
            daysWithData: wrap.daysWithData,
            healthScore: wrap.healthScore,
            bestDay: wrap.bestDay,
            hiddenWinsCount: wrap.hiddenWins?.length || 0
          }
        })
      ),
      h('div', { className: 'insights-wrap__summary' },
        h('div', { className: 'insights-wrap__stat' },
          h('div', { className: 'insights-wrap__stat-value' }, wrap.daysWithData),
          h('div', { className: 'insights-wrap__stat-label' }, 'дней с данными')
        ),
        h('div', { className: 'insights-wrap__stat' },
          h('div', { className: 'insights-wrap__stat-value' }, wrap.healthScore),
          h('div', { className: 'insights-wrap__stat-label' }, 'Health Score')
        )
      ),
      wrap.bestDay && h('div', { className: 'insights-wrap__highlight' },
        h('div', { className: 'insights-wrap__highlight-title' }, '🏆 Лучший день'),
        h('div', { className: 'insights-wrap__highlight-value' },
          wrap.bestDay.date, ' — ', wrap.bestDay.kcal, ' ккал'
        )
      ),
      wrap.hiddenWins && wrap.hiddenWins.length > 0 && h('div', { className: 'insights-wins' },
        h('div', { className: 'insights-wins__title' }, '🎯 Скрытые победы'),
        wrap.hiddenWins.map((win, i) =>
          h('div', { key: i, className: 'insights-win' }, win)
        )
      )
    );
  }

  /**
   * Empty State — нет данных
   */
  function EmptyState({ daysAnalyzed, minRequired }) {
    const progress = Math.round((daysAnalyzed / minRequired) * 100);
    
    return h('div', { className: 'insights-empty' },
      h('div', { className: 'insights-empty__icon' }, '📊'),
      h('div', { className: 'insights-empty__title' }, 'Собираем данные...'),
      h('div', { className: 'insights-empty__desc' },
        `Нужно минимум ${minRequired} дня с данными для анализа. Сейчас: ${daysAnalyzed}`
      ),
      h('div', { className: 'insights-empty__progress' },
        h('div', { className: 'insights-empty__bar' },
          h('div', { className: 'insights-empty__fill', style: { width: `${progress}%` } })
        ),
        h('div', { className: 'insights-empty__label' }, `${progress}% готово`)
      )
    );
  }

  /**
   * Main Insights Card — главный компонент
   */
  function InsightsCard({ lsGet, profile, pIndex, optimum }) {
    const [activeTab, setActiveTab] = useState('today');
    const [selectedCategory, setSelectedCategory] = useState(null);
    
    const insights = useMemo(() => {
      return analyze({
        daysBack: activeTab === 'today' ? 7 : 14,
        lsGet,
        profile,
        pIndex,
        optimum
      });
    }, [activeTab, lsGet, profile, pIndex, optimum]);
    
    if (!insights.available) {
      return h('div', { className: 'insights-card' },
        h('div', { className: 'insights-card__header' },
          h('div', { className: 'insights-card__title' }, '📊 Инсайты недели')
        ),
        h(EmptyState, {
          daysAnalyzed: insights.daysAnalyzed,
          minRequired: insights.minDaysRequired
        })
      );
    }
    
    return h('div', { className: 'insights-card' },
      h('div', { className: 'insights-card__header' },
        h('div', { className: 'insights-card__title' },
          '📊 Инсайты недели',
          h('span', { className: 'insights-card__badge' }, insights.healthScore.total)
        )
      ),
      h('div', { className: 'insights-card__tabs' },
        h('button', {
          className: `insights-card__tab ${activeTab === 'today' ? 'insights-card__tab--active' : ''}`,
          onClick: () => setActiveTab('today')
        }, 'Сегодня'),
        h('button', {
          className: `insights-card__tab ${activeTab === 'week' ? 'insights-card__tab--active' : ''}`,
          onClick: () => setActiveTab('week')
        }, 'Неделя')
      ),
      
      // Health Score кольца
      h(TotalHealthRing, { score: insights.healthScore.total }),
      h(HealthRingsGrid, {
        healthScore: insights.healthScore,
        onCategoryClick: setSelectedCategory
      }),
      
      // What-If секция
      h(WhatIfSection, { scenarios: insights.whatIf }),
      
      // Weight Prediction
      h(WeightPrediction, { prediction: insights.weightPrediction }),
      
      // Паттерны (сворачиваемый список)
      activeTab === 'week' && h(PatternsList, { patterns: insights.patterns }),
      
      // Weekly Wrap
      activeTab === 'week' && h(WeeklyWrap, { wrap: insights.weeklyWrap })
    );
  }

  // === INSIGHTS TAB — Полноэкранная вкладка ===
  function InsightsTab({ lsGet, profile, pIndex, optimum, selectedDate }) {
    const [activeTab, setActiveTab] = useState('today');
    const [selectedCategory, setSelectedCategory] = useState(null);
    
    // Анализ данных
    const insights = useMemo(() => {
      return HEYS.PredictiveInsights.analyze({
        lsGet: lsGet || (window.HEYS?.utils?.lsGet),
        daysBack: activeTab === 'today' ? 7 : 30
      });
    }, [lsGet, activeTab, selectedDate]);
    
    // EmptyState если мало данных
    if (!insights.available) {
      return h('div', { className: 'insights-tab' },
        h('div', { className: 'insights-tab__header' },
          h('h2', { className: 'insights-tab__title' }, '🔮 Умная аналитика')
        ),
        h(EmptyState, { 
          daysAnalyzed: insights.daysAnalyzed || insights.daysWithData || 0,
          minRequired: insights.minDaysRequired || 3
        })
      );
    }
    
    return h('div', { className: 'insights-tab' },
      // Заголовок
      h('div', { className: 'insights-tab__header' },
        h('h2', { className: 'insights-tab__title' }, '🔮 Умная аналитика'),
        h('div', { className: 'insights-tab__subtitle' },
          activeTab === 'today' 
            ? 'Анализ за 7 дней' 
            : 'Глубокий анализ за 30 дней'
        )
      ),
      
      // Табы Сегодня/Неделя
      h('div', { className: 'insights-tab__tabs' },
        h('button', {
          className: 'insights-tab__tab' + (activeTab === 'today' ? ' active' : ''),
          onClick: () => setActiveTab('today')
        }, '📅 Сегодня'),
        h('button', {
          className: 'insights-tab__tab' + (activeTab === 'week' ? ' active' : ''),
          onClick: () => setActiveTab('week')
        }, '📊 Неделя')
      ),
      
      // === L0: Главное кольцо Health Score ===
      h('div', { className: 'insights-tab__score' },
        h(TotalHealthRing, {
          score: insights.healthScore.total,
          size: 160,
          strokeWidth: 14,
          debugData: insights.healthScore.debug || {
            mode: insights.healthScore.mode,
            weights: insights.healthScore.weights,
            breakdown: insights.healthScore.breakdown
          }
        })
      ),
      
      // === L0: 4 кольца категорий ===
      h('div', { className: 'insights-tab__rings' },
        h(HealthRingsGrid, {
          healthScore: insights.healthScore,
          onCategoryClick: setSelectedCategory,
          compact: false
        })
      ),
      
      // === METABOLIC INTELLIGENCE L0: Status Card ===
      h(MetabolicStatusCard, {
        lsGet,
        profile,
        pIndex,
        selectedDate
      }),
      
      // === METABOLIC INTELLIGENCE L1: Predictive Dashboard ===
      h(PredictiveDashboard, {
        lsGet,
        profile,
        selectedDate
      }),
      
      // === L1: What-If секция (collapsible) ===
      h(CollapsibleSection, {
        title: 'Что если...',
        icon: '🎯',
        badge: insights.whatIf?.length > 0 ? `${insights.whatIf.length} сценариев` : null,
        defaultOpen: true
      },
        h(WhatIfSection, { scenarios: insights.whatIf })
      ),
      
      // === L1: Метаболизм (научная аналитика) ===
      h(MetabolismSection, {
        lsGet,
        profile,
        pIndex,
        selectedDate
      }),
      
      // === L1: Паттерны (collapsible) ===
      insights.patterns?.length > 0 && h(CollapsibleSection, {
        title: 'Паттерны',
        icon: '🔍',
        badge: `${insights.patterns.filter(p => p.available).length} найдено`,
        defaultOpen: false
      },
        h(PatternsList, { patterns: insights.patterns })
      ),
      
      // === L1: Прогноз веса (collapsible) ===
      insights.weightPrediction && h(CollapsibleSection, {
        title: 'Прогноз веса',
        icon: '⚖️',
        badge: insights.weightPrediction.weeklyChange ? 
          `${insights.weightPrediction.weeklyChange > 0 ? '+' : ''}${insights.weightPrediction.weeklyChange.toFixed(1)} кг/нед` : null,
        defaultOpen: false
      },
        h(WeightPrediction, { prediction: insights.weightPrediction })
      ),
      
      // === L1: Итоги недели (только на вкладке "Неделя") ===
      activeTab === 'week' && insights.weeklyWrap && h(CollapsibleSection, {
        title: 'Итоги недели',
        icon: '📋',
        defaultOpen: true
      },
        h(WeeklyWrap, { wrap: insights.weeklyWrap })
      ),
      
      // === Footer: Confidence (v2.0: с InfoButton) ===
      h('div', { className: 'insights-tab__confidence' },
        h('span', { className: 'insights-tab__confidence-icon' }, '📊'),
        h('span', { className: 'insights-tab__confidence-text' },
          `Уверенность: ${insights.confidence || 50}% (${insights.daysWithData || 0} дней данных)`
        ),
        h(InfoButton, {
          infoKey: 'CONFIDENCE',
          debugData: {
            confidence: insights.confidence,
            daysWithData: insights.daysWithData,
            daysAnalyzed: insights.daysAnalyzed
          }
        })
      )
    );
  }

  // === INFO BUTTON — Кнопка ? с объяснением формулы ===
  
  /**
   * InfoButton — маленькая кнопка (?) рядом с метрикой
   * @param {string} infoKey — ключ из SCIENCE_INFO
   * @param {Object} debugData — дополнительные данные для отладки (опционально)
   * @param {string} size — 'small' для маленькой кнопки (в кольцах)
   */
  function InfoButton({ infoKey, debugData, size }) {
    const [isOpen, setIsOpen] = useState(false);
    
    const info = SCIENCE_INFO[infoKey];
    if (!info) return null;
    
    const handleButtonClick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (navigator.vibrate) navigator.vibrate(10);
      setIsOpen(true);
    };
    
    const handleOverlayClick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      setIsOpen(false);
    };
    
    const handleModalClick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Не закрываем при клике внутри модалки
    };
    
    const handleCloseClick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      setIsOpen(false);
    };
    
    // Рендерим модалку через Portal в body
    const modal = isOpen && ReactDOM.createPortal(
      h('div', { 
        className: 'info-modal-overlay', 
        onClick: handleOverlayClick,
        onTouchEnd: handleOverlayClick
      },
        h('div', { 
          className: 'info-modal', 
          onClick: handleModalClick,
          onTouchEnd: handleModalClick
        },
          // Header
          h('div', { className: 'info-modal__header' },
            h('span', { className: 'info-modal__title' }, info.name),
            h('button', { 
              className: 'info-modal__close', 
              onClick: handleCloseClick,
              onTouchEnd: handleCloseClick,
              type: 'button'
            }, '×')
          ),
          
          // Formula
          h('div', { className: 'info-modal__section' },
            h('div', { className: 'info-modal__label' }, '📐 Формула'),
            h('pre', { className: 'info-modal__formula' }, info.formula)
          ),
          
          // Source
          info.source && h('div', { className: 'info-modal__section' },
            h('div', { className: 'info-modal__label' }, '📚 Источник'),
            h('div', { className: 'info-modal__source' },
              info.pmid 
                ? h('a', {
                    href: `https://pubmed.ncbi.nlm.nih.gov/${info.pmid}/`,
                    target: '_blank',
                    rel: 'noopener noreferrer',
                    className: 'info-modal__link',
                    onClick: (e) => e.stopPropagation()
                  }, `${info.source} (PMID: ${info.pmid})`)
                : info.source
            )
          ),
          
          // Interpretation
          info.interpretation && h('div', { className: 'info-modal__section' },
            h('div', { className: 'info-modal__label' }, '💡 Интерпретация'),
            h('div', { className: 'info-modal__text' }, info.interpretation)
          ),
          
          // Debug data (for testing)
          debugData && h('div', { className: 'info-modal__section info-modal__section--debug' },
            h('div', { className: 'info-modal__label' }, '🔧 Debug'),
            h('pre', { className: 'info-modal__debug' },
              JSON.stringify(debugData, null, 2)
            )
          )
        )
      ),
      document.body
    );
    
    return h('span', { className: 'info-button-wrapper' },
      // Кнопка (?)
      h('button', {
        className: `info-button ${size === 'small' ? 'info-button--small' : ''}`,
        onClick: handleButtonClick,
        onTouchEnd: handleButtonClick,
        type: 'button',
        title: 'Как это считается?'
      }, '?'),
      modal
    );
  }

  /**
   * Метрика с кнопкой info — переиспользуемый компонент
   */
  function MetricWithInfo({ label, value, unit, infoKey, debugData, color, className }) {
    return h('div', { className: `metric-with-info ${className || ''}` },
      h('div', { className: 'metric-with-info__row' },
        h('span', { className: 'metric-with-info__label' }, label),
        h(InfoButton, { infoKey, debugData })
      ),
      h('div', { className: 'metric-with-info__value', style: color ? { color } : null },
        value,
        unit && h('span', { className: 'metric-with-info__unit' }, ` ${unit}`)
      )
    );
  }

  // === METABOLIC INTELLIGENCE UI COMPONENTS ===
  
  /**
   * MetabolicStatusCard — главная карточка метаболического статуса 0-100
   */
  function MetabolicStatusCard({ lsGet, profile, pIndex, selectedDate }) {
    const [showDetails, setShowDetails] = useState(false);
    
    const status = useMemo(() => {
      if (!HEYS.Metabolic?.getStatus) return null;
      
      return HEYS.Metabolic.getStatus({
        dateStr: selectedDate || new Date().toISOString().split('T')[0],
        pIndex: pIndex || window.HEYS?.products?.buildIndex?.(),
        profile: profile || window.HEYS?.utils?.lsGet?.('heys_profile', {}),
        forceRefresh: false
      });
    }, [lsGet, profile, pIndex, selectedDate]);
    
    if (!status || !status.available) {
      return h('div', { className: 'metabolic-status-card metabolic-status-card--empty' },
        h('div', { className: 'metabolic-status-card__icon' }, '📊'),
        h('div', { className: 'metabolic-status-card__message' },
          status?.message || 'Добавь данные для анализа статуса'
        )
      );
    }
    
    // Цвет по статусу
    const getStatusColor = (score) => {
      if (score >= 80) return '#22c55e'; // green
      if (score >= 60) return '#10b981'; // emerald
      if (score >= 40) return '#eab308'; // yellow
      return '#ef4444'; // red
    };
    
    const statusColor = getStatusColor(status.score);
    
    // Эмодзи по risk level
    const riskEmojis = {
      low: '✅',
      medium: '⚠️',
      high: '🚨'
    };
    
    return h('div', { className: `metabolic-status-card ${showDetails ? 'metabolic-status-card--expanded' : ''}` },
      // Заголовок
      h('div', { 
        className: 'metabolic-status-card__header',
        onClick: () => setShowDetails(!showDetails)
      },
        h('div', { className: 'metabolic-status-card__title' },
          h('span', { className: 'metabolic-status-card__icon' }, '💪'),
          h('span', { className: 'metabolic-status-card__label' }, 'Метаболический Статус')
        ),
        h('div', { className: 'metabolic-status-card__score-badge', style: { backgroundColor: statusColor } },
          status.score
        ),
        h('span', { className: 'metabolic-status-card__chevron' }, showDetails ? '▼' : '▶')
      ),
      
      // Краткая сводка
      h('div', { className: 'metabolic-status-card__summary' },
        // Metabolic Phase
        status.metabolicPhase && h('div', { className: 'metabolic-status-card__phase' },
          h('span', { className: 'metabolic-status-card__phase-emoji' }, status.metabolicPhase.emoji),
          h('span', { className: 'metabolic-status-card__phase-label' }, status.metabolicPhase.label),
          status.metabolicPhase.timeToLipolysis > 0 && h('span', { className: 'metabolic-status-card__phase-time' },
            ` → ${Math.round(status.metabolicPhase.timeToLipolysis * 60)} мин до липолиза`
          )
        ),
        
        // Risk Level
        h('div', { className: `metabolic-status-card__risk metabolic-status-card__risk--${status.riskLevel}` },
          h('span', { className: 'metabolic-status-card__risk-emoji' }, riskEmojis[status.riskLevel]),
          h('span', { className: 'metabolic-status-card__risk-label' },
            status.riskLevel === 'low' ? 'Низкий риск срыва' :
            status.riskLevel === 'medium' ? 'Средний риск срыва' :
            'Высокий риск срыва'
          )
        )
      ),
      
      // Детали (развернутые)
      showDetails && h('div', { className: 'metabolic-status-card__details' },
        // Причины снижения статуса
        status.reasons && status.reasons.length > 0 && h('div', { className: 'metabolic-status-card__section' },
          h('div', { className: 'metabolic-status-card__section-title' }, '📉 Что влияет на статус'),
          h('div', { className: 'metabolic-status-card__reasons' },
            status.reasons.map((reason, idx) =>
              h(ReasonCard, { key: reason.id || idx, reason })
            )
          )
        ),
        
        // Приоритизированные действия
        status.nextSteps && status.nextSteps.length > 0 && h('div', { className: 'metabolic-status-card__section' },
          h('div', { className: 'metabolic-status-card__section-title' }, '🎯 Приоритетные действия'),
          h('div', { className: 'metabolic-status-card__steps' },
            status.nextSteps.slice(0, 3).map((step, idx) =>
              h(ActionCard, { key: step.id || idx, step })
            )
          )
        ),
        
        // Риск факторы
        status.riskFactors && status.riskFactors.length > 0 && h('div', { className: 'metabolic-status-card__section' },
          h('div', { className: 'metabolic-status-card__section-title' }, 
            `${riskEmojis[status.riskLevel]} Факторы риска`
          ),
          h('div', { className: 'metabolic-status-card__risk-factors' },
            status.riskFactors.map((factor, idx) =>
              h('div', { key: factor.id || idx, className: 'metabolic-status-card__risk-factor' },
                h('span', { className: 'metabolic-status-card__risk-factor-label' }, factor.label),
                h('span', { className: 'metabolic-status-card__risk-factor-impact' }, `+${factor.impact}`)
              )
            )
          )
        ),
        
        // Confidence
        h('div', { className: 'metabolic-status-card__confidence' },
          h('span', { className: 'metabolic-status-card__confidence-label' }, 'Уверенность: '),
          h('span', { className: 'metabolic-status-card__confidence-value' },
            status.confidence === 'high' ? 'Высокая' :
            status.confidence === 'medium' ? 'Средняя' :
            'Низкая'
          ),
          status.debug?.inventory && h('span', { className: 'metabolic-status-card__confidence-pct' },
            ` (${status.debug.inventory.completeness}% данных)`
          )
        )
      )
    );
  }
  
  /**
   * ReasonCard — карточка причины снижения статуса
   */
  function ReasonCard({ reason }) {
    const [showScience, setShowScience] = useState(false);
    
    const pillarIcons = {
      nutrition: '🍽️',
      timing: '⏰',
      activity: '🏃',
      recovery: '😴'
    };
    
    return h('div', { className: `reason-card reason-card--${reason.pillar}` },
      h('div', { className: 'reason-card__header' },
        h('span', { className: 'reason-card__icon' }, pillarIcons[reason.pillar] || '📊'),
        h('span', { className: 'reason-card__label' }, reason.label),
        h('span', { className: 'reason-card__impact' }, `-${reason.impact}`)
      ),
      h('div', { className: 'reason-card__short' }, reason.short),
      reason.details && h('div', { className: 'reason-card__details' }, reason.details),
      reason.scientificBasis && h('div', { className: 'reason-card__science' },
        h('button', {
          className: 'reason-card__science-toggle',
          onClick: () => setShowScience(!showScience)
        }, showScience ? '📖 Скрыть обоснование' : '📖 Научное обоснование'),
        showScience && h('div', { className: 'reason-card__science-text' }, reason.scientificBasis)
      )
    );
  }
  
  /**
   * ActionCard — карточка приоритизированного действия
   */
  function ActionCard({ step }) {
    const priorityColors = {
      0: '#ef4444', // urgent
      1: '#f97316', // high
      2: '#eab308', // medium
      3: '#22c55e'  // low
    };
    
    const priorityLabels = {
      0: 'СРОЧНО',
      1: 'Важно',
      2: 'Желательно',
      3: 'Опционально'
    };
    
    return h('div', { className: 'action-card' },
      h('div', { className: 'action-card__header' },
        h('span', { className: 'action-card__label' }, step.label),
        h('span', { 
          className: 'action-card__priority',
          style: { backgroundColor: priorityColors[step.priority || 3] }
        }, priorityLabels[step.priority || 3])
      ),
      step.why && h('div', { className: 'action-card__why' }, step.why),
      h('div', { className: 'action-card__footer' },
        step.etaMin && h('span', { className: 'action-card__eta' },
          `⏱️ ${step.etaMin < 60 ? `${step.etaMin} мин` : `${Math.round(step.etaMin / 60)} ч`}`
        ),
        step.expectedEffect && h('span', { className: 'action-card__effect' },
          `💫 ${step.expectedEffect}`
        )
      )
    );
  }
  
  /**
   * PredictiveDashboard — предиктивная панель (crash risk, forecast)
   */
  function PredictiveDashboard({ lsGet, profile, selectedDate }) {
    const [showForecast, setShowForecast] = useState(false);
    
    const prediction = useMemo(() => {
      if (!HEYS.Metabolic?.calculateCrashRisk24h) return null;
      
      const history = HEYS.Metabolic.getDaysHistory ? HEYS.Metabolic.getDaysHistory(30) : [];
      
      return HEYS.Metabolic.calculateCrashRisk24h(
        selectedDate || new Date().toISOString().split('T')[0],
        profile || window.HEYS?.utils?.lsGet?.('heys_profile', {}),
        history
      );
    }, [lsGet, profile, selectedDate]);
    
    const forecast = useMemo(() => {
      if (!HEYS.Metabolic?.calculatePerformanceForecast) return null;
      
      const history = HEYS.Metabolic.getDaysHistory ? HEYS.Metabolic.getDaysHistory(30) : [];
      
      return HEYS.Metabolic.calculatePerformanceForecast(
        selectedDate || new Date().toISOString().split('T')[0],
        profile || window.HEYS?.utils?.lsGet?.('heys_profile', {}),
        history
      );
    }, [lsGet, profile, selectedDate]);
    
    if (!prediction || prediction.risk < 30) {
      // Не показываем если риск низкий
      return null;
    }
    
    const riskColors = {
      low: '#22c55e',
      medium: '#eab308',
      high: '#ef4444'
    };
    
    return h('div', { className: 'predictive-dashboard' },
      // Crash Risk Alert
      h('div', { 
        className: `crash-risk-alert crash-risk-alert--${prediction.riskLevel}`,
        style: { borderColor: riskColors[prediction.riskLevel] }
      },
        h('div', { className: 'crash-risk-alert__header' },
          h('span', { className: 'crash-risk-alert__icon' }, '🚨'),
          h('span', { className: 'crash-risk-alert__title' }, 'Прогноз риска срыва'),
          h('span', { 
            className: 'crash-risk-alert__risk',
            style: { color: riskColors[prediction.riskLevel] }
          }, `${prediction.risk}%`)
        ),
        
        prediction.primaryTrigger && h('div', { className: 'crash-risk-alert__trigger' },
          h('strong', null, 'Главный триггер: '),
          prediction.primaryTrigger.label
        ),
        
        prediction.preventionStrategy && prediction.preventionStrategy.length > 0 && h('div', { className: 'crash-risk-alert__prevention' },
          h('div', { className: 'crash-risk-alert__prevention-title' }, '🛡️ Профилактика:'),
          prediction.preventionStrategy.slice(0, 2).map((strategy, idx) =>
            h('div', { key: idx, className: 'crash-risk-alert__strategy' },
              `${idx + 1}. ${strategy.action} — ${strategy.reason}`
            )
          )
        )
      ),
      
      // Tomorrow Forecast (collapsible)
      forecast && h('div', { className: 'tomorrow-forecast' },
        h('div', {
          className: 'tomorrow-forecast__header',
          onClick: () => setShowForecast(!showForecast)
        },
          h('span', { className: 'tomorrow-forecast__title' }, '🔮 Прогноз на завтра'),
          h('span', { className: 'tomorrow-forecast__chevron' }, showForecast ? '▼' : '▶')
        ),
        
        showForecast && h('div', { className: 'tomorrow-forecast__content' },
          // Energy Windows
          forecast.energyWindows && h('div', { className: 'tomorrow-forecast__windows' },
            h('div', { className: 'tomorrow-forecast__windows-title' }, '⚡ Окна энергии'),
            forecast.energyWindows.map((window, idx) =>
              h('div', { 
                key: idx, 
                className: `energy-window ${window.optimal ? 'energy-window--optimal' : ''}`
              },
                h('div', { className: 'energy-window__period' }, window.period),
                h('div', { className: 'energy-window__label' }, window.label),
                h('div', { className: 'energy-window__recommendation' }, window.recommendation)
              )
            )
          ),
          
          // Training Window
          forecast.trainingWindow && h('div', { className: 'tomorrow-forecast__training' },
            h('div', { className: 'tomorrow-forecast__training-title' }, '🏋️ Лучшее время для тренировки'),
            h('div', { className: 'tomorrow-forecast__training-time' }, forecast.trainingWindow.time),
            h('div', { className: 'tomorrow-forecast__training-reason' }, forecast.trainingWindow.reason)
          )
        )
      )
    );
  }
  
  // Добавляем компоненты в экспорт
  HEYS.PredictiveInsights.components = {
    HealthRing,
    TotalHealthRing,
    HealthRingsGrid,
    PatternCard,
    PatternsList,
    ScenarioCard,
    WhatIfSection,
    WeightPrediction,
    WeeklyWrap,
    EmptyState,
    InsightsCard,
    InsightsTab,
    // Новые компоненты
    CollapsibleSection,
    MetabolismCard,
    MetabolismSection,
    // v2.0: Info компоненты
    InfoButton,
    MetricWithInfo,
    // Metabolic Intelligence компоненты
    MetabolicStatusCard,
    ReasonCard,
    ActionCard,
    PredictiveDashboard
  };
  
  // Debug в консоли
  if (typeof window !== 'undefined') {
    window.debugPredictiveInsights = () => {
      const result = HEYS.PredictiveInsights.analyze();
      console.log('🔮 Predictive Insights:', result);
      return result;
    };
    
    window.debugMetabolicStatus = () => {
      if (!HEYS.Metabolic?.getStatus) {
        console.error('❌ HEYS.Metabolic not loaded');
        return null;
      }
      
      const result = HEYS.Metabolic.getStatus();
      console.log('💪 Metabolic Status:', result);
      return result;
    };
  }
  
})(typeof window !== 'undefined' ? window : global);
