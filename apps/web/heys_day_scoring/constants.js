// heys_day_scoring/constants.js — Scoring constants
// Extracted from heys_day_v12.js (lines 543-681) for Phase 2 refactoring

;(function(global){
  'use strict';
  
  const HEYS = global.HEYS = global.HEYS || {};
  HEYS.dayScoring = HEYS.dayScoring || {};
  
  // === MEAL SCORING CONSTANTS ===
  
  // Единые абсолютные лимиты калорий (независимо от типа)
  const MEAL_KCAL_LIMITS = {
    light:  { max: 200 },   // Лёгкий приём
    normal: { max: 600 },   // Нормальный
    heavy:  { max: 800 },   // Тяжёлый (но ещё ок)
    excess: { max: 1000 }   // Переедание
  };

  // Унифицированные идеальные макросы — одинаковые для всех типов
  const IDEAL_MACROS_UNIFIED = {
    protPct: 0.25,   // 25% калорий из белка
    carbPct: 0.45,   // 45% из углеводов
    fatPct: 0.30,    // 30% из жиров
    minProtLight: 10,  // Минимум белка для лёгкого приёма (<200 ккал)
    minProtNormal: 15  // Минимум белка для нормального приёма (>200 ккал)
  };
  
  // === НАУЧНЫЕ КОЭФФИЦИЕНТЫ ИЗ ИНСУЛИНОВОЙ ВОЛНЫ ===
  // Источники: Brand-Miller 2003, Van Cauter 1997, Flood-Obbagy 2009
  
  // 🌅 Циркадные множители — метаболизм меняется в течение дня
  // Утром еда усваивается лучше (×0.9), ночью хуже (×1.2)
  const CIRCADIAN_MEAL_BONUS = {
    morning:   { from: 6, to: 10, bonus: 3, desc: '🌅 Утро — лучшее время' },
    midday:    { from: 10, to: 14, bonus: 2, desc: '🌞 Обеденное время' },
    afternoon: { from: 14, to: 18, bonus: 0, desc: 'Дневное время' },
    evening:   { from: 18, to: 21, bonus: 0, desc: 'Вечер' },
    lateEvening: { from: 21, to: 23, bonus: -2, desc: '⏰ Поздний вечер' },
    night:     { from: 23, to: 6, bonus: -5, desc: '🌙 Ночь' }
  };
  
  // 🥤 Жидкая пища — быстрый всплеск инсулина (Flood-Obbagy 2009)
  // Пик на 35% выше, но волна короче. Для качества еды — это минус.
  const LIQUID_FOOD_PATTERNS = [
    /сок\b/i, /\bсока\b/i, /\bсоки\b/i,
    /смузи/i, /коктейль/i, /shake/i,
    /кефир/i, /ряженка/i, /айран/i, /тан\b/i,
    /йогурт.*питьевой/i, /питьевой.*йогурт/i,
    /бульон/i, /суп.*пюре/i, /крем.*суп/i,
    /кола/i, /пепси/i, /фанта/i, /спрайт/i, /лимонад/i, /газировка/i,
    /энергетик/i, /energy/i,
    /протеин.*коктейль/i, /protein.*shake/i
  ];
  const LIQUID_FOOD_PENALTY = 5; // -5 баллов за преобладание жидких калорий
  
  // 🧬 GL-based качество углеводов (Brand-Miller 2003)
  // GL = GI × углеводы / 100 — лучший предиктор инсулинового ответа
  const GL_QUALITY_THRESHOLDS = {
    veryLow: { max: 5, bonus: 3, desc: 'Минимальный инсулиновый ответ' },
    low: { max: 10, bonus: 2, desc: 'Низкий инсулиновый ответ' },
    medium: { max: 20, bonus: 0, desc: 'Умеренный ответ' },
    high: { max: 30, bonus: -2, desc: 'Высокий ответ' },
    veryHigh: { max: Infinity, bonus: -4, desc: 'Очень высокий ответ' }
  };
  
  // Legacy константы для совместимости (не используются в оценке!)
  const MEAL_KCAL_DISTRIBUTION = {
    breakfast: { minPct: 0.15, maxPct: 0.35 },
    snack1:    { minPct: 0.05, maxPct: 0.25 },
    lunch:     { minPct: 0.25, maxPct: 0.40 },
    snack2:    { minPct: 0.05, maxPct: 0.25 },
    dinner:    { minPct: 0.15, maxPct: 0.35 },
    snack3:    { minPct: 0.02, maxPct: 0.15 },
    night:     { minPct: 0.00, maxPct: 0.15 }
  };
  const MEAL_KCAL_ABSOLUTE = MEAL_KCAL_LIMITS; // Алиас
  const IDEAL_MACROS = { // Legacy алиас
    breakfast: IDEAL_MACROS_UNIFIED,
    lunch: IDEAL_MACROS_UNIFIED,
    dinner: IDEAL_MACROS_UNIFIED,
    snack: IDEAL_MACROS_UNIFIED,
    night: IDEAL_MACROS_UNIFIED
  };

  // === Цветовая оценка нутриентов для сводки приёма ===
  const NUTRIENT_COLORS = {
    good: '#16a34a',    // зелёный
    medium: '#ca8a04',  // жёлтый
    bad: '#dc2626'      // красный
  };
  
  // === EXPORT ===
  HEYS.dayScoring.MEAL_KCAL_LIMITS = MEAL_KCAL_LIMITS;
  HEYS.dayScoring.IDEAL_MACROS_UNIFIED = IDEAL_MACROS_UNIFIED;
  HEYS.dayScoring.CIRCADIAN_MEAL_BONUS = CIRCADIAN_MEAL_BONUS;
  HEYS.dayScoring.LIQUID_FOOD_PATTERNS = LIQUID_FOOD_PATTERNS;
  HEYS.dayScoring.LIQUID_FOOD_PENALTY = LIQUID_FOOD_PENALTY;
  HEYS.dayScoring.GL_QUALITY_THRESHOLDS = GL_QUALITY_THRESHOLDS;
  HEYS.dayScoring.MEAL_KCAL_DISTRIBUTION = MEAL_KCAL_DISTRIBUTION;
  HEYS.dayScoring.MEAL_KCAL_ABSOLUTE = MEAL_KCAL_ABSOLUTE;
  HEYS.dayScoring.IDEAL_MACROS = IDEAL_MACROS;
  HEYS.dayScoring.NUTRIENT_COLORS = NUTRIENT_COLORS;
  
  console.log('✅ heys_day_scoring/constants.js loaded');
  
})(typeof window !== 'undefined' ? window : global);
