// heys_day_scoring/mealQualityScore.js — Meal quality scoring logic
// Extracted from heys_day_v12.js for modularity

;(function(global){
  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;
  
  // Import dependencies
  const M = HEYS.models || {};
  const U = HEYS.dayUtils || {};
  
  // Fallback helpers
  const parseTime = U.parseTime || ((t) => { 
    if(!t||typeof t!=='string'||!t.includes(':')) return null; 
    const [hh,mm]=t.split(':').map(x=>parseInt(x,10)); 
    if(isNaN(hh)||isNaN(mm)) return null; 
    return {hh:Math.max(0,Math.min(23,hh)),mm:Math.max(0,Math.min(59,mm))}; 
  });
  const getProductFromItem = U.getProductFromItem || (() => null);
  
  // === Constants ===
  
  // Распределение калорий по типам приёмов (% от дневной нормы)
  const MEAL_KCAL_DISTRIBUTION = {
    breakfast: { minPct: 0.20, maxPct: 0.30 },
    snack1:    { minPct: 0.05, maxPct: 0.12 },
    lunch:     { minPct: 0.30, maxPct: 0.40 },
    snack2:    { minPct: 0.05, maxPct: 0.12 },
    dinner:    { minPct: 0.20, maxPct: 0.30 },
    snack3:    { minPct: 0.02, maxPct: 0.08 },
    night:     { minPct: 0.00, maxPct: 0.05 }
  };

  // Абсолютные лимиты калорий по типам (независимо от нормы)
  const MEAL_KCAL_ABSOLUTE = {
    breakfast: { min: 300, max: 700, ideal: 500 },
    snack1:    { min: 50,  max: 200, ideal: 150 },
    lunch:     { min: 400, max: 800, ideal: 600 },
    snack2:    { min: 50,  max: 200, ideal: 150 },
    dinner:    { min: 300, max: 600, ideal: 450 },
    snack3:    { min: 50,  max: 150, ideal: 100 },
    night:     { min: 0,   max: 150, ideal: 0 }
  };

  // Идеальные пропорции макронутриентов по типам приёмов
  const IDEAL_MACROS = {
    breakfast: { protPct: 0.20, carbPct: 0.50, fatPct: 0.30, minProt: 15 },
    lunch:     { protPct: 0.30, carbPct: 0.40, fatPct: 0.30, minProt: 25 },
    dinner:    { protPct: 0.35, carbPct: 0.30, fatPct: 0.35, minProt: 25 },
    snack:     { protPct: 0.15, carbPct: 0.55, fatPct: 0.30, minProt: 5 },
    night:     { protPct: 0.40, carbPct: 0.20, fatPct: 0.40, minProt: 10 }
  };

  // === Helper functions ===
  
  const isMainMealType = (type) => ['breakfast', 'lunch', 'dinner'].includes(type);

  const safeRatio = (num, denom, fallback = 0.5) => {
    const n = +num || 0;
    const d = +denom || 0;
    if (d <= 0) return fallback;
    return n / d;
  };

  // === Scoring functions ===

  /**
   * Calculate calorie score for a meal
   * @param {number} kcal - calories in the meal
   * @param {string} mealType - type of meal (breakfast, lunch, dinner, snack, etc.)
   * @param {number} optimum - daily calorie target
   * @param {string} timeStr - meal time (HH:MM)
   * @returns {object} - {points, ok, issues}
   */
  function calcKcalScore(kcal, mealType, optimum, timeStr) {
    const dist = MEAL_KCAL_DISTRIBUTION[mealType] || MEAL_KCAL_DISTRIBUTION.snack1;
    const absLimits = MEAL_KCAL_ABSOLUTE[mealType] || MEAL_KCAL_ABSOLUTE.snack1;
    const opt = optimum > 0 ? optimum : 2000;
    const kcalPct = opt > 0 ? kcal / opt : 0;
    
    let points = 30;
    let ok = true;
    const issues = [];
    
    // === 1. Проверка по % от нормы ===
    if (kcalPct > dist.maxPct) {
      const excess = (kcalPct - dist.maxPct) / dist.maxPct;
      const penalty = Math.min(25, Math.round(excess * 50));
      points -= penalty;
      ok = false;
      issues.push('превышение');
    } else if (isMainMealType(mealType) && kcalPct < dist.minPct * 0.5) {
      points -= 10;
      issues.push('слишком мало');
    }
    
    // === 2. Проверка абсолютных лимитов ===
    if (kcal > absLimits.max) {
      const absPenalty = Math.min(15, Math.round((kcal - absLimits.max) / 100) * 5);
      points -= absPenalty;
      ok = false;
      issues.push('много ккал');
    }
    
    // === 3. Жёсткий штраф за ночные приёмы ===
    const parsed = parseTime(timeStr || '');
    if (parsed) {
      const hour = parsed.hh;
      
      // 22:00-05:00 — ночное время
      if (hour >= 22 || hour < 5) {
        if (kcal > 150) {
          const nightPenalty = Math.min(20, Math.round(kcal / 50));
          points -= nightPenalty;
          ok = false;
          issues.push('ночь');
        }
        if (kcal > 400) {
          points -= 10;
          issues.push('тяжёлая еда ночью');
        }
      }
      // 21:00-22:00 — поздний вечер
      else if (hour >= 21 && kcal > 300) {
        const latePenalty = Math.min(10, Math.round(kcal / 100));
        points -= latePenalty;
        ok = false;
        issues.push('поздно');
      }
    }
    
    return { points: Math.max(0, points), ok, issues };
  }

  /**
   * Calculate macro balance score
   */
  function calcMacroScore(prot, carbs, fat, kcal, mealType, timeStr) {
    const ideal = IDEAL_MACROS[mealType] || IDEAL_MACROS.snack;
    let points = 20;
    let proteinOk = true;
    const issues = [];
    
    const minProt = ideal.minProt || 10;
    if (prot >= minProt) {
      points += 5;
    } else if (isMainMealType(mealType)) {
      points -= 10;
      proteinOk = false;
      issues.push('мало белка');
    }
    
    if (prot > 50) {
      points -= 3;
      issues.push('много белка');
    }
    
    if (kcal > 0) {
      const protPct = (prot * 4) / kcal;
      const carbPct = (carbs * 4) / kcal;
      const fatPct = (fat * 9) / kcal;
      const deviation = Math.abs(protPct - ideal.protPct) + Math.abs(carbPct - ideal.carbPct) + Math.abs(fatPct - ideal.fatPct);
      points -= Math.min(10, Math.round(deviation * 15));
      
      const parsed = parseTime(timeStr || '');
      if (parsed && parsed.hh >= 20 && carbPct > 0.50) {
        points -= 5;
        issues.push('углеводы вечером');
      }
    }
    
    return { points: Math.max(0, Math.min(25, points)), proteinOk, issues };
  }

  /**
   * Calculate carb quality score
   */
  function calcCarbQuality(simple, complex) {
    const total = simple + complex;
    const simpleRatio = safeRatio(simple, total, 0.5);
    
    let points = 15;
    let ok = true;
    
    if (simpleRatio <= 0.30) {
      points = 15;
    } else if (simpleRatio <= 0.50) {
      points = 10;
      ok = simpleRatio <= 0.35;
    } else if (simpleRatio <= 0.70) {
      points = 5;
      ok = false;
    } else {
      points = 0;
      ok = false;
    }
    
    return { points, simpleRatio, ok };
  }

  /**
   * Calculate fat quality score
   */
  function calcFatQuality(bad, good, trans) {
    const total = bad + good + trans;
    const goodRatio = safeRatio(good, total, 0.5);
    const badRatio = safeRatio(bad, total, 0.5);
    
    let points = 15;
    let ok = true;
    
    if (goodRatio >= 0.60) {
      points = 15;
    } else if (goodRatio >= 0.40) {
      points = 10;
    } else {
      points = 5;
      ok = false;
    }
    
    if (badRatio > 0.50) {
      points -= 5;
      ok = false;
    }
    
    if (trans > 0.5) {
      points -= 5;
      ok = false;
    }
    
    return { points: Math.max(0, points), goodRatio, badRatio, ok };
  }

  /**
   * Calculate GI and harm score
   */
  function calcGiHarmScore(avgGI, avgHarm) {
    let points = 15;
    let ok = true;
    
    if (avgGI <= 55) {
      points = 15;
    } else if (avgGI <= 70) {
      points = 10;
    } else {
      points = 5;
      ok = false;
    }
    
    if (avgHarm > 5) {
      points -= Math.min(5, Math.round(avgHarm / 5));
      ok = avgHarm <= 10;
    }
    
    return { points: Math.max(0, points), ok };
  }

  /**
   * Get overall meal quality score (0-100)
   * @param {object} meal - meal object with items
   * @param {string} mealType - type of meal
   * @param {number} optimum - daily calorie target
   * @param {object} pIndex - product index
   * @returns {object} - {score, color, badges, details, avgGI, avgHarm, fiber, bonusPoints}
   */
  function getMealQualityScore(meal, mealType, optimum, pIndex) {
    if (!meal?.items || meal.items.length === 0) return null;
    
    const opt = optimum > 0 ? optimum : 2000;
    const totals = M.mealTotals ? M.mealTotals(meal, pIndex) : { kcal:0, carbs:0, simple:0, complex:0, prot:0, fat:0, bad:0, good:0, trans:0, fiber:0 };
    
    // GI взвешиваем по УГЛЕВОДАМ
    let gramSum = 0, carbSum = 0, giSum = 0, harmSum = 0;
    (meal.items || []).forEach(it => {
      const p = getProductFromItem(it, pIndex) || {};
      const g = +it.grams || 0;
      if (!g) return;
      
      const simple100 = +p.simple100 || 0;
      const complex100 = +p.complex100 || 0;
      const itemCarbs = (simple100 + complex100) * g / 100;
      
      const gi = p.gi ?? p.gi100 ?? p.GI ?? p.giIndex ?? 50;
      const harm = p.harm ?? p.harmScore ?? p.harm100 ?? p.harmPct ?? 0;
      
      gramSum += g;
      carbSum += itemCarbs;
      giSum += gi * itemCarbs;
      harmSum += harm * g;
    });
    const avgGI = carbSum > 0 ? giSum / carbSum : 50;
    const avgHarm = gramSum > 0 ? harmSum / gramSum : 0;
    
    const { kcal, prot, carbs, simple, complex, fat, bad, good, trans } = totals;
    let score = 0;
    const badges = [];
    
    const kcalScore = calcKcalScore(kcal, mealType, opt, meal.time);
    score += kcalScore.points;
    if (!kcalScore.ok) badges.push({ type: 'К', ok: false });
    if (kcalScore.issues?.includes('ночь') || kcalScore.issues?.includes('тяжёлая еда ночью')) {
      badges.push({ type: '🌙', ok: false, label: 'Поздно' });
    } else if (kcalScore.issues?.includes('поздно')) {
      badges.push({ type: '⏰', ok: false, label: 'Вечер' });
    }
    
    const macroScore = calcMacroScore(prot, carbs, fat, kcal, mealType, meal.time);
    score += macroScore.points;
    if (!macroScore.proteinOk) badges.push({ type: 'Б', ok: false });
    if (macroScore.issues?.includes('углеводы вечером')) badges.push({ type: 'У⬇', ok: false, label: 'Угл вечером' });
    
    const carbScore = calcCarbQuality(simple, complex);
    score += carbScore.points;
    
    const fatScore = calcFatQuality(bad, good, trans);
    score += fatScore.points;
    if (trans > 0.5) badges.push({ type: 'ТЖ', ok: false });
    
    const giHarmScore = calcGiHarmScore(avgGI, avgHarm);
    score += giHarmScore.points;
    if (avgGI > 70) badges.push({ type: 'ГИ', ok: false });
    if (avgHarm > 10) badges.push({ type: 'Вр', ok: false });
    
    // === БОНУСЫ (до +10 сверх 100) ===
    let bonusPoints = 0;
    const positiveBadges = [];
    
    const timeParsed = parseTime(meal.time || '');
    const hour = timeParsed?.hh || 12;
    
    if (mealType === 'breakfast' && hour >= 7 && hour <= 9) {
      bonusPoints += 2;
      positiveBadges.push({ type: '🌅', ok: true, label: 'Ранний завтрак' });
    }
    
    if (mealType === 'lunch' && hour >= 12 && hour <= 14) {
      bonusPoints += 1;
    }
    
    if (mealType === 'dinner' && hour >= 18 && hour < 20) {
      bonusPoints += 2;
      positiveBadges.push({ type: '🌇', ok: true, label: 'Ранний ужин' });
    }
    
    const fiber = totals.fiber || 0;
    if (fiber >= 5) {
      bonusPoints += 3;
      positiveBadges.push({ type: '🥗', ok: true, label: 'Клетчатка' });
    } else if (fiber >= 2) {
      bonusPoints += 1;
    }
    
    const itemCount = (meal.items || []).length;
    if (itemCount >= 4) {
      bonusPoints += 2;
      positiveBadges.push({ type: '🌈', ok: true, label: 'Разнообразие' });
    }
    
    const ideal = IDEAL_MACROS[mealType] || IDEAL_MACROS.snack;
    const idealProtMin = ideal.minProt || 10;
    const idealProtMax = idealProtMin * 2.5;
    if (prot >= idealProtMin && prot <= idealProtMax && macroScore.proteinOk) {
      bonusPoints += 2;
      positiveBadges.push({ type: '💪', ok: true, label: 'Белок' });
    }
    
    if (avgGI <= 50 && carbSum > 5) {
      bonusPoints += 2;
      positiveBadges.push({ type: '🎯', ok: true, label: 'Низкий ГИ' });
    }
    
    if (kcalScore.ok && macroScore.proteinOk && carbScore.ok && fatScore.ok && giHarmScore.ok) {
      bonusPoints += 3;
      positiveBadges.push({ type: '⭐', ok: true, label: 'Баланс' });
    }
    
    score += Math.min(10, bonusPoints);
    
    const finalScore = Math.min(100, Math.round(score));
    const color = finalScore >= 80 ? '#22c55e' : finalScore >= 50 ? '#eab308' : '#ef4444';
    
    const timeIssue = kcalScore.issues?.includes('ночь') || kcalScore.issues?.includes('тяжёлая еда ночью');
    const lateIssue = kcalScore.issues?.includes('поздно');
    const timeOk = !timeIssue && !lateIssue;
    const timeValue = timeIssue ? '⚠️ ночь' : lateIssue ? 'поздно' : '✓';
    
    const details = [
      { label: 'Калории', value: Math.round(kcal) + ' ккал', ok: kcalScore.ok },
      { label: 'Время', value: timeValue, ok: timeOk },
      { label: 'Белок', value: Math.round(prot) + 'г', ok: macroScore.proteinOk },
      { label: 'Углеводы', value: carbScore.simpleRatio <= 0.3 ? 'сложные ✓' : Math.round(carbScore.simpleRatio * 100) + '% простых', ok: carbScore.ok },
      { label: 'Жиры', value: fatScore.goodRatio >= 0.6 ? 'полезные ✓' : Math.round(fatScore.goodRatio * 100) + '% полезных', ok: fatScore.ok },
      { label: 'ГИ', value: Math.round(avgGI), ok: avgGI <= 70 },
      { label: 'Клетчатка', value: Math.round(fiber) + 'г', ok: fiber >= 2 }
    ];
    
    const allBadges = [...badges.slice(0, 2), ...positiveBadges.slice(0, 1)];
    
    return {
      score: finalScore,
      color,
      badges: allBadges.slice(0, 3),
      details,
      avgGI,
      avgHarm,
      fiber,
      bonusPoints
    };
  }

  /**
   * Get quality badges (legacy helper, may be removed)
   */
  function getMealQualityBadges(meal, mealType, optimum, pIndex) {
    const quality = getMealQualityScore(meal, mealType, optimum, pIndex);
    return quality ? quality.badges : [];
  }

  // === Export ===
  HEYS.DayScoring = {
    getMealQualityScore,
    getMealQualityBadges,
    calcKcalScore,
    calcMacroScore,
    calcCarbQuality,
    calcFatQuality,
    calcGiHarmScore,
    // Constants
    MEAL_KCAL_DISTRIBUTION,
    MEAL_KCAL_ABSOLUTE,
    IDEAL_MACROS,
    isMainMealType,
    safeRatio
  };

})(typeof window !== 'undefined' ? window : global);
