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

  function HealthRingsGrid({ healthScore, onCategoryClick, compact }) {
    if (!healthScore || !healthScore.breakdown) return null;
    
    const categories = [
      { key: 'nutrition', label: 'Питание', color: '#22c55e', infoKey: 'CATEGORY_NUTRITION' },
      { key: 'timing', label: 'Тайминг', color: '#3b82f6', infoKey: 'CATEGORY_TIMING' },
      { key: 'activity', label: 'Активность', color: '#f59e0b', infoKey: 'CATEGORY_ACTIVITY' },
      { key: 'recovery', label: 'Восстановление', color: '#8b5cf6', infoKey: 'CATEGORY_RECOVERY' }
    ];
    
    // Compact mode: карточки с мини-кольцами
    if (compact) {
      return h('div', { className: 'insights-rings-grid' },
        categories.map(cat => {
          const score = healthScore.breakdown[cat.key]?.score || 0;
          const radius = 18;
          const circumference = 2 * Math.PI * radius;
          const offset = circumference - (score / 100) * circumference;
          
          return h('div', { 
            key: cat.key,
            className: `insights-ring-card insights-ring-card--${cat.key}`,
            onClick: () => onCategoryClick && onCategoryClick(cat.key)
          },
            // Mini ring
            h('div', { className: 'insights-ring-card__ring' },
              h('svg', { width: 48, height: 48, viewBox: '0 0 48 48' },
                h('circle', {
                  cx: 24, cy: 24, r: radius,
                  fill: 'none',
                  stroke: 'rgba(0,0,0,0.06)',
                  strokeWidth: 4
                }),
                h('circle', {
                  cx: 24, cy: 24, r: radius,
                  fill: 'none',
                  stroke: cat.color,
                  strokeWidth: 4,
                  strokeLinecap: 'round',
                  strokeDasharray: circumference,
                  strokeDashoffset: offset,
                  style: { transition: 'stroke-dashoffset 0.8s ease' }
                })
              ),
              h('span', { className: 'insights-ring-card__value' }, Math.round(score))
            ),
            // Info
            h('div', { className: 'insights-ring-card__info' },
              h('div', { className: 'insights-ring-card__label' }, cat.label),
              h('div', { className: 'insights-ring-card__title' }, 
                score >= 80 ? 'Отлично' : score >= 60 ? 'Хорошо' : score >= 40 ? 'Норма' : 'Улучшить'
              )
            )
          );
        })
      );
    }
    
    // Full mode: стандартные кольца
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
        h('div', { className: 'insights-tab__hero' },
          h('div', { className: 'insights-tab__header' },
            h('h2', { className: 'insights-tab__title' }, '🔮 Умная аналитика')
          )
        ),
        h('div', { className: 'insights-tab__content' },
          h(EmptyState, { 
            daysAnalyzed: insights.daysAnalyzed || insights.daysWithData || 0,
            minRequired: insights.minDaysRequired || 3
          })
        )
      );
    }
    
    return h('div', { className: 'insights-tab' },
      // === HERO HEADER ===
      h('div', { className: 'insights-tab__hero' },
        h('div', { className: 'insights-tab__header' },
          h('h2', { className: 'insights-tab__title' }, '🔮 Умная аналитика'),
          h('div', { className: 'insights-tab__subtitle' },
            activeTab === 'today' 
              ? 'Анализ за 7 дней' 
              : 'Глубокий анализ за 30 дней'
          )
        ),
        
        // Glass Tabs внутри hero
        h('div', { className: 'insights-tab__tabs' },
          h('button', {
            className: 'insights-tab__tab' + (activeTab === 'today' ? ' active' : ''),
            onClick: () => setActiveTab('today')
          }, '📅 Сегодня'),
          h('button', {
            className: 'insights-tab__tab' + (activeTab === 'week' ? ' active' : ''),
            onClick: () => setActiveTab('week')
          }, '📊 Неделя')
        )
      ),
      
      // === MAIN CONTENT ===
      h('div', { className: 'insights-tab__content' },
        
        // L0: Health Score Card (floating)
        h('div', { className: 'insights-tab__score-card' },
          h('div', { className: 'insights-tab__score' },
            h(TotalHealthRing, {
              score: insights.healthScore.total,
              size: 140,
              strokeWidth: 12,
              debugData: insights.healthScore.debug || {
                mode: insights.healthScore.mode,
                weights: insights.healthScore.weights,
                breakdown: insights.healthScore.breakdown
              }
            })
          )
        ),
        
        // L0: 4 кольца категорий (compact grid)
        h('div', { className: 'insights-tab__rings' },
          h(HealthRingsGrid, {
            healthScore: insights.healthScore,
            onCategoryClick: setSelectedCategory,
            compact: true
          })
        ),
        
        // Divider
        h('div', { className: 'insights-tab__divider' }),
        
        // Section: Metabolic Status + Risk (compact row)
        h(MetabolicQuickStatus, {
          lsGet,
          profile,
          pIndex,
          selectedDate
        }),
        
        // Data Completeness
        h(DataCompletenessCard, {
          lsGet,
          selectedDate
        }),
        
        // Meal Timing
        h(MealTimingCard, {
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
      
      ) // закрытие insights-tab__content
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
   * StatusProgressRing — SVG кольцо прогресса 0-100 с count-up анимацией
   */
  function StatusProgressRing({ score, size = 120, strokeWidth = 10 }) {
    const [displayScore, setDisplayScore] = useState(0);
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const progress = (displayScore / 100) * circumference;
    const offset = circumference - progress;
    
    // Count-up анимация при изменении score
    useEffect(() => {
      const duration = 1500; // ms
      const start = displayScore;
      const diff = score - start;
      const startTime = performance.now();
      
      const animate = (currentTime) => {
        const elapsed = currentTime - startTime;
        const t = Math.min(elapsed / duration, 1);
        // Ease out cubic
        const eased = 1 - Math.pow(1 - t, 3);
        const current = Math.round(start + diff * eased);
        setDisplayScore(current);
        
        if (t < 1) {
          requestAnimationFrame(animate);
        }
      };
      
      requestAnimationFrame(animate);
    }, [score]);
    
    // Градиентный цвет по score (0-100)
    const getGradientColor = (s) => {
      if (s >= 85) return { start: '#10b981', end: '#22c55e' }; // emerald → green
      if (s >= 70) return { start: '#22c55e', end: '#84cc16' }; // green → lime
      if (s >= 50) return { start: '#eab308', end: '#f59e0b' }; // yellow → amber
      if (s >= 30) return { start: '#f59e0b', end: '#ef4444' }; // amber → red
      return { start: '#ef4444', end: '#dc2626' }; // red shades
    };
    
    const colors = getGradientColor(displayScore);
    const gradientId = 'statusGradient' + Math.random().toString(36).substr(2, 9);
    
    return h('svg', {
      width: size,
      height: size,
      className: 'status-progress-ring',
      viewBox: `0 0 ${size} ${size}`
    },
      // Gradient definition
      h('defs', null,
        h('linearGradient', { id: gradientId, x1: '0%', y1: '0%', x2: '100%', y2: '100%' },
          h('stop', { offset: '0%', stopColor: colors.start }),
          h('stop', { offset: '100%', stopColor: colors.end })
        )
      ),
      // Background circle
      h('circle', {
        cx: size / 2,
        cy: size / 2,
        r: radius,
        fill: 'none',
        stroke: 'var(--border-color, #e2e8f0)',
        strokeWidth: strokeWidth
      }),
      // Progress circle
      h('circle', {
        cx: size / 2,
        cy: size / 2,
        r: radius,
        fill: 'none',
        stroke: `url(#${gradientId})`,
        strokeWidth: strokeWidth,
        strokeLinecap: 'round',
        strokeDasharray: circumference,
        strokeDashoffset: offset,
        transform: `rotate(-90 ${size / 2} ${size / 2})`,
        style: { transition: 'stroke-dashoffset 0.1s ease' }
      }),
      // Score text
      h('text', {
        x: size / 2,
        y: size / 2,
        textAnchor: 'middle',
        dominantBaseline: 'middle',
        className: 'status-progress-ring__score',
        style: { 
          fontSize: size * 0.28,
          fontWeight: 700,
          fill: 'var(--text-primary, #0f172a)'
        }
      }, displayScore),
      // Label
      h('text', {
        x: size / 2,
        y: size / 2 + size * 0.18,
        textAnchor: 'middle',
        className: 'status-progress-ring__label',
        style: {
          fontSize: size * 0.1,
          fill: 'var(--text-secondary, #64748b)'
        }
      }, 'из 100')
    );
  }
  
  /**
   * StatusTrendBadge — тренд ↑/↓ относительно вчера
   */
  function StatusTrendBadge({ currentScore, prevScore }) {
    if (prevScore === null || prevScore === undefined) return null;
    
    const diff = currentScore - prevScore;
    if (diff === 0) return null;
    
    const isUp = diff > 0;
    const absDiff = Math.abs(diff);
    
    return h('div', { 
      className: `status-trend-badge status-trend-badge--${isUp ? 'up' : 'down'}`
    },
      h('span', { className: 'status-trend-badge__arrow' }, isUp ? '↑' : '↓'),
      h('span', { className: 'status-trend-badge__value' }, absDiff),
      h('span', { className: 'status-trend-badge__label' }, 'vs вчера')
    );
  }
  
  /**
   * PillarBreakdownBars — breakdown по столпам (nutrition/timing/activity/recovery)
   */
  function PillarBreakdownBars({ pillars }) {
    if (!pillars || Object.keys(pillars).length === 0) return null;
    
    const pillarConfig = {
      nutrition: { label: 'Питание', icon: '🍽️', color: '#22c55e' },
      timing: { label: 'Тайминг', icon: '⏰', color: '#3b82f6' },
      activity: { label: 'Активность', icon: '🏃', color: '#f59e0b' },
      recovery: { label: 'Восстановление', icon: '😴', color: '#8b5cf6' }
    };
    
    return h('div', { className: 'pillar-breakdown-bars' },
      Object.entries(pillars).map(([key, value]) => {
        const config = pillarConfig[key] || { label: key, icon: '📊', color: '#64748b' };
        const pct = Math.min(100, Math.max(0, value));
        
        return h('div', { key, className: 'pillar-breakdown-bars__item' },
          h('div', { className: 'pillar-breakdown-bars__header' },
            h('span', { className: 'pillar-breakdown-bars__icon' }, config.icon),
            h('span', { className: 'pillar-breakdown-bars__label' }, config.label),
            h('span', { className: 'pillar-breakdown-bars__value' }, `${Math.round(pct)}%`)
          ),
          h('div', { className: 'pillar-breakdown-bars__track' },
            h('div', { 
              className: 'pillar-breakdown-bars__fill',
              style: { 
                width: `${pct}%`,
                backgroundColor: config.color
              }
            })
          )
        );
      })
    );
  }
  
  /**
   * ConfidenceBadge — бейдж уверенности (low/medium/high)
   */
  function ConfidenceBadge({ confidence, completeness }) {
    const config = {
      high: { label: 'Высокая', color: '#22c55e', icon: '✓' },
      medium: { label: 'Средняя', color: '#eab308', icon: '~' },
      low: { label: 'Низкая', color: '#ef4444', icon: '?' }
    };
    
    const c = config[confidence] || config.low;
    
    return h('div', { 
      className: 'confidence-badge',
      style: { borderColor: c.color }
    },
      h('span', { 
        className: 'confidence-badge__icon',
        style: { backgroundColor: c.color }
      }, c.icon),
      h('span', { className: 'confidence-badge__label' }, 
        `${c.label} уверенность`
      ),
      completeness !== undefined && h('span', { className: 'confidence-badge__pct' },
        ` (${completeness}% данных)`
      )
    );
  }
  
  /**
   * MetabolicQuickStatus — компактная карточка статуса + риска
   * Показывает: Score 0-100, фазу метаболизма, риск срыва
   */
  function MetabolicQuickStatus({ lsGet, profile, pIndex, selectedDate }) {
    const status = useMemo(() => {
      if (!HEYS.Metabolic?.getStatus) return null;
      
      return HEYS.Metabolic.getStatus({
        dateStr: selectedDate || new Date().toISOString().split('T')[0],
        pIndex: pIndex || window.HEYS?.products?.buildIndex?.(),
        profile: profile || window.HEYS?.utils?.lsGet?.('heys_profile', {}),
        forceRefresh: false
      });
    }, [lsGet, profile, pIndex, selectedDate]);
    
    // Use riskLevel from status (same source as PredictiveDashboard)
    const risk = useMemo(() => {
      const riskData = {
        low: { level: 'low', emoji: '✅', label: 'Низкий', color: '#22c55e' },
        medium: { level: 'medium', emoji: '⚠️', label: 'Средний', color: '#eab308' },
        high: { level: 'high', emoji: '🚨', label: 'Высокий', color: '#ef4444' }
      };
      
      // Use status.riskLevel from Metabolic module (единый источник)
      const level = status?.riskLevel || 'low';
      return riskData[level] || riskData.low;
    }, [status]);
    
    // Phase data
    const phase = status?.metabolicPhase || null;
    
    // Empty state
    if (!status?.available) {
      return h('div', { className: 'metabolic-quick-status metabolic-quick-status--empty' },
        h('div', { className: 'metabolic-quick-status__card' },
          h('div', { className: 'metabolic-quick-status__empty-icon' }, '📊'),
          h('div', { className: 'metabolic-quick-status__empty-text' }, 'Добавь данные')
        ),
        h('div', { className: 'metabolic-quick-status__card' },
          h('div', { className: 'metabolic-quick-status__empty-icon' }, '✅'),
          h('div', { className: 'metabolic-quick-status__empty-text' }, 'Риск срыва'),
          h('div', { className: 'metabolic-quick-status__empty-label' }, 'Низкий')
        )
      );
    }
    
    // Score color
    const getScoreColor = (score) => {
      if (score >= 80) return '#22c55e';
      if (score >= 60) return '#84cc16';
      if (score >= 40) return '#eab308';
      return '#ef4444';
    };
    
    return h('div', { className: 'metabolic-quick-status' },
      // Card 1: Status Score
      h('div', { className: 'metabolic-quick-status__card' },
        h('div', { className: 'metabolic-quick-status__score', style: { color: getScoreColor(status.score) } },
          status.score
        ),
        h('div', { className: 'metabolic-quick-status__score-label' }, 'Метаболизм'),
        phase && h('div', { className: 'metabolic-quick-status__phase' },
          h('span', { className: 'metabolic-quick-status__phase-emoji' }, phase.emoji || '⚡'),
          h('span', { className: 'metabolic-quick-status__phase-text' }, phase.label || phase.phase)
        ),
        phase?.timeToLipolysis > 0 && h('div', { className: 'metabolic-quick-status__time' },
          `→ ${Math.round(phase.timeToLipolysis * 60)} мин`
        ),
        phase?.isLipolysis && h('div', { className: 'metabolic-quick-status__lipolysis' }, '🔥 Жиросжигание')
      ),
      
      // Card 2: Risk
      h('div', { className: `metabolic-quick-status__card metabolic-quick-status__card--${risk.level}` },
        h('div', { className: 'metabolic-quick-status__risk-indicator' },
          h('div', { className: 'metabolic-quick-status__light metabolic-quick-status__light--green', 
            style: { opacity: risk.level === 'low' ? 1 : 0.2 } }),
          h('div', { className: 'metabolic-quick-status__light metabolic-quick-status__light--yellow', 
            style: { opacity: risk.level === 'medium' ? 1 : 0.2 } }),
          h('div', { className: 'metabolic-quick-status__light metabolic-quick-status__light--red', 
            style: { opacity: risk.level === 'high' ? 1 : 0.2 } })
        ),
        h('div', { className: 'metabolic-quick-status__risk-label' },
          h('span', null, risk.emoji),
          'Риск срыва'
        ),
        h('div', { className: 'metabolic-quick-status__risk-level', style: { color: risk.color } },
          risk.label
        )
      )
    );
  }

  /**
   * MetabolicStatusCard — главная карточка метаболического статуса 0-100
   * v2.0: с ring animation, trend, breakdown bars, confidence badge
   */
  function MetabolicStatusCard({ lsGet, profile, pIndex, selectedDate }) {
    const [showDetails, setShowDetails] = useState(false);
    
    // Получаем текущий статус
    const status = useMemo(() => {
      if (!HEYS.Metabolic?.getStatus) return null;
      
      return HEYS.Metabolic.getStatus({
        dateStr: selectedDate || new Date().toISOString().split('T')[0],
        pIndex: pIndex || window.HEYS?.products?.buildIndex?.(),
        profile: profile || window.HEYS?.utils?.lsGet?.('heys_profile', {}),
        forceRefresh: false
      });
    }, [lsGet, profile, pIndex, selectedDate]);
    
    // Получаем вчерашний статус для тренда
    const prevStatus = useMemo(() => {
      if (!HEYS.Metabolic?.getStatus) return null;
      
      const today = selectedDate || new Date().toISOString().split('T')[0];
      const prevDate = new Date(today);
      prevDate.setDate(prevDate.getDate() - 1);
      const prevDateStr = prevDate.toISOString().split('T')[0];
      
      try {
        return HEYS.Metabolic.getStatus({
          dateStr: prevDateStr,
          pIndex: pIndex || window.HEYS?.products?.buildIndex?.(),
          profile: profile || window.HEYS?.utils?.lsGet?.('heys_profile', {}),
          forceRefresh: false
        });
      } catch {
        return null;
      }
    }, [lsGet, profile, pIndex, selectedDate]);
    
    // Вычисляем breakdown по столпам из reasons
    const pillarScores = useMemo(() => {
      if (!status?.reasons?.length) return null;
      
      const pillars = { nutrition: 100, timing: 100, activity: 100, recovery: 100 };
      status.reasons.forEach(r => {
        if (r.pillar && pillars[r.pillar] !== undefined) {
          pillars[r.pillar] = Math.max(0, pillars[r.pillar] - (r.impact || 10));
        }
      });
      return pillars;
    }, [status]);
    
    if (!status || !status.available) {
      return h('div', { className: 'metabolic-status-card metabolic-status-card--empty' },
        h('div', { className: 'metabolic-status-card__icon' }, '📊'),
        h('div', { className: 'metabolic-status-card__message' },
          status?.message || 'Добавь данные для анализа статуса'
        )
      );
    }
    
    // Эмодзи по risk level
    const riskEmojis = {
      low: '✅',
      medium: '⚠️',
      high: '🚨'
    };
    
    return h('div', { className: `metabolic-status-card metabolic-status-card--v2 ${showDetails ? 'metabolic-status-card--expanded' : ''}` },
      // Заголовок с ring и trend
      h('div', { 
        className: 'metabolic-status-card__header metabolic-status-card__header--v2',
        onClick: () => setShowDetails(!showDetails)
      },
        h('div', { className: 'metabolic-status-card__ring-container' },
          h(StatusProgressRing, { score: status.score, size: 100, strokeWidth: 8 }),
          prevStatus?.available && h(StatusTrendBadge, { 
            currentScore: status.score, 
            prevScore: prevStatus.score 
          })
        ),
        h('div', { className: 'metabolic-status-card__info' },
          h('div', { className: 'metabolic-status-card__title-v2' }, 'Метаболический Статус'),
          // Metabolic Phase
          status.metabolicPhase && h('div', { className: 'metabolic-status-card__phase' },
            h('span', { className: 'metabolic-status-card__phase-emoji' }, status.metabolicPhase.emoji),
            h('span', { className: 'metabolic-status-card__phase-label' }, status.metabolicPhase.label),
            status.metabolicPhase.timeToLipolysis > 0 && h('span', { className: 'metabolic-status-card__phase-time' },
              ` → ${Math.round(status.metabolicPhase.timeToLipolysis * 60)} мин`
            )
          ),
          // Risk Level
          h('div', { className: `metabolic-status-card__risk metabolic-status-card__risk--${status.riskLevel}` },
            h('span', { className: 'metabolic-status-card__risk-emoji' }, riskEmojis[status.riskLevel]),
            h('span', { className: 'metabolic-status-card__risk-label' },
              status.riskLevel === 'low' ? 'Низкий риск' :
              status.riskLevel === 'medium' ? 'Средний риск' :
              'Высокий риск'
            )
          )
        ),
        h('span', { className: 'metabolic-status-card__chevron' }, showDetails ? '▼' : '▶')
      ),
      
      // Breakdown по столпам (всегда видим)
      pillarScores && h('div', { className: 'metabolic-status-card__breakdown' },
        h(PillarBreakdownBars, { pillars: pillarScores })
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
        
        // Confidence Badge
        h('div', { className: 'metabolic-status-card__confidence-section' },
          h(ConfidenceBadge, { 
            confidence: status.confidence,
            completeness: status.debug?.inventory?.completeness 
          })
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
   * PredictiveDashboard — предиктивная панель с табами (Risk | Forecast | Phenotype)
   * v2.0: tabs, timeline navigation
   */
  function PredictiveDashboard({ lsGet, profile, selectedDate, pIndex }) {
    const [activeTab, setActiveTab] = useState('risk');
    const [dateOffset, setDateOffset] = useState(0); // -7..+7 дней
    const [showForecast, setShowForecast] = useState(false);
    
    // Вычисляем дату с offset
    const viewDate = useMemo(() => {
      const base = selectedDate ? new Date(selectedDate) : new Date();
      base.setDate(base.getDate() + dateOffset);
      return base.toISOString().split('T')[0];
    }, [selectedDate, dateOffset]);
    
    const isToday = dateOffset === 0;
    const isFuture = dateOffset > 0;
    const isPast = dateOffset < 0;
    
    const prediction = useMemo(() => {
      if (!HEYS.Metabolic?.calculateCrashRisk24h) return null;
      
      const history = HEYS.Metabolic.getDaysHistory ? HEYS.Metabolic.getDaysHistory(30) : [];
      
      return HEYS.Metabolic.calculateCrashRisk24h(
        viewDate,
        profile || window.HEYS?.utils?.lsGet?.('heys_profile', {}),
        history
      );
    }, [lsGet, profile, viewDate]);
    
    const forecast = useMemo(() => {
      if (!HEYS.Metabolic?.calculatePerformanceForecast) return null;
      
      const history = HEYS.Metabolic.getDaysHistory ? HEYS.Metabolic.getDaysHistory(30) : [];
      
      return HEYS.Metabolic.calculatePerformanceForecast(
        viewDate,
        profile || window.HEYS?.utils?.lsGet?.('heys_profile', {}),
        history
      );
    }, [lsGet, profile, viewDate]);
    
    const phenotype = useMemo(() => {
      if (!HEYS.Metabolic?.identifyPhenotype) return null;
      
      const history = HEYS.Metabolic.getDaysHistory ? HEYS.Metabolic.getDaysHistory(30) : [];
      if (history.length < 7) return null;
      
      try {
        return HEYS.Metabolic.identifyPhenotype(
          profile || window.HEYS?.utils?.lsGet?.('heys_profile', {}),
          history
        );
      } catch {
        return null;
      }
    }, [lsGet, profile]);
    
    const riskColors = {
      low: '#22c55e',
      medium: '#eab308',
      high: '#ef4444'
    };
    
    // Форматирование даты для timeline
    const formatTimelineDate = (offset) => {
      const d = new Date(selectedDate || new Date());
      d.setDate(d.getDate() + offset);
      const day = d.getDate();
      const weekday = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'][d.getDay()];
      if (offset === 0) return 'Сегодня';
      if (offset === 1) return 'Завтра';
      if (offset === -1) return 'Вчера';
      return `${weekday} ${day}`;
    };
    
    const tabs = [
      { id: 'risk', label: '🚨 Риск', badge: prediction?.risk > 30 ? prediction.risk + '%' : null },
      { id: 'forecast', label: '🔮 Прогноз', badge: null },
      { id: 'phenotype', label: '🧬 Фенотип', badge: phenotype?.type ? phenotype.typeEmoji : null }
    ];
    
    return h('div', { className: 'predictive-dashboard predictive-dashboard--v2' },
      // Timeline Navigation
      h('div', { className: 'predictive-dashboard__timeline' },
        h('button', { 
          className: 'predictive-dashboard__timeline-btn',
          disabled: dateOffset <= -7,
          onClick: () => setDateOffset(d => Math.max(-7, d - 1))
        }, '←'),
        h('div', { className: 'predictive-dashboard__timeline-dates' },
          [-3, -2, -1, 0, 1, 2, 3].map(offset =>
            h('button', {
              key: offset,
              className: `predictive-dashboard__timeline-date ${dateOffset === offset ? 'predictive-dashboard__timeline-date--active' : ''} ${offset === 0 ? 'predictive-dashboard__timeline-date--today' : ''}`,
              onClick: () => setDateOffset(offset)
            }, formatTimelineDate(offset))
          )
        ),
        h('button', { 
          className: 'predictive-dashboard__timeline-btn',
          disabled: dateOffset >= 7,
          onClick: () => setDateOffset(d => Math.min(7, d + 1))
        }, '→')
      ),
      
      // Tabs
      h('div', { className: 'predictive-dashboard__tabs' },
        tabs.map(tab =>
          h('button', {
            key: tab.id,
            className: `predictive-dashboard__tab ${activeTab === tab.id ? 'predictive-dashboard__tab--active' : ''}`,
            onClick: () => setActiveTab(tab.id)
          },
            h('span', { className: 'predictive-dashboard__tab-label' }, tab.label),
            tab.badge && h('span', { className: 'predictive-dashboard__tab-badge' }, tab.badge)
          )
        )
      ),
      
      // Tab Content
      h('div', { className: 'predictive-dashboard__content' },
        // RISK TAB
        activeTab === 'risk' && h('div', { className: 'predictive-dashboard__panel' },
          prediction ? h(RiskPanel, { prediction, riskColors, isPast, isFuture }) : 
            h('div', { className: 'predictive-dashboard__empty' }, 'Нет данных для анализа риска')
        ),
        
        // FORECAST TAB
        activeTab === 'forecast' && h('div', { className: 'predictive-dashboard__panel' },
          forecast ? h(ForecastPanel, { forecast, isPast }) :
            h('div', { className: 'predictive-dashboard__empty' }, 'Нет данных для прогноза')
        ),
        
        // PHENOTYPE TAB
        activeTab === 'phenotype' && h('div', { className: 'predictive-dashboard__panel' },
          phenotype ? h(PhenotypePanel, { phenotype }) :
            h('div', { className: 'predictive-dashboard__empty' }, 
              'Нужно минимум 7 дней данных для определения фенотипа'
            )
        )
      )
    );
  }
  
  /**
   * RiskPanel — содержимое таба Risk
   */
  function RiskPanel({ prediction, riskColors, isPast, isFuture }) {
    const riskLevel = prediction.riskLevel || (prediction.risk < 30 ? 'low' : prediction.risk < 60 ? 'medium' : 'high');
    
    // Генерируем predictionId для feedback
    const predictionId = prediction.id || `risk_${prediction.date || Date.now()}`;
    
    return h('div', { className: 'risk-panel' },
      // Risk Meter (gauge)
      h('div', { className: 'risk-panel__meter' },
        h(RiskMeter, { risk: prediction.risk, riskLevel })
      ),
      
      // Status with inline feedback
      h('div', { className: 'risk-panel__status-row' },
        h('div', { className: 'risk-panel__status' },
          isPast ? '📊 Анализ прошлого дня' :
          isFuture ? '🔮 Прогноз на будущее' :
          prediction.risk >= 30 ? '⚠️ Требует внимания' : '✅ Всё под контролем'
        ),
        // Inline feedback для прошлых дней
        isPast && h(FeedbackPrompt, { predictionId, type: 'risk', compact: true })
      ),
      
      // Primary Trigger
      prediction.primaryTrigger && h('div', { className: 'risk-panel__trigger' },
        h('div', { className: 'risk-panel__trigger-label' }, 'Главный триггер:'),
        h('div', { className: 'risk-panel__trigger-value' }, prediction.primaryTrigger.label)
      ),
      
      // Prevention Strategies
      prediction.preventionStrategy && prediction.preventionStrategy.length > 0 && h('div', { className: 'risk-panel__prevention' },
        h('div', { className: 'risk-panel__prevention-title' }, '🛡️ Профилактика'),
        prediction.preventionStrategy.slice(0, 3).map((strategy, idx) =>
          h('div', { key: idx, className: 'risk-panel__strategy' },
            h('span', { className: 'risk-panel__strategy-num' }, idx + 1),
            h('div', { className: 'risk-panel__strategy-content' },
              h('div', { className: 'risk-panel__strategy-action' }, strategy.action),
              h('div', { className: 'risk-panel__strategy-reason' }, strategy.reason)
            )
          )
        )
      ),
      
      // Risk Factors
      prediction.factors && prediction.factors.length > 0 && h('div', { className: 'risk-panel__factors' },
        h('div', { className: 'risk-panel__factors-title' }, '📋 Факторы риска'),
        prediction.factors.slice(0, 5).map((factor, idx) =>
          h('div', { key: idx, className: 'risk-panel__factor' },
            h('span', { className: 'risk-panel__factor-label' }, factor.label),
            h('span', { className: 'risk-panel__factor-weight' }, `+${factor.weight || factor.impact}`)
          )
        )
      ),
      
      // Full feedback widget for past days
      isPast && prediction.risk >= 30 && h(FeedbackWidget, { 
        predictionType: 'crash_risk',
        predictionId
      })
    );
  }
  
  /**
   * RiskMeter — визуальный спидометр риска 0-100%
   */
  function RiskMeter({ risk, riskLevel }) {
    const size = 160;
    const strokeWidth = 12;
    const radius = (size - strokeWidth) / 2;
    // Полукруг (180 градусов)
    const halfCircumference = Math.PI * radius;
    const progress = (risk / 100) * halfCircumference;
    const offset = halfCircumference - progress;
    
    const colors = {
      low: '#22c55e',
      medium: '#eab308',
      high: '#ef4444'
    };
    
    return h('div', { className: 'risk-meter', style: { width: size, height: size / 2 + 30 } },
      h('svg', {
        viewBox: `0 0 ${size} ${size / 2 + 20}`,
        className: 'risk-meter__svg'
      },
        // Background arc
        h('path', {
          d: `M ${strokeWidth / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${size / 2}`,
          fill: 'none',
          stroke: 'var(--border-color, #e2e8f0)',
          strokeWidth: strokeWidth,
          strokeLinecap: 'round'
        }),
        // Progress arc
        h('path', {
          d: `M ${strokeWidth / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${size / 2}`,
          fill: 'none',
          stroke: colors[riskLevel] || colors.medium,
          strokeWidth: strokeWidth,
          strokeLinecap: 'round',
          strokeDasharray: halfCircumference,
          strokeDashoffset: offset,
          style: { transition: 'stroke-dashoffset 0.6s ease' }
        }),
        // Value text
        h('text', {
          x: size / 2,
          y: size / 2 - 5,
          textAnchor: 'middle',
          className: 'risk-meter__value',
          style: { 
            fontSize: 36,
            fontWeight: 700,
            fill: colors[riskLevel] || 'var(--text-primary)'
          }
        }, `${risk}%`),
        // Label
        h('text', {
          x: size / 2,
          y: size / 2 + 20,
          textAnchor: 'middle',
          className: 'risk-meter__label',
          style: { fontSize: 12, fill: 'var(--text-secondary, #64748b)' }
        }, 'Риск срыва')
      )
    );
  }
  
  /**
   * ForecastPanel — содержимое таба Forecast
   * Интегрирован с InsulinWave для показа окон еды
   */
  function ForecastPanel({ forecast, isPast }) {
    // 🆕 Получаем данные инсулиновой волны для более точного прогноза
    const [insulinWaveData, setInsulinWaveData] = useState(null);
    
    useEffect(() => {
      if (window.HEYS?.InsulinWave?.calculate) {
        try {
          // Получаем текущее состояние волны
          const waveData = window.HEYS.InsulinWave.getLatestWaveData?.() || null;
          setInsulinWaveData(waveData);
        } catch (e) {
          // Игнорируем ошибки
        }
      }
    }, []);
    
    // Форматирование времени окончания волны
    const getWaveEndInfo = () => {
      if (!insulinWaveData) return null;
      
      const { status, remaining, endTime, currentPhase } = insulinWaveData;
      
      if (status === 'lipolysis') {
        return { 
          status: 'burning', 
          label: '🔥 Липолиз активен',
          desc: 'Сейчас идёт активное жиросжигание',
          color: '#22c55e'
        };
      }
      
      if (status === 'active' && remaining > 0) {
        return {
          status: 'wave',
          label: `⏳ ${remaining} мин до окончания волны`,
          desc: `Окончание в ${endTime}${currentPhase ? ` • Фаза: ${currentPhase}` : ''}`,
          color: '#f59e0b'
        };
      }
      
      if (status === 'almost') {
        return {
          status: 'almost',
          label: `⚡ ${remaining} мин до липолиза`,
          desc: 'Скоро начнётся жиросжигание',
          color: '#3b82f6'
        };
      }
      
      return null;
    };
    
    const waveEndInfo = getWaveEndInfo();
    
    return h('div', { className: 'forecast-panel' },
      isPast && h('div', { className: 'forecast-panel__note' },
        '📊 Анализ прошлого дня'
      ),
      
      // 🆕 Insulin Wave Status
      waveEndInfo && h('div', { 
        className: 'forecast-panel__wave-status',
        style: { borderColor: waveEndInfo.color }
      },
        h('div', { className: 'forecast-panel__wave-label', style: { color: waveEndInfo.color } }, 
          waveEndInfo.label
        ),
        h('div', { className: 'forecast-panel__wave-desc' }, waveEndInfo.desc)
      ),
      
      // Energy Windows
      forecast.energyWindows && forecast.energyWindows.length > 0 && h('div', { className: 'forecast-panel__section' },
        h('div', { className: 'forecast-panel__section-title' }, '⚡ Окна энергии'),
        h('div', { className: 'forecast-panel__windows' },
          forecast.energyWindows.map((window, idx) =>
            h('div', { 
              key: idx, 
              className: `forecast-panel__window ${window.optimal ? 'forecast-panel__window--optimal' : ''}`
            },
              h('div', { className: 'forecast-panel__window-period' }, window.period),
              h('div', { className: 'forecast-panel__window-label' }, window.label),
              window.optimal && h('span', { className: 'forecast-panel__window-badge' }, '⭐ Оптимально'),
              h('div', { className: 'forecast-panel__window-rec' }, window.recommendation)
            )
          )
        )
      ),
      
      // Training Window
      forecast.trainingWindow && h('div', { className: 'forecast-panel__section' },
        h('div', { className: 'forecast-panel__section-title' }, '🏋️ Лучшее время для тренировки'),
        h('div', { className: 'forecast-panel__training' },
          h('div', { className: 'forecast-panel__training-time' }, forecast.trainingWindow.time),
          h('div', { className: 'forecast-panel__training-reason' }, forecast.trainingWindow.reason)
        )
      ),
      
      // 🆕 Next Meal Recommendation based on insulin wave
      insulinWaveData && insulinWaveData.status !== 'lipolysis' && h('div', { className: 'forecast-panel__section' },
        h('div', { className: 'forecast-panel__section-title' }, '🍽️ Следующий приём пищи'),
        h('div', { className: 'forecast-panel__next-meal' },
          h('div', { className: 'forecast-panel__next-meal-time' },
            insulinWaveData.remaining < 30 
              ? '⚡ Скоро можно есть!'
              : `Рекомендуется после ${insulinWaveData.endTime}`
          ),
          h('div', { className: 'forecast-panel__next-meal-tip' },
            insulinWaveData.remaining < 60
              ? 'Подготовь лёгкий перекус с белком'
              : 'Дождись окончания волны для лучшего усвоения'
          )
        )
      ),
      
      // What-if scenarios (placeholder)
      h('div', { className: 'forecast-panel__scenarios' },
        h('div', { className: 'forecast-panel__scenarios-title' }, '🎯 Сценарии'),
        h('div', { className: 'forecast-panel__scenario forecast-panel__scenario--likely' },
          h('span', { className: 'forecast-panel__scenario-emoji' }, '📊'),
          h('span', { className: 'forecast-panel__scenario-label' }, 'Вероятный'),
          h('span', { className: 'forecast-panel__scenario-desc' }, forecast.likelyOutcome || 'Стабильный день')
        ),
        h('div', { className: 'forecast-panel__scenario forecast-panel__scenario--optimistic' },
          h('span', { className: 'forecast-panel__scenario-emoji' }, '🌟'),
          h('span', { className: 'forecast-panel__scenario-label' }, 'Оптимистичный'),
          h('span', { className: 'forecast-panel__scenario-desc' }, forecast.optimisticOutcome || 'При соблюдении плана')
        )
      )
    );
  }
  
  /**
   * PhenotypePanel — содержимое таба Phenotype (расширенное)
   * Включает radar chart, пороги, рекомендации
   */
  function PhenotypePanel({ phenotype }) {
    const [showRadar, setShowRadar] = useState(true);
    
    const phenotypeConfig = {
      sprinter: { emoji: '🏃', color: '#ef4444', label: 'Спринтер', desc: 'Быстрый метаболизм, высокие пики энергии, короткие волны' },
      marathoner: { emoji: '🏃‍♂️', color: '#3b82f6', label: 'Марафонец', desc: 'Стабильная энергия, длинные волны, хорошая выносливость' },
      powerlifter: { emoji: '🏋️', color: '#8b5cf6', label: 'Силовик', desc: 'Высокая мышечная масса, быстрое восстановление' },
      balanced: { emoji: '⚖️', color: '#22c55e', label: 'Сбалансированный', desc: 'Гармоничный профиль без ярких перекосов' },
      nightowl: { emoji: '🦉', color: '#6366f1', label: 'Сова', desc: 'Поздний хронотип, высокая активность вечером' },
      earlybird: { emoji: '🐦', color: '#f59e0b', label: 'Жаворонок', desc: 'Ранний хронотип, пик энергии утром' }
    };
    
    const config = phenotypeConfig[phenotype.type] || { 
      emoji: '🧬', 
      color: '#64748b', 
      label: phenotype.type || 'Определяется',
      desc: 'Накапливаем данные для определения фенотипа'
    };
    
    // Подготовка данных для radar
    const radarData = phenotype.traits || {
      stability: 70,
      recovery: 60,
      insulinSensitivity: 80,
      consistency: 65,
      chronotype: 50
    };
    
    return h('div', { className: 'phenotype-panel phenotype-panel--full' },
      // Type card with emoji
      h('div', { className: 'phenotype-panel__card', style: { borderColor: config.color } },
        h('div', { className: 'phenotype-panel__emoji' }, config.emoji),
        h('div', { className: 'phenotype-panel__type' }, config.label),
        h('div', { className: 'phenotype-panel__type-desc' }, config.desc),
        phenotype.confidence && h('div', { className: 'phenotype-panel__confidence' }, 
          h('div', { className: 'phenotype-panel__confidence-bar' },
            h('div', { 
              className: 'phenotype-panel__confidence-fill',
              style: { width: `${phenotype.confidence}%`, background: config.color }
            })
          ),
          h('span', null, `Уверенность: ${phenotype.confidence}%`)
        )
      ),
      
      // Radar Chart
      showRadar && h('div', { className: 'phenotype-panel__radar-section' },
        h('div', { className: 'phenotype-panel__section-title' }, '📊 Профиль метаболизма'),
        h(PhenotypeRadar, { data: radarData, color: config.color })
      ),
      
      // Thresholds (персональные пороги)
      phenotype.thresholds && h('div', { className: 'phenotype-panel__thresholds' },
        h('div', { className: 'phenotype-panel__section-title' }, '🎯 Твои пороги'),
        h('div', { className: 'phenotype-panel__threshold-grid' },
          phenotype.thresholds.optimalKcalRange && h('div', { className: 'phenotype-panel__threshold' },
            h('span', { className: 'phenotype-panel__threshold-label' }, 'Оптимальные ккал'),
            h('span', { className: 'phenotype-panel__threshold-value' }, 
              `${phenotype.thresholds.optimalKcalRange[0]}–${phenotype.thresholds.optimalKcalRange[1]}`
            )
          ),
          phenotype.thresholds.waveHours && h('div', { className: 'phenotype-panel__threshold' },
            h('span', { className: 'phenotype-panel__threshold-label' }, 'Инсулиновая волна'),
            h('span', { className: 'phenotype-panel__threshold-value' }, `${phenotype.thresholds.waveHours}ч`)
          ),
          phenotype.thresholds.mealGap && h('div', { className: 'phenotype-panel__threshold' },
            h('span', { className: 'phenotype-panel__threshold-label' }, 'Перерыв между едой'),
            h('span', { className: 'phenotype-panel__threshold-value' }, `${phenotype.thresholds.mealGap}ч`)
          ),
          phenotype.thresholds.crashRiskThreshold && h('div', { className: 'phenotype-panel__threshold' },
            h('span', { className: 'phenotype-panel__threshold-label' }, 'Порог риска срыва'),
            h('span', { className: 'phenotype-panel__threshold-value' }, `${phenotype.thresholds.crashRiskThreshold}%`)
          )
        )
      ),
      
      // Strengths
      phenotype.strengths && phenotype.strengths.length > 0 && h('div', { className: 'phenotype-panel__section' },
        h('div', { className: 'phenotype-panel__section-title' }, '💪 Сильные стороны'),
        h('div', { className: 'phenotype-panel__list' },
          phenotype.strengths.map((s, idx) =>
            h('div', { key: idx, className: 'phenotype-panel__item phenotype-panel__item--strength' },
              '✓ ' + s
            )
          )
        )
      ),
      
      // Weaknesses
      phenotype.weaknesses && phenotype.weaknesses.length > 0 && h('div', { className: 'phenotype-panel__section' },
        h('div', { className: 'phenotype-panel__section-title' }, '⚠️ Зоны роста'),
        h('div', { className: 'phenotype-panel__list' },
          phenotype.weaknesses.map((w, idx) =>
            h('div', { key: idx, className: 'phenotype-panel__item phenotype-panel__item--weakness' },
              '• ' + w
            )
          )
        )
      ),
      
      // Recommendations
      phenotype.recommendations && phenotype.recommendations.length > 0 && h('div', { className: 'phenotype-panel__section' },
        h('div', { className: 'phenotype-panel__section-title' }, '💡 Рекомендации'),
        h('div', { className: 'phenotype-panel__recommendations' },
          phenotype.recommendations.slice(0, 3).map((rec, idx) =>
            h('div', { key: idx, className: 'phenotype-panel__recommendation' },
              h('span', { className: 'phenotype-panel__rec-num' }, idx + 1),
              h('span', { className: 'phenotype-panel__rec-text' }, rec)
            )
          )
        )
      ),
      
      // Data collection progress
      phenotype.dataProgress && phenotype.dataProgress < 100 && h('div', { className: 'phenotype-panel__progress' },
        h('div', { className: 'phenotype-panel__progress-label' },
          `📊 Данных: ${phenotype.dataProgress}% (нужно ${Math.ceil((100 - phenotype.dataProgress) / 3.33)} дней)`
        ),
        h('div', { className: 'phenotype-panel__progress-bar' },
          h('div', { 
            className: 'phenotype-panel__progress-fill',
            style: { width: `${phenotype.dataProgress}%` }
          })
        )
      )
    );
  }
  
  /**
   * PhenotypeRadar — SVG radar chart для визуализации профиля
   */
  function PhenotypeRadar({ data, color = '#3b82f6', size = 200 }) {
    const center = size / 2;
    const radius = size / 2 - 30;
    
    const traits = [
      { key: 'stability', label: 'Стабильность' },
      { key: 'recovery', label: 'Восстановление' },
      { key: 'insulinSensitivity', label: 'Инсулин. чувств.' },
      { key: 'consistency', label: 'Постоянство' },
      { key: 'chronotype', label: 'Хронотип' }
    ];
    
    const angleStep = (2 * Math.PI) / traits.length;
    
    // Вычисление точек для полигона
    const points = traits.map((trait, i) => {
      const value = (data[trait.key] || 50) / 100;
      const angle = -Math.PI / 2 + i * angleStep;
      const x = center + Math.cos(angle) * radius * value;
      const y = center + Math.sin(angle) * radius * value;
      return { x, y, value: data[trait.key] || 50, label: trait.label };
    });
    
    const polygonPoints = points.map(p => `${p.x},${p.y}`).join(' ');
    
    // Точки для осей
    const axisPoints = traits.map((_, i) => {
      const angle = -Math.PI / 2 + i * angleStep;
      return {
        x: center + Math.cos(angle) * radius,
        y: center + Math.sin(angle) * radius,
        labelX: center + Math.cos(angle) * (radius + 18),
        labelY: center + Math.sin(angle) * (radius + 18)
      };
    });
    
    return h('div', { className: 'phenotype-radar', style: { width: size, height: size } },
      h('svg', { viewBox: `0 0 ${size} ${size}`, className: 'phenotype-radar__svg' },
        // Background circles
        [0.25, 0.5, 0.75, 1].map(scale =>
          h('circle', {
            key: scale,
            cx: center,
            cy: center,
            r: radius * scale,
            fill: 'none',
            stroke: 'var(--border-color, #e2e8f0)',
            strokeWidth: 1,
            strokeDasharray: scale < 1 ? '4,4' : 'none'
          })
        ),
        
        // Axes
        axisPoints.map((axis, i) =>
          h('line', {
            key: i,
            x1: center,
            y1: center,
            x2: axis.x,
            y2: axis.y,
            stroke: 'var(--border-color, #e2e8f0)',
            strokeWidth: 1
          })
        ),
        
        // Data polygon
        h('polygon', {
          points: polygonPoints,
          fill: color,
          fillOpacity: 0.2,
          stroke: color,
          strokeWidth: 2
        }),
        
        // Data points
        points.map((point, i) =>
          h('circle', {
            key: i,
            cx: point.x,
            cy: point.y,
            r: 5,
            fill: color,
            stroke: '#fff',
            strokeWidth: 2
          })
        ),
        
        // Axis labels
        axisPoints.map((axis, i) =>
          h('text', {
            key: i,
            x: axis.labelX,
            y: axis.labelY,
            textAnchor: 'middle',
            dominantBaseline: 'middle',
            className: 'phenotype-radar__label',
            style: { fontSize: 10, fill: 'var(--text-secondary, #64748b)' }
          }, traits[i].label)
        )
      ),
      
      // Legend
      h('div', { className: 'phenotype-radar__legend' },
        points.map((point, i) =>
          h('div', { key: i, className: 'phenotype-radar__legend-item' },
            h('span', { className: 'phenotype-radar__legend-dot', style: { background: color } }),
            h('span', { className: 'phenotype-radar__legend-label' }, point.label),
            h('span', { className: 'phenotype-radar__legend-value' }, `${point.value}%`)
          )
        )
      )
    );
  }
  
  /**
   * FeedbackWidget — виджет для сбора обратной связи по прогнозам
   * Интегрируется с HEYS.Metabolic.submitFeedback
   */
  function FeedbackWidget({ predictionType, predictionId, onSubmit }) {
    const [submitted, setSubmitted] = useState(false);
    const [showDetails, setShowDetails] = useState(false);
    const [detailText, setDetailText] = useState('');
    
    // Статистика точности
    const stats = useMemo(() => {
      if (HEYS.Metabolic?.getFeedbackStats) {
        return HEYS.Metabolic.getFeedbackStats();
      }
      return { total: 0, accuracy: 0 };
    }, []);
    
    const handleFeedback = (correct) => {
      if (HEYS.Metabolic?.submitFeedback) {
        const details = detailText ? { comment: detailText } : {};
        HEYS.Metabolic.submitFeedback(predictionId, correct, {
          ...details,
          type: predictionType
        });
      }
      setSubmitted(true);
      if (onSubmit) onSubmit(correct);
    };
    
    if (submitted) {
      return h('div', { className: 'feedback-widget feedback-widget--submitted' },
        h('span', { className: 'feedback-widget__thanks' }, '✅ Спасибо за отзыв!'),
        stats.total > 5 && h('span', { className: 'feedback-widget__accuracy' },
          `Точность прогнозов: ${stats.accuracy}%`
        )
      );
    }
    
    return h('div', { className: 'feedback-widget' },
      h('div', { className: 'feedback-widget__question' },
        '🎯 Прогноз оказался точным?'
      ),
      
      h('div', { className: 'feedback-widget__buttons' },
        h('button', {
          className: 'feedback-widget__btn feedback-widget__btn--yes',
          onClick: () => handleFeedback(true)
        }, '👍 Да'),
        h('button', {
          className: 'feedback-widget__btn feedback-widget__btn--no',
          onClick: () => setShowDetails(true)
        }, '👎 Нет'),
        h('button', {
          className: 'feedback-widget__btn feedback-widget__btn--skip',
          onClick: () => setSubmitted(true)
        }, 'Пропустить')
      ),
      
      showDetails && h('div', { className: 'feedback-widget__details' },
        h('textarea', {
          className: 'feedback-widget__textarea',
          placeholder: 'Что пошло не так? (опционально)',
          value: detailText,
          onChange: (e) => setDetailText(e.target.value),
          rows: 2
        }),
        h('button', {
          className: 'feedback-widget__submit',
          onClick: () => handleFeedback(false)
        }, 'Отправить')
      ),
      
      stats.total > 0 && h('div', { className: 'feedback-widget__stats' },
        `📊 Отзывов: ${stats.total} • Точность: ${stats.accuracy}%`
      )
    );
  }
  
  /**
   * FeedbackPrompt — inline prompt для конкретного прогноза
   * Меньше чем FeedbackWidget, встраивается в карточки
   */
  function FeedbackPrompt({ predictionId, type, compact = false }) {
    const [voted, setVoted] = useState(false);
    
    const handleVote = (correct) => {
      if (HEYS.Metabolic?.submitFeedback) {
        HEYS.Metabolic.submitFeedback(predictionId, correct, { type });
      }
      setVoted(true);
    };
    
    if (voted) {
      return h('span', { className: 'feedback-prompt feedback-prompt--voted' }, '✓');
    }
    
    return h('div', { className: `feedback-prompt ${compact ? 'feedback-prompt--compact' : ''}` },
      h('button', {
        className: 'feedback-prompt__btn feedback-prompt__btn--up',
        onClick: () => handleVote(true),
        title: 'Прогноз точный'
      }, '👍'),
      h('button', {
        className: 'feedback-prompt__btn feedback-prompt__btn--down',
        onClick: () => handleVote(false),
        title: 'Прогноз неточный'
      }, '👎')
    );
  }
  
  /**
   * AccuracyBadge — бейдж с точностью системы
   */
  function AccuracyBadge() {
    const stats = useMemo(() => {
      if (HEYS.Metabolic?.getFeedbackStats) {
        return HEYS.Metabolic.getFeedbackStats();
      }
      return { total: 0, accuracy: 0 };
    }, []);
    
    if (stats.total < 5) return null;
    
    const color = stats.accuracy >= 80 ? '#22c55e' : stats.accuracy >= 60 ? '#eab308' : '#ef4444';
    
    return h('div', { 
      className: 'accuracy-badge',
      style: { borderColor: color },
      title: `На основе ${stats.total} отзывов`
    },
      h('span', { className: 'accuracy-badge__icon' }, '🎯'),
      h('span', { className: 'accuracy-badge__value', style: { color } }, `${stats.accuracy}%`),
      h('span', { className: 'accuracy-badge__label' }, 'точность')
    );
  }
  
  // Legacy PredictiveDashboard wrapper for backward compatibility
  function PredictiveDashboardLegacy({ lsGet, profile, selectedDate }) {
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
  
  // === METABOLIC STATE RING — кольцевая визуализация фаз ===
  
  /**
   * MetabolicStateRing — визуализация текущей метаболической фазы
   * Показывает: анаболическая → переходная → катаболическая (липолиз)
   */
  function MetabolicStateRing({ phase, size = 120, strokeWidth = 10, showLabel = true }) {
    if (!phase || !phase.phase) {
      return h('div', { className: 'metabolic-ring metabolic-ring--empty' },
        h('div', { className: 'metabolic-ring__placeholder' }, '❓')
      );
    }
    
    const phaseColors = {
      anabolic: { primary: '#3b82f6', secondary: '#93c5fd', gradient: 'linear-gradient(135deg, #3b82f6, #60a5fa)' },
      transitional: { primary: '#f59e0b', secondary: '#fcd34d', gradient: 'linear-gradient(135deg, #f59e0b, #fbbf24)' },
      catabolic: { primary: '#22c55e', secondary: '#86efac', gradient: 'linear-gradient(135deg, #22c55e, #4ade80)' },
      unknown: { primary: '#6b7280', secondary: '#d1d5db', gradient: 'linear-gradient(135deg, #6b7280, #9ca3af)' }
    };
    
    const colors = phaseColors[phase.phase] || phaseColors.unknown;
    
    // Прогресс внутри фазы (для анимации)
    let progress = 0;
    if (phase.phase === 'anabolic') {
      progress = Math.min(100, (phase.hoursInPhase / 3) * 100);
    } else if (phase.phase === 'transitional') {
      progress = Math.min(100, ((phase.hoursInPhase - 3) / 2) * 100);
    } else if (phase.phase === 'catabolic') {
      progress = Math.min(100, ((phase.hoursInPhase - 5) / 3) * 100);
    }
    
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (progress / 100) * circumference;
    
    return h('div', { className: `metabolic-ring metabolic-ring--${phase.phase}`, style: { width: size, height: size } },
      h('svg', { 
        className: 'metabolic-ring__svg',
        viewBox: `0 0 ${size} ${size}`,
        style: { transform: 'rotate(-90deg)' }
      },
        // Background circle
        h('circle', {
          className: 'metabolic-ring__bg',
          cx: size / 2,
          cy: size / 2,
          r: radius,
          stroke: colors.secondary,
          strokeWidth: strokeWidth,
          fill: 'transparent',
          opacity: 0.3
        }),
        // Progress circle
        h('circle', {
          className: 'metabolic-ring__progress',
          cx: size / 2,
          cy: size / 2,
          r: radius,
          stroke: colors.primary,
          strokeWidth: strokeWidth,
          fill: 'transparent',
          strokeLinecap: 'round',
          strokeDasharray: circumference,
          strokeDashoffset: strokeDashoffset,
          style: { transition: 'stroke-dashoffset 0.5s ease-in-out' }
        })
      ),
      // Center content
      h('div', { className: 'metabolic-ring__center' },
        h('div', { className: 'metabolic-ring__emoji' }, phase.emoji),
        showLabel && h('div', { className: 'metabolic-ring__label' }, phase.label),
        phase.timeToLipolysis > 0 && h('div', { className: 'metabolic-ring__time' },
          `${Math.round(phase.timeToLipolysis * 60)} мин`
        ),
        phase.isLipolysis && h('div', { className: 'metabolic-ring__lipolysis' }, '🔥 Жиросжигание!')
      )
    );
  }
  
  // === TRAFFIC LIGHT — светофор для рисков ===
  
  /**
   * RiskTrafficLight — светофор риска срыва
   * Low = зелёный, Medium = жёлтый, High = красный
   */
  function RiskTrafficLight({ riskLevel, riskValue, factors, compact = false }) {
    const lights = [
      { level: 'low', color: '#22c55e', label: 'Низкий', emoji: '✅' },
      { level: 'medium', color: '#eab308', label: 'Средний', emoji: '⚠️' },
      { level: 'high', color: '#ef4444', label: 'Высокий', emoji: '🚨' }
    ];
    
    const currentLevel = riskLevel || 'low';
    const currentLight = lights.find(l => l.level === currentLevel) || lights[0];
    
    if (compact) {
      return h('div', { className: `risk-traffic-light risk-traffic-light--compact risk-traffic-light--${currentLevel}` },
        h('div', { className: 'risk-traffic-light__indicator', style: { backgroundColor: currentLight.color } },
          currentLight.emoji
        ),
        h('span', { className: 'risk-traffic-light__label' }, currentLight.label),
        riskValue !== undefined && h('span', { className: 'risk-traffic-light__value' }, `${riskValue}%`)
      );
    }
    
    return h('div', { className: `risk-traffic-light risk-traffic-light--${currentLevel}` },
      // Светофор
      h('div', { className: 'risk-traffic-light__housing' },
        lights.map(light => 
          h('div', { 
            key: light.level,
            className: `risk-traffic-light__light risk-traffic-light__light--${light.level}`,
            style: { 
              backgroundColor: light.level === currentLevel ? light.color : '#374151',
              boxShadow: light.level === currentLevel ? `0 0 20px ${light.color}` : 'none',
              opacity: light.level === currentLevel ? 1 : 0.3
            }
          })
        )
      ),
      // Детали
      h('div', { className: 'risk-traffic-light__details' },
        h('div', { className: 'risk-traffic-light__header' },
          h('span', { className: 'risk-traffic-light__emoji' }, currentLight.emoji),
          h('span', { className: 'risk-traffic-light__title' }, 'Риск срыва'),
          h('span', { className: 'risk-traffic-light__level', style: { color: currentLight.color } }, 
            currentLight.label
          ),
          riskValue !== undefined && h('span', { className: 'risk-traffic-light__percent' }, `${riskValue}%`)
        ),
        // Факторы (если есть)
        factors && factors.length > 0 && h('div', { className: 'risk-traffic-light__factors' },
          factors.slice(0, 3).map((factor, idx) =>
            h('div', { key: idx, className: 'risk-traffic-light__factor' },
              h('span', { className: 'risk-traffic-light__factor-label' }, factor.label),
              h('span', { className: 'risk-traffic-light__factor-impact' }, `+${factor.impact}`)
            )
          )
        ),
        // Совет по снижению
        currentLevel !== 'low' && h('div', { className: 'risk-traffic-light__tip' },
          h('span', { className: 'risk-traffic-light__tip-icon' }, '💡'),
          h('span', { className: 'risk-traffic-light__tip-text' },
            currentLevel === 'high' 
              ? 'Сделай refeed день или высыпись'
              : 'Добавь прогулку или лёгкий перекус'
          )
        )
      )
    );
  }
  
  // === DATA COMPLETENESS UI ===
  
  /**
   * DataCompletenessCard — карточка полноты данных
   * Показывает прогресс заполнения и что разблокируется
   */
  function DataCompletenessCard({ lsGet, profile, daysRequired = 30 }) {
    const completeness = useMemo(() => {
      if (!HEYS.Metabolic?.getDaysHistory) return null;
      
      const history = HEYS.Metabolic.getDaysHistory(daysRequired);
      const daysWithData = history.length;
      const percentage = Math.round((daysWithData / daysRequired) * 100);
      const daysRemaining = Math.max(0, daysRequired - daysWithData);
      
      // Проверяем полноту последнего дня (сегодня)
      const today = new Date().toISOString().split('T')[0];
      const inventory = HEYS.Metabolic.inventoryData ? HEYS.Metabolic.inventoryData(today) : null;
      const todayCompleteness = inventory ? HEYS.Metabolic.calculateDataCompleteness(inventory) : 0;
      
      // Определяем разблокированные фичи
      const features = [
        { name: 'Базовый статус', required: 1, emoji: '📊', unlocked: daysWithData >= 1 },
        { name: 'Риск срыва', required: 3, emoji: '⚠️', unlocked: daysWithData >= 3 },
        { name: 'Паттерны', required: 7, emoji: '🔍', unlocked: daysWithData >= 7 },
        { name: 'Персональные пороги', required: 14, emoji: '🎯', unlocked: daysWithData >= 14 },
        { name: 'Метаболический фенотип', required: 30, emoji: '🧬', unlocked: daysWithData >= 30 }
      ];
      
      const nextFeature = features.find(f => !f.unlocked);
      
      return {
        daysWithData,
        daysRequired,
        percentage,
        daysRemaining,
        todayCompleteness,
        features,
        nextFeature
      };
    }, [lsGet, daysRequired]);
    
    if (!completeness) {
      return null;
    }
    
    return h('div', { className: 'data-completeness-card' },
      h('div', { className: 'data-completeness-card__header' },
        h('span', { className: 'data-completeness-card__icon' }, '📊'),
        h('span', { className: 'data-completeness-card__title' }, 'Данные'),
        h('span', { className: 'data-completeness-card__count' },
          `${completeness.daysWithData}/${completeness.daysRequired} дней`
        )
      ),
      
      // Прогресс-бар
      h('div', { className: 'data-completeness-card__progress' },
        h('div', { className: 'data-completeness-card__progress-bar' },
          h('div', { 
            className: 'data-completeness-card__progress-fill',
            style: { width: `${completeness.percentage}%` }
          })
        ),
        h('span', { className: 'data-completeness-card__progress-text' }, `${completeness.percentage}%`)
      ),
      
      // Сегодняшняя полнота
      h('div', { className: 'data-completeness-card__today' },
        h('span', { className: 'data-completeness-card__today-label' }, 'Сегодня: '),
        h('span', { 
          className: 'data-completeness-card__today-value',
          style: { color: completeness.todayCompleteness >= 80 ? '#22c55e' : completeness.todayCompleteness >= 50 ? '#eab308' : '#ef4444' }
        }, `${completeness.todayCompleteness}% заполнено`)
      ),
      
      // Следующая разблокировка
      completeness.nextFeature && h('div', { className: 'data-completeness-card__next' },
        h('span', { className: 'data-completeness-card__next-emoji' }, completeness.nextFeature.emoji),
        h('span', { className: 'data-completeness-card__next-text' },
          `${completeness.nextFeature.name} через ${completeness.nextFeature.required - completeness.daysWithData} дн.`
        )
      ),
      
      // Разблокированные фичи (иконки)
      h('div', { className: 'data-completeness-card__features' },
        completeness.features.map((feature, idx) =>
          h('div', { 
            key: idx,
            className: `data-completeness-card__feature ${feature.unlocked ? 'data-completeness-card__feature--unlocked' : ''}`,
            title: `${feature.name} (${feature.required} дней)`
          }, feature.emoji)
        )
      )
    );
  }
  
  // === MEAL TIMING RECOMMENDATIONS (v2 — Premium Design) ===
  
  /**
   * MealTimingCard v2 — WOW дизайн с timeline и иконками
   */
  function MealTimingCard({ lsGet, profile, selectedDate }) {
    const timing = useMemo(() => {
      if (!HEYS.Metabolic?.calculatePerformanceForecast) return null;
      
      const history = HEYS.Metabolic.getDaysHistory ? HEYS.Metabolic.getDaysHistory(7) : [];
      
      return HEYS.Metabolic.calculatePerformanceForecast(
        selectedDate || new Date().toISOString().split('T')[0],
        profile || window.HEYS?.utils?.lsGet?.('heys_profile', {}),
        history
      );
    }, [lsGet, profile, selectedDate]);
    
    if (!timing || !timing.optimalMeals) {
      return null;
    }
    
    // Конфиг иконок и цветов для типов приёмов
    const mealConfig = {
      'Завтрак': { icon: '🌅', gradient: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)', lightBg: '#fef3c7' },
      'Обед': { icon: '☀️', gradient: 'linear-gradient(135deg, #34d399 0%, #10b981 100%)', lightBg: '#d1fae5' },
      'Ужин': { icon: '🌙', gradient: 'linear-gradient(135deg, #818cf8 0%, #6366f1 100%)', lightBg: '#e0e7ff' },
      'Перекус': { icon: '🍎', gradient: 'linear-gradient(135deg, #f472b6 0%, #ec4899 100%)', lightBg: '#fce7f3' }
    };
    
    const getMealConfig = (name) => {
      for (const [key, config] of Object.entries(mealConfig)) {
        if (name.toLowerCase().includes(key.toLowerCase())) return config;
      }
      return { icon: '🍽️', gradient: 'linear-gradient(135deg, #94a3b8 0%, #64748b 100%)', lightBg: '#f1f5f9' };
    };
    
    // Вычисляем текущее время для индикатора "сейчас"
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    
    return h('div', { className: 'meal-timing-v2' },
      // Header с градиентом
      h('div', { className: 'meal-timing-v2__header' },
        h('div', { className: 'meal-timing-v2__header-icon' }, '⏰'),
        h('div', { className: 'meal-timing-v2__header-content' },
          h('h3', { className: 'meal-timing-v2__title' }, 'Твой идеальный день'),
          h('p', { className: 'meal-timing-v2__subtitle' }, 'Персональное расписание на основе твоего ритма')
        )
      ),
      
      // Timeline с приёмами
      h('div', { className: 'meal-timing-v2__timeline' },
        timing.optimalMeals.filter(m => m.priority !== 'low').map((meal, idx, arr) => {
          const config = getMealConfig(meal.name);
          const [startHour] = meal.time.split('-')[0].split(':').map(Number);
          const isNow = currentHour >= startHour && currentHour < startHour + 2;
          const isPast = currentHour > startHour + 2;
          
          return h('div', { 
            key: idx, 
            className: `meal-timing-v2__item ${isNow ? 'meal-timing-v2__item--active' : ''} ${isPast ? 'meal-timing-v2__item--past' : ''}`
          },
            // Timeline connector
            idx < arr.length - 1 && h('div', { className: 'meal-timing-v2__connector' }),
            
            // Time badge
            h('div', { className: 'meal-timing-v2__time-badge', style: { background: config.gradient } },
              h('span', { className: 'meal-timing-v2__time' }, meal.time.split('-')[0])
            ),
            
            // Card content
            h('div', { className: 'meal-timing-v2__card', style: { '--accent-bg': config.lightBg } },
              h('div', { className: 'meal-timing-v2__card-header' },
                h('span', { className: 'meal-timing-v2__card-icon' }, config.icon),
                h('div', { className: 'meal-timing-v2__card-title' },
                  h('span', { className: 'meal-timing-v2__card-name' }, meal.name),
                  isNow && h('span', { className: 'meal-timing-v2__now-badge' }, '● СЕЙЧАС')
                )
              ),
              h('div', { className: 'meal-timing-v2__card-body' },
                h('p', { className: 'meal-timing-v2__card-focus' }, meal.focus),
                h('div', { className: 'meal-timing-v2__card-meta' },
                  h('span', { className: 'meal-timing-v2__card-pct' }, 
                    h('span', { className: 'meal-timing-v2__pct-value' }, `${meal.caloriesPct}%`),
                    ' дневных ккал'
                  ),
                  meal.priority === 'high' && h('span', { className: 'meal-timing-v2__priority-badge' }, '⭐ Важно')
                )
              )
            )
          );
        })
      ),
      
      // Тренировочное окно (если есть)
      timing.trainingWindow && h('div', { className: 'meal-timing-v2__training' },
        h('div', { className: 'meal-timing-v2__training-icon' }, '💪'),
        h('div', { className: 'meal-timing-v2__training-content' },
          h('div', { className: 'meal-timing-v2__training-title' }, 'Пик силы и выносливости'),
          h('div', { className: 'meal-timing-v2__training-time' }, timing.trainingWindow.time),
          h('div', { className: 'meal-timing-v2__training-reason' }, timing.trainingWindow.reason)
        )
      ),
      
      // Sleep impact chip
      h('div', { className: `meal-timing-v2__sleep meal-timing-v2__sleep--${timing.sleepImpact}` },
        h('span', { className: 'meal-timing-v2__sleep-icon' }, 
          timing.sleepImpact === 'positive' ? '😴' : '⚠️'
        ),
        h('span', { className: 'meal-timing-v2__sleep-text' },
          timing.sleepImpact === 'positive' 
            ? 'Сон в норме — энергия стабильна весь день'
            : 'Недосып — рекомендуем лёгкий день'
        ),
        timing.sleepImpact === 'positive' && h('span', { className: 'meal-timing-v2__sleep-check' }, '✓')
      )
    );
  }
  
  /**
   * WeeklyWrapCard — еженедельный отчёт
   * Показывается в воскресенье вечером с анимацией
   */
  function WeeklyWrapCard({ onClose }) {
    const [wrap, setWrap] = useState(null);
    const [activeTab, setActiveTab] = useState('summary');
    const [showShare, setShowShare] = useState(false);
    
    useEffect(() => {
      if (HEYS.Metabolic?.generateWeeklyWrap) {
        setWrap(HEYS.Metabolic.generateWeeklyWrap());
        
        // 🎮 Gamification: инкремент просмотров
        if (HEYS.game?.incrementWeeklyWrapViews) {
          const viewCount = HEYS.game.incrementWeeklyWrapViews();
          // Проверяем достижение после инкремента
          HEYS.game.checkMetabolicAchievements?.({ weeklyWrapViewed: viewCount >= 4 });
        }
      }
    }, []);
    
    if (!wrap || !wrap.available) {
      return null;
    }
    
    const { summary, trends, achievements, insights, nextWeekForecast, comparison, dailyData } = wrap;
    
    // Закрытие с отметкой
    const handleClose = () => {
      if (HEYS.Metabolic?.markWeeklyWrapShown) {
        HEYS.Metabolic.markWeeklyWrapShown();
      }
      onClose?.();
    };
    
    // Цвет score
    const getScoreColor = (score) => {
      if (score >= 80) return '#22c55e';
      if (score >= 60) return '#eab308';
      return '#ef4444';
    };
    
    // Тренд иконка
    const getTrendIcon = (direction) => {
      if (direction === 'up') return '📈';
      if (direction === 'down') return '📉';
      return '➡️';
    };
    
    // Share функция
    const shareResults = async () => {
      const text = `🏆 HEYS Weekly Wrap #${wrap.weekNumber}\n\n` +
        `📊 Средний score: ${summary.avgScore}\n` +
        `🛡️ Дней без риска: ${summary.lowRiskDays}/7\n` +
        `🔥 Дней в норме: ${summary.streakDays}\n\n` +
        (achievements.length > 0 ? `🎖️ ${achievements.map(a => a.label).join(', ')}\n\n` : '') +
        `Отслеживай питание с HEYS!`;
      
      if (navigator.share) {
        try {
          await navigator.share({ text });
        } catch (e) {
          // Пользователь отменил
        }
      } else {
        await navigator.clipboard.writeText(text);
        setShowShare(true);
        setTimeout(() => setShowShare(false), 2000);
      }
    };
    
    return h('div', { className: 'weekly-wrap-overlay' },
      h('div', { className: 'weekly-wrap-card' },
        // Header
        h('div', { className: 'weekly-wrap-card__header' },
          h('div', { className: 'weekly-wrap-card__title' },
            h('span', { className: 'weekly-wrap-card__emoji' }, '📊'),
            'Итоги недели'
          ),
          h('div', { className: 'weekly-wrap-card__week' }, `Неделя ${wrap.weekNumber}`),
          h('button', { 
            className: 'weekly-wrap-card__close',
            onClick: handleClose
          }, '×')
        ),
        
        // Tabs
        h('div', { className: 'weekly-wrap-card__tabs' },
          ['summary', 'chart', 'insights'].map(tab =>
            h('button', {
              key: tab,
              className: `weekly-wrap-card__tab ${activeTab === tab ? 'weekly-wrap-card__tab--active' : ''}`,
              onClick: () => setActiveTab(tab)
            }, tab === 'summary' ? '📊 Итоги' : tab === 'chart' ? '📈 График' : '💡 Инсайты')
          )
        ),
        
        // Content
        h('div', { className: 'weekly-wrap-card__content' },
          
          // Tab: Summary
          activeTab === 'summary' && h(React.Fragment, null,
            // Main score
            h('div', { className: 'weekly-wrap-card__main-score' },
              h('div', { 
                className: 'weekly-wrap-card__score-value',
                style: { color: getScoreColor(summary.avgScore) }
              }, summary.avgScore),
              h('div', { className: 'weekly-wrap-card__score-label' }, 'Средний score'),
              comparison && h('div', { 
                className: `weekly-wrap-card__comparison ${comparison.improved ? 'weekly-wrap-card__comparison--up' : 'weekly-wrap-card__comparison--down'}`
              },
                comparison.improved ? '↑' : '↓',
                ` ${Math.abs(comparison.delta)} vs прошлая неделя`
              )
            ),
            
            // Stats grid
            h('div', { className: 'weekly-wrap-card__stats' },
              h('div', { className: 'weekly-wrap-card__stat' },
                h('div', { className: 'weekly-wrap-card__stat-value' }, summary.goodDays),
                h('div', { className: 'weekly-wrap-card__stat-label' }, 'Хороших дней')
              ),
              h('div', { className: 'weekly-wrap-card__stat' },
                h('div', { className: 'weekly-wrap-card__stat-value' }, summary.lowRiskDays),
                h('div', { className: 'weekly-wrap-card__stat-label' }, 'Дней без риска')
              ),
              h('div', { className: 'weekly-wrap-card__stat' },
                h('div', { className: 'weekly-wrap-card__stat-value' }, summary.streakDays),
                h('div', { className: 'weekly-wrap-card__stat-label' }, 'В streak')
              )
            ),
            
            // Best/Worst day
            h('div', { className: 'weekly-wrap-card__highlights' },
              h('div', { className: 'weekly-wrap-card__highlight weekly-wrap-card__highlight--best' },
                h('span', { className: 'weekly-wrap-card__highlight-emoji' }, '🏆'),
                h('span', { className: 'weekly-wrap-card__highlight-day' }, summary.bestDay.dayName),
                h('span', { className: 'weekly-wrap-card__highlight-score' }, summary.bestDay.score)
              ),
              h('div', { className: 'weekly-wrap-card__highlight weekly-wrap-card__highlight--worst' },
                h('span', { className: 'weekly-wrap-card__highlight-emoji' }, '😔'),
                h('span', { className: 'weekly-wrap-card__highlight-day' }, summary.worstDay.dayName),
                h('span', { className: 'weekly-wrap-card__highlight-score' }, summary.worstDay.score)
              )
            ),
            
            // Achievements
            achievements.length > 0 && h('div', { className: 'weekly-wrap-card__achievements' },
              h('div', { className: 'weekly-wrap-card__achievements-title' }, '🎖️ Достижения'),
              h('div', { className: 'weekly-wrap-card__achievements-list' },
                achievements.map(a =>
                  h('div', { 
                    key: a.id,
                    className: 'weekly-wrap-card__achievement'
                  },
                    h('span', { className: 'weekly-wrap-card__achievement-emoji' }, a.emoji),
                    h('span', { className: 'weekly-wrap-card__achievement-label' }, a.label)
                  )
                )
              )
            )
          ),
          
          // Tab: Chart
          activeTab === 'chart' && h('div', { className: 'weekly-wrap-card__chart' },
            h('div', { className: 'weekly-wrap-card__chart-title' }, 'Score по дням'),
            h('div', { className: 'weekly-wrap-card__chart-bars' },
              dailyData.map(day =>
                h('div', { 
                  key: day.date,
                  className: 'weekly-wrap-card__bar-container'
                },
                  h('div', { 
                    className: 'weekly-wrap-card__bar',
                    style: { 
                      height: `${day.score}%`,
                      backgroundColor: getScoreColor(day.score)
                    }
                  }),
                  h('div', { className: 'weekly-wrap-card__bar-label' }, day.dayName),
                  h('div', { className: 'weekly-wrap-card__bar-value' }, day.score)
                )
              )
            ),
            
            // Trends
            h('div', { className: 'weekly-wrap-card__trends' },
              h('div', { className: 'weekly-wrap-card__trend' },
                h('span', null, getTrendIcon(trends.score.direction)),
                ' Score: ',
                trends.score.direction === 'up' ? 'растёт' : 
                trends.score.direction === 'down' ? 'падает' : 'стабилен'
              ),
              h('div', { className: 'weekly-wrap-card__trend' },
                h('span', null, getTrendIcon(trends.risk.direction)),
                ' Риск: ',
                trends.risk.direction === 'up' ? 'растёт ⚠️' : 
                trends.risk.direction === 'down' ? 'снижается ✅' : 'стабилен'
              )
            )
          ),
          
          // Tab: Insights
          activeTab === 'insights' && h('div', { className: 'weekly-wrap-card__insights' },
            insights.length > 0 
              ? insights.map(insight =>
                  h('div', { 
                    key: insight.id,
                    className: 'weekly-wrap-card__insight'
                  },
                    h('span', { className: 'weekly-wrap-card__insight-emoji' }, insight.emoji),
                    h('span', { className: 'weekly-wrap-card__insight-text' }, insight.text)
                  )
                )
              : h('div', { className: 'weekly-wrap-card__no-insights' },
                  '✨ На этой неделе всё отлично!'
                ),
            
            // Forecast
            h('div', { className: 'weekly-wrap-card__forecast' },
              h('div', { className: 'weekly-wrap-card__forecast-title' }, '🔮 Прогноз на следующую неделю'),
              h('div', { className: 'weekly-wrap-card__forecast-content' },
                h('div', { className: 'weekly-wrap-card__forecast-score' },
                  'Ожидаемый score: ',
                  h('span', { style: { color: getScoreColor(nextWeekForecast.predictedScore) } },
                    Math.round(nextWeekForecast.predictedScore)
                  )
                ),
                h('div', { className: 'weekly-wrap-card__forecast-rec' },
                  '💡 ',
                  nextWeekForecast.recommendation
                )
              )
            )
          )
        ),
        
        // Footer
        h('div', { className: 'weekly-wrap-card__footer' },
          h('button', {
            className: 'weekly-wrap-card__share',
            onClick: shareResults
          },
            showShare ? '✓ Скопировано!' : '📤 Поделиться'
          ),
          h('button', {
            className: 'weekly-wrap-card__done',
            onClick: handleClose
          }, 'Готово')
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
    WeeklyWrapCard,  // NEW
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
    PredictiveDashboard,
    // v2.1: Новые компоненты Metabolic Intelligence
    MetabolicStateRing,
    RiskTrafficLight,
    DataCompletenessCard,
    MealTimingCard
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
    
    window.debugWeeklyWrap = () => {
      if (!HEYS.Metabolic?.generateWeeklyWrap) {
        console.error('❌ HEYS.Metabolic.generateWeeklyWrap not loaded');
        return null;
      }
      
      const result = HEYS.Metabolic.generateWeeklyWrap();
      console.log('📊 Weekly Wrap:', result);
      return result;
    };
    
    window.debugABTest = () => {
      if (!HEYS.Metabolic?.getABStats) {
        console.error('❌ HEYS.Metabolic.getABStats not loaded');
        return null;
      }
      
      const stats = HEYS.Metabolic.getABStats();
      const variant = HEYS.Metabolic.getABVariant();
      const weights = HEYS.Metabolic.getABWeights();
      
      console.group('📊 A/B Test Results');
      console.log('🎯 Current Variant:', variant.id, '-', variant.name);
      console.log('⚖️ Weights:', weights);
      console.log('📈 Stats:', stats);
      
      if (Object.keys(stats.variantStats).length > 0) {
        console.table(stats.variantStats);
        console.log('🏆 Best Variant (by F1):', stats.bestVariant);
      } else {
        console.log('⏳ Not enough data yet');
      }
      console.groupEnd();
      
      return { variant, weights, stats };
    };
  }
  
})(typeof window !== 'undefined' ? window : global);
