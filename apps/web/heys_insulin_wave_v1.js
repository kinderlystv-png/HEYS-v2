// heys_insulin_wave_v1.js — Модуль инсулиновой волны (Orchestrator)
// Версия: 4.2.2 | Дата: 2026-01-12
//
// РЕФАКТОРИНГ v4.2.1:
// Улучшенная структура с вспомогательным модулем:
// - heys_iw_orchestrator.js (241 строка) - вспомогательные функции
// - Добавлена JSDoc документация
// - Упрощённая секция экспорта
//
// Код разбит на 8 специализированных модулей:
// - heys_iw_constants.js (3144 строк) - константы и конфигурации
// - heys_iw_calc.js (703 строки) - расчётные функции
// - heys_iw_v30.js (387 строк) - v3.0 фичи (Continuous GL, Personal Baseline)
// - heys_iw_v41.js (474 строки) - v4.1 фичи (Metabolic Flexibility, Satiety)
// - heys_iw_ui.js (1617 строк) - React UI компоненты
// - heys_iw_graph.js (292 строки) - SVG график волны
// - heys_iw_lipolysis.js (186 строк) - рекорды липолиза
// - heys_iw_ndte.js (162 строки) - NDTE Badge UI
//
// Этот файл содержит только главную оркестрационную логику.
// Научная база: Brand-Miller 2003, Holt 1997, Van Cauter 1997, Colberg 2010

(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;

  // === ИМПОРТ ИЗ МОДУЛЕЙ ===

  // Константы (из heys_iw_constants.js)
  const I = HEYS.InsulinWave?.__internals;
  const GI_CATEGORIES = I?.GI_CATEGORIES;
  const STATUS_CONFIG = I?.STATUS_CONFIG;
  const calculateActivityContext = I?.calculateActivityContext;

  // Функции расчёта бонусов (из heys_iw_constants.js → __internals)
  const calculateFastingBonus = I?.calculateFastingBonus;
  const calculateStressBonus = I?.calculateStressBonus;
  const calculateSleepBonus = I?.calculateSleepBonus;
  const calculateSleepQualityBonus = I?.calculateSleepQualityBonus;
  const calculateHydrationBonus = I?.calculateHydrationBonus;
  const calculateAgeBonus = I?.calculateAgeBonus;
  const calculateBMIBonus = I?.calculateBMIBonus;
  const getGenderBonus = I?.getGenderBonus;
  const calculateTransFatBonus = I?.calculateTransFatBonus;
  const calculateLargePortionBonus = I?.calculateLargePortionBonus;
  const calculateIRScore = I?.calculateIRScore;
  const calculateNDTE = I?.calculateNDTE;
  const getPreviousDayTrainings = I?.getPreviousDayTrainings;
  const detectFoodTemperature = I?.detectFoodTemperature;
  const getHypoglycemiaWarning = I?.getHypoglycemiaWarning;
  const getInsulinIndexWaveModifier = I?.getInsulinIndexWaveModifier;

  // Helper-функции (из heys_iw_constants.js → __internals)
  const getFoodForm = I?.getFoodForm;
  const hasResistantStarch = I?.hasResistantStarch;
  const getAlcoholBonus = I?.getAlcoholBonus;
  const getInsulinogenicBonus = I?.getInsulinogenicBonus;
  const getAutophagyPhase = I?.getAutophagyPhase;
  const getSupplementsBonus = I?.getSupplementsBonus;
  const getColdExposureBonus = I?.getColdExposureBonus;

  // Константы-объекты (из heys_iw_constants.js → __internals)
  const SPICY_FOOD = I?.SPICY_FOOD;
  const CAFFEINE_BONUS = I?.CAFFEINE_BONUS;
  const PERSONAL_BASELINE = I?.PERSONAL_BASELINE;
  const GAP_HISTORY_KEY = I?.GAP_HISTORY_KEY;
  const GAP_HISTORY_DAYS = I?.GAP_HISTORY_DAYS;

  // Утилиты (из heys_iw_utils.js)
  const utils = HEYS.InsulinWave?.utils;

  // Расчёты (из heys_iw_calc.js)
  const Calc = HEYS.InsulinWave?.Calc;
  const calculateMealNutrients = Calc?.calculateMealNutrients;
  const calculateMultiplier = Calc?.calculateMultiplier;
  const calculateWorkoutBonus = Calc?.calculateWorkoutBonus;
  const calculatePostprandialExerciseBonus = Calc?.calculatePostprandialExerciseBonus;
  const calculateNEATBonus = Calc?.calculateNEATBonus;
  const calculateStepsBonus = Calc?.calculateStepsBonus;
  const calculateCircadianMultiplier = Calc?.calculateCircadianMultiplier;
  const calculateDayFactorsForMeal = Calc?.calculateDayFactorsForMeal;
  const calculateActivityFactorsForMeal = Calc?.calculateActivityFactorsForMeal;

  // v3.0 фичи (из heys_iw_v30.js)
  const V30 = HEYS.InsulinWave?.V30;
  const calculateContinuousGLMultiplier = V30?.calculateContinuousGLMultiplier;
  const calculatePersonalBaselineWave = V30?.calculatePersonalBaselineWave;
  const calculateMealStackingBonus = V30?.calculateMealStackingBonus;
  const calculateWavePhases = V30?.calculateWavePhases;
  const calculateInsulinIndex = V30?.calculateInsulinIndex;

  // v4.1 фичи (из heys_iw_v41.js)
  const V41 = HEYS.InsulinWave?.V41;

  // Lipolysis (из heys_iw_lipolysis.js)
  const Lipolysis = HEYS.InsulinWave?.Lipolysis;
  const updateLipolysisRecord = Lipolysis?.updateLipolysisRecord;
  const getLipolysisRecord = Lipolysis?.getLipolysisRecord;
  const calculateLipolysisStreak = Lipolysis?.calculateLipolysisStreak;
  const calculateLipolysisKcal = Lipolysis?.calculateLipolysisKcal;

  // Graph (generateWaveCurve)
  const generateWaveCurve = I?.generateWaveCurve;

  // UI компоненты (из heys_iw_ui.js, heys_iw_graph.js, heys_iw_ndte.js)
  const UI = HEYS.InsulinWave?.UI;
  const Graph = HEYS.InsulinWave?.Graph;
  const NDTE_UI = HEYS.InsulinWave?.NDTE;

  /**
   * Расчёт данных инсулиновой волны
   * 
   * @param {Object} params - параметры расчёта
   * @param {Array} params.meals - массив приёмов пищи
   * @param {Object} params.pIndex - индекс продуктов
   * @param {Function} params.getProductFromItem - функция получения продукта из айтема
   * @param {number} [params.baseWaveHours=3] - базовая длина волны в часах
   * @param {Array} [params.trainings=[]] - массив тренировок дня
   * @param {Object} [params.dayData={}] - данные дня (профиль, активность, сон и т.д.)
   * @param {Date} [params.now=new Date()] - текущее время для расчётов
   * @returns {Object|null} данные инсулиновой волны или null если нет данных
   */
  const calculateInsulinWaveData = ({
    meals,
    pIndex,
    getProductFromItem,
    baseWaveHours = 3,
    trainings = [],
    dayData = {},
    now = new Date()
  }) => {
    if (!meals || meals.length === 0) return null;

    // Фильтруем приёмы с временем
    const mealsWithTime = meals.filter(m => m.time);
    if (mealsWithTime.length === 0) return null;

    // 🆕 v3.0.0: Персональная базовая волна на основе профиля
    // Вместо фиксированных 3 часов — учитываем возраст, BMI, пол
    const profile = dayData.profile || {};
    const personalBaseline = calculatePersonalBaselineWave(profile);
    // Используем персональную базу, если профиль есть И baseHours валидный, иначе переданный baseWaveHours
    let effectiveBaseWaveHours = baseWaveHours;
    if (profile.age && personalBaseline.baseHours && !isNaN(personalBaseline.baseHours)) {
      effectiveBaseWaveHours = personalBaseline.baseHours;
    }
    // Fallback на 3 часа если всё ещё undefined/NaN
    if (!effectiveBaseWaveHours || isNaN(effectiveBaseWaveHours)) {
      effectiveBaseWaveHours = 3;
    }

    // 🆕 v4.0.0: IR Score — объединённый показатель инсулинорезистентности
    // Комбинирует BMI, сон, стресс, возраст в единый мультипликатор
    const irScore = I?.calculateIRScore(profile, dayData);
    const irScoreMultiplier = irScore?.waveMultiplier || 1.0;

    // Сортируем по времени (последний первый)
    const sorted = [...mealsWithTime].sort((a, b) => {
      const timeA = (a.time || '').replace(':', '');
      const timeB = (b.time || '').replace(':', '');
      return timeB.localeCompare(timeA);
    });

    const lastMeal = sorted[0];
    const lastMealTime = lastMeal?.time;
    if (!lastMealTime) return null;

    // 🆕 v3.0.0: Meal Stacking — если есть предыдущий приём, считаем бонус за наложение
    let mealStackingResult = { bonus: 0, desc: null, hasStacking: false };
    if (sorted.length >= 2) {
      const prevMeal = sorted[1];
      const prevNutrients = calculateMealNutrients(prevMeal, pIndex, getProductFromItem);
      const prevWaveEnd = utils.timeToMinutes(prevMeal.time) + (effectiveBaseWaveHours * 60); // Примерное время конца
      const currentMealTime = utils.timeToMinutes(lastMealTime);
      mealStackingResult = calculateMealStackingBonus(prevWaveEnd, currentMealTime, prevNutrients.glycemicLoad);
    }

    // Расчёт нутриентов последнего приёма
    const nutrients = calculateMealNutrients(lastMeal, pIndex, getProductFromItem);

    // 🍎 v3.2.0: Определяем форму пищи (liquid/processed/whole)
    // Приоритет: liquid > processed > whole (берём "худшее" для волны)
    let mealFoodForm = null;
    let hasResistantStarchInMeal = false;
    for (const item of (lastMeal.items || [])) {
      const prod = getProductFromItem(item, pIndex);
      const itemForm = getFoodForm(prod);
      // Приоритет: liquid (1.30) > processed (1.15) > whole (0.85)
      if (itemForm === 'liquid') mealFoodForm = 'liquid';
      else if (itemForm === 'processed' && mealFoodForm !== 'liquid') mealFoodForm = 'processed';
      else if (itemForm === 'whole' && !mealFoodForm) mealFoodForm = 'whole';

      // 🥔 Resistant starch
      if (hasResistantStarch(prod)) hasResistantStarchInMeal = true;
    }

    // R4-7: kcal приёма = P*4 + C*4 + F*9 для kcalScaleMult в multiplier
    const _mealKcal = (nutrients.totalProtein || 0) * 4 + (nutrients.totalCarbs || 0) * 4 + (nutrients.totalFat || 0) * 9;
    const multipliers = calculateMultiplier(
      nutrients.avgGI,
      nutrients.totalProtein,
      nutrients.totalFiber,
      nutrients.totalCarbs,
      nutrients.totalFat,
      nutrients.glycemicLoad,
      nutrients.hasLiquid,
      nutrients.insulinogenicBonus,
      mealFoodForm,  // 🆕 v3.2.0
      nutrients.dominantProteinType || 'mixed', // 🆕 v4.2.3: реальный тип белка
      nutrients.simpleRatio, // R4-7: укорачивает волну при >60%
      _mealKcal              // R4-7: маленькие приёмы → короче волна
    );

    // 🏃 Workout бонус (общий за день)
    const workoutBonus = calculateWorkoutBonus(trainings);

    // 🌅 Circadian ритм (по времени приёма пищи)
    const mealHour = parseInt(lastMealTime.split(':')[0]) || 12;
    const circadian = calculateCircadianMultiplier(mealHour);

    // 🆕 v1.5: Постпрандиальная тренировка (ПОСЛЕ еды) — научный подход
    const mealMinutesForPostprandial = utils.timeToMinutes(lastMealTime);
    const postprandialBonus = calculatePostprandialExerciseBonus(trainings, mealMinutesForPostprandial);

    // 🆕 v3.4.0: Activity Context — ЗАМЕНЯЕТ старые workout/postprandial бонусы
    // Определяем контекст тренировки для текущего приёма
    const activityContext = calculateActivityContext({
      mealTimeMin: mealMinutesForPostprandial,
      trainings,
      steps: dayData.steps || 0,
      householdMin: dayData.householdMin || 0, // 🆕 v3.5.5: бытовая активность
      weight: dayData.profile?.weight || 70,
      allMeals: sorted,
      mealNutrients: {
        prot: nutrients.totalProtein,
        carbs: nutrients.totalCarbs,
        simple: nutrients.totalSimple || 0
      },
      mealKcal: nutrients.totalKcal || 0
    });

    // 🆕 v1.5: NEAT — бытовая активность
    const householdMinutes = dayData.householdMin || 0;
    const neatBonus = calculateNEATBonus(householdMinutes);

    // 🆕 v1.5: Шаги
    const steps = dayData.steps || 0;
    const stepsBonus = calculateStepsBonus(steps);

    // 🆕 v1.4: Новые факторы

    // 🍽️ Голодание — сколько часов до последнего приёма
    let fastingHours = 0;
    let fastingBonus = 0;
    if (sorted.length >= 2) {
      // Есть предыдущий приём — считаем разницу
      const prevMeal = sorted[1];
      const prevMealMinutes = utils.timeToMinutes(prevMeal.time);
      const lastMealMinutes = utils.timeToMinutes(lastMealTime);
      let gapMinutes = lastMealMinutes - prevMealMinutes;
      // Если перешли через полночь
      if (gapMinutes < 0) gapMinutes += 24 * 60;
      fastingHours = gapMinutes / 60;
    } else {
      // Первый приём за день — считаем от последнего приёма вчера (упрощённо 12ч)
      // Если первый приём до полудня, вероятно голодание было ночью ~8-12ч
      if (mealHour <= 12) {
        fastingHours = mealHour + 8; // Примерно с 22:00-00:00 вчера
      }
    }
    fastingBonus = calculateFastingBonus(fastingHours);

    // 🌶️ Острая пища
    const spicyMultiplier = nutrients.hasSpicy ? SPICY_FOOD.multiplier : 1.0;

    // 🍷 Алкоголь
    const alcoholBonus = nutrients.alcoholBonus || 0;

    // ☕ Кофеин
    const caffeineBonus = nutrients.hasCaffeine ? CAFFEINE_BONUS.bonus : 0;

    // 😰 Стресс (из данных дня)
    const stressLevel = dayData.stressAvg || 0;
    const stressBonus = calculateStressBonus(stressLevel);

    // 😴 Недосып (из данных дня)
    const sleepHours = dayData.sleepHours;
    const sleepBonus = calculateSleepBonus(sleepHours);

    // 🆕 v2.0: Новые факторы на основе научного аудита

    // 🌟 Качество сна (Tasali 2008)
    const sleepQuality = dayData.sleepQuality || 0;
    const sleepQualityBonus = calculateSleepQualityBonus(sleepQuality);

    // 💧 Гидратация (Carroll 2016) — нужен профиль для веса
    const waterMl = dayData.waterMl || 0;
    const userWeight = dayData.profile?.weight || 70;
    const hydrationBonus = calculateHydrationBonus(waterMl, userWeight);

    // 👴 Возраст (DeFronzo 1979)
    const age = dayData.profile?.age || 0;
    const ageBonus = calculateAgeBonus(age);

    // 🏋️ BMI (Kahn & Flier 2000)
    const weight = dayData.profile?.weight || 0;
    const height = dayData.profile?.height || 0;
    const bmiBonus = calculateBMIBonus(weight, height);

    // 🚺🚹 Пол (Nuutila 1995)
    const gender = dayData.profile?.gender || '';
    const genderBonus = getGenderBonus(gender);

    // 🍟 Транс-жиры (Salmerón 2001)
    const transFat = nutrients.totalTrans || 0;
    const transFatBonus = calculateTransFatBonus(transFat);

    // 🌸 Менструальный цикл (Davidsen 2007)
    // Инсулиновая чувствительность снижается в лютеиновую фазу и менструацию
    const cycleDay = dayData.cycleDay || null;
    const cycleBonus = HEYS.Cycle?.getInsulinWaveMultiplier?.(cycleDay) || 1;
    // Преобразуем множитель в бонус (1.12 → +0.12)
    const cycleBonusValue = cycleBonus > 1 ? (cycleBonus - 1) : 0;

    // 🔬 НАУЧНЫЙ АУДИТ 2025-12-09 v2: GL-скалирование всех дневных факторов
    // При низкой GL дневные факторы применяются частично
    // КЛЮЧЕВАЯ КОРРЕКЦИЯ: усилено ослабление циркадного множителя при GL < 10
    // 🔧 FIX v3.8.3: Добавлена проверка на NaN + isFinite
    const gl = nutrients.glycemicLoad;
    let dayFactorsScale = 1.0;
    let circadianScale = 1.0;

    // GL-скалирование: при низкой GL (< 20) факторы применяются частично
    // NaN или undefined → пропускаем скалирование (используем полные факторы)
    if (gl != null && isFinite(gl) && gl < 20) {
      // Формула: 0.3 + (GL/20) * 0.7 
      // GL=0 → 0.3, GL=10 → 0.65, GL=20 → 1.0
      dayFactorsScale = Math.max(0.3, 0.3 + (gl / 20) * 0.7);

      // Циркадные ритмы — БОЛЕЕ АГРЕССИВНОЕ ослабление при низкой GL
      // При GL=7 ночной множитель ×1.2 не должен сильно влиять
      // Формула: 0.2 + (GL/20) * 0.8 → GL=7: 0.48, GL=10: 0.6, GL=20: 1.0
      circadianScale = Math.max(0.2, 0.2 + (gl / 20) * 0.8);

    }

    // 🆕 v4.2.3: Убираем агрессивный double-count low-GL
    // GL уже сильно влияет через continuous glMultiplier в calculateMultiplier().
    // Здесь скалируем базу только в micro/very-low зоне (GL < 10) и мягко.
    if (gl != null && isFinite(gl) && gl < 10) {
      const baseScaleFactor = Math.max(0.85, 0.85 + (gl / 10) * 0.15);
      effectiveBaseWaveHours = effectiveBaseWaveHours * baseScaleFactor;
    }

    // 🆕 v3.8.5: Simple Ratio Modifier — соотношение простых/сложных углеводов
    // Научное обоснование: простые углеводы (сахар) дают быстрый пик и короткую волну
    // Сложные углеводы (крахмал) — медленный пик, длинная волна
    // При >70% сахара волна укорачивается на 5-10%
    const simpleRatio = nutrients.simpleRatio || 0;
    let simpleRatioMultiplier = 1.0;
    if (simpleRatio > 0.7) {
      // >70% простых = быстрое всасывание = короче волна (−10%)
      simpleRatioMultiplier = 0.90;
    } else if (simpleRatio > 0.5) {
      // 50-70% простых = умеренно короче (−5%)
      simpleRatioMultiplier = 0.95;
    } else if (simpleRatio < 0.2 && nutrients.totalCarbs > 20) {
      // <20% простых + много углеводов = медленное всасывание = длиннее волна (+5%)
      simpleRatioMultiplier = 1.05;
    }

    // Финальный множитель: все факторы
    // multipliers.total уже включает GI + protein + fiber + fat + liquid + insulinogenic (со скалированием внутри)
    // Добавляем все бонусы (отрицательные = укорачивают волну):
    // - 🆕 v3.4.0: activityContext заменяет workout + postprandial (когда есть)
    // - fasting, alcohol, caffeine, stress, sleep — другие факторы
    // - 🆕 v2.0: sleepQuality, hydration, age, bmi, gender, transFat, cycle
    // - 🆕 v3.0.0: meal stacking bonus
    // ⚠️ ВАЖНО: age, bmi, gender уже учтены в effectiveBaseWaveHours (v3.0.0 Personal Baseline)
    // Поэтому НЕ добавляем их повторно в personalBonuses!

    // 🆕 v3.4.0: Если есть activityContext — используем его вместо старых бонусов
    // ActivityContext объединяет: peri-workout, post-workout, pre-workout, steps, morning, double
    let activityBonuses;
    if (activityContext && activityContext.waveBonus) {
      // Используем новый контекст (приоритизированный, с учётом типа тренировки)
      // NEAT и steps оставляем как фоновые бонусы (они stackаются)
      activityBonuses = (activityContext.waveBonus + neatBonus.bonus) * dayFactorsScale;
    } else {
      // Fallback на старую логику (если нет контекста)
      activityBonuses = (workoutBonus.bonus + postprandialBonus.bonus + neatBonus.bonus + stepsBonus.bonus) * dayFactorsScale;
    }

    const metabolicBonuses = (fastingBonus + alcoholBonus + caffeineBonus + stressBonus + sleepBonus) * dayFactorsScale;
    // 🆕 v3.0.0: Убраны ageBonus, bmiBonus, genderBonus — они уже в персональной базе
    const personalBonuses = (sleepQualityBonus + hydrationBonus + transFatBonus + cycleBonusValue) * dayFactorsScale;
    // 🆕 v3.0.0: Meal Stacking — если приём был слишком близко к предыдущему, волны "накладываются"
    const mealStackingBonus = (mealStackingResult.stackBonus || 0) * dayFactorsScale;

    // 🥔 v3.2.0: Resistant starch — охлаждённые крахмалы укорачивают волну
    const resistantStarchBonus = hasResistantStarchInMeal ? RESISTANT_STARCH_BONUS.cooled : 0;

    // 🌡️ v3.8.0: Температура пищи — горячее/холодное влияет на скорость усвоения
    const foodTemperature = detectFoodTemperature(lastMeal.items || [], (item) => getProductFromItem(item, pIndex));
    const temperatureBonus = foodTemperature.bonus || 0;

    // 🍽️ v3.8.0: Большие порции — нелинейное замедление пищеварения
    const mealKcal = nutrients.totalKcal || 0;
    const largePortionBonus = calculateLargePortionBonus(mealKcal);

    // ⚡ v3.8.0: Риск реактивной гипогликемии — для UI предупреждения
    const hypoglycemiaRisk = getHypoglycemiaWarning({
      gi: nutrients.avgGI,
      protein: nutrients.totalProtein,
      fat: nutrients.totalFat,
      isFasted: sorted.length <= 1  // Первый приём за день = натощак
    });

    // 🥛 v3.8.0: Insulin Index Wave Modifier — молочка = короче волна
    const insulinIndexModifier = getInsulinIndexWaveModifier(nutrients.insulinogenicType);

    // 🧊 v3.2.0: Холодовое воздействие — улучшает инсулиновую чувствительность
    const coldExposureResult = getColdExposureBonus(dayData);
    const coldExposureBonus = coldExposureResult.bonus || 0;

    // 🧪 v3.2.0: Добавки (уксус, корица, берберин) — снижают инсулиновый ответ
    const supplementsResult = getSupplementsBonus(lastMeal);
    const supplementsBonusValue = supplementsResult.bonus || 0;

    // 🔄 v3.2.0: Аутофагия — длительное голодание улучшает чувствительность
    const autophagyResult = getAutophagyPhase(fastingHours);
    const autophagyBonus = -(autophagyResult.bonus || 0); // Отрицательный = короче волна

    // 🆕 v3.4.0: Harm multiplier от activityContext (для уменьшения вредности при тренировке)
    const activityHarmMultiplier = activityContext?.harmMultiplier || 1.0;

    // 🆕 v3.6.0: Next-Day Training Effect (NDTE) — эффект вчерашней тренировки
    // Научное обоснование: Mikines 1988, Magkos 2008 — улучшенная инсулиновая чувствительность 12-48ч
    let ndteResult = { active: false, waveReduction: 0, peakReduction: 0 };
    if (dayData.date && dayData.lsGet) {
      const prevTrainings = getPreviousDayTrainings(dayData.date, dayData.lsGet);
      if (prevTrainings.totalKcal >= 200) {
        const heightM = (+profile.height || 170) / 100;
        const userBmi = (profile.weight && heightM) ? profile.weight / (heightM * heightM) : 22;
        ndteResult = calculateNDTE({
          trainingKcal: prevTrainings.totalKcal,
          hoursSince: prevTrainings.hoursSince,
          bmi: userBmi,
          trainingType: prevTrainings.dominantType || 'cardio',
          trainingsCount: prevTrainings.trainings.length
        });
      }
    }
    // NDTE как отдельный множитель (1 - waveReduction)
    const ndteMultiplier = ndteResult.active ? (1 - ndteResult.waveReduction) : 1.0;

    const allBonuses = activityBonuses + metabolicBonuses + personalBonuses + mealStackingBonus + resistantStarchBonus + coldExposureBonus + supplementsBonusValue + autophagyBonus + temperatureBonus + largePortionBonus.bonus;

    // Циркадный множитель: приближаем к 1.0 при низкой GL
    // 🆕 v3.4.0: Если activityContext с nightPenaltyOverride — не применяем ночной штраф
    let scaledCircadian = 1.0 + (circadian.multiplier - 1.0) * circadianScale;
    if (activityContext?.nightPenaltyOverride && circadian.multiplier > 1.0) {
      // Ночная тренировка → ночной штраф отменён
      scaledCircadian = 1.0;
    }

    // 🆕 v3.5.2: ИСПРАВЛЕНИЕ — activityBonuses применяется как МНОЖИТЕЛЬ, не сумма!
    // 
    // ПРОБЛЕМА v3.5.1: activityBonuses = -0.70 складывался с multipliersTotal = 1.35
    // Результат: 1.35 + (-0.70) = 0.65 → волна сокращалась только на 35%
    // 
    // ИСПРАВЛЕНИЕ: Тренировка должна сокращать волну НЕЗАВИСИМО от состава еды!
    // Жиры/белок увеличивают волну (еда дольше переваривается)
    // Но тренировка НАПРЯМУЮ ускоряет утилизацию глюкозы через GLUT4
    // 
    // Новая формула:
    // 1) foodMultiplier = multipliers.total + otherBonuses (еда + метаболизм)
    // 2) activityMultiplier = 1 + activityBonuses (тренировка как отдельный множитель)
    // 3) finalMultiplier = foodMultiplier × activityMultiplier × circadian

    // Разделяем бонусы: еда/метаболизм vs активность
    // 🆕 v3.8.0: Добавлены temperatureBonus и largePortionBonus
    const otherBonuses = metabolicBonuses + personalBonuses + mealStackingBonus + resistantStarchBonus + coldExposureBonus + supplementsBonusValue + autophagyBonus + temperatureBonus + largePortionBonus.bonus;
    const foodMultiplier = multipliers.total + otherBonuses;
    // v4.3 (2026-05-13): waveMultiplier инвертирован к >1.0 для молочки.
    // До v4.3 был <1.0 (волна короче), что противоречило литературе:
    // Toffolon 2021 (PMID 34618402): молочный напиток держит инсулин 240 мин.
    // Henry 2024 (PMID 39019167): молочный белок к углеводам +64% инсулин AUC.
    // Костыль liquidDairyCompensation=1.08 (v4.2.3) удалён — он гасил двойной
    // штраф между liquid 0.75 и устаревшим dairy 0.85; после инверсии не нужен.
    const insulinIndexWaveMult = insulinIndexModifier.waveMultiplier || 1.0;
    const activityMultiplier = Math.max(0.1, 1.0 + activityBonuses); // min 10% от волны

    // 🆕 v3.6.0: NDTE применяется как отдельный множитель (независимо от состава еды)
    // 🆕 v3.8.5: Simple Ratio Mult — сахар = быстрее пик, короче волна
    // 🆕 v4.0.0: IR Score — объединённый мультипликатор инсулинорезистентности
    let finalMultiplier = foodMultiplier * activityMultiplier * ndteMultiplier * scaledCircadian * spicyMultiplier * insulinIndexWaveMult * simpleRatioMultiplier * irScoreMultiplier;

    // 🔬 v3.7.5: Физиологический лимит — волна не может быть больше ×1.5 от базы
    // Научное обоснование: реальные исследования показывают что даже при
    // максимальных факторах волна редко превышает 4-4.5 часа (×1.5 от базы 3ч)
    // Brand-Miller 2003: High-GL meal ≈ 3-4 часа инсулинового ответа
    const MAX_MULTIPLIER = 1.50;
    if (finalMultiplier > MAX_MULTIPLIER) {
      finalMultiplier = MAX_MULTIPLIER;
    }

    // 🆕 v3.0.0: Используем персональную базу вместо фиксированных 3 часов
    // Скорректированная длина волны
    let adjustedWaveHours = effectiveBaseWaveHours * finalMultiplier;
    // Защита от NaN
    if (isNaN(adjustedWaveHours) || adjustedWaveHours <= 0) {
      adjustedWaveHours = effectiveBaseWaveHours || 3;
    }
    let waveMinutes = adjustedWaveHours * 60;

    // 🆕 v3.0.0: Фазы волны (подъём, плато, спад)
    const hasRecentActivity = activityBonuses < -0.05; // Была какая-то активность
    const wavePhases = calculateWavePhases(waveMinutes, nutrients, hasRecentActivity);

    // Время
    // mealMinutes может быть 24:xx (1440+) для ночных приёмов "сегодня до 3 ночи"
    const mealMinutes = utils.timeToMinutes(lastMealTime);
    let nowMinutes = now.getHours() * 60 + now.getMinutes();

    // Корректировка для перехода через полночь:
    // Если приём был в 24:xx формате (ночной) и сейчас 00:xx-02:xx → добавляем 24ч к now
    if (mealMinutes >= 24 * 60 && nowMinutes < 3 * 60) {
      nowMinutes += 24 * 60;
    }

    let diffMinutes = nowMinutes - mealMinutes;

    // 🔧 FIX v3.9.2: Если diffMinutes < 0, значит перешли через полночь
    // Пример: приём 16:45 (1005 мин), сейчас 02:00 (120 мин) → diff = -885
    // Нужно добавить 24 часа (1440 мин) к now: 120 + 1440 - 1005 = 555 мин (~9.25ч) ✅
    if (diffMinutes < 0) {
      diffMinutes += 24 * 60; // Добавляем 24 часа
    }

    // Защита от отрицательных значений (не должно случиться после фикса)
    if (diffMinutes < 0) diffMinutes = 0;

    // 🆕 v3.7.4: Текущее время голодания (с момента последнего приёма до сейчас)
    // Отличается от fastingHours (время ДО последнего приёма, для бонуса)
    const currentFastingHours = diffMinutes / 60;

    let remainingMinutes = Math.max(0, waveMinutes - diffMinutes);
    const progressPct = Math.min(100, (diffMinutes / waveMinutes) * 100);

    // Время окончания
    const endMinutes = mealMinutes + Math.round(waveMinutes);
    const endTime = utils.minutesToTime(endMinutes);

    // === История волн за день ===
    // Получаем MEAL_TYPES для названий приёмов
    const MEAL_TYPES = (HEYS.dayUtils && HEYS.dayUtils.MEAL_TYPES) || {};
    const getMealTypeName = (meal) => {
      const type = meal.mealType || meal.name;
      if (type && MEAL_TYPES[type]) {
        return MEAL_TYPES[type].icon + ' ' + MEAL_TYPES[type].name;
      }
      // Fallback по имени
      if (meal.name) return meal.name;
      // По времени
      const h = parseInt((meal.time || '').split(':')[0]) || 12;
      if (h < 10) return '🍳 Завтрак';
      if (h < 12) return '🍎 Перекус';
      if (h < 15) return '🍲 Обед';
      if (h < 17) return '🥜 Перекус';
      if (h < 20) return '🍽️ Ужин';
      return '🌙 Ночной';
    };

    const waveHistory = sorted.map((meal, idx) => {
      const t = meal.time;
      if (!t) return null;

      const startMin = utils.timeToMinutes(t);
      const mealHour = parseInt(t.split(':')[0]) || 12;
      const mealNutrients = calculateMealNutrients(meal, pIndex, getProductFromItem);

      // 🍎 v3.2.0: Форма пищи для каждого приёма
      let historyFoodForm = null;
      for (const item of (meal.items || [])) {
        const prod = getProductFromItem(item, pIndex);
        const itemForm = getFoodForm(prod);
        if (itemForm === 'liquid') historyFoodForm = 'liquid';
        else if (itemForm === 'processed' && historyFoodForm !== 'liquid') historyFoodForm = 'processed';
        else if (itemForm === 'whole' && !historyFoodForm) historyFoodForm = 'whole';
      }

      // R4-7: kcal приёма для kcalScaleMult
      const _mealKcalHist = (mealNutrients.totalProtein || 0) * 4 + (mealNutrients.totalCarbs || 0) * 4 + (mealNutrients.totalFat || 0) * 9;
      const mealMult = calculateMultiplier(
        mealNutrients.avgGI,
        mealNutrients.totalProtein,
        mealNutrients.totalFiber,
        mealNutrients.totalCarbs,
        mealNutrients.totalFat,
        mealNutrients.glycemicLoad,
        mealNutrients.hasLiquid,
        mealNutrients.insulinogenicBonus,
        historyFoodForm,  // 🆕 v3.2.0
        mealNutrients.dominantProteinType || 'mixed', // 🆕 v4.2.3
        mealNutrients.simpleRatio, // R4-7
        _mealKcalHist              // R4-7
      );

      // 🆕 v4.2.3: Activity Context для каждого приёма в истории — вычисляем заранее,
      // чтобы activityBonus и бейдж опирались на один и тот же источник.
      const mealActivityContext = calculateActivityContext({
        mealTimeMin: startMin,
        trainings,
        steps: dayData.steps || 0,
        householdMin: dayData.householdMin || 0,
        weight: dayData.profile?.weight || 70,
        allMeals: sorted,
        mealNutrients: {
          prot: mealNutrients.totalProtein,
          carbs: mealNutrients.totalCarbs,
          simple: mealNutrients.totalSimple || 0
        },
        mealKcal: mealNutrients.totalKcal || 0
      });

      // 🆕 Применяем ВСЕ дневные факторы (не только еда)
      const dayFactors = calculateDayFactorsForMeal(dayData, mealHour);
      const activityFactors = calculateActivityFactorsForMeal(
        trainings,
        startMin,
        dayData.householdMin || 0,
        dayData.steps || 0
      );

      // 🔬 НАУЧНЫЙ АУДИТ 2025-12-09 v2: GL-скалирование дневных факторов
      // При низкой GL дневные факторы (стресс, недосып, циркадные ритмы) 
      // применяются частично, т.к. они влияют на ИНСУЛИНОРЕЗИСТЕНТНОСТЬ,
      // но если инсулина мало — эффект минимален
      // КЛЮЧЕВАЯ КОРРЕКЦИЯ: усилено ослабление циркадного множителя при GL < 10
      const gl = mealNutrients.glycemicLoad;
      let dayFactorsScale = 1.0;
      let circadianScale = 1.0;
      if (gl !== null && gl < 20) {
        // Формула: 0.3 + (GL/20) * 0.7 
        // GL=0 → 0.3, GL=10 → 0.65, GL=20 → 1.0
        dayFactorsScale = Math.max(0.3, 0.3 + (gl / 20) * 0.7);
        // Циркадные ритмы — БОЛЕЕ АГРЕССИВНОЕ ослабление при низкой GL
        // Формула: 0.2 + (GL/20) * 0.8 → GL=7: 0.48, GL=10: 0.6, GL=20: 1.0
        circadianScale = Math.max(0.2, 0.2 + (gl / 20) * 0.8);
      }

      // 🆕 v3.0.1: Скалирование персональной базы по GL для waveHistory
      let scaledBaseWaveHours = effectiveBaseWaveHours;
      if (gl !== null && isFinite(gl) && gl < 10) {
        const baseScaleFactor = Math.max(0.85, 0.85 + (gl / 10) * 0.15);
        scaledBaseWaveHours = scaledBaseWaveHours * baseScaleFactor;
      }

      // Применяем скалированные факторы
      const scaledDayBonus = dayFactors.totalBonus * dayFactorsScale;
      const selectedActivityBonus = mealActivityContext?.waveBonus ?? activityFactors.totalBonus;
      const scaledActivityBonus = selectedActivityBonus * dayFactorsScale;
      // Циркадный множитель: приближаем к 1.0 при низкой GL
      // Если circadian = 1.2 (ночь) и circadianScale = 0.5, то: 1.0 + (1.2-1.0)*0.5 = 1.1
      const scaledCircadian = 1.0 + (dayFactors.circadianMultiplier - 1.0) * circadianScale;

      // Еда-специфичные бонусы
      const spicyMultiplier = mealNutrients.hasSpicy ? SPICY_FOOD.multiplier : 1.0;
      const alcoholBonus = mealNutrients.alcoholBonus || 0;
      const caffeineBonus = mealNutrients.hasCaffeine ? CAFFEINE_BONUS.bonus : 0;
      const transFatBonus = calculateTransFatBonus(mealNutrients.totalTrans || 0);

      // 🆕 v3.2.2: Добавляем бонусы, которые были только в основном расчёте
      // - resistant starch (определяем по meal items)
      let hasResistantStarchInMeal = false;
      for (const item of (meal.items || [])) {
        const prod = getProductFromItem(item, pIndex);
        if (hasResistantStarch(prod)) {
          hasResistantStarchInMeal = true;
          break;
        }
      }
      const resistantStarchBonus = hasResistantStarchInMeal ? RESISTANT_STARCH_BONUS.cooled : 0;

      // - cold exposure, supplements, autophagy (из dayData)
      const coldExposureResult = getColdExposureBonus(dayData);
      const coldExposureBonus = coldExposureResult.bonus || 0;

      const supplementsResult = getSupplementsBonus(meal);
      const supplementsBonusValue = supplementsResult.bonus || 0;

      // Fasting hours для этого приёма
      const mealsBeforeThis = sorted.slice(idx + 1); // sorted отсортирован DESC, поэтому idx+1 = более ранние
      let fastingHoursForMeal = 0;
      if (mealsBeforeThis.length > 0) {
        const prevMealTime = mealsBeforeThis[0].time;
        if (prevMealTime) {
          const prevMin = utils.timeToMinutes(prevMealTime);
          fastingHoursForMeal = (startMin - prevMin) / 60;
        }
      } else {
        // Первый приём дня — считаем от полуночи или от сна
        fastingHoursForMeal = startMin / 60;
      }
      const autophagyResult = getAutophagyPhase(fastingHoursForMeal);
      const autophagyBonus = -(autophagyResult.bonus || 0);

      // 🔬 НАУЧНЫЙ АУДИТ 2025-12-09: Еда-специфичные бонусы тоже скалируются по GL
      // При GL < 5 кофеин/алкоголь/транс-жиры имеют минимальный эффект
      // (без значительного инсулинового всплеска их влияние на волну минимально)
      const mealSpecificBonuses = (alcoholBonus + caffeineBonus + transFatBonus) * dayFactorsScale;

      // 🆕 v3.7.2: УНИФИКАЦИЯ с основным расчётом
      // Разделяем бонусы: еда/метаболизм vs активность
      // Активность применяется как МНОЖИТЕЛЬ, не сумма!
      const otherBonuses = scaledDayBonus + mealSpecificBonuses +
        resistantStarchBonus + coldExposureBonus + supplementsBonusValue + autophagyBonus;
      const foodMultiplier = mealMult.total + otherBonuses;
      const activityMultiplier = Math.max(0.1, 1.0 + scaledActivityBonus); // min 10% от волны

      // 🆕 v4.2.4: дополняем формулу до полного соответствия основному расчёту
      // Ранее waveHistory пропускал 3 независимых множителя, что давало неверные исторические волны.
      const mealInsIndexModifier = getInsulinIndexWaveModifier(mealNutrients.insulinogenicType);
      const mealInsIndexWaveMult = mealInsIndexModifier.waveMultiplier || 1.0;

      const mealSimpleRatio = mealNutrients.simpleRatio || 0;
      let mealSimpleRatioMult = 1.0;
      if (mealSimpleRatio > 0.7) mealSimpleRatioMult = 0.90;
      else if (mealSimpleRatio > 0.5) mealSimpleRatioMult = 0.95;
      else if (mealSimpleRatio < 0.2 && mealNutrients.totalCarbs > 20) mealSimpleRatioMult = 1.05;

      // irScoreMultiplier доступен из внешней области видимости (вычислен на уровне всего дня)
      // v4.3: liquidDairyCompensation удалён — больше нет двойного штрафа.

      // Единая формула — идентична основному расчёту (v4.3)
      let finalMultiplier = foodMultiplier * activityMultiplier * ndteMultiplier * scaledCircadian * spicyMultiplier * mealInsIndexWaveMult * mealSimpleRatioMult * irScoreMultiplier;

      // 🆕 v4.2.5: MAX_MULTIPLIER cap для waveHistory (ранее применялся только к основному расчёту)
      if (finalMultiplier > 1.50) finalMultiplier = 1.50;

      // 🔬 DEBUG v3.2.2: детальный расчёт для последнего приёма (отключено для production)
      // Раскомментировать для отладки:
      // if (idx === sorted.length - 1) {
      //   console.log('[waveHistory v3.2.2 DETAILS]', { mealMult: mealMult.total, allBonuses, scaledCircadian, finalMultiplier });
      // }

      // 🆕 v3.0.1: Используем scaledBaseWaveHours (персональная база, скалированная по GL)
      const duration = Math.round(scaledBaseWaveHours * finalMultiplier * 60);
      const endMin = startMin + duration;

      return {
        time: t,
        timeDisplay: utils.normalizeTimeForDisplay(t),
        startMin,
        endMin,
        endTimeDisplay: utils.minutesToTime(endMin),
        duration,
        waveHours: duration / 60, // 🆕 Для отображения в часах
        baseWaveHours: scaledBaseWaveHours, // 🆕 v3.0.1: персональная база, скалированная по GL
        finalMultiplier, // 🆕 Для отладки
        // 🆕 v3.7.1: NDTE для отображения в popup
        ndteMultiplier,
        ndteData: ndteResult.active ? {
          waveReduction: ndteResult.waveReduction,
          trainingKcal: ndteResult.trainingKcal,
          hoursSince: ndteResult.hoursSince
        } : null,
        mealName: getMealTypeName(meal),
        mealType: meal.mealType || null,
        gi: mealNutrients.avgGI,
        gl: mealNutrients.glycemicLoad,
        protein: mealNutrients.totalProtein,
        fiber: mealNutrients.totalFiber,
        carbs: mealNutrients.totalCarbs,
        fat: mealNutrients.totalFat,
        carbsMultiplier: mealMult.carbs,
        fatBonus: mealMult.fat,
        glCategory: mealMult.glCategory,
        hasLiquid: mealNutrients.hasLiquid,
        liquidMultiplier: mealMult.liquid,
        insulinogenicType: mealNutrients.insulinogenicType,
        insulinogenicBonus: mealMult.insulinogenic,
        // 🆕 Добавляем детали факторов (скалированные)
        dayFactorsBonus: scaledDayBonus,
        activityBonus: scaledActivityBonus,
        circadianMultiplier: scaledCircadian,
        dayFactorsScale, // 🆕 Для отладки
        // 🆕 v3.4.0: Activity Context
        activityContext: mealActivityContext ? {
          type: mealActivityContext.type,
          badge: mealActivityContext.badge,
          desc: mealActivityContext.desc,
          waveBonus: mealActivityContext.waveBonus,
          harmMultiplier: mealActivityContext.harmMultiplier || 1.0,
          nightPenaltyOverride: mealActivityContext.nightPenaltyOverride || false,
          details: mealActivityContext.details || null,
          trainingRef: mealActivityContext.trainingRef || null
        } : null,
        isActive: idx === 0 && remainingMinutes > 0
      };
    }).filter(Boolean).reverse();

    // 🆕 v3.2.2: НЕ перезаписываем adjustedWaveHours из waveHistory!
    // Основной расчёт (adjustedWaveHours) теперь использует полный набор факторов (v3.2.x).
    // waveHistory использует упрощённый расчёт для карточек истории.
    // UI волны должен показывать результат основного расчёта.
    const lastMealWave = waveHistory.length > 0 ? waveHistory[waveHistory.length - 1] : null;
    // 🔬 v3.2.2: Для совместимости обновляем waveHistory данные, а не наоборот
    if (lastMealWave) {
      // Синхронизируем waveHistory с основным расчётом (а не наоборот!)
      lastMealWave.waveHours = adjustedWaveHours;
      lastMealWave.duration = Math.round(adjustedWaveHours * 60);
      lastMealWave.endMin = lastMealWave.startMin + lastMealWave.duration;
      lastMealWave.endTimeDisplay = utils.minutesToTime(lastMealWave.endMin);
      lastMealWave.finalMultiplier = finalMultiplier; // 🆕 Синхронизация множителя
      lastMealWave.baseWaveHours = effectiveBaseWaveHours; // 🆕 Синхронизация базы
    }
    // waveMinutes уже корректно рассчитан в основном блоке
    // remainingMinutes тоже

    // === Анализ перекрытия волн ===
    const overlaps = [];
    for (let i = 0; i < waveHistory.length - 1; i++) {
      const current = waveHistory[i];
      const next = waveHistory[i + 1];
      if (current.endMin > next.startMin) {
        const overlapMin = current.endMin - next.startMin;
        overlaps.push({
          from: current.time,
          fromDisplay: current.timeDisplay,
          to: next.time,
          toDisplay: next.timeDisplay,
          overlapMinutes: overlapMin,
          severity: overlapMin > 60 ? 'high' : overlapMin > 30 ? 'medium' : 'low'
        });
      }
    }

    // === Персональная статистика ===
    const gaps = [];
    for (let i = 0; i < waveHistory.length - 1; i++) {
      gaps.push(waveHistory[i + 1].startMin - waveHistory[i].startMin);
    }
    const avgGapToday = gaps.length > 0
      ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length)
      : 0;

    // История gaps
    let gapHistory = [];
    try {
      gapHistory = JSON.parse(localStorage.getItem(GAP_HISTORY_KEY) || '[]');
    } catch (e) { }

    const today = now.toISOString().slice(0, 10);
    const todayEntry = gapHistory.find(g => g.date === today);
    if (avgGapToday > 0) {
      const oldAvg = todayEntry?.avgGap;
      const oldCount = todayEntry?.count;

      if (todayEntry) {
        todayEntry.avgGap = avgGapToday;
        todayEntry.count = gaps.length;
      } else {
        gapHistory.push({ date: today, avgGap: avgGapToday, count: gaps.length });
      }

      // Сохраняем ТОЛЬКО если данные изменились (чтобы не спамить sync)
      const needsSave = !todayEntry || oldAvg !== avgGapToday || oldCount !== gaps.length;
      if (needsSave) {
        gapHistory = gapHistory.slice(-GAP_HISTORY_DAYS);
        try {
          localStorage.setItem(GAP_HISTORY_KEY, JSON.stringify(gapHistory));
        } catch (e) { }
      }
    }

    const personalAvgGap = gapHistory.length > 0
      ? Math.round(gapHistory.reduce((sum, g) => sum + g.avgGap, 0) / gapHistory.length)
      : 0;

    const recommendedGap = Math.round(baseWaveHours * 60);

    let gapQuality = 'unknown';
    if (personalAvgGap > 0) {
      if (personalAvgGap >= recommendedGap * 0.9) gapQuality = 'excellent';
      else if (personalAvgGap >= recommendedGap * 0.75) gapQuality = 'good';
      else if (personalAvgGap >= recommendedGap * 0.5) gapQuality = 'moderate';
      else gapQuality = 'needs-work';
    }

    // === Статус ===
    const currentHour = now.getHours();
    const isNight = utils.isNightTime(currentHour);

    let status, emoji, text, color, subtext;

    if (remainingMinutes <= 0) {
      status = 'lipolysis';
      emoji = STATUS_CONFIG.lipolysis.emoji;
      text = STATUS_CONFIG.lipolysis.label;
      color = STATUS_CONFIG.lipolysis.color;

      // Липолиз активен! Поощряем продлить это состояние
      if (isNight) {
        subtext = '🌙 Идеально! Ночной липолиз до утра';
      } else {
        subtext = '💪 Жиросжигание идёт! Продержись подольше';
      }
    } else if (remainingMinutes <= 15) {
      status = 'almost';
      emoji = STATUS_CONFIG.almost.emoji;
      text = `${Math.ceil(remainingMinutes)} мин`;
      color = STATUS_CONFIG.almost.color;
      subtext = '⏳ Скоро начнётся липолиз!';
    } else if (remainingMinutes <= 30) {
      status = 'soon';
      emoji = STATUS_CONFIG.soon.emoji;
      text = `${Math.ceil(remainingMinutes)} мин`;
      color = STATUS_CONFIG.soon.color;
      subtext = '🍵 Вода не прерывает липолиз';
    } else {
      status = 'active';
      emoji = STATUS_CONFIG.active.emoji;
      text = utils.formatDuration(remainingMinutes);
      color = STATUS_CONFIG.active.color;
      subtext = '📈 Инсулин высокий, жир запасается';
    }

    // 🔥 Время липолиза (сколько прошло с конца волны)
    // diffMinutes - время с последнего приёма
    // waveMinutes - длина волны (уже синхронизирована с waveHistory)
    // lipolysisMinutes = diffMinutes - waveMinutes (время ПОСЛЕ окончания волны)
    const lipolysisMinutes = diffMinutes > waveMinutes ? Math.round(diffMinutes - waveMinutes) : 0;

    // 🆕 v4.0.0: 3-компонентная Gaussian кривая для визуализации
    // Генерируем кривую с 3 пиками: fast (быстрые угл.), slow (сложные угл.), hepatic (печёночный)
    const waveCurve = generateWaveCurve(waveMinutes, nutrients, {
      hasTraining: !!activityContext?.type,
      trainingType: activityContext?.type,
      isNightTime: isNight
    });

    return {
      // Статус
      status, emoji, text, color, subtext,

      // Прогресс
      progress: progressPct,
      remaining: remainingMinutes,
      lipolysisMinutes,

      // Время (для сортировки храним как есть, для отображения нормализуем)
      lastMealTime,
      lastMealTimeDisplay: utils.normalizeTimeForDisplay(lastMealTime),
      endTime,
      endTimeDisplay: utils.normalizeTimeForDisplay(endTime),

      // Волна
      insulinWaveHours: adjustedWaveHours,
      waveHours: adjustedWaveHours, // 🆕 Алиас для UI popup
      duration: Math.round(adjustedWaveHours * 60), // 🆕 В минутах для UI
      finalMultiplier, // 🆕 Для отображения в popup "База × Множитель"
      baseWaveHours: effectiveBaseWaveHours, // 🆕 v3.0.0: теперь персональная база

      // 🆕 v4.0.0: 3-компонентная Gaussian кривая для визуализации
      curve: waveCurve.curve,                    // Массив точек {t, y} для графика
      gaussian: waveCurve,                       // Полный объект с компонентами
      waveShape: waveCurve.shape,                // 'spike' | 'balanced' | 'prolonged'
      waveShapeDesc: waveCurve.shapeDesc,        // Русское описание формы
      curveComponents: waveCurve.components,     // {fast, slow, hepatic} — 3 компоненты
      curvePeakMinutes: waveCurve.peakMinutes,   // Минута пика для UI
      curveAUC: waveCurve.auc,                   // Площадь под кривой

      // 🆕 v3.0.0: Персональная база волны
      personalBaseline,

      // 🆕 v4.0.0: IR Score — объединённый показатель инсулинорезистентности
      irScore,

      // 🆕 v3.0.0: Фазы волны (подъём, плато, спад)
      wavePhases,
      currentPhase: (() => {
        if (remainingMinutes <= 0) return 'lipolysis';
        if (!wavePhases) return 'active'; // Fallback если фазы не рассчитаны
        const elapsed = waveMinutes - remainingMinutes;
        const riseDur = wavePhases.rise?.duration || 20;
        const plateauDur = wavePhases.plateau?.duration || 60;
        if (elapsed <= riseDur) return 'rise';
        if (elapsed <= riseDur + plateauDur) return 'plateau';
        return 'decline';
      })(),

      // 🆕 v3.0.0: Meal Stacking (наложение волн)
      mealStacking: mealStackingResult,
      hasMealStacking: mealStackingResult.hasStacking,

      // Флаги
      isNightTime: isNight,

      // ГИ данные
      avgGI: nutrients.avgGI,
      gi: nutrients.avgGI, // 🆕 Алиас для UI popup
      giCategory: multipliers.category,
      giMultiplier: multipliers.gi,

      // Нутриенты
      totalProtein: nutrients.totalProtein,
      protein: nutrients.totalProtein, // 🆕 Алиас для UI popup
      totalFiber: nutrients.totalFiber,
      fiber: nutrients.totalFiber, // 🆕 Алиас для UI popup
      totalCarbs: nutrients.totalCarbs,
      carbs: nutrients.totalCarbs, // 🆕 Алиас для UI popup
      totalSimple: nutrients.totalSimple,
      totalFat: nutrients.totalFat,
      fat: nutrients.totalFat, // 🆕 Алиас для UI popup
      glycemicLoad: nutrients.glycemicLoad,
      gl: nutrients.glycemicLoad, // 🆕 Алиас для UI popup
      proteinBonus: multipliers.protein,
      fiberBonus: multipliers.fiber,
      fatBonus: multipliers.fat,
      carbsMultiplier: multipliers.carbs,
      glCategory: multipliers.glCategory,

      // 🥤 Жидкая пища
      hasLiquid: nutrients.hasLiquid,
      liquidRatio: nutrients.liquidRatio,
      liquidMultiplier: multipliers.liquid,

      // 🥛 Инсулиногенность (молочка, белок)
      insulinogenicType: nutrients.insulinogenicType,
      insulinogenicBonus: multipliers.insulinogenic,

      // 🏃 Workout данные
      workoutBonus: workoutBonus.bonus,
      workoutMinutes: workoutBonus.totalMinutes,
      workoutDesc: workoutBonus.desc,
      hasWorkoutBonus: workoutBonus.bonus < 0,

      // 🌅 Circadian данные
      circadianMultiplier: circadian.multiplier,
      circadianPeriod: circadian.period,
      circadianDesc: circadian.desc,

      // 🆕 v1.4: Новые факторы

      // 🍽️ Голодание (fasting)
      fastingHours: Math.round(fastingHours * 10) / 10,
      fastingBonus,
      hasFastingBonus: fastingBonus > 0,

      // 🌶️ Острая пища
      hasSpicy: nutrients.hasSpicy,
      spicyMultiplier,
      hasSpicyBonus: nutrients.hasSpicy,

      // 🍷 Алкоголь
      hasAlcohol: nutrients.hasAlcohol,
      alcoholBonus,
      alcoholType: nutrients.alcoholType,
      hasAlcoholBonus: alcoholBonus > 0,

      // ☕ Кофеин
      hasCaffeine: nutrients.hasCaffeine,
      caffeineBonus,
      hasCaffeineBonus: caffeineBonus > 0,

      // 😰 Стресс
      stressLevel,
      stressBonus,
      hasStressBonus: stressBonus > 0,

      // 😴 Недосып (sleepBonus)
      sleepHoursTracked: sleepHours,
      sleepDeprivationBonus: sleepBonus,
      hasSleepBonus: sleepBonus > 0,

      // 🆕 v1.5: Физическая активность ПОСЛЕ еды

      // 🏃‍♂️ Постпрандиальная тренировка
      postprandialBonus: postprandialBonus.bonus,
      postprandialDesc: postprandialBonus.desc,
      postprandialGapMinutes: postprandialBonus.gapMinutes,
      hasPostprandialBonus: postprandialBonus.bonus < 0,
      postprandialTraining: postprandialBonus.matchedTraining,

      // 🏡 NEAT — бытовая активность
      householdMin: householdMinutes,
      neatBonus: neatBonus.bonus,
      neatDesc: neatBonus.desc,
      hasNeatBonus: neatBonus.bonus < 0,

      // 🚶 Шаги
      steps,
      stepsBonus: stepsBonus.bonus,
      stepsDesc: stepsBonus.desc,
      hasStepsBonus: stepsBonus.bonus < 0,

      // 🆕 v3.4.0: Activity Context — объединённый контекст тренировки
      activityContext: activityContext ? {
        type: activityContext.type,
        badge: activityContext.badge,
        desc: activityContext.desc,
        waveBonus: activityContext.waveBonus,
        harmMultiplier: activityContext.harmMultiplier || 1.0,
        nightPenaltyOverride: activityContext.nightPenaltyOverride || false,
        trainingRef: activityContext.trainingRef,
        details: activityContext.details,
        allContexts: activityContext.allContexts
      } : null,
      hasActivityContext: !!activityContext,
      activityContextType: activityContext?.type || null,
      activityContextBadge: activityContext?.badge || null,

      // 📊 Суммарный бонус активности (для UI)
      activityBonusTotal: activityBonuses,
      hasAnyActivityBonus: activityBonuses < 0,
      activityBonusPct: Math.abs(Math.round(activityBonuses * 100)),
      // 🆕 v3.4.0: Harm multiplier для уменьшения вредности при тренировке
      activityHarmMultiplier,

      // 🆕 v3.6.0: Next-Day Training Effect (NDTE) — эффект вчерашней тренировки
      ndte: ndteResult,
      hasNDTE: ndteResult.active,
      ndteWaveReduction: ndteResult.waveReduction,
      ndteTdeeBoost: ndteResult.tdeeBoost,
      ndteMultiplier: ndteMultiplier,
      ndteBadge: ndteResult.badge,
      ndteLabel: ndteResult.label,

      // История
      waveHistory,

      // Перекрытия
      overlaps,
      hasOverlaps: overlaps.length > 0,
      worstOverlap: overlaps.reduce((max, o) =>
        o.overlapMinutes > (max?.overlapMinutes || 0) ? o : max, null),

      // Персональная статистика
      avgGapToday,
      personalAvgGap,
      recommendedGap,
      gapQuality,
      gapHistory: gapHistory.slice(-7),

      // === НОВЫЕ КОНТЕКСТНЫЕ ДАННЫЕ ===

      // 💡 Рекомендации по еде (если волна активна)
      foodAdvice: remainingMinutes > 0 ? {
        good: ['вода', 'чай без сахара', 'кофе без сахара'],
        avoid: ['сладкое', 'белый хлеб', 'сок', 'фрукты', 'любая еда'],
        reason: 'Любая еда вызывает инсулиновый ответ и продлит волну'
      } : null,

      // ⏰ Оптимальное время следующего приёма
      nextMealTime: (() => {
        const endMin = utils.timeToMinutes(lastMealTime) + Math.round(waveMinutes);
        // Если ночь — рекомендуем утро
        if (isNight || endMin >= 22 * 60) {
          return { time: '08:00', isNextDay: true, label: 'завтра в 8:00' };
        }
        const time = utils.minutesToTime(endMin);
        return { time, isNextDay: false, label: `в ${time}` };
      })(),

      // 💧 Hydration совет
      hydrationAdvice: remainingMinutes > 15
        ? '💧 Вода ускоряет переваривание — выпей стакан'
        : null,

      // 😴 Sleep impact (поздний ужин)
      sleepImpact: (() => {
        const hour = parseInt(lastMealTime.split(':')[0]) || 0;
        if (hour >= 21) {
          return {
            warning: true,
            text: '😴 Поздний ужин замедляет волну на ~20%',
            penalty: 0.2
          };
        }
        if (hour >= 20) {
          return {
            warning: false,
            text: '🌙 Вечерний приём — волна чуть медленнее',
            penalty: 0.1
          };
        }
        return null;
      })(),

      // 🎯 Краткий совет для подсказки
      quickTip: (() => {
        if (remainingMinutes <= 0) return '🔥 Липолиз! Держись!';
        if (remainingMinutes <= 15) return '⏳ Скоро липолиз!';
        if (nutrients.avgGI > 70) return '⚠️ Был высокий ГИ — лучше подождать';
        if (remainingMinutes > 60) return '🍵 Выпей воды или чая';
        return '⏳ Дай организму переварить';
      })(),

      // 🆕 v3.2.0: Холодовое воздействие
      coldExposure: coldExposureResult,
      hasColdExposure: coldExposureResult.hasCold,
      coldExposureBonus,

      // 🆕 v3.2.0: Добавки (уксус, корица, берберин)
      supplements: supplementsResult,
      hasSupplements: supplementsResult.hasSupplements,
      supplementsBonus: supplementsBonusValue,

      // 🆕 v3.2.0: Аутофагия (расчёт бонуса для волны — по fastingHours ДО приёма)
      autophagyBonus,
      // 🆕 v3.7.4: Текущая аутофагия (для UI — по currentFastingHours, время ПОСЛЕ последнего приёма)
      autophagy: getAutophagyPhase(currentFastingHours),
      currentFastingHours: Math.round(currentFastingHours * 10) / 10,
      isAutophagyActive: (() => {
        const currentPhase = getAutophagyPhase(currentFastingHours);
        return currentPhase.phase === 'active' || currentPhase.phase === 'deep' || currentPhase.phase === 'extended';
      })(),

      // 🏆 Рекорд липолиза
      lipolysisRecord: getLipolysisRecord(),

      // 🔥 Streak липолиза
      lipolysisStreak: calculateLipolysisStreak(),

      // 💪 Примерно сожжённые калории (если липолиз активен)
      lipolysisKcal: lipolysisMinutes > 0 ? calculateLipolysisKcal(lipolysisMinutes) : 0,

      // Проверка на новый рекорд
      isNewRecord: lipolysisMinutes > 0 && lipolysisMinutes > getLipolysisRecord().minutes,

      // 🆕 v3.8.0: Научные факторы
      // Риск реактивной гипогликемии
      hypoglycemiaRisk,
      hasHypoglycemiaRisk: hypoglycemiaRisk?.hasRisk || false,

      // Температура пищи (горячая/холодная)
      foodTemperature,
      temperatureBonus,
      hasTemperatureEffect: Math.abs(temperatureBonus) > 0.02,

      // Большие порции (нелинейное замедление)
      largePortionBonus,
      hasLargePortionEffect: largePortionBonus?.bonus > 0,

      // Insulin Index модификатор волны
      insulinIndexModifier,
      insulinIndexWaveMult,

      // Smooth circadian multiplier (v3.8.0)
      circadianSmooth: scaledCircadian
    };
  };


  /**
   * React Hook для использования инсулиновой волны в компонентах
   * 
   * @param {Object} params - параметры hook
   * @param {Array} params.meals - массив приёмов пищи
   * @param {Object} params.pIndex - индекс продуктов
   * @param {Function} params.getProductFromItem - функция получения продукта
   * @param {number} [params.baseWaveHours=3] - базовая длина волны
   * @param {Array} [params.trainings=[]] - массив тренировок
   * @param {Object} [params.dayData={}] - данные дня
   * @returns {Object} данные волны с хуком обновления
   */
  const useInsulinWave = ({ meals, pIndex, getProductFromItem, baseWaveHours = 3, trainings = [], dayData = {} }) => {
    const [expanded, setExpanded] = React.useState(false);
    const [isShaking, setIsShaking] = React.useState(false);

    // Текущая минута для авто-обновления
    const [currentMinute, setCurrentMinute] = React.useState(() => {
      const now = new Date();
      return now.getHours() * 60 + now.getMinutes();
    });

    // Обновление каждую минуту (не в фоновой вкладке)
    React.useEffect(() => {
      const tick = () => {
        const now = new Date();
        setCurrentMinute(now.getHours() * 60 + now.getMinutes());
      };
      const interval = setInterval(() => {
        if (typeof document !== 'undefined' && document.hidden) return;
        tick();
      }, 60000);
      const onVis = () => {
        if (typeof document !== 'undefined' && !document.hidden) tick();
      };
      document.addEventListener('visibilitychange', onVis);
      return () => {
        clearInterval(interval);
        document.removeEventListener('visibilitychange', onVis);
      };
    }, []);

    // Расчёт данных
    const data = React.useMemo(() => {
      return calculateInsulinWaveData({
        meals,
        pIndex,
        getProductFromItem,
        baseWaveHours,
        trainings,
        dayData
      });
    }, [meals, pIndex, baseWaveHours, trainings, dayData, currentMinute]);

    // Shake при almost
    React.useEffect(() => {
      if (data?.status === 'almost' && !isShaking) {
        setIsShaking(true);
        setTimeout(() => setIsShaking(false), 500);
      }
    }, [data?.status]);

    const toggle = React.useCallback(() => setExpanded(prev => !prev), []);

    return {
      data,
      expanded,
      setExpanded,
      toggle,
      isShaking,
      renderProgressBar: () => data ? renderProgressBar(data) : null,
      renderWaveHistory: () => data ? renderWaveHistory(data) : null,
      renderExpandedSection: () => data ? renderExpandedSection(data) : null
    };
  };


  // === ЭКСПОРТ ===
  // 🔄 REFACTOR v4.2.1: Упрощённый экспорт через Object.assign

  HEYS.InsulinWave = HEYS.InsulinWave || {};

  // Главные функции (определены в этом файле)
  Object.assign(HEYS.InsulinWave, {
    calculate: calculateInsulinWaveData,
    useInsulinWave,
    VERSION: '4.2.5'
  });

  // === ДЕЛЕГИРОВАНИЕ К МОДУЛЯМ ===

  // UI компоненты
  if (UI) Object.assign(HEYS.InsulinWave, {
    renderProgressBar: UI.renderProgressBar,
    renderWaveHistory: UI.renderWaveHistory,
    renderExpandedSection: UI.renderExpandedSection,
    MealWaveExpandSection: UI.MealWaveExpandSection,
    renderActivityContextBadge: UI.renderActivityContextBadge
  });

  if (Graph) HEYS.InsulinWave.renderWaveChart = Graph.renderWaveChart;
  if (NDTE_UI) HEYS.InsulinWave.renderNDTEBadge = NDTE_UI.renderNDTEBadge;

  // Расчёты
  if (Calc) Object.assign(HEYS.InsulinWave, {
    utils,
    calculateMealNutrients: Calc.calculateMealNutrients,
    calculateMultiplier: Calc.calculateMultiplier,
    calculateWorkoutBonus: Calc.calculateWorkoutBonus,
    calculateCircadianMultiplier: Calc.calculateCircadianMultiplier,
    calculatePostprandialExerciseBonus: Calc.calculatePostprandialExerciseBonus,
    calculateNEATBonus: Calc.calculateNEATBonus,
    calculateStepsBonus: Calc.calculateStepsBonus
  });

  // v3.0 фичи
  if (V30) Object.assign(HEYS.InsulinWave, {
    calculateContinuousGLMultiplier: V30.calculateContinuousGLMultiplier,
    calculatePersonalBaselineWave: V30.calculatePersonalBaselineWave,
    calculateMealStackingBonus: V30.calculateMealStackingBonus,
    calculateWavePhases: V30.calculateWavePhases,
    calculateInsulinIndex: V30.calculateInsulinIndex,
    getWaveCalculationDebug: V30.getWaveCalculationDebug
  });

  // v4.1 фичи
  if (V41) Object.assign(HEYS.InsulinWave, {
    calculateMetabolicFlexibility: V41.calculateMetabolicFlexibility,
    calculateSatietyScore: V41.calculateSatietyScore,
    calculateAdaptiveDeficit: V41.calculateAdaptiveDeficit,
    METABOLIC_FLEXIBILITY_CONFIG: V41.METABOLIC_FLEXIBILITY_CONFIG,
    SATIETY_MODEL_CONFIG: V41.SATIETY_MODEL_CONFIG,
    ADAPTIVE_DEFICIT_CONFIG: V41.ADAPTIVE_DEFICIT_CONFIG
  });

  // Lipolysis
  if (Lipolysis) Object.assign(HEYS.InsulinWave, {
    getLipolysisRecord: Lipolysis.getLipolysisRecord,
    updateLipolysisRecord: Lipolysis.updateLipolysisRecord,
    saveDayLipolysis: Lipolysis.saveDayLipolysis,
    calculateLipolysisStreak: Lipolysis.calculateLipolysisStreak,
    calculateLipolysisKcal: Lipolysis.calculateLipolysisKcal
  });

  // Константы и функции из __internals (массовое делегирование)
  if (I) Object.assign(HEYS.InsulinWave, {
    // Константы
    GI_CATEGORIES, STATUS_CONFIG,
    PROTEIN_BONUS: I.PROTEIN_BONUS, FIBER_BONUS: I.FIBER_BONUS,
    FAT_BONUS: I.FAT_BONUS, LIQUID_FOOD: I.LIQUID_FOOD,
    INSULINOGENIC_BONUS: I.INSULINOGENIC_BONUS,
    GL_CATEGORIES: I.GL_CATEGORIES, GL_CONTINUOUS: I.GL_CONTINUOUS,
    PERSONAL_BASELINE: I.PERSONAL_BASELINE, MEAL_STACKING: I.MEAL_STACKING,
    WAVE_PHASES: I.WAVE_PHASES, INSULIN_INDEX_FACTORS: I.INSULIN_INDEX_FACTORS,
    WORKOUT_BONUS: I.WORKOUT_BONUS, POSTPRANDIAL_EXERCISE: I.POSTPRANDIAL_EXERCISE,
    NEAT_BONUS: I.NEAT_BONUS, STEPS_BONUS: I.STEPS_BONUS,
    CIRCADIAN_MULTIPLIERS: I.CIRCADIAN_MULTIPLIERS, CIRCADIAN_CONFIG: I.CIRCADIAN_CONFIG,
    FASTING_BONUS: I.FASTING_BONUS, SPICY_FOOD: I.SPICY_FOOD,
    ALCOHOL_BONUS: I.ALCOHOL_BONUS, CAFFEINE_BONUS: I.CAFFEINE_BONUS,
    STRESS_BONUS: I.STRESS_BONUS, SLEEP_BONUS: I.SLEEP_BONUS,
    SLEEP_QUALITY_BONUS: I.SLEEP_QUALITY_BONUS, HYDRATION_BONUS: I.HYDRATION_BONUS,
    AGE_BONUS: I.AGE_BONUS, BMI_BONUS: I.BMI_BONUS, GENDER_BONUS: I.GENDER_BONUS,
    TRANS_FAT_BONUS: I.TRANS_FAT_BONUS, FOOD_FORM_BONUS: I.FOOD_FORM_BONUS,
    RESISTANT_STARCH_BONUS: I.RESISTANT_STARCH_BONUS,
    LIPOLYSIS_THRESHOLDS: I.LIPOLYSIS_THRESHOLDS,
    REACTIVE_HYPOGLYCEMIA: I.REACTIVE_HYPOGLYCEMIA,
    FOOD_TEMPERATURE_BONUS: I.FOOD_TEMPERATURE_BONUS,
    LARGE_PORTION_BONUS: I.LARGE_PORTION_BONUS,
    MIN_LIPOLYSIS_FOR_STREAK: I.MIN_LIPOLYSIS_FOR_STREAK,
    TRAINING_CONTEXT: I.TRAINING_CONTEXT, NDTE: I.NDTE,
    IR_SCORE_CONFIG: I.IR_SCORE_CONFIG, PROTEIN_BONUS_V2: I.PROTEIN_BONUS_V2,
    AUC_CONFIG: I.AUC_CONFIG, INSULIN_PREDICTOR_CONFIG: I.INSULIN_PREDICTOR_CONFIG,
    WAVE_SCORING_V2: I.WAVE_SCORING_V2, SUPPLEMENTS_BONUS: I.SUPPLEMENTS_BONUS,
    COLD_EXPOSURE_BONUS: I.COLD_EXPOSURE_BONUS, AUTOPHAGY_TIMER: I.AUTOPHAGY_TIMER,
    // Функции (компактная форма)
    isLiquidFood: I.isLiquidFood, getInsulinogenicBonus: I.getInsulinogenicBonus,
    isSpicyFood: I.isSpicyFood, getAlcoholBonus: I.getAlcoholBonus,
    hasCaffeine: I.hasCaffeine, calculateStressBonus: I.calculateStressBonus,
    calculateSleepBonus: I.calculateSleepBonus, calculateFastingBonus: I.calculateFastingBonus,
    calculateSleepQualityBonus: I.calculateSleepQualityBonus,
    calculateHydrationBonus: I.calculateHydrationBonus,
    calculateAgeBonus: I.calculateAgeBonus, calculateBMIBonus: I.calculateBMIBonus,
    getGenderBonus: I.getGenderBonus, calculateTransFatBonus: I.calculateTransFatBonus,
    getFoodForm: I.getFoodForm, hasResistantStarch: I.hasResistantStarch,
    estimateInsulinLevel: I.estimateInsulinLevel,
    calculateHypoglycemiaRisk: I.calculateHypoglycemiaRisk,
    getHypoglycemiaWarning: I.getHypoglycemiaWarning,
    detectFoodTemperature: I.detectFoodTemperature,
    calculateLargePortionBonus: I.calculateLargePortionBonus,
    getInsulinIndexWaveModifier: I.getInsulinIndexWaveModifier,
    calculateActivityContext: I.calculateActivityContext, calculateIRScore: I.calculateIRScore,
    detectProteinType: I.detectProteinType, calculateProteinBonusV2: I.calculateProteinBonusV2,
    calculateBMI: I.calculateBMI, getBMICategory: I.getBMICategory,
    isValidTraining: I.isValidTraining, calculateNDTE: I.calculateNDTE,
    calculateNDTEBMIMultiplier: I.calculateNDTEBMIMultiplier,
    calculateNDTEDecay: I.calculateNDTEDecay,
    getPreviousDayTrainings: I.getPreviousDayTrainings,
    getSupplementsBonus: I.getSupplementsBonus, getColdExposureBonus: I.getColdExposureBonus,
    getAutophagyPhase: I.getAutophagyPhase, generateWaveCurve: I.generateWaveCurve,
    calculateTrapezoidalAUC: I.calculateTrapezoidalAUC,
    calculateIncrementalAUC: I.calculateIncrementalAUC, calculateFullAUC: I.calculateFullAUC,
    getInsulinLevelAtTime: I.getInsulinLevelAtTime,
    predictInsulinResponse: I.predictInsulinResponse,
    generatePredictionSummary: I.generatePredictionSummary,
    calculateWaveScore: I.calculateWaveScore, scorePeakHeight: I.scorePeakHeight,
    scoreDuration: I.scoreDuration, scoreWaveShape: I.scoreWaveShape,
    scoreAUC: I.scoreAUC, scoreContext: I.scoreContext
  });

  // Уведомляем компоненты что InsulinWave полностью готов к расчётам
  try {
    document.dispatchEvent(new CustomEvent('heys-insulinwave-ready'));
    console.info('[HEYS.InsulinWave] ✅ heys-insulinwave-ready dispatched (v' + HEYS.InsulinWave.VERSION + ')');
  } catch (_) { }

})(typeof window !== 'undefined' ? window : global);
