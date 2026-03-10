// heys_yesterday_verify_v1.js — Верификация пропущенных прошлых дней
// Показывается в утреннем чек-ине если после последнего заполненного дня есть пропуски
// Спрашивает: дозаполнить эти дни позже или очистить/подтвердить как пустые
//
// Версия: 1.4.0
// 
(function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;
  const DEV = global.DEV || {};
  const devLog = typeof DEV.log === 'function' ? DEV.log.bind(DEV) : function () { };
  const devWarn = typeof DEV.warn === 'function' ? DEV.warn.bind(DEV) : function () { };

  // === Утилиты ===
  const storeGet = (k, d) => {
    try {
      if (HEYS.store?.get) return HEYS.store.get(k, d);
      if (HEYS.utils?.lsGet) return HEYS.utils.lsGet(k, d);
      const v = localStorage.getItem(k);
      return v ? JSON.parse(v) : d;
    } catch {
      return d;
    }
  };

  const storeSet = (k, v) => {
    try {
      if (HEYS.store?.set) {
        HEYS.store.set(k, v);
        return;
      }
      if (HEYS.utils?.lsSet) {
        HEYS.utils.lsSet(k, v);
        return;
      }
      localStorage.setItem(k, JSON.stringify(v));
    } catch { }
  };

  const lsGet = (k, d) => storeGet(k, d);
  const lsSet = (k, v) => storeSet(k, v);

  /**
   * Получить ключ вчерашнего дня
   * @returns {string} YYYY-MM-DD
   */
  function getYesterdayKey() {
    // Учитываем ночной порог: до 03:00 "вчера" = позавчера
    const dayUtils = HEYS.dayUtils || {};
    if (typeof dayUtils.todayISO === 'function') {
      // todayISO уже учитывает порог 03:00, отнимаем 1 день
      const today = new Date(dayUtils.todayISO());
      today.setDate(today.getDate() - 1);
      return today.toISOString().slice(0, 10);
    }

    // Fallback
    const now = new Date();
    if (now.getHours() < 3) {
      now.setDate(now.getDate() - 2); // До 3 утра — позавчера
    } else {
      now.setDate(now.getDate() - 1); // После 3 утра — вчера
    }
    return now.toISOString().slice(0, 10);
  }

  function parseDateKey(dateStr) {
    if (!dateStr) return null;
    const match = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const [, year, month, day] = match;
    return new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0, 0);
  }

  function formatDateKey(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    const pad2 = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }

  function addDays(dateStr, delta) {
    const date = parseDateKey(dateStr);
    if (!date) return '';
    date.setDate(date.getDate() + delta);
    return formatDateKey(date);
  }

  function getCurrentClientId() {
    if (HEYS.utils?.getCurrentClientId) return HEYS.utils.getCurrentClientId();
    return HEYS.currentClientId || '';
  }

  function listTrackedDayKeys() {
    const result = new Set();
    const currentClientId = getCurrentClientId();
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.includes('dayv2_')) continue;
        const isScopedForCurrentClient = currentClientId && key.startsWith(`heys_${currentClientId}_dayv2_`);
        const isUnscopedLegacy = key.startsWith('heys_dayv2_');
        if (!isScopedForCurrentClient && !isUnscopedLegacy) continue;
        const match = key.match(/dayv2_(\d{4}-\d{2}-\d{2})$/);
        if (match && match[1]) {
          result.add(match[1]);
        }
      }
    } catch (e) { }
    return Array.from(result).sort();
  }

  function isExplicitlyVerified(dayData) {
    if (!dayData || typeof dayData !== 'object') return false;
    return dayData.isFastingDay !== undefined || dayData.isIncomplete !== undefined;
  }

  function isMeaningfullyFilledDay(dayInfo) {
    if (!dayInfo) return false;
    return dayInfo.mealCount > 0
      && dayInfo.kcal > 0
      && dayInfo.ratio >= 0.5
      && !dayInfo.isIncomplete;
  }

  function isPendingPastDay(dayInfo) {
    if (!dayInfo) return true;
    if (dayInfo.hasBeenVerified) return false;
    if (dayInfo.mealCount === 0) return true;
    if (dayInfo.kcal <= 0) return true;
    return dayInfo.ratio < 0.5;
  }

  /**
   * Получить данные дня для проверки
   * @returns {Object|null} { date, kcal, target, ratio, meals, isFastingDay, isIncomplete }
   */
  function getDayReviewInfo(dateKey) {
    if (!dateKey) {
      return null;
    }

    const dayData = lsGet(`heys_dayv2_${dateKey}`, null);
    const profile = lsGet('heys_profile', {}) || {};
    const norms = lsGet('heys_norms', {}) || {};

    if (!dayData) {
      const fallbackTarget = calculateDayTarget({ date: dateKey, meals: [] }, profile, norms);
      return {
        date: dateKey,
        kcal: 0,
        target: Math.round(fallbackTarget || 0),
        ratio: 0,
        meals: [],
        mealCount: 0,
        itemsCount: 0,
        sampleItems: [],
        totalKcalRaw: 0,
        totalKcalIsFinite: true,
        productsAvailable: false,
        macros: {
          prot: 0,
          carbs: 0,
          fat: 0,
          simple: 0
        },
        isFastingDay: false,
        isIncomplete: false,
        hasBeenVerified: false,
        hasStoredDay: false,
        isMissingData: true,
        statusLabel: 'Нет данных'
      };
    }

    // Суммируем калории из приёмов пищи
    const meals = dayData.meals || [];
    let totalKcal = 0;
    let totalProt = 0;
    let totalCarbs = 0;
    let totalFat = 0;
    let totalSimple = 0;

    const toNumber = (val) => {
      if (val === null || val === undefined) return 0;
      if (typeof val === 'string') {
        const cleaned = val.replace(',', '.').trim();
        const num = Number(cleaned);
        return Number.isFinite(num) ? num : 0;
      }
      const num = Number(val);
      return Number.isFinite(num) ? num : 0;
    };

    const computeKcalFromMacros = (obj) => {
      if (!obj) return 0;
      const prot = toNumber(obj.protein100) || toNumber(obj.prot100);
      const carbs = toNumber(obj.carbs100) || (toNumber(obj.simple100) + toNumber(obj.complex100));
      const fat = toNumber(obj.fat100) || (toNumber(obj.badFat100) + toNumber(obj.goodFat100) + toNumber(obj.trans100));

      // Если есть только белок (мясо без полных данных), оценить жиры как 30% от белка
      // Типично для индейки/курицы: 25г белка → ~8г жира
      const estimatedFat = (prot > 0 && fat === 0 && carbs === 0) ? prot * 0.3 : fat;

      const kcal = (prot * 3) + (carbs * 4) + (estimatedFat * 9); // NET Atwater
      return Number.isFinite(kcal) ? kcal : 0;
    };

    let productsAvailable = false;
    let productsList = [];
    try {
      const storedProducts = lsGet('heys_products', []) || [];
      if (Array.isArray(storedProducts) && storedProducts.length > 0) {
        productsAvailable = true;
        productsList = storedProducts;
      }
    } catch (e) { }
    if (!productsAvailable && HEYS.products?.getAll) {
      const list = HEYS.products.getAll();
      if (Array.isArray(list) && list.length > 0) {
        productsAvailable = true;
        productsList = list;
      }
    }

    const productIndex = (HEYS.models?.buildProductIndex && productsAvailable)
      ? HEYS.models.buildProductIndex(productsList)
      : null;
    const useMealTotals = !!(HEYS.models?.mealTotals && productIndex);

    let itemsCount = 0;
    const sampleItems = [];

    for (const meal of meals) {
      const items = meal.items || [];
      itemsCount += items.length;

      if (useMealTotals) {
        const totals = HEYS.models.mealTotals(meal, productIndex) || {};
        totalKcal += toNumber(totals.kcal);
        totalProt += toNumber(totals.prot);
        totalCarbs += toNumber(totals.carbs);
        totalFat += toNumber(totals.fat);
        totalSimple += toNumber(totals.simple);
      } else {
        for (const item of items) {
          const grams = toNumber(item.grams);
          if (!grams) continue;

          // 🔧 FIX v1.2.0: Приоритет item snapshot, затем product
          // Item хранит snapshot данных при добавлении — это основной источник
          const product = getProductById(item.product_id);

          // Функция для получения первого валидного kcal100 (>0)
          const getValidKcal = (...sources) => {
            for (const src of sources) {
              const val = toNumber(src);
              if (val > 0) return val;
            }
            return 0;
          };

          // Приоритет: item.kcal100 → product.kcal100 → вычисление из макросов item → вычисление из макросов product
          const kcal100 = getValidKcal(
            item.kcal100,
            product?.kcal100,
            computeKcalFromMacros(item),
            computeKcalFromMacros(product)
          );
          // Для items без данных — попробовать взять из product в базе
          const productProt = toNumber(product?.protein100);
          const productCarbs = toNumber(product?.carbs100);
          const productFat = toNumber(product?.fat100);

          const prot100 = getValidKcal(item.protein100, productProt);
          const carbs100 = getValidKcal(item.carbs100, productCarbs);
          const fat100 = getValidKcal(item.fat100, productFat);
          const simple100 = getValidKcal(item.simple100, product?.simple100);
          const lineKcal = (kcal100 * grams) / 100;

          // Флаг неполных данных
          const isIncompleteItem = kcal100 === 0 || (item.kcal100 === undefined && !product?.kcal100);

          totalKcal += lineKcal;
          totalProt += prot100 * grams / 100;
          totalCarbs += carbs100 * grams / 100;
          totalFat += fat100 * grams / 100;
          totalSimple += simple100 * grams / 100;

          if (sampleItems.length < 5) {  // Увеличил до 5 для отладки
            sampleItems.push({
              id: item.id || null,
              name: item.name || null,
              product_id: item.product_id || null,
              grams,
              kcal100: item.kcal100 ?? null,
              kcal100Resolved: kcal100,
              lineKcal: Number.isFinite(lineKcal) ? Math.round(lineKcal * 10) / 10 : null,
              protein100: item.protein100 ?? null,
              carbs100: item.carbs100 ?? null,
              fat100: item.fat100 ?? null,
              simple100: item.simple100 ?? null,
              complex100: item.complex100 ?? null,
              hasProduct: !!product,
              productKcal100: product?.kcal100 ?? null,
              productProtein100: product?.protein100 ?? null,
              isIncomplete: isIncompleteItem,
            });
          }
        }
      }

      if (useMealTotals && sampleItems.length < 5) {
        for (const item of items) {
          if (sampleItems.length >= 5) break;
          const grams = toNumber(item.grams);
          if (!grams) continue;

          const productFromItem = HEYS.models?.getProductFromItem
            ? HEYS.models.getProductFromItem(item, productIndex)
            : getProductById(item.product_id);
          const derived = HEYS.models?.computeDerivedProduct
            ? HEYS.models.computeDerivedProduct(productFromItem || {})
            : { kcal100: 0 };
          const resolvedKcal100 = toNumber(productFromItem?.kcal100) || toNumber(derived.kcal100);
          const lineKcal = (resolvedKcal100 * grams) / 100;
          const isIncompleteItem = resolvedKcal100 === 0;

          sampleItems.push({
            id: item.id || null,
            name: item.name || null,
            product_id: item.product_id || null,
            grams,
            kcal100: item.kcal100 ?? null,
            kcal100Resolved: resolvedKcal100,
            lineKcal: Number.isFinite(lineKcal) ? Math.round(lineKcal * 10) / 10 : null,
            protein100: item.protein100 ?? null,
            carbs100: item.carbs100 ?? null,
            fat100: item.fat100 ?? null,
            simple100: item.simple100 ?? null,
            complex100: item.complex100 ?? null,
            hasProduct: !!productFromItem,
            productKcal100: productFromItem?.kcal100 ?? null,
            productProtein100: productFromItem?.protein100 ?? null,
            isIncomplete: isIncompleteItem,
          });
        }
      }
    }

    // Получаем норму для вчера (используем профиль и deficitPct)
    const target = calculateDayTarget(dayData, profile, norms);

    const ratio = target > 0 ? totalKcal / target : 0;

    const roundedKcal = Math.round(totalKcal);
    if (roundedKcal === 0 && meals.length > 0) {
      const debugKey = `heys_debug_yesterday_zero_${dateKey}`;
      let alreadyLogged = false;
      try {
        alreadyLogged = sessionStorage.getItem(debugKey) === '1';
      } catch (e) { }
      try {
        if (!alreadyLogged) {
          const payload = {
            date: dateKey,
            mealCount: meals.length,
            itemsCount,
            productsAvailable,
            hasMeals: meals.length > 0,
            hasItems: itemsCount > 0,
            sampleItems,
          };
          try {
            localStorage.setItem('heys_debug_yesterday_zero_payload', JSON.stringify(payload));
          } catch (e) { }
        }
        if (!alreadyLogged && HEYS.analytics?.trackDataOperation) {
          HEYS.analytics.trackDataOperation('yesterday_kcal_zero', 1, {
            date: dateKey,
            mealCount: meals.length,
            itemsCount,
            productsAvailable,
            hasMeals: meals.length > 0,
            hasItems: itemsCount > 0,
            sampleItems,
          });
          try { sessionStorage.setItem(debugKey, '1'); } catch (e) { }
        }
      } catch (e) { }
    }

    return {
      date: dateKey,
      kcal: roundedKcal,
      target: Math.round(target),
      ratio,
      meals,
      mealCount: meals.length,
      itemsCount,
      sampleItems,
      totalKcalRaw: Number.isFinite(totalKcal) ? Math.round(totalKcal * 10) / 10 : null,
      totalKcalIsFinite: Number.isFinite(totalKcal),
      productsAvailable,
      macros: {
        prot: Math.round(totalProt * 10) / 10,
        carbs: Math.round(totalCarbs * 10) / 10,
        fat: Math.round(totalFat * 10) / 10,
        simple: Math.round(totalSimple * 10) / 10
      },
      isFastingDay: dayData.isFastingDay || false,
      isIncomplete: dayData.isIncomplete || false,
      hasBeenVerified: isExplicitlyVerified(dayData),
      hasStoredDay: true,
      isMissingData: meals.length === 0 && roundedKcal === 0,
      statusLabel: meals.length === 0
        ? 'Нет приёмов пищи'
        : `${roundedKcal} из ${Math.round(target)} ккал`
    };
  }

  function getYesterdayData() {
    return getDayReviewInfo(getYesterdayKey());
  }

  /**
   * Получить продукт по ID (из индекса или базы)
   */
  function getProductById(productId) {
    if (!productId) return null;

    // Пробуем через HEYS.products
    if (HEYS.products?.getById) {
      return HEYS.products.getById(productId);
    }

    // Fallback: ищем в localStorage
    const products = lsGet('heys_products', []);
    return products.find(p => p.id === productId || p.id === String(productId));
  }

  /**
   * Рассчитать норму калорий для дня
   * 🔬 TDEE v1.2.0: Консолидировано — делегируем в единый модуль HEYS.TDEE
   */
  function calculateDayTarget(dayData, profile, norms) {
    // Если доступен единый модуль TDEE — используем его (точный расчёт)
    if (HEYS.TDEE?.calculate) {
      const result = HEYS.TDEE.calculate(dayData, profile, { lsGet });
      return result.optimum || 2000; // optimum = baseExpenditure * (1 + deficitPct/100)
    }

    // Fallback: упрощённый расчёт (legacy, на случай если модуль не загружен)
    const weight = profile.weight || 70;
    const height = profile.height || 170;
    const age = profile.age || 30;
    const gender = profile.gender || 'Мужской';

    // Mifflin-St Jeor formula
    const isMale = gender !== 'Женский';
    const bmr = 10 * weight + 6.25 * height - 5 * age + (isMale ? 5 : -161);

    // Коэффициент активности (fallback — не учитывает реальные тренировки/шаги)
    const activityMultiplier = {
      'sedentary': 1.2,
      'light': 1.375,
      'moderate': 1.55,
      'active': 1.725,
      'very_active': 1.9
    }[profile.activityLevel || 'moderate'] || 1.55;

    const tdee = bmr * activityMultiplier;

    // Применяем дефицит/профицит
    const deficitPct = dayData.deficitPct ?? profile.deficitPctTarget ?? 0;
    const target = tdee * (1 + deficitPct / 100);

    return target;
  }

  /**
   * Проверить, нужно ли показывать шаг верификации
   * @returns {boolean}
   */
  function getPendingPastDays() {
    const yesterdayKey = getYesterdayKey();
    const trackedDays = listTrackedDayKeys().filter((dateKey) => dateKey <= yesterdayKey);
    const reviewCache = new Map();
    const getInfo = (dateKey) => {
      if (!reviewCache.has(dateKey)) {
        reviewCache.set(dateKey, getDayReviewInfo(dateKey));
      }
      return reviewCache.get(dateKey);
    };

    let lastFilledDate = null;
    for (let i = trackedDays.length - 1; i >= 0; i--) {
      const dateKey = trackedDays[i];
      const info = getInfo(dateKey);
      if (isMeaningfullyFilledDay(info)) {
        lastFilledDate = dateKey;
        break;
      }
    }

    if (!lastFilledDate || lastFilledDate >= yesterdayKey) {
      return {
        lastFilledDate,
        missingDays: [],
        totalPendingDays: 0
      };
    }

    const missingDays = [];
    let cursor = addDays(lastFilledDate, 1);
    while (cursor && cursor <= yesterdayKey) {
      const info = getInfo(cursor);
      if (isPendingPastDay(info)) {
        missingDays.push(info);
      }
      cursor = addDays(cursor, 1);
    }

    console.info('[HEYS.yesterdayVerify] ✅ Pending days collected:', {
      lastFilledDate,
      yesterdayKey,
      totalPendingDays: missingDays.length,
      dates: missingDays.map((day) => day.date)
    });

    return {
      lastFilledDate,
      missingDays,
      totalPendingDays: missingDays.length
    };
  }

  function shouldShowYesterdayVerify() {
    return getPendingPastDays().totalPendingDays > 0;
  }

  function clampQuickFillPercent(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return 100;
    return Math.max(50, Math.min(200, Math.round(num)));
  }

  function normalizePercentSource(value, fallback) {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return fallback;
    return num <= 1 ? num * 100 : num;
  }

  function getNormPercentages() {
    const profile = lsGet('heys_profile', {}) || {};
    const norms = lsGet('heys_norms', {}) || {};
    return {
      carbsPct: normalizePercentSource(norms.carbsPct ?? profile.carbsPct, 45),
      proteinPct: normalizePercentSource(norms.proteinPct ?? profile.proteinPct, 25),
      simpleCarbPct: normalizePercentSource(norms.simpleCarbPct ?? profile.simpleCarbPct, 30),
      badFatPct: normalizePercentSource(norms.badFatPct ?? profile.badFatPct, 30),
      superbadFatPct: normalizePercentSource(norms.superbadFatPct ?? profile.superbadFatPct, 5),
      fiberPct: normalizePercentSource(norms.fiberPct ?? profile.fiberPct, 14),
      giPct: normalizePercentSource(norms.giPct ?? profile.giPct, 50),
      harmPct: normalizePercentSource(norms.harmPct ?? profile.harmPct, 40)
    };
  }

  function computeNormAbsForKcal(kcalTarget) {
    const safeKcal = Math.max(0, Math.round(Number(kcalTarget) || 0));
    const normPerc = getNormPercentages();
    if (HEYS.dayCalculations?.computeDailyNorms) {
      return HEYS.dayCalculations.computeDailyNorms(safeKcal, normPerc);
    }

    const carbPct = +normPerc.carbsPct || 45;
    const protPct = +normPerc.proteinPct || 25;
    const fatPct = Math.max(0, 100 - carbPct - protPct);
    const carbs = safeKcal ? (safeKcal * carbPct / 100) / 4 : 0;
    const prot = safeKcal ? (safeKcal * protPct / 100) / 4 : 0;
    const fat = safeKcal ? (safeKcal * fatPct / 100) / 9 : 0;
    const simple = carbs * ((+normPerc.simpleCarbPct || 30) / 100);
    const complex = Math.max(0, carbs - simple);
    const bad = fat * ((+normPerc.badFatPct || 30) / 100);
    const trans = fat * ((+normPerc.superbadFatPct || 5) / 100);
    const good = Math.max(0, fat - bad - trans);
    const fiber = safeKcal ? (safeKcal / 1000) * (+normPerc.fiberPct || 14) : 0;
    return { kcal: safeKcal, carbs, simple, complex, prot, fat, bad, good, trans, fiber, gi: +normPerc.giPct || 0, harm: +normPerc.harmPct || 0 };
  }

  function round1(value) {
    return Math.round((Number(value) || 0) * 10) / 10;
  }

  function average(values, fallback = 0) {
    const valid = (values || []).map((value) => Number(value)).filter((value) => Number.isFinite(value));
    if (!valid.length) return fallback;
    return valid.reduce((sum, value) => sum + value, 0) / valid.length;
  }

  function averagePositive(values, fallback = 0) {
    const valid = (values || []).map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0);
    if (!valid.length) return fallback;
    return valid.reduce((sum, value) => sum + value, 0) / valid.length;
  }

  function averageRounded(values, digits = 0, fallback = 0) {
    const avg = averagePositive(values, fallback);
    if (!Number.isFinite(avg)) return fallback;
    if (digits <= 0) return Math.round(avg);
    const mul = Math.pow(10, digits);
    return Math.round(avg * mul) / mul;
  }

  function clampRating(value, fallback = 5) {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return fallback;
    return Math.max(1, Math.min(10, Math.round(num)));
  }

  function normalizeClockMinutes(value) {
    let minutes = Math.round(Number(value) || 0);
    while (minutes < 0) minutes += 1440;
    while (minutes >= 1440) minutes -= 1440;
    return minutes;
  }

  function formatClockMinutes(value) {
    const formatter = HEYS.dayCalculations?.formatMinutesToTime;
    const minutes = normalizeClockMinutes(value);
    if (typeof formatter === 'function') return formatter(minutes);
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }

  function getStoredDayData(dateKey) {
    return lsGet(`heys_dayv2_${dateKey}`, null);
  }

  function getProductsListForEstimation() {
    if (HEYS.products?.getAll) {
      const list = HEYS.products.getAll();
      if (Array.isArray(list) && list.length > 0) return list;
    }
    const stored = lsGet('heys_products', []) || [];
    return Array.isArray(stored) ? stored : [];
  }

  function getReferenceDayNutritionTotals(dayData, pIndex) {
    if (!dayData || !HEYS.dayCalculations?.calculateDayTotals || !pIndex) return null;
    try {
      return HEYS.dayCalculations.calculateDayTotals(dayData, pIndex);
    } catch (e) {
      return null;
    }
  }

  function getReferenceDaySummary(dateKey, productsMap, profile) {
    if (!HEYS.dayUtils?.getDayData) return null;
    try {
      return HEYS.dayUtils.getDayData(dateKey, productsMap, profile);
    } catch (e) {
      return null;
    }
  }

  function hasRealDataForReference(dayData, dayInfo) {
    if (!dayData || dayData.estimatedDayFill) return false;
    if (!isMeaningfullyFilledDay(dayInfo)) return false;
    return true;
  }

  function getRecentFilledReferenceDays(dateKey, limit = 14) {
    const trackedDays = listTrackedDayKeys().filter((trackedDate) => trackedDate < dateKey).sort().reverse();
    const profile = lsGet('heys_profile', {}) || {};
    const productsList = getProductsListForEstimation();
    const productsMap = HEYS.dayUtils?.getProductsMap ? HEYS.dayUtils.getProductsMap() : new Map();
    const pIndex = HEYS.models?.buildProductIndex ? HEYS.models.buildProductIndex(productsList) : null;
    const result = [];

    for (const trackedDate of trackedDays) {
      if (result.length >= limit) break;
      const dayInfo = getDayReviewInfo(trackedDate);
      const dayData = getStoredDayData(trackedDate);
      if (!hasRealDataForReference(dayData, dayInfo)) continue;

      const summary = getReferenceDaySummary(trackedDate, productsMap, profile);
      const totals = getReferenceDayNutritionTotals(dayData, pIndex);
      result.push({
        date: trackedDate,
        dayData,
        dayInfo,
        summary,
        totals
      });
    }

    return result;
  }

  function buildAverageLifestyleMetrics(referenceDays) {
    const rawDays = referenceDays.map((entry) => entry.dayData).filter(Boolean);
    const summaryDays = referenceDays.map((entry) => entry.summary).filter(Boolean);
    const withSleepWindow = rawDays.filter((day) => day.sleepStart && day.sleepEnd);

    const wakeMinutesAvg = averagePositive(withSleepWindow.map((day) => {
      const end = HEYS.dayCalculations?.parseTimeToMinutes
        ? HEYS.dayCalculations.parseTimeToMinutes(day.sleepEnd)
        : 0;
      return end;
    }), 0);
    const sleepHoursAvg = averagePositive(rawDays.map((day) => {
      const totalSleepHours = HEYS.dayUtils?.getTotalSleepHours?.(day);
      if (Number.isFinite(totalSleepHours) && totalSleepHours > 0) return totalSleepHours;
      if (day.sleepHours != null && Number(day.sleepHours) > 0) return Number(day.sleepHours);
      if (day.sleepStart && day.sleepEnd && HEYS.dayUtils?.sleepHours) {
        return HEYS.dayUtils.sleepHours(day.sleepStart, day.sleepEnd);
      }
      return 0;
    }), 0);
    const computedSleepStart = sleepHoursAvg > 0
      ? normalizeClockMinutes(wakeMinutesAvg - (sleepHoursAvg * 60))
      : 0;

    const moodMorningAvg = averagePositive(rawDays.map((day) => day.moodMorning), averagePositive(rawDays.map((day) => day.moodAvg), 5));
    const wellbeingMorningAvg = averagePositive(rawDays.map((day) => day.wellbeingMorning), averagePositive(rawDays.map((day) => day.wellbeingAvg), 5));
    const stressMorningAvg = averagePositive(rawDays.map((day) => day.stressMorning), averagePositive(rawDays.map((day) => day.stressAvg), 5));
    const moodAvg = averagePositive(rawDays.map((day) => day.moodAvg), moodMorningAvg || 5);
    const wellbeingAvg = averagePositive(rawDays.map((day) => day.wellbeingAvg), wellbeingMorningAvg || 5);
    const stressAvg = averagePositive(rawDays.map((day) => day.stressAvg), stressMorningAvg || 5);
    const derivedDayScore = Math.round(((moodAvg || 5) + (wellbeingAvg || 5) + (10 - (stressAvg || 5))) / 3);

    return {
      steps: averageRounded(summaryDays.map((day) => day.steps), 0, 0),
      waterMl: averageRounded(summaryDays.map((day) => day.waterMl), 0, 0),
      householdMin: averageRounded(summaryDays.map((day) => day.householdMin), 0, 0),
      weightMorning: averageRounded(summaryDays.map((day) => day.weightMorning), 1, 0),
      sleepHours: round1(sleepHoursAvg || 0),
      sleepStart: sleepHoursAvg > 0 ? formatClockMinutes(computedSleepStart) : '',
      sleepEnd: sleepHoursAvg > 0 ? formatClockMinutes(wakeMinutesAvg) : '',
      sleepQuality: clampRating(averagePositive(rawDays.map((day) => day.sleepQuality), 0), 0),
      moodMorning: clampRating(moodMorningAvg, 5),
      wellbeingMorning: clampRating(wellbeingMorningAvg, 5),
      stressMorning: clampRating(stressMorningAvg, 5),
      moodAvg: round1(moodAvg || 0),
      wellbeingAvg: round1(wellbeingAvg || 0),
      stressAvg: round1(stressAvg || 0),
      dayScore: clampRating(averagePositive(rawDays.map((day) => day.dayScore), derivedDayScore), derivedDayScore),
      referenceDaysUsed: referenceDays.length,
      referenceDates: referenceDays.map((entry) => entry.date).slice(0, 14)
    };
  }

  function buildAverageMacroTemplate(referenceDays, targetKcal) {
    const detailedDays = referenceDays.map((entry) => {
      const totals = entry.totals || {};
      const summary = entry.summary || {};
      const actualKcal = Math.max(0, Number(summary.savedEatenKcal || summary.kcal || totals.kcal || 0));
      return {
        kcal: actualKcal,
        prot: Number(entry.dayData?.savedEatenProt || totals.prot || 0),
        carbs: Number(entry.dayData?.savedEatenCarbs || totals.carbs || 0),
        fat: Number(entry.dayData?.savedEatenFat || totals.fat || 0),
        fiber: Number(entry.dayData?.savedEatenFiber || totals.fiber || 0),
        simple: Number(totals.simple || 0),
        complex: Number(totals.complex || 0),
        bad: Number(totals.bad || 0),
        good: Number(totals.good || 0),
        trans: Number(totals.trans || 0),
        gi: Number(totals.gi || 0),
        harm: Number(totals.harm || 0)
      };
    }).filter((entry) => entry.kcal > 0);

    if (!detailedDays.length) {
      return computeNormAbsForKcal(targetKcal);
    }

    const protPerKcal = averagePositive(detailedDays.map((day) => day.prot / day.kcal), 0);
    const carbsPerKcal = averagePositive(detailedDays.map((day) => day.carbs / day.kcal), 0);
    const fatPerKcal = averagePositive(detailedDays.map((day) => day.fat / day.kcal), 0);
    const fiberPerKcal = averagePositive(detailedDays.map((day) => day.fiber / day.kcal), 0);
    const simpleCarbRatio = averagePositive(detailedDays.map((day) => day.carbs > 0 ? day.simple / day.carbs : 0), 0.3);
    const badFatRatio = averagePositive(detailedDays.map((day) => day.fat > 0 ? day.bad / day.fat : 0), 0.3);
    const transFatRatio = averagePositive(detailedDays.map((day) => day.fat > 0 ? day.trans / day.fat : 0), 0.03);
    const safeKcal = Math.max(0, Math.round(Number(targetKcal) || 0));
    const prot = round1(safeKcal * protPerKcal);
    const carbs = round1(safeKcal * carbsPerKcal);
    const fat = round1(safeKcal * fatPerKcal);
    const simple = round1(carbs * Math.min(1, Math.max(0, simpleCarbRatio)));
    const complex = round1(Math.max(0, carbs - simple));
    const bad = round1(fat * Math.min(1, Math.max(0, badFatRatio)));
    const trans = round1(fat * Math.min(1, Math.max(0, transFatRatio)));
    const good = round1(Math.max(0, fat - bad - trans));
    const fiber = round1(safeKcal * fiberPerKcal);

    return {
      kcal: safeKcal,
      prot,
      carbs,
      fat,
      simple,
      complex,
      bad,
      good,
      trans,
      fiber,
      gi: round1(averagePositive(detailedDays.map((day) => day.gi), 0)),
      harm: round1(averagePositive(detailedDays.map((day) => day.harm), 0))
    };
  }

  function splitTotalsByRatios(totalTotals, ratios) {
    const keys = ['kcal', 'prot', 'carbs', 'fat', 'simple', 'complex', 'bad', 'good', 'trans', 'fiber'];
    const result = [];
    let accumulated = Object.fromEntries(keys.map((key) => [key, 0]));

    ratios.forEach((ratio, index) => {
      const isLast = index === ratios.length - 1;
      const chunk = { gi: totalTotals.gi || 0, harm: totalTotals.harm || 0 };
      keys.forEach((key) => {
        if (isLast) {
          chunk[key] = round1(Math.max(0, Number(totalTotals[key] || 0) - Number(accumulated[key] || 0)));
        } else {
          chunk[key] = round1((Number(totalTotals[key] || 0) * ratio));
          accumulated[key] = Number(accumulated[key] || 0) + Number(chunk[key] || 0);
        }
      });
      result.push(chunk);
    });

    return result;
  }

  function getQuickFillKcal(dayInfo, percent) {
    const target = Math.max(0, Math.round(dayInfo?.target || 0));
    return Math.max(0, Math.round(target * (clampQuickFillPercent(percent) / 100)));
  }

  function createEstimatedMealItem(dateKey, partIndex, mealIndex, mealName, mealTotals, percent, referenceMeta) {
    const per100Scale = 1;
    return {
      id: `estimated_${dateKey}_${mealIndex}`,
      product_id: `estimated_quickfill_${dateKey}_${mealIndex}`,
      virtualProduct: true,
      skipProductRestore: true,
      skipOrphanTracking: true,
      name: `${mealName} · оценочно ${percent}%`,
      grams: 100,
      kcal100: round1((mealTotals.kcal || 0) / per100Scale),
      protein100: round1((mealTotals.prot || 0) / per100Scale),
      carbs100: round1((mealTotals.carbs || 0) / per100Scale),
      fat100: round1((mealTotals.fat || 0) / per100Scale),
      simple100: round1((mealTotals.simple || 0) / per100Scale),
      complex100: round1((mealTotals.complex || 0) / per100Scale),
      badFat100: round1((mealTotals.bad || 0) / per100Scale),
      goodFat100: round1((mealTotals.good || 0) / per100Scale),
      trans100: round1((mealTotals.trans || 0) / per100Scale),
      fiber100: round1((mealTotals.fiber || 0) / per100Scale),
      gi: round1(mealTotals.gi || 0),
      harm: round1(mealTotals.harm || 0),
      isEstimated: true,
      estimatedSource: 'morning-checkin',
      estimatedKcal: Math.round(mealTotals.kcal || 0),
      estimatedReferenceDays: referenceMeta?.referenceDaysUsed || 0
    };
  }

  function createEstimatedMeals(dateKey, percent, totalTotals, referenceMeta) {
    const parts = [
      { key: 'breakfast', name: 'Завтрак', time: '09:00', ratio: 0.28 },
      { key: 'lunch', name: 'Обед', time: '14:00', ratio: 0.42 },
      { key: 'dinner', name: 'Ужин', time: '19:00', ratio: 0.30 }
    ];
    const mealTotalsList = splitTotalsByRatios(totalTotals, parts.map((part) => part.ratio));
    return parts.map((part, index) => {
      const mealTotals = mealTotalsList[index] || { kcal: 0 };
      return {
        id: `estimated_meal_${dateKey}_${part.key}`,
        name: part.name,
        time: part.time,
        items: [createEstimatedMealItem(dateKey, part.key, index, part.name, mealTotals, percent, referenceMeta)],
        isEstimated: true,
        estimatedSource: 'morning-checkin'
      };
    });
  }

  function getQuickFillSummary(dayInfo, percent) {
    const safePercent = clampQuickFillPercent(percent);
    const kcal = getQuickFillKcal(dayInfo, safePercent);
    return {
      percent: safePercent,
      kcal,
      target: Math.round(dayInfo?.target || 0),
      label: `≈ ${kcal} из ${Math.round(dayInfo?.target || 0)} ккал · ${safePercent}% нормы`
    };
  }

  function getEstimatedTargetKcal(dayInfo, referenceDays) {
    const directTarget = Math.max(0, Math.round(dayInfo?.target || 0));
    if (directTarget > 0) {
      return { targetKcal: directTarget, source: 'day-target' };
    }

    const historyTarget = Math.round(averagePositive(
      (referenceDays || []).map((entry) => (
        entry?.summary?.savedDisplayOptimum
        || entry?.dayInfo?.target
        || entry?.summary?.kcal
        || entry?.totals?.kcal
        || 0
      )),
      0
    ));
    if (historyTarget > 0) {
      return { targetKcal: historyTarget, source: 'reference-history' };
    }

    return { targetKcal: 2000, source: 'hard-fallback-2000' };
  }

  function buildEstimatedDayPatch(dateKey, dayInfo, quickFill, existingDayData) {
    const percent = clampQuickFillPercent(quickFill?.percent);
    const referenceDays = getRecentFilledReferenceDays(dateKey, 14);
    const targetMeta = getEstimatedTargetKcal(dayInfo, referenceDays);
    const targetKcal = Math.max(0, Math.round(targetMeta.targetKcal || 0));
    const estimatedKcal = Math.max(0, Math.round(targetKcal * (percent / 100)));
    const lifestyleAvg = buildAverageLifestyleMetrics(referenceDays);
    const totalNormAbs = buildAverageMacroTemplate(referenceDays, estimatedKcal);
    const estimatedMeals = createEstimatedMeals(dateKey, percent, totalNormAbs, lifestyleAvg);
    const profile = lsGet('heys_profile', {}) || {};
    const prev = existingDayData || {};

    console.info('[HEYS.yesterdayVerify] ✅ Estimated day prepared:', {
      date: dateKey,
      percent,
      targetKcal,
      targetSource: targetMeta.source,
      estimatedKcal,
      referenceDaysUsed: referenceDays.length,
      referenceDates: referenceDays.map((entry) => entry.date).slice(0, 5)
    });

    const averagesFromHistory = {
      steps: +prev.steps > 0 ? +prev.steps : lifestyleAvg.steps,
      waterMl: +prev.waterMl > 0 ? +prev.waterMl : lifestyleAvg.waterMl,
      householdMin: +prev.householdMin > 0 ? +prev.householdMin : lifestyleAvg.householdMin,
      weightMorning: +prev.weightMorning > 0 ? +prev.weightMorning : lifestyleAvg.weightMorning,
      sleepStart: prev.sleepStart || lifestyleAvg.sleepStart,
      sleepEnd: prev.sleepEnd || lifestyleAvg.sleepEnd,
      sleepHours: +prev.sleepHours > 0 ? +prev.sleepHours : lifestyleAvg.sleepHours,
      sleepQuality: +prev.sleepQuality > 0 ? +prev.sleepQuality : lifestyleAvg.sleepQuality,
      moodMorning: +prev.moodMorning > 0 ? +prev.moodMorning : lifestyleAvg.moodMorning,
      wellbeingMorning: +prev.wellbeingMorning > 0 ? +prev.wellbeingMorning : lifestyleAvg.wellbeingMorning,
      stressMorning: +prev.stressMorning > 0 ? +prev.stressMorning : lifestyleAvg.stressMorning,
      moodAvg: +prev.moodAvg > 0 ? +prev.moodAvg : lifestyleAvg.moodAvg,
      wellbeingAvg: +prev.wellbeingAvg > 0 ? +prev.wellbeingAvg : lifestyleAvg.wellbeingAvg,
      stressAvg: +prev.stressAvg > 0 ? +prev.stressAvg : lifestyleAvg.stressAvg,
      dayScore: +prev.dayScore > 0 ? +prev.dayScore : lifestyleAvg.dayScore,
      sleepNote: prev.sleepNote || '',
      dayComment: prev.dayComment || '',
      dayScoreManual: !!prev.dayScoreManual
    };

    return {
      meals: estimatedMeals,
      isIncomplete: false,
      isFastingDay: false,
      ...averagesFromHistory,
      savedDisplayOptimum: targetKcal,
      savedEatenKcal: Math.round(totalNormAbs.kcal || 0),
      savedEatenProt: round1(totalNormAbs.prot || 0),
      savedEatenCarbs: round1(totalNormAbs.carbs || 0),
      savedEatenFat: round1(totalNormAbs.fat || 0),
      savedEatenFiber: round1(totalNormAbs.fiber || 0),
      estimatedDayFill: {
        version: 1,
        date: dateKey,
        percent,
        presetId: quickFill?.presetId || null,
        targetKcal,
        targetSource: targetMeta.source,
        estimatedKcal: Math.round(totalNormAbs.kcal || 0),
        source: 'morning-checkin',
        referenceDaysUsed: lifestyleAvg.referenceDaysUsed || 0,
        referenceDates: lifestyleAvg.referenceDates || [],
        profileId: profile?.id || null,
        appliedAt: Date.now()
      }
    };
  }

  function clearEstimatedDayFields(dayData) {
    if (!dayData || typeof dayData !== 'object') return;
    delete dayData.savedEatenKcal;
    delete dayData.savedDisplayOptimum;
    delete dayData.savedEatenProt;
    delete dayData.savedEatenCarbs;
    delete dayData.savedEatenFat;
    delete dayData.savedEatenFiber;
    delete dayData.estimatedDayFill;
  }

  // === Действия для неполных данных ===
  const INCOMPLETE_ACTIONS = [
    {
      id: 'fill_later',
      icon: '✏️',
      title: 'Дозаполнить позже',
      desc: 'Отмечу эти дни как неполные, чтобы статистика не искажалась'
    },
    {
      id: 'clear_day',
      icon: '🗑️',
      title: 'Очистить дни',
      desc: 'Подтвердить, что эти дни пустые и не учитывать их в статистике'
    }
  ];

  const QUICK_FILL_PRESETS = [
    {
      id: 'under_norm',
      icon: '🫶',
      title: 'Не доел до нормы',
      desc: 'Чувствую, что явно не доел',
      percent: 78,
      rangeLabel: '≈ 75–80%'
    },
    {
      id: 'around_norm',
      icon: '👌',
      title: 'Поел как надо',
      desc: 'По норме, но без точных деталей',
      percent: 110,
      rangeLabel: '≈ 100–120%'
    },
    {
      id: 'moderate_overeat',
      icon: '😅',
      title: 'Скорее переел',
      desc: 'Точно с перебором, но без жести',
      percent: 155,
      rangeLabel: '≈ 150–160%'
    },
    {
      id: 'hard_overeat',
      icon: '🥵',
      title: 'Сильно переел',
      desc: 'Прям сильно перебрал',
      percent: 200,
      rangeLabel: '≈ 200%'
    }
  ];

  // === React компонент шага ===
  function YesterdayVerifyStepComponent({ data, onChange, context }) {
    const [pendingInfo, setPendingInfo] = React.useState(null);
    const [expandedDateKey, setExpandedDateKey] = React.useState(null);

    // Загружаем пропущенные дни
    React.useEffect(() => {
      const info = getPendingPastDays();
      setPendingInfo(info);
      try {
        if (info) {
          localStorage.setItem('heys_debug_yesterday_info', JSON.stringify(info));
        } else {
          localStorage.setItem('heys_debug_yesterday_info', JSON.stringify({ empty: true }));
        }
      } catch (e) { }

    }, []);

    const selectedAction = data.incompleteAction || null;
    const quickFillByDate = data.quickFillByDate || {};

    // Обработчик выбора действия для неполных данных
    const handleActionSelect = (actionId) => {
      onChange({
        ...data,
        incompleteAction: actionId,
        pendingDateKeys: pendingInfo?.missingDays?.map((day) => day.date) || []
      });
    };

    const updateQuickFill = (dateKey, nextValue) => {
      const nextMap = { ...quickFillByDate };
      if (!nextValue) {
        delete nextMap[dateKey];
      } else {
        nextMap[dateKey] = {
          ...nextMap[dateKey],
          ...nextValue,
          percent: clampQuickFillPercent(nextValue.percent ?? nextMap[dateKey]?.percent ?? 100)
        };
      }
      onChange({
        ...data,
        quickFillByDate: nextMap,
        pendingDateKeys: pendingInfo?.missingDays?.map((day) => day.date) || []
      });
    };

    const applyPreset = (dateKey, preset) => {
      updateQuickFill(dateKey, {
        presetId: preset.id,
        percent: preset.percent
      });
      setExpandedDateKey(dateKey);
    };

    const handleSliderChange = (dateKey, value) => {
      updateQuickFill(dateKey, {
        percent: value,
        presetId: quickFillByDate[dateKey]?.presetId || null
      });
    };

    const unresolvedDaysCount = (pendingInfo?.missingDays || []).filter((day) => !quickFillByDate[day.date]).length;

    if (!pendingInfo) {
      return React.createElement('div', { className: 'yv-loading' }, 'Загрузка...');
    }

    const missingDays = pendingInfo.missingDays || [];

    return React.createElement('div', { className: 'yv-step' },
      React.createElement('div', { className: 'yv-info' },
        React.createElement('div', { className: 'yv-info-icon' }, '🗓️'),
        React.createElement('div', { className: 'yv-info-text' },
          React.createElement('div', { className: 'yv-info-date' },
            pendingInfo.lastFilledDate
              ? 'После ' + formatDateRu(pendingInfo.lastFilledDate) + ' есть пропуски'
              : 'Нашёл пропуски в прошлых днях'
          ),
          React.createElement('div', { className: 'yv-info-stats' },
            `${missingDays.length} ${pluralizeDays(missingDays.length)} требуют решения`
          )
        )
      ),

      React.createElement('div', { className: 'yv-question' },
        'Что сделать с этими днями?'
      ),

      React.createElement('div', { className: 'yv-days' },
        missingDays.map((day) => {
          const quickFill = quickFillByDate[day.date] || null;
          const isExpanded = expandedDateKey === day.date;
          const quickSummary = quickFill ? getQuickFillSummary(day, quickFill.percent) : null;
          return React.createElement('div', {
            key: day.date,
            className: 'yv-day-card' + (quickFill ? ' yv-day-card--resolved' : '')
          },
            React.createElement('div', { className: 'yv-day-header' },
              React.createElement('div', { className: 'yv-day-title-wrap' },
                React.createElement('div', { className: 'yv-day-title-row' },
                  React.createElement('span', { className: 'yv-day-icon' }, day.mealCount > 0 ? '🍽️' : '📭'),
                  React.createElement('div', { className: 'yv-day-title' }, formatDateRu(day.date)),
                  quickFill && React.createElement('span', { className: 'yv-day-chip' }, 'оценочно заполнен')
                ),
                React.createElement('div', { className: 'yv-day-meta' },
                  day.mealCount > 0
                    ? `${day.kcal} из ${day.target} ккал · ${day.mealCount} ${pluralizeMeals(day.mealCount)}`
                    : 'Нет приёмов пищи или калорий за день'
                ),
                quickSummary && React.createElement('div', { className: 'yv-day-estimate' }, quickSummary.label)
              ),
              React.createElement('div', { className: 'yv-day-actions' },
                React.createElement('button', {
                  type: 'button',
                  className: 'yv-day-action-btn',
                  onClick: () => setExpandedDateKey(isExpanded ? null : day.date)
                },
                  quickFill ? 'Изменить' : '⚡ По ощущениям'
                ),
                quickFill && React.createElement('button', {
                  type: 'button',
                  className: 'yv-day-action-btn yv-day-action-btn--ghost',
                  onClick: () => updateQuickFill(day.date, null)
                }, 'Сбросить')
              )
            ),

            isExpanded && React.createElement('div', { className: 'yv-day-editor' },
              React.createElement('div', { className: 'yv-day-editor-title' },
                'Оцени день по ощущениям'
              ),
              React.createElement('div', { className: 'yv-day-editor-subtitle' },
                day.mealCount > 0
                  ? 'Сохраним один примерный день и заменим текущие неполные записи на оценочную версию по средним последних заполненных дней.'
                  : 'Сохраним примерный день по средним последних заполненных дней, чтобы история и аналитика не были пустыми.'
              ),
              React.createElement('div', { className: 'yv-presets' },
                QUICK_FILL_PRESETS.map((preset) =>
                  React.createElement('button', {
                    key: preset.id,
                    type: 'button',
                    className: 'yv-preset' + (quickFill?.presetId === preset.id ? ' yv-preset--active' : ''),
                    onClick: () => applyPreset(day.date, preset)
                  },
                    React.createElement('span', { className: 'yv-preset-icon' }, preset.icon),
                    React.createElement('span', { className: 'yv-preset-copy' },
                      React.createElement('span', { className: 'yv-preset-title' }, preset.title),
                      React.createElement('span', { className: 'yv-preset-desc' }, `${preset.desc} · ${preset.rangeLabel}`)
                    )
                  )
                )
              ),
              React.createElement('div', { className: 'yv-slider-block' },
                React.createElement('div', { className: 'yv-slider-header' },
                  React.createElement('span', { className: 'yv-slider-label' }, 'Насколько от нормы это было'),
                  React.createElement('span', { className: 'yv-slider-value' }, `${getQuickFillSummary(day, quickFill?.percent || 100).percent}%`)
                ),
                React.createElement('input', {
                  type: 'range',
                  className: 'mood-slider',
                  min: 50,
                  max: 200,
                  step: 5,
                  value: getQuickFillSummary(day, quickFill?.percent || 100).percent,
                  onChange: (e) => handleSliderChange(day.date, e.target.value)
                }),
                React.createElement('div', { className: 'yv-slider-labels' },
                  React.createElement('span', null, '50%'),
                  React.createElement('span', null, '100%'),
                  React.createElement('span', null, '200%')
                ),
                React.createElement('div', { className: 'yv-slider-note' },
                  `Будет записано примерно ${getQuickFillSummary(day, quickFill?.percent || 100).kcal} ккал при дневной норме ${Math.round(day.target || 0)} ккал.`
                )
              )
            )
          );
        })
      ),

      unresolvedDaysCount > 0 && React.createElement(React.Fragment, null,
        React.createElement('div', { className: 'yv-subtitle' },
          `📝 Для оставшихся ${unresolvedDaysCount} ${pluralizeDays(unresolvedDaysCount)} выбери общее действие`
        ),

        React.createElement('div', { className: 'yv-options' },
          INCOMPLETE_ACTIONS.map(act =>
            React.createElement('button', {
              key: act.id,
              type: 'button',
              className: 'yv-option' + (selectedAction === act.id ? ' yv-option--selected' : ''),
              onClick: () => handleActionSelect(act.id)
            },
              React.createElement('span', { className: 'yv-option-icon' }, act.icon),
              React.createElement('div', { className: 'yv-option-content' },
                React.createElement('div', { className: 'yv-option-title' }, act.title),
                React.createElement('div', { className: 'yv-option-desc' }, act.desc)
              ),
              selectedAction === act.id && React.createElement('span', {
                className: 'yv-option-check'
              }, '✓')
            )
          )
        ),

        selectedAction === 'clear_day' && React.createElement('div', { className: 'yv-warning' },
          `⚠️ Оставшиеся ${unresolvedDaysCount} ${pluralizeDays(unresolvedDaysCount)} будут отмечены пустыми. Это действие необратимо.`
        ),

        selectedAction === 'fill_later' && React.createElement('div', { className: 'yv-hint' },
          '📅 Оставшиеся дни будут отмечены как неполные. Ты сможешь вернуться и дозаполнить их позже.'
        )
      ),

      unresolvedDaysCount === 0 && React.createElement('div', { className: 'yv-hint yv-hint--success' },
        '✅ Все пропущенные дни получили быструю оценку. Можно продолжать чек-ин.'
      ),

      !selectedAction && unresolvedDaysCount > 0 && React.createElement('div', { className: 'yv-hint' },
        '💡 Можно часть дней быстро оценить по ощущениям, а для остальных выбрать одно общее действие.'
      )
    );
  }

  /**
   * Форматировать дату по-русски
   */
  function formatDateRu(dateStr) {
    if (!dateStr) return '';
    const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
      'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    const d = new Date(dateStr);
    return d.getDate() + ' ' + months[d.getMonth()];
  }

  function pluralizeDays(count) {
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod10 === 1 && mod100 !== 11) return 'день';
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'дня';
    return 'дней';
  }

  function pluralizeMeals(count) {
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod10 === 1 && mod100 !== 11) return 'приём пищи';
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'приёма пищи';
    return 'приёмов пищи';
  }

  /**
   * Сохранение данных шага
   */
  function saveYesterdayVerify(data) {
    const pendingDays = getPendingPastDays().missingDays || [];
    const nowTs = Date.now();
    const quickFillByDate = data.quickFillByDate || {};

    pendingDays.forEach((dayInfo) => {
      const dateKey = dayInfo.date;
      const dayData = lsGet(`heys_dayv2_${dateKey}`, { date: dateKey }) || { date: dateKey };
      dayData.isFastingDay = false;

      const quickFill = quickFillByDate[dateKey];
      if (quickFill) {
        const estimatedPatch = buildEstimatedDayPatch(dateKey, dayInfo, quickFill, dayData);
        clearEstimatedDayFields(dayData);
        Object.assign(dayData, estimatedPatch);
        dayData.updatedAt = nowTs;
        lsSet(`heys_dayv2_${dateKey}`, dayData);
        window.dispatchEvent(new CustomEvent('heys:day-updated', {
          detail: { date: dateKey, source: 'yesterday-verify-estimated', data: dayData }
        }));
        return;
      }

      if (data.incompleteAction === 'clear_day') {
        dayData.meals = [];
        dayData.isIncomplete = false;
        clearEstimatedDayFields(dayData);
        dayData.updatedAt = nowTs;
        lsSet(`heys_dayv2_${dateKey}`, dayData);

        window.dispatchEvent(new CustomEvent('heys:day-updated', {
          detail: { date: dateKey, field: 'meals', value: [], source: 'yesterday-verify-clear' }
        }));
      }

      if (data.incompleteAction === 'fill_later') {
        dayData.isIncomplete = true;
        dayData.updatedAt = nowTs;
        lsSet(`heys_dayv2_${dateKey}`, dayData);
      }

      window.dispatchEvent(new CustomEvent('heys:day-updated', {
        detail: { date: dateKey, source: 'yesterday-verify' }
      }));
    });

    devLog('[YesterdayVerify] ✅ Applied action for pending days:', {
      action: data.incompleteAction,
      dates: pendingDays.map((day) => day.date),
      estimatedDates: Object.keys(quickFillByDate)
    });
  }

  // === Регистрация шага ===
  let _registerRetries = 0;
  function registerYesterdayVerifyStep() {
    if (!HEYS.StepModal?.registerStep) {
      if (_registerRetries < 20) {
        _registerRetries++;
        setTimeout(registerYesterdayVerifyStep, 500);
      } else {
        devWarn('[YesterdayVerify] HEYS.StepModal not found after 10s');
      }
      return;
    }

    HEYS.StepModal.registerStep('yesterdayVerify', {
      title: 'Пропуски в прошлых днях',
      hint: 'Проверка дневника',
      icon: '📊',
      component: YesterdayVerifyStepComponent,
      canSkip: false, // Обязательный шаг если показывается

      shouldShow: () => {
        return shouldShowYesterdayVerify();
      },

      getInitialData: () => {
        return {
          incompleteAction: null,
          pendingDateKeys: [],
          quickFillByDate: {}
        };
      },

      // Валидация: нужно выбрать вариант
      validate: (data) => {
        const pendingDates = (getPendingPastDays().missingDays || []).map((day) => day.date);
        const quickFillByDate = data.quickFillByDate || {};
        const unresolvedDates = pendingDates.filter((dateKey) => !quickFillByDate[dateKey]);
        if (unresolvedDates.length > 0 && !data.incompleteAction) {
          return { valid: false, error: 'Выбери общее действие для оставшихся дней или оцени их по ощущениям' };
        }
        return { valid: true };
      },

      save: saveYesterdayVerify,

      xpAction: 'yesterday_verify'
    });

    devLog('[YesterdayVerify] ✅ Step registered');
  }

  // Запускаем регистрацию
  registerYesterdayVerifyStep();

  // === Экспорт API ===
  HEYS.YesterdayVerify = {
    getYesterdayKey,
    getYesterdayData,
    getDayReviewInfo,
    getPendingPastDays,
    shouldShow: shouldShowYesterdayVerify,
    INCOMPLETE_ACTIONS,
    QUICK_FILL_PRESETS
  };

  devLog('[HEYS] YesterdayVerify v1.4.0 loaded');

})(typeof window !== 'undefined' ? window : global);
