// heys_day_scoring/nutrientColors.js — Nutrient color coding and tooltips
// Extracted from heys_day_v12.js for modularity

;(function(global){
  const HEYS = global.HEYS = global.HEYS || {};
  
  // === Constants ===
  const NUTRIENT_COLORS = {
    good: '#16a34a',    // зелёный
    medium: '#ca8a04',  // жёлтый
    bad: '#dc2626'      // красный
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
        if (v <= 150) return NUTRIENT_COLORS.good;
        if (v <= 500) return null;
        if (v <= 700) return NUTRIENT_COLORS.medium;
        return NUTRIENT_COLORS.bad;
      
      // === УГЛЕВОДЫ (за приём) ===
      case 'carbs':
        if (v <= 0) return null;
        if (v <= 60) return NUTRIENT_COLORS.good;
        if (v <= 100) return NUTRIENT_COLORS.medium;
        return NUTRIENT_COLORS.bad;
      
      // === ПРОСТЫЕ УГЛЕВОДЫ (за приём) ===
      case 'simple':
        if (v <= 0) return NUTRIENT_COLORS.good;
        if (v <= 10) return NUTRIENT_COLORS.good;
        if (v <= 25) return NUTRIENT_COLORS.medium;
        return NUTRIENT_COLORS.bad;
      
      // === СЛОЖНЫЕ УГЛЕВОДЫ (за приём) ===
      case 'complex':
        if (v <= 0) return null;
        if (v >= 30 && carbs > 0 && v / carbs >= 0.7) return NUTRIENT_COLORS.good;
        return null;
      
      // === СООТНОШЕНИЕ ПРОСТЫЕ/СЛОЖНЫЕ ===
      case 'simple_complex_ratio':
        if (carbs <= 5) return null;
        const simpleRatio = simple / carbs;
        if (simpleRatio <= 0.3) return NUTRIENT_COLORS.good;
        if (simpleRatio <= 0.5) return NUTRIENT_COLORS.medium;
        return NUTRIENT_COLORS.bad;
      
      // === БЕЛОК (за приём) ===
      case 'prot':
        if (v <= 0) return null;
        if (v >= 20 && v <= 40) return NUTRIENT_COLORS.good;
        if (v >= 10 && v <= 50) return null;
        if (v < 10 && kcal > 200) return NUTRIENT_COLORS.medium;
        if (v > 50) return NUTRIENT_COLORS.medium;
        return null;
      
      // === ЖИРЫ (за приём) ===
      case 'fat':
        if (v <= 0) return null;
        if (v <= 20) return NUTRIENT_COLORS.good;
        if (v <= 35) return null;
        if (v <= 50) return NUTRIENT_COLORS.medium;
        return NUTRIENT_COLORS.bad;
      
      // === ВРЕДНЫЕ ЖИРЫ ===
      case 'bad':
        if (v <= 0) return NUTRIENT_COLORS.good;
        if (v <= 5) return null;
        if (v <= 10) return NUTRIENT_COLORS.medium;
        return NUTRIENT_COLORS.bad;
      
      // === ПОЛЕЗНЫЕ ЖИРЫ ===
      case 'good':
        if (fat <= 0) return null;
        if (v >= fat * 0.6) return NUTRIENT_COLORS.good;
        if (v >= fat * 0.4) return null;
        return NUTRIENT_COLORS.medium;
      
      // === ТРАНС-ЖИРЫ ===
      case 'trans':
        if (v <= 0) return NUTRIENT_COLORS.good;
        if (v <= 0.5) return NUTRIENT_COLORS.medium;
        return NUTRIENT_COLORS.bad;
      
      // === СООТНОШЕНИЕ ЖИРОВ ===
      case 'fat_ratio':
        if (fat <= 3) return null;
        const goodRatio = good / fat;
        const badRatio = bad / fat;
        if (goodRatio >= 0.6 && trans <= 0) return NUTRIENT_COLORS.good;
        if (badRatio > 0.5 || trans > 0.5) return NUTRIENT_COLORS.bad;
        return NUTRIENT_COLORS.medium;
      
      // === КЛЕТЧАТКА ===
      case 'fiber':
        if (v <= 0) return null;
        if (v >= 8) return NUTRIENT_COLORS.good;
        if (v >= 4) return null;
        if (kcal > 300 && v < 2) return NUTRIENT_COLORS.medium;
        return null;
      
      // === ГЛИКЕМИЧЕСКИЙ ИНДЕКС ===
      case 'gi':
        if (v <= 0 || carbs <= 5) return null;
        if (v <= 40) return NUTRIENT_COLORS.good;
        if (v <= 55) return NUTRIENT_COLORS.good;
        if (v <= 70) return NUTRIENT_COLORS.medium;
        return NUTRIENT_COLORS.bad;
      
      // === ВРЕДНОСТЬ ===
      case 'harm':
        if (v <= 0) return NUTRIENT_COLORS.good;
        if (v <= 2) return NUTRIENT_COLORS.good;
        if (v <= 4) return null;
        if (v <= 6) return NUTRIENT_COLORS.medium;
        return NUTRIENT_COLORS.bad;
      
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

  /**
   * Получить цвет для СУТОЧНОГО значения (сравнение факта с нормой)
   * @param {string} nutrient - тип нутриента
   * @param {number} fact - фактическое значение
   * @param {number} norm - норма
   * @returns {string|null} - цвет или null
   */
  function getDailyNutrientColor(nutrient, fact, norm) {
    if (!norm || norm <= 0) return null;
    const pct = fact / norm;
    
    switch (nutrient) {
      case 'kcal':
        if (pct >= 0.90 && pct <= 1.10) return NUTRIENT_COLORS.good;
        if (pct >= 0.75 && pct <= 1.20) return NUTRIENT_COLORS.medium;
        return NUTRIENT_COLORS.bad;
      
      case 'prot':
        if (pct >= 0.90 && pct <= 1.30) return NUTRIENT_COLORS.good;
        if (pct >= 0.70) return NUTRIENT_COLORS.medium;
        return NUTRIENT_COLORS.bad;
      
      case 'carbs':
        if (pct >= 0.85 && pct <= 1.15) return NUTRIENT_COLORS.good;
        if (pct >= 0.60 && pct <= 1.30) return NUTRIENT_COLORS.medium;
        return NUTRIENT_COLORS.bad;
      
      case 'simple':
        if (pct <= 0.80) return NUTRIENT_COLORS.good;
        if (pct <= 1.10) return null;
        if (pct <= 1.30) return NUTRIENT_COLORS.medium;
        return NUTRIENT_COLORS.bad;
      
      case 'complex':
        if (pct >= 1.00) return NUTRIENT_COLORS.good;
        if (pct >= 0.70) return null;
        return NUTRIENT_COLORS.medium;
      
      case 'fat':
        if (pct >= 0.85 && pct <= 1.15) return NUTRIENT_COLORS.good;
        if (pct >= 0.60 && pct <= 1.30) return NUTRIENT_COLORS.medium;
        return NUTRIENT_COLORS.bad;
      
      case 'bad':
        if (pct <= 0.70) return NUTRIENT_COLORS.good;
        if (pct <= 1.00) return null;
        if (pct <= 1.30) return NUTRIENT_COLORS.medium;
        return NUTRIENT_COLORS.bad;
      
      case 'good':
        if (pct >= 1.00) return NUTRIENT_COLORS.good;
        if (pct >= 0.70) return null;
        return NUTRIENT_COLORS.medium;
      
      case 'trans':
        if (pct <= 0.50) return NUTRIENT_COLORS.good;
        if (pct <= 1.00) return NUTRIENT_COLORS.medium;
        return NUTRIENT_COLORS.bad;
      
      case 'fiber':
        if (pct >= 1.00) return NUTRIENT_COLORS.good;
        if (pct >= 0.70) return null;
        if (pct >= 0.40) return NUTRIENT_COLORS.medium;
        return NUTRIENT_COLORS.bad;
      
      case 'gi':
        if (pct <= 0.80) return NUTRIENT_COLORS.good;
        if (pct <= 1.10) return null;
        if (pct <= 1.30) return NUTRIENT_COLORS.medium;
        return NUTRIENT_COLORS.bad;
      
      case 'harm':
        if (pct <= 0.50) return NUTRIENT_COLORS.good;
        if (pct <= 1.00) return null;
        if (pct <= 1.50) return NUTRIENT_COLORS.medium;
        return NUTRIENT_COLORS.bad;
      
      default:
        return null;
    }
  }

  /**
   * Получить tooltip для СУТОЧНОГО значения
   */
  function getDailyNutrientTooltip(nutrient, fact, norm) {
    if (!norm || norm <= 0) return 'Норма не задана';
    const pct = Math.round((fact / norm) * 100);
    const diff = fact - norm;
    const diffStr = diff >= 0 ? '+' + Math.round(diff) : Math.round(diff);
    
    const baseInfo = `${Math.round(fact)} из ${Math.round(norm)} (${pct}%)`;
    
    switch (nutrient) {
      case 'kcal':
        if (pct >= 90 && pct <= 110) return `✅ Калории в норме: ${baseInfo}`;
        if (pct >= 75 && pct <= 120) return `⚠️ Калории ${pct < 90 ? 'ниже' : 'выше'} нормы: ${baseInfo}`;
        return `❌ Калории ${pct < 75 ? 'критично мало' : 'избыток'}: ${baseInfo}`;
      
      case 'prot':
        if (pct >= 90 && pct <= 130) return `✅ Белок отлично: ${baseInfo}`;
        if (pct >= 70) return `⚠️ Белка маловато: ${baseInfo}`;
        return `❌ Белка критично мало: ${baseInfo}`;
      
      case 'carbs':
        if (pct >= 85 && pct <= 115) return `✅ Углеводы в норме: ${baseInfo}`;
        if (pct >= 60 && pct <= 130) return `⚠️ Углеводы ${pct < 85 ? 'ниже' : 'выше'}: ${baseInfo}`;
        return `❌ Углеводы ${pct < 60 ? 'очень мало' : 'избыток'}: ${baseInfo}`;
      
      case 'simple':
        if (pct <= 80) return `✅ Простых углеводов мало: ${baseInfo}`;
        if (pct <= 110) return `Простые углеводы: ${baseInfo}`;
        if (pct <= 130) return `⚠️ Простых многовато: ${baseInfo}`;
        return `❌ Простых много: ${baseInfo}`;
      
      case 'complex':
        if (pct >= 100) return `✅ Сложных углеводов отлично: ${baseInfo}`;
        if (pct >= 70) return `Сложные углеводы: ${baseInfo}`;
        return `⚠️ Сложных маловато: ${baseInfo}`;
      
      case 'fat':
        if (pct >= 85 && pct <= 115) return `✅ Жиры в норме: ${baseInfo}`;
        if (pct >= 60 && pct <= 130) return `⚠️ Жиры ${pct < 85 ? 'ниже' : 'выше'}: ${baseInfo}`;
        return `❌ Жиры ${pct < 60 ? 'очень мало' : 'избыток'}: ${baseInfo}`;
      
      case 'bad':
        if (pct <= 70) return `✅ Вредных жиров мало: ${baseInfo}`;
        if (pct <= 100) return `Вредные жиры: ${baseInfo}`;
        if (pct <= 130) return `⚠️ Вредных многовато: ${baseInfo}`;
        return `❌ Вредных много: ${baseInfo}`;
      
      case 'good':
        if (pct >= 100) return `✅ Полезных жиров отлично: ${baseInfo}`;
        if (pct >= 70) return `Полезные жиры: ${baseInfo}`;
        return `⚠️ Полезных маловато: ${baseInfo}`;
      
      case 'trans':
        if (pct <= 50) return `✅ Транс-жиров мало: ${baseInfo}`;
        if (pct <= 100) return `⚠️ Транс-жиры: ${baseInfo}`;
        return `❌ Транс-жиров много: ${baseInfo}`;
      
      case 'fiber':
        if (pct >= 100) return `✅ Клетчатка отлично: ${baseInfo}`;
        if (pct >= 70) return `Клетчатка: ${baseInfo}`;
        if (pct >= 40) return `⚠️ Клетчатки маловато: ${baseInfo}`;
        return `❌ Клетчатки мало: ${baseInfo}`;
      
      case 'gi':
        if (pct <= 80) return `✅ Средний ГИ низкий: ${baseInfo}`;
        if (pct <= 110) return `Средний ГИ: ${baseInfo}`;
        return `⚠️ Высокий средний ГИ: ${baseInfo}`;
      
      case 'harm':
        if (pct <= 50) return `✅ Минимальный вред: ${baseInfo}`;
        if (pct <= 100) return `Вредность: ${baseInfo}`;
        return `❌ Высокая вредность: ${baseInfo}`;
      
      default:
        return baseInfo;
    }
  }

  // === Export ===
  HEYS.DayScoring = HEYS.DayScoring || {};
  Object.assign(HEYS.DayScoring, {
    getNutrientColor,
    getNutrientTooltip,
    getDailyNutrientColor,
    getDailyNutrientTooltip,
    NUTRIENT_COLORS
  });

})(typeof window !== 'undefined' ? window : global);
