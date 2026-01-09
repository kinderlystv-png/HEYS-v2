// heys_insulin_wave_v1.js — Модуль инсулиновой волны
// Версия: 3.8.0 | Дата: 2025-12-15
//
// ОБНОВЛЕНИЯ v3.8.0 (НАУЧНЫЕ УЛУЧШЕНИЯ):
// - ⚡ REACTIVE HYPOGLYCEMIA: UI предупреждение при риске гипогликемии (2-4ч после еды)
// - 🥛 INSULIN INDEX FIX: Молочка имеет КОРОЧЕ волну (+35% пик), не длиннее
//   Научное: Holt 1997 — молоко быстрее пиковый инсулин, но короче общая волна
// - 🌅 CIRCADIAN SMOOTH: Плавная синусоидальная кривая вместо ступеней
//   Научное: Van Cauter 1997 — пик чувствительности 7-9 утра, минимум 22-02
// - 🌡️ FOOD TEMPERATURE: Горячая еда +8% волна (быстрее опорожнение желудка)
//   Научное: Valdés-Ramos 2019 — горячее быстрее покидает желудок
// - 🍽️ LARGE PORTIONS: Нелинейное замедление при >800 ккал (гастропарез)
//   Научное: Collins 1991 — >1000 ккал замедляет опорожнение на 30-50%
// - 🔬 GI THRESHOLD: GI не влияет при GL<7 (Mayer 1995)
//
// ОБНОВЛЕНИЯ v3.5.6 (GI SCALING FIX):
// - 🔬 Увеличен порог для полного влияния GI с GL≥10 до GL≥20
// - 📉 Плавное скалирование GI по GL: GL=5→0%, GL=10→33%, GL=15→67%, GL=20→100%
// - 🍞 Пример: хлебцы 24г (GL=13, GI=75) — волна теперь ~1.9ч вместо 2.2ч
// - Научное: Mayer 1995 — при <20г углеводов инсулин возвращается быстрее
//
// ОБНОВЛЕНИЯ v3.5.5 (УЛУЧШЕННЫЕ ACTIVITY CONTEXTS):
// - 🚶 STEPS: Прогрессивные пороги (5k/7.5k/10k/12k), работают весь день
//   - Вечерний boost ×1.3 после 18:00 (шаги уже накопились)
//   - harmMultiplier 0.92-0.98 для Meal Quality Score
// - 🏠 HOUSEHOLD: Бытовая активность как отдельный Activity Context
//   - Пороги: 30/60/90 минут с бейджами 🏠
//   - harmMultiplier 0.90-0.96 для Meal Quality Score
// - 📊 Оба контекста теперь влияют на вредность продуктов (не только волну)
//
// ОБНОВЛЕНИЯ v3.5.4 (PRE-WORKOUT HARM REDUCTION):
// - 🏋️ Еда ПЕРЕД тренировкой теперь тоже снижает вредность:
//   - 0-45 мин до тренировки: harmMultiplier = 0.6 (−40% вред)
//   - 45-90 мин до тренировки: harmMultiplier = 0.8 (−20% вред)
// - Логика: еда сгорит на тренировке, поэтому "вред" минимален
//
// ОБНОВЛЕНИЯ v3.5.3 (UI — ПЛАШКА ACTIVITY CONTEXT):
// - 🏋️ Вынесена helper-функция renderActivityContextBadge() для переиспользования
// - ✅ Плашка теперь отображается в ProgressBarComponent (верхний таймер волны)
// - ✅ Плашка отображается и в режиме липолиза (если эффект от тренировки ускорил выход)
// - Опции: compact (уменьшенный размер), showDesc (показать описание)
//
// ОБНОВЛЕНИЯ v3.5.2 (ИСПРАВЛЕНИЕ ФОРМУЛЫ):
// - 🔧 activityBonuses теперь применяется как МНОЖИТЕЛЬ, не сумма
// - Формула: finalMultiplier = foodMultiplier × activityMultiplier × circadian
// - После 1000+ ккал тренировки волна ~18-30 мин (раньше было 2.8ч)
//
// ОБНОВЛЕНИЯ v3.5.1 (POSTPRANDIAL EXERCISE — усиление):
// - 🏃 Бонусы УДВОЕНЫ: high -50% (было -25%), moderate -35% (было -18%), light -20% (было -10%)
// - 🆕 proximityBoost: тренировка через 15 мин после еды = бонус ×1.5 (ближе = сильнее)
// - 🆕 kcalBoost: интенсивная тренировка (500+ ккал) = бонус ×1.5
// - Финальный бонус может достигать -85% (практически останавливает волну)
// - Научное обоснование: Colberg 2010, Erickson 2017 — GLUT4 активация без инсулина
//
// ОБНОВЛЕНИЯ v3.5.0 (KCAL-BASED WAVE REDUCTION):
// - 🔥 POST-WORKOUT: waveBonus теперь зависит от потраченных ккал тренировки
//   | Потрачено ккал | kcalBonus | Итоговая волна (tier + kcal) |
//   |----------------|-----------|------------------------------|
//   | 200-400        | −10%      | ~50% базовой                 |
//   | 400-700        | −25%      | ~35% базовой                 |
//   | 700-1000       | −45%      | ~20% базовой                 |
//   | 1000+          | −60%      | ~10-15% базовой (~20-30 мин) |
// - 🔥 PERI-WORKOUT: bonus масштабируется по intensityMult (high intensity × 1.5)
// - Научное обоснование: Ivy 1988, Burke 2017 — истощение гликогена → GLUT4 без инсулина
// 
// ОБНОВЛЕНИЯ v3.2.2 (КРИТИЧЕСКИЙ ФИКС):
// - Insulin Index теперь применяется к GL per-product (×3.0 для молока), а не как +15% бонус
// - maxBoost увеличен до 2.5 (было 1.5) — молоко GL=1.4 → effectiveGL=4.2
// - Убрано двойное счётчтение insulinogenicBonus в calculateMultiplier()
// - waveHistory синхронизируется ОТ main calculation (единый источник правды)
//
// ОБНОВЛЕНИЯ v3.1.0 (научный аудит ChatGPT):
// - Клетчатка теперь УМЕНЬШАЕТ волну (-8% до -20%), не увеличивает
// - Белок: усилено влияние (+8% до +25%), добавлен порог >50г
// - Возраст: усилено влияние (+6% до +40%), добавлен порог 70+
// - Жидкая пища: добавлен peakMultiplier (+35% пик)
// - НОВЫЕ ФАКТОРЫ: порядок еды, форма пищи, resistant starch
// - НОВЫЕ ДАННЫЕ: пороги липолиза, реактивная гипогликемия
//
// КОНЦЕПЦИИ v3.0.0:
// 1. Непрерывная формула GL (без ступенчатых категорий) — плавная кривая
// 2. Персональный базовый период волны (учёт возраста, BMI, пола)
// 3. Кумулятивный эффект приёмов (Meal Stacking) — перехлёст волн
// 4. Фазы волны (rise → plateau → decline → lipolysis)
// 5. Инсулиновый индекс (II) для молочных продуктов
// 
// Научная база: Brand-Miller 2003, Holt 1997, Van Cauter 1997, Colberg 2010
(function(global) {
  'use strict';
  
  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;
  
  // === КОНСТАНТЫ ===
  // 🔬 НАУЧНЫЙ АУДИТ v3.0.1 (2025-12-09): Инвертирована логика GI
  // БЫЛО: низкий ГИ → ×1.2 (длиннее) — НЕПРАВИЛЬНО
  // СТАЛО: высокий ГИ → ×1.2 (длиннее) — ПРАВИЛЬНО
  // 
  // Научное обоснование (Wolever 1994, Brand-Miller 2003):
  // - Высокий ГИ → резкий всплеск инсулина → дольше возврат к базовому уровню
  // - Низкий ГИ → плавный, низкий инсулиновый ответ → короче волна
  const GI_CATEGORIES = {
    low: { min: 0, max: 35, multiplier: 0.85, color: '#22c55e', text: 'Низкий ГИ', desc: 'короткая волна' },
    medium: { min: 36, max: 55, multiplier: 1.0, color: '#eab308', text: 'Средний ГИ', desc: 'нормальная' },
    high: { min: 56, max: 70, multiplier: 1.1, color: '#f97316', text: 'Высокий ГИ', desc: 'длиннее' },
    veryHigh: { min: 71, max: 999, multiplier: 1.2, color: '#ef4444', text: 'Очень высокий', desc: 'долгая волна' }
  };
  
  const STATUS_CONFIG = {
    // Липолиз — жиросжигание активно! Каждая минута без еды = сжигание жира
    lipolysis: { emoji: '🔥', color: '#22c55e', label: 'Липолиз!' },
    // Почти закончилась волна — скоро липолиз
    almost: { emoji: '⏳', color: '#f97316', label: null },
    // Скоро закончится
    soon: { emoji: '🌊', color: '#eab308', label: null },
    // Волна активна — инсулин высокий, жир запасается
    active: { emoji: '📈', color: '#3b82f6', label: null }
  };
  
  // 🔬 НАУЧНЫЙ АУДИТ 2025-12-10 (ChatGPT Research):
  // Белок вызывает инсулиновый ответ (Nuttall et al. 1984, Floyd 1966)
  // Но ОСНОВНАЯ причина длины волны — углеводы. Белок — вторичный фактор.
  // 🔬 v3.7.5: Калибровка — снижены бонусы (реальный эффект ~5-10%, не 15-25%)
  const PROTEIN_BONUS = {
    veryHigh: { threshold: 50, bonus: 0.12 },  // 50+ г белка → +12% к волне (было +25%)
    high: { threshold: 35, bonus: 0.08 },      // 35-50 г → +8% (было +15%)
    medium: { threshold: 20, bonus: 0.05 }     // 20-35 г → +5% (было +8%)
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 🆕 PROTEIN_BONUS_V2 — разделение на animal/plant (v4.0.0)
  // ═══════════════════════════════════════════════════════════════════════════
  // 🔬 Научное обоснование:
  // - Animal protein: высокое содержание BCAA → сильный инсулиновый ответ ×1.8
  //   (Layman 2003, Nilsson 2004, van Loon 2000)
  // - Plant protein: меньше leucine, больше arginine → ×1.3 эффекта
  //   (Mariotti 2017, Tang 2009)
  // - Whey protein (сывороточный) — максимальный инсулиногенный эффект ×2.0
  //   (Nilsson 2004, Pal & Ellis 2010)
  const PROTEIN_BONUS_V2 = {
    // Множители эффекта по типу белка
    animal: {
      multiplier: 1.8,    // ×1.8 от базового эффекта
      label: '🥩 Животный белок',
      desc: 'Высокий BCAA → сильный инсулиновый ответ'
    },
    plant: {
      multiplier: 1.3,    // ×1.3 от базового эффекта
      label: '🌱 Растительный белок', 
      desc: 'Низкий leucine → умеренный ответ'
    },
    whey: {
      multiplier: 2.0,    // ×2.0 — сывороточный максимально инсулиногенный
      label: '🥛 Сывороточный белок',
      desc: 'Быстрое усвоение → пиковый инсулин'
    },
    mixed: {
      multiplier: 1.5,    // Среднее для смешанного приёма
      label: '🍽️ Смешанный белок',
      desc: 'Комбинация источников'
    },
    
    // Базовые пороги (граммы белка) — одинаковые для всех типов
    thresholds: {
      veryHigh: 50,   // 50+ г
      high: 35,       // 35-50 г
      medium: 20      // 20-35 г
    },
    
    // Базовые бонусы (до применения множителя типа)
    baseBonuses: {
      veryHigh: 0.07,   // base +7% → animal +12.6%, plant +9.1%, whey +14%
      high: 0.05,       // base +5% → animal +9%, plant +6.5%, whey +10%
      medium: 0.03      // base +3% → animal +5.4%, plant +3.9%, whey +6%
    },
    
    // 🔍 Паттерны для определения типа белка по названию продукта
    patterns: {
      // Животный белок (мясо, рыба, яйца, молочные)
      animal: [
        // Мясо
        /говядина/i, /свинина/i, /баранина/i, /телятина/i, /козлятина/i,
        /стейк/i, /филе/i, /вырезка/i, /антрекот/i, /ребро/i, /карбонад/i,
        /фарш/i, /котлет[аы]/i, /шашлык/i, /бефстроган/i,
        /beef/i, /pork/i, /lamb/i, /meat/i, /steak/i,
        // Птица
        /курица/i, /курин/i, /куриц/i, /индейка/i, /индюш/i, /утка/i, /гусь/i,
        /грудка/i, /бедро/i, /крыло/i, /голень/i, /окорочок/i,
        /chicken/i, /turkey/i, /duck/i, /poultry/i,
        // Рыба и морепродукты  
        /рыба/i, /лосось/i, /сёмга/i, /форель/i, /тунец/i, /скумбрия/i,
        /треска/i, /минтай/i, /камбала/i, /окунь/i, /судак/i, /щука/i,
        /карп/i, /сом/i, /сельдь/i, /селёдка/i, /килька/i, /шпроты/i,
        /креветки/i, /крабы/i, /мидии/i, /кальмар/i, /осьминог/i, /устрицы/i,
        /fish/i, /salmon/i, /tuna/i, /shrimp/i, /seafood/i,
        // Яйца
        /яйцо/i, /яйца/i, /яичн/i, /омлет/i, /глазунья/i, /пашот/i,
        /egg/i, /omelet/i,
        // Молочные (белок из молочных)
        /творог/i, /сыр/i, /брынза/i, /cheese/i, /cottage/i,
        /казеин/i, /casein/i,
        // Субпродукты
        /печень/i, /сердце/i, /язык/i, /почки/i, /liver/i
      ],
      
      // Сывороточный белок (whey) — отдельная категория
      whey: [
        /whey/i, /сывороточн/i, /изолят/i, /isolate/i,
        /протеин.*коктейль/i, /protein.*shake/i, /protein.*powder/i,
        /\bWPC\b/i, /\bWPI\b/i, /\bWPH\b/i,
        /гейнер/i, /gainer/i
      ],
      
      // Растительный белок
      plant: [
        // Бобовые
        /горох/i, /нут/i, /чечевица/i, /фасоль/i, /бобы/i, /эдамаме/i,
        /pea/i, /chickpea/i, /lentil/i, /bean/i, /legume/i,
        // Соевые
        /соя/i, /соев/i, /тофу/i, /темпе/i, /натто/i, /мисо/i,
        /soy/i, /tofu/i, /tempeh/i, /edamame/i,
        // Злаки с высоким белком
        /киноа/i, /quinoa/i, /амарант/i, /amaranth/i,
        // Орехи и семена
        /миндаль/i, /арахис/i, /фисташк/i, /кешью/i, /грецк.*орех/i,
        /семена.*чиа/i, /семена.*конопл/i, /семена.*подсолн/i, /семена.*тыкв/i,
        /almond/i, /peanut/i, /cashew/i, /chia/i, /hemp/i,
        // Растительные протеины
        /гороховый.*протеин/i, /соевый.*протеин/i, /растительный.*протеин/i,
        /pea.*protein/i, /soy.*protein/i, /plant.*protein/i, /vegan.*protein/i,
        // Сейтан (пшеничный глютен)
        /сейтан/i, /seitan/i, /глютен/i, /gluten/i
      ]
    },
    
    // Категории продуктов для определения типа
    categories: {
      animal: ['Мясо', 'Рыба', 'Птица', 'Морепродукты', 'Яйца', 'Meat', 'Fish', 'Poultry', 'Seafood', 'Eggs'],
      plant: ['Бобовые', 'Орехи', 'Семена', 'Legumes', 'Nuts', 'Seeds'],
      // Молочные — особый случай (казеин = animal, но не whey)
      dairy: ['Молочные', 'Dairy']
    }
  };

  /**
   * 🆕 Определить тип белка в продукте (v4.0.0)
   * @param {Object} product - продукт {name, category}
   * @returns {string} 'animal' | 'plant' | 'whey' | 'mixed'
   */
  const detectProteinType = (product) => {
    if (!product) return 'mixed';
    
    const name = (product.name || '').toLowerCase();
    const category = product.category || '';
    
    // 1. Whey имеет приоритет (спортпит)
    for (const pattern of PROTEIN_BONUS_V2.patterns.whey) {
      if (pattern.test(name)) return 'whey';
    }
    
    // 2. Проверяем растительный (до animal, т.к. "соевое мясо" = plant)
    for (const pattern of PROTEIN_BONUS_V2.patterns.plant) {
      if (pattern.test(name)) return 'plant';
    }
    
    // 3. Проверяем животный
    for (const pattern of PROTEIN_BONUS_V2.patterns.animal) {
      if (pattern.test(name)) return 'animal';
    }
    
    // 4. Проверяем по категории
    if (PROTEIN_BONUS_V2.categories.animal.includes(category)) return 'animal';
    if (PROTEIN_BONUS_V2.categories.plant.includes(category)) return 'plant';
    if (PROTEIN_BONUS_V2.categories.dairy.includes(category)) return 'animal'; // казеин
    
    // 5. Не определили — mixed
    return 'mixed';
  };

  /**
   * 🆕 Рассчитать бонус белка с учётом типа (v4.0.0)
   * @param {number} proteinGrams - граммы белка
   * @param {string} proteinType - 'animal' | 'plant' | 'whey' | 'mixed'
   * @returns {Object} { bonus, baseBonus, multiplier, type, tier }
   */
  const calculateProteinBonusV2 = (proteinGrams, proteinType = 'mixed') => {
    const cfg = PROTEIN_BONUS_V2;
    const thresholds = cfg.thresholds;
    const baseBonuses = cfg.baseBonuses;
    
    // Определяем tier
    let tier = null;
    let baseBonus = 0;
    
    if (proteinGrams >= thresholds.veryHigh) {
      tier = 'veryHigh';
      baseBonus = baseBonuses.veryHigh;
    } else if (proteinGrams >= thresholds.high) {
      tier = 'high';
      baseBonus = baseBonuses.high;
    } else if (proteinGrams >= thresholds.medium) {
      tier = 'medium';
      baseBonus = baseBonuses.medium;
    } else {
      // Меньше 20г — нет бонуса
      return { bonus: 0, baseBonus: 0, multiplier: 1, type: proteinType, tier: null };
    }
    
    // Применяем множитель типа
    const typeConfig = cfg[proteinType] || cfg.mixed;
    const multiplier = typeConfig.multiplier;
    const bonus = baseBonus * multiplier;
    
    return {
      bonus,        // Итоговый бонус (например, 0.126 = +12.6%)
      baseBonus,    // Базовый до множителя
      multiplier,   // Множитель типа (1.8 для animal)
      type: proteinType,
      tier,
      label: typeConfig.label,
      desc: typeConfig.desc
    };
  };

  // ============================================================================
  // 🆕 WAVE_SHAPE_V2 — Multi-component Gaussian Wave Model (v4.0.0)
  // ============================================================================
  // 🔬 Научное обоснование: Caumo et al. 2000 (PMID: 10780864)
  // Инсулиновый ответ = сумма нескольких компонентов с разной динамикой:
  // - Fast (Быстрый): первичный выброс, пик ~15-30 мин
  // - Slow (Медленный): вторичная секреция, пик ~60-90 мин
  // - Hepatic (Печёночный): клиренс и производство, более плоская кривая
  // ============================================================================
  const WAVE_SHAPE_V2 = {
    // Базовые компоненты Gaussian
    components: {
      fast: {
        // Быстрый компонент — первая фаза секреции
        peakOffset: 0.15,    // Пик на 15% длины волны
        sigma: 0.12,         // Ширина пика (σ)
        baseAmplitude: 0.6,  // Базовая амплитуда (вклад 60%)
        // Модификаторы
        giMultiplier: 1.3,   // Высокий ГИ → усиление быстрого компонента
        liquidBoost: 1.5,    // Жидкая пища → ещё быстрее
        fiberDamping: 0.7    // Клетчатка → замедляет
      },
      slow: {
        // Медленный компонент — вторичная секреция
        peakOffset: 0.45,    // Пик на 45% длины волны
        sigma: 0.25,         // Более широкий пик
        baseAmplitude: 0.35, // Вклад 35%
        // Модификаторы
        proteinBoost: 1.4,   // Белок усиливает медленный компонент
        fatBoost: 1.3,       // Жиры тоже
        complexCarbBoost: 1.2 // Сложные углеводы
      },
      hepatic: {
        // Печёночный компонент — базальная секреция и клиренс
        peakOffset: 0.70,    // Позже в волне
        sigma: 0.35,         // Самый широкий
        baseAmplitude: 0.05, // Минимальный вклад 5%
        // Модификаторы
        insulinResistanceBoost: 1.5, // IR увеличивает этот компонент
        alcoholBoost: 1.3    // Алкоголь влияет на печёночный метаболизм
      }
    },
    
    // Параметры композиции
    composition: {
      baselineLevel: 0.05,   // Базальный уровень (5% от пика)
      normalizeToOne: true,  // Нормализовать пик к 1.0
      samplePoints: 100      // Точек для построения кривой
    },
    
    // Пороги для категоризации формы волны
    shapeCategories: {
      spike: { fastRatio: 0.7, desc: 'Резкий пик (быстрые углеводы)' },
      balanced: { fastRatio: 0.5, desc: 'Сбалансированная волна' },
      prolonged: { fastRatio: 0.3, desc: 'Растянутая волна (много белка/жиров)' }
    }
  };

  /**
   * 🆕 Генерация Gaussian компонента волны
   * @param {number} t - время (0-1, нормализованное)
   * @param {number} peak - позиция пика (0-1)
   * @param {number} sigma - ширина (σ)
   * @param {number} amplitude - амплитуда
   * @returns {number} значение функции в точке t
   */
  const gaussianComponent = (t, peak, sigma, amplitude) => {
    return amplitude * Math.exp(-Math.pow(t - peak, 2) / (2 * sigma * sigma));
  };

  /**
   * 🆕 Расчёт параметров компонентов на основе состава приёма
   * @param {Object} nutrients - { carbs, simple, complex, protein, fat, fiber, gi }
   * @param {Object} context - { isLiquid, irScore, hasAlcohol }
   * @returns {Object} модифицированные параметры компонентов
   */
  const calculateComponentParams = (nutrients, context = {}) => {
    const cfg = WAVE_SHAPE_V2.components;
    const { carbs = 0, simple = 0, complex = 0, protein = 0, fat = 0, fiber = 0, gi = 50 } = nutrients;
    const { isLiquid = false, irScore = 0, hasAlcohol = false } = context;
    
    // Соотношения
    const simpleRatio = carbs > 0 ? simple / carbs : 0;
    const totalMacros = carbs + protein + fat;
    const proteinRatio = totalMacros > 0 ? protein / totalMacros : 0;
    const fatRatio = totalMacros > 0 ? fat / totalMacros : 0;
    
    // === Fast компонент ===
    let fastAmplitude = cfg.fast.baseAmplitude;
    let fastSigma = cfg.fast.sigma;
    let fastPeak = cfg.fast.peakOffset;
    
    // Высокий ГИ → больше быстрый компонент
    if (gi > 70) fastAmplitude *= cfg.fast.giMultiplier;
    // Много простых углеводов → ещё выше
    if (simpleRatio > 0.5) fastAmplitude *= 1 + (simpleRatio - 0.5);
    // Жидкая пища → быстрее и острее
    if (isLiquid) {
      fastAmplitude *= cfg.fast.liquidBoost;
      fastSigma *= 0.8; // Уже пик
      fastPeak *= 0.8;  // Раньше пик
    }
    // Клетчатка → демпфирует
    if (fiber >= 5) {
      fastAmplitude *= cfg.fast.fiberDamping;
      fastSigma *= 1.2; // Шире пик
    }
    
    // === Slow компонент ===
    let slowAmplitude = cfg.slow.baseAmplitude;
    let slowSigma = cfg.slow.sigma;
    let slowPeak = cfg.slow.peakOffset;
    
    // Белок усиливает медленный компонент
    if (protein >= 20) slowAmplitude *= cfg.slow.proteinBoost;
    // Жиры тоже
    if (fat >= 15) slowAmplitude *= cfg.slow.fatBoost;
    // Сложные углеводы
    if (complex > simple) slowAmplitude *= cfg.slow.complexCarbBoost;
    
    // === Hepatic компонент ===
    let hepaticAmplitude = cfg.hepatic.baseAmplitude;
    let hepaticSigma = cfg.hepatic.sigma;
    let hepaticPeak = cfg.hepatic.peakOffset;
    
    // Инсулинорезистентность увеличивает этот компонент
    if (irScore > 0.3) hepaticAmplitude *= cfg.hepatic.insulinResistanceBoost * (1 + irScore);
    // Алкоголь влияет на печёночный метаболизм
    if (hasAlcohol) hepaticAmplitude *= cfg.hepatic.alcoholBoost;
    
    return {
      fast: { amplitude: fastAmplitude, sigma: fastSigma, peak: fastPeak },
      slow: { amplitude: slowAmplitude, sigma: slowSigma, peak: slowPeak },
      hepatic: { amplitude: hepaticAmplitude, sigma: hepaticSigma, peak: hepaticPeak }
    };
  };

  /**
   * 🆕 Генерация полной кривой волны (Multi-component Gaussian)
   * @param {number} waveMinutes - длина волны в минутах
   * @param {Object} nutrients - состав приёма
   * @param {Object} context - контекст (IR, жидкость и т.д.)
   * @returns {Object} { curve, peak, auc, shape, components }
   */
  const generateWaveCurve = (waveMinutes, nutrients, context = {}) => {
    const cfg = WAVE_SHAPE_V2;
    const params = calculateComponentParams(nutrients, context);
    const points = cfg.composition.samplePoints;
    
    // Генерируем кривую
    const curve = [];
    let maxValue = 0;
    let sumValue = 0;
    let peakTime = 0;
    
    for (let i = 0; i <= points; i++) {
      const t = i / points; // 0 to 1
      
      // Сумма компонентов
      const fastValue = gaussianComponent(t, params.fast.peak, params.fast.sigma, params.fast.amplitude);
      const slowValue = gaussianComponent(t, params.slow.peak, params.slow.sigma, params.slow.amplitude);
      const hepaticValue = gaussianComponent(t, params.hepatic.peak, params.hepatic.sigma, params.hepatic.amplitude);
      
      const totalValue = cfg.composition.baselineLevel + fastValue + slowValue + hepaticValue;
      
      curve.push({
        t,
        minutes: Math.round(t * waveMinutes),
        value: totalValue,
        components: { fast: fastValue, slow: slowValue, hepatic: hepaticValue }
      });
      
      sumValue += totalValue;
      if (totalValue > maxValue) {
        maxValue = totalValue;
        peakTime = t;
      }
    }
    
    // Нормализуем к 1.0 если требуется
    if (cfg.composition.normalizeToOne && maxValue > 0) {
      curve.forEach(point => {
        point.value /= maxValue;
        point.components.fast /= maxValue;
        point.components.slow /= maxValue;
        point.components.hepatic /= maxValue;
      });
    }
    
    // Определяем форму волны
    const fastContribution = params.fast.amplitude / (params.fast.amplitude + params.slow.amplitude + params.hepatic.amplitude);
    let shape = 'balanced';
    if (fastContribution >= cfg.shapeCategories.spike.fastRatio) shape = 'spike';
    else if (fastContribution <= cfg.shapeCategories.prolonged.fastRatio) shape = 'prolonged';
    
    // AUC (площадь под кривой, нормализованная)
    const auc = sumValue / (points + 1);
    
    return {
      curve,                              // Массив точек кривой
      peakTime,                           // Время пика (0-1)
      peakMinutes: Math.round(peakTime * waveMinutes), // Время пика в минутах
      auc,                                // Площадь под кривой
      shape,                              // 'spike' | 'balanced' | 'prolonged'
      shapeDesc: cfg.shapeCategories[shape]?.desc || '',
      components: params,                 // Параметры компонентов
      fastContribution,                   // Вклад быстрого компонента (0-1)
      waveMinutes                         // Длина волны в минутах
    };
  };

  // ============================================================================
  // 🆕 AUC_CALCULATION_V2 — Расширенный расчёт площади под кривой (v4.0.0)
  // ============================================================================
  // 🔬 Научное обоснование: Brouns et al. 2005 (PMID: 16034360)
  // AUC = интегральный показатель инсулинового ответа
  // Полезнее чем просто "пик" или "длина" волны
  // ============================================================================
  const AUC_CONFIG = {
    // Методы расчёта
    methods: {
      trapezoidal: true,     // Метод трапеций (основной)
      simpson: false,        // Метод Симпсона (точнее для гладких кривых)
      incremental: true      // iAUC — только превышение над базой
    },
    // Временные сегменты для частичного AUC
    segments: {
      early: { start: 0, end: 0.25, label: 'Ранний (0-25%)' },
      peak: { start: 0.15, end: 0.50, label: 'Пиковый (15-50%)' },
      late: { start: 0.50, end: 1.0, label: 'Поздний (50-100%)' }
    },
    // Референсные значения для сравнения
    reference: {
      glucose50g: 1.0,       // Нормализация: 50г глюкозы = 1.0
      whiteRice200g: 0.85,   // Белый рис 200г = 0.85 от глюкозы
      oatmeal100g: 0.45      // Овсянка 100г = 0.45 от глюкозы
    }
  };

  /**
   * 🆕 Расчёт AUC методом трапеций
   * @param {Array} curve - массив точек { t, value }
   * @param {number} startT - начало интервала (0-1)
   * @param {number} endT - конец интервала (0-1)
   * @returns {number} площадь под кривой
   */
  const calculateTrapezoidalAUC = (curve, startT = 0, endT = 1) => {
    if (!curve || curve.length < 2) return 0;
    
    let auc = 0;
    for (let i = 1; i < curve.length; i++) {
      const prev = curve[i - 1];
      const curr = curve[i];
      
      // Проверяем что точки в интервале
      if (prev.t < startT || curr.t > endT) continue;
      if (curr.t <= startT || prev.t >= endT) continue;
      
      // Обрезаем по границам интервала
      const t1 = Math.max(prev.t, startT);
      const t2 = Math.min(curr.t, endT);
      
      // Интерполируем значения на границах
      const ratio1 = prev.t === curr.t ? 0 : (t1 - prev.t) / (curr.t - prev.t);
      const ratio2 = prev.t === curr.t ? 1 : (t2 - prev.t) / (curr.t - prev.t);
      const v1 = prev.value + ratio1 * (curr.value - prev.value);
      const v2 = prev.value + ratio2 * (curr.value - prev.value);
      
      // Площадь трапеции
      auc += (v1 + v2) * (t2 - t1) / 2;
    }
    
    return auc;
  };

  /**
   * 🆕 Расчёт iAUC (incremental AUC) — только превышение над базой
   * @param {Array} curve - массив точек { t, value }
   * @param {number} baseline - базовый уровень
   * @returns {number} incremental AUC
   */
  const calculateIncrementalAUC = (curve, baseline = 0) => {
    if (!curve || curve.length < 2) return 0;
    
    // Создаём кривую с вычтенным baseline
    const adjustedCurve = curve.map(p => ({
      t: p.t,
      value: Math.max(0, p.value - baseline) // Только положительные превышения
    }));
    
    return calculateTrapezoidalAUC(adjustedCurve);
  };

  /**
   * 🆕 Полный расчёт AUC с сегментацией
   * @param {Array} curve - массив точек кривой
   * @param {Object} options - { baseline, normalize }
   * @returns {Object} { total, incremental, segments, ratio }
   */
  const calculateFullAUC = (curve, options = {}) => {
    const { baseline = WAVE_SHAPE_V2.composition.baselineLevel, normalize = true } = options;
    const cfg = AUC_CONFIG;
    
    // Полный AUC
    const totalAUC = calculateTrapezoidalAUC(curve);
    
    // Incremental AUC (только превышение над базой)
    const iAUC = calculateIncrementalAUC(curve, baseline);
    
    // AUC по сегментам
    const segments = {};
    Object.entries(cfg.segments).forEach(([key, seg]) => {
      segments[key] = {
        auc: calculateTrapezoidalAUC(curve, seg.start, seg.end),
        label: seg.label,
        start: seg.start,
        end: seg.end
      };
    });
    
    // Соотношение раннего к позднему (показатель "скорости" ответа)
    const earlyLateRatio = segments.late.auc > 0 
      ? segments.early.auc / segments.late.auc 
      : 0;
    
    // Категоризация по форме AUC
    let aucShape = 'normal';
    if (earlyLateRatio > 1.5) aucShape = 'front-loaded'; // Быстрый ответ
    else if (earlyLateRatio < 0.5) aucShape = 'prolonged'; // Затянутый ответ
    
    return {
      total: totalAUC,
      incremental: iAUC,
      segments,
      earlyLateRatio,
      aucShape,
      // Нормализованные значения (относительно референса)
      normalized: normalize ? {
        vsGlucose: totalAUC / cfg.reference.glucose50g,
        vsRice: totalAUC / cfg.reference.whiteRice200g,
        vsOatmeal: totalAUC / cfg.reference.oatmeal100g
      } : null
    };
  };

  // ============================================================================
  // 🆕 INSULIN_PREDICTOR_V2 — Прогноз уровня инсулина (v4.0.0)
  // ============================================================================
  // 🔬 Научное обоснование: Dalla Man et al. 2007 (PMID: 17513708)
  // Модель UVA/Padova — предиктивная модель глюкозо-инсулиновой динамики
  // ============================================================================
  const INSULIN_PREDICTOR_CONFIG = {
    // Стандартные временные точки прогноза (минуты)
    timePoints: [15, 30, 60, 90, 120],
    
    // Уровни для интерпретации (относительно пика)
    levels: {
      peak: { min: 0.9, max: 1.0, label: 'Пиковый уровень' },
      high: { min: 0.6, max: 0.9, label: 'Высокий уровень' },
      moderate: { min: 0.3, max: 0.6, label: 'Умеренный уровень' },
      low: { min: 0.1, max: 0.3, label: 'Низкий уровень' },
      baseline: { min: 0, max: 0.1, label: 'Базовый уровень' }
    },
    
    // Пороги для рекомендаций
    thresholds: {
      safeToEat: 0.3,        // Безопасно есть снова (≤30% от пика)
      fatBurning: 0.15,      // Начало жиросжигания (≤15% от пика)
      optimalWindow: 0.25    // Оптимальное окно для следующего приёма
    }
  };

  /**
   * 🆕 Получить уровень инсулина на кривой в момент времени
   * @param {Array} curve - массив точек { t, minutes, value }
   * @param {number} minutes - время в минутах
   * @returns {Object} { value, level, label }
   */
  const getInsulinLevelAtTime = (curve, minutes) => {
    if (!curve || curve.length === 0) {
      return { value: 0, level: 'baseline', label: 'Нет данных' };
    }
    
    // Находим ближайшую точку или интерполируем
    const waveMinutes = curve[curve.length - 1].minutes;
    const t = Math.min(minutes / waveMinutes, 1);
    
    // Находим точки для интерполяции
    let prev = curve[0];
    let next = curve[curve.length - 1];
    
    for (let i = 0; i < curve.length - 1; i++) {
      if (curve[i].t <= t && curve[i + 1].t >= t) {
        prev = curve[i];
        next = curve[i + 1];
        break;
      }
    }
    
    // Линейная интерполяция
    const ratio = next.t === prev.t ? 0 : (t - prev.t) / (next.t - prev.t);
    const value = prev.value + ratio * (next.value - prev.value);
    
    // Определяем уровень
    const cfg = INSULIN_PREDICTOR_CONFIG.levels;
    let level = 'baseline';
    let label = cfg.baseline.label;
    
    if (value >= cfg.peak.min) { level = 'peak'; label = cfg.peak.label; }
    else if (value >= cfg.high.min) { level = 'high'; label = cfg.high.label; }
    else if (value >= cfg.moderate.min) { level = 'moderate'; label = cfg.moderate.label; }
    else if (value >= cfg.low.min) { level = 'low'; label = cfg.low.label; }
    
    return { value, level, label, minutes, t };
  };

  /**
   * 🆕 Полный прогноз инсулина с рекомендациями
   * @param {Array} curve - кривая волны
   * @param {number} waveMinutes - длина волны в минутах
   * @returns {Object} { predictions, recommendations, safeToEatAt, fatBurningAt }
   */
  const predictInsulinResponse = (curve, waveMinutes) => {
    const cfg = INSULIN_PREDICTOR_CONFIG;
    
    // Прогнозы на стандартные точки
    const predictions = cfg.timePoints.map(minutes => {
      const result = getInsulinLevelAtTime(curve, minutes);
      return {
        minutes,
        ...result,
        formatted: `${minutes} мин: ${(result.value * 100).toFixed(0)}% — ${result.label}`
      };
    });
    
    // Находим важные моменты
    let safeToEatAt = null;
    let fatBurningAt = null;
    let optimalWindowAt = null;
    
    for (const point of curve) {
      const minutes = point.minutes;
      const value = point.value;
      
      if (safeToEatAt === null && value <= cfg.thresholds.safeToEat) {
        safeToEatAt = minutes;
      }
      if (fatBurningAt === null && value <= cfg.thresholds.fatBurning) {
        fatBurningAt = minutes;
      }
      if (optimalWindowAt === null && value <= cfg.thresholds.optimalWindow) {
        optimalWindowAt = minutes;
      }
    }
    
    // Рекомендации
    const recommendations = [];
    
    if (safeToEatAt) {
      recommendations.push({
        type: 'safe_to_eat',
        minutes: safeToEatAt,
        text: `Безопасно есть снова через ${safeToEatAt} мин`,
        icon: '🍽️'
      });
    }
    
    if (fatBurningAt) {
      recommendations.push({
        type: 'fat_burning',
        minutes: fatBurningAt,
        text: `Жиросжигание начнётся через ${fatBurningAt} мин`,
        icon: '🔥'
      });
    }
    
    if (optimalWindowAt) {
      recommendations.push({
        type: 'optimal_window',
        minutes: optimalWindowAt,
        text: `Оптимальное окно для еды: после ${optimalWindowAt} мин`,
        icon: '⭐'
      });
    }
    
    return {
      predictions,
      recommendations,
      safeToEatAt,
      fatBurningAt,
      optimalWindowAt,
      waveMinutes,
      summary: generatePredictionSummary(predictions, safeToEatAt, fatBurningAt)
    };
  };

  /**
   * 🆕 Генерация текстового саммари прогноза
   */
  const generatePredictionSummary = (predictions, safeToEatAt, fatBurningAt) => {
    const p30 = predictions.find(p => p.minutes === 30);
    const p60 = predictions.find(p => p.minutes === 60);
    const p120 = predictions.find(p => p.minutes === 120);
    
    let summary = '';
    
    if (p30) {
      summary += `Через 30 мин: ${p30.label.toLowerCase()}. `;
    }
    if (p60) {
      summary += `Через 1 час: ${p60.label.toLowerCase()}. `;
    }
    if (fatBurningAt) {
      summary += `Жиросжигание: с ${fatBurningAt} мин.`;
    }
    
    return summary.trim();
  };

  // ============================================================================
  // 🆕 WAVE_SCORING_V2 — Система оценки качества волны (v4.0.0)
  // ============================================================================
  // 🔬 Научное обоснование: Интегральная оценка инсулинового ответа
  // Учитывает: пик, длительность, форму, AUC, контекст
  // ============================================================================
  const WAVE_SCORING_V2 = {
    // Веса компонентов оценки (сумма = 1.0)
    weights: {
      peakHeight: 0.25,      // Высота пика (меньше = лучше)
      duration: 0.20,        // Длительность (оптимум = целевая)
      shape: 0.20,           // Форма волны (prolonged лучше spike)
      auc: 0.20,             // Площадь под кривой
      context: 0.15          // Контекст (тренировка, время суток)
    },
    
    // Пороги для каждого компонента
    thresholds: {
      peakHeight: {
        excellent: 0.6,     // Пик ≤60% от максимума = отлично
        good: 0.75,         // Пик ≤75% = хорошо
        fair: 0.9,          // Пик ≤90% = нормально
        poor: 1.0           // Пик >90% = плохо
      },
      duration: {
        target: 180,        // Целевая длина волны (минуты)
        tolerance: 30,      // Допустимое отклонение ±30 мин
        maxPenalty: 60      // После этого отклонения — макс штраф
      },
      auc: {
        excellent: 0.5,     // iAUC ≤50% от референса = отлично
        good: 0.75,
        fair: 1.0,
        poor: 1.5
      }
    },
    
    // Итоговые уровни оценки
    levels: {
      excellent: { min: 85, label: 'Отлично', icon: '🌟', color: '#22c55e' },
      good: { min: 70, label: 'Хорошо', icon: '✅', color: '#84cc16' },
      fair: { min: 50, label: 'Нормально', icon: '➖', color: '#eab308' },
      poor: { min: 0, label: 'Требует внимания', icon: '⚠️', color: '#ef4444' }
    }
  };

  /**
   * 🆕 Оценка компонента "высота пика"
   * @param {number} peakValue - значение пика (0-1)
   * @returns {number} оценка 0-100
   */
  const scorePeakHeight = (peakValue) => {
    const th = WAVE_SCORING_V2.thresholds.peakHeight;
    
    if (peakValue <= th.excellent) return 100;
    if (peakValue <= th.good) {
      return 100 - (peakValue - th.excellent) / (th.good - th.excellent) * 20;
    }
    if (peakValue <= th.fair) {
      return 80 - (peakValue - th.good) / (th.fair - th.good) * 30;
    }
    return Math.max(0, 50 - (peakValue - th.fair) / (th.poor - th.fair) * 50);
  };

  /**
   * 🆕 Оценка компонента "длительность"
   * @param {number} minutes - длина волны в минутах
   * @returns {number} оценка 0-100
   */
  const scoreDuration = (minutes) => {
    const th = WAVE_SCORING_V2.thresholds.duration;
    const deviation = Math.abs(minutes - th.target);
    
    if (deviation <= th.tolerance) {
      return 100 - (deviation / th.tolerance) * 15; // До 85 при макс отклонении в норме
    }
    
    const extraDeviation = deviation - th.tolerance;
    const penaltyRange = th.maxPenalty - th.tolerance;
    const penalty = Math.min(1, extraDeviation / penaltyRange);
    
    return Math.max(0, 85 - penalty * 85);
  };

  /**
   * 🆕 Оценка компонента "форма волны"
   * @param {string} shape - тип формы (spike/balanced/prolonged)
   * @param {number} fastContribution - вклад быстрого компонента
   * @returns {number} оценка 0-100
   */
  const scoreWaveShape = (shape, fastContribution = 0.5) => {
    // Prolonged лучше (меньше стресс для поджелудочной)
    switch (shape) {
      case 'prolonged': return 95;
      case 'balanced': return 80;
      case 'spike': return 50;
      default: 
        // Плавная оценка по fastContribution
        // Меньше fast = лучше
        return Math.round(100 - fastContribution * 60);
    }
  };

  /**
   * 🆕 Оценка компонента "AUC"
   * @param {number} normalizedAUC - AUC относительно референса
   * @returns {number} оценка 0-100
   */
  const scoreAUC = (normalizedAUC) => {
    const th = WAVE_SCORING_V2.thresholds.auc;
    
    if (normalizedAUC <= th.excellent) return 100;
    if (normalizedAUC <= th.good) {
      return 100 - (normalizedAUC - th.excellent) / (th.good - th.excellent) * 20;
    }
    if (normalizedAUC <= th.fair) {
      return 80 - (normalizedAUC - th.good) / (th.fair - th.good) * 30;
    }
    if (normalizedAUC <= th.poor) {
      return 50 - (normalizedAUC - th.fair) / (th.poor - th.fair) * 50;
    }
    return 0;
  };

  /**
   * 🆕 Оценка компонента "контекст"
   * @param {Object} context - контекст приёма { hasTraining, isPostWorkout, circadianPeriod }
   * @returns {number} оценка 0-100
   */
  const scoreContext = (context = {}) => {
    let score = 70; // Базовый уровень
    
    // Бонус за тренировку
    if (context.hasTraining || context.isPostWorkout) {
      score += 15; // Инсулин идёт в мышцы
    }
    
    // Бонус за хорошее время суток
    const period = context.circadianPeriod;
    if (period === 'morning' || period === 'day') {
      score += 10; // Лучшая чувствительность к инсулину утром
    } else if (period === 'night') {
      score -= 10; // Худшая чувствительность ночью
    }
    
    // Бонус за оптимальный интервал между приёмами
    if (context.mealGapMinutes && context.mealGapMinutes >= 180) {
      score += 5;
    }
    
    return Math.min(100, Math.max(0, score));
  };

  /**
   * 🆕 Полный расчёт оценки волны
   * @param {Object} waveData - данные волны из calculateWaveForMeal
   * @param {Object} context - контекст
   * @returns {Object} { score, level, components, recommendations }
   */
  const calculateWaveScore = (waveData, context = {}) => {
    const cfg = WAVE_SCORING_V2;
    const weights = cfg.weights;
    
    // Компоненты оценки
    const components = {
      peakHeight: {
        value: waveData.peakValue || 1,
        score: scorePeakHeight(waveData.peakValue || 1),
        weight: weights.peakHeight
      },
      duration: {
        value: waveData.waveMinutes || 180,
        score: scoreDuration(waveData.waveMinutes || 180),
        weight: weights.duration
      },
      shape: {
        value: waveData.shape || 'balanced',
        score: scoreWaveShape(waveData.shape, waveData.fastContribution),
        weight: weights.shape
      },
      auc: {
        value: waveData.auc?.normalized?.vsGlucose || 1,
        score: scoreAUC(waveData.auc?.normalized?.vsGlucose || 1),
        weight: weights.auc
      },
      context: {
        value: context,
        score: scoreContext(context),
        weight: weights.context
      }
    };
    
    // Взвешенная сумма
    const totalScore = Object.values(components).reduce((sum, comp) => {
      return sum + comp.score * comp.weight;
    }, 0);
    
    const score = Math.round(totalScore);
    
    // Определяем уровень
    let level = cfg.levels.poor;
    for (const [key, lvl] of Object.entries(cfg.levels)) {
      if (score >= lvl.min) {
        level = { ...lvl, key };
      }
    }
    
    // Рекомендации по улучшению
    const recommendations = [];
    
    if (components.peakHeight.score < 70) {
      recommendations.push({
        type: 'peak',
        text: 'Добавьте клетчатку для снижения пика',
        icon: '🥬'
      });
    }
    
    if (components.shape.score < 70) {
      recommendations.push({
        type: 'shape',
        text: 'Сложные углеводы дадут более плавную волну',
        icon: '🍞'
      });
    }
    
    if (components.context.score < 70 && !context.hasTraining) {
      recommendations.push({
        type: 'activity',
        text: 'Лёгкая активность после еды улучшит утилизацию',
        icon: '🚶'
      });
    }
    
    return {
      score,
      level,
      components,
      recommendations,
      summary: `${level.icon} ${level.label} (${score}/100)`
    };
  };

  // 🔬 НАУЧНЫЙ АУДИТ 2025-12-10 (ChatGPT Research):
  // Клетчатка СНИЖАЕТ пик инсулина и общую AUC на 20-30% (Wolever 1991, Jenkins 1978)
  // 'Пик ниже, волна сглажена' — УМЕНЬШЕНИЕ волны, не увеличение!
  // Механизм: замедляет усвоение углеводов, снижает гликемический ответ
  const FIBER_BONUS = {
    veryHigh: { threshold: 15, bonus: -0.20 }, // 15+ г клетчатки → -20% волна
    high: { threshold: 10, bonus: -0.15 },     // 10-15 г → -15%
    medium: { threshold: 5, bonus: -0.08 }     // 5-10 г → -8%
  };
  
  // 🧈 FAT SLOWDOWN — жиры замедляют опорожнение желудка (gastric emptying)
  // Исследования: Liddle et al., 1991 — пищеварение замедляется
  // НО: эффект на ИНСУЛИН меньше чем на пищеварение!
  // 🔬 v3.7.5: Калибровка — снижены бонусы (реальный эффект ~10-15%, не 25%)
  // Жиры СГЛАЖИВАЮТ пик, но не так сильно удлиняют волну
  const FAT_BONUS = {
    high: { threshold: 25, bonus: 0.15 },    // 25+ г жира → +15% к длине волны (было +25%)
    medium: { threshold: 15, bonus: 0.10 },  // 15+ г жира → +10% к длине волны (было +15%)
    low: { threshold: 8, bonus: 0.05 }       // 8+ г жира → +5% (было +8%)
  };
  
  // 🥤 LIQUID FOOD — жидкая пища усваивается БЫСТРЕЕ
  // 🔬 НАУЧНЫЙ АУДИТ 2025-12-10 (ChatGPT Research):
  // 'Жидкие калории (сок, смузи) дают более быстрый и ВЫСОКИЙ пик (+30-50%)'
  // Но общая длительность волны КОРОЧЕ (нет механического переваривания)
  // Peak higher but duration shorter = компромисс
  const LIQUID_FOOD = {
    waveMultiplier: 0.75,   // Волна на 25% короче (было 18%)
    peakMultiplier: 1.35,   // 🆕 Пик на 35% выше (новый параметр)
    // Паттерны для определения жидкой пищи по названию
    patterns: [
      /сок\b/i, /\bсока\b/i, /\bсоки\b/i,
      /смузи/i, /коктейль/i, /shake/i,
      /молоко/i, /кефир/i, /ряженка/i, /айран/i, /тан\b/i,
      /йогурт.*питьевой/i, /питьевой.*йогурт/i,
      /какао/i, /горячий шоколад/i,
      /бульон/i, /суп.*пюре/i, /крем.*суп/i,
      /кола/i, /пепси/i, /фанта/i, /спрайт/i, /лимонад/i, /газировка/i,
      /энергетик/i, /energy/i,
      /протеин.*коктейль/i, /protein.*shake/i
    ],
    // Категории которые считаются жидкими
    categories: ['Напитки', 'Соки', 'Молочные напитки']
  };
  
  // 🥛 INSULINOGENIC CATEGORIES — некоторые продукты вызывают сильный инсулиновый ответ
  // даже при низком ГИ (молоко ГИ=30, но инсулиновый индекс=90!)
  // Holt et al. (1997) — "An insulin index of foods"
  const INSULINOGENIC_BONUS = {
    // Жидкие молочные — максимальный инсулиновый ответ (сывороточный белок)
    liquidDairy: {
      bonus: 0.15,  // +15% к длине волны
      patterns: [/молоко/i, /кефир/i, /ряженка/i, /простокваша/i, /айран/i],
      categories: ['Молочные напитки']
    },
    // Полужидкие/мягкие молочные — средний ответ
    softDairy: {
      bonus: 0.10,  // +10% к длине волны
      patterns: [/йогурт/i, /сметана/i, /сливки/i, /творог/i, /творожок/i],
      categories: []
    },
    // Твёрдые молочные — минимальный инсулиновый ответ
    hardDairy: {
      bonus: 0.05,  // +5% к длине волны
      patterns: [/сыр/i, /cheese/i, /пармезан/i, /моцарелла/i, /чеддер/i],
      categories: []
    },
    // Белковые продукты — вызывают инсулиновый ответ даже без углеводов
    protein: {
      bonus: 0.08,  // +8% к длине волны
      patterns: [/говядина/i, /свинина/i, /курица/i, /индейка/i, /рыба/i, /лосось/i, /тунец/i, /треска/i, /креветки/i, /мясо/i, /стейк/i, /филе/i, /грудка/i, /фарш/i],
      categories: ['Мясо', 'Рыба', 'Птица', 'Морепродукты', 'Meat', 'Fish']
    }
  };
  
  // 📊 GLYCEMIC LOAD SCALING — GL точнее предсказывает инсулиновый ответ чем просто GI
  // GL = GI × углеводы / 100 (Brand-Miller et al., 2003)
  // Пример: арбуз GI=72 высокий, но 100г арбуза = 6г углеводов → GL=4.3 (низкая!)
  // Пример: белый рис GI=73, 150г = 45г углеводов → GL=33 (очень высокая!)
  // Стандартные пороги: низкая <10, средняя 10-20, высокая >20
  // 
  // 🔬 НАУЧНЫЙ АУДИТ 2025-12-09 v2:
  // При GL < 10 инсулиновый ответ МИНИМАЛЕН — волна короткая (1-2ч максимум)
  // Mayer (1995): при <10г доступных углеводов инсулин возвращается к базовому за 1-2ч
  // Brand-Miller (2003): GL — лучший предиктор постпрандиальной гликемии
  // 
  // КЛЮЧЕВАЯ КОРРЕКЦИЯ: Множители снижены для GL < 10
  // Пример: 35г блина (GL=7) → волна ~1.5ч, НЕ 2.3ч
  const GL_CATEGORIES = {
    micro: { max: 2, multiplier: 0.25, desc: 'микро-инсулин' },             // GL<2 = ~25% волны (45 мин), кофе+молоко
    veryLow: { max: 5, multiplier: 0.40, desc: 'минимальный инсулин' },     // ~40% волны (72 мин), почти кето-еда
    low: { max: 10, multiplier: 0.55, desc: 'слабый инсулиновый ответ' },   // ~55% волны (99 мин ≈ 1.5ч)
    medium: { max: 20, multiplier: 1.0, desc: 'нормальный инсулин' },       // стандартная волна
    high: { max: 30, multiplier: 1.15, desc: 'сильный инсулиновый ответ' }, // +15% волны
    veryHigh: { max: Infinity, multiplier: 1.25, desc: 'максимальный инсулин' } // +25%
  };
  
  // ═══════════════════════════════════════════════════════════════════════════
  // 🆕 НОВЫЕ КОНЦЕПЦИИ v3.0.0
  // ═══════════════════════════════════════════════════════════════════════════
  
  // 📈 НЕПРЕРЫВНАЯ ФОРМУЛА GL — плавная кривая вместо ступенчатых категорий
  // Научное обоснование: Brand-Miller 2003 — GL лучший предиктор инсулинового ответа
  // Формула: степенная функция с плавным переходом
  const GL_CONTINUOUS = {
    minGL: 0,           // Минимальная GL
    maxGL: 40,          // После этого значения — максимальный эффект
    minMultiplier: 0.15, // Множитель при GL=0 (15% волны ≈ 27 мин)
    maxMultiplier: 1.30, // Множитель при GL≥40 (130% волны ≈ 3ч 54мин)
    // Параметры степенной кривой
    // При GL=7 (блинчик) ожидаем ~0.45 (1ч 21мин)
    // При GL=15 ожидаем ~0.75 (2ч 15мин)
    // При GL=25 ожидаем ~1.0 (3ч)
    exponent: 0.6  // Степень кривой (меньше = более пологий рост в начале)
  };

  // 👤 ПЕРСОНАЛЬНЫЙ БАЗОВЫЙ ПЕРИОД — учёт индивидуальных особенностей
  // Научное обоснование:
  // - DeFronzo 1979: возраст снижает инсулиновую чувствительность
  // - Kahn & Flier 2000: BMI влияет на инсулинорезистентность
  // - Nuutila 1995: женщины имеют лучшую чувствительность к инсулину
  // 🆕 v3.0.1: Уменьшены коэффициенты — при низкой GL эффект всё равно скалируется
  const PERSONAL_BASELINE = {
    defaultWaveHours: 3.0,  // Стандартный базовый период
    minWaveHours: 1.5,      // Минимум (очень чувствительные к инсулину)
    maxWaveHours: 4.5,      // 🆕 Уменьшено с 5.0 (слишком долгие волны нереалистичны)
    // Коэффициенты влияния — 🆕 УМЕНЬШЕНЫ вдвое (были слишком агрессивны)
    ageEffect: {
      startAge: 30,         // Возраст начала влияния
      bonusPerYear: 0.004   // 🆕 +0.4% за год (было +0.8%) — более реалистично
    },
    bmiEffect: {
      startBMI: 25,         // 🆕 BMI 25+ (было 23) — начало избыточного веса
      bonusPerUnit: 0.015   // 🆕 +1.5% за единицу (было +2.5%)
    },
    genderEffect: {
      female: -0.05,        // 🆕 Женщины -5% (было -8%)
      male: 0.03,           // 🆕 Мужчины +3% (было +5%)
      other: 0              // Нейтрально
    }
  };

  // 🔗 КУМУЛЯТИВНЫЙ ЭФФЕКТ (Meal Stacking) — перехлёст волн
  // Научное обоснование: когда новый приём пищи попадает в "активную" волну,
  // 🔬 НАУЧНАЯ КОРРЕКЦИЯ v3.7.4: "Second Meal Effect" работает В ОБРАТНУЮ СТОРОНУ!
  // Wolever 2006: первый приём с низким ГИ УЛУЧШАЕТ инсулиновый ответ на второй
  // Инсулин уже в крови → меньше нового инсулина нужно → волна КОРОЧЕ
  // 
  // Старая логика (НЕПРАВИЛЬНАЯ): перехлёст удлинял волну (+40%)
  // Новая логика (ПРАВИЛЬНАЯ): перехлёст укорачивает волну (-10...-15%)
  const MEAL_STACKING = {
    enabled: true,
    // 🆕 v3.7.4: ОТРИЦАТЕЛЬНЫЙ бонус — волна КОРОЧЕ при перехлёсте
    // Научное обоснование: инсулин уже секретирован → меньше нужно для второго приёма
    maxStackBonus: -0.15, // До -15% к длине волны (укорачивает!)
    // Коэффициент затухания
    decayRate: 0.5
  };

  // 📊 ФАЗЫ ВОЛНЫ — детальная модель инсулинового ответа
  // Научное обоснование: инсулиновый ответ имеет характерную форму:
  // 1. Rise (подъём): 15-30 мин — быстрый рост инсулина
  // 2. Plateau (плато): 30-90 мин — максимальный уровень
  // 3. Decline (спад): 60-120 мин — постепенное снижение
  // 4. Lipolysis (липолиз): после спада — жиросжигание активно
  const WAVE_PHASES = {
    rise: {
      baseMinutes: 20,        // Базовое время подъёма
      fiberBonus: 3,          // +3 мин за каждые 5г клетчатки
      liquidPenalty: 0.6      // Жидкое — на 40% быстрее подъём
    },
    plateau: {
      basePct: 0.35,          // 35% от общей длины волны
      proteinBonus: 0.05,     // +5% к плато за каждые 20г белка
      fatBonus: 0.08          // +8% к плато за каждые 15г жиров
    },
    decline: {
      basePct: 0.45,          // 45% от общей длины волны
      activityBonus: -0.15    // Тренировка ускоряет спад на 15%
    },
    // Визуализация фаз
    colors: {
      rise: '#f97316',        // Оранжевый
      plateau: '#ef4444',     // Красный (макс инсулин)
      decline: '#eab308',     // Жёлтый
      lipolysis: '#22c55e'    // Зелёный (жиросжигание)
    }
  };

  // 🥛 ИНСУЛИНОВЫЙ ИНДЕКС (II) — точнее чем просто ГИ для некоторых продуктов
  // Научное обоснование: Holt 1997 — "An insulin index of foods"
  // 
  // 🔬 v3.8.0: НАУЧНАЯ КОРРЕКЦИЯ — молочка даёт ВЫСОКИЙ пик, но КОРОТКУЮ волну!
  // Holt 1997: "Milk has high II (98) despite low GI (46)"
  // НО: высокий II = быстрый выброс инсулина = быстрее возврат к базовому
  // Жидкие молочные: пик ×1.35, волна ×0.85 (быстрее усваивается)
  // 
  // Исходная модель (v3.2.2) была НЕПРАВИЛЬНОЙ:
  // - Увеличивала GL → удлиняла волну
  // - Противоречит физиологии: быстрый пик = быстрый спад
  // 
  // Новая модель (v3.8.0):
  // - peakMultiplier: увеличивает ПИКОВЫЙ инсулин (для визуализации)
  // - waveMultiplier: уменьшает ДЛИНУ волны (быстрее спад)
  // - glBoost: умеренное увеличение effectiveGL (для корректного расчёта)
  const INSULIN_INDEX_FACTORS = {
    // Множители для разных типов продуктов
    liquidDairy: { 
      glBoost: 1.5,          // GL ×1.5 (не ×3.0 — слишком агрессивно)
      peakMultiplier: 1.35,  // Пик инсулина +35%
      waveMultiplier: 0.85,  // Волна -15% (быстрее спад)
      desc: 'Молоко, кефир — быстрый пик, короткая волна'
    },
    softDairy: { 
      glBoost: 1.3,          // GL ×1.3
      peakMultiplier: 1.25,  // Пик +25%
      waveMultiplier: 0.90,  // Волна -10%
      desc: 'Йогурт, творог'
    },
    hardDairy: { 
      glBoost: 1.1,          // GL ×1.1
      peakMultiplier: 1.10,  // Пик +10%
      waveMultiplier: 0.95,  // Волна -5%
      desc: 'Сыр — медленнее усваивается'
    },
    pureProtein: { 
      glBoost: 1.2,          // GL ×1.2 (белок даёт инсулин без углеводов)
      peakMultiplier: 1.15,  // Пик +15%
      waveMultiplier: 0.92,  // Волна -8%
      desc: 'Мясо, рыба — умеренный II'
    },
    highFiber: { 
      glBoost: 0.8,          // GL ×0.8 (снижает GL!)
      peakMultiplier: 0.85,  // Пик -15%
      waveMultiplier: 1.10,  // Волна +10% (дольше усваивается)
      desc: 'Высокая клетчатка сглаживает ответ'
    },
    // Максимальный буст к GL (защита от экстремальных значений)
    maxGLBoost: 2.0
  };

  // ═══════════════════════════════════════════════════════════════════════════
  
  // 🏃 WORKOUT ACCELERATION — тренировка ускоряет метаболизм
  const WORKOUT_BONUS = {
    // Минуты тренировки → бонус к скорости волны (уменьшение длительности)
    high: { threshold: 45, bonus: -0.15 },   // 45+ мин → волна на 15% короче
    medium: { threshold: 20, bonus: -0.08 }, // 20+ мин → волна на 8% короче
    // Интенсивные зоны (z3, z4) дают больший бонус
    intensityMultiplier: 1.5 // Интенсивные минуты считаются x1.5
  };

  // 🏃‍♂️ POSTPRANDIAL EXERCISE — физическая активность ПОСЛЕ еды
  // Научное обоснование: мышечные сокращения активируют GLUT4 транспортеры,
  // ускоряя клиренс глюкозы из крови на 20-50% (Colberg et al. 2010, Erickson et al. 2017)
  // 
  // 🆕 v3.5.1: УСИЛЕНЫ БОНУСЫ — интенсивная тренировка сразу после еды
  // практически ОСТАНАВЛИВАЕТ волну (GLUT4 работает без инсулина)
  const POSTPRANDIAL_EXERCISE = {
    // Окно эффекта: 0-2 часа после еды = максимальный эффект
    maxWindow: 120,  // 2 часа (в минутах)
    // 🆕 v3.5.1: УСИЛЕННЫЕ бонусы по интенсивности (ПОСЛЕ еды)
    // Чем раньше тренировка после еды — тем сильнее эффект
    highIntensity: { threshold: 30, bonus: -0.50 },  // 30+ мин высокой интенсивности → -50% (было -25%)
    moderate: { threshold: 20, bonus: -0.35 },       // 20+ мин умеренной → -35% (было -18%)
    light: { threshold: 15, bonus: -0.20 },          // 15+ мин лёгкой → -20% (было -10%)
    // Типы тренировок — кардио эффективнее для утилизации глюкозы
    typeMultipliers: {
      cardio: 1.3,    // Кардио +30% эффективности (было 1.2)
      strength: 1.0,  // Силовая — стандарт
      hobby: 0.8      // Хобби (прогулка, йога) — 80%
    },
    // 🆕 v3.5.1: Бонус за близость к еде (чем раньше — тем сильнее)
    // Тренировка через 10 мин после еды = +50% к бонусу
    // Тренировка через 60 мин = стандартный бонус
    // Тренировка через 120 мин = -50% к бонусу
    proximityBoost: {
      immediate: { maxGap: 15, boost: 1.5 },   // 0-15 мин → бонус ×1.5
      soon: { maxGap: 30, boost: 1.3 },        // 15-30 мин → бонус ×1.3
      medium: { maxGap: 60, boost: 1.0 },      // 30-60 мин → стандарт
      late: { maxGap: 120, boost: 0.7 }        // 60-120 мин → бонус ×0.7
    }
  };

  // 🏡 NEAT (Non-Exercise Activity Thermogenesis) — бытовая активность
  // Научное обоснование: Hamilton et al. 2007, Levine et al. 2002
  // Постоянная низкоинтенсивная активность улучшает чувствительность к инсулину
  const NEAT_BONUS = {
    high: { threshold: 60, bonus: -0.10 },    // 60+ мин → волна на 10% короче
    medium: { threshold: 30, bonus: -0.05 },  // 30+ мин → волна на 5% короче
    low: { threshold: 15, bonus: -0.02 }      // 15+ мин → минимальный эффект
  };

  // 🚶 STEPS — шаги тоже влияют на метаболизм глюкозы
  const STEPS_BONUS = {
    high: { threshold: 8000, bonus: -0.08 },   // 8000+ шагов → -8%
    medium: { threshold: 5000, bonus: -0.04 }, // 5000+ шагов → -4%
    low: { threshold: 2000, bonus: -0.02 }     // 2000+ шагов → -2%
  };
  
  // 🌅 CIRCADIAN RHYTHM — метаболизм меняется в течение дня
  // 🔬 v3.8.0: ПЛАВНАЯ синусоидальная кривая вместо ступеней (Van Cauter 1997)
  // Научное обоснование:
  // - Пик инсулиновой чувствительности: 7-9 утра (×0.85)
  // - Минимум: 22-02 ночи (×1.20)
  // - Переход плавный, привязан к 24-часовому ритму кортизола
  const CIRCADIAN_CONFIG = {
    // Ключевые точки суточного ритма (для плавной интерполяции)
    peakHour: 8,           // Час максимальной чувствительности (08:00)
    nadirHour: 24,         // Час минимальной чувствительности (00:00)
    minMultiplier: 0.85,   // Множитель в пике (утро) — волна короче
    maxMultiplier: 1.20,   // Множитель в надире (ночь) — волна длиннее
    // Описания для UI (legacy-совместимость)
    descriptions: {
      earlyMorning: { from: 5, to: 7, desc: 'Пробуждение 🌅' },
      peakMorning: { from: 7, to: 10, desc: 'Пик чувствительности 🌞' },
      midday: { from: 10, to: 14, desc: 'Обеденный период ☀️' },
      afternoon: { from: 14, to: 18, desc: 'Дневной баланс 🌤️' },
      evening: { from: 18, to: 21, desc: 'Вечерний спад 🌆' },
      lateEvening: { from: 21, to: 24, desc: 'Поздний вечер 🌙' },
      night: { from: 0, to: 5, desc: 'Ночной режим 🌑' }
    }
  };
  
  // Legacy константа для обратной совместимости
  const CIRCADIAN_MULTIPLIERS = {
    morning: { from: 6, to: 10, multiplier: 0.9, desc: 'Утренний метаболизм 🌅' },
    midday: { from: 10, to: 14, multiplier: 0.95, desc: 'Обеденный пик 🌞' },
    afternoon: { from: 14, to: 18, multiplier: 1.0, desc: 'Дневной баланс ☀️' },
    evening: { from: 18, to: 22, multiplier: 1.1, desc: 'Вечерний спад 🌆' },
    night: { from: 22, to: 6, multiplier: 1.2, desc: 'Ночной режим 🌙' }
  };
  
  // 🍽️ FASTING — голодание ПОВЫШАЕТ чувствительность к инсулину (Sutton et al., 2018)
  // После 12+ часов без еды организм более чувствителен к инсулину
  // Инсулин работает эффективнее → быстрее очищает глюкозу → волна КОРОЧЕ
  // НО: при очень долгом голодании (24ч+) может быть противоположный эффект
  const FASTING_BONUS = {
    // Часы голодания → бонус к длине волны (отрицательный = короче)
    long: { threshold: 16, bonus: -0.15 },   // 16+ часов = −15% волна (быстрее усвоение)
    medium: { threshold: 12, bonus: -0.10 }, // 12+ часов = −10%
    short: { threshold: 8, bonus: -0.05 }    // 8+ часов = −5% (минимальный эффект)
  };

  // 🌶️ SPICY FOOD — острая пища ускоряет метаболизм через термогенез
  // Капсаицин увеличивает расход энергии, но эффект умеренный (Ludy & Mattes, 2011)
  // Реальный эффект ~3-5%, не 8%
  const SPICY_FOOD = {
    multiplier: 0.96,  // На 4% быстрее
    patterns: [
      /перец.*чили/i, /чили/i, /халапеньо/i, /jalapeno/i,
      /табаско/i, /sriracha/i, /шрирача/i,
      /карри/i, /curry/i, /васаби/i, /wasabi/i,
      /горчица.*острая/i, /хрен/i,
      /острый.*соус/i, /hot.*sauce/i,
      /кимчи/i, /kimchi/i, /аджика/i,
      /харисса/i, /harissa/i
    ]
  };

  // 🍷 ALCOHOL — алкоголь замедляет метаболизм и блокирует липолиз
  // Печень переключается на переработку алкоголя, инсулин дольше в крови
  const ALCOHOL_BONUS = {
    high: { bonus: 0.25 },    // Крепкие напитки, много
    medium: { bonus: 0.18 },  // Вино, пиво
    low: { bonus: 0.10 },     // Слабоалкогольные
    patterns: [
      /водка/i, /виски/i, /whisky/i, /whiskey/i, /коньяк/i, /cognac/i,
      /ром/i, /rum/i, /текила/i, /tequila/i, /джин/i, /gin/i,
      /вино/i, /wine/i, /шампанское/i, /champagne/i, /просекко/i,
      /пиво/i, /beer/i, /эль/i, /ale/i, /лагер/i, /lager/i,
      /сидр/i, /cider/i, /ликёр/i, /liqueur/i,
      /мартини/i, /вермут/i, /vermouth/i,
      /коктейль.*алкогол/i, /алкогол.*коктейль/i
    ],
    // Категории крепости
    strong: [/водка/i, /виски/i, /коньяк/i, /ром/i, /текила/i, /джин/i],
    medium: [/вино/i, /шампанское/i, /просекко/i, /мартини/i, /вермут/i],
    weak: [/пиво/i, /сидр/i, /эль/i]
  };

  // ⚠️ Важно: RegExp без границ слова даёт ложные совпадения.
  // Пример: "свино-говядина" содержит подстроку "вино".
  // Поэтому для алкоголя используем токены (слова) + exact/prefix матчи.
  const ALCOHOL_MATCH = {
    strongExact: ['водка', 'виски', 'whisky', 'whiskey', 'коньяк', 'cognac', 'текила', 'tequila', 'джин', 'gin', 'ром', 'rum'],
    mediumExact: ['вино', 'wine', 'шампанское', 'champagne', 'просекко', 'мартини', 'martini', 'вермут', 'vermouth'],
    weakExact: ['пиво', 'beer', 'сидр', 'cider', 'эль', 'ale', 'лагер', 'lager', 'ликер', 'liqueur'],
    // Prefix — для словоформ/составных слов (но избегаем коротких корней типа "ром")
    strongPrefix: ['алкогол', 'alcohol'],
    mediumPrefix: [],
    weakPrefix: ['лагер'],
    // Комбо-фразы: коктейль + алкоголь (любой порядок)
    comboAll: ['коктейл', 'cocktail'],
  };

  function normalizeTextForTokenMatch(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/ё/g, 'е')
      // Всё кроме букв/цифр → пробел
      .replace(/[^a-z0-9а-яе]+/gi, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  }

  function tokenizeText(sNorm) {
    return sNorm ? sNorm.split(' ') : [];
  }

  function tokensHasExact(tokens, exactList) {
    if (!tokens.length || !exactList?.length) return false;
    const set = new Set(exactList);
    return tokens.some((t) => set.has(t));
  }

  function tokensHasPrefix(tokens, prefixList) {
    if (!tokens.length || !prefixList?.length) return false;
    return tokens.some((t) => prefixList.some((p) => t.startsWith(p)));
  }

  function tokensHasAll(tokens, words) {
    if (!tokens.length || !words?.length) return false;
    return words.every((w) => tokens.some((t) => t.startsWith(w)));
  }

  // ☕ CAFFEINE — кофеин имеет краткосрочный эффект на инсулин
  // Исследования неоднозначны: острый эффект ~5-10%, но долгосрочно нейтрален (Lane, 2011)
  const CAFFEINE_BONUS = {
    bonus: 0.06,  // +6% к волне (краткосрочный эффект)
    patterns: [
      /кофе/i, /coffee/i, /эспрессо/i, /espresso/i,
      /капучино/i, /cappuccino/i, /латте/i, /latte/i,
      /американо/i, /americano/i, /мокко/i, /mocha/i,
      /чай.*чёрный/i, /чёрный.*чай/i, /black.*tea/i,
      /чай.*зелёный/i, /зелёный.*чай/i, /green.*tea/i,
      /матча/i, /matcha/i, /пуэр/i,
      /энергетик/i, /energy.*drink/i, /red.*bull/i, /monster/i,
      /кола/i, /cola/i, /пепси/i, /pepsi/i
    ]
  };

  // 😰 STRESS — кортизол повышает инсулин и инсулинорезистентность
  // Высокий стресс = дольше инсулиновая волна
  // ⚠️ Шкала стресса в HEYS: 1-10 (не 1-5!)
  const STRESS_BONUS = {
    high: { threshold: 7, bonus: 0.15 },    // Стресс 7-10 → +15%
    medium: { threshold: 5, bonus: 0.08 },  // Стресс 5-6 → +8%
    low: { threshold: 3, bonus: 0.00 }      // Стресс 1-4 → нет эффекта
  };

  // 😴 SLEEP DEPRIVATION — недосып повышает инсулинорезистентность
  // Даже одна ночь плохого сна увеличивает инсулинорезистентность на 20-30%
  const SLEEP_BONUS = {
    severe: { maxHours: 4, bonus: 0.20 },   // <4ч сна → +20%
    moderate: { maxHours: 5, bonus: 0.15 }, // 4-5ч → +15%
    mild: { maxHours: 6, bonus: 0.08 },     // 5-6ч → +8%
    normal: { maxHours: 24, bonus: 0.00 }   // 6+ часов → нет эффекта
  };

  // 🌟 SLEEP QUALITY — качество сна влияет независимо от продолжительности
  // Плохой сон (частые пробуждения, неглубокий) увеличивает инсулинорезистентность
  // Tasali et al. (2008): фрагментированный сон = +23% инсулинорезистентности
  // 🔬 v3.7.4: Скорректировано — +23% это для КЛИНИЧЕСКИ плохого сна в лаборатории
  // Для обычного бытового плохого сна эффект ~8%
  // ⚠️ Шкала качества в HEYS: 1-10
  const SLEEP_QUALITY_BONUS = {
    poor: { maxQuality: 4, bonus: 0.08 },      // Качество 1-4 → +8% (было +12%)
    mediocre: { maxQuality: 6, bonus: 0.04 },  // Качество 5-6 → +4% (было +6%)
    good: { maxQuality: 10, bonus: 0.00 }      // Качество 7-10 → нет эффекта
  };

  // 💧 HYDRATION — дегидратация ухудшает метаболизм глюкозы
  // Carroll et al. (2016): дегидратация повышает кортизол и глюкозу
  // 🔬 v3.7.4: Скорректировано — эффект дегидратации на инсулин ~5-8%, не 12%
  // Норма: ~35 мл/кг веса в день (для 70кг = 2450мл)
  const HYDRATION_BONUS = {
    // Процент от нормы → бонус
    severe: { maxPct: 30, bonus: 0.08 },    // <30% нормы → +8% (было +12%)
    moderate: { maxPct: 50, bonus: 0.05 },  // 30-50% → +5% (было +8%)
    mild: { maxPct: 70, bonus: 0.03 },      // 50-70% → +3% (было +4%)
    normal: { maxPct: 100, bonus: 0.00 }    // 70%+ → нет эффекта
  };

  // 👴 AGE — с возрастом инсулиновая чувствительность ЗНАЧИТЕЛЬНО снижается
  // 🔬 НАУЧНЫЙ АУДИТ 2025-12-10 (ChatGPT Research):
  // 'У 70-летних AUC инсулина может быть в ~1.5 раза больше (+50%)'
  // DeFronzo (1979): каждые 10 лет = -7-8% чувствительности
  // Chen (1985): у пожилых пик инсулина выше, клиренс медленнее
  const AGE_BONUS = {
    senior: { minAge: 70, bonus: 0.40 },    // 70+ лет → +40% (почти ×1.5)
    elderly: { minAge: 60, bonus: 0.25 },   // 60-69 → +25%
    middle: { minAge: 45, bonus: 0.12 },    // 45-59 → +12%
    adult: { minAge: 30, bonus: 0.06 },     // 30-44 → +6%
    young: { minAge: 0, bonus: 0.00 }       // <30 → нет эффекта
  };

  // 🏋️ BMI — избыточный вес снижает инсулиновую чувствительность
  // Kahn & Flier (2000): каждые +5 единиц BMI = -30% чувствительности
  const BMI_BONUS = {
    obese: { minBMI: 30, bonus: 0.20 },     // Ожирение (BMI 30+) → +20%
    overweight: { minBMI: 25, bonus: 0.10 }, // Избыточный вес (25-30) → +10%
    normal: { minBMI: 0, bonus: 0.00 }      // Норма (<25) → нет эффекта
  };

  // 🚺🚹 GENDER — женщины имеют лучшую инсулиновую чувствительность
  // Nuutila et al. (1995): женщины ~15% чувствительнее мужчин
  const GENDER_BONUS = {
    male: 0.05,    // Мужчины → +5% к волне
    female: -0.05, // Женщины → -5% к волне
    other: 0.00    // Другое → нет эффекта
  };

  // 🍟 TRANS FATS — транс-жиры ухудшают инсулиновую чувствительность
  // Salmerón et al. (2001): транс-жиры = +39% риска диабета
  const TRANS_FAT_BONUS = {
    high: { threshold: 2, bonus: 0.15 },    // 2+ г транс-жиров → +15%
    medium: { threshold: 1, bonus: 0.08 },  // 1-2 г → +8%
    low: { threshold: 0.5, bonus: 0.04 },   // 0.5-1 г → +4%
    none: { threshold: 0, bonus: 0.00 }     // <0.5 г → нет эффекта
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 🆕 НОВЫЕ ФАКТОРЫ v3.1.0 (2025-12-10) — на основе научного исследования ChatGPT
  // ═══════════════════════════════════════════════════════════════════════════

  // 🍽️ MEAL ORDER — порядок употребления пищи ЗНАЧИТЕЛЬНО влияет на инсулин
  // 🔬 НАУЧНЫЙ АУДИТ 2025-12-10 (ChatGPT Research):
  // 'Углеводы последними дали ↓ глюкозы на 30-37% через 30-60 мин и ↓ инсулина на ~20-40%'
  // Shukla et al. 2015, Alpana et al. 2017: vegetables → protein → carbs = optimal
  // Механизм: клетчатка и белок замедляют опорожнение желудка перед углеводами
  const MEAL_ORDER_BONUS = {
    carbsLast: -0.25,       // Углеводы в конце → -25% волна
    carbsFirst: 0.10,       // Углеводы сначала → +10% волна  
    mixed: 0.00             // Смешанно → нет эффекта
    // TODO: Детекция порядка требует анализа timestamps внутри приёма
  };

  // 🍎 FOOD FORM — физическая форма пищи влияет на скорость усвоения
  // 🔬 НАУЧНЫЙ АУДИТ 2025-12-10 (ChatGPT Research):
  // 'Жидкие калории = +30-50% пик инсулина, цельные продукты = более плавный ответ'
  // 'Обработанные продукты (refined) = быстрее усвоение'
  // Flood-Obbagy & Rolls 2009: apple vs apple sauce vs apple juice
  const FOOD_FORM_BONUS = {
    liquid: { multiplier: 1.30, desc: 'Жидкое → +30% пик' },
    processed: { multiplier: 1.15, desc: 'Обработанное → +15%' },
    whole: { multiplier: 0.85, desc: 'Цельное → -15%' },
    // Паттерны для определения формы
    liquidPatterns: [/сок\b/i, /смузи/i, /коктейль/i, /напиток/i],
    processedPatterns: [/хлопья/i, /мюсли.*готов/i, /быстр.*каша/i, /пюре.*пакет/i],
    wholePatterns: [/сырой/i, /свежий/i, /цельнозерн/i, /орех/i, /семена/i]
  };

  // 🥔 RESISTANT STARCH — охлаждённые крахмалы частично не усваиваются
  // 🔬 НАУЧНЫЙ АУДИТ 2025-12-10 (ChatGPT Research):
  // 'Охлаждённый рис/картофель: -15-20% гликемический ответ'
  // Robertson et al. 2005: resistant starch improves insulin sensitivity
  // Механизм: ретроградация крахмала при охлаждении → RS3
  const RESISTANT_STARCH_BONUS = {
    cooled: -0.15,  // Охлаждённые крахмалы → -15% волна
    patterns: [
      /холодн.*рис/i, /рис.*холодн/i,
      /холодн.*картофель/i, /картофель.*холодн/i,
      /окрошка/i, /салат.*картофел/i, /картофельный.*салат/i,
      /суши/i, /ролл/i  // Рис в суши обычно охлаждённый
    ]
  };

  // 🌡️ FOOD TEMPERATURE — температура пищи влияет на скорость усвоения (v3.8.0)
  // 🔬 Научное обоснование: Valdés-Ramos 2019, Sun et al. 1988
  // "Hot meals accelerate gastric emptying by 15-25% compared to cold"
  // Механизм: тёплая пища быстрее покидает желудок → быстрее инсулиновый ответ
  // НО: быстрее пик = быстрее спад? Не обязательно — зависит от состава
  // Консервативная модель: горячее +8% волна (более резкий, но такой же по длине)
  const FOOD_TEMPERATURE_BONUS = {
    hot: { 
      bonus: 0.08,        // +8% к волне (быстрее пик, но чуть дольше возврат)
      peakBoost: 1.15,    // Пик +15% (более резкий)
      patterns: [/суп/i, /борщ/i, /горяч/i, /каша/i, /пюре(?!.*пакет)/i, /рагу/i, /жарк/i, /варен/i, /тушен/i, /запечен/i, /печен/i, /жарен/i, /гриль/i],
      desc: '🔥 Горячее → быстрее пик'
    },
    cold: { 
      bonus: -0.05,       // -5% к волне (медленнее усвоение)
      peakBoost: 0.90,    // Пик -10% (более плавный)
      patterns: [/холодн/i, /мороженое/i, /ice.*cream/i, /смузи/i, /салат/i, /окрошка/i, /гаспачо/i, /охлажд/i],
      desc: '❄️ Холодное → плавнее волна'
    },
    // По умолчанию — комнатная температура, нет модификации
    room: { bonus: 0, peakBoost: 1.0, desc: 'Комнатная температура' }
  };

  // 🍽️ LARGE PORTIONS — нелинейное замедление при больших порциях (v3.8.0)
  // 🔬 Научное обоснование: Collins et al. 1991, Hunt & Stubbs 1975
  // "Meals >1000 kcal slow gastric emptying by 30-50%"
  // "Gastric distension activates vagal inhibition of emptying"
  // Механизм: большая порция → желудок растянут → медленнее опорожнение
  // Результат: дольше волна, но ниже пик (растянутый ответ)
  const LARGE_PORTION_BONUS = {
    thresholds: [
      { minKcal: 1200, bonus: 0.25, peakReduction: 0.80, desc: '>1200 ккал → +25% волна, -20% пик' },
      { minKcal: 1000, bonus: 0.18, peakReduction: 0.85, desc: '>1000 ккал → +18% волна' },
      { minKcal: 800, bonus: 0.10, peakReduction: 0.90, desc: '>800 ккал → +10% волна' },
      { minKcal: 600, bonus: 0.05, peakReduction: 0.95, desc: '>600 ккал → +5% волна' }
    ],
    // Максимальный бонус (защита от экстремальных значений)
    maxBonus: 0.30
  };

  // 🧪 ПОРОГ ЛИПОЛИЗА — при каком уровне инсулина начинается жиросжигание
  // 🔬 НАУЧНЫЙ АУДИТ 2025-12-10 (ChatGPT Research):
  // 'При инсулине ~15-20 µЕд/мл = ~50% угнетение липолиза'
  // 'При ~50-100 µЕд/мл = практически полное подавление'
  // Campbell et al. 1992, Jensen et al. 1989
  // Используется для визуализации в UI
  const LIPOLYSIS_THRESHOLDS = {
    full: { insulinUIml: 5, lipolysisPct: 100, desc: 'Полный липолиз' },        // <5 µЕд/мл
    partial: { insulinUIml: 15, lipolysisPct: 50, desc: '~50% липолиза' },      // 15 µЕд/мл
    suppressed: { insulinUIml: 50, lipolysisPct: 10, desc: 'Липолиз подавлен' }, // 50 µЕд/мл
    blocked: { insulinUIml: 100, lipolysisPct: 0, desc: 'Липолиз заблокирован' } // 100+ µЕд/мл
  };

  // ⚡ REACTIVE HYPOGLYCEMIA — риск реактивной гипогликемии
  // 🔬 НАУЧНЫЙ АУДИТ 2025-12-10 (ChatGPT Research):
  // 'Через 2-4 часа после высоко-GI еды возможен "провал" глюкозы'
  // 'Особенно при: высокий GI + низкий белок/жир + натощак'
  // Brun et al. 1995: reactive hypoglycemia patterns
  // 
  // 🆕 v3.8.0: Добавлен UI для предупреждения и проактивные советы
  const REACTIVE_HYPOGLYCEMIA = {
    riskWindow: { start: 120, end: 240 },  // 2-4 часа после еды (в минутах)
    riskFactors: {
      highGI: { threshold: 70, weight: 0.4 },     // GI > 70
      lowProtein: { threshold: 10, weight: 0.3 }, // < 10г белка
      lowFat: { threshold: 5, weight: 0.2 },      // < 5г жира
      fasted: { weight: 0.1 }                     // Натощак
    },
    // Если сумма weights > 0.6 → показать предупреждение
    warningThreshold: 0.6,
    // 🆕 v3.8.0: UI конфигурация
    ui: {
      warningEmoji: '⚡',
      warningColor: '#f97316',  // Оранжевый
      warningTitle: 'Риск голода через 2-4 часа',
      warningDesc: 'Высокий ГИ без белка/жира может вызвать резкий голод',
      advice: [
        'Добавь белок (яйцо, творог, орехи) — замедлит усвоение',
        'Добавь жиры (авокадо, масло) — сгладит пик инсулина',
        'Планируй перекус через 2-3 часа'
      ],
      // Симптомы для образования пользователя
      symptoms: ['Резкий голод', 'Слабость', 'Раздражительность', 'Потливость', 'Тремор']
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // � NEXT-DAY TRAINING EFFECT (NDTE) — эффект вчерашней тренировки
  // Версия: 1.0.0 | Дата: 2025-12-11
  //
  // Научная база:
  // - Magkos et al., Clinical Science, 2008: >900 ккал → HOMA-IR -32%
  // - Mikines et al., Am J Physiol, 1988: 600-800 ккал → +48ч эффект
  // - Jamurtas et al., Eur J Appl Physiol, 2004: REE +5-15% на 10-48ч
  // - Cartee 2011, Bird 2017: 12-48ч повышенная инсулиновая чувствительность
  //
  // Эффекты:
  // 1. TDEE буст: +4% до +15% к базовому метаболизму
  // 2. Инсулиновая волна: -8% до -35% длительность
  // 3. Пик инсулина: -10% до -40% амплитуда
  // ═══════════════════════════════════════════════════════════════════════════

  const NDTE = {
    // Максимальное окно эффекта (часы)
    maxWindowHours: 48,
    
    // Пороги энергозатрат и соответствующие бонусы
    // Научное обоснование: Magkos 2008 — порог ~900 ккал для значимого эффекта
    kcalTiers: [
      { 
        minKcal: 900, 
        tdeeBoost: 0.10,      // +10% к REE (Jamurtas 2004)
        waveReduction: 0.25,  // -25% волна (Mikines 1988: 23% меньше инсулина)
        peakReduction: 0.30,  // -30% пик инсулина
        label: '🔥 Мощная тренировка'
      },
      { 
        minKcal: 500, 
        tdeeBoost: 0.07,      // +7% к REE
        waveReduction: 0.15,  // -15% волна
        peakReduction: 0.20,  // -20% пик
        label: '💪 Хорошая нагрузка'
      },
      { 
        minKcal: 300, 
        tdeeBoost: 0.04,      // +4% к REE
        waveReduction: 0.08,  // -8% волна
        peakReduction: 0.10,  // -10% пик
        label: '⚡ Лёгкая активность'
      }
    ],
    
    // BMI модификатор — люди с избыточным весом получают БОЛЬШЕ пользы
    // Научное обоснование: у инсулинорезистентных эффект 50-80% (vs 20-50% у здоровых)
    bmiMultiplier: {
      obese: { minBMI: 30, multiplier: 1.8 },     // BMI 30+ → ×1.8 (было +80%)
      overweight: { minBMI: 25, multiplier: 1.4 }, // BMI 25-30 → ×1.4 (+40%)
      normal: { minBMI: 18.5, multiplier: 1.0 },   // BMI нормальный → ×1.0
      underweight: { minBMI: 0, multiplier: 0.8 }  // Недовес → ×0.8 (меньше запасов)
    },
    
    // Временное затухание (decay) эффекта
    // Mikines 1988: эффект сохраняется 48ч, но постепенно ослабевает
    decay: {
      halfLifeHours: 16.6,  // Половина эффекта теряется за ~17ч (exp decay)
      // Альтернатива: ступенчатое затухание
      tiers: [
        { maxHours: 12, multiplier: 1.0 },   // 0-12ч: полный эффект
        { maxHours: 24, multiplier: 0.8 },   // 12-24ч: 80%
        { maxHours: 36, multiplier: 0.5 },   // 24-36ч: 50%
        { maxHours: 48, multiplier: 0.25 }   // 36-48ч: 25%
      ]
    },
    
    // Учёт типа тренировки
    // Jamurtas 2004: силовая даёт более долгий EPOC, кардио — больший эффект в первые часы
    typeMultiplier: {
      strength: { tdee: 1.2, wave: 0.9 },  // Силовая: +20% к TDEE бусту, -10% к волне
      cardio: { tdee: 1.0, wave: 1.1 },    // Кардио: стандарт TDEE, +10% к волне
      hobby: { tdee: 0.8, wave: 0.8 }      // Хобби: ослабленные эффекты
    },
    
    // Кумулятивный эффект нескольких тренировок
    // Если вчера было 2+ тренировки, эффекты складываются (с diminishing returns)
    cumulative: {
      enabled: true,
      maxMultiplier: 1.5  // Максимум ×1.5 от базового эффекта
    },
    
    // UI конфигурация
    badge: '🔥 Эффект тренировки',
    badgeColor: '#10b981'  // Зелёный (позитивный эффект)
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // �🏋️ TRAINING CONTEXT — контекст тренировки для модификации инсулиновой волны
  // Версия: 3.3.0 | Дата: 2025-12-11
  // 
  // 10 контекстов активности:
  // 1. PERI-WORKOUT: Еда ВО ВРЕМЯ тренировки → волна до -60%, harm ×0.5
  // 2. POST-WORKOUT: Еда ПОСЛЕ → волна до -40%, ночной штраф отменяется
  // 3. PRE-WORKOUT: Еда ДО → волна -10...-20%
  // 4. STEPS: >10k шагов + ужин → -10%
  // 5. MORNING: Утренняя тренировка → весь день -5%
  // 6. DOUBLE DAY: 2+ тренировок → весь день -10%
  // 7. FASTED: Тренировка натощак → POST ×1.3
  // 8. STRENGTH+PROTEIN: Белок ≥30г после силовой → harm ×0.8
  // 9. CARDIO+SIMPLE: Простые после кардио → штраф ×0.5
  // 10. NIGHT OVERRIDE: POST-WORKOUT отменяет ночной штраф
  //
  // Научная база: Ivy & Kuo 1998, Colberg 2010, Erickson 2017
  // ═══════════════════════════════════════════════════════════════════════════

  const TRAINING_CONTEXT = {
    // === 1. PERI-WORKOUT: Еда ВО ВРЕМЯ тренировки ===
    // Мышцы активно потребляют глюкозу через GLUT4 (non-insulin-dependent)
    // Инсулиновая волна минимальна — глюкоза сразу используется как топливо
    periWorkout: {
      maxBonus: -0.60,           // До -60% к волне (зависит от интенсивности)
      harmMultiplier: 0.5,       // Вред ×0.5 (сахар = топливо, не вред)
      badge: '🏋️ Топливо',
      desc: 'Еда во время тренировки → энергия напрямую в мышцы',
      // Бонус зависит от интенсивности тренировки
      intensityScaling: {
        'HIIT': 1.0,           // Полный бонус
        'MODERATE': 0.75,      // 75% бонуса
        'LISS': 0.5            // 50% бонуса
      }
    },

    // === 2. POST-WORKOUT: Еда ПОСЛЕ тренировки ===
    // "Гликогеновое окно" — повышенная чувствительность к инсулину
    // Ivy & Kuo 1998: первые 2ч после тренировки = ×3-4 скорость синтеза гликогена
    postWorkout: {
      // Прогрессивное окно: чем больше потратил, тем дольше окно
      baseGap: 120,              // Базовое окно 2ч
      kcalScaling: 60,           // +60 мин за каждые 500 ккал (до 360)
      maxGap: 360,               // Максимум 6ч для очень тяжёлых тренировок
      
      // Бонусы по времени после тренировки
      tiers: [
        { maxMin: 30, waveBonus: -0.40, label: '🔥 Анаболическое окно' },  // 0-30 мин
        { maxMin: 60, waveBonus: -0.35, label: '🔄 Recovery' },             // 30-60 мин
        { maxMin: 120, waveBonus: -0.25, label: '⏳ Гликогеновое окно' },   // 1-2ч
        { maxMin: 240, waveBonus: -0.15, label: '📉 Позднее окно' },        // 2-4ч
        { maxMin: 360, waveBonus: -0.08, label: '💨 Остаточный эффект' }    // 4-6ч
      ],
      
      // КРИТИЧНО: Ночной штраф отменяется после тренировки!
      nightPenaltyOverride: true,
      
      // Множители по типу тренировки для WAVE BONUS (укорочение волны)
      // Научное: кардио эффективнее активирует GLUT4, силовая даёт анаболический ответ
      typeMultipliers: {
        'cardio': 1.15,         // Кардио +15% к укорочению волны (GLUT4 активация)
        'strength': 1.0,        // Силовая — стандарт
        'hobby': 0.8            // Хобби — 80%
      },
      
      badge: '🔄 Recovery',
      desc: 'Гликогеновое окно — еда идёт в восстановление'
    },

    // === 3. PRE-WORKOUT: Еда ПЕРЕД тренировкой ===
    // Топливо для тренировки, инсулин будет "сжигаться" во время активности
    // 🆕 v3.5.4: Добавлен harmMultiplier — еда перед тренировкой менее "вредна"
    preWorkout: [
      { maxGap: 45, waveBonus: -0.20, harmMultiplier: 0.6, label: '⚡ Топливо для тренировки' },  // 0-45 мин до
      { maxGap: 90, waveBonus: -0.10, harmMultiplier: 0.8, label: '🔋 Pre-workout' }              // 45-90 мин до
    ],

    // === 4. STEPS: Шаги как NEAT ===
    // Накопленные шаги улучшают инсулиновую чувствительность
    // 🆕 v3.5.5: Прогрессивные пороги, работают весь день (не только вечером)
    stepsBonus: {
      tiers: [
        { threshold: 12000, waveBonus: -0.12, harmMultiplier: 0.92, badge: '🚶 12k шагов' },
        { threshold: 10000, waveBonus: -0.10, harmMultiplier: 0.95, badge: '🚶 Активный' },
        { threshold: 7500,  waveBonus: -0.06, harmMultiplier: 0.97, badge: '🚶 7.5k шагов' },
        { threshold: 5000,  waveBonus: -0.04, harmMultiplier: 0.98, badge: '🚶 5k шагов' }
      ],
      // Для вечерних приёмов (18:00+) бонус усиливается (шаги уже накопились)
      eveningBoost: { afterHour: 18, multiplier: 1.3 }
    },

    // === 4.1. HOUSEHOLD: Бытовая активность ===
    // 🆕 v3.5.5: NEAT (бытовая активность) как отдельный контекст с бейджем
    householdBonus: {
      tiers: [
        { threshold: 90, waveBonus: -0.12, harmMultiplier: 0.90, badge: '🏠 Очень активный' },
        { threshold: 60, waveBonus: -0.10, harmMultiplier: 0.93, badge: '🏠 Активный быт' },
        { threshold: 30, waveBonus: -0.05, harmMultiplier: 0.96, badge: '🏠 Умеренный быт' }
      ]
    },

    // === 5. MORNING TRAINING: Утренняя тренировка ===
    // Тренировка до 12:00 улучшает метаболизм на весь день (EPOC)
    morningTraining: {
      beforeHour: 12,            // До полудня
      dayWaveBonus: -0.05,       // -5% ко ВСЕМ волнам за день
      badge: '🌅 Morning boost',
      desc: 'Утренняя тренировка → метаболизм ускорен весь день'
    },

    // === 6. DOUBLE TRAINING: 2+ тренировок в день ===
    // Серьёзная нагрузка = серьёзное улучшение чувствительности
    doubleTraining: {
      minTrainings: 2,           // 2 или более тренировок
      dayWaveBonus: -0.10,       // -10% ко ВСЕМ волнам
      badge: '💪 Double Day',
      desc: '2+ тренировок → максимальная чувствительность к инсулину'
    },

    // === 7. FASTED TRAINING: Тренировка натощак ===
    // После голодной тренировки восстановление КРИТИЧНО важно
    // Burke et al. 2010: fasted training enhances post-workout uptake
    fastedTraining: {
      minFastHours: 8,           // Минимум 8ч без еды перед тренировкой
      postWorkoutMultiplier: 1.3, // POST-WORKOUT бонус ×1.3
      badge: '⚡ Fasted boost',
      desc: 'Тренировка натощак → усиленное восстановление'
    },

    // === 8. STRENGTH + PROTEIN: Силовая + белок ===
    // Белок после силовой = строительство мышц, не вред
    strengthProtein: {
      minProtein: 30,            // Минимум 30г белка
      harmMultiplier: 0.8,       // Вред ×0.8 (белок = польза)
      badge: '💪 Muscle fuel',
      desc: 'Белок после силовой → анаболизм'
    },

    // === 9. CARDIO + SIMPLE CARBS: Кардио + простые углеводы ===
    // Быстрые углеводы после кардио = восполнение гликогена, не вред
    cardioSimple: {
      harmMultiplier: 0.5,       // Штраф за простые ×0.5
      glMultiplier: 0.7,         // GL ×0.7 (быстрое усвоение = хорошо)
      badge: '🏃 Glycogen refuel',
      desc: 'Простые углеводы после кардио → гликоген'
    },

    // === 10. NIGHT OVERRIDE: Ночной штраф отменяется ===
    // Если был POST-WORKOUT контекст, ночной штраф не применяется
    nightOverride: {
      // Применяется автоматически если есть postWorkout контекст
      enabled: true,
      // Максимальное время действия (часы после тренировки)
      maxHoursAfterTraining: 4
    },

    // === Приоритеты контекстов (для выбора лучшего) ===
    // При нескольких тренировках выбираем контекст с наивысшим приоритетом
    priority: {
      peri: 100,     // PERI-WORKOUT — наивысший (еда прямо сейчас)
      post: 80,      // POST-WORKOUT — высокий
      pre: 60,       // PRE-WORKOUT — средний
      steps: 20,     // STEPS — низкий (фоновый)
      household: 15, // HOUSEHOLD — между steps и morning
      morning: 10,   // MORNING — очень низкий (весь день)
      double: 10     // DOUBLE — очень низкий (весь день)
    },

    // === Интенсивность тренировки для скейлинга ===
    // HIIT создаёт EPOC до 24ч, LISS — минимальный эффект
    intensityMultiplier: {
      'HIIT': 2.0,           // Окно ×2 (до 8 часов)
      'MODERATE': 1.5,       // Окно ×1.5
      'LISS': 1.0            // Стандартное окно
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 📊 IR_SCORE_CONFIG — Конфигурация индекса инсулинорезистентности (v2.0)
  // ═══════════════════════════════════════════════════════════════════════════
  // 
  // IR Score = MULTIPLICATIVE комбинация 4 факторов:
  // - BMI: <25=1.0, <30=1.1, <35=1.25, else=1.4
  // - Sleep: ≥7h=1.0, ≥6h=1.05, else=1.15
  // - Stress: ≤3=1.0, ≤6=1.08, else=1.15
  // - Age: <30=1.0, <45=1.06, <60=1.12, else=1.25
  // 
  // Научное обоснование:
  // - DeFronzo 1979 (PMID: 510806): возраст снижает чувствительность на 10-15% за декаду
  // - Kahn & Flier 2000 (PMID: 10953022): BMI>30 = +20-40% резистентность
  // - Spiegel 1999 (PMID: 10543671): недосып <6ч = +20-30% резистентность
  // - Chrousos 2000: кортизол (стресс) = +10-20% резистентность
  // ═══════════════════════════════════════════════════════════════════════════
  const IR_SCORE_CONFIG = {
    // BMI thresholds (ascending) — чем выше BMI, тем больше резистентность
    bmi: {
      thresholds: [25, 30, 35],      // <25, 25-30, 30-35, ≥35
      factors: [1.0, 1.1, 1.25, 1.4], // Normal, Overweight, Obese I, Obese II+
      labels: ['Normal', 'Overweight', 'Obese I', 'Obese II+']
    },
    // Sleep thresholds (DESCENDING!) — меньше сна = больше резистентность
    sleep: {
      thresholds: [7, 6],            // ≥7h, 6-7h, <6h
      factors: [1.0, 1.05, 1.15],    // Optimal, Moderate, Severe deficit
      labels: ['Optimal', 'Moderate deficit', 'Severe deficit']
    },
    // Stress thresholds (ascending) — выше стресс = больше резистентность
    stress: {
      thresholds: [3, 6],            // ≤3, 4-6, >6
      factors: [1.0, 1.08, 1.15],    // Low, Medium, High
      labels: ['Low', 'Medium', 'High']
    },
    // Age thresholds (ascending) — старше = больше резистентность
    age: {
      thresholds: [30, 45, 60],      // <30, 30-45, 45-60, ≥60
      factors: [1.0, 1.06, 1.12, 1.25], // Young, Adult, Middle-age, Senior
      labels: ['Young', 'Adult', 'Middle-age', 'Senior']
    },
    // Цветовое кодирование IR Score для UI
    colorRanges: [
      { max: 1.1, color: '#22c55e', label: '🟢 Optimal' },      // Зелёный
      { max: 1.25, color: '#eab308', label: '🟡 Moderate' },    // Жёлтый
      { max: 1.5, color: '#f97316', label: '🟠 Elevated' },     // Оранжевый
      { max: Infinity, color: '#ef4444', label: '🔴 High' }     // Красный
    ]
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 📊 calculateIRScore — расчёт индекса инсулинорезистентности
  // ═══════════════════════════════════════════════════════════════════════════
  /**
   * Рассчитывает IR Score — мультипликативный индекс инсулинорезистентности.
   * 
   * IR Score = bmiFactor × sleepFactor × stressFactor × ageFactor
   * 
   * Значение ≈1.0 = отличная чувствительность, ≥1.5 = значительная резистентность.
   * 
   * @param {Object} profile - профиль пользователя
   * @param {number} profile.weight - вес (кг)
   * @param {number} profile.height - рост (см)
   * @param {number} profile.age - возраст (лет)
   * @param {Object} dayData - данные дня
   * @param {number} [dayData.sleepHours] - часы сна
   * @param {number} [dayData.stressAvg] - средний стресс (1-10)
   * @returns {Object} { score, factors, color, label, breakdown }
   */
  const calculateIRScore = (profile = {}, dayData = {}) => {
    const { weight = 70, height = 170, age = 30 } = profile;
    const { sleepHours = 7, stressAvg = 3 } = dayData;
    
    // Рассчитываем BMI
    const heightM = height / 100;
    const bmi = heightM > 0 ? weight / (heightM * heightM) : 25;
    
    // Хелпер: найти фактор по порогам (ascending)
    const getFactorAscending = (value, cfg) => {
      for (let i = 0; i < cfg.thresholds.length; i++) {
        if (value < cfg.thresholds[i]) {
          return { factor: cfg.factors[i], label: cfg.labels[i], tier: i };
        }
      }
      return { factor: cfg.factors[cfg.factors.length - 1], label: cfg.labels[cfg.labels.length - 1], tier: cfg.thresholds.length };
    };
    
    // Хелпер: найти фактор по порогам (descending — для sleep)
    const getFactorDescending = (value, cfg) => {
      for (let i = 0; i < cfg.thresholds.length; i++) {
        if (value >= cfg.thresholds[i]) {
          return { factor: cfg.factors[i], label: cfg.labels[i], tier: i };
        }
      }
      return { factor: cfg.factors[cfg.factors.length - 1], label: cfg.labels[cfg.labels.length - 1], tier: cfg.thresholds.length };
    };
    
    // Рассчитываем каждый фактор
    const bmiFactor = getFactorAscending(bmi, IR_SCORE_CONFIG.bmi);
    const sleepFactor = getFactorDescending(sleepHours, IR_SCORE_CONFIG.sleep);
    const stressFactor = getFactorAscending(stressAvg, IR_SCORE_CONFIG.stress);
    const ageFactor = getFactorAscending(age, IR_SCORE_CONFIG.age);
    
    // Мультипликативный score
    const score = bmiFactor.factor * sleepFactor.factor * stressFactor.factor * ageFactor.factor;
    
    // Определяем цвет и лейбл
    let color = '#ef4444';
    let label = '🔴 High';
    for (const range of IR_SCORE_CONFIG.colorRanges) {
      if (score <= range.max) {
        color = range.color;
        label = range.label;
        break;
      }
    }
    
    return {
      score: Math.round(score * 1000) / 1000, // 3 знака после запятой
      factors: {
        bmi: bmiFactor.factor,
        sleep: sleepFactor.factor,
        stress: stressFactor.factor,
        age: ageFactor.factor
      },
      color,
      label,
      breakdown: {
        bmi: { value: Math.round(bmi * 10) / 10, factor: bmiFactor.factor, label: bmiFactor.label },
        sleep: { value: sleepHours, factor: sleepFactor.factor, label: sleepFactor.label },
        stress: { value: stressAvg, factor: stressFactor.factor, label: stressFactor.label },
        age: { value: age, factor: ageFactor.factor, label: ageFactor.label }
      },
      // Для использования как множитель волны
      waveMultiplier: score
    };
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 🏋️ calculateActivityContext — определение контекста активности для приёма
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * 🏋️ Определить контекст активности для приёма пищи (v3.5.5)
   * 
   * Анализирует время приёма относительно тренировок и возвращает лучший контекст.
   * Контексты проверяются по приоритету (peri > post > pre > steps > household > morning/double).
   * 
   * 🆕 v3.5.5: Добавлены:
   * - Прогрессивные пороги шагов (5k/7.5k/10k/12k) с вечерним boost
   * - Бытовая активность (household) как отдельный контекст с бейджем
   * - harmMultiplier для шагов и бытовой активности
   * 
   * @param {Object} params - параметры
   * @param {number} params.mealTimeMin - время приёма в минутах от полуночи
   * @param {Array} params.trainings - массив тренировок дня [{z:[...], time:'HH:MM', type}]
   * @param {number} params.steps - шаги за день
   * @param {number} [params.householdMin=0] - минуты бытовой активности (NEAT)
   * @param {number} params.weight - вес пользователя (кг)
   * @param {Array} [params.allMeals] - все приёмы дня (для проверки fasted)
   * @param {Object} [params.mealNutrients] - нутриенты текущего приёма {prot, carbs, simple}
   * @param {number} [params.mealKcal] - калории приёма
   * @returns {Object|null} - контекст активности или null
   */
  
  /**
   * Проверяет, является ли тренировка "реальной" (не пустой/дефолтной)
   * Тренировка валидна если: есть время ИЛИ хотя бы одна зона пульса > 0
   */
  const isValidTraining = (t) => {
    if (!t) return false;
    // Есть время — валидна
    if (t.time && t.time !== '') return true;
    // Есть хоть одна зона > 0 — валидна
    const zones = t.z || [];
    return zones.some(z => +z > 0);
  };
  
  const calculateActivityContext = (params) => {
    const { mealTimeMin, trainings: rawTrainings = [], steps = 0, householdMin = 0, weight = 70, allMeals = [], mealNutrients = {}, mealKcal = 0 } = params;
    
    // 🆕 v3.7.3: Фильтруем пустые/дефолтные тренировки
    const trainings = rawTrainings.filter(isValidTraining);
    
    if (!mealTimeMin && mealTimeMin !== 0) return null;
    
    // Используем helpers из HEYS.models если доступны
    const M = (typeof HEYS !== 'undefined' && HEYS.models) ? HEYS.models : {};
    const getTrainingInterval = M.getTrainingInterval || ((t) => {
      // Fallback если модуль не загружен
      const [h, m] = (t.time || '12:00').split(':').map(Number);
      const startMin = h * 60 + m;
      const dur = (t.z || []).reduce((a, b) => a + b, 0) || 30;
      return { startMin, endMin: startMin + dur, durationMin: dur };
    });
    const getTrainingIntensityType = M.getTrainingIntensityType || ((t) => {
      const z = t.z || [];
      const highZones = (z[2] || 0) + (z[3] || 0);
      const total = z.reduce((a, b) => a + b, 0) || 1;
      if (highZones / total >= 0.5) return 'HIIT';
      if (highZones / total >= 0.2) return 'MODERATE';
      return 'LISS';
    });
    
    // Собираем все найденные контексты
    const foundContexts = [];
    
    // === Проверяем каждую тренировку ===
    for (const training of trainings) {
      if (!training || !training.time) continue;
      
      const interval = getTrainingInterval(training);
      const intensity = getTrainingIntensityType(training);
      const intensityMult = TRAINING_CONTEXT.intensityMultiplier[intensity] || 1.0;
      const { startMin, endMin, durationMin } = interval;
      
      // --- PERI-WORKOUT: еда ВО ВРЕМЯ тренировки ---
      if (mealTimeMin >= startMin && mealTimeMin <= endMin) {
        const cfg = TRAINING_CONTEXT.periWorkout;
        const progressPct = durationMin > 0 ? (mealTimeMin - startMin) / durationMin : 0.5;
        
        // 🆕 v3.5.0: Intensity-scaled PERI bonus
        // Чем интенсивнее тренировка, тем больше GLUT4 активирован
        const intensityWaveBonus = cfg.maxBonus * intensityMult; // -0.70 × 1.5 = -1.05 → cap -0.95
        const cappedWaveBonus = Math.max(-0.95, intensityWaveBonus);
        
        // harmMultiplier тоже улучшается с интенсивностью
        const intensityHarmMult = Math.max(0.2, cfg.harmMultiplier / intensityMult);
        
        foundContexts.push({
          type: 'peri',
          priority: TRAINING_CONTEXT.priority.peri,
          waveBonus: cappedWaveBonus,
          harmMultiplier: intensityHarmMult,
          badge: cfg.badge,
          desc: `${cfg.badge} Еда во время тренировки → топливо!`,
          trainingRef: { time: training.time, type: training.type, intensity },
          details: { progressPct, intensityMult, baseBonus: cfg.maxBonus, scaledBonus: cappedWaveBonus }
        });
        continue; // peri — наивысший приоритет, не проверяем другие для этой тренировки
      }
      
      // --- POST-WORKOUT: еда ПОСЛЕ тренировки ---
      if (mealTimeMin > endMin) {
        const gapMin = mealTimeMin - endMin;
        const cfg = TRAINING_CONTEXT.postWorkout;
        
        // 🆕 v3.7.7: РЕАЛЬНЫЕ ККАЛ через MET-формулу (не грубая оценка!)
        // Старая формула: durationMin * intensityMult * 5 * (weight / 70) — давала ~300 для 60 мин
        // Новая: через utils.calculateTrainingKcal(training, weight) — реальные ~700 для интенсивной кардио
        const trainingKcal = utils.calculateTrainingKcal(training, weight);
        
        // Прогрессивное окно: base + kcal/60
        const windowMin = Math.min(cfg.baseGap + trainingKcal / cfg.kcalScaling, cfg.maxGap * intensityMult);
        
        if (gapMin <= windowMin) {
          // Находим tier
          let tier = cfg.tiers[cfg.tiers.length - 1];
          for (const t of cfg.tiers) {
            // Fix: use maxMin if maxGap is missing (inconsistency in config)
            const threshold = t.maxGap || t.maxMin;
            if (gapMin <= threshold) {
              tier = t;
              break;
            }
          }
          
          // 🆕 v3.7.6: KCAL-BASED WAVE REDUCTION (MULTIPLICATIVE MODEL)
          // 
          // Научное обоснование: Ivy & Kuo 1998, Colberg 2010, Burke 2017
          // После тренировки инсулиновая чувствительность повышается ×2-3,
          // но волна НЕ исчезает полностью — только укорачивается на 30-50%
          //
          // v3.7.6 FIX: Старая модель (tier + kcal) давала до -85% — научно НЕ обосновано
          // Новая модель: МУЛЬТИПЛИКАТИВНАЯ — kcal усиливает tier-эффект, но не суммируется
          //
          // | Потрачено ккал | Множитель tier | Пример: tier=-35% |
          // |----------------|----------------|-------------------|
          // | <200           | ×1.0           | -35% → -35%       |
          // | 200-400        | ×1.15          | -35% → -40%       |
          // | 400-700        | ×1.25          | -35% → -44%       |
          // | 700-1000       | ×1.35          | -35% → -47%       |
          // | 1000+          | ×1.50          | -35% → -52%       |
          let kcalMultiplier = 1.0;
          if (trainingKcal >= 1000) {
            kcalMultiplier = 1.50; // Очень тяжёлая тренировка — усиление ×1.5
          } else if (trainingKcal >= 700) {
            kcalMultiplier = 1.35; // Тяжёлая тренировка — усиление ×1.35
          } else if (trainingKcal >= 400) {
            kcalMultiplier = 1.25; // Средняя тренировка — усиление ×1.25
          } else if (trainingKcal >= 200) {
            kcalMultiplier = 1.15; // Лёгкая тренировка — усиление ×1.15
          }
          
          // 🆕 v3.7.6: Учёт типа тренировки для wave bonus
          // Научное обоснование: кардио эффективнее активирует GLUT4 для утилизации глюкозы
          // Jamurtas 2004: кардио даёт бОльший острый эффект на инсулиновую чувствительность
          const typeBonus = cfg.typeMultipliers?.[training.type] || 1.0;
          // cardio=1.0, strength=1.1 (сильнее), hobby=0.8 (слабее)
          
          // Финальный waveBonus = tier × kcalMultiplier × typeBonus (не ниже -0.60)
          // Научное ограничение: даже после марафона волна не может быть короче 40% от нормы
          const combinedWaveBonus = Math.max(-0.60, tier.waveBonus * kcalMultiplier * typeBonus);
          
          // harmMultiplier тоже зависит от ккал (больше потратил = меньше "вред")
          const kcalHarmReduction = Math.min(0.5, trainingKcal / 2000); // max 50% reduction at 1000 ккал
          const combinedHarmMultiplier = Math.max(0.3, (tier.harmMultiplier || 0.7) - kcalHarmReduction);
          
          foundContexts.push({
            type: 'post',
            priority: TRAINING_CONTEXT.priority.post,
            waveBonus: combinedWaveBonus,
            harmMultiplier: combinedHarmMultiplier,
            badge: tier.label || tier.badge,
            desc: `${tier.label} ${gapMin} мин после ${Math.round(trainingKcal)} ккал ${training.type || 'тренировки'}`,
            nightPenaltyOverride: cfg.nightPenaltyOverride,
            trainingRef: { time: training.time, type: training.type, intensity },
            details: { 
              gapMin, 
              windowMin, 
              tier: tier.label, 
              trainingKcal: Math.round(trainingKcal),
              tierBonus: tier.waveBonus,
              kcalMultiplier,  // 🆕 v3.7.6: мультипликатор по ккал
              typeBonus,       // 🆕 v3.7.6: мультипликатор по типу (cardio=1.15)
              combinedWaveBonus,
              combinedHarmMultiplier
            }
          });
        }
      }
      
      // --- PRE-WORKOUT: еда ДО тренировки ---
      if (mealTimeMin < startMin) {
        const gapMin = startMin - mealTimeMin;
        
        for (const tier of TRAINING_CONTEXT.preWorkout) {
          if (gapMin <= tier.maxGap) {
            foundContexts.push({
              type: 'pre',
              priority: TRAINING_CONTEXT.priority.pre,
              waveBonus: tier.waveBonus,
              harmMultiplier: tier.harmMultiplier || 1.0, // 🆕 v3.5.4: pre тоже снижает вред
              badge: tier.label,
              desc: `Еда за ${gapMin} мин до тренировки → сгорит на тренировке`,
              trainingRef: { time: training.time, type: training.type, intensity },
              details: { gapMin }
            });
            break;
          }
        }
      }
    }
    
    // === STEPS: Прогрессивные пороги шагов ===
    // 🆕 v3.5.5: Работает весь день, не только вечером. Вечером бонус усиливается.
    const cfg_steps = TRAINING_CONTEXT.stepsBonus;
    for (const tier of cfg_steps.tiers) {
      if (steps >= tier.threshold) {
        // Вечерний бонус: после 18:00 шаги уже накопились → усиливаем эффект
        const isEvening = mealTimeMin >= cfg_steps.eveningBoost.afterHour * 60;
        const eveningMult = isEvening ? cfg_steps.eveningBoost.multiplier : 1.0;
        const effectiveWaveBonus = tier.waveBonus * eveningMult;
        
        foundContexts.push({
          type: 'steps',
          priority: TRAINING_CONTEXT.priority.steps,
          waveBonus: effectiveWaveBonus,
          harmMultiplier: tier.harmMultiplier,
          badge: tier.badge,
          desc: `${tier.badge} (${Math.round(steps/1000)}k)${isEvening ? ' 🌆 вечер' : ''}`,
          trainingRef: null,
          details: { steps, tier: tier.threshold, isEvening, eveningMult }
        });
        break; // Берём только лучший (первый подходящий)
      }
    }

    // === HOUSEHOLD: Бытовая активность ===
    // 🆕 v3.5.5: NEAT как отдельный Activity Context с бейджем и harmMultiplier
    const cfg_household = TRAINING_CONTEXT.householdBonus;
    // householdMin уже получен из params в деструктуризации выше
    if (cfg_household && householdMin > 0) {
      for (const tier of cfg_household.tiers) {
        if (householdMin >= tier.threshold) {
          foundContexts.push({
            type: 'household',
            priority: TRAINING_CONTEXT.priority.household || 15, // Между steps и morning
            waveBonus: tier.waveBonus,
            harmMultiplier: tier.harmMultiplier,
            badge: tier.badge,
            desc: `${tier.badge} ${householdMin} мин`,
            trainingRef: null,
            details: { householdMin, tier: tier.threshold }
          });
          break;
        }
      }
    }
    
    // === MORNING: утренняя тренировка (до 12:00) ===
    const cfg_morning = TRAINING_CONTEXT.morningTraining;
    const hasMorningTraining = trainings.some(t => {
      const [h] = (t.time || '12:00').split(':').map(Number);
      return h < cfg_morning.beforeHour;
    });
    if (hasMorningTraining) {
      foundContexts.push({
        type: 'morning',
        priority: TRAINING_CONTEXT.priority.morning,
        waveBonus: cfg_morning.dayWaveBonus,
        harmMultiplier: 1.0,
        badge: '🌅 Утренний',
        desc: '🌅 Утренняя тренировка → весь день бонус',
        trainingRef: null,
        details: {}
      });
    }
    
    // === DOUBLE: 2+ тренировки за день ===
    const cfg_double = TRAINING_CONTEXT.doubleTraining;
    if (trainings.length >= cfg_double.minTrainings) {
      foundContexts.push({
        type: 'double',
        priority: TRAINING_CONTEXT.priority.double,
        waveBonus: cfg_double.dayWaveBonus,
        harmMultiplier: 1.0,
        badge: '💪 Двойная',
        desc: `💪 ${trainings.length} тренировки → усиленный метаболизм`,
        trainingRef: null,
        details: { count: trainings.length }
      });
    }
    
    // === STRENGTH+PROTEIN: силовая + белок ≥30г ===
    const prot = mealNutrients.prot || 0;
    if (prot >= TRAINING_CONTEXT.strengthProtein.minProtein) {
      const hasStrength = trainings.some(t => t.type === 'strength');
      if (hasStrength) {
        // Проверяем POST контекст для силовой
        const strengthPost = foundContexts.find(c => c.type === 'post' && c.trainingRef?.type === 'strength');
        if (strengthPost) {
          // Улучшаем существующий post контекст
          strengthPost.harmMultiplier = Math.min(strengthPost.harmMultiplier, TRAINING_CONTEXT.strengthProtein.harmMultiplier);
          strengthPost.badge = '💪🥛 Восстановление';
          strengthPost.desc += ` | +${Math.round(prot)}г белка → harm ×${TRAINING_CONTEXT.strengthProtein.harmMultiplier}`;
          strengthPost.details.protein = prot;
        }
      }
    }
    
    // === CARDIO+SIMPLE: кардио + простые углеводы ===
    const simple = mealNutrients.simple || 0;
    if (simple > 0) {
      const hasCardio = trainings.some(t => t.type === 'cardio');
      if (hasCardio) {
        const cardioPeri = foundContexts.find(c => c.type === 'peri' && c.trainingRef?.type === 'cardio');
        const cardioPost = foundContexts.find(c => c.type === 'post' && c.trainingRef?.type === 'cardio');
        const target = cardioPeri || cardioPost;
        if (target) {
          // Уменьшаем штраф за простые углеводы
          target.simpleMultiplier = TRAINING_CONTEXT.cardioSimple.glMultiplier;
          target.desc += ` | Простые углеводы → GL ×${TRAINING_CONTEXT.cardioSimple.glMultiplier}`;
          target.details.simple = simple;
        }
      }
    }
    
    // === NIGHT OVERRIDE: ночная еда после тренировки ===
    const cfg_night = TRAINING_CONTEXT.nightOverride;
    if (cfg_night.enabled && mealTimeMin >= 22 * 60) {
      // Проверяем есть ли тренировка за последние N часов
      const recentTraining = trainings.find(t => {
        if (!t || !t.time) return false;
        const interval = getTrainingInterval(t);
        if (!interval || interval.endMin == null) return false;
        const hoursAgo = (mealTimeMin - interval.endMin) / 60;
        return hoursAgo >= 0 && hoursAgo <= cfg_night.maxHoursAfterTraining;
      });
      if (recentTraining) {
        const postContext = foundContexts.find(c => c.type === 'post' && c.trainingRef?.time === recentTraining.time);
        if (postContext) {
          postContext.nightPenaltyOverride = true;
          postContext.desc += ' | 🌙 Ночной штраф отменён';
        }
      }
    }
    
    // === Выбираем лучший контекст по приоритету ===
    if (foundContexts.length === 0) return null;
    
    foundContexts.sort((a, b) => b.priority - a.priority);
    const best = foundContexts[0];
    
    // Добавляем все найденные контексты для отладки
    best.allContexts = foundContexts.map(c => ({ type: c.type, priority: c.priority }));
    
    return best;
  };

  /**
   * 🧪 Оценить уровень инсулина по прогрессу волны (v3.2.0)
   * Научное обоснование: Campbell 1992, Jensen 1989
   * @param {number} progress - 0-100 (процент прохождения волны)
   * @returns {{ level: number, zone: string, lipolysisPct: number, desc: string, color: string }}
   */
  const estimateInsulinLevel = (progress) => {
    // Базовая модель: экспоненциальное снижение от пика (~80) до базового (~5)
    // Формула: level = 5 + 75 × e^(-progress/25)
    const level = Math.round(5 + 75 * Math.exp(-progress / 25));
    
    // Определяем зону по порогам
    if (level <= LIPOLYSIS_THRESHOLDS.full.insulinUIml) {
      return { level, zone: 'full', lipolysisPct: 100, desc: LIPOLYSIS_THRESHOLDS.full.desc, color: '#22c55e' };
    }
    if (level <= LIPOLYSIS_THRESHOLDS.partial.insulinUIml) {
      return { level, zone: 'partial', lipolysisPct: 50, desc: LIPOLYSIS_THRESHOLDS.partial.desc, color: '#eab308' };
    }
    if (level <= LIPOLYSIS_THRESHOLDS.suppressed.insulinUIml) {
      return { level, zone: 'suppressed', lipolysisPct: 10, desc: LIPOLYSIS_THRESHOLDS.suppressed.desc, color: '#f97316' };
    }
    return { level, zone: 'blocked', lipolysisPct: 0, desc: LIPOLYSIS_THRESHOLDS.blocked.desc, color: '#ef4444' };
  };

  /**
   * ⚡ Рассчитать риск реактивной гипогликемии для приёма пищи (v3.2.0)
   * Научное обоснование: Brun et al. 1995
   * @param {Object} meal - приём пищи
   * @param {Object} pIndex - индекс продуктов
   * @param {Function} getProductFromItem - функция получения продукта
   * @returns {{ score: number, hasRisk: boolean, riskWindow: Object, details: Object }}
   */
  const calculateHypoglycemiaRisk = (meal, pIndex, getProductFromItem) => {
    let riskScore = 0;
    const { riskFactors, riskWindow, warningThreshold } = REACTIVE_HYPOGLYCEMIA;
    
    // Вычисляем средний GI и макросы
    let totalGrams = 0, weightedGI = 0, totalProtein = 0, totalFat = 0;
    for (const item of (meal.items || [])) {
      const prod = getProductFromItem(item, pIndex);
      const g = item.grams || 100;
      totalGrams += g;
      weightedGI += (prod?.gi || 50) * g;
      totalProtein += (prod?.protein100 || 0) * g / 100;
      totalFat += ((prod?.fat100 || 0) + (prod?.badFat100 || 0) + (prod?.goodFat100 || 0)) * g / 100;
    }
    const avgGI = totalGrams > 0 ? weightedGI / totalGrams : 50;
    
    // Факторы риска
    if (avgGI >= riskFactors.highGI.threshold) riskScore += riskFactors.highGI.weight;
    if (totalProtein < riskFactors.lowProtein.threshold) riskScore += riskFactors.lowProtein.weight;
    if (totalFat < riskFactors.lowFat.threshold) riskScore += riskFactors.lowFat.weight;
    
    return {
      score: riskScore,
      hasRisk: riskScore >= warningThreshold,
      riskWindow,
      details: { avgGI, totalProtein, totalFat }
    };
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 🆕 НОВЫЕ ФАКТОРЫ v3.2.0 (2025-12-10) — дополнительные улучшения
  // ═══════════════════════════════════════════════════════════════════════════

  // 🧪 SUPPLEMENTS — добавки снижающие инсулиновый ответ
  // 🔬 НАУЧНЫЙ АУДИТ 2025-12-10:
  // Vinegar: Liljeberg & Björck 1998, Johnston et al. 2004 — -20-35% гликемия
  // Cinnamon: Khan et al. 2003 — -10-15% инсулин у диабетиков
  // Berberine: Yin et al. 2008 — сравним с метформином, ингибирует DPP-4
  const SUPPLEMENTS_BONUS = {
    vinegar: { bonus: -0.20, desc: 'Уксус → -20% волна' },     // Яблочный/винный уксус
    cinnamon: { bonus: -0.10, desc: 'Корица → -10% волна' },   // 1-6г корицы
    berberine: { bonus: -0.15, desc: 'Берберин → -15% волна' } // 500-1500мг берберина
  };

  // 🧊 COLD EXPOSURE — холодовое воздействие активирует бурый жир
  // 🔬 НАУЧНЫЙ АУДИТ 2025-12-10:
  // Van Marken Lichtenbelt 2009: холод +43% чувствительность к инсулину
  // Hanssen 2015: 10 дней холода (15°C) улучшает GLUT4
  // Механизм: активация BAT → повышенный клиренс глюкозы
  const COLD_EXPOSURE_BONUS = {
    coldShower: { bonus: -0.05, minutes: 3, desc: '🧊 Холодный душ → -5%' },
    coldBath: { bonus: -0.10, minutes: 10, desc: '🧊 Ледяная ванна → -10%' },
    coldSwim: { bonus: -0.12, minutes: 5, desc: '🧊 Моржевание → -12%' },
    // Длительность эффекта: ~4-6 часов после экспозиции
    effectDurationHours: 5
  };

  // 🔄 AUTOPHAGY — аутофагия активируется после длительного голодания
  // 🔬 НАУЧНЫЙ АУДИТ 2025-12-10:
  // Alirezaei et al. 2010: аутофагия в мозге мышей через 24-48ч
  // У людей: Jamshed et al. 2019 — маркеры через 16-18ч
  // mTOR отключается → AMPK активируется → ULK1 → аутофагия
  const AUTOPHAGY_TIMER = {
    // Фазы аутофагии
    phases: {
      none: { minHours: 0, maxHours: 12, label: 'Пищеварение', color: '#94a3b8', icon: '🍽️' },
      early: { minHours: 12, maxHours: 16, label: 'Переход к голоданию', color: '#eab308', icon: '⏳' },
      active: { minHours: 16, maxHours: 24, label: 'Аутофагия активна', color: '#22c55e', icon: '🔄' },
      deep: { minHours: 24, maxHours: 48, label: 'Глубокая аутофагия', color: '#10b981', icon: '✨' },
      extended: { minHours: 48, maxHours: Infinity, label: 'Продлённый пост', color: '#3b82f6', icon: '🌟' }
    },
    // Минимум для показа таймера
    minHoursToShow: 12,
    // Бонусы к инсулиновой чувствительности от аутофагии
    sensitivityBonus: {
      early: 0.05,    // +5% чувствительность
      active: 0.10,   // +10%
      deep: 0.15,     // +15%
      extended: 0.18  // +18%
    }
  };

  /**
   * 🔄 Получить фазу аутофагии по часам голодания
   * @param {number} fastingHours - часы с последней еды
   * @returns {{ phase: string, label: string, color: string, icon: string, progress: number, bonus: number }}
   */
  const getAutophagyPhase = (fastingHours) => {
    const { phases, sensitivityBonus } = AUTOPHAGY_TIMER;
    
    for (const [key, phase] of Object.entries(phases)) {
      if (fastingHours >= phase.minHours && fastingHours < phase.maxHours) {
        // Прогресс внутри фазы (0-100%)
        const phaseLength = phase.maxHours - phase.minHours;
        const progress = phaseLength < Infinity 
          ? Math.min(100, ((fastingHours - phase.minHours) / phaseLength) * 100)
          : Math.min(100, (fastingHours - phase.minHours) / 24 * 100); // Для extended
        
        return {
          phase: key,
          label: phase.label,
          color: phase.color,
          icon: phase.icon,
          progress: Math.round(progress),
          bonus: sensitivityBonus[key] || 0,
          hoursInPhase: fastingHours - phase.minHours,
          nextPhaseIn: phase.maxHours < Infinity ? phase.maxHours - fastingHours : null
        };
      }
    }
    
    return { phase: 'none', label: 'Пищеварение', color: '#94a3b8', icon: '🍽️', progress: 0, bonus: 0 };
  };

  /**
   * 🧊 Проверить наличие холодового воздействия сегодня
   * @param {Object} day - данные дня
   * @returns {{ hasCold: boolean, type: string, bonus: number, desc: string }}
   */
  const getColdExposureBonus = (day) => {
    if (!day?.coldExposure) return { hasCold: false, type: null, bonus: 0, desc: null };
    
    const { coldExposure } = day;
    const exposureType = coldExposure.type || 'coldShower';
    const config = COLD_EXPOSURE_BONUS[exposureType] || COLD_EXPOSURE_BONUS.coldShower;
    
    // Проверяем время — эффект длится ~5 часов
    if (coldExposure.time) {
      const now = new Date();
      const [h, m] = coldExposure.time.split(':').map(Number);
      const exposureTime = new Date(now);
      exposureTime.setHours(h, m, 0, 0);
      
      const hoursSince = (now - exposureTime) / (1000 * 60 * 60);
      if (hoursSince > COLD_EXPOSURE_BONUS.effectDurationHours) {
        return { hasCold: false, type: exposureType, bonus: 0, desc: 'Эффект закончился' };
      }
    }
    
    return {
      hasCold: true,
      type: exposureType,
      bonus: config.bonus,
      desc: config.desc
    };
  };

  /**
   * 🧪 Получить бонус от добавок
   * @param {Object} meal - приём пищи (если есть supplements)
   * @returns {{ hasSupplements: boolean, bonus: number, supplements: string[] }}
   */
  const getSupplementsBonus = (meal) => {
    if (!meal?.supplements || !Array.isArray(meal.supplements)) {
      return { hasSupplements: false, bonus: 0, supplements: [] };
    }
    
    let totalBonus = 0;
    const activeSupplements = [];
    
    for (const supp of meal.supplements) {
      const config = SUPPLEMENTS_BONUS[supp];
      if (config) {
        totalBonus += config.bonus;
        activeSupplements.push(supp);
      }
    }
    
    return {
      hasSupplements: activeSupplements.length > 0,
      bonus: totalBonus,
      supplements: activeSupplements
    };
  };

  const GAP_HISTORY_KEY = 'heys_meal_gaps_history';
  const GAP_HISTORY_DAYS = 14;
  
  // 🏆 LIPOLYSIS RECORDS & STREAKS
  const LIPOLYSIS_RECORD_KEY = 'heys_lipolysis_record';
  const LIPOLYSIS_STREAK_KEY = 'heys_lipolysis_streak';
  const LIPOLYSIS_HISTORY_KEY = 'heys_lipolysis_history';
  const MIN_LIPOLYSIS_FOR_STREAK = 4 * 60; // 4 часа минимум для streak
  const KCAL_PER_MIN_BASE = 1.0; // ~1 ккал/мин базовый расход в покое
  
  // === УТИЛИТЫ ===
  const utils = {
    // Время в минуты с полуночи (поддерживает 24:xx, 25:xx формат)
    timeToMinutes: (timeStr) => {
      if (!timeStr) return 0;
      const [h, m] = timeStr.split(':').map(Number);
      // 24:20 → 0*60 + 20 = 20, но для сортировки сохраняем как есть
      return (h || 0) * 60 + (m || 0);
    },
    
    // 🆕 v3.7.7: Расчёт ккал тренировки через MET-значения зон пульса
    // Научная формула: MET × 3.5 × вес / 200 = ккал/мин
    // Источник: Ainsworth 2011, Compendium of Physical Activities
    calculateTrainingKcal: (training, weight = 70) => {
      if (!training || !training.z) return 0;
      const zones = training.z || [0, 0, 0, 0];
      const totalMinutes = zones.reduce((a, b) => a + (+b || 0), 0);
      if (totalMinutes === 0) return 0;
      
      // MET значения по зонам (из heys_hr_zones или дефолтные)
      // Zone 1: 2.5 MET (восстановление, 50-60% HRmax)
      // Zone 2: 6 MET (жиросжигание, 60-70% HRmax)
      // Zone 3: 8 MET (аэробная, 70-80% HRmax)
      // Zone 4: 10 MET (анаэробная, 80-90% HRmax)
      let mets = [2.5, 6, 8, 10];
      try {
        const hrZones = (typeof lsGet === 'function') ? lsGet('heys_hr_zones', []) : [];
        if (hrZones.length >= 4) {
          mets = [2.5, 6, 8, 10].map((def, i) => +hrZones[i]?.MET || def);
        }
      } catch (e) { /* fallback to defaults */ }
      
      // ккал/мин = MET × 3.5 × вес(кг) / 200
      const kcalPerMin = (met, w) => (met * 3.5 * w / 200);
      
      const kcal = zones.reduce((sum, min, i) => sum + (+min || 0) * kcalPerMin(mets[i], weight), 0);
      return Math.round(kcal);
    },
    
    // Минуты в HH:MM (нормализует 24+ часов)
    minutesToTime: (minutes) => {
      const h = Math.floor(minutes / 60) % 24;
      const m = minutes % 60;
      return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
    },
    
    // Нормализация времени для отображения (24:20 → 00:20)
    normalizeTimeForDisplay: (timeStr) => {
      if (!timeStr) return '';
      const [h, m] = timeStr.split(':').map(Number);
      if (isNaN(h)) return timeStr;
      const normalH = h % 24;
      return String(normalH).padStart(2, '0') + ':' + String(m || 0).padStart(2, '0');
    },
    
    // Форматирование длительности
    formatDuration: (minutes) => {
      if (minutes <= 0) return '0 мин';
      const h = Math.floor(minutes / 60);
      const m = Math.round(minutes % 60);
      if (h === 0) return `${m} мин`;
      if (m === 0) return `${h}ч`;
      return `${h}ч ${m}м`;
    },
    
    // Получить категорию ГИ
    getGICategory: (gi) => {
      if (gi <= 35) return GI_CATEGORIES.low;
      if (gi <= 55) return GI_CATEGORIES.medium;
      if (gi <= 70) return GI_CATEGORIES.high;
      return GI_CATEGORIES.veryHigh;
    },
    
    // Ночное время?
    isNightTime: (hour) => hour >= 22 || hour < 6,
    
    // Получить дату в формате YYYY-MM-DD
    getDateKey: (date = new Date()) => date.toISOString().slice(0, 10),
    
    // Рекомендуемый приём по времени
    getNextMealSuggestion: (hour) => {
      if (hour >= 22 || hour < 6) return null;
      if (hour < 10) return { type: 'breakfast', icon: '🍳', name: 'Завтрак' };
      if (hour < 12) return { type: 'snack', icon: '🍎', name: 'Перекус' };
      if (hour < 14) return { type: 'lunch', icon: '🍲', name: 'Обед' };
      if (hour < 17) return { type: 'snack', icon: '🥜', name: 'Перекус' };
      if (hour < 20) return { type: 'dinner', icon: '🍽️', name: 'Ужин' };
      return { type: 'light', icon: '🥛', name: 'Лёгкий перекус' };
    },
    
    // Нормализация времени к суткам HEYS (день = 03:00 → 03:00)
    normalizeToHeysDay: (timeMin) => {
      const HEYS_DAY_START = 3 * 60; // 03:00 = 180 минут
      const totalMinutes = timeMin % (24 * 60);
      if (totalMinutes >= HEYS_DAY_START) {
        return totalMinutes - HEYS_DAY_START; // 03:00 → 0, 04:00 → 60
      }
      return totalMinutes + (24 * 60 - HEYS_DAY_START); // 00:00 → 1260, 02:59 → 1439
    }
  };
  
  // ═══════════════════════════════════════════════════════════════════════════
  // 🆕 НОВЫЕ ФУНКЦИИ v3.0.0
  // ═══════════════════════════════════════════════════════════════════════════

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

  // ═══════════════════════════════════════════════════════════════════════════
  
  // === РЕКОРДЫ И STREAK ЛИПОЛИЗА ===
  
  /**
   * Получить рекорд липолиза
   */
  const getLipolysisRecord = () => {
    try {
      const record = localStorage.getItem(LIPOLYSIS_RECORD_KEY);
      return record ? JSON.parse(record) : { minutes: 0, date: null };
    } catch (e) {
      return { minutes: 0, date: null };
    }
  };
  
  /**
   * Обновить рекорд липолиза (если побит)
   * @returns {boolean} true если рекорд побит
   */
  const updateLipolysisRecord = (minutes) => {
    const current = getLipolysisRecord();
    if (minutes > current.minutes) {
      const newRecord = { 
        minutes, 
        date: utils.getDateKey(),
        previousRecord: current.minutes > 0 ? current.minutes : null
      };
      try {
        localStorage.setItem(LIPOLYSIS_RECORD_KEY, JSON.stringify(newRecord));
      } catch (e) {}
      return true;
    }
    return false;
  };
  
  /**
   * Получить историю липолиза по дням
   */
  const getLipolysisHistory = () => {
    try {
      const history = localStorage.getItem(LIPOLYSIS_HISTORY_KEY);
      return history ? JSON.parse(history) : [];
    } catch (e) {
      return [];
    }
  };
  
  /**
   * Сохранить липолиз за день (вызывается при закрытии дня или в полночь)
   */
  const saveDayLipolysis = (date, minutes) => {
    const history = getLipolysisHistory();
    const existing = history.findIndex(h => h.date === date);
    
    if (existing >= 0) {
      history[existing].minutes = Math.max(history[existing].minutes, minutes);
    } else {
      history.push({ date, minutes });
    }
    
    // Храним последние 30 дней
    const sorted = history.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);
    
    try {
      localStorage.setItem(LIPOLYSIS_HISTORY_KEY, JSON.stringify(sorted));
    } catch (e) {}
    
    return sorted;
  };
  
  /**
   * Рассчитать streak липолиза (дни подряд с 4+ часами)
   */
  const calculateLipolysisStreak = () => {
    const history = getLipolysisHistory();
    if (history.length === 0) return { current: 0, best: 0 };
    
    // Сортируем по дате (новые первые)
    const sorted = [...history].sort((a, b) => b.date.localeCompare(a.date));
    
    let currentStreak = 0;
    let bestStreak = 0;
    let tempStreak = 0;
    
    const today = utils.getDateKey();
    const yesterday = utils.getDateKey(new Date(Date.now() - 86400000));
    
    // Проверяем непрерывность
    for (let i = 0; i < sorted.length; i++) {
      const entry = sorted[i];
      const prevEntry = sorted[i - 1];
      
      // Проверяем достаточно ли липолиза
      if (entry.minutes >= MIN_LIPOLYSIS_FOR_STREAK) {
        if (i === 0) {
          // Первый день (сегодня или вчера)
          if (entry.date === today || entry.date === yesterday) {
            tempStreak = 1;
            currentStreak = 1;
          } else {
            tempStreak = 1;
          }
        } else {
          // Проверяем последовательность дней
          const prevDate = new Date(prevEntry.date);
          const currDate = new Date(entry.date);
          const diffDays = Math.round((prevDate - currDate) / 86400000);
          
          if (diffDays === 1) {
            tempStreak++;
            if (sorted[0].date === today || sorted[0].date === yesterday) {
              currentStreak = tempStreak;
            }
          } else {
            bestStreak = Math.max(bestStreak, tempStreak);
            tempStreak = 1;
          }
        }
      } else {
        bestStreak = Math.max(bestStreak, tempStreak);
        tempStreak = 0;
        if (i === 0) currentStreak = 0;
      }
    }
    
    bestStreak = Math.max(bestStreak, tempStreak);
    
    return { current: currentStreak, best: bestStreak };
  };
  
  /**
   * Рассчитать примерно сожжённые калории за время липолиза
   * @param {number} minutes - минуты липолиза
   * @param {number} weight - вес в кг (опционально)
   */
  const calculateLipolysisKcal = (minutes, weight = 70) => {
    // Базовый расход в покое ≈ 1 ккал/мин для 70кг человека
    // Корректируем по весу: weight/70
    // Липолиз увеличивает расход примерно на 10-15%
    const baseRate = KCAL_PER_MIN_BASE * (weight / 70);
    const lipolysisBonus = 1.12; // +12% при липолизе
    
    return Math.round(minutes * baseRate * lipolysisBonus);
  };
  
  // === РАСЧЁТ ДАННЫХ ВОЛНЫ ===
  
  /**
   * Проверить, является ли продукт жидким
   * @param {Object} prod - продукт
   * @returns {boolean}
   */
  const isLiquidFood = (prod) => {
    if (!prod) return false;
    const name = (prod.name || '').toLowerCase();
    const category = (prod.category || '').toLowerCase();
    
    // Проверяем категории
    for (const cat of LIQUID_FOOD.categories) {
      if (category.includes(cat.toLowerCase())) return true;
    }
    
    // Проверяем паттерны в названии
    for (const pattern of LIQUID_FOOD.patterns) {
      if (pattern.test(name)) return true;
    }
    
    return false;
  };
  
  /**
   * Получить инсулиногенный бонус продукта (молочка, белок)
   * @param {Object} prod - продукт
   * @returns {{ type: string|null, bonus: number }}
   */
  const getInsulinogenicBonus = (prod) => {
    if (!prod) return { type: null, bonus: 0 };
    const name = (prod.name || '').toLowerCase();
    const category = (prod.category || '').toLowerCase();
    
    // Проверяем жидкие молочные (максимальный инсулиновый ответ)
    const liquidDairy = INSULINOGENIC_BONUS.liquidDairy;
    for (const cat of liquidDairy.categories) {
      if (category.includes(cat.toLowerCase())) return { type: 'liquidDairy', bonus: liquidDairy.bonus };
    }
    for (const pattern of liquidDairy.patterns) {
      if (pattern.test(name)) return { type: 'liquidDairy', bonus: liquidDairy.bonus };
    }
    
    // Проверяем мягкие молочные (средний ответ)
    const softDairy = INSULINOGENIC_BONUS.softDairy;
    for (const pattern of softDairy.patterns) {
      if (pattern.test(name)) return { type: 'softDairy', bonus: softDairy.bonus };
    }
    
    // Проверяем твёрдые молочные (минимальный ответ)
    const hardDairy = INSULINOGENIC_BONUS.hardDairy;
    for (const pattern of hardDairy.patterns) {
      if (pattern.test(name)) return { type: 'hardDairy', bonus: hardDairy.bonus };
    }
    
    // Проверяем белковые
    const protein = INSULINOGENIC_BONUS.protein;
    for (const cat of protein.categories) {
      if (category.includes(cat.toLowerCase())) return { type: 'protein', bonus: protein.bonus };
    }
    for (const pattern of protein.patterns) {
      if (pattern.test(name)) return { type: 'protein', bonus: protein.bonus };
    }
    
    return { type: null, bonus: 0 };
  };

  /**
   * 🌶️ Проверить, содержит ли приём острую пищу
   * @param {Object} prod - продукт
   * @returns {boolean}
   */
  const isSpicyFood = (prod) => {
    if (!prod) return false;
    const name = (prod.name || '').toLowerCase();
    
    for (const pattern of SPICY_FOOD.patterns) {
      if (pattern.test(name)) return true;
    }
    return false;
  };

  /**
   * 🍎 Определить физическую форму пищи (v3.2.0)
   * @param {Object} prod - продукт
   * @returns {'liquid'|'processed'|'whole'|null}
   */
  const getFoodForm = (prod) => {
    if (!prod) return null;
    const name = (prod.name || '').toLowerCase();
    
    // Жидкое — приоритет
    for (const pattern of FOOD_FORM_BONUS.liquidPatterns) {
      if (pattern.test(name)) return 'liquid';
    }
    
    // Обработанное
    for (const pattern of FOOD_FORM_BONUS.processedPatterns) {
      if (pattern.test(name)) return 'processed';
    }
    
    // Цельное
    for (const pattern of FOOD_FORM_BONUS.wholePatterns) {
      if (pattern.test(name)) return 'whole';
    }
    
    return null;
  };

  /**
   * 🥔 Проверить наличие resistant starch (охлаждённые крахмалы) (v3.2.0)
   * Научное обоснование: Robertson et al. 2005
   * @param {Object} prod - продукт
   * @returns {boolean}
   */
  const hasResistantStarch = (prod) => {
    if (!prod) return false;
    const name = (prod.name || '').toLowerCase();
    
    for (const pattern of RESISTANT_STARCH_BONUS.patterns) {
      if (pattern.test(name)) return true;
    }
    return false;
  };

  /**
   * 🍷 Получить алкогольный бонус продукта
   * @param {Object} prod - продукт
   * @returns {{ type: string|null, bonus: number }}
   */
  const getAlcoholBonus = (prod) => {
    if (!prod) return { type: null, bonus: 0 };
    const nameNorm = normalizeTextForTokenMatch(prod.name || '');
    const tokens = tokenizeText(nameNorm);

    // Комбо: коктейль + алкоголь
    if (tokensHasAll(tokens, ALCOHOL_MATCH.comboAll) && tokensHasPrefix(tokens, ALCOHOL_MATCH.strongPrefix)) {
      return { type: 'general', bonus: ALCOHOL_BONUS.low.bonus };
    }

    // Крепкие (приоритет выше)
    if (tokensHasExact(tokens, ALCOHOL_MATCH.strongExact)) {
      return { type: 'strong', bonus: ALCOHOL_BONUS.high.bonus };
    }

    // Средние
    if (tokensHasExact(tokens, ALCOHOL_MATCH.mediumExact)) {
      return { type: 'medium', bonus: ALCOHOL_BONUS.medium.bonus };
    }

    // Слабые
    if (tokensHasExact(tokens, ALCOHOL_MATCH.weakExact) || tokensHasPrefix(tokens, ALCOHOL_MATCH.weakPrefix)) {
      return { type: 'weak', bonus: ALCOHOL_BONUS.low.bonus };
    }

    // Общий случай: любое упоминание алкоголя (без ложных совпадений по подстроке)
    if (
      tokensHasPrefix(tokens, ALCOHOL_MATCH.strongPrefix) ||
      tokensHasPrefix(tokens, ALCOHOL_MATCH.mediumPrefix) ||
      tokensHasPrefix(tokens, ALCOHOL_MATCH.weakPrefix)
    ) {
      return { type: 'general', bonus: ALCOHOL_BONUS.low.bonus };
    }

    return { type: null, bonus: 0 };
  };

  /**
   * ☕ Проверить, содержит ли продукт кофеин
   * @param {Object} prod - продукт
   * @returns {boolean}
   */
  const hasCaffeine = (prod) => {
    if (!prod) return false;
    const name = (prod.name || '').toLowerCase();
    
    for (const pattern of CAFFEINE_BONUS.patterns) {
      if (pattern.test(name)) return true;
    }
    return false;
  };

  /**
   * 😰 Рассчитать бонус от стресса
   * @param {number} stressLevel - уровень стресса (1-5)
   * @returns {number} бонус к волне
   */
  const calculateStressBonus = (stressLevel) => {
    if (!stressLevel || stressLevel <= 0) return 0;
    if (stressLevel >= STRESS_BONUS.high.threshold) return STRESS_BONUS.high.bonus;
    if (stressLevel >= STRESS_BONUS.medium.threshold) return STRESS_BONUS.medium.bonus;
    return 0;
  };

  /**
   * 😴 Рассчитать бонус от недосыпа
   * @param {number} sleepHours - часов сна
   * @returns {number} бонус к волне
   */
  const calculateSleepBonus = (sleepHours) => {
    if (sleepHours === null || sleepHours === undefined || sleepHours < 0) return 0;
    if (sleepHours < SLEEP_BONUS.severe.maxHours) return SLEEP_BONUS.severe.bonus;
    if (sleepHours < SLEEP_BONUS.moderate.maxHours) return SLEEP_BONUS.moderate.bonus;
    if (sleepHours < SLEEP_BONUS.mild.maxHours) return SLEEP_BONUS.mild.bonus;
    return 0;
  };

  /**
   * 🌟 Рассчитать бонус от качества сна
   * @param {number} sleepQuality - качество сна (1-10)
   * @returns {number} бонус к волне
   */
  const calculateSleepQualityBonus = (sleepQuality) => {
    if (sleepQuality === null || sleepQuality === undefined || sleepQuality <= 0) return 0;
    if (sleepQuality <= SLEEP_QUALITY_BONUS.poor.maxQuality) return SLEEP_QUALITY_BONUS.poor.bonus;
    if (sleepQuality <= SLEEP_QUALITY_BONUS.mediocre.maxQuality) return SLEEP_QUALITY_BONUS.mediocre.bonus;
    return 0;
  };

  /**
   * 💧 Рассчитать бонус от гидратации
   * @param {number} waterMl - выпито воды (мл)
   * @param {number} weight - вес пользователя (кг) для расчёта нормы
   * @returns {number} бонус к волне
   */
  const calculateHydrationBonus = (waterMl, weight = 70) => {
    if (waterMl === null || waterMl === undefined || waterMl < 0) return 0;
    const norm = weight * 35; // 35 мл/кг
    const pct = (waterMl / norm) * 100;
    
    if (pct < 30) return HYDRATION_BONUS.severe.bonus;
    if (pct < 50) return HYDRATION_BONUS.moderate.bonus;
    if (pct < 70) return HYDRATION_BONUS.mild.bonus;
    return 0;
  };

  /**
   * 👴 Рассчитать бонус от возраста
   * @param {number} age - возраст в годах
   * @returns {number} бонус к волне
   */
  const calculateAgeBonus = (age) => {
    if (!age || age <= 0) return 0;
    if (age >= AGE_BONUS.elderly.minAge) return AGE_BONUS.elderly.bonus;
    if (age >= AGE_BONUS.middle.minAge) return AGE_BONUS.middle.bonus;
    if (age >= AGE_BONUS.adult.minAge) return AGE_BONUS.adult.bonus;
    return 0;
  };

  /**
   * 🏋️ Рассчитать бонус от BMI
   * @param {number} weight - вес (кг)
   * @param {number} height - рост (см)
   * @returns {number} бонус к волне
   */
  const calculateBMIBonus = (weight, height) => {
    if (!weight || !height || weight <= 0 || height <= 0) return 0;
    const heightM = height / 100;
    const bmi = weight / (heightM * heightM);
    
    if (bmi >= BMI_BONUS.obese.minBMI) return BMI_BONUS.obese.bonus;
    if (bmi >= BMI_BONUS.overweight.minBMI) return BMI_BONUS.overweight.bonus;
    return 0;
  };

  /**
   * 🚺🚹 Получить бонус от пола
   * @param {string} gender - пол ('Мужской', 'Женский', 'Другое')
   * @returns {number} бонус к волне
   */
  const getGenderBonus = (gender) => {
    if (!gender) return 0;
    const g = gender.toLowerCase();
    if (g === 'мужской' || g === 'male') return GENDER_BONUS.male;
    if (g === 'женский' || g === 'female') return GENDER_BONUS.female;
    return GENDER_BONUS.other;
  };

  /**
   * 🍟 Рассчитать бонус от транс-жиров
   * @param {number} transFat - транс-жиры в граммах
   * @returns {number} бонус к волне
   */
  const calculateTransFatBonus = (transFat) => {
    if (transFat === null || transFat === undefined || transFat < 0) return 0;
    if (transFat >= TRANS_FAT_BONUS.high.threshold) return TRANS_FAT_BONUS.high.bonus;
    if (transFat >= TRANS_FAT_BONUS.medium.threshold) return TRANS_FAT_BONUS.medium.bonus;
    if (transFat >= TRANS_FAT_BONUS.low.threshold) return TRANS_FAT_BONUS.low.bonus;
    return 0;
  };

  /**
   * 🍽️ Рассчитать бонус от голодания
   * @param {number} fastingHours - часов без еды до текущего приёма
   * @returns {number} бонус к волне
   */
  const calculateFastingBonus = (fastingHours) => {
    if (!fastingHours || fastingHours <= 0) return 0;
    if (fastingHours >= FASTING_BONUS.long.threshold) return FASTING_BONUS.long.bonus;
    if (fastingHours >= FASTING_BONUS.medium.threshold) return FASTING_BONUS.medium.bonus;
    if (fastingHours >= FASTING_BONUS.short.threshold) return FASTING_BONUS.short.bonus;
    return 0;
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 🌟 NEXT-DAY TRAINING EFFECT (NDTE) — Функции расчёта
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * 📊 Получить данные тренировок за предыдущий день
   * @param {string} todayDate - текущая дата YYYY-MM-DD
   * @param {Function} lsGet - функция чтения из localStorage
   * @returns {Object} { trainings: [], totalKcal, hoursSince, date }
   */
  const getPreviousDayTrainings = (todayDate, lsGet) => {
    if (!todayDate || !lsGet) return { trainings: [], totalKcal: 0, hoursSince: Infinity, date: null };
    
    const yesterday = new Date(todayDate);
    yesterday.setDate(yesterday.getDate() - 1);
    const yDateStr = yesterday.toISOString().split('T')[0];
    
    const dayData = lsGet(`heys_dayv2_${yDateStr}`, {});
    // 🆕 v3.7.3: Фильтруем пустые тренировки
    const trainings = (dayData.trainings || []).filter(isValidTraining);
    
    if (trainings.length === 0) {
      return { trainings: [], totalKcal: 0, hoursSince: Infinity, date: yDateStr };
    }
    
    // Рассчитываем общие ккал тренировок
    const weight = HEYS.user?.getProfile?.()?.weight || 70;
    const hrZones = lsGet('heys_hr_zones', []);
    const mets = [2.5, 6, 8, 10].map((def, i) => +hrZones[i]?.MET || def);
    
    const kcalPerMin = (met, w) => (met * 3.5 * w / 200);
    
    let totalKcal = 0;
    let lastTrainingEndHour = 0;
    
    trainings.forEach(t => {
      const zones = t.z || [0, 0, 0, 0];
      const kcal = zones.reduce((sum, min, i) => sum + (min || 0) * kcalPerMin(mets[i], weight), 0);
      totalKcal += kcal;
      
      // Найти время окончания последней тренировки
      if (t.time) {
        const [h, m] = t.time.split(':').map(Number);
        const duration = zones.reduce((a, b) => a + (b || 0), 0);
        const endHour = h + (m + duration) / 60;
        lastTrainingEndHour = Math.max(lastTrainingEndHour, endHour);
      }
    });
    
    // Рассчитываем сколько часов прошло с последней тренировки
    const now = new Date();
    const currentHour = now.getHours() + now.getMinutes() / 60;
    // Вчерашняя тренировка: текущий час + (24 - час окончания тренировки)
    const hoursSince = currentHour + (24 - lastTrainingEndHour);
    
    return {
      trainings,
      totalKcal: Math.round(totalKcal),
      hoursSince: Math.round(hoursSince * 10) / 10,
      date: yDateStr,
      dominantType: getDominantTrainingType(trainings)
    };
  };

  /**
   * 🏋️ Определить доминирующий тип тренировки
   */
  const getDominantTrainingType = (trainings) => {
    if (!trainings || trainings.length === 0) return null;
    
    const types = { strength: 0, cardio: 0, hobby: 0 };
    trainings.forEach(t => {
      const type = t.type || 'cardio';
      const duration = (t.z || []).reduce((a, b) => a + (b || 0), 0);
      types[type] = (types[type] || 0) + duration;
    });
    
    // Возвращаем тип с максимальной продолжительностью
    return Object.entries(types).reduce((a, b) => b[1] > a[1] ? b : a, ['cardio', 0])[0];
  };

  /**
   * 📈 Рассчитать BMI множитель для NDTE
   * @param {number} bmi - индекс массы тела
   * @returns {number} множитель (0.8-1.8)
   */
  const calculateNDTEBMIMultiplier = (bmi) => {
    if (!bmi || bmi <= 0) return 1.0;
    
    for (const [, tier] of Object.entries(NDTE.bmiMultiplier)) {
      if (bmi >= tier.minBMI) return tier.multiplier;
    }
    return 1.0;
  };

  /**
   * ⏰ Рассчитать временное затухание NDTE
   * @param {number} hoursSince - часов с момента тренировки
   * @returns {number} множитель затухания (0-1)
   */
  const calculateNDTEDecay = (hoursSince) => {
    if (!hoursSince || hoursSince <= 0) return 1.0;
    if (hoursSince >= NDTE.maxWindowHours) return 0;
    
    // Используем ступенчатое затухание
    for (const tier of NDTE.decay.tiers) {
      if (hoursSince <= tier.maxHours) return tier.multiplier;
    }
    return 0;
  };

  /**
   * 🔥 Рассчитать полный эффект NDTE (Next-Day Training Effect)
   * 
   * @param {Object} params
   * @param {number} params.trainingKcal - ккал вчерашней тренировки
   * @param {number} params.hoursSince - часов с момента тренировки
   * @param {number} params.bmi - BMI пользователя
   * @param {string} [params.trainingType] - тип тренировки (strength/cardio/hobby)
   * @param {number} [params.trainingsCount=1] - количество тренировок
   * @returns {Object} эффект NDTE
   */
  const calculateNDTE = (params) => {
    const { trainingKcal = 0, hoursSince = Infinity, bmi = 22, trainingType = 'cardio', trainingsCount = 1 } = params;
    
    // Нет эффекта если тренировка была слишком давно или слишком лёгкая
    if (hoursSince >= NDTE.maxWindowHours || trainingKcal < 200) {
      return {
        active: false,
        tdeeBoost: 0,
        waveReduction: 0,
        peakReduction: 0,
        label: null,
        badge: null
      };
    }
    
    // Найти подходящий tier по ккал
    let baseTier = null;
    for (const tier of NDTE.kcalTiers) {
      if (trainingKcal >= tier.minKcal) {
        baseTier = tier;
        break;
      }
    }
    
    // Если ккал меньше минимального порога — линейная интерполяция
    if (!baseTier) {
      const ratio = trainingKcal / 300; // Нормализуем к минимальному порогу
      const minTier = NDTE.kcalTiers[NDTE.kcalTiers.length - 1];
      baseTier = {
        tdeeBoost: minTier.tdeeBoost * ratio,
        waveReduction: minTier.waveReduction * ratio,
        peakReduction: minTier.peakReduction * ratio,
        label: '⚡ Лёгкая активность'
      };
    }
    
    // Применяем модификаторы
    const bmiMult = calculateNDTEBMIMultiplier(bmi);
    const decayMult = calculateNDTEDecay(hoursSince);
    const typeMult = NDTE.typeMultiplier[trainingType] || { tdee: 1.0, wave: 1.0 };
    
    // Кумулятивный эффект от нескольких тренировок
    let cumulativeMult = 1.0;
    if (NDTE.cumulative.enabled && trainingsCount > 1) {
      // Diminishing returns: каждая следующая даёт меньше
      cumulativeMult = Math.min(NDTE.cumulative.maxMultiplier, 1 + (trainingsCount - 1) * 0.2);
    }
    
    // Финальные значения
    const tdeeBoost = baseTier.tdeeBoost * bmiMult * decayMult * typeMult.tdee * cumulativeMult;
    const waveReduction = baseTier.waveReduction * bmiMult * decayMult * typeMult.wave * cumulativeMult;
    const peakReduction = baseTier.peakReduction * bmiMult * decayMult * cumulativeMult;
    
    // Ограничиваем максимальные значения
    const cappedTdeeBoost = Math.min(0.20, tdeeBoost);        // Максимум +20% к TDEE
    const cappedWaveReduction = Math.min(0.45, waveReduction); // Максимум -45% к волне
    const cappedPeakReduction = Math.min(0.50, peakReduction); // Максимум -50% к пику
    
    return {
      active: true,
      tdeeBoost: Math.round(cappedTdeeBoost * 1000) / 1000,
      waveReduction: Math.round(cappedWaveReduction * 1000) / 1000,
      peakReduction: Math.round(cappedPeakReduction * 1000) / 1000,
      label: baseTier.label,
      badge: NDTE.badge,
      badgeColor: NDTE.badgeColor,
      
      // Детали для UI
      trainingKcal,
      hoursSince: Math.round(hoursSince),
      bmiMultiplier: bmiMult,
      decayMultiplier: decayMult,
      typeMultiplier: typeMult,
      trainingsCount
    };
  };

  /**
   * 📊 Рассчитать BMI из веса и роста
   * @param {number} weight - вес в кг
   * @param {number} height - рост в см
   * @returns {number} BMI
   */
  const calculateBMI = (weight, height) => {
    if (!weight || !height || weight <= 0 || height <= 0) return 22; // Дефолт
    const heightM = height / 100;
    return Math.round((weight / (heightM * heightM)) * 10) / 10;
  };

  /**
   * 🏷️ Получить категорию BMI
   * @param {number} bmi
   * @returns {Object} { category, color, desc }
   */
  const getBMICategory = (bmi) => {
    if (bmi < 18.5) return { category: 'underweight', color: '#eab308', desc: 'Недовес' };
    if (bmi < 25) return { category: 'normal', color: '#22c55e', desc: 'Норма' };
    if (bmi < 30) return { category: 'overweight', color: '#f97316', desc: 'Избыток' };
    return { category: 'obese', color: '#ef4444', desc: 'Ожирение' };
  };

  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Рассчитать нутриенты приёма пищи
   * @param {Object} meal - приём пищи
   * @param {Object} pIndex - индекс продуктов
   * @param {Function} getProductFromItem - функция получения продукта
   * @returns {Object} { avgGI, totalProtein, totalFiber, totalGrams, totalCarbs, totalSimple, totalFat, glycemicLoad, hasLiquid, insulinogenicType, insulinogenicBonus, hasSpicy, hasAlcohol, alcoholBonus, alcoholType, hasCaffeine }
   */
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
      totalProtein += protein100 * grams / 100;
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
  const calculateMultiplier = (gi, protein, fiber, carbs = null, fat = null, gl = null, hasLiquid = false, insulinogenicBonus = 0, foodForm = null) => {
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
      // Детектируем тип белка из продуктов приёма
      // ⚠️ v4.0.0 FIX: items не передаётся в calculateMultiplier, используем fallback
      let dominantProteinType = 'mixed';
      // TODO: Для полноценной поддержки типизации белка нужно:
      // 1. Добавить items в параметры calculateMultiplier
      // 2. Передавать items из всех мест вызова
      // Пока используем fallback на 'mixed' тип
      
      const proteinV2 = calculateProteinBonusV2(protein, dominantProteinType);
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
    if (fiber >= FIBER_BONUS.high.threshold) fiberBonus = FIBER_BONUS.high.bonus;
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
    
    return {
      total: baseMult * carbsMult * liquidMult * foodFormMult,
      gi: giMult,
      protein: proteinBonus,
      proteinMeta, // 🆕 v4.0.0: Тип белка (animal/plant/whey/mixed)
      fiber: fiberBonus,
      fat: fatBonus,
      carbs: carbsMult,
      liquid: liquidMult,
      foodForm: foodFormMult,  // 🆕 v3.2.0
      insulinogenic: insBonus,
      glCategory,
      glScaleFactor, // 🆕 Для отладки
      category: giCat
    };
  };
  
  /**
   * Рассчитать workout бонус (ускорение волны от тренировки)
   * @param {Array} trainings - массив тренировок дня (уже отфильтрованный)
   * @returns {Object} { bonus, totalMinutes, intensityMinutes, desc }
   */
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

  /**
   * 🌡️ v3.8.0: Определить температуру пищи по названиям продуктов
   * @param {Array} items - массив продуктов
   * @param {Function} getProductFromItem - функция получения продукта
   * @returns {Object} { temperature: 'hot'|'cold'|'room', bonus, peakBoost, desc }
   */
  const detectFoodTemperature = (items = [], getProductFromItem) => {
    if (!items || items.length === 0) {
      return { temperature: 'room', ...FOOD_TEMPERATURE_BONUS.room };
    }
    
    let hotCount = 0;
    let coldCount = 0;
    
    for (const item of items) {
      const prod = getProductFromItem ? getProductFromItem(item) : item;
      const name = (prod?.name || item?.name || '').toLowerCase();
      
      // Проверяем паттерны горячей еды
      if (FOOD_TEMPERATURE_BONUS.hot.patterns.some(p => p.test(name))) {
        hotCount++;
      }
      
      // Проверяем паттерны холодной еды
      if (FOOD_TEMPERATURE_BONUS.cold.patterns.some(p => p.test(name))) {
        coldCount++;
      }
    }
    
    // Если есть и горячее и холодное — считаем комнатной температурой
    if (hotCount > 0 && coldCount > 0) {
      return { temperature: 'room', ...FOOD_TEMPERATURE_BONUS.room };
    }
    
    // Преимущественно горячее
    if (hotCount > 0) {
      return { temperature: 'hot', ...FOOD_TEMPERATURE_BONUS.hot };
    }
    
    // Преимущественно холодное
    if (coldCount > 0) {
      return { temperature: 'cold', ...FOOD_TEMPERATURE_BONUS.cold };
    }
    
    // По умолчанию — комнатная температура
    return { temperature: 'room', ...FOOD_TEMPERATURE_BONUS.room };
  };

  /**
   * 🍽️ v3.8.0: Рассчитать бонус от большой порции
   * Научное: Collins 1991 — большие порции замедляют опорожнение желудка
   * @param {number} mealKcal - калории приёма
   * @returns {Object} { bonus, peakReduction, desc }
   */
  const calculateLargePortionBonus = (mealKcal = 0) => {
    if (!mealKcal || mealKcal <= 0) {
      return { bonus: 0, peakReduction: 1.0, desc: null };
    }
    
    // Находим подходящий порог (от большего к меньшему)
    for (const tier of LARGE_PORTION_BONUS.thresholds) {
      if (mealKcal >= tier.minKcal) {
        return {
          bonus: Math.min(tier.bonus, LARGE_PORTION_BONUS.maxBonus),
          peakReduction: tier.peakReduction,
          desc: tier.desc
        };
      }
    }
    
    // Маленькая порция — без модификации
    return { bonus: 0, peakReduction: 1.0, desc: null };
  };

  /**
   * ⚡ v3.8.0: Проверить риск реактивной гипогликемии и вернуть UI данные
   * @param {Object} params - { gi, protein, fat, isFasted }
   * @returns {Object} { hasRisk, score, riskWindow, ui, details }
   */
  const getHypoglycemiaWarning = (params = {}) => {
    const { gi = 0, protein = 0, fat = 0, isFasted = false } = params;
    
    const rf = REACTIVE_HYPOGLYCEMIA.riskFactors;
    let score = 0;
    const details = [];
    
    // Высокий GI
    if (gi > rf.highGI.threshold) {
      score += rf.highGI.weight;
      details.push({ factor: 'highGI', value: gi, threshold: rf.highGI.threshold });
    }
    
    // Низкий белок
    if (protein < rf.lowProtein.threshold) {
      score += rf.lowProtein.weight;
      details.push({ factor: 'lowProtein', value: protein, threshold: rf.lowProtein.threshold });
    }
    
    // Низкие жиры
    if (fat < rf.lowFat.threshold) {
      score += rf.lowFat.weight;
      details.push({ factor: 'lowFat', value: fat, threshold: rf.lowFat.threshold });
    }
    
    // Натощак
    if (isFasted) {
      score += rf.fasted.weight;
      details.push({ factor: 'fasted', value: true });
    }
    
    const hasRisk = score >= REACTIVE_HYPOGLYCEMIA.warningThreshold;
    
    return {
      hasRisk,
      score,
      riskWindow: REACTIVE_HYPOGLYCEMIA.riskWindow,
      details,
      ui: hasRisk ? {
        emoji: REACTIVE_HYPOGLYCEMIA.ui.warningEmoji,
        color: REACTIVE_HYPOGLYCEMIA.ui.warningColor,
        title: REACTIVE_HYPOGLYCEMIA.ui.warningTitle,
        desc: REACTIVE_HYPOGLYCEMIA.ui.warningDesc,
        advice: REACTIVE_HYPOGLYCEMIA.ui.advice,
        symptoms: REACTIVE_HYPOGLYCEMIA.ui.symptoms
      } : null
    };
  };

  /**
   * 🥛 v3.8.0: Применить Insulin Index к длине волны (не только к GL)
   * Молочка имеет КОРОЧЕ волну с ВЫШЕ пиком (Holt 1997)
   * @param {string} insulinogenicType - тип инсулиногенности
   * @returns {Object} { waveMultiplier, peakMultiplier, glBoost, desc }
   */
  const getInsulinIndexWaveModifier = (insulinogenicType) => {
    if (!insulinogenicType || !INSULIN_INDEX_FACTORS[insulinogenicType]) {
      return { waveMultiplier: 1.0, peakMultiplier: 1.0, glBoost: 1.0, desc: null };
    }
    
    const factor = INSULIN_INDEX_FACTORS[insulinogenicType];
    return {
      waveMultiplier: factor.waveMultiplier,
      peakMultiplier: factor.peakMultiplier,
      glBoost: factor.glBoost,
      desc: factor.desc
    };
  };

  /**
   * Рассчитать все дневные факторы для конкретного приёма
   * Включает: circadian, sleep, sleepQuality, hydration, age, bmi, gender, stress, cycle
   * НЕ включает: workout, postprandial, NEAT, steps — эти зависят от тренировок
   * @param {Object} dayData - данные дня
   * @param {number} mealHour - час приёма (0-23)
   * @returns {Object} { totalBonus, circadianMultiplier, details }
   */
  const calculateDayFactorsForMeal = (dayData = {}, mealHour = 12) => {
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
  
  /**
   * Главная функция расчёта данных инсулиновой волны
   * @param {Object} params
   * @param {Array} params.meals - массив приёмов пищи
   * @param {Object} params.pIndex - индекс продуктов
   * @param {Function} params.getProductFromItem - функция получения продукта
   * @param {number} params.baseWaveHours - базовая длина волны (по умолчанию 3)
   * @param {Array} params.trainings - массив тренировок
   * @param {Object} params.dayData - данные дня { sleepHours, stressAvg }
   * @param {Date} params.now - текущее время
   * @returns {Object|null}
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
    const irScore = calculateIRScore(profile, dayData);
    const irScoreMultiplier = irScore.waveMultiplier || 1.0;
    
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
    
    const multipliers = calculateMultiplier(
      nutrients.avgGI, 
      nutrients.totalProtein, 
      nutrients.totalFiber, 
      nutrients.totalCarbs,
      nutrients.totalFat,
      nutrients.glycemicLoad,
      nutrients.hasLiquid,
      nutrients.insulinogenicBonus,
      mealFoodForm  // 🆕 v3.2.0
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
      
      // 🆕 v3.0.1: Скалирование персональной базы по GL
      // Персональные факторы (возраст, BMI) влияют на инсулинорезистентность,
      // но при низкой GL инсулина мало — эффект минимален
      // GL=7 → базу приближаем к стандартным 3ч
      // Формула: 0.4 + (GL/20) * 0.6 → GL=7: 0.61, GL=15: 0.85, GL=20: 1.0
      const baseScaleFactor = Math.max(0.4, 0.4 + (gl / 20) * 0.6);
      // 🔧 FIX v3.8.4: Скалируем ВСЮ базу, а не только персональную надбавку!
      // При GL=11.3 база должна быть ~2.2ч, а не 3ч
      // Старая логика: скалировала только personalDiff (0.04ч) → почти без эффекта
      // Новая логика: скалируем всю базу напрямую
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
    // 🆕 v3.8.0: Insulin Index Wave Modifier — молочка укорачивает волну
    const insulinIndexWaveMult = insulinIndexModifier.waveMultiplier || 1.0;
    const activityMultiplier = Math.max(0.1, 1.0 + activityBonuses); // min 10% от волны
    
    // 🆕 v3.6.0: NDTE применяется как отдельный множитель (независимо от состава еды)
    // 🆕 v3.8.0: Insulin Index Wave Mult — молочка делает волну КОРОЧЕ (Holt 1997)
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
      
      const mealMult = calculateMultiplier(
        mealNutrients.avgGI, 
        mealNutrients.totalProtein, 
        mealNutrients.totalFiber, 
        mealNutrients.totalCarbs,
        mealNutrients.totalFat,
        mealNutrients.glycemicLoad,
        mealNutrients.hasLiquid,
        mealNutrients.insulinogenicBonus,
        historyFoodForm  // 🆕 v3.2.0
      );
      
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
      if (gl !== null && gl < 20) {
        const baseScaleFactor = Math.max(0.4, 0.4 + (gl / 20) * 0.6);
        const standardBase = PERSONAL_BASELINE.defaultWaveHours;
        const personalDiff = effectiveBaseWaveHours - standardBase;
        scaledBaseWaveHours = standardBase + personalDiff * baseScaleFactor;
      }
      
      // Применяем скалированные факторы
      const scaledDayBonus = dayFactors.totalBonus * dayFactorsScale;
      const scaledActivityBonus = activityFactors.totalBonus * dayFactorsScale;
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
      
      // Единая формула (идентична основному расчёту)
      const finalMultiplier = foodMultiplier * activityMultiplier * ndteMultiplier * scaledCircadian * spicyMultiplier;
      
      // 🔬 DEBUG v3.2.2: детальный расчёт для последнего приёма (отключено для production)
      // Раскомментировать для отладки:
      // if (idx === sorted.length - 1) {
      //   console.log('[waveHistory v3.2.2 DETAILS]', { mealMult: mealMult.total, allBonuses, scaledCircadian, finalMultiplier });
      // }
      
      // 🆕 v3.0.1: Используем scaledBaseWaveHours (персональная база, скалированная по GL)
      const duration = Math.round(scaledBaseWaveHours * finalMultiplier * 60);
      const endMin = startMin + duration;
      
      // 🆕 v3.4.0: Activity Context для каждого приёма в истории
      const mealActivityContext = calculateActivityContext({
        mealTimeMin: startMin,
        trainings,
        steps: dayData.steps || 0,
        householdMin: dayData.householdMin || 0, // 🆕 v3.5.5: бытовая активность
        weight: dayData.profile?.weight || 70,
        allMeals: sorted,
        mealNutrients: {
          prot: mealNutrients.totalProtein,
          carbs: mealNutrients.totalCarbs,
          simple: mealNutrients.totalSimple || 0
        },
        mealKcal: mealNutrients.totalKcal || 0
      });
      
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
    } catch (e) {}
    
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
        } catch (e) {}
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
  
  // === UI КОМПОНЕНТЫ ===
  
  /**
   * Форматирование времени липолиза
   */
  const formatLipolysisTime = (minutes) => {
    if (minutes < 60) return `${minutes} мин`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (m === 0) return `${h}ч`;
    return `${h}ч ${m}м`;
  };
  
  // === 🏋️ HELPER: ПЛАШКА ACTIVITY CONTEXT (используется в нескольких местах) ===
  const renderActivityContextBadge = (activityContext, options = {}) => {
    if (!activityContext || activityContext.type === 'none') return null;
    
    const { compact = false } = options;
    
    // Цвета по типу контекста (все позитивные — зелёные оттенки)
    const colors = {
      peri: { bg: '#22c55e22', border: '#22c55e44', text: '#16a34a', icon: '🔥' },
      post: { bg: '#22c55e22', border: '#22c55e44', text: '#16a34a', icon: '💪' },
      pre: { bg: '#22c55e22', border: '#22c55e44', text: '#16a34a', icon: '⚡' },
      steps: { bg: '#22c55e22', border: '#22c55e44', text: '#16a34a', icon: '🚶' },
      morning: { bg: '#22c55e22', border: '#22c55e44', text: '#16a34a', icon: '🌅' },
      double: { bg: '#22c55e22', border: '#22c55e44', text: '#16a34a', icon: '🏆' },
      fasted: { bg: '#22c55e22', border: '#22c55e44', text: '#16a34a', icon: '⚡' },
      default: { bg: '#22c55e22', border: '#22c55e44', text: '#16a34a', icon: '🏋️' }
    };
    const c = colors[activityContext.type] || colors.default;
    
    // Человекопонятные заголовки по типу
    const titles = {
      peri: 'Еда ВО ВРЕМЯ тренировки',
      post: 'Тренировка ускорила метаболизм',
      pre: 'Топливо для тренировки',
      steps: 'Активный день (10k+ шагов)',
      morning: 'Утренний буст метаболизма',
      double: 'Двойная нагрузка',
      fasted: 'Тренировка натощак'
    };
    const title = titles[activityContext.type] || 'Эффект тренировки';
    
    // Форматируем бонус волны
    const waveBonusPct = activityContext.waveBonus 
      ? Math.abs(activityContext.waveBonus * 100).toFixed(0) + '% быстрее'
      : null;
    
    // Детали из контекста (если есть)
    const details = activityContext.details || {};
    let subtitle = '';
    
    if (activityContext.type === 'post' && details.trainingKcal) {
      // Например: "После 1331 ккал • волна −68%"
      subtitle = `После ${details.trainingKcal} ккал`;
      if (details.gapMin) {
        subtitle += ` • ${details.gapMin} мин назад`;
      }
    } else if (activityContext.type === 'peri') {
      subtitle = 'Глюкоза → сразу в мышцы';
    } else if (activityContext.type === 'pre' && details.gapMin) {
      subtitle = `${details.gapMin} мин до тренировки`;
    }
    
    return React.createElement('div', {
      className: 'activity-context-badge',
      style: {
        display: 'flex',
        alignItems: 'flex-start',
        gap: compact ? '8px' : '10px',
        padding: compact ? '8px 12px' : '10px 14px',
        marginBottom: '10px',
        borderRadius: '12px',
        background: c.bg,
        border: `1px solid ${c.border}`
      }
    },
      // Иконка
      React.createElement('span', { 
        style: { 
          fontSize: compact ? '20px' : '24px',
          lineHeight: 1,
          marginTop: '2px'
        } 
      }, c.icon),
      
      // Текст
      React.createElement('div', { style: { flex: 1, minWidth: 0 } },
        // Заголовок
        React.createElement('div', { 
          style: { 
            fontSize: compact ? '13px' : '14px', 
            fontWeight: '600',
            color: c.text
          } 
        }, title),
        // Подзаголовок
        subtitle && React.createElement('div', { 
          style: { 
            fontSize: '12px', 
            color: '#64748b', 
            marginTop: '2px'
          } 
        }, subtitle)
      ),
      
      // Бейджи справа (вертикально)
      React.createElement('div', {
        style: {
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: '4px',
          flexShrink: 0
        }
      },
        // Бонус волны
        waveBonusPct && React.createElement('div', {
          style: {
            fontSize: '12px',
            fontWeight: '700',
            color: '#22c55e',
            background: '#22c55e22',
            padding: '4px 8px',
            borderRadius: '6px'
          }
        }, waveBonusPct),
        // Снижение вреда
        activityContext.harmMultiplier && activityContext.harmMultiplier < 1 && React.createElement('div', {
          style: {
            fontSize: '11px',
            fontWeight: '600',
            color: '#3b82f6',
            background: '#3b82f622',
            padding: '4px 8px',
            borderRadius: '6px'
          }
        }, '🛡️ −' + Math.round((1 - activityContext.harmMultiplier) * 100) + '% вред')
      )
    );
  };
  
  // === 🔥 NDTE BADGE — интерактивный badge с countdown (v3.7.0) ===
  /**
   * Рендерит интерактивный NDTE badge с пульсирующей анимацией и expand-секцией
   * @param {Object} ndteData - данные из calculateNDTE()
   * @param {number} ndteBoostKcal - бонус в ккал
   * @param {boolean} expanded - развёрнут ли badge
   * @param {Function} onToggle - callback при клике
   */
  const renderNDTEBadge = (ndteData, ndteBoostKcal, expanded, onToggle) => {
    if (!ndteData || !ndteData.active) return null;
    
    const boostPct = Math.round(ndteData.tdeeBoost * 100);
    const waveReductionPct = Math.round(ndteData.waveReduction * 100);
    const peakReductionPct = Math.round((ndteData.peakReduction || 0) * 100);
    
    // Расчёт оставшегося времени до окончания эффекта
    const hoursRemaining = Math.max(0, 48 - ndteData.hoursSince);
    const decayPct = ndteData.decayMultiplier ? Math.round(ndteData.decayMultiplier * 100) : 100;
    
    // Форматирование времени
    const formatTimeRemaining = (hours) => {
      if (hours <= 0) return 'завершён';
      const h = Math.floor(hours);
      const m = Math.round((hours - h) * 60);
      if (h === 0) return `${m} мин`;
      if (m === 0) return `${h}ч`;
      return `${h}ч ${m}м`;
    };
    
    // Определение типа тренировки для иконки
    const typeIcons = {
      cardio: '🏃',
      strength: '🏋️',
      hobby: '⚽'
    };
    const typeIcon = typeIcons[ndteData.trainingType] || '🔥';
    
    return React.createElement('div', {
      style: { display: 'inline-block', marginLeft: '6px' }
    },
      // Кликабельный badge
      React.createElement('span', {
        className: 'ndte-badge ndte-badge--active',
        onClick: (e) => {
          e.stopPropagation();
          if (onToggle) onToggle();
        },
        style: {
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px'
        }
      },
        React.createElement('span', null, '🔥'),
        React.createElement('span', null, `+${boostPct}%`),
        React.createElement('span', {
          style: {
            marginLeft: '2px',
            fontSize: '10px',
            opacity: 0.7,
            transition: 'transform 0.2s',
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)'
          }
        }, '▼')
      ),
      
      // Expand секция
      expanded && React.createElement('div', { className: 'ndte-expand' },
        // Header
        React.createElement('div', { className: 'ndte-expand__header' },
          React.createElement('span', { className: 'ndte-expand__icon' }, '🔥'),
          React.createElement('div', null,
            React.createElement('div', { className: 'ndte-expand__title' }, 'Next-Day Training Effect'),
            React.createElement('div', { className: 'ndte-expand__subtitle' }, 
              `${typeIcon} ${ndteData.trainingKcal} ккал • ${ndteData.hoursSince} ч назад`
            )
          )
        ),
        
        // Stats grid
        React.createElement('div', { className: 'ndte-expand__stats' },
          // TDEE boost
          React.createElement('div', { className: 'ndte-expand__stat' },
            React.createElement('span', { className: 'ndte-expand__stat-icon' }, '⚡'),
            React.createElement('div', { className: 'ndte-expand__stat-content' },
              React.createElement('span', { className: 'ndte-expand__stat-value' }, `+${ndteBoostKcal} ккал`),
              React.createElement('span', { className: 'ndte-expand__stat-label' }, 'к TDEE')
            )
          ),
          // Wave reduction
          React.createElement('div', { className: 'ndte-expand__stat' },
            React.createElement('span', { className: 'ndte-expand__stat-icon' }, '📉'),
            React.createElement('div', { className: 'ndte-expand__stat-content' },
              React.createElement('span', { className: 'ndte-expand__stat-value' }, `-${waveReductionPct}%`),
              React.createElement('span', { className: 'ndte-expand__stat-label' }, 'волна короче')
            )
          ),
          // Peak reduction (если есть)
          peakReductionPct > 0 && React.createElement('div', { className: 'ndte-expand__stat' },
            React.createElement('span', { className: 'ndte-expand__stat-icon' }, '🎯'),
            React.createElement('div', { className: 'ndte-expand__stat-content' },
              React.createElement('span', { className: 'ndte-expand__stat-value' }, `-${peakReductionPct}%`),
              React.createElement('span', { className: 'ndte-expand__stat-label' }, 'пик инсулина')
            )
          ),
          // BMI multiplier (если есть)
          ndteData.bmiMultiplier && ndteData.bmiMultiplier !== 1 && React.createElement('div', { className: 'ndte-expand__stat' },
            React.createElement('span', { className: 'ndte-expand__stat-icon' }, '📊'),
            React.createElement('div', { className: 'ndte-expand__stat-content' },
              React.createElement('span', { className: 'ndte-expand__stat-value' }, `×${ndteData.bmiMultiplier.toFixed(1)}`),
              React.createElement('span', { className: 'ndte-expand__stat-label' }, 'BMI boost')
            )
          )
        ),
        
        // Decay progress bar
        React.createElement('div', { className: 'ndte-expand__decay' },
          React.createElement('div', { className: 'ndte-expand__decay-header' },
            React.createElement('span', { className: 'ndte-expand__decay-label' }, 'Эффект активен'),
            React.createElement('span', { className: 'ndte-expand__decay-time' }, 
              `⏱️ осталось ${formatTimeRemaining(hoursRemaining)}`
            )
          ),
          React.createElement('div', { className: 'ndte-expand__decay-bar' },
            React.createElement('div', { 
              className: 'ndte-expand__decay-fill',
              style: { width: `${decayPct}%` }
            })
          )
        )
      )
    );
  };
  
  // === SVG ГРАФИК ВОЛНЫ (выносим наружу для использования в основной карточке) ===
  const renderWaveChart = (data) => {
    if (!data || data.remaining <= 0) return null; // Не показываем если волна завершена
    // 🆕 v3.0.0: Защита от undefined insulinWaveHours
    if (!data.insulinWaveHours || data.insulinWaveHours <= 0) return null;
    
    const width = 280;
    const height = 80;
    const padding = { left: 25, right: 10, top: 10, bottom: 20 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;
    
    // Данные волны
    const totalMinutes = data.insulinWaveHours * 60;
    const elapsedMinutes = totalMinutes - data.remaining;
    const progress = Math.min(1, elapsedMinutes / totalMinutes); // 0-1
    
    // 🆕 v4.1.0: Используем научную 3-компонентную Gaussian кривую если доступна
    const generateWavePath = () => {
      const points = [];
      
      // Если есть curve из calculateInsulinWaveData — используем её (3-peak Gaussian)
      if (data.curve && Array.isArray(data.curve) && data.curve.length > 0) {
        // data.curve: массив {t, y, components: {fast, slow, hepatic}} 
        // t уже нормализован 0-1 в generateWaveCurve()
        const curveData = data.curve;
        const maxY = Math.max(...curveData.map(p => p.y || p.value || 0), 0.01);
        
        curveData.forEach(point => {
          const tNorm = point.t || 0; // t уже 0-1, НЕ делим на totalMinutes!
          const yNorm = (point.y || point.value || 0) / maxY; // нормализуем по высоте
          const x = padding.left + tNorm * chartW;
          const yPx = padding.top + chartH * (1 - yNorm);
          
          // 🆕 v4.1.0: Сохраняем компоненты для 3-peak визуализации
          const components = point.components || {};
          const fastNorm = (components.fast || 0) / maxY;
          const slowNorm = (components.slow || 0) / maxY;
          const hepaticNorm = (components.hepatic || 0) / maxY;
          
          points.push({ 
            x, y: yPx, t: tNorm, value: yNorm,
            // Компоненты в пикселях Y
            fastY: padding.top + chartH * (1 - fastNorm),
            slowY: padding.top + chartH * (1 - slowNorm),
            hepaticY: padding.top + chartH * (1 - hepaticNorm)
          });
        });
        
        return points;
      }
      
      // Fallback: старая однопиковая модель (для backwards compatibility)
      const gi = data.avgGI || 50;
      const peakPosition = gi >= 70 ? 0.15 : gi <= 40 ? 0.35 : 0.25;
      const peakHeight = gi >= 70 ? 0.95 : gi <= 40 ? 0.7 : 0.85;
      const steps = 50;
      
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        let y;
        if (t <= peakPosition) {
          const tNorm = t / peakPosition;
          y = peakHeight * Math.pow(tNorm, 1.5);
        } else {
          const tNorm = (t - peakPosition) / (1 - peakPosition);
          y = peakHeight * Math.exp(-2.5 * tNorm);
        }
        const x = padding.left + t * chartW;
        const yPx = padding.top + chartH * (1 - y);
        points.push({ x, y: yPx, t, value: y });
      }
      return points;
    };
    
    const wavePoints = generateWavePath();
    // 🆕 v3.0.0: Защита от пустого массива точек
    if (!wavePoints || wavePoints.length === 0) return null;
    
    const pathD = wavePoints.map((p, i) => 
      `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`
    ).join(' ');
    const fillPathD = `${pathD} L ${padding.left + chartW} ${padding.top + chartH} L ${padding.left} ${padding.top + chartH} Z`;
    
    // 🆕 v4.1.0: Генерация путей для 3-компонентной визуализации
    const hasComponents = wavePoints[0]?.fastY !== undefined;
    let fastPathD = '', slowPathD = '', hepaticPathD = '';
    
    if (hasComponents) {
      fastPathD = wavePoints.map((p, i) => 
        `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.fastY.toFixed(1)}`
      ).join(' ');
      
      slowPathD = wavePoints.map((p, i) => 
        `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.slowY.toFixed(1)}`
      ).join(' ');
      
      hepaticPathD = wavePoints.map((p, i) => 
        `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.hepaticY.toFixed(1)}`
      ).join(' ');
    }
    
    const currentIdx = Math.round(progress * (wavePoints.length - 1));
    const currentPoint = wavePoints[Math.min(currentIdx, wavePoints.length - 1)];
    // 🆕 v3.0.0: Защита от undefined currentPoint
    if (!currentPoint) return null;
    
    // 🆕 v4.1.2: Позиции пиков для 3-компонентной модели (сноски на графике)
    let fastPeak = null, slowPeak = null, hepaticPeak = null;
    if (hasComponents && wavePoints.length > 5) {
      let fastMinY = Infinity, slowMinY = Infinity, hepaticMinY = Infinity;
      wavePoints.forEach((p) => {
        // Fast peak: t ≈ 0.15-0.25 (быстрые углеводы)
        if (p.t >= 0.10 && p.t <= 0.35 && p.fastY < fastMinY) { 
          fastMinY = p.fastY; fastPeak = { x: p.x, y: p.y, t: p.t }; 
        }
        // Slow/Main peak: t ≈ 0.40-0.50 (основной инсулиновый ответ)
        if (p.t >= 0.30 && p.t <= 0.60 && p.slowY < slowMinY) { 
          slowMinY = p.slowY; slowPeak = { x: p.x, y: p.y, t: p.t }; 
        }
        // Hepatic peak: t ≈ 0.65-0.75 (печёночный хвост)
        if (p.t >= 0.55 && p.t <= 0.85 && p.hepaticY < hepaticMinY) { 
          hepaticMinY = p.hepaticY; hepaticPeak = { x: p.x, y: p.y, t: p.t }; 
        }
      });
    }
    
    // Время начала и конца волны
    const startTime = data.lastMealTimeDisplay || data.lastMealTime || '';
    const endTime = data.endTimeDisplay || data.endTime || '';
    
    return React.createElement('div', {
      style: {
        background: 'rgba(255,255,255,0.15)',
        borderRadius: '12px',
        padding: '8px',
        marginTop: '12px'
      }
    },
      React.createElement('svg', {
        width: '100%',
        height: height,
        viewBox: `0 0 ${width} ${height}`,
        style: { display: 'block' }
      },
        // Градиенты
        React.createElement('defs', null,
          React.createElement('linearGradient', { id: 'waveGradientMain', x1: '0%', y1: '0%', x2: '0%', y2: '100%' },
            React.createElement('stop', { offset: '0%', stopColor: '#fff', stopOpacity: 0.4 }),
            React.createElement('stop', { offset: '100%', stopColor: '#fff', stopOpacity: 0.1 })
          ),
          // 🆕 v4.1.0: Градиенты для 3-компонентной визуализации
          React.createElement('linearGradient', { id: 'waveGradientFast', x1: '0%', y1: '0%', x2: '0%', y2: '100%' },
            React.createElement('stop', { offset: '0%', stopColor: '#f97316', stopOpacity: 0.5 }),
            React.createElement('stop', { offset: '100%', stopColor: '#f97316', stopOpacity: 0.1 })
          ),
          React.createElement('linearGradient', { id: 'waveGradientSlow', x1: '0%', y1: '0%', x2: '0%', y2: '100%' },
            React.createElement('stop', { offset: '0%', stopColor: '#22c55e', stopOpacity: 0.5 }),
            React.createElement('stop', { offset: '100%', stopColor: '#22c55e', stopOpacity: 0.1 })
          ),
          React.createElement('linearGradient', { id: 'waveGradientHepatic', x1: '0%', y1: '0%', x2: '0%', y2: '100%' },
            React.createElement('stop', { offset: '0%', stopColor: '#8b5cf6', stopOpacity: 0.5 }),
            React.createElement('stop', { offset: '100%', stopColor: '#8b5cf6', stopOpacity: 0.1 })
          )
        ),
        // Базовая линия
        React.createElement('line', {
          x1: padding.left, y1: padding.top + chartH,
          x2: padding.left + chartW, y2: padding.top + chartH,
          stroke: 'rgba(255,255,255,0.3)', strokeWidth: 1
        }),
        
        // === Пунктирная линия НАЧАЛА (время приёма пищи) ===
        React.createElement('line', {
          x1: padding.left, y1: padding.top - 5,
          x2: padding.left, y2: padding.top + chartH + 5,
          stroke: 'rgba(255,255,255,0.5)', strokeWidth: 1, strokeDasharray: '3,2'
        }),
        // Время начала
        React.createElement('text', {
          x: padding.left, y: height - 2,
          fontSize: 9, fill: 'rgba(255,255,255,0.9)', textAnchor: 'middle', fontWeight: 500
        }, '🍽️ ' + startTime),
        
        // === Пунктирная линия КОНЦА (время окончания волны) ===
        React.createElement('line', {
          x1: padding.left + chartW, y1: padding.top - 5,
          x2: padding.left + chartW, y2: padding.top + chartH + 5,
          stroke: 'rgba(255,255,255,0.5)', strokeWidth: 1, strokeDasharray: '3,2'
        }),
        // Время конца
        React.createElement('text', {
          x: padding.left + chartW, y: height - 2,
          fontSize: 9, fill: 'rgba(255,255,255,0.9)', textAnchor: 'middle', fontWeight: 500
        }, '🔥 ' + endTime),
        
        // Заливка под кривой (суммарная)
        React.createElement('path', { d: fillPathD, fill: 'url(#waveGradientMain)' }),
        
        // === ОДНА суммарная линия волны с 3 пиками ===
        // (компоненты объединены в суммарную кривую — 3 пика видны как "холмики")
        React.createElement('path', {
          d: pathD, fill: 'none', stroke: 'rgba(255,255,255,0.95)',
          strokeWidth: 2.5, strokeLinecap: 'round', strokeLinejoin: 'round'
        }),
        
        // 🆕 v4.1.3: Маркеры пиков компонентов (увеличенные эмодзи)
        fastPeak && React.createElement('g', { key: 'fastPeak' },
          React.createElement('circle', {
            cx: fastPeak.x, cy: fastPeak.y, r: 6,
            fill: '#f97316', stroke: '#fff', strokeWidth: 1.5
          }),
          React.createElement('text', {
            x: fastPeak.x, y: fastPeak.y - 10,
            fontSize: 11, fill: '#f97316', textAnchor: 'middle', fontWeight: 700
          }, '⚡')
        ),
        slowPeak && React.createElement('g', { key: 'slowPeak' },
          React.createElement('circle', {
            cx: slowPeak.x, cy: slowPeak.y, r: 6,
            fill: '#22c55e', stroke: '#fff', strokeWidth: 1.5
          }),
          React.createElement('text', {
            x: slowPeak.x, y: slowPeak.y - 10,
            fontSize: 11, fill: '#22c55e', textAnchor: 'middle', fontWeight: 700
          }, '🌿')
        ),
        hepaticPeak && React.createElement('g', { key: 'hepaticPeak' },
          React.createElement('circle', {
            cx: hepaticPeak.x, cy: hepaticPeak.y, r: 6,
            fill: '#8b5cf6', stroke: '#fff', strokeWidth: 1.5
          }),
          React.createElement('text', {
            x: hepaticPeak.x, y: hepaticPeak.y - 10,
            fontSize: 11, fill: '#8b5cf6', textAnchor: 'middle', fontWeight: 700
          }, '🫀')
        ),
        
        // Вертикальная линия текущей позиции
        React.createElement('line', {
          x1: currentPoint.x, y1: padding.top,
          x2: currentPoint.x, y2: padding.top + chartH,
          stroke: '#fff', strokeWidth: 1.5, strokeDasharray: '3,3'
        }),
        // Точка текущей позиции
        React.createElement('circle', {
          cx: currentPoint.x, cy: currentPoint.y, r: 5,
          fill: '#fff', stroke: 'rgba(0,0,0,0.2)', strokeWidth: 1.5
        }),
        // Пульсирующий круг
        React.createElement('circle', {
          cx: currentPoint.x, cy: currentPoint.y, r: 9,
          fill: 'none', stroke: '#fff', strokeWidth: 1, opacity: 0.5,
          style: { animation: 'pulse 2s ease-in-out infinite' }
        }),
        // Подпись "сейчас"
        React.createElement('text', {
          x: currentPoint.x, y: padding.top - 2,
          fontSize: 9, fill: '#fff', textAnchor: 'middle', fontWeight: 600
        }, 'сейчас')
      )
    );
  };

  // === Meal Wave Expand (для карточки приёма) ===
  function cardChipStyle(color) {
    return {
      background: color + '1A',
      color: '#0f172a',
      padding: '6px 8px',
      borderRadius: '8px',
      fontWeight: 600
    };
  }

  const MealWaveExpandSection = ({ waveData, prevWave, nextWave }) => {
    if (!waveData) return null;
    const normalize = utils.normalizeToHeysDay;
    
    // 🆕 v3.7.1: State для popup детализации волны
    const [showWaveDetails, setShowWaveDetails] = React.useState(false);
    
    // 🆕 v3.4.0: Activity Context badge
    const activityContext = waveData.activityContext;
    
    // === Данные для волн ===
    const waves = [];
    
    // Текущий приём
    const currentStart = normalize(waveData.startMin);
    let currentEnd = normalize(waveData.endMin);
    if (currentEnd <= currentStart) currentEnd += 24 * 60;
    const currentGI = waveData.gi || 50;
    const currentDuration = waveData.duration || 180;
    
    waves.push({
      id: 'current',
      label: waveData.mealName || 'Текущий приём',
      color: '#3b82f6',
      start: currentStart,
      end: currentEnd,
      gi: currentGI,
      duration: currentDuration,
      timeLabel: waveData.timeDisplay || waveData.time,
      endLabel: waveData.endTimeDisplay
    });
    
    // Предыдущий
    if (prevWave) {
      const s = normalize(prevWave.startMin);
      let e = normalize(prevWave.endMin);
      if (e <= s) e += 24 * 60;
      waves.push({
        id: 'prev',
        label: prevWave.mealName || 'Предыдущий',
        color: '#3b82f6',
        start: s,
        end: e,
        gi: prevWave.gi || 50,
        duration: prevWave.duration || 180,
        timeLabel: prevWave.timeDisplay || prevWave.time,
        endLabel: prevWave.endTimeDisplay
      });
    }
    
    // Следующий
    if (nextWave) {
      const s = normalize(nextWave.startMin);
      let e = normalize(nextWave.endMin);
      if (e <= s) e += 24 * 60;
      waves.push({
        id: 'next',
        label: nextWave.mealName || 'Следующий',
        color: '#f97316',
        start: s,
        end: e,
        gi: nextWave.gi || 50,
        duration: nextWave.duration || 180,
        timeLabel: nextWave.timeDisplay || nextWave.time,
        endLabel: nextWave.endTimeDisplay
      });
    }
    
    // Сортируем по времени начала
    waves.sort((a, b) => a.start - b.start);
    
    // === Overlaps ===
    const nextOverlap = nextWave && waveData.endMin > nextWave.startMin
      ? waveData.endMin - nextWave.startMin : 0;
    const prevOverlap = prevWave && prevWave.endMin > waveData.startMin
      ? prevWave.endMin - waveData.startMin : 0;
    const hasOverlap = (nextOverlap > 0) || (prevOverlap > 0);
    const lipolysisGap = nextWave ? Math.max(0, nextWave.startMin - waveData.endMin) : 0;
    
    // === SVG размеры ===
    const width = 320;
    const height = 120;
    const padding = { left: 20, right: 20, top: 18, bottom: 28 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;
    
    // Масштаб по времени
    const startMin = Math.min(...waves.map(w => w.start));
    const endMax = Math.max(...waves.map(w => w.end));
    const range = Math.max(1, endMax - startMin);
    const scaleX = (v) => padding.left + (v - startMin) / range * chartW;
    
    // === Генератор формы волны — 3-компонентная Gaussian модель (v4.1.2) ===
    // Компоненты: Fast (простые угл), Slow (основной ответ), Hepatic (печёночный хвост)
    const generateWavePath = (wave, baseY) => {
      const waveWidth = (wave.end - wave.start) / range * chartW;
      const waveStartX = scaleX(wave.start);
      const gi = wave.gi || 50;
      
      // === Параметры компонентов на основе GI (упрощённая версия calculateComponentParams) ===
      // Base values from WAVE_SHAPE_V2
      const baseFast = { peak: 0.20, sigma: 0.12, amplitude: 0.60 };
      const baseSlow = { peak: 0.45, sigma: 0.25, amplitude: 0.35 };
      const baseHepatic = { peak: 0.70, sigma: 0.35, amplitude: 0.05 };
      
      // GI-based modifiers (gi > 70 = faster peak, gi < 40 = slower response)
      const giHighMod = gi >= 70 ? 1.3 : 1.0;  // High GI → stronger fast component
      const giLowMod = gi <= 40 ? 1.4 : 1.0;   // Low GI → stronger slow component
      
      const fastAmp = baseFast.amplitude * giHighMod;
      const slowAmp = baseSlow.amplitude * giLowMod;
      const hepaticAmp = baseHepatic.amplitude;
      
      // Gaussian component function
      const gaussian = (t, peak, sigma, amplitude) => {
        return amplitude * Math.exp(-Math.pow(t - peak, 2) / (2 * sigma * sigma));
      };
      
      // Height scaling based on duration
      const peakHeight = Math.min(1, 0.5 + (wave.duration / 300) * 0.4);
      
      const points = [];
      const steps = 50; // More points for smoother curve
      
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        // Sum of 3 Gaussian components
        const fast = gaussian(t, baseFast.peak, baseFast.sigma, fastAmp);
        const slow = gaussian(t, baseSlow.peak, baseSlow.sigma, slowAmp);
        const hepatic = gaussian(t, baseHepatic.peak, baseHepatic.sigma, hepaticAmp);
        
        // Normalize sum (max ~1.0) and apply height
        const rawSum = fast + slow + hepatic;
        const normalizedSum = rawSum / (fastAmp + slowAmp + hepaticAmp); // Normalize to 0-1
        const y = normalizedSum * peakHeight;
        
        const x = waveStartX + t * waveWidth;
        const yPx = baseY - y * (chartH * 0.8);
        points.push({ x, y: yPx, t, value: y });
      }
      return points;
    };
    
    // Базовая линия (нижняя часть графика)
    const baseY = padding.top + chartH;
    
    // Генерируем пути для всех волн
    const wavePaths = waves.map(wave => {
      const points = generateWavePath(wave, baseY);
      const pathD = points.map((p, i) => 
        `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`
      ).join(' ');
      const fillPathD = `${pathD} L ${scaleX(wave.end)} ${baseY} L ${scaleX(wave.start)} ${baseY} Z`;
      return { wave, points, pathD, fillPathD };
    });
    
    // === Зоны перехлёста (overlap) — красная заливка ===
    const overlapZones = [];
    for (let i = 0; i < waves.length - 1; i++) {
      const w1 = waves[i];
      const w2 = waves[i + 1];
      if (w1.end > w2.start) {
        // Есть перехлёст
        overlapZones.push({
          start: w2.start,
          end: Math.min(w1.end, w2.end),
          minutes: Math.round(w1.end - w2.start)
        });
      }
    }
    
    // === Зона липолиза (зелёная) ===
    const lipolysisZones = [];
    for (let i = 0; i < waves.length - 1; i++) {
      const w1 = waves[i];
      const w2 = waves[i + 1];
      if (w1.end < w2.start) {
        lipolysisZones.push({
          start: w1.end,
          end: w2.start,
          minutes: Math.round(w2.start - w1.end)
        });
      }
    }
    
    // Градиент для фона
    const bgGradient = hasOverlap
      ? 'linear-gradient(135deg, rgba(254,226,226,0.5) 0%, rgba(254,202,202,0.3) 100%)'
      : 'linear-gradient(135deg, rgba(236,253,245,0.5) 0%, rgba(209,250,229,0.3) 100%)';
    
    return React.createElement('div', { 
      className: 'meal-wave-content', 
      style: { 
        padding: '0 12px 12px 12px'
      } 
    },
      // 🆕 v3.5.3: Activity Context badge (переиспользуемый helper)
      activityContext && renderActivityContextBadge(activityContext, { compact: false }),
      // === SVG ГРАФИК ===
      React.createElement('svg', { 
        width: '100%', 
        height, 
        viewBox: `0 0 ${width} ${height}`,
        style: { display: 'block' }
      },
        // Градиенты
        React.createElement('defs', null,
          // Градиент для текущей волны
          React.createElement('linearGradient', { id: 'waveGradCurrent', x1: '0%', y1: '0%', x2: '0%', y2: '100%' },
            React.createElement('stop', { offset: '0%', stopColor: '#3b82f6', stopOpacity: 0.7 }),
            React.createElement('stop', { offset: '100%', stopColor: '#3b82f6', stopOpacity: 0.1 })
          ),
          // Градиент для предыдущей волны
          React.createElement('linearGradient', { id: 'waveGradPrev', x1: '0%', y1: '0%', x2: '0%', y2: '100%' },
            React.createElement('stop', { offset: '0%', stopColor: '#3b82f6', stopOpacity: 0.5 }),
            React.createElement('stop', { offset: '100%', stopColor: '#3b82f6', stopOpacity: 0.05 })
          ),
          // Градиент для следующей волны
          React.createElement('linearGradient', { id: 'waveGradNext', x1: '0%', y1: '0%', x2: '0%', y2: '100%' },
            React.createElement('stop', { offset: '0%', stopColor: '#f97316', stopOpacity: 0.6 }),
            React.createElement('stop', { offset: '100%', stopColor: '#f97316', stopOpacity: 0.1 })
          ),
          // Градиент для overlap
          React.createElement('linearGradient', { id: 'overlapGrad', x1: '0%', y1: '0%', x2: '0%', y2: '100%' },
            React.createElement('stop', { offset: '0%', stopColor: '#ef4444', stopOpacity: 0.5 }),
            React.createElement('stop', { offset: '100%', stopColor: '#ef4444', stopOpacity: 0.2 })
          ),
          // Градиент для липолиза
          React.createElement('linearGradient', { id: 'lipolysisGrad', x1: '0%', y1: '0%', x2: '0%', y2: '100%' },
            React.createElement('stop', { offset: '0%', stopColor: '#22c55e', stopOpacity: 0.4 }),
            React.createElement('stop', { offset: '100%', stopColor: '#22c55e', stopOpacity: 0.1 })
          )
        ),
        
        // Базовая линия
        React.createElement('line', { 
          x1: padding.left, 
          y1: baseY, 
          x2: padding.left + chartW, 
          y2: baseY, 
          stroke: '#cbd5e1', 
          strokeWidth: 1.5 
        }),
        
        // === Зоны липолиза (зелёные) ===
        lipolysisZones.map((zone, i) => React.createElement('g', { key: 'lipo-' + i },
          React.createElement('rect', {
            x: scaleX(zone.start),
            y: padding.top,
            width: Math.max(4, (zone.end - zone.start) / range * chartW),
            height: chartH,
            fill: 'url(#lipolysisGrad)'
          }),
          // Иконка огня в центре
          React.createElement('text', {
            x: scaleX(zone.start) + (zone.end - zone.start) / range * chartW / 2,
            y: padding.top + chartH / 2 + 4,
            fontSize: 14,
            textAnchor: 'middle',
            fill: '#22c55e'
          }, '🔥')
        )),
        
        // === Зоны перехлёста (красные) ===
        overlapZones.map((zone, i) => React.createElement('g', { key: 'ovl-' + i },
          React.createElement('rect', {
            x: scaleX(zone.start),
            y: padding.top,
            width: Math.max(4, (zone.end - zone.start) / range * chartW),
            height: chartH,
            fill: 'url(#overlapGrad)'
          }),
          // Штриховка
          React.createElement('pattern', { 
            id: 'hatch-' + i, 
            patternUnits: 'userSpaceOnUse', 
            width: 6, 
            height: 6,
            patternTransform: 'rotate(45)'
          },
            React.createElement('line', { x1: 0, y1: 0, x2: 0, y2: 6, stroke: '#ef4444', strokeWidth: 1.5, strokeOpacity: 0.3 })
          ),
          React.createElement('rect', {
            x: scaleX(zone.start),
            y: padding.top,
            width: Math.max(4, (zone.end - zone.start) / range * chartW),
            height: chartH,
            fill: 'url(#hatch-' + i + ')'
          }),
          // Иконка предупреждения
          React.createElement('text', {
            x: scaleX(zone.start) + (zone.end - zone.start) / range * chartW / 2,
            y: padding.top + chartH / 2 + 4,
            fontSize: 14,
            textAnchor: 'middle',
            fill: '#ef4444'
          }, '⚠️')
        )),
        
        // === Волны (кривые) ===
        wavePaths.map(({ wave, pathD, fillPathD }, idx) => {
          const gradId = wave.id === 'current' ? 'waveGradCurrent' : 
                         wave.id === 'prev' ? 'waveGradPrev' : 'waveGradNext';
          const zIndex = wave.id === 'current' ? 3 : wave.id === 'next' ? 2 : 1;
          return React.createElement('g', { key: 'wave-' + wave.id, style: { zIndex } },
            // Заливка
            React.createElement('path', { 
              d: fillPathD, 
              fill: 'url(#' + gradId + ')'
            }),
            // Линия кривой
            React.createElement('path', {
              d: pathD,
              fill: 'none',
              stroke: wave.color,
              strokeWidth: wave.id === 'current' ? 2.5 : 1.5,
              strokeLinecap: 'round',
              strokeLinejoin: 'round',
              opacity: wave.id === 'current' ? 1 : 0.7
            })
          );
        }),
        
        // === Вертикальные пунктирные линии времён приёмов ===
        waves.map(wave => React.createElement('line', {
          key: 'vline-' + wave.id,
          x1: scaleX(wave.start),
          y1: padding.top - 4,
          x2: scaleX(wave.start),
          y2: baseY + 4,
          stroke: wave.color,
          strokeWidth: 1,
          strokeDasharray: '3,2',
          opacity: 0.6
        })),
        
        // === Метки времени снизу (с детекцией коллизий) ===
        (() => {
          // Собираем все метки: начала волн + конец текущей
          const currentWave = waves.find(w => w.id === 'current');
          const allLabels = [];
          
          // Метки начала волн
          waves.forEach((wave) => {
            allLabels.push({
              id: 'start-' + wave.id,
              x: scaleX(wave.start),
              time: wave.start,
              text: (wave.id === 'current' ? '🍽️' : '🍽️') + wave.timeLabel,
              color: wave.color,
              weight: wave.id === 'current' ? 600 : 500
            });
          });
          
          // Метка конца текущей волны
          allLabels.push({
            id: 'end-current',
            x: scaleX(currentWave.end),
            time: currentWave.end,
            text: (lipolysisGap > 0 ? '🔥' : '⚠️') + (waveData.endTimeDisplay || ''),
            color: lipolysisGap > 0 ? '#22c55e' : '#ef4444',
            weight: 600
          });
          
          // Сортируем по времени
          allLabels.sort((a, b) => a.time - b.time);
          
          // Вычисляем ширину каждой метки (примерно 7px на символ)
          const charWidth = 6;
          allLabels.forEach(label => {
            label.width = label.text.length * charWidth;
          });
          
          // Разрешаем коллизии — сдвигаем метки горизонтально
          const minGap = 4; // минимальный зазор между метками
          const adjustedX = allLabels.map(l => l.x);
          
          for (let i = 1; i < allLabels.length; i++) {
            const prevRight = adjustedX[i - 1] + allLabels[i - 1].width / 2;
            const currLeft = adjustedX[i] - allLabels[i].width / 2;
            const overlap = prevRight + minGap - currLeft;
            
            if (overlap > 0) {
              // Сдвигаем обе метки в разные стороны
              adjustedX[i - 1] -= overlap / 2;
              adjustedX[i] += overlap / 2;
            }
          }
          
          // Рендерим метки
          return allLabels.map((label, i) => 
            React.createElement('text', {
              key: label.id,
              x: adjustedX[i],
              y: height - 6,
              fontSize: 10,
              fill: label.color,
              textAnchor: 'middle',
              fontWeight: label.weight
            }, label.text)
          );
        })(),
        
        // === Легенда (если несколько волн) ===
        waves.length > 1 && React.createElement('g', null,
          waves.map((wave, idx) => {
            const legendX = padding.left + idx * 90;
            const legendY = padding.top - 8;
            return React.createElement('g', { key: 'leg-' + wave.id },
              React.createElement('circle', { cx: legendX, cy: legendY, r: 4, fill: wave.color }),
              React.createElement('text', { 
                x: legendX + 8, 
                y: legendY + 3, 
                fontSize: 9, 
                fill: '#64748b'
              }, wave.label)
            );
          })
        )
      ),
      
      // 🆕 v3.7.1: Popup детализации волны
      showWaveDetails && React.createElement('div', {
        className: 'wave-details-overlay',
        onClick: (e) => { if (e.target === e.currentTarget) setShowWaveDetails(false); },
        style: {
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }
      },
        React.createElement('div', {
          className: 'wave-details-popup',
          style: {
            background: '#fff',
            borderRadius: '16px',
            padding: '20px',
            maxWidth: '360px',
            width: '100%',
            maxHeight: '80vh',
            overflowY: 'auto',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
          }
        },
          // Заголовок
          React.createElement('div', {
            style: { 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              marginBottom: '16px'
            }
          },
            React.createElement('h3', { 
              style: { margin: 0, fontSize: '16px', fontWeight: 600, color: '#1f2937' }
            }, '📊 Расчёт волны'),
            React.createElement('button', {
              onClick: () => setShowWaveDetails(false),
              style: {
                background: 'none', border: 'none', fontSize: '20px', 
                cursor: 'pointer', color: '#9ca3af', padding: '4px'
              }
            }, '×')
          ),
          
          // Итоговая длина волны
          React.createElement('div', {
            style: {
              background: 'linear-gradient(135deg, #3b82f6, #3b82f6)',
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '16px',
              textAlign: 'center',
              color: '#fff'
            }
          },
            React.createElement('div', { style: { fontSize: '12px', opacity: 0.9, marginBottom: '4px' } }, 
              'Длина волны'
            ),
            React.createElement('div', { style: { fontSize: '28px', fontWeight: 700 } }, 
              (waveData.waveHours || waveData.duration / 60).toFixed(1) + 'ч'
            ),
            React.createElement('div', { style: { fontSize: '11px', opacity: 0.8, marginTop: '4px' } }, 
              waveData.timeDisplay + ' → ' + waveData.endTimeDisplay
            )
          ),
          
          // Формула
          React.createElement('div', {
            style: {
              background: '#f8fafc',
              borderRadius: '10px',
              padding: '12px',
              marginBottom: '16px',
              fontSize: '11px',
              fontFamily: 'monospace',
              color: '#64748b',
              textAlign: 'center'
            }
          }, 'База × Множитель = ' + (waveData.baseWaveHours || 3).toFixed(1) + 'ч × ' + 
             (waveData.finalMultiplier || 1).toFixed(2) + ' = ' +
             (waveData.waveHours || waveData.duration / 60).toFixed(1) + 'ч'
          ),
          
          // 🆕 v4.1.0: Легенда 3-компонентной Gaussian модели
          React.createElement('div', {
            style: {
              background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
              borderRadius: '10px',
              padding: '12px',
              marginBottom: '16px'
            }
          },
            React.createElement('div', { 
              style: { fontSize: '12px', fontWeight: 600, color: '#92400e', marginBottom: '8px' }
            }, '🧬 Научная модель волны'),
            React.createElement('div', { 
              style: { fontSize: '11px', color: '#78350f', lineHeight: '1.5' }
            }, 
              'Форма кривой = сумма 3 компонентов инсулинового ответа:'
            ),
            React.createElement('div', { style: { marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' } },
              // Fast component
              React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                React.createElement('span', { style: { fontSize: '14px' } }, '⚡'),
                React.createElement('div', null,
                  React.createElement('div', { style: { fontSize: '11px', fontWeight: 600, color: '#f97316' } }, 
                    'Быстрый пик (15-25 мин)'
                  ),
                  React.createElement('div', { style: { fontSize: '10px', color: '#78350f' } }, 
                    'Простые углеводы, ГИ>70'
                  )
                )
              ),
              // Slow component
              React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                React.createElement('span', { style: { fontSize: '14px' } }, '🌿'),
                React.createElement('div', null,
                  React.createElement('div', { style: { fontSize: '11px', fontWeight: 600, color: '#22c55e' } }, 
                    'Основной ответ (45-60 мин)'
                  ),
                  React.createElement('div', { style: { fontSize: '10px', color: '#78350f' } }, 
                    'Сложные углеводы, белок, жиры'
                  )
                )
              ),
              // Hepatic component
              React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                React.createElement('span', { style: { fontSize: '14px' } }, '🫀'),
                React.createElement('div', null,
                  React.createElement('div', { style: { fontSize: '11px', fontWeight: 600, color: '#8b5cf6' } }, 
                    'Печёночный хвост (90-120 мин)'
                  ),
                  React.createElement('div', { style: { fontSize: '10px', color: '#78350f' } }, 
                    'Клетчатка, медленное высвобождение'
                  )
                )
              )
            ),
            // Научная ссылка
            React.createElement('div', { 
              style: { 
                marginTop: '10px', 
                paddingTop: '8px', 
                borderTop: '1px solid rgba(146, 64, 14, 0.2)',
                fontSize: '10px', 
                color: '#92400e' 
              }
            }, '📚 Brand-Miller 2003, Holt 1997')
          ),
          
          // Факторы еды
          React.createElement('div', { style: { marginBottom: '12px' } },
            React.createElement('div', { 
              style: { fontSize: '12px', fontWeight: 600, color: '#1f2937', marginBottom: '8px' }
            }, '🍽️ Факторы еды'),
            
            // GI
            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid #f1f5f9' } },
              React.createElement('span', { style: { color: '#64748b' } }, 'ГИ'),
              React.createElement('span', { style: { fontWeight: 500 } }, Math.round(waveData.gi || 0))
            ),
            // GL
            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid #f1f5f9' } },
              React.createElement('span', { style: { color: '#64748b' } }, 'GL (нагрузка)'),
              React.createElement('span', { style: { fontWeight: 500, color: waveData.gl < 10 ? '#22c55e' : waveData.gl > 20 ? '#ef4444' : '#1f2937' } }, 
                (waveData.gl || 0).toFixed(1) + (waveData.glCategory?.desc ? ' (' + waveData.glCategory.desc + ')' : '')
              )
            ),
            // Белок
            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid #f1f5f9' } },
              React.createElement('span', { style: { color: '#64748b' } }, 'Белок'),
              React.createElement('span', { style: { fontWeight: 500 } }, Math.round(waveData.protein || 0) + 'г')
            ),
            // Клетчатка
            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid #f1f5f9' } },
              React.createElement('span', { style: { color: '#64748b' } }, 'Клетчатка'),
              React.createElement('span', { style: { fontWeight: 500, color: waveData.fiber >= 5 ? '#22c55e' : '#1f2937' } }, 
                Math.round(waveData.fiber || 0) + 'г'
              )
            ),
            // Жиры
            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid #f1f5f9' } },
              React.createElement('span', { style: { color: '#64748b' } }, 'Жиры'),
              React.createElement('span', { style: { fontWeight: 500 } }, Math.round(waveData.fat || 0) + 'г')
            ),
            // Углеводы
            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid #f1f5f9' } },
              React.createElement('span', { style: { color: '#64748b' } }, 'Углеводы'),
              React.createElement('span', { style: { fontWeight: 500 } }, Math.round(waveData.carbs || 0) + 'г')
            ),
            // Жидкая еда
            waveData.hasLiquid && React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid #f1f5f9' } },
              React.createElement('span', { style: { color: '#f97316' } }, '🥤 Жидкая еда'),
              React.createElement('span', { style: { fontWeight: 500, color: '#f97316' } }, '×' + (waveData.liquidMultiplier || 0.75).toFixed(2))
            ),
            // Инсулиногенность
            waveData.insulinogenicType && React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid #f1f5f9' } },
              React.createElement('span', { style: { color: '#64748b' } }, '🥛 Инсулиногенность'),
              React.createElement('span', { style: { fontWeight: 500 } }, waveData.insulinogenicType)
            )
          ),
          
          // Дневные факторы
          React.createElement('div', { style: { marginBottom: '12px' } },
            React.createElement('div', { 
              style: { fontSize: '12px', fontWeight: 600, color: '#1f2937', marginBottom: '8px' }
            }, '⏰ Дневные факторы'),
            
            // Циркадный ритм
            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid #f1f5f9' } },
              React.createElement('span', { style: { color: '#64748b' } }, 'Время суток'),
              React.createElement('span', { style: { fontWeight: 500, color: waveData.circadianMultiplier > 1.05 ? '#f97316' : '#1f2937' } }, 
                '×' + (waveData.circadianMultiplier || 1).toFixed(2)
              )
            ),
            // Дневные бонусы
            waveData.dayFactorsBonus && waveData.dayFactorsBonus !== 0 && React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid #f1f5f9' } },
              React.createElement('span', { style: { color: '#64748b' } }, 'Сон/стресс/гидратация'),
              React.createElement('span', { style: { fontWeight: 500, color: waveData.dayFactorsBonus > 0 ? '#ef4444' : '#22c55e' } }, 
                (waveData.dayFactorsBonus > 0 ? '+' : '') + (waveData.dayFactorsBonus * 100).toFixed(0) + '%'
              )
            ),
            // Активность
            waveData.activityBonus && waveData.activityBonus !== 0 && React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid #f1f5f9' } },
              React.createElement('span', { style: { color: '#22c55e' } }, '🏃 Активность'),
              React.createElement('span', { style: { fontWeight: 500, color: '#22c55e' } }, 
                (waveData.activityBonus * 100).toFixed(0) + '%'
              )
            ),
            // 🆕 v3.7.1: NDTE (Next-Day Training Effect)
            waveData.ndteData && React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid #f1f5f9' } },
              React.createElement('span', { style: { color: '#10b981' } }, '🔥 Вчера тренировка'),
              React.createElement('span', { style: { fontWeight: 500, color: '#10b981' } }, 
                '-' + Math.round(waveData.ndteData.waveReduction * 100) + '%'
              )
            )
          ),
          
          // Activity Context (если есть)
          activityContext && activityContext.type !== 'none' && React.createElement('div', { 
            style: { 
              marginBottom: '12px',
              background: 'rgba(16, 185, 129, 0.1)',
              borderRadius: '10px',
              padding: '12px'
            } 
          },
            React.createElement('div', { 
              style: { fontSize: '12px', fontWeight: 600, color: '#10b981', marginBottom: '6px' }
            }, activityContext.badge),
            React.createElement('div', { 
              style: { fontSize: '11px', color: '#64748b' }
            }, activityContext.desc),
            activityContext.waveBonus && React.createElement('div', { 
              style: { fontSize: '11px', color: '#10b981', marginTop: '4px', fontWeight: 500 }
            }, 'Волна: ' + (activityContext.waveBonus * 100).toFixed(0) + '%')
          ),
          
          // GL Scale info
          waveData.dayFactorsScale && waveData.dayFactorsScale < 1 && React.createElement('div', {
            style: {
              background: '#f0fdf4',
              borderRadius: '8px',
              padding: '10px',
              fontSize: '11px',
              color: '#166534',
              marginBottom: '12px'
            }
          },
            '💡 При низкой GL (' + (waveData.gl || 0).toFixed(1) + ') дневные факторы применяются на ' + 
            Math.round((waveData.dayFactorsScale || 1) * 100) + '%'
          ),
          
          // Кнопка закрытия
          React.createElement('button', {
            onClick: () => setShowWaveDetails(false),
            style: {
              width: '100%',
              background: '#3b82f6',
              color: '#fff',
              border: 'none',
              borderRadius: '10px',
              padding: '12px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              marginTop: '8px'
            }
          }, 'Закрыть')
        )
      )
    );
  };
  
  /**
   * Рендер прогресс-бара волны
   */
  // === Компонент таймера с секундами ===
  const ProgressBarComponent = ({ data }) => {
    const isLipolysis = data.status === 'lipolysis';
    const lipolysisMinutes = data.lipolysisMinutes || 0;
    const remainingMinutes = data.remaining || 0;
    
    // Состояние для секунд (обновляется каждую секунду)
    const [seconds, setSeconds] = React.useState(() => {
      const now = new Date();
      return 60 - now.getSeconds();
    });
    
    // Обновление секунд каждую секунду
    React.useEffect(() => {
      if (isLipolysis) return; // При липолизе не нужен countdown
      
      const interval = setInterval(() => {
        const now = new Date();
        setSeconds(60 - now.getSeconds());
      }, 1000);
      
      return () => clearInterval(interval);
    }, [isLipolysis]);
    
    // При липолизе — зелёный градиент
    const lipolysisGradient = 'linear-gradient(135deg, #22c55e 0%, #10b981 50%, #059669 100%)';
    
    // Форматирование времени для таймера
    const formatCountdown = (mins, secs) => {
      if (mins <= 0) return { h: '00', m: '00', s: '00' };
      const totalSecs = Math.max(0, Math.floor(mins * 60) - (60 - secs));
      const h = Math.floor(totalSecs / 3600);
      const m = Math.floor((totalSecs % 3600) / 60);
      const s = totalSecs % 60;
      return {
        h: String(h).padStart(2, '0'),
        m: String(m).padStart(2, '0'),
        s: String(s).padStart(2, '0')
      };
    };
    
    const countdown = formatCountdown(remainingMinutes, seconds);
    
    // При липолизе: большой зелёный блок с таймером жиросжигания
    if (isLipolysis) {
      return React.createElement('div', {
        style: {
          background: lipolysisGradient,
          borderRadius: '16px',
          padding: '20px',
          textAlign: 'center',
          marginTop: '8px',
          boxShadow: '0 4px 12px rgba(34, 197, 94, 0.3)'
        }
      },
        React.createElement('div', {
          style: { fontSize: '13px', color: 'rgba(255,255,255,0.9)', marginBottom: '8px', fontWeight: '500' }
        }, '🔥 Жиросжигание активно'),
        React.createElement('div', {
          style: { 
            fontSize: '36px', 
            fontWeight: '800', 
            color: '#fff',
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '2px',
            textShadow: '0 2px 8px rgba(0,0,0,0.2)'
          }
        }, formatLipolysisTime(lipolysisMinutes)),
        // Плашка тренировки (если эффект от тренировки ускорил выход в липолиз)
        data.activityContext && React.createElement('div', { style: { marginTop: '12px' } },
          renderActivityContextBadge(data.activityContext, { compact: true, showDesc: false })
        )
      );
    }
    
    // При активной волне: большой таймер обратного отсчёта
    return React.createElement(React.Fragment, null,
      // Плашка тренировки (если есть) — ПОД таймером
      data.activityContext && data.activityContext.type !== 'none' && renderActivityContextBadge(data.activityContext, { compact: false, showDesc: true }),
      // Синий блок с таймером
      React.createElement('div', {
        style: {
          background: 'linear-gradient(135deg, #3b82f6 0%, #3b82f6 50%, #3b82f6 100%)',
          borderRadius: '16px',
          padding: '20px',
        textAlign: 'center',
        marginTop: '8px',
        boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)'
      }
    },
      React.createElement('div', {
        style: { fontSize: '13px', color: 'rgba(255,255,255,0.9)', marginBottom: '8px', fontWeight: '500' }
      }, '⏱ Жиросжигание начнётся через'),
      // Большие цифры таймера
      React.createElement('div', {
        style: { 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'baseline',
          gap: '4px',
          fontVariantNumeric: 'tabular-nums'
        }
      },
        // Часы
        React.createElement('span', {
          style: { fontSize: '42px', fontWeight: '800', color: '#fff', textShadow: '0 2px 8px rgba(0,0,0,0.2)' }
        }, countdown.h),
        React.createElement('span', {
          style: { fontSize: '24px', fontWeight: '600', color: 'rgba(255,255,255,0.7)', marginRight: '8px' }
        }, ':'),
        // Минуты
        React.createElement('span', {
          style: { fontSize: '42px', fontWeight: '800', color: '#fff', textShadow: '0 2px 8px rgba(0,0,0,0.2)' }
        }, countdown.m),
        React.createElement('span', {
          style: { fontSize: '24px', fontWeight: '600', color: 'rgba(255,255,255,0.7)', marginRight: '8px' }
        }, ':'),
        // Секунды
        React.createElement('span', {
          style: { fontSize: '42px', fontWeight: '800', color: '#fff', textShadow: '0 2px 8px rgba(0,0,0,0.2)' }
        }, countdown.s)
      ),
      // Подписи
      React.createElement('div', {
        style: { 
          display: 'flex', 
          justifyContent: 'center', 
          gap: '24px',
          marginTop: '4px',
          fontSize: '11px',
          color: 'rgba(255,255,255,0.7)',
          fontWeight: '500'
        }
      },
        React.createElement('span', null, 'часов'),
        React.createElement('span', null, 'минут'),
        React.createElement('span', null, 'секунд')
      ),
      // График волны
      renderWaveChart(data)
      )
    );
  };
  
  // Wrapper для вызова как функции
  const renderProgressBar = (data) => {
    return React.createElement(ProgressBarComponent, { data, key: 'progress-bar' });
  };
  
  /**
   * Рендер истории волн (мини-график)
   */
  const renderWaveHistory = (data) => {
    const history = data.waveHistory || [];
    if (history.length === 0) return null;
    
    const firstMealMin = Math.min(...history.map(w => w.startMin));
    const lastMealEnd = Math.max(...history.map(w => w.endMin));
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    
    const rangeStart = firstMealMin - 15;
    const rangeEnd = Math.max(nowMin, lastMealEnd) + 15;
    const totalRange = rangeEnd - rangeStart;
    
    const w = 320;
    const h = 60;
    const padding = 4;
    const barY = 20;
    const barH = 18;
    
    const minToX = (min) => padding + ((min - rangeStart) / totalRange) * (w - 2 * padding);
    
    return React.createElement('div', { 
      className: 'insulin-history', 
      style: { marginTop: '12px', margin: '12px -8px 0 -8px' } 
    },
      React.createElement('div', { 
        style: { fontSize: '11px', color: '#64748b', marginBottom: '8px', fontWeight: '600', paddingLeft: '8px' } 
      }, '📊 Волны сегодня'),
      
      React.createElement('svg', { 
        width: '100%', height: h, viewBox: `0 0 ${w} ${h}`, style: { display: 'block' }
      },
        React.createElement('defs', null,
          React.createElement('linearGradient', { id: 'activeWaveGrad2', x1: '0%', y1: '0%', x2: '100%', y2: '0%' },
            React.createElement('stop', { offset: '0%', stopColor: '#3b82f6' }),
            React.createElement('stop', { offset: '100%', stopColor: '#3b82f6' })
          )
        ),
        
        // Фоновая линия
        React.createElement('line', {
          x1: padding, y1: barY + barH / 2, x2: w - padding, y2: barY + barH / 2,
          stroke: '#e5e7eb', strokeWidth: 2, strokeLinecap: 'round'
        }),
        
        // Волны
        history.map((wave, i) => {
          const x1 = minToX(wave.startMin);
          const x2 = minToX(wave.endMin);
          const barW = Math.max(8, x2 - x1);
          const giColor = wave.gi <= 35 ? '#22c55e' : wave.gi <= 55 ? '#eab308' : wave.gi <= 70 ? '#f97316' : '#ef4444';
          
          return React.createElement('g', { key: 'wave-' + i },
            React.createElement('rect', {
              x: x1, y: barY, width: barW, height: barH,
              fill: wave.isActive ? 'url(#activeWaveGrad2)' : giColor,
              opacity: wave.isActive ? 1 : 0.6,
              rx: 4
            }),
            wave.isActive && React.createElement('rect', {
              x: x1, y: barY, width: barW, height: barH,
              fill: 'none', stroke: '#3b82f6', strokeWidth: 2, rx: 4,
              className: 'wave-active-pulse'
            })
          );
        }),
        
        // Точки приёмов
        history.map((wave, i) => {
          const x = minToX(wave.startMin);
          return React.createElement('g', { key: 'meal-' + i },
            React.createElement('circle', { cx: x, cy: barY + barH / 2, r: 6, fill: '#fff', stroke: '#3b82f6', strokeWidth: 2 }),
            React.createElement('text', { x, y: barY + barH / 2 + 1, fontSize: 8, textAnchor: 'middle', dominantBaseline: 'middle' }, '🍽'),
            React.createElement('text', { x, y: h - 2, fontSize: 8, fill: '#64748b', textAnchor: 'middle', fontWeight: '500' }, 
              utils.minutesToTime(wave.startMin))
          );
        }),
        
        // Текущее время
        (() => {
          const x = minToX(nowMin);
          if (x < padding || x > w - padding) return null;
          return React.createElement('g', null,
            React.createElement('line', { x1: x, y1: barY - 5, x2: x, y2: barY + barH + 5, stroke: '#ef4444', strokeWidth: 2, strokeLinecap: 'round' }),
            React.createElement('polygon', { points: `${x-4},${barY-5} ${x+4},${barY-5} ${x},${barY}`, fill: '#ef4444' }),
            React.createElement('text', { x, y: barY - 8, fontSize: 8, fill: '#ef4444', textAnchor: 'middle', fontWeight: '600' }, 'Сейчас')
          );
        })()
      ),
      
      // Легенда
      React.createElement('div', { 
        className: 'insulin-history-legend',
        style: { display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px', fontSize: '10px', color: '#64748b', paddingLeft: '8px' }
      },
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '3px' } },
          React.createElement('span', { style: { width: '10px', height: '10px', borderRadius: '50%', border: '2px solid #3b82f6', background: '#fff' } }),
          'Приём'
        ),
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '3px' } },
          React.createElement('span', { style: { width: '16px', height: '8px', borderRadius: '2px', background: 'linear-gradient(90deg, #3b82f6, #3b82f6)' } }),
          'Активная'
        ),
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '3px' } },
          React.createElement('span', { style: { width: '8px', height: '8px', borderRadius: '2px', background: '#22c55e' } }),
          'Низкий ГИ'
        ),
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '3px' } },
          React.createElement('span', { style: { width: '8px', height: '8px', borderRadius: '2px', background: '#eab308' } }),
          'Средний'
        ),
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '3px' } },
          React.createElement('span', { style: { width: '12px', height: '2px', background: '#ef4444' } }),
          'Сейчас'
        )
      )
    );
  };
  
  /**
   * Рендер expanded секции с детальной информацией
   */
  // === МИНИМАЛИСТИЧНЫЙ EXPANDED v2 (React Component) ===
  const ExpandedSectionComponent = ({ data }) => {
    const [expandedMetric, setExpandedMetric] = React.useState('wave'); // 'wave' | 'gi' | 'gl' | null — волна раскрыта по умолчанию
    const giCat = data.giCategory;
    
    // Стили для метрик-карточек
    const metricCardStyle = (isActive) => ({
      flex: '1 1 0',
      minWidth: '80px',
      padding: '12px 8px',
      background: isActive ? 'rgba(59, 130, 246, 0.1)' : 'rgba(248, 250, 252, 0.8)',
      borderRadius: '12px',
      textAlign: 'center',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      border: isActive ? '2px solid #3b82f6' : '2px solid transparent'
    });
    
    const metricValueStyle = {
      fontSize: '20px',
      fontWeight: '700',
      color: '#1e293b',
      lineHeight: 1.2
    };
    
    const metricLabelStyle = {
      fontSize: '11px',
      color: '#64748b',
      marginTop: '4px'
    };
    
    // Собираем активные модификаторы
    const getModifiers = () => {
      const mods = [];
      if (data.fatBonus > 0) mods.push({ icon: '🧈', name: 'Жиры', value: `+${Math.round(data.fatBonus * 100)}%`, desc: `${data.totalFat}г замедляют усвоение` });
      if (data.proteinBonus > 0) mods.push({ icon: '🥩', name: 'Белок', value: `+${Math.round(data.proteinBonus * 100)}%`, desc: `${data.totalProtein}г продлевают волну` });
      if (data.fiberBonus > 0) mods.push({ icon: '🌾', name: 'Клетчатка', value: `+${Math.round(data.fiberBonus * 100)}%`, desc: `${data.totalFiber}г замедляют` });
      // 🔬 v3.0.1: Показываем правильный label и иконку для insulinogenic
      if (data.insulinogenicBonus > 0) {
        const isProtein = data.insulinogenicType === 'protein';
        mods.push({ 
          icon: isProtein ? '🍖' : '🥛', 
          name: isProtein ? 'Мясо/белок' : 'Молочка', 
          value: `+${Math.round(data.insulinogenicBonus * 100)}%`, 
          desc: 'повышает инсулин' 
        });
      }
      if (data.hasLiquid) mods.push({ icon: '🥤', name: 'Жидкое', value: `×${data.liquidMultiplier}`, desc: 'быстрее усваивается' });
      if (data.hasWorkoutBonus) mods.push({ icon: '🏃', name: 'Тренировка', value: `-${Math.abs(Math.round(data.workoutBonus * 100))}%`, desc: `${data.workoutMinutes} мин ускоряют` });
      // 🆕 v1.5: Постпрандиальная активность
      if (data.hasPostprandialBonus) {
        const gapHours = Math.round(data.postprandialGapMinutes / 60 * 10) / 10;
        mods.push({ 
          icon: '🏃‍♂️', 
          name: 'После еды', 
          value: `-${Math.abs(Math.round(data.postprandialBonus * 100))}%`, 
          desc: `тренировка через ${gapHours}ч ускоряет утилизацию глюкозы` 
        });
      }
      // 🆕 v1.5: NEAT (бытовая активность)
      if (data.hasNeatBonus) {
        mods.push({ 
          icon: '🏡', 
          name: 'Бытовая активность', 
          value: `-${Math.abs(Math.round(data.neatBonus * 100))}%`, 
          desc: `${data.householdMin} мин улучшают чувствительность к инсулину` 
        });
      }
      // 🆕 v1.5: Шаги
      if (data.hasStepsBonus) {
        mods.push({ 
          icon: '🚶', 
          name: 'Шаги', 
          value: `-${Math.abs(Math.round(data.stepsBonus * 100))}%`, 
          desc: `${Math.round(data.steps / 1000)}k шагов ускоряют метаболизм` 
        });
      }
      if (data.circadianMultiplier && data.circadianMultiplier !== 1.0) {
        mods.push({ 
          icon: data.circadianMultiplier < 1 ? '☀️' : '🌙', 
          name: 'Время суток', 
          value: `×${data.circadianMultiplier}`, 
          desc: data.circadianMultiplier < 1 ? 'днём быстрее' : 'ночью медленнее' 
        });
      }
      if (data.hasCaffeineBonus) mods.push({ icon: '☕', name: 'Кофеин', value: `+${Math.round(data.caffeineBonus * 100)}%`, desc: 'повышает инсулин' });
      if (data.hasStressBonus) mods.push({ icon: '😰', name: 'Стресс', value: `+${Math.round(data.stressBonus * 100)}%`, desc: 'кортизол влияет' });
      if (data.hasSleepBonus) mods.push({ icon: '😴', name: 'Недосып', value: `+${Math.round(data.sleepDeprivationBonus * 100)}%`, desc: 'инсулинорезистентность' });
      // 🆕 v3.7.0: NDTE — эффект вчерашней тренировки
      if (data.hasNDTE && data.ndteWaveReduction > 0) {
        const ndte = data.ndte || {};
        mods.push({ 
          icon: '🔥', 
          name: 'Вчера тренировка', 
          value: `-${Math.round(data.ndteWaveReduction * 100)}%`, 
          desc: `${ndte.trainingKcal || '?'} ккал → инсулин.чувств. выше ${Math.round(ndte.hoursSince || 0)}ч` 
        });
      }
      return mods;
    };
    
    const modifiers = getModifiers();
    
    // Детали для каждой метрики
    const getMetricDetails = (metric) => {
      switch (metric) {
        case 'wave': {
          // Формируем формулу расчёта
          const baseHrs = data.baseWaveHours || 3; // Fallback на 3ч если NaN
          const parts = [`${baseHrs}ч (база)`];
          if (data.giMultiplier && data.giMultiplier !== 1) parts.push(`×${data.giMultiplier} ГИ`);
          if (data.fatBonus > 0) parts.push(`+${Math.round(data.fatBonus * 100)}% жиры`);
          if (data.proteinBonus > 0) parts.push(`+${Math.round(data.proteinBonus * 100)}% белок`);
          if (data.fiberBonus > 0) parts.push(`+${Math.round(data.fiberBonus * 100)}% клетчатка`);
          // 🔬 v3.0.1: Показываем правильный label (молочка/мясо) в зависимости от типа
          if (data.insulinogenicBonus > 0) {
            const insLabel = data.insulinogenicType === 'protein' ? 'мясо' : 'молочка';
            parts.push(`+${Math.round(data.insulinogenicBonus * 100)}% ${insLabel}`);
          }
          if (data.hasLiquid) parts.push(`×${data.liquidMultiplier} жидкое`);
          if (data.hasWorkoutBonus) parts.push(`-${Math.abs(Math.round(data.workoutBonus * 100))}% тренировка`);
          // 🆕 v1.5: Новые бонусы активности
          if (data.hasPostprandialBonus) parts.push(`-${Math.abs(Math.round(data.postprandialBonus * 100))}% активность после еды`);
          if (data.hasNeatBonus) parts.push(`-${Math.abs(Math.round(data.neatBonus * 100))}% бытовая активность`);
          if (data.hasStepsBonus) parts.push(`-${Math.abs(Math.round(data.stepsBonus * 100))}% шаги`);
          if (data.circadianMultiplier && data.circadianMultiplier !== 1.0) parts.push(`×${data.circadianMultiplier} ${data.circadianMultiplier < 1 ? 'день' : 'ночь'}`);
          if (data.hasCaffeineBonus) parts.push(`+${Math.round(data.caffeineBonus * 100)}% кофеин`);
          if (data.hasStressBonus) parts.push(`+${Math.round(data.stressBonus * 100)}% стресс`);
          if (data.hasSleepBonus) parts.push(`+${Math.round(data.sleepDeprivationBonus * 100)}% недосып`);
          // 🆕 v3.7.0: NDTE — эффект вчерашней тренировки
          if (data.hasNDTE && data.ndteWaveReduction > 0) parts.push(`-${Math.round(data.ndteWaveReduction * 100)}% NDTE`);
          
          const formula = parts.join(' ');
          
          // Защита от NaN
          const waveHours = data.insulinWaveHours && !isNaN(data.insulinWaveHours) 
            ? Math.round(data.insulinWaveHours * 10) / 10 
            : '?';
          
          return {
            title: '📊 Расчёт волны',
            formula: formula,
            result: `= ${waveHours}ч`,
            items: modifiers.map(m => ({ label: `${m.icon} ${m.name}`, value: m.value, desc: m.desc })),
            desc: 'Время, пока инсулин высокий и жир не сжигается'
          };
        }
        case 'gi':
          return {
            title: '🍬 Гликемический индекс',
            items: [
              { label: 'Средний ГИ', value: data.avgGI || '—' },
              { label: 'Категория', value: giCat.text },
              { label: 'Усвоение', value: giCat.desc }
            ],
            desc: giCat.id === 'low' ? 'Низкий ГИ = медленный подъём сахара' :
                  giCat.id === 'high' ? 'Высокий ГИ = быстрый скачок сахара' :
                  'Средний ГИ = умеренный подъём сахара'
          };
        case 'gl':
          return {
            title: '📈 Гликемическая нагрузка',
            items: [
              { label: 'GL', value: data.glycemicLoad || '—' },
              { label: 'Категория', value: data.glCategory?.text || 'Средняя' },
              { label: 'Углеводы', value: `${data.totalCarbs || 0}г` }
            ],
            desc: 'GL = ГИ × углеводы / 100. Показывает реальную нагрузку на поджелудочную'
          };
        default:
          return null;
      }
    };
    
    const toggleMetric = (metric) => {
      setExpandedMetric(expandedMetric === metric ? null : metric);
    };
    
    const details = expandedMetric ? getMetricDetails(expandedMetric) : null;
    
    return React.createElement('div', { 
      className: 'insulin-wave-expanded',
      onClick: (e) => e.stopPropagation()
    },
      
      // === БЛОК 1: Метрики (3 кликабельные карточки) ===
      React.createElement('div', { 
        style: { display: 'flex', gap: '8px', marginBottom: details ? '12px' : '16px' }
      },
        // Карточка: Волна
        React.createElement('div', { 
          style: metricCardStyle(expandedMetric === 'wave'),
          onClick: () => toggleMetric('wave')
        },
          React.createElement('div', { style: metricValueStyle }, 
            `${Math.round(data.insulinWaveHours * 10) / 10}ч`
          ),
          React.createElement('div', { style: metricLabelStyle }, 'волна ⓘ')
        ),
        // Карточка: ГИ
        React.createElement('div', { 
          style: { ...metricCardStyle(expandedMetric === 'gi'), background: expandedMetric === 'gi' ? `${giCat.color}20` : `${giCat.color}15` },
          onClick: () => toggleMetric('gi')
        },
          React.createElement('div', { style: { ...metricValueStyle, color: giCat.color } }, 
            data.avgGI || '—'
          ),
          React.createElement('div', { style: metricLabelStyle }, 'ГИ ⓘ')
        ),
        // Карточка: GL
        React.createElement('div', { 
          style: metricCardStyle(expandedMetric === 'gl'),
          onClick: () => toggleMetric('gl')
        },
          React.createElement('div', { style: metricValueStyle }, 
            data.glycemicLoad > 0 ? data.glycemicLoad : '—'
          ),
          React.createElement('div', { style: metricLabelStyle }, 'GL ⓘ')
        )
      ),
      
      // === Детали выбранной метрики (выпадающий блок) ===
      details && React.createElement('div', {
        style: {
          padding: '12px 16px',
          background: '#f8fafc',
          borderRadius: '12px',
          marginBottom: '16px',
          animation: 'fadeIn 0.2s ease'
        }
      },
        React.createElement('div', {
          style: { fontSize: '14px', fontWeight: '600', color: '#1e293b', marginBottom: '10px' }
        }, details.title),
        
        // Для волны — формула расчёта
        details.formula && React.createElement('div', {
          style: {
            padding: '10px 12px',
            background: 'rgba(0,0,0,0.03)',
            borderRadius: '8px',
            marginBottom: '12px',
            fontFamily: 'system-ui, -apple-system, sans-serif'
          }
        },
          // Формула
          React.createElement('div', {
            style: { fontSize: '12px', color: '#64748b', lineHeight: 1.6, wordBreak: 'break-word' }
          }, details.formula),
          // Результат
          React.createElement('div', {
            style: { 
              fontSize: '18px', 
              fontWeight: '700', 
              color: '#1e293b', 
              marginTop: '6px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }
          }, 
            React.createElement('span', null, details.result),
            React.createElement('span', { 
              style: { fontSize: '12px', color: '#64748b', fontWeight: '400' }
            }, 'инсулиновая волна')
          )
        ),
        
        // Список модификаторов (для волны) или значений (для других)
        details.items?.length > 0 && React.createElement('div', { 
          style: { display: 'flex', flexDirection: 'column', gap: '6px' }
        },
          details.items.map((item, i) => 
            React.createElement('div', {
              key: i,
              style: { display: 'flex', justifyContent: 'space-between', fontSize: '13px' }
            },
              React.createElement('span', { style: { color: '#64748b' } }, item.label),
              React.createElement('span', { 
                style: { 
                  fontWeight: '600', 
                  color: item.value?.startsWith?.('-') ? '#16a34a' : 
                         item.value?.startsWith?.('+') ? '#f59e0b' : '#1e293b'
                }
              }, item.value)
            )
          )
        ),
        
        // Описание
        React.createElement('div', {
          style: { marginTop: '10px', fontSize: '12px', color: '#64748b', fontStyle: 'italic' }
        }, details.desc)
      ),
      
      // === БЛОК 2: Паттерны (если есть данные) ===
      data.personalAvgGap > 0 && React.createElement('div', { 
        style: { 
          padding: '12px 16px',
          background: 'rgba(248, 250, 252, 0.8)',
          borderRadius: '12px',
          marginBottom: '16px'
        }
      },
        React.createElement('div', { 
          style: { 
            fontSize: '13px', 
            fontWeight: '600', 
            color: '#475569',
            marginBottom: '8px'
          }
        }, '🎯 Паттерны'),
        React.createElement('div', { 
          style: { 
            display: 'flex', 
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '14px'
          }
        },
          React.createElement('span', { style: { color: '#64748b' } }, 'Средний gap'),
          React.createElement('span', { style: { fontWeight: '600', color: '#1e293b' } }, 
            utils.formatDuration(data.personalAvgGap)
          )
        ),
        // Оценка качества
        React.createElement('div', { 
          style: { 
            marginTop: '10px',
            padding: '8px 12px',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: '500',
            textAlign: 'center',
            background: data.gapQuality === 'excellent' ? '#dcfce7' : 
                        data.gapQuality === 'good' ? '#fef9c3' : 
                        data.gapQuality === 'moderate' ? '#fed7aa' : '#fecaca',
            color: data.gapQuality === 'excellent' ? '#166534' : 
                   data.gapQuality === 'good' ? '#854d0e' : 
                   data.gapQuality === 'moderate' ? '#c2410c' : '#dc2626'
          }
        },
          data.gapQuality === 'excellent' ? '✓ Отлично!' :
          data.gapQuality === 'good' ? '👍 Хорошо' :
          data.gapQuality === 'moderate' ? '→ Можно лучше' : '⚠️ Слишком часто'
        )
      ),
      
      // === БЛОК 3: Текущее состояние ===
      React.createElement('div', { 
        style: { 
          padding: '12px 16px',
          background: data.status === 'lipolysis' 
            ? 'linear-gradient(135deg, rgba(34,197,94,0.12), rgba(16,185,129,0.12))'
            : 'rgba(248, 250, 252, 0.8)',
          borderRadius: '12px',
          marginBottom: modifiers.length > 0 || data.hasOverlaps ? '12px' : '0'
        }
      },
        React.createElement('div', { 
          style: { 
            fontSize: '13px', 
            fontWeight: '600', 
            color: data.status === 'lipolysis' ? '#16a34a' : '#475569',
            marginBottom: '6px'
          }
        }, data.status === 'lipolysis' ? '🔥 Жиросжигание' : '💡 Сейчас'),
        React.createElement('div', { 
          style: { 
            fontSize: '14px', 
            color: '#334155',
            lineHeight: 1.5
          }
        }, 
          data.status === 'lipolysis' 
            ? 'Каждая минута без еды = сжигание жира' 
            : 'Инсулин высокий → жир запасается'
        ),
        // Подсказка
        React.createElement('div', { 
          style: { 
            marginTop: '8px',
            fontSize: '13px',
            color: '#64748b',
            display: 'flex',
            gap: '12px',
            flexWrap: 'wrap'
          }
        },
          React.createElement('span', null, '💧 Вода ок'),
          data.status !== 'lipolysis' && React.createElement('span', null, '🚫 Еда продлит волну')
        )
      ),
      
      // === Предупреждение о перекрытии ===
      data.hasOverlaps && React.createElement('div', { 
        style: { 
          padding: '12px 16px',
          background: 'rgba(239,68,68,0.08)',
          borderRadius: '12px',
          marginBottom: '12px',
          border: '1px solid rgba(239,68,68,0.2)'
        }
      },
        React.createElement('div', { 
          style: { fontSize: '13px', fontWeight: '600', color: '#dc2626' }
        }, '⚠️ Волны пересеклись'),
        React.createElement('div', { 
          style: { fontSize: '13px', color: '#64748b', marginTop: '4px' }
        }, `Совет: подожди ${Math.round(data.baseWaveHours * 60)} мин между приёмами`)
      ),
      
      // Блок модификаторов убран — формула теперь в деталях волны
      
      // === История волн ===
      renderWaveHistory(data)
    );
  };
  
  // Wrapper для вызова как функции (возвращает React element)
  const renderExpandedSection = (data) => {
    return React.createElement(ExpandedSectionComponent, { data, key: 'expanded-section' });
  };
  
  // === Hook для использования в компоненте ===
  const useInsulinWave = ({ meals, pIndex, getProductFromItem, baseWaveHours = 3, trainings = [], dayData = {} }) => {
    const [expanded, setExpanded] = React.useState(false);
    const [isShaking, setIsShaking] = React.useState(false);
    
    // Текущая минута для авто-обновления
    const [currentMinute, setCurrentMinute] = React.useState(() => {
      const now = new Date();
      return now.getHours() * 60 + now.getMinutes();
    });
    
    // Обновление каждую минуту
    React.useEffect(() => {
      const interval = setInterval(() => {
        const now = new Date();
        setCurrentMinute(now.getHours() * 60 + now.getMinutes());
      }, 60000);
      return () => clearInterval(interval);
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
  
  // ========================================================================
  // 🧬 METABOLIC FLEXIBILITY INDEX — v4.1.0
  // ========================================================================
  // Научное обоснование: Kelley & Mandarino 2000 (PMID: 10783862)
  // Метаболическая гибкость — способность переключаться между окислением
  // жиров и углеводов в зависимости от доступности субстратов
  // ========================================================================
  
  const METABOLIC_FLEXIBILITY_CONFIG = {
    // Факторы влияющие на гибкость
    factors: {
      // Тренировки улучшают гибкость (Goodpaster 2003)
      trainingFrequency: {
        weight: 0.25,
        tiers: [
          { min: 5, value: 1.0, label: 'Отличная база' },     // 5+ тренировок/неделю
          { min: 3, value: 0.75, label: 'Хорошая база' },     // 3-4/неделю
          { min: 1, value: 0.5, label: 'Минимальная база' },  // 1-2/неделю
          { min: 0, value: 0.25, label: 'Низкая база' }       // Нет тренировок
        ]
      },
      // Качество сна влияет на метаболизм (Spiegel 2005)
      sleepQuality: {
        weight: 0.20,
        tiers: [
          { min: 4, value: 1.0 },    // Отличный сон (4-5)
          { min: 3, value: 0.7 },    // Хороший (3)
          { min: 2, value: 0.4 },    // Плохой (2)
          { min: 0, value: 0.2 }     // Очень плохой (1)
        ]
      },
      // Стресс снижает гибкость (Kuo 2015)
      stressLevel: {
        weight: 0.15,
        inverted: true, // Меньше стресс = лучше
        tiers: [
          { max: 3, value: 1.0 },    // Низкий стресс
          { max: 5, value: 0.7 },    // Умеренный
          { max: 7, value: 0.4 },    // Высокий
          { max: 10, value: 0.2 }    // Очень высокий
        ]
      },
      // BMI влияет на инсулиновую чувствительность
      bmiScore: {
        weight: 0.20,
        tiers: [
          { range: [18.5, 24.9], value: 1.0 },   // Норма
          { range: [25, 29.9], value: 0.65 },    // Избыточный вес
          { range: [30, 34.9], value: 0.4 },     // Ожирение I
          { range: [0, 18.5], value: 0.7 },      // Недовес
          { range: [35, 100], value: 0.25 }      // Ожирение II+
        ]
      },
      // Вариативность питания
      dietVariety: {
        weight: 0.20,
        description: 'Разнообразие макросов за 7 дней'
      }
    },
    // Результирующие уровни
    levels: [
      { min: 0.8, id: 'excellent', name: 'Отличная', icon: '🌟', color: '#10b981' },
      { min: 0.6, id: 'good', name: 'Хорошая', icon: '✅', color: '#22c55e' },
      { min: 0.4, id: 'moderate', name: 'Умеренная', icon: '➖', color: '#eab308' },
      { min: 0.2, id: 'low', name: 'Низкая', icon: '⚠️', color: '#f97316' },
      { min: 0, id: 'poor', name: 'Плохая', icon: '❌', color: '#ef4444' }
    ]
  };
  
  /**
   * Расчёт индекса метаболической гибкости
   * @param {Object} options - параметры
   * @returns {Object} { score, level, factors, recommendations }
   */
  const calculateMetabolicFlexibility = ({ 
    recentDays = [], 
    profile = {},
    trainings7d = []
  }) => {
    const factorScores = {};
    const cfg = METABOLIC_FLEXIBILITY_CONFIG.factors;
    
    // 1. Training frequency (за 7 дней)
    const trainingCount = trainings7d.length || recentDays.filter(d => d.trainings?.length > 0).length;
    const trainingTier = cfg.trainingFrequency.tiers.find(t => trainingCount >= t.min) 
      || cfg.trainingFrequency.tiers[cfg.trainingFrequency.tiers.length - 1];
    factorScores.training = {
      value: trainingTier.value,
      weight: cfg.trainingFrequency.weight,
      count: trainingCount,
      label: trainingTier.label
    };
    
    // 2. Sleep quality (среднее за период)
    const sleepScores = recentDays.filter(d => d.sleepQuality > 0).map(d => d.sleepQuality);
    const avgSleep = sleepScores.length > 0 
      ? sleepScores.reduce((a, b) => a + b, 0) / sleepScores.length 
      : 3;
    const sleepTier = cfg.sleepQuality.tiers.find(t => avgSleep >= t.min);
    factorScores.sleep = {
      value: sleepTier?.value || 0.5,
      weight: cfg.sleepQuality.weight,
      avg: avgSleep
    };
    
    // 3. Stress level (среднее)
    const stressScores = recentDays.filter(d => d.stressAvg > 0).map(d => d.stressAvg);
    const avgStress = stressScores.length > 0
      ? stressScores.reduce((a, b) => a + b, 0) / stressScores.length
      : 5;
    const stressTier = cfg.stressLevel.tiers.find(t => avgStress <= t.max);
    factorScores.stress = {
      value: stressTier?.value || 0.5,
      weight: cfg.stressLevel.weight,
      avg: avgStress
    };
    
    // 4. BMI score
    const bmi = profile.weight && profile.height 
      ? profile.weight / Math.pow(profile.height / 100, 2)
      : 22;
    const bmiTier = cfg.bmiScore.tiers.find(t => bmi >= t.range[0] && bmi < t.range[1]);
    factorScores.bmi = {
      value: bmiTier?.value || 0.5,
      weight: cfg.bmiScore.weight,
      bmi: Math.round(bmi * 10) / 10
    };
    
    // 5. Diet variety (стандартное отклонение макросов)
    // Высокая вариативность = лучшая адаптация
    let varietyScore = 0.5;
    if (recentDays.length >= 3) {
      const carbPcts = recentDays.map(d => {
        const tot = (d.dayTot?.carbs || 0) + (d.dayTot?.prot || 0) + (d.dayTot?.fat || 0);
        return tot > 0 ? (d.dayTot?.carbs || 0) / tot : 0.5;
      });
      const mean = carbPcts.reduce((a, b) => a + b, 0) / carbPcts.length;
      const variance = carbPcts.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / carbPcts.length;
      const std = Math.sqrt(variance);
      // Умеренная вариативность (std 0.05-0.15) = хорошо
      varietyScore = std < 0.05 ? 0.4 : std < 0.1 ? 0.8 : std < 0.15 ? 1.0 : 0.6;
    }
    factorScores.variety = {
      value: varietyScore,
      weight: cfg.dietVariety.weight
    };
    
    // Итоговый score (взвешенное среднее)
    const totalWeight = Object.values(factorScores).reduce((sum, f) => sum + f.weight, 0);
    const score = Object.values(factorScores).reduce((sum, f) => sum + f.value * f.weight, 0) / totalWeight;
    
    // Определяем уровень
    const level = METABOLIC_FLEXIBILITY_CONFIG.levels.find(l => score >= l.min) 
      || METABOLIC_FLEXIBILITY_CONFIG.levels[METABOLIC_FLEXIBILITY_CONFIG.levels.length - 1];
    
    // Рекомендации
    const recommendations = [];
    if (factorScores.training.value < 0.6) {
      recommendations.push({ icon: '🏃', text: 'Добавь 1-2 тренировки в неделю для улучшения гибкости' });
    }
    if (factorScores.sleep.value < 0.6) {
      recommendations.push({ icon: '😴', text: 'Улучши качество сна — это критично для метаболизма' });
    }
    if (factorScores.stress.value < 0.6) {
      recommendations.push({ icon: '🧘', text: 'Снизь уровень стресса — кортизол блокирует гибкость' });
    }
    if (factorScores.variety.value < 0.6) {
      recommendations.push({ icon: '🥗', text: 'Добавь вариативности в питание (разные соотношения БЖУ)' });
    }
    
    return {
      score: Math.round(score * 100) / 100,
      level,
      factors: factorScores,
      recommendations,
      // Влияние на инсулиновую волну
      waveMultiplier: 0.85 + (1 - score) * 0.3, // 0.85-1.15
      description: `Метаболическая гибкость: ${level.name}`
    };
  };
  
  // ========================================================================
  // 🍽️ SATIETY MODEL — v4.1.0  
  // ========================================================================
  // Научное обоснование: 
  // - Holt Satiety Index 1995 (PMID: 7498104)
  // - Rolls Volumetrics 2000
  // - Blundell appetite cascade 1987
  // ========================================================================
  
  const SATIETY_MODEL_CONFIG = {
    // Базовые коэффициенты насыщения (на 100 ккал)
    macroFactors: {
      protein: 1.5,    // Белок самый сытный (термогенез + глюкагон)
      fiber: 1.4,      // Клетчатка (объём + замедление)
      complexCarbs: 0.8, // Сложные углеводы
      simpleCarbs: 0.3,  // Простые — быстрый голод
      fat: 0.7,        // Жиры — медленное насыщение
      water: 0.2       // Вода в еде увеличивает объём
    },
    // Модификаторы формы пищи
    foodFormFactors: {
      liquid: 0.5,     // Жидкое насыщает меньше
      soft: 0.8,       // Мягкое
      solid: 1.0,      // Твёрдое — максимум
      fibrous: 1.2     // Волокнистое — требует жевания
    },
    // Временное затухание насыщения (часы → множитель)
    decayCurve: {
      baseHours: 4,    // Базовая длительность насыщения
      halfLife: 2      // Период полураспада
    },
    // Уровни насыщения
    levels: [
      { min: 0.8, id: 'full', name: 'Сытость', icon: '😊', color: '#22c55e' },
      { min: 0.5, id: 'satisfied', name: 'Удовлетворён', icon: '🙂', color: '#84cc16' },
      { min: 0.3, id: 'neutral', name: 'Нейтрально', icon: '😐', color: '#eab308' },
      { min: 0.1, id: 'hungry', name: 'Голоден', icon: '😕', color: '#f97316' },
      { min: 0, id: 'starving', name: 'Очень голоден', icon: '😫', color: '#ef4444' }
    ]
  };
  
  /**
   * Расчёт уровня насыщения
   * @param {Object} mealData - данные приёма { kcal, prot, carbs, simple, fat, fiber }
   * @param {number} hoursSinceMeal - часов с приёма
   * @param {Object} options - дополнительные параметры
   * @returns {Object} { score, level, duration, nextHungerTime }
   */
  const calculateSatietyScore = (mealData, hoursSinceMeal = 0, options = {}) => {
    const cfg = SATIETY_MODEL_CONFIG;
    const { kcal = 0, prot = 0, carbs = 0, simple = 0, fat = 0, fiber = 0 } = mealData;
    
    if (kcal <= 0) {
      return {
        score: 0,
        level: cfg.levels[cfg.levels.length - 1],
        duration: 0,
        nextHungerTime: 'сейчас'
      };
    }
    
    // 1. Базовый индекс насыщения (на основе макросов)
    const complexCarbs = Math.max(0, carbs - simple);
    const proteinContribution = (prot * 4 / kcal) * cfg.macroFactors.protein;
    const fiberContribution = (fiber * 2 / kcal) * cfg.macroFactors.fiber;
    const complexCarbsContribution = (complexCarbs * 4 / kcal) * cfg.macroFactors.complexCarbs;
    const simpleCarbsContribution = (simple * 4 / kcal) * cfg.macroFactors.simpleCarbs;
    const fatContribution = (fat * 9 / kcal) * cfg.macroFactors.fat;
    
    // Сырой индекс (0-2+)
    const rawSatietyIndex = proteinContribution + fiberContribution + 
      complexCarbsContribution + simpleCarbsContribution + fatContribution;
    
    // 2. Модификатор объёма (больше ккал = дольше сытость, но с diminishing returns)
    const volumeMultiplier = Math.min(1.5, 0.5 + Math.log10(kcal / 100 + 1) * 0.5);
    
    // 3. Модификатор формы пищи
    const formMultiplier = options.foodForm 
      ? (cfg.foodFormFactors[options.foodForm] || 1.0)
      : 1.0;
    
    // 4. Расчёт длительности насыщения (часы)
    const baseDuration = cfg.decayCurve.baseHours * rawSatietyIndex * volumeMultiplier * formMultiplier;
    const durationHours = Math.min(8, Math.max(1, baseDuration));
    
    // 5. Текущий уровень с учётом времени
    const decayFactor = Math.exp(-hoursSinceMeal / cfg.decayCurve.halfLife);
    const currentScore = Math.min(1, rawSatietyIndex * volumeMultiplier * formMultiplier * decayFactor);
    
    // 6. Определяем уровень
    const level = cfg.levels.find(l => currentScore >= l.min) || cfg.levels[cfg.levels.length - 1];
    
    // 7. Время до голода
    const hoursUntilHungry = Math.max(0, durationHours - hoursSinceMeal);
    const nextHungerTime = hoursUntilHungry > 0
      ? `через ${Math.round(hoursUntilHungry * 60)} мин`
      : 'скоро';
    
    return {
      score: Math.round(currentScore * 100) / 100,
      rawIndex: Math.round(rawSatietyIndex * 100) / 100,
      level,
      duration: Math.round(durationHours * 10) / 10,
      hoursRemaining: Math.round(hoursUntilHungry * 10) / 10,
      nextHungerTime,
      breakdown: {
        protein: Math.round(proteinContribution * 100),
        fiber: Math.round(fiberContribution * 100),
        complexCarbs: Math.round(complexCarbsContribution * 100),
        simpleCarbs: Math.round(simpleCarbsContribution * 100),
        fat: Math.round(fatContribution * 100)
      }
    };
  };
  
  // ========================================================================
  // 📉 ADAPTIVE DEFICIT OPTIMIZER — v4.1.0
  // ========================================================================
  // Научное обоснование:
  // - Trexler 2014: Diet breaks improve adherence (PMID: 24864135)
  // - Byrne 2018: Intermittent energy restriction (PMID: 28925405)
  // - Dulloo 2015: Adaptive thermogenesis (PMID: 22535969)
  // ========================================================================
  
  const ADAPTIVE_DEFICIT_CONFIG = {
    // Минимальный калораж (защита метаболизма)
    minimumKcal: {
      female: 1200,
      male: 1500
    },
    // Диапазоны дефицита
    deficitTiers: [
      { pct: 10, label: 'Лёгкий', sustainable: true, weeklyLoss: '0.25-0.5 кг' },
      { pct: 20, label: 'Умеренный', sustainable: true, weeklyLoss: '0.5-0.75 кг' },
      { pct: 25, label: 'Агрессивный', sustainable: false, weeklyLoss: '0.75-1 кг', maxWeeks: 4 },
      { pct: 30, label: 'Экстремальный', sustainable: false, weeklyLoss: '1+ кг', maxWeeks: 2 }
    ],
    // Diet break (перерыв на поддержание)
    dietBreak: {
      afterWeeks: 4,        // После скольких недель дефицита
      durationDays: 7,      // Длительность перерыва
      kcalBoost: 0.15       // +15% к норме
    },
    // Refeed day (углеводная загрузка)
    refeedDay: {
      frequency: 7,         // Каждые N дней в дефиците
      carbBoost: 0.5,       // +50% углеводов
      kcalBoost: 0.2        // +20% калорий
    },
    // Адаптивный множитель (замедление метаболизма)
    adaptiveMultiplier: {
      perWeekInDeficit: 0.02,  // -2% в неделю
      maxReduction: 0.15       // Максимум -15%
    }
  };
  
  /**
   * Расчёт оптимального адаптивного дефицита
   * @param {Object} options - параметры
   * @returns {Object} { recommendedDeficit, adaptiveKcal, needsDietBreak, recommendations }
   */
  const calculateAdaptiveDeficit = ({
    tdee,
    targetDeficitPct = 15,
    weeksInDeficit = 0,
    gender = 'male',
    recentRatios = [],   // ratio за последние 7 дней
    hasRefeedThisWeek = false
  }) => {
    const cfg = ADAPTIVE_DEFICIT_CONFIG;
    
    // 1. Базовый дефицит
    const targetKcal = tdee * (1 - targetDeficitPct / 100);
    
    // 2. Адаптивное замедление метаболизма
    const adaptiveReduction = Math.min(
      cfg.adaptiveMultiplier.maxReduction,
      weeksInDeficit * cfg.adaptiveMultiplier.perWeekInDeficit
    );
    const adaptedTdee = tdee * (1 - adaptiveReduction);
    
    // 3. Пересчёт дефицита с учётом адаптации
    const effectiveDeficitPct = targetDeficitPct * (1 - adaptiveReduction);
    const adaptiveKcal = adaptedTdee * (1 - effectiveDeficitPct / 100);
    
    // 4. Проверка минимума
    const minKcal = cfg.minimumKcal[gender] || cfg.minimumKcal.male;
    const safeKcal = Math.max(minKcal, adaptiveKcal);
    
    // 5. Проверка необходимости diet break
    const needsDietBreak = weeksInDeficit >= cfg.dietBreak.afterWeeks;
    const dietBreakKcal = needsDietBreak ? tdee * (1 + cfg.dietBreak.kcalBoost) : null;
    
    // 6. Проверка необходимости refeed
    const avgRatio = recentRatios.length > 0
      ? recentRatios.reduce((a, b) => a + b, 0) / recentRatios.length
      : 1;
    const needsRefeed = !hasRefeedThisWeek && 
      recentRatios.length >= 5 && 
      avgRatio < 0.9 &&
      weeksInDeficit >= 1;
    
    // 7. Tier текущего дефицита
    const actualDeficitPct = Math.round((1 - safeKcal / tdee) * 100);
    const tier = cfg.deficitTiers.find(t => actualDeficitPct <= t.pct) || cfg.deficitTiers[cfg.deficitTiers.length - 1];
    
    // 8. Рекомендации
    const recommendations = [];
    
    if (needsDietBreak) {
      recommendations.push({
        priority: 'high',
        icon: '🛑',
        text: `Diet break рекомендован! ${cfg.dietBreak.durationDays} дней на поддержании (${Math.round(dietBreakKcal)} ккал)`
      });
    }
    
    if (needsRefeed) {
      recommendations.push({
        priority: 'medium',
        icon: '🍝',
        text: 'Refeed day поможет восстановить лептин и гликоген'
      });
    }
    
    if (adaptiveReduction > 0.05) {
      recommendations.push({
        priority: 'info',
        icon: '📉',
        text: `Метаболизм адаптировался на ${Math.round(adaptiveReduction * 100)}%`
      });
    }
    
    if (!tier.sustainable) {
      recommendations.push({
        priority: 'warning',
        icon: '⚠️',
        text: `${tier.label} дефицит — не более ${tier.maxWeeks} недель!`
      });
    }
    
    return {
      originalTdee: tdee,
      adaptedTdee: Math.round(adaptedTdee),
      recommendedKcal: Math.round(safeKcal),
      originalDeficitPct: targetDeficitPct,
      effectiveDeficitPct: Math.round(effectiveDeficitPct),
      actualDeficitPct,
      tier,
      adaptiveReduction: Math.round(adaptiveReduction * 100),
      weeksInDeficit,
      needsDietBreak,
      dietBreakKcal: dietBreakKcal ? Math.round(dietBreakKcal) : null,
      needsRefeed,
      minKcal,
      recommendations
    };
  };
  
  // ========================================================================
  // ⏰ MEAL TIMING OPTIMIZER — v4.1.0
  // ========================================================================
  // Научное обоснование:
  // - Jakubowicz 2013: Big breakfast improves weight loss (PMID: 23512957)
  // - Garaulet 2013: Late eating associated with weight gain (PMID: 23357955)
  // - Arble 2009: Circadian timing affects metabolism
  // ========================================================================
  
  const MEAL_TIMING_CONFIG = {
    // Оптимальные окна приёма пищи
    optimalWindows: {
      breakfast: { start: 7, end: 9, ideal: 8, importance: 'high' },
      lunch: { start: 12, end: 14, ideal: 13, importance: 'medium' },
      dinner: { start: 18, end: 20, ideal: 19, importance: 'high' }
    },
    // Минимальные интервалы между приёмами
    minimumGap: {
      hours: 3,          // Минимум 3 часа
      idealHours: 4      // Идеально 4 часа
    },
    // Калорийное распределение (% от нормы)
    calorieDistribution: {
      frontLoaded: { breakfast: 35, lunch: 40, dinner: 25 },  // Большой завтрак
      balanced: { breakfast: 25, lunch: 40, dinner: 35 },     // Сбалансированно
      backLoaded: { breakfast: 20, lunch: 35, dinner: 45 }    // Большой ужин (не рекомендуется)
    },
    // Штрафы за поздний ужин
    lateDinnerPenalty: {
      after21: 0.9,      // -10% эффективности
      after22: 0.8,      // -20%
      after23: 0.7       // -30%
    }
  };
  
  /**
   * Анализ и оптимизация тайминга приёмов пищи
   * @param {Array} meals - приёмы пищи с временем
   * @param {number} optimum - целевой калораж
   * @returns {Object} { score, analysis, recommendations }
   */
  const calculateMealTimingScore = (meals = [], optimum) => {
    const cfg = MEAL_TIMING_CONFIG;
    
    if (meals.length === 0) {
      return {
        score: 0,
        analysis: { mealsAnalyzed: 0 },
        recommendations: [{ icon: '🍽️', text: 'Добавь первый приём пищи' }]
      };
    }
    
    // Парсинг времени приёмов
    const parsedMeals = meals.map(m => {
      const [h, min] = (m.time || '12:00').split(':').map(Number);
      return { ...m, hour: h, minute: min, totalMinutes: h * 60 + min };
    }).sort((a, b) => a.totalMinutes - b.totalMinutes);
    
    let score = 100;
    const issues = [];
    const recommendations = [];
    
    // 1. Анализ первого приёма (завтрак)
    const firstMeal = parsedMeals[0];
    const breakfastWindow = cfg.optimalWindows.breakfast;
    
    if (firstMeal.hour < breakfastWindow.start) {
      // Слишком рано
      score -= 5;
      issues.push('Ранний завтрак');
    } else if (firstMeal.hour > breakfastWindow.end + 2) {
      // Пропущен завтрак (после 11:00)
      score -= 15;
      issues.push('Пропущен завтрак');
      recommendations.push({ 
        icon: '🌅', 
        text: 'Завтрак в 7-9 улучшает метаболизм на весь день' 
      });
    }
    
    // 2. Анализ последнего приёма (ужин)
    const lastMeal = parsedMeals[parsedMeals.length - 1];
    
    if (lastMeal.hour >= 23) {
      score -= 20;
      issues.push('Очень поздний ужин');
      recommendations.push({ 
        icon: '🌙', 
        text: 'Ужин после 23:00 нарушает циркадные ритмы' 
      });
    } else if (lastMeal.hour >= 22) {
      score -= 10;
      issues.push('Поздний ужин');
    } else if (lastMeal.hour >= 21) {
      score -= 5;
      issues.push('Ужин после 21:00');
    }
    
    // 3. Анализ интервалов между приёмами
    const gaps = [];
    for (let i = 1; i < parsedMeals.length; i++) {
      const gap = (parsedMeals[i].totalMinutes - parsedMeals[i-1].totalMinutes) / 60;
      gaps.push(gap);
      
      if (gap < cfg.minimumGap.hours) {
        score -= 10;
        issues.push(`Слишком короткий интервал (${Math.round(gap * 60)} мин)`);
      }
    }
    
    // 4. Анализ калорийного распределения
    const totalKcal = parsedMeals.reduce((sum, m) => sum + (m.kcal || 0), 0);
    if (totalKcal > 0 && parsedMeals.length >= 2) {
      const morningKcal = parsedMeals.filter(m => m.hour < 12).reduce((s, m) => s + (m.kcal || 0), 0);
      const eveningKcal = parsedMeals.filter(m => m.hour >= 18).reduce((s, m) => s + (m.kcal || 0), 0);
      
      const morningPct = morningKcal / totalKcal;
      const eveningPct = eveningKcal / totalKcal;
      
      // Штраф за back-loaded (много калорий вечером)
      if (eveningPct > 0.5) {
        score -= 10;
        issues.push('Перегружен вечер');
        recommendations.push({
          icon: '⚖️',
          text: 'Перенеси часть калорий на утро/обед'
        });
      }
      
      // Бонус за front-loaded
      if (morningPct >= 0.3) {
        score += 5;
      }
    }
    
    // 5. Бонус за регулярность
    if (parsedMeals.length >= 3) {
      const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      const gapVariance = gaps.reduce((a, b) => a + Math.pow(b - avgGap, 2), 0) / gaps.length;
      
      if (gapVariance < 1) {
        score += 5; // Регулярные интервалы
      }
    }
    
    // Нормализация score
    score = Math.max(0, Math.min(100, score));
    
    // Уровень
    const level = score >= 80 ? { id: 'excellent', name: 'Отлично', icon: '🌟', color: '#22c55e' }
      : score >= 60 ? { id: 'good', name: 'Хорошо', icon: '✅', color: '#84cc16' }
      : score >= 40 ? { id: 'fair', name: 'Средне', icon: '➖', color: '#eab308' }
      : { id: 'poor', name: 'Плохо', icon: '⚠️', color: '#f97316' };
    
    // Оптимальное следующее окно
    const now = new Date();
    const currentHour = now.getHours();
    let nextOptimalWindow = null;
    
    if (currentHour < 9) nextOptimalWindow = cfg.optimalWindows.breakfast;
    else if (currentHour < 13) nextOptimalWindow = cfg.optimalWindows.lunch;
    else if (currentHour < 19) nextOptimalWindow = cfg.optimalWindows.dinner;
    
    return {
      score,
      level,
      analysis: {
        mealsAnalyzed: parsedMeals.length,
        firstMealHour: firstMeal.hour,
        lastMealHour: lastMeal.hour,
        avgGapHours: gaps.length > 0 ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length * 10) / 10 : null,
        issues
      },
      nextOptimalWindow,
      recommendations
    };
  };
  
  // === ЭКСПОРТ ===
  HEYS.InsulinWave = {
    // Главная функция расчёта
    calculate: calculateInsulinWaveData,
    
    // Hook
    useInsulinWave,
    
    // UI компоненты
    renderProgressBar,
    renderWaveHistory,
    renderExpandedSection,
    MealWaveExpandSection,
    
    // Утилиты
    utils,
    calculateMealNutrients,
    calculateMultiplier,
    calculateWorkoutBonus,
    calculateCircadianMultiplier,
    
    // 🆕 v1.4: Новые детекторы факторов
    isLiquidFood,
    getInsulinogenicBonus,
    isSpicyFood,
    getAlcoholBonus,
    hasCaffeine,
    calculateStressBonus,
    calculateSleepBonus,
    calculateFastingBonus,
    
    // 🆕 v1.5: Физическая активность
    calculatePostprandialExerciseBonus,
    calculateNEATBonus,
    calculateStepsBonus,
    
    // 🆕 v2.0: Новые факторы из научного аудита
    calculateSleepQualityBonus,
    calculateHydrationBonus,
    calculateAgeBonus,
    calculateBMIBonus,
    getGenderBonus,
    calculateTransFatBonus,
    
    // 🆕 v3.0.0: Продвинутые расчёты
    calculateContinuousGLMultiplier,
    calculatePersonalBaselineWave,
    calculateMealStackingBonus,
    calculateWavePhases,
    calculateInsulinIndex,
    getWaveCalculationDebug,
    
    // 🏆 Рекорды и streak
    getLipolysisRecord,
    updateLipolysisRecord,
    saveDayLipolysis,
    calculateLipolysisStreak,
    calculateLipolysisKcal,
    
    // Константы
    GI_CATEGORIES,
    STATUS_CONFIG,
    PROTEIN_BONUS,
    FIBER_BONUS,
    FAT_BONUS,
    LIQUID_FOOD,
    INSULINOGENIC_BONUS,
    GL_CATEGORIES,
    WORKOUT_BONUS,
    CIRCADIAN_MULTIPLIERS,
    FASTING_BONUS,
    SPICY_FOOD,
    ALCOHOL_BONUS,
    CAFFEINE_BONUS,
    STRESS_BONUS,
    SLEEP_BONUS,
    POSTPRANDIAL_EXERCISE,
    NEAT_BONUS,
    STEPS_BONUS,
    MIN_LIPOLYSIS_FOR_STREAK,
    // 🆕 v2.0: Новые константы
    SLEEP_QUALITY_BONUS,
    HYDRATION_BONUS,
    AGE_BONUS,
    BMI_BONUS,
    GENDER_BONUS,
    TRANS_FAT_BONUS,
    // 🆕 v3.0.0: Продвинутые константы
    GL_CONTINUOUS,
    PERSONAL_BASELINE,
    MEAL_STACKING,
    WAVE_PHASES,
    INSULIN_INDEX_FACTORS,
    
    // 🆕 v3.2.0: Food form и resistant starch
    FOOD_FORM_BONUS,
    RESISTANT_STARCH_BONUS,
    LIPOLYSIS_THRESHOLDS,
    REACTIVE_HYPOGLYCEMIA,
    getFoodForm,
    hasResistantStarch,
    estimateInsulinLevel,
    calculateHypoglycemiaRisk,
    
    // 🆕 v3.2.1: Добавки, холод, аутофагия
    SUPPLEMENTS_BONUS,
    COLD_EXPOSURE_BONUS,
    AUTOPHAGY_TIMER,
    getAutophagyPhase,
    getColdExposureBonus,
    getSupplementsBonus,
    
    // 🆕 v3.4.0: Контекст тренировки
    TRAINING_CONTEXT,
    calculateActivityContext,
    
    // 🆕 v3.5.3: UI компоненты
    renderActivityContextBadge,
    
    // 🆕 v3.6.0: Next-Day Training Effect (NDTE)
    NDTE,
    calculateNDTE,
    calculateNDTEBMIMultiplier,
    calculateNDTEDecay,
    getPreviousDayTrainings,
    calculateBMI,
    getBMICategory,
    
    // 🆕 v3.7.0: NDTE Badge UI
    renderNDTEBadge,
    
    // 🆕 v3.7.3: Валидация тренировок
    isValidTraining,
    
    // 🆕 v3.8.0: Научные факторы
    CIRCADIAN_CONFIG,
    FOOD_TEMPERATURE_BONUS,
    LARGE_PORTION_BONUS,
    detectFoodTemperature,
    calculateLargePortionBonus,
    getHypoglycemiaWarning,
    getInsulinIndexWaveModifier,
    
    // 🆕 v4.0.0: IR Score — объединённый показатель инсулинорезистентности
    IR_SCORE_CONFIG,
    calculateIRScore,
    
    // 🆕 v4.0.0: Белок animal/plant (×1.8 vs ×1.3)
    PROTEIN_BONUS_V2,
    detectProteinType,
    // calculateProteinTypeBonus, // 🚧 TODO: не реализована
    
    // 🆕 v4.0.0: Multi-component Gaussian
    // GAUSSIAN_COMPONENTS, // 🚧 TODO: не реализована
    // calculateGaussianCurve, // 🚧 TODO: не реализована
    // analyzeWaveComponents, // 🚧 TODO: не реализована
    generateWaveCurve,
    
    // 🆕 v4.0.0: AUC Calculation
    AUC_CONFIG,
    calculateTrapezoidalAUC,
    calculateIncrementalAUC,
    calculateFullAUC,
    
    // 🆕 v4.0.0: InsulinPredictor
    INSULIN_PREDICTOR_CONFIG,
    getInsulinLevelAtTime,
    predictInsulinResponse,
    generatePredictionSummary,
    
    // 🆕 v4.0.0: Wave Scoring V2
    WAVE_SCORING_V2,
    calculateWaveScore,
    scorePeakHeight,
    scoreDuration,
    scoreWaveShape,
    scoreAUC,
    scoreContext,
    
    // 🆕 v4.1.0: Metabolic Flexibility Index (Kelley & Mandarino 2000)
    METABOLIC_FLEXIBILITY_CONFIG,
    calculateMetabolicFlexibility,
    
    // 🆕 v4.1.0: Satiety Model (Holt 1995, Rolls 2000, Blundell 1987)
    SATIETY_MODEL_CONFIG,
    calculateSatietyScore,
    
    // 🆕 v4.1.0: Adaptive Deficit Optimizer (Trexler 2014, Byrne 2018, Dulloo 2015)
    ADAPTIVE_DEFICIT_CONFIG,
    calculateAdaptiveDeficit,
    
    // 🆕 v4.1.0: Meal Timing Optimizer (Jakubowicz 2013, Garaulet 2013, Arble 2009)
    MEAL_TIMING_CONFIG,
    calculateMealTimingScore,
    
    // Версия
    VERSION: '4.1.0'
  };
  
  // ============================================================================
  // 🆕 МИГРАЦИЯ И СОВМЕСТИМОСТЬ (v4.0.0)
  // ============================================================================
  // Утилиты для миграции с v3.x на v4.x и поддержки обратной совместимости
  // ============================================================================
  
  /**
   * 🆕 Миграция данных волны с v3 на v4 формат
   * @param {Object} v3Wave - данные волны в формате v3
   * @returns {Object} данные волны в формате v4
   */
  HEYS.InsulinWave.migrateWaveData = function(v3Wave) {
    if (!v3Wave) return null;
    
    // Проверяем, это уже v4?
    if (v3Wave._version === '4.0.0' || v3Wave.gaussian) {
      return v3Wave;
    }
    
    // Миграция v3 → v4
    const v4Wave = {
      ...v3Wave,
      _version: '4.0.0',
      _migratedFrom: v3Wave._version || '3.x',
      
      // Добавляем новые поля с дефолтными значениями
      irScore: null,           // Рассчитывается отдельно
      gaussian: null,          // Требуется пересчёт
      auc: null,               // Требуется пересчёт
      predictions: null,       // Требуется пересчёт
      waveScore: null,         // Требуется пересчёт
      
      // Совместимость полей
      // v3 использовал multiplier, v4 использует totalMultiplier
      totalMultiplier: v3Wave.totalMultiplier || v3Wave.multiplier || 1,
      
      // v3 mealMultiplier → v4 foodMultiplier
      foodMultiplier: v3Wave.foodMultiplier || v3Wave.mealMultiplier || 1,
      
      // v3 не имел proteinType
      proteinType: v3Wave.proteinType || 'mixed'
    };
    
    return v4Wave;
  };

  /**
   * 🆕 Обновление существующей волны новыми v4 полями
   * @param {Object} wave - волна (v3 или v4)
   * @param {Object} mealData - данные приёма пищи
   * @returns {Object} полностью обновлённая волна v4
   */
  HEYS.InsulinWave.enrichWithV4Features = function(wave, mealData = {}) {
    const migrated = HEYS.InsulinWave.migrateWaveData(wave);
    if (!migrated) return null;
    
    // Рассчитываем IR Score если есть исторические данные
    if (mealData.historicalDays && !migrated.irScore) {
      try {
        migrated.irScore = calculateIRScore({
          recentDays: mealData.historicalDays,
          profile: mealData.profile
        });
      } catch (e) {
        migrated.irScore = null;
      }
    }
    
    // Рассчитываем Gaussian если есть нутриенты
    if (mealData.nutrients && !migrated.gaussian) {
      try {
        const curve = generateWaveCurve({
          nutrients: mealData.nutrients,
          waveMinutes: migrated.waveMinutes || 180
        });
        migrated.gaussian = curve.gaussian;
        migrated.curve = curve.curve;
      } catch (e) {
        // Оставляем как есть
      }
    }
    
    // Рассчитываем AUC если есть кривая
    if (migrated.curve && !migrated.auc) {
      try {
        migrated.auc = calculateFullAUC(migrated.curve);
      } catch (e) {
        // Оставляем как есть
      }
    }
    
    // Рассчитываем предсказания
    if (migrated.curve && !migrated.predictions) {
      try {
        migrated.predictions = predictInsulinResponse(
          migrated.curve, 
          migrated.waveMinutes || 180
        );
      } catch (e) {
        // Оставляем как есть
      }
    }
    
    // Рассчитываем оценку волны
    if (!migrated.waveScore) {
      try {
        migrated.waveScore = calculateWaveScore(migrated, mealData.context || {});
      } catch (e) {
        // Оставляем как есть
      }
    }
    
    return migrated;
  };

  /**
   * 🆕 Проверка версии данных волны
   * @param {Object} wave - данные волны
   * @returns {Object} { version, isV4, needsMigration }
   */
  HEYS.InsulinWave.checkVersion = function(wave) {
    if (!wave) {
      return { version: null, isV4: false, needsMigration: false };
    }
    
    const version = wave._version || '3.x';
    const isV4 = version.startsWith('4.');
    const needsMigration = !isV4;
    
    return { version, isV4, needsMigration };
  };

  /**
   * 🆕 Экспорт данных волны в JSON (с полной v4 информацией)
   * @param {Object} wave - данные волны
   * @returns {string} JSON строка
   */
  HEYS.InsulinWave.exportWave = function(wave) {
    const enriched = HEYS.InsulinWave.enrichWithV4Features(wave);
    return JSON.stringify(enriched, null, 2);
  };

  /**
   * 🆕 Импорт данных волны из JSON
   * @param {string} json - JSON строка
   * @returns {Object} данные волны v4
   */
  HEYS.InsulinWave.importWave = function(json) {
    try {
      const parsed = JSON.parse(json);
      return HEYS.InsulinWave.migrateWaveData(parsed);
    } catch (e) {
      console.error('[InsulinWave] Import error:', e);
      return null;
    }
  };

  // Алиас
  HEYS.IW = HEYS.InsulinWave;
  
  // Verbose init log removed
  
})(typeof window !== 'undefined' ? window : global);
