// heys_iw_v30.js — InsulinWave v3.0 Features Module
// Версия: 1.0.0 | Дата: 2026-01-12
//
// ОПИСАНИЕ:
// Модуль продвинутых фичей v3.0: непрерывная формула GL, персональный базовый период,
// meal stacking, и фазы волны (rise → plateau → decline).
// Выделен из heys_insulin_wave_v1.js для улучшения модульности.
//
// КОНЦЕПЦИИ v3.0:
// 1. Непрерывная формула GL (без ступенчатых категорий) — плавная кривая
// 2. Персональный базовый период волны (учёт возраста, BMI, пола)
// 3. Кумулятивный эффект приёмов (Meal Stacking) — перехлёст волн
// 4. Фазы волны (rise → plateau → decline → lipolysis)
// 5. Инсулиновый индекс (II) для молочных продуктов
//
// Научная база: Brand-Miller 2003, Wolever 2006, Van Cauter 1997

(function(global) {
  'use strict';
  
  const HEYS = global.HEYS = global.HEYS || {};
  
  // === ИМПОРТ КОНСТАНТ ===
  const I = HEYS.InsulinWave?.__internals;
  const GL_CONTINUOUS = I?.GL_CONTINUOUS;
  const PERSONAL_BASELINE = I?.PERSONAL_BASELINE;
  const MEAL_STACKING = I?.MEAL_STACKING;
  const WAVE_PHASES = I?.WAVE_PHASES;
  const INSULIN_INDEX_FACTORS = I?.INSULIN_INDEX_FACTORS;
  
  // === ИМПОРТ УТИЛИТ ===
  const utils = HEYS.InsulinWave?.utils;
  
  // === v3.0 ФУНКЦИИ ===
  
  /**
   * 📈 Непрерывный расчёт GL множителя (без ступенек)
   * Использует степенную функцию для плавного перехода
   * 
   * @param {number} gl - гликемическая нагрузка
   * @returns {number} множитель 0.15-1.30
   * 
   * Примеры:
   * - GL=0: 0.15 (волна 27 мин)
   * - GL=5: 0.35 (волна 63 мин)
   * - GL=7: 0.43 (волна 77 мин ≈ 1ч 17мин)
   * - GL=10: 0.52 (волна 94 мин ≈ 1ч 34мин)
   * - GL=15: 0.68 (волна 122 мин ≈ 2ч)
   * - GL=20: 0.82 (волна 148 мин ≈ 2ч 28мин)
   * - GL=30: 1.05 (волна 189 мин ≈ 3ч 9мин)
   * - GL=40+: 1.30 (волна 234 мин ≈ 3ч 54мин)
   */
  const calculateContinuousGLMultiplier = (gl) => {
    if (gl === null || gl === undefined || isNaN(gl)) return 1.0;
    if (gl <= 0) return GL_CONTINUOUS.minMultiplier;
    if (gl >= GL_CONTINUOUS.maxGL) return GL_CONTINUOUS.maxMultiplier;
    
    // Нормализуем GL в диапазон 0-1
    const normalized = gl / GL_CONTINUOUS.maxGL;
    
    // Степенная кривая: быстрый рост в начале, замедление к концу
    const curved = Math.pow(normalized, GL_CONTINUOUS.exponent);
    
    // Интерполяция между min и max
    const range = GL_CONTINUOUS.maxMultiplier - GL_CONTINUOUS.minMultiplier;
    const result = GL_CONTINUOUS.minMultiplier + range * curved;
    
    // Защита от NaN
    return isNaN(result) ? 1.0 : result;
  };

  /**
   * 👤 Рассчитать персональный базовый период волны
   * Учитывает возраст, BMI и пол пользователя
   * 
   * @param {Object} profile - профиль { age, weight, height, gender }
   * @returns {Object} { baseHours, factors, formula }
   */
  const calculatePersonalBaselineWave = (profile = {}) => {
    let baseHours = PERSONAL_BASELINE.defaultWaveHours;
    const factors = [];
    
    // 👴 Возраст
    const age = profile.age || 0;
    let ageFactor = 0;
    if (age > PERSONAL_BASELINE.ageEffect.startAge) {
      const yearsOver = age - PERSONAL_BASELINE.ageEffect.startAge;
      ageFactor = yearsOver * PERSONAL_BASELINE.ageEffect.bonusPerYear;
      factors.push({ 
        type: 'age', 
        value: ageFactor, 
        desc: `Возраст ${age} → +${Math.round(ageFactor * 100)}%` 
      });
    }
    
    // 🏋️ BMI
    const weight = profile.weight || 0;
    const height = profile.height || 0;
    let bmiFactor = 0;
    if (weight > 0 && height > 0) {
      const bmi = weight / Math.pow(height / 100, 2);
      if (bmi > PERSONAL_BASELINE.bmiEffect.startBMI) {
        const unitsOver = bmi - PERSONAL_BASELINE.bmiEffect.startBMI;
        bmiFactor = unitsOver * PERSONAL_BASELINE.bmiEffect.bonusPerUnit;
        factors.push({ 
          type: 'bmi', 
          value: bmiFactor, 
          desc: `BMI ${bmi.toFixed(1)} → +${Math.round(bmiFactor * 100)}%` 
        });
      } else if (bmi < PERSONAL_BASELINE.bmiEffect.startBMI) {
        // Низкий BMI = бонус (лучше чувствительность)
        const unitsUnder = PERSONAL_BASELINE.bmiEffect.startBMI - bmi;
        bmiFactor = -unitsUnder * PERSONAL_BASELINE.bmiEffect.bonusPerUnit * 0.5; // Половина эффекта
        if (bmiFactor < -0.10) bmiFactor = -0.10; // Максимум -10%
        factors.push({ 
          type: 'bmi', 
          value: bmiFactor, 
          desc: `BMI ${bmi.toFixed(1)} → ${Math.round(bmiFactor * 100)}%` 
        });
      }
    }
    
    // 🚺🚹 Пол
    const gender = (profile.gender || '').toLowerCase();
    let genderFactor = 0;
    if (gender === 'женский' || gender === 'female') {
      genderFactor = PERSONAL_BASELINE.genderEffect.female;
      factors.push({ type: 'gender', value: genderFactor, desc: 'Женский пол → -8%' });
    } else if (gender === 'мужской' || gender === 'male') {
      genderFactor = PERSONAL_BASELINE.genderEffect.male;
      factors.push({ type: 'gender', value: genderFactor, desc: 'Мужской пол → +5%' });
    }
    
    // Суммарный множитель
    const totalFactor = 1 + ageFactor + bmiFactor + genderFactor;
    baseHours = PERSONAL_BASELINE.defaultWaveHours * totalFactor;
    
    // Ограничиваем диапазон
    baseHours = Math.max(PERSONAL_BASELINE.minWaveHours, 
                         Math.min(PERSONAL_BASELINE.maxWaveHours, baseHours));
    
    // 🆕 v3.0.1: Разделяем стандартную базу и персональную надбавку
    // Это нужно для GL-скалирования: при низкой GL надбавка применяется частично
    const standardBase = PERSONAL_BASELINE.defaultWaveHours;
    const personalDelta = baseHours - standardBase; // Может быть + или -
    
    return {
      baseHours: Math.round(baseHours * 100) / 100,
      standardBase,  // 🆕 Стандартные 3ч
      personalDelta: Math.round(personalDelta * 100) / 100, // 🆕 Надбавка (+0.29ч или -0.24ч)
      factors,
      totalFactor: Math.round(totalFactor * 100) / 100,
      formula: `${PERSONAL_BASELINE.defaultWaveHours}ч × ${totalFactor.toFixed(2)} = ${baseHours.toFixed(1)}ч`
    };
  };

  /**
   * 🔗 Рассчитать кумулятивный эффект от перехлёста волн (Meal Stacking)
   * Если новый приём попадает в "активную" волну предыдущего,
   * 🔬 v3.7.4: НАУЧНАЯ КОРРЕКЦИЯ — "Second Meal Effect" (Wolever 2006)
   * Если инсулин уже в крови (от предыдущего приёма), нужно МЕНЬШЕ нового инсулина
   * Результат: волна КОРОЧЕ, не длиннее!
   * 
   * @param {number} prevWaveEndMinutes - время окончания предыдущей волны (от полуночи)
   * @param {number} newMealMinutes - время нового приёма (от полуночи)
   * @param {number} prevGL - GL предыдущего приёма
   * @returns {Object} { stackBonus, overlapMinutes, desc, hasStacking }
   */
  const calculateMealStackingBonus = (prevWaveEndMinutes, newMealMinutes, prevGL = 15) => {
    if (!MEAL_STACKING.enabled) {
      return { stackBonus: 0, overlapMinutes: 0, desc: null, hasStacking: false };
    }
    
    // Сколько минут новый приём "внутри" предыдущей волны
    let overlapMinutes = prevWaveEndMinutes - newMealMinutes;
    
    // Учёт перехода через полночь
    if (overlapMinutes < -12 * 60) {
      overlapMinutes += 24 * 60;
    }
    
    // Если нет перехлёста (новый приём после конца волны)
    if (overlapMinutes <= 0) {
      return { stackBonus: 0, overlapMinutes: 0, desc: null, hasStacking: false };
    }
    
    // 🔬 v3.7.4: Second Meal Effect — бонус ОТРИЦАТЕЛЬНЫЙ (укорачивает волну)
    // Чем больше перехлёст → тем больше инсулина уже в крови → меньше нужно нового
    // overlapMinutes=60 → ~50% эффекта, overlapMinutes=120 → ~100% эффекта
    const decayFactor = Math.min(1, overlapMinutes / 90 * MEAL_STACKING.decayRate);
    
    // GL предыдущего приёма: высокая GL = больше остаточного инсулина = сильнее эффект
    // Но делим на 30 вместо 20 — эффект не должен быть слишком сильным
    const glFactor = Math.min(1.2, prevGL / 30);
    
    // Итоговый бонус (ОТРИЦАТЕЛЬНЫЙ — волна короче!)
    let stackBonus = decayFactor * glFactor * MEAL_STACKING.maxStackBonus;
    // maxStackBonus = -0.15, значит stackBonus будет от 0 до -0.15
    stackBonus = Math.max(MEAL_STACKING.maxStackBonus, stackBonus);
    
    // Описание для UI
    const desc = stackBonus < -0.03
      ? `🔗 Second meal effect → волна ${Math.round(Math.abs(stackBonus) * 100)}% короче`
      : null;
    
    return {
      stackBonus: Math.round(stackBonus * 100) / 100,
      overlapMinutes,
      desc,
      hasStacking: stackBonus < -0.03
    };
  };

  /**
   * 📊 Рассчитать фазы волны (rise → plateau → decline)
   * 
   * @param {number} totalWaveMinutes - общая длина волны в минутах
   * @param {Object} nutrients - { fiber, protein, fat, hasLiquid }
   * @param {boolean} hasActivity - есть ли активность после еды
   * @returns {Object} { rise, plateau, decline, lipolysisStart, phases[] }
   */
  const calculateWavePhases = (totalWaveMinutes, nutrients = {}, hasActivity = false) => {
    // Rise (подъём)
    let riseMinutes = WAVE_PHASES.rise.baseMinutes;
    
    // Клетчатка замедляет подъём
    const fiber = nutrients.fiber || 0;
    riseMinutes += Math.floor(fiber / 5) * WAVE_PHASES.rise.fiberBonus;
    
    // Жидкое ускоряет подъём
    if (nutrients.hasLiquid) {
      riseMinutes = Math.round(riseMinutes * WAVE_PHASES.rise.liquidPenalty);
    }
    
    riseMinutes = Math.max(10, Math.min(45, riseMinutes));
    
    // Plateau (плато) — процент от оставшегося времени
    const remainingAfterRise = totalWaveMinutes - riseMinutes;
    let plateauPct = WAVE_PHASES.plateau.basePct;
    
    // Белок удлиняет плато
    const protein = nutrients.protein || 0;
    plateauPct += Math.floor(protein / 20) * WAVE_PHASES.plateau.proteinBonus;
    
    // Жиры удлиняют плато
    const fat = nutrients.fat || 0;
    plateauPct += Math.floor(fat / 15) * WAVE_PHASES.plateau.fatBonus;
    
    plateauPct = Math.min(0.55, plateauPct); // Максимум 55%
    
    const plateauMinutes = Math.round(remainingAfterRise * plateauPct);
    
    // Decline (спад)
    let declineMinutes = remainingAfterRise - plateauMinutes;
    
    // Активность ускоряет спад
    if (hasActivity) {
      declineMinutes = Math.round(declineMinutes * (1 + WAVE_PHASES.decline.activityBonus));
    }
    
    declineMinutes = Math.max(20, declineMinutes);
    
    // Время начала липолиза
    const lipolysisStart = riseMinutes + plateauMinutes + declineMinutes;
    
    return {
      rise: { duration: riseMinutes, label: 'Подъём', color: WAVE_PHASES.colors.rise },
      plateau: { duration: plateauMinutes, label: 'Плато', color: WAVE_PHASES.colors.plateau },
      decline: { duration: declineMinutes, label: 'Спад', color: WAVE_PHASES.colors.decline },
      lipolysisStart,
      totalCalculated: riseMinutes + plateauMinutes + declineMinutes,
      phases: [
        { name: 'rise', label: 'Подъём', minutes: riseMinutes, color: WAVE_PHASES.colors.rise },
        { name: 'plateau', label: 'Плато', minutes: plateauMinutes, color: WAVE_PHASES.colors.plateau },
        { name: 'decline', label: 'Спад', minutes: declineMinutes, color: WAVE_PHASES.colors.decline }
      ]
    };
  };

  /**
   * 🥛 Рассчитать инсулиновый индекс продукта
   * Для молочных и белковых продуктов II значительно выше GI
   * 
   * @param {Object} product - продукт
   * @param {string} insulinogenicType - тип инсулиногенности из getInsulinogenicBonus
   * @param {number} baseGL - базовая гликемическая нагрузка
   * @returns {Object} { effectiveGL, iiFactor, desc }
   */
  const calculateInsulinIndex = (insulinogenicType, baseGL) => {
    if (!insulinogenicType || !baseGL) {
      return { effectiveGL: baseGL || 0, iiFactor: 1.0, desc: null };
    }
    
    let iiFactor = 1.0;
    let desc = null;
    
    switch (insulinogenicType) {
      case 'liquidDairy':
        iiFactor = INSULIN_INDEX_FACTORS.liquidDairy;
        desc = '🥛 Молочные: II × 3';
        break;
      case 'softDairy':
        iiFactor = INSULIN_INDEX_FACTORS.softDairy;
        desc = '🥛 Йогурт/творог: II × 2.5';
        break;
      case 'hardDairy':
        iiFactor = INSULIN_INDEX_FACTORS.hardDairy;
        desc = '🧀 Сыр: II × 1.5';
        break;
      case 'protein':
        iiFactor = INSULIN_INDEX_FACTORS.pureProtein;
        desc = '🥩 Белок: II × 1.8';
        break;
      default:
        iiFactor = 1.0;
    }
    
    // Ограничиваем максимальное увеличение
    const maxIncrease = baseGL * INSULIN_INDEX_FACTORS.maxBoost;
    const boostedGL = Math.min(baseGL * iiFactor, baseGL + maxIncrease);
    
    // Для очень низкой GL не имеет смысла сильно увеличивать
    // При GL=2 даже ×3 даёт только GL=6 — волна всё равно короткая
    const effectiveGL = baseGL < 3 ? baseGL * Math.min(iiFactor, 1.5) : boostedGL;
    
    return {
      effectiveGL: Math.round(effectiveGL * 10) / 10,
      iiFactor,
      desc: iiFactor > 1 ? desc : null
    };
  };

  /**
   * 🔬 Получить полную картину факторов для отладки
   * @param {Object} params - все параметры расчёта
   * @returns {Object} детальная разбивка всех факторов
   */
  const getWaveCalculationDebug = (params) => {
    const { 
      gl, profile, prevMealEnd, mealTime, nutrients, 
      insulinogenicType, hasActivity 
    } = params;
    
    // 1. Персональный базовый период
    const personalBase = calculatePersonalBaselineWave(profile);
    
    // 2. GL множитель (непрерывный)
    const glMult = calculateContinuousGLMultiplier(gl);
    
    // 3. Инсулиновый индекс
    const iiResult = calculateInsulinIndex(insulinogenicType, gl);
    
    // 4. Meal stacking
    const stacking = prevMealEnd && mealTime 
      ? calculateMealStackingBonus(prevMealEnd, mealTime, gl)
      : { stackBonus: 0 };
    
    // 5. Примерная волна до фаз
    const approxWaveMinutes = personalBase.baseHours * 60 * glMult * (1 + stacking.stackBonus);
    
    // 6. Фазы
    const phases = calculateWavePhases(approxWaveMinutes, nutrients, hasActivity);
    
    return {
      personalBase,
      glMultiplier: glMult,
      effectiveGL: iiResult.effectiveGL,
      insulinIndex: iiResult,
      mealStacking: stacking,
      approxWaveMinutes,
      phases,
      formula: `${personalBase.baseHours}ч × ${glMult.toFixed(2)} × (1 + ${stacking.stackBonus}) = ${utils.formatDuration(approxWaveMinutes)}`
    };
  };
  
  // === ЭКСПОРТ ===
  HEYS.InsulinWave = HEYS.InsulinWave || {};
  HEYS.InsulinWave.V30 = {
    calculateContinuousGLMultiplier,
    calculatePersonalBaselineWave,
    calculateMealStackingBonus,
    calculateWavePhases,
    calculateInsulinIndex,
    getWaveCalculationDebug
  };
  
})(typeof window !== 'undefined' ? window : global);
