// heys_yesterday_verify_v1.js — Верификация пропущенных прошлых дней
// Показывается в утреннем чек-ине если после последнего заполненного дня есть пропуски
// Спрашивает: дозаполнить эти дни позже, подтвердить как реальные данные/голодание или очистить как пустые
//
// Версия: 1.4.1
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
  const YESTERDAY_VERIFY_MARKER_VERSION = 1;
  // Контракт checkin-morning, строка «пропущенные дни подряд»: развилка разбора
  // предлагает пачку не больше семи дней, остальные закрываются без разбора.
  // Семь — предел, за которым разбор превращается в угадывание.
  const PENDING_REVIEW_PACK_MAX = 7;
  const OUT_OF_REVIEW_WINDOW_ACTION = 'out_of_review_window';
  const DayRealDataActions = HEYS.DayRealDataActions || {};

  function readDayDataScoped(dateKey, fallback = null) {
    return readDayDataUnscopedAware(dateKey, fallback);
  }

  function writeDayDataScoped(dateKey, dayData) {
    if (dayData && dayData.date && dateKey && String(dayData.date) !== String(dateKey)) {
      console.warn('[HEYS.yesterdayVerify] writeDayDataScoped ABORT: date mismatch', {
        dateKey,
        payloadDate: dayData.date
      });
      return false;
    }
    const safeDayData = dayData && dayData.date ? dayData : { ...(dayData || {}), date: dateKey };
    const writer = HEYS.MorningCheckinUtils?.writeDayV2Scoped;
    if (typeof writer === 'function') {
      return writer(dateKey, safeDayData);
    }
    let valueToSave = safeDayData;
    try {
      if (HEYS.dayMutationGuard?.mergeProtectedFields) {
        const structuralFields = new Set([
          'date',
          'meals',
          'deletedMealIds',
          'deletedItemIds',
          'deletedMealItemIds',
          'updatedAt',
        ]);
        const fields = Object.keys(safeDayData).filter((field) => !structuralFields.has(field));
        if (fields.length) {
          const current = readDayDataScoped(dateKey, null);
          const protectedResult = HEYS.dayMutationGuard.mergeProtectedFields(dateKey, safeDayData, current, fields, {
            action: 'yesterday-verify-day-write',
          });
          if (protectedResult.blocked) return false;
          valueToSave = protectedResult.day || safeDayData;
        }
      }
    } catch (_) { /* guard diagnostics only */ }
    lsSet(`heys_dayv2_${dateKey}`, valueToSave);
    return true;
  }

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

  function hasCurrentClientScopedNamespace(clientId = getCurrentClientId()) {
    if (!clientId) return false;
    const prefix = `heys_${clientId}_`;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix)) return true;
      }
    } catch (_) { }
    return false;
  }

  function shouldUseUnscopedLegacyDays(clientId = getCurrentClientId()) {
    return !clientId || !hasCurrentClientScopedNamespace(clientId);
  }

  function readDayDataUnscopedAware(dateKey, fallback = null) {
    const clientId = getCurrentClientId();
    const allowUnscopedFallback = shouldUseUnscopedLegacyDays(clientId);
    const reader = HEYS.MorningCheckinUtils?.readDayV2ScopedFirst;
    if (typeof reader === 'function') {
      return reader(dateKey, fallback, { allowUnscopedFallback });
    }
    if (clientId) {
      const scoped = lsGet(`heys_${clientId}_dayv2_${dateKey}`, null);
      if (scoped && typeof scoped === 'object') return scoped;
      if (!allowUnscopedFallback) return fallback;
    }
    return lsGet(`heys_dayv2_${dateKey}`, fallback);
  }

  function listTrackedDayKeys() {
    const scopedResult = new Set();
    const legacyResult = new Set();
    const currentClientId = getCurrentClientId();
    const useLegacyDays = shouldUseUnscopedLegacyDays(currentClientId);
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.includes('dayv2_')) continue;
        const isScopedForCurrentClient = currentClientId && key.startsWith(`heys_${currentClientId}_dayv2_`);
        const isUnscopedLegacy = key.startsWith('heys_dayv2_');
        if (!isScopedForCurrentClient && !(useLegacyDays && isUnscopedLegacy)) continue;
        const match = key.match(/dayv2_(\d{4}-\d{2}-\d{2})$/);
        if (match && match[1]) {
          if (isScopedForCurrentClient) scopedResult.add(match[1]);
          else legacyResult.add(match[1]);
        }
      }
    } catch (e) { }
    return Array.from(scopedResult.size > 0 || !useLegacyDays ? scopedResult : legacyResult).sort();
  }

  function isExplicitlyVerified(dayData) {
    if (!dayData || typeof dayData !== 'object') return false;
    // Hard verify markers — осознанные «закрывающие» решения юзера,
    // после которых чекин навсегда перестаёт спрашивать про день:
    //   • isFastingDay=true (markFasting из low-cal-banner или 'confirm_real_data' через applyDayStatusAction)
    //   • action ∈ {confirm_real_data, clear_day, estimated_fill}
    //   • estimatedDayFill из morning-checkin (квик-заполнение)
    if (dayData.isFastingDay === true) return true;
    const action = dayData.yesterdayVerifyAction;
    //   • out_of_review_window — день вышел за пачку разбора (контракт
    //     checkin-morning, «пропущенные дни подряд»): закрыт без разбора,
    //     числа дня при этом не тронуты
    if (action === 'confirm_real_data' || action === 'clear_day' || action === 'estimated_fill') return true;
    if (action === OUT_OF_REVIEW_WINDOW_ACTION) return true;
    if (dayData.estimatedDayFill?.source === 'morning-checkin') return true;
    // Soft marker 'fill_later' закрывает текущий чек-ин, но не скрывает день
    // навсегда: на следующее утро дата решения станет прошлой и день снова
    // будет оценён по фактическому содержимому.
    if (action === 'fill_later' && isVerifyDecisionFromCurrentCheckin(dayData.yesterdayVerifyAt)) return true;
    return false;
  }

  function getLogicalCheckinDateKey(timestamp) {
    const date = new Date(Number(timestamp));
    if (Number.isNaN(date.getTime())) return '';
    if (date.getHours() < 3) date.setDate(date.getDate() - 1);
    return formatDateKey(date);
  }

  function getCurrentCheckinDateKey() {
    try {
      const current = HEYS.dayUtils?.todayISO?.();
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(current || ''))) return String(current);
    } catch (_) { }
    return getLogicalCheckinDateKey(Date.now());
  }

  function isVerifyDecisionFromCurrentCheckin(timestamp) {
    return getLogicalCheckinDateKey(timestamp) === getCurrentCheckinDateKey();
  }

  function markYesterdayVerified(dayData, action, nowTs) {
    if (!dayData || typeof dayData !== 'object') return;
    dayData.yesterdayVerifyAction = action;
    dayData.yesterdayVerifyAt = nowTs;
    dayData.yesterdayVerifyVersion = YESTERDAY_VERIFY_MARKER_VERSION;
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

  function isEmptyFoodDay(dayInfo) {
    return Number(dayInfo?.kcal || 0) <= 0 && Number(dayInfo?.mealCount || 0) <= 0;
  }

  function getAroundNormPreset() {
    return QUICK_FILL_PRESETS.find((preset) => preset.id === 'around_norm') || QUICK_FILL_PRESETS[1];
  }

  const RECENT_PENDING_FALLBACK_DAYS = 2;

  /** Делит собранные пропуски на пачку (последние N) и хвост за её пределами. */
  function splitPendingPackByLimit(missingDays, limit = PENDING_REVIEW_PACK_MAX) {
    const list = Array.isArray(missingDays) ? missingDays : [];
    if (list.length <= limit) return { packDays: list, overflowDays: [] };
    return {
      packDays: list.slice(list.length - limit),
      overflowDays: list.slice(0, list.length - limit)
    };
  }

  /**
   * Получить данные дня для проверки
   * @returns {Object|null} { date, kcal, target, ratio, meals, isFastingDay, isIncomplete }
   */
  function getDayReviewInfo(dateKey) {
    if (!dateKey) {
      return null;
    }

    const dayData = readDayDataScoped(dateKey, null);
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
    if (HEYS.products?.getAll) {
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
    return null;
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
   * Собрать все незакрытые прошлые дни с последнего заполненного.
   * Без ограничения пачки — его накладывает getPendingPastDays.
   * @returns {{ lastFilledDate: string|null, missingDays: Object[], totalPendingDays: number }}
   */
  function collectPendingPastDays() {
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

    if (!lastFilledDate) {
      if (!trackedDays.length) {
        return {
          lastFilledDate,
          missingDays: [],
          totalPendingDays: 0
        };
      }

      const missingDays = [];
      let cursor = addDays(yesterdayKey, -(RECENT_PENDING_FALLBACK_DAYS - 1));
      while (cursor && cursor <= yesterdayKey) {
        const info = getInfo(cursor);
        if (isPendingPastDay(info)) {
          missingDays.push(info);
        }
        cursor = addDays(cursor, 1);
      }

      console.info('[HEYS.yesterdayVerify] ✅ Pending days collected without filled anchor:', {
        fallbackDays: RECENT_PENDING_FALLBACK_DAYS,
        trackedDaysCount: trackedDays.length,
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

    if (lastFilledDate >= yesterdayKey) {
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

  /**
   * Пропуски для развилки разбора, уже урезанные до пачки контракта.
   * `overflowDays` — то, что за пачку не влезло: их разбор не предлагается,
   * они закрываются маркером без разбора (closePendingDaysOutsideReviewWindow),
   * а числа этих дней остаются как есть.
   */
  function getPendingPastDays() {
    const collected = collectPendingPastDays();
    const { packDays, overflowDays } = splitPendingPackByLimit(collected.missingDays);
    return {
      lastFilledDate: collected.lastFilledDate,
      missingDays: packDays,
      overflowDays,
      totalPendingDays: packDays.length,
      totalPendingDaysUncapped: (collected.missingDays || []).length
    };
  }

  /**
   * Дни за пределами пачки закрываются без разбора: пишется только маркер,
   * ни одно число дня не трогается — «дыр» в истории не появляется.
   * Идемпотентна: уже закрытые дни в overflow не попадают.
   */
  function closePendingDaysOutsideReviewWindow(source = 'pack-limit') {
    const { overflowDays } = getPendingPastDays();
    if (!overflowDays.length) return [];
    const nowTs = Date.now();
    const closed = [];
    overflowDays.forEach((dayInfo) => {
      const dateKey = dayInfo && dayInfo.date;
      if (!dateKey) return;
      const dayData = readDayDataScoped(dateKey, { date: dateKey }) || { date: dateKey };
      if (isExplicitlyVerified(dayData)) return;
      // Пишется только маркер: ни meals, ни isFastingDay, ни isIncomplete,
      // ни одно число дня не трогается.
      markYesterdayVerified(dayData, OUT_OF_REVIEW_WINDOW_ACTION, nowTs);
      dayData.date = dayData.date || dateKey;
      dayData.updatedAt = nowTs;
      writeDayDataScoped(dateKey, dayData);
      closed.push(dateKey);
    });
    if (closed.length) {
      console.info('[HEYS.yesterdayVerify] ✅ Days outside review pack closed without review:', {
        source,
        packLimit: PENDING_REVIEW_PACK_MAX,
        closed
      });
    }
    return closed;
  }

  function shouldShowYesterdayVerify() {
    return getPendingPastDays().totalPendingDays > 0;
  }

  const QUICK_FILL_SLIDER_MIN = 50;
  const QUICK_FILL_SLIDER_MAX = 200;
  const QUICK_FILL_NORM_CENTER = 100;
  const QUICK_FILL_NORM_BAND = 10.15;

  function clampQuickFillPercent(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return 100;
    return Math.max(50, Math.min(200, Math.round(num)));
  }

  function snapQuickFillSliderPercent(value) {
    const clamped = clampQuickFillPercent(value);
    const stepped = Math.round(clamped / 5) * 5;
    return Math.max(50, Math.min(200, stepped));
  }

  function resolveQuickFillSliderPercent(rawValue) {
    const preset = findPresetByPercent(rawValue);
    if (preset) return preset.percent;
    return snapQuickFillSliderPercent(rawValue);
  }

  function computePackDayCaption(packDayDate, pendingDateKeys, clearedDateKeys, confirmedDateKeys, quickFillByDate) {
    if (!packDayDate) return null;
    const cleared = new Set(clearedDateKeys || []);
    const confirmed = new Set(confirmedDateKeys || []);
    const quickFill = quickFillByDate || {};
    const keys = (pendingDateKeys || []).filter((key) => (
      !cleared.has(key) && !confirmed.has(key) && !quickFill[key]
    ));
    const idx = keys.indexOf(packDayDate);
    if (idx >= 0 && keys.length > 0) {
      return 'День ' + (idx + 1) + ' из ' + keys.length;
    }
    return formatDateRu(packDayDate);
  }

  /** Чем закрыт разбор — одной строкой, по ответу этого же захода. */
  function resolvedStepNote(data) {
    switch (data && data.incompleteAction) {
      case 'fill_later':
        return 'Ответ записан. День вернётся завтра тем же вопросом.';
      case 'confirm_real_data':
        return 'Ответ записан: цифры дня остаются как есть.';
      case 'estimated_fill':
        return 'Ответ записан: день закрыт оценкой по ощущениям.';
      case 'clear_day':
        return 'Ответ записан: пустые дни убраны из списка.';
      case 'pack_days_resolved':
        return 'Ответ записан по каждому дню пачки.';
      default:
        return 'Здесь больше ничего не ждёт — можно закрывать утро.';
    }
  }

  function resolveYesterdayVerifyHeaderCaption(data) {
    if (!data) return 'Перед чек-ином';
    if (data.feelingsDate) return formatDateRu(data.feelingsDate);
    if (data.packBulkForceOpen) return formatPackDateRangeCaption(data.pendingDateKeys);
    if (data.packDayDate) {
      return computePackDayCaption(
        data.packDayDate,
        data.pendingDateKeys,
        data.clearedDateKeys,
        data.confirmedDateKeys,
        data.quickFillByDate
      ) || formatDateRu(data.packDayDate);
    }
    return 'Перед чек-ином';
  }

  function quickFillSliderTrackPercent(percent) {
    const safe = clampQuickFillPercent(percent);
    return ((safe - QUICK_FILL_SLIDER_MIN) / (QUICK_FILL_SLIDER_MAX - QUICK_FILL_SLIDER_MIN)) * 100;
  }

  function quickFillSliderFillPercent(percent) {
    return quickFillSliderTrackPercent(percent);
  }

  function getQuickFillNormZoneStyle() {
    const left = quickFillSliderTrackPercent(QUICK_FILL_NORM_CENTER - QUICK_FILL_NORM_BAND);
    const right = quickFillSliderTrackPercent(QUICK_FILL_NORM_CENTER + QUICK_FILL_NORM_BAND);
    return {
      left: left + '%',
      width: (right - left) + '%'
    };
  }

  function getQuickFillSliderFillTone(percent) {
    const safe = clampQuickFillPercent(percent);
    const low = QUICK_FILL_NORM_CENTER - QUICK_FILL_NORM_BAND;
    const high = QUICK_FILL_NORM_CENTER + QUICK_FILL_NORM_BAND;
    if (safe >= low && safe <= high) return 'norm';
    if (safe < low) return 'under';
    return 'over';
  }

  function quickFillSliderTickAlign(percent) {
    if (percent <= QUICK_FILL_SLIDER_MIN) return 'start';
    if (percent >= QUICK_FILL_SLIDER_MAX) return 'end';
    return 'center';
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

  function computeNormAbsForKcal(kcalTarget, ctx = {}) {
    const safeKcal = Math.max(0, Math.round(Number(kcalTarget) || 0));
    const normPerc = getNormPercentages();
    const profile = ctx.profile || lsGet('heys_profile', {}) || {};
    const day = ctx.day || {};
    let tdeeResult = ctx.tdeeResult;
    if (!tdeeResult && HEYS.TDEE?.calculate) {
      try {
        tdeeResult = HEYS.TDEE.calculate(day, profile, { lsGet, anchorDate: day.date }) || {};
      } catch (_) {
        tdeeResult = {};
      }
    }
    if (HEYS.dayCalculations?.computeDisplayNorms) {
      return HEYS.dayCalculations.computeDisplayNorms({
        displayOptimum: safeKcal,
        normPerc,
        profile,
        day,
        tdeeResult,
        lsGet,
      }).normAbs;
    }
    if (HEYS.dayCalculations?.computeDailyNorms) {
      return HEYS.dayCalculations.computeDailyNorms(safeKcal, normPerc, {
        profile,
        day,
        tdeeResult,
        lsGet,
      });
    }

    const carbPct = +normPerc.carbsPct || 45;
    const protPct = +normPerc.proteinPct || 25;
    const fatPct = Math.max(0, 100 - carbPct - protPct);
    const carbs = safeKcal ? (safeKcal * carbPct / 100) / (HEYS.TEF?.ATWATER?.carbs || 4) : 0;
    const prot = safeKcal ? (safeKcal * protPct / 100) / (HEYS.TEF?.ATWATER?.protein || 3) : 0;
    const fat = safeKcal ? (safeKcal * fatPct / 100) / (HEYS.TEF?.ATWATER?.fat || 9) : 0;
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
    return readDayDataScoped(dateKey, null);
  }

  function getProductsListForEstimation() {
    return HEYS.products?.getAll?.() || [];
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

  function spellPackCount(count) {
    const n = Math.max(0, Math.round(Number(count) || 0));
    return ([
      'ноль', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь',
      'восемь', 'девять', 'десять'
    ][n]) || String(n);
  }

  function packBulkCloseLabel(count) {
    const n = Math.max(0, Math.round(Number(count) || 0));
    if (n === 1) return 'Закрыть один примерно';
    if (n === 2) return 'Закрыть оба примерно';
    return 'Закрыть все примерно';
  }

  function packBulkFeelingsTitle(count) {
    const n = Math.max(0, Math.round(Number(count) || 0));
    if (n === 2) return 'Как вы ели эти два дня?';
    if (n === 3) return 'Как вы ели эти три дня?';
    if (n === 4) return 'Как вы ели эти четыре дня?';
    if (n === 1) return 'Как вы ели этот день?';
    return 'Как вы ели эти ' + n + ' ' + pluralizeDays(n) + '?';
  }

  function packBulkSubmitLabel(count) {
    const n = Math.max(0, Math.round(Number(count) || 0));
    if (n === 1) return 'Записать один день';
    if (n === 2) return 'Записать два дня';
    if (n === 3) return 'Записать три дня';
    if (n === 4) return 'Записать четыре дня';
    return 'Записать ' + n + ' ' + pluralizeDays(n);
  }

  function packPendingDaysTitle(count) {
    const n = Math.max(0, Math.round(Number(count) || 0));
    if (n === 1) return 'Один день остался незакрытым';
    if (n === 2) return 'Два дня остались незакрытыми';
    if (n === 3) return 'Три дня остались незакрытыми';
    if (n === 4) return 'Четыре дня остались незакрытыми';
    return n + ' ' + pluralizeDays(n) + ' остались незакрытыми';
  }

  function getFeelingsLayerTitle(feelingsDate) {
    if (feelingsDate === getYesterdayKey()) return 'Как вы вчера ели?';
    return 'Как вы ели?';
  }

  function packDayRemainingNote(othersCount) {
    const n = Math.max(0, Math.round(Number(othersCount) || 0));
    if (n <= 0) {
      return 'Закрытый день уходит из списка. Стрелка возвращает к списку без потери ответов.';
    }
    const words = { 1: 'один', 2: 'два', 3: 'три', 4: 'четыре' };
    const word = words[n] || String(n);
    const remainVerb = n === 1 ? 'остаётся' : 'остаются';
    return 'Закрытый день уходит из списка, остальные ' + word + ' ' + remainVerb + '. Стрелка возвращает к списку без потери ответов.';
  }

  function confirmAsWrittenLabel(dayInfo) {
    if (isEmptyFoodDay(dayInfo)) return 'Так и было · ничего не ел';
    return 'Так и было · ' + kcalLine(dayInfo.kcal) + ' ккал';
  }

  function createTopUpEstimatedMeals(dateKey, percent, deltaTotals, referenceMeta) {
    return [{
      id: `estimated_meal_${dateKey}_topup`,
      name: 'Добор по ощущениям',
      time: '20:00',
      items: [createEstimatedMealItem(dateKey, 'topup', 0, 'Добор по ощущениям', deltaTotals, percent, referenceMeta)],
      isEstimated: true,
      estimatedSource: 'morning-checkin',
      estimatedTopUp: true
    }];
  }

  function stripEstimatedTopUpMeals(dayData) {
    if (!dayData || !Array.isArray(dayData.meals)) return;
    dayData.meals = dayData.meals.filter((meal) => !meal?.estimatedTopUp);
  }

  function getUnresolvedPackDays(visibleDays, quickFillByDate, clearedSet, confirmedSet) {
    return visibleDays.filter((day) => (
      !quickFillByDate[day.date]
      && !clearedSet.has(day.date)
      && !confirmedSet.has(day.date)
    ));
  }

  function packFoodDaysTitle(count) {
    const n = Math.max(0, Math.round(Number(count) || 0));
    if (n === 1) return 'Остался один день с едой';
    if (n === 2) return 'Осталось два дня с едой';
    return 'Осталось ' + n + ' ' + pluralizeDays(n) + ' с едой';
  }

  function formatPackDateRangeCaption(dateKeys) {
    const sorted = (dateKeys || []).slice().sort();
    if (!sorted.length) return 'Перед чек-ином';
    if (sorted.length === 1) return formatDateRu(sorted[0]);
    return formatDateRu(sorted[0]) + ' — ' + formatDateRu(sorted[sorted.length - 1]);
  }

  // HEYS_DEBUG_REPLAY_YESTERDAY_VERIFY — демо-пачка без записи в дневник
  function buildDiagnosticPreviewDay(dateKey, opts = {}) {
    const target = Math.max(1800, Math.round(Number(opts.target) || 2200));
    const kcal = Math.max(0, Math.round(Number(opts.kcal) || 0));
    const mealCount = opts.empty ? 0 : Math.max(1, Math.round(Number(opts.mealCount) || 1));
    const ratio = target > 0 ? kcal / target : 0;
    const meals = opts.empty
      ? []
      : [{
        id: `diag_meal_${dateKey}`,
        time: opts.lastMealTime || '19:40',
        items: [{
          id: `diag_item_${dateKey}`,
          name: opts.foodLabel || 'Обед по памяти',
          grams: 100,
          kcal100: kcal,
        }],
      }];
    return {
      date: dateKey,
      kcal,
      target,
      ratio,
      meals,
      mealCount,
      itemsCount: mealCount,
      sampleItems: [],
      totalKcalRaw: kcal,
      totalKcalIsFinite: true,
      productsAvailable: false,
      macros: { prot: 0, carbs: 0, fat: 0, simple: 0 },
      isFastingDay: false,
      isIncomplete: true,
      hasBeenVerified: false,
      hasStoredDay: !opts.empty,
      isMissingData: opts.empty,
      statusLabel: opts.empty ? 'Нет данных' : 'Неполный день',
      diagnosticPreview: true
    };
  }

  function buildDiagnosticPreviewPendingDays() {
    const yesterdayKey = getYesterdayKey();
    const dayMinus3 = addDays(yesterdayKey, -3);
    const dayMinus2 = addDays(yesterdayKey, -2);
    const dayMinus1 = addDays(yesterdayKey, -1);
    const missingDays = [
      buildDiagnosticPreviewDay(yesterdayKey, { kcal: 420, mealCount: 1, lastMealTime: '13:10', foodLabel: 'Перекус' }),
      buildDiagnosticPreviewDay(dayMinus1, { kcal: 640, mealCount: 2, lastMealTime: '19:40', foodLabel: 'Ужин' }),
      buildDiagnosticPreviewDay(dayMinus2, { empty: true }),
      buildDiagnosticPreviewDay(dayMinus3, { empty: true }),
    ];
    return {
      lastFilledDate: addDays(yesterdayKey, -4),
      missingDays,
      totalPendingDays: missingDays.length,
      diagnosticPreview: true
    };
  }

  function resolvePendingPastDaysPreview(context, data) {
    if (context?.diagnosticPreview || data?.diagnosticPreview) {
      return buildDiagnosticPreviewPendingDays();
    }
    return getPendingPastDays();
  }

  function waitForYesterdayVerifyStepRegistered(timeoutMs = 12000) {
    return new Promise((resolve, reject) => {
      if (HEYS.StepModal?.registry?.yesterdayVerify) {
        resolve(true);
        return;
      }
      const deadline = Date.now() + timeoutMs;
      const onReady = () => {
        if (HEYS.StepModal?.registry?.yesterdayVerify) {
          cleanup();
          resolve(true);
        }
      };
      const timer = setInterval(() => {
        if (HEYS.StepModal?.registry?.yesterdayVerify) {
          cleanup();
          resolve(true);
          return;
        }
        if (Date.now() >= deadline) {
          cleanup();
          reject(new Error('yesterdayVerify step not registered'));
        }
      }, 100);
      const cleanup = () => {
        clearInterval(timer);
        try {
          document.removeEventListener('heys-yesterday-verify-ready', onReady);
          document.removeEventListener('heys-step-registered', onReady);
        } catch (_) { }
      };
      try {
        document.addEventListener('heys-yesterday-verify-ready', onReady);
        document.addEventListener('heys-step-registered', onReady);
      } catch (_) { }
    });
  }

  function showYesterdayVerifyDiagnosticPreview() {
    if (!HEYS.StepModal?.show) {
      console.warn('[debug.replayYesterdayVerify] StepModal unavailable');
      return Promise.resolve(false);
    }

    const openPreview = () => {
      HEYS.StepModal.show({
        steps: ['yesterdayVerify'],
        forceVisibleStepIds: ['yesterdayVerify'],
        onComplete: () => {
          console.info('[YesterdayVerify] diagnostic preview finished — no day data was written');
        },
        closeOnComplete: 'after',
        allowSwipe: false,
        showTip: false,
        showProgress: false,
        showStreak: false,
        showGreeting: false,
        layout: 'daily',
        freezeVisibleSteps: true,
        requireStepAck: false,
        context: {
          diagnosticPreview: true,
          previewSource: 'settings-diagnostics'
        },
      });
      return true;
    };

    if (HEYS.StepModal?.registry?.yesterdayVerify) {
      return Promise.resolve(openPreview());
    }

    const loadChunk = typeof HEYS.__loadPostboot1Game === 'function'
      ? HEYS.__loadPostboot1Game()
      : Promise.resolve();

    return loadChunk
      .then(() => waitForYesterdayVerifyStepRegistered())
      .then(() => openPreview())
      .catch((err) => {
        console.warn('[debug.replayYesterdayVerify]', err?.message || err);
        return false;
      });
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
    const profile = lsGet('heys_profile', {}) || {};
    const prev = existingDayData || {};
    const hasExistingFood = !isEmptyFoodDay(dayInfo);
    const existingKcal = Math.max(0, Math.round(dayInfo?.kcal || 0));

    const averagesFromHistory = {
      steps: +prev.steps > 0 ? +prev.steps : lifestyleAvg.steps,
      waterMl: +prev.waterMl > 0 ? +prev.waterMl : lifestyleAvg.waterMl,
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

    if (hasExistingFood) {
      const deltaKcal = Math.max(0, estimatedKcal - existingKcal);
      console.info('[HEYS.yesterdayVerify] ✅ Estimated top-up prepared:', {
        date: dateKey,
        percent,
        targetKcal,
        existingKcal,
        deltaKcal,
        targetSource: targetMeta.source
      });
      if (deltaKcal < 5) {
        return {
          meals: null,
          isIncomplete: false,
          isFastingDay: false,
          estimatedDayFill: {
            version: 1,
            date: dateKey,
            percent,
            presetId: quickFill?.presetId || null,
            targetKcal,
            targetSource: targetMeta.source,
            estimatedKcal: existingKcal,
            previousKcal: existingKcal,
            deltaKcal: 0,
            mode: 'top-up-skipped',
            source: 'morning-checkin',
            appliedAt: Date.now()
          }
        };
      }
      const deltaNormAbs = buildAverageMacroTemplate(referenceDays, deltaKcal);
      const topUpMeals = createTopUpEstimatedMeals(dateKey, percent, deltaNormAbs, lifestyleAvg);
      const combinedKcal = existingKcal + Math.round(deltaNormAbs.kcal || 0);
      return {
        meals: topUpMeals,
        trainings: prev.trainings || [],
        householdMin: prev.householdMin || 0,
        householdActivities: prev.householdActivities || [],
        isIncomplete: false,
        isFastingDay: false,
        ...averagesFromHistory,
        savedDisplayOptimum: targetKcal,
        savedEatenKcal: combinedKcal,
        savedEatenProt: round1((Number(prev.savedEatenProt) || 0) + (deltaNormAbs.prot || 0)),
        savedEatenCarbs: round1((Number(prev.savedEatenCarbs) || 0) + (deltaNormAbs.carbs || 0)),
        savedEatenFat: round1((Number(prev.savedEatenFat) || 0) + (deltaNormAbs.fat || 0)),
        savedEatenFiber: round1((Number(prev.savedEatenFiber) || 0) + (deltaNormAbs.fiber || 0)),
        estimatedDayFill: {
          version: 1,
          date: dateKey,
          percent,
          presetId: quickFill?.presetId || null,
          targetKcal,
          targetSource: targetMeta.source,
          estimatedKcal: combinedKcal,
          previousKcal: existingKcal,
          deltaKcal: Math.round(deltaNormAbs.kcal || 0),
          mode: 'top-up',
          source: 'morning-checkin',
          excludedAutofillFields: ['householdMin', 'householdActivities', 'trainings'],
          referenceDaysUsed: lifestyleAvg.referenceDaysUsed || 0,
          referenceDates: lifestyleAvg.referenceDates || [],
          profileId: profile?.id || null,
          appliedAt: Date.now()
        }
      };
    }

    const totalNormAbs = buildAverageMacroTemplate(referenceDays, estimatedKcal);
    const estimatedMeals = createEstimatedMeals(dateKey, percent, totalNormAbs, lifestyleAvg);

    console.info('[HEYS.yesterdayVerify] ✅ Estimated day prepared:', {
      date: dateKey,
      percent,
      targetKcal,
      targetSource: targetMeta.source,
      estimatedKcal,
      referenceDaysUsed: referenceDays.length,
      referenceDates: referenceDays.map((entry) => entry.date).slice(0, 5)
    });

    return {
      meals: estimatedMeals,
      trainings: [],
      householdMin: 0,
      householdActivities: [],
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
        mode: 'full-day',
        source: 'morning-checkin',
        excludedAutofillFields: ['householdMin', 'householdActivities', 'trainings'],
        referenceDaysUsed: lifestyleAvg.referenceDaysUsed || 0,
        referenceDates: lifestyleAvg.referenceDates || [],
        profileId: profile?.id || null,
        appliedAt: Date.now()
      }
    };
  }

  const clearEstimatedDayFields = typeof DayRealDataActions.clearEstimatedDayFields === 'function'
    ? DayRealDataActions.clearEstimatedDayFields
    : function fallbackClearEstimatedDayFields(dayData) {
      if (!dayData || typeof dayData !== 'object') return;
      delete dayData.savedEatenKcal;
      delete dayData.savedDisplayOptimum;
      delete dayData.savedEatenProt;
      delete dayData.savedEatenCarbs;
      delete dayData.savedEatenFat;
      delete dayData.savedEatenFiber;
      delete dayData.estimatedDayFill;
    };

  // === Действия для неполных данных ===
  const INCOMPLETE_ACTIONS = [
    {
      id: 'confirm_real_data',
      icon: '🍃',
      title: 'Так и было',
      desc: 'Цифры верные — день идёт в статистику как есть'
    },
    {
      id: 'fill_later',
      icon: '✏️',
      title: 'Заполню позже',
      desc: 'Закрывает утро, но возвращает день завтра'
    },
    {
      id: 'clear_day',
      icon: '🗑️',
      title: 'Очистить пустые',
      desc: 'Только дни без еды. День с калориями не трогает'
    }
  ];

  const QUICK_FILL_PRESETS = [
    {
      id: 'under_norm',
      icon: '🫶',
      title: 'Не доел',
      desc: 'Чувствую, что явно не доел',
      percent: 78,
      rangeLabel: '≈ 75–80%'
    },
    {
      id: 'around_norm',
      icon: '👌',
      title: 'Как надо',
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

  function findPresetByPercent(percent) {
    const safe = clampQuickFillPercent(percent);
    return QUICK_FILL_PRESETS.find((preset) => preset.percent === safe) || null;
  }

  function shortMealCount(count) {
    const n = Number(count) || 0;
    if (n === 1) return 'один приём';
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return n + ' приёма';
    return n + ' приёмов';
  }

  function lastMealCaption(day) {
    const meals = Array.isArray(day?.meals) ? day.meals.slice() : [];
    if (!meals.length) return 'нет записей';
    meals.sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));
    const last = meals[meals.length - 1];
    const time = String(last?.time || '').slice(0, 5);
    const typed = typeof HEYS.dayUtils?.getMealType === 'function'
      ? HEYS.dayUtils.getMealType(meals.indexOf(last), last, meals)
      : null;
    const name = String(typed?.name || (meals.indexOf(last) === 0 ? 'завтрак' : 'приём')).toLowerCase();
    return time ? `${name}, ${time}` : name;
  }

  function openDiaryForDate(dateKey, context) {
    if (context?.diagnosticPreview) {
      console.info('[YesterdayVerify] diagnostic preview — diary open skipped for', dateKey);
      return;
    }
    try {
      if (dateKey && typeof HEYS.ui?.setSelectedDate === 'function') {
        HEYS.ui.setSelectedDate(dateKey);
      }
      if (typeof HEYS.ui?.switchTab === 'function') {
        HEYS.ui.switchTab('diary');
      }
    } catch (_) { }
    // Блокирующий утренний чек-ин рисуется поверх контента без крестика, и его
    // StepModal не получает onClose — там выход к дневнику даёт только
    // onExitToDiary из MorningCheckin. В обычной модалке (showCheckin.morning)
    // остаётся onClose.
    if (typeof context?.onExitToDiary === 'function') {
      context.onExitToDiary(dateKey);
      return;
    }
    if (typeof context?.onClose === 'function') context.onClose();
  }

  function kcalLine(value) {
    const n = Math.round(Number(value) || 0);
    return n.toLocaleString('ru-RU');
  }

  // === React компонент шага ===
  function YesterdayVerifyStepComponent({ data, onChange, context }) {
    const [pendingInfo, setPendingInfo] = React.useState(null);

    // Загружаем пропущенные дни
    React.useEffect(() => {
      const info = resolvePendingPastDaysPreview(context, data);
      setPendingInfo(info);
      if (data?.diagnosticPreview || context?.diagnosticPreview) return;
      try {
        // [audit] debug-only diagnostics — direct LS by design, не user data.
        // В bootstrap-bypass-allowlist.
        if (info) {
          localStorage.setItem('heys_debug_yesterday_info', JSON.stringify(info));
        } else {
          localStorage.setItem('heys_debug_yesterday_info', JSON.stringify({ empty: true }));
        }
      } catch (e) { }

    }, [context?.diagnosticPreview, data?.diagnosticPreview]);

    const quickFillByDate = data.quickFillByDate || {};
    const missingDays = pendingInfo?.missingDays || [];
    const pendingDateKeys = missingDays.map((day) => day.date);
    const clearedSet = new Set(Array.isArray(data.clearedDateKeys) ? data.clearedDateKeys : []);
    const confirmedSet = new Set(Array.isArray(data.confirmedDateKeys) ? data.confirmedDateKeys : []);
    const visibleDays = missingDays
      .filter((day) => !clearedSet.has(day.date))
      .slice()
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const isPack = visibleDays.length > 1;
    const unresolvedDays = getUnresolvedPackDays(visibleDays, quickFillByDate, clearedSet, confirmedSet);
    const unresolvedDaysCount = unresolvedDays.length;
    const emptyVisibleDays = unresolvedDays.filter((day) => isEmptyFoodDay(day));
    const packAfterClear = clearedSet.size > 0 && emptyVisibleDays.length === 0 && isPack;
    const diagnosticBanner = data.diagnosticPreview
      ? React.createElement('div', {
        className: 'yv-pack-note',
        style: { marginBottom: 12, borderStyle: 'dashed' }
      }, 'Демонстрация: даты и цифры выдуманы. Дневник и статистика не меняются.')
      : null;

    React.useEffect(() => {
      if (!pendingInfo) return;
      if (pendingDateKeys.join('|') === (data.pendingDateKeys || []).join('|')) return;
      onChange({ ...data, pendingDateKeys });
    }, [pendingDateKeys.join('|')]);

    const commitAction = (patch) => {
      const next = {
        ...data,
        pendingDateKeys,
        ...patch
      };
      onChange(next);
      if (patch && patch.incompleteAction && typeof context?.onNext === 'function') {
        context.onNext(next);
      }
    };

    const tryFinishPackIfDone = (nextData) => {
      const nextCleared = new Set(nextData.clearedDateKeys || []);
      const nextConfirmed = new Set(nextData.confirmedDateKeys || []);
      const nextQuickFill = nextData.quickFillByDate || {};
      const nextVisible = missingDays
        .filter((day) => !nextCleared.has(day.date))
        .slice()
        .sort((a, b) => String(b.date).localeCompare(String(a.date)));
      const remaining = getUnresolvedPackDays(nextVisible, nextQuickFill, nextCleared, nextConfirmed);
      if (remaining.length === 0 && nextVisible.length > 0 && typeof context?.onNext === 'function') {
        context.onNext({
          ...nextData,
          incompleteAction: 'pack_days_resolved',
          packDayDate: null,
          packBulkForceOpen: false,
          feelingsDate: null
        });
      }
    };

    const handlePackClearEmpty = () => {
      const nextCleared = Array.from(new Set([
        ...(Array.isArray(data.clearedDateKeys) ? data.clearedDateKeys : []),
        ...emptyVisibleDays.map((day) => day.date)
      ]));
      const remainingFood = unresolvedDays.filter((day) => !isEmptyFoodDay(day));
      if (remainingFood.length === 0) {
        commitAction({
          incompleteAction: 'clear_day',
          clearedDateKeys: nextCleared
        });
        return;
      }
      onChange({
        ...data,
        pendingDateKeys,
        clearedDateKeys: nextCleared
      });
    };

    const handlePackFillLater = () => {
      commitAction({ incompleteAction: 'fill_later' });
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
        pendingDateKeys
      });
    };

    const applyPreset = (dateKey, preset) => {
      updateQuickFill(dateKey, {
        presetId: preset.id,
        percent: preset.percent
      });
    };

    const openPackDay = (dateKey) => {
      const packDayCaption = computePackDayCaption(
        dateKey,
        pendingDateKeys,
        data.clearedDateKeys,
        data.confirmedDateKeys,
        quickFillByDate
      );
      onChange({
        ...data,
        pendingDateKeys,
        packDayDate: dateKey,
        packDayCaption,
        feelingsDate: null,
        packBulkForceOpen: false
      });
    };

    const openPackBulkForce = () => {
      const preset = data.packBulkPreset?.presetId
        ? QUICK_FILL_PRESETS.find((item) => item.id === data.packBulkPreset.presetId) || getAroundNormPreset()
        : getAroundNormPreset();
      onChange({
        ...data,
        pendingDateKeys,
        packBulkForceOpen: true,
        packBulkPreset: {
          presetId: preset.id,
          percent: data.packBulkPreset?.percent ?? preset.percent
        },
        packDayDate: null,
        feelingsDate: null
      });
    };

    const feelingsDate = data.feelingsDate || null;
    const feelingsDay = feelingsDate
      ? (visibleDays.find((day) => day.date === feelingsDate) || null)
      : null;

    const openFeelings = (dateKey) => {
      const existing = quickFillByDate[dateKey];
      const preset = (existing?.presetId && QUICK_FILL_PRESETS.find((item) => item.id === existing.presetId))
        || getAroundNormPreset();
      onChange({
        ...data,
        pendingDateKeys,
        feelingsDate: dateKey,
        quickFillByDate: {
          ...quickFillByDate,
          [dateKey]: {
            presetId: preset.id,
            percent: existing?.percent ?? preset.percent
          }
        }
      });
    };

    const commitFeelings = () => {
      const nextData = { ...data, pendingDateKeys, feelingsDate: null, packDayDate: null };
      onChange(nextData);
      if (isPack) {
        const nextQuickFill = nextData.quickFillByDate || {};
        const remaining = getUnresolvedPackDays(visibleDays, nextQuickFill, clearedSet, confirmedSet)
          .filter((day) => day.date !== feelingsDate);
        if (remaining.length === 0) {
          tryFinishPackIfDone(nextData);
        }
      } else {
        commitAction({ incompleteAction: 'estimated_fill', feelingsDate: null });
      }
    };

    const confirmPackDay = (dateKey) => {
      const nextConfirmed = Array.from(new Set([...(data.confirmedDateKeys || []), dateKey]));
      const nextData = {
        ...data,
        pendingDateKeys,
        packDayDate: null,
        packDayCaption: null,
        confirmedDateKeys: nextConfirmed
      };
      onChange(nextData);
      tryFinishPackIfDone(nextData);
    };

    const handleSliderChange = (dateKey, rawValue) => {
      const percent = resolveQuickFillSliderPercent(rawValue);
      const matched = findPresetByPercent(percent);
      updateQuickFill(dateKey, {
        percent,
        presetId: matched ? matched.id : null
      });
    };

    const handleBulkSliderChange = (rawValue) => {
      const percent = resolveQuickFillSliderPercent(rawValue);
      const matched = findPresetByPercent(percent);
      onChange({
        ...data,
        pendingDateKeys,
        packBulkPreset: {
          percent,
          presetId: matched ? matched.id : null
        }
      });
    };

    const buildSingleDayQuickFillNote = (day, percent, summaryKcal) => {
      const safePercent = clampQuickFillPercent(percent);
      const matched = findPresetByPercent(safePercent);
      const base = 'Запишем примерно ' + kcalLine(summaryKcal) + ' ккал при норме того дня '
        + kcalLine(day.target) + '.';
      if (matched) {
        return base + ' Шаг 5 %.';
      }
      return base + ' Силы подсвечиваются только на своих значениях — 78, 110, 155 и 200 %.';
    };

    const renderQuickFillControls = (options) => {
      const {
        mode,
        day,
        percent,
        onPresetClick,
        onSliderChange,
        sliderLabel,
        noteText,
        heroSub
      } = options;
      const safePercent = clampQuickFillPercent(percent);
      const trackPos = quickFillSliderTrackPercent(safePercent) + '%';
      const fillTone = getQuickFillSliderFillTone(safePercent);
      const normZoneStyle = getQuickFillNormZoneStyle();
      const centerMarkPos = quickFillSliderTrackPercent(QUICK_FILL_NORM_CENTER) + '%';
      const matchedPreset = findPresetByPercent(safePercent);
      const resolvedHeroSub = heroSub || (
        matchedPreset
          ? 'Запишем примерные приёмы с меткой «по ощущениям» — точность ниже, но день не пропадёт.'
          : 'Ползунок сдвинут руками — ни одна из четырёх сил не отмечена.'
      );

      return [
        React.createElement('div', { key: 'hero-sub', className: 'yv-hero-sub' }, resolvedHeroSub),
        React.createElement('div', { key: 'forces', className: 'yv-force-list' },
          QUICK_FILL_PRESETS.map((preset) => {
            const selected = safePercent === preset.percent;
            const rightLabel = mode === 'bulk'
              ? (preset.percent + ' %')
              : (kcalLine(getQuickFillSummary(day, preset.percent).kcal) + ' ккал');
            return React.createElement('button', {
              key: preset.id,
              type: 'button',
              className: 'yv-force' + (selected ? ' yv-force--on' : ''),
              onClick: () => onPresetClick(preset)
            },
              React.createElement('span', { className: 'yv-force-title' }, preset.title),
              React.createElement('span', { className: 'yv-force-kcal' }, rightLabel)
            );
          })
        ),
        React.createElement('div', { key: 'slider', className: 'yv-slider-block' },
          React.createElement('div', { className: 'yv-slider-header' },
            React.createElement('span', { className: 'yv-slider-label' }, sliderLabel),
            React.createElement('span', {
              className: 'yv-slider-value yv-slider-value--' + fillTone
            }, safePercent + ' %')
          ),
          React.createElement('div', { className: 'yv-v4-slider-track-wrap' },
            React.createElement('div', {
              className: 'yv-v4-slider-norm-zone',
              style: normZoneStyle
            }),
            React.createElement('div', {
              className: 'yv-v4-slider-center-mark',
              style: { left: centerMarkPos }
            }),
            React.createElement('div', {
              className: 'yv-v4-slider-fill yv-v4-slider-fill--' + fillTone,
              style: { width: trackPos }
            }),
            React.createElement('div', {
              className: 'yv-v4-slider-thumb',
              style: { left: trackPos }
            }),
            React.createElement('input', {
              type: 'range',
              className: 'yv-v4-slider',
              min: QUICK_FILL_SLIDER_MIN,
              max: QUICK_FILL_SLIDER_MAX,
              step: 1,
              value: safePercent,
              'aria-label': sliderLabel,
              onChange: (event) => onSliderChange(Number(event.target.value))
            })
          ),
          React.createElement('div', { className: 'yv-slider-ticks' },
            [QUICK_FILL_SLIDER_MIN, QUICK_FILL_NORM_CENTER, QUICK_FILL_SLIDER_MAX].map((tick) => {
              const align = quickFillSliderTickAlign(tick);
              return React.createElement('span', {
                key: tick,
                className: 'yv-slider-tick yv-slider-tick--' + align
                  + (tick === QUICK_FILL_NORM_CENTER ? ' yv-slider-tick--norm' : ''),
                style: { left: quickFillSliderTrackPercent(tick) + '%' }
              }, tick + ' %');
            })
          )
        ),
        React.createElement('div', { key: 'note', className: 'yv-slider-note' }, noteText)
      ];
    };

    const renderFeelingsLayer = (day, title, submitLabel) => {
      const currentPercent = clampQuickFillPercent(
        quickFillByDate[day.date]?.percent ?? getAroundNormPreset().percent
      );
      const summaryKcal = getQuickFillSummary(day, currentPercent).kcal;
      const noteText = buildSingleDayQuickFillNote(day, currentPercent, summaryKcal);

      return React.createElement('div', { className: 'yv-step yv-step--feelings' },
        diagnosticBanner,
        React.createElement('div', { className: 'yv-hero-title' }, title),
        ...renderQuickFillControls({
          mode: 'single',
          day,
          percent: currentPercent,
          onPresetClick: (preset) => applyPreset(day.date, preset),
          onSliderChange: (value) => handleSliderChange(day.date, value),
          sliderLabel: 'Насколько от нормы',
          noteText
        }),
        React.createElement('div', { className: 'yv-canvas-foot' },
          React.createElement('button', {
            type: 'button',
            className: 'yv-pack-primary',
            onClick: commitFeelings
          }, submitLabel)
        )
      );
    };

    const renderPackDayDetail = (day) => {
      const emptyDay = isEmptyFoodDay(day);
      const othersInPack = Math.max(0, visibleDays.length - 1);
      return React.createElement('div', { className: 'yv-step yv-step--pack-day' },
        diagnosticBanner,
        React.createElement('div', { className: 'yv-hero' },
          React.createElement('div', { className: 'yv-hero-title' }, formatDateRu(day.date, true)),
          React.createElement('div', { className: 'yv-hero-sub' },
            emptyDay
              ? 'За этот день нет ни одной записи о еде.'
              : 'Тот же выбор, что и для вчера: дописать точно, оставить как есть или оценить.'
          )
        ),
        emptyDay
          ? React.createElement('div', { className: 'yv-food-card' },
            React.createElement('div', { className: 'yv-food-row' },
              React.createElement('span', null, 'Еда'),
              React.createElement('span', { className: 'yv-food-value' }, 'записей нет')
            ),
            React.createElement('div', { className: 'yv-food-row' },
              React.createElement('span', null, 'Норма того дня'),
              React.createElement('span', { className: 'yv-food-muted' }, kcalLine(day.target) + ' ккал')
            ),
            React.createElement('div', { className: 'yv-food-row' },
              React.createElement('span', null, 'Шаги и вес'),
              React.createElement('span', { className: 'yv-food-muted' }, 'есть, не трогаем')
            )
          )
          : React.createElement('div', { className: 'yv-food-card' },
            React.createElement('div', { className: 'yv-food-row' },
              React.createElement('span', null, 'Еда'),
              React.createElement('span', { className: 'yv-food-value' }, kcalLine(day.kcal) + ' из ' + kcalLine(day.target) + ' ккал')
            ),
            React.createElement('div', { className: 'yv-food-row' },
              React.createElement('span', null, 'Приёмы'),
              React.createElement('span', { className: 'yv-food-value' },
                day.mealCount > 0 ? shortMealCount(day.mealCount) + ' за день' : 'нет приёмов'
              )
            ),
            React.createElement('div', { className: 'yv-food-row' },
              React.createElement('span', null, 'Последняя запись'),
              React.createElement('span', { className: 'yv-food-muted' }, lastMealCaption(day))
            )
          ),
        React.createElement('div', { className: 'yv-pack-note' },
          emptyDay
            ? '«Ничего не ел» — тоже ответ, и он идёт в статистику как есть. Если день надо просто убрать из списка без цифр — это «Очистить пустые» в списке.'
            : packDayRemainingNote(othersInPack)
        ),
        React.createElement('div', { className: 'yv-canvas-foot' },
          React.createElement('button', {
            type: 'button',
            className: 'yv-pack-primary',
            onClick: () => openDiaryForDate(day.date, context)
          }, 'Дописать точно'),
          React.createElement('div', { className: 'yv-pack-row' },
            React.createElement('button', {
              type: 'button',
              className: 'yv-pack-secondary' + (emptyDay ? ' yv-pack-secondary--confirm-empty' : ''),
              onClick: () => confirmPackDay(day.date)
            }, confirmAsWrittenLabel(day)),
            React.createElement('button', {
              type: 'button',
              className: 'yv-pack-secondary' + (emptyDay ? '' : ' yv-pack-secondary--feelings'),
              onClick: () => openFeelings(day.date)
            }, 'По ощущениям')
          ),
          React.createElement('button', {
            type: 'button',
            className: 'yv-text-later',
            onClick: () => onChange({ ...data, packDayDate: null, packDayCaption: null, pendingDateKeys })
          }, 'К списку дней')
        )
      );
    };

    if (!pendingInfo) {
      return React.createElement('div', { className: 'yv-loading' }, 'Загрузка...');
    }

    if (data.packBulkForceOpen) {
      const bulkPercent = clampQuickFillPercent(
        data.packBulkPreset?.percent ?? getAroundNormPreset().percent
      );
      const bulkCount = unresolvedDaysCount;
      const bulkNote = 'Пустые дни получат оценку целиком, где еда уже есть — допишем только разницу. Если день был непохож — откройте его отдельно.';
      return React.createElement('div', { className: 'yv-step yv-step--bulk-force' },
        diagnosticBanner,
        React.createElement('div', { className: 'yv-hero-title' },
          packBulkFeelingsTitle(bulkCount)
        ),
        ...renderQuickFillControls({
          mode: 'bulk',
          day: visibleDays[0] || { target: 0 },
          percent: bulkPercent,
          onPresetClick: (preset) => onChange({
            ...data,
            pendingDateKeys,
            packBulkPreset: { presetId: preset.id, percent: preset.percent }
          }),
          onSliderChange: handleBulkSliderChange,
          sliderLabel: 'Насколько от нормы каждого дня',
          noteText: bulkNote,
          heroSub: 'Одна оценка на всю пачку. Считаем от нормы каждого дня, приёмы пишем с меткой «по ощущениям».'
        }),
        React.createElement('div', { className: 'yv-canvas-foot' },
          React.createElement('button', {
            type: 'button',
            className: 'yv-pack-primary',
            onClick: () => {
              commitAction({
                incompleteAction: 'estimated_fill',
                packBulkPreset: {
                  presetId: findPresetByPercent(bulkPercent)?.id || null,
                  percent: bulkPercent
                },
                packBulkForceOpen: false
              });
            }
          }, packBulkSubmitLabel(bulkCount)),
          React.createElement('button', {
            type: 'button',
            className: 'yv-text-later',
            onClick: () => onChange({ ...data, packBulkForceOpen: false, packBulkPreset: null, pendingDateKeys })
          }, 'К списку дней')
        )
      );
    }

    if (feelingsDay) {
      return renderFeelingsLayer(
        feelingsDay,
        getFeelingsLayerTitle(data.feelingsDate),
        'Записать день'
      );
    }

    const packDay = data.packDayDate
      ? (visibleDays.find((day) => day.date === data.packDayDate) || null)
      : null;
    if (packDay) {
      return renderPackDayDetail(packDay);
    }

    // Разбирать уже нечего: ответ по дню записан, и список пропусков пуст.
    // Шаг из мастера при этом не исчезает (freezeVisibleSteps), поэтому возврат
    // стрелкой приводил на экран с одним заголовком — без карточки, без кнопок
    // и без выхода вперёд. Здесь этот тупик закрыт: человек видит, чем он день
    // закрыл, и идёт дальше.
    if (!visibleDays.length) {
      return React.createElement('div', { className: 'yv-step yv-step--single' },
        diagnosticBanner,
        React.createElement('div', { className: 'yv-hero' },
          React.createElement('div', { className: 'yv-hero-title' }, 'Прошлые дни разобраны'),
          React.createElement('div', { className: 'yv-hero-sub' }, resolvedStepNote(data))
        ),
        React.createElement('div', { className: 'yv-canvas-foot' },
          React.createElement('button', {
            type: 'button',
            className: 'yv-pack-primary',
            onClick: () => {
              if (typeof context?.onNext === 'function') context.onNext(data);
            }
          }, 'Дальше')
        )
      );
    }

    const single = !isPack && visibleDays[0] ? visibleDays[0] : null;

    return React.createElement('div', { className: 'yv-step' + (isPack ? ' yv-step--pack' : ' yv-step--single') },
      diagnosticBanner,
      React.createElement('div', { className: 'yv-hero' },
        React.createElement('div', { className: 'yv-hero-title' },
          isPack
            ? (packAfterClear ? packFoodDaysTitle(visibleDays.length) : packPendingDaysTitle(visibleDays.length))
            : 'Вчерашний день выглядит неполным'
        ),
        React.createElement('div', { className: 'yv-hero-sub' },
          isPack
            ? (packAfterClear
              ? 'Пустые дни убраны из списка и ничего о еде не утверждают.'
              : ((visibleDays.length
                ? 'С ' + formatDateRu(visibleDays[visibleDays.length - 1].date) + ' по ' + formatDateRu(visibleDays[0].date) + '. '
                : '') + 'Можно дописать любой из них или отложить и сразу начать утро.'))
            : (single
              ? formatDateRu(single.date, true) + '. Проверьте, прежде чем закрывать утро — потом цифры уйдут в статистику как есть.'
              : 'Проверьте, прежде чем закрывать утро — потом цифры уйдут в статистику как есть.')
        )
      ),

      single && React.createElement('div', { className: 'yv-food-card' },
        React.createElement('div', { className: 'yv-food-row' },
          React.createElement('span', null, 'Еда'),
          React.createElement('span', { className: 'yv-food-value' }, kcalLine(single.kcal) + ' из ' + kcalLine(single.target) + ' ккал')
        ),
        React.createElement('div', { className: 'yv-food-row' },
          React.createElement('span', null, 'Приёмы'),
          React.createElement('span', { className: 'yv-food-value' },
            single.mealCount > 0 ? shortMealCount(single.mealCount) + ' за день' : 'нет приёмов'
          )
        ),
        React.createElement('div', { className: 'yv-food-row' },
          React.createElement('span', null, 'Последняя запись'),
          React.createElement('span', { className: 'yv-food-muted' }, lastMealCaption(single))
        )
      ),

      single && React.createElement('div', { className: 'yv-pack-note' },
        'День попадает сюда только из-за еды: приёмов нет, ноль калорий или меньше половины нормы. Нулевые шаги и вода сами по себе вопросом не становятся.'
      ),

      isPack && React.createElement('div', { className: 'yv-days' },
        visibleDays.map((day) => {
          const quickFill = quickFillByDate[day.date] || null;
          const resolved = quickFill || confirmedSet.has(day.date);
          return React.createElement('button', {
            key: day.date,
            type: 'button',
            className: 'yv-pack-day' + (resolved ? ' yv-pack-day--resolved' : ''),
            onClick: () => openPackDay(day.date)
          },
            React.createElement('div', { className: 'yv-pack-day-copy' },
              React.createElement('div', { className: 'yv-pack-day-title' }, formatDateRu(day.date, true)),
              React.createElement('div', { className: 'yv-pack-day-meta' },
                quickFill
                  ? getQuickFillSummary(day, quickFill.percent).label
                  : (day.mealCount > 0 || day.kcal > 0
                    ? kcalLine(day.kcal) + ' из ' + kcalLine(day.target) + ' ккал' + (day.mealCount ? (' · ' + shortMealCount(day.mealCount)) : '')
                    : 'День пустой')
              )
            ),
            React.createElement('span', { className: 'yv-pack-chevron', 'aria-hidden': 'true' }, '›')
          );
        })
      ),

      isPack && React.createElement('div', { className: 'yv-pack-note' },
        packAfterClear
          ? 'Очистка больше не предлагается — пустых дней в списке нет. Массовая оценка теперь считает только эти ' + spellPackCount(visibleDays.length) + ' ' + pluralizeDays(visibleDays.length) + '.'
          : 'Отложенные дни не исчезают — вернутся завтра тем же списком.'
      ),

      isPack && React.createElement('div', { className: 'yv-canvas-foot' },
        unresolvedDaysCount > 0 && React.createElement('button', {
          type: 'button',
          className: 'yv-pack-primary',
          onClick: openPackBulkForce
        }, packBulkCloseLabel(unresolvedDaysCount)),
        packAfterClear && emptyVisibleDays.length === 0
          ? React.createElement('button', {
            type: 'button',
            className: 'yv-text-later',
            onClick: handlePackFillLater
          }, 'Заполню позже')
          : React.createElement('div', { className: 'yv-pack-row' },
            emptyVisibleDays.length > 0 && React.createElement('button', {
              type: 'button',
              className: 'yv-pack-secondary',
              onClick: handlePackClearEmpty
            }, 'Очистить ' + spellPackCount(emptyVisibleDays.length) + ' ' + (emptyVisibleDays.length === 1 ? 'пустой' : 'пустых')),
            React.createElement('button', {
              type: 'button',
              className: 'yv-pack-secondary',
              onClick: handlePackFillLater
            }, 'Заполню позже')
          )
      ),

      single && React.createElement('div', { className: 'yv-canvas-foot' },
        React.createElement('button', {
          type: 'button',
          className: 'yv-pack-primary',
          onClick: () => openDiaryForDate(single.date, context)
        }, 'Дописать точно'),
        // Кадры дают ряду две раскладки, и зеркальные: «вчерашний день» —
        // 1 и 1,25, «пустой день из пачки» — 1,35 и 1. Больше места получает
        // та кнопка, чья подпись длиннее, а длинную подпись включает тот же
        // признак: confirmAsWrittenLabel зовёт «ничего не ел» ровно по
        // isEmptyFoodDay. Ветка пачки это делает (renderPackDayDetail), у
        // одиночного дня классы стояли намертво — и «Так и было · ничего не
        // ел» ломалось на две строки в узкой кнопке.
        React.createElement('div', { className: 'yv-pack-row' },
          React.createElement('button', {
            type: 'button',
            className: 'yv-pack-secondary'
              + (isEmptyFoodDay(single) ? ' yv-pack-secondary--confirm-empty' : ''),
            onClick: () => commitAction({ incompleteAction: 'confirm_real_data' })
          }, confirmAsWrittenLabel(single)),
          React.createElement('button', {
            type: 'button',
            className: 'yv-pack-secondary'
              + (isEmptyFoodDay(single) ? '' : ' yv-pack-secondary--feelings'),
            onClick: () => openFeelings(single.date)
          }, 'По ощущениям')
        ),
        React.createElement('button', {
          type: 'button',
          className: 'yv-text-later',
          onClick: () => commitAction({ incompleteAction: 'fill_later' })
        }, 'Заполню позже')
      )
    );
  }

  /**
   * Форматировать дату по-русски
   */
  function formatDateRu(dateStr, withWeekday = false) {
    if (!dateStr) return '';
    const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
      'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    const weekdays = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
    const d = new Date(dateStr + 'T12:00:00');
    const datePart = d.getDate() + ' ' + months[d.getMonth()];
    if (!withWeekday) return datePart;
    const weekday = weekdays[d.getDay()] || '';
    const titled = weekday ? weekday.charAt(0).toUpperCase() + weekday.slice(1) : '';
    return titled ? titled + ', ' + datePart : datePart;
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
  function saveYesterdayVerify(data, context) {
    if (data?.diagnosticPreview || context?.diagnosticPreview) {
      console.info('[YesterdayVerify] diagnostic preview — save skipped');
      return { affectedKeys: [], diagnosticPreview: true, skipped: true };
    }
    const pendingDays = getPendingPastDays().missingDays || [];
    const nowTs = Date.now();
    const quickFillByDate = data.quickFillByDate || {};
    const clearedDateKeys = new Set(Array.isArray(data.clearedDateKeys) ? data.clearedDateKeys : []);
    const confirmedDateKeys = new Set(Array.isArray(data.confirmedDateKeys) ? data.confirmedDateKeys : []);
    const affectedKeys = [];
    const applyDayStatusAction = typeof DayRealDataActions.applyDayStatusAction === 'function'
      ? DayRealDataActions.applyDayStatusAction
      : null;
    const aroundNorm = getAroundNormPreset();

    function applyEstimatedFill(dateKey, dayInfo, dayData, quickFill) {
      const hasExistingFood = !isEmptyFoodDay(dayInfo);
      const estimatedPatch = buildEstimatedDayPatch(dateKey, dayInfo, quickFill, dayData);
      if (hasExistingFood) {
        stripEstimatedTopUpMeals(dayData);
        if (estimatedPatch.meals === null) {
          delete estimatedPatch.meals;
        } else if (Array.isArray(estimatedPatch.meals)) {
          estimatedPatch.meals = [...(dayData.meals || []), ...estimatedPatch.meals];
        }
      } else {
        clearEstimatedDayFields(dayData);
      }
      Object.assign(dayData, estimatedPatch);
      markYesterdayVerified(dayData, 'estimated_fill', nowTs);
      dayData.dayStatusUpdatedAt = Math.max(nowTs, (Number(dayData.dayStatusUpdatedAt) || 0) + 1);
      dayData.updatedAt = dayData.dayStatusUpdatedAt;
      writeDayDataScoped(dateKey, dayData);
      affectedKeys.push(`heys_dayv2_${dateKey}`);
      window.dispatchEvent(new CustomEvent('heys:day-updated', {
        detail: { date: dateKey, source: 'yesterday-verify-estimated', data: dayData }
      }));
      try {
        HEYS.analytics?.trackDataOperation?.('yesterday_verify_estimated_fill', 1, {
          date: dateKey,
          ratio: Number(dayInfo?.ratio || 0),
          mealCount: Number(dayInfo?.mealCount || 0)
        });
      } catch (_) { }
    }

    pendingDays.forEach((dayInfo) => {
      const dateKey = dayInfo.date;
      const dayData = readDayDataScoped(dateKey, { date: dateKey }) || { date: dateKey };
      dayData.isFastingDay = false;

      const quickFill = quickFillByDate[dateKey];
      if (quickFill) {
        applyEstimatedFill(dateKey, dayInfo, dayData, quickFill);
        return;
      }

      if (clearedDateKeys.has(dateKey) && isEmptyFoodDay(dayInfo)) {
        const nextDayData = applyDayStatusAction
          ? applyDayStatusAction(dayData, 'clear_day', { nowTs })
          : (() => {
            dayData.meals = [];
            dayData.isIncomplete = false;
            clearEstimatedDayFields(dayData);
            dayData.dayStatusUpdatedAt = Math.max(nowTs, (Number(dayData.dayStatusUpdatedAt) || 0) + 1);
            dayData.updatedAt = dayData.dayStatusUpdatedAt;
            return dayData;
          })();
        markYesterdayVerified(nextDayData, 'clear_day', nowTs);
        writeDayDataScoped(dateKey, nextDayData);
        affectedKeys.push(`heys_dayv2_${dateKey}`);
        window.dispatchEvent(new CustomEvent('heys:day-updated', {
          detail: { date: dateKey, field: 'meals', value: [], source: 'yesterday-verify-clear', data: nextDayData }
        }));
        try {
          HEYS.analytics?.trackDataOperation?.('yesterday_verify_clear_day', 1, {
            date: dateKey,
            ratio: Number(dayInfo?.ratio || 0),
            mealCount: Number(dayInfo?.mealCount || 0)
          });
        } catch (_) { }
        return;
      }

      if (confirmedDateKeys.has(dateKey)) {
        const nextDayData = applyDayStatusAction
          ? applyDayStatusAction(dayData, 'confirm_real_data', { nowTs })
          : (() => {
            dayData.isFastingDay = true;
            dayData.isIncomplete = false;
            clearEstimatedDayFields(dayData);
            dayData.dayStatusUpdatedAt = Math.max(nowTs, (Number(dayData.dayStatusUpdatedAt) || 0) + 1);
            dayData.updatedAt = dayData.dayStatusUpdatedAt;
            return dayData;
          })();
        markYesterdayVerified(nextDayData, 'confirm_real_data', nowTs);
        writeDayDataScoped(dateKey, nextDayData);
        affectedKeys.push(`heys_dayv2_${dateKey}`);
        window.dispatchEvent(new CustomEvent('heys:day-updated', {
          detail: { date: dateKey, source: 'yesterday-verify-real-data', data: nextDayData }
        }));
        try {
          HEYS.analytics?.trackDataOperation?.('yesterday_verify_confirm_real_data', 1, {
            date: dateKey,
            ratio: Number(dayInfo?.ratio || 0),
            mealCount: Number(dayInfo?.mealCount || 0)
          });
        } catch (_) { }
        return;
      }

      if (data.incompleteAction === 'pack_days_resolved') {
        return;
      }

      if (data.incompleteAction === 'estimated_fill') {
        const bulkPreset = data.packBulkPreset || aroundNorm;
        applyEstimatedFill(dateKey, dayInfo, dayData, {
          presetId: bulkPreset.presetId || bulkPreset.id,
          percent: bulkPreset.percent
        });
        return;
      }

      if (data.incompleteAction === 'confirm_real_data') {
        const nextDayData = applyDayStatusAction
          ? applyDayStatusAction(dayData, 'confirm_real_data', { nowTs })
          : (() => {
            dayData.isFastingDay = true;
            dayData.isIncomplete = false;
            clearEstimatedDayFields(dayData);
            dayData.dayStatusUpdatedAt = Math.max(nowTs, (Number(dayData.dayStatusUpdatedAt) || 0) + 1);
            dayData.updatedAt = dayData.dayStatusUpdatedAt;
            return dayData;
          })();
        markYesterdayVerified(nextDayData, 'confirm_real_data', nowTs);
        writeDayDataScoped(dateKey, nextDayData);
        affectedKeys.push(`heys_dayv2_${dateKey}`);

        window.dispatchEvent(new CustomEvent('heys:day-updated', {
          detail: { date: dateKey, source: 'yesterday-verify-real-data', data: nextDayData }
        }));
        try {
          HEYS.analytics?.trackDataOperation?.('yesterday_verify_confirm_real_data', 1, {
            date: dateKey,
            ratio: Number(dayInfo?.ratio || 0),
            mealCount: Number(dayInfo?.mealCount || 0)
          });
        } catch (_) { }
        return;
      }

      if (data.incompleteAction === 'clear_day') {
        const hasFood = Number(dayInfo?.kcal || 0) > 0 || Number(dayInfo?.mealCount || 0) > 0;
        if (hasFood) return;
        const nextDayData = applyDayStatusAction
          ? applyDayStatusAction(dayData, 'clear_day', { nowTs })
          : (() => {
            dayData.meals = [];
            dayData.isIncomplete = false;
            clearEstimatedDayFields(dayData);
            dayData.dayStatusUpdatedAt = Math.max(nowTs, (Number(dayData.dayStatusUpdatedAt) || 0) + 1);
            dayData.updatedAt = dayData.dayStatusUpdatedAt;
            return dayData;
          })();
        markYesterdayVerified(nextDayData, 'clear_day', nowTs);
        writeDayDataScoped(dateKey, nextDayData);
        affectedKeys.push(`heys_dayv2_${dateKey}`);

        window.dispatchEvent(new CustomEvent('heys:day-updated', {
          detail: { date: dateKey, field: 'meals', value: [], source: 'yesterday-verify-clear', data: nextDayData }
        }));
        try {
          HEYS.analytics?.trackDataOperation?.('yesterday_verify_clear_day', 1, {
            date: dateKey,
            ratio: Number(dayInfo?.ratio || 0),
            mealCount: Number(dayInfo?.mealCount || 0)
          });
        } catch (_) { }
      }

      if (data.incompleteAction === 'fill_later') {
        const nextDayData = applyDayStatusAction
          ? applyDayStatusAction(dayData, 'fill_later', { nowTs })
          : (() => {
            dayData.isIncomplete = true;
            dayData.dayStatusUpdatedAt = Math.max(nowTs, (Number(dayData.dayStatusUpdatedAt) || 0) + 1);
            dayData.updatedAt = dayData.dayStatusUpdatedAt;
            return dayData;
          })();
        markYesterdayVerified(nextDayData, 'fill_later', nowTs);
        writeDayDataScoped(dateKey, nextDayData);
        affectedKeys.push(`heys_dayv2_${dateKey}`);
        try {
          HEYS.analytics?.trackDataOperation?.('yesterday_verify_fill_later', 1, {
            date: dateKey,
            ratio: Number(dayInfo?.ratio || 0),
            mealCount: Number(dayInfo?.mealCount || 0)
          });
        } catch (_) { }
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
    return { affectedKeys };
  }

  // === Регистрация шага ===
  let _registerRetries = 0;
  let _stepRegistered = false;

  function notifyYesterdayVerifyReady(reason) {
    try {
      const apiReady = HEYS.YesterdayVerify && typeof HEYS.YesterdayVerify.shouldShow === 'function';
      const ready = !!(apiReady && _stepRegistered);
      HEYS.YesterdayVerifyReady = ready;
      if (HEYS.YesterdayVerify && typeof HEYS.YesterdayVerify === 'object') {
        HEYS.YesterdayVerify.isReady = ready;
        HEYS.YesterdayVerify.stepRegistered = _stepRegistered;
      }
      if (typeof global.dispatchEvent === 'function') {
        global.dispatchEvent(new CustomEvent('heys-yesterday-verify-ready', {
          detail: { reason: reason || 'module-ready', ready, apiReady: !!apiReady, stepRegistered: _stepRegistered }
        }));
      }
    } catch (_) { /* noop */ }
  }

  function registerYesterdayVerifyStep() {
    if (_stepRegistered && HEYS.StepModal?.registry?.yesterdayVerify) {
      notifyYesterdayVerifyReady('already-registered');
      return;
    }

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
      hint: 'Перед чек-ином',
      icon: '',
      component: YesterdayVerifyStepComponent,
      canSkip: false, // Обязательный шаг если показывается
      hideProgressDots: true,
      hiddenFromProgress: true,
      hideDailyFooter: true,
      headerCaption: (data) => resolveYesterdayVerifyHeaderCaption(data),
      showHeaderBack: (data) => !!(data && (data.feelingsDate || data.packDayDate || data.packBulkForceOpen)),
      applyHeaderBack: (data) => {
        if (!data) return {};
        if (data.feelingsDate) return { ...data, feelingsDate: null };
        if (data.packBulkForceOpen) return { ...data, packBulkForceOpen: false, packBulkPreset: null };
        if (data.packDayDate) return { ...data, packDayDate: null, packDayCaption: null };
        return data;
      },

      shouldShow: (context) => {
        if (context?.diagnosticPreview) return true;
        return shouldShowYesterdayVerify();
      },

      getInitialData: (context) => {
        const diagnosticPreview = !!context?.diagnosticPreview;
        // Пачка ограничена семью днями (контракт «пропущенные дни подряд»):
        // всё, что за неё вышло, закрывается здесь без разбора — иначе эти дни
        // вернулись бы развилкой завтра.
        if (!diagnosticPreview) {
          try { closePendingDaysOutsideReviewWindow('step-open'); } catch (_) { /* закрытие хвоста не должно ронять мастер */ }
        }
        return {
          diagnosticPreview,
          incompleteAction: null,
          pendingDateKeys: diagnosticPreview
            ? buildDiagnosticPreviewPendingDays().missingDays.map((day) => day.date)
            : [],
          quickFillByDate: {},
          clearedDateKeys: [],
          confirmedDateKeys: [],
          packDayDate: null,
          packDayCaption: null,
          packBulkForceOpen: false,
          packBulkPreset: null,
          feelingsDate: null
        };
      },

      validate: (data) => {
        const pendingDates = data?.diagnosticPreview
          ? (Array.isArray(data.pendingDateKeys) && data.pendingDateKeys.length
            ? data.pendingDateKeys
            : buildDiagnosticPreviewPendingDays().missingDays.map((day) => day.date))
          : (getPendingPastDays().missingDays || []).map((day) => day.date);
        const quickFillByDate = data.quickFillByDate || {};
        const clearedDateKeys = new Set(Array.isArray(data.clearedDateKeys) ? data.clearedDateKeys : []);
        const confirmedDateKeys = new Set(Array.isArray(data.confirmedDateKeys) ? data.confirmedDateKeys : []);
        const unresolvedDates = pendingDates.filter((dateKey) => (
          !quickFillByDate[dateKey] && !clearedDateKeys.has(dateKey) && !confirmedDateKeys.has(dateKey)
        ));
        if (unresolvedDates.length > 0 && !data.incompleteAction) {
          return { valid: false, error: 'Выбери общее действие для оставшихся дней или оцени их по ощущениям' };
        }
        return { valid: true };
      },

      save: saveYesterdayVerify,

      xpAction: 'yesterday_verify'
    });

    _stepRegistered = true;
    notifyYesterdayVerifyReady('step-registered');
    devLog('[YesterdayVerify] ✅ Step registered');
  }

  // postboot chunks load independently. On a slow iPhone the bounded retry
  // above may finish before the UI chunk exposes StepModal. StepModal emits
  // this readiness event after replacing its registry, so re-register the
  // required first check-in step instead of leaving the blocking overlay blank.
  try {
    document.addEventListener('heys-stepmodal-ready', registerYesterdayVerifyStep, { once: true });
  } catch (_) { /* document may be unavailable in non-browser tests */ }

  // Запускаем регистрацию
  registerYesterdayVerifyStep();

  // === Экспорт API ===
  HEYS.YesterdayVerify = {
    getYesterdayKey,
    getYesterdayData,
    getDayReviewInfo,
    getPendingPastDays,
    collectPendingPastDays,
    splitPendingPackByLimit,
    closePendingDaysOutsideReviewWindow,
    PENDING_REVIEW_PACK_MAX,
    OUT_OF_REVIEW_WINDOW_ACTION,
    shouldShow: shouldShowYesterdayVerify,
    isExplicitlyVerified,
    isEmptyFoodDay,
    packBulkCloseLabel,
    spellPackCount,
    confirmAsWrittenLabel,
    computePackDayCaption,
    resolveYesterdayVerifyHeaderCaption,
    findPresetByPercent,
    clampQuickFillPercent,
    snapQuickFillSliderPercent,
    quickFillSliderTrackPercent,
    getQuickFillSliderFillTone,
    buildDiagnosticPreviewPendingDays,
    showDiagnosticPreview: showYesterdayVerifyDiagnosticPreview,
    save: saveYesterdayVerify,
    isReady: _stepRegistered,
    stepRegistered: _stepRegistered,
    INCOMPLETE_ACTIONS,
    QUICK_FILL_PRESETS
  };

  notifyYesterdayVerifyReady('api-exported');
  HEYS.debug = Object.assign(HEYS.debug || {}, {
    replayYesterdayVerify: showYesterdayVerifyDiagnosticPreview,
  });
  devLog('[HEYS] YesterdayVerify v1.4.1 loaded');

})(typeof window !== 'undefined' ? window : global);
