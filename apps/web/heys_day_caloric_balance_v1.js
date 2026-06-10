// heys_day_caloric_balance_v1.js — extracted caloric debt/balance computation

(function () {
  const root = (typeof window !== 'undefined' ? window : globalThis) || {};
  const HEYS = (root.HEYS = root.HEYS || {});

  HEYS.dayCaloricBalance = HEYS.dayCaloricBalance || {};

  HEYS.dayCaloricBalance.computeCaloricBalance = function computeCaloricBalance(ctx) {
    const {
      React,
      date,
      day,
      prof,
      optimum,
      eatenKcal,
      sparklineData,
      pIndex,
      fmtDate,
      lsGet,
      HEYS: heysCtx
    } = ctx || {};

    const H = heysCtx || HEYS;
    const HEYS_LOCAL = H;

    const caloricDebt = React.useMemo(() => {
      const HEYS = HEYS_LOCAL;
      // === КОНСТАНТЫ ===
      // 🔬 Научное обоснование:
      // - Leibel 1995 (PMID: 7632212): Метаболизм адаптируется на ~15% при дефиците
      // - Hall 2011 (PMID: 21872751): Постепенные изменения эффективнее резких
      // - Практика: компенсировать 70-85% долга за 1-3 дня оптимально
      const CFG = {
        MAX_DEBT: 1500,              // Максимум учитываемого долга
        // ГИБКОЕ ВОССТАНОВЛЕНИЕ: зависит от размера долга
        // < 300 ккал → 1 день (маленький долг)
        // 300-700 ккал → 2 дня (средний долг)
        // > 700 ккал → 3 дня (большой долг)
        RECOVERY_TARGET: 0.75,       // Компенсируем только 75% долга (метаболизм адаптировался)
        MAX_BOOST_PCT: 0.20,         // Максимум +20% к норме
        TRAINING_MULT: 1.3,          // Недобор в тренировочный день ×1.3
        REFEED_THRESHOLD: 1000,      // Порог для refeed
        REFEED_CONSECUTIVE: 5,       // Дней подряд в дефиците >20%
        REFEED_BOOST_PCT: 0.35,      // +35% в refeed day
        EXCESS_THRESHOLD: 100,       // Показывать перебор если > 100 ккал
        CARDIO_KCAL_PER_MIN: 6,      // ~6 ккал/мин лёгкого кардио
        STEPS_KCAL_PER_1000: 40,     // ~40 ккал на 1000 шагов
        KCAL_PER_GRAM: 7.7,          // Калории в грамме жира

        // 🆕 v3.1: TRAINING DAY ENHANCEMENT (#3)
        // Разные типы тренировок требуют разного восстановления
        TRAINING_TYPE_MULT: {
          strength: 1.4,  // Силовая: больше белка + углеводов нужно
          cardio: 1.25,   // Кардио: умеренное восстановление
          hobby: 1.1      // Хобби: минимальное влияние
        },
        TRAINING_INTENSITY_MULT: {
          light: 0.8,     // Лёгкая (< 30 мин зоны 1-2)
          moderate: 1.0,  // Умеренная (30-60 мин)
          high: 1.3,      // Интенсивная (> 60 мин или зоны 3-4)
          extreme: 1.5    // Экстремальная (> 90 мин высокой интенсивности)
        },

        // 🆕 v3.1: BMI-BASED PERSONALIZATION (#6)
        // 🔬 Kahn & Flier 2000, DeFronzo 1979
        BMI_RECOVERY_MULT: {
          underweight: { threshold: 18.5, mult: 1.3, boost: 1.2 },   // Больше ешь!
          normal: { threshold: 25, mult: 1.0, boost: 1.0 },          // Стандарт
          overweight: { threshold: 30, mult: 0.85, boost: 0.9 },     // Можно агрессивнее
          obese: { threshold: Infinity, mult: 0.7, boost: 0.8 }      // Ещё агрессивнее
        },

        // 🆕 v3.1: PROTEIN DEBT (#2)
        // 🔬 Mettler 2010 (PMID: 20095013): 1.8-2.7г/кг на дефиците
        PROTEIN_DEBT_WINDOW: 3,      // Дней для анализа белкового долга
        PROTEIN_TARGET_PCT: 0.25,    // 25% калорий из белка (норма)
        PROTEIN_CRITICAL_PCT: 0.18,  // <18% = критический недобор
        PROTEIN_RECOVERY_MULT: 1.2,  // Бонус к белковым рекомендациям

        // 🆕 v3.1: EMOTIONAL RISK (#5)
        // 🔬 Epel 2001: Стресс → кортизол → тяга к сладкому
        STRESS_HIGH_THRESHOLD: 6,    // Стресс >= 6 = высокий
        STRESS_DEBT_RISK_MULT: 1.5,  // Риск срыва при стресс + долг

        // 🆕 v3.1: CIRCADIAN CONTEXT (#4)
        // 🔬 Van Cauter 1997: Утренняя инсулиночувствительность выше
        CIRCADIAN_MORNING_MULT: 0.7, // Утренний недобор менее критичен
        CIRCADIAN_EVENING_MULT: 1.3  // Вечерний недобор более срочный
      };

      // === GOAL-AWARE THRESHOLDS ===
      // Пороги зависят от цели пользователя
      const getGoalThresholds = () => {
        // Number() для корректного сравнения строк из localStorage с числами
        const deficitPct = Number(day.deficitPct ?? prof?.deficitPctTarget ?? 0) || 0;
        if (deficitPct <= -10) {
          // Похудение — перебор критичнее
          return { debtThreshold: 80, excessThreshold: 150, mode: 'loss' };
        } else if (deficitPct >= 10) {
          // Набор — недобор критичнее
          return { debtThreshold: 150, excessThreshold: 200, mode: 'bulk' };
        }
        // Поддержание — симметрично
        return { debtThreshold: 100, excessThreshold: 100, mode: 'maintenance' };
      };
      const goalThresholds = getGoalThresholds();

      if (!sparklineData || sparklineData.length < 2 || !optimum || optimum <= 0) {
        return null;
      }

      try {
        // === ОПРЕДЕЛЯЕМ ПЕРИОД: последние 3 дня (научно обоснованный минимум) ===
        // Leibel 1995, Hall 2011: 3-5 дней достаточно для выявления тренда
        const DEBT_WINDOW = 3;
        const todayDate = new Date(date + 'T12:00:00');
        const todayStr = date;

        // Берём последние 3 дня (не включая сегодня)
        const windowStart = new Date(todayDate);
        windowStart.setDate(todayDate.getDate() - DEBT_WINDOW);
        const windowStartStr = fmtDate(windowStart);

        // Фильтруем дни: последние 3 дня до вчера (сегодня не считаем — ещё едим)
        // 🔧 FIX: Исключаем дни с < 1/3 от нормы — это значит данные не внесены полностью
        // 🆕 v1.1: Учитываем isFastingDay (данные корректны) и isIncomplete (исключаем)
        const minKcalThreshold = optimum / 3; // ~600-700 ккал для большинства людей
        const pastDays = sparklineData.filter((d) => {
          if (d.isToday) return false;
          if (d.isFuture) return false;
          if (d.kcal <= 0) return false;

          // 🆕 Если помечен как incomplete (незаполненные данные) — не учитываем
          if (d.isIncomplete) return false;

          // 🆕 Если помечен как fasting (реальное голодание) — учитываем как есть
          // даже если kcal < threshold
          if (d.isFastingDay) {
            // Но всё равно проверяем временные рамки
            if (d.date < windowStartStr) return false;
            if (d.date >= todayStr) return false;
            return true;
          }

          if (d.kcal < minKcalThreshold) return false; // 🆕 День без полных данных — не учитываем
          if (d.date < windowStartStr) return false; // Старше 3 дней не берём
          if (d.date >= todayStr) return false; // Сегодня и позже не берём
          return true;
        });

        if (pastDays.length === 0) return null;

        // === НАЗВАНИЯ ДНЕЙ НЕДЕЛИ ===
        const dayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

        // === СБОР ДАННЫХ ===
        let totalBalance = 0;
        let weightedBalance = 0;
        let consecutiveDeficit = 0;
        let maxConsecutiveDeficit = 0;
        let totalTrainingKcal = 0;
        const dayBreakdown = [];
        const totalDays = pastDays.length;

        // Для тренда: первая и вторая половина
        let firstHalfBalance = 0;
        let secondHalfBalance = 0;
        const midPoint = Math.floor(totalDays / 2);

        pastDays.forEach((d, idx) => {
          // 🔧 CRITICAL FIX: Используем БАЗОВУЮ норму (без долга) для расчёта нового долга!
          // d.target = savedDisplayOptimum (уже включает предыдущий долг) — НЕПРАВИЛЬНО для расчёта
          // d.baseTarget = пересчитанная норма TDEE * (1 + deficit%) — ПРАВИЛЬНО
          const baseTarget = d.baseTarget || d.target || optimum;
          let target = baseTarget;

          // 🔄 REFEED FIX: Если день был refeed, используем норму +35%
          // Refeed — часть стратегии, не "срыв". Перебор считаем от refeed-нормы, а не от дефицитной.
          if (d.isRefeedDay) {
            const REFEED_BOOST = 0.35;
            target = Math.round(target * (1 + REFEED_BOOST));
          }

          const rawDelta = d.kcal - target; // > 0 переел, < 0 недоел

          let delta = rawDelta;
          // УБРАН множитель тренировки — NDTE уже учитывает эффект тренировки в TDEE
          // Раньше было: delta *= 1.3 при тренировке, но это двойной учёт

          // Собираем калории от тренировок за неделю
          if (d.hasTraining && d.trainingKcal) {
            totalTrainingKcal += d.trainingKcal;
          }

          totalBalance += delta;

          // Весовой коэффициент: вчера важнее понедельника
          // Формула: 0.5 + (0.5 * (totalDays - daysAgo) / totalDays)
          const daysAgo = totalDays - idx;
          const weight = 0.5 + (0.5 * (totalDays - daysAgo) / totalDays);
          weightedBalance += delta * weight;

          // Тренд: первая vs вторая половина
          if (idx < midPoint) {
            firstHalfBalance += delta;
          } else {
            secondHalfBalance += delta;
          }

          // Считаем последовательные дни в дефиците >20%
          const ratio = d.kcal / target;
          if (ratio < 0.8) {
            consecutiveDeficit++;
            maxConsecutiveDeficit = Math.max(maxConsecutiveDeficit, consecutiveDeficit);
          } else {
            consecutiveDeficit = 0;
          }

          // День недели
          const dayDate = new Date(d.date + 'T12:00:00');
          const dayOfWeekIdx = dayDate.getDay();

          // Breakdown для UI
          dayBreakdown.push({
            date: d.date,
            dayNum: d.date.split('-')[2],
            dayName: dayNames[dayOfWeekIdx],
            eaten: Math.round(d.kcal),
            target: Math.round(target),
            baseTarget: Math.round(baseTarget),
            delta: Math.round(delta),
            hasTraining: d.hasTraining,
            ratio: ratio,
            isRefeedDay: d.isRefeedDay
          });
        });

        // === ДОЛГ (недобор) ===
        const rawDebt = Math.max(0, -totalBalance);
        const cappedDebt = Math.min(rawDebt, CFG.MAX_DEBT);
        const hasDebt = cappedDebt > goalThresholds.debtThreshold;

        // === ПЕРЕБОР ===
        const rawExcess = Math.max(0, totalBalance);
        // При переборе учитываем тренировки за неделю (компенсируют 50%)
        const netExcess = Math.max(0, rawExcess - totalTrainingKcal * 0.5);
        const hasExcess = netExcess > goalThresholds.excessThreshold;

        // === ТРЕНД ===
        let trend = { direction: 'stable', text: 'Стабильно', emoji: '➡️' };
        if (totalDays >= 4) {
          const trendDiff = secondHalfBalance - firstHalfBalance;
          if (trendDiff < -100) {
            trend = { direction: 'improving', text: 'Недобор уменьшается', emoji: '📈' };
          } else if (trendDiff > 100) {
            trend = { direction: 'worsening', text: 'Перебор растёт', emoji: '📉' };
          }
        }

        // === SEVERITY (степень серьёзности) ===
        let severity = 0; // 0 = незначительно, 1 = умеренно, 2 = значительно
        const absBalance = Math.abs(totalBalance);
        if (absBalance > 800) severity = 2;
        else if (absBalance > 400) severity = 1;

        // === REFEED (только рекомендация, НЕ автоматический boost) ===
        const hasHardTrainingToday = (day.trainings || []).some((t) => {
          if (!t || !t.z) return false;
          const totalMin = t.z.reduce((s, m) => s + (+m || 0), 0);
          return totalMin >= 45;
        });

        const needsRefeed =
          cappedDebt >= CFG.REFEED_THRESHOLD ||
          maxConsecutiveDeficit >= CFG.REFEED_CONSECUTIVE ||
          (cappedDebt > 500 && hasHardTrainingToday);

        // === ГИБКОЕ ВОССТАНОВЛЕНИЕ ===
        // 🔬 Научная логика:
        // 1. Компенсируем только 75% долга — организм адаптировался (Leibel 1995)
        // 2. Дни восстановления зависят от размера долга:
        //    - < 300 ккал → 1 день (быстро закрыть)
        //    - 300-700 ккал → 2 дня (умеренно)
        //    - > 700 ккал → 3 дня (постепенно)
        const getRecoveryDays = (debt) => {
          if (debt < 300) return 1;
          if (debt < 700) return 2;
          return 3;
        };

        let dailyBoost = 0;
        let refeedBoost = 0;
        let recoveryDays = 0;
        let effectiveDebt = 0; // Сколько реально компенсируем

        if (hasDebt) {
          // Компенсируем только 75% долга
          effectiveDebt = Math.round(cappedDebt * CFG.RECOVERY_TARGET);

          // Гибкое количество дней
          recoveryDays = getRecoveryDays(cappedDebt);

          // Расчёт boost
          const rawBoost = effectiveDebt / recoveryDays;
          const maxBoost = optimum * CFG.MAX_BOOST_PCT;
          dailyBoost = Math.round(Math.min(rawBoost, maxBoost));

          // Refeed boost (для рекомендации)
          if (needsRefeed) {
            refeedBoost = Math.round(optimum * CFG.REFEED_BOOST_PCT);
          }
        }

        // === МЯГКАЯ КОРРЕКЦИЯ ПРИ ПЕРЕБОРЕ ===
        // 🔬 Философия: НЕ наказываем за переедание (провоцирует срыв!)
        // Вместо этого:
        // 1. Главное — рекомендация активности (кардио, шаги)
        // 2. Мягкий акцент — небольшое снижение нормы (5-10%)
        // 3. Позитивный тон — "баланс", а не "штраф"
        //
        // Научное обоснование:
        // - Herman & Polivy, 1984 (PMID: 6727817): Жёсткие ограничения → срывы
        // - Tomiyama, 2018 (PMID: 29866473): Самокритика ухудшает результаты
        // - Практика: мягкая коррекция + активность эффективнее "наказания"

        const EXCESS_CFG = {
          SOFT_REDUCTION_PCT: 0.05,      // Мягкое снижение: 5% от нормы
          MODERATE_REDUCTION_PCT: 0.08,  // Умеренное: 8%
          MAX_REDUCTION_PCT: 0.10,       // Максимум: 10% (НЕ больше!)
          ACTIVITY_PRIORITY: 0.7,        // 70% компенсации через активность
          SOFT_THRESHOLD: 200,           // До 200 ккал — игнорируем
          MODERATE_THRESHOLD: 400,       // 200-400 — мягкая коррекция
          SIGNIFICANT_THRESHOLD: 600     // >400 — умеренная коррекция
        };

        let dailyReduction = 0; // Снижение нормы (мягкий акцент)
        let effectiveExcess = 0; // Чистый перебор после учёта активности
        let excessRecoveryDays = 0; // Дней на компенсацию
        let activityCompensation = 0; // Сколько компенсируем активностью

        if (hasExcess && netExcess > EXCESS_CFG.SOFT_THRESHOLD) {
          // Сколько компенсируем активностью (приоритет!)
          activityCompensation = Math.round(netExcess * EXCESS_CFG.ACTIVITY_PRIORITY);

          // Остаток — через мягкое снижение нормы
          const remainingExcess = netExcess - activityCompensation;
          effectiveExcess = Math.round(remainingExcess);

          // Определяем степень коррекции
          let reductionPct;
          if (netExcess < EXCESS_CFG.MODERATE_THRESHOLD) {
            // Маленький перебор — минимальная коррекция
            reductionPct = EXCESS_CFG.SOFT_REDUCTION_PCT;
            excessRecoveryDays = 1;
          } else if (netExcess < EXCESS_CFG.SIGNIFICANT_THRESHOLD) {
            // Средний перебор — умеренная коррекция
            reductionPct = EXCESS_CFG.MODERATE_REDUCTION_PCT;
            excessRecoveryDays = 2;
          } else {
            // Большой перебор — максимальная (но мягкая!) коррекция
            reductionPct = EXCESS_CFG.MAX_REDUCTION_PCT;
            excessRecoveryDays = 2; // Не больше 2 дней — не растягиваем "наказание"
          }

          // Расчёт снижения: распределяем остаток на дни
          const rawReduction = Math.round(effectiveExcess / excessRecoveryDays);
          const maxReduction = Math.round(optimum * reductionPct);
          dailyReduction = Math.min(rawReduction, maxReduction);

          // Если снижение слишком маленькое — не показываем (не создаём шум)
          if (dailyReduction < 30) {
            dailyReduction = 0;
            excessRecoveryDays = 0;
          }
        }

        // === ПРОГНОЗ ВОССТАНОВЛЕНИЯ ===
        const daysToRecover = dailyBoost > 0 ? Math.ceil(effectiveDebt / dailyBoost) : 0;
        const recoveryDate = new Date(todayDate);
        recoveryDate.setDate(recoveryDate.getDate() + daysToRecover);
        const recoveryDayName = dayNames[recoveryDate.getDay()];

        // === ПРОГРЕСС ВОССТАНОВЛЕНИЯ (если был долг вчера) ===
        const yesterdayDebt = dayBreakdown.length > 0 ? Math.abs(dayBreakdown[dayBreakdown.length - 1].delta) : 0;
        const isRecovering =
          yesterdayDebt > 0 &&
          dayBreakdown.length > 1 &&
          dayBreakdown[dayBreakdown.length - 1].delta > dayBreakdown[dayBreakdown.length - 2].delta;

        // === РЕКОМЕНДАЦИЯ КАРДИО (при переборе) ===
        let cardioRecommendation = null;
        if (hasExcess && !hasHardTrainingToday) {
          // Учитываем сегодняшние шаги
          const todaySteps = day.steps || 0;
          const stepsKcal = Math.round((todaySteps / 1000) * CFG.STEPS_KCAL_PER_1000);
          const remainingExcess = Math.max(0, netExcess - stepsKcal);

          if (remainingExcess > 50) {
            const rawMinutes = Math.round(remainingExcess / CFG.CARDIO_KCAL_PER_MIN);

            // Если > 60 мин — делим на 2 дня
            const splitDays = rawMinutes > 60 ? 2 : 1;
            const minutesPerDay = Math.round(rawMinutes / splitDays);

            // Тип активности
            let activityType, activityIcon;
            if (minutesPerDay <= 20) {
              activityType = 'прогулка';
              activityIcon = '🚶';
            } else if (minutesPerDay <= 45) {
              activityType = 'лёгкое кардио';
              activityIcon = '🏃';
            } else {
              activityType = 'активное кардио';
              activityIcon = '🏃‍♂️';
            }

            cardioRecommendation = {
              excessKcal: Math.round(netExcess),
              stepsCompensation: stepsKcal,
              remainingExcess,
              minutes: minutesPerDay,
              splitDays,
              activityType,
              activityIcon,
              text: splitDays > 1
                ? `${splitDays} дня по ${minutesPerDay} мин ${activityType}`
                : `${minutesPerDay} мин ${activityType}`
            };
          } else if (stepsKcal > 0) {
            // Шаги полностью компенсировали перебор
            cardioRecommendation = {
              excessKcal: Math.round(netExcess),
              stepsCompensation: stepsKcal,
              remainingExcess: 0,
              minutes: 0,
              compensatedBySteps: true,
              text: 'Отличная активность! Шаги компенсировали перебор'
            };
          }
        }

        // === СВЯЗЬ С ВЕСОМ ===
        const weightImpact = {
          grams: Math.round(Math.abs(totalBalance) / CFG.KCAL_PER_GRAM),
          isGain: totalBalance > 0,
          text: totalBalance > 50
            ? `~+${Math.round(totalBalance / CFG.KCAL_PER_GRAM)}г к весу`
            : totalBalance < -50
              ? `~−${Math.round(Math.abs(totalBalance) / CFG.KCAL_PER_GRAM)}г веса`
              : 'Вес стабилен'
        };

        // ═══════════════════════════════════════════════════════════════════
        // 🔬 НАУЧНАЯ АНАЛИТИКА v4.3 — Deep Metabolic Insights
        // ═══════════════════════════════════════════════════════════════════

        // --- 1. TEF Analysis (Thermic Effect of Food) ---
        // Westerterp, 2004: TEF составляет 10-15% от калорий
        const todayMeals = day.meals || [];
        let todayProtein = 0, todayCarbs = 0, todayFat = 0;
        todayMeals.forEach((meal) => {
          (meal.items || []).forEach((item) => {
            const g = item.grams || 0;
            const prod = pIndex?.byId?.get?.(String(item.product_id || item.id)?.toLowerCase());
            if (prod && g > 0) {
              todayProtein += (prod.protein100 || 0) * g / 100;
              todayCarbs += ((prod.simple100 || 0) + (prod.complex100 || 0)) * g / 100;
              todayFat += ((prod.badFat100 || 0) + (prod.goodFat100 || 0) + (prod.trans100 || 0)) * g / 100;
            }
          });
        });

        // 🔬 TEF v1.0.0: используем единый модуль HEYS.TEF с fallback
        let tefResult;
        if (HEYS.TEF?.calculate) {
          tefResult = HEYS.TEF.calculate(todayProtein, todayCarbs, todayFat);
        } else {
          // Fallback: inline расчёт если модуль не загружен (Westerterp 2004, Tappy 1996)
          const proteinTEF = 0; // NET Atwater: TEF 25% built into 3 kcal/g coefficient
          const carbsTEF = Math.round(todayCarbs * 4 * 0.075);
          const fatTEF = Math.round(todayFat * 9 * 0.015);
          tefResult = {
            total: proteinTEF + carbsTEF + fatTEF,
            breakdown: { protein: proteinTEF, carbs: carbsTEF, fat: fatTEF }
          };
        }
        const totalTEF = tefResult.total;
        const tefPct = eatenKcal > 0 ? Math.round((totalTEF / eatenKcal) * 100) : 0;

        const tefAnalysis = {
          total: totalTEF,
          percent: tefPct,
          breakdown: tefResult.breakdown,
          quality: tefPct >= 12 ? 'excellent' : tefPct >= 10 ? 'good' : tefPct >= 8 ? 'normal' : 'low',
          insight: tefPct >= 12
            ? `🔥 Отличный TEF ${tefPct}%! Много белка = больше калорий на переваривание`
            : tefPct < 8
              ? `⚠️ Низкий TEF ${tefPct}%. Добавь белка для ускорения метаболизма`
              : `✓ TEF ${tefPct}% — стандартный термический эффект`,
          pmid: '15507147' // Westerterp, 2004
        };

        // --- 2. EPOC Analysis (Excess Post-exercise Oxygen Consumption) ---
        // LaForgia et al., 2006: EPOC может добавить 6-15% к затратам тренировки
        const todayTrainings = day.trainings || [];
        let epocKcal = 0;
        let epocInsight = null;

        // Получаем пульсовые зоны из localStorage (формат: [{MET: 2.5}, {MET: 6}, ...])
        const hrZonesRaw = lsGet('heys_hr_zones', []);
        const defaultMets = [2.5, 6, 8, 10]; // Дефолтные MET для 4 зон

        if (todayTrainings.length > 0) {
          todayTrainings.forEach((tr) => {
            const zones = tr.z || [0, 0, 0, 0];
            const totalMin = zones.reduce((s, v) => s + v, 0);
            const highIntensityMin = (zones[2] || 0) + (zones[3] || 0);
            const intensity = totalMin > 0 ? highIntensityMin / totalMin : 0;

            // EPOC зависит от интенсивности: 6% (низкая) до 15% (высокая)
            const epocRate = 0.06 + intensity * 0.09;
            const trainingKcal = zones.reduce((sum, mins, idx) => {
              const met = +hrZonesRaw[idx]?.MET || defaultMets[idx] || (idx + 1) * 2;
              return sum + (mins * met * (prof?.weight || 70) / 60);
            }, 0);
            epocKcal += trainingKcal * epocRate;
          });

          epocKcal = Math.round(epocKcal);
          epocInsight = epocKcal > 50
            ? `🔥 +${epocKcal} ккал EPOC — метаболизм повышен после тренировки`
            : epocKcal > 20
              ? `⚡ +${epocKcal} ккал EPOC от тренировки`
              : null;
        }

        const epocAnalysis = {
          kcal: epocKcal,
          insight: epocInsight,
          hasTraining: todayTrainings.length > 0,
          pmid: '16825252' // LaForgia, 2006
        };

        // --- 3. Adaptive Thermogenesis ---
        // Rosenbaum & Leibel, 2010: При хроническом дефиците метаболизм падает на 10-15%
        const chronicDeficit = pastDays.filter((d) => d.ratio < 0.85).length;
        const adaptiveReduction = chronicDeficit >= 5 ? 0.12 : chronicDeficit >= 3 ? 0.08 : chronicDeficit >= 2 ? 0.04 : 0;

        const adaptiveThermogenesis = {
          chronicDeficitDays: chronicDeficit,
          metabolicReduction: adaptiveReduction,
          reducedKcal: Math.round(optimum * adaptiveReduction),
          isAdapted: adaptiveReduction > 0,
          insight: adaptiveReduction >= 0.10
            ? `⚠️ Метаболизм снижен на ~${Math.round(adaptiveReduction * 100)}% из-за хронического дефицита. Рекомендуется refeed`
            : adaptiveReduction >= 0.05
              ? `📉 Лёгкая адаптация метаболизма (−${Math.round(adaptiveReduction * 100)}%). Избегай длительного дефицита`
              : null,
          pmid: '20107198' // Rosenbaum & Leibel, 2010
        };

        // --- 4. Hormonal Balance (Leptin/Ghrelin) ---
        // Spiegel et al., 2004: Недосып повышает грелин на 28%, снижает лептин на 18%
        const sleepHours = day.sleepHours || 0;
        const sleepDebt = Math.max(0, (prof?.sleepHours || 8) - sleepHours);

        let ghrelinChange = 0, leptinChange = 0;
        if (sleepDebt >= 2) {
          ghrelinChange = Math.min(28, sleepDebt * 10); // До +28%
          leptinChange = Math.min(18, sleepDebt * 6); // До -18%
        }

        const hormonalBalance = {
          sleepDebt,
          ghrelinIncrease: ghrelinChange,
          leptinDecrease: leptinChange,
          hungerRisk: ghrelinChange > 15 ? 'high' : ghrelinChange > 5 ? 'moderate' : 'low',
          insight: ghrelinChange > 15
            ? `😴 Недосып ${sleepDebt.toFixed(1)}ч → грелин +${ghrelinChange}%. Повышенный голод сегодня!`
            : ghrelinChange > 5
              ? `💤 Лёгкий недосып влияет на аппетит (+${ghrelinChange}% грелин)`
              : null,
          pmid: '15602591' // Spiegel, 2004
        };

        // --- 5. Insulin Timing Analysis ---
        // Jakubowicz et al., 2013: Большой завтрак лучше для похудения
        const mealsByTime = [...todayMeals].sort((a, b) => (a.time || '').localeCompare(b.time || ''));
        let breakfastKcal = 0, dinnerKcal = 0;

        mealsByTime.forEach((meal) => {
          const hour = parseInt((meal.time || '12:00').split(':')[0], 10);
          const mealKcal = (meal.items || []).reduce((sum, item) => {
            const g = item.grams || 0;
            const prod = pIndex?.byId?.get?.(String(item.product_id || item.id)?.toLowerCase());
            return sum + (prod?.kcal100 || 0) * g / 100;
          }, 0);

          if (hour < 10) breakfastKcal += mealKcal;
          if (hour >= 19) dinnerKcal += mealKcal;
        });

        const breakfastRatio = eatenKcal > 0 ? breakfastKcal / eatenKcal : 0;
        const dinnerRatio = eatenKcal > 0 ? dinnerKcal / eatenKcal : 0;

        const insulinTimingAnalysis = {
          breakfastKcal: Math.round(breakfastKcal),
          dinnerKcal: Math.round(dinnerKcal),
          breakfastRatio,
          dinnerRatio,
          isOptimal: breakfastRatio >= 0.25 && dinnerRatio <= 0.30,
          insight: breakfastRatio < 0.15 && eatenKcal > 500
            ? `🌅 Мало калорий утром (${Math.round(breakfastRatio * 100)}%). Большой завтрак ускоряет метаболизм`
            : dinnerRatio > 0.40
              ? `🌙 Много калорий вечером (${Math.round(dinnerRatio * 100)}%). Перенеси часть на утро`
              : breakfastRatio >= 0.25
                ? `✅ Отличное распределение! Завтрак ${Math.round(breakfastRatio * 100)}% калорий`
                : null,
          pmid: '23512957' // Jakubowicz, 2013
        };

        // --- 6. Cortisol & Stress Analysis ---
        // Epel et al., 2001: Стресс увеличивает тягу к сладкому и жирному
        const avgStress = day.stressAvg || 0;
        const highStressDays = pastDays.filter((d) => (d.stressAvg || 0) >= 6).length;

        // Считаем простые углеводы за сегодня
        let todaySimple = 0;
        todayMeals.forEach((meal) => {
          (meal.items || []).forEach((item) => {
            const g = item.grams || 0;
            const prod = pIndex?.byId?.get?.(String(item.product_id || item.id)?.toLowerCase());
            if (prod && g > 0) {
              todaySimple += (prod.simple100 || 0) * g / 100;
            }
          });
        });

        const stressEatingPattern = avgStress >= 6 && todaySimple > 50;

        const cortisolAnalysis = {
          todayStress: avgStress,
          highStressDays,
          simpleCarbs: Math.round(todaySimple),
          stressEatingDetected: stressEatingPattern,
          insight: stressEatingPattern
            ? `😰 Стресс ${avgStress}/10 + много сладкого (${Math.round(todaySimple)}г). Кортизол провоцирует тягу к быстрым углеводам`
            : avgStress >= 7
              ? `⚠️ Высокий стресс (${avgStress}/10) может усилить аппетит. Будь внимательней`
              : highStressDays >= 3
                ? `📊 ${highStressDays} стрессовых дней за неделю. Это влияет на пищевое поведение`
                : null,
          pmid: '11070333' // Epel, 2001
        };

        // --- 7. Circadian Rhythm Analysis ---
        // Garaulet et al., 2013: Поздний ужин ассоциирован с худшим похудением
        const lastMealTime = mealsByTime.length > 0 ? mealsByTime[mealsByTime.length - 1]?.time : null;
        const lastMealHour = lastMealTime ? parseInt(lastMealTime.split(':')[0], 10) : 0;
        const sleepStart = day.sleepStart || '23:00';
        const sleepStartHour = parseInt(sleepStart.split(':')[0], 10);
        const hoursBeforeSleep = lastMealHour > 0 ? sleepStartHour - lastMealHour : 0;

        const circadianAnalysis = {
          lastMealTime,
          lastMealHour,
          hoursBeforeSleep,
          isLateEater: lastMealHour >= 21,
          insight: hoursBeforeSleep < 2 && hoursBeforeSleep >= 0
            ? `🌙 Еда за ${hoursBeforeSleep}ч до сна. Рекомендуется минимум 3 часа`
            : lastMealHour >= 22
              ? `⏰ Поздний ужин (${lastMealTime}). Это замедляет метаболизм ночью`
              : lastMealHour > 0 && lastMealHour <= 19
                ? `✅ Последний приём в ${lastMealTime} — отлично для метаболизма!`
                : null,
          pmid: '23357955' // Garaulet, 2013
        };

        // --- 8. Meal Frequency Analysis ---
        // Leidy et al., 2011: 3-4 приёма оптимально для контроля аппетита
        const mealCount = todayMeals.length;
        const avgMealKcal = mealCount > 0 ? eatenKcal / mealCount : 0;

        const mealFrequencyAnalysis = {
          count: mealCount,
          avgKcal: Math.round(avgMealKcal),
          isOptimal: mealCount >= 3 && mealCount <= 5,
          insight: mealCount <= 2 && eatenKcal > 1000
            ? `🍽️ Только ${mealCount} приёма пищи. 3-4 приёма лучше для сытости и метаболизма`
            : mealCount >= 6
              ? `🔄 ${mealCount} приёмов — много перекусов. Это может стимулировать аппетит`
              : avgMealKcal > 600 && mealCount >= 3
                ? `⚠️ Большие порции (${Math.round(avgMealKcal)} ккал/приём). Раздели на меньшие`
                : null,
          pmid: '21123467' // Leidy, 2011
        };

        // --- 9. Metabolic Window Analysis ---
        // Ivy & Kuo, 1998: 30-60 мин после тренировки — окно для восстановления
        let postWorkoutMealFound = false;
        let postWorkoutProtein = 0;

        todayTrainings.forEach((tr) => {
          const trainingHour = parseInt((tr.time || '12:00').split(':')[0], 10);
          const trainingMin = parseInt((tr.time || '12:00').split(':')[1], 10) || 0;

          todayMeals.forEach((meal) => {
            const mealHour = parseInt((meal.time || '12:00').split(':')[0], 10);
            const mealMin = parseInt((meal.time || '12:00').split(':')[1], 10) || 0;
            const diffMin = (mealHour * 60 + mealMin) - (trainingHour * 60 + trainingMin);

            if (diffMin > 0 && diffMin <= 90) {
              postWorkoutMealFound = true;
              (meal.items || []).forEach((item) => {
                const g = item.grams || 0;
                const prod = pIndex?.byId?.get?.(String(item.product_id || item.id)?.toLowerCase());
                if (prod && g > 0) {
                  postWorkoutProtein += (prod.protein100 || 0) * g / 100;
                }
              });
            }
          });
        });

        const metabolicWindowAnalysis = {
          hasTraining: todayTrainings.length > 0,
          postWorkoutMealFound,
          postWorkoutProtein: Math.round(postWorkoutProtein),
          isOptimal: postWorkoutMealFound && postWorkoutProtein >= 20,
          insight: todayTrainings.length > 0 && !postWorkoutMealFound
            ? `💪 Тренировка была, но нет приёма пищи в течение 90 мин. Упущено метаболическое окно!`
            : postWorkoutMealFound && postWorkoutProtein < 20
              ? `🥛 После тренировки только ${Math.round(postWorkoutProtein)}г белка. Нужно минимум 20г`
              : postWorkoutMealFound && postWorkoutProtein >= 20
                ? `✅ Отлично! ${Math.round(postWorkoutProtein)}г белка после тренировки`
                : null,
          pmid: '9694422' // Ivy & Kuo, 1998
        };

        // --- 10. Weight Prediction (Hall Model) ---
        // Hall et al., 2011: Модель предсказания веса на основе баланса
        const currentWeight = prof?.weight || 70;
        const weeklyBalanceKcal = (totalBalance * 7) / Math.max(pastDays.length, 1);
        const predictedWeightChange = weeklyBalanceKcal / 7700; // кг за неделю
        const monthlyPrediction = predictedWeightChange * 4;

        const weightPrediction = {
          weeklyChange: Math.round(predictedWeightChange * 1000) / 1000,
          monthlyChange: Math.round(monthlyPrediction * 10) / 10,
          predictedWeight: Math.round((currentWeight + monthlyPrediction) * 10) / 10,
          insight: Math.abs(monthlyPrediction) >= 0.5
            ? predictedWeightChange > 0
              ? `📈 При текущем темпе: +${monthlyPrediction.toFixed(1)}кг за месяц`
              : `📉 При текущем темпе: ${monthlyPrediction.toFixed(1)}кг за месяц`
            : `⚖️ Вес стабилен (изменение <0.5кг/мес)`,
          pmid: '21872751' // Hall, 2011
        };

        // --- 11. Fat Quality Analysis (Omega Balance) ---
        // Simopoulos, 2008: Оптимальное соотношение Omega-6:Omega-3 = 4:1
        let totalGoodFat = 0, totalBadFat = 0, totalTransFat = 0;
        todayMeals.forEach((meal) => {
          (meal.items || []).forEach((item) => {
            const g = item.grams || 0;
            const prod = pIndex?.byId?.get?.(String(item.product_id || item.id)?.toLowerCase());
            if (prod && g > 0) {
              totalGoodFat += (prod.goodFat100 || 0) * g / 100;
              totalBadFat += (prod.badFat100 || 0) * g / 100;
              totalTransFat += (prod.trans100 || 0) * g / 100;
            }
          });
        });

        const totalFatConsumed = totalGoodFat + totalBadFat + totalTransFat;
        const goodFatRatio = totalFatConsumed > 0 ? totalGoodFat / totalFatConsumed : 0;

        const fatQualityAnalysis = {
          goodFat: Math.round(totalGoodFat),
          badFat: Math.round(totalBadFat),
          transFat: Math.round(totalTransFat * 10) / 10,
          goodFatRatio,
          quality: goodFatRatio >= 0.6 ? 'excellent' : goodFatRatio >= 0.4 ? 'good' : goodFatRatio >= 0.25 ? 'moderate' : 'poor',
          insight: totalTransFat > 1
            ? `🚫 Транс-жиры ${totalTransFat.toFixed(1)}г! Это очень вредно для сердца`
            : goodFatRatio < 0.25 && totalFatConsumed > 20
              ? `⚠️ Мало полезных жиров (${Math.round(goodFatRatio * 100)}%). Добавь рыбу, орехи, авокадо`
              : goodFatRatio >= 0.6
                ? `✅ Отличный баланс жиров! ${Math.round(goodFatRatio * 100)}% полезных`
                : null,
          pmid: '18408140' // Simopoulos, 2008
        };

        // --- 12. Insulin Wave Integration ---
        // Связь с модулем инсулиновой волны
        let insulinWaveInsight = null;
        if (typeof HEYS !== 'undefined' && HEYS.InsulinWave) {
          try {
            const waveData = HEYS.InsulinWave.getLastWaveData?.() || {};
            if (waveData.status === 'active' && waveData.remaining > 0) {
              insulinWaveInsight = {
                status: 'active',
                remaining: waveData.remaining,
                text: `🌊 Инсулиновая волна активна ещё ${waveData.remaining} мин. Жиросжигание заблокировано`,
                recommendation: 'Дождись окончания волны перед следующим приёмом пищи'
              };
            } else if (waveData.status === 'lipolysis') {
              insulinWaveInsight = {
                status: 'lipolysis',
                text: '🔥 Липолиз активен! Жир сжигается',
                recommendation: 'Отличное время для лёгкой активности'
              };
            }
          } catch (e) { /* ignore */ }
        }

        // --- 13. Sleep-Calorie Correlation ---
        // Связь недосыпа и переедания за прошлые дни
        const sleepCalorieCorrelation = pastDays.reduce(
          (acc, d) => {
            const sleep = d.sleepHours || 0;
            const ratio = d.ratio || 0;
            if (sleep > 0 && sleep < 6 && ratio > 1.1) {
              acc.badSleepOvereatDays++;
            }
            if (sleep >= 7 && ratio >= 0.85 && ratio <= 1.1) {
              acc.goodSleepBalancedDays++;
            }
            return acc;
          },
          { badSleepOvereatDays: 0, goodSleepBalancedDays: 0 }
        );

        const sleepInsight = sleepCalorieCorrelation.badSleepOvereatDays >= 2
          ? {
            type: 'correlation',
            text: `😴 ${sleepCalorieCorrelation.badSleepOvereatDays} дня: недосып → переедание. Сон влияет на аппетит!`,
            pmid: '15602591'
          }
          : sleepCalorieCorrelation.goodSleepBalancedDays >= 3
            ? {
              type: 'positive',
              text: `✅ Хороший сон = контроль аппетита (${sleepCalorieCorrelation.goodSleepBalancedDays} сбалансированных дня)`,
              pmid: '15602591'
            }
            : null;

        // --- 14. Hydration Impact ---
        // Dennis et al., 2010: Вода перед едой снижает потребление на 75-90 ккал
        const waterMl = day.waterMl || 0;
        const waterGoal = typeof HEYS !== 'undefined' && HEYS.utils?.getWaterGoal
          ? HEYS.utils.getWaterGoal(prof)
          : 2000;
        const waterRatio = waterGoal > 0 ? waterMl / waterGoal : 0;

        const waterInsight = waterRatio < 0.5 && eatenKcal > optimum
          ? {
            type: 'warning',
            text: `💧 Мало воды (${Math.round(waterRatio * 100)}%) + перебор калорий. Вода помогает контролировать аппетит`,
            pmid: '19661958'
          }
          : waterRatio >= 1.0
            ? {
              type: 'positive',
              text: '💧 Отличная гидратация! Это помогает метаболизму и сытости',
              pmid: '19661958'
            }
            : null;

        // --- 15. Last Week Comparison ---
        // Сравнение с прошлой неделей
        let lastWeekBalance = 0;
        let lastWeekDays = 0;
        // todayDate уже объявлен выше (строка ~8590)

        for (let i = 7; i < 14; i++) {
          const checkDate = new Date(todayDate);
          checkDate.setDate(todayDate.getDate() - i);
          const checkDateStr = fmtDate(checkDate);
          const dayData = sparklineData?.activeDays?.get?.(checkDateStr);
          if (dayData && dayData.kcal && dayData.optimum) {
            lastWeekBalance += dayData.kcal - dayData.optimum;
            lastWeekDays++;
          }
        }

        const lastWeekComparison = lastWeekDays >= 3
          ? {
            lastWeekBalance: Math.round(lastWeekBalance),
            thisWeekBalance: Math.round(totalBalance),
            improvement: totalBalance < lastWeekBalance,
            diff: Math.round(totalBalance - lastWeekBalance),
            insight: totalBalance < lastWeekBalance - 200
              ? `📈 Эта неделя лучше прошлой на ${Math.abs(Math.round(totalBalance - lastWeekBalance))} ккал!`
              : totalBalance > lastWeekBalance + 200
                ? `📉 Эта неделя хуже прошлой на ${Math.round(totalBalance - lastWeekBalance)} ккал`
                : '↔️ Баланс на уровне прошлой недели'
          }
          : null;

        // --- 16. Smart Timing (не показывать лишнее утром) ---
        const currentHour = new Date().getHours();
        const showExcessWarning = currentHour >= 14 || (hasExcess && netExcess > 300);
        const showDebtWarning = currentHour >= 12 || (hasDebt && rawDebt > 400);

        const smartTiming = {
          currentHour,
          showExcessWarning,
          showDebtWarning,
          reason: currentHour < 12
            ? 'Утро — ещё рано делать выводы о балансе дня'
            : 'День в разгаре — данные актуальны'
        };

        // --- 17. Cycle Awareness (если доступен модуль цикла) ---
        let cycleInsight = null;
        if (typeof HEYS !== 'undefined' && HEYS.Cycle && day.cycleDay) {
          const phase = HEYS.Cycle.getCyclePhase?.(day.cycleDay);
          if (phase) {
            const kcalMult = HEYS.Cycle.getKcalMultiplier?.(day.cycleDay) || 1;
            if (kcalMult > 1.05) {
              cycleInsight = {
                phase: phase.name,
                multiplier: kcalMult,
                text: `🌸 ${phase.name} фаза цикла: норма калорий увеличена на ${Math.round((kcalMult - 1) * 100)}%`,
                recommendation: 'Лёгкий перебор в эту фазу — норма'
              };
            }
          }
        }

        // ═══════════════════════════════════════════════════════════════════
        // 🔬 НАУЧНАЯ АНАЛИТИКА v5.0 — Smart Insights System
        // ═══════════════════════════════════════════════════════════════════

        // --- Определяем контекст времени суток ---
        const insightHour = currentHour;
        const isMorning = insightHour >= 6 && insightHour < 12;
        const isEvening = insightHour >= 18 && insightHour < 24;
        const isNight = insightHour >= 0 && insightHour < 6;

        // --- Категории инсайтов с приоритетами ---
        // priority: 1 = критический (всегда показывать), 2 = важный, 3 = информативный, 4 = норма (фильтруется)
        // severity: 'critical' | 'warning' | 'positive' | 'info'
        // group: 'sleep' | 'metabolism' | 'timing' | 'nutrition' | 'activity' | 'hormones' | 'pattern'
        // action: конкретное действие

        const rawInsights = [];

        // --- 1. Адаптивный термогенез (критический!) ---
        if (adaptiveThermogenesis.isAdapted) {
          rawInsights.push({
            type: 'adaptive',
            group: 'metabolism',
            priority: 1,
            severity: adaptiveThermogenesis.metabolicReduction >= 0.10 ? 'critical' : 'warning',
            emoji: '⚠️',
            text: adaptiveThermogenesis.insight,
            action: 'Запланируй refeed день — это восстановит метаболизм',
            pmid: adaptiveThermogenesis.pmid,
            timeRelevance: 1 // Всегда релевантно
          });
        }

        // --- 2. Гормональный баланс (сон/грелин) ---
        if (hormonalBalance.ghrelinIncrease > 5) {
          const morningBoost = isMorning ? 1.5 : 1; // Утром важнее
          rawInsights.push({
            type: 'hormonal',
            group: 'sleep',
            priority: hormonalBalance.ghrelinIncrease > 15 ? 1 : 2,
            severity: hormonalBalance.ghrelinIncrease > 15 ? 'critical' : 'warning',
            emoji: '😴',
            text: hormonalBalance.insight,
            action: hormonalBalance.ghrelinIncrease > 15
              ? 'Ешь белок и клетчатку — они подавляют грелин'
              : 'Добавь 20 мин дневного сна если возможно',
            pmid: hormonalBalance.pmid,
            timeRelevance: morningBoost
          });
        }

        // --- 3. TEF анализ (только если отличается от нормы) ---
        if (tefAnalysis.quality === 'excellent' || tefAnalysis.quality === 'low') {
          rawInsights.push({
            type: 'tef',
            group: 'metabolism',
            priority: tefAnalysis.quality === 'low' ? 2 : 3,
            severity: tefAnalysis.quality === 'excellent' ? 'positive' : 'warning',
            emoji: tefAnalysis.quality === 'excellent' ? '🔥' : '📉',
            text: tefAnalysis.insight,
            action: tefAnalysis.quality === 'low'
              ? 'Добавь белок — он сжигает до 25% своих калорий на переваривание'
              : null,
            pmid: tefAnalysis.pmid,
            timeRelevance: 1
          });
        }

        // --- 4. EPOC (только если есть тренировка) ---
        if (epocAnalysis.hasTraining && epocAnalysis.kcal > 20) {
          rawInsights.push({
            type: 'epoc',
            group: 'activity',
            priority: 3,
            severity: 'positive',
            emoji: '🔥',
            text: epocAnalysis.insight,
            action: null, // Это позитивный факт
            pmid: epocAnalysis.pmid,
            timeRelevance: 1
          });
        }

        // --- 5. Тайминг еды ---
        if (insulinTimingAnalysis.insight) {
          const isActionable = insulinTimingAnalysis.breakfastRatio < 0.15 || insulinTimingAnalysis.dinnerRatio > 0.40;
          if (isActionable || insulinTimingAnalysis.isOptimal) {
            rawInsights.push({
              type: 'timing',
              group: 'timing',
              priority: isActionable ? 2 : 4,
              severity: insulinTimingAnalysis.isOptimal ? 'positive' : 'warning',
              emoji: insulinTimingAnalysis.isOptimal ? '✅' : insulinTimingAnalysis.breakfastRatio < 0.15 ? '🌅' : '🌙',
              text: insulinTimingAnalysis.insight,
              action: insulinTimingAnalysis.breakfastRatio < 0.15
                ? 'Завтра начни с белкового завтрака 300+ ккал'
                : insulinTimingAnalysis.dinnerRatio > 0.40
                  ? 'Перенеси 20% ужина на обед'
                  : null,
              pmid: insulinTimingAnalysis.pmid,
              timeRelevance: isMorning && insulinTimingAnalysis.breakfastRatio < 0.15 ? 1.5 : 1
            });
          }
        }

        // --- 6. Циркадные ритмы (поздний ужин) ---
        if (circadianAnalysis.insight) {
          const isLate = circadianAnalysis.isLateEater || circadianAnalysis.hoursBeforeSleep < 2;
          const eveningBoost = isEvening ? 1.5 : 1;
          rawInsights.push({
            type: 'circadian',
            group: 'timing',
            priority: isLate ? 2 : 4,
            severity: circadianAnalysis.lastMealHour <= 19 ? 'positive' : 'warning',
            emoji: circadianAnalysis.lastMealHour <= 19 ? '✅' : '🌙',
            text: circadianAnalysis.insight,
            action: isLate ? 'Ужинай до 20:00 — это ускорит метаболизм на 5-10%' : null,
            pmid: circadianAnalysis.pmid,
            timeRelevance: eveningBoost
          });
        }

        // --- 7. Стресс и кортизол ---
        if (cortisolAnalysis.insight) {
          rawInsights.push({
            type: 'cortisol',
            group: 'hormones',
            priority: cortisolAnalysis.stressEatingDetected ? 1 : cortisolAnalysis.todayStress >= 7 ? 2 : 3,
            severity: cortisolAnalysis.stressEatingDetected ? 'critical' : 'warning',
            emoji: '😰',
            text: cortisolAnalysis.insight,
            action: cortisolAnalysis.stressEatingDetected
              ? '5 мин дыхательных упражнений снизят кортизол на 25%'
              : 'Прогулка 15 мин снижает кортизол',
            pmid: cortisolAnalysis.pmid,
            timeRelevance: 1
          });
        }

        // --- 8. Частота приёмов пищи ---
        if (mealFrequencyAnalysis.insight) {
          rawInsights.push({
            type: 'frequency',
            group: 'timing',
            priority: 3,
            severity: mealFrequencyAnalysis.isOptimal ? 'positive' : 'warning',
            emoji: '🍽️',
            text: mealFrequencyAnalysis.insight,
            action: mealFrequencyAnalysis.count <= 2
              ? 'Раздели калории на 3-4 приёма для лучшей сытости'
              : mealFrequencyAnalysis.count >= 6
                ? 'Объедини перекусы в полноценные приёмы'
                : null,
            pmid: mealFrequencyAnalysis.pmid,
            timeRelevance: 1
          });
        }

        // --- 9. Метаболическое окно после тренировки ---
        if (metabolicWindowAnalysis.insight && metabolicWindowAnalysis.hasTraining) {
          rawInsights.push({
            type: 'window',
            group: 'activity',
            priority: !metabolicWindowAnalysis.postWorkoutMealFound ? 2 : 3,
            severity: metabolicWindowAnalysis.isOptimal ? 'positive' : 'warning',
            emoji: metabolicWindowAnalysis.isOptimal ? '✅' : '💪',
            text: metabolicWindowAnalysis.insight,
            action: !metabolicWindowAnalysis.postWorkoutMealFound
              ? 'После тренировки съешь 20-30г белка в течение 90 мин'
              : null,
            pmid: metabolicWindowAnalysis.pmid,
            timeRelevance: 1
          });
        }

        // --- 10. Качество жиров ---
        if (fatQualityAnalysis.insight) {
          const isCritical = fatQualityAnalysis.transFat > 1;
          rawInsights.push({
            type: 'fatQuality',
            group: 'nutrition',
            priority: isCritical ? 1 : fatQualityAnalysis.quality === 'excellent' ? 4 : 3,
            severity: isCritical ? 'critical' : fatQualityAnalysis.quality === 'excellent' ? 'positive' : 'warning',
            emoji: isCritical ? '🚫' : fatQualityAnalysis.quality === 'excellent' ? '✅' : '⚠️',
            text: fatQualityAnalysis.insight,
            action: isCritical
              ? 'Исключи маргарин, фастфуд, выпечку — они содержат транс-жиры'
              : fatQualityAnalysis.goodFatRatio < 0.25
                ? 'Добавь орехи, авокадо или жирную рыбу'
                : null,
            pmid: fatQualityAnalysis.pmid,
            timeRelevance: 1
          });
        }

        // --- 11. Инсулиновая волна ---
        if (insulinWaveInsight) {
          rawInsights.push({
            type: 'insulinWave',
            group: 'metabolism',
            priority: insulinWaveInsight.status === 'active' ? 2 : 4,
            severity: insulinWaveInsight.status === 'lipolysis' ? 'positive' : 'info',
            emoji: insulinWaveInsight.status === 'lipolysis' ? '🔥' : '🌊',
            text: insulinWaveInsight.text,
            action: insulinWaveInsight.recommendation,
            pmid: null,
            timeRelevance: 1.2 // Всегда чуть важнее
          });
        }

        // --- 12. Корреляция сна и переедания ---
        if (sleepInsight) {
          rawInsights.push({
            type: 'sleepCorrelation',
            group: 'sleep',
            priority: sleepInsight.type === 'correlation' ? 2 : 3,
            severity: sleepInsight.type === 'positive' ? 'positive' : 'warning',
            emoji: sleepInsight.type === 'positive' ? '✅' : '😴',
            text: sleepInsight.text,
            action: sleepInsight.type === 'correlation'
              ? 'Ложись на 30 мин раньше — это снизит аппетит завтра'
              : null,
            pmid: sleepInsight.pmid,
            timeRelevance: isMorning ? 1.3 : isEvening ? 1.5 : 1
          });
        }

        // --- 13. Гидратация ---
        if (waterInsight) {
          rawInsights.push({
            type: 'water',
            group: 'nutrition',
            priority: waterInsight.type === 'warning' ? 2 : 4,
            severity: waterInsight.type === 'positive' ? 'positive' : 'warning',
            emoji: '💧',
            text: waterInsight.text,
            action: waterInsight.type === 'warning'
              ? 'Выпей стакан воды перед следующим приёмом пищи'
              : null,
            pmid: waterInsight.pmid,
            timeRelevance: 1
          });
        }

        // --- 14. Сравнение с прошлой неделей ---
        if (lastWeekComparison?.insight) {
          rawInsights.push({
            type: 'comparison',
            group: 'pattern',
            priority: 3,
            severity: lastWeekComparison.improvement ? 'positive' : 'info',
            emoji: lastWeekComparison.improvement ? '📈' : lastWeekComparison.diff > 200 ? '📉' : '↔️',
            text: lastWeekComparison.insight,
            action: null,
            pmid: null,
            timeRelevance: 1
          });
        }

        // --- 15. Цикл ---
        if (cycleInsight) {
          rawInsights.push({
            type: 'cycle',
            group: 'hormones',
            priority: 2,
            severity: 'info',
            emoji: '🌸',
            text: cycleInsight.text,
            action: cycleInsight.recommendation,
            pmid: null,
            timeRelevance: 1
          });
        }

        // --- 16. 🆕 Персональные паттерны (анализ истории) ---
        // Паттерн: недосып → переедание
        const sleepOvereatPattern = pastDays.filter((d) =>
          (d.sleepHours || 0) < 6 && (d.ratio || 0) > 1.15
        ).length;
        if (sleepOvereatPattern >= 2) {
          rawInsights.push({
            type: 'personalPattern',
            group: 'pattern',
            priority: 1,
            severity: 'critical',
            emoji: '🔄',
            text: `Твой паттерн: ${sleepOvereatPattern} из ${pastDays.length} дней — недосып → переедание`,
            action: 'Это твоя главная точка роста! Фокус на сон = контроль веса',
            pmid: '15602591',
            timeRelevance: 1.5,
            isPersonal: true
          });
        }

        // Паттерн: выходные → перебор
        const weekendOvereatPattern = pastDays.filter((d) => {
          const dayDate = new Date(d.date);
          const dow = dayDate.getDay();
          return (dow === 0 || dow === 6) && (d.ratio || 0) > 1.2;
        }).length;
        const totalWeekends = pastDays.filter((d) => {
          const dayDate = new Date(d.date);
          const dow = dayDate.getDay();
          return dow === 0 || dow === 6;
        }).length;
        if (weekendOvereatPattern >= 2 && totalWeekends >= 2 && weekendOvereatPattern / totalWeekends >= 0.5) {
          rawInsights.push({
            type: 'personalPattern',
            group: 'pattern',
            priority: 2,
            severity: 'warning',
            emoji: '🎉',
            text: `Паттерн выходных: ${weekendOvereatPattern} из ${totalWeekends} — перебор >20%`,
            action: 'Планируй выходные заранее — добавь активность или refeed',
            pmid: null,
            timeRelevance: 1.3,
            isPersonal: true
          });
        }

        // --- 17. 🆕 Хронический недосып (на основе реальных данных) ---
        const daysWithSleep = pastDays.filter((d) => (d.sleepHours || 0) > 0);
        const avgSleepHours = daysWithSleep.length > 0
          ? daysWithSleep.reduce((s, d) => s + (d.sleepHours || 0), 0) / daysWithSleep.length
          : 0;
        const sleepNorm = prof.sleepHours || 8;
        const sleepDeficitHours = sleepNorm - avgSleepHours;

        if (avgSleepHours > 0 && sleepDeficitHours >= 0.8 && daysWithSleep.length >= 3) {
          rawInsights.push({
            type: 'chronicSleepDeficit',
            group: 'sleep',
            priority: sleepDeficitHours >= 1.5 ? 1 : 2,
            severity: sleepDeficitHours >= 1.5 ? 'critical' : 'warning',
            emoji: '😴',
            text: `Недосып: ${avgSleepHours.toFixed(1)}ч в среднем при норме ${sleepNorm}ч (−${sleepDeficitHours.toFixed(1)}ч)`,
            action: 'Ложись на 30 мин раньше сегодня. Недосып → +15% голода, −20% силы воли',
            pmid: '15602591',
            timeRelevance: 1.6,
            isPersonal: true
          });
        }

        // --- 18. 🆕 Низкая активность / сидячий образ жизни ---
        const daysWithSteps = pastDays.filter((d) => (d.steps || 0) > 0);
        const avgSteps = daysWithSteps.length > 0
          ? Math.round(daysWithSteps.reduce((s, d) => s + (d.steps || 0), 0) / daysWithSteps.length)
          : 0;
        const stepsGoal = prof.stepsGoal || 7000;
        const stepsPct = avgSteps / stepsGoal;

        if (avgSteps > 0 && avgSteps < 3000 && daysWithSteps.length >= 3) {
          rawInsights.push({
            type: 'sedentaryPattern',
            group: 'activity',
            priority: 1,
            severity: 'critical',
            emoji: '🪑',
            text: `Очень низкая активность: ${avgSteps} шагов/день (${Math.round(stepsPct * 100)}% от цели ${stepsGoal})`,
            action: 'Каждый час вставай на 5 мин. NEAT сжигает до 350 ккал/день!',
            pmid: '17827399',
            timeRelevance: 1.5,
            isPersonal: true
          });
        } else if (avgSteps > 0 && stepsPct < 0.6 && daysWithSteps.length >= 3) {
          rawInsights.push({
            type: 'lowStepsPattern',
            group: 'activity',
            priority: 2,
            severity: 'warning',
            emoji: '👟',
            text: `Шагов мало: ${avgSteps}/день — это ${Math.round(stepsPct * 100)}% от твоей цели ${stepsGoal}`,
            action: 'Добавь 15-мин прогулку после обеда. Это +2000 шагов и −100 ккал',
            pmid: null,
            timeRelevance: 1.3,
            isPersonal: true
          });
        }

        // --- 19. 🆕 Комбо: агрессивный дефицит + недосып = срыв ---
        const deficitPct = prof.deficitPctTarget || 0;
        if (deficitPct <= -15 && avgSleepHours > 0 && avgSleepHours < 7) {
          rawInsights.push({
            type: 'deficitSleepCombo',
            group: 'metabolism',
            priority: 1,
            severity: 'critical',
            emoji: '⚠️',
            text: `Опасное комбо: дефицит ${deficitPct}% + сон ${avgSleepHours.toFixed(1)}ч`,
            action: 'При недосыпе организм теряет мышцы вместо жира. Снизь дефицит до −10% или спи 7+ часов',
            pmid: '20921542',
            timeRelevance: 1.8,
            isPersonal: true
          });
        }

        // --- 20. 🆕 Низкое потребление воды ---
        const daysWithWater = pastDays.filter((d) => (d.waterMl || 0) > 0);
        const avgWaterMl = daysWithWater.length > 0
          ? Math.round(daysWithWater.reduce((s, d) => s + (d.waterMl || 0), 0) / daysWithWater.length)
          : 0;
        const waterNorm = (prof.weight || 70) * 30; // 30мл на кг

        if (avgWaterMl > 0 && avgWaterMl < waterNorm * 0.5 && daysWithWater.length >= 3) {
          rawInsights.push({
            type: 'lowWaterPattern',
            group: 'nutrition',
            priority: 2,
            severity: 'warning',
            emoji: '💧',
            text: `Мало воды: ${avgWaterMl}мл/день при норме ${waterNorm}мл (${Math.round(avgWaterMl / waterNorm * 100)}%)`,
            action: 'Дегидратация маскируется под голод. Пей стакан воды перед каждым приёмом пищи',
            pmid: '28739050',
            timeRelevance: 1.2,
            isPersonal: true
          });
        }

        // --- 21. 🆕 Нерегулярные тренировки ---
        const daysWithTraining = pastDays.filter((d) => d.hasTraining).length;
        const trainingFrequency = pastDays.length > 0 ? daysWithTraining / pastDays.length : 0;

        if (pastDays.length >= 7 && trainingFrequency < 0.3 && daysWithTraining < 3) {
          rawInsights.push({
            type: 'lowTrainingPattern',
            group: 'activity',
            priority: 2,
            severity: 'warning',
            emoji: '🏋️',
            text: `Мало тренировок: ${daysWithTraining} из ${pastDays.length} дней (${Math.round(trainingFrequency * 100)}%)`,
            action: 'Даже 2-3 тренировки в неделю ускоряют метаболизм на 5-15% на следующий день (NDTE)',
            pmid: '3056758',
            timeRelevance: 1.2,
            isPersonal: true
          });
        }

        // --- 22. 🆕 Скачки веса (высокая вариабельность) ---
        const daysWithWeight = pastDays.filter((d) => (d.weightMorning || 0) > 0);
        if (daysWithWeight.length >= 5) {
          const weights = daysWithWeight.map((d) => d.weightMorning);
          const avgWeight = weights.reduce((s, w) => s + w, 0) / weights.length;
          const variance = weights.reduce((s, w) => s + Math.pow(w - avgWeight, 2), 0) / weights.length;
          const stdDev = Math.sqrt(variance);
          const weightRange = Math.max(...weights) - Math.min(...weights);

          if (stdDev > 0.8 || weightRange > 2.5) {
            rawInsights.push({
              type: 'weightFluctuation',
              group: 'pattern',
              priority: 2,
              severity: 'info',
              emoji: '📊',
              text: `Скачки веса: ±${stdDev.toFixed(1)}кг (диапазон ${weightRange.toFixed(1)}кг за ${daysWithWeight.length} дней)`,
              action: 'Это нормально! Вода, соль, стресс. Смотри на тренд 7-14 дней, не на дневные скачки',
              pmid: null,
              timeRelevance: 1.0,
              isPersonal: true
            });
          }
        }

        // ========== ПИТАНИЕ И МАКРОСЫ (главное!) ==========

        // --- 23. 🆕 Хронический недобор калорий ---
        const daysWithRatio = pastDays.filter((d) => d.ratio && d.ratio > 0);
        const avgRatio = daysWithRatio.length > 0
          ? daysWithRatio.reduce((s, d) => s + d.ratio, 0) / daysWithRatio.length
          : 0;
        const chronicUndereating = daysWithRatio.filter((d) => d.ratio < 0.85).length;

        if (avgRatio > 0 && avgRatio < 0.85 && daysWithRatio.length >= 5) {
          rawInsights.push({
            type: 'chronicUndereating',
            group: 'nutrition',
            priority: 1,
            severity: 'critical',
            emoji: '🚨',
            text: `Хронический недоед: ${Math.round(avgRatio * 100)}% от нормы (${chronicUndereating} из ${daysWithRatio.length} дней <85%)`,
            action: 'Метаболизм замедляется! Добавь 200-300 ккал или сделай refeed день',
            pmid: '20921542',
            timeRelevance: 1.8,
            isPersonal: true
          });
        } else if (avgRatio > 0 && avgRatio < 0.92 && daysWithRatio.length >= 5) {
          rawInsights.push({
            type: 'slightUndereating',
            group: 'nutrition',
            priority: 2,
            severity: 'warning',
            emoji: '📉',
            text: `Систематический недобор: ${Math.round(avgRatio * 100)}% от нормы за ${daysWithRatio.length} дней`,
            action: 'Немного не добираешь. Добавь перекус или увеличь порции на 10%',
            pmid: null,
            timeRelevance: 1.3,
            isPersonal: true
          });
        }

        // --- 24. 🆕 Хронический перебор калорий ---
        const chronicOvereating = daysWithRatio.filter((d) => d.ratio > 1.15).length;

        if (avgRatio > 1.15 && daysWithRatio.length >= 5) {
          rawInsights.push({
            type: 'chronicOvereating',
            group: 'nutrition',
            priority: 1,
            severity: 'critical',
            emoji: '⚠️',
            text: `Систематический перебор: ${Math.round(avgRatio * 100)}% от нормы (${chronicOvereating} из ${daysWithRatio.length} дней >115%)`,
            action: 'Пересмотри размер порций или увеличь активность. 100 лишних ккал/день = +5кг/год',
            pmid: null,
            timeRelevance: 1.6,
            isPersonal: true
          });
        }

        // --- 25. 🆕 Низкий белок в среднем ---
        const daysWithProt = pastDays.filter((d) => d.prot > 0 && d.target > 0);
        const avgProtPct = daysWithProt.length > 0
          ? daysWithProt.reduce((s, d) => s + (d.prot * 3 / d.target), 0) / daysWithProt.length
          : 0;
        const proteinNormPct = 0.25; // 25% от калоража — норма

        if (avgProtPct > 0 && avgProtPct < proteinNormPct * 0.7 && daysWithProt.length >= 5) {
          rawInsights.push({
            type: 'chronicLowProtein',
            group: 'nutrition',
            priority: 1,
            severity: 'critical',
            emoji: '🥩',
            text: `Критически мало белка: ${Math.round(avgProtPct * 100)}% от калоража (норма ${Math.round(proteinNormPct * 100)}%)`,
            action: 'На дефиците теряешь мышцы! Добавь белок к каждому приёму: творог, яйца, мясо',
            pmid: '22150425',
            timeRelevance: 1.7,
            isPersonal: true
          });
        } else if (avgProtPct > 0 && avgProtPct < proteinNormPct * 0.85 && daysWithProt.length >= 5) {
          rawInsights.push({
            type: 'lowProtein',
            group: 'nutrition',
            priority: 2,
            severity: 'warning',
            emoji: '🍗',
            text: `Маловато белка: ${Math.round(avgProtPct * 100)}% от калоража (цель ${Math.round(proteinNormPct * 100)}%)`,
            action: 'Добавь 20-30г белка в день. Протеин = сытость + сохранение мышц',
            pmid: null,
            timeRelevance: 1.4,
            isPersonal: true
          });
        }

        // --- 26. 🆕 Перебор углеводов ---
        const daysWithCarbs = pastDays.filter((d) => d.carbs > 0 && d.target > 0);
        const avgCarbsPct = daysWithCarbs.length > 0
          ? daysWithCarbs.reduce((s, d) => s + (d.carbs * 4 / d.target), 0) / daysWithCarbs.length
          : 0;
        const carbsNormPct = 0.45; // 45% от калоража

        if (avgCarbsPct > carbsNormPct * 1.3 && daysWithCarbs.length >= 5) {
          rawInsights.push({
            type: 'highCarbs',
            group: 'nutrition',
            priority: 2,
            severity: 'warning',
            emoji: '🍞',
            text: `Много углеводов: ${Math.round(avgCarbsPct * 100)}% от калоража (норма ~${Math.round(carbsNormPct * 100)}%)`,
            action: 'Высокие углеводы = частые инсулиновые волны. Замени часть на белок/жиры',
            pmid: null,
            timeRelevance: 1.2,
            isPersonal: true
          });
        }

        // --- 27. 🆕 Нестабильность калоража (йо-йо питание) ---
        if (daysWithRatio.length >= 5) {
          const ratios = daysWithRatio.map((d) => d.ratio);
          const avgR = ratios.reduce((s, r) => s + r, 0) / ratios.length;
          const ratioVariance = ratios.reduce((s, r) => s + Math.pow(r - avgR, 2), 0) / ratios.length;
          const ratioStdDev = Math.sqrt(ratioVariance);

          if (ratioStdDev > 0.25) {
            rawInsights.push({
              type: 'unstableCalories',
              group: 'pattern',
              priority: 2,
              severity: 'warning',
              emoji: '🎢',
              text: `Йо-йо питание: калории скачут ±${Math.round(ratioStdDev * 100)}% от нормы`,
              action: 'Стабильность важнее идеала! Лучше 95% каждый день, чем 70%→130%',
              pmid: null,
              timeRelevance: 1.3,
              isPersonal: true
            });
          }
        }

        // --- 28. 🆕 Отличный баланс калорий ---
        if (avgRatio >= 0.92 && avgRatio <= 1.08 && daysWithRatio.length >= 5) {
          const goodDays = daysWithRatio.filter((d) => d.ratio >= 0.85 && d.ratio <= 1.15).length;
          const goodPct = goodDays / daysWithRatio.length;

          if (goodPct >= 0.7) {
            rawInsights.push({
              type: 'stableCalories',
              group: 'nutrition',
              priority: 3,
              severity: 'positive',
              emoji: '🎯',
              text: `Стабильное питание: ${Math.round(avgRatio * 100)}% от нормы, ${goodDays}/${daysWithRatio.length} дней в цели`,
              action: 'Отлично! Такая стабильность = предсказуемый результат. Продолжай!',
              pmid: null,
              timeRelevance: 1.0,
              isPersonal: true
            });
          }
        }

        // --- 29. 🆕 Отличный белок ---
        if (avgProtPct >= proteinNormPct * 0.95 && daysWithProt.length >= 5) {
          rawInsights.push({
            type: 'goodProtein',
            group: 'nutrition',
            priority: 3,
            severity: 'positive',
            emoji: '💪',
            text: `Белок в норме: ${Math.round(avgProtPct * 100)}% от калоража — мышцы защищены!`,
            action: 'Так держать! Белок сохраняет мышцы даже на дефиците',
            pmid: null,
            timeRelevance: 0.9,
            isPersonal: true
          });
        }

        // --- Сортировка и фильтрация ---
        // 1. Фильтруем "норма" инсайты (priority 4) если есть более важные
        // 2. Сортируем по: severity → priority → timeRelevance

        const severityOrder = { critical: 0, warning: 1, positive: 2, info: 3 };

        const sortedInsights = rawInsights
          .map((ins) => ({
            ...ins,
            score: (4 - severityOrder[ins.severity]) * 100 + (5 - ins.priority) * 10 + (ins.timeRelevance || 1) * 5
          }))
          .sort((a, b) => b.score - a.score);

        // Если есть критические/warning — убираем "положительные" инсайты чтобы не отвлекать
        const hasCritical = sortedInsights.some((i) => i.severity === 'critical' || i.severity === 'warning');
        const scientificInsights = hasCritical
          ? sortedInsights.filter((i) => i.severity !== 'positive' || i.priority <= 2 || i.isPersonal)
          : sortedInsights;

        // Группируем по теме для UI
        const insightGroups = {
          sleep: scientificInsights.filter((i) => i.group === 'sleep'),
          metabolism: scientificInsights.filter((i) => i.group === 'metabolism'),
          timing: scientificInsights.filter((i) => i.group === 'timing'),
          nutrition: scientificInsights.filter((i) => i.group === 'nutrition'),
          activity: scientificInsights.filter((i) => i.group === 'activity'),
          hormones: scientificInsights.filter((i) => i.group === 'hormones'),
          pattern: scientificInsights.filter((i) => i.group === 'pattern')
        };

        // Главный инсайт дня (самый важный)
        const mainInsight = scientificInsights[0] || null;

        // ═══════════════════════════════════════════════════════════════════
        // 🆕 v3.1: РАСШИРЕННАЯ АНАЛИТИКА (6 новых фич)
        // ═══════════════════════════════════════════════════════════════════

        // --- #2: PROTEIN DEBT (Белковый долг) ---
        // 🔬 Mettler 2010: При дефиците нужно 1.8-2.7г/кг белка для сохранения мышц
        let proteinDebt = {
          hasDebt: false,
          debt: 0,
          avgProteinPct: 0,
          targetPct: CFG.PROTEIN_TARGET_PCT,
          daysAnalyzed: 0,
          severity: 'none', // none | mild | moderate | critical
          recommendation: null,
          pmid: '20095013'
        };

        const proteinDays = pastDays.filter((d) => d.prot > 0 && d.target > 0);
        if (proteinDays.length >= 2) {
          const avgProtPct = proteinDays.reduce((s, d) => s + (d.prot * 3 / d.target), 0) / proteinDays.length;
          const targetPct = CFG.PROTEIN_TARGET_PCT;
          const deficitPct = targetPct - avgProtPct;

          proteinDebt.avgProteinPct = Math.round(avgProtPct * 100);
          proteinDebt.daysAnalyzed = proteinDays.length;

          if (avgProtPct < CFG.PROTEIN_CRITICAL_PCT) {
            proteinDebt.hasDebt = true;
            proteinDebt.severity = 'critical';
            proteinDebt.debt = Math.round((targetPct - avgProtPct) * optimum / (HEYS.TEF?.ATWATER?.protein || 3)); // граммы
            proteinDebt.recommendation = `Критический недобор белка! Добавь ${Math.round(proteinDebt.debt * 0.5)}г белка сегодня`;
          } else if (avgProtPct < targetPct * 0.85) {
            proteinDebt.hasDebt = true;
            proteinDebt.severity = 'moderate';
            proteinDebt.debt = Math.round((targetPct - avgProtPct) * optimum / (HEYS.TEF?.ATWATER?.protein || 3));
            proteinDebt.recommendation = `Маловато белка. Добавь ${Math.round(proteinDebt.debt * 0.3)}г к обычному рациону`;
          } else if (avgProtPct < targetPct * 0.95) {
            proteinDebt.hasDebt = true;
            proteinDebt.severity = 'mild';
            proteinDebt.debt = Math.round((targetPct - avgProtPct) * optimum / (HEYS.TEF?.ATWATER?.protein || 3));
            proteinDebt.recommendation = 'Белок немного ниже оптимума. Добавь яйцо или порцию творога';
          }
        }

        // --- #3: TRAINING DAY CONTEXT (Контекст тренировочного дня) ---
        // Разные типы тренировок требуют разного восстановления
        let trainingDayContext = {
          isTrainingDay: false,
          trainingType: null,
          trainingIntensity: 'none',
          recoveryMultiplier: 1.0,
          recommendations: [],
          nutritionPriority: 'balanced' // balanced | protein | carbs | recovery
        };

        const todayTrainingsForContext = day.trainings || [];
        if (todayTrainingsForContext.length > 0) {
          trainingDayContext.isTrainingDay = true;

          // Определяем доминирующий тип
          const typeCounts = { strength: 0, cardio: 0, hobby: 0 };
          let totalZoneMinutes = 0;
          let highIntensityMinutes = 0; // Зоны 3-4

          todayTrainingsForContext.forEach((t) => {
            typeCounts[t.type || 'hobby']++;
            if (t.z) {
              const total = t.z.reduce((s, m) => s + (+m || 0), 0);
              totalZoneMinutes += total;
              highIntensityMinutes += (+t.z[2] || 0) + (+t.z[3] || 0); // Зоны 3-4
            }
          });

          // Доминирующий тип
          trainingDayContext.trainingType = Object.entries(typeCounts)
            .sort((a, b) => b[1] - a[1])[0]?.[0] || 'hobby';

          // Интенсивность по времени в зонах 3-4
          if (totalZoneMinutes >= 90 && highIntensityMinutes >= 30) {
            trainingDayContext.trainingIntensity = 'extreme';
          } else if (totalZoneMinutes >= 60 || highIntensityMinutes >= 20) {
            trainingDayContext.trainingIntensity = 'high';
          } else if (totalZoneMinutes >= 30) {
            trainingDayContext.trainingIntensity = 'moderate';
          } else {
            trainingDayContext.trainingIntensity = 'light';
          }

          // Множитель восстановления
          const typeMult = CFG.TRAINING_TYPE_MULT[trainingDayContext.trainingType] || 1.0;
          const intensityMult = CFG.TRAINING_INTENSITY_MULT[trainingDayContext.trainingIntensity] || 1.0;
          trainingDayContext.recoveryMultiplier = Math.round(typeMult * intensityMult * 100) / 100;

          // Приоритет питания
          if (trainingDayContext.trainingType === 'strength') {
            trainingDayContext.nutritionPriority = 'protein';
            trainingDayContext.recommendations.push('💪 Силовая: фокус на белок (1.6-2.2г/кг)');
          } else if (trainingDayContext.trainingType === 'cardio' && trainingDayContext.trainingIntensity !== 'light') {
            trainingDayContext.nutritionPriority = 'carbs';
            trainingDayContext.recommendations.push('🏃 Кардио: восполни гликоген углеводами');
          }

          if (trainingDayContext.trainingIntensity === 'extreme' || trainingDayContext.trainingIntensity === 'high') {
            trainingDayContext.nutritionPriority = 'recovery';
            trainingDayContext.recommendations.push('🔥 Интенсивная: добавь +10-15% калорий для восстановления');
          }
        }

        // --- #4: CIRCADIAN CONTEXT (Циркадный контекст) ---
        // 🔬 Van Cauter 1997: Утренняя инсулиночувствительность выше
        // currentHour уже объявлен выше (строка 10018)
        let circadianContext = {
          period: 'day', // morning | day | evening | night
          urgency: 'low', // low | medium | high
          debtMultiplier: 1.0,
          advice: null
        };

        if (currentHour >= 6 && currentHour < 12) {
          circadianContext.period = 'morning';
          circadianContext.urgency = 'low';
          circadianContext.debtMultiplier = CFG.CIRCADIAN_MORNING_MULT;
          if (hasDebt && rawDebt < 500) {
            circadianContext.advice = 'Утро — ещё рано переживать о недоборе. Впереди весь день!';
          }
        } else if (currentHour >= 12 && currentHour < 18) {
          circadianContext.period = 'day';
          circadianContext.urgency = 'medium';
          circadianContext.debtMultiplier = 1.0;
        } else if (currentHour >= 18 && currentHour < 23) {
          circadianContext.period = 'evening';
          circadianContext.urgency = hasDebt && rawDebt > 400 ? 'high' : 'medium';
          circadianContext.debtMultiplier = CFG.CIRCADIAN_EVENING_MULT;
          if (hasDebt && rawDebt > 500) {
            circadianContext.advice = 'Вечер — нужно поесть! Большой недобор ухудшит сон и повысит грелин завтра.';
          }
        } else {
          circadianContext.period = 'night';
          circadianContext.urgency = 'high';
          circadianContext.debtMultiplier = CFG.CIRCADIAN_EVENING_MULT;
        }

        // --- #5: EMOTIONAL RISK (Эмоциональный риск срыва) ---
        // 🔬 Epel 2001: Стресс + голод = высокий риск срыва
        // avgStress уже объявлен выше (строка 9746)
        const isHighStress = avgStress >= CFG.STRESS_HIGH_THRESHOLD;

        let emotionalRisk = {
          level: 'low', // low | medium | high | critical
          stressLevel: avgStress,
          factors: [],
          bingeRisk: 0, // 0-100%
          recommendation: null,
          pmid: '11070333' // Epel 2001
        };

        // Факторы риска
        if (isHighStress) emotionalRisk.factors.push('Высокий стресс');
        if (hasDebt && rawDebt > 400) emotionalRisk.factors.push('Накопленный недобор');
        if (cortisolAnalysis.stressEatingDetected) emotionalRisk.factors.push('Паттерн стрессового переедания');
        if (circadianContext.period === 'evening' || circadianContext.period === 'night') {
          emotionalRisk.factors.push('Вечер/ночь (пик уязвимости)');
        }

        // Расчёт риска
        emotionalRisk.bingeRisk = Math.min(100, emotionalRisk.factors.length * 25);

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

        // --- #6: BMI-BASED PERSONALIZATION ---
        // 🔬 Kahn & Flier 2000, DeFronzo 1979: Разный BMI = разный метаболизм
        const weight = prof?.weight || 70;
        const height = prof?.height || 170;
        const bmi = weight / Math.pow(height / 100, 2);

        let bmiContext = {
          value: Math.round(bmi * 10) / 10,
          category: 'normal',
          recoveryMultiplier: 1.0,
          boostMultiplier: 1.0,
          recommendation: null
        };

        // Определяем категорию
        for (const [cat, cfg] of Object.entries(CFG.BMI_RECOVERY_MULT)) {
          if (bmi < cfg.threshold) {
            bmiContext.category = cat;
            bmiContext.recoveryMultiplier = cfg.mult;
            bmiContext.boostMultiplier = cfg.boost;
            break;
          }
        }

        // Рекомендации по BMI
        if (bmiContext.category === 'underweight') {
          bmiContext.recommendation = 'При низком BMI важнее НАБРАТЬ, чем терять. Увеличь калории!';
        } else if (bmiContext.category === 'obese') {
          bmiContext.recommendation = 'При высоком BMI можно чуть агрессивнее с дефицитом, но сохраняй белок!';
        }

        // === РЕЗУЛЬТАТ ===
        return {
          // Долг (недобор)
          hasDebt,
          debt: Math.round(cappedDebt),
          rawDebt: Math.round(rawDebt),
          effectiveDebt, // Сколько реально компенсируем (75% от долга)
          recoveryDays, // Гибкое кол-во дней (1-3)
          dailyBoost,
          adjustedOptimum: optimum + dailyBoost,
          needsRefeed,
          refeedBoost,
          refeedOptimum: optimum + Math.round(optimum * CFG.REFEED_BOOST_PCT),
          consecutiveDeficitDays: maxConsecutiveDeficit,

          // Прогноз восстановления
          daysToRecover,
          recoveryDayName,
          isRecovering,

          // Перебор
          hasExcess,
          excess: Math.round(netExcess),
          rawExcess: Math.round(rawExcess),
          totalTrainingKcal: Math.round(totalTrainingKcal),
          cardioRecommendation,
          // Мягкая коррекция перебора
          dailyReduction, // Снижение нормы (акцент)
          effectiveExcess, // Чистый перебор после активности
          excessRecoveryDays, // Дней на компенсацию
          activityCompensation, // Сколько через активность
          adjustedOptimumWithExcess: optimum - dailyReduction, // Норма с учётом перебора

          // Общее
          dayBreakdown,
          daysAnalyzed: pastDays.length,
          totalBalance: Math.round(totalBalance),
          weightedBalance: Math.round(weightedBalance),

          // Аналитика
          trend,
          severity,
          weightImpact,
          goalMode: goalThresholds.mode,

          // 🔬 Научная аналитика v5.0
          scientificInsights,
          insightGroups,
          mainInsight,
          hasCriticalInsights: hasCritical,

          // Детальные анализы (для расширенного UI)
          tefAnalysis,
          epocAnalysis,
          adaptiveThermogenesis,
          hormonalBalance,
          insulinTimingAnalysis,
          cortisolAnalysis,
          circadianAnalysis,
          mealFrequencyAnalysis,
          metabolicWindowAnalysis,
          weightPrediction,
          fatQualityAnalysis,
          insulinWaveInsight,
          sleepInsight,
          waterInsight,
          lastWeekComparison,
          smartTiming,
          cycleInsight,

          // 🆕 v3.1: Расширенная аналитика
          proteinDebt, // #2 Белковый долг
          trainingDayContext, // #3 Контекст тренировочного дня
          circadianContext, // #4 Циркадный контекст
          emotionalRisk, // #5 Эмоциональный риск срыва
          bmiContext // #6 BMI-персонализация
        };
      } catch (e) {
        console.warn('[CaloricDebt] Error:', e);
        return null;
      }
    }, [sparklineData, optimum, day.trainings, day.steps, day.deficitPct, prof?.deficitPctTarget]);

    return caloricDebt;
  };
})();
