/**
 * 📊 Примеры расчётов HEYS (dayTot, normAbs, optimum)
 * Источник: heys_day_v12.js
 */

// ═══════════════════════════════════════════════════════════════════
// 🔢 Суммирование дня (dayTot)
// ═══════════════════════════════════════════════════════════════════

function calculateDayTotals(meals, pIndex) {
  const dayTot = {
    kcal: 0,
    prot: 0,    // ⚠️ ВАЖНО: prot, НЕ protein!
    carbs: 0,
    simple: 0,
    complex: 0,
    fat: 0,
    bad: 0,
    good: 0,
    trans: 0,
    fiber: 0,
    gi: 0,      // Средневзвешенный
    harm: 0
  };
  
  let totalGrams = 0;
  let giWeightedSum = 0;
  
  meals.forEach(meal => {
    meal.items.forEach(item => {
      const product = pIndex.byId.get(item.product_id);
      if (!product) return;
      
      const factor = item.grams / 100;
      
      dayTot.kcal += (product.kcal100 || 0) * factor;
      dayTot.prot += (product.protein100 || 0) * factor;
      dayTot.carbs += ((product.simple100 || 0) + (product.complex100 || 0)) * factor;
      dayTot.simple += (product.simple100 || 0) * factor;
      dayTot.complex += (product.complex100 || 0) * factor;
      dayTot.fat += ((product.badFat100 || 0) + (product.goodFat100 || 0) + (product.trans100 || 0)) * factor;
      dayTot.bad += (product.badFat100 || 0) * factor;
      dayTot.good += (product.goodFat100 || 0) * factor;
      dayTot.trans += (product.trans100 || 0) * factor;
      dayTot.fiber += (product.fiber100 || 0) * factor;
      dayTot.harm += (product.harm || 0) * factor;
      
      // Для средневзвешенного ГИ
      const carbsInItem = ((product.simple100 || 0) + (product.complex100 || 0)) * factor;
      giWeightedSum += (product.gi || 0) * carbsInItem;
      totalGrams += carbsInItem;
    });
  });
  
  // Средневзвешенный ГИ
  dayTot.gi = totalGrams > 0 ? Math.round(giWeightedSum / totalGrams) : 0;
  
  return dayTot;
}

// ═══════════════════════════════════════════════════════════════════
// 📐 Расчёт норм (normAbs)
// ═══════════════════════════════════════════════════════════════════

function calculateNormAbs(optimum, norms) {
  // norms из localStorage: carbsPct, proteinPct, simpleCarbPct, badFatPct...
  const { 
    carbsPct = 50, 
    proteinPct = 25, 
    simpleCarbPct = 30,
    badFatPct = 30,
    superbadFatPct = 5,
    fiberPct = 14
  } = norms;
  
  const fatPct = 100 - carbsPct - proteinPct;
  
  const normAbs = {
    kcal: optimum,
    carbs: optimum * carbsPct / 100 / 4,      // 4 ккал/г
    prot: optimum * proteinPct / 100 / 4,     // ⚠️ prot, НЕ protein!
    fat: optimum * fatPct / 100 / 9,          // 9 ккал/г
    simple: 0,
    complex: 0,
    bad: 0,
    good: 0,
    trans: 0,
    fiber: optimum / 1000 * fiberPct
  };
  
  // Детализация углеводов
  normAbs.simple = normAbs.carbs * simpleCarbPct / 100;
  normAbs.complex = normAbs.carbs - normAbs.simple;
  
  // Детализация жиров
  normAbs.bad = normAbs.fat * badFatPct / 100;
  normAbs.trans = normAbs.fat * superbadFatPct / 100;
  normAbs.good = normAbs.fat - normAbs.bad - normAbs.trans;
  
  return normAbs;
}

// ═══════════════════════════════════════════════════════════════════
// ⚡ Расчёт optimum (целевой калораж)
// ═══════════════════════════════════════════════════════════════════

function calculateOptimum(profile, day) {
  const { weight, height, age, gender } = profile;
  
  // BMR по Mifflin-St Jeor
  let bmr = 10 * weight + 6.25 * height - 5 * age;
  bmr += gender === 'Мужской' ? 5 : -161;
  
  // Активность (тренировки + шаги + бытовая)
  const trainingKcal = calculateTrainingKcal(day.trainings, weight);
  const stepsKcal = estimateStepsKcal(day.steps, weight);
  const householdKcal = (day.householdMin || 0) * 2.5 * weight / 60;
  
  const actTotal = trainingKcal + stepsKcal + householdKcal;
  const baseExpenditure = bmr + actTotal;
  
  // Дефицит/профицит
  const deficitPct = day.deficitPct ?? profile.deficitPctTarget ?? 0;
  const optimum = Math.round(baseExpenditure * (1 + deficitPct / 100));
  
  return optimum;
}

// ═══════════════════════════════════════════════════════════════════
// 📈 Ratio (выполнение нормы)
// ═══════════════════════════════════════════════════════════════════

function calculateRatio(dayTot, optimum) {
  if (!optimum || optimum <= 0) return 0;
  return dayTot.kcal / optimum;
}

// Зоны выполнения
function getRatioZone(ratio) {
  if (ratio >= 0.9 && ratio <= 1.1) return 'perfect';    // 🟢 В норме
  if (ratio >= 0.75 && ratio < 0.9) return 'under';      // 🟡 Недобор
  if (ratio > 1.1 && ratio <= 1.25) return 'over';       // 🟡 Перебор
  if (ratio < 0.75) return 'crash';                       // 🔴 Сильный недобор
  return 'excess';                                        // 🔴 Сильный перебор
}
