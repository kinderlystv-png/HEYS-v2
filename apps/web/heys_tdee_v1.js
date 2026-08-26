// heys_tdee_v1.js — Модуль расчёта затрат калорий (TDEE)
// Единый источник правды для всех компонентов: hero, статистика, недельный отчёт
// v1.1.2 — Добавлено totalHouseholdMin для UI

(function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  const U = HEYS.utils || {};

  const tryParseStoredValue = (raw, fallback) => {
    if (raw === null || raw === undefined) return fallback;
    if (typeof raw === 'string') {
      let str = raw;
      if (str.startsWith('¤Z¤') && HEYS.store?.decompress) {
        try { str = HEYS.store.decompress(str); } catch (_) { }
      }
      try { return JSON.parse(str); } catch (_) { return str; }
    }
    return raw;
  };

  const storeGet = (k, def) => {
    try {
      if (HEYS.store?.get) {
        const stored = HEYS.store.get(k, null);
        if (stored !== null && stored !== undefined) {
          return tryParseStoredValue(stored, def);
        }
      }
      if (U.lsGet) {
        const legacy = U.lsGet(k, def);
        if (legacy !== null && legacy !== undefined) return legacy;
      }
      const raw = localStorage.getItem(k);
      return tryParseStoredValue(raw, def);
    } catch (e) {
      return def;
    }
  };

  // === Вспомогательные функции ===
  const r0 = x => Math.round(+x || 0);

  /**
   * Калории в минуту по MET и весу
   * @param {number} met - Метаболический эквивалент
   * @param {number} weight - Вес в кг
   * @returns {number} ккал/мин
   */
  const kcalPerMin = (met, weight) => (met * 3.5 * weight) / 200;

  /**
   * Расход НАД покоем: BMR уже покрывает все 24 часа на уровне 1 MET, поэтому
   * активность нельзя добавлять по «брутто»-MET — один MET окажется посчитан
   * дважды. 140 минут быта по MET 2.5 давали +559 ккал, из которых ~224 уже
   * сидели в BMR (2026-08-08).
   */
  const netKcalPerMin = (met, weight) => kcalPerMin(Math.max((+met || 0) - 1, 0), weight);

  /**
   * Возраст: дата рождения важнее сохранённого числа — оно протухает молча.
   * У Полтавского в блобе профиля лежало `age: 30` при `birthDate` 1988 года,
   * и BMR восемь лет считался как для тридцатилетнего (2026-08-08).
   */
  const ageFromProfile = (p) => {
    const birthDate = (p && p.birthDate) || '';
    if (birthDate) {
      const birth = new Date(birthDate);
      if (!isNaN(birth.getTime())) {
        const now = new Date();
        let age = now.getFullYear() - birth.getFullYear();
        const monthDiff = now.getMonth() - birth.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age -= 1;
        if (age >= 0 && age < 150) return age;
      }
    }
    return +(p && p.age) || 30;
  };

  /**
   * BMR по формуле Mifflin-St Jeor
   * @param {number} weight - Вес в кг
   * @param {Object} profile - { age, height, gender }
   * @returns {number} ккал/день
   */
  const calcBMR = (weight, profile) => {
    // Overload: calcBMR(profileObject) — если первый аргумент объект, трактуем как профиль.
    // Оживляет делегацию day_utils (звала calcBMR({...prof, weight})) и фиксит
    // pi_calculations/pi_analytics_api/predictive_insights (звали calcBMR(profile) одним аргументом → 0).
    if (weight && typeof weight === 'object') {
      profile = weight;
      weight = +profile.weight || 0;
    }
    const p = profile || {};
    const age = ageFromProfile(p);
    const height = +p.height || 170;
    // Пол: gender ('Женский') ИЛИ sex ('female') — day_utils нормализует пол в .sex.
    const isFemale = (p.gender === 'Женский') || (p.sex === 'female');
    // Mifflin-St Jeor: 10×вес + 6.25×рост − 5×возраст + (5 муж / −161 жен)
    return r0(10 * (+weight || 0) + 6.25 * height - 5 * age + (isFemale ? -161 : 5));
  };

  /**
   * Калории от шагов (нетто над покоем — MET 3.5, как тренировки/быт)
   * @param {number|null|undefined} steps - Количество шагов; null/undefined → 0 ккал
   * @param {number} weight - Вес в кг
   * @param {Object} profile - профиль (height)
   * @param {number} strideMultiplier - Множитель длины шага (0.7 по умолчанию)
   * @returns {number} ккал
   */
  const WALKING_MET = 3.5;
  const stepsKcal = (steps, weight, profile, strideMultiplier = 0.7) => {
    if (steps === null || steps === undefined) return 0;
    if (+steps <= 0) return 0;
    const height = +(profile && profile.height) || 170;
    const strideLength = height * strideMultiplier / 100;
    const distanceKm = (+steps * strideLength) / 1000;
    const walkingSpeedKmh = 5;
    const minutes = (distanceKm / walkingSpeedKmh) * 60;
    return r0(minutes * netKcalPerMin(WALKING_MET, weight));
  };

  const parseAnchorDate = (day, options = {}) => {
    const raw = options.anchorDate || (day && day.date);
    if (raw && /^\d{4}-\d{2}-\d{2}$/.test(String(raw))) {
      return new Date(String(raw) + 'T12:00:00');
    }
    return new Date();
  };

  const defaultReadDay = (lsGet, options = {}) => {
    const profile = options.profile || {};
    const cid = options.clientId
      || profile.clientId
      || HEYS.currentClientId
      || HEYS.utils?.getCurrentClientId?.()
      || '';
    const legacyPrefix = options.dayKeyPrefix || 'heys_dayv2_';
    return (dateKey, fallback = {}) => {
      if (!dateKey || !lsGet) return fallback;
      try {
        if (cid) {
          const scoped = lsGet('heys_' + cid + '_dayv2_' + dateKey, null);
          if (scoped != null) return scoped;
        }
        const v = lsGet(legacyPrefix + dateKey, null);
        return v != null ? v : fallback;
      } catch (_) {
        return fallback;
      }
    };
  };

  const hasAnyStepsFactEver = (readDay, anchorDate, maxDays = 90) => {
    const anchor = anchorDate instanceof Date && !Number.isNaN(anchorDate.getTime())
      ? new Date(anchorDate) : new Date();
    for (let i = 1; i <= maxDays; i++) {
      const d = new Date(anchor);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const dayData = readDay(key, {}) || {};
      if (dayData.steps !== null && dayData.steps !== undefined) return true;
    }
    return false;
  };

  /**
   * steps null → медиана 14 календарных дней (≥3 факта) или «нет данных»
   * @returns {{ steps: number, stepsEstimated: boolean, stepsMissing: boolean }}
   */
  const resolveStepsInput = (day, profile, options = {}) => {
    const d = day || {};
    const rawSteps = d.steps;

    if (rawSteps !== null && rawSteps !== undefined) {
      return {
        steps: Number(rawSteps) || 0,
        stepsEstimated: false,
        stepsMissing: false
      };
    }

    const lsGet = options.lsGet || storeGet;
    const readDay = typeof options.readDay === 'function'
      ? options.readDay
      : defaultReadDay(lsGet, { ...options, profile: profile || options.profile });
    const anchor = parseAnchorDate(d, options);
    const Steps = HEYS.Steps || {};
    const lookback = Steps.STEPS_HISTORY_LOOKBACK_DAYS || 14;
    const minDays = Steps.STEPS_HISTORY_MIN_DAYS || 3;
    const collect = Steps.collectRecentStepsHistory || (() => []);
    const medianFn = Steps.medianStepsValue || ((vals) => {
      if (!vals.length) return 0;
      const sorted = [...vals].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
    });

    if (!hasAnyStepsFactEver(readDay, anchor, 90)) {
      return { steps: 0, stepsEstimated: false, stepsMissing: true };
    }

    const history = collect(readDay, anchor, lookback);
    if (history.length < minDays) {
      return { steps: 0, stepsEstimated: false, stepsMissing: true };
    }

    return {
      steps: medianFn(history),
      stepsEstimated: true,
      stepsMissing: false
    };
  };

  /**
   * Назначенная куратором, но ещё не выполненная тренировка. Лежит в
   * `day.trainings` рядом с фактической — теми же полями и с теми же зонами,
   * поэтому без предиката план считался бы фактом и поднимал расход, оптимум и
   * калорийный долг так, будто человек уже отработал.
   *
   * Предикат канонический — `TK.load.isNotPerformedTraining`. Локальный фолбэк нужен
   * потому, что порядок загрузки модулей не гарантирован: TDEE считается и там,
   * где ядро нагрузки не подключено (тот же приём, что Runner fallback guard,
   * `_kernel/KERNEL_EXTRACTION_PLAN.md`). Расходиться им нельзя — условие одно.
   */
  const isNotPerformedTraining = (training) => {
    const TK = HEYS.TrainingKernel;
    return TK && TK.load && TK.load.isNotPerformedTraining
      ? TK.load.isNotPerformedTraining(training)
      : !!(training && training.plan && (training.plan.status === 'assigned' || training.plan.status === 'skipped'));
  };

  /**
   * Расчёт калорий от тренировки
   * @param {Object} training - { z: [min1, min2, min3, min4], type, time, plan }
   * @param {number} weight - Вес в кг
   * @param {number[]} mets - MET для каждой зоны [zone1, zone2, zone3, zone4]
   * @returns {number} ккал
   */
  const trainingKcal = (training, weight, mets = [2.5, 6, 8, 10]) => {
    if (!training || !training.z) return 0;
    // Назначенное — ещё не сделанное: план не даёт калорий, даже когда минуты по
    // зонам у него уже проставлены. Это единственный вход тренировок в весь
    // дневной расход (`calculateTDEE` зовёт только его), поэтому оптимум,
    // калорийный долг и серверная оценка нормы закрываются здесь же.
    if (isNotPerformedTraining(training)) return 0;
    // Нетто: минута в зоне стоит столько, на сколько она дороже покоя.
    const kcalMin = mets.map(m => netKcalPerMin(m, weight));
    return (training.z || [0, 0, 0, 0]).reduce((sum, min, i) =>
      sum + r0((+min || 0) * (kcalMin[i] || 0)), 0);
  };

  /**
   * Полный расчёт TDEE для дня
   * @param {Object} day - Данные дня { weightMorning, trainings, steps, householdMin, householdActivities, cycleDay, deficitPct }
   * @param {Object} profile - Профиль { weight, age, height, gender, deficitPctTarget }
   * @param {Object} options - { hrZones, includeNDTE, lsGet }
   * @returns {Object} { bmr, actTotal, trainingsKcal, stepsKcal, householdKcal, ndteBoost, tdee, optimum }
   */
  const calculateTDEE = (day, profile, options = {}) => {
    // 🛡️ Null-защита: day и profile могут быть null при инициализации
    const d = day || {};
    const prof = profile || {};

    const lsGet = options.lsGet || storeGet;

    // Вес: из дня или из профиля
    const weight = +d.weightMorning || +prof.weight || 70;

    // MET зоны
    const hrZones = options.hrZones || lsGet('heys_hr_zones', []);
    const zoneMets = hrZones.map(x => +x.MET || 0);
    const mets = [2.5, 6, 8, 10].map((def, i) => zoneMets[i] || def);

    // BMR
    const bmr = calcBMR(weight, prof);

    // Тренировки
    const trainings = (d.trainings && Array.isArray(d.trainings)) ? d.trainings : [];
    const train1k = trainingKcal(trainings[0], weight, mets);
    const train2k = trainingKcal(trainings[1], weight, mets);
    const train3k = trainingKcal(trainings[2], weight, mets);
    const trainingsKcal = train1k + train2k + train3k;

    const stepsResolved = resolveStepsInput(d, prof, options);
    const stepsK = stepsKcal(stepsResolved.steps, weight, prof);
    const stepsKForDebt = stepsResolved.stepsEstimated ? 0 : stepsK;

    // Бытовая активность
    const householdActivities = d.householdActivities ||
      (d.householdMin > 0 ? [{ minutes: d.householdMin }] : []);
    const totalHouseholdMin = householdActivities.reduce((sum, h) => sum + (+h.minutes || 0), 0);
    const householdKcal = r0(totalHouseholdMin * netKcalPerMin(2.5, weight));

    // Общая активность
    const actTotal = r0(trainingsKcal + stepsK + householdKcal);
    const actTotalForDebt = r0(trainingsKcal + stepsKForDebt + householdKcal);

    // 🔬 TEF v1.0.0: используем единый модуль HEYS.TEF с fallback
    let tefData = { total: 0, breakdown: { protein: 0, carbs: 0, fat: 0 } };
    if (HEYS.TEF) {
      if (options.dayMacros) {
        // Если макросы переданы явно
        tefData = HEYS.TEF.calculateFromMacros(options.dayMacros);
      } else if (d.meals && Array.isArray(d.meals) && options.pIndex) {
        // Расчёт из приёмов пищи через модуль
        const getProduct = (item) => options.pIndex?.byId?.get?.(String(item.product_id || item.id)?.toLowerCase());
        tefData = HEYS.TEF.calculateFromMeals(d.meals, options.pIndex, (item) => getProduct(item));
      }
    } else {
      // Fallback: inline расчёт если модуль не загружен (Westerterp 2004, Tappy 1996)
      let totalProt = 0, totalCarbs = 0, totalFat = 0;
      if (options.dayMacros) {
        totalProt = options.dayMacros.prot || options.dayMacros.protein || 0;
        totalCarbs = options.dayMacros.carbs || options.dayMacros.carbohydrates || 0;
        totalFat = options.dayMacros.fat || options.dayMacros.fats || 0;
      } else if (d.meals && Array.isArray(d.meals) && options.pIndex) {
        d.meals.forEach(meal => {
          (meal.items || []).forEach(item => {
            const g = item.grams || 0;
            const prod = options.pIndex?.byId?.get?.(String(item.product_id || item.id)?.toLowerCase());
            if (prod && g > 0) {
              totalProt += (prod.protein100 || 0) * g / 100;
              totalCarbs += ((prod.simple100 || 0) + (prod.complex100 || 0)) * g / 100;
              totalFat += ((prod.badFat100 || 0) + (prod.goodFat100 || 0) + (prod.trans100 || 0)) * g / 100;
            }
          });
        });
      }
      const proteinTEF = 0; // NET Atwater: TEF 25% built into 3 kcal/g coefficient
      const carbsTEF = Math.round(totalCarbs * 4 * 0.075);
      const fatTEF = Math.round(totalFat * 9 * 0.015);
      tefData = {
        total: proteinTEF + carbsTEF + fatTEF,
        breakdown: { protein: proteinTEF, carbs: carbsTEF, fat: fatTEF }
      };
    }
    const tefKcal = tefData.total || 0;

    // NDTE (Next-Day Training Effect) — буст от вчерашней тренировки
    let ndteBoost = 0;
    if (options.includeNDTE !== false && HEYS.InsulinWave?.calculateNDTEDayAverage && HEYS.InsulinWave?.getPreviousDayTrainings && d.date) {
      const prevTrainings = HEYS.InsulinWave.getPreviousDayTrainings(d.date, lsGet, weight);
      // 300, а не 200: сам `calculateNDTE` отбивает всё ниже 300 с v4.3
      // (heys_iw_constants.js, «порог поднят 200 → 300 kcal»), поэтому внешние
      // 200 ничего не пропускали — они лишь делали вид, что граница ниже.
      if (prevTrainings.totalKcal >= 300) {
        const heightM = (+prof.height || 170) / 100;
        const bmi = weight && heightM ? r0(weight / (heightM * heightM) * 10) / 10 : 22;
        const ndteData = HEYS.InsulinWave.calculateNDTEDayAverage({
          trainingKcal: prevTrainings.totalKcal,
          bmi,
          trainingType: prevTrainings.dominantType || 'cardio',
          trainingsCount: prevTrainings.trainings.length,
          dayDate: d.date,
          prevDate: prevTrainings.prevDate,
          trainingTime: prevTrainings.anchorTime,
        });
        ndteBoost = r0(bmr * ndteData.tdeeBoost);
      }
    }

    // baseExpenditure — без TEF, для расчёта optimum (норма не должна "догонять" съеденное)
    const baseExpenditure = r0(bmr + actTotal + ndteBoost);
    const baseExpenditureForDebt = r0(bmr + actTotalForDebt + ndteBoost);
    // TDEE — с TEF, для отображения фактических затрат
    const tdee = r0(baseExpenditure + tefKcal);

    // Целевой дефицит
    const profileTargetDef = +prof.deficitPctTarget || 0;
    const dayTargetDef = (d.deficitPct !== '' && d.deficitPct != null)
      ? +d.deficitPct
      : profileTargetDef;

    // Коррекция на менструальный цикл (v4: count day 1…28)
    const cycleCountDay = HEYS.Cycle?.resolveCycleCountDay?.({
      date: d.date,
      cycleDay: d.cycleDay,
      lsGet
    }) ?? null;
    const cycleKcalMultiplier = HEYS.Cycle?.getKcalMultiplier?.(cycleCountDay) || 1;
    // Optimum рассчитывается от baseExpenditure (без TEF)
    const baseOptimum = r0(baseExpenditure * (1 + dayTargetDef / 100));
    const optimum = r0(baseOptimum * cycleKcalMultiplier);
    const baseOptimumForDebt = r0(baseExpenditureForDebt * (1 + dayTargetDef / 100) * cycleKcalMultiplier);

    const warnings = [];
    if (optimum > 0 && optimum < bmr) warnings.push('optimumBelowBmr');

    return {
      bmr,
      actTotal,
      actTotalForDebt,
      trainingsKcal,
      train1k,
      train2k,
      train3k,
      stepsKcal: stepsK,
      stepsKcalForDebt: stepsKForDebt,
      steps: stepsResolved.steps,
      stepsEstimated: stepsResolved.stepsEstimated,
      stepsMissing: stepsResolved.stepsMissing,
      householdKcal,
      totalHouseholdMin,  // 🆕 v1.1.2: Минуты для UI
      ndteBoost,
      ndteData: ndteBoost > 0 ? { active: true, tdeeBoost: ndteBoost / bmr } : { active: false, tdeeBoost: 0 }, // 🆕 v1.1.0
      tefKcal,             // 🆕 v3.9.1: TEF
      tefData,             // 🆕 v1.1.1: Full TEF data with breakdown
      baseExpenditure,     // 🆕 v3.9.1: без TEF (для optimum)
      baseExpenditureForDebt,
      tdee,                // с TEF (для UI)
      optimum,
      baseOptimumForDebt,
      warnings,
      weight,
      mets,                // 🆕 v1.1.0: MET зоны для UI
      // Нетто, как и в самом расчёте — иначе подпись под зоной противоречила бы итогу.
      kcalMin: mets.map(m => netKcalPerMin(m, weight)),
      deficitPct: dayTargetDef,
      cycleMultiplier: cycleKcalMultiplier
    };
  };

  /**
   * Быстрый расчёт только TDEE (затрат) для дня
   * @param {Object} day - Данные дня
   * @param {Object} profile - Профиль
   * @param {Object} options - Опции
   * @returns {number} TDEE в ккал
   */
  const getTDEE = (day, profile, options = {}) => {
    return calculateTDEE(day, profile, options).tdee;
  };

  /**
   * Норма калорий и белка по профилю — единый источник вместо `profile.optimum`,
   * `profile.norm.kcal/prot`, `profile.tdee`, `profile.protTarget` и
   * `profile.waterTarget`, которых в объекте профиля никогда не было (аудит
   * DERIVED_FIELDS_AUDIT_2026-08-02.md, класс «поле-призрак»): эти чтения
   * молча падали в жёсткие дефолты 2000 ккал / 100 г для любого клиента.
   *
   * Формула — уже проверенный в проде safety-net-паттерн
   * (heys_relapse_risk_v1.js: normAbs, до этой правки продублированный
   * копипастой в трёх файлах): белок — 1.6 г/кг веса, калории — `optimum` из
   * TDEE. `day` необязателен — без него `calculateTDEE` считает по одному
   * профилю (тот же деградированный, но не выдуманный путь, что уже был в
   * проде), поэтому вызывать можно и там, где дня нет в скоупе.
   *
   * @param {Object} profile
   * @param {Object} [day]
   * @returns {{ kcal: number, prot: number }}
   */
  const resolveDailyTargets = (profile, day) => {
    const tdeeResult = calculateTDEE(day || {}, profile || {});
    const kcal = tdeeResult && tdeeResult.optimum > 0 ? tdeeResult.optimum : 2000;
    const weightRaw = Number(profile && profile.weight) || Number(profile && profile.baseWeight) || 70;
    if (HEYS.dayCalculations && typeof HEYS.dayCalculations.computeDisplayNorms === 'function') {
      try {
        const { normAbs } = HEYS.dayCalculations.computeDisplayNorms({
          displayOptimum: kcal,
          profile: profile || {},
          day: day || {},
          tdeeResult
        });
        if (normAbs && normAbs.prot > 0) {
          return { kcal, prot: normAbs.prot };
        }
      } catch (_) { /* fallback */ }
    }
    return { kcal, prot: Math.round(weightRaw * 1.6) };
  };

  /**
   * Расчёт TDEE для массива дней (для недельной/месячной статистики)
   * @param {string[]} dates - Массив дат в формате YYYY-MM-DD
   * @param {Object} profile - Профиль
   * @param {Object} options - { lsGet }
   * @returns {Object} { totalBurned, totalTarget, days: [...] }
   */
  const calculateWeekTDEE = (dates, profile, options = {}) => {
    const lsGet = options.lsGet || storeGet;

    let totalBurned = 0;
    let totalTarget = 0;
    const days = [];

    dates.forEach(dateStr => {
      const dayData = lsGet('heys_dayv2_' + dateStr, null);
      if (dayData) {
        const result = calculateTDEE(dayData, profile, { ...options, lsGet });
        totalBurned += result.tdee;
        totalTarget += result.optimum;
        days.push({
          date: dateStr,
          ...result
        });
      }
    });

    return {
      totalBurned,
      totalTarget,
      days,
      avgTDEE: days.length > 0 ? r0(totalBurned / days.length) : 0,
      avgTarget: days.length > 0 ? r0(totalTarget / days.length) : 0
    };
  };

  // === Экспорт ===
  HEYS.TDEE = {
    VERSION: '1.1.0',

    // Основные функции
    calculate: calculateTDEE,
    getTDEE,
    resolveDailyTargets,
    calculateWeek: calculateWeekTDEE,

    // Вспомогательные (для обратной совместимости)
    calcBMR,
    stepsKcal,
    resolveStepsInput,
    hasAnyStepsFactEver,
    trainingKcal,
    kcalPerMin,
    // Для тех, кто собирает расход по частям (heys_day_utils.getActiveDaysForMonth):
    // активность добавляется только НАД покоем, иначе один MET считается дважды.
    netKcalPerMin,
    ageFromProfile
  };

  // Для отладки
  if (typeof window !== 'undefined') {
    window.debugTDEE = (date) => {
      const prof = storeGet('heys_profile', {});
      const day = storeGet('heys_dayv2_' + date, {});
      console.table(calculateTDEE(day, prof));
    };
  }

})(typeof window !== 'undefined' ? window : global);
