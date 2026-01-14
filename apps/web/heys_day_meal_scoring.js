// heys_day_meal_scoring.js — Meal Scoring Logic for DayTab
// Extracted from heys_day_v12.js (Phase 4 - HIGH RISK)
// Contains: Meal quality scoring constants and functions
// 
// ⚠️ CRITICAL: This is business-critical logic
// All scoring functions MUST produce identical results after extraction
// Regression tests REQUIRED before deployment

;(function(global){
  const HEYS = global.HEYS = global.HEYS || {};
  
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
  // v53: смягчены ночные штрафы (т.к. calcKcalScore уже штрафует за ночь)
  const CIRCADIAN_MEAL_BONUS = {
    morning:   { from: 6, to: 10, bonus: 3, desc: '🌅 Утро — лучшее время' },
    midday:    { from: 10, to: 14, bonus: 2, desc: '🌞 Обеденное время' },
    afternoon: { from: 14, to: 18, bonus: 0, desc: 'Дневное время' },
    evening:   { from: 18, to: 21, bonus: 0, desc: 'Вечер' },
    lateEvening: { from: 21, to: 23, bonus: -1, desc: '⏰ Поздний вечер' },  // v53: было -2
    night:     { from: 23, to: 6, bonus: -3, desc: '🌙 Ночь' }  // v53: было -5, смягчено т.к. calcKcalScore уже штрафует
  };
  
  // 🥤 Жидкая пища — быстрый всплеск инсулина (Flood-Obbagy 2009)
  // Пик на 35% выше, но волна короче. Для качества еды — это минус.
  // v53: убраны полезные кисломолочные (кефир, ряженка, айран, тан) — у них белок + низкий GI
  const LIQUID_FOOD_PATTERNS = [
    /сок\b/i, /\bсока\b/i, /\bсоки\b/i,
    /смузи/i, /коктейль/i, /shake/i,
    // v53: кефир, ряженка, айран, тан убраны — это полезные продукты!
    /йогурт.*питьевой/i, /питьевой.*йогурт/i,
    /бульон/i, /суп.*пюре/i, /крем.*суп/i,
    /кола/i, /пепси/i, /фанта/i, /спрайт/i, /лимонад/i, /газировка/i,
    /энергетик/i, /energy/i,
    /протеин.*коктейль/i, /protein.*shake/i
  ];
  // v53: Добавлен список ИСКЛЮЧЕНИЙ — полезные жидкие продукты (белок, низкий GI)
  const HEALTHY_LIQUID_PATTERNS = [
    /кефир/i, /ряженка/i, /айран/i, /тан\b/i,
    /молоко/i, /простокваша/i, /варенец/i,
    /протеин/i, /protein/i  // Протеиновые коктейли — полезны!
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
  
  // Хелпер: проверка является ли продукт жидким (со штрафом)
  // v53: добавлена проверка HEALTHY_LIQUID_PATTERNS — полезные жидкие продукты НЕ штрафуются
  function isLiquidFood(productName, category) {
    if (!productName) return false;
    const name = String(productName);
    const cat = String(category || '');
    
    // v53: Сначала проверяем исключения — полезные жидкие продукты
    for (const pattern of HEALTHY_LIQUID_PATTERNS) {
      if (pattern.test(name)) return false;  // Это полезный продукт, не штрафуем!
    }
    
    // Проверяем категорию
    if (['Напитки', 'Соки', 'Молочные напитки'].includes(cat)) {
      // v53: Для категории "Молочные напитки" проверяем исключения ещё раз
      if (cat === 'Молочные напитки') {
        for (const pattern of HEALTHY_LIQUID_PATTERNS) {
          if (pattern.test(name)) return false;
        }
      }
      return true;
    }
    
    // Проверяем паттерны в названии
    for (const pattern of LIQUID_FOOD_PATTERNS) {
      if (pattern.test(name)) return true;
    }
    
    return false;
  }
  
  // Хелпер: расчёт GL для приёма
  function calculateMealGL(avgGI, totalCarbs) {
    if (!avgGI || !totalCarbs) return 0;
    return (avgGI * totalCarbs) / 100;
  }
  
  // Хелпер: получить циркадный бонус по времени
  function getCircadianBonus(hour) {
    for (const [period, config] of Object.entries(CIRCADIAN_MEAL_BONUS)) {
      if (config.from <= config.to) {
        // Обычный интервал (не пересекает полночь)
        if (hour >= config.from && hour < config.to) {
          return { bonus: config.bonus, period, desc: config.desc };
        }
      } else {
        // Интервал пересекает полночь (night: 23 → 6)
        if (hour >= config.from || hour < config.to) {
          return { bonus: config.bonus, period, desc: config.desc };
        }
      }
    }
    return { bonus: 0, period: 'afternoon', desc: 'Дневное время' };
  }
  
  // Хелпер: получить GL бонус
  function getGLQualityBonus(gl) {
    for (const [level, config] of Object.entries(GL_QUALITY_THRESHOLDS)) {
      if (gl <= config.max) {
        return { bonus: config.bonus, level, desc: config.desc };
      }
    }
    return { bonus: -4, level: 'veryHigh', desc: 'Очень высокий ответ' };
  }
  
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

  const safeRatio = (num, denom, fallback = 0.5) => {
    const n = +num || 0;
    const d = +denom || 0;
    if (d <= 0) return fallback;
    return n / d;
  };

  // === Цветовая оценка нутриентов для сводки приёма ===
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

  /**
   * Получить цвет для СУТОЧНОГО значения (сравнение факта с нормой)
   * @param {string} nutrient - тип нутриента
   * @param {number} fact - фактическое значение
   * @param {number} norm - норма
   * @returns {string|null} - цвет или null
   */
  function getDailyNutrientColor(nutrient, fact, norm) {
    if (!norm || norm <= 0) return null;
    const pct = fact / norm; // процент выполнения
    
    switch (nutrient) {
      // === КАЛОРИИ — ключевой параметр ===
      case 'kcal':
        if (pct >= 0.90 && pct <= 1.10) return NUTRIENT_COLORS.good;  // 90-110% — идеально
        if (pct >= 0.75 && pct <= 1.20) return NUTRIENT_COLORS.medium; // 75-120% — терпимо
        return NUTRIENT_COLORS.bad;                                     // <75% или >120%
      
      // === БЕЛОК — чем больше, тем лучше (до 150%) ===
      case 'prot':
        if (pct >= 0.90 && pct <= 1.30) return NUTRIENT_COLORS.good;  // 90-130% — отлично
        if (pct >= 0.70) return NUTRIENT_COLORS.medium;                // 70-90% — маловато
        return NUTRIENT_COLORS.bad;                                     // <70% — критично мало
      
      // === УГЛЕВОДЫ — близко к норме ===
      case 'carbs':
        if (pct >= 0.85 && pct <= 1.15) return NUTRIENT_COLORS.good;
        if (pct >= 0.60 && pct <= 1.30) return NUTRIENT_COLORS.medium;
        return NUTRIENT_COLORS.bad;
      
      // === ПРОСТЫЕ — чем меньше, тем лучше ===
      case 'simple':
        if (pct <= 0.80) return NUTRIENT_COLORS.good;                  // <80% нормы — отлично
        if (pct <= 1.10) return null;                                   // 80-110% — норма
        if (pct <= 1.30) return NUTRIENT_COLORS.medium;                // 110-130% — многовато
        return NUTRIENT_COLORS.bad;                                     // >130% — плохо
      
      // === СЛОЖНЫЕ — чем больше, тем лучше ===
      case 'complex':
        if (pct >= 1.00) return NUTRIENT_COLORS.good;                  // ≥100% — отлично
        if (pct >= 0.70) return null;                                   // 70-100% — норма
        return NUTRIENT_COLORS.medium;                                  // <70% — маловато
      
      // === ЖИРЫ — близко к норме ===
      case 'fat':
        if (pct >= 0.85 && pct <= 1.15) return NUTRIENT_COLORS.good;
        if (pct >= 0.60 && pct <= 1.30) return NUTRIENT_COLORS.medium;
        return NUTRIENT_COLORS.bad;
      
      // === ВРЕДНЫЕ ЖИРЫ — чем меньше, тем лучше ===
      case 'bad':
        if (pct <= 0.70) return NUTRIENT_COLORS.good;                  // <70% — отлично
        if (pct <= 1.00) return null;                                   // 70-100% — норма
        if (pct <= 1.30) return NUTRIENT_COLORS.medium;                // 100-130% — многовато
        return NUTRIENT_COLORS.bad;                                     // >130%
      
      // === ПОЛЕЗНЫЕ ЖИРЫ — чем больше, тем лучше ===
      case 'good':
        if (pct >= 1.00) return NUTRIENT_COLORS.good;
        if (pct >= 0.70) return null;
        return NUTRIENT_COLORS.medium;
      
      // === ТРАНС-ЖИРЫ — чем меньше, тем лучше (особо вредные) ===
      case 'trans':
        if (pct <= 0.50) return NUTRIENT_COLORS.good;                  // <50% — отлично
        if (pct <= 1.00) return NUTRIENT_COLORS.medium;                // 50-100%
        return NUTRIENT_COLORS.bad;                                     // >100%
      
      // === КЛЕТЧАТКА — чем больше, тем лучше ===
      case 'fiber':
        if (pct >= 1.00) return NUTRIENT_COLORS.good;                  // ≥100% — отлично
        if (pct >= 0.70) return null;                                   // 70-100% — норма
        if (pct >= 0.40) return NUTRIENT_COLORS.medium;                // 40-70% — маловато
        return NUTRIENT_COLORS.bad;                                     // <40%
      
      // === ГИ — чем ниже, тем лучше ===
      case 'gi':
        if (pct <= 0.80) return NUTRIENT_COLORS.good;                  // <80% от целевого
        if (pct <= 1.10) return null;                                   // 80-110%
        if (pct <= 1.30) return NUTRIENT_COLORS.medium;
        return NUTRIENT_COLORS.bad;
      
      // === ВРЕДНОСТЬ — чем меньше, тем лучше ===
      case 'harm':
        if (pct <= 0.50) return NUTRIENT_COLORS.good;                  // <50% — отлично
        if (pct <= 1.00) return null;                                   // 50-100% — норма
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
        if (pct < 90) return `⚠️ Недобор калорий: ${baseInfo}`;
        return `❌ Перебор калорий: ${baseInfo}`;
      
      case 'prot':
        if (pct >= 90) return `✅ Белок в норме: ${baseInfo}`;
        if (pct >= 70) return `⚠️ Маловато белка: ${baseInfo}`;
        return `❌ Мало белка: ${baseInfo}`;
      
      case 'carbs':
        if (pct >= 85 && pct <= 115) return `✅ Углеводы в норме: ${baseInfo}`;
        if (pct < 85) return `⚠️ Мало углеводов: ${baseInfo}`;
        return `⚠️ Много углеводов: ${baseInfo}`;
      
      case 'simple':
        if (pct <= 80) return `✅ Мало простых — отлично: ${baseInfo}`;
        if (pct <= 110) return `Простые углеводы: ${baseInfo}`;
        return `❌ Много простых углеводов: ${baseInfo}`;
      
      case 'complex':
        if (pct >= 100) return `✅ Достаточно сложных: ${baseInfo}`;
        return `Сложные углеводы: ${baseInfo}`;
      
      case 'fat':
        if (pct >= 85 && pct <= 115) return `✅ Жиры в норме: ${baseInfo}`;
        return `Жиры: ${baseInfo}`;
      
      case 'bad':
        if (pct <= 70) return `✅ Мало вредных жиров: ${baseInfo}`;
        if (pct <= 100) return `Вредные жиры: ${baseInfo}`;
        return `❌ Много вредных жиров: ${baseInfo}`;
      
      case 'good':
        if (pct >= 100) return `✅ Достаточно полезных жиров: ${baseInfo}`;
        return `Полезные жиры: ${baseInfo}`;
      
      case 'trans':
        if (pct <= 50) return `✅ Минимум транс-жиров: ${baseInfo}`;
        return `❌ Транс-жиры: ${baseInfo}`;
      
      case 'fiber':
        if (pct >= 100) return `✅ Достаточно клетчатки: ${baseInfo}`;
        if (pct >= 70) return `Клетчатка: ${baseInfo}`;
        return `⚠️ Мало клетчатки: ${baseInfo}`;
      
      case 'gi':
        if (pct <= 80) return `✅ Низкий средний ГИ: ${baseInfo}`;
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

  /**
   * calcKcalScore v2.0 — оценка калорийности приёма с учётом тренировочного контекста
   * 
   * @param {number} kcal - калории приёма
   * @param {string} mealType - тип приёма (не влияет на оценку)
   * @param {number} optimum - дневная норма (для контекста)
   * @param {string} timeStr - время приёма (HH:MM)
   * @param {Object} activityContext - контекст тренировки (опционально)
   * 
   * 🔬 Научное обоснование:
   * - Ivy & Kuo 1998: После тренировки повышенная утилизация нутриентов
   * - Burke 2017: Анаболическое окно расширяет допустимые калории на 50-100%
   * - Atherton & Smith 2012: Muscle protein synthesis требует субстрат
   */
  function calcKcalScore(kcal, mealType, optimum, timeStr, activityContext = null) {
    // === ОЦЕНКА НЕ ЗАВИСИТ ОТ ТИПА ПРИЁМА! ===
    // Только абсолютные значения, время и тренировочный контекст
    let points = 30;
    let ok = true;
    const issues = [];
    
    // === Training Context Analysis ===
    // Определяем контекст тренировки для корректировки лимитов
    const hasTrainingContext = activityContext && 
      (activityContext.type === 'peri' || activityContext.type === 'post' || activityContext.type === 'pre');
    
    // 🔬 После тренировки допускаем большие приёмы:
    // - peri (во время): +60% к лимиту (мышцы активно потребляют)
    // - post (после): +40% к лимиту (анаболическое окно)  
    // - pre (до): +20% к лимиту (энергия для тренировки)
    const kcalBoost = hasTrainingContext
      ? (activityContext.type === 'peri' ? 1.6 : 
         activityContext.type === 'post' ? 1.4 : 1.2)
      : 1.0;
    
    const adjustedLimit = 800 * kcalBoost;
    const adjustedOvereatLimit = 1000 * kcalBoost;
    
    // === 1. Проверка абсолютных лимитов ===
    // С учётом тренировочного контекста лимиты расширяются
    if (kcal > adjustedLimit) {
      const excess = (kcal - adjustedLimit) / 200; // Каждые 200 ккал сверх = -5
      const penalty = Math.min(15, Math.round(excess * 5));
      points -= penalty;
      ok = false;
      issues.push(hasTrainingContext ? 'много для восстановления' : 'много ккал');
    }
    // Переедание — даже с учётом тренировки
    if (kcal > adjustedOvereatLimit) {
      points -= 10; // Дополнительный штраф
      issues.push('переедание');
    }
    
    // === 2. Штраф за ночные приёмы ===
    // 🔬 Ночные штрафы отменяются после тренировки (nightPenaltyOverride)
    const nightPenaltyOverride = activityContext?.nightPenaltyOverride === true;
    
    const parsed = parseTime(timeStr || '');
    if (parsed && !nightPenaltyOverride) {
      const hour = parsed.hh;
      
      // 23:00-05:00 — ночное время
      if (hour >= 23 || hour < 5) {
        // Ночью приём > 300 ккал — небольшой штраф
        if (kcal > 300) {
          const nightPenalty = Math.min(10, Math.round((kcal - 300) / 100));
          points -= nightPenalty;
          ok = false;
          issues.push('ночь');
        }
        // Тяжёлый приём ночью (>700 ккал)
        if (kcal > 700) {
          points -= 5;
          issues.push('тяжёлая еда ночью');
        }
      }
      // 21:00-23:00 — поздний вечер (минимальный штраф)
      else if (hour >= 21 && kcal > 500) {
        const latePenalty = Math.min(5, Math.round((kcal - 500) / 150));
        points -= latePenalty;
        // ok остаётся true — это не критично
        issues.push('поздно');
      }
    }
    
    // === 3. Бонус за правильный тайминг после тренировки ===
    // 🔬 Правильный размер приёма в анаболическом окне = бонус
    if (hasTrainingContext && kcal >= 300 && kcal <= adjustedLimit) {
      points += 2; // Бонус за хороший приём после тренировки
    }
    
    return { 
      points: Math.max(0, Math.min(32, points)), // Max 32 с бонусом
      ok, 
      issues,
      trainingContextApplied: hasTrainingContext 
    };
  }

  /**
   * calcMacroScore v2.0 — оценка макросов с учётом тренировочного контекста
   * 
   * @param {number} prot - белок в граммах
   * @param {number} carbs - углеводы в граммах
   * @param {number} fat - жиры в граммах
   * @param {number} kcal - калории приёма
   * @param {string} mealType - тип приёма (не влияет на оценку)
   * @param {string} timeStr - время приёма (HH:MM)
   * @param {Object} activityContext - контекст тренировки (опционально)
   * 
   * 🔬 Научное обоснование:
   * - Phillips 2011 (PMID: 21289204): Оптимум белка после тренировки 25-40г
   * - Morton 2018: Muscle protein synthesis продолжается 24-48ч после тренировки
   * - Aragon 2013: Повышенные требования к белку в день тренировки
   */
  function calcMacroScore(prot, carbs, fat, kcal, mealType, timeStr, activityContext = null) {
    // === ОЦЕНКА НЕ ЗАВИСИТ ОТ ТИПА ПРИЁМА! ===
    const ideal = IDEAL_MACROS_UNIFIED;
    let points = 20; // Базовые баллы (из 25)
    let proteinOk = true;
    const issues = [];
    
    // === Training Context Analysis ===
    const hasTrainingContext = activityContext && 
      (activityContext.type === 'peri' || activityContext.type === 'post' || activityContext.type === 'pre');
    
    // 🔬 После тренировки повышенные требования к белку:
    // - post/peri: нужно минимум 25г белка для оптимального MPS
    // - pre: стандартные требования
    // - Также снимаем штраф за "много белка" — после тренировки это хорошо
    const trainingMinProt = (activityContext?.type === 'post' || activityContext?.type === 'peri') 
      ? 25 : ideal.minProtNormal;
    
    // v53: Снижен порог штрафа за белок с 300 до 150 ккал
    // Это важно: нельзя есть 250 ккал чистого сахара без штрафа
    const minProt = kcal > 200 
      ? (hasTrainingContext ? trainingMinProt : ideal.minProtNormal) 
      : ideal.minProtLight;
      
    if (prot >= minProt) {
      points += 5; // ✅ Бонус за достаточный белок
      // 🔬 Дополнительный бонус за белок в анаболическом окне
      if (hasTrainingContext && prot >= 25) {
        points += 2; // Бонус за правильный белок после тренировки
      }
    } else if (kcal > 150) {  // v53: было 300, теперь 150
      // Штраф за недостаток белка для приёмов >150 ккал
      // Исключение: очень маленькие приёмы (кофе с молоком) не штрафуются
      const proteinPenalty = hasTrainingContext ? 7 : 5; // Более строгий штраф после тренировки
      points -= proteinPenalty;
      proteinOk = false;
      issues.push(hasTrainingContext ? 'мало белка для восстановления' : 'мало белка');
    }
    
    // v53: Смягчён штраф за много белка — зависит от контекста
    // 🔬 После тренировки до 80г белка за приём — это нормально
    const maxProtThreshold = hasTrainingContext ? 80 : 60;
    if (prot > maxProtThreshold) {
      points -= 2;
      issues.push('много белка');
    }
    
    if (kcal > 0) {
      const protPct = (prot * 4) / kcal;
      const carbPct = (carbs * 4) / kcal;
      const fatPct = (fat * 9) / kcal;
      const deviation = Math.abs(protPct - ideal.protPct) + Math.abs(carbPct - ideal.carbPct) + Math.abs(fatPct - ideal.fatPct);
      points -= Math.min(10, Math.round(deviation * 15)); // max -10
      
      // Штраф за много углеводов вечером/ночью
      // 🔬 Снимается после интенсивной тренировки — нужно восполнить гликоген
      const nightCarbsAllowed = activityContext?.type === 'post' && activityContext?.trainingRef?.intensity === 'high';
      const parsed = parseTime(timeStr || '');
      if (parsed && parsed.hh >= 20 && carbPct > 0.50 && !nightCarbsAllowed) {
        points -= 5;
        issues.push('углеводы вечером');
      }
    }
    
    return { 
      points: Math.max(0, Math.min(27, points)), // Max 27 с бонусами
      proteinOk, 
      issues,
      trainingContextApplied: hasTrainingContext
    };
  }

  /**
   * 🧬 Адаптивный расчёт качества углеводов v2.0
   * 
   * Научное обоснование:
   * - Brand-Miller 2003: GL (не просто GI!) определяет инсулиновый ответ
   * - Östman 2001: Лактоза имеет GI ~46, не равна рафинированному сахару
   * - Jenkins 1981: При низком общем количестве углеводов их качество менее критично
   * - Holt 1997: Контекст приёма (белок, жиры) замедляет усвоение углеводов
   * 
   * @param {number} simple - Простые углеводы (г)
   * @param {number} complex - Сложные углеводы (г)
   * @param {Object} context - Контекст приёма для адаптивной оценки
   * @param {number} context.avgGI - Средний ГИ приёма (взвешенный по углеводам)
   * @param {number} context.mealGL - Гликемическая нагрузка приёма
   * @param {number} context.protein - Белок в приёме (г)
   * @param {number} context.fat - Жиры в приёме (г)
   * @param {number} context.fiber - Клетчатка в приёме (г)
   * @param {boolean} context.hasDairy - Есть ли молочные продукты
   * @returns {Object} { points, simpleRatio, ok, adjustments }
   */
  function calcCarbQuality(simple, complex, context = {}) {
    const total = simple + complex;
    const simpleRatio = safeRatio(simple, total, 0.5);
    
    // Распаковываем контекст с безопасными дефолтами
    const { 
      avgGI = 50, 
      mealGL = 10, 
      protein = 0, 
      fat = 0, 
      fiber = 0,
      hasDairy = false 
    } = context;
    
    let points = 15;
    let ok = true;
    const adjustments = []; // Для дебага и UI
    
    // === БАЗОВАЯ ОЦЕНКА по simpleRatio ===
    // Это старая логика — будем корректировать её контекстом
    let basePoints = 15;
    if (simpleRatio <= 0.30) {
      basePoints = 15;
    } else if (simpleRatio <= 0.50) {
      basePoints = 10;
    } else if (simpleRatio <= 0.70) {
      basePoints = 5;
    } else {
      basePoints = 0;
    }
    
    points = basePoints;
    
    // === АДАПТИВНЫЕ МОДИФИКАТОРЫ ===
    
    // 🔬 Модификатор 1: Малое количество углеводов
    // При total < 30г влияние качества снижается (научн: Jenkins 1981)
    // Пример: 14г углеводов из творога — не критично даже если "100% простые"
    if (total < 10) {
      // < 10г углеводов — качество практически не важно
      const boost = Math.round((15 - basePoints) * 0.9); // Восстанавливаем 90% потерянных баллов
      if (boost > 0) {
        points += boost;
        adjustments.push({ factor: 'lowCarbs', boost, reason: `Углеводов мало (${total.toFixed(0)}г)` });
      }
    } else if (total < 20) {
      // 10-20г — качество умеренно важно
      const boost = Math.round((15 - basePoints) * 0.6);
      if (boost > 0) {
        points += boost;
        adjustments.push({ factor: 'moderateLowCarbs', boost, reason: `Углеводов немного (${total.toFixed(0)}г)` });
      }
    } else if (total < 30) {
      // 20-30г — небольшая компенсация
      const boost = Math.round((15 - basePoints) * 0.3);
      if (boost > 0) {
        points += boost;
        adjustments.push({ factor: 'mediumCarbs', boost, reason: `Углеводов умеренно (${total.toFixed(0)}г)` });
      }
    }
    
    // 🔬 Модификатор 2: Низкий ГИ компенсирует "простые"
    // Лактоза GI~46, фруктоза GI~23 — это не сахар GI~65!
    // При avgGI < 55 частично восстанавливаем баллы за "простые"
    if (avgGI < 55 && simpleRatio > 0.30) {
      // Чем ниже ГИ, тем больше компенсация
      const giCompensation = avgGI < 40 ? 0.5 : avgGI < 50 ? 0.35 : 0.2;
      const lostPoints = 15 - basePoints;
      const boost = Math.round(lostPoints * giCompensation);
      if (boost > 0) {
        points += boost;
        adjustments.push({ factor: 'lowGI', boost, reason: `Низкий ГИ (${avgGI.toFixed(0)}) компенсирует` });
      }
    }
    
    // 🔬 Модификатор 3: Низкая GL = низкий инсулиновый ответ
    // GL < 10 = отлично, даже если углеводы "простые" (Brand-Miller 2003)
    if (mealGL < 10 && simpleRatio > 0.30) {
      const boost = Math.round((15 - basePoints) * 0.4);
      if (boost > 0 && !adjustments.find(a => a.factor === 'lowGI')) { // Не дублируем с lowGI
        points += boost;
        adjustments.push({ factor: 'lowGL', boost, reason: `Низкая GL (${mealGL.toFixed(1)})` });
      }
    }
    
    // 🔬 Модификатор 4: Молочные продукты (лактоза ≠ сахар)
    // Östman 2001: Молочные имеют высокий II, но низкий GI
    // Лактоза — это дисахарид с GI~46, а не рафинированный сахар
    if (hasDairy && simpleRatio > 0.50) {
      const boost = 3; // Фиксированная компенсация за молочные
      points += boost;
      adjustments.push({ factor: 'dairy', boost, reason: 'Молочные углеводы (лактоза)' });
    }
    
    // 🔬 Модификатор 5: Белковый контекст замедляет усвоение
    // Holt 1997: Белок увеличивает время усвоения углеводов
    // При protein >= 20г качество углеводов менее критично
    if (protein >= 25 && simpleRatio > 0.30) {
      const boost = 2;
      points += boost;
      adjustments.push({ factor: 'highProtein', boost, reason: `Высокий белок (${protein.toFixed(0)}г) замедляет усвоение` });
    } else if (protein >= 15 && simpleRatio > 0.50) {
      const boost = 1;
      points += boost;
      adjustments.push({ factor: 'moderateProtein', boost, reason: `Белок (${protein.toFixed(0)}г) смягчает эффект` });
    }
    
    // 🔬 Модификатор 6: Клетчатка замедляет усвоение
    // Jenkins 1981: Fiber снижает гликемический ответ
    if (fiber >= 5 && simpleRatio > 0.30) {
      const boost = 2;
      points += boost;
      adjustments.push({ factor: 'highFiber', boost, reason: `Клетчатка (${fiber.toFixed(0)}г) замедляет усвоение` });
    } else if (fiber >= 2 && simpleRatio > 0.50) {
      const boost = 1;
      points += boost;
      adjustments.push({ factor: 'moderateFiber', boost, reason: 'Клетчатка смягчает эффект' });
    }
    
    // 🔬 Модификатор 7: Жиры замедляют усвоение
    // Liddle 1986: Жиры замедляют опорожнение желудка → ниже гликемический ответ
    if (fat >= 10 && simpleRatio > 0.40 && avgGI < 60) {
      const boost = 1;
      points += boost;
      adjustments.push({ factor: 'fatSlowdown', boost, reason: 'Жиры замедляют усвоение углеводов' });
    }
    
    // === НОРМАЛИЗАЦИЯ ===
    points = Math.max(0, Math.min(15, points)); // Ограничиваем 0-15
    
    // OK если:
    // - simpleRatio <= 35% ИЛИ
    // - много компенсирующих факторов (получили >= 10 баллов при изначально низкой оценке)
    ok = simpleRatio <= 0.35 || points >= 10;
    
    return { 
      points, 
      simpleRatio, 
      ok,
      basePoints, // Исходные баллы до адаптации
      adjustments, // Какие факторы сработали
      contextUsed: Object.keys(context).length > 0 // Был ли передан контекст
    };
  }

  // v53: Добавлен контекст — при малом количестве жиров не применяем жёсткие штрафы
  function calcFatQuality(bad, good, trans) {
    const total = bad + good + trans;
    const goodRatio = safeRatio(good, total, 0.5);
    const badRatio = safeRatio(bad, total, 0.5);
    
    let points = 15;
    let ok = true;
    
    // v53: Контекстная оценка — если жиров мало (<5г), ratio может быть обманчивым
    // Пример: 2г плохих + 0г хороших = badRatio 100%, но это всего 2г!
    const isLowFat = total < 5;
    
    if (goodRatio >= 0.60) {
      points = 15;
    } else if (goodRatio >= 0.40) {
      points = 10;
    } else {
      // v53: При низком количестве жиров — мягче штрафуем
      points = isLowFat ? 10 : 5;
      ok = isLowFat ? true : false;
    }
    
    // Штраф за много плохих жиров (> 50%)
    // v53: Только если жиров достаточно для значимой оценки
    if (badRatio > 0.50 && !isLowFat) {
      points -= 5;
      ok = false;
    }
    
    // v53: Штраф за транс-жиры — ПРОПОРЦИОНАЛЬНО размеру приёма
    // Было: абсолютный порог 0.5г (несправедливо для больших порций)
    // Стало: > 2% от общих жиров ИЛИ > 1г абсолютно
    const transRatio = total > 0 ? trans / total : 0;
    if (trans > 1 || (transRatio > 0.02 && trans > 0.3)) {
      points -= 5;
      ok = false;
    }
    
    return { points: Math.max(0, points), goodRatio, badRatio, ok };
  }

  /**
   * 🔬 Оценка ГИ и вредности приёма v2.0
   * 
   * Научное обоснование:
   * - Brand-Miller 2003: GI определяет скорость роста глюкозы
   * - harm — индекс вредности (транс-жиры, сахар, обработка)
   * 
   * v54: Нелинейная шкала для harm — экспоненциальный рост штрафа
   * Логика: harm 5-10 — умеренно вредно, harm 10-30 — очень вредно,
   * harm 30+ — критически вредно (фастфуд, чипсы)
   * 
   * @param {number} avgGI - Средневзвешенный GI приёма
   * @param {number} avgHarm - Средневзвешенный индекс вреда (0-100)
   * @returns {Object} { points, ok, harmPenalty }
   */
  function calcGiHarmScore(avgGI, avgHarm) {
    let points = 15;
    let ok = true;
    let harmPenalty = 0;
    
    // === GI оценка (линейная шкала) ===
    if (avgGI <= 55) {
      points = 15; // Low GI — отлично
    } else if (avgGI <= 70) {
      points = 10; // Medium GI — нормально
    } else {
      points = 5;  // High GI — плохо
      ok = false;
    }
    
    // === НЕЛИНЕЙНАЯ оценка вредности v2.0 ===
    // Идея: небольшая вредность (5-10) — это нормально, 
    // но высокая (20+) должна сильно штрафоваться
    if (avgHarm > 5) {
      if (avgHarm <= 10) {
        // Умеренная вредность: линейный штраф (до -2)
        harmPenalty = Math.round((avgHarm - 5) / 2.5); // 5→0, 7.5→1, 10→2
      } else if (avgHarm <= 20) {
        // Заметная вредность: ускоренный штраф (до -5)
        harmPenalty = 2 + Math.round((avgHarm - 10) / 3.3); // 10→2, 15→3.5, 20→5
      } else if (avgHarm <= 40) {
        // Высокая вредность: экспоненциальный рост (до -10)
        harmPenalty = 5 + Math.round((avgHarm - 20) / 4); // 20→5, 30→7.5, 40→10
      } else {
        // Критическая вредность: максимальный штраф
        harmPenalty = 10 + Math.min(5, Math.round((avgHarm - 40) / 10)); // 40+→10-15
      }
      
      points -= Math.min(15, harmPenalty); // Ограничиваем до -15 (обнуляет points)
      ok = avgHarm <= 15; // v54: ужесточено с 10 до 15 для ok
    }
    
    return { points: Math.max(0, points), ok, harmPenalty };
  }

  function getMealQualityScore(meal, mealType, optimum, pIndex, activityContext) {
    if (!meal?.items || meal.items.length === 0) return null;
    
    const opt = optimum > 0 ? optimum : 2000;
    const totals = M.mealTotals ? M.mealTotals(meal, pIndex) : { kcal:0, carbs:0, simple:0, complex:0, prot:0, fat:0, bad:0, good:0, trans:0, fiber:0 };
    
    // harmMultiplier от активности (тренировка компенсирует вред)
    const harmMultiplier = activityContext?.harmMultiplier ?? 1;
    
    // GI взвешиваем по УГЛЕВОДАМ (не по граммам!) — для мяса/рыбы будет нейтральный 50
    let gramSum = 0, carbSum = 0, giSum = 0, harmSum = 0;
    let hasDairy = false; // 🔬 Детекция молочных для адаптивного расчёта
    
    (meal.items || []).forEach(it => {
      const p = getProductFromItem(it, pIndex) || {};
      const g = +it.grams || 0;
      if (!g) return;
      
      // 🔬 Детекция молочных продуктов по имени/категории
      const name = (p.name || '').toLowerCase();
      const category = (p.category || '').toLowerCase();
      if (
        category.includes('молоч') || category.includes('dairy') ||
        name.includes('молок') || name.includes('творог') || name.includes('кефир') ||
        name.includes('йогурт') || name.includes('сметан') || name.includes('сливк') ||
        name.includes('сыр') || name.includes('ряженк') || name.includes('простокваш') ||
        name.includes('milk') || name.includes('cheese') || name.includes('yogurt')
      ) {
        hasDairy = true;
      }
      
      // Вычисляем углеводы для взвешивания GI
      const simple100 = +p.simple100 || 0;
      const complex100 = +p.complex100 || 0;
      const itemCarbs = (simple100 + complex100) * g / 100;
      
      const gi = p.gi ?? p.gi100 ?? p.GI ?? p.giIndex ?? 50;
      const harm = p.harm ?? p.harmScore ?? p.harm100 ?? p.harmPct ?? 0;
      
      gramSum += g;
      carbSum += itemCarbs;
      giSum += gi * itemCarbs; // взвешиваем по углеводам!
      harmSum += harm * g;
    });
    // Для мясных блюд (carbs ≈ 0) → нейтральный GI = 50
    const avgGI = carbSum > 0 ? giSum / carbSum : 50;
    const rawAvgHarm = gramSum > 0 ? harmSum / gramSum : 0;
    
    // === КОМПЕНСАЦИЯ ВРЕДА ТРЕНИРОВКОЙ ===
    // harmMultiplier < 1 снижает эффективный вред (еда во время/после тренировки)
    const avgHarm = rawAvgHarm * harmMultiplier;
    const harmReduction = harmMultiplier < 1 ? Math.round((1 - harmMultiplier) * 100) : 0;
    
    const { kcal, prot, carbs, simple, complex, fat, bad, good, trans } = totals;
    let score = 0;
    const badges = [];
    
    // v54: передаём activityContext для учёта тренировки
    const kcalScore = calcKcalScore(kcal, mealType, opt, meal.time, activityContext);
    score += kcalScore.points;
    if (!kcalScore.ok) badges.push({ type: 'К', ok: false });
    // Бейдж за ночное/позднее время
    if (kcalScore.issues?.includes('ночь') || kcalScore.issues?.includes('тяжёлая еда ночью')) {
      badges.push({ type: '🌙', ok: false, label: 'Поздно' });
    } else if (kcalScore.issues?.includes('поздно')) {
      badges.push({ type: '⏰', ok: false, label: 'Вечер' });
    }
    
    // v54: передаём activityContext для учёта тренировки
    const macroScore = calcMacroScore(prot, carbs, fat, kcal, mealType, meal.time, activityContext);
    score += macroScore.points;
    if (!macroScore.proteinOk) badges.push({ type: 'Б', ok: false });
    if (macroScore.issues?.includes('углеводы вечером')) badges.push({ type: 'У⬇', ok: false, label: 'Угл вечером' });
    
    // 🔬 Расчёт GL перед вызовом carbScore (нужно для контекста)
    const mealGL = calculateMealGL(avgGI, totals.carbs || 0);
    
    // 🔬 Адаптивный расчёт качества углеводов с полным контекстом
    const carbScore = calcCarbQuality(simple, complex, {
      avgGI,
      mealGL,
      protein: prot,
      fat,
      fiber: totals.fiber || 0,
      hasDairy
    });
    score += carbScore.points;
    
    // 🐛 DEBUG: Временное логирование для отладки качества углеводов
    if (window.HEYS_DEBUG_CARB_SCORE) {
      // console.log('🔬 calcCarbQuality DEBUG:', {
      //   mealName: meal.name || 'Приём',
      //   simple, complex, total: simple + complex,
      //   simpleRatio: (simple / (simple + complex) * 100).toFixed(0) + '%',
      //   context: { avgGI: avgGI.toFixed(0), mealGL: mealGL.toFixed(1), protein: prot.toFixed(0), fat: fat.toFixed(0), fiber: (totals.fiber || 0).toFixed(0), hasDairy },
      //   result: carbScore
      // });
    }
    
    const fatScore = calcFatQuality(bad, good, trans);
    score += fatScore.points;
    if (trans > 0.5) badges.push({ type: 'ТЖ', ok: false });
    
    const giHarmScore = calcGiHarmScore(avgGI, avgHarm);
    score += giHarmScore.points;
    if (avgGI > 70) badges.push({ type: 'ГИ', ok: false });
    if (avgHarm > 10) badges.push({ type: 'Вр', ok: false });
    
    // === БОНУСЫ (до +15 сверх 100) ===
    let bonusPoints = 0;
    const positiveBadges = [];
    
    // Парсим время для бонусов
    const timeParsed = parseTime(meal.time || '');
    const hour = timeParsed?.hh || 12;
    
    // === НАУЧНЫЕ БОНУСЫ (из инсулиновой волны) ===
    
    // 🔬 GL-based качество (Brand-Miller 2003)
    // GL = GI × углеводы / 100 — лучший предиктор инсулинового ответа
    // mealGL уже рассчитан выше для carbScore
    const glBonus = getGLQualityBonus(mealGL);
    if (glBonus.bonus !== 0) {
      bonusPoints += glBonus.bonus;
      if (glBonus.bonus > 0) {
        positiveBadges.push({ type: '📉', ok: true, label: 'Низкая GL' });
      }
    }
    
    // 🌅 Циркадный бонус (Van Cauter 1997)
    // Утром метаболизм лучше — еда усваивается эффективнее
    const circadian = getCircadianBonus(hour);
    if (circadian.bonus > 0 && kcal >= 200) {
      bonusPoints += circadian.bonus;
      if (circadian.period === 'morning') {
        positiveBadges.push({ type: '🌅', ok: true, label: 'Утренний приём' });
      } else if (circadian.period === 'midday') {
        positiveBadges.push({ type: '🌞', ok: true, label: 'Обеденное время' });
      }
    }
    // Циркадный штраф уже применяется через calcKcalScore → не дублируем
    
    // 🥤 Детекция жидкой пищи (Flood-Obbagy 2009)
    // Жидкие калории → быстрый пик инсулина, меньше насыщение
    let liquidKcal = 0;
    (meal.items || []).forEach(it => {
      const p = getProductFromItem(it, pIndex) || {};
      const g = +it.grams || 0;
      if (!g) return;
      
      if (isLiquidFood(p.name, p.category)) {
        const itemKcal = (p.kcal100 || 0) * g / 100;
        liquidKcal += itemKcal;
      }
    });
    // Если >50% калорий из жидких продуктов — штраф
    const liquidRatio = kcal > 0 ? liquidKcal / kcal : 0;
    if (liquidRatio > 0.5 && kcal >= 100) {
      bonusPoints -= LIQUID_FOOD_PENALTY;
      badges.push({ type: '🥤', ok: false, label: 'Жидкие калории' });
    }
    
    // === ОРИГИНАЛЬНЫЕ БОНУСЫ (улучшены) ===
    
    // Бонус за ранний вечерний приём (18:00-19:30)
    if (hour >= 18 && hour < 20 && kcal >= 200) {
      bonusPoints += 2;
      positiveBadges.push({ type: '🌇', ok: true, label: 'Ранний вечер' });
    }
    
    // === БОНУС за высокобелковый приём ===
    // Творог, мясо, рыба — отличная еда независимо от "типа"!
    if (prot >= 20) {
      bonusPoints += 3;
      positiveBadges.push({ type: '🥛', ok: true, label: 'Белковый' });
    } else if (prot >= 15 && kcal <= 400) {
      // Лёгкий, но белковый приём
      bonusPoints += 2;
    }
    
    // Бонус за клетчатку (2г+ в приёме = хорошо)
    const fiber = totals.fiber || 0;
    if (fiber >= 5) {
      bonusPoints += 3;
      positiveBadges.push({ type: '🥗', ok: true, label: 'Клетчатка' });
    } else if (fiber >= 2) {
      bonusPoints += 1;
    }
    
    // Бонус за разнообразие (4+ продукта)
    const itemCount = (meal.items || []).length;
    if (itemCount >= 4) {
      bonusPoints += 2;
      positiveBadges.push({ type: '🌈', ok: true, label: 'Разнообразие' });
    }
    
    // Бонус за хороший белок относительно калорий (независимо от типа)
    const protCalRatio = kcal > 0 ? (prot * 4) / kcal : 0;
    if (protCalRatio >= 0.20 && protCalRatio <= 0.40 && prot >= 10) {
      bonusPoints += 2;
      positiveBadges.push({ type: '💪', ok: true, label: 'Белок' });
    }
    
    // Бонус за низкий ГИ (<50)
    if (avgGI <= 50 && carbSum > 5) {
      bonusPoints += 2;
      positiveBadges.push({ type: '🎯', ok: true, label: 'Низкий ГИ' });
    }
    
    // === БОНУС за компенсацию тренировкой ===
    // Если еда во время/после тренировки, вред снижается (harmMultiplier < 1)
    if (harmReduction > 0 && rawAvgHarm > 5) {
      // Бонус пропорционален снижению вреда: 50% = +5, 30% = +3, 20% = +2
      const activityBonusPoints = Math.min(5, Math.round(harmReduction / 10));
      if (activityBonusPoints > 0) {
        bonusPoints += activityBonusPoints;
        positiveBadges.push({ type: activityContext?.badge || '🏋️', ok: true, label: `−${harmReduction}% вред` });
      }
    }
    
    // 🆕 v3.5.4: Бонус за еду в контексте тренировки (даже если вред низкий)
    // Хороший тайминг = +2 бонуса (peri/post/pre)
    if (activityContext && ['peri', 'post', 'pre'].includes(activityContext.type)) {
      const timingBonus = activityContext.type === 'peri' ? 3 : 
                          activityContext.type === 'post' ? 2 : 
                          1; // pre
      if (harmReduction === 0 || rawAvgHarm <= 5) {
        // Добавляем бонус только если не добавили выше (чтобы не дублировать)
        bonusPoints += timingBonus;
        positiveBadges.push({ 
          type: activityContext.type === 'peri' ? '🔥' : 
                activityContext.type === 'post' ? '💪' : '⚡', 
          ok: true, 
          label: activityContext.type === 'peri' ? 'Во время трени' : 
                 activityContext.type === 'post' ? 'После трени' : 'Перед трени'
        });
      }
    }
    
    // === БОНУС за качественный ночной/поздний приём ===
    // Если приём ночью, но состав хороший — компенсируем штраф!
    const hasNightIssue = kcalScore.issues?.includes('ночь') || kcalScore.issues?.includes('поздно');
    if (hasNightIssue) {
      // Бонус за высокий белок ночью (> 25г) — белок ночью это хорошо для восстановления
      if (prot >= 25) {
        bonusPoints += 4;
        positiveBadges.push({ type: '🌙💪', ok: true, label: 'Белок ночью' });
      }
      // Бонус за низкий ГИ ночью — не вызывает скачок инсулина
      if (avgGI <= 40) {
        bonusPoints += 3;
        positiveBadges.push({ type: '🌙🎯', ok: true, label: 'Низкий ГИ' });
      }
      // Бонус за минимум простых углеводов (<15г)
      if (simple < 15) {
        bonusPoints += 2;
      }
    }
    
    // Бонус за сбалансированный приём (все показатели в норме)
    if (kcalScore.ok && macroScore.proteinOk && carbScore.ok && fatScore.ok && giHarmScore.ok) {
      bonusPoints += 3;
      positiveBadges.push({ type: '⭐', ok: true, label: 'Баланс' });
    }
    
    // Увеличен лимит бонусов: качественный ночной приём может компенсировать штраф за время
    score += Math.min(15, bonusPoints); // Max +15 бонус (было 10)
    
    // Финальный score: 0-115 (100 base + 15 bonus) → нормализуем до 0-100
    const finalScore = Math.min(100, Math.round(score));
    
    const color = finalScore >= 80 ? '#22c55e' : finalScore >= 50 ? '#eab308' : '#ef4444';
    
    // Определяем статус времени
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
      { label: 'GL', value: Math.round(mealGL), ok: mealGL <= 20 },
      { label: 'Клетчатка', value: Math.round(fiber) + 'г', ok: fiber >= 2 },
      // Показываем вред с учётом компенсации тренировкой
      ...(harmReduction > 0 ? [{ label: 'Вред', value: `${Math.round(rawAvgHarm)} → ${Math.round(avgHarm)} (−${harmReduction}%)`, ok: avgHarm <= 10 }] : [])
    ];
    
    // Объединяем бейджи: сначала проблемы, потом позитивные
    const allBadges = [...badges.slice(0, 2), ...positiveBadges.slice(0, 1)];
    
    return {
      score: finalScore,
      color,
      badges: allBadges.slice(0, 3),
      details,
      avgGI,
      avgHarm,
      rawAvgHarm: harmReduction > 0 ? rawAvgHarm : undefined,
      harmReduction: harmReduction > 0 ? harmReduction : undefined,
      fiber,
      bonusPoints,
      // Научные данные
      mealGL: Math.round(mealGL * 10) / 10,
      glLevel: glBonus.level,
      circadianPeriod: circadian.period,
      circadianBonus: circadian.bonus,
      liquidRatio: Math.round(liquidRatio * 100),
      // Activity context
      activityContext: activityContext || undefined,
      // === ДОБАВЛЕНО: carbScore для popup ===
      carbScore
    };
  }

  
  // Export to HEYS namespace
  HEYS.mealScoring = {
    // Constants
    MEAL_KCAL_LIMITS,
    IDEAL_MACROS_UNIFIED,
    MEAL_KCAL_ABSOLUTE,
    IDEAL_MACROS,
    CIRCADIAN_MEAL_BONUS,
    LIQUID_FOOD_PATTERNS,
    HEALTHY_LIQUID_PATTERNS,
    LIQUID_FOOD_PENALTY,
    GL_QUALITY_THRESHOLDS,
    // Helper functions
    isLiquidFood,
    calculateMealGL,
    getCircadianBonus,
    getGLQualityBonus,
    // Scoring functions
    calcKcalScore,
    calcMacroScore,
    calcCarbQuality,
    calcFatQuality,
    calcGiHarmScore,
    getMealQualityScore,
    // Color and tooltip functions
    getNutrientColor,
    getNutrientTooltip,
    getDailyNutrientColor,
    getDailyNutrientTooltip
  };
  
})(window);
