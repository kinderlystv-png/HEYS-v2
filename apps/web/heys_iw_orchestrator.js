// heys_iw_orchestrator.js — InsulinWave Orchestration Helper Functions
// Версия: 1.0.0 | Дата: 2026-01-12
//
// ОПИСАНИЕ:
// Вспомогательные функции для главной оркестрационной логики calculateInsulinWaveData.
// Выделены для уменьшения размера и сложности главного файла.
//
// ФУНКЦИИ:
// - prepareWaveData() - подготовка данных приёмов, сортировка
// - calculateWaveForMeal() - расчёт волны для одного приёма
// - buildWaveHistory() - построение истории волн за день
// - determineWaveStatus() - определение статуса волны

(function(global) {
  'use strict';
  
  const HEYS = global.HEYS = global.HEYS || {};
  
  // === MODULE VERSION ===
  const MODULE_VERSION = '1.0.0';
  const MODULE_NAME = 'InsulinWave.Orchestrator';
  
  // === ИМПОРТ ИЗ ДРУГИХ МОДУЛЕЙ ===
  const I = HEYS.InsulinWave?.__internals;
  const utils = HEYS.InsulinWave?.utils;
  const Calc = HEYS.InsulinWave?.Calc;
  const V30 = HEYS.InsulinWave?.V30;
  const STATUS_CONFIG = I?.STATUS_CONFIG;
  
  /**
   * Подготовка данных для расчёта волны
   * @param {Object} params - параметры
   * @returns {Object} подготовленные данные
   */
  const prepareWaveData = ({ meals, profile, dayData, baseWaveHours }) => {
    // Фильтруем приёмы с временем
    const mealsWithTime = meals.filter(m => m.time);
    
    // Персональная базовая волна
    const personalBaseline = V30?.calculatePersonalBaselineWave(profile);
    let effectiveBaseWaveHours = baseWaveHours;
    if (profile.age && personalBaseline?.baseHours && !isNaN(personalBaseline.baseHours)) {
      effectiveBaseWaveHours = personalBaseline.baseHours;
    }
    if (!effectiveBaseWaveHours || isNaN(effectiveBaseWaveHours)) {
      effectiveBaseWaveHours = 3;
    }
    
    // IR Score
    const irScore = I?.calculateIRScore(profile, dayData);
    const irScoreMultiplier = irScore?.waveMultiplier || 1.0;
    
    // Сортируем по времени (последний первый)
    const sorted = [...mealsWithTime].sort((a, b) => {
      const timeA = (a.time || '').replace(':', '');
      const timeB = (b.time || '').replace(':', '');
      return timeB.localeCompare(timeA);
    });
    
    return {
      mealsWithTime,
      sorted,
      effectiveBaseWaveHours,
      irScoreMultiplier,
      personalBaseline
    };
  };
  
  /**
   * Расчёт волны для одного приёма
   * @param {Object} params - параметры расчёта
   * @returns {Object} данные волны для приёма
   */
  const calculateWaveForMeal = ({
    meal,
    pIndex,
    getProductFromItem,
    effectiveBaseWaveHours,
    irScoreMultiplier,
    prevMeal,
    trainings,
    dayData,
    now
  }) => {
    // Meal Stacking
    let mealStackingResult = { bonus: 0, desc: null, hasStacking: false };
    if (prevMeal) {
      const prevNutrients = Calc?.calculateMealNutrients(prevMeal, pIndex, getProductFromItem);
      const prevWaveEnd = utils.timeToMinutes(prevMeal.time) + (effectiveBaseWaveHours * 60);
      const currentMealTime = utils.timeToMinutes(meal.time);
      mealStackingResult = V30?.calculateMealStackingBonus(prevWaveEnd, currentMealTime, prevNutrients?.glycemicLoad);
    }
    
    // Расчёт нутриентов
    const nutrients = Calc?.calculateMealNutrients(meal, pIndex, getProductFromItem);
    
    // Форма пищи
    const getFoodForm = I?.getFoodForm;
    const hasResistantStarch = I?.hasResistantStarch;
    let mealFoodForm = null;
    let hasResistantStarchInMeal = false;
    for (const item of (meal.items || [])) {
      const prod = getProductFromItem(item, pIndex);
      const itemForm = getFoodForm(prod);
      if (itemForm === 'liquid') mealFoodForm = 'liquid';
      else if (itemForm === 'processed' && mealFoodForm !== 'liquid') mealFoodForm = 'processed';
      else if (itemForm === 'whole' && !mealFoodForm) mealFoodForm = 'whole';
      if (hasResistantStarch(prod)) hasResistantStarchInMeal = true;
    }
    
    // Multipliers
    const multipliers = Calc?.calculateMultiplier(
      nutrients.avgGI, 
      nutrients.totalProtein, 
      nutrients.totalFiber, 
      nutrients.totalCarbs,
      nutrients.totalFat,
      nutrients.glycemicLoad,
      nutrients.hasLiquid,
      nutrients.insulinogenicBonus,
      mealFoodForm
    );
    
    // Workout bonus
    const workoutBonus = Calc?.calculateWorkoutBonus(trainings);
    
    // Activity context
    const calculateActivityContext = I?.calculateActivityContext;
    const activityContext = calculateActivityContext ? 
      calculateActivityContext({
        trainings,
        mealTime: meal.time,
        dayData,
        waveMinutes: effectiveBaseWaveHours * 60
      }) : { type: 'none', waveBonus: 0 };
    
    // Circadian multiplier
    const mealHour = parseFloat(meal.time.split(':')[0]) + parseFloat(meal.time.split(':')[1]) / 60;
    const circadianData = Calc?.calculateCircadianMultiplier(mealHour);
    
    // Wave phases
    const approxWaveMinutes = effectiveBaseWaveHours * 60 * multipliers.total * circadianData.multiplier;
    const wavePhases = V30?.calculateWavePhases(approxWaveMinutes, nutrients, activityContext.type !== 'none');
    
    return {
      nutrients,
      multipliers,
      mealStackingResult,
      mealFoodForm,
      hasResistantStarchInMeal,
      workoutBonus,
      activityContext,
      circadianData,
      wavePhases,
      mealHour
    };
  };
  
  /**
   * Построение истории волн за день
   * @param {Object} params - параметры
   * @returns {Array} массив волн
   */
  const buildWaveHistory = ({ sorted, waveData, pIndex, getProductFromItem, effectiveBaseWaveHours }) => {
    const waveHistory = [];
    
    for (const meal of sorted) {
      const nutrients = Calc?.calculateMealNutrients(meal, pIndex, getProductFromItem);
      const mealHour = parseFloat(meal.time.split(':')[0]) + parseFloat(meal.time.split(':')[1]) / 60;
      const circadian = Calc?.calculateCircadianMultiplier(mealHour);
      const mult = Calc?.calculateMultiplier(
        nutrients.avgGI,
        nutrients.totalProtein,
        nutrients.totalFiber,
        nutrients.totalCarbs,
        nutrients.totalFat,
        nutrients.glycemicLoad,
        nutrients.hasLiquid,
        nutrients.insulinogenicBonus
      );
      
      const duration = Math.round(effectiveBaseWaveHours * 60 * mult.total * circadian.multiplier);
      const startMin = utils.timeToMinutes(meal.time);
      const endMin = startMin + duration;
      
      waveHistory.push({
        time: meal.time,
        startMin,
        endMin,
        duration,
        gl: nutrients.glycemicLoad,
        gi: nutrients.avgGI,
        mealName: meal.name || 'Приём пищи'
      });
    }
    
    return waveHistory.reverse();
  };
  
  /**
   * Определение статуса волны
   * @param {Object} params - параметры
   * @returns {Object} статус и описание
   */
  const determineWaveStatus = ({ remaining, insulinWaveHours }) => {
    const minutesRemaining = Math.round(remaining);
    const totalMinutes = Math.round(insulinWaveHours * 60);
    const elapsed = totalMinutes - minutesRemaining;
    const progress = elapsed / totalMinutes;
    
    let status = 'active';
    let statusLabel = STATUS_CONFIG?.active?.label || 'Активная волна';
    let statusColor = STATUS_CONFIG?.active?.color || '#3b82f6';
    
    if (progress < 0.25) {
      status = 'rise';
      statusLabel = STATUS_CONFIG?.rise?.label || 'Подъём';
      statusColor = STATUS_CONFIG?.rise?.color || '#f97316';
    } else if (progress < 0.65) {
      status = 'plateau';
      statusLabel = STATUS_CONFIG?.plateau?.label || 'Плато';
      statusColor = STATUS_CONFIG?.plateau?.color || '#eab308';
    } else if (minutesRemaining > 0) {
      status = 'decline';
      statusLabel = STATUS_CONFIG?.decline?.label || 'Спад';
      statusColor = STATUS_CONFIG?.decline?.color || '#22c55e';
    } else {
      status = 'lipolysis';
      statusLabel = STATUS_CONFIG?.lipolysis?.label || 'Липолиз';
      statusColor = STATUS_CONFIG?.lipolysis?.color || '#10b981';
    }
    
    return { status, statusLabel, statusColor, progress };
  };
  
  // === ЭКСПОРТ ===
  HEYS.InsulinWave = HEYS.InsulinWave || {};
  HEYS.InsulinWave.Orchestrator = {
    prepareWaveData,
    calculateWaveForMeal,
    buildWaveHistory,
    determineWaveStatus,
    // Метаданные модуля
    __version: MODULE_VERSION,
    __name: MODULE_NAME
  };
  
})(typeof window !== 'undefined' ? window : global);
