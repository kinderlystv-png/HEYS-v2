// heys_iw_constants.js — Insulin Wave Constants Module
// Version: 1.0.0 | Date: 2026-01-11
//
// PURPOSE: All configuration constants and their helper functions

(function(global) {
  'use strict';
  
  const IW = global.HEYS?.InsulinWave;
  const I = IW?.__internals;
  
  if (!I) {
    console.error('[IW constants] Shim required');
    return;
  }
  
  if (!I._loaded.shim) {
    console.error('[IW constants] Shim must be loaded first');
    return;
  }
  
  // === CONSTANTS AND HELPER FUNCTIONS ===
  
  I.GI_CATEGORIES = {
    low: { min: 0, max: 35, multiplier: 0.85, color: '#22c55e', text: 'Низкий ГИ', desc: 'короткая волна' },
    medium: { min: 36, max: 55, multiplier: 1.0, color: '#eab308', text: 'Средний ГИ', desc: 'нормальная' },
    high: { min: 56, max: 70, multiplier: 1.1, color: '#f97316', text: 'Высокий ГИ', desc: 'длиннее' },
    veryHigh: { min: 71, max: 999, multiplier: 1.2, color: '#ef4444', text: 'Очень высокий', desc: 'долгая волна' }
  };
  
  I.STATUS_CONFIG = {
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
  I.PROTEIN_BONUS = {
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
  I.PROTEIN_BONUS_V2 = {
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
  I.detectProteinType = (product) => {
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
  I.calculateProteinBonusV2 = (proteinGrams, proteinType = 'mixed') => {
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
  I.WAVE_SHAPE_V2 = {
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
  I.gaussianComponent = (t, peak, sigma, amplitude) => {
    return amplitude * Math.exp(-Math.pow(t - peak, 2) / (2 * sigma * sigma));
  };

  /**
   * 🆕 Расчёт параметров компонентов на основе состава приёма
   * @param {Object} nutrients - { carbs, simple, complex, protein, fat, fiber, gi }
   * @param {Object} context - { isLiquid, irScore, hasAlcohol }
   * @returns {Object} модифицированные параметры компонентов
   */
  I.calculateComponentParams = (nutrients, context = {}) => {
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
  I.generateWaveCurve = (waveMinutes, nutrients, context = {}) => {
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
  I.AUC_CONFIG = {
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
  I.calculateTrapezoidalAUC = (curve, startT = 0, endT = 1) => {
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
  I.calculateIncrementalAUC = (curve, baseline = 0) => {
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
  I.calculateFullAUC = (curve, options = {}) => {
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
  I.INSULIN_PREDICTOR_CONFIG = {
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
  I.getInsulinLevelAtTime = (curve, minutes) => {
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
  I.predictInsulinResponse = (curve, waveMinutes) => {
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
  I.generatePredictionSummary = (predictions, safeToEatAt, fatBurningAt) => {
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
  I.WAVE_SCORING_V2 = {
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
  I.scorePeakHeight = (peakValue) => {
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
  I.scoreDuration = (minutes) => {
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
  I.scoreWaveShape = (shape, fastContribution = 0.5) => {
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
  I.scoreAUC = (normalizedAUC) => {
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
  I.scoreContext = (context = {}) => {
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
  I.calculateWaveScore = (waveData, context = {}) => {
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
  I.FIBER_BONUS = {
    veryHigh: { threshold: 15, bonus: -0.20 }, // 15+ г клетчатки → -20% волна
    high: { threshold: 10, bonus: -0.15 },     // 10-15 г → -15%
    medium: { threshold: 5, bonus: -0.08 }     // 5-10 г → -8%
  };
  
  // 🧈 FAT SLOWDOWN — жиры замедляют опорожнение желудка (gastric emptying)
  // Исследования: Liddle et al., 1991 — пищеварение замедляется
  // НО: эффект на ИНСУЛИН меньше чем на пищеварение!
  // 🔬 v3.7.5: Калибровка — снижены бонусы (реальный эффект ~10-15%, не 25%)
  // Жиры СГЛАЖИВАЮТ пик, но не так сильно удлиняют волну
  I.FAT_BONUS = {
    high: { threshold: 25, bonus: 0.15 },    // 25+ г жира → +15% к длине волны (было +25%)
    medium: { threshold: 15, bonus: 0.10 },  // 15+ г жира → +10% к длине волны (было +15%)
    low: { threshold: 8, bonus: 0.05 }       // 8+ г жира → +5% (было +8%)
  };
  
  // 🥤 LIQUID FOOD — жидкая пища усваивается БЫСТРЕЕ
  // 🔬 НАУЧНЫЙ АУДИТ 2025-12-10 (ChatGPT Research):
  // 'Жидкие калории (сок, смузи) дают более быстрый и ВЫСОКИЙ пик (+30-50%)'
  // Но общая длительность волны КОРОЧЕ (нет механического переваривания)
  // Peak higher but duration shorter = компромисс
  I.LIQUID_FOOD = {
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
  I.INSULINOGENIC_BONUS = {
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
  I.GL_CATEGORIES = {
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
  I.GL_CONTINUOUS = {
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
  I.PERSONAL_BASELINE = {
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
  I.MEAL_STACKING = {
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
  I.WAVE_PHASES = {
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
  I.INSULIN_INDEX_FACTORS = {
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
  I.WORKOUT_BONUS = {
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
  I.POSTPRANDIAL_EXERCISE = {
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
  I.NEAT_BONUS = {
    high: { threshold: 60, bonus: -0.10 },    // 60+ мин → волна на 10% короче
    medium: { threshold: 30, bonus: -0.05 },  // 30+ мин → волна на 5% короче
    low: { threshold: 15, bonus: -0.02 }      // 15+ мин → минимальный эффект
  };

  // 🚶 STEPS — шаги тоже влияют на метаболизм глюкозы
  I.STEPS_BONUS = {
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
  I.CIRCADIAN_CONFIG = {
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
  I.CIRCADIAN_MULTIPLIERS = {
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
  I.FASTING_BONUS = {
    // Часы голодания → бонус к длине волны (отрицательный = короче)
    long: { threshold: 16, bonus: -0.15 },   // 16+ часов = −15% волна (быстрее усвоение)
    medium: { threshold: 12, bonus: -0.10 }, // 12+ часов = −10%
    short: { threshold: 8, bonus: -0.05 }    // 8+ часов = −5% (минимальный эффект)
  };

  // 🌶️ SPICY FOOD — острая пища ускоряет метаболизм через термогенез
  // Капсаицин увеличивает расход энергии, но эффект умеренный (Ludy & Mattes, 2011)
  // Реальный эффект ~3-5%, не 8%
  I.SPICY_FOOD = {
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
  I.ALCOHOL_BONUS = {
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
  I.ALCOHOL_MATCH = {
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
  I.CAFFEINE_BONUS = {
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
  I.STRESS_BONUS = {
    high: { threshold: 7, bonus: 0.15 },    // Стресс 7-10 → +15%
    medium: { threshold: 5, bonus: 0.08 },  // Стресс 5-6 → +8%
    low: { threshold: 3, bonus: 0.00 }      // Стресс 1-4 → нет эффекта
  };

  // 😴 SLEEP DEPRIVATION — недосып повышает инсулинорезистентность
  // Даже одна ночь плохого сна увеличивает инсулинорезистентность на 20-30%
  I.SLEEP_BONUS = {
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
  I.SLEEP_QUALITY_BONUS = {
    poor: { maxQuality: 4, bonus: 0.08 },      // Качество 1-4 → +8% (было +12%)
    mediocre: { maxQuality: 6, bonus: 0.04 },  // Качество 5-6 → +4% (было +6%)
    good: { maxQuality: 10, bonus: 0.00 }      // Качество 7-10 → нет эффекта
  };

  // 💧 HYDRATION — дегидратация ухудшает метаболизм глюкозы
  // Carroll et al. (2016): дегидратация повышает кортизол и глюкозу
  // 🔬 v3.7.4: Скорректировано — эффект дегидратации на инсулин ~5-8%, не 12%
  // Норма: ~35 мл/кг веса в день (для 70кг = 2450мл)
  I.HYDRATION_BONUS = {
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
  I.AGE_BONUS = {
    senior: { minAge: 70, bonus: 0.40 },    // 70+ лет → +40% (почти ×1.5)
    elderly: { minAge: 60, bonus: 0.25 },   // 60-69 → +25%
    middle: { minAge: 45, bonus: 0.12 },    // 45-59 → +12%
    adult: { minAge: 30, bonus: 0.06 },     // 30-44 → +6%
    young: { minAge: 0, bonus: 0.00 }       // <30 → нет эффекта
  };

  // 🏋️ BMI — избыточный вес снижает инсулиновую чувствительность
  // Kahn & Flier (2000): каждые +5 единиц BMI = -30% чувствительности
  I.BMI_BONUS = {
    obese: { minBMI: 30, bonus: 0.20 },     // Ожирение (BMI 30+) → +20%
    overweight: { minBMI: 25, bonus: 0.10 }, // Избыточный вес (25-30) → +10%
    normal: { minBMI: 0, bonus: 0.00 }      // Норма (<25) → нет эффекта
  };

  // 🚺🚹 GENDER — женщины имеют лучшую инсулиновую чувствительность
  // Nuutila et al. (1995): женщины ~15% чувствительнее мужчин
  I.GENDER_BONUS = {
    male: 0.05,    // Мужчины → +5% к волне
    female: -0.05, // Женщины → -5% к волне
    other: 0.00    // Другое → нет эффекта
  };

  // 🍟 TRANS FATS — транс-жиры ухудшают инсулиновую чувствительность
  // Salmerón et al. (2001): транс-жиры = +39% риска диабета
  I.TRANS_FAT_BONUS = {
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
  I.MEAL_ORDER_BONUS = {
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
  I.FOOD_FORM_BONUS = {
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
  I.RESISTANT_STARCH_BONUS = {
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
  I.FOOD_TEMPERATURE_BONUS = {
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
  I.LARGE_PORTION_BONUS = {
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
  I.LIPOLYSIS_THRESHOLDS = {
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
  I.REACTIVE_HYPOGLYCEMIA = {
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

  I.NDTE = {
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

  I.TRAINING_CONTEXT = {
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
  I.IR_SCORE_CONFIG = {
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
  I.calculateIRScore = (profile = {}, dayData = {}) => {
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
  I.isValidTraining = (t) => {
    if (!t) return false;
    // Есть время — валидна
    if (t.time && t.time !== '') return true;
    // Есть хоть одна зона > 0 — валидна
    const zones = t.z || [];
    return zones.some(z => +z > 0);
  };
  
  I.calculateActivityContext = (params) => {
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
  I.estimateInsulinLevel = (progress) => {
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
  I.calculateHypoglycemiaRisk = (meal, pIndex, getProductFromItem) => {
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
  I.SUPPLEMENTS_BONUS = {
    vinegar: { bonus: -0.20, desc: 'Уксус → -20% волна' },     // Яблочный/винный уксус
    cinnamon: { bonus: -0.10, desc: 'Корица → -10% волна' },   // 1-6г корицы
    berberine: { bonus: -0.15, desc: 'Берберин → -15% волна' } // 500-1500мг берберина
  };

  // 🧊 COLD EXPOSURE — холодовое воздействие активирует бурый жир
  // 🔬 НАУЧНЫЙ АУДИТ 2025-12-10:
  // Van Marken Lichtenbelt 2009: холод +43% чувствительность к инсулину
  // Hanssen 2015: 10 дней холода (15°C) улучшает GLUT4
  // Механизм: активация BAT → повышенный клиренс глюкозы
  I.COLD_EXPOSURE_BONUS = {
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
  I.AUTOPHAGY_TIMER = {
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
  I.getAutophagyPhase = (fastingHours) => {
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
  I.getColdExposureBonus = (day) => {
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
  I.getSupplementsBonus = (meal) => {
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

  I.GAP_HISTORY_KEY = 'heys_meal_gaps_history';
  I.GAP_HISTORY_DAYS = 14;
  
  // 🏆 LIPOLYSIS RECORDS & STREAKS
  I.LIPOLYSIS_RECORD_KEY = 'heys_lipolysis_record';
  I.LIPOLYSIS_STREAK_KEY = 'heys_lipolysis_streak';
  I.LIPOLYSIS_HISTORY_KEY = 'heys_lipolysis_history';
  I.MIN_LIPOLYSIS_FOR_STREAK = 4 * 60; // 4 часа минимум для streak
  I.KCAL_PER_MIN_BASE = 1.0; // ~1 ккал/мин базовый расход в покое
  
  // ═══════════════════════════════════════════════════════════════════════════
  // 🔧 PR-24 FIX: Добавлены отсутствующие функции (27 шт)
  // ═══════════════════════════════════════════════════════════════════════════

  // === УТИЛИТЫ ===
  
  I.utils = {
    // Время в минуты с полуночи (поддерживает 24:xx, 25:xx формат)
    timeToMinutes: (timeStr) => {
      if (!timeStr) return 0;
      const [h, m] = timeStr.split(':').map(Number);
      return (h || 0) * 60 + (m || 0);
    },
    
    // 🆕 v3.7.7: Расчёт ккал тренировки через MET-значения зон пульса
    calculateTrainingKcal: (training, weight = 70) => {
      if (!training || !training.z) return 0;
      const zones = training.z || [0, 0, 0, 0];
      const totalMinutes = zones.reduce((a, b) => a + (+b || 0), 0);
      if (totalMinutes === 0) return 0;
      
      let mets = [2.5, 6, 8, 10];
      try {
        const hrZones = (typeof lsGet === 'function') ? lsGet('heys_hr_zones', []) : [];
        if (hrZones.length >= 4) {
          mets = [2.5, 6, 8, 10].map((def, i) => +hrZones[i]?.MET || def);
        }
      } catch (e) { /* fallback to defaults */ }
      
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
    
    normalizeTimeForDisplay: (timeStr) => {
      if (!timeStr) return '';
      const [h, m] = timeStr.split(':').map(Number);
      if (isNaN(h)) return timeStr;
      const normalH = h % 24;
      return String(normalH).padStart(2, '0') + ':' + String(m || 0).padStart(2, '0');
    },
    
    formatDuration: (minutes) => {
      if (minutes <= 0) return '0 мин';
      const h = Math.floor(minutes / 60);
      const m = Math.round(minutes % 60);
      if (h === 0) return `${m} мин`;
      if (m === 0) return `${h}ч`;
      return `${h}ч ${m}м`;
    },
    
    getGICategory: (gi) => {
      if (gi <= 35) return I.GI_CATEGORIES.low;
      if (gi <= 55) return I.GI_CATEGORIES.medium;
      if (gi <= 70) return I.GI_CATEGORIES.high;
      return I.GI_CATEGORIES.veryHigh;
    },
    
    isNightTime: (hour) => hour >= 22 || hour < 6,
    
    getDateKey: (date = new Date()) => date.toISOString().slice(0, 10),
    
    getNextMealSuggestion: (hour) => {
      if (hour >= 22 || hour < 6) return null;
      if (hour < 10) return { type: 'breakfast', icon: '🍳', name: 'Завтрак' };
      if (hour < 12) return { type: 'snack', icon: '🍎', name: 'Перекус' };
      if (hour < 14) return { type: 'lunch', icon: '🍲', name: 'Обед' };
      if (hour < 17) return { type: 'snack', icon: '🥜', name: 'Перекус' };
      if (hour < 20) return { type: 'dinner', icon: '🍽️', name: 'Ужин' };
      return { type: 'light', icon: '🥛', name: 'Лёгкий перекус' };
    },
    
    normalizeToHeysDay: (timeMin) => {
      const HEYS_DAY_START = 3 * 60;
      const totalMinutes = timeMin % (24 * 60);
      if (totalMinutes >= HEYS_DAY_START) {
        return totalMinutes - HEYS_DAY_START;
      }
      return totalMinutes + (24 * 60 - HEYS_DAY_START);
    }
  };

  // === ДЕТЕКТОРЫ ПИЩИ ===
  
  I.isLiquidFood = (name = '') => {
    const n = name.toLowerCase();
    return /молоко|кефир|йогурт|ряженка|смузи|сок|коктейль|бульон|суп-пюре|протеин|shake|milk/i.test(n);
  };

  I.isSpicyFood = (name = '') => {
    const n = name.toLowerCase();
    return /перец|чили|острый|карри|табаско|халапеньо|wasabi|васаби|sriracha|сальса|горчиц|хрен|pepper|spicy/i.test(n);
  };

  I.hasResistantStarch = (name = '') => {
    const n = name.toLowerCase();
    return /охлажд|холодн.*карто|холодн.*рис|салат.*карто|банан.*зелён|cold.*potato|cold.*rice/i.test(n);
  };

  I.hasCaffeine = (name = '') => {
    const n = name.toLowerCase();
    return /кофе|эспрессо|капучино|латте|американо|чай|матча|энергет|coffee|espresso|tea|energy/i.test(n);
  };

  // === БОНУСЫ И МНОЖИТЕЛИ ===

  I.getInsulinogenicBonus = (name = '') => {
    const n = name.toLowerCase();
    
    // Жидкие молочные: +15% (Holt 1997 II молока ≈ 98)
    if (/молоко|кефир|ряженка|простокваш|айран|milk/i.test(n)) {
      return { bonus: 0.15, type: 'liquid_dairy' };
    }
    // Мягкие молочные: +10%
    if (/творог|йогурт|сметан|cottage|yogurt/i.test(n)) {
      return { bonus: 0.10, type: 'soft_dairy' };
    }
    // Твёрдые молочные: +5%
    if (/сыр|cheese/i.test(n)) {
      return { bonus: 0.05, type: 'hard_dairy' };
    }
    // Чистый белок: +8%
    if (/протеин|whey|isolate|казеин|casein/i.test(n)) {
      return { bonus: 0.08, type: 'pure_protein' };
    }
    
    return { bonus: 0, type: null };
  };

  I.getFoodForm = (items = [], getProductFromItem) => {
    if (!items || items.length === 0) {
      return { form: 'solid', multiplier: 1.0, desc: null };
    }
    
    let liquidGrams = 0;
    let totalGrams = 0;
    
    for (const item of items) {
      const prod = getProductFromItem ? getProductFromItem(item) : item;
      const name = prod?.name || item?.name || '';
      const grams = item.grams || 100;
      totalGrams += grams;
      
      if (I.isLiquidFood(name)) {
        liquidGrams += grams;
      }
    }
    
    const liquidRatio = totalGrams > 0 ? liquidGrams / totalGrams : 0;
    
    if (liquidRatio > 0.7) {
      return { form: 'liquid', multiplier: I.FOOD_FORM_BONUS.liquid.multiplier, desc: '💧 Жидкая пища' };
    }
    if (liquidRatio > 0.3) {
      return { form: 'mixed', multiplier: I.FOOD_FORM_BONUS.mixed.multiplier, desc: '🥣 Смешанная' };
    }
    return { form: 'solid', multiplier: 1.0, desc: null };
  };

  I.getAlcoholBonus = (name = '') => {
    const n = name.toLowerCase();
    
    if (/водка|виски|коньяк|ром|джин|текила|самогон|спирт|whisky|vodka|rum|gin/i.test(n)) {
      return { bonus: I.ALCOHOL_BONUS.strong.bonus, type: 'strong' };
    }
    if (/вино|шампанск|просекко|wine|champagne/i.test(n)) {
      return { bonus: I.ALCOHOL_BONUS.medium.bonus, type: 'medium' };
    }
    if (/пиво|сидр|beer|cider/i.test(n)) {
      return { bonus: I.ALCOHOL_BONUS.light.bonus, type: 'light' };
    }
    
    return { bonus: 0, type: null };
  };

  // === ФАКТОРЫ ДНЯ ===

  I.calculateStressBonus = (stressLevel = 0) => {
    if (!stressLevel || stressLevel <= 0) return 0;
    if (stressLevel >= 7) return I.STRESS_BONUS.high.bonus;
    if (stressLevel >= 5) return I.STRESS_BONUS.medium.bonus;
    return 0;
  };

  I.calculateSleepBonus = (sleepHours) => {
    if (!sleepHours || sleepHours <= 0) return 0;
    if (sleepHours < 4) return I.SLEEP_BONUS.severe.bonus;
    if (sleepHours < 5) return I.SLEEP_BONUS.moderate.bonus;
    if (sleepHours < 6) return I.SLEEP_BONUS.mild.bonus;
    return 0;
  };

  I.calculateSleepQualityBonus = (quality = 0) => {
    if (!quality || quality <= 0) return 0;
    if (quality <= 2) return I.SLEEP_QUALITY_BONUS.poor.bonus;
    if (quality <= 4) return I.SLEEP_QUALITY_BONUS.fair.bonus;
    return 0;
  };

  I.calculateHydrationBonus = (waterMl = 0, weight = 70) => {
    const goal = weight * 30;
    const pct = goal > 0 ? (waterMl / goal) : 1;
    
    if (pct < 0.3) return I.HYDRATION_BONUS.severe.bonus;
    if (pct < 0.5) return I.HYDRATION_BONUS.moderate.bonus;
    if (pct < 0.7) return I.HYDRATION_BONUS.mild.bonus;
    return 0;
  };

  I.calculateAgeBonus = (age = 0) => {
    if (!age || age <= 0) return 0;
    if (age >= 70) return I.AGE_BONUS.senior.bonus;
    if (age >= 60) return I.AGE_BONUS.late_middle.bonus;
    if (age >= 45) return I.AGE_BONUS.middle.bonus;
    if (age >= 30) return I.AGE_BONUS.young_adult.bonus;
    return 0;
  };

  I.calculateBMIBonus = (weight = 0, height = 0) => {
    if (!weight || !height || weight <= 0 || height <= 0) return 0;
    const bmi = I.calculateBMI(weight, height);
    if (bmi >= 30) return I.BMI_BONUS.obese.bonus;
    if (bmi >= 25) return I.BMI_BONUS.overweight.bonus;
    return 0;
  };

  I.getGenderBonus = (gender = '') => {
    const g = gender.toLowerCase();
    if (g === 'мужской' || g === 'male' || g === 'м' || g === 'm') {
      return I.GENDER_BONUS.male.bonus;
    }
    if (g === 'женский' || g === 'female' || g === 'ж' || g === 'f') {
      return I.GENDER_BONUS.female.bonus;
    }
    return 0;
  };

  I.calculateTransFatBonus = (transGrams = 0) => {
    if (!transGrams || transGrams <= 0) return 0;
    if (transGrams >= 2) return I.TRANS_FAT_BONUS.high.bonus;
    if (transGrams >= 1) return I.TRANS_FAT_BONUS.moderate.bonus;
    if (transGrams >= 0.5) return I.TRANS_FAT_BONUS.low.bonus;
    return 0;
  };

  I.calculateFastingBonus = (hoursSinceMeal = 0) => {
    if (!hoursSinceMeal || hoursSinceMeal <= 0) return 0;
    if (hoursSinceMeal >= 16) return I.FASTING_BONUS.extended.bonus;
    if (hoursSinceMeal >= 12) return I.FASTING_BONUS.moderate.bonus;
    if (hoursSinceMeal >= 8) return I.FASTING_BONUS.short.bonus;
    return 0;
  };

  // === ТРЕНИРОВКИ ===

  I.getPreviousDayTrainings = (todayDate, lsGet) => {
    if (!lsGet) return { trainings: [], totalKcal: 0, hoursSince: Infinity, dominantType: null };
    
    const yesterday = new Date(todayDate);
    yesterday.setDate(yesterday.getDate() - 1);
    const yKey = yesterday.toISOString().slice(0, 10);
    
    const dayData = lsGet(`heys_dayv2_${yKey}`, null);
    if (!dayData || !dayData.trainings || dayData.trainings.length === 0) {
      return { trainings: [], totalKcal: 0, hoursSince: Infinity, dominantType: null };
    }
    
    const trainings = dayData.trainings;
    let totalKcal = 0;
    let lastTrainingTime = null;
    
    for (const t of trainings) {
      totalKcal += I.utils.calculateTrainingKcal(t, 70);
      if (t.time) lastTrainingTime = t.time;
    }
    
    let hoursSince = 24;
    if (lastTrainingTime) {
      const [h, m] = lastTrainingTime.split(':').map(Number);
      const trainingMinutes = (h || 0) * 60 + (m || 0);
      const now = new Date();
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      hoursSince = (24 * 60 - trainingMinutes + nowMinutes) / 60;
    }
    
    const dominantType = trainings.length > 0 ? (trainings[0].type || 'cardio') : null;
    
    return { trainings, totalKcal, hoursSince, dominantType };
  };

  // === NDTE (Next-Day Training Effect) ===

  I.calculateNDTEBMIMultiplier = (bmi) => {
    if (!bmi || bmi <= 0) return 1.0;
    for (const [, tier] of Object.entries(I.NDTE.bmiMultiplier)) {
      if (bmi >= tier.minBMI) return tier.multiplier;
    }
    return 1.0;
  };

  I.calculateNDTEDecay = (hoursSince) => {
    if (!hoursSince || hoursSince <= 0) return 1.0;
    if (hoursSince >= I.NDTE.maxWindowHours) return 0;
    for (const tier of I.NDTE.decay.tiers) {
      if (hoursSince <= tier.maxHours) return tier.multiplier;
    }
    return 0;
  };

  I.calculateNDTE = (params) => {
    const { trainingKcal = 0, hoursSince = Infinity, bmi = 22, trainingType = 'cardio', trainingsCount = 1 } = params;
    
    if (hoursSince >= I.NDTE.maxWindowHours || trainingKcal < 200) {
      return { active: false, tdeeBoost: 0, waveReduction: 0, peakReduction: 0, label: null, badge: null };
    }
    
    let baseTier = null;
    for (const tier of I.NDTE.kcalTiers) {
      if (trainingKcal >= tier.minKcal) {
        baseTier = tier;
        break;
      }
    }
    
    if (!baseTier) {
      const ratio = trainingKcal / 300;
      const minTier = I.NDTE.kcalTiers[I.NDTE.kcalTiers.length - 1];
      baseTier = {
        tdeeBoost: minTier.tdeeBoost * ratio,
        waveReduction: minTier.waveReduction * ratio,
        peakReduction: minTier.peakReduction * ratio,
        label: '⚡ Лёгкая активность'
      };
    }
    
    const bmiMult = I.calculateNDTEBMIMultiplier(bmi);
    const decayMult = I.calculateNDTEDecay(hoursSince);
    const typeMult = I.NDTE.typeMultiplier[trainingType] || { tdee: 1.0, wave: 1.0 };
    
    let cumulativeMult = 1.0;
    if (I.NDTE.cumulative.enabled && trainingsCount > 1) {
      cumulativeMult = Math.min(I.NDTE.cumulative.maxMultiplier, 1 + (trainingsCount - 1) * 0.2);
    }
    
    const tdeeBoost = baseTier.tdeeBoost * bmiMult * decayMult * typeMult.tdee * cumulativeMult;
    const waveReduction = baseTier.waveReduction * bmiMult * decayMult * typeMult.wave * cumulativeMult;
    const peakReduction = baseTier.peakReduction * bmiMult * decayMult * cumulativeMult;
    
    return {
      active: true,
      tdeeBoost: Math.min(0.20, Math.round(tdeeBoost * 1000) / 1000),
      waveReduction: Math.min(0.45, Math.round(waveReduction * 1000) / 1000),
      peakReduction: Math.min(0.50, Math.round(peakReduction * 1000) / 1000),
      label: baseTier.label,
      badge: I.NDTE.badge,
      badgeColor: I.NDTE.badgeColor,
      trainingKcal,
      hoursSince: Math.round(hoursSince),
      bmiMultiplier: bmiMult,
      decayMultiplier: decayMult,
      typeMultiplier: typeMult,
      trainingsCount
    };
  };

  // === BMI ===

  I.calculateBMI = (weight, height) => {
    if (!weight || !height || weight <= 0 || height <= 0) return 22;
    const heightM = height / 100;
    return Math.round((weight / (heightM * heightM)) * 10) / 10;
  };

  I.getBMICategory = (bmi) => {
    if (bmi < 18.5) return { category: 'underweight', color: '#eab308', desc: 'Недовес' };
    if (bmi < 25) return { category: 'normal', color: '#22c55e', desc: 'Норма' };
    if (bmi < 30) return { category: 'overweight', color: '#f97316', desc: 'Избыток' };
    return { category: 'obese', color: '#ef4444', desc: 'Ожирение' };
  };

  // === ТЕМПЕРАТУРА И ПОРЦИИ ===

  I.detectFoodTemperature = (items = [], getProductFromItem) => {
    if (!items || items.length === 0) {
      return { temperature: 'room', ...I.FOOD_TEMPERATURE_BONUS.room };
    }
    
    let hotCount = 0;
    let coldCount = 0;
    
    for (const item of items) {
      const prod = getProductFromItem ? getProductFromItem(item) : item;
      const name = (prod?.name || item?.name || '').toLowerCase();
      
      if (I.FOOD_TEMPERATURE_BONUS.hot.patterns.some(p => p.test(name))) hotCount++;
      if (I.FOOD_TEMPERATURE_BONUS.cold.patterns.some(p => p.test(name))) coldCount++;
    }
    
    if (hotCount > 0 && coldCount > 0) return { temperature: 'room', ...I.FOOD_TEMPERATURE_BONUS.room };
    if (hotCount > 0) return { temperature: 'hot', ...I.FOOD_TEMPERATURE_BONUS.hot };
    if (coldCount > 0) return { temperature: 'cold', ...I.FOOD_TEMPERATURE_BONUS.cold };
    return { temperature: 'room', ...I.FOOD_TEMPERATURE_BONUS.room };
  };

  I.calculateLargePortionBonus = (mealKcal = 0) => {
    if (!mealKcal || mealKcal <= 0) {
      return { bonus: 0, peakReduction: 1.0, desc: null };
    }
    
    for (const tier of I.LARGE_PORTION_BONUS.thresholds) {
      if (mealKcal >= tier.minKcal) {
        return {
          bonus: Math.min(tier.bonus, I.LARGE_PORTION_BONUS.maxBonus),
          peakReduction: tier.peakReduction,
          desc: tier.desc
        };
      }
    }
    return { bonus: 0, peakReduction: 1.0, desc: null };
  };

  // === ГИПОГЛИКЕМИЯ И INSULIN INDEX ===

  I.getHypoglycemiaWarning = (params = {}) => {
    const { gi = 0, protein = 0, fat = 0, isFasted = false } = params;
    const rf = I.REACTIVE_HYPOGLYCEMIA.riskFactors;
    let score = 0;
    const details = [];
    
    if (gi > rf.highGI.threshold) {
      score += rf.highGI.weight;
      details.push({ factor: 'highGI', value: gi, threshold: rf.highGI.threshold });
    }
    if (protein < rf.lowProtein.threshold) {
      score += rf.lowProtein.weight;
      details.push({ factor: 'lowProtein', value: protein, threshold: rf.lowProtein.threshold });
    }
    if (fat < rf.lowFat.threshold) {
      score += rf.lowFat.weight;
      details.push({ factor: 'lowFat', value: fat, threshold: rf.lowFat.threshold });
    }
    if (isFasted) {
      score += rf.fasted.weight;
      details.push({ factor: 'fasted', value: true });
    }
    
    const hasRisk = score >= I.REACTIVE_HYPOGLYCEMIA.warningThreshold;
    
    return {
      hasRisk,
      score,
      riskWindow: I.REACTIVE_HYPOGLYCEMIA.riskWindow,
      details,
      ui: hasRisk ? {
        emoji: I.REACTIVE_HYPOGLYCEMIA.ui.warningEmoji,
        color: I.REACTIVE_HYPOGLYCEMIA.ui.warningColor,
        title: I.REACTIVE_HYPOGLYCEMIA.ui.warningTitle,
        desc: I.REACTIVE_HYPOGLYCEMIA.ui.warningDesc,
        advice: I.REACTIVE_HYPOGLYCEMIA.ui.advice,
        symptoms: I.REACTIVE_HYPOGLYCEMIA.ui.symptoms
      } : null
    };
  };

  I.getInsulinIndexWaveModifier = (insulinogenicType) => {
    if (!insulinogenicType || !I.INSULIN_INDEX_FACTORS[insulinogenicType]) {
      return { waveMultiplier: 1.0, peakMultiplier: 1.0, glBoost: 1.0, desc: null };
    }
    
    const factor = I.INSULIN_INDEX_FACTORS[insulinogenicType];
    return {
      waveMultiplier: factor.waveMultiplier,
      peakMultiplier: factor.peakMultiplier,
      glBoost: factor.glBoost,
      desc: factor.desc
    };
  };

  // Mark constants as loaded
  I._loaded.constants = true;
  
})(typeof window !== 'undefined' ? window : global);
