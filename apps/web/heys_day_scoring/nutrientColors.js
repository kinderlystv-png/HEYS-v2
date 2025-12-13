// heys_day_scoring/nutrientColors.js — Nutrient color & tooltip for meal summary
// Extracted from heys_day_v12.js (lines 683-893) for Phase 2 refactoring

;(function(global){
  'use strict';
  
  const HEYS = global.HEYS = global.HEYS || {};
  HEYS.dayScoring = HEYS.dayScoring || {};
  
  // Import constants
  const scoring = HEYS.dayScoring || {};
  const NUTRIENT_COLORS = scoring.NUTRIENT_COLORS || {
    good: '#16a34a',
    medium: '#ca8a04',
    bad: '#dc2626'
  };
  
  /**
   * Получить цвет для значения нутриента в сводке приёма
   * @param {string} nutrient - тип нутриента
   * @param {number} value - значение
   * @param {object} totals - все totals приёма для контекста
   * @returns {string|null} - цвет или null (дефолтный)
   */
  function getNutrientColor(nutrient, value, totals = {}) {
    const v = +value || 0;
    const { kcal = 0, carbs = 0, simple = 0, complex = 0, prot = 0, fat = 0, bad = 0, good = 0, trans = 0, fiber = 0 } = totals;
    
    switch (nutrient) {
      // === КАЛОРИИ (за приём) ===
      case 'kcal':
        if (v <= 0) return null;
        if (v <= 150) return NUTRIENT_COLORS.good;      // Лёгкий перекус
        if (v <= 500) return null;                       // Нормально
        if (v <= 700) return NUTRIENT_COLORS.medium;    // Тяжеловато
        return NUTRIENT_COLORS.bad;                      // Переедание за приём
      
      // === УГЛЕВОДЫ (за приём) ===
      case 'carbs':
        if (v <= 0) return null;
        if (v <= 60) return NUTRIENT_COLORS.good;       // Норма
        if (v <= 100) return NUTRIENT_COLORS.medium;    // Много
        return NUTRIENT_COLORS.bad;                      // Слишком много
      
      // === ПРОСТЫЕ УГЛЕВОДЫ (за приём) ===
      case 'simple':
        if (v <= 0) return NUTRIENT_COLORS.good;        // Нет простых = отлично
        if (v <= 10) return NUTRIENT_COLORS.good;       // Минимум
        if (v <= 25) return NUTRIENT_COLORS.medium;     // Терпимо
        return NUTRIENT_COLORS.bad;                      // Много сахара
      
      // === СЛОЖНЫЕ УГЛЕВОДЫ (за приём) ===
      case 'complex':
        if (v <= 0) return null;
        if (v >= 30 && carbs > 0 && v / carbs >= 0.7) return NUTRIENT_COLORS.good;  // Хорошо — сложных много
        return null;                                     // Нейтрально
      
      // === СООТНОШЕНИЕ ПРОСТЫЕ/СЛОЖНЫЕ ===
      case 'simple_complex_ratio':
        if (carbs <= 5) return null;                    // Мало углеводов — неважно
        const simpleRatio = simple / carbs;
        if (simpleRatio <= 0.3) return NUTRIENT_COLORS.good;   // Отлично
        if (simpleRatio <= 0.5) return NUTRIENT_COLORS.medium; // Терпимо
        return NUTRIENT_COLORS.bad;                             // Плохо
      
      // === БЕЛОК (за приём) ===
      case 'prot':
        if (v <= 0) return null;
        if (v >= 20 && v <= 40) return NUTRIENT_COLORS.good;   // Оптимум
        if (v >= 10 && v <= 50) return null;                    // Нормально
        if (v < 10 && kcal > 200) return NUTRIENT_COLORS.medium; // Мало белка для сытного приёма
        if (v > 50) return NUTRIENT_COLORS.medium;              // Много — избыток не усвоится
        return null;
      
      // === ЖИРЫ (за приём) ===
      case 'fat':
        if (v <= 0) return null;
        if (v <= 20) return NUTRIENT_COLORS.good;       // Норма
        if (v <= 35) return null;                        // Нормально
        if (v <= 50) return NUTRIENT_COLORS.medium;     // Много
        return NUTRIENT_COLORS.bad;                      // Очень много
      
      // === ВРЕДНЫЕ ЖИРЫ ===
      case 'bad':
        if (v <= 0) return NUTRIENT_COLORS.good;        // Нет = отлично
        if (v <= 5) return null;                         // Минимум
        if (v <= 10) return NUTRIENT_COLORS.medium;     // Терпимо
        return NUTRIENT_COLORS.bad;                      // Много
      
      // === ПОЛЕЗНЫЕ ЖИРЫ ===
      case 'good':
        if (fat <= 0) return null;
        if (v >= fat * 0.6) return NUTRIENT_COLORS.good;  // >60% полезных
        if (v >= fat * 0.4) return null;                   // 40-60%
        return NUTRIENT_COLORS.medium;                     // <40% полезных
      
      // === ТРАНС-ЖИРЫ ===
      case 'trans':
        if (v <= 0) return NUTRIENT_COLORS.good;        // Нет = идеально
        if (v <= 0.5) return NUTRIENT_COLORS.medium;    // Минимум
        return NUTRIENT_COLORS.bad;                      // Любое количество плохо
      
      // === СООТНОШЕНИЕ ЖИРОВ ===
      case 'fat_ratio':
        if (fat <= 3) return null;                       // Мало жиров — неважно
        const goodRatio = good / fat;
        const badRatio = bad / fat;
        if (goodRatio >= 0.6 && trans <= 0) return NUTRIENT_COLORS.good;
        if (badRatio > 0.5 || trans > 0.5) return NUTRIENT_COLORS.bad;
        return NUTRIENT_COLORS.medium;
      
      // === КЛЕТЧАТКА ===
      case 'fiber':
        if (v <= 0) return null;
        if (v >= 8) return NUTRIENT_COLORS.good;        // Отлично
        if (v >= 4) return null;                         // Нормально
        if (kcal > 300 && v < 2) return NUTRIENT_COLORS.medium; // Мало для сытного приёма
        return null;
      
      // === ГЛИКЕМИЧЕСКИЙ ИНДЕКС ===
      case 'gi':
        if (v <= 0 || carbs <= 5) return null;          // Нет углеводов — GI неважен
        if (v <= 40) return NUTRIENT_COLORS.good;       // Низкий
        if (v <= 55) return NUTRIENT_COLORS.good;       // Умеренный — хорошо
        if (v <= 70) return NUTRIENT_COLORS.medium;     // Средний
        return NUTRIENT_COLORS.bad;                      // Высокий
      
      // === ВРЕДНОСТЬ ===
      case 'harm':
        if (v <= 0) return NUTRIENT_COLORS.good;        // Полезная еда
        if (v <= 2) return NUTRIENT_COLORS.good;        // Минимально
        if (v <= 4) return null;                         // Нормально
        if (v <= 6) return NUTRIENT_COLORS.medium;      // Терпимо
        return NUTRIENT_COLORS.bad;                      // Вредно
      
      default:
        return null;
    }
  }

  /**
   * Получить tooltip для значения нутриента (объяснение цвета)
   */
  function getNutrientTooltip(nutrient, value, totals = {}) {
    const v = +value || 0;
    const { kcal = 0, carbs = 0, simple = 0, fat = 0, bad = 0, good = 0, trans = 0 } = totals;
    
    switch (nutrient) {
      case 'kcal':
        if (v <= 0) return 'Нет калорий';
        if (v <= 150) return '✅ Лёгкий приём (≤150 ккал)';
        if (v <= 500) return 'Нормальный приём';
        if (v <= 700) return '⚠️ Много для одного приёма (500-700 ккал)';
        return '❌ Переедание (>700 ккал за раз)';
      
      case 'carbs':
        if (v <= 0) return 'Без углеводов';
        if (v <= 60) return '✅ Умеренно углеводов (≤60г)';
        if (v <= 100) return '⚠️ Много углеводов (60-100г)';
        return '❌ Очень много углеводов (>100г)';
      
      case 'simple':
        if (v <= 0) return '✅ Без простых углеводов — идеально!';
        if (v <= 10) return '✅ Минимум простых (≤10г)';
        if (v <= 25) return '⚠️ Терпимо простых (10-25г)';
        return '❌ Много сахара (>25г) — инсулиновый скачок';
      
      case 'complex':
        if (v <= 0) return 'Без сложных углеводов';
        if (carbs > 0 && v / carbs >= 0.7) return '✅ Отлично! Сложных ≥70%';
        return 'Сложные углеводы';
      
      case 'prot':
        if (v <= 0) return 'Без белка';
        if (v >= 20 && v <= 40) return '✅ Оптимум белка (20-40г)';
        if (v < 10 && kcal > 200) return '⚠️ Мало белка для сытного приёма';
        if (v > 50) return '⚠️ Много белка (>50г) — избыток не усвоится';
        return 'Белок в норме';
      
      case 'fat':
        if (v <= 0) return 'Без жиров';
        if (v <= 20) return '✅ Умеренно жиров (≤20г)';
        if (v <= 35) return 'Жиры в норме';
        if (v <= 50) return '⚠️ Много жиров (35-50г)';
        return '❌ Очень много жиров (>50г)';
      
      case 'bad':
        if (v <= 0) return '✅ Без вредных жиров — отлично!';
        if (v <= 5) return 'Минимум вредных жиров';
        if (v <= 10) return '⚠️ Терпимо вредных жиров (5-10г)';
        return '❌ Много вредных жиров (>10г)';
      
      case 'good':
        if (fat <= 0) return 'Нет жиров';
        if (v >= fat * 0.6) return '✅ Полезных жиров ≥60%';
        if (v >= fat * 0.4) return 'Полезные жиры в норме';
        return '⚠️ Мало полезных жиров (<40%)';
      
      case 'trans':
        if (v <= 0) return '✅ Без транс-жиров — идеально!';
        if (v <= 0.5) return '⚠️ Есть транс-жиры (≤0.5г)';
        return '❌ Транс-жиры опасны (>0.5г)';
      
      case 'fiber':
        if (v <= 0) return 'Без клетчатки';
        if (v >= 8) return '✅ Отлично! Много клетчатки (≥8г)';
        if (v >= 4) return 'Клетчатка в норме';
        if (kcal > 300 && v < 2) return '⚠️ Мало клетчатки для сытного приёма';
        return 'Клетчатка';
      
      case 'gi':
        if (carbs <= 5) return 'Мало углеводов — ГИ неважен';
        if (v <= 40) return '✅ Низкий ГИ (≤40) — медленные углеводы';
        if (v <= 55) return '✅ Умеренный ГИ (40-55)';
        if (v <= 70) return '⚠️ Средний ГИ (55-70) — инсулин повышен';
        return '❌ Высокий ГИ (>70) — быстрый сахар в крови';
      
      case 'harm':
        if (v <= 0) return '✅ Полезная еда';
        if (v <= 2) return '✅ Минимальный вред';
        if (v <= 4) return 'Умеренный вред';
        if (v <= 6) return '⚠️ Заметный вред (4-6)';
        return '❌ Вредная еда (>6)';
      
      default:
        return null;
    }
  }
  
  // === EXPORT ===
  HEYS.dayScoring.getNutrientColor = getNutrientColor;
  HEYS.dayScoring.getNutrientTooltip = getNutrientTooltip;
  
  console.log('✅ heys_day_scoring/nutrientColors.js loaded');
  
})(typeof window !== 'undefined' ? window : global);
