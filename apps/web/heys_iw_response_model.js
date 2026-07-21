// heys_iw_response_model.js — canonical postprandial response estimator
(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  HEYS.InsulinWave = HEYS.InsulinWave || {};

  const MODEL_VERSION = '5.0.0';
  const MODEL_CONFIG = Object.freeze({
    source: 'embedded-response-model-v5',
    durationBoundsMin: Object.freeze({ min: 45, max: 360 }),
    missingGiPrior: Object.freeze({ central: 50, low: 35, high: 70 }),
    activityWindowMin: 120,
    activityMaxReductionMin: 20,
  });

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const round1 = (value) => Math.round(value * 10) / 10;
  const finiteOr = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

  function normalizeGrams(value) {
    if (HEYS.models?.normalizeItemGrams) return HEYS.models.normalizeItemGrams(value, 100);
    if (value === undefined || value === null || value === '') return 100;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 100;
  }

  function readNumber(source, keys) {
    for (const key of keys) {
      const value = source?.[key];
      if (value !== undefined && value !== null && value !== '') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
      }
    }
    return null;
  }

  function readMacro(product, item, keys) {
    const productValue = readNumber(product, keys);
    if (productValue !== null) return { value: Math.max(0, productValue), known: true, source: 'product' };
    const snapshotValue = readNumber(item, keys);
    if (snapshotValue !== null) return { value: Math.max(0, snapshotValue), known: true, source: 'snapshot' };
    return { value: 0, known: false, source: 'missing' };
  }

  function classifyForm(product, item) {
    const explicit = String(product?.foodForm || product?.form || item?.foodForm || item?.form || '').toLowerCase();
    if (['liquid', 'drink', 'beverage'].includes(explicit)) return { value: 'liquid', known: true };
    if (['processed', 'pureed', 'refined'].includes(explicit)) return { value: 'processed', known: true };
    if (['whole', 'solid'].includes(explicit)) return { value: 'whole', known: true };
    if (product?.isLiquid === true || item?.isLiquid === true) return { value: 'liquid', known: true };

    const text = `${product?.name || item?.name || ''} ${product?.category || item?.category || ''}`.toLowerCase();
    if (/сок|напит|молоко|кефир|йогурт пить|smoothie|juice|drink|milk|kefir/.test(text)) {
      return { value: 'liquid', known: false };
    }
    return { value: 'unknown', known: false };
  }

  function readTimeMinutes(time) {
    if (typeof time !== 'string') return null;
    const match = time.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (!Number.isInteger(hours) || hours < 0 || hours > 47 || minutes < 0 || minutes > 59) return null;
    return hours * 60 + minutes;
  }

  function formatTime(minutes) {
    const normalized = ((Math.round(minutes) % 1440) + 1440) % 1440;
    return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
  }

  function trainingStartMinutes(training) {
    return readTimeMinutes(training?.time || training?.startTime || training?.start);
  }

  function findProximalActivity(mealTimeMin, trainings) {
    if (!Array.isArray(trainings) || !Number.isFinite(mealTimeMin)) return null;
    let closest = null;
    for (const training of trainings) {
      const start = trainingStartMinutes(training);
      if (start === null) continue;
      const duration = clamp(finiteOr(training?.duration, 0), 0, 360);
      const end = start + duration;
      const distance = mealTimeMin >= end ? mealTimeMin - end : start >= mealTimeMin ? start - mealTimeMin : 0;
      if (distance <= MODEL_CONFIG.activityWindowMin && (!closest || distance < closest.distanceMin)) {
        closest = { distanceMin: distance, relation: mealTimeMin >= end ? 'before-meal' : 'after-meal' };
      }
    }
    return closest;
  }

  function buildResponseProfile(shape) {
    const points = [];
    const peak = shape.type === 'fast' ? 0.22 : shape.type === 'prolonged' ? 0.42 : 0.32;
    const decay = shape.type === 'prolonged' ? 2.2 : shape.type === 'fast' ? 4.4 : 3.1;
    for (let i = 0; i <= 24; i += 1) {
      const t = i / 24;
      const value = t <= peak
        ? Math.pow(t / peak, 1.45)
        : Math.exp(-decay * ((t - peak) / (1 - peak)));
      points.push({ t: round1(t * 100) / 100, value: round1(clamp(value, 0, 1) * 100) / 100 });
    }
    return points;
  }

  function analyzeMeal({ meal, pIndex, getProductFromItem }) {
    if (!meal || !Array.isArray(meal.items)) throw new TypeError('ResponseModel: meal.items is required');
    if (typeof getProductFromItem !== 'function') throw new TypeError('ResponseModel: getProductFromItem must be a function');

    let totalGrams = 0;
    let totalCarbs = 0;
    let totalSimple = 0;
    let totalProtein = 0;
    let totalFat = 0;
    let totalFiber = 0;
    let knownCarbs = 0;
    let knownGiCarbs = 0;
    let weightedGi = 0;
    let knownGl = 0;
    let explicitIiWeight = 0;
    let explicitIiWeighted = 0;
    let categoryProxy = 0;
    let liquidGrams = 0;
    let processedGrams = 0;
    let wholeGrams = 0;
    let knownFormGrams = 0;
    let macroFieldsExpected = 0;
    let macroFieldsKnown = 0;
    const missingFields = new Set();
    const assumptions = [];

    for (const item of meal.items) {
      const grams = normalizeGrams(item?.grams);
      if (grams <= 0) continue;
      const product = getProductFromItem(item, pIndex) || item || {};
      totalGrams += grams;

      const simple = readMacro(product, item, ['simple100']);
      const complex = readMacro(product, item, ['complex100']);
      const carbsDirect = readMacro(product, item, ['carbs100', 'carb100']);
      let carbs = carbsDirect;
      if (!carbsDirect.known && (simple.known || complex.known)) {
        carbs = { value: simple.value + complex.value, known: true, source: simple.source === 'product' || complex.source === 'product' ? 'product' : 'snapshot' };
      }
      const protein = readMacro(product, item, ['protein100']);
      const fiber = readMacro(product, item, ['fiber100']);
      const directFat = readMacro(product, item, ['fat100']);
      const badFat = readMacro(product, item, ['badFat100']);
      const goodFat = readMacro(product, item, ['goodFat100']);
      const transFat = readMacro(product, item, ['trans100']);
      const fat = directFat.known
        ? directFat
        : { value: badFat.value + goodFat.value + transFat.value, known: badFat.known || goodFat.known || transFat.known };

      for (const field of [carbs, protein, fiber, fat]) {
        macroFieldsExpected += 1;
        if (field.known) macroFieldsKnown += 1;
      }
      if (!carbs.known) missingFields.add('carbohydrates');
      if (!protein.known) missingFields.add('protein');
      if (!fiber.known) missingFields.add('fiber');
      if (!fat.known) missingFields.add('fat');

      const itemCarbs = carbs.value * grams / 100;
      const itemProtein = protein.value * grams / 100;
      const itemFat = fat.value * grams / 100;
      totalCarbs += itemCarbs;
      totalSimple += simple.value * grams / 100;
      totalProtein += itemProtein;
      totalFat += itemFat;
      totalFiber += fiber.value * grams / 100;
      if (carbs.known) knownCarbs += itemCarbs;

      const gi = readNumber(product, ['gi', 'gi100', 'GI']) ?? readNumber(item, ['gi', 'gi100', 'GI']);
      if (itemCarbs > 0 && gi !== null && gi >= 0 && gi <= 100) {
        knownGiCarbs += itemCarbs;
        weightedGi += gi * itemCarbs;
        knownGl += gi * itemCarbs / 100;
      } else if (itemCarbs > 0) {
        missingFields.add('GI');
      }

      const insulinIndex = readNumber(product, ['insulinIndex', 'ii']) ?? readNumber(item, ['insulinIndex', 'ii']);
      if (insulinIndex !== null && insulinIndex >= 0 && insulinIndex <= 200) {
        const kcalWeight = Math.max(1, itemCarbs * 4 + itemProtein * 4 + itemFat * 9);
        explicitIiWeight += kcalWeight;
        explicitIiWeighted += insulinIndex * kcalWeight;
      } else if (itemProtein >= 8 || /молок|кефир|йогурт|творог|сыр|whey|protein|dairy/.test(String(product?.name || item?.name || '').toLowerCase())) {
        categoryProxy += Math.min(30, itemProtein * 0.8 + itemCarbs * 0.25);
      }

      const form = classifyForm(product, item);
      if (form.known) knownFormGrams += grams;
      else missingFields.add('foodForm');
      if (form.value === 'liquid') liquidGrams += grams;
      else if (form.value === 'processed') processedGrams += grams;
      else if (form.value === 'whole') wholeGrams += grams;
    }

    if (knownGiCarbs < totalCarbs - 0.05) {
      assumptions.push(`Для ${round1(Math.max(0, totalCarbs - knownGiCarbs))} г углеводов GI неизвестен; показан диапазон с нейтральным prior ${MODEL_CONFIG.missingGiPrior.low}–${MODEL_CONFIG.missingGiPrior.high}.`);
    }
    if (macroFieldsKnown < macroFieldsExpected) assumptions.push('Часть макронутриентов отсутствует в карточках продуктов и не добавлена скрытым значением.');

    const missingGiCarbs = Math.max(0, totalCarbs - knownGiCarbs);
    const estimatedGlCentral = knownGl + missingGiCarbs * MODEL_CONFIG.missingGiPrior.central / 100;
    const estimatedGlLow = knownGl + missingGiCarbs * MODEL_CONFIG.missingGiPrior.low / 100;
    const estimatedGlHigh = knownGl + missingGiCarbs * MODEL_CONFIG.missingGiPrior.high / 100;
    const giCoverage = totalCarbs > 0 ? clamp(knownGiCarbs / totalCarbs, 0, 1) : 1;
    const macroCoverage = macroFieldsExpected > 0 ? macroFieldsKnown / macroFieldsExpected : 0;
    const formCoverage = totalGrams > 0 ? clamp(knownFormGrams / totalGrams, 0, 1) : 0;
    const explicitIi = explicitIiWeight > 0 ? explicitIiWeighted / explicitIiWeight : null;
    const proxyReliability = explicitIi !== null ? 'measured-index' : categoryProxy > 0 ? 'category-heuristic' : 'unavailable';
    const insulinDemandScore = explicitIi !== null
      ? clamp(explicitIi, 0, 100)
      : clamp(estimatedGlCentral * 1.7 + categoryProxy, 0, 100);

    return {
      totalGrams: round1(totalGrams),
      totalCarbs: round1(totalCarbs),
      totalSimple: round1(totalSimple),
      totalProtein: round1(totalProtein),
      totalFat: round1(totalFat),
      totalFiber: round1(totalFiber),
      avgGI: knownGiCarbs > 0 ? Math.round(weightedGi / knownGiCarbs) : null,
      glycemicLoad: missingGiCarbs <= 0.05 ? round1(knownGl) : null,
      estimatedGlycemicLoad: {
        central: round1(estimatedGlCentral),
        low: round1(estimatedGlLow),
        high: round1(estimatedGlHigh),
        knownContribution: round1(knownGl),
        isEstimated: missingGiCarbs > 0.05,
      },
      insulinDemandProxy: {
        score: Math.round(insulinDemandScore),
        reliability: proxyReliability,
        explicitIndex: explicitIi === null ? null : Math.round(explicitIi),
        categoryContribution: round1(categoryProxy),
      },
      simpleRatio: totalCarbs > 0 ? round1(clamp(totalSimple / totalCarbs, 0, 1)) : 0,
      liquidRatio: totalGrams > 0 ? round1(liquidGrams / totalGrams) : 0,
      processedRatio: totalGrams > 0 ? round1(processedGrams / totalGrams) : 0,
      wholeRatio: totalGrams > 0 ? round1(wholeGrams / totalGrams) : 0,
      dataQuality: {
        giCoverage: round1(giCoverage),
        macroCoverage: round1(macroCoverage),
        formCoverage: round1(formCoverage),
        missingFields: [...missingFields].sort(),
        assumptions,
      },
    };
  }

  function estimate({ meal, pIndex, getProductFromItem, trainings = [] }) {
    const nutrients = analyzeMeal({ meal, pIndex, getProductFromItem });
    const gl = nutrients.estimatedGlycemicLoad.central;
    const mealTimeMin = readTimeMinutes(meal.time);
    const proximalActivity = findProximalActivity(mealTimeMin, trainings);
    const trace = [];

    const carbLoad = clamp(gl * 1.7, 0, 70);
    const proteinDemand = clamp(nutrients.totalProtein * 0.45, 0, 20);
    const loadScore = Math.round(clamp(carbLoad + proteinDemand + nutrients.insulinDemandProxy.categoryContribution * 0.25, 0, 100));
    trace.push({ code: 'GL_LOAD', effect: 'load', value: gl, detail: 'GL рассчитана отдельно как сумма GI × доступные углеводы / 100.' });
    if (nutrients.insulinDemandProxy.reliability !== 'unavailable') {
      trace.push({ code: 'INSULIN_DEMAND_PROXY', effect: 'load-context', value: nutrients.insulinDemandProxy.score, reliability: nutrients.insulinDemandProxy.reliability });
    }

    let shapeType = 'mixed';
    const fastSignal = nutrients.liquidRatio >= 0.5 || nutrients.processedRatio >= 0.5 || nutrients.simpleRatio >= 0.6;
    const prolongedSignal = nutrients.totalFat >= 20 || nutrients.totalFiber >= 8 || nutrients.totalProtein >= 35;
    if (fastSignal && !prolongedSignal) shapeType = 'fast';
    else if (prolongedSignal) shapeType = 'prolonged';
    const shape = {
      type: shapeType,
      label: shapeType === 'fast' ? 'Быстрый профиль' : shapeType === 'prolonged' ? 'Растянутый профиль' : 'Смешанный профиль',
      peakTimingEstimateMin: shapeType === 'fast' ? 35 : shapeType === 'prolonged' ? 75 : 55,
      drivers: [
        nutrients.liquidRatio >= 0.5 ? 'жидкая форма' : null,
        nutrients.processedRatio >= 0.5 ? 'обработанная форма' : null,
        nutrients.simpleRatio >= 0.6 ? 'высокая доля простых углеводов' : null,
        nutrients.totalFat >= 20 ? 'много жира' : null,
        nutrients.totalFiber >= 8 ? 'много клетчатки' : null,
        nutrients.totalProtein >= 35 ? 'много белка' : null,
      ].filter(Boolean),
    };
    trace.push({ code: 'RESPONSE_SHAPE', effect: 'shape', value: shape.type, detail: shape.drivers.join(', ') || 'без выраженного доминирующего фактора' });

    let central = 75 + gl * 3.6 + Math.min(42, nutrients.totalProtein * 0.75);
    central += Math.min(50, Math.max(0, nutrients.totalFat - 8) * 1.35);
    central += Math.min(18, nutrients.totalFiber * 1.3);
    if (fastSignal && !prolongedSignal) central -= 12;
    if (proximalActivity) {
      const reduction = Math.min(MODEL_CONFIG.activityMaxReductionMin, central * 0.08);
      central -= reduction;
      trace.push({ code: 'PROXIMAL_ACTIVITY', effect: 'bounded-window', minutes: -Math.round(reduction), distanceMin: proximalActivity.distanceMin, relation: proximalActivity.relation });
    } else {
      trace.push({ code: 'ACTIVITY_CONTEXT', effect: 'none', detail: 'Активность вне ±120 минут и общедневные шаги не меняют окно.' });
    }

    const dataScore = clamp(
      nutrients.dataQuality.giCoverage * 0.45
      + nutrients.dataQuality.macroCoverage * 0.4
      + nutrients.dataQuality.formCoverage * 0.15,
      0,
      1
    );
    const confidenceScore = Math.round(dataScore * 100);
    const confidenceLevel = confidenceScore >= 90 ? 'high' : confidenceScore >= 55 ? 'medium' : 'low';
    const uncertainty = confidenceLevel === 'high' ? 0.14 : confidenceLevel === 'medium' ? 0.24 : 0.38;
    if (nutrients.totalGrams <= 0 || (nutrients.dataQuality.macroCoverage === 0 && nutrients.dataQuality.giCoverage === 1)) {
      central = 180;
    }
    central = Math.round(clamp(central, MODEL_CONFIG.durationBoundsMin.min, MODEL_CONFIG.durationBoundsMin.max));
    const low = Math.round(clamp(central * (1 - uncertainty), MODEL_CONFIG.durationBoundsMin.min, central));
    const high = Math.round(clamp(central * (1 + uncertainty), central, MODEL_CONFIG.durationBoundsMin.max));

    return {
      modelVersion: MODEL_VERSION,
      configSource: MODEL_CONFIG.source,
      estimateKind: 'heuristic',
      responseLoad: {
        score: loadScore,
        level: loadScore >= 70 ? 'high' : loadScore >= 35 ? 'medium' : 'low',
        drivers: [
          gl > 20 ? 'гликемическая нагрузка' : null,
          nutrients.totalProtein >= 25 ? 'белок' : null,
          nutrients.insulinDemandProxy.reliability !== 'unavailable' ? 'insulin-demand proxy' : null,
        ].filter(Boolean),
        glycemicLoad: nutrients.glycemicLoad,
        estimatedGlycemicLoad: nutrients.estimatedGlycemicLoad,
        insulinDemandProxy: nutrients.insulinDemandProxy,
      },
      responseShape: shape,
      estimatedWindow: {
        centralMinutes: central,
        lowerMinutes: low,
        upperMinutes: high,
        centralMin: central,
        rangeMin: { from: low, to: high },
        endMin: mealTimeMin === null ? null : mealTimeMin + central,
        boundsMinutes: { ...MODEL_CONFIG.durationBoundsMin },
      },
      confidence: {
        score: confidenceScore,
        level: confidenceLevel,
        label: confidenceLevel === 'high' ? 'Высокая полнота данных' : confidenceLevel === 'medium' ? 'Средняя полнота данных' : 'Низкая полнота данных',
        missingInputs: [...nutrients.dataQuality.missingFields],
        assumptions: [...nutrients.dataQuality.assumptions],
        dataQuality: nutrients.dataQuality,
      },
      trace,
      nutrients,
      responseProfile: buildResponseProfile(shape),
      legacy: {
        insulinWaveHours: central / 60,
        lipolysisMinutes: 0,
        note: 'Deprecated compatibility aliases; not physiological measurements.',
      },
    };
  }

  HEYS.InsulinWave.ResponseModel = Object.freeze({
    VERSION: MODEL_VERSION,
    CONFIG: MODEL_CONFIG,
    analyzeMeal,
    estimate,
    readTimeMinutes,
    formatTime,
  });
})(typeof window !== 'undefined' ? window : globalThis);
