// heys_iw_calc.js — InsulinWave Calculations Module
// Версия: 1.0.0 | Дата: 2026-01-12
//
// ОПИСАНИЕ:
// Модуль основных расчётов инсулиновой волны: нутриенты, множители, workout бонусы.
// Выделен из heys_insulin_wave_v1.js для улучшения модульности.

(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};

  // === MODULE VERSION ===
  const MODULE_VERSION = '1.0.0';
  const MODULE_NAME = 'InsulinWave.Calc';

  // === ИМПОРТ КОНСТАНТ ===
  const I = HEYS.InsulinWave?.__internals;
  const utils = HEYS.InsulinWave?.utils;
  const V30 = HEYS.InsulinWave?.V30;
  const calculateContinuousGLMultiplier = V30?.calculateContinuousGLMultiplier;

  // Константы из __internals
  const GL_CATEGORIES = I?.GL_CATEGORIES;
  const FAT_BONUS = I?.FAT_BONUS;
  const PROTEIN_BONUS = I?.PROTEIN_BONUS;
  const FIBER_BONUS = I?.FIBER_BONUS;
  const WORKOUT_BONUS = I?.WORKOUT_BONUS;
  const POSTPRANDIAL_EXERCISE = I?.POSTPRANDIAL_EXERCISE;
  const NEAT_BONUS = I?.NEAT_BONUS;
  const STEPS_BONUS = I?.STEPS_BONUS;
  const CIRCADIAN_CONFIG = I?.CIRCADIAN_CONFIG;

  // Функции из __internals
  const isSpicyFood = I?.isSpicyFood;
  const detectProteinType = I?.detectProteinType;
  const calculateProteinBonusV2 = I?.calculateProteinBonusV2;
  const isValidTraining = I?.isValidTraining;
  const isLiquidFood = I?.isLiquidFood;
  const getInsulinogenicBonus = I?.getInsulinogenicBonus;
  const getAlcoholBonus = I?.getAlcoholBonus;
  const getGenderBonus = I?.getGenderBonus;
  const calculateStressBonus = I?.calculateStressBonus;
  const calculateSleepBonus = I?.calculateSleepBonus;
  const calculateSleepQualityBonus = I?.calculateSleepQualityBonus;
  const calculateHydrationBonus = I?.calculateHydrationBonus;
  const calculateAgeBonus = I?.calculateAgeBonus;
  const calculateBMIBonus = I?.calculateBMIBonus;
  const hasCaffeine = I?.hasCaffeine;

  // Константы для Insulin Index
  const INSULIN_INDEX_FACTORS = I?.INSULIN_INDEX_FACTORS;

  const calculateMealNutrients = (meal, pIndex, getProductFromItem) => {
    let totalGrams = 0;
    let weightedGI = 0;  // 🔬 v3.0.1: Теперь взвешиваем по углеводам, не по граммам!
    let totalCarbsForGI = 0;  // 🆕 Сумма углеводов для расчёта средневзвешенного ГИ
    let totalProtein = 0;
    let totalFiber = 0;
    let totalCarbs = 0;
    let totalSimple = 0;
    let totalFat = 0;
    let totalTrans = 0;  // 🆕 v2.0: Отдельный учёт транс-жиров
    const proteinTypeTotals = { animal: 0, plant: 0, whey: 0, mixed: 0 };

    // Новые факторы
    let liquidGrams = 0;  // Сколько грамм жидкой пищи
    let maxInsulinogenicBonus = 0;
    let insulinogenicType = null;

    // 🆕 v3.2.2: Суммарный вклад от Insulin Index
    // Научное обоснование: Holt 1997 — молочка имеет II >> GI
    // Вместо бонуса +15% — правильно увеличиваем эффективную GL
    let insulinIndexAdjustedGL = 0;  // Сумма GL с учётом II

    // 🆕 v1.4: Острая пища, алкоголь, кофеин
    let hasSpicy = false;
    let maxAlcoholBonus = 0;
    let alcoholType = null;
    let caffeineDetected = false;

    const items = meal?.items || [];

    for (const item of items) {
      const grams = item.grams || 100;
      const prod = getProductFromItem(item, pIndex);

      // 🔧 FIX v3.8.2: Тройной fallback для ВСЕХ полей — prod → item snapshot → default
      const gi = prod?.gi ?? prod?.gi100 ?? prod?.GI ?? item.gi ?? 50;
      totalGrams += grams;

      const protein100 = prod?.protein100 ?? item.protein100 ?? 0;
      const fiber100 = prod?.fiber100 ?? item.fiber100 ?? 0;
      const proteinFromItem = protein100 * grams / 100;
      totalProtein += proteinFromItem;
      if (proteinFromItem > 0) {
        const detectedProteinType = detectProteinType?.(prod) || 'mixed';
        proteinTypeTotals[detectedProteinType] = (proteinTypeTotals[detectedProteinType] || 0) + proteinFromItem;
      }
      totalFiber += fiber100 * grams / 100;

      // Углеводы для расчёта силы инсулиновой реакции
      // 🔧 FIX v3.8.2: Тройной fallback — prod → item snapshot → 0
      // Когда pIndex не готов, prod=null, но item может иметь snapshot данные
      const simple = prod?.simple100 ?? item.simple100 ?? 0;
      const complex = prod?.complex100 ?? item.complex100 ?? 0;
      const carbsFromBreakdown = simple + complex;
      // Fallback на carbs100 если simple/complex не заданы
      const carbsPer100 = carbsFromBreakdown > 0 ? carbsFromBreakdown : (prod?.carbs100 ?? item.carbs100 ?? 0);
      const itemCarbs = carbsPer100 * grams / 100;
      totalSimple += simple * grams / 100;
      totalCarbs += itemCarbs;

      // 🔍 DEBUG: Проверка источника данных для GL (отключено — слишком много логов)
      // const dataSource = prod ? 'pIndex' : (item.simple100 !== undefined ? 'snapshot' : 'default');
      // const debugItemGL = gi * itemCarbs / 100;
      // console.log('[InsulinWave DEBUG] Item:', {
      //   name: item.name, grams, dataSource,
      //   simple100: simple, complex100: complex, carbsPer100, itemCarbs, gi,
      //   calculatedGL: debugItemGL
      // });

      // 🔬 v3.0.1: Взвешиваем ГИ по УГЛЕВОДАМ, не по граммам!
      // Сыр без углеводов не должен влиять на средний ГИ
      // Научное обоснование: ГИ применим только к углеводам (Brand-Miller 2003)
      weightedGI += gi * itemCarbs;
      totalCarbsForGI += itemCarbs;

      // 🆕 v3.2.2: GL каждого продукта + применение Insulin Index
      // GL продукта = GI × углеводы / 100
      const itemGL = gi * itemCarbs / 100;

      // Жиры — замедляют переваривание (gastric emptying)
      // 🔧 FIX v3.8.2: Тройной fallback для жиров
      const badFat = prod?.badFat100 ?? item.badFat100 ?? 0;
      const goodFat = prod?.goodFat100 ?? item.goodFat100 ?? 0;
      const transFat = prod?.trans100 ?? item.trans100 ?? 0;
      totalFat += (badFat + goodFat + transFat) * grams / 100;
      totalTrans += transFat * grams / 100;  // 🆕 v2.0: Отдельный учёт транс-жиров

      // 🥤 Жидкая пища — усваивается быстрее
      if (isLiquidFood(prod)) {
        liquidGrams += grams;
      }

      // 🥛 Инсулиногенность — молочка и белок стимулируют инсулин
      const insBonus = getInsulinogenicBonus(prod);
      if (insBonus.bonus > maxInsulinogenicBonus) {
        maxInsulinogenicBonus = insBonus.bonus;
        insulinogenicType = insBonus.type;
      }

      // 🆕 v3.2.2: Применяем Insulin Index к GL продукта
      // Научное обоснование: Holt 1997 — молочка вызывает инсулиновый ответ
      // в 2-3 раза выше чем предсказывает её GI
      // 🔧 FIX v3.8.3: INSULIN_INDEX_FACTORS теперь объекты с .glBoost!
      let iiFactor = 1.0;
      if (insBonus.type === 'liquidDairy') iiFactor = INSULIN_INDEX_FACTORS.liquidDairy?.glBoost || 1.5;
      else if (insBonus.type === 'softDairy') iiFactor = INSULIN_INDEX_FACTORS.softDairy?.glBoost || 1.3;
      else if (insBonus.type === 'hardDairy') iiFactor = INSULIN_INDEX_FACTORS.hardDairy?.glBoost || 1.1;
      else if (insBonus.type === 'protein') iiFactor = INSULIN_INDEX_FACTORS.pureProtein?.glBoost || 1.2;

      // Ограничиваем максимальное увеличение (не более maxGLBoost от базовой GL)
      // 🔧 FIX v3.8.3: maxBoost → maxGLBoost
      const maxBoost = itemGL * (INSULIN_INDEX_FACTORS.maxGLBoost || 2.0);
      const boostedItemGL = Math.min(itemGL * iiFactor, itemGL + maxBoost);

      insulinIndexAdjustedGL += boostedItemGL;

      // 🔍 DEBUG v2: Проверка накопления GL (отключено — слишком много логов)
      // console.log('[InsulinWave DEBUG v2] GL accumulation:', {
      //   name: item.name,
      //   itemGL,
      //   iiFactor,
      //   maxBoost,
      //   boostedItemGL,
      //   insulinIndexAdjustedGL_afterAdd: insulinIndexAdjustedGL
      // });

      // 🌶️ Острая пища — ускоряет метаболизм
      if (isSpicyFood(prod)) {
        hasSpicy = true;
      }

      // 🍷 Алкоголь — замедляет метаболизм
      const alcBonus = getAlcoholBonus(prod);
      if (alcBonus.bonus > maxAlcoholBonus) {
        maxAlcoholBonus = alcBonus.bonus;
        alcoholType = alcBonus.type;
      }

      // ☕ Кофеин — стимулирует инсулин
      if (hasCaffeine(prod)) {
        caffeineDetected = true;
      }
    }

    // 🔬 v3.0.1: Средневзвешенный ГИ по УГЛЕВОДАМ (правильно), не по граммам!
    // Если нет углеводов — используем нейтральный ГИ=50
    const avgGI = totalCarbsForGI > 0 ? Math.round(weightedGI / totalCarbsForGI) : 50;

    // 🆕 v3.2.2: Используем insulinIndexAdjustedGL вместо простого расчёта
    // Старая формула: GL = GI × углеводы / 100 (не учитывает Insulin Index!)
    // Новая: сумма GL каждого продукта с учётом II (молочка ×3, белок ×1.8, и т.д.)
    // Это БОЛЕЕ ТОЧНО предсказывает реальный инсулиновый ответ (Holt 1997)
    const baseGlycemicLoad = Math.round(avgGI * totalCarbs / 100 * 10) / 10;
    const glycemicLoad = Math.round(insulinIndexAdjustedGL * 10) / 10;

    // Доля жидкой пищи (если >50% — приём считается жидким)
    const liquidRatio = totalGrams > 0 ? liquidGrams / totalGrams : 0;
    const hasLiquid = liquidRatio > 0.5;

    // 🆕 v3.8.5: Simple Ratio — доля простых углеводов (сахара)
    // Влияет на форму волны: больше сахара = быстрее пик, короче волна
    const simpleRatio = totalCarbs > 0 ? totalSimple / totalCarbs : 0;
    const dominantProteinType = Object.entries(proteinTypeTotals)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'mixed';

    return {
      avgGI,
      totalProtein: Math.round(totalProtein),
      totalFiber: Math.round(totalFiber),
      totalGrams,
      totalCarbs: Math.round(totalCarbs * 10) / 10,
      totalSimple: Math.round(totalSimple * 10) / 10,
      totalFat: Math.round(totalFat * 10) / 10,
      totalTrans: Math.round(totalTrans * 10) / 10,  // 🆕 v2.0: Транс-жиры
      glycemicLoad,
      baseGlycemicLoad,  // 🆕 v3.2.2: Для отладки — GL без II
      simpleRatio: Math.round(simpleRatio * 100) / 100,  // 🆕 v3.8.5: 0-1 (доля сахара)
      // Факторы v1.3
      hasLiquid,
      liquidRatio: Math.round(liquidRatio * 100),
      dominantProteinType,
      insulinogenicType,
      insulinogenicBonus: maxInsulinogenicBonus,
      // 🆕 Факторы v1.4
      hasSpicy,
      hasAlcohol: maxAlcoholBonus > 0,
      alcoholBonus: maxAlcoholBonus,
      alcoholType,
      hasCaffeine: caffeineDetected
    };
  };

  // === CARBS SCALING — длина волны зависит от количества углеводов ===
  // Меньше углеводов = короче волна (инсулиновый отклик пропорционален углеводам)
  const CARBS_SCALING = {
    // Минимальный порог — ниже этого инсулиновая реакция минимальна
    minThreshold: 5,     // < 5г углеводов = почти нет реакции
    // Порог для полной волны
    fullWaveThreshold: 30, // >= 30г = полная волна (100%)
    // Минимальный множитель волны при малых углеводах
    minMultiplier: 0.25   // 25% от базовой волны для минимальных углеводов
  };

  /**
   * Рассчитать множитель длины волны на основе количества углеводов
   * @param {number} carbs - общее количество углеводов в граммах
   * @returns {number} множитель 0.25-1.0
   */
  const calculateCarbsMultiplier = (carbs) => {
    if (carbs < CARBS_SCALING.minThreshold) {
      return CARBS_SCALING.minMultiplier;
    }
    if (carbs >= CARBS_SCALING.fullWaveThreshold) {
      return 1.0;
    }
    // Линейная интерполяция между minThreshold и fullWaveThreshold
    const range = CARBS_SCALING.fullWaveThreshold - CARBS_SCALING.minThreshold;
    const carbsAboveMin = carbs - CARBS_SCALING.minThreshold;
    const ratio = carbsAboveMin / range;
    return CARBS_SCALING.minMultiplier + ratio * (1 - CARBS_SCALING.minMultiplier);
  };

  /**
   * Получить категорию гликемической нагрузки
   * @param {number} gl - гликемическая нагрузка
   * @returns {Object} { multiplier, desc, category }
   */
  const getGLCategory = (gl) => {
    if (gl < GL_CATEGORIES.micro.max) return { ...GL_CATEGORIES.micro, id: 'micro' };
    if (gl < GL_CATEGORIES.veryLow.max) return { ...GL_CATEGORIES.veryLow, id: 'veryLow' };
    if (gl < GL_CATEGORIES.low.max) return { ...GL_CATEGORIES.low, id: 'low' };
    if (gl < GL_CATEGORIES.medium.max) return { ...GL_CATEGORIES.medium, id: 'medium' };
    if (gl < GL_CATEGORIES.high.max) return { ...GL_CATEGORIES.high, id: 'high' };
    return { ...GL_CATEGORIES.veryHigh, id: 'veryHigh' };
  };

  /**
   * Рассчитать бонус от жиров (замедление пищеварения)
   * @param {number} fat - жиры в граммах
   * @returns {number} бонус (положительный = удлиняет волну)
   */
  const calculateFatBonus = (fat) => {
    if (fat >= FAT_BONUS.high.threshold) return FAT_BONUS.high.bonus;
    if (fat >= FAT_BONUS.medium.threshold) return FAT_BONUS.medium.bonus;
    if (fat >= FAT_BONUS.low.threshold) return FAT_BONUS.low.bonus;
    return 0;
  };

  /**
   * Рассчитать множитель длины волны
   * 
   * 🔬 НАУЧНЫЙ АУДИТ 2025-12-09:
   * Формула переработана для корректной обработки низкоуглеводной еды.
   * 
   * КЛЮЧЕВЫЕ ПРИНЦИПЫ:
   * 1. GL (гликемическая нагрузка) — главный предиктор инсулинового ответа
   * 2. При низкой GL (< 10) все бонусы масштабируются пропорционально
   * 3. GI имеет смысл только при достаточном количестве углеводов (GL ≥ 10)
   * 4. Белок/жиры/инсулиногенность — вторичные факторы при низкой GL
   * 
   * @param {number} gi - ГИ
   * @param {number} protein - белок в граммах
   * @param {number} fiber - клетчатка в граммах
   * @param {number} carbs - углеводы в граммах (опционально)
   * @param {number} fat - жиры в граммах (опционально)
   * @param {number} gl - гликемическая нагрузка (опционально)
   * @param {boolean} hasLiquid - содержит жидкую пищу (опционально)
   * @param {number} insulinogenicBonus - бонус от инсулиногенных продуктов (опционально)
   * @param {string} foodForm - форма пищи: 'liquid'|'processed'|'whole'|null (v3.2.0)
   * @returns {Object} { total, gi, protein, fiber, carbs, fat, gl, glCategory, liquid, insulinogenic, foodForm }
   */

  const calculateMultiplier = (gi, protein, fiber, carbs = null, fat = null, gl = null, hasLiquid = false, insulinogenicBonus = 0, foodForm = null, proteinType = 'mixed', simpleRatio = null, mealKcal = null) => {
    const giCat = utils.getGICategory(gi);

    // 📊 Гликемическая нагрузка — v3.0.0: используем плавную формулу
    // Ступенчатые категории заменены на continuous curve для большей точности
    const glCategory = gl !== null ? getGLCategory(gl) : null; // Для совместимости оставляем категорию
    // 🆕 v3.0.0: Continuous GL multiplier вместо ступенчатого
    const glMultiplier = gl !== null ? calculateContinuousGLMultiplier(gl) : 1.0;

    // 🔬 НОВАЯ ЛОГИКА: GL-зависимое скалирование всех факторов
    // При GL < 10 факторы (белок, жиры, инсулиногенность) применяются частично
    // Это отражает научный факт: без углеводов инсулиновая волна не может быть долгой
    // 
    // glScaleFactor:
    // - GL >= 20: 1.0 (полное применение всех факторов)
    // - GL = 10: 0.6 (60% от факторов)
    // - GL = 5: 0.4 (40% от факторов) 
    // - GL = 0: 0.25 (25% — минимум, т.к. белок всё же даёт небольшой инсулин)
    let glScaleFactor = 1.0;
    if (gl !== null && gl < 20) {
      // Формула: 0.25 + (GL/20) * 0.75
      // GL=0 → 0.25, GL=10 → 0.625, GL=20 → 1.0
      glScaleFactor = Math.max(0.25, 0.25 + (gl / 20) * 0.75);
    }

    // GI множитель — применяется пропорционально GL
    // 🔬 v3.8.0: GI НЕ ВЛИЯЕТ при GL<7 (Mayer 1995)
    // Научное обоснование: при <7г доступных углеводов инсулиновый ответ минимален
    // Mayer 1995: "glycemic index is not important when GL<7"
    // Brand-Miller 2003: GL является более значимым предиктором чем GI
    let giMult = 1.0;
    if (gl === null || gl >= 20) {
      // Полный GI только при GL≥20 (достаточная углеводная нагрузка)
      giMult = giCat.multiplier;
    } else if (gl >= 7) {
      // 🆕 v3.8.0: Плавный переход только от GL≥7 (не от GL≥5)
      // GL=7→0%, GL=13.5→50%, GL=20→100%
      const giWeight = (gl - 7) / 13;
      giMult = 1.0 + (giCat.multiplier - 1.0) * giWeight;
    }
    // При GL<7: giMult остаётся 1.0 (GI не влияет — Mayer 1995)

    // Бонусы от нутриентов — масштабируются по glScaleFactor
    // 🆕 v4.0.0: Белок v2 — animal/plant дифференциация
    // Научное обоснование: 
    // - Nuttall & Gannon 1991: животный белок вызывает более сильный инсулиновый ответ
    // - Van Loon 2000: whey protein — максимальная инсулиногенность
    // - Raben 1994: plant protein — меньший инсулиновый ответ
    let proteinBonus = 0;
    let proteinMeta = null; // Для хранения типа белка в результате

    if (protein > 0 && typeof calculateProteinBonusV2 === 'function') {
      // 🆕 v4.0.0: Используем v2 систему с типизацией белка
      const proteinV2 = calculateProteinBonusV2(protein, proteinType || 'mixed');
      proteinBonus = proteinV2.bonus;
      proteinMeta = {
        type: proteinV2.type,
        tier: proteinV2.tier,
        multiplier: proteinV2.multiplier,
        label: proteinV2.label,
        desc: proteinV2.desc
      };
    } else {
      // Fallback на старую систему (backward compatibility)
      if (protein >= PROTEIN_BONUS.high.threshold) proteinBonus = PROTEIN_BONUS.high.bonus;
      else if (protein >= PROTEIN_BONUS.medium.threshold) proteinBonus = PROTEIN_BONUS.medium.bonus;
    }
    proteinBonus *= glScaleFactor;

    let fiberBonus = 0;
    // 🆕 v4.2.5: Добавлен veryHigh tier (15г+ клетчатки → −20%)
    // Jenkins 1978, Weickert 2008: 15-25г клетчатки за приём = −25-30% AUC инсулина
    if (FIBER_BONUS.veryHigh && fiber >= FIBER_BONUS.veryHigh.threshold) fiberBonus = FIBER_BONUS.veryHigh.bonus;
    else if (fiber >= FIBER_BONUS.high.threshold) fiberBonus = FIBER_BONUS.high.bonus;
    else if (fiber >= FIBER_BONUS.medium.threshold) fiberBonus = FIBER_BONUS.medium.bonus;
    fiberBonus *= glScaleFactor;

    // 🧈 Жиры — замедляют усвоение УГЛЕВОДОВ, при низкой GL эффект минимален
    const rawFatBonus = fat !== null ? calculateFatBonus(fat) : 0;
    const fatBonus = rawFatBonus * glScaleFactor;

    // 🥛 Инсулиногенность — v3.2.2: ТЕПЕРЬ УЧТЕНА В GL!
    // Раньше: добавляли +15% бонус к множителю (некорректно)
    // Теперь: увеличиваем GL продукта через Insulin Index (молоко ×3, белок ×1.8)
    // Это уже сделано в calculateMealNutrients() → insulinIndexAdjustedGL
    // ПОЭТОМУ insBonus = 0 (иначе двойной учёт!)
    const insBonus = 0;

    // 🥤 Жидкая пища — усваивается быстрее (волна короче, но пик выше)
    const liquidMult = hasLiquid ? LIQUID_FOOD.waveMultiplier : 1.0;

    // 🍎 Форма пищи (v3.2.0) — жидкое/обработанное/цельное
    // Научное обоснование: Flood-Obbagy & Rolls 2009
    const foodFormMult = foodForm && FOOD_FORM_BONUS[foodForm]
      ? FOOD_FORM_BONUS[foodForm].multiplier
      : 1.0;

    // Базовый множитель: GI + все бонусы (уже скалированные)
    const baseMult = giMult + proteinBonus + fiberBonus + fatBonus + insBonus;

    // GL множитель применяется к базе
    // При GL < 5: glMultiplier = 0.5 → волна в 2 раза короче
    const carbsMult = glMultiplier;

    // R4-7: simpleRatio — доля простых углеводов укорачивает волну
    // Mayer 1995, Brand-Miller 2003: высокий simpleRatio → быстрый пик + быстрый спад.
    // >60% простых сахаров — волна короче на ~15%.
    let simpleMult = 1.0;
    if (simpleRatio !== null && simpleRatio > 0.6 && carbs && carbs > 5) {
      simpleMult = 0.85;
    } else if (simpleRatio !== null && simpleRatio > 0.4 && carbs && carbs > 5) {
      // плавный переход 0.4-0.6
      simpleMult = 1.0 - ((simpleRatio - 0.4) / 0.2) * 0.15;
    }

    // R4-7: kcal scaling — Louis-Sylvestre & Le Magnen 1980 (sublinear).
    // Маленькие приёмы (<200 ккал) дают более короткую волну.
    let kcalScaleMult = 1.0;
    if (mealKcal !== null && Number.isFinite(mealKcal)) {
      if (mealKcal < 100) kcalScaleMult = 0.75;
      else if (mealKcal < 200) kcalScaleMult = 0.9;
      else if (mealKcal < 300) kcalScaleMult = 0.95;
      // ≥300 — нормальный приём, без коррекции
    }

    return {
      total: baseMult * carbsMult * liquidMult * foodFormMult * simpleMult * kcalScaleMult,
      gi: giMult,
      protein: proteinBonus,
      proteinMeta, // 🆕 v4.0.0: Тип белка (animal/plant/whey/mixed)
      fiber: fiberBonus,
      fat: fatBonus,
      carbs: carbsMult,
      liquid: liquidMult,
      foodForm: foodFormMult,  // 🆕 v3.2.0
      insulinogenic: insBonus,
      simpleRatioMult: simpleMult, // R4-7: для отладки
      kcalScaleMult,               // R4-7: для отладки
      glCategory,
      glScaleFactor, // 🆕 Для отладки
      category: giCat
    };
  };

  const calculateWorkoutBonus = (rawTrainings) => {
    // 🆕 v3.7.3: Фильтруем пустые тренировки
    const trainings = (rawTrainings || []).filter(isValidTraining);
    if (trainings.length === 0) {
      return { bonus: 0, totalMinutes: 0, intensityMinutes: 0, desc: null };
    }

    let totalMinutes = 0;
    let intensityMinutes = 0;

    for (const t of trainings) {
      const zones = t.z || [0, 0, 0, 0];
      // z[0], z[1] — низкая интенсивность, z[2], z[3] — высокая
      const lowIntensity = (zones[0] || 0) + (zones[1] || 0);
      const highIntensity = (zones[2] || 0) + (zones[3] || 0);

      totalMinutes += lowIntensity + highIntensity;
      // Интенсивные минуты с множителем
      intensityMinutes += lowIntensity + highIntensity * WORKOUT_BONUS.intensityMultiplier;
    }

    // Определяем бонус
    let bonus = 0;
    let desc = null;

    if (intensityMinutes >= WORKOUT_BONUS.high.threshold) {
      bonus = WORKOUT_BONUS.high.bonus;
      desc = `🏃 Тренировка ${Math.round(totalMinutes)} мин → волна ${Math.abs(Math.round(bonus * 100))}% короче`;
    } else if (intensityMinutes >= WORKOUT_BONUS.medium.threshold) {
      bonus = WORKOUT_BONUS.medium.bonus;
      desc = `🏃 Тренировка ${Math.round(totalMinutes)} мин → ускорение`;
    }

    return { bonus, totalMinutes: Math.round(totalMinutes), intensityMinutes: Math.round(intensityMinutes), desc };
  };

  /**
   * 🏃‍♂️ Рассчитать бонус от постпрандиальной тренировки (ПОСЛЕ еды)
   * Научное обоснование: активация GLUT4 транспортеров мышцами
   * ускоряет утилизацию глюкозы на 20-30% (Colberg et al. 2010)
   * 
   * @param {Array} rawTrainings - массив тренировок дня
   * @param {number} mealTimeMinutes - время приёма пищи в минутах от полуночи
   * @returns {Object} { bonus, matchedTraining, desc, gapMinutes }
   */
  const calculatePostprandialExerciseBonus = (rawTrainings, mealTimeMinutes) => {
    // 🆕 v3.7.3: Фильтруем пустые тренировки
    const trainings = (rawTrainings || []).filter(isValidTraining);
    if (trainings.length === 0 || !mealTimeMinutes) {
      return { bonus: 0, matchedTraining: null, desc: null, gapMinutes: null };
    }

    // Ищем тренировку, которая была ПОСЛЕ еды в пределах 2 часов
    let bestMatch = null;
    let bestBonus = 0;
    let bestGap = null;
    let bestDetails = null;

    for (const t of trainings) {
      if (!t.time) continue;

      const trainingMinutes = utils.timeToMinutes(t.time);
      let gapMinutes = trainingMinutes - mealTimeMinutes;

      // Если тренировка через полночь (еда 23:00, тренировка 01:00)
      if (gapMinutes < 0 && Math.abs(gapMinutes) > 12 * 60) {
        gapMinutes += 24 * 60;
      }

      // Тренировка должна быть ПОСЛЕ еды и в пределах окна
      if (gapMinutes > 0 && gapMinutes <= POSTPRANDIAL_EXERCISE.maxWindow) {
        const zones = t.z || [0, 0, 0, 0];
        const lowIntensity = (zones[0] || 0) + (zones[1] || 0);
        const highIntensity = (zones[2] || 0) + (zones[3] || 0);
        const totalMinutes = lowIntensity + highIntensity;

        // Множитель по типу тренировки
        const typeMult = POSTPRANDIAL_EXERCISE.typeMultipliers[t.type] || 1.0;

        // Определяем бонус по интенсивности
        let rawBonus = 0;
        let intensityLevel = 'none';
        if (highIntensity >= POSTPRANDIAL_EXERCISE.highIntensity.threshold) {
          rawBonus = POSTPRANDIAL_EXERCISE.highIntensity.bonus;
          intensityLevel = 'high';
        } else if (totalMinutes >= POSTPRANDIAL_EXERCISE.moderate.threshold) {
          rawBonus = POSTPRANDIAL_EXERCISE.moderate.bonus;
          intensityLevel = 'moderate';
        } else if (totalMinutes >= POSTPRANDIAL_EXERCISE.light.threshold) {
          rawBonus = POSTPRANDIAL_EXERCISE.light.bonus;
          intensityLevel = 'light';
        }

        // 🆕 v3.5.1: proximityBoost — чем раньше тренировка после еды, тем сильнее
        let proximityBoost = 0.7; // default: late
        if (gapMinutes <= POSTPRANDIAL_EXERCISE.proximityBoost.immediate.maxGap) {
          proximityBoost = POSTPRANDIAL_EXERCISE.proximityBoost.immediate.boost; // 1.5
        } else if (gapMinutes <= POSTPRANDIAL_EXERCISE.proximityBoost.soon.maxGap) {
          proximityBoost = POSTPRANDIAL_EXERCISE.proximityBoost.soon.boost; // 1.3
        } else if (gapMinutes <= POSTPRANDIAL_EXERCISE.proximityBoost.medium.maxGap) {
          proximityBoost = POSTPRANDIAL_EXERCISE.proximityBoost.medium.boost; // 1.0
        }

        // 🆕 v3.5.1: kcalBonus — дополнительный бонус за интенсивную тренировку
        // Аналогично POST-WORKOUT: больше ккал = сильнее эффект
        const weight = 70; // default
        const trainingKcal = totalMinutes * 5 * (weight / 70) * (highIntensity > lowIntensity ? 1.5 : 1.0);
        let kcalBoost = 1.0;
        if (trainingKcal >= 500) {
          kcalBoost = 1.5; // Интенсивная тренировка → +50% к бонусу
        } else if (trainingKcal >= 300) {
          kcalBoost = 1.25;
        }

        // Финальный бонус = base × type × proximity × kcal
        const finalBonus = Math.max(-0.85, rawBonus * typeMult * proximityBoost * kcalBoost);

        if (finalBonus < bestBonus) { // Ищем минимальный (самый отрицательный = лучший)
          bestBonus = finalBonus;
          bestMatch = t;
          bestGap = gapMinutes;
          bestDetails = { intensityLevel, typeMult, proximityBoost, kcalBoost, trainingKcal, rawBonus };
        }
      }
    }

    if (!bestMatch) {
      return { bonus: 0, matchedTraining: null, desc: null, gapMinutes: null };
    }

    const pctShorter = Math.abs(Math.round(bestBonus * 100));
    const typeEmoji = bestMatch.type === 'cardio' ? '🏃' : bestMatch.type === 'strength' ? '🏋️' : '⚽';

    return {
      bonus: bestBonus,
      matchedTraining: bestMatch,
      gapMinutes: bestGap,
      details: bestDetails,
      desc: `${typeEmoji} Тренировка через ${bestGap} мин после еды → волна ${pctShorter}% короче`
    };
  };

  /**
   * 🏡 Рассчитать бонус от бытовой активности (NEAT)
   * Научное обоснование: Hamilton et al. 2007 — NEAT улучшает инсулиновую чувствительность
   * 
   * @param {number} householdMin - минуты бытовой активности
   * @returns {Object} { bonus, desc }
   */
  const calculateNEATBonus = (householdMin) => {
    if (!householdMin || householdMin <= 0) {
      return { bonus: 0, desc: null };
    }

    let bonus = 0;
    let desc = null;

    if (householdMin >= NEAT_BONUS.high.threshold) {
      bonus = NEAT_BONUS.high.bonus;
      desc = `🏡 Бытовая активность ${householdMin} мин → волна ${Math.abs(Math.round(bonus * 100))}% короче`;
    } else if (householdMin >= NEAT_BONUS.medium.threshold) {
      bonus = NEAT_BONUS.medium.bonus;
      desc = `🏡 Бытовая активность ${householdMin} мин → ускорение`;
    } else if (householdMin >= NEAT_BONUS.low.threshold) {
      bonus = NEAT_BONUS.low.bonus;
      // Не показываем desc для минимального эффекта
    }

    return { bonus, desc };
  };

  /**
   * 🚶 Рассчитать бонус от шагов
   * 
   * @param {number} steps - количество шагов
   * @returns {Object} { bonus, desc }
   */
  const calculateStepsBonus = (steps) => {
    if (!steps || steps <= 0) {
      return { bonus: 0, desc: null };
    }

    let bonus = 0;
    let desc = null;

    if (steps >= STEPS_BONUS.high.threshold) {
      bonus = STEPS_BONUS.high.bonus;
      desc = `🚶 ${Math.round(steps / 1000)}k шагов → волна ${Math.abs(Math.round(bonus * 100))}% короче`;
    } else if (steps >= STEPS_BONUS.medium.threshold) {
      bonus = STEPS_BONUS.medium.bonus;
      desc = `🚶 ${Math.round(steps / 1000)}k шагов → ускорение`;
    } else if (steps >= STEPS_BONUS.low.threshold) {
      bonus = STEPS_BONUS.low.bonus;
    }

    return { bonus, desc };
  };

  /**
   * 🌅 v3.8.0: Плавный циркадный множитель (синусоидальная кривая)
   * Заменяет ступенчатые 5 диапазонов на smooth continuous curve
   * 
   * Научное обоснование: Van Cauter 1997
   * - Пик инсулиновой чувствительности: 7-9 утра (multiplier ~0.85)
   * - Минимум чувствительности: 22-02 ночи (multiplier ~1.20)
   * - Переход плавный, привязан к 24-часовому ритму кортизола
   * 
   * Формула: косинусная волна с периодом 24 часа
   * center = (min + max) / 2 = 1.025
   * amplitude = (max - min) / 2 = 0.175
   * phase = (hour - peakHour) / 24 * 2π
   * multiplier = center - amplitude * cos(phase)

  
  /**
   * 🌅 v3.8.0: Плавный циркадный множитель (синусоидальная кривая)
   * Заменяет ступенчатые 5 диапазонов на smooth continuous curve
   * 
   * Научное обоснование: Van Cauter 1997
   * - Пик инсулиновой чувствительности: 7-9 утра (multiplier ~0.85)
   * - Минимум чувствительности: 22-02 ночи (multiplier ~1.20)
   * - Переход плавный, привязан к 24-часовому ритму кортизола
   * 
   * Формула: косинусная волна с периодом 24 часа
   * center = (min + max) / 2 = 1.025
   * amplitude = (max - min) / 2 = 0.175
   * phase = (hour - peakHour) / 24 * 2π
   * multiplier = center - amplitude * cos(phase)
   * 
   * @param {number} hour - текущий час (0-23.99)
   * @returns {Object} { multiplier, period, desc, isSmooth }
   */
  const calculateCircadianMultiplier = (hour) => {
    const { peakHour, minMultiplier, maxMultiplier, descriptions } = CIRCADIAN_CONFIG;

    // Центр и амплитуда косинусной волны
    const center = (minMultiplier + maxMultiplier) / 2;  // 1.025
    const amplitude = (maxMultiplier - minMultiplier) / 2;  // 0.175

    // Фаза: 0 в момент peakHour (8:00), 2π через 24 часа
    // Косинус в 0 = 1, поэтому в peakHour получаем минимальный множитель (макс. чувствительность)
    const phase = ((hour - peakHour) / 24) * 2 * Math.PI;

    // Плавный множитель
    const smoothMultiplier = center - amplitude * Math.cos(phase);

    // Определяем период для описания
    let period = 'afternoon';
    let desc = descriptions.afternoon?.desc || 'Дневной баланс ☀️';

    if (hour >= 22 || hour < 5) {
      period = 'night';
      desc = descriptions.night?.desc || 'Ночной режим 🌙';
    } else if (hour >= 5 && hour < 7) {
      period = 'earlyMorning';
      desc = descriptions.earlyMorning?.desc || 'Пробуждение 🌅';
    } else if (hour >= 7 && hour < 10) {
      period = 'peakMorning';
      desc = descriptions.peakMorning?.desc || 'Пик чувствительности 🌞';
    } else if (hour >= 10 && hour < 14) {
      period = 'midday';
      desc = descriptions.midday?.desc || 'Обеденный период ☀️';
    } else if (hour >= 14 && hour < 18) {
      period = 'afternoon';
      desc = descriptions.afternoon?.desc || 'Дневной баланс 🌤️';
    } else if (hour >= 18 && hour < 21) {
      period = 'evening';
      desc = descriptions.evening?.desc || 'Вечерний спад 🌆';
    } else if (hour >= 21 && hour < 22) {
      period = 'lateEvening';
      desc = descriptions.lateEvening?.desc || 'Поздний вечер 🌙';
    }

    return {
      multiplier: smoothMultiplier,
      period,
      desc,
      isSmooth: true  // Флаг для отличия от legacy
    };
  };


  // === СОСТАВНЫЕ ФУНКЦИИ ДЛЯ ПРИЁМОВ ПИЩИ ===

  /**
   * Рассчитать факторы дня для конкретного приёма
   * @param {Object} dayData - данные дня
   * @param {number} mealHour - час приёма (0-23)
   * @returns {Object} { totalBonus, circadianMultiplier, details }
   */
  const calculateDayFactorsForMeal = (dayData = {}, mealHour = 12) => {
    const I = HEYS.InsulinWave?.__internals;
    const calculateSleepBonus = I?.calculateSleepBonus || (() => 0);
    const calculateSleepQualityBonus = I?.calculateSleepQualityBonus || (() => 0);
    const calculateHydrationBonus = I?.calculateHydrationBonus || (() => 0);
    const calculateAgeBonus = I?.calculateAgeBonus || (() => 0);
    const calculateBMIBonus = I?.calculateBMIBonus || (() => 0);
    const getGenderBonus = I?.getGenderBonus || (() => 0);
    const calculateStressBonus = I?.calculateStressBonus || (() => 0);

    // 🌅 Circadian ритм
    const circadian = calculateCircadianMultiplier(mealHour);

    // 😴 Недосып
    const sleepHours = dayData.sleepHours;
    const sleepBonus = calculateSleepBonus(sleepHours);

    // 🌟 Качество сна
    const sleepQuality = dayData.sleepQuality || 0;
    const sleepQualityBonus = calculateSleepQualityBonus(sleepQuality);

    // 💧 Гидратация
    const waterMl = dayData.waterMl || 0;
    const userWeight = dayData.profile?.weight || 70;
    const hydrationBonus = calculateHydrationBonus(waterMl, userWeight);

    // 👴 Возраст
    const age = dayData.profile?.age || 0;
    const ageBonus = calculateAgeBonus(age);

    // 🏋️ BMI
    const weight = dayData.profile?.weight || 0;
    const height = dayData.profile?.height || 0;
    const bmiBonus = calculateBMIBonus(weight, height);

    // 🚺🚹 Пол
    const gender = dayData.profile?.gender || '';
    const genderBonus = getGenderBonus(gender);

    // 😰 Стресс
    const stressLevel = dayData.stressAvg || 0;
    const stressBonus = calculateStressBonus(stressLevel);

    // 🌸 Менструальный цикл
    const cycleDay = dayData.cycleDay || null;
    const cycleMultiplier = HEYS.Cycle?.getInsulinWaveMultiplier?.(cycleDay) || 1;
    const cycleBonusValue = cycleMultiplier > 1 ? (cycleMultiplier - 1) : 0;

    // Суммируем бонусы
    // ⚠️ v3.0.0: age, bmi, gender ИСКЛЮЧЕНЫ — они уже в effectiveBaseWaveHours (Personal Baseline)
    const personalBonuses = sleepBonus + sleepQualityBonus + hydrationBonus + stressBonus + cycleBonusValue;

    return {
      totalBonus: personalBonuses,
      circadianMultiplier: circadian.multiplier,
      details: {
        circadian,
        sleepBonus,
        sleepQualityBonus,
        hydrationBonus,
        ageBonus,
        bmiBonus,
        genderBonus,
        stressBonus,
        cycleBonusValue
      }
    };
  };

  /**
   * Рассчитать факторы активности для конкретного приёма
   * @param {Array} trainings - тренировки дня
   * @param {number} mealMinutes - минуты приёма (от 00:00)
   * @param {number} householdMin - бытовая активность
   * @param {number} steps - шаги
   * @returns {Object} { totalBonus, details }
   */
  const calculateActivityFactorsForMeal = (trainings = [], mealMinutes = 0, householdMin = 0, steps = 0) => {
    // 🏃 Workout (общий за день)
    const workoutBonus = calculateWorkoutBonus(trainings);

    // 🏃‍♂️ Постпрандиальная тренировка
    const postprandialBonus = calculatePostprandialExerciseBonus(trainings, mealMinutes);

    // 🏡 NEAT
    const neatBonus = calculateNEATBonus(householdMin);

    // 👟 Шаги
    const stepsBonus = calculateStepsBonus(steps);

    const totalBonus = workoutBonus.bonus + postprandialBonus.bonus + neatBonus.bonus + stepsBonus.bonus;

    return {
      totalBonus,
      details: {
        workoutBonus,
        postprandialBonus,
        neatBonus,
        stepsBonus
      }
    };
  };

  // === ЭКСПОРТ ===
  HEYS.InsulinWave = HEYS.InsulinWave || {};
  HEYS.InsulinWave.Calc = {
    calculateMealNutrients,
    calculateCarbsMultiplier,
    calculateMultiplier,
    calculateWorkoutBonus,
    calculatePostprandialExerciseBonus,
    calculateNEATBonus,
    calculateStepsBonus,
    calculateCircadianMultiplier,
    calculateDayFactorsForMeal,
    calculateActivityFactorsForMeal,
    // Метаданные модуля
    __version: MODULE_VERSION,
    __name: MODULE_NAME
  };

})(typeof window !== 'undefined' ? window : global);
