// heys_day_caloric_debt_core_v1.js — чистое ядро расчёта долга и перебора
//
// Вынесено из heys_day_caloric_balance_v1.js (2026-08-08) дословно, без правок
// формул: там оно жило внутри React-хука, и коннектор куратора не мог посчитать
// норму целиком — брал её из кэша отрисовки и отдавал протухшее число (см.
// BUGS_HISTORY.md, «MCP отдавал норму дня из протухшего кэша»).
//
// Ядро — чистая функция от данных дня и окна прошлых дней, поэтому оно
// зеркалится в yandex-cloud-functions/heys-mcp/lib/web-mirror/ и считается на
// сервере тем же кодом. Второго источника правды у формулы долга быть не должно.
//
// Отступы сохранены как в оригинале намеренно: так diff переноса читается как
// перемещение, а не как переписывание.

(function () {
  const root = (typeof window !== "undefined" ? window : globalThis) || {};
  const HEYS = (root.HEYS = root.HEYS || {});

  HEYS.dayCaloricDebtCore = HEYS.dayCaloricDebtCore || {};

  /**
   * Источники расчёта — id записей реестра дневной части, а не номера PMID.
   *
   * Ссылка живёт рядом с константой, которую она обосновывает, и попадает на
   * экран только через реестр: обновится запись — поменяются все листы разом.
   * Обратный порядок (номер в разметке листа) даёт пятнадцать разных списков
   * через год и ни одного способа заметить, что один из них устарел.
   *
   * leibel1995 — метаболизм адаптируется на дефиците, отсюда возврат 75 %,
   * а не 100. hall2011 — постепенное изменение работает лучше резкого, отсюда
   * растяжка возврата на 1–3 дня и потолок +20 %.
   */
  HEYS.dayCaloricDebtCore.SOURCE_IDS = ['leibel1995', 'hall2011'];

  /**
   * @param {object} ctx { date, day, prof, optimum, sparklineData, fmtDate }
   * @returns {object|null} промежуточные величины расчёта; null — считать не на чем
   */
  HEYS.dayCaloricDebtCore.computeDebtCore = function computeDebtCore(ctx) {
    const { date, day, prof, optimum, sparklineData, fmtDate } = ctx || {};

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
        // 2026-08-08: было optimum/3 (33%). Порог поднят до 70% и приведён в
        // соответствие с баннером низкого дня (heys_day_low_cal_banner_v1.js,
        // THRESHOLD): раньше день между 33% и 50% попадал в окно молча, а между
        // 50% и 100% — даже без вопроса пользователю. Недозаполненный дневник
        // превращался в «долг», который система возвращала прибавкой к норме
        // следующих дней. Осознанно низкий день пользователь помечает как
        // голодание — такие дни ниже проходят по isFastingDay независимо от порога.
        const INCOMPLETE_RATIO = 0.7;
        const minKcalThreshold = optimum * INCOMPLETE_RATIO;
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

        return {
          CFG,
          goalThresholds,
          todayDate,
          pastDays,
          dayNames,
          totalBalance,
          weightedBalance,
          maxConsecutiveDeficit,
          totalTrainingKcal,
          dayBreakdown,
          rawDebt,
          cappedDebt,
          hasDebt,
          rawExcess,
          netExcess,
          hasExcess,
          trend,
          severity,
          hasHardTrainingToday,
          needsRefeed,
          dailyBoost,
          refeedBoost,
          recoveryDays,
          effectiveDebt,
          dailyReduction,
          effectiveExcess,
          excessRecoveryDays,
          activityCompensation,
        };
      } catch (e) {
        console.warn("[CaloricDebtCore] Error:", e);
        return null;
      }
  };
})();
