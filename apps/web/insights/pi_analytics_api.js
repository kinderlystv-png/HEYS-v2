// pi_analytics_api.js — Advanced Analytics API v3.0.1
// Extracted from heys_predictive_insights_v1.js (Phase 5)
// Продвинутая аналитика: 11 методов глубокого анализа данных
// v3.0.1: Lazy getters для зависимостей (fix load order issues)
(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  HEYS.InsightsPI = HEYS.InsightsPI || {};
  const DEV = HEYS.dev || global.HEYS?.dev || {};
  const devLog = DEV.log ? DEV.log.bind(DEV) : () => { };

  // Зависимости (статические — инициализируются сразу)
  const U = HEYS.utils || {};

  // === LAZY GETTERS для зависимостей (fix load order) ===
  // Эти модули могут загрузиться ПОСЛЕ pi_analytics_api.js
  function getStats() {
    return HEYS.InsightsPI?.stats || window.piStats || {};
  }
  function getScienceInfo() {
    return HEYS.InsightsPI?.constants?.SCIENCE_INFO || window.piConst?.SCIENCE_INFO || HEYS.InsightsPI?.science || window.piScience || {};
  }
  function getConst() {
    return HEYS.InsightsPI?.constants || window.piConst || {};
  }
  function getCalc() {
    return HEYS.InsightsPI?.calculations || window.piCalculations || {};
  }

  // === Calculation helpers (lazy) ===
  function getDaysData(daysBack, lsGet) {
    const calc = getCalc();
    if (calc.getDaysData) return calc.getDaysData(daysBack, lsGet);
    // Fallback: inline implementation
    const days = [];
    const today = new Date();
    for (let i = 0; i < daysBack; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = `heys_dayv2_${d.toISOString().slice(0, 10)}`;
      const data = lsGet ? lsGet(key, {}) : {};
      if (data && Object.keys(data).length > 0) {
        days.push(data);
      }
    }
    return days;
  }

  function calculateItemKcal(item, pIndex) {
    const calc = getCalc();
    if (calc.calculateItemKcal) return calc.calculateItemKcal(item, pIndex);
    // Fallback
    const prod = pIndex?.byId?.get?.(item.product_id);
    if (!prod) return 0;
    const grams = item.grams || 100;
    return ((prod.kcal100 || 0) * grams) / 100;
  }

  function calculateDayKcal(day, pIndex) {
    const calc = getCalc();
    if (calc.calculateDayKcal) return calc.calculateDayKcal(day, pIndex);
    // Fallback
    let total = 0;
    (day.meals || []).forEach(m => {
      (m.items || []).forEach(item => {
        total += calculateItemKcal(item, pIndex);
      });
    });
    return total;
  }

  // === Stats helpers (lazy access) ===
  function average(arr) {
    const stats = getStats();
    if (stats.average) return stats.average(arr);
    if (!arr || arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }
  function stdDev(arr) {
    const stats = getStats();
    if (stats.stdDev) return stats.stdDev(arr);
    if (!arr || arr.length < 2) return 0;
    const mean = average(arr);
    const sq = arr.map(x => Math.pow(x - mean, 2));
    return Math.sqrt(sq.reduce((a, b) => a + b, 0) / arr.length);
  }
  function pearsonCorrelation(x, y) {
    const stats = getStats();
    if (stats.pearsonCorrelation) return stats.pearsonCorrelation(x, y);
    if (!Array.isArray(x) || !Array.isArray(y) || x.length !== y.length || x.length < 2) return 0;
    const n = x.length;
    const xMean = average(x);
    const yMean = average(y);
    let numerator = 0;
    let xDen = 0;
    let yDen = 0;
    for (let i = 0; i < n; i++) {
      const dx = (Number(x[i]) || 0) - xMean;
      const dy = (Number(y[i]) || 0) - yMean;
      numerator += dx * dy;
      xDen += dx * dx;
      yDen += dy * dy;
    }
    const denominator = Math.sqrt(xDen * yDen);
    if (denominator === 0) return 0;
    if (n < 3) return 0;
    return numerator / denominator;
  }
  function calculateTrend(arr) {
    const stats = getStats();
    if (stats.calculateTrend) return stats.calculateTrend(arr);
    if (!Array.isArray(arr) || arr.length < 2) return 0;
    const n = arr.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let i = 0; i < n; i++) {
      const y = Number(arr[i]) || 0;
      sumX += i;
      sumY += y;
      sumXY += i * y;
      sumX2 += i * i;
    }
    const denominator = (n * sumX2 - sumX * sumX);
    if (!denominator) return 0;
    return (n * sumXY - sumX * sumY) / denominator;
  }
  function linearTrend(arr) {
    const stats = getStats();
    if (stats.linearTrend) return stats.linearTrend(arr);
    if (stats.calculateTrend) return stats.calculateTrend(arr);
    return calculateTrend(arr);
  }
  function calculateLinearRegression(points) {
    const stats = getStats();
    if (stats.calculateLinearRegression) return stats.calculateLinearRegression(points);
    if (!Array.isArray(points) || points.length < 2) return 0;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;
    const n = points.length;
    for (const p of points) {
      const x = Number(p?.x) || 0;
      const y = Number(p?.y) || 0;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
    }
    const denominator = (n * sumX2 - sumX * sumX);
    if (!denominator) return 0;
    return (n * sumXY - sumX * sumY) / denominator;
  }
  function variance(arr) {
    const stats = getStats();
    if (stats.variance) return stats.variance(arr);
    if (!arr || arr.length < 2) return 0;
    const mean = average(arr);
    return arr.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / arr.length;
  }
  function autocorrelation(arr, lag) {
    const stats = getStats();
    if (stats.autocorrelation) return stats.autocorrelation(arr, lag);
    return 0;
  }
  function skewness(arr) {
    const stats = getStats();
    if (stats.skewness) return stats.skewness(arr);
    return 0;
  }
  function calculateR2(actual, predicted) {
    const stats = getStats();
    if (stats.calculateR2) return stats.calculateR2(actual, predicted);
    // Fallback R² implementation
    if (!actual || !predicted || actual.length !== predicted.length || actual.length === 0) return 0;
    const meanActual = average(actual);
    const ssTot = actual.reduce((sum, a) => sum + Math.pow(a - meanActual, 2), 0);
    const ssRes = actual.reduce((sum, a, i) => sum + Math.pow(a - predicted[i], 2), 0);
    return ssTot === 0 ? 0 : 1 - ssRes / ssTot;
  }

  function calculateBMR(profile) {
    if (HEYS.TDEE?.calcBMR) {
      return HEYS.TDEE.calcBMR(profile);
    }
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

  // === ANALYTICS API METHODS ===
  const analyticsAPI = {
    /**
     * Analyze Metabolism - глубокий анализ метаболических процессов
     * @param {Object} options - параметры анализа
     * @returns {Object} метаболические данные
     */
    analyzeMetabolism: function (options = {}) {
      const lsGet = options.lsGet || U.lsGet;
      const profile = options.profile || lsGet('heys_profile', {});
      const pIndex = options.pIndex || HEYS.products?.buildIndex?.();
      const dateStr = options.selectedDate || new Date().toISOString().split('T')[0];
      const day = lsGet(`heys_dayv2_${dateStr}`, {});
      const hrZones = lsGet('heys_hr_zones', [
        { MET: 3 }, { MET: 5 }, { MET: 7 }, { MET: 10 }
      ]);

      // === TEF (Thermic Effect of Food) ===
      // Westerterp 2004, Tappy 1996: белок 25%, углеводы 7.5%, жиры 1.5%
      const meals = day.meals || [];
      let totalProtein = 0, totalCarbs = 0, totalFat = 0, totalKcal = 0;

      meals.forEach(meal => {
        (meal.items || []).forEach(item => {
          const g = item.grams || 0;
          // v3.0.2: Поддержка обоих форматов ID (product_id и productId)
          const prod = pIndex?.byId?.get?.(String(item.product_id || item.productId || item.id)?.toLowerCase());
          if (prod && g > 0) {
            totalProtein += (prod.protein100 || 0) * g / 100;
            totalCarbs += ((prod.simple100 || 0) + (prod.complex100 || 0)) * g / 100;
            totalFat += ((prod.badFat100 || 0) + (prod.goodFat100 || 0) + (prod.trans100 || 0)) * g / 100;
          }
        });
      });

      totalKcal = totalProtein * 4 + totalCarbs * 4 + totalFat * 9;
      // 🔬 TEF v1.0.0: используем единый модуль HEYS.TEF с fallback
      let tefResult;
      if (HEYS.TEF?.calculate) {
        tefResult = HEYS.TEF.calculate(totalProtein, totalCarbs, totalFat);
      } else {
        // Fallback: inline расчёт если модуль не загружен (Westerterp 2004, Tappy 1996)
        const proteinTEF = Math.round(totalProtein * 4 * 0.25);
        const carbsTEF = Math.round(totalCarbs * 4 * 0.075);
        const fatTEF = Math.round(totalFat * 9 * 0.015);
        tefResult = {
          total: proteinTEF + carbsTEF + fatTEF,
          breakdown: { protein: proteinTEF, carbs: carbsTEF, fat: fatTEF }
        };
      }
      const totalTEF = tefResult.total;
      const tefPct = totalKcal > 0 ? Math.round(totalTEF / totalKcal * 100) : 0;

      const tefAnalysis = {
        total: totalTEF,
        percent: tefPct,
        breakdown: tefResult.breakdown,
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
    },

    // === ADVANCED ANALYTICS v2.5 ===

    /**
     * Confidence Score — оценка достоверности данных (0-100)
     * Факторы: объём данных, полнота, консистентность, актуальность
     * @param {Object} options - { lsGet, daysBack }
     * @returns {Object} { score, level, factors, advice }
     */
    calculateConfidenceScore: function (options = {}) {
      const lsGet = options.lsGet || U.lsGet;
      const daysBack = options.daysBack || 30;
      const days = getDaysData(daysBack, lsGet);

      // Фактор 1: Объём данных (30% веса)
      // 0 дней = 0, 7 дней = 50%, 14 дней = 80%, 21+ = 100%
      const daysWithData = days.filter(d => (d.meals?.length || 0) > 0 || d.weightMorning).length;
      const volumeFactor = Math.min(100, daysWithData <= 7 ? daysWithData * 7 : 50 + (daysWithData - 7) * 3.5);

      // Фактор 2: Полнота данных (25% веса)
      // Для каждого дня: есть ли weight, meals, sleep, steps, water
      const completenessPerDay = days.map(d => {
        let fields = 0;
        if (d.weightMorning > 0) fields++;
        if ((d.meals?.length || 0) > 0) fields++;
        if (d.sleepHours > 0 || d.sleepStart) fields++;
        if (d.steps > 0) fields++;
        if (d.waterMl > 0) fields++;
        return fields / 5 * 100;
      });
      const completenessFactor = completenessPerDay.length > 0
        ? average(completenessPerDay)
        : 0;

      // Фактор 3: Консистентность (25% веса)
      // Низкая вариабельность в заполнении = высокий скор
      const dailyCompleteness = days.map(d => ((d.meals?.length || 0) > 0 ? 1 : 0));
      const consistency = dailyCompleteness.length >= 7
        ? 100 - (stdDev(dailyCompleteness) * 100)
        : 50;
      const consistencyFactor = Math.max(0, Math.min(100, consistency));

      // Фактор 4: Актуальность (20% веса)
      // Данные за последние 3 дня важнее
      const recentDays = days.slice(0, 3);
      const recentActivity = recentDays.filter(d => (d.meals?.length || 0) > 0).length;
      const recencyFactor = recentActivity >= 3 ? 100 : recentActivity >= 2 ? 80 : recentActivity >= 1 ? 50 : 0;

      // Итоговый скор с весами
      const score = Math.round(
        volumeFactor * 0.30 +
        completenessFactor * 0.25 +
        consistencyFactor * 0.25 +
        recencyFactor * 0.20
      );

      // Уровень достоверности
      const level = score >= 85 ? 'excellent' : score >= 70 ? 'good' : score >= 50 ? 'moderate' : 'low';
      const levelEmoji = { excellent: '🎯', good: '✅', moderate: '⚠️', low: '❌' }[level];
      const levelLabel = { excellent: 'Высокая', good: 'Хорошая', moderate: 'Средняя', low: 'Низкая' }[level];

      // Советы по улучшению
      const advices = [];
      if (volumeFactor < 70) advices.push('Продолжай вести учёт — данных пока мало');
      if (completenessFactor < 60) advices.push('Заполняй вес, сон и шаги для полной картины');
      if (consistencyFactor < 70) advices.push('Веди учёт регулярно каждый день');
      if (recencyFactor < 80) advices.push('Не забывай заполнять данные сегодня!');

      return {
        score,
        level,
        levelEmoji,
        levelLabel,
        factors: {
          volume: Math.round(volumeFactor),
          completeness: Math.round(completenessFactor),
          consistency: Math.round(consistencyFactor),
          recency: Math.round(recencyFactor)
        },
        daysWithData,
        totalDays: daysBack,
        advice: advices[0] || 'Отличное качество данных!',
        advices
      };
    },

    /**
     * Correlation Matrix — расширенная матрица корреляций
     * Анализирует связи между всеми метриками
     * @param {Object} options - { lsGet, daysBack, pIndex }
     * @returns {Object} { correlations, strongest, insights }
     */
    calculateCorrelationMatrix: function (options = {}) {
      const lsGet = options.lsGet || U.lsGet;
      const daysBack = options.daysBack || 30;
      const pIndex = options.pIndex || HEYS.products?.buildIndex?.();
      const days = getDaysData(daysBack, lsGet);

      // Собираем метрики для каждого дня
      const metrics = days.map(d => {
        const kcal = calculateDayKcal(d, pIndex);
        const meals = d.meals || [];
        let protein = 0, carbs = 0, fat = 0, simple = 0, fiber = 0;

        meals.forEach(m => (m.items || []).forEach(item => {
          const g = item.grams || 0;
          const prod = pIndex?.byId?.get?.(String(item.product_id || item.productId || item.id)?.toLowerCase());
          if (prod && g > 0) {
            protein += (prod.protein100 || 0) * g / 100;
            carbs += ((prod.simple100 || 0) + (prod.complex100 || 0)) * g / 100;
            simple += (prod.simple100 || 0) * g / 100;
            fat += ((prod.badFat100 || 0) + (prod.goodFat100 || 0)) * g / 100;
            fiber += (prod.fiber100 || 0) * g / 100;
          }
        }));

        return {
          kcal,
          protein,
          carbs,
          simple,
          fat,
          fiber,
          sleep: d.sleepHours || 0,
          steps: d.steps || 0,
          water: d.waterMl || 0,
          weight: d.weightMorning || 0,
          mood: d.moodAvg || d.dayScore || 0,
          stress: d.stressAvg || 0,
          trainings: (d.trainings || []).length
        };
      }).filter(m => m.kcal > 0 || m.sleep > 0 || m.steps > 0);

      if (metrics.length < 7) {
        return {
          correlations: [],
          strongest: null,
          insights: ['Недостаточно данных (нужно 7+ дней)'],
          hasData: false
        };
      }

      // Список пар для анализа
      const pairs = [
        { a: 'sleep', b: 'kcal', label: 'Сон → Калории', desc: 'Влияние сна на аппетит' },
        { a: 'sleep', b: 'mood', label: 'Сон → Настроение', desc: 'Связь сна и эмоций' },
        { a: 'sleep', b: 'simple', label: 'Сон → Сладкое', desc: 'Недосып → тяга к сахару' },
        { a: 'steps', b: 'mood', label: 'Шаги → Настроение', desc: 'Движение и эмоции' },
        { a: 'steps', b: 'weight', label: 'Шаги → Вес', desc: 'Влияние активности на вес' },
        { a: 'stress', b: 'simple', label: 'Стресс → Сладкое', desc: 'Заедание стресса' },
        { a: 'stress', b: 'kcal', label: 'Стресс → Калории', desc: 'Стрессовое переедание' },
        { a: 'protein', b: 'mood', label: 'Белок → Настроение', desc: 'Белок и серотонин' },
        { a: 'fiber', b: 'mood', label: 'Клетчатка → Настроение', desc: 'Gut-brain axis' },
        { a: 'water', b: 'mood', label: 'Вода → Настроение', desc: 'Гидратация и когнитивные функции' },
        { a: 'trainings', b: 'sleep', label: 'Тренировки → Сон', desc: 'Спорт улучшает сон' },
        { a: 'trainings', b: 'mood', label: 'Тренировки → Настроение', desc: 'Эндорфины' }
      ];

      const correlations = pairs.map(({ a, b, label, desc }) => {
        const arrA = metrics.map(m => m[a]).filter(v => v > 0);
        const arrB = metrics.map(m => m[b]).filter(v => v > 0);

        // Нужны валидные пары
        const validPairs = metrics.filter(m => m[a] > 0 && m[b] > 0);
        if (validPairs.length < 5) {
          return { label, desc, correlation: null, strength: 'insufficient', available: false };
        }

        const r = pearsonCorrelation(
          validPairs.map(m => m[a]),
          validPairs.map(m => m[b])
        );

        const absR = Math.abs(r);
        const strength = absR >= 0.7 ? 'strong' : absR >= 0.4 ? 'moderate' : absR >= 0.2 ? 'weak' : 'none';
        const direction = r > 0 ? 'positive' : r < 0 ? 'negative' : 'none';

        return {
          label,
          desc,
          metricA: a,
          metricB: b,
          correlation: Math.round(r * 100) / 100,
          absCorrelation: Math.round(absR * 100) / 100,
          strength,
          direction,
          dataPoints: validPairs.length,
          available: true
        };
      }).filter(c => c.available);

      // Сортируем по силе корреляции
      const sorted = [...correlations].sort((a, b) => b.absCorrelation - a.absCorrelation);
      const strongest = sorted[0] || null;

      // Генерируем инсайты
      const insights = [];
      const strongCorrelations = sorted.filter(c => c.strength === 'strong' || c.strength === 'moderate');

      strongCorrelations.slice(0, 3).forEach(c => {
        if (c.correlation > 0.4) {
          insights.push(`📈 ${c.label}: сильная положительная связь (+${Math.round(c.correlation * 100)}%)`);
        } else if (c.correlation < -0.4) {
          insights.push(`📉 ${c.label}: сильная обратная связь (${Math.round(c.correlation * 100)}%)`);
        }
      });

      if (insights.length === 0) {
        insights.push('Пока явных корреляций не выявлено. Продолжай вести учёт!');
      }

      return {
        correlations: sorted,
        strongest,
        insights,
        totalPairs: pairs.length,
        analyzedPairs: correlations.length,
        hasData: correlations.length >= 3
      };
    },

    /**
     * Metabolic Patterns — обнаружение метаболических паттернов
     * Анализирует: чувствительность к углеводам, адаптация к жирам, хронотип
     * @param {Object} options - { lsGet, daysBack, pIndex, profile }
     * @returns {Object} { patterns, phenotype, recommendations }
     */
    detectMetabolicPatterns: function (options = {}) {
      const lsGet = options.lsGet || U.lsGet;
      const daysBack = options.daysBack || 30;
      const pIndex = options.pIndex || HEYS.products?.buildIndex?.();
      const profile = options.profile || lsGet('heys_profile', {});
      const days = getDaysData(daysBack, lsGet);

      const patterns = [];

      // === 1. Carb Sensitivity (чувствительность к углеводам) ===
      // Анализируем: съел много простых углеводов → как изменился вес на следующий день
      const carbDays = [];
      for (let i = 1; i < days.length; i++) {
        const prevDay = days[i];
        const nextDay = days[i - 1];

        if (!prevDay.meals?.length || !nextDay.weightMorning || !prevDay.weightMorning) continue;

        let simpleCarbs = 0;
        (prevDay.meals || []).forEach(m => (m.items || []).forEach(item => {
          const g = item.grams || 0;
          const prod = pIndex?.byId?.get?.(String(item.product_id || item.productId || item.id)?.toLowerCase());
          if (prod && g > 0) {
            simpleCarbs += (prod.simple100 || 0) * g / 100;
          }
        }));

        const weightDelta = nextDay.weightMorning - prevDay.weightMorning;
        carbDays.push({ simpleCarbs, weightDelta });
      }

      if (carbDays.length >= 7) {
        const highCarbDays = carbDays.filter(d => d.simpleCarbs > 50);
        const lowCarbDays = carbDays.filter(d => d.simpleCarbs < 30);

        const highCarbAvgDelta = highCarbDays.length > 0 ? average(highCarbDays.map(d => d.weightDelta)) : 0;
        const lowCarbAvgDelta = lowCarbDays.length > 0 ? average(lowCarbDays.map(d => d.weightDelta)) : 0;

        const carbSensitivity = highCarbAvgDelta - lowCarbAvgDelta;
        const sensitivityLevel = carbSensitivity > 0.5 ? 'high' : carbSensitivity > 0.2 ? 'moderate' : 'low';

        patterns.push({
          type: 'carb_sensitivity',
          label: 'Чувствительность к углеводам',
          level: sensitivityLevel,
          value: Math.round(carbSensitivity * 100) / 100,
          insight: sensitivityLevel === 'high'
            ? '⚠️ Высокая: простые углеводы сильно влияют на вес (задержка воды)'
            : sensitivityLevel === 'moderate'
              ? '📊 Умеренная: следи за простыми углеводами'
              : '✅ Низкая: углеводы не сильно влияют на вес'
        });
      }

      // === 2. Fat Adaptation (адаптация к жирам) ===
      // Анализируем: соотношение жиров/углеводов и уровень энергии (mood/dayScore)
      const fatRatioDays = days.map(d => {
        let fat = 0, carbs = 0;
        (d.meals || []).forEach(m => (m.items || []).forEach(item => {
          const g = item.grams || 0;
          const prod = pIndex?.byId?.get?.(String(item.product_id || item.productId || item.id)?.toLowerCase());
          if (prod && g > 0) {
            fat += ((prod.badFat100 || 0) + (prod.goodFat100 || 0)) * g / 100;
            carbs += ((prod.simple100 || 0) + (prod.complex100 || 0)) * g / 100;
          }
        }));

        const ratio = carbs > 0 ? fat / carbs : 0;
        const energy = d.moodAvg || d.dayScore || 0;
        return { ratio, energy, hasData: fat > 0 || carbs > 0 };
      }).filter(d => d.hasData && d.energy > 0);

      if (fatRatioDays.length >= 7) {
        const highFatDays = fatRatioDays.filter(d => d.ratio > 0.5);
        const lowFatDays = fatRatioDays.filter(d => d.ratio < 0.3);

        const highFatEnergy = highFatDays.length > 0 ? average(highFatDays.map(d => d.energy)) : 0;
        const lowFatEnergy = lowFatDays.length > 0 ? average(lowFatDays.map(d => d.energy)) : 0;

        const fatAdaptation = highFatEnergy - lowFatEnergy;
        const adaptationLevel = fatAdaptation > 1 ? 'adapted' : fatAdaptation > 0 ? 'neutral' : 'carb_dependent';

        patterns.push({
          type: 'fat_adaptation',
          label: 'Метаболическая гибкость',
          level: adaptationLevel,
          value: Math.round(fatAdaptation * 10) / 10,
          insight: adaptationLevel === 'adapted'
            ? '🔥 Хорошая: организм эффективно использует жиры'
            : adaptationLevel === 'carb_dependent'
              ? '⚡ Зависимость от углеводов: энергия падает без них'
              : '📊 Нейтральная: организм гибко использует нутриенты'
        });
      }

      // === 3. Chronotype Detection (хронотип) ===
      // Анализируем: время первого приёма пищи и качество дня
      const mealTimeDays = days.map(d => {
        const meals = d.meals || [];
        if (meals.length === 0) return null;

        const firstMeal = meals.sort((a, b) => (a.time || '').localeCompare(b.time || ''))[0];
        const firstMealHour = firstMeal?.time ? parseInt(firstMeal.time.split(':')[0]) : null;
        const dayQuality = d.dayScore || d.moodAvg || 0;

        return firstMealHour !== null ? { hour: firstMealHour, quality: dayQuality } : null;
      }).filter(Boolean);

      if (mealTimeDays.length >= 7) {
        const earlyDays = mealTimeDays.filter(d => d.hour < 9);
        const lateDays = mealTimeDays.filter(d => d.hour >= 11);

        const earlyQuality = earlyDays.length > 0 ? average(earlyDays.map(d => d.quality)) : 0;
        const lateQuality = lateDays.length > 0 ? average(lateDays.map(d => d.quality)) : 0;

        const chronotypeScore = earlyQuality - lateQuality;
        const chronotype = chronotypeScore > 0.5 ? 'early_bird' : chronotypeScore < -0.5 ? 'night_owl' : 'neutral';

        patterns.push({
          type: 'chronotype',
          label: 'Хронотип питания',
          level: chronotype,
          value: Math.round(chronotypeScore * 10) / 10,
          insight: chronotype === 'early_bird'
            ? '🌅 Жаворонок: ранние завтраки повышают качество дня'
            : chronotype === 'night_owl'
              ? '🌙 Сова: позднее начало дня тебе подходит'
              : '⚖️ Нейтральный: время завтрака не сильно влияет'
        });
      }

      // === 4. Stress Eating Pattern ===
      // Корреляция стресс → калории
      const stressDays = days.filter(d => d.stressAvg > 0 && d.meals?.length > 0);
      if (stressDays.length >= 7) {
        const stressValues = stressDays.map(d => d.stressAvg);
        const kcalValues = stressDays.map(d => calculateDayKcal(d, pIndex));

        const r = pearsonCorrelation(stressValues, kcalValues);
        const stressEatingLevel = r > 0.4 ? 'high' : r > 0.2 ? 'moderate' : r < -0.2 ? 'restriction' : 'none';

        patterns.push({
          type: 'stress_eating',
          label: 'Стрессовое переедание',
          level: stressEatingLevel,
          value: Math.round(r * 100) / 100,
          insight: stressEatingLevel === 'high'
            ? '🍫 Выражено: при стрессе ешь больше'
            : stressEatingLevel === 'restriction'
              ? '🚫 Стресс подавляет аппетит'
              : stressEatingLevel === 'moderate'
                ? '📊 Умеренная связь стресса и еды'
                : '✅ Стресс не влияет на питание'
        });
      }

      // Определяем метаболический фенотип
      const phenotype = {
        carbSensitive: patterns.find(p => p.type === 'carb_sensitivity')?.level === 'high',
        fatAdapted: patterns.find(p => p.type === 'fat_adaptation')?.level === 'adapted',
        stressEater: patterns.find(p => p.type === 'stress_eating')?.level === 'high',
        chronotype: patterns.find(p => p.type === 'chronotype')?.level || 'neutral'
      };

      // Рекомендации на основе фенотипа
      const recommendations = [];
      if (phenotype.carbSensitive) {
        recommendations.push('Сократи простые углеводы — твой организм чувствителен');
      }
      if (!phenotype.fatAdapted) {
        recommendations.push('Увеличь долю полезных жиров для метаболической гибкости');
      }
      if (phenotype.stressEater) {
        recommendations.push('Найди альтернативу еде при стрессе (прогулка, дыхание)');
      }

      return {
        patterns,
        phenotype,
        recommendations,
        hasData: patterns.length > 0
      };
    },

    /**
     * Predictive Risk Score — предсказание рисков срыва на 24-48ч
     * Использует: накопленный стресс, недосып, волатильность инсулина, паттерны
     * @param {Object} options - { lsGet, pIndex, profile }
     * @returns {Object} { riskScore, riskLevel, factors, prediction }
     */
    calculatePredictiveRisk: function (options = {}) {
      const lsGet = options.lsGet || U.lsGet;
      const pIndex = options.pIndex || HEYS.products?.buildIndex?.();
      const profile = options.profile || lsGet('heys_profile', {});
      const days = getDaysData(7, lsGet);
      const today = days[0] || {};

      const factors = [];
      let totalRisk = 0;

      // === 1. Accumulated Stress (EMA) — 25% веса ===
      // Экспоненциальное скользящее среднее стресса
      const stressValues = days.map(d => d.stressAvg || 0).filter(s => s > 0);
      let stressEMA = 0;
      const alpha = 0.3; // decay factor

      if (stressValues.length > 0) {
        stressEMA = stressValues.reduce((ema, stress, i) => {
          return alpha * stress + (1 - alpha) * ema;
        }, stressValues[0]);
      }

      const stressRisk = Math.min(100, stressEMA * 10);
      factors.push({
        name: 'Накопленный стресс',
        value: Math.round(stressEMA * 10) / 10,
        risk: Math.round(stressRisk),
        weight: 0.25,
        insight: stressRisk > 60 ? '⚠️ Высокий накопленный стресс' : '✅ Стресс под контролем'
      });
      totalRisk += stressRisk * 0.25;

      // === 2. Sleep Debt — 25% веса ===
      const sleepNorm = profile.sleepHours || 8;
      const sleepValues = days.map(d => d.sleepHours || 0).filter(s => s > 0);
      const sleepDebt = sleepValues.length > 0
        ? sleepValues.reduce((debt, sleep) => debt + Math.max(0, sleepNorm - sleep), 0)
        : 0;

      const sleepRisk = Math.min(100, sleepDebt * 10);
      factors.push({
        name: 'Недосып (долг сна)',
        value: Math.round(sleepDebt * 10) / 10,
        risk: Math.round(sleepRisk),
        weight: 0.25,
        insight: sleepRisk > 60 ? '😴 Накопился недосып — риск срыва' : '✅ Сон в норме'
      });
      totalRisk += sleepRisk * 0.25;

      // === 3. Insulin Volatility — 20% веса ===
      // Анализируем частоту перекусов и простых углеводов
      const todayMeals = today.meals || [];
      let simpleCarbs = 0;
      let mealCount = todayMeals.length;

      todayMeals.forEach(m => (m.items || []).forEach(item => {
        const g = item.grams || 0;
        const prod = pIndex?.byId?.get?.(String(item.product_id || item.productId || item.id)?.toLowerCase());
        if (prod && g > 0) {
          simpleCarbs += (prod.simple100 || 0) * g / 100;
        }
      }));

      // Много перекусов + много простых = высокая волатильность
      const insulinVolatility = Math.min(100, (mealCount > 5 ? 30 : 0) + (simpleCarbs > 80 ? 40 : simpleCarbs > 40 ? 20 : 0));
      factors.push({
        name: 'Инсулиновая волатильность',
        value: Math.round(simpleCarbs),
        risk: Math.round(insulinVolatility),
        weight: 0.20,
        insight: insulinVolatility > 50 ? '📈 Скачки инсулина — голод вернётся быстро' : '✅ Стабильный инсулин'
      });
      totalRisk += insulinVolatility * 0.20;

      // === 4. Temporal Patterns — 20% веса ===
      // День недели, время дня
      const now = new Date();
      const dayOfWeek = now.getDay();
      const hour = now.getHours();

      // Выходные = повышенный риск
      const weekendRisk = (dayOfWeek === 0 || dayOfWeek === 6 || dayOfWeek === 5) ? 30 : 0;
      // Вечер = повышенный риск
      const eveningRisk = hour >= 20 ? 25 : hour >= 18 ? 15 : 0;

      const temporalRisk = weekendRisk + eveningRisk;
      factors.push({
        name: 'Время (выходные/вечер)',
        value: `${['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'][dayOfWeek]} ${hour}:00`,
        risk: Math.round(temporalRisk),
        weight: 0.20,
        insight: temporalRisk > 30 ? '🕐 Опасное время — будь внимательнее' : '✅ Время не критичное'
      });
      totalRisk += temporalRisk * 0.20;

      // === 5. Caloric Debt Bonus — 10% веса ===
      // Если сегодня большой недобор — риск срыва вечером/ночью
      const todayKcal = calculateDayKcal(today, pIndex);
      const optimum = HEYS.Day?.calculateOptimum?.(profile) || 2000;
      const kcalPct = todayKcal / optimum;

      const debtRisk = kcalPct < 0.5 && hour >= 16 ? 60 : kcalPct < 0.7 && hour >= 18 ? 40 : 0;
      factors.push({
        name: 'Сегодняшний недобор',
        value: `${Math.round(kcalPct * 100)}%`,
        risk: Math.round(debtRisk),
        weight: 0.10,
        insight: debtRisk > 40 ? '🍽️ Мало съедено — голод ударит вечером' : '✅ Калории в норме'
      });
      totalRisk += debtRisk * 0.10;

      // Итоговый риск и уровень
      const riskScore = Math.round(Math.min(100, totalRisk));
      const riskLevel = riskScore >= 70 ? 'high' : riskScore >= 40 ? 'moderate' : 'low';
      const riskEmoji = { high: '🚨', moderate: '⚠️', low: '✅' }[riskLevel];
      const riskLabel = { high: 'Высокий', moderate: 'Умеренный', low: 'Низкий' }[riskLevel];

      // Предсказание и рекомендация
      const prediction = riskLevel === 'high'
        ? 'Риск срыва в ближайшие 24ч — будь особенно внимательным!'
        : riskLevel === 'moderate'
          ? 'Умеренный риск — следи за триггерами'
          : 'Низкий риск — продолжай в том же духе!';

      const topFactor = [...factors].sort((a, b) => b.risk - a.risk)[0];
      const recommendation = topFactor?.risk > 40
        ? `Фокус: ${topFactor.name.toLowerCase()}`
        : 'Всё под контролем!';

      return {
        riskScore,
        riskLevel,
        riskEmoji,
        riskLabel,
        factors,
        prediction,
        recommendation,
        topFactor,
        hasData: days.length >= 3
      };
    },

    /**
     * Energy Forecast — прогноз энергии на 24 часа
     * Предсказывает оптимальные окна для активности и отдыха
     * @param {Object} options - { lsGet, pIndex, profile }
     * @returns {Object} { hourlyForecast, peakWindow, dipWindow, recommendations }
     */
    forecastEnergy: function (options = {}) {
      const lsGet = options.lsGet || U.lsGet;
      const pIndex = options.pIndex || HEYS.products?.buildIndex?.();
      const profile = options.profile || lsGet('heys_profile', {});
      const days = getDaysData(14, lsGet);
      const today = days[0] || {};

      // Базовый циркадный профиль (типичный для большинства людей)
      // Van Cauter 1997: кортизол пик 6-9, инсулин чувствительность падает к вечеру
      const baseCircadian = [
        // 0-5: ночь (низкая энергия)
        20, 15, 10, 10, 15, 25,
        // 6-11: утро (рост)
        40, 55, 70, 80, 85, 90,
        // 12-17: день (пик и плато)
        85, 75, 70, 75, 80, 75,
        // 18-23: вечер (спад)
        65, 55, 45, 35, 30, 25
      ];

      // Модификаторы на основе данных пользователя
      const modifiers = [];

      // 1. Сон прошлой ночи
      const sleepHours = today.sleepHours || 0;
      const sleepQuality = today.sleepQuality || 3;
      const sleepMod = sleepHours >= 7 ? 1.1 : sleepHours >= 6 ? 1.0 : sleepHours >= 5 ? 0.85 : 0.7;
      modifiers.push({ name: 'Сон', value: sleepMod, desc: `${sleepHours}ч сна` });

      // 2. Текущий калораж (энергия из еды)
      const todayKcal = calculateDayKcal(today, pIndex);
      const optimum = HEYS.Day?.calculateOptimum?.(profile) || 2000;
      const kcalPct = todayKcal / optimum;
      const kcalMod = kcalPct >= 0.8 ? 1.1 : kcalPct >= 0.5 ? 1.0 : kcalPct >= 0.3 ? 0.9 : 0.75;
      modifiers.push({ name: 'Еда', value: kcalMod, desc: `${Math.round(kcalPct * 100)}% нормы` });

      // 3. Стресс
      const stressAvg = today.stressAvg || 5;
      const stressMod = stressAvg <= 3 ? 1.1 : stressAvg <= 5 ? 1.0 : stressAvg <= 7 ? 0.9 : 0.8;
      modifiers.push({ name: 'Стресс', value: stressMod, desc: `${stressAvg}/10` });

      // 4. Тренировки (EPOC даёт энергию после)
      const trainings = today.trainings || [];
      const hasTrained = trainings.length > 0;
      const trainingMod = hasTrained ? 1.15 : 1.0;
      modifiers.push({ name: 'Тренировка', value: trainingMod, desc: hasTrained ? 'Да' : 'Нет' });

      // Общий модификатор
      const totalMod = modifiers.reduce((acc, m) => acc * m.value, 1);

      // Применяем модификаторы к базовому профилю
      const currentHour = new Date().getHours();
      const hourlyForecast = baseCircadian.map((baseEnergy, hour) => {
        // Для прошедших часов — фактическая энергия (примерная)
        // Для будущих — прогноз с модификатором
        const isPast = hour < currentHour;
        const energy = Math.round(Math.min(100, Math.max(0, baseEnergy * totalMod)));

        return {
          hour,
          energy,
          isPast,
          label: `${hour}:00`,
          level: energy >= 80 ? 'peak' : energy >= 60 ? 'good' : energy >= 40 ? 'moderate' : 'low'
        };
      });

      // Находим окна пиков и спадов (только в будущем)
      const futureHours = hourlyForecast.filter(h => h.hour >= currentHour);
      const sortedByEnergy = [...futureHours].sort((a, b) => b.energy - a.energy);

      const peakWindow = sortedByEnergy[0] || { hour: 10, energy: 80 };
      const dipWindow = sortedByEnergy[sortedByEnergy.length - 1] || { hour: 22, energy: 30 };

      // Рекомендации
      const recommendations = [];

      if (peakWindow.energy >= 70) {
        recommendations.push(`🔥 Пик энергии в ${peakWindow.hour}:00 — идеально для тренировки или важных дел`);
      }

      if (dipWindow.hour >= currentHour && dipWindow.hour <= 22) {
        recommendations.push(`😴 Спад в ${dipWindow.hour}:00 — запланируй отдых или лёгкие задачи`);
      }

      if (sleepMod < 0.9) {
        recommendations.push('💤 Недосып снижает энергию на весь день');
      }

      if (kcalMod < 0.9) {
        recommendations.push('🍽️ Мало съел — энергия будет падать');
      }

      return {
        hourlyForecast,
        peakWindow,
        dipWindow,
        modifiers,
        totalMod: Math.round(totalMod * 100) / 100,
        currentHour,
        recommendations,
        hasData: true
      };
    },

    // === SCIENTIFIC ANALYTICS v3.0 ===

    /**
     * Bayesian Confidence + MAPE — научная оценка достоверности предсказаний
     * MAPE = Mean Absolute Percentage Error
     * Bayesian: posterior = prior × likelihood
     * @param {Object} options - { lsGet, pIndex, daysBack }
     * @returns {Object} { mape, bayesianConfidence, crossValidation, qualityGrade }
     */
    calculateBayesianConfidence: function (options = {}) {
      const lsGet = options.lsGet || U.lsGet;
      const pIndex = options.pIndex || HEYS.products?.buildIndex?.();
      const daysBack = options.daysBack || 30;
      const days = getDaysData(daysBack, lsGet);

      // Фильтруем дни с данными
      const validDays = days.filter(d => (d.meals?.length || 0) > 0 && d.weightMorning > 0);

      if (validDays.length < 10) {
        return {
          mape: null,
          bayesianConfidence: 0.5,
          crossValidation: null,
          qualityGrade: 'insufficient',
          message: 'Нужно минимум 10 дней с весом и питанием',
          hasData: false
        };
      }

      // === MAPE: Cross-validation для калорий → вес ===
      // Используем leave-one-out cross-validation
      const predictions = [];
      const actuals = [];

      for (let i = 1; i < validDays.length - 1; i++) {
        // Предсказываем вес на основе калорий за 3 дня до
        const prevDays = validDays.slice(i, i + 3);
        const avgKcal = average(prevDays.map(d => calculateDayKcal(d, pIndex)));
        const avgWeight = average(prevDays.map(d => d.weightMorning));

        // Простая модель: kcalDeficit × 7700 = потеря жира
        // 7700 ккал ≈ 1 кг жира (Wishnofsky 1958, спорно но широко используется)
        const optimum = 2000; // baseline
        const dailyDeficit = optimum - avgKcal;
        const predictedWeightChange = (dailyDeficit * 3) / 7700; // за 3 дня
        const predictedWeight = avgWeight - predictedWeightChange;

        const actualWeight = validDays[i - 1].weightMorning;

        if (actualWeight > 0 && predictedWeight > 0) {
          predictions.push(predictedWeight);
          actuals.push(actualWeight);
        }
      }

      // MAPE calculation
      let mape = null;
      if (predictions.length >= 5) {
        const apes = predictions.map((pred, i) =>
          Math.abs((actuals[i] - pred) / actuals[i]) * 100
        );
        mape = average(apes);
      }

      // === Bayesian Confidence ===
      // Prior: базовая уверенность 0.5
      // Likelihood: зависит от MAPE и объёма данных
      const prior = 0.5;

      // Likelihood на основе MAPE (чем ниже MAPE, тем выше)
      const mapeLikelihood = mape !== null
        ? Math.max(0.1, 1 - (mape / 20)) // MAPE 0% = 1.0, MAPE 20% = 0.0
        : 0.5;

      // Likelihood на основе объёма данных (n)
      // Формула: 1 - 1/(1 + n/10)
      const nLikelihood = 1 - 1 / (1 + validDays.length / 10);

      // Likelihood на основе консистентности (низкая std веса = хорошо)
      const weights = validDays.map(d => d.weightMorning);
      const weightStd = stdDev(weights);
      const consistencyLikelihood = Math.max(0.3, 1 - weightStd / 5);

      // Комбинированный likelihood
      const likelihood = (mapeLikelihood * 0.4 + nLikelihood * 0.3 + consistencyLikelihood * 0.3);

      // Posterior (упрощённый Bayesian update)
      // P(accurate | data) = P(data | accurate) × P(accurate) / P(data)
      // Упрощаем: posterior ∝ prior × likelihood
      const unnormalizedPosterior = prior * likelihood;
      const bayesianConfidence = Math.min(0.95, unnormalizedPosterior / 0.5); // normalize to [0, 0.95]

      // Cross-validation metrics
      const crossValidation = predictions.length >= 5 ? {
        r2: calculateR2(actuals, predictions),
        rmse: Math.sqrt(average(predictions.map((p, i) => Math.pow(actuals[i] - p, 2)))),
        mae: average(predictions.map((p, i) => Math.abs(actuals[i] - p))),
        n: predictions.length
      } : null;

      // Quality grade
      const qualityGrade = bayesianConfidence >= 0.8 ? 'excellent'
        : bayesianConfidence >= 0.65 ? 'good'
          : bayesianConfidence >= 0.5 ? 'moderate'
            : 'low';

      const gradeEmoji = { excellent: '🎯', good: '✅', moderate: '⚠️', low: '❌' }[qualityGrade];

      return {
        mape: mape !== null ? Math.round(mape * 10) / 10 : null,
        bayesianConfidence: Math.round(bayesianConfidence * 100) / 100,
        confidencePercent: Math.round(bayesianConfidence * 100),
        crossValidation,
        qualityGrade,
        gradeEmoji,
        components: {
          mapeLikelihood: Math.round(mapeLikelihood * 100),
          nLikelihood: Math.round(nLikelihood * 100),
          consistencyLikelihood: Math.round(consistencyLikelihood * 100)
        },
        dataPoints: validDays.length,
        message: qualityGrade === 'excellent'
          ? 'Высокая точность предсказаний!'
          : qualityGrade === 'good'
            ? 'Хорошая точность, продолжай вести учёт'
            : 'Нужно больше данных для точных предсказаний',
        pmid: '13524500', // Wishnofsky 1958 — 3500 kcal/lb
        hasData: true
      };
    },

    /**
     * Time-Lagged Cross-Correlation — определение причинности
     * Granger-like causality: X вызывает Y если прошлые X предсказывают Y
     * @param {Object} options - { lsGet, pIndex, daysBack }
     * @returns {Object} { causalLinks, lagAnalysis, strongest }
     */
    calculateTimeLaggedCorrelations: function (options = {}) {
      const lsGet = options.lsGet || U.lsGet;
      const pIndex = options.pIndex || HEYS.products?.buildIndex?.();
      const daysBack = options.daysBack || 30;
      const days = getDaysData(daysBack, lsGet).reverse(); // хронологический порядок

      if (days.length < 14) {
        return {
          causalLinks: [],
          lagAnalysis: [],
          strongest: null,
          hasData: false,
          message: 'Нужно минимум 14 дней данных'
        };
      }

      // Извлекаем временные ряды
      const series = {
        sleep: days.map(d => d.sleepHours || 0),
        kcal: days.map(d => calculateDayKcal(d, pIndex)),
        weight: days.map(d => d.weightMorning || 0),
        mood: days.map(d => d.moodAvg || d.dayScore || 0),
        stress: days.map(d => d.stressAvg || 0),
        steps: days.map(d => d.steps || 0),
        simple: days.map(d => {
          let simple = 0;
          (d.meals || []).forEach(m => (m.items || []).forEach(item => {
            const g = item.grams || 0;
            const prod = pIndex?.byId?.get?.(String(item.product_id || item.productId || item.id)?.toLowerCase());
            if (prod && g > 0) simple += (prod.simple100 || 0) * g / 100;
          }));
          return simple;
        })
      };

      // Пары для анализа причинности
      const causalPairs = [
        { cause: 'sleep', effect: 'kcal', label: 'Сон → Калории', hypothesis: 'Недосып вызывает переедание' },
        { cause: 'sleep', effect: 'mood', label: 'Сон → Настроение', hypothesis: 'Сон влияет на эмоции' },
        { cause: 'stress', effect: 'simple', label: 'Стресс → Сладкое', hypothesis: 'Стресс вызывает тягу к сахару' },
        { cause: 'stress', effect: 'kcal', label: 'Стресс → Калории', hypothesis: 'Стрессовое переедание' },
        { cause: 'kcal', effect: 'weight', label: 'Калории → Вес', hypothesis: 'Избыток калорий → набор веса' },
        { cause: 'steps', effect: 'mood', label: 'Шаги → Настроение', hypothesis: 'Движение улучшает настроение' },
        { cause: 'simple', effect: 'mood', label: 'Сладкое → Настроение (lag)', hypothesis: 'Сахар → временный подъём → спад' }
      ];

      const lagAnalysis = [];

      causalPairs.forEach(({ cause, effect, label, hypothesis }) => {
        const causeData = series[cause];
        const effectData = series[effect];

        // Проверяем корреляции с разными лагами (0-3 дня)
        const lagResults = [];

        for (let lag = 0; lag <= 3; lag++) {
          const validPairs = [];

          for (let i = lag; i < days.length; i++) {
            const causeVal = causeData[i - lag];
            const effectVal = effectData[i];

            if (causeVal > 0 && effectVal > 0) {
              validPairs.push({ cause: causeVal, effect: effectVal });
            }
          }

          if (validPairs.length >= 7) {
            const r = pearsonCorrelation(
              validPairs.map(p => p.cause),
              validPairs.map(p => p.effect)
            );

            lagResults.push({
              lag,
              correlation: Math.round(r * 100) / 100,
              absCorrelation: Math.abs(r),
              dataPoints: validPairs.length,
              significant: Math.abs(r) > 0.3
            });
          }
        }

        if (lagResults.length > 0) {
          // Находим оптимальный лаг (максимальная |корреляция|)
          const bestLag = lagResults.reduce((best, curr) =>
            curr.absCorrelation > best.absCorrelation ? curr : best
            , lagResults[0]);

          // Определяем направление причинности
          // Если lag > 0 даёт сильнее корреляцию — есть временнАя причинность
          const lag0 = lagResults.find(l => l.lag === 0);
          const hasCausality = bestLag.lag > 0 && bestLag.absCorrelation > (lag0?.absCorrelation || 0) + 0.1;

          lagAnalysis.push({
            cause,
            effect,
            label,
            hypothesis,
            lagResults,
            bestLag: bestLag.lag,
            bestCorrelation: bestLag.correlation,
            hasCausality,
            causalStrength: hasCausality ? 'confirmed' : bestLag.absCorrelation > 0.3 ? 'possible' : 'weak',
            insight: hasCausality
              ? `✅ ${label}: подтверждено (лаг ${bestLag.lag} дн, r=${bestLag.correlation})`
              : bestLag.absCorrelation > 0.3
                ? `📊 ${label}: связь есть (r=${bestLag.correlation})`
                : `⚪ ${label}: связь слабая`
          });
        }
      });

      // Сортируем по силе причинности
      const sorted = [...lagAnalysis].sort((a, b) =>
        (b.hasCausality ? 1 : 0) - (a.hasCausality ? 1 : 0) ||
        b.bestCorrelation - a.bestCorrelation
      );

      const causalLinks = sorted.filter(l => l.hasCausality);

      return {
        causalLinks,
        lagAnalysis: sorted,
        strongest: causalLinks[0] || sorted[0] || null,
        confirmedCount: causalLinks.length,
        totalAnalyzed: lagAnalysis.length,
        hasData: lagAnalysis.length > 0,
        pmid: '7608935' // Granger 1969 — causality testing
      };
    },

    /**
     * Glycemic Variability Index (GVI) + CONGA
     * CV% = (stdDev / mean) × 100 — простая волатильность
     * CONGA = Continuous Overall Net Glycemic Action (симуляция)
     * @param {Object} options - { lsGet, pIndex, daysBack }
     * @returns {Object} { gvi, conga, insulinVolatility, riskCategory }
     */
    calculateGlycemicVariability: function (options = {}) {
      const lsGet = options.lsGet || U.lsGet;
      const pIndex = options.pIndex || HEYS.products?.buildIndex?.();
      const daysBack = options.daysBack || 14;
      const days = getDaysData(daysBack, lsGet);

      // Собираем данные о гликемической нагрузке каждого приёма
      const mealGLs = [];
      const dailyGLs = [];

      days.forEach(day => {
        let dayGL = 0;
        (day.meals || []).forEach(meal => {
          let mealGL = 0;
          (meal.items || []).forEach(item => {
            const g = item.grams || 0;
            const prod = pIndex?.byId?.get?.(String(item.product_id || item.productId || item.id)?.toLowerCase());
            if (prod && g > 0) {
              const gi = prod.gi || prod.gi100 || 50;
              const carbs = ((prod.simple100 || 0) + (prod.complex100 || 0)) * g / 100;
              const gl = (gi * carbs) / 100;
              mealGL += gl;
            }
          });
          if (mealGL > 0) mealGLs.push(mealGL);
          dayGL += mealGL;
        });
        if (dayGL > 0) dailyGLs.push(dayGL);
      });

      if (mealGLs.length < 10 || dailyGLs.length < 5) {
        return {
          gvi: null,
          conga: null,
          insulinVolatility: null,
          riskCategory: 'insufficient',
          hasData: false,
          message: 'Нужно больше данных о питании'
        };
      }

      // === GVI (Glycemic Variability Index) ===
      // CV% = (SD / Mean) × 100
      // Monnier 2006: CV% > 36% = высокая волатильность
      const mealGLMean = average(mealGLs);
      const mealGLStd = stdDev(mealGLs);
      const gvi = (mealGLStd / mealGLMean) * 100;

      // === CONGA-like (Continuous Net Glycemic Action) ===
      // Симулируем: разница GL между последовательными приёмами
      const glDifferences = [];
      for (let i = 1; i < mealGLs.length; i++) {
        glDifferences.push(Math.abs(mealGLs[i] - mealGLs[i - 1]));
      }
      const conga = glDifferences.length > 0 ? average(glDifferences) : 0;

      // === Insulin Volatility Score ===
      // Комбинированная метрика: GVI + daily variation
      const dailyGLStd = stdDev(dailyGLs);
      const dailyGLMean = average(dailyGLs);
      const dailyCV = dailyGLMean > 0 ? (dailyGLStd / dailyGLMean) * 100 : 0;

      const insulinVolatility = (gvi * 0.6 + dailyCV * 0.4);

      // Risk category (based on Monnier 2006)
      const riskCategory = gvi > 50 ? 'high'
        : gvi > 36 ? 'elevated'
          : gvi > 25 ? 'moderate'
            : 'low';

      const riskEmoji = { high: '🚨', elevated: '⚠️', moderate: '📊', low: '✅' }[riskCategory];
      const riskLabel = {
        high: 'Высокая волатильность',
        elevated: 'Повышенная',
        moderate: 'Умеренная',
        low: 'Низкая (хорошо)'
      }[riskCategory];

      // Рекомендации
      const recommendations = [];
      if (gvi > 36) {
        recommendations.push('Стабилизируй углеводы — большие скачки GL вредны');
      }
      if (conga > 15) {
        recommendations.push('Избегай резких переходов: много сладкого → голодание');
      }
      if (mealGLMean > 25) {
        recommendations.push('Снизь среднюю гликемическую нагрузку приёмов');
      }

      return {
        gvi: Math.round(gvi * 10) / 10,
        conga: Math.round(conga * 10) / 10,
        insulinVolatility: Math.round(insulinVolatility * 10) / 10,
        mealGLMean: Math.round(mealGLMean * 10) / 10,
        mealGLStd: Math.round(mealGLStd * 10) / 10,
        dailyCV: Math.round(dailyCV * 10) / 10,
        riskCategory,
        riskEmoji,
        riskLabel,
        recommendations,
        dataPoints: mealGLs.length,
        hasData: true,
        thresholds: { low: 25, moderate: 36, elevated: 50 },
        pmid: '16936182' // Monnier 2006 — glycemic variability
      };
    },

    /**
     * Allostatic Load Score — интегральная нагрузка на организм
     * McEwen 1998: хронический стресс накапливается и истощает резервы
     * @param {Object} options - { lsGet, pIndex, profile }
     * @returns {Object} { alScore, components, riskLevel, recovery }
     */
    calculateAllostaticLoad: function (options = {}) {
      const lsGet = options.lsGet || U.lsGet;
      const pIndex = options.pIndex || HEYS.products?.buildIndex?.();
      const profile = options.profile || lsGet('heys_profile', {});
      const days = getDaysData(14, lsGet);

      if (days.length < 7) {
        return {
          alScore: null,
          components: {},
          riskLevel: 'insufficient',
          hasData: false
        };
      }

      const components = {};
      let totalScore = 0;
      let maxScore = 0;

      // === 1. Cortisol Proxy (стресс) — 20% ===
      // Используем стресс как proxy для кортизола
      const stressValues = days.map(d => d.stressAvg || 0).filter(s => s > 0);
      if (stressValues.length >= 3) {
        const avgStress = average(stressValues);
        const stressScore = Math.min(100, avgStress * 10);
        components.cortisol = {
          value: Math.round(avgStress * 10) / 10,
          score: Math.round(stressScore),
          weight: 0.20,
          label: 'Стресс (cortisol proxy)',
          status: stressScore > 60 ? 'elevated' : 'normal'
        };
        totalScore += stressScore * 0.20;
        maxScore += 100 * 0.20;
      }

      // === 2. Sleep Debt (недосып) — 20% ===
      const sleepNorm = profile.sleepHours || 8;
      const sleepValues = days.map(d => d.sleepHours || 0).filter(s => s > 0);
      if (sleepValues.length >= 3) {
        const avgSleep = average(sleepValues);
        const sleepDeficit = Math.max(0, sleepNorm - avgSleep);
        const sleepScore = Math.min(100, sleepDeficit * 25); // 4ч недосып = 100
        components.sleepDebt = {
          value: Math.round(sleepDeficit * 10) / 10,
          score: Math.round(sleepScore),
          weight: 0.20,
          label: 'Недосып (sleep debt)',
          status: sleepScore > 50 ? 'elevated' : 'normal'
        };
        totalScore += sleepScore * 0.20;
        maxScore += 100 * 0.20;
      }

      // === 3. Metabolic Strain (калорийный стресс) — 15% ===
      const optimum = HEYS.Day?.calculateOptimum?.(profile) || 2000;
      const kcalValues = days.map(d => calculateDayKcal(d, pIndex)).filter(k => k > 0);
      if (kcalValues.length >= 3) {
        const kcalDeviations = kcalValues.map(k => Math.abs(k - optimum) / optimum);
        const avgDeviation = average(kcalDeviations);
        const metabolicScore = Math.min(100, avgDeviation * 200); // 50% отклонение = 100
        components.metabolic = {
          value: Math.round(avgDeviation * 100),
          score: Math.round(metabolicScore),
          weight: 0.15,
          label: 'Метаболический стресс',
          status: metabolicScore > 50 ? 'elevated' : 'normal'
        };
        totalScore += metabolicScore * 0.15;
        maxScore += 100 * 0.15;
      }

      // === 4. Inflammatory Proxy (вредная еда) — 15% ===
      let totalHarm = 0, totalGrams = 0;
      days.forEach(d => {
        (d.meals || []).forEach(m => (m.items || []).forEach(item => {
          const g = item.grams || 0;
          const prod = pIndex?.byId?.get?.(String(item.product_id || item.productId || item.id)?.toLowerCase());
          if (prod && g > 0) {
            totalHarm += (prod.harm || prod.harm100 || 0) * g / 100;
            totalGrams += g;
          }
        }));
      });
      if (totalGrams > 0) {
        const avgHarm = totalHarm / (days.length || 1);
        const inflammatoryScore = Math.min(100, avgHarm * 2);
        components.inflammatory = {
          value: Math.round(avgHarm * 10) / 10,
          score: Math.round(inflammatoryScore),
          weight: 0.15,
          label: 'Воспаление (harm proxy)',
          status: inflammatoryScore > 50 ? 'elevated' : 'normal'
        };
        totalScore += inflammatoryScore * 0.15;
        maxScore += 100 * 0.15;
      }

      // === 5. Activity Deficit (гиподинамия) — 15% ===
      const stepsGoal = profile.stepsGoal || 8000;
      const stepsValues = days.map(d => d.steps || 0).filter(s => s > 0);
      if (stepsValues.length >= 3) {
        const avgSteps = average(stepsValues);
        const stepsDeficit = Math.max(0, (stepsGoal - avgSteps) / stepsGoal);
        const activityScore = Math.min(100, stepsDeficit * 100);
        components.activity = {
          value: Math.round(avgSteps),
          score: Math.round(activityScore),
          weight: 0.15,
          label: 'Гиподинамия',
          status: activityScore > 50 ? 'elevated' : 'normal'
        };
        totalScore += activityScore * 0.15;
        maxScore += 100 * 0.15;
      }

      // === 6. Mood Instability (эмоциональная нестабильность) — 15% ===
      const moodValues = days.map(d => d.moodAvg || d.dayScore || 0).filter(m => m > 0);
      if (moodValues.length >= 5) {
        const moodStd = stdDev(moodValues);
        const moodInstability = Math.min(100, moodStd * 25); // std=4 = 100
        components.moodInstability = {
          value: Math.round(moodStd * 10) / 10,
          score: Math.round(moodInstability),
          weight: 0.15,
          label: 'Эмоциональная нестабильность',
          status: moodInstability > 50 ? 'elevated' : 'normal'
        };
        totalScore += moodInstability * 0.15;
        maxScore += 100 * 0.15;
      }

      // Нормализуем итоговый скор
      const alScore = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;

      // Risk level (based on McEwen thresholds)
      const riskLevel = alScore >= 70 ? 'high'
        : alScore >= 50 ? 'elevated'
          : alScore >= 30 ? 'moderate'
            : 'low';

      const riskEmoji = { high: '🚨', elevated: '⚠️', moderate: '📊', low: '✅' }[riskLevel];
      const riskLabel = {
        high: 'Высокая аллостатическая нагрузка',
        elevated: 'Повышенная нагрузка',
        moderate: 'Умеренная нагрузка',
        low: 'Низкая нагрузка (хорошо)'
      }[riskLevel];

      // Elevated components
      const elevatedComponents = Object.values(components).filter(c => c.status === 'elevated');

      // Recovery recommendations
      const recovery = [];
      if (components.sleepDebt?.status === 'elevated') {
        recovery.push('💤 Приоритет: восстановление сна');
      }
      if (components.cortisol?.status === 'elevated') {
        recovery.push('🧘 Практики снижения стресса');
      }
      if (components.activity?.status === 'elevated') {
        recovery.push('🚶 Увеличь ежедневную активность');
      }
      if (elevatedComponents.length >= 3) {
        recovery.push('⚠️ Организм перегружен — нужен комплексный отдых');
      }

      return {
        alScore,
        components,
        elevatedCount: elevatedComponents.length,
        totalComponents: Object.keys(components).length,
        riskLevel,
        riskEmoji,
        riskLabel,
        recovery,
        hasData: Object.keys(components).length >= 3,
        pmid: '9428090' // McEwen 1998 — allostatic load
      };
    },

    /**
     * Early Warning Signals (EWS) — предвестники срывов
     * Теория динамических систем: перед critical transition растёт:
     * - Variance (дисперсия)
     * - Autocorrelation (автокорреляция)
     * - Skewness (асимметрия)
     * @param {Object} options - { lsGet, pIndex }
     * @returns {Object} { ewsScore, signals, criticalTransitionRisk }
     */
    detectEarlyWarningSignals: function (options = {}) {
      const lsGet = options.lsGet || U.lsGet;
      const pIndex = options.pIndex || HEYS.products?.buildIndex?.();
      const days = getDaysData(21, lsGet);

      if (days.length < 14) {
        return {
          ewsScore: null,
          signals: [],
          criticalTransitionRisk: 'insufficient',
          hasData: false
        };
      }

      // Главная метрика: отклонение от нормы калорий
      const optimum = 2000;
      const deviations = days.map(d => {
        const kcal = calculateDayKcal(d, pIndex);
        return kcal > 0 ? (kcal - optimum) / optimum : null;
      }).filter(d => d !== null);

      if (deviations.length < 10) {
        return {
          ewsScore: null,
          signals: [],
          criticalTransitionRisk: 'insufficient',
          hasData: false
        };
      }

      const signals = [];

      // === 1. Rising Variance (дисперсия растёт) ===
      // Сравниваем дисперсию последних 7 дней vs предыдущих 7
      const recent = deviations.slice(0, 7);
      const previous = deviations.slice(7, 14);

      const recentVar = variance(recent);
      const previousVar = variance(previous);
      const varianceRatio = previousVar > 0 ? recentVar / previousVar : 1;

      const varianceSignal = varianceRatio > 1.5;
      signals.push({
        type: 'variance',
        label: 'Рост дисперсии',
        detected: varianceSignal,
        value: Math.round(varianceRatio * 100) / 100,
        threshold: 1.5,
        insight: varianceSignal
          ? '⚠️ Питание становится нестабильным'
          : '✅ Стабильность в норме',
        weight: 0.35
      });

      // === 2. Rising Autocorrelation (автокорреляция растёт) ===
      // Высокая автокорреляция = система "застревает" в состояниях
      const lag1Autocorr = autocorrelation(recent, 1);
      const autocorrSignal = lag1Autocorr > 0.5;

      signals.push({
        type: 'autocorrelation',
        label: 'Автокорреляция (инерция)',
        detected: autocorrSignal,
        value: Math.round(lag1Autocorr * 100) / 100,
        threshold: 0.5,
        insight: autocorrSignal
          ? '⚠️ Паттерны застревают — сложнее вернуться к норме'
          : '✅ Гибкость сохраняется',
        weight: 0.35
      });

      // === 3. Skewness (асимметрия — перекос в сторону переедания) ===
      const skew = skewness(recent);
      const skewSignal = skew > 0.5; // положительный = перекос к перееданию

      signals.push({
        type: 'skewness',
        label: 'Асимметрия (перекос)',
        detected: skewSignal,
        value: Math.round(skew * 100) / 100,
        threshold: 0.5,
        insight: skewSignal
          ? skew > 0
            ? '⚠️ Тенденция к перееданию'
            : '⚠️ Тенденция к недоеданию'
          : '✅ Баланс в норме',
        weight: 0.20
      });

      // === 4. Trend (тренд последних дней) ===
      const trendSlope = linearTrend(recent);
      const trendSignal = Math.abs(trendSlope) > 0.05;

      signals.push({
        type: 'trend',
        label: 'Тренд отклонений',
        detected: trendSignal,
        value: Math.round(trendSlope * 100) / 100,
        threshold: 0.05,
        insight: trendSignal
          ? trendSlope > 0
            ? '📈 Калории растут день ото дня'
            : '📉 Калории падают день ото дня'
          : '➡️ Стабильный тренд',
        weight: 0.10
      });

      // Итоговый EWS Score
      const ewsScore = signals.reduce((sum, s) =>
        sum + (s.detected ? s.weight * 100 : 0)
        , 0);

      const detectedCount = signals.filter(s => s.detected).length;

      // Critical Transition Risk
      const criticalTransitionRisk = ewsScore >= 70 ? 'high'
        : ewsScore >= 45 ? 'elevated'
          : ewsScore >= 25 ? 'moderate'
            : 'low';

      const riskEmoji = { high: '🚨', elevated: '⚠️', moderate: '📊', low: '✅' }[criticalTransitionRisk];

      // Prediction
      const prediction = criticalTransitionRisk === 'high'
        ? '⚠️ Система на грани срыва — нужны превентивные меры!'
        : criticalTransitionRisk === 'elevated'
          ? '📊 Повышенный риск срыва в ближайшие 3-5 дней'
          : criticalTransitionRisk === 'moderate'
            ? '📈 Небольшие признаки нестабильности'
            : '✅ Система стабильна';

      return {
        ewsScore: Math.round(ewsScore),
        signals,
        detectedCount,
        criticalTransitionRisk,
        riskEmoji,
        prediction,
        dataPoints: deviations.length,
        hasData: true,
        science: 'Scheffer et al. 2009 — Early Warning Signals for Critical Transitions (Nature)',
        pmid: '19727193' // Scheffer 2009
      };
    },

    /**
     * 2-Process Sleep Model — научная модель энергии
     * Borbély 1982: Energy = Process S (homeostatic) + Process C (circadian)
     * Process S: накопление "давления сна" во время бодрствования
     * Process C: циркадный ритм (синусоида 24ч)
     * @param {Object} options - { lsGet, profile }
     * @returns {Object} { processS, processC, combinedEnergy, alertnessProfile }
     */
    calculate2ProcessModel: function (options = {}) {
      const lsGet = options.lsGet || U.lsGet;
      const profile = options.profile || lsGet('heys_profile', {});
      const days = getDaysData(7, lsGet);
      const today = days[0] || {};

      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      const currentTime = currentHour + currentMinute / 60;

      // Параметры модели
      const sleepEnd = today.sleepEnd
        ? parseInt(today.sleepEnd.split(':')[0]) + parseInt(today.sleepEnd.split(':')[1] || 0) / 60
        : 7; // default wake time

      const sleepHours = today.sleepHours || 7;
      const sleepDebt = Math.max(0, (profile.sleepHours || 8) - sleepHours);

      const hoursAwake = currentTime >= sleepEnd
        ? currentTime - sleepEnd
        : 24 - sleepEnd + currentTime;

      // === Process S (Homeostatic Sleep Pressure) ===
      // Экспоненциальный рост давления сна во время бодрствования
      // S(t) = S0 × e^(t/τ_w) где τ_w ≈ 18.2ч
      const tau_w = 18.2; // time constant for wake
      const S0 = sleepDebt > 0 ? 0.3 + sleepDebt * 0.1 : 0.2; // baseline (выше если недосып)
      const processS = Math.min(1, S0 * Math.exp(hoursAwake / tau_w));

      // === Process C (Circadian) ===
      // Синусоида с периодом 24ч, пик ~15-16ч (alertness), минимум ~4ч
      // C(t) = 0.5 + 0.5 × cos(2π × (t - 16) / 24)
      const circadianPeak = 15; // час максимальной бодрости
      const processC = 0.5 + 0.5 * Math.cos(2 * Math.PI * (currentTime - circadianPeak) / 24);

      // === Combined Alertness ===
      // Alertness = C - S (циркадность минус давление сна)
      // Нормализуем к 0-100
      const rawAlertness = processC - processS;
      const alertness = Math.max(0, Math.min(100, (rawAlertness + 0.5) * 100));

      // === Профиль на 24 часа ===
      const alertnessProfile = [];
      for (let h = 0; h < 24; h++) {
        const hAwake = h >= sleepEnd ? h - sleepEnd : (h < sleepEnd - 8 ? 24 - sleepEnd + h : 0);
        const hProcessS = Math.min(1, S0 * Math.exp(hAwake / tau_w));
        const hProcessC = 0.5 + 0.5 * Math.cos(2 * Math.PI * (h - circadianPeak) / 24);
        const hAlertness = Math.max(0, Math.min(100, (hProcessC - hProcessS + 0.5) * 100));

        alertnessProfile.push({
          hour: h,
          alertness: Math.round(hAlertness),
          processS: Math.round(hProcessS * 100),
          processC: Math.round(hProcessC * 100),
          label: `${h}:00`,
          zone: hAlertness >= 70 ? 'peak' : hAlertness >= 50 ? 'good' : hAlertness >= 30 ? 'moderate' : 'low'
        });
      }

      // Находим окна
      const futureHours = alertnessProfile.filter(h => h.hour >= currentHour);
      const sortedFuture = [...futureHours].sort((a, b) => b.alertness - a.alertness);

      const peakWindow = sortedFuture[0] || alertnessProfile[15];
      const dipWindow = sortedFuture[sortedFuture.length - 1] || alertnessProfile[4];

      // Ultradian rhythm (90-min cycles) - упрощённая версия
      // Каждые 90 минут — мини-пик внимания
      const minutesSinceWake = hoursAwake * 60;
      const ultradianCycle = 90;
      const cyclePosition = (minutesSinceWake % ultradianCycle) / ultradianCycle;
      const ultradianPhase = cyclePosition < 0.5 ? 'rising' : 'falling';
      const nextUltradianPeak = Math.ceil(minutesSinceWake / ultradianCycle) * ultradianCycle - minutesSinceWake;

      // Рекомендации
      const recommendations = [];

      if (alertness < 50 && currentHour < 14) {
        recommendations.push('☕ Низкая бодрость — кофеин или короткий сон (20 мин)');
      }
      if (processS > 0.7) {
        recommendations.push('😴 Высокое давление сна — запланируй ранний отход ко сну');
      }
      if (peakWindow.hour > currentHour && peakWindow.hour < currentHour + 4) {
        recommendations.push(`🎯 Пик бодрости в ${peakWindow.hour}:00 — запланируй важные задачи`);
      }
      if (sleepDebt > 1) {
        recommendations.push('💤 Накопился недосып — сегодня ложись раньше');
      }

      return {
        processS: Math.round(processS * 100),
        processC: Math.round(processC * 100),
        alertness: Math.round(alertness),
        alertnessLevel: alertness >= 70 ? 'high' : alertness >= 50 ? 'moderate' : 'low',
        alertnessEmoji: alertness >= 70 ? '⚡' : alertness >= 50 ? '😊' : alertness < 30 ? '😴' : '😐',
        hoursAwake: Math.round(hoursAwake * 10) / 10,
        sleepDebt: Math.round(sleepDebt * 10) / 10,
        alertnessProfile,
        peakWindow,
        dipWindow,
        ultradian: {
          phase: ultradianPhase,
          nextPeakIn: Math.round(nextUltradianPeak),
          cycleLength: ultradianCycle
        },
        recommendations,
        hasData: true,
        model: 'Borbély 2-Process Model (1982)',
        pmid: '6128309' // Borbély 1982
      };
    },

    /**
     * Calculate Emotional Risk - полная логика риска срыва
     * Основана на Epel et al., 2001: стресс + голод = высокий риск переедания
     * @param {Object} day - dayData объект
     * @param {Object} profile - профиль пользователя
     * @param {Function} lsGet - функция для получения localStorage
     * @returns {Object} { level, stressLevel, factors, bingeRisk, recommendation, pmid, hasRisk }
     */
    calculateEmotionalRisk: function (day, profile, lsGet) {
      const getter = lsGet || U.lsGet || ((k, d) => {
        try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; }
      });

      const CFG_STRESS_HIGH_THRESHOLD = 6;
      const avgStress = day?.stressAvg || 0;
      const isHighStress = avgStress >= CFG_STRESS_HIGH_THRESHOLD;

      // Инициализация результата
      let emotionalRisk = {
        level: 'low', // low | medium | high | critical
        stressLevel: avgStress,
        factors: [],
        bingeRisk: 0, // 0-100%
        recommendation: null,
        pmid: '11070333', // Epel 2001
        hasRisk: false
      };

      // === ФАКТОР 1: Высокий стресс ===
      if (isHighStress) {
        emotionalRisk.factors.push('Высокий стресс');
      }

      // === ФАКТОР 2: Калорийный долг за последние 3 дня ===
      // Получаем данные за 3 дня для расчёта накопленного недобора
      const today = new Date();
      let totalDebt = 0;
      let hasDebt = false;

      for (let i = 0; i < 3; i++) {
        const checkDate = new Date(today);
        checkDate.setDate(checkDate.getDate() - i);
        const dateStr = checkDate.toISOString().split('T')[0];
        const dayData = getter(`heys_dayv2_${dateStr}`, {});

        // Расчёт дефицита за день
        const dayTdee = dayData.tdee || profile?.tdee || 2000;
        const dayKcal = (dayData.totKcal || 0);
        const dayDebt = Math.max(0, dayTdee - dayKcal);
        totalDebt += dayDebt;
      }

      const rawDebt = totalDebt;
      hasDebt = rawDebt > 400; // Порог значимого долга

      if (hasDebt && rawDebt > 400) {
        emotionalRisk.factors.push('Накопленный недобор');
      }

      // === ФАКТОР 3: Паттерн стрессового переедания ===
      // Проверяем историю переедания в стрессовые дни
      let stressEatingDetected = false;
      const last7days = [];
      for (let i = 0; i < 7; i++) {
        const checkDate = new Date(today);
        checkDate.setDate(checkDate.getDate() - i);
        const dateStr = checkDate.toISOString().split('T')[0];
        const dayData = getter(`heys_dayv2_${dateStr}`, {});
        if (dayData.stressAvg) {
          last7days.push({
            stress: dayData.stressAvg || 0,
            kcal: dayData.totKcal || 0,
            tdee: dayData.tdee || profile?.tdee || 2000
          });
        }
      }

      // Корреляция стресс-переедание
      if (last7days.length >= 5) {
        const stressValues = last7days.map(d => d.stress);
        const overeatingValues = last7days.map(d => Math.max(0, d.kcal - d.tdee));
        if (average && pearsonCorrelation) {
          const corr = pearsonCorrelation(stressValues, overeatingValues);
          if (corr > 0.5) {
            stressEatingDetected = true;
          }
        }
      }

      if (stressEatingDetected) {
        emotionalRisk.factors.push('Паттерн стрессового переедания');
      }

      // === ФАКТОР 4: Вечер/ночь (пик уязвимости) ===
      const hour = new Date().getHours();
      const isVulnerableTime = hour >= 19 || hour < 6; // 19:00-06:00

      if (isVulnerableTime) {
        emotionalRisk.factors.push('Вечер/ночь (пик уязвимости)');
      }

      // === ЗАЩИТНЫЙ ФАКТОР: Тренировка (снижает риск) ===
      const hasTrainingToday = (day?.trainings || []).length > 0;
      const trainingProtection = hasTrainingToday ? -15 : 0; // Тренировка снижает риск на 15%

      // === РАСЧЁТ РИСКА ===
      // Каждый фактор = 25%, cap = 100% (не 90%)
      emotionalRisk.bingeRisk = Math.min(100, emotionalRisk.factors.length * 25 + trainingProtection);
      emotionalRisk.bingeRisk = Math.max(0, emotionalRisk.bingeRisk); // Не может быть отрицательным

      // === ОПРЕДЕЛЕНИЕ УРОВНЯ И РЕКОМЕНДАЦИЙ ===
      if (emotionalRisk.bingeRisk >= 75) {
        emotionalRisk.level = 'critical';
        emotionalRisk.recommendation = '🚨 Высокий риск срыва! Съешь что-то прямо сейчас — это предотвратит переедание позже';
      } else if (emotionalRisk.bingeRisk >= 50) {
        emotionalRisk.level = 'high';
        emotionalRisk.recommendation = '⚠️ Будь внимательней — стресс + голод провоцируют переедание';
      } else if (emotionalRisk.bingeRisk >= 25) {
        emotionalRisk.level = 'medium';
        emotionalRisk.recommendation = 'Следи за собой — один из факторов риска присутствует';
      }

      emotionalRisk.hasRisk = emotionalRisk.bingeRisk >= 25;

      return emotionalRisk;
    }
  };

  // === MEMOIZATION LAYER (v1.0.0) ===
  // Оборачиваем дорогие analytic функции для 44% ускорения (P50 180ms → 100ms)
  const cache = HEYS.InsightsPI?.cache || {};
  if (cache.memoize) {
    // calculateCorrelationMatrix — корреляционная матрица (12 пар) - самый дорогой
    analyticsAPI.calculateCorrelationMatrix = cache.memoize(
      analyticsAPI.calculateCorrelationMatrix,
      'calculateCorrelationMatrix',
      { ttl: 60000, maxSize: 50 }
    );

    // detectMetabolicPatterns — анализ метаболических паттернов
    if (analyticsAPI.detectMetabolicPatterns) {
      analyticsAPI.detectMetabolicPatterns = cache.memoize(
        analyticsAPI.detectMetabolicPatterns,
        'detectMetabolicPatterns',
        { ttl: 60000, maxSize: 50 }
      );
    }

    // calculateGlycemicVariability — гликемическая вариативность (CV%, CONGA)
    if (analyticsAPI.calculateGlycemicVariability) {
      analyticsAPI.calculateGlycemicVariability = cache.memoize(
        analyticsAPI.calculateGlycemicVariability,
        'calculateGlycemicVariability',
        { ttl: 60000, maxSize: 50 }
      );
    }

    // calculateAllostaticLoad — аллостатическая нагрузка (7 биомаркеров)
    if (analyticsAPI.calculateAllostaticLoad) {
      analyticsAPI.calculateAllostaticLoad = cache.memoize(
        analyticsAPI.calculateAllostaticLoad,
        'calculateAllostaticLoad',
        { ttl: 60000, maxSize: 50 }
      );
    }

    devLog('[HEYS.analyticsAPI] ⚡ Memoization enabled for 4 expensive functions');
  }

  // === ЭКСПОРТ ===
  HEYS.InsightsPI.analyticsAPI = analyticsAPI;

  // Также экспортируем методы напрямую для удобства
  Object.assign(HEYS.InsightsPI, analyticsAPI);

  // Fallback для прямого доступа
  global.piAnalyticsAPI = analyticsAPI;

  devLog('[PI Analytics API] v3.0.0 loaded — 11 advanced analytics methods');

})(typeof window !== 'undefined' ? window : global);
